# PR #14369：最终提交独立代码审查

日期：2026-10-18（Asia/Shanghai）。

- 最终审查绑定 HEAD：`553945bd02dd93826acdeb40dbdc0c80baa7bb18`；完整审查基点为 `6dcc44d7ff53b9fd5afb8f9c73ebb10c58f08c7b`，test-only 增量复审为 `3e990cba7f` 和 `553945bd02`，中间正常 merge `81886e580a` 核验父子、23 文件字节继承及 manifest。最终 PR 共 24 文件；没有重做原 23 文件的全量复审。
- 最终已合并上游：`193e3652900c598f568e8444286a7a09549921f1`；历史全量复审时的上游为 `a703a76ae2413601d77ca07dd1addaebba5fe148`。
- 修复提交：`437f97c76b194f54cdc0e6a5c8c0829ad2972a49`；正常合并提交：`1468dc9de1c8a14c9e0d4016ce2b16e764894823`。
- `6dcc44d7ff` 只将 ACP discovery 测试的跨 describe `AgentLike` cast 改成 fixture 自己已声明的 `agent.initialize()`。已核对该 describe 在 `acpAgent.test.ts:32420–32427` 声明 initialize，调用在 `32619`；该笔未改变生产逻辑。
- 范围：历史全量复审覆盖相对 `a703a76ae2` 的完整 23 个 PR 文件、本轮 20 文件 repair diff、23 条原始评论、处置报告及新增回归；随后仅复审 `3e990cba7f` 的单文件测试差异。`81886e580a` 相对 `193e365290` 的 PR 文件仍为同一组 23 文件，且这些文件在 merge 前后字节全同，该节点的 [source-manifest.json](source-manifest.json) 已逐文件复核；最终 `553945bd02` 仅增加一个测试 fixture 的一行 mock，现为 24 文件，原 23 文件完全不变，最终 manifest 状态见下方增审段。生产 `workflow-saved.ts` SHA-256 仍为 `1febf221d369086dd85657554dfc2d1e87c9a968a79e896704444b31ffef8350`。

## 最终 test-only delta：3e990cba7f

- 唯一差异是 `acpAgent.test.ts:1037–1039` 将测试 mock 的 `settings.forScope(scope).settings...` 改为 `settings.forScope?.(scope)?.settings...`，3 行增加、2 行删除。该 mock 仍只读取 SystemDefaults → User → System；没有读取 merged 或 Workspace。缺少方法时 enabled 维持 undefined，后续采用既有 folderTrust 未启用语义，供旧部分 settings fixture 使用；这些 fixture 不能作为 R1-22 的拒绝/授权证明，也不构成生产 LoadedSettings 输入契约或真实合并行为的证据。
- 生产 `settings.ts:228–235` 完全未变：参数仍为 `Pick<LoadedSettings, 'forScope'>`，三个 `forScope` 调用没有 optional chaining，仍使用真实 mergeTrustCheckSettings。四个生产入口（llm 两处、ACP 两处）字节全部未变。
- R1-22 的真实 witness 未被弱化：`workflow-ancestor-trust.test.ts:165–196` 导入真实 LoadedSettings/getOperatorTrustSettings，构造 User 与 Workspace 相反的两臂，先证实 merged 为 workspace 值，再经真实 helper/provider 核对 operator 决定；该文件不 mock settings。`llm.test.tsx:152–159` spread importOriginal，仅 mock loadSettings/createMinimalSettings，因此 `435–522` 的两个 workspace override 分支仍执行真实 helper。`workflow-ancestor-discovery.test.ts:96–102,128–151,196–219` 的第五案例仍通过实际 CLI 启动，operator=true / workspace=false / ancestor DO_NOT_TRUST 时要求独立 user 脚本，核对 fake OpenAI server 请求中的实际 tool result、marker、args 与 canonical selected path；该文件没有 mock settings/helper。
- ACP provenance 的 undefined/empty/nonempty 构造与断言内容均未改变；新 optional chaining 只兼容旧部分 fixtures，不代替上述真实 R1-22 witness。该 mock 本来就是手写最小 folderTrust 视图，不能作为真实 LoadedSettings 全量合并证明，本报告继续以独立真实 helper/入口/集成 witness 为依据。
- 唯一变更文件在最终提交与工作区字节一致，SHA-256：`fb543614756bf55326d4f260b7cd2139cd63f6ee6d01d778c29417fd79292b5a`；delta `git diff --check` 通过。该次增审时 `source-manifest.json` 尚绑定 `6dcc44d7ff`；最终 merge 后已更新并独立核验，见下节，本报告未将历史旧 manifest 冒称为新 HEAD 的核验。
- **增量结论：未发现此次 test-only delta 引入的确认缺陷，原四条 Critical 的生产修复状态不变。** 按要求未重做全量 23 文件审计，也未运行测试、build、bundle、mutation、GitHub 写入或 commit；最终 suite 与 final-bundle E2E 状态由主会话另行绑定。

## merge 继承节点：81886e580a

- `git show -s --format=%P` 确认最终提交 `81886e580ac984722f69412c8ab02d40aeb292a1` 有且只有两个父提交，顺序为本 PR `3e990cba7f4752cfa3875b7efbc6fad4d8c7693b` 和上游 `193e3652900c598f568e8444286a7a09549921f1`，是正常 merge。该次仅承接历史全量审查（6dcc）与 test-only 增量审查（3e），没有宣称重新完成全量审查。
- 最终 PR 相对最新 upstream 的 changed-file set 与 manifest 的 23 路径完全一致。逐一比较 23 文件：`git show 3e:path` 与 `git show 81886:path` 字节相同，最终 commit blob 与工作区字节相同，各自 SHA-256 与最终 manifest 相同；manifest.head/upstream 也与上述两个提交一致。
- merge 相对第一父提交改变的 7 个路径均来自上游、且与本 PR 的 23 文件没有交集。本轮只确认路径和字节边界，未审查这些上游文件的功能正确性：

- `.github/workflows/sdk-java.yml`
- `docs/design/2026-10-18-mcp-restart-matrix-c.md`
- `docs/design/2026-10-18-mcp-restart-matrix-c.zh-CN.md`
- `packages/managed-agent-server/pom.xml`
- `packages/managed-agent-server/src/test/java/com/alibaba/qwen/code/managedagent/HostedMcpRestartFaultGatesIT.java`
- `packages/managed-agent-server/src/test/resources/hosted-mcp-fault-process.mjs`
- `scripts/tests/hosted-process-ci.test.js`

- **绑定结论：本 PR 的全部 23 文件在 merge 中没有字节变化，既有独立代码审查结论可按上述继承证据绑定到 `81886e580ac984722f69412c8ab02d40aeb292a1`；没有新增代码缺陷判断。** 本次未运行测试、build、bundle、mutation 或 GitHub 写入，未将主会话汇报的 green 结果冒称为本审查者执行；最终运行证据仍由主会话汇总。

## 最终 test-only fixture delta：553945bd02

- 最终提交 `553945bd02dd93826acdeb40dbdc0c80baa7bb18` 的唯一父提交是 `81886e580ac984722f69412c8ab02d40aeb292a1`；全部 diff 只有 `acpAgent.worktree.test.ts:316` 增加 `getOperatorTrustSettings: vi.fn(() => ({})),` 一行，没有任何删除或其他文件差异。新增的 PR 路径使相对 upstream 的 changed-file set 从 23 个变为 24 个，原 23 文件逐一与 81886 commit blob 比较均无字节变化，所有生产字节也不变。
- 已读取新增行所在 settings mock、mocked loadCliConfig/Session 和三个 VP 用例。该文件验证 worktree context restore：stale/live sidecar 的 pendingWorktreeNotice，以及 restore 错误时 loadSession 继续且 notice 为空；这些断言没有改动，也不构成 folder-trust/R1-22 授权测试。返回 {} 仅供该测试文件旧 settings fixture 补齐被生产调用的导出，不证明真实 operator 合并、target/ancestor 拒绝或私有宿主能力边界。
- R1-22 的真实权限 witness 没有被替代：真实 LoadedSettings/helper 的双向覆盖文件、使用真实 helper 的 llm 入口测试、mock-only OpenAI server 实际 CLI tool result 与 canonical selected-path 集成案例，以及生产 helper/四入口均在原 23 文件内，字节与已复审节点全部相同；其证据沿用上方 3e 增审和全量审查，而非依赖本行空对象 mock。
- 新增第 24 文件在最终 commit 与工作区字节一致，SHA-256 为 `44be8aa28d4a733bf04ae39bc49c77232003678df576e19b0cd071a976882965`；本次一行 delta 的 `git diff --check` 通过。最终 source-manifest.json 已绑定 553945bd02 / upstream 193e365290，24 路径集合、commit blob、工作区字节和所有 SHA-256 全部一致。
- **增量结论：未发现该测试 fixture 补充引入的确认缺陷；原 23 条处置和四条 Critical 的生产状态保持不变。** 本次只读核对唯一 delta、父子与原文件字节继承；未重做原 23 文件全量审查，未运行测试、build、bundle、mutation、GitHub 写入或 commit，不将主会话/test-engineer 的运行结果冒称为本审查者重跑结果。

## 结论与证据边界

**本次独立静态代码审查未发现仍有效、需要继续修复的已确认 correctness/security/regression defect。** 此结论来自完整 diff、生产赋值/读取链、实际 admission/consumer 控制流和测试 witness 的复读，没有使用 GitHub isResolved 标志代替代码核验。

本轮按要求未运行测试、mutation、build/clean、bundle、GitHub 写入或 commit；只写本忽略目录下的审计记录。原始 bug 复现归属 test-engineer 的冻结 1ca 证据；修复过程中的 red/green/mutation 结果归属各实现者，本报告不把它们冒称为本审查者在最终 HEAD 上重跑的结果。最终 full build/typecheck/focused tests/fast-path、独立 live E2E、远端 CI 与原会话验收需分别绑定最终 HEAD 和最终 artifact；本报告不提前宣告这些状态通过。

## 四条原始 Critical 的实际状态

| 评论 | 最终代码状态 | 当前 HEAD 的确切依据与边界 |
| --- | --- | --- |
| **R1-22** | **有效问题已修复** | `settings.ts:214–235` 提取并复用 operator-only 的 SystemDefaults → User → System 合并；四个生产调用分别为 `llm.tsx:739–741,1081–1083` 和 `acpAgent.ts:4460–4467,15635–15640`，均不使用 workspace merged view 作新祖先授权。真实 LoadedSettings 双向覆盖、llm 入口及第五组真实 CLI 测试保持工作区 false 不覆盖 operator true；没有改全局默认 folder-trust disabled 政策。 |
| **R1-24** | **有效问题已修复；原建议的一行 merged strip 未采用** | core `workflow-ancestors.ts:35` 将当次 canonical target 作为 callback 第二参数；`trustedFolders.ts:230–244` 用同一 fresh rules 先拒绝 target 非 true，再逐祖先判断。`Config` 类型/赋值/getter 及所有生产调用链已核对。新 target-DENY/ancestor-TRUST 回归真实到达 provider；不闭包捕获 process cwd，也不依赖 `loadCliConfig` 的 merged trustedFolder 来决定该能力。 |
| **R1-30** | **原 POSIX world-write witness 范围内已修复** | `trustedFolders.ts:206–225` 在 operator disabled 模式检查 ancestor、`.qwen`、workflows 的 other-write bit，并拒绝不可验证 ancestor/异常错误。三种真实 FS fixture 的反向 deny 和 0775 shared-group 正向控制保留；不强制 UID 相同，不取消普通 gitfile。`209` 明确跳过 Windows synthetic mode，用户文档也说明这一限制；此修复不能被描述成 Windows ACL、任意 ACL、同主体 race 或所有不安全权限的完整防御。 |
| **R1-1** | **有效 ACP consumer 问题已修复；不安全的全局降级建议有理由拒绝** | status `acpAgent.ts:9126–9144` 已在取得 live-session-owner Config 和非 workflow command/skill snapshot 后，仅 catch workflow list，诊断并返回 savedWorkflows=[]。run-saved 在 `13530–13539` 仅 catch list 并返回 changed:false，工具构建/执行仍在其后且不被大 catch 覆盖。原 core `workflow-saved.ts:382–404` 列表 fail-closed 保留，不跳过不可判定的近处 root 去展示远处赢家。原文“所有 name 都坏/无人 catch”不照单采纳；真实独立 path/extension 回归另由 P2-IO 修复。 |

这四条不是统一按“误报”处理：R1-22/24/30 的授权缺陷和 R1-1 的消费层失败均有实际修复；R1-1 仅拒绝与原验收契约冲突的 blanket per-root fallback。

## 其余 19 条评论及新增回归

| 评论 | 最终处置核对 |
| --- | --- |
| **P2-IO** | `workflow-saved.ts:461–475` 的 pathRoot 区分无关 scope 错误与实际输入 owner；`544` 保留必要 owner 错误；最终字节仍需经过 `576–600` 的 owning-root/ordinary-file/no-follow/identity 复验。精确 extension 不依赖无关 root 可用。`workflow-saved.test.ts:1526` 的 project/user 两臂验证 user/project、generated、extension path、qualified extension，以及 owner/name/list 失败控制；没有把非 missing I/O 改成 named fallback。 |
| **P2-CASE** | `savedCandidate:352–362` 直接 probe 后检查 canonical physical basename；列表与按名复用同一谓词，不枚举全目录作单名解析。`workflow-saved.test.ts:1492` 的真实 case-insensitive fixture 确认 uppercase 祖先被两者一致排除、user 获胜且 name 不 readdir；case-sensitive FS 明确 skip，不能据此声称 Windows 已运行。 |
| **R1-4** | 两个 ACP constructor 的 undefined/empty/nonempty capability 矩阵均抵达断言；empty 直接完成正确空串握手，不从永久 rejected 状态恢复。`acpAgent.test.ts:4565` 和 `32748`；生产仍只在 `=== undefined` 时注入。 |
| **R1-14** | `trustedFolders.ts:231–238` 复用既有 debug logger 报告坏规则 snapshot，保持全批 deny，没有新增 console/stderr 输出。 |
| **R1-25** | `workflow-ancestor-trust.test.ts:198` 断言 fresh errors、空 config、合法 grant 不可用；使用 `.not.toBe(true)` 保留 boolean/undefined API 语义。读取器仍在 parse+validate 成功后才发布 config；显式 errors deny 保留。 |
| **R1-5** | Git fixture 的 beforeEach 隔离 system/global config，afterEach 恢复；Windows 用 NUL，其他平台 /dev/null。真实 linked worktree/gitfile witness 保留，生产 Git 行为未改。 |
| **R1-15** | unknown `.git` fixture 移到已积累 ancestor 的父层，因此 guard 缺失将改变返回值/调用 trust，原 symlink/未知类型拒绝仍在。 |
| **R1-16** | no-Git 第一臂仅在 sandbox 外 `.git` probe 返回 ENOENT，并断言走到 filesystem root；内部真实 probes 和后续最近 gitfile 臂不被屏蔽，不以 skip 或错误 errno 假装无 Git。 |
| **R1-19** | 新回归分别覆盖 authorized base file alias、explicit directory before-open、eligible name 后变 symlink、open 前替换普通 inode，断言具体错误/结果，避免只被 O_NOFOLLOW 提前挡住的假 witness。相关实现 no-follow 与 identity 防线仍在 `580–600`。 |
| **R1-28** | `workflow-saved.test.ts:1756` 在 mkdir 前预植逃逸链接，断言 mkdir 未调用、external 为空；原 mkdir 后 relink 测试和保存的两次 assert 也保留。 |
| **R1-32** | `workflow-saved.test.ts:1772` 真实 target/.qwen 普通文件允许独立 user list/name，拒绝无效 project path/save。`isMissing:268–271` 仍只有 ENOENT/ENOTDIR。 |
| **R1-11** | snapshot `286–300` 仅在存在 ancestors 时检查一个 user root；只有 successful root real 才用于 canonical 去重，错误只使去重证据缺失，不授权失败 root。普通 QWEN_HOME 和 parent alias 两臂均断言 list/name/path source=user 且一次 user readdir，原最近祖先顺序不变。 |
| **R1-10** | Workflow tool schema、name-only schema、runtime 提示和两份 bundled skills 均补上仅本地 host 可启用的祖先边界及当前 target 保存；没有新增 source enum/setting/RPC/grant/journal 格式。 |
| **R1-29** | `checkRoot:310–339` 保留明确 refusal reason，`outsideRoots:411–440` 区分 considered/missing 与 refused，包括捕获无关 root 的诊断错误但不准入。`workflow-saved.test.ts:1677` 检查 outside-target 理由而非把该根列作正常 checked。 |
| **R1-35** | `workflow-saved.test.ts:1797` 精确 hook 真实 ancestor realpath，实际 rename/relink 后断言列表不含外树；`checkRoot:334–335` canonicality guard 保留。后续另一次解析的失败不是该 guard 唯一 witness，第一轮 list 结果和 swapped 标志同样断言。 |
| **R1-3** | `readWorkflowFile:480–495` 使用原始字符串上的大小写无关 regex 获取 index/length，保留 owner index+1 的 absolute separator。Unicode owner 测试运行 win32 分支但使用 macOS FS；不能当作 Windows filesystem/E2E 证据。 |
| **R1-2** | 保存 `759–768` 无法验证 project target 时明确拒绝；不 catch 为 undefined 后继续 mkdir，文档已纳入 unsafe/unverifiable root 失败。`workflow-saved.test.ts:1591` 确认 target 被移除后无 mkdir。 |
| **R1-9** | 真 Config 测试经实际 getter 调 core ancestor walk，并核对 provider 同时收到祖先和当前 target；缺省 Config 不扩张。字段仍有四处生产赋值来源和真实读取链，不是仅 fake 配置。没有扩大到其他无关 host 参数。 |
| **R1-12** | root package 的 no-AK curated list 与对应 scripts meta-test 都新增该 mock-only integration 文件；第五案例保留实际 provider 观察的 tool message、marker/args/canonical selected path，而非模型末句。没有扩大整个 CI trigger 或开全量 PR E2E。这里只证明代码接线，未宣称 hosted PR lane 已通过。 |

## 两项 alias 补修及反向边界

1. **Canonical user alias 去重**：snapshot 只使用已获准 user root 的 real，父级系统/用户 alias 可用，user workflows 叶 symlink 仍由 `checkRoot:327–328` 拒绝。失败 user root 的 rejected promise 仍供后续实际使用报错；不会因为 dedup 的 catch 变成允许。没有预验证所有 scope。
2. **Overlapping base-file alias**：`readWorkflowFile:500–509` 需要 verified base root 同时拥有输入 spelling/parent；该证据只阻止 ancestor-only 限制误伤已有 base alias，不授权实际字节。实际 canonical 文件仍必须命中另一个 verified base root 或 exact extension（`566–578`），再走 no-follow/identity。`workflow-saved.test.ts:1655` 的 provider-off/on 对照读取相同独立 user 字节。
3. **反向 guard 保留**：纯 ancestor `.qwen`/workflows/file 链接没有 verified base spelling 权限；原 `C06: ancestor … link into independent user` 三臂及 owner alias 拒绝仍保留（测试 `1454`、`1478`）。target/.qwen 越出 canonical target 不会成为合法 spelling owner；新增祖先 path 仍限制为直接、合法、普通 saved 文件。原 target/user/generated/exact-extension overlapping root 正向场景、nested inline `wf_<hex>` 及历史 fallback 语义没有被新许可替换。

## 消费者和范围核对

- 运行时新权限字段的数据流：四个本地入口 → runtime-only hostPolicy → Config param/field/getter → 当次 workflow snapshot → 严格 Git walk → `(ancestors, canonicalTarget)` callback。workspace settings 不参与此授权，没有新增用户配置或 daemon 信任 RPC。
- private-parent 来源仍来自启动期/构造期捕获值，空字符串也阻止本地 opt-in。restricted modes 在 `loadCliConfig:2531–2538` 中央屏蔽；三个 hosted model/turn 调用仍不注入。没有按握手前后的 mutable 状态放行。
- ACP supportedCommands 和 run-saved 仍是 **live-session-owner**：使用 sessionId 解析的 `session.getConfig()`，不回退 primary/bootstrap 或其他 workspace。catch 仅在 workflow 列表 await；session 查找、writer 错误、实际工具执行不在其内。mutation claim 的既有 finally 释放仍生效。
- Named lookup 不全量枚举；list 非 missing 错误仍失败；selected candidate 的消失/IO/symlink/坏正文不运行远处同名脚本。ACP detail 仍由一次 resolver 结果组合 source/path/body。保存只写当前 target/user，审批与执行的单次字节缓存、digest、nested workflow、path retry/resume 和历史 inline 规则未被重做。
- 正常 upstream merge 未产生额外 PR 文件；未跟踪 output/ 和旧 JSONL 未进入变更。仓库只有 managed-agent-server 存在额外 AGENTS，本 PR 不触及该模块。产品 skills 文本作为审查源码处理，未作为审查代理执行指令。

## 本审查者实际执行的验证

- 读取完整 PR relative-upstream diff、repair diff、所有 23 条原始评论和 disposition，并逐项对照最终 production/test 代码。
- 在 `6dcc44d7ff` 比对 source-manifest 与 commit blob、工作区字节：23/23 文件一致；`3e990cba7f` 增量仅一个 ACP 测试 mock，已独立核对 commit 与工作区字节一致，其他 22 文件及全部生产字节均未改变。最终 `81886e580a` 再核对 merge 父子、全部 23 文件与 3e/working bytes/manifest 一致，PR changed-file set 仍精确为这 23 路径。
- `git diff --check` 对历史完整 PR 和 repair diff 均通过；后续两个 test-only delta 也分别通过该静态 whitespace 检查。
- 复核 final test-only commit 的唯一变化和它使用的 fixture type 声明；未重跑完整编译来宣告 TS2304 已经最终门禁通过。

本报告可作为最终 HEAD 的代码复核记录。最终发布/验收结论仍需主会话把 build、tests、最终 bundle、独立 E2E 和远端读回证据整合后作出。
