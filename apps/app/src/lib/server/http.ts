import type { APIContext, APIRoute } from 'astro'

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message)
  }
}

export const badRequest = (message: string, code = 'bad_request') =>
  new HttpError(400, code, message)
export const unauthorized = () => new HttpError(401, 'unauthorized', 'Sign in to continue.')
export const forbidden = (message: string, code = 'forbidden') => new HttpError(403, code, message)
export const notFound = (message = 'Not found.') => new HttpError(404, 'not_found', message)
export const conflict = (message: string, code = 'conflict') => new HttpError(409, code, message)
export const tooManyRequests = (message: string) => new HttpError(429, 'rate_limited', message)

export function json(data: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers)
  headers.set('content-type', 'application/json')
  headers.set('cache-control', 'no-store')
  return new Response(JSON.stringify(data), { ...init, headers })
}

/** Wraps a route so thrown HttpErrors become JSON responses and anything else is a logged 500 */
export function route(handler: (context: APIContext) => Promise<Response>): APIRoute {
  return async (context) => {
    try {
      return await handler(context)
    } catch (error) {
      if (error instanceof HttpError) {
        return json({ error: error.code, message: error.message }, { status: error.status })
      }
      console.error(error)
      return json(
        { error: 'internal', message: 'Something went wrong. Try again.' },
        { status: 500 },
      )
    }
  }
}

export async function readBody<T>(
  request: Request,
  schema: { safeParse(value: unknown): { success: true; data: T } | { success: false } },
): Promise<T> {
  const value = await request.json().catch(() => undefined)
  const result = schema.safeParse(value)
  if (!result.success) throw badRequest('Check the details and try again.')
  return result.data
}
