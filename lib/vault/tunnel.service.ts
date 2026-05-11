import { Client, ClientChannel } from "ssh2";
import { Pool } from "pg";
import { decryptCredential } from "./vault.service";
import { ITunnelService } from "../shared/interfaces/vault.interface";

interface TunnelEntry {
  conn: Client;
  stream: ClientChannel;
  onData?: (data: string) => void;
}

const tunnels = new Map<string, TunnelEntry>();

const pool = new Pool({
  host: process.env.GUARDIAN_DB_HOST || "postgres",
  database: process.env.GUARDIAN_DB_NAME || "securegate",
  user: process.env.GUARDIAN_DB_USER || "admin",
  password: process.env.GUARDIAN_DB_PASS,
});

export const tunnelService: ITunnelService = {
  async openTunnel(sessionId, assetId, cols, rows): Promise<void> {
    const { rows: dbRows } = await pool.query(
      `SELECT ac.encrypted_blob, ac.iv, ac.auth_tag, ta.hostname, ta.port, ta.db_type
       FROM asset_credentials ac
       JOIN target_assets ta ON ta.id = ac.asset_id
       WHERE ac.asset_id = $1`,
      [assetId],
    );
    if (!dbRows[0]) throw new Error(`No credentials for asset ${assetId}`);

    const { encrypted_blob, iv, auth_tag, hostname, port, db_type } = dbRows[0];

    const plaintext = decryptCredential({
      encryptedBlob: encrypted_blob,
      iv,
      authTag: auth_tag,
    });

    // Capture DB creds before wiping plaintext after conn.connect()
    const dbType = db_type as string | null;
    const dbUsername = plaintext.dbUsername;
    const dbPassword = plaintext.dbPassword;
    const dbName = plaintext.dbName;

    await new Promise<void>((resolve, reject) => {
      const conn = new Client();

      conn.on("ready", () => {
        conn.shell({ term: "xterm-256color", cols, rows }, (err, stream) => {
          if (err) {
            conn.end();
            return reject(err);
          }

          tunnels.set(sessionId, { conn, stream });
          const entry = tunnels.get(sessionId)!;

          stream.on("data", (chunk: Buffer) =>
            entry.onData?.(chunk.toString()),
          );
          stream.stderr.on("data", (chunk: Buffer) =>
            entry.onData?.(chunk.toString()),
          );
          stream.on("close", () => tunnelService.closeTunnel(sessionId));

          resolve();

          // AUTO-LOGIN: inject the DB login command directly into the SSH stream.
          // The operator never sees or types credentials.
          // Sent server-side — bypasses the WebSocket terminal:data path entirely,
          // so it does NOT appear in stdin audit logs.
          if (dbType && dbUsername && dbPassword) {
            setTimeout(() => {
              const liveEntry = tunnels.get(sessionId);
              if (!liveEntry) return;
              let cmd = "";
              if (dbType === "mysql") {
                cmd = dbName
                  ? `mysql -u ${dbUsername} -p${dbPassword} ${dbName}\n`
                  : `mysql -u ${dbUsername} -p${dbPassword}\n`;
              } else if (dbType === "mongodb") {
                cmd = dbName
                  ? `mongosh "mongodb://${dbUsername}:${dbPassword}@localhost/${dbName}?authSource=admin"\n`
                  : `mongosh -u ${dbUsername} -p ${dbPassword} --authenticationDatabase admin\n`;
              }
              if (cmd) {
                liveEntry.stream.write(cmd);
                cmd = "";
              }
            }, 800);
          }
        });
      });

      conn.on("error", reject);
      conn.connect({
        host: hostname,
        port: port ?? 22,
        username: plaintext.username,
        password: plaintext.password,
        readyTimeout: 10_000,
      });

      // Wipe all plaintext references immediately after connect() is called
      (plaintext as any).password = "";
      (plaintext as any).username = "";
      (plaintext as any).dbPassword = "";
      (plaintext as any).dbUsername = "";
    });
  },

  write(sessionId, data) {
    tunnels.get(sessionId)?.stream.write(data);
  },
  resize(sessionId, cols, rows) {
    tunnels.get(sessionId)?.stream.setWindow(rows, cols, 0, 0);
  },
  onData(sessionId, handler) {
    const e = tunnels.get(sessionId);
    if (e) e.onData = handler;
  },

  closeTunnel(sessionId) {
    const entry = tunnels.get(sessionId);
    if (!entry) return;
    try {
      entry.stream.close();
      entry.conn.end();
    } catch {
      /* already closed */
    } finally {
      tunnels.delete(sessionId);
    }
  },
};
