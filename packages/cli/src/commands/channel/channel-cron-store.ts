import * as path from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { Storage, atomicWriteJSON } from '@qwen-code/qwen-code-core';

/**
 * A durable, gateway-owned scheduled job: fire `prompt` into the routed channel
 * session on the `cron` schedule. Superset of core's DurableCronTask, adding the
 * routing target (incl. `cwd` — required so a cold-group fire lands in the right
 * workspace, not the gateway's process.cwd()) and circuit-breaker state.
 */
export interface ChannelCronJob {
  id: string;
  /** 5-field, parseCron-compatible expression. */
  cron: string;
  /** Owner-authored at create time (trusted input). */
  prompt: string;
  recurring: boolean;
  createdAt: number;
  lastFiredAt: number | null;
  /** Cached, deterministic per id/cron/recurring — avoids recompute on every arm(). */
  jitterMs: number;
  target: {
    channelName: string;
    /** DingTalk openConversationId / Telegram chatId / … */
    chatId: string;
    threadId?: string;
    /** Required to re-resolve 'user' scope; '__scheduler__' for thread/single. */
    senderId?: string;
    /** Workspace root — carried so cold-group fires route to the right cwd. */
    cwd: string;
  };
  /**
   * IANA timezone for the schedule; host-local when absent. Reserved now so the
   * on-disk schema needs no migration once cross-TZ/DST handling lands.
   */
  tz?: string;
  consecutiveFailures?: number;
  disabledAt?: number | null;
}

/** Global (not project-hashed): the gateway is one process; target fully identifies routing. */
export function scheduledJobsPath(): string {
  return path.join(
    Storage.getGlobalQwenDir(),
    'channels',
    'scheduled_jobs.json',
  );
}

function isValidJob(value: unknown): value is ChannelCronJob {
  if (typeof value !== 'object' || value === null) return false;
  const j = value as Record<string, unknown>;
  const t = j['target'];
  if (typeof t !== 'object' || t === null) return false;
  const target = t as Record<string, unknown>;
  return (
    typeof j['id'] === 'string' &&
    typeof j['cron'] === 'string' &&
    typeof j['prompt'] === 'string' &&
    typeof j['recurring'] === 'boolean' &&
    typeof j['createdAt'] === 'number' &&
    (j['lastFiredAt'] === null || typeof j['lastFiredAt'] === 'number') &&
    typeof j['jitterMs'] === 'number' &&
    typeof target['channelName'] === 'string' &&
    typeof target['chatId'] === 'string' &&
    typeof target['cwd'] === 'string'
  );
}

/**
 * Persistence for {@link ChannelCronJob}s. The scheduler's in-memory map is
 * authoritative; this loads at boot and rewrites the whole file on each
 * mutation/fire-stamp. A malformed file THROWS rather than silently emptying —
 * a silent empty would reconcile every job away on the next boot.
 */
export class ChannelCronStore {
  constructor(private readonly filePath: string) {}

  load(): ChannelCronJob[] {
    if (!existsSync(this.filePath)) return [];
    let raw: string;
    try {
      raw = readFileSync(this.filePath, 'utf-8');
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw err;
    }
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      throw new Error(`${this.filePath}: expected a JSON array of cron jobs`);
    }
    for (const entry of parsed) {
      if (!isValidJob(entry)) {
        throw new Error(`${this.filePath}: invalid cron job entry`);
      }
    }
    return parsed;
  }

  async save(jobs: ChannelCronJob[]): Promise<void> {
    await atomicWriteJSON(this.filePath, jobs, { noFollow: true });
  }
}
