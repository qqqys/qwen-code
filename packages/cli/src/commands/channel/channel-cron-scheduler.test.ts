import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { SessionRouter } from '@qwen-code/channel-base';
import {
  ChannelCronScheduler,
  createProactiveFire,
  type ProactiveFire,
} from './channel-cron-scheduler.js';
import type { ChannelCronJob, ChannelCronStore } from './channel-cron-store.js';

// `* * * * *` (every minute) matches regardless of timezone, keeping the
// fake-timer assertions deterministic across CI locales.
const T0 = new Date('2026-06-26T12:00:00.000Z').getTime();
const MIN = 60_000;

function job(over: Partial<ChannelCronJob> = {}): ChannelCronJob {
  return {
    id: 'job00001',
    cron: '* * * * *',
    prompt: 'ping',
    recurring: true,
    createdAt: T0,
    lastFiredAt: null,
    jitterMs: 0,
    target: {
      channelName: 'dingtalk',
      chatId: 'cid',
      cwd: '/work',
      senderId: '__scheduler__',
    },
    ...over,
  };
}

/** In-memory store; records every persisted snapshot for assertions. */
class FakeStore {
  saved: ChannelCronJob[][] = [];
  constructor(private readonly initial: ChannelCronJob[] = []) {}
  load(): ChannelCronJob[] {
    return this.initial.map((j) => structuredClone(j));
  }
  async save(jobs: ChannelCronJob[]): Promise<void> {
    this.saved.push(structuredClone(jobs));
  }
  last(): ChannelCronJob[] | undefined {
    return this.saved.at(-1);
  }
}

const asStore = (s: FakeStore) => s as unknown as ChannelCronStore;
const noRouter = {} as unknown as SessionRouter;

/** Flush settled promises (settle → persist) without advancing wall-clock. */
const flush = () => vi.advanceTimersByTimeAsync(1);

describe('ChannelCronScheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('fires a due recurring job with no human message', async () => {
    const onFire = vi.fn<ProactiveFire>().mockResolvedValue();
    const store = new FakeStore([job()]);
    const s = new ChannelCronScheduler(asStore(store), noRouter, onFire);
    await s.start();
    expect(onFire).not.toHaveBeenCalled(); // not yet due at T0

    await vi.advanceTimersByTimeAsync(MIN);
    expect(onFire).toHaveBeenCalledTimes(1);
    expect(onFire.mock.calls[0]![0].id).toBe('job00001');
    s.stop();
  });

  it('catch-up collapses many missed slots into a single fire', async () => {
    const onFire = vi.fn<ProactiveFire>().mockResolvedValue();
    // Overdue by ~3h on an every-minute schedule (≈180 missed slots).
    const store = new FakeStore([
      job({ lastFiredAt: T0 - 3 * 60 * MIN, createdAt: T0 - 4 * 60 * MIN }),
    ]);
    const s = new ChannelCronScheduler(asStore(store), noRouter, onFire);
    await s.start();
    await flush();

    expect(onFire).toHaveBeenCalledTimes(1); // one catch-up, not 180
    // Stamped to the current minute so older slots are suppressed.
    expect(store.last()![0].lastFiredAt).toBe(T0);
    s.stop();
  });

  it('fires a one-shot missed within the staleness window, then deletes it', async () => {
    const onFire = vi.fn<ProactiveFire>().mockResolvedValue();
    const store = new FakeStore([
      job({ recurring: false, createdAt: T0 - 30 * MIN }),
    ]);
    const s = new ChannelCronScheduler(asStore(store), noRouter, onFire);
    await s.start();
    await flush();

    expect(onFire).toHaveBeenCalledTimes(1);
    expect(store.last()).toEqual([]); // consumed after firing
    s.stop();
  });

  it('drops a one-shot missed beyond the staleness window without firing', async () => {
    const onFire = vi.fn<ProactiveFire>().mockResolvedValue();
    const store = new FakeStore([
      job({ recurring: false, createdAt: T0 - 2 * 60 * MIN }),
    ]);
    const s = new ChannelCronScheduler(asStore(store), noRouter, onFire);
    await s.start();
    await flush();

    expect(onFire).not.toHaveBeenCalled();
    expect(store.last()).toEqual([]); // dropped
    s.stop();
  });

  it('disables a job after 3 consecutive failures and never hot-loops', async () => {
    const onFire = vi.fn<ProactiveFire>().mockRejectedValue(new Error('down'));
    const store = new FakeStore([job()]);
    const s = new ChannelCronScheduler(asStore(store), noRouter, onFire);
    await s.start();

    await vi.advanceTimersByTimeAsync(MIN); // slot 1 → fail (cf=1)
    expect(onFire).toHaveBeenCalledTimes(1);

    // A single transient failure must NOT keep re-firing within the same
    // minute — lastFiredAt was stamped, so nothing fires until the next slot.
    await vi.advanceTimersByTimeAsync(MIN - 1);
    expect(onFire).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1); // slot 2 → fail (cf=2)
    expect(onFire).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(MIN); // slot 3 → fail (cf=3 → disabled)
    expect(onFire).toHaveBeenCalledTimes(3);

    expect(store.last()![0].disabledAt).toBeTruthy();

    await vi.advanceTimersByTimeAsync(5 * MIN); // disabled → no further fires
    expect(onFire).toHaveBeenCalledTimes(3);
    s.stop();
  });

  it('does not re-fire a job whose dispatch is still in flight', async () => {
    let release: () => void = () => {};
    const onFire = vi
      .fn<ProactiveFire>()
      .mockImplementation(() => new Promise<void>((r) => (release = r)));
    const store = new FakeStore([job()]);
    const s = new ChannelCronScheduler(asStore(store), noRouter, onFire);
    await s.start();

    await vi.advanceTimersByTimeAsync(MIN); // slot 1 dispatched, stays pending
    expect(onFire).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2 * MIN); // inFlight → skipped, no double-fire
    expect(onFire).toHaveBeenCalledTimes(1);

    release(); // settle; subsequent slots resume
    await flush();
    await vi.advanceTimersByTimeAsync(MIN);
    expect(onFire).toHaveBeenCalledTimes(2);
    s.stop();
  });

  describe('createForSession', () => {
    const makeRouter = (scope: 'thread' | 'single' | 'user') =>
      ({
        getTarget: (sid: string) =>
          sid === 'sess1'
            ? { channelName: 'dingtalk', senderId: 'u1', chatId: 'cid' }
            : undefined,
        getScope: () => scope,
        getCwd: (sid: string) =>
          sid === 'sess1' ? '/work/dingtalk' : undefined,
        keyForTarget: (t: { channelName: string; chatId: string }) =>
          `${t.channelName}:${t.chatId}`,
      }) as unknown as SessionRouter;

    it('rejects a user-scoped target (phantom per-user session)', async () => {
      const s = new ChannelCronScheduler(
        asStore(new FakeStore()),
        makeRouter('user'),
        vi.fn<ProactiveFire>(),
      );
      await s.start();
      await expect(
        s.createForSession('sess1', '* * * * *', 'hi', true),
      ).rejects.toThrow(/user-scoped/);
      s.stop();
    });

    it('rejects a cron that never matches', async () => {
      const s = new ChannelCronScheduler(
        asStore(new FakeStore()),
        makeRouter('thread'),
        vi.fn<ProactiveFire>(),
      );
      await s.start();
      await expect(
        s.createForSession('sess1', '0 0 30 2 *', 'hi', true),
      ).rejects.toThrow();
      s.stop();
    });

    it('persists a job carrying the session cwd and scheduler sentinel sender', async () => {
      const store = new FakeStore();
      const s = new ChannelCronScheduler(
        asStore(store),
        makeRouter('thread'),
        vi.fn<ProactiveFire>(),
      );
      await s.start();
      const created = await s.createForSession(
        'sess1',
        '* * * * *',
        'hi',
        true,
      );
      expect(created.target.cwd).toBe('/work/dingtalk');
      expect(created.target.senderId).toBe('__scheduler__');
      expect(store.last()).toHaveLength(1);
      s.stop();
    });
  });

  describe('createProactiveFire', () => {
    it('pins target.cwd so a cold-group fire lands in the channel workspace', async () => {
      const resolve = vi.fn().mockResolvedValue('sess-cold');
      const dispatchProactive = vi.fn().mockResolvedValue('done');
      const router = { resolve } as unknown as SessionRouter;
      const channels = new Map([['dingtalk', { dispatchProactive }]]);
      const fire = createProactiveFire(router, channels);

      await fire(
        job({
          prompt: 'digest',
          target: {
            channelName: 'dingtalk',
            chatId: 'cid',
            cwd: '/work/dingtalk',
          },
        }),
        T0,
      );

      expect(resolve).toHaveBeenCalledWith(
        'dingtalk',
        '__scheduler__',
        'cid',
        undefined,
        '/work/dingtalk', // the channel's cwd, NOT process.cwd()
      );
      expect(dispatchProactive).toHaveBeenCalledWith(
        'sess-cold',
        'cid',
        '[scheduled task] digest',
      );
    });

    it('throws when the target channel is unknown', async () => {
      const router = {
        resolve: vi.fn().mockResolvedValue('s'),
      } as unknown as SessionRouter;
      const fire = createProactiveFire(router, new Map());
      await expect(fire(job(), T0)).rejects.toThrow(/no channel/);
    });
  });
});
