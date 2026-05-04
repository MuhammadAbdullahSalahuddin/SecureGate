export interface ITunnelService {
  /**
   * Decrypt credentials and open SSH connection + PTY shell.
   * Called by Member 2's WebSocket gateway when a session starts.
   * @param sessionId  — unique identifier for this session
   * @param assetId    — the target_assets row to connect to
   * @param cols       — terminal width from xterm.js FitAddon
   * @param rows       — terminal height from xterm.js FitAddon
   */
  openTunnel(
    sessionId: string,
    assetId: number,
    cols: number,
    rows: number
  ): Promise<void>

  /**
   * Send keystrokes to the live SSH stream.
   * @param sessionId — must match a session opened by openTunnel
   * @param data      — raw bytes from xterm.js
   */
  write(sessionId: string, data: string): void

  /**
   * Notify the remote PTY of new terminal dimensions.
   * Must be called whenever the browser window resizes.
   */
  resize(sessionId: string, cols: number, rows: number): void

  /**
   * Register a callback for SSH stdout/stderr data.
   * Called once after openTunnel resolves.
   * @param handler — called with raw bytes to write to xterm.js
   */
  onData(sessionId: string, handler: (data: string) => void): void

  /**
   * Tear down the SSH connection and free all resources.
   * Called on session expiry, user disconnect, or admin revocation.
   */
  closeTunnel(sessionId: string): void
}


