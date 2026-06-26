import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { ChannelCronStore, type ChannelCronJob } from './channel-cron-store.js';

function job(over: Partial<ChannelCronJob> = {}): ChannelCronJob {
  return {
    id: 'abc12345',
    cron: '0 9 * * 1',
    prompt: 'weekly digest',
    recurring: true,
    createdAt: 1000,
    lastFiredAt: null,
    jitterMs: 0,
    target: { channelName: 'dingtalk', chatId: 'cid1', cwd: '/work' },
    ...over,
  };
}

describe('ChannelCronStore', () => {
  let dir: string;
  let file: string;
  let store: ChannelCronStore;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'cronstore-'));
    file = path.join(dir, 'scheduled_jobs.json');
    store = new ChannelCronStore(file);
  });

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('returns [] when the file does not exist', () => {
    expect(store.load()).toEqual([]);
  });

  it('round-trips saved jobs', async () => {
    const jobs = [job(), job({ id: 'def67890', recurring: false })];
    await store.save(jobs);
    expect(store.load()).toEqual(jobs);
  });

  it('throws on a non-array file (never silently empties)', () => {
    writeFileSync(file, JSON.stringify({ not: 'an array' }));
    expect(() => store.load()).toThrow();
  });

  it('throws on an invalid job entry', () => {
    writeFileSync(file, JSON.stringify([{ id: 'x', cron: '* * * * *' }]));
    expect(() => store.load()).toThrow();
  });
});
