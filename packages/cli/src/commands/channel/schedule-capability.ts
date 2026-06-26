import {
  computeNextFireMs,
  humanReadableCron,
} from '@qwen-code/qwen-code-core';
import type {
  ScheduleCapability,
  ScheduledJobView,
} from '@qwen-code/channel-base';
import type { ChannelCronScheduler } from './channel-cron-scheduler.js';
import type { ChannelCronJob } from './channel-cron-store.js';

function toView(job: ChannelCronJob): ScheduledJobView {
  const anchor = job.lastFiredAt ?? job.createdAt;
  return {
    id: job.id,
    cron: job.cron,
    humanReadable: humanReadableCron(job.cron),
    prompt: job.prompt,
    recurring: job.recurring,
    nextFireMs: computeNextFireMs(job.cron, anchor, job.jitterMs),
  };
}

/**
 * Adapt the gateway {@link ChannelCronScheduler} to the channel-side
 * {@link ScheduleCapability} (the `/schedule` command's DI seam). Late-bound via
 * a getter because channels are constructed before the scheduler in start.ts;
 * by the time a `/schedule` arrives the scheduler is always set.
 */
export function createScheduleCapability(
  getScheduler: () => ChannelCronScheduler | undefined,
): ScheduleCapability {
  const need = (): ChannelCronScheduler => {
    const s = getScheduler();
    if (!s) throw new Error('scheduler not ready');
    return s;
  };
  return {
    async create(target, cron, prompt, recurring) {
      return toView(
        await need().createForTarget(target, cron, prompt, recurring),
      );
    },
    list(target) {
      return need().listForTarget(target).map(toView);
    },
    remove(target, id) {
      return need().removeForTarget(target, id);
    },
  };
}
