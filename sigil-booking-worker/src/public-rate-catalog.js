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
      };
    },
  };
}
