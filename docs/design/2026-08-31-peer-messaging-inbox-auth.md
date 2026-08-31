# 跨会话消息 inbox 认证令牌

状态：按本设计实施中。

## 目标与边界

给同机跨会话消息（`agents.crossSessionMessaging`）的接收端 socket 增加连接级认证：每个
inbox 生成一个随机令牌，通过本会话的 session registry 记录（0600）发布；连接方必须在首行
发送认证行，之后的帧才会被解析。同时把本会话的 socket 路径与令牌导出为环境变量，允许本会话
启动的子进程（脚本、hook）向本会话注入消息。

动机：现状的访问控制只有文件权限（socket 0600 / 目录 0700）。这在 POSIX 上足够挡住其他
uid，但 (1) 无法迁移到没有该权限语义的传输上——Windows 命名管道支持依赖连接级认证；(2)
socket 路径按 PID 可猜测，而令牌把"能连上"收紧为"能读到接收方的注册记录"；(3) 没有认证就
无法安全开放子进程注入。

本期不做：内核级对端凭证（`SO_PEERCRED` 需 native addon，列为已知差距并写入注释）、
`from` 字段的身份认证（令牌只认证到 inbox 的连接，`from` 仍仅用于回复路由）、Windows 命名
管道（后续 PR，依赖本期）。

## 设计

**令牌生成与发布**。`PeerMessaging.start()` 生成 32 字节随机 hex 令牌，传给
`startPeerInbox`（作为准入要求）并与 `ipcPath` 一起 patch 进 registry 记录（新增可选字段
`ipcToken`）。记录 0600，同 uid 才可读——令牌的分发即文件权限，与发现（`ipcPath`）同源、
同可用性：能发现你的 peer 必然能读到你的令牌。registry schema 版本不变（新增可选字段，
旧读者忽略）。

**线协议**。连接的首行必须是认证行 `{"msgV":1,"type":"auth","token":"<hex>"}`。校验通过
后，后续行按现有帧协议解析；首行不是有效认证行或令牌不符，连接立即断开。认证行不是
`PeerFrame` 的成员——它是连接层的准入，不进入 `onFrame`。probe（只连接不发数据）不受影响。

**回执方向**。用户帧新增可选 `replyToken`：发送方附上自己 inbox 的令牌，接收方用它向
`from` 地址回执（held/delivered/denied/expired/misaddressed）。不选"接收方查 registry 反查
令牌"：`replyToken` 随帧走免去每次回执的目录扫描，且在同 uid 威胁模型下不引入新暴露——能收
到你消息的 peer 本就能从注册表读到你的令牌。

**已接受的权衡**。PID 复用把地址换了主人时（旧进程死、新进程占同一 PID），拿着旧记录的发送
方会带旧令牌拨新 inbox，被静默断连——收不到现状会有的 `misaddressed` 回执，账本停在
pending。发送方每次 `sendToPeer` 都现读注册表，令牌与地址同刻取得，这个窗口只有毫秒级；
同进程内的会话切换（`/clear`、`/resume`，令牌不变）仍走 `misaddressed` 路径不受影响。认证
先于帧读取的协议必然如此。

**兼容性**。功能在实验开关后面，直接收紧、不做协商：新收件端一律要求认证；新发送端在目标
记录带 `ipcToken` 时发认证行，不带时省略（目标是旧收件端时，旧端把认证行当无法解析的行跳
过，仍兼容）。旧发送端 → 新收件端会被拒收，属于文档化的实验期破坏。

**环境变量**。inbox 绑定并发布成功后设置 `QWEN_CODE_MESSAGING_SOCKET`（本会话 socket 路
径）与 `QWEN_CODE_MESSAGING_TOKEN`（本会话令牌），子进程继承后可注入消息，走同一入站闸门
（accept/hold/refuse 判定不变）。close 时清除。

## 改动面

- `packages/core/src/services/session-registry.ts`：记录新增 `ipcToken?`。
- `packages/core/src/ipc/peer-frames.ts`：认证行的构造与解析；用户帧 `replyToken?`。
- `packages/core/src/ipc/uds-inbox.ts`：`requiredToken` 选项与逐连接认证状态；安全模型注释
  更新。
- `packages/core/src/ipc/uds-client.ts`：`sendPeerFrame`/`sendDeliveryStatus` 支持携带
  认证行。
- `packages/core/src/ipc/peer-directory.ts`：`PeerSessionInfo.ipcToken?`（不进
  `list_agents` 输出——该工具输出为显式字段投影）。
- `packages/core/src/ipc/peer-send.ts`：发送时携带目标令牌与自身 `replyToken`。
- `packages/core/src/config/config.ts`、`packages/cli/src/ui/startInteractiveUI.tsx`、
  `packages/cli/src/peerMessaging/peer-messaging.ts`：令牌生成、发布、回执携带、环境变量。
- `docs/users/features/commands.md` 第 6 节。

## 验收

- 无认证行 / 错误令牌 / 令牌前发帧：连接断开，帧不进闸门，不产生回执。
- 正确令牌：行为与现状一致（gate 判定、held、回执、misaddressed 均不变）。
- 旧收件端（无 `requiredToken`）收到带认证行的发送：认证行被跳过，帧正常送达。
- 回执沿 `replyToken` 认证送达；无 `replyToken` 的帧回执按旧格式发出（旧发件端场景）。
- registry 往返：`ipcToken` 写入、读回、`list_agents` 与 `qwen sessions ps` 输出不含令牌。
- 环境变量在 inbox 就绪后可见，`socat`/`nc` 注入路径可用。
