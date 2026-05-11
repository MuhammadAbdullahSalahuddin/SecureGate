import { encryptCredential } from "../lib/vault/vault.service";
import { Pool } from "pg";

const pool = new Pool({
  host: "postgres",
  database: "securegate",
  user: "admin",
  password: process.env.GUARDIAN_DB_PASS,
});

async function seedVault() {
  const creds = {
    username: "pamuser", // SSH user on Laptop 1
    password: "1234Admin", // SSH password — update to match your actual setup
    dbUsername: "pam_db", // MySQL user on Laptop 1 (least-privilege)
    dbPassword: "PamDb$ecure1", // MySQL password — update to match
    dbName: "corp_data", // Optional: auto-select this DB on login
  };

  const blob = encryptCredential(creds);

  await pool.query(
    `INSERT INTO asset_credentials (asset_id, encrypted_blob, iv, auth_tag)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (asset_id) DO UPDATE
       SET encrypted_blob = EXCLUDED.encrypted_blob,
           iv             = EXCLUDED.iv,
           auth_tag       = EXCLUDED.auth_tag`,
    [
      "00000000-0000-0000-0000-000000000001",
      blob.encryptedBlob,
      blob.iv,
      blob.authTag,
    ],
  );
  console.log("Vault seeded. Blob length:", blob.encryptedBlob.length, "bytes");
  await pool.end();
}

seedVault().catch((err) => {
  console.error("Vault seed failed:", err.message);
  process.exit(1);
});
