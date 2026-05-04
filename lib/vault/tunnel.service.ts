import { Client, ClientChannel } from 'ssh2'
import { Pool }                  from 'pg'
import { decryptCredential }     from './vault.service'
import { ITunnelService }        from '../shared/interfaces/vault.interface'

interface TunnelEntry {
  conn:    Client
  stream:  ClientChannel
  onData?: (data: string) => void
}

// Active SSH sessions — Map<sessionId → TunnelEntry>
const tunnels = new Map<string, TunnelEntry>()

const pool = new Pool({
  host:     'postgres',
  database: 'securegate',
  user:     'admin',
  password: process.env.GUARDIAN_DB_PASS,
})

export const tunnelService: ITunnelService = {

  async openTunnel(
    sessionId: string,
    assetId: number,
    cols: number,
    rows: number
  ): Promise<void> {
    // 1. Fetch encrypted credential blob from DB
    const { rows: dbRows } = await pool.query(
      `SELECT ac.encrypted_blob, ac.iv, ac.auth_tag, ta.hostname, ta.port
       FROM asset_credentials ac
       JOIN target_assets ta ON ta.id = ac.asset_id
       WHERE ac.asset_id = $1`,
      [assetId]
    )
    if (!dbRows[0]) throw new Error(`No credentials for asset ${assetId}`)

    const { encrypted_blob, iv, auth_tag, hostname, port } = dbRows[0]

    // 2. Decrypt — plaintext lives only in this local scope
    const plaintext = decryptCredential({
      encryptedBlob: encrypted_blob,
      iv,
      authTag: auth_tag,
    })

    // 3. Open SSH connection — credential used immediately
    await new Promise<void>((resolve, reject) => {
      const conn = new Client()

      conn.on('ready', () => {
        // 4. Request PTY shell with correct dimensions
        conn.shell(
          { term: 'xterm-256color', cols, rows },
          (err, stream) => {
            if (err) { conn.end(); return reject(err) }

            // 5. Store in Map — plaintext is now out of scope
            tunnels.set(sessionId, { conn, stream })

            // Wire up onData handler if already registered
            const entry = tunnels.get(sessionId)!
            stream.on('data', (chunk: Buffer) => {
              entry.onData?.(chunk.toString())
            })
            stream.stderr.on('data', (chunk: Buffer) => {
              entry.onData?.(chunk.toString())
            })

            stream.on('close', () => tunnelService.closeTunnel(sessionId))

            resolve()
          }
        )
      })

      conn.on('error', reject)

      // Connect — plaintext.password used here and immediately discarded
      conn.connect({
        host:     hostname,
        port:     port ?? 22,
        username: plaintext.username,
        password: plaintext.password,
        readyTimeout: 10000,
      })

      // Overwrite plaintext references (GC will collect)
      ;(plaintext as any).password = ''
      ;(plaintext as any).username = ''
    })
  },

  write(sessionId: string, data: string): void {
    tunnels.get(sessionId)?.stream.write(data)
  },

  resize(sessionId: string, cols: number, rows: number): void {
    tunnels.get(sessionId)?.stream.setWindow(rows, cols, 0, 0)
  },

  onData(sessionId: string, handler: (data: string) => void): void {
    const entry = tunnels.get(sessionId)
    if (entry) {
      entry.onData = handler
    }
  },

  closeTunnel(sessionId: string): void {
    const entry = tunnels.get(sessionId)
    if (!entry) return
    try {
      entry.stream.close()
      entry.conn.end()
    } catch {
      // Suppress errors on already-closed connections
    } finally {
      tunnels.delete(sessionId)
    }
  },
}
