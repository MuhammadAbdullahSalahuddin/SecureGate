import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/rbac";
import { getAuditDb } from "@/lib/mongo";

export async function GET(request: NextRequest) {
  const auth = await requireRole(request, ["ADMIN", "AUDITOR", "OPERATOR"]);
  if (auth instanceof NextResponse) return auth;

  const db = await getAuditDb();

  const filter: Record<string, string> =
    auth.role === "OPERATOR" ? { userId: auth.userId } : {};

  const sessions = await db
    .collection("audit_events")
    .aggregate([
      {
        $match: {
          type: { $in: ["session_start", "session_end"] },
          ...filter,
        },
      },
      {
        $group: {
          _id: "$sessionId",
          sessionId: { $first: "$sessionId" },
          userId: { $first: "$userId" },
          assetId: { $first: "$assetId" },
          startedAt: {
            $min: {
              $cond: [{ $eq: ["$type", "session_start"] }, "$timestamp", null],
            },
          },
          endedAt: {
            $max: {
              $cond: [{ $eq: ["$type", "session_end"] }, "$timestamp", null],
            },
          },
        },
      },
      { $sort: { startedAt: -1 } },
      { $limit: 100 },
    ])
    .toArray();

  return NextResponse.json({ sessions });
}
