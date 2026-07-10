# Daemon-Managed Channel Session Recovery

## Problem

`qwen serve --channel` runs platform adapters in a separate channel worker.
The worker currently creates its `SessionRouter` without a persistence path.
When the worker or daemon restarts, the mapping from a channel conversation to
its Qwen Code session ID is lost. The next group or thread message creates a
new session even when the original session transcript still exists on disk.

This differs from the expected channel behavior: a stable group or thread
should keep its agent context across a normal service restart.

## Goals

- Restore the same Qwen Code session for a channel route after a worker or
  daemon restart.
- Keep daemon-managed routes isolated from standalone channel routes and from
  routes belonging to other workspaces.
- On an individual restore failure, automatically create a replacement session
  and continue processing the inbound message.
- Preserve existing `/clear` semantics: clearing a route intentionally starts
  a fresh session on its next message.

## Non-goals

- Resuming an in-flight model turn interrupted by a restart.
- Adding daemon HTTP endpoints or changing the ACP protocol.
- Migrating routes after a channel name or workspace change.
- Changing the Qwen Code session JSONL format or session IDs.

## Prior Art

OpenClaw persists a durable conversation key and maps it to session metadata
and a transcript. For groups, the key includes the agent, channel, and stable
group identifier; topic-capable channels also include the topic/thread ID.
After a Gateway restart, an inbound message computes the same key and reloads
the stored session. Qwen Code will retain its existing `SessionRouter` route
model rather than introduce an OpenClaw-style Gateway session store in this
change.

## Route Identity and Storage

`SessionRouter` remains the authority for the route identity:

- `thread`: `channelName:threadId`, falling back to `channelName:chatId` when
  the platform has no thread ID.
- `user`: `channelName:senderId:chatId`.
- `single`: `channelName:__single__`.

The stored entry keeps the existing `sessionId`, `cwd`, and `SessionTarget`
payload. The persistence file is daemon-specific and is derived from the
canonical daemon workspace. It must not reuse the standalone channel
`~/.qwen/channels/sessions.json` file. This prevents collisions between
standalone and daemon-managed channels and between daemons for different
workspaces.

The configured channel name and canonical workspace are part of the storage
identity. Renaming a channel or changing its workspace intentionally creates a
new route; old mappings are not migrated automatically.

## Lifecycle

```text
worker starts
  -> create daemon bridge
  -> create SessionRouter with daemon route-store path
  -> restore saved routes through bridge.loadSession(sessionId, cwd)
  -> connect platform channels

inbound message
  -> derive route key
  -> use restored session, or create and persist a new session
```

`restoreSessions()` runs before platform channels connect. It reserves every
stored route while loading it, so an inbound message that arrives during
recovery waits for the load instead of creating a duplicate session.

Routine worker shutdown and daemon shutdown release channel connections and
clear in-memory state only. They retain the route-store file. Explicit route
clears, session-death cleanup, and failed restores remove only the affected
entry. A full deletion of the route store remains an explicit destructive
operation, not a normal lifecycle action.

## Failure Behavior

If `bridge.loadSession()` succeeds, the daemon reconstructs the existing Qwen
Code session from its persisted JSONL and the route retains its original
session ID.

If a saved session cannot be loaded (for example, its transcript was deleted
or archived), the router logs a sanitized route/session failure, drops that one
route-store entry, and allows the inbound message to create a replacement
session. The user receives a normal response; the channel does not expose a
recovery warning by default. Other routes continue restoring independently.

An in-flight prompt may be interrupted by a restart. The design only guarantees
that later messages recover the conversation session when its transcript is
available.

## Implementation Boundaries

| Area                                                 | Change                                                                                                                              |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `packages/cli/src/commands/channel/daemon-worker.ts` | Construct a persistent router, restore it before connecting channels, and retain its store on normal close.                         |
| `packages/cli/src/commands/channel/runtime.ts`       | Provide the daemon-specific, workspace-isolated route-store path.                                                                   |
| `packages/channels/base/src/SessionRouter.ts`        | Separate in-memory disposal from destructive `clearAll()` persistence deletion. Reuse existing per-route removal and restore logic. |
| Tests                                                | Cover daemon worker restart recovery, per-route restore fallback, explicit clear, store isolation, and concurrent inbound recovery. |

No daemon routes, ACP methods, session-file formats, or platform adapter APIs
change in this design.

## Acceptance Criteria

1. After a daemon or worker restart, a message for the same configured
   `thread` route loads and uses the previous session ID.
2. A failed restore replaces only that route with a new session and continues
   processing the triggering message.
3. `/clear` removes the matching persisted route, and the next message creates
   a new session.
4. Daemon-managed and standalone channel processes cannot overwrite each
   other's route mappings; different daemon workspaces cannot do so either.
5. Concurrent messages for a route being restored do not create more than one
   replacement session.
