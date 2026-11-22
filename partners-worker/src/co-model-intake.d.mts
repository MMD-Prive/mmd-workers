export type Draft = { partnerId: string; mode: string; description: string };
type Answer = { choice: string; submittedAt: number };
type Record = Draft & { linkId: string | null; expiresAt: number; answer: Answer | null };
export type Result = { status: number; mode?: string; description?: string; expiresAt?: number; answer?: Answer | null; linkId?: string };
export type Store = { update(id: string, change: (previous: Record | undefined) => [Record | undefined, Result]): Promise<Result> };
export function createIntake(options: {
  store: Store;
  authenticatePartner(request: Request): Promise<{id: string} | null>;
  now?: () => number;
  randomId?: () => string;
}): {
  manage(owner: {role: string}, id: string, operation: string, draft?: Draft): Promise<Result>;
  receive(request: Request, id: string, linkId: string): Promise<Result>;
};
export function renderIntake(result: Result, request?: Request): Response;
