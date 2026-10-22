export class HttpError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) { super(message); }
}
export const badRequest = (message: string, details?: unknown, code = 'invalid_request') => new HttpError(400, code, message, details);
export const unauthorized = (message = 'Please sign in to continue.', code = 'unauthenticated') => new HttpError(401, code, message);
export const forbidden = (message = 'You do not have permission to do that.', code = 'forbidden') => new HttpError(403, code, message);
export const notFound = (message = 'Not found.', code = 'not_found') => new HttpError(404, code, message);
export const conflict = (message: string, code = 'conflict') => new HttpError(409, code, message);
export const unprocessable = (message: string, details?: unknown, code = 'unprocessable') => new HttpError(422, code, message, details);
export const tooMany = (message = 'Too many requests. Please slow down.', retryAfterSec = 30) => new HttpError(429, 'rate_limited', message, { retryAfterSec });
export const unavailable = (message: string, code = 'unavailable') => new HttpError(503, code, message);
