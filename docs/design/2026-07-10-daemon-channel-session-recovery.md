# Daemon-Managed Channel Session Recovery

## Problem

`qwen serve --channel` runs platform adapters in a separate channel worker.
The worker currently creates its `SessionRouter` without a persistence path.
When the worker or daemon restarts, the mapping from a channel conversation to
its Qwen Code session ID is lost. The next group or thread message creates a
new session even when the original session transcript still exists on disk.

A route cannot be treated as equivalent to a live daemon child. Daemon-backed
sessions may disappear when a worker stops, an event stream ends, or an agent
child exits, while their transcripts remain loadable. A stable channel route
must therefore survive independently of the runtime binding.

## Goals

- Restore the same Qwen Code session for a channel route after a worker or
  daemon restart.
- Preserve the route when its daemon runtime becomes unavailable, then reload
  the session on the next message.
- Keep daemon-managed routes isolated from standalone channel routes and from
  routes belonging to other workspaces.
- On an individual restore failure, automatically create a replacement session
  and continue processing the inbound message.
- Preserve existing `/clear` semantics: clearing a route intentionally starts
  a fresh session on its next message.
- Avoid eagerly starting every historical session during worker startup.

## Non-goals

- Resuming an in-flight model turn interrupted by a restart.
- Adding daemon HTTP endpoints or changing the ACP protocol.
- Migrating routes after a channel name or workspace change.
- Changing the Qwen Code session JSONL format or session IDs.
- Supporting two daemon-managed channel workers that use the same canonical
  workspace and channel credentials concurrently.

## Prior Art

OpenClaw persists a durable conversation key and maps it to session metadata
and a transcript. For groups, the key includes the agent, channel, and stable
group identifier; topic-capable channels also include the topic/thread ID.
After a Gateway restart, an inbound message computes the same key and reloads
the stored session. Qwen Code will retain its existing `SessionRouter` route
model rather than introduce an OpenClaw-style Gateway session store in this
change.

## Route Identity and Storage

`SessionRouter` remains the authority for route identity:

- `thread`: `channelName:threadId`, falling back to `channelName:chatId` when
  the platform has no thread ID.
- `user`: `channelName:senderId:chatId`.
- `single`: `channelName:__single__`.

The stored entry keeps the existing `sessionId`, `cwd`, and `SessionTarget`
payload. The configured channel name is part of the route key. The canonical
workspace is part of the store identity. Renaming a channel or changing its
workspace intentionally creates a new route; old mappings are not migrated.

The daemon-managed store path is:

```text
<global-qwen-dir>/channels/daemon/<workspace-hash>/routes.json
```

`workspace-hash` is the stable 16-hex SHA-256 prefix produced by the existing
`hashDaemonWorkspace()` helper for the canonical daemon workspace. The daemon
store does not reuse the standalone channel
`<global-qwen-dir>/channels/sessions.json`. Its directory is created with mode
`0700` and the route file with mode `0600` where the platform supports POSIX
permissions.

One daemon supervisor owns at most one channel worker, so a route store has one
writer within a daemon. Running multiple daemons with the same canonical
workspace and channel credentials is unsupported by this change; it already
causes duplicate platform consumers independently of route persistence.

## State Model

A route has durable identity and an independent runtime state:

| State     | Durable entry | Bound daemon session | Meaning                                                                   |
| --------- | ------------- | -------------------- | ------------------------------------------------------------------------- |
| `live`    | Yes           | Yes                  | The route can prompt its currently attached daemon session.               |
| `dormant` | Yes           | No                   | The session ID and target are known, but must be loaded before prompting. |
| absent    | No            | No                   | The next message creates and persists a new session.                      |

The live/dormant flag is process-local and is not persisted. Every entry read
from disk starts as dormant. A newly created or successfully loaded session
becomes live. Runtime death changes live to dormant without deleting the
durable entry.

Standalone channels retain their existing eager bridge-restart recovery and
destructive session-death behavior. The durable/lazy behavior is enabled only
for the daemon-managed router.

## Startup and Message Flow

Worker startup does not load agent sessions:

```text
worker starts
  -> create daemon bridge
  -> create daemon-managed SessionRouter
  -> read and validate routes.json into dormant entries
  -> create and connect platform channels
```

An inbound message resolves its route as follows:

```text
route absent
  -> create daemon session
  -> mark live and persist the route

route live
  -> use the current daemon session

route dormant
  -> loadSession(saved sessionId, cwd)
  -> success: mark live and continue
  -> failure: keep the old route dormant while creating a replacement
  -> replacement success: atomically replace the route, mark live,
     persist, and continue
  -> replacement failure: retain the old dormant route and surface the error
```

Loads and creates are coalesced per route through the router's existing
in-flight reservation mechanism. Concurrent messages for one dormant route
wait for the same load or replacement; they cannot create duplicate sessions.
Different routes may resolve independently.

The old durable entry is not removed before its replacement exists. This keeps
a transient daemon capacity or network failure from destroying a session that
may be loadable on the next message.

Lazy loading avoids consuming the daemon's live-session limit for quiet
historical groups and keeps worker startup time independent of the number of
stored routes.

## Runtime Death and Shutdown

Daemon-managed session cleanup distinguishes runtime unavailability from route
deletion. `sessionDied`, an ended event stream, `client_evicted`, agent-child
exit, and `bridge_stopped` all make the matching route dormant. They also clear
transient channel state such as typing indicators, pending permissions, and
per-session command caches, but do not remove the durable route.

`SessionRouter` exposes a daemon-aware session-death operation for this policy.
`ChannelBase.onSessionDied()` delegates to it, so existing adapter overrides
for QQ, DingTalk, and Telegram continue to perform their transient cleanup
before calling the base implementation. Standalone routers keep mapping the
same operation to destructive removal.

Routine worker shutdown and daemon shutdown disconnect channels, stop the
bridge, and dispose in-memory router state while retaining `routes.json`.
Explicit `/clear`, a successfully created replacement after a failed lazy load,
or an explicit destructive router operation removes or replaces the affected
durable entry. Full route-store deletion remains an explicit destructive
operation rather than a normal lifecycle action.

An in-flight prompt may be interrupted by a restart. The design only guarantees
that a later message reloads the same conversation when its transcript remains
available.

## Persistence Safety

Route updates use an atomic same-directory replacement:

1. Serialize the complete route map.
2. Write a uniquely named temporary file with mode `0600`.
3. Rename the temporary file over `routes.json`.
4. Best-effort remove the temporary file if writing or renaming fails.

Persistence errors are sanitized and logged but do not fail the current
message. The log makes it explicit that restart recovery is degraded.

If the file contains invalid JSON, it is renamed to a timestamped `.corrupt`
file, the failure is logged, and the worker starts with an empty route map. If
the top-level JSON is valid but an individual entry is malformed, that entry is
dropped and valid siblings remain available. This follows the selected fallback
policy: channel traffic continues without exposing a recovery warning in the
group.

## Command Semantics

- `/clear`, `/reset`, and `/new` remove a durable route whether it is live or
  dormant. The next message creates a new session.
- `/who` and `/status` continue to report a route as active when it has a durable
  conversation binding. In this surface, `active` means the conversation can be
  resumed; it does not promise that an agent child is already resident.
- Agent commands are evaluated after normal message resolution, so a dormant
  route is loaded before session-specific command metadata is used.

## Implementation Boundaries

| Area                                                 | Change                                                                                                                                                                                                                 |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/channels/base/src/SessionRouter.ts`        | Add daemon-managed dormant/live state, metadata-only restore, lazy load-or-replace, daemon-aware session-death handling, memory-only disposal, validation, and atomic persistence. Keep standalone behavior unchanged. |
| `packages/channels/base/src/ChannelBase.ts`          | Delegate session death to the router's policy-aware operation while retaining transient per-session cleanup.                                                                                                           |
| `packages/cli/src/commands/channel/runtime.ts`       | Provide the daemon-specific workspace-hashed route-store path and use policy-aware session cleanup.                                                                                                                    |
| `packages/cli/src/commands/channel/daemon-worker.ts` | Construct a durable/lazy router, read persisted routes before channel connection, and retain its store on normal close or startup rollback.                                                                            |
| Tests                                                | Cover state transitions, lazy recovery, fallback, shutdown preservation, atomic/corrupt-file behavior, command semantics, workspace isolation, and concurrent route resolution.                                        |

No daemon routes, ACP methods, session JSONL formats, or platform adapter APIs
change in this design.

## Verification

Focused tests must cover:

- A persisted route starts dormant and does not call `loadSession()` during
  worker startup.
- The first message loads the original session ID; a second message reuses the
  live binding.
- Concurrent first messages issue one load and, on failure, one replacement
  create. If replacement creation also fails, the old route remains dormant.
- `bridge_stopped`, stream termination, and daemon session death preserve the
  durable route while clearing transient channel state.
- Normal worker close and startup rollback retain the route file.
- `/clear` removes live and dormant routes.
- More persisted routes than the daemon's live-session cap do not cause eager
  loads or route loss.
- Atomic replacement never exposes partial JSON, and malformed files or entries
  follow the documented recovery behavior.
- Daemon-managed and standalone stores, and two different workspace hashes,
  cannot overwrite each other.

Final verification runs the focused package tests, then
`npm run build && npm run typecheck` as required by the repository workflow.

## Acceptance Criteria

1. After a daemon or worker restart, a message for the same configured
   `thread` route loads and uses the previous session ID.
2. Worker startup does not load every persisted agent session.
3. A runtime session death leaves the route dormant and recoverable.
4. A failed lazy load replaces only that route after a new session is created
   successfully and then continues processing the triggering message. If both
   load and create fail, the old route remains dormant.
5. `/clear` removes the matching persisted route, and the next message creates
   a new session.
6. Daemon-managed and standalone channel processes cannot overwrite each
   other's route mappings; different daemon workspaces cannot do so either.
7. Concurrent messages for one dormant route do not create duplicate sessions.
8. Abrupt process termination cannot leave `routes.json` partially written.
