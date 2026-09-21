export interface AuthorityEventInput {
  event: string;
  authority: string;
  scope?: string;
  distinctValue: string;
  insertValue?: string;
  properties?: Record<string, string | number | boolean | null | undefined>;
}

export interface AuthorityCaptureResult {
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  status?: number;
  error?: string;
}

export function posthogAuthorityReady(env?: unknown): boolean;

export function captureAuthorityEvent(
  env: unknown,
  input: AuthorityEventInput,
): Promise<AuthorityCaptureResult>;

export function queueAuthorityEvent(
  ctx: { waitUntil(promise: Promise<unknown>): void } | null | undefined,
  env: unknown,
  input: AuthorityEventInput,
): void;
