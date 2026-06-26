import type { EventEmitter } from 'node:events';
import type { AvailableCommand } from './AcpBridge.js';

/**
 * The agent-session transport ChannelBase drives. Abstracts whether the agent
 * runs as a spawned `--acp` child (AcpBridge) or inside the qwen serve daemon
 * (DaemonChannelBridge), so channels can be hosted on either without retyping.
 */
export interface SessionBridge extends EventEmitter {
  start(): Promise<void>;
  stop(): void;
  // Getters on both implementations — must be readonly properties, not methods.
  readonly isConnected: boolean;
  readonly availableCommands: AvailableCommand[];
  newSession(cwd: string): Promise<string>;
  loadSession(sessionId: string, cwd: string): Promise<string>;
  prompt(
    sessionId: string,
    text: string,
    options?: { imageBase64?: string; imageMimeType?: string },
  ): Promise<string>;
  cancelSession(sessionId: string): Promise<void>;
  /** Present only on DaemonChannelBridge; ChannelBase calls it via a guarded cast. */
  shellCommand?(
    sessionId: string,
    command: string,
    signal?: AbortSignal,
  ): Promise<{ exitCode: number | null; output: string; aborted: boolean }>;
}
