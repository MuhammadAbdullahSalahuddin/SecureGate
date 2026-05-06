import { getAuditDb } from "./mongo";
import { EventType } from "./shared/types/index";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AuditEvent {
  sessionId: string;
  userId: string;
  assetId: string;
  type: EventType;
  data?: string; // For stdin/stdout: raw bytes
  cols?: number; // For resize events
  rows?: number;
  seqNum: number; // Monotonically increasing per session — used for replay ordering
  timestamp: Date;
}

// ─── Per-session sequence counter ─────────────────────────────────────────────
// Maps sessionId → the next seqNum to assign
// This counter lives in memory and is the source of truth for event ordering.
// Database write order doesn't matter — we sort by seqNum at query time.
const seqCounters = new Map<string, number>();

function nextSeq(sessionId: string): number {
  const current = seqCounters.get(sessionId) ?? 0;
  seqCounters.set(sessionId, current + 1);
  return current;
}

// ─── Write buffer ─────────────────────────────────────────────────────────────
// In-memory array. Events accumulate here between flushes.
let buffer: AuditEvent[] = [];
const FLUSH_INTERVAL_MS = 500;
const FLUSH_BATCH_SIZE = 100;

/**
 * Add an event to the in-memory buffer.
 * seqNum is assigned here — in the exact order events arrive from the gateway.
 *
 * NEVER awaited on the proxy path — the SSH pipe must not wait for this.
 * Called with setImmediate() to defer until after the current I/O cycle.
 */
export function bufferAuditEvent(
  event: Omit<AuditEvent, "seqNum" | "timestamp">,
): void {
  // Assign seqNum immediately (synchronously) — ordering is captured here
  const seqNum = nextSeq(event.sessionId);
  const fullEvent: AuditEvent = {
    ...event,
    seqNum,
    timestamp: new Date(),
  };

  buffer.push(fullEvent);

  // If buffer is full, flush immediately (don't wait for the timer)
  if (buffer.length >= FLUSH_BATCH_SIZE) {
    setImmediate(() => flush());
  }
}

/**
 * Flush the buffer to MongoDB.
 * Uses insertMany with ordered:false — if one document fails,
 * the rest of the batch still gets written. For audit logging,
 * incomplete is always better than lost.
 */
async function flush(): Promise<void> {
  if (buffer.length === 0) return;

  // Snapshot and clear the buffer atomically
  // This prevents events that arrive during the async DB write
  // from being lost (they go into a fresh buffer)
  const batch = buffer;
  buffer = [];

  try {
    const db = await getAuditDb();
    await db.collection("audit_events").insertMany(batch, { ordered: false });
  } catch (err) {
    // Log but don't crash — audit failure must never take down the proxy
    console.error(`[AuditService] Flush error:`, err);
  }
}

/**
 * Force-flush all remaining buffered events right now.
 * Called at session end to ensure no events are lost when the session closes.
 */
export async function flushNow(): Promise<void> {
  await flush();
}

/**
 * Clean up the sequence counter for a session.
 * Called after closeTunnel to prevent memory leak from long-running servers.
 */
export function cleanupSession(sessionId: string): void {
  seqCounters.delete(sessionId);
}

// ─── Background flush timer ────────────────────────────────────────────────────
// Runs every 500ms for the lifetime of the server process.
// Even if no session is active, the timer is harmless (flush() returns early if buffer is empty).
setInterval(() => {
  if (buffer.length > 0) {
    flush().catch((err) =>
      console.error("[AuditService] Timer flush error:", err),
    );
  }
}, FLUSH_INTERVAL_MS);
