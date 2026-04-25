import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/rbac";
import { pool } from "@/lib/db";

export async function GET(request: NextRequest) {
  // 1. Guard — ADMIN and OPERATOR can view assets, AUDITOR cannot request sessions
  //    but can see assets for context. All three roles allowed here.
  const auth = await requireRole(request, ["ADMIN", "OPERATOR", "AUDITOR"]);
  if (auth instanceof NextResponse) return auth;

  // 2. Fetch only assets this role has a policy for
  const result = await pool.query(
    `SELECT 
      ta.id,
      ta.name,
      ta.hostname,
      ta.port,
      ta.db_type,
      ap.max_session_seconds
     FROM target_assets ta
     INNER JOIN access_policies ap ON ap.asset_id = ta.id
     INNER JOIN roles r ON r.id = ap.role_id
     WHERE r.name = $1`,
    [auth.role],
  );

  // 3. Return filtered list — no credentials, no internal fields
  return NextResponse.json({ assets: result.rows });
}
