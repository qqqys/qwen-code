# Generated UI PR7a — submission acceptance

Date: 2026-10-16 (Asia/Shanghai). Current PR head: `d50c7df1255d07ba9d5dee0287561ce3016733fd`. Incorporated upstream main: `17d5f774ea5e5c49c6461078efc53a2d91e59d1a`. The PR still contains exactly 29 product files, byte-identical to the original reviewed implementation commit `9e5a8268110caa767f2a2e7f09d6a0318830c02d`. Plans, configuration, logs, screenshots and this report are kept outside the product diff.

## Result

Product build and extension regression gates passed; real-daemon acceptance and test-owned cleanup passed. The supplemental workflow suite has one existing timeout-test failure described below. This optional extension takes one complete HTML/CSS/JavaScript document and a readable summary, then reuses MCP Apps for an immutable, locally interactive card. The generated JavaScript uses a restricted UI API in QuickJS in a Worker; sanitized markup renders in a script-disabled nested frame. The increment adds no core protocol or daemon route.

## Current-head checks

| Check | Result and boundary |
| --- | --- |
| Full workspace build and bundle | PASS on this head with the repository's normal build command |
| Full typecheck and lint | PASS on this head |
| Extension tests | 72/72 PASS: 26 contracts, 8 controller, 24 actual QuickJS, 7 surface, 2 actual surface/runtime interactions, 5 built/packed stdio |
| CI workflow meta-tests | 868 passed, 17 skipped, 1 failed across 10 files. The unchanged autofix handoff/600ms-budget test also fails in one focused rerun; see the diagnostic below |
| Freshness-check tests | 9/9 PASS; the required upstream gate commit is included and the workflow matches the incorporated main |
| Formatting/diff/source identity | PASS: all 29 PR files remain byte-identical to the reviewed and tested implementation; no ignored evidence or generated output in the PR |
| Real daemon quick acceptance | PASS: fresh packed install, both examples, local calculation, refresh, legal reset ID, queued-input consistency and CLI text fallback |
| Screenshot review | Four real full-viewport captures at 1440×900 and390×844, visually checked and SHA-256 bound |
| Independent review | No actionable issue. The new upstream changes have no file overlap with the PR; 19 MCP/result/history/sandbox/ordinary-extension/build consumer fingerprints are unchanged |

The first PR head encountered a hosted CI freshness failure before lint execution: main had just changed the CI workflow in `c3012a523fcd4c2b7d84f3683b2b2896dbbf98b5`. This head incorporates the complete newer main, including that commit, and the full build and affected local checks were repeated. It does not bypass or weaken the gate. Hosted checks on the new head remain separate from the local results in this report.

Supplemental workflow failure: `qwen-autofix workflow > preserves an agent-written handoff when the budget kills qwen after it` returned1 instead of0. One focused Vitest run reproduced it. One equivalent helper diagnostic observed `timeout (600ms)`, an empty agent log and no `handoff.md`; the stub had not written its handoff before the budget expired. The test, runner, Vitest config/setup and warmup are byte-identical to the incorporated main. This local timing-sensitive upstream check remains failed and was not modified or relabeled green; it does not execute Generated UI code. No whole-suite retry or unrelated test relaxation was performed.

Environment: macOS, Node.js25.9.0, pnpm11.24.0, real Chromium155.0.8059.80. No local Windows/Linux execution or whole-repository unit suite is claimed. An earlier standalone CLI rebuild on a previous base hit a 4 GiB compiler heap limit and passed with an 8 GiB retry; the current head's full standard workspace build passed without that override.

## Real daemon and before/after captures

Before and after use separately isolated home/config/runtime directories, actual CLI/Web Shell builds, synthetic trusted workspaces, English UI and dark theme. They use the same question and scores: Plan A responsiveness9/simplicity4, Plan B6/9, starting at 60%/40%. The deterministic loopback model supplies responses; the actual packed MCP extension, daemon, AppBridge and browser execute the integration. This is not a live-model generation-quality evaluation; there were zero paid model calls.

Before has no Generated UI extension, confirmed by actual inventory and tool search. Its Markdown answer already benefits from the host's sortable table. After installs the real archive and adds task-specific controls and local calculation. Changing the weight should calculate locally rather than ask the model again.

| Viewport | Before | After |
| --- | --- | --- |
| Desktop, 1440×900 | ![Existing Markdown table](before-desktop.png) | ![Generated comparison with local calculation](after-desktop.png) |
| Narrow, 390×844 | ![Existing Markdown table on narrow screen](before-narrow.png) | ![Generated comparison on narrow screen](after-narrow.png) |

Current-head observations:

- Weighted comparison starts at A7.00/B7.20. Keyboard End produces9.00/6.00 and Home produces4.00/9.00.
- Capacity starts at4×25=100. Eight workers gives200/40%; rate15 gives120/66.7%; arrivals300 gives250% and excess180. Changing one card leaves the other card's weight unchanged.
- Refresh restores workers4/rate25/arrivals80/weight60 from the initial saved snapshot.
- Synchronous Reset→Calculate settles10/20; same-turn input5→50 settles50/100 and retains eventValue50. The legal `reset` ID remains present.
- Comparison/capacity interaction windows have zero browser requests; the queued-input window has only two existing attachment GET polls. There is no input-triggered POST, tool, message or model call.
- Headless completion has `is_error=false` and a readable title/summary with capacity100 and utilization80%; no HTML/JS source is present in the model-facing result. Browser page-error arrays are empty.

Owned cleanup passed: both daemon/fixture pairs exited successfully, all four ports closed, and owned MCP/browser processes were absent. All1,711 CLI distribution files and all five frozen artifact identities were rehashed after the run and matched.

## Exact artifacts

The full CLI distribution was built after the merge commit and is bound to this head; the 29 PR source hashes were checked against the reviewed implementation. The extension App/server/archive did not change during the main updates. Its App stays below the existing 1 MiB limit; no host budget was raised.

| Artifact | Size | SHA-256 |
| --- | ---: | --- |
| Fixed App HTML | 789,985 bytes | `e68cb9920e58853c9b94c143bdee652e1e21a63041e3a86e7dedc4440b40b85e` |
| Bundled stdio server | 1,081,752 bytes | `d7f580addb310ee9f811e25e81377fad33752c2e7e081c9a3bab8933e94eb960` |
| CLI launcher | 13,802 bytes | `b52440df66839de81a4ff9f6e8831024da0da6cbc15626018cf0f5e823e99c83` |
| Packed extension0.25.2 | 572,798 bytes | `155b1af37f84a5b1f11a45b2b2f146ffb40c580ade7c24900b8d3f2ca4288287` |
| Complete CLI distribution manifest | 1,711 files | `dce54232b6ef6dc3916ba517da7b64411aa71d0f54ea13f4532efad335fd1d72` |

## Earlier evidence and limits

The broader real-daemon matrix was run earlier in this submission on base `8bd79c9` with the exact same extension bytes: two workspace isolation, Stop/late-result behavior, replay after terminating the exact MCP processes, duplicate-ID readable error, and12,001-character input rejection all passed. This is distinct from the new host's deliberately bounded quick acceptance. Earlier workspace/script checks passed109 with1 skipped; the intervening hosted-team main delta passed68 tests. The [prior detailed report](https://github.com/qqqys/qwen-code/blob/d525b3f2bf1f5ca77226aaec2bcf045c4592f333/acceptance.md) preserves those original bases and artifacts.

Previously, two actual `kimi-k3` generated synthetic examples were accepted without editing their source and verified against the same final App in normal and data-URL host modes. They are two examples, not a broad quality benchmark, and were not regenerated for these screenshots. Two capacity-example wording discrepancies remain explicitly recorded in the prior report; successful arithmetic/interaction does not imply that every generated explanation is correct.

The API provides no browser DOM, network, imports, timers, filesystem, MCP-tool or message capability. It bounds the guest heap, stack, execution time, input/output and document size, but does not claim to bound every browser rendering workload or prove the absence of all sandbox defects. Network probes in earlier acceptance saw blocked CSS attempts and zero requests reaching the controlled sink; those are different observations. Refresh restores the initial snapshot. Persistent interaction state, streaming/partial views, modifying old cards across turns and external libraries are out of scope.

All source, screenshots, reports and claims above are bound to the stated local evidence. Hosted CI, external review, merge and release are separate states. No scheduled monitor was created.

## 中文摘要

已合并当前 main，PR 仍只有29个产品文件且实现内容未变。新 head 的整仓构建、bundle、typecheck、lint及72项扩展回归通过，freshness检查9/9通过。附加workflow套件868通过、17跳过、1个已有600ms超时用例失败，单跑同样失败；原始失败被保留，不计为全绿。新宿主上的真实daemon验收及桌面/窄屏四张截图分别绑定本次CLI产物；此前更完整的隔离、Stop、离线历史与负例矩阵保留原基线，没有冒充重跑结果。

首次远端失败是main在验收期间更新了CI配置，freshness检查要求同步；本次完整合入了该更新，没有绕过门禁。本地集成使用确定性loopback模型和合成数据，不代表通用模型生成质量；macOS本地通过也不等同远端CI或跨平台通过。
