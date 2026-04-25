import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/rbac";
import { redis } from "@/lib/redis";
import { pool } from "@/lib/db";
import { randomBytes } from "crypto";

export async function POST(request: NextRequest) {
  // 1. Only ADMIN and OPERATOR can request sessions
  const auth = await requireRole(request, ["ADMIN", "OPERATOR"]);
  if (auth instanceof NextResponse) return auth;

  const body = await request.json();
  const { assetId } = body;

  if (!assetId) {
    return NextResponse.json(
      { message: "assetId is required" },
      { status: 400 },
    );
  }

  // 2. Confirm this role actually has a policy for this asset
  const policy = await pool.query(
    `SELECT ap.max_session_seconds 
     FROM access_policies ap
     INNER JOIN roles r ON ap.role_id = r.id
     WHERE r.name = $1 AND ap.asset_id = $2`,
    [auth.role, assetId],
  );

  if (policy.rows.length === 0) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  // 3. Generate a one-time ticket
  const ticket = randomBytes(32).toString("hex"); // 64 char random string

  // 4. Store in Redis — expires in 60 seconds automatically
  // Format: ticket:{uuid} → "userId:assetId"
  await redis.setex(`ticket:${ticket}`, 60, `${auth.userId}:${assetId}`);

  // 5. Return ticket to frontend — it has 60 seconds to connect
  return NextResponse.json({
    ticket,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    maxSessionSeconds: policy.rows[0].max_session_seconds,
  });
}
