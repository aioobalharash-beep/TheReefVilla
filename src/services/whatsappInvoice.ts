/**
 * WhatsApp invoice trigger — logs for now, will connect the API next.
 *
 * Kept in its own tiny module (not in Invoices.tsx) so the PUBLIC Booking page
 * can call it without statically importing the heavy admin Invoices component
 * (which pulls in the full Firestore SDK, jsPDF and html2canvas).
 */
export function sendWhatsAppInvoice(bookingData: { guest_name: string; guest_phone?: string; id: string }) {
  console.log(`Triggering WhatsApp PDF send for ${bookingData.guest_name}...`);
}
