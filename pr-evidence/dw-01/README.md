# DW-01 local workflow evidence

Implementation commit: `1ca1bc1818e58367c09e1ec1f58ad49815b04ae6`; comparison base: `87de74860b73eb6ffd6c1f4dd09b86fcfdc65edb`. These artifacts support a separate implementation PR and are stored on a dedicated evidence branch, outside its product diff.

The PNGs faithfully render actual node-pty/xterm terminal cells from macOS, Ink at 140x40, using an isolated fixture and deterministic loopback mock provider. Captions identify before/after source. They are terminal captures, not desktop screenshots. TUI discovery runs use explicit YOLO; approval evidence instead comes from direct ACP in default approval mode.

Before, `/ro` has no root-only workflow, `/root-only` is unknown, and `/shared` executes the user copy. After, `/ro` offers root-only, `/root-only` completes, and `/shared` executes the nearest trusted ancestor. Saving uses the current target in both versions: the before capture saves the selected user workflow; the after capture saves the newly available ancestor workflow.

`verification.json` binds source and bundle/chunk hashes to all 19 passing semantic E2E checks. Core focused tests: 373 passed; CLI focused tests: 1690 passed; new headless integration cases: 4 passed without retries. Full build/typecheck/lint/format and both serve fast-path gates passed. The default 4GB build attempt hit the Node heap limit; the same complete build passed with a 6GB process heap override. No toolchain file was changed.

The tested artifact uses the implementation commit above. Upstream later moved to `a8eb74fdf5b60851e1fc4a8e258e043273df4411`; the four new commits have no changed-file intersection with the implementation and a local merge-tree check succeeds, but that merged tree was not tested here. Hosted CI, Windows/Linux E2E, real remote models and original-session acceptance remain separate.

## 中文

这些证据对应实现提交 `1ca1bc1818e58367c09e1ec1f58ad49815b04ae6`，对比基线 `87de74860b73eb6ffd6c1f4dd09b86fcfdc65edb`。它们存放在独立证据分支，不进入产品 PR 的文件差异。

PNG 忠实渲染 macOS 上 node-pty/xterm 实际终端单元格，Ink 尺寸为 140x40，使用隔离目录和确定性的本地 mock 模型。图片标注 before/after 来源，属于终端捕获渲染，不是桌面截图。TUI 发现测试显式使用 YOLO；审批证据来自 default 模式的直接 ACP。

修改前 `/ro` 没有 root-only，`/root-only` 是未知命令，`/shared` 执行用户副本。修改后 root-only 可见且执行成功，`/shared` 执行最近的可信祖先副本。两个版本保存均写当前 target：before 保存被选中的用户 workflow，after 保存新发现的祖先 workflow。

`verification.json` 把源码和 bundle/chunk 哈希与通过的 19 项语义 E2E 断言绑定。核心测试 373 项、CLI 测试 1690 项、新增 headless 集成测试 4 项通过（禁用重试）；完整构建、类型检查、lint、格式检查和两个 serve fast-path 门禁通过。默认 4GB 构建触及 Node 堆上限，完整构建在进程堆调到 6GB 后通过，未修改工具链文件。

实测基于上述实现提交。上游后来前进至 `a8eb74fdf5b60851e1fc4a8e258e043273df4411`，新增四个提交与本次改动没有文件交集，本地 merge-tree 检查也成功；但未对合并树运行本地测试。远端 CI、Windows/Linux E2E、真实远端模型和原会话独立验收仍需分别核对。
