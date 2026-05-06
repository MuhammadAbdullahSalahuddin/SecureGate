import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/rbac";
import { getAuditDb } from "@/lib/mongo";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  // Only ADMIN and AUDITOR can replay sessions
  // OPERATOR cannot replay — they can only see their session history (no keystroke detail)
  const auth = await requireRole(request, ["ADMIN", "AUDITOR"]);
  if (auth instanceof NextResponse) return auth;

  const sessionId = params.id;
  const db = await getAuditDb();

  // Fetch ALL events for this session, sorted by seqNum ASC.
  //
  // CRITICAL: We sort by seqNum, NOT by timestamp.
  // Events arrive at MongoDB in batches. A batch of 100 events written together
  // will have nearly identical timestamps — sorting by timestamp within a batch
  // would produce undefined ordering.
  //
  // seqNum was assigned in server.ts in the exact order events occurred.
  // Event 1 always happened before Event 2, regardless of DB write time.
  const events = await db
    .collection("audit_events")
    .find({ sessionId })
    .sort({ seqNum: 1 }) // Always seqNum, never timestamp
    .toArray();

  if (events.length === 0) {
    return NextResponse.json(
      { message: "Session not found or has no events" },
      { status: 404 },
    );
  }

  return NextResponse.json({ events, total: events.length });
}
