export function isRelaxSpaPartnerRequest(path: string): boolean;
export function handleRelaxSpaPartner(request: Request, env: { MMS_WORKER?: Fetcher }, partnerRecordId: string): Promise<Response>;
