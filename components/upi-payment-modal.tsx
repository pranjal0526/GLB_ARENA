'use client';

import React, { useState } from 'react';
import { 
  X, 
  Copy, 
  Check, 
  CreditCard, 
  AlertCircle, 
  QrCode, 
  ShieldAlert, 
  Clock 
} from 'lucide-react';
import { submitUpiPayment } from '@/lib/services/payment-service';
import { isManualPaymentConfigured } from '@/lib/config/payments';

interface UpiPaymentModalProps {
  registrationId: string;
  registrationCode: string;
  tournamentTitle: string;
  amountPaise: number;
  isOpen: boolean;
  onClose: () => void;
  onPaymentSubmitted: () => void;
}

export function UpiPaymentModal({
  registrationId,
  registrationCode,
  tournamentTitle,
  amountPaise,
  isOpen,
  onClose,
  onPaymentSubmitted,
}: UpiPaymentModalProps) {
  const [utr, setUtr] = useState('');
  const [copied, setCopied] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  if (!isOpen) return null;

  const upiId = process.env.NEXT_PUBLIC_UPI_ID || '';
  const payeeName = process.env.NEXT_PUBLIC_UPI_PAYEE_NAME || 'Tournament Organizer';
  const qrImage = process.env.NEXT_PUBLIC_UPI_QR_IMAGE || '';
  const amountInr = amountPaise / 100;

  const handleCopyUpi = () => {
    navigator.clipboard.writeText(upiId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!isManualPaymentConfigured()) {
      setError('Paid registration is not configured. Contact the tournament organizer.');
      return;
    }

    const cleanUtr = utr.trim();
    if (!cleanUtr || cleanUtr.length < 6) {
      setError('Please enter a valid 12-digit UPI UTR or transaction reference number.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await submitUpiPayment({
        registrationId,
        transactionReference: cleanUtr,
      });

      if (!res.success) {
        setError(res.error || 'Failed to submit payment reference.');
      } else {
        setSuccess(true);
        onPaymentSubmitted();
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An error occurred during submission.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg rounded-2xl bg-surface-100 border border-surface-border shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-border bg-surface-200/50">
          <div className="flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-cyanAccent-400" />
            <h3 className="font-display font-bold text-white text-base">
              Manual UPI Payment Verification
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-white rounded-lg hover:bg-surface-50 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 max-h-[85vh] overflow-y-auto space-y-6">
          {success ? (
            <div className="py-8 text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mx-auto text-amber-400 animate-pulse">
                <Clock className="w-8 h-8" />
              </div>
              <h4 className="text-xl font-display font-bold text-white">
                Payment Submitted for Verification
              </h4>
              <p className="text-sm text-gray-300 max-w-sm mx-auto leading-relaxed">
                Your entry will be confirmed once the payment is verified. UTR <span className="font-mono text-cyanAccent-400 font-bold">{utr}</span> was submitted for registration <span className="font-mono text-white font-bold">{registrationCode}</span>.
              </p>
              <div className="p-4 rounded-xl bg-surface-200 border border-surface-border text-xs text-gray-400 text-left space-y-2">
                <div className="flex items-center gap-2 text-amber-400 font-semibold">
                  <AlertCircle className="w-4 h-4" /> Status: Pending Admin Review
                </div>
                <p>
                  The QR code is closed for this entry while the organizer reviews your payment. Check My Tournaments for the latest status.
                </p>
              </div>
              <button
                onClick={onClose}
                className="w-full py-2.5 px-4 rounded-xl bg-brand-600 hover:bg-brand-500 text-white font-semibold shadow-glow-sm transition-all"
              >
                Done
              </button>
            </div>
          ) : (
            <>
              {/* Event & Amount Banner */}
              <div className="p-4 rounded-xl bg-gradient-to-r from-brand-950/40 to-cyan-950/40 border border-brand-500/20 flex items-center justify-between">
                <div>
                  <div className="text-xs text-gray-400 font-mono">REGISTRATION ENTRY FEE</div>
                  <div className="text-sm font-semibold text-white line-clamp-1">{tournamentTitle}</div>
                  <div className="text-xs font-mono text-cyanAccent-400 mt-0.5">Code: {registrationCode}</div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-gray-400 font-mono">AMOUNT DUE</div>
                  <div className="text-2xl font-black text-emerald-400">₹{amountInr}</div>
                </div>
              </div>

              {/* UPI QR Display & Copy */}
              <div className="p-5 rounded-xl bg-surface-200 border border-surface-border flex flex-col items-center text-center space-y-3">
                <div className="p-3 bg-white rounded-xl shadow-md">
                  {qrImage ? (
                    <img src={qrImage} alt={`${payeeName} UPI QR code`} className="w-44 h-44 object-contain rounded-lg" />
                  ) : (
                    <div className="w-44 h-44 bg-slate-950 p-3 rounded-lg flex flex-col items-center justify-center gap-2">
                      <QrCode className="w-14 h-14 text-gray-500" />
                      <span className="text-center text-[10px] font-mono text-gray-400">Organizer QR image is not configured.</span>
                    </div>
                  )}
                </div>

                <div className="space-y-1 w-full">
                  <div className="text-xs text-gray-400">Payee: <strong className="text-white">{payeeName}</strong></div>
                  <div className="flex items-center justify-center gap-2 p-2 rounded-lg bg-surface-100 border border-surface-border font-mono text-sm text-cyanAccent-400">
                    <span>{upiId || 'UPI ID not configured'}</span>
                    <button
                      onClick={handleCopyUpi}
                      className="p-1 text-gray-400 hover:text-white transition-colors"
                      title="Copy UPI ID"
                    >
                      {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>

              {/* Instructions */}
              <div className="text-xs text-gray-400 space-y-1.5 font-mono">
                <div className="text-gray-300 font-semibold mb-1">Payment Instructions:</div>
                <div>1. Scan with PhonePe, Google Pay, Paytm, or BHIM.</div>
                <div>2. Transfer the exact amount of <strong className="text-emerald-400">₹{amountInr}</strong>.</div>
                <div>3. Copy the 12-digit UTR / UPI Reference Number from receipt.</div>
                <div>4. Enter and submit below for organizer verification.</div>
              </div>

              {/* Submission Form */}
              <form onSubmit={handleSubmit} className="space-y-4 pt-2">
                {error && (
                  <div className="p-3 rounded-lg bg-red-950/50 border border-red-500/40 text-xs text-red-300 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    <span>{error}</span>
                  </div>
                )}
                {!isManualPaymentConfigured() && (
                  <div className="p-3 rounded-lg bg-amber-950/40 border border-amber-500/30 text-xs text-amber-300">
                    The organizer has not configured paid registration and a valid UPI QR code yet.
                  </div>
                )}

                <div>
                  <label className="block text-xs font-mono uppercase text-gray-300 mb-1.5">
                    UPI Transaction Reference / 12-Digit UTR <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={utr}
                    onChange={(e) => setUtr(e.target.value)}
                    placeholder="e.g. 429182736451"
                    maxLength={30}
                    required
                    className="w-full px-3.5 py-2.5 rounded-xl bg-surface-200 border border-surface-border focus:border-cyanAccent-500 text-white font-mono text-sm focus:outline-none transition-colors"
                  />
                  <p className="text-[11px] text-gray-500 mt-1">
                    Found in your bank SMS or payment app details as &ldquo;UPI Ref ID&rdquo; or &ldquo;UTR&rdquo;.
                  </p>
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={isSubmitting || !isManualPaymentConfigured()}
                    className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-brand-600 to-cyanAccent-600 hover:from-brand-500 hover:to-cyanAccent-500 text-white font-bold text-sm shadow-glow transition-all flex items-center justify-center gap-2 disabled:opacity-60"
                  >
                    {isSubmitting ? (
                      <span>Submitting...</span>
                    ) : (
                      <>
                        <CreditCard className="w-4 h-4" />
                        <span>Submit Reference for Verification</span>
                      </>
                    )}
                  </button>
                </div>

                <div className="text-[11px] text-gray-500 flex items-center gap-1.5 justify-center">
                  <ShieldAlert className="w-3.5 h-3.5 text-amber-500" />
                  <span>Submitting false UTR references results in a permanent account ban.</span>
                </div>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
