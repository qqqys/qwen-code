import { DaemonClient } from '@qwen-code/sdk';
import type { PermissionResponse } from '@qwen-code/sdk';
import type { RequestPermissionResponse } from '@agentclientprotocol/sdk';
import type {
  DaemonChannelEvent,
  DaemonChannelSessionClient,
  DaemonChannelSessionFactory,
} from '@qwen-code/channel-base';

/**
 * Adapts the @qwen-code/sdk {@link DaemonClient} (HTTP/REST + SSE) to the
 * channel-base {@link DaemonChannelSessionClient} that {@link DaemonChannelBridge}
 * consumes — the connecting-client half of topology B (`qwen channel start
 * --daemon` runs as a separate process talking to a running `qwen serve`). One
 * adapter per hosted session over a shared DaemonClient.
 *
 * `lastEventId` tracks the newest streamed event id so a reconnect can resume
 * from where the SSE dropped (the bridge passes it back into `events()`).
 */
export class HttpSessionClient implements DaemonChannelSessionClient {
  /** Newest streamed event id — declared mutable; the interface exposes it readonly. */
  lastEventId?: number;

  constructor(
    private readonly client: DaemonClient,
    readonly sessionId: string,
    readonly workspaceCwd: string,
    private readonly clientId?: string,
  ) {}

  prompt(
    req: { prompt: Array<Record<string, unknown>> },
    signal?: AbortSignal,
  ): Promise<{ stopReason?: string; [key: string]: unknown }> {
    return this.client.prompt(
      this.sessionId,
      { prompt: req.prompt },
      signal,
      this.clientId,
    );
  }

  async *events(opts?: {
    signal?: AbortSignal;
    lastEventId?: number;
    resume?: boolean;
  }): AsyncGenerator<DaemonChannelEvent> {
    const stream = this.client.subscribeEvents(this.sessionId, {
      signal: opts?.signal,
      lastEventId: opts?.lastEventId ?? this.lastEventId,
    });
    for await (const ev of stream) {
      // Frames without an id (synthetic/terminal, e.g. stream_error) must not
      // pollute the resume cursor — DaemonEvent documents `id === undefined` there.
      if (ev.id !== undefined) this.lastEventId = ev.id;
      yield ev; // DaemonEvent is structurally a DaemonChannelEvent
    }
  }

  cancel(): Promise<void> {
    return this.client.cancel(this.sessionId, this.clientId);
  }

  setModel(modelId: string): Promise<Record<string, unknown>> {
    return this.client.setSessionModel(this.sessionId, modelId, this.clientId);
  }

  respondToPermission(
    requestId: string,
    response: RequestPermissionResponse,
  ): Promise<boolean> {
    return this.client.respondToPermission(
      requestId,
      response as unknown as PermissionResponse,
      this.clientId,
    );
  }

  shellCommand(
    command: string,
    signal?: AbortSignal,
  ): Promise<{ exitCode: number | null; output: string; aborted: boolean }> {
    return this.client.shellCommand(this.sessionId, command, {
      signal,
      clientId: this.clientId,
    });
  }
}

export interface DaemonSessionFactoryOptions {
  /** Daemon base URL, e.g. http://127.0.0.1:4170. */
  baseUrl: string;
  /** Bearer token; required for non-loopback daemon binds. */
  token?: string;
}

/**
 * Build a session factory over an explicit {@link DaemonClient} — the unit-test
 * seam. A request carrying `sessionId` restores (crash-recovery re-attach); one
 * without creates. Only `single`/`thread` scope is forwarded — the daemon
 * rejects `user`, which the start.ts cwd/scope guard already screens out.
 */
export function daemonSessionFactory(
  client: DaemonClient,
): DaemonChannelSessionFactory {
  return async (req) => {
    const scope =
      req.sessionScope === 'single' || req.sessionScope === 'thread'
        ? req.sessionScope
        : undefined;
    const session = req.sessionId
      ? await client.loadSession(req.sessionId, {
          workspaceCwd: req.workspaceCwd,
        })
      : await client.createOrAttachSession({
          workspaceCwd: req.workspaceCwd,
          modelServiceId: req.modelServiceId,
          sessionScope: scope,
        });
    return new HttpSessionClient(
      client,
      session.sessionId,
      session.workspaceCwd,
      session.clientId,
    );
  };
}

/** Session factory over a fresh DaemonClient for the given daemon endpoint. */
export function createDaemonSessionFactory(
  opts: DaemonSessionFactoryOptions,
): DaemonChannelSessionFactory {
  return daemonSessionFactory(
    new DaemonClient({ baseUrl: opts.baseUrl, token: opts.token }),
  );
}
