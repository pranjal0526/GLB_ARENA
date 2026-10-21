import { Payment, PaymentStatus } from '../supabase/types';
import { getStore, isSupabaseConfigured, persistStore } from './store';
import { createClient } from '../supabase/client';
import { getAllRegistrations } from './registration-service';
import { logAdminAction } from './audit-service';

export interface SubmitPaymentInput {
  registrationId: string;
  transactionReference: string;
  screenshotUrl?: string;
}

export interface PaymentFilter {
  status?: PaymentStatus | 'all';
  tournamentId?: string;
}

export async function submitUpiPayment(input: SubmitPaymentInput): Promise<{ success: boolean; payment?: Payment; error?: string }> {
  const utr = input.transactionReference.trim();
  if (utr.length < 6) return { success: false, error: 'Invalid transaction reference/UTR. Must be at least 6 characters.' };
  if (isSupabaseConfigured()) {
    const { data, error } = await createClient().rpc('submit_upi_payment', {
      p_registration_id: input.registrationId,
      p_transaction_reference: utr,
      p_screenshot_url: input.screenshotUrl || null,
    });
    if (error) return { success: false, error: error.message };
    if (!data?.success) return { success: false, error: data?.error || 'Payment submission failed.' };
    return { success: true, payment: data.payment as Payment };
  }
  const store = getStore();
  const registration = store.registrations.find((item) => item.id === input.registrationId);
  if (!registration) return { success: false, error: 'Registration not found' };
  const tournament = store.tournaments.find((item) => item.id === registration.tournament_id);
  if (!tournament) return { success: false, error: 'Tournament not found' };
  const duplicate = store.registrations.flatMap((item) => item.payment ? [item.payment] : []).find((payment) => payment.payment_status === 'verified' && payment.transaction_reference.toLowerCase() === utr.toLowerCase());
  if (duplicate) return { success: false, error: 'This transaction reference (UTR) has already been verified for another registration.' };
  const now = new Date().toISOString();
  const payment: Payment = {
    id: `pay-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    registration_id: registration.id, amount_paise: tournament.entry_fee_paise, payment_method: 'upi_qr',
    payment_status: 'submitted', transaction_reference: utr, screenshot_url: input.screenshotUrl,
    submitted_at: now, created_at: now, updated_at: now,
  };
  registration.payment = payment; registration.status = 'payment_submitted'; registration.updated_at = now; persistStore(store);
  return { success: true, payment };
}

export async function getAllPayments(filters: PaymentFilter = {}): Promise<Payment[]> {
  let list: Payment[];
  if (isSupabaseConfigured()) {
    let query = createClient().from('payments').select('*').order('submitted_at', { ascending: false });
    if (filters.status && filters.status !== 'all') query = query.eq('payment_status', filters.status);
    const { data, error } = await query;
    if (error) throw error;
    const registrations = await getAllRegistrations();
    const byId = new Map(registrations.map((registration) => [registration.id, registration]));
    list = ((data || []) as Payment[]).map((payment) => ({ ...payment, registration: byId.get(payment.registration_id) }));
  } else {
    const store = getStore();
    list = store.registrations.flatMap((registration) => registration.payment ? [{
      ...registration.payment,
      registration: { ...registration, captain: store.profiles.find((profile) => profile.id === registration.captain_id), tournament: store.tournaments.find((tournament) => tournament.id === registration.tournament_id) },
    }] : []);
  }
  if (filters.status && filters.status !== 'all') list = list.filter((payment) => payment.payment_status === filters.status);
  if (filters.tournamentId && filters.tournamentId !== 'all') list = list.filter((payment) => payment.registration?.tournament_id === filters.tournamentId);
  return list.sort((a, b) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime());
}

async function reviewPayment(paymentId: string, approve: boolean, reason: string | undefined, adminId: string) {
  if (isSupabaseConfigured()) {
    const { data, error } = await createClient().rpc('review_payment', {
      p_payment_id: paymentId, p_approve: approve, p_reason: reason || null,
    });
    if (error) return { success: false, error: error.message };
    return data?.success ? { success: true } : { success: false, error: data?.error || 'Payment review failed.' };
  }
  const store = getStore();
  const registration = store.registrations.find((item) => item.payment?.id === paymentId);
  if (!registration?.payment) return { success: false, error: 'Payment record not found' };
  if (approve && registration.payment.payment_status === 'verified') return { success: false, error: 'Payment is already verified' };
  const now = new Date().toISOString();
  registration.payment.payment_status = approve ? 'verified' : 'rejected';
  registration.payment.rejection_reason = approve ? null : reason;
  registration.payment.verified_by = adminId; registration.payment.verified_at = now; registration.payment.updated_at = now;
  registration.status = approve ? 'confirmed' : 'rejected'; registration.updated_at = now;
  persistStore(store);
  await logAdminAction({ actorId: adminId, action: approve ? 'PAYMENT_VERIFIED' : 'PAYMENT_REJECTED', targetEntity: 'payments', targetId: paymentId, metadata: { registration_id: registration.id, reason } });
  return { success: true };
}

export async function verifyPayment(paymentId: string, adminId: string) { return reviewPayment(paymentId, true, undefined, adminId); }
export async function rejectPayment(paymentId: string, rejectionReason: string, adminId: string) { return reviewPayment(paymentId, false, rejectionReason, adminId); }
