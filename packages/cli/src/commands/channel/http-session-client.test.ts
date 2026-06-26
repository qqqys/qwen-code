import { describe, it, expect, vi } from 'vitest';
import type { DaemonClient } from '@qwen-code/sdk';
import {
  HttpSessionClient,
  daemonSessionFactory,
} from './http-session-client.js';

type Ev = { v: 1; type: string; data: unknown; id?: number };

function fakeClient(over: Partial<Record<string, unknown>> = {}) {
  return {
    createOrAttachSession: vi.fn(async (req: { workspaceCwd?: string }) => ({
      sessionId: 's1',
      workspaceCwd: req.workspaceCwd ?? '/w',
      clientId: 'c1',
      attached: false,
    })),
    loadSession: vi.fn(
      async (sessionId: string, req?: { workspaceCwd?: string }) => ({
        sessionId,
        workspaceCwd: req?.workspaceCwd ?? '/w',
        clientId: 'c1',
      }),
    ),
    prompt: vi.fn(async () => ({ stopReason: 'end_turn' })),
    cancel: vi.fn(async () => undefined),
    setSessionModel: vi.fn(async () => ({ ok: true })),
    respondToPermission: vi.fn(async () => true),
    shellCommand: vi.fn(async () => ({
      exitCode: 0,
      output: 'ok',
      aborted: false,
    })),
    subscribeEvents: vi.fn(async function* (): AsyncGenerator<Ev> {
      yield { v: 1, type: 'textChunk', data: {}, id: 1 };
    }),
    ...over,
  };
}

const asClient = (f: ReturnType<typeof fakeClient>) =>
  f as unknown as DaemonClient;

describe('daemonSessionFactory', () => {
  it('creates a session when the request carries no sessionId', async () => {
    const f = fakeClient();
    const factory = daemonSessionFactory(asClient(f));
    const session = await factory({
      workspaceCwd: '/w',
      modelServiceId: 'm1',
      sessionScope: 'thread',
    });
    expect(f.createOrAttachSession).toHaveBeenCalledWith({
      workspaceCwd: '/w',
      modelServiceId: 'm1',
      sessionScope: 'thread',
    });
    expect(f.loadSession).not.toHaveBeenCalled();
    expect(session.sessionId).toBe('s1');
    expect(session.workspaceCwd).toBe('/w');
  });

  it('restores when the request carries a sessionId', async () => {
    const f = fakeClient();
    const factory = daemonSessionFactory(asClient(f));
    const session = await factory({ workspaceCwd: '/w', sessionId: 'old-1' });
    expect(f.loadSession).toHaveBeenCalledWith('old-1', { workspaceCwd: '/w' });
    expect(f.createOrAttachSession).not.toHaveBeenCalled();
    expect(session.sessionId).toBe('old-1');
  });

  it('drops a user scope the daemon would reject (forwards only single/thread)', async () => {
    const f = fakeClient();
    const factory = daemonSessionFactory(asClient(f));
    await factory({ workspaceCwd: '/w', sessionScope: 'user' });
    expect(f.createOrAttachSession).toHaveBeenCalledWith(
      expect.objectContaining({ sessionScope: undefined }),
    );
  });
});

describe('HttpSessionClient', () => {
  it('forwards prompt with the session id + client id and returns the result', async () => {
    const f = fakeClient();
    const c = new HttpSessionClient(asClient(f), 's1', '/w', 'c1');
    const signal = new AbortController().signal;
    const res = await c.prompt(
      { prompt: [{ type: 'text', text: 'hi' }] },
      signal,
    );
    expect(f.prompt).toHaveBeenCalledWith(
      's1',
      { prompt: [{ type: 'text', text: 'hi' }] },
      signal,
      'c1',
    );
    expect(res.stopReason).toBe('end_turn');
  });

  it('tracks lastEventId across the stream, skipping id-less frames', async () => {
    const f = fakeClient({
      subscribeEvents: vi.fn(async function* (): AsyncGenerator<Ev> {
        yield { v: 1, type: 'a', data: {}, id: 1 };
        yield { v: 1, type: 'stream_error', data: {} }; // no id — must not advance cursor
        yield { v: 1, type: 'b', data: {}, id: 3 };
      }),
    });
    const c = new HttpSessionClient(asClient(f), 's1', '/w');
    const seen: string[] = [];
    for await (const ev of c.events()) seen.push(ev.type);
    expect(seen).toEqual(['a', 'stream_error', 'b']);
    expect(c.lastEventId).toBe(3);

    // A subsequent subscribe resumes from the tracked cursor.
    for await (const _ of c.events()) break;
    expect(f.subscribeEvents).toHaveBeenLastCalledWith(
      's1',
      expect.objectContaining({ lastEventId: 3 }),
    );
  });

  it('forwards cancel / setModel / respondToPermission / shellCommand', async () => {
    const f = fakeClient();
    const c = new HttpSessionClient(asClient(f), 's1', '/w', 'c1');
    await c.cancel();
    expect(f.cancel).toHaveBeenCalledWith('s1', 'c1');
    await c.setModel('gpt');
    expect(f.setSessionModel).toHaveBeenCalledWith('s1', 'gpt', 'c1');
    await c.respondToPermission('req9', {
      outcome: { outcome: 'selected', optionId: 'allow' },
    });
    expect(f.respondToPermission).toHaveBeenCalledWith(
      'req9',
      { outcome: { outcome: 'selected', optionId: 'allow' } },
      'c1',
    );
    await c.shellCommand('ls');
    expect(f.shellCommand).toHaveBeenCalledWith('s1', 'ls', {
      signal: undefined,
      clientId: 'c1',
    });
  });
});
