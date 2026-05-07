// This runs in the browser only
export async function fetchWithAuth(
  url: string,
  options: RequestInit = {},
  accessToken: string | null
): Promise<Response> {
  const res = await fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
  })
  return res
}

// Call this on app mount to silently restore the session
// The refreshToken httpOnly cookie is sent automatically by the browser
export async function silentRefresh(): Promise<{
  accessToken: string
  role: string
  email: string
} | null> {
  try {
    const res = await fetch('/api/auth/refresh', { method: 'POST' })
    if (!res.ok) return null
    const data = await res.json()

    // Decode the JWT payload to get role and email
    // JWT is: base64Header.base64Payload.signature
    const payload = JSON.parse(atob(data.accessToken.split('.')[1]))
    return {
      accessToken: data.accessToken,
      role: payload.role,
      email: payload.email,
    }
  } catch {
    return null
  }
}