export const GET: (r: Request) => Promise<Response>, POST: typeof GET, PUT: typeof GET, PATCH: typeof GET, DELETE: typeof GET, HEAD: typeof GET, OPTIONS: typeof GET;
export const config: { maxDuration: number };
