import { proxyRequest } from './_proxy.mjs';

const handle = (request) => proxyRequest(request);
export const GET = handle, POST = handle, PUT = handle, PATCH = handle, DELETE = handle, HEAD = handle, OPTIONS = handle;
