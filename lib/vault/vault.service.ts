import crypto from 'crypto'

// Read Master Key once at startup — never from DB
const MASTER_KEY = Buffer.from(
  process.env.GUARDIAN_MASTER_KEY ?? '',
  'hex'
)

if (MASTER_KEY.length !== 32) {
  throw new Error(
    'GUARDIAN_MASTER_KEY must be a 32-byte hex string (64 hex chars). ' +
    `Got ${MASTER_KEY.length} bytes. Run: openssl rand -hex 32`
  )
}

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12   // 96-bit nonce — GCM standard
const TAG_LENGTH = 16  // 128-bit auth tag

export interface EncryptedBlob {
  encryptedBlob: Buffer
  iv: Buffer
  authTag: Buffer
}

/**
 * Encrypt plaintext JSON credentials.
 * A fresh 12-byte IV is generated on every call — same plaintext
 * encrypted twice produces completely different ciphertext.
 */
export function encryptCredential(
  plaintext: { username: string; password: string }
): EncryptedBlob {
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv(ALGORITHM, MASTER_KEY, iv)
  cipher.setAAD(Buffer.from('securegate-pam')) // additional auth data

  const json = JSON.stringify(plaintext)
  const encrypted = Buffer.concat([
    cipher.update(json, 'utf8'),
    cipher.final()
  ])
  const authTag = cipher.getAuthTag()

  return { encryptedBlob: encrypted, iv, authTag }
}

/**
 * Decrypt and verify a stored credential blob.
 * Throws if the ciphertext has been tampered with (authTag mismatch).
 * NEVER log the return value.
 */
export function decryptCredential(
  blob: EncryptedBlob
): { username: string; password: string } {
  const decipher = crypto.createDecipheriv(
    ALGORITHM, MASTER_KEY, blob.iv
  )
  decipher.setAuthTag(blob.authTag)
  decipher.setAAD(Buffer.from('securegate-pam'))

  const decrypted = Buffer.concat([
    decipher.update(blob.encryptedBlob),
    decipher.final()           // throws if authTag fails
  ])

  return JSON.parse(decrypted.toString('utf8'))
}
