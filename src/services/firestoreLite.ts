import {
  collection,
  addDoc,
  getDocs,
  getDoc,
  doc,
  query,
  orderBy,
  where,
} from 'firebase/firestore/lite';
import { liteDb } from './firebaseLite';

// One-shot Firestore reads/writes for the PUBLIC, read-only pages
// (Sanctuary, Booking, Testimonials, Terms, About, Confirmation).
//
// These intentionally use firebase/firestore/lite (no realtime onSnapshot, no
// local cache) so the heavy realtime SDK never loads on the landing/public
// bundle. Losing realtime here is acceptable for a single-property villa; the
// admin portal keeps the full SDK (services/firestore.ts) for live updates.

const propertiesCol = () => collection(liteDb, 'properties');
const bookingsCol = () => collection(liteDb, 'bookings');
const guestsCol = () => collection(liteDb, 'guests');
const transactionsCol = () => collection(liteDb, 'transactions');
const testimonialsCol = () => collection(liteDb, 'testimonials');
const notificationsCol = () => collection(liteDb, 'notifications');

// ── Property details (settings/property_details) ──

export async function getPropertyDetails(): Promise<Record<string, any> | null> {
  const snap = await getDoc(doc(liteDb, 'settings', 'property_details'));
  return snap.exists() ? (snap.data() as Record<string, any>) : null;
}

export async function getExternalBlocks(): Promise<{ start: string; end: string }[]> {
  const snap = await getDoc(doc(liteDb, 'settings', 'external_blocks'));
  if (!snap.exists()) return [];
  const data = snap.data() as { blocks?: { start: string; end: string }[] };
  return data.blocks || [];
}

export async function getPropertyStatus(): Promise<{ is_live?: boolean } | null> {
  const snap = await getDoc(doc(liteDb, 'settings', 'property_status'));
  return snap.exists() ? (snap.data() as { is_live?: boolean }) : null;
}

// ── Properties ──

export async function listProperties(): Promise<any[]> {
  // Public read only — never seeds (seeding is an admin/full-SDK concern).
  const q = query(propertiesCol(), where('status', '==', 'active'));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// ── Bookings ──

/** Raw booking docs for availability computation (Booking page). */
export async function listBookingsRaw(): Promise<any[]> {
  const q = query(bookingsCol(), orderBy('created_at', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function getBooking(id: string): Promise<any | null> {
  const snap = await getDoc(doc(liteDb, 'bookings', id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

/**
 * Public booking creation. Mirrors firestoreBookings.create (services/firestore.ts)
 * exactly — same pricing derivation, doc shape, and side-effect docs (guest,
 * transaction, admin notification, push fan-out) — but written via the lite SDK
 * so the public flow never pulls in the realtime Firestore bundle.
 */
export async function createBooking(data: {
  property_id: string;
  property_name: string;
  guest_name: string;
  guest_phone: string;
  guest_email?: string;
  check_in: string;
  check_out: string;
  nightly_rate: number;
  security_deposit: number;
  stayTotal?: number;
  depositAmount?: number;
  grandTotal?: number;
  payment_method: 'thawani' | 'bank_transfer' | 'walk_in';
  awaitingPayment?: boolean;
  payment_mode?: 'paid' | 'free';
  amount_paid?: number;
  deposit_paid?: boolean;
  isManual?: boolean;
  receipt_image?: string;
  receiptURL?: string;
  idImageUrl?: string;
  stay_type?: 'day_use' | 'night_stay' | 'event';
  guestCount?: number;
  discount_amount?: number;
  discount_kind?: 'percent' | 'flat' | 'last_night_half';
  slot_id?: string;
  slot_name?: string;
  slot_name_ar?: string;
  slot_start_time?: string;
  slot_end_time?: string;
  check_in_time?: string;
  check_out_time?: string;
  termsAccepted?: boolean;
  termsAcceptedAt?: string;
}): Promise<any> {
  const checkIn = new Date(data.check_in);
  const checkOut = new Date(data.check_out);
  const nights = Math.ceil((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24));

  const stayTotal = Number(data.stayTotal) || (data.nightly_rate * nights);
  const depositAmount = Number(data.depositAmount) || Number(data.security_deposit) || 0;
  const isWalkIn = data.payment_method === 'walk_in';
  const isBankTransfer = data.payment_method === 'bank_transfer';
  const awaitingPayment = data.awaitingPayment === true;
  const isFreeWalkIn = isWalkIn && data.payment_mode === 'free';
  const isManual = data.isManual === true;
  const depositPaid = data.deposit_paid !== false;
  const walkInStayPaid = isFreeWalkIn ? 0 : Number(data.amount_paid) || 0;
  const grandTotal = isWalkIn
    ? walkInStayPaid + (depositPaid ? depositAmount : 0)
    : (depositPaid ? stayTotal + depositAmount : stayTotal);
  const balanceDue = !depositPaid ? depositAmount : 0;

  let paymentStatus: string;
  if (isFreeWalkIn) paymentStatus = 'free';
  else if (isWalkIn && data.payment_mode === 'paid') paymentStatus = 'paid';
  else if (isBankTransfer) paymentStatus = 'pending';
  else if (isWalkIn) paymentStatus = 'pending';
  else if (awaitingPayment) paymentStatus = 'pending';
  else paymentStatus = 'paid';

  const booking: Record<string, any> = {
    property_id: data.property_id,
    property_name: data.property_name,
    guest_name: data.guest_name,
    guest_phone: data.guest_phone,
    guest_email: data.guest_email || '',
    check_in: data.check_in,
    check_out: data.check_out,
    nights,
    nightly_rate: data.nightly_rate,
    security_deposit: depositAmount,
    total_amount: grandTotal,
    stayTotal: isWalkIn ? walkInStayPaid : stayTotal,
    depositAmount,
    grandTotal,
    balance_due: balanceDue,
    deposit_paid: depositPaid,
    ...(isManual ? { isManual: true } : {}),
    status: (isBankTransfer || awaitingPayment) ? 'pending' : 'confirmed',
    payment_status: paymentStatus,
    payment_method: data.payment_method,
    receipt_image: data.receipt_image || '',
    receiptURL: data.receiptURL || '',
    idImageUrl: data.idImageUrl || '',
    ...(data.stay_type ? { stay_type: data.stay_type } : {}),
    ...(typeof data.guestCount === 'number' && data.guestCount > 0
      ? { guestCount: Math.round(data.guestCount) }
      : {}),
    ...(typeof data.discount_amount === 'number' && data.discount_amount > 0
      ? { discount_amount: data.discount_amount }
      : {}),
    ...(data.discount_kind ? { discount_kind: data.discount_kind } : {}),
    ...(data.slot_id ? {
      slot_id: data.slot_id,
      slot_name: data.slot_name || '',
      slot_name_ar: data.slot_name_ar || '',
      slot_start_time: data.slot_start_time || '',
      slot_end_time: data.slot_end_time || '',
    } : {}),
    ...(data.check_in_time ? { check_in_time: data.check_in_time } : {}),
    ...(data.check_out_time ? { check_out_time: data.check_out_time } : {}),
    ...(data.termsAccepted ? {
      termsAccepted: true,
      termsAcceptedAt: data.termsAcceptedAt || new Date().toISOString(),
    } : {}),
    created_at: new Date().toISOString(),
  };

  const docRef = await addDoc(bookingsCol(), booking);

  // Also create a guest record
  await addDoc(guestsCol(), {
    name: data.guest_name,
    phone: data.guest_phone,
    email: data.guest_email || '',
    check_in: data.check_in,
    check_out: data.check_out,
    status: 'upcoming',
    property_id: data.property_id,
    property_name: data.property_name,
    booking_id: docRef.id,
    created_at: new Date().toISOString(),
  });

  // Transaction record only when money was actually collected
  if (paymentStatus === 'paid') {
    await addDoc(transactionsCol(), {
      type: 'payment',
      description: `Booking Payment - ${data.property_name}`,
      amount: grandTotal,
      booking_id: docRef.id,
      date: new Date().toISOString().split('T')[0],
      created_at: new Date().toISOString(),
    });
  }

  // Notification for admin
  await addDoc(notificationsCol(), {
    type: (isBankTransfer || awaitingPayment) ? 'pending_payment' : 'new_booking',
    title: isBankTransfer ? 'Bank Transfer Pending' : awaitingPayment ? 'Awaiting Card Payment' : 'New Booking',
    message: `${data.guest_name} booked ${data.property_name} (${nights > 0 ? `${nights} nights` : 'Day Use'})`,
    booking_id: docRef.id,
    read: false,
    created_at: new Date().toISOString(),
  });

  // Push fan-out to admin devices — fire-and-forget, must never block the
  // booking confirmation. Safe no-op if the endpoint isn't deployed.
  void import('./pushNotifications')
    .then(m => m.notifyAdminsOfNewBooking({
      bookingId: docRef.id,
      guest_name: data.guest_name,
      total_amount: grandTotal,
      check_in: data.check_in,
      check_out: data.check_out,
      check_in_time: booking.check_in_time,
      check_out_time: booking.check_out_time,
    }))
    .catch(() => { /* fire-and-forget */ });

  return { ...booking, id: docRef.id };
}

// ── Testimonials ──

export interface Testimonial {
  id?: string;
  guest_name: string;
  guest_phone: string;
  property_name: string;
  rating: number;
  text: string;
  stay_details: string;
  isPinned?: boolean;
  created_at: string;
}

export async function createTestimonial(
  data: Omit<Testimonial, 'id' | 'created_at'>,
): Promise<Testimonial> {
  const created_at = new Date().toISOString();
  const docRef = await addDoc(testimonialsCol(), { ...data, created_at });
  return { id: docRef.id, ...data, created_at };
}

export async function listTestimonials(): Promise<Testimonial[]> {
  const q = query(testimonialsCol(), orderBy('created_at', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as Testimonial));
}
