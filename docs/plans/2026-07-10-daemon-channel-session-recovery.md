# Daemon-Managed Channel Session Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve a daemon-managed channel conversation's Qwen Code session across worker and daemon restarts without eagerly loading every historical session.

**Architecture:** `SessionRouter` gains an opt-in lazy recovery mode that keeps durable route metadata separate from process-local live bindings. Daemon workers load route metadata at startup, lazily attach the saved session on first use, retain routes when runtimes die, and atomically replace a route only after fallback session creation succeeds.

**Tech Stack:** TypeScript, Node.js 22+, ESM, Vitest, daemon SDK `DaemonSessionClient`, existing channel-base routing and persistence infrastructure.

## Global Constraints

- Keep the implementation minimal and scoped to daemon-managed channel recovery.
- Do not add daemon HTTP routes, ACP methods, dependencies, or session JSONL changes.
- Preserve standalone channel eager restore and destructive session-death behavior.
- Keep the existing persisted entry shape: `{ sessionId, target, cwd }`.
- Derive daemon route storage from the canonical workspace and keep it separate from standalone `sessions.json`.
- A failed load may replace a route only after `newSession()` succeeds; if both operations fail, retain the old dormant route.
- Use atomic same-directory temp-file plus rename writes, `0700` directories, and `0600` files where supported.
- Run Vitest from the owning package directory; do not run root-level Vitest.
- Before completion, run `npm run build && npm run typecheck` from the repository root.

---

## File Map

- `packages/channels/base/src/SessionRouter.ts`: durable/live state machine, lazy load-or-replace, metadata restore, session-death policy, memory-only disposal, validation, and atomic writes.
- `packages/channels/base/src/SessionRouter.test.ts`: router state-machine, fallback, concurrency, corruption, and atomic-persistence tests.
- `packages/channels/base/src/ChannelBase.ts`: delegate runtime death to the router's policy-aware operation while clearing transient channel state.
- `packages/channels/base/src/ChannelBase.test.ts`: standalone and supplied-router session-death contract tests.
- `packages/cli/src/commands/channel/runtime.ts`: workspace-hashed daemon route path and generic session-cleanup dispatch.
- `packages/cli/src/commands/channel/runtime.test.ts`: path isolation and cleanup dispatch tests.
- `packages/cli/src/commands/channel/daemon-worker.ts`: lazy router construction, metadata restore, and non-destructive shutdown.
- `packages/cli/src/commands/channel/daemon-worker.test.ts`: startup ordering, constructor options, and shutdown/rollback preservation tests.
- `.qwen/e2e-tests/daemon-channel-session-recovery.md`: local behavioral test plan and observed results; intentionally git-ignored.

---

### Task 1: Add Lazy Durable Route Recovery to SessionRouter

**Files:**

- Modify: `packages/channels/base/src/SessionRouter.ts:7-144, 284-391, 415-460`
- Modify: `packages/channels/base/src/SessionRouter.test.ts:1-230, 564-930`

**Interfaces:**

- Produces `SessionRecoveryMode = 'eager' | 'lazy'`.
- Extends the existing constructor with `options?: { recoveryMode?: SessionRecoveryMode }` after `persistPath`.
- Produces `restoreRoutes(): { restored: number; dropped: number }`, which reads metadata without calling the bridge.
- Produces `handleSessionDied(sessionId: string): boolean`, which marks a lazy route dormant and destructively removes an eager route.
- Produces `dispose(): void`, which clears only in-memory state.
- Keeps `restoreSessions()` and `clearAll()` behavior intact for standalone callers.

- [ ] **Step 1: Add failing lazy-recovery tests**

Append a `describe('lazy recovery')` block to `SessionRouter.test.ts` with these concrete cases:

```ts
describe('lazy recovery', () => {
  function createLazyRouter(persistPath: string, customBridge = bridge) {
    return new SessionRouter(customBridge, '/tmp', 'user', persistPath, {
      recoveryMode: 'lazy',
    });
  }

  it('restores route metadata without loading daemon sessions', () => {
    const dir = mkdtempSync(join(tmpdir(), 'qwen-router-'));
    tempDirs.push(dir);
    const persistPath = join(dir, 'routes.json');
    writePersistedSession(persistPath, 'ch:alice:chat1');
    const router = createLazyRouter(persistPath);

    expect(router.restoreRoutes()).toEqual({ restored: 1, dropped: 0 });
    expect(bridge.loadSession).not.toHaveBeenCalled();
    expect(router.getSession('ch', 'alice', 'chat1')).toBe('old-session');
  });

  it('loads a dormant route once and then reuses the live binding', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'qwen-router-'));
    tempDirs.push(dir);
    const persistPath = join(dir, 'routes.json');
    writePersistedSession(persistPath, 'ch:alice:chat1');
    const router = createLazyRouter(persistPath);
    router.restoreRoutes();

    await expect(router.resolve('ch', 'alice', 'chat1')).resolves.toBe(
      'old-session',
    );
    await expect(router.resolve('ch', 'alice', 'chat1')).resolves.toBe(
      'old-session',
    );
    expect(bridge.loadSession).toHaveBeenCalledTimes(1);
    expect(bridge.newSession).not.toHaveBeenCalled();
  });

  it('coalesces concurrent loads for one dormant route', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'qwen-router-'));
    tempDirs.push(dir);
    const persistPath = join(dir, 'routes.json');
    writePersistedSession(persistPath, 'ch:alice:chat1');
    let finishLoad!: (value: string) => void;
    const lazyBridge = {
      ...mockBridge(),
      loadSession: vi.fn(
        () =>
          new Promise<string>((resolve) => {
            finishLoad = resolve;
          }),
      ),
    } satisfies ChannelAgentBridge;
    const router = createLazyRouter(persistPath, lazyBridge);
    router.restoreRoutes();

    const first = router.resolve('ch', 'alice', 'chat1');
    const second = router.resolve('ch', 'alice', 'chat1');
    await Promise.resolve();
    finishLoad('old-session');

    await expect(Promise.all([first, second])).resolves.toEqual([
      'old-session',
      'old-session',
    ]);
    expect(lazyBridge.loadSession).toHaveBeenCalledTimes(1);
  });

  it('replaces a route only after fallback creation succeeds', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'qwen-router-'));
    tempDirs.push(dir);
    const persistPath = join(dir, 'routes.json');
    writePersistedSession(persistPath, 'ch:alice:chat1');
    const lazyBridge = {
      ...mockBridge(),
      loadSession: vi.fn().mockRejectedValue(new Error('gone')),
      newSession: vi.fn().mockResolvedValue('replacement-session'),
    } satisfies ChannelAgentBridge;
    const router = createLazyRouter(persistPath, lazyBridge);
    router.restoreRoutes();

    await expect(router.resolve('ch', 'alice', 'chat1')).resolves.toBe(
      'replacement-session',
    );
    expect(JSON.parse(readFileSync(persistPath, 'utf-8'))).toEqual({
      'ch:alice:chat1': expect.objectContaining({
        sessionId: 'replacement-session',
      }),
    });
  });

  it('retains the dormant route when load and fallback creation both fail', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'qwen-router-'));
    tempDirs.push(dir);
    const persistPath = join(dir, 'routes.json');
    writePersistedSession(persistPath, 'ch:alice:chat1');
    const lazyBridge = {
      ...mockBridge(),
      loadSession: vi.fn().mockRejectedValue(new Error('temporarily gone')),
      newSession: vi.fn().mockRejectedValue(new Error('at capacity')),
    } satisfies ChannelAgentBridge;
    const router = createLazyRouter(persistPath, lazyBridge);
    router.restoreRoutes();

    await expect(router.resolve('ch', 'alice', 'chat1')).rejects.toThrow(
      'at capacity',
    );
    expect(router.getSession('ch', 'alice', 'chat1')).toBe('old-session');
    expect(JSON.parse(readFileSync(persistPath, 'utf-8'))).toEqual({
      'ch:alice:chat1': expect.objectContaining({ sessionId: 'old-session' }),
    });
  });

  it('marks a dead lazy session dormant and reloads it on next resolve', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'qwen-router-'));
    tempDirs.push(dir);
    const persistPath = join(dir, 'routes.json');
    writePersistedSession(persistPath, 'ch:alice:chat1');
    const router = createLazyRouter(persistPath);
    router.restoreRoutes();
    await router.resolve('ch', 'alice', 'chat1');

    expect(router.handleSessionDied('old-session')).toBe(true);
    expect(router.hasSession('ch', 'alice', 'chat1')).toBe(true);
    await router.resolve('ch', 'alice', 'chat1');

    expect(bridge.loadSession).toHaveBeenCalledTimes(2);
  });

  it('does not eagerly load route counts above the daemon live-session cap', () => {
    const dir = mkdtempSync(join(tmpdir(), 'qwen-router-'));
    tempDirs.push(dir);
    const persistPath = join(dir, 'routes.json');
    const entries = Object.fromEntries(
      Array.from({ length: 25 }, (_, index) => [
        `ch:user-${index}:chat-${index}`,
        {
          sessionId: `old-${index}`,
          target: {
            channelName: 'ch',
            senderId: `user-${index}`,
            chatId: `chat-${index}`,
          },
          cwd: '/tmp',
        },
      ]),
    );
    writeFileSync(persistPath, JSON.stringify(entries));
    const router = createLazyRouter(persistPath);

    expect(router.restoreRoutes()).toEqual({ restored: 25, dropped: 0 });
    expect(bridge.loadSession).not.toHaveBeenCalled();
  });

  it('clears a dormant route destructively', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'qwen-router-'));
    tempDirs.push(dir);
    const persistPath = join(dir, 'routes.json');
    writePersistedSession(persistPath, 'ch:alice:chat1');
    const router = createLazyRouter(persistPath);
    router.restoreRoutes();

    expect(router.removeSession('ch', 'alice', 'chat1')).toEqual([
      'old-session',
    ]);
    expect(JSON.parse(readFileSync(persistPath, 'utf-8'))).toEqual({});
    await expect(router.resolve('ch', 'alice', 'chat1')).resolves.toBe(
      'session-1',
    );
    expect(bridge.loadSession).not.toHaveBeenCalled();
  });

  it('keeps eager session-death behavior as the default', async () => {
    const router = new SessionRouter(bridge, '/tmp');
    const sessionId = await router.resolve('ch', 'alice', 'chat1');

    expect(router.handleSessionDied(sessionId)).toBe(true);
    expect(router.hasSession('ch', 'alice', 'chat1')).toBe(false);
  });
});
```

- [ ] **Step 2: Run the focused router tests and confirm RED**

Run:

```bash
cd packages/channels/base
npx vitest run src/SessionRouter.test.ts
```

Expected: compilation/test failures because the constructor option,
`restoreRoutes()`, and `handleSessionDied()` do not exist.

- [ ] **Step 3: Add the recovery mode and process-local live state**

Add these declarations and fields to `SessionRouter.ts`:

```ts
export type SessionRecoveryMode = 'eager' | 'lazy';

export interface SessionRouterOptions {
  recoveryMode?: SessionRecoveryMode;
}

private readonly recoveryMode: SessionRecoveryMode;
private readonly liveSessionIds = new Set<string>();
```

Extend the constructor without changing existing positional callers:

```ts
constructor(
  bridge: ChannelAgentBridge,
  defaultCwd: string,
  scope: SessionScope = 'user',
  persistPath?: string,
  options: SessionRouterOptions = {},
) {
  this.bridge = bridge;
  this.defaultCwd = defaultCwd;
  this.defaultScope = scope;
  this.persistPath = persistPath;
  this.recoveryMode = options.recoveryMode ?? 'eager';
}
```

Add the policy-aware lifecycle methods:

```ts
handleSessionDied(sessionId: string): boolean {
  if (this.recoveryMode === 'eager') {
    return this.removeSessionId(sessionId);
  }
  const known = this.toTarget.has(sessionId);
  this.liveSessionIds.delete(sessionId);
  for (const loadWindow of this.sessionLoadWindows) {
    loadWindow.add(sessionId);
  }
  return known;
}

dispose(): void {
  this.toSession.clear();
  this.toTarget.clear();
  this.toCwd.clear();
  this.creatingSessions.clear();
  this.sessionLoadWindows.clear();
  this.liveSessionIds.clear();
}

clearAll(): void {
  this.dispose();
  if (this.persistPath && existsSync(this.persistPath)) {
    try {
      unlinkSync(this.persistPath);
    } catch {
      // best-effort
    }
  }
}
```

- [ ] **Step 4: Refactor resolve into live reuse, lazy load, and transactional replacement**

Keep the existing retry loop, but check `creatingSessions` before starting a
load and treat a mapped session as immediately reusable only when eager or live:

```ts
private isLive(sessionId: string): boolean {
  return (
    this.recoveryMode === 'eager' || this.liveSessionIds.has(sessionId)
  );
}
```

Extract the existing new-session body into a helper with this signature:

```ts
private async createAndStoreSession(
  key: string,
  input: {
    channelName: string;
    senderId: string;
    chatId: string;
    threadId?: string;
    cwd: string;
    isGroup?: boolean;
  },
): Promise<string> {
  const loadWindow = this.beginSessionLoad();
  try {
    const sessionId = await this.createLiveSession(
      input.cwd,
      loadWindow,
      key,
    );
    this.toSession.set(key, sessionId);
    this.toTarget.set(sessionId, {
      channelName: input.channelName,
      senderId: input.senderId,
      chatId: input.chatId,
      threadId: input.threadId,
      isGroup: input.isGroup,
    });
    this.toCwd.set(sessionId, input.cwd);
    this.liveSessionIds.add(sessionId);
    this.persist();
    return sessionId;
  } finally {
    this.endSessionLoad(loadWindow);
  }
}
```

Replace the current inline body of `resolve()` with the same reservation
discipline around the two helpers:

```ts
async resolve(
  channelName: string,
  senderId: string,
  chatId: string,
  threadId?: string,
  cwd?: string,
  isGroup?: boolean,
): Promise<string> {
  const key = this.routingKey(channelName, senderId, chatId, threadId);
  const input = {
    channelName,
    senderId,
    chatId,
    threadId,
    cwd: cwd ?? this.defaultCwd,
    isGroup,
  };
  let failedWaits = 0;
  for (;;) {
    const existing = this.toSession.get(key);
    if (existing && this.isLive(existing)) {
      this.promoteTargetToGroup(existing, isGroup);
      return existing;
    }

    const creating = this.creatingSessions.get(key);
    if (creating) {
      try {
        const sessionId = await creating;
        this.promoteTargetToGroup(sessionId, isGroup);
        return sessionId;
      } catch (error) {
        if (this.creatingSessions.get(key) === creating) {
          this.creatingSessions.delete(key);
        }
        failedWaits++;
        if (failedWaits > 3) throw error;
        continue;
      }
    }

    const operation = existing
      ? this.loadOrReplaceSession(key, existing, input)
      : this.createAndStoreSession(key, input);
    this.creatingSessions.set(key, operation);
    try {
      const sessionId = await operation;
      this.promoteTargetToGroup(sessionId, isGroup);
      return sessionId;
    } finally {
      if (this.creatingSessions.get(key) === operation) {
        this.creatingSessions.delete(key);
      }
    }
  }
}
```

Add a lazy helper with transactional fallback:

```ts
private async loadOrReplaceSession(
  key: string,
  savedSessionId: string,
  input: {
    channelName: string;
    senderId: string;
    chatId: string;
    threadId?: string;
    cwd: string;
    isGroup?: boolean;
  },
): Promise<string> {
  const savedCwd = this.toCwd.get(savedSessionId) ?? input.cwd;
  const loadWindow = this.beginSessionLoad();
  try {
    try {
      const loadedSessionId = await this.bridge.loadSession(
        savedSessionId,
        savedCwd,
      );
      if (
        typeof loadedSessionId !== 'string' ||
        loadedSessionId.length === 0 ||
        loadWindow.delete(loadedSessionId)
      ) {
        throw new Error('Invalid or dead restored session ID');
      }
      if (loadedSessionId !== savedSessionId) {
        const target = this.toTarget.get(savedSessionId);
        this.deleteByKey(key);
        this.toSession.set(key, loadedSessionId);
        if (target) this.toTarget.set(loadedSessionId, target);
        this.toCwd.set(loadedSessionId, savedCwd);
        this.persist();
      }
      this.liveSessionIds.add(loadedSessionId);
      return loadedSessionId;
    } catch (loadError) {
      try {
        const replacement = await this.createLiveSession(
          input.cwd,
          loadWindow,
          key,
        );
        this.deleteByKey(key);
        this.toSession.set(key, replacement);
        this.toTarget.set(replacement, {
          channelName: input.channelName,
          senderId: input.senderId,
          chatId: input.chatId,
          threadId: input.threadId,
          isGroup: input.isGroup,
        });
        this.toCwd.set(replacement, input.cwd);
        this.liveSessionIds.add(replacement);
        this.persist();
        process.stderr.write(
          `[SessionRouter] Replaced unavailable session ${sanitizeLogText(savedSessionId, 128)} for key ${sanitizeLogText(key, 256)} after load failed: ${sanitizeLogText(loadError instanceof Error ? loadError.message : String(loadError), 512)}\n`,
        );
        return replacement;
      } catch (createError) {
        process.stderr.write(
          `[SessionRouter] Failed to load session ${sanitizeLogText(savedSessionId, 128)} for key ${sanitizeLogText(key, 256)} (${sanitizeLogText(loadError instanceof Error ? loadError.message : String(loadError), 512)}) and failed to create a replacement (${sanitizeLogText(createError instanceof Error ? createError.message : String(createError), 512)})\n`,
        );
        throw createError;
      }
    }
  } finally {
    this.endSessionLoad(loadWindow);
  }
}
```

When `resolve()` sees a dormant mapping, store the promise returned by
`loadOrReplaceSession()` in `creatingSessions`. When it sees no mapping, store
the promise returned by `createAndStoreSession()`. In both paths, remove the
promise in `finally` only when it is still the current reservation. On success,
call `promoteTargetToGroup()` before returning.

Update both destructive deletion paths to remove process-local liveness as
well: `deleteByKey()` and `removeSessionId()` must call
`liveSessionIds.delete(sessionId)` when they remove a mapped ID.

- [ ] **Step 5: Add metadata-only restore**

Add `restoreRoutes()` without changing `restoreSessions()`:

```ts
restoreRoutes(): { restored: number; dropped: number } {
  const persisted = this.readPersistedEntries();
  if (!persisted) return { restored: 0, dropped: 0 };
  this.dispose();
  let restored = 0;
  for (const [key, entry] of Object.entries(persisted.entries)) {
    this.toSession.set(key, entry.sessionId);
    this.toTarget.set(entry.sessionId, entry.target);
    this.toCwd.set(entry.sessionId, entry.cwd);
    restored++;
  }
  if (persisted.dropped > 0) this.persist();
  return { restored, dropped: persisted.dropped };
}
```

For this task, add `readPersistedEntries()` with the return type
`{ entries: Record<string, PersistedEntry>; dropped: number } | undefined` and
basic JSON parsing plus the structural checks defined in Task 2. Do not call
`bridge.loadSession()` from `restoreRoutes()`.

- [ ] **Step 6: Run router tests and confirm GREEN**

Run:

```bash
cd packages/channels/base
npx vitest run src/SessionRouter.test.ts
```

Expected: all existing eager tests and new lazy tests pass.

- [ ] **Step 7: Commit the state-machine change**

```bash
git add packages/channels/base/src/SessionRouter.ts packages/channels/base/src/SessionRouter.test.ts
git commit -m "feat(channels): add lazy session route recovery"
```

---

### Task 2: Make Route Persistence Crash-Safe

**Files:**

- Modify: `packages/channels/base/src/SessionRouter.ts:1-11, 289-413`
- Modify: `packages/channels/base/src/SessionRouter.test.ts:564-930`

**Interfaces:**

- Consumes `restoreRoutes()` and the existing `PersistedEntry` shape from Task 1.
- Produces private `readPersistedEntries()`, `isPersistedEntry()`, and atomic
  `persist()` behavior shared by eager and lazy routers.

- [ ] **Step 1: Add failing persistence-safety tests**

Add tests that pin the required behavior:

At the top of `SessionRouter.test.ts`, wrap `renameSync` so the test proves the
atomic replacement path is actually exercised:

```ts
const mockRenameSync = vi.hoisted(() => vi.fn());

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    renameSync: (from: string, to: string) => {
      mockRenameSync(from, to);
      return actual.renameSync(from, to);
    },
  };
});
```

Clear `mockRenameSync` in `beforeEach()`.

```ts
it('quarantines invalid JSON and starts with no routes', () => {
  const dir = mkdtempSync(join(tmpdir(), 'qwen-router-'));
  tempDirs.push(dir);
  const persistPath = join(dir, 'routes.json');
  writeFileSync(persistPath, '{bad');
  const router = new SessionRouter(bridge, '/tmp', 'user', persistPath, {
    recoveryMode: 'lazy',
  });

  expect(router.restoreRoutes()).toEqual({ restored: 0, dropped: 0 });
  expect(existsSync(persistPath)).toBe(false);
  expect(
    readdirSync(dir).some((name) => name.startsWith('routes.json.corrupt-')),
  ).toBe(true);
});

it('drops malformed entries but keeps valid siblings', () => {
  const dir = mkdtempSync(join(tmpdir(), 'qwen-router-'));
  tempDirs.push(dir);
  const persistPath = join(dir, 'routes.json');
  writeFileSync(
    persistPath,
    JSON.stringify({
      'ch:alice:chat1': {
        sessionId: 'valid-session',
        target: { channelName: 'ch', senderId: 'alice', chatId: 'chat1' },
        cwd: '/tmp',
      },
      broken: { sessionId: 42 },
    }),
  );
  const router = new SessionRouter(bridge, '/tmp', 'user', persistPath, {
    recoveryMode: 'lazy',
  });

  expect(router.restoreRoutes()).toEqual({ restored: 1, dropped: 1 });
  expect(router.getSession('ch', 'alice', 'chat1')).toBe('valid-session');
  expect(JSON.parse(readFileSync(persistPath, 'utf-8'))).toEqual({
    'ch:alice:chat1': expect.objectContaining({ sessionId: 'valid-session' }),
  });
});

it('persists through a same-directory temporary file and rename', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'qwen-router-'));
  tempDirs.push(dir);
  const persistPath = join(dir, 'routes.json');
  const router = new SessionRouter(bridge, '/tmp', 'user', persistPath);

  await router.resolve('ch', 'alice', 'chat1');

  expect(JSON.parse(readFileSync(persistPath, 'utf-8'))).toEqual({
    'ch:alice:chat1': expect.objectContaining({ sessionId: 'session-1' }),
  });
  expect(mockRenameSync).toHaveBeenCalledWith(
    expect.stringMatching(/\.tmp$/),
    persistPath,
  );
  expect(readdirSync(dir).filter((name) => name.endsWith('.tmp'))).toEqual([]);
  if (process.platform !== 'win32') {
    expect(statSync(dir).mode & 0o777).toBe(0o700);
    expect(statSync(persistPath).mode & 0o777).toBe(0o600);
  }
});
```

Add `readdirSync` and `statSync` to the test imports.

- [ ] **Step 2: Run the focused tests and confirm RED**

Run:

```bash
cd packages/channels/base
npx vitest run src/SessionRouter.test.ts
```

Expected: quarantine, malformed-entry filtering, and permission assertions fail.

- [ ] **Step 3: Implement structural validation and corrupt-file quarantine**

Use a record guard and validate every persisted field:

```ts
private isPersistedEntry(value: unknown): value is PersistedEntry {
  if (typeof value !== 'object' || value === null) return false;
  const entry = value as Record<string, unknown>;
  const target = entry['target'];
  if (typeof target !== 'object' || target === null) return false;
  const typedTarget = target as Record<string, unknown>;
  return (
    typeof entry['sessionId'] === 'string' &&
    entry['sessionId'].length > 0 &&
    typeof entry['cwd'] === 'string' &&
    entry['cwd'].length > 0 &&
    typeof typedTarget['channelName'] === 'string' &&
    typeof typedTarget['senderId'] === 'string' &&
    typeof typedTarget['chatId'] === 'string' &&
    (typedTarget['threadId'] === undefined ||
      typeof typedTarget['threadId'] === 'string') &&
    (typedTarget['isGroup'] === undefined ||
      typeof typedTarget['isGroup'] === 'boolean')
  );
}
```

Use this complete reader shape for both `restoreRoutes()` and
`restoreSessions()`:

```ts
private readPersistedEntries():
  | { entries: Record<string, PersistedEntry>; dropped: number }
  | undefined {
  const persistPath = this.persistPath;
  if (!persistPath || !existsSync(persistPath)) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(persistPath, 'utf-8'));
  } catch (error) {
    const quarantinePath = `${persistPath}.corrupt-${Date.now()}`;
    try {
      renameSync(persistPath, quarantinePath);
    } catch {
      // Keep startup available even if quarantine itself fails.
    }
    process.stderr.write(
      `[SessionRouter] Corrupted persist file at ${sanitizeLogText(persistPath, 1024)}: ${sanitizeLogText(error instanceof Error ? error.message : String(error), 512)}\n`,
    );
    return undefined;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    const quarantinePath = `${persistPath}.corrupt-${Date.now()}`;
    try {
      renameSync(persistPath, quarantinePath);
    } catch {
      // Keep startup available even if quarantine itself fails.
    }
    process.stderr.write(
      `[SessionRouter] Invalid route store at ${sanitizeLogText(persistPath, 1024)}: expected an object\n`,
    );
    return undefined;
  }
  const entries: Record<string, PersistedEntry> = {};
  let dropped = 0;
  for (const [key, value] of Object.entries(parsed)) {
    if (this.isPersistedEntry(value)) entries[key] = value;
    else dropped++;
  }
  return { entries, dropped };
}
```

Refactor `restoreSessions()` to consume `persisted.entries` and initialize its
`changed` flag from `persisted.dropped > 0`. This retains eager behavior while
sharing validation with metadata-only restore.

- [ ] **Step 4: Replace direct overwrite with atomic temp-file replacement**

Update the Node imports to include `chmodSync`, `mkdirSync`, `renameSync`,
`rmSync`, `dirname`, and `join`. Replace the direct `writeFileSync(persistPath,
...)` call with:

```ts
private persist(): void {
  if (!this.persistPath) return;
  const data: Record<string, PersistedEntry> = {};
  for (const [key, sessionId] of this.toSession) {
    const target = this.toTarget.get(sessionId);
    if (!target) continue;
    data[key] = {
      sessionId,
      target,
      cwd: this.toCwd.get(sessionId) ?? this.defaultCwd,
    };
  }

  const dir = dirname(this.persistPath);
  const tempPath = join(
    dir,
    `${Date.now()}-${process.pid}-${Math.random().toString(16).slice(2)}.tmp`,
  );
  try {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    try {
      chmodSync(dir, 0o700);
    } catch {
      // Windows and some filesystems do not implement POSIX modes.
    }
    writeFileSync(tempPath, JSON.stringify(data, null, 2), {
      encoding: 'utf-8',
      mode: 0o600,
    });
    renameSync(tempPath, this.persistPath);
    try {
      chmodSync(this.persistPath, 0o600);
    } catch {
      // Windows and some filesystems do not implement POSIX modes.
    }
  } catch (error) {
    process.stderr.write(
      `[SessionRouter] Failed to persist routes at ${sanitizeLogText(this.persistPath, 1024)}: ${sanitizeLogText(error instanceof Error ? error.message : String(error), 512)}\n`,
    );
  } finally {
    try {
      rmSync(tempPath, { force: true });
    } catch {
      // best-effort temp cleanup
    }
  }
}
```

- [ ] **Step 5: Run router tests and confirm GREEN**

Run:

```bash
cd packages/channels/base
npx vitest run src/SessionRouter.test.ts
```

Expected: all router tests pass, including existing eager persistence tests.

- [ ] **Step 6: Commit persistence hardening**

```bash
git add packages/channels/base/src/SessionRouter.ts packages/channels/base/src/SessionRouter.test.ts
git commit -m "fix(channels): harden session route persistence"
```

---

### Task 3: Preserve Durable Routes Through Session-Death Cleanup

**Files:**

- Modify: `packages/channels/base/src/ChannelBase.ts:1120-1126`
- Modify: `packages/channels/base/src/ChannelBase.test.ts:4240-4430`
- Modify: `packages/cli/src/commands/channel/runtime.ts:222-240`
- Modify: `packages/cli/src/commands/channel/runtime.test.ts`

**Interfaces:**

- Consumes `SessionRouter.handleSessionDied(sessionId)` from Task 1.
- Keeps adapter `onSessionDied(sessionId)` overrides unchanged; QQ, DingTalk,
  and Telegram already call `super.onSessionDied(sessionId)`.
- Keeps `removeSessionId()` destructive for `/clear`-adjacent and explicit
  eviction paths.

- [ ] **Step 1: Change tests to require policy-aware session death**

In supplied-router fixtures in `ChannelBase.test.ts`, replace
`removeSessionId: vi.fn()` with `handleSessionDied: vi.fn()`. Update assertions:

```ts
expect(router.handleSessionDied).toHaveBeenCalledWith('s-1');
```

Keep the existing default-router test that expects `Session: none`; the default
router remains eager. Add this test to ensure transient cleanup still occurs:

```ts
it('forgets instructions when policy-aware session death preserves a route', async () => {
  const router = new SessionRouter(bridge, '/tmp', 'user', undefined, {
    recoveryMode: 'lazy',
  });
  const ch = createChannel(
    { instructions: 'Be concise.' },
    { router, registerBridgeEvents: true },
  );
  await ch.handleInbound(envelope({ text: 'first' }));
  const sessionId = router.getSession('test', 'user1', 'chat1');
  expect(sessionId).toBeDefined();

  (bridge as unknown as EventEmitter).emit('sessionDied', { sessionId });

  expect(router.hasSession('test', 'user1', 'chat1')).toBe(true);
});
```

Add a status test that pins the documented durable meaning of `active`:

```ts
it('/status reports a dormant durable route as active', async () => {
  const router = new SessionRouter(bridge, '/tmp', 'user', undefined, {
    recoveryMode: 'lazy',
  });
  const ch = createChannel({}, { router, registerBridgeEvents: true });
  await ch.handleInbound(envelope({ text: 'first' }));
  (bridge as unknown as EventEmitter).emit('sessionDied', {
    sessionId: 's-1',
  });
  ch.sent = [];

  await ch.handleInbound(envelope({ text: '/status' }));

  expect(ch.sent[0]!.text).toContain('Session: active');
});
```

In `runtime.test.ts`, create a router stub with `handleSessionDied: vi.fn()` and
assert that a `sessionDied` event with no matching channel calls it exactly once.

- [ ] **Step 2: Run ChannelBase and runtime tests and confirm RED**

Run:

```bash
cd packages/channels/base
npx vitest run src/ChannelBase.test.ts
cd ../../../packages/cli
npx vitest run src/commands/channel/runtime.test.ts
```

Expected: failures because production code still calls `removeSessionId()`.

- [ ] **Step 3: Route session-death cleanup through the new policy method**

Change `ChannelBase.onSessionDied()` to:

```ts
onSessionDied(sessionId: string): void {
  this.router.handleSessionDied(sessionId);
  this.instructedSessions.delete(sessionId);
  this.removePendingPermissionsForSession(sessionId);
}
```

Change the no-channel fallback in `registerSessionCleanup()` to:

```ts
router.handleSessionDied(event.sessionId);
```

Change the generic log suffix from `removing routing state` to
`updating routing state`; the actual eager/lazy policy belongs to the router.

- [ ] **Step 4: Run focused tests and confirm GREEN**

Run:

```bash
cd packages/channels/base
npx vitest run src/SessionRouter.test.ts src/ChannelBase.test.ts
cd ../../../packages/cli
npx vitest run src/commands/channel/runtime.test.ts
```

Expected: all tests pass; eager default sessions disappear, lazy sessions stay
durably mapped and become dormant.

- [ ] **Step 5: Commit lifecycle semantics**

```bash
git add packages/channels/base/src/ChannelBase.ts packages/channels/base/src/ChannelBase.test.ts packages/cli/src/commands/channel/runtime.ts packages/cli/src/commands/channel/runtime.test.ts
git commit -m "fix(channels): preserve durable routes on session death"
```

---

### Task 4: Wire Durable Routes Into the Daemon Worker

**Files:**

- Modify: `packages/cli/src/commands/channel/runtime.ts:1-36`
- Modify: `packages/cli/src/commands/channel/runtime.test.ts:1-35`
- Modify: `packages/cli/src/commands/channel/daemon-worker.ts:324-425`
- Modify: `packages/cli/src/commands/channel/daemon-worker.test.ts:1-155, 498-930`
- Create: `.qwen/e2e-tests/daemon-channel-session-recovery.md`

**Interfaces:**

- Produces `daemonSessionRoutesPath(workspaceCwd: string): string`.
- Consumes `hashDaemonWorkspace` and `Storage.getGlobalQwenDir()` from
  `@qwen-code/qwen-code-core`.
- Consumes lazy router interfaces from Task 1.

- [ ] **Step 1: Write the local E2E test plan before changing behavior**

Create `.qwen/e2e-tests/daemon-channel-session-recovery.md` with:

```markdown
# Daemon Channel Session Recovery E2E

## Baseline

1. Start the installed CLI with a configured test channel:
   `qwen serve --channel telegram`.
2. Send a unique message in a test group/thread and record the session ID from
   daemon/channel logs.
3. Restart the daemon, send a follow-up, and record whether a new session ID is
   created.
4. Expected before the change: the follow-up uses a new session.

If test-channel credentials are unavailable, record the baseline as blocked and
use the daemon-worker plus SessionRouter Vitest harness as the executable
baseline.

## Post-change

1. Repeat the baseline and confirm `routes.json` contains the route after the
   first message.
2. Restart the worker only; confirm no session loads before the next message.
3. Send a follow-up; confirm the saved session ID loads and context continues.
4. Restart the daemon; repeat the same confirmation.
5. Run `/clear confirm` in a shared thread, then send a message and confirm a new
   session ID replaces the old route.
6. Rename the saved transcript to a backup, send a message, confirm one
   replacement session is created without a group-visible recovery warning,
   then restore the backup after recording the result.

## Results

- Baseline:
- Post-change:
- Logs/session IDs:
```

- [ ] **Step 2: Add failing route-path and worker-wiring tests**

In `runtime.test.ts`, extend the core mock:

```ts
vi.mock('@qwen-code/qwen-code-core', () => ({
  Storage: { getGlobalQwenDir: () => '/tmp/qwen' },
  hashDaemonWorkspace: (workspace: string) =>
    workspace === '/workspace' ? 'workspace-hash' : 'other-hash',
}));
```

Add:

```ts
it('isolates daemon route stores by workspace hash', () => {
  expect(daemonSessionRoutesPath('/workspace')).toBe(
    '/tmp/qwen/channels/daemon/workspace-hash/routes.json',
  );
  expect(daemonSessionRoutesPath('/other')).toBe(
    '/tmp/qwen/channels/daemon/other-hash/routes.json',
  );
  expect(daemonSessionRoutesPath('/workspace')).not.toBe(sessionsPath());
});
```

In `daemon-worker.test.ts`, add hoisted mocks:

```ts
const mockDaemonSessionRoutesPath = vi.hoisted(() =>
  vi.fn(() => '/tmp/qwen/channels/daemon/workspace-hash/routes.json'),
);
const mockRouterRestoreRoutes = vi.hoisted(() =>
  vi.fn(() => ({ restored: 1, dropped: 0 })),
);
const mockRouterDispose = vi.hoisted(() => vi.fn());
```

Expose those methods from the `SessionRouter` mock and export/mock
`daemonSessionRoutesPath` from `./runtime.js`. Update the main worker test to
assert:

```ts
expect(mockSessionRouter).toHaveBeenCalledWith(
  expect.any(Object),
  '/workspace',
  'user',
  '/tmp/qwen/channels/daemon/workspace-hash/routes.json',
  { recoveryMode: 'lazy' },
);
expect(mockRouterRestoreRoutes).toHaveBeenCalledTimes(1);
expect(mockBridgeLoadSession).not.toHaveBeenCalled();
expect(mockRouterRestoreRoutes.mock.invocationCallOrder[0]).toBeLessThan(
  mockCreateChannel.mock.invocationCallOrder[0],
);
```

Update shutdown and startup-rollback tests to expect `dispose()` and never
`clearAll()`.

- [ ] **Step 3: Run CLI channel tests and confirm RED**

Run:

```bash
cd packages/cli
npx vitest run src/commands/channel/runtime.test.ts src/commands/channel/daemon-worker.test.ts
```

Expected: missing path helper, wrong router constructor arguments, no metadata
restore, and destructive cleanup assertions fail.

- [ ] **Step 4: Add the workspace-isolated route path**

In `runtime.ts`, import `hashDaemonWorkspace` with `Storage` and add:

```ts
export function daemonSessionRoutesPath(workspaceCwd: string): string {
  return path.join(
    Storage.getGlobalQwenDir(),
    'channels',
    'daemon',
    hashDaemonWorkspace(workspaceCwd),
    'routes.json',
  );
}
```

- [ ] **Step 5: Construct and restore the lazy router before channel creation**

In `daemon-worker.ts`, import `daemonSessionRoutesPath`, construct the router as:

```ts
const createdRouter = new SessionRouter(
  bridgeFacade,
  daemonWorkspace,
  'user',
  daemonSessionRoutesPath(daemonWorkspace),
  { recoveryMode: 'lazy' },
);
```

After all `setChannelScope()` calls and before the first `createChannel()` call,
load metadata and log sanitized counts:

```ts
const restoredRoutes = createdRouter.restoreRoutes();
writeStdoutLine(
  `[Channel] Restored ${restoredRoutes.restored} dormant route(s)` +
    (restoredRoutes.dropped > 0
      ? `; dropped ${restoredRoutes.dropped} invalid route(s)`
      : ''),
);
```

Do not call `bridge.loadSession()` during startup.

- [ ] **Step 6: Make close and rollback non-destructive**

Replace both daemon-worker `clearAll()` calls with `dispose()`:

```ts
async close() {
  disconnectAll();
  try {
    bridge.stop();
  } finally {
    createdRouter.dispose();
  }
}
```

and in startup rollback:

```ts
} finally {
  router?.dispose();
}
```

Because `bridge.stop()` emits `sessionDied('bridge_stopped')`, Task 3 must be in
place first so those events mark routes dormant instead of deleting them.

- [ ] **Step 7: Run CLI channel tests and confirm GREEN**

Run:

```bash
cd packages/cli
npx vitest run src/commands/channel/runtime.test.ts src/commands/channel/daemon-worker.test.ts
```

Expected: both files pass, including restore-before-connect and route retention
on close/rollback.

- [ ] **Step 8: Commit daemon-worker wiring**

```bash
git add packages/cli/src/commands/channel/runtime.ts packages/cli/src/commands/channel/runtime.test.ts packages/cli/src/commands/channel/daemon-worker.ts packages/cli/src/commands/channel/daemon-worker.test.ts
git commit -m "feat(cli): restore daemon channel routes lazily"
```

---

### Task 5: Regression Verification and Review

**Files:**

- Verify: `packages/channels/base/src/SessionRouter.test.ts`
- Verify: `packages/channels/base/src/ChannelBase.test.ts`
- Verify: `packages/cli/src/commands/channel/runtime.test.ts`
- Verify: `packages/cli/src/commands/channel/daemon-worker.test.ts`
- Update results: `.qwen/e2e-tests/daemon-channel-session-recovery.md`

**Interfaces:**

- Consumes all implementation tasks.
- Produces the final evidence required for completion; no new production API.

- [ ] **Step 1: Run all focused tests together**

```bash
cd packages/channels/base
npx vitest run src/SessionRouter.test.ts src/ChannelBase.test.ts
cd ../../../packages/cli
npx vitest run src/commands/channel/runtime.test.ts src/commands/channel/daemon-worker.test.ts
```

Expected: all focused tests pass with no unhandled rejections or open-handle
warnings.

- [ ] **Step 2: Run the repository-required build and typecheck**

```bash
cd /Users/qqqys/Desktop/qys/qwen-code
npm run build
npm run typecheck
```

Expected: both commands exit 0.

- [ ] **Step 3: Execute the E2E plan where credentials are available**

Follow `.qwen/e2e-tests/daemon-channel-session-recovery.md`. Record the exact
session IDs before and after worker restart, daemon restart, `/clear`, and the
missing-transcript fallback. If credentials are unavailable, record that fact
and link the focused Vitest cases that cover each blocked scenario.

- [ ] **Step 4: Review the final diff**

Run:

```bash
git diff --check
git status --short
git log --oneline -5
```

Confirm:

- no daemon HTTP/ACP/session JSONL changes;
- no eager `loadSession()` call during daemon-worker startup;
- normal worker close and `bridge_stopped` retain durable routes;
- replacement creation is transactional;
- standalone tests still prove eager behavior;
- only the planned files changed.

- [ ] **Step 5: Run code review and address only validated findings**

Invoke the repository's `/review` workflow. Classify every finding as valid,
false positive, or overthinking. Apply valid fixes with focused regression tests
and one conventional commit per independent fix.
