import { usePrivy } from '@privy-io/react-auth'
import { useCallback } from 'react'

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message)
  }
}

type ApiFetch = <T>(
  path: string,
  init?: Omit<RequestInit, 'body'> & { body?: unknown },
) => Promise<T>

/** Calls our API routes with the Privy access token attached */
export function useApi(): ApiFetch {
  const { getAccessToken } = usePrivy()

  return useCallback<ApiFetch>(
    async (path, { body, ...init } = {}) => {
      const headers = new Headers(init.headers)
      const token = await getAccessToken()
      if (token) headers.set('authorization', `Bearer ${token}`)

      let payload: BodyInit | undefined
      if (body instanceof FormData) {
        payload = body
      } else if (body !== undefined) {
        headers.set('content-type', 'application/json')
        payload = JSON.stringify(body)
      }

      const response = await fetch(path, { ...init, headers, body: payload })
      const data = await response.json().catch(() => null)
      if (!response.ok) {
        throw new ApiError(
          response.status,
          data?.error ?? 'error',
          data?.message ?? 'Something went wrong. Try again.',
        )
      }
      return data
    },
    [getAccessToken],
  )
}

export function errorMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : 'Something went wrong. Try again.'
}
