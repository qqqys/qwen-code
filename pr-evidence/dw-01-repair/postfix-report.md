# PR #14369 修复后的独立验证报告

最终本地结论：提交 `81886e580ac984722f69412c8ab02d40aeb292a1` 与其最终 bundle 通过新增修复断言 **10/10**、原始 DW-01 五组断言 **19/19**，合计 **29/29**。执行前后独立核对 HEAD、23 个源码文件和全部 1446 个运行产物文件，零不匹配；7 个真实运行模式的 identity 均匹配最终 HEAD 和 CLI hash。已分配的五个优先问题，以及新增 R1-1 ACP 消费层故障响应，在下述覆盖范围内通过复验。

这是一份独立的本地行为与产物核验记录，不是全部 23 条评论的独立裁决，也不代替原会话验收、远程 CI、mergeability 或合入结论。

## 最终源码与运行产物

- 被测 HEAD：`81886e580ac984722f69412c8ab02d40aeb292a1`；合入的上游：`193e3652900c598f568e8444286a7a09549921f1`。
- 被测 CLI：`/Users/qqqys/.codex/worktrees/62f1/qwen-code/dist/cli.js`；SHA-256：`0bcd647c1940ef33c90d666c7fd1a47f2c9fcf2ebddfbc3680f75e3d08465584`。
- 完整 1446 文件运行清单 aggregate：`ac4286890c8fbab861cc150a1e7d55aab52e828a795180b16cbf3af2e577f2fb`，算法为按相对路径 Unicode codepoint 排序后，将 `path + NUL + sha256 + newline` 的 UTF-8 字节 SHA-256。
- 执行前 `2026-10-18T06:11:02.046824+00:00`，执行后 `2026-10-18T06:12:59.881476+00:00`，23 个源码文件、1446 个运行文件、原 feature-before 的 682 个文件以及冻结修复前 1ca 的 683 个文件全部逐一匹配。证据：[provenance-before.json](provenance-before.json)、[provenance-after.json](provenance-after.json)。
- 清单副本：`source-manifest.json` (local detail: `test-engineer/postfix-push-head/source-manifest.json`)、`runtime-manifest.json` (local detail: `test-engineer/postfix-push-head/runtime-manifest.json`)。每个 runtime mode 的 CLI/source/harness/Node/OS identity 与 PNG hash 收据：`identity-and-images.json` (local detail: `test-engineer/postfix-push-head/identity-and-images.json`)。9 个 runner 均正常退出：`runner-results.json` (local detail: `test-engineer/postfix-push-head/runner-results.json`)；语义判断以 29 项断言为准。
- 独立遍历实际 runtime 目录得到 1446 个文件，与清单 key 集合完全相同，无额外或缺失文件：[runtime-inventory.json](runtime-inventory.json)。
- 修复前基线：`1ca1bc1818e58367c09e1ec1f58ad49815b04ae6`，独立冻结源码 archive SHA-256 `99eb8600567062e3138b716b0f52e6103960b3f01a1cb7207d1a884807fdae39`。完整基线结果：[baseline-report.md](baseline-report.md)、`baseline-freeze.json` (local detail: `test-engineer/baseline-freeze.json`)。原 feature-before 使用固定 87de748 构建，和 1ca 修复前基线分开。
- 独立对比此前生产 6dcc 与最终 818 清单：23 个相关文件中仅 `acpAgent.test.ts` 改动，另外 22 个相同；新增上游变更的完整路径清单也留存：`source-comparison.json` (local detail: `test-engineer/postfix-push-head/source-comparison.json`)。最终仍重新执行全部 29 项，而非仅迁移旧结果。

## 前一轮证据保留

6dcc 运行产物的上一轮 29/29 结果、图片和 hash 收据继续保留在 `postfix-final` (local detail: `test-engineer/postfix-final`)；报告及结构化结果另存 `postfix-report-6dcc-provisional.md` (local detail: `test-engineer/postfix-report-6dcc-provisional.md`)、`postfix-summary-6dcc-provisional.json` (local detail: `test-engineer/postfix-summary-6dcc-provisional.json`)。上一轮后验时 test-only HEAD 已变化，因此旧后验总状态 false 被原样保留；最终本轮前后验均为 true。

上一轮清单曾按 Path 对象路径分段排序，aggregate 为 `3c83e9fa11899072726bf18e38d43b8ad7e3f87805f17d4c379029454a41fab9`；更正成相对路径字符串 Unicode codepoint 排序后为 `b7917b7484367268f79698bc1b2962b1679526b9dc6bb409a74fc46bd504e36a`。那次仅更正元数据顺序，1446 个文件 hash/字节未变。本轮最终产物已重新构建，使用上文独立验证的 `ac428689…` 清单。

## 五个优先问题与新增消费层验证

| 问题 | 修复前独立复现 | 本轮修复后独立观察 | 证据 |
| --- | --- | --- | --- |
| P2-CASE | macOS 实际大小写不敏感目录里物理文件 `Audit.js`；list 选 user，名称查询却读 ancestor；真实 CLI 和 ACP list/detail 也不一致。 | list、名称查询、已列出的 user 路径均选 user，返回完整 `DW01_CASE_USER_B73D`；真实 headless 两条路径和 ACP list/detail 一致。未只依赖进程 exit 0。 | [core-postfix-results.json](core-postfix-results.json)、[priority-results.json](priority-results.json) |
| P2-IO | 目标 `.qwen` chmod000 后，独立 user/generated/extension 读取均被无关 EACCES 阻断；真实 inline 生成后路径重放失败，恢复权限后成功。 | 目标目录不可访问时，user 名称、generated 路径、extension 精确路径及限定名称仍工作；user 目录不可访问时，generated 路径、extension 限定名称及 project 精确路径控制仍工作。真正全量 listing 仍明确 reject。真实工具 inline→受阻目录下重放→恢复后重放均返回完整 `DW01_IO_REAL_TOOL_3FAE`。 | [core-postfix-results.json](core-postfix-results.json)、`P2-IO` (local detail: `test-engineer/postfix-push-head/P2-IO`)、[priority-results.json](priority-results.json) |
| R1-22 | operator/user folderTrust=true 被 workspace=false 覆盖，已明确拒绝的 ancestor 仍可从真实 CLI 执行。 | 真实 LoadedSettings 经 operator-only helper 得到 true；用当前 canonical target 调用 provider 返回 false，ancestor 不列出、不读取。真实 CLI 工具不返回祖先 marker。 | [policy-postfix-results.json](policy-postfix-results.json)、`R1-22` (local detail: `test-engineer/postfix-push-head/R1-22`) |
| R1-24 | 目标 DO_NOT_TRUST、父目录 TRUST 时，provider 仍允许祖先脚本正文读取；默认审批仍被强制，因此基线只证明正文准入，不证明未经审批执行。 | 同一 fresh snapshot 检查当前 target 与 ancestor 后返回 false；list 空、resolve miss。operator=true、workspace=false、target DO_NOT_TRUST、ancestor TRUST 的组合控制也拒绝。 | [policy-postfix-results.json](policy-postfix-results.json)，独立断言 R1-24、R1-22+24 |
| R1-30 | trust off、伪造普通 `.git` 文件以及 world-writable 共享祖先使恶意正文进入 resolver。 | POSIX shared/`.qwen`/workflows 的 world-writable 分支拒绝该祖先，正文不可读取；group-writable 0775 的合法控制仍可读取；无 provider 或去掉伪造 marker 均 miss。 | [policy-postfix-results.json](policy-postfix-results.json)，R1-30 各 arm |
| R1-1 消费层 | 本次新增的真实 ACP 故障与恢复验证。 | 正常会话启动后将目标 `.qwen` chmod000，supportedCommands 仍返回 JSON-RPC result envelope：51 个 commands、availableSkills 数组、workflowsEnabled 布尔值、workflowToolFeatures 对象、savedWorkflows=[]；恢复权限后 root-only 再出现。核心全量 listing 的 reject 没有被改成静默成功。 | [acp-envelope-results.json](acp-envelope-results.json)、`ACP-ENVELOPE` (local detail: `test-engineer/postfix-push-head/ACP-ENVELOPE`) |

完整新增断言列表：[priority-assertions.json](priority-assertions.json)，10/10 PASS，记录时间 `2026-10-18T06:12:18.213Z`。R30 顶层 mode 字段是多个控制完成后的最终 0755 状态；world-writable arm 的输入由 harness 的逐步 chmod 设置为 0777，勿将顶层最终 mode 当成该 arm 的输入。

## 原始 DW-01 五组复验

| 组 | 本轮真实路径与结果 | 断言 |
| --- | --- | --- |
| E01 TUI | 实际 Ink PTY：补全 root-only 可见；shared 运行 nearest ancestor；root-only 完成；新增 target 后按名称立即选 target；信任撤销后缓存 slash 被拒绝且未增加执行 journal。 | 5/5 |
| E02 headless | 实际 CLI+Workflow 工具：root/nearest/user/target 完整 markers、嵌套 JSON 参数、受信祖先精确路径、越界拒绝且无正文泄漏、真实子 agent pwd 为 session target、generated 路径可重放、撤销后名称/路径不执行。12 个 headless turns 全部结束。 | 8/8 |
| E03 ACP | 真实 ACP session target 与不同 process cwd 分开；长会话下一次调用看见 trust revoke、无效枚举、坏 JSON、恢复，拒绝时 detail=null。 | 2/2 |
| E04 approval/save | ACP default approval 的首次/重复/相同字节/新字节审批次数为 1/0/0/1，执行 marker 与实际字节一致。实际 TUI 保存 overlay 将 `dw01-saved.js` 写到当前 target，祖先及 user 字节不变。 | 3/3 |
| E05 daemon | 真正 serve 进程的两个 workspace：各自 target+user workflow 能执行准确 marker；ancestor root-only detail=null、run-saved=false，foreign workspace 名称不可见。 | 1/1 |

完整原断言：[assertions.json](assertions.json)，19/19 PASS，记录时间 `2026-10-18T06:12:59.087Z`。原始 pre-feature before 结果继续引用已固定的 87de748 构建，不将 1ca 修复前基线误称为 feature-before。

## 实际 TUI 证据

以下 PNG 从本轮真实 PTY 的 xterm cells 忠实渲染，标题另标生产提交与环境；原 ANSI、cells JSON 和 ASCII 同目录保留。它们不是桌面截图。五张图均已逐一目视核对，补全、完整 markers、拒绝信息及当前 target 保存路径清楚。

- 补全：[after-list-ro-81886e58.png](after-list-ro-81886e58.png)，ASCII [completion-ro.txt](completion-ro.txt)。
- nearest ancestor：[after-shared-81886e58.png](after-shared-81886e58.png)，ASCII [shared-run.txt](shared-run.txt)。
- root-only 完成：[after-root-only-81886e58.png](after-root-only-81886e58.png)，ASCII [root-only-run.txt](root-only-run.txt)。
- 信任撤销拒绝：[after-cached-revoked-81886e58.png](after-cached-revoked-81886e58.png)，ASCII [cached-revoked.txt](cached-revoked.txt)。
- 当前 target 保存：[after-save-81886e58.png](after-save-81886e58.png)，ASCII [save-result.txt](save-result.txt)。

## 方法、隔离和限制

运行环境为实际 macOS、大小写不敏感文件系统、uid 502、Node 24.14.1。真实 CLI、PTY、ACP、daemon 执行使用绑定 loopback 的确定性 mock provider；没有读取真实用户凭据或发起真实模型请求。每个子进程独立 HOME/USERPROFILE/QWEN_HOME/runtime/trust，显式 mock key。权限测试只修改自己的 fixture 并 finally 恢复；R30 仅创建唯一的 `/var/tmp/dw01-r30-*` 目录并 finally 删除，从未创建全局 `/tmp/.git` 或 `/var/tmp/.git`。

R30 证明同 UID 下的真实文件系统准入行为，不声称另一 UID 攻击者实际执行；Windows 仅保留此前路径数学测试边界，本轮没有 Windows 运行证据。一般确定性执行场景可用 YOLO，审批验证专门使用默认 ACP 审批模式。没有将 R24 基线正文准入推导成未经审批执行，也没有把 mock provider 结果推导成真实模型质量。

test-engineer 未改 tracked 源码/测试，未 build/clean/install/commit/push 或写 GitHub。本报告不引用 root 正在执行的 build/typecheck/CLI suite 为本人已完成的检查。构建、typecheck、完整 CLI suite 和 root 的 tracked integration 由 root 单独报告。


## 交付结果

最终报告：[postfix-report.md](postfix-report.md)。机器可读总结果：[postfix-summary.json](postfix-summary.json)；与最终产物同目录的副本：[summary.json](summary.json)。全部被要求的本地复验与最终产物绑定已完成，没有未解释的失败或被宽化的产品断言。
