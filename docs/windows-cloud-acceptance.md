# Windows 客户端验收交接

2026-10-09（Asia/Shanghai）更新。此前已从远端拉取 `feat/cloud-subscriptions`，在 Windows 完成本地构建、原生窗口和浏览器交接验证。完整登录、沙盒支付返回和安装器生命周期仍待验收。

这里需要的是 Windows 客户端测试电脑。官方后端仍使用现有付费 InsForge，付款由 Waffo 处理，不需要 Windows 服务器。

2026-10-09赠送码更新。代码`77ca20241d0f6d0830acdbbb720e3bf078591dc2`已加入账户兑换、领取记录、重复领取保护及赠送期的结账提示。新的自包含测试包为`.tmp/waffo/hosted/native/gift-refresh/TokenTracker-private-pro-gifts-win-x64.zip`，111615167字节、975个文件，SHA256为`27eceecbbf794caf1cbaf4a60f92bae3ad6cecec341ff7bebacf593476194eed`。877个相关Git源码blob与构建输入一致；独立解压与私有凭据扫描通过。版本仍1.1.13，包不作为正式Release发布。

Windows实机接续时，除下文登录、付款返回和安装器步骤外，补充正常登录后兑换、重复输入、刷新、退出切换账号和撤回后的显示检查。测试路由须由工程侧准备；普通包直接打开不会自动接专用沙盒。macOS/Linux私有管理命令已验证，Windows的NTFS私有ACL未验证，原码生成和断线恢复暂时关闭，应用内兑换不受影响。本轮真实网页验证使用Mac上的Ego Browser，已审查390px/1280px浅深色视口截图；两个真实账号退出HTTP200，服务端会话清除且重载仍未登录。没有新增Windows GUI证据。

## 2026-10-09 Mac 接续

Windows端工作结束后，Mac已快进整合`e40f47f4`，继续修复本地认证及支付返回。新普通Windows入口仅接受`tokentracker://billing/return?order=<canonical UUID>`，导航到当前本地后端的结账查询页；不从链接授予权益或指定账号/环境。正常OAuth回调保持，导航、history和入口日志不再输出完整URL/code。

这6个Windows文件经独立review；官方.NET8.0.425在Mac ARM64执行117/117单测，Release/win-x64交叉编译零警告、零错误。该结果没有新的Windows GUI或OS协议导航证明，下文63项实机单测及窗口证据仍绑定旧源码。最新前端1129项与后端3818项通过、2项跳过，均为Mac验证。

既有InsForge已增加独立的真实QA网关和HTTPS返回页，身份仍由真实InsForge签发；详见[原生沙盒手册](native-sandbox-gateway-runbook.md)。普通包不自动连接QA网关，也不携带沙盒密码、JWT、刷新token或Waffo私钥。另一台电脑从功能分支重新构建；当前Mac本地测试包仅作交叉打包证据。

最新交叉测试包为`.tmp/waffo/hosted/native/TokenTracker-current-private-cloud-win-x64.zip`，来源代码`60780e40863ca20416641b0c14f9a1151ac2e507`。大小111609766字节，SHA256为`1a36e7a9cc2838ae341d2f980ab3e3b9f9536544268da3707e4d33ea054aa8ba`。975个文件独立解压后逐字节和SHA一致；102份CLI、1份入口、274份Windows网页与各自产物集合相同，609份相关源码与该commit的Git blob一致。

Windows网页按现有发布流程以`TOKENTRACKER_BUILD_PET=1`独立构建，包含`index.html`、`pet.html`、`quota.html`和全部法律页面。未复用Mac无宠物入口的网页产物。使用官方Node22.22.2已校验缓存和.NET8.0.425自包含发布，运行时8.0.31。没有执行Windows、安装器或协议导航；这份包替代下文旧ZIP作为本轮工程测试包，源码与包核对不能代替设备验收。

## Windows 本机接续记录

构建验收的源码为 `8e45d91e43456d841b02002532cc6135e4a0a84d`，随后已快进至 `df051a64b230836bbc6bc69d1275d8f22dd6ee22`；远端新增提交仅更新三份交接文档，应用源码与测试包保持一致。本轮修改仅涉及 Git 换行约定、构建校验脚本、测试及验收文档；应用版本仍为 1.1.13，没有发布或启用生产收费。

环境：Windows 11 专业版 10.0.22000、官方 .NET SDK 8.0.425、Windows Node 22.22.2（官方 SHA256 校验通过）、WebView2 Runtime 120.0.2210.133、WebView2 SDK 1.0.4258.31。系统浏览器交接请求的 UA 为 Chrome 154。

| 项目 | 本机结果 |
| --- | --- |
| 自包含发布 | `dotnet publish -c Release -r win-x64 --self-contained true` 成功 |
| 原生单测 | 63/63 通过，TRX 保存在本地证据目录 |
| 前端全量 | 135 个文件、1120/1120 通过 |
| Cloud / 自部署 / 同步 / Windows 目标组 | 456 项通过、1 项跳过、0 失败 |
| 校验及类型检查 | copy、locale、UI hardcode、guardrails、versions、bot frames、Dashboard typecheck 均通过；架构及 bot parity 共 13 项通过 |
| 函数构建 | 18 个 Cloud 函数、14 个自部署函数在 Windows 构建成功；未部署 |
| 发布 DLL 原生集成测试 | 29 项通过。通过 WPF 调用本次 `publish/TokenTracker.dll` 的真实 `ServerManager` 和 `DashboardWindow`，不是浏览器中模拟 native bridge |
| 嵌入运行时 | 实际 Windows Node 启动本地动态端口；首页、runtime config、pet、quota、pricing、terms、privacy 均 HTTP 200 |
| WebView2 | 本地用量、Pro、自部署、设置、结账页面实际渲染并保存截图；无整页横向溢出；关闭后隐藏，重新打开复用原 WebView2 |
| 系统浏览器 | `openURL` 消息触发系统浏览器访问临时 loopback 测试页，实际收到 HTTP 请求；带用户名密码的 URL 未到达测试端点。没有创建支付订单 |
| 嵌入源码一致性 | 105 个 CLI/入口/依赖清单文件、275 个 Dashboard 产物与本机源文件逐字节一致 |
| Portable ZIP | 独立解压，982/982 文件 SHA256 一致；115695913 字节 |

测试使用独立的 CLI 数据和 WebView2 profile。调用系统浏览器时使用已有浏览器配置，避免隔离 AppData 触发浏览器首次启动；没有登录或提交付款。窗口集成测试结束后停止其本地服务。

本机测试包为 `.tmp/windows-cloud/TokenTracker-cloud-subscriptions-win-x64.zip`，SHA256：`4f5e2217f9cce06813a9be7a9ed29d3db0d19d0007a0971eed74fc341b6fc905`。构建和验证证据统一保存在 `.tmp/windows-cloud/`：`native-smoke.json`、`native-*.png`、`embedded-parity.json`、`package-verification.json`、`dashboard-verified.log`、`cloud-verified.log`、`test-results/windows-native.trx`。原生集成测试的本地工程保存在 `smoke/`。

### 本轮修复

- 新增 `.gitattributes`，文本检出统一为 LF，保留 Windows command 脚本的 CRLF 和 Inno 翻译文件原始字节。原 `core.autocrlf=true` 会使 SQL 函数重写报 `Account pricing SQL shape drift`，也会使按 LF 匹配的源码校验失败。规范化后应用源码 Git blob 没有变化。
- 帧生成校验使用 esbuild API，避免 Windows 上直接执行不存在的 `node_modules/.bin/esbuild`。
- 英文结账测试固定英文数字格式，避免中文 Windows 默认输出 `US$` 而使 `$` 断言失败；未改变产品中的货币格式。
- POSIX `0600` mode 断言仅在支持该语义的平台执行，Windows 的合成 mode bits 不能证明 NTFS ACL。checkpoint 的生产写入逻辑没有改变。
- 空队列迁移用例限定为隔离 Codex 来源，避免扫描真实 AppData 历史；榜单双向切换用例保留完整 userEvent 校验并给予 15 秒预算，解决 Windows 负载下的 5 秒超时。

### 本轮边界与待验收

- 一次全仓 Windows 复测为 3656 通过、83 失败、20 取消、34 跳过，**全仓未全绿**。该快照早于最后的空队列测试修复；其后的完整目标组已通过。Ark / Claude Science / WSL 相关的 10 项失败在独立 `origin/main` 快照中同样复现（49 通过、10 失败），不能据此认定其他失败全部为既有问题。完整输出为 `full-fixed.log`，基线输出为 `main-baseline-tests.log`。
- 公开正式账单路由的无登录探测返回 HTTP 404；结账页实际显示“服务可用前不能付款”。普通包仍走正式路由，当前没有本机可用的专用沙盒账号及重新配置的供应商返回通道。真实 OAuth 登录、换账号、付款拒绝/重试/成功、退款后状态及支付返回恢复未完成。
- 没有执行 Inno Setup 安装、升级或卸载。本轮 ZIP 校验不能代替安装器验收。
- 完整托盘程序启动、单实例与 Job Object 清理的额外验证步骤被自动审批审核拒绝，返回 `blocked by policy`，未提供更详细原因，该步骤没有执行。原生窗口集成测试不覆盖 `Program.Main` 的协议注册和完整托盘入口。

## 之前的交叉编译 checkpoint

| 项目 | 证据 |
| --- | --- |
| 编译 | 官方 .NET SDK 8.0.425，符合 CI 的 `8.0.x`；Release/win-x64，0 warnings、0 errors |
| 单测 | 上轮 63/63 通过；本轮原生源码未变，未重复运行 |
| 发布 | `dotnet publish -r win-x64 --self-contained true` 退出码 0 |
| 嵌入运行时 | Windows Node 22.22.2 的官方 SHA256 再次校验通过；102 个 CLI 源文件、1 个入口、273 个 Windows Dashboard 文件及两份依赖清单逐文件一致 |
| Portable ZIP | 112272521 字节，独立解压 974/974 文件大小与 SHA256 一致 |

当前本地包位于 `.tmp/waffo/hosted/native/head-fb792a53/TokenTracker-private-pro-win-x64.zip`。完整证据以 `.tmp/waffo/hosted/native/` 为根目录，包含 `native-acceptance.json` 和 `head-fb792a53/` 内的 `windows-publish-parity.json`、`windows-zip-readback.json`、`source-head-binding.json`。

ZIP SHA256 为 `c09b7b269effc413f40aec59e352df219f0f59f505a17b5aa7c30793b36932f5`。源码来自已推送的 `feat/cloud-subscriptions` commit `fb792a531139e5e3578a04da1748e0ce97df5890`。872 个相关受控文件与该 commit 的 Git blob 一致，构建完成后再次读回无变化。版本号 1.1.13 不能单独证明包包含本轮改动；以来源 commit、包 hash 和构建证据为准。CLI 或 Dashboard 改动后须重新构建核对。

当前 ZIP 已包含 InsForge 的 40/64 位 opaque 匿名公钥兼容性、Pro 头像与标识、中性灰榜单高亮及分页置顶会员标识修复，也包含新主干的 `pricing.html`、`terms.html`、`privacy.html`、`legal.css` 和 LegalLinks 入口。旧 `TokenTracker-private-cloud-win-x64.zip` 及 `pro-refresh/` 内的 checkpoint 包均早于完整主干整合，不能作为本轮测试包。以上证明包含打包与源码一致性；Windows Node、WebView2 窗口及支付返回仍待实机验证。

## 测试电脑到位后的工程步骤

1. 使用专用 Windows 测试账户和临时 TokenTracker 数据目录，保留用户原有安装、配置与本地历史。先读回包 hash，再准备 WebView2 运行环境。
2. 工程侧准备真实应用测试账号、白名单、沙盒 API 路由与付款返回地址。当前测试函数使用 `-sandbox` 后缀，普通发行包仍使用正式路由，直接打开 ZIP 不等于已接好沙盒。Mac 的 5195/5196/5205 操作器地址也不能直接照搬到 Windows。
3. 核对运行时配置与实际请求地址。公钥可进入客户端，服务端密钥、Waffo 私钥和当前测试账号的密码/JWT 不能打包或通过文件搬运。
4. 实测 WebView2 打开系统浏览器收银台、拒付重试、成功付款、关掉返回页及重新聚焦客户端。确认原订单页通过轮询、focus/visibility 恢复会员状态，且不会重复购买。
5. 实测免费本地功能、社区上传、会员同步、暂停恢复、到期或后端离线，以及退出登录和换账号。核对本地队列及旧账号数据不丢失、不混入另一账号。
6. 如果本轮要验安装包，再在 Windows 执行原 PowerShell bundling 和 Inno Setup，检查安装、升级及卸载。当前等价 staging、Info-ZIP 和交叉编译不能代替这些步骤。

每条记录 Windows/WebView2/Node 版本、实际 HTTP 状态与请求目的地、服务端账本或权限读回和关键截图。禁止用“编译通过”代替窗口或付款返回验证。

## 接续入口

在另一台电脑上使用已推送的 `feat/cloud-subscriptions` 分支及本页包 hash 接续。不要从 `main` 的普通发行包推断已包含本轮 Pro 代码。本地 ZIP 未作为正式 Release 发布，可由工程侧转交并校验，或在 Windows 从该分支重新构建。

继续读取 [交付清单](cloud-delivery.md)、[收款运维手册](cloud-billing-operations.md) 和 `tasks/todo.md`。用户已授权提交和推送 `feat/cloud-subscriptions`，由主任务统一执行；仍不发布公开 PR、收费公告或启用生产收费。商户审核已通过，正式凭据、生产部署和真实结算门槛独立保留。
