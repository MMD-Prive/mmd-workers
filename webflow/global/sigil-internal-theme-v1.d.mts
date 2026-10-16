export function usesSilverWorkspace(pathname: string): boolean;
export const SILVER_WORKSPACE_CSS: string;
export function silverWorkspaceLoader(): string;
export function installInternalSilverTheme(doc?: Document, loc?: Pick<Location, 'pathname'>): void;
export function decorateInternalSilverTheme(request: { method: string; url: string }, response: Response): Promise<Response>;
