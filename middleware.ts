import { NextRequest, NextResponse } from "next/server";
import { jwtVerify, importSPKI, JWTPayload } from "jose";

const formatPublicKey = (key: string) =>
  key.includes("-----BEGIN")
    ? key
    : `-----BEGIN PUBLIC KEY-----\n${key}\n-----END PUBLIC KEY-----`;

export async function middleware(request: NextRequest) {
  const refreshToken = request.cookies.get("refreshToken")?.value;
  if (!refreshToken)
    return NextResponse.redirect(new URL("/login", request.url));

  let payload: JWTPayload;
  try {
    const key = await importSPKI(
      formatPublicKey(process.env.GUARDIAN_JWT_PUBLIC_KEY ?? ""),
      "RS256",
    );
    const result = await jwtVerify(refreshToken, key);
    payload = result.payload;
  } catch {
    const res = NextResponse.redirect(new URL("/login", request.url));
    res.cookies.delete("refreshToken");
    return res;
  }

  // /admin/* is ADMIN-only — defence in depth on top of the API's requireRole check
  if (request.nextUrl.pathname.startsWith("/admin/")) {
    if ((payload.role as string) !== "ADMIN")
      return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|__nextjs|favicon.ico|login).*)"],
};
