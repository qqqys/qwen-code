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

## Normal MCP Refresh acceptance (second review repair)

Fixed source: `dae7b3acc479c6e05a0bb189c06e6957d85cadcf`; repair `b9c38d378c513885bd10244452d4f1b73ef4e0d9`; integrated upstream `2b5c4deadb9e9dd0d9d740a52ae42f28ad14bf92`. macOS / Node 22.17.0 / actual built CLI, daemon, ACP, owner Config, bundled MCP and real Chromium.

The previous section's silent MCP-only reload limitation was independently reproduced as a real remaining defect at source `0f3f7df2`. This repair now verifies that normal public `workspaceByCwd(...).reloadRuntimeMcp()` alone refreshes the existing page's owner capability, without a second workspace reload, reattach or model turn. The probe invokes the same API used by the UI action; it does not click the button.

All images use isolated homes/workspaces, a deterministic loopback model fixture, default approval mode and only the exact fixture-tool allow rule. The same unchanged probe first failed on the original head and passed on the fixed head. Both owner readbacks are policy-disabled after restricting mcp.allowed to an empty list.

- `mcp-refresh-original-still-active.png`: original head after normal MCP Refresh and a 20-second observation; the restricted same-page view still runs and rate 40 to 50 still yields 200 requests/s.
- `mcp-refresh-fixed-before.png`: fixed head, before restriction; an actual rate 25 to 40 input produces capacity 100 to 160 requests/s.
- `mcp-refresh-fixed-after.png`: fixed head after restriction and one normal MCP Refresh; the page independently fetches disabled owner context, all three nested iframes and the MCP App are removed, and the readable summary/unavailable note remain after a 20-second observation. No navigation, reattach, second reload, config-disable control or additional model turn was supplied.

The three images were visually inspected. Browser page errors and outside requests were empty. One Worker creation occurred before restriction and none afterward; active Worker count was not directly measured. This evidence is source-specific local runtime validation, not real-model quality, another operating system, native Tauri, hosted CI or production proof.
