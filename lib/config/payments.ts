export function isManualPaymentConfigured(): boolean {
  return process.env.NEXT_PUBLIC_MANUAL_PAYMENT_ENABLED === 'true'
    && Boolean(process.env.NEXT_PUBLIC_UPI_ID?.trim())
    && Boolean(process.env.NEXT_PUBLIC_UPI_QR_IMAGE?.trim());
}
