/**
 * Routing identity for a standing instruction, built from an Envelope at capture
 * time — NOT a resolved sessionId — so the schedule survives `/clear`; the
 * gateway re-resolves the session at fire time. Structurally a SessionTarget
 * plus the workspace cwd (so a cold-group fire lands in the channel's workspace).
 */
export interface ScheduleTarget {
  channelName: string;
  chatId: string;
  threadId?: string;
  senderId?: string;
  cwd: string;
}

/** A persisted standing instruction, shaped for `/schedule list` display. */
export interface ScheduledJobView {
  id: string;
  cron: string;
  /** humanReadableCron(cron) — e.g. "every day at 09:00". */
  humanReadable: string;
  prompt: string;
  recurring: boolean;
  /** Next fire (epoch ms), or null if the parser finds no match. */
  nextFireMs: number | null;
}

/**
 * In-channel scheduling surface, injected via {@link ChannelBaseOptions} (like
 * `router`). Implemented in the cli package over the gateway cron scheduler so
 * cron/store knowledge stays out of channel-base (which has no core dependency).
 */
export interface ScheduleCapability {
  /** Validate + persist a standing instruction. Throws a user-safe Error on bad cron or cap. */
  create(
    target: ScheduleTarget,
    cron: string,
    prompt: string,
    recurring: boolean,
  ): Promise<ScheduledJobView>;
  /** Jobs scoped to this target's routing key (thread/single = the whole group). */
  list(target: ScheduleTarget): ScheduledJobView[];
  /** Remove by id iff it belongs to this target's routing scope. */
  remove(target: ScheduleTarget, id: string): Promise<boolean>;
}
