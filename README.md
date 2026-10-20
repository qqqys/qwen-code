# Generated UI PR validation screenshots

Source commit: `34eea33014ba7ff50aec5910b7de556b83fca4db`, based on upstream `848111433baffa0fc20af1095f77ec4d014f2c76`. Captured on macOS arm64 / Node.js 22.17.0 / actual Chromium Web Shell.

The CLI/daemon/MCP run from a fresh npm package independently extracted into a directory containing spaces and Chinese characters. Package SHA256: `a4656f2e8b39a22bb6319dd1875179a3f2ca0743307514273f83275973f13d00`.

All four images use deterministic loopback model fixtures and isolated user/workspace directories; no real-model quality claim. The enabled screenshot shows an actual browser input changing the per-worker rate from 25 to 40 and capacity from 100 to 160 requests/s. Disabled-history and live-policy images show the saved readable summary without an iframe or Worker. The exported HTML screenshot shows the complete safe summary; its existing renderer URLs were fulfilled with byte-identical packaged assets and original integrity checks. This is not live CDN publication verification.

The disabled screenshot is the saved history reopened under a reconstructed disabled owner, not a screenshot of a previous product revision. No native Tauri window, Windows/Linux execution, remote CI or production claim is implied.

This branch contains review evidence only and is separate from the feature PR diff.
## Review-fix validation (2026-10-20)

Source: `0f3f7df2a41864d42668f8be0a2a3b59a92c4498`, including repair `044761bd22b3c705313798e337dc69e1f1ea5183` and upstream main `623cb40cf5235b1216ec3264b882c7f7840a466e`. macOS arm64, Node.js 22.17.0, real Chromium. The original four screenshots above retain their original source provenance.

- `generated-ui-idle-before.png`: final built CLI/daemon/ACP/MCP with a deterministic loopback model fixture; changing rate 25 to 40 produces capacity 100 to 160 requests/s.
- `generated-ui-idle-policy-disabled.png`: the same already-connected idle page after saving `mcp.allowed=[]`, applying MCP policy, and using the existing `/workspace/reload` action that emits `settings_reloaded`. The browser requests effective owner context itself, removes all three nested iframes and retains a readable saved summary/unavailable note. No navigation, reload or new attach occurs, and no additional Worker is created after policy revocation. Direct active-Worker termination was not counted. A silent MCP-only reload is not claimed to emit this event.
- `generated-ui-settings-excluded.png`: existing settings-exclusions Playwright scenario, using actual daemon settings descriptors with the source Web Shell and mock browser sessions; excluding all public settings IDs leaves the expected empty settings state. This is separate from the built-daemon Generated UI scenario.

These three images were visually inspected. The two existing settings/collapsed-groups Playwright files passed all three cases with one worker and zero retries. Evidence is local and fixture-based; no real-model, Linux/Windows, native Tauri, hosted-CI or production claim is implied.
