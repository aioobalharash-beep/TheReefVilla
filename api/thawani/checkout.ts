import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * Thawani — Checkout Session Creator
 * ----------------------------------
 * POST /api/thawani/checkout
 *
 * Body: { bookingId, amountInOMR, successUrl, cancelUrl, customer? }
 *
 * Creates a hosted Thawani checkout session and returns the session id plus the
 * fully-formed redirect URL the browser should be sent to. The OMR amount is
 * converted to baisa (1 OMR = 1000 baisa) because Thawani only accepts integer
 * baisa for `unit_amount`.
 *
 * Env (Vercel → Settings → Environment Variables):
 *   THAWANI_SECRET_KEY        — server-only API key (header `thawani-api-key`)
 *   THAWANI_PUBLISHABLE_KEY   — public key appended to the pay URL
 *   THAWANI_BASE_URL          — optional; defaults to production checkout host
 */

const BAISA_PER_OMR = 1000;
const MIN_BAISA = 100; // Thawani rejects sessions below 100 baisa (0.100 OMR)

// Production by default; override with the UAT host for sandbox testing.
const THAWANI_BASE_URL = (
  process.env.THAWANI_BASE_URL || 'https://checkout.thawani.om/api/v1'
).replace(/\/+$/, '');

type CheckoutBody = {
  bookingId?: string;
  amountInOMR?: number | string;
  successUrl?: string;
  cancelUrl?: string;
  customer?: { name?: string; phone?: string; email?: string };
};

/** Convert an OMR amount to integer baisa, e.g. 90 OMR → 90000. */
function omrToBaisa(amountInOMR: number): number {
  return Math.round(amountInOMR * BAISA_PER_OMR);
}

/** Derive the public pay host (`/pay/...`) from the API base URL. */
function payUrl(sessionId: string, publishableKey: string): string {
  const host = THAWANI_BASE_URL.replace(/\/api\/v1$/, '');
  return `${host}/pay/${sessionId}?key=${encodeURIComponent(publishableKey)}`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const secretKey = process.env.THAWANI_SECRET_KEY;
  const publishableKey = process.env.THAWANI_PUBLISHABLE_KEY;
  if (!secretKey || !publishableKey) {
    console.error('[thawani/checkout] Missing THAWANI_SECRET_KEY / THAWANI_PUBLISHABLE_KEY env vars');
    res.status(500).json({ error: 'Payment gateway is not configured.' });
    return;
  }

  const { bookingId, amountInOMR, successUrl, cancelUrl, customer } =
    (req.body || {}) as CheckoutBody;

  const amount = Number(amountInOMR);

  // Clean, debuggable log — never logs secrets.
  console.log('[thawani/checkout] incoming', {
    bookingId,
    amountInOMR: amount,
    hasSuccessUrl: !!successUrl,
    hasCancelUrl: !!cancelUrl,
  });

  // ── Validation ──────────────────────────────────────────────────────────
  if (!bookingId || typeof bookingId !== 'string') {
    res.status(400).json({ error: 'bookingId is required.' });
    return;
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    res.status(400).json({ error: 'amountInOMR must be a positive number.' });
    return;
  }
  if (!successUrl || !cancelUrl) {
    res.status(400).json({ error: 'successUrl and cancelUrl are required.' });
    return;
  }

  const unitAmount = omrToBaisa(amount);
  if (unitAmount < MIN_BAISA) {
    res.status(400).json({ error: `Amount must be at least ${MIN_BAISA} baisa.` });
    return;
  }

  // ── Build the Thawani session payload ─────────────────────────────────────
  const payload = {
    client_reference_id: bookingId, // ties the session back to our Firestore doc
    mode: 'payment',
    products: [
      {
        name: `Booking ${bookingId}`,
        quantity: 1,
        unit_amount: unitAmount, // integer baisa
      },
    ],
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: {
      bookingId,
      ...(customer?.name ? { customer_name: customer.name } : {}),
      ...(customer?.phone ? { customer_phone: customer.phone } : {}),
      ...(customer?.email ? { customer_email: customer.email } : {}),
    },
  };

  try {
    const thawaniRes = await fetch(`${THAWANI_BASE_URL}/checkout/session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'thawani-api-key': secretKey,
      },
      body: JSON.stringify(payload),
    });

    const data = (await thawaniRes.json().catch(() => null)) as
      | { success?: boolean; code?: number; description?: string; data?: { session_id?: string } }
      | null;

    if (!thawaniRes.ok || !data?.success || !data.data?.session_id) {
      console.error('[thawani/checkout] Thawani rejected session', {
        httpStatus: thawaniRes.status,
        code: data?.code,
        description: data?.description,
      });
      res.status(502).json({
        error: 'Failed to create payment session.',
        detail: data?.description || `Thawani responded ${thawaniRes.status}`,
      });
      return;
    }

    const sessionId = data.data.session_id;
    const redirectUrl = payUrl(sessionId, publishableKey);

    console.log('[thawani/checkout] session created', { bookingId, sessionId });

    res.status(200).json({ sessionId, redirectUrl });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[thawani/checkout] network/exception', message);
    res.status(500).json({ error: 'Unexpected error creating payment session.' });
  }
}
