import type { VercelRequest, VercelResponse } from '@vercel/node';
import { timingSafeEqual } from 'node:crypto';
import { getDb } from '../_lib/firebaseAdmin';

/**
 * Thawani — Payment Webhook Listener
 * ----------------------------------
 * POST /api/thawani/webhook
 *
 * Thawani calls this endpoint after a checkout session resolves. We do NOT
 * trust the payload's payment_status on its own — anyone can POST JSON. Two
 * layers of defence:
 *
 *   1. Shared-secret token check (THAWANI_WEBHOOK_SECRET) sent in a header or
 *      `?token=` query param, compared in constant time.
 *   2. Authoritative re-fetch: we call Thawani's GET session endpoint with our
 *      secret key and only act on the payment_status Thawani itself returns.
 *
 * On a verified "paid" session we mark the matching Firestore booking
 * (client_reference_id = bookingId) as confirmed/paid. The write is idempotent.
 *
 * Env:
 *   THAWANI_SECRET_KEY      — server API key for the verification GET
 *   THAWANI_WEBHOOK_SECRET  — shared token Thawani is configured to send
 *   THAWANI_BASE_URL        — optional; defaults to production checkout host
 */

const THAWANI_BASE_URL = (
  process.env.THAWANI_BASE_URL || 'https://checkout.thawani.om/api/v1'
).replace(/\/+$/, '');

/** Constant-time string compare that tolerates length mismatches. */
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/** Pull the session id + booking ref out of Thawani's payload defensively. */
function extractIds(body: Record<string, unknown>): {
  sessionId?: string;
  bookingId?: string;
} {
  const data = (body?.data ?? body) as Record<string, unknown>;
  const sessionId = (data?.session_id ?? body?.session_id) as string | undefined;
  const bookingId = (data?.client_reference_id ??
    body?.client_reference_id ??
    (data?.metadata as Record<string, unknown> | undefined)?.bookingId) as
    | string
    | undefined;
  return { sessionId, bookingId };
}

/** Ask Thawani directly whether this session is actually paid. */
async function fetchSession(sessionId: string, secretKey: string) {
  const r = await fetch(`${THAWANI_BASE_URL}/checkout/session/${sessionId}`, {
    method: 'GET',
    headers: { 'thawani-api-key': secretKey },
  });
  const json = (await r.json().catch(() => null)) as
    | { success?: boolean; data?: { payment_status?: string; client_reference_id?: string } }
    | null;
  return { ok: r.ok, json };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const secretKey = process.env.THAWANI_SECRET_KEY;
  const webhookSecret = process.env.THAWANI_WEBHOOK_SECRET;
  if (!secretKey || !webhookSecret) {
    console.error('[thawani/webhook] Missing THAWANI_SECRET_KEY / THAWANI_WEBHOOK_SECRET');
    res.status(500).json({ error: 'Webhook is not configured.' });
    return;
  }

  // ── Layer 1: reject anything without the shared token ─────────────────────
  const provided =
    (req.headers['thawani-webhook-secret'] as string | undefined) ||
    (req.query.token as string | undefined) ||
    '';
  if (!safeEqual(provided, webhookSecret)) {
    console.warn('[thawani/webhook] rejected — bad/missing webhook token');
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const body = (req.body || {}) as Record<string, unknown>;
  const { sessionId, bookingId: payloadBookingId } = extractIds(body);

  console.log('[thawani/webhook] received', {
    eventType: body?.event_type,
    sessionId,
    bookingId: payloadBookingId,
  });

  if (!sessionId) {
    res.status(400).json({ error: 'session_id missing from payload.' });
    return;
  }

  try {
    // ── Layer 2: verify the payment with Thawani itself ─────────────────────
    const { ok, json } = await fetchSession(sessionId, secretKey);
    if (!ok || !json?.success || !json.data) {
      console.error('[thawani/webhook] session verification failed', { sessionId });
      res.status(502).json({ error: 'Could not verify session with Thawani.' });
      return;
    }

    const paymentStatus = json.data.payment_status;
    // Prefer the booking ref Thawani has on record over the (untrusted) payload.
    const bookingId = json.data.client_reference_id || payloadBookingId;

    if (paymentStatus !== 'paid') {
      // Acknowledge so Thawani stops retrying; nothing to confirm yet.
      console.log('[thawani/webhook] session not paid — ignoring', { sessionId, paymentStatus });
      res.status(200).json({ received: true, paymentStatus });
      return;
    }

    if (!bookingId) {
      console.error('[thawani/webhook] paid session has no bookingId', { sessionId });
      res.status(400).json({ error: 'No bookingId associated with this session.' });
      return;
    }

    // ── Confirm the booking (idempotent) ────────────────────────────────────
    const ref = getDb().collection('bookings').doc(bookingId);
    const snap = await ref.get();
    if (!snap.exists) {
      console.error('[thawani/webhook] booking not found', { bookingId });
      res.status(404).json({ error: 'Booking not found.' });
      return;
    }

    if (snap.get('payment_status') === 'paid') {
      console.log('[thawani/webhook] already paid — no-op', { bookingId });
      res.status(200).json({ received: true, idempotent: true });
      return;
    }

    await ref.update({
      status: 'confirmed',
      payment_status: 'paid',
      payment_method: 'thawani',
      thawani_session_id: sessionId,
      paid_at: new Date().toISOString(),
    });

    // Mirror the bank-transfer approval path: record the payment so it shows up
    // in revenue/VAT reports. Keyed by session id so retries stay idempotent.
    const db = getDb();
    const txnId = `thawani_${sessionId}`;
    await db.collection('transactions').doc(txnId).set({
      type: 'payment',
      description: `Thawani Payment - ${snap.get('property_name') || ''}`,
      amount: snap.get('total_amount') || 0,
      booking_id: bookingId,
      date: new Date().toISOString().split('T')[0],
      created_at: new Date().toISOString(),
    });

    console.log('[thawani/webhook] booking confirmed', { bookingId, sessionId });
    res.status(200).json({ received: true, bookingId });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[thawani/webhook] exception', message);
    res.status(500).json({ error: 'Unexpected error processing webhook.' });
  }
}
