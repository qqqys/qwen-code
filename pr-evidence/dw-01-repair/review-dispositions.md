# PR #14369 review 逐条核实与修复

审查基线：`1ca1bc1818e58367c09e1ec1f58ad49815b04ae6`。最终修复提交：`553945bd02dd93826acdeb40dbdc0c80baa7bb18`，已正常合入上游 `193e3652900c598f568e8444286a7a09549921f1`。23 条评论覆盖 22 个 threads；没有把 Critical/Suggestion 标签直接当作真实性或严重性的证据。

有效的授权、路径一致性、消费层异常和测试缺口已修复。没有完全按原评语建议照搬：core 列表的非 missing I/O fail-closed、不可验证 target 的拒绝、错误私有握手的终态和 operator-disabled 策略均保留。下表逐条解释限定或误判部分。

| 评论 | 处置 | 核实结果、修复及未采纳原因 |
| --- | --- | --- |
| [R1-22](https://github.com/QwenLM/qwen-code/pull/14369#discussion_r4303556434) | 有效，已修复 | 四个入口改用 system-defaults → user → system 的 operator trust view，workspace 不能决定祖先授权；补双向开关和真实 headless 回归。 |
| [R1-24](https://github.com/QwenLM/qwen-code/pull/14369#discussion_r4303556444) | 有效，窄修 | 每次解析将当前 canonical target 传入 provider，与祖先使用同一 fresh trust snapshot；target 未知、拒绝或撤权时整批拒绝。不采用受 merged settings 影响的单行 !trustedFolder 修法。 |
| [R1-30](https://github.com/QwenLM/qwen-code/pull/14369#discussion_r4303556450) | 限定范围有效，已修复 | POSIX trust-disabled 模式拒绝 ancestor、.qwen、workflows 的 other-write 权限和无法验证状态；三种真实目录回归及 0775 共享正向控制。保留 gitfile；未声称验证 Windows ACL、跨 UID 攻击或所有权限模型。 |
| [R1-1](https://github.com/QwenLM/qwen-code/pull/14369#discussion_r4303556459) | 部分有效，已窄修；语义分歧保留 | ACP status 仅隔离 workflow 列表错误，保留其他 command/skill/features；run-saved 失败返回 changed:false，不启动工具。core 非 missing I/O 仍按原验收契约拒绝，不逐 root 吞错展示远处赢家。无关 path/extension 部分由 P2-IO 修复。 |
| [R1-12](https://github.com/QwenLM/qwen-code/pull/14369#discussion_r4303556463) | 有效，已修复 | 加入 PR no-AK curated integration list，同步 meta-test；新第五例检验 workspace false 不能绕过 operator true。接线测试先红后绿，实际集成测试另验。 |
| [R1-4](https://github.com/QwenLM/qwen-code/pull/14369#discussion_r4303556471) | 有效测试缺口，已补 | 空 capability 正确握手后到达 new-session 与 workspace-discovery 两个 provider 断言。双 truthiness mutation 精确两红；错误握手会永久 rejected，不能照建议在同一 agent 重试。 |
| [R1-14](https://github.com/QwenLM/qwen-code/pull/14369#discussion_r4303556479) | 有效诊断缺口，已修复 | 复用现有 debug logger 记录坏 trust snapshot 路径与原因，同时整批拒绝；没有新增 console/stderr 输出。 |
| [R1-25](https://github.com/QwenLM/qwen-code/pull/14369#discussion_r4303556486) | 有效不变量测试缺口，已补 | 新测试证明 mixed valid grant/invalid enum 的 fresh reader 不发布部分规则。reader 赋值前移 mutation 会红；保留显式 deny。空规则 API 仍为 undefined，由 provider ===true 转 false。 |
| [R1-5](https://github.com/QwenLM/qwen-code/pull/14369#discussion_r4303556493) | 有效测试隔离缺口，已补 | 隔离 system/global Git config 并恢复 env；真实 linked worktree 继续运行。恶意 ambient hook 的原 fixture 已复现失败。 |
| [R1-15](https://github.com/QwenLM/qwen-code/pull/14369#discussion_r4303556494) | 有效 guard witness 缺口，已补 | unknown .git 类型放在已经积累祖先的父级，删除 guard 将改变结果，不再是空前缀假绿。 |
| [R1-16](https://github.com/QwenLM/qwen-code/pull/14369#discussion_r4303556503) | 部分有效，已补 | 只为 no-Git arm 控制 sandbox 外 .git=ENOENT，并断言走到 filesystem root；保留内部真实探测。其余有自身 Git 根的 fixtures 不会普遍越界读取真实 HOME。 |
| [R1-19](https://github.com/QwenLM/qwen-code/pull/14369#discussion_r4303556515) | 有效测试缺口，已补 | 增加合法 base alias、显式目录、eligible 后 symlink 替换、open 前普通 inode 替换；另修合法重叠 base-file alias 的 provider-on/off 不一致。反向 ancestor-only 链接仍拒绝。 |
| [R1-28](https://github.com/QwenLM/qwen-code/pull/14369#discussion_r4303556523) | 有效副作用测试缺口，已补 | 在 mkdir 前预植逃逸 .qwen alias，验证拒绝且 mkdir 未调用、external 仍为空；保留 mkdir 后再校验。 |
| [R1-32](https://github.com/QwenLM/qwen-code/pull/14369#discussion_r4303556529) | 有效 ENOTDIR 测试缺口，已补 | 真实 target/.qwen 普通文件允许独立 user list/name，仍拒绝 project path/save；isMissing 仍仅 ENOENT/ENOTDIR。 |
| [R1-11](https://github.com/QwenLM/qwen-code/pull/14369#discussion_r4303556534) | 有效，已修复 | 去掉与已获准 user root 重复的祖先，普通路径和 parent alias 均保持 source=user、一次扫描。只检查一个 user root，错误不变成授权，不预查所有 scopes。 |
| [R1-10](https://github.com/QwenLM/qwen-code/pull/14369#discussion_r4303556542) | 有效提示契约遗漏，已修复 | 同步 tool name/scriptPath/runtime 和 authoring/creator 技能文本，明确 local host、最近 Git 根及当前 target 保存；保留 prompt 长度门禁。 |
| [R1-29](https://github.com/QwenLM/qwen-code/pull/14369#discussion_r4303556550) | 有效诊断缺口，已修复 | 记录 unsafe-root reason，checked/missing 与 refused 分开显示。checked 并不本身表示授权；未改变拒绝控制流。 |
| [R1-35](https://github.com/QwenLM/qwen-code/pull/14369#discussion_r4303556559) | 有效 canonicality guard 测试缺口，已补 | 在真实 realpath 时 rename/relink 祖先，列表不得暴露外部脚本；不伪造 canonical 返回值，保留原 guard。 |
| [R1-3](https://github.com/QwenLM/qwen-code/pull/14369#discussion_r4303556565) | 有效，已修复 | 在原字符串上做不区分大小写的 marker 匹配，避免 Unicode 小写扩展改变 index；测试覆盖 win32 分支，不冒称 Windows FS/E2E。 |
| [R1-2](https://github.com/QwenLM/qwen-code/pull/14369#discussion_r4303556570) | 错误提示有效，已修复；拒绝语义保留 | 无法验证 project target 时给明确 refusal，证明无 mkdir。不能 catch→undefined 后继续创建/写入；原拒绝边界正确。 |
| [R1-9](https://github.com/QwenLM/qwen-code/pull/14369#discussion_r4303556576) | 有效真实 Config 见证缺口，已补 | 真实 Config 构造/field/getter 进入实际 walker，验证 provider 收到 ancestors 与当前 target；缺省不扩张。不扩到其他无关 host 参数。 |
| [P2-IO](https://github.com/QwenLM/qwen-code/pull/14369#discussion_r4305810158) | 有效，已修复 | 不可访问的无关 project/user root 不再阻塞独立 user/project/generated/registered-extension 的显式路径与 qualified extension。实际 owner 错误与 named no-fallback 仍保留。 |
| [P2-CASE](https://github.com/QwenLM/qwen-code/pull/14369#discussion_r4305810326) | 有效，已修复 | direct candidate 检查 canonical physical basename，与 listing 使用同一合法名规则；真实 macOS Audit.js/audit 回归保持 user winner 且不 readdir。 |

## 验证边界

修复前冻结原始 source/runtime，真实文件系统及实际 CLI/ACP 复现 P2-IO、P2-CASE、R1-22/24/30。修复过程中保留先红后绿日志和三项 mutation 见证。完整构建检出新增测试类型引用错误，随后完整 CLI suite 检出旧 partial settings fixtures 缺少 forScope 的 mock 兼容问题；两者均经 test-only commit 修正，生产逻辑未因此改动。完整构建/typecheck 和最终受影响 CLI 包构建、1,944 项 CLI 测试均通过。补查另一 worktree 消费者时复现旧 mock 漏导出 helper 的三项失败，一行补充后 worktree/plan-mode 四项通过；此笔仍只改测试。最后一次上游 merge 未改变本 PR 23 文件的任何字节，受影响 meta-tests 已重跑。

最终验证结果见 validation.json、postfix-report.md 与独立代码审查报告；全仓构建使用 6144 MiB Node heap（原构建脚本默认 4096 MiB）。local tests、mock-provider 的真实 CLI/ACP/TUI 流程、hosted CI、review approval 和 mergeability 分开记录。POSIX 权限与 macOS 大小写 FS 的证据不扩展到未测 Windows ACL。

R1-1 的有效消费层部分已修，整体列表降级与原验收契约的分歧保留在 thread 中供 reviewer 确认，不代替 reviewer 作正式 approval。没有 force push、merge、转 ready、调用 review bot，未跟踪的旧 output/ 和 JSONL 未纳入 PR。
