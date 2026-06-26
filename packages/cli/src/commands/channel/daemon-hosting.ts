import * as path from 'node:path';
import { DaemonClient } from '@qwen-code/sdk';
import type { SessionBridge, SessionRouter } from '@qwen-code/channel-base';
import type { DaemonSessionFactoryOptions } from './http-session-client.js';

/**
 * A single `qwen serve` daemon serves ONE bound workspace. Fail fast at startup
 * if a hosted channel's cwd doesn't match it, rather than letting the first
 * session creation 400 with `workspace_mismatch` mid-conversation.
 */
export async function assertDaemonWorkspace(
  opts: DaemonSessionFactoryOptions,
  channelCwd: string,
  client: Pick<DaemonClient, 'capabilities'> = new DaemonClient({
    baseUrl: opts.baseUrl,
    token: opts.token,
  }),
): Promise<void> {
  const caps = await client.capabilities();
  const bound = caps.workspaceCwd;
  if (!bound) {
    throw new Error(
      `Daemon at ${opts.baseUrl} predates workspaceCwd support — cannot verify ` +
        `the channel workspace. Upgrade qwen serve, or run without --daemon.`,
    );
  }
  if (path.resolve(bound) !== path.resolve(channelCwd)) {
    throw new Error(
      `Daemon workspace "${bound}" does not match channel cwd "${channelCwd}". ` +
        `A single daemon serves one workspace: start qwen serve in "${channelCwd}", ` +
        `or run this channel without --daemon.`,
    );
  }
}

/**
 * Crash recovery for the daemon bridge. Unlike AcpBridge (the whole child
 * process crashes → `disconnected` → rebuild the bridge), the daemon bridge has
 * no child: it emits a per-session `sessionDied` when that session's event
 * stream ends — a network drop, a daemon restart, or a real session death. Drop
 * the dead session from the router so the next message/fire re-resolves a fresh
 * one; this also covers a full daemon restart lazily, since every session
 * re-mints on its next activity. `error` frames are transport noise — log only.
 */
export function attachDaemonRecovery(
  bridge: Pick<SessionBridge, 'on'>,
  router: Pick<SessionRouter, 'dropSession'>,
  opts: { log: (msg: string) => void; isShuttingDown: () => boolean },
): void {
  bridge.on('sessionDied', (info: unknown) => {
    if (opts.isShuttingDown()) return;
    const sessionId = (info as { sessionId?: string } | undefined)?.sessionId;
    if (!sessionId) return;
    const dropped = router.dropSession(sessionId);
    opts.log(
      `daemon session ${sessionId} died${dropped ? ' — re-resolves on next activity' : ''}`,
    );
  });
  bridge.on('error', (err: unknown) => {
    if (opts.isShuttingDown()) return;
    opts.log(
      `daemon transport error: ${err instanceof Error ? err.message : String(err)}`,
    );
  });
}
