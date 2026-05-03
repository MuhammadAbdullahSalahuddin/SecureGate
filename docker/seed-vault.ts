import { encryptCredential } from '../lib/vault/vault.service'
import { Pool } from 'pg'

const pool = new Pool({
  host: 'postgres',
  database: 'securegate',
  user: 'admin',
  password: process.env.GUARDIAN_DB_PASS,
})

async function seedVault() {
  // These are the SSH credentials for pamuser on Laptop 1
  const creds = {
    username: 'sys_admin',
    password: '1234Admin'
  }
  const blob = encryptCredential(creds)

  await pool.query(
    `INSERT INTO asset_credentials
       (asset_id, encrypted_blob, iv, auth_tag)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (asset_id) DO UPDATE
       SET encrypted_blob = EXCLUDED.encrypted_blob,
           iv             = EXCLUDED.iv,
           auth_tag       = EXCLUDED.auth_tag`,
    ['00000000-0000-0000-0000-000000000001', blob.encryptedBlob, blob.iv, blob.authTag]
  )
  console.log('Vault seeded successfully')
  console.log('Blob length:', blob.encryptedBlob.length, 'bytes')
  await pool.end()
}

seedVault().catch(err => {
  console.error('Vault seed failed:', err.message)
  process.exit(1)
})
