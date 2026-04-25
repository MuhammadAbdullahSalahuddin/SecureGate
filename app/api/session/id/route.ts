import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/rbac";
import { redis } from "@/lib/redis";

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  // Only ADMIN can revoke sessions
  const auth = await requireRole(request, ["ADMIN"]);
  if (auth instanceof NextResponse) return auth;

  const sessionId = params.id;

  // Delete the session key from Redis
  // The TTL poller in the WebSocket gateway will detect this within 30 seconds
  // and automatically close the SSH tunnel + disconnect the browser
  const deleted = await redis.del(`session:${sessionId}`);

  if (deleted === 0) {
    return NextResponse.json(
      { message: "Session not found or already expired" },
      { status: 404 },
    );
  }

  return NextResponse.json({ message: "Session revoked successfully" });
}
