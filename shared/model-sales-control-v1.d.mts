export const MODEL_SALES_POLICY_VERSION: string;
export const MODEL_SALES_TIME_ZONE: string;
export function resolveModelSalesOffer(input?: Record<string, unknown>): Record<string, unknown>;
export function normalizeModelSalesRule(record?: Record<string, unknown>, index?: number): Record<string, unknown> | null;
export function canonicalAudiencesFromSnapshot(snapshot?: Record<string, unknown>): Set<string>;
