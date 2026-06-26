import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import type { DaemonClient } from '@qwen-code/sdk';
import type { SessionBridge, SessionRouter } from '@qwen-code/channel-base';
import {
  assertDaemonWorkspace,
  attachDaemonRecovery,
} from './daemon-hosting.js';

const caps = (workspaceCwd?: string) =>
  ({ capabilities: async () => ({ workspaceCwd }) }) as unknown as Pick<
    DaemonClient,
    'capabilities'
  >;

describe('assertDaemonWorkspace', () => {
  const opts = { baseUrl: 'http://127.0.0.1:4170' };

  it('passes when the daemon workspace matches the channel cwd', async () => {
    await expect(
      assertDaemonWorkspace(opts, '/work/repo', caps('/work/repo')),
    ).resolves.toBeUndefined();
  });

  it('passes across non-canonical but equivalent paths', async () => {
    await expect(
      assertDaemonWorkspace(opts, '/work/repo/', caps('/work/./repo')),
    ).resolves.toBeUndefined();
  });

  it('throws on a workspace mismatch', async () => {
    await expect(
      assertDaemonWorkspace(opts, '/work/repo', caps('/other')),
    ).rejects.toThrow(/does not match/);
  });

  it('throws when the daemon predates workspaceCwd support', async () => {
    await expect(
      assertDaemonWorkspace(opts, '/work/repo', caps(undefined)),
    ).rejects.toThrow(/predates workspaceCwd/);
  });
});

describe('attachDaemonRecovery', () => {
  function setup() {
    const bridge = new EventEmitter() as unknown as SessionBridge;
    const dropSession = vi.fn(() => true);
    const router = { dropSession } as unknown as SessionRouter;
    const logs: string[] = [];
    let shuttingDown = false;
    attachDaemonRecovery(bridge, router, {
      log: (m) => logs.push(m),
      isShuttingDown: () => shuttingDown,
    });
    return {
      bridge: bridge as unknown as EventEmitter,
      dropSession,
      logs,
      setShuttingDown: (v: boolean) => (shuttingDown = v),
    };
  }

  it('drops the died session from the router so it re-resolves fresh', () => {
    const { bridge, dropSession, logs } = setup();
    bridge.emit('sessionDied', { sessionId: 's7', reason: 'stream_ended' });
    expect(dropSession).toHaveBeenCalledWith('s7');
    expect(logs[0]).toContain('s7');
  });

  it('ignores a sessionDied without a sessionId', () => {
    const { bridge, dropSession } = setup();
    bridge.emit('sessionDied', {});
    expect(dropSession).not.toHaveBeenCalled();
  });

  it('is inert once shutting down', () => {
    const { bridge, dropSession, setShuttingDown } = setup();
    setShuttingDown(true);
    bridge.emit('sessionDied', { sessionId: 's7' });
    bridge.emit('error', new Error('boom'));
    expect(dropSession).not.toHaveBeenCalled();
  });

  it('logs transport errors without dropping anything', () => {
    const { bridge, dropSession, logs } = setup();
    bridge.emit('error', new Error('socket hang up'));
    expect(dropSession).not.toHaveBeenCalled();
    expect(logs[0]).toContain('socket hang up');
  });
});
