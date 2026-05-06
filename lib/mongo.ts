import { MongoClient, Db } from "mongodb";

// MongoDB connection URI — uses container name "mongo" as the hostname
// because all services share the guardian-net Docker network
const MONGO_URI =
  process.env.GUARDIAN_MONGO_URI ||
  "mongodb://admin:admin@mongo:27017/securegate_audit?authSource=admin";

let client: MongoClient | null = null;
let db: Db | null = null;

/**
 * Returns a connected MongoDB database instance.
 * Reuses the connection if already established (connection pooling).
 * Called lazily — only when the first audit event arrives.
 */
export async function getAuditDb(): Promise<Db> {
  if (db) return db;

  client = new MongoClient(MONGO_URI);
  await client.connect();
  db = client.db("securegate_audit");

  console.log("[MongoDB] Connected to securegate_audit");
  return db;
}
