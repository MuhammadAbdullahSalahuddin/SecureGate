import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify, importSPKI } from 'jose'

const PUBLIC_ROUTES = ['/login', '/api/auth/login', '/api/auth/refresh']

const formatPublicKey = (key: string): string => {
  if (key.includes('-----BEGIN')) return key
  return `-----BEGIN PUBLIC KEY-----\n${key}\n-----END PUBLIC KEY-----`
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Allow public routes through
  if (PUBLIC_ROUTES.some((r) => pathname.startsWith(r))) {
    return NextResponse.next()
  }

  // For API routes, the route handler does its own requireRole check
  // We only guard page routes here
  if (pathname.startsWith('/api/')) {
    return NextResponse.next()
  }

  // Check for the refreshToken cookie — if it exists, the user has a session
  // We don't verify it fully here (that's the API's job), just check presence
  // For a stronger check, verify the accessToken stored in a non-httpOnly cookie
  const refreshToken = request.cookies.get('refreshToken')?.value

  if (!refreshToken) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Optionally verify the refresh token signature at the edge
  try {
    const publicKeyStr = process.env.GUARDIAN_JWT_PUBLIC_KEY ?? ''
    const key = await importSPKI(formatPublicKey(publicKeyStr), 'RS256')
    await jwtVerify(refreshToken, key)
    return NextResponse.next()
  } catch {
    // Token expired or invalid — redirect to login
    const response = NextResponse.redirect(new URL('/login', request.url))
    response.cookies.delete('refreshToken')
    return response
  }
}

export const config = {
  matcher: ['/dashboard/:path*', '/terminal/:path*', '/replay/:path*'],
}