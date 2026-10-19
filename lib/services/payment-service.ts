import { Payment, PaymentStatus } from '../supabase/types';
import { getStore } from './store';
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

export async function submitUpiPayment(input: SubmitPaymentInput): Promise<{
  success: boolean;
  payment?: Payment;
  error?: string;
}> {
  const store = getStore();

  const reg = store.registrations.find(r => r.id === input.registrationId);
  if (!reg) {
    return { success: false, error: 'Registration not found' };
  }

  const tournament = store.tournaments.find(t => t.id === reg.tournament_id);
  if (!tournament) {
    return { success: false, error: 'Tournament not found' };
  }

  // Sanitize UTR / transaction reference
  const utr = input.transactionReference.trim();
  if (utr.length < 6) {
    return { success: false, error: 'Invalid transaction reference/UTR. Must be at least 6 characters.' };
  }

  // Prevent duplicate UTR submission across verified payments
  const duplicate = store.registrations
    .map(r => r.payment)
    .find(p => p && p.payment_status === 'verified' && p.transaction_reference.toLowerCase() === utr.toLowerCase());
  if (duplicate) {
    return { success: false, error: 'This transaction reference (UTR) has already been verified for another registration.' };
  }

  const paymentId = `pay-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
  const payment: Payment = {
    id: paymentId,
    registration_id: reg.id,
    amount_paise: tournament.entry_fee_paise,
    payment_method: 'upi_qr',
    payment_status: 'submitted',
    transaction_reference: utr,
    screenshot_url: input.screenshotUrl,
    submitted_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  reg.payment = payment;
  reg.status = 'payment_submitted';
  reg.updated_at = new Date().toISOString();

  return { success: true, payment };
}

export async function getAllPayments(filters: PaymentFilter = {}): Promise<Payment[]> {
  const store = getStore();
  let list: Payment[] = [];

  store.registrations.forEach(r => {
    if (r.payment) {
      list.push({
        ...r.payment,
        registration: {
          ...r,
          captain: store.profiles.find(p => p.id === r.captain_id),
          tournament: store.tournaments.find(t => t.id === r.tournament_id),
        },
      });
    }
  });

  if (filters.status && filters.status !== 'all') {
    list = list.filter(p => p.payment_status === filters.status);
  }

  if (filters.tournamentId && filters.tournamentId !== 'all') {
    list = list.filter(p => p.registration?.tournament_id === filters.tournamentId);
  }

  list.sort((a, b) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime());
  return list;
}

export async function verifyPayment(
  paymentId: string,
  adminId: string
): Promise<{ success: boolean; error?: string }> {
  const store = getStore();

  const reg = store.registrations.find(r => r.payment?.id === paymentId);
  if (!reg || !reg.payment) {
    return { success: false, error: 'Payment record not found' };
  }

  if (reg.payment.payment_status === 'verified') {
    return { success: false, error: 'Payment is already verified' };
  }

  reg.payment.payment_status = 'verified';
  reg.payment.verified_by = adminId;
  reg.payment.verified_at = new Date().toISOString();
  reg.payment.updated_at = new Date().toISOString();

  // Confirm registration
  reg.status = 'confirmed';
  reg.updated_at = new Date().toISOString();

  // Update player profile participation count
  const captain = store.profiles.find(p => p.id === reg.captain_id);
  if (captain) {
    captain.total_tournaments += 1;
    captain.updated_at = new Date().toISOString();
  }

  await logAdminAction({
    actorId: adminId,
    action: 'PAYMENT_VERIFIED',
    targetEntity: 'payments',
    targetId: paymentId,
    metadata: {
      registration_id: reg.id,
      registration_code: reg.registration_code,
      team_name: reg.team_name,
      amount_inr: reg.payment.amount_paise / 100,
      utr: reg.payment.transaction_reference,
    },
  });

  return { success: true };
}

export async function rejectPayment(
  paymentId: string,
  rejectionReason: string,
  adminId: string
): Promise<{ success: boolean; error?: string }> {
  const store = getStore();

  const reg = store.registrations.find(r => r.payment?.id === paymentId);
  if (!reg || !reg.payment) {
    return { success: false, error: 'Payment record not found' };
  }

  reg.payment.payment_status = 'rejected';
  reg.payment.rejection_reason = rejectionReason;
  reg.payment.verified_by = adminId;
  reg.payment.verified_at = new Date().toISOString();
  reg.payment.updated_at = new Date().toISOString();

  // Move registration to rejected state so user can resubmit with corrected UTR
  reg.status = 'rejected';
  reg.updated_at = new Date().toISOString();

  await logAdminAction({
    actorId: adminId,
    action: 'PAYMENT_REJECTED',
    targetEntity: 'payments',
    targetId: paymentId,
    metadata: {
      registration_id: reg.id,
      registration_code: reg.registration_code,
      reason: rejectionReason,
      utr: reg.payment.transaction_reference,
    },
  });

  return { success: true };
}
