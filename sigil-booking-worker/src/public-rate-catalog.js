import { PUBLIC_BOOKING_FORMATS } from '../../shared/member-public-booking.mjs';

// Accept rows using the Public rate register's column names.
export function createPublicRateCatalog(rows) {
  return {
    async lookup(modelId, publicFormat, durationMinutes) {
      const matches = rows.filter(row =>
        row.status === 'approved' &&
        row.model_id === modelId &&
        row.public_format === publicFormat &&
        row.duration_minutes === durationMinutes
      );
      if (matches.length !== 1) return null;

      const rate = matches[0];
      const evidence = [rate.approved_by, rate.approved_at, rate.approval_ref];
      if (!evidence.every(value => typeof value === 'string' && value.trim())) return null;

      return {
        status: rate.status,
        model_id: rate.model_id,
        public_format: rate.public_format,
        duration_minutes: rate.duration_minutes,
        model_fee_thb: rate.model_fee_thb,
        ...(rate.price_visibility === 'customer' && Number.isSafeInteger(rate.customer_rate_thb) && rate.customer_rate_thb > 0
          ? {customer_rate_thb: rate.customer_rate_thb} : {}),
      };
    },
  };
}

// Customer quotes require their own publication approval, separate from model fees.
export function listPublicBookingOffers(rows, modelId) {
  if (!Array.isArray(rows)) return [];
  return rows.filter(row => row.model_id === modelId && row.status === 'approved')
    .filter(row => {
      const matches = rows.filter(other => other.status === 'approved' &&
        other.model_id === modelId && other.public_format === row.public_format &&
        other.duration_minutes === row.duration_minutes);
      return matches.length === 1 &&
        [row.approved_by, row.approved_at, row.approval_ref].every(value => typeof value === 'string' && value.trim()) &&
        Object.hasOwn(PUBLIC_BOOKING_FORMATS, row.public_format) &&
        row.price_visibility === 'customer' &&
        Number.isSafeInteger(row.duration_minutes) && row.duration_minutes >= 180 && row.duration_minutes <= 300 &&
        Number.isSafeInteger(row.customer_rate_thb) && row.customer_rate_thb > 0;
    })
    .map(row => ({public_format: row.public_format, duration_minutes: row.duration_minutes,
      customer_rate_thb: row.customer_rate_thb}));
}
