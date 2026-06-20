/**
 * Thawani checkout — frontend helper.
 *
 * Calls our own serverless function (which holds the secret keys) to create a
 * hosted checkout session, then hands back the redirect URL. The component is
 * responsible for the actual `window.location.href` navigation so it can manage
 * its own loading UI right up until the page unloads.
 */

export interface ThawaniCheckoutInput {
  bookingId: string;
  amountInOMR: number;
  successUrl: string;
  cancelUrl: string;
  customer?: { name?: string; phone?: string; email?: string };
}

export interface ThawaniCheckoutSession {
  sessionId: string;
  redirectUrl: string;
}

export async function createThawaniCheckout(
  input: ThawaniCheckoutInput,
): Promise<ThawaniCheckoutSession> {
  const res = await fetch('/api/thawani/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });

  // Parse defensively — a 500 may return HTML, not JSON.
  const data = await res.json().catch(() => null);

  if (!res.ok || !data?.redirectUrl) {
    throw new Error(data?.error || `Payment session failed (${res.status}).`);
  }

  return data as ThawaniCheckoutSession;
}
