import { NextRequest, NextResponse } from "next/server";
import { generateAccessToken, verifyAccessToken } from "@/lib/auth";
import { pool } from "@/lib/db";

export async function POST(request: NextRequest) {
  try {
    // 1. Read the httpOnly cookie — the frontend never touches this directly
    const refreshToken = request.cookies.get("refreshToken")?.value;

    if (!refreshToken) {
      return NextResponse.json(
        { message: "No refresh token" },
        { status: 401 },
      );
    }

    // 2. Verify the refresh token signature and expiry
    const payload = await verifyAccessToken(refreshToken);

    // 3. Check it is actually a refresh token, not an access token being misused
    if (payload.type !== "refresh") {
      return NextResponse.json(
        { message: "Invalid token type" },
        { status: 401 },
      );
    }

    const userId = payload.userId as string;

    // 4. Look up the user — confirms account still exists and gets current role
    const result = await pool.query(
      `SELECT u.id, u.email, r.name as role
   FROM users u
   INNER JOIN user_roles ur ON ur.user_id = u.id
   INNER JOIN roles r ON r.id = ur.role_id
   WHERE u.id = $1`,
      [userId],
    );
    const user = result.rows[0];

    if (!user) {
      return NextResponse.json({ message: "User not found" }, { status: 401 });
    }

    // 5. Issue a fresh access token with current role (role may have changed)
    const accessToken = await generateAccessToken(
      user.id.toString(),
      user.role,
      user.email,
    );

    return NextResponse.json({ accessToken });
  } catch (error) {
    // Covers expired tokens, tampered signatures, any jose error
    console.error("Refresh Error:", error);
    return NextResponse.json(
      { message: "Invalid refresh token" },
      { status: 401 },
    );
  }
}
