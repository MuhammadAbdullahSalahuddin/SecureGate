import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/rbac";
import { pool } from "@/lib/db";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await requireRole(request, ["ADMIN"]);
  if (auth instanceof NextResponse) return auth;

  const targetId = params.id;
  if (!UUID_RE.test(targetId))
    return NextResponse.json({ message: "Invalid user ID" }, { status: 400 });

  if (targetId === auth.userId)
    return NextResponse.json(
      { message: "Cannot delete your own account" },
      { status: 403 },
    );

  const targetResult = await pool.query(
    `SELECT u.id, r.name AS role FROM users u
     INNER JOIN user_roles ur ON ur.user_id = u.id
     INNER JOIN roles r ON r.id = ur.role_id WHERE u.id = $1`,
    [targetId],
  );
  if (targetResult.rows.length === 0)
    return NextResponse.json({ message: "User not found" }, { status: 404 });

  if (targetResult.rows[0].role === "ADMIN") {
    const { rows } = await pool.query(
      `SELECT COUNT(*) AS count FROM user_roles ur
       INNER JOIN roles r ON r.id = ur.role_id WHERE r.name = 'ADMIN'`,
    );
    if (parseInt(rows[0].count, 10) <= 1)
      return NextResponse.json(
        { message: "Cannot delete the last administrator" },
        { status: 403 },
      );
  }

  const deleted = await pool.query(
    `DELETE FROM users WHERE id = $1 RETURNING id, email`,
    [targetId],
  );
  if (deleted.rows.length === 0)
    return NextResponse.json({ message: "User not found" }, { status: 404 });

  return NextResponse.json({
    message: "User deleted",
    deleted: deleted.rows[0],
  });
}
