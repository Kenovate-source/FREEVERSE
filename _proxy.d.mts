export function backendOrigin(env: Record<string, string | undefined>): string | null;
export function proxyRequest(request: Request, env?: Record<string, string | undefined>, fetchImpl?: typeof fetch): Promise<Response>;
