import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/rbac";
import { pool } from "@/lib/db";
import bcrypt from "bcrypt";
import { z } from "zod";

const CreateUserSchema = z.object({
  email: z.string().email().max(255).toLowerCase(),
  password: z
    .string()
    .min(12)
    .max(128)
    .regex(/[A-Z]/, "Needs uppercase")
    .regex(/[a-z]/, "Needs lowercase")
    .regex(/[0-9]/, "Needs number")
    .regex(/[^A-Za-z0-9]/, "Needs special character"),
  role: z.enum(["ADMIN", "OPERATOR", "AUDITOR"]),
});

export async function GET(request: NextRequest) {
  const auth = await requireRole(request, ["ADMIN"]);
  if (auth instanceof NextResponse) return auth;

  const result = await pool.query(
    `SELECT u.id, u.email, u.created_at, r.name AS role
     FROM users u
     INNER JOIN user_roles ur ON ur.user_id = u.id
     INNER JOIN roles r       ON r.id = ur.role_id
     ORDER BY u.created_at DESC`,
  );
  return NextResponse.json({ users: result.rows });
}

export async function POST(request: NextRequest) {
  const auth = await requireRole(request, ["ADMIN"]);
  if (auth instanceof NextResponse) return auth;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
  }

  const parsed = CreateUserSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        message: "Validation failed",
        errors: parsed.error.flatten().fieldErrors,
      },
      { status: 400 },
    );
  }

  const { email, password, role } = parsed.data;
  const passwordHash = await bcrypt.hash(password, 12);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const userResult = await client.query(
      `INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email, created_at`,
      [email, passwordHash],
    );
    await client.query(
      `INSERT INTO user_roles (user_id, role_id) SELECT $1, id FROM roles WHERE name = $2`,
      [userResult.rows[0].id, role],
    );
    await client.query("COMMIT");
    return NextResponse.json(
      { message: "User created", user: { ...userResult.rows[0], role } },
      { status: 201 },
    );
  } catch (err: any) {
    await client.query("ROLLBACK");
    if (err.code === "23505")
      return NextResponse.json(
        { message: "Email already exists" },
        { status: 409 },
      );
    console.error("[Admin] Create user error:", err);
    return NextResponse.json(
      { message: "Failed to create user" },
      { status: 500 },
    );
  } finally {
    client.release();
  }
}
