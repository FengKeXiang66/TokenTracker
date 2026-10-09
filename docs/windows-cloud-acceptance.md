# Windows 客户端验收交接

## 后续安全修复候选：等待新 CI 与安装包验收

已修复 Bearer 前缀解析的重叠正则、静态文件 stat/读取路径竞态，以及 gift admin 的私有凭据与 resume 文件 lstat/读取路径竞态。解析改为仅匹配前缀；静态资源通过同一打开的 descriptor 检查和读取；gift 文件用 O_NOFOLLOW/O_NONBLOCK、owner/mode/类型与大小检查，并从同一 descriptor 限量读取和关闭。Windows 私有文件入口仍按原 ACL 门槛关闭。支付测试 URL 条件改为精确 origin 判断。

新 Windows Node22 目标回归：96 项、89 通过、0 失败、0 取消、7 条件跳过，11 秒；九份源码/测试文件运行前后 hash 一致。新增三项 POSIX 私有文件竞态/权限回归在 Windows 明确跳过，必须由 macOS/Linux CI 实际执行，不能按本机验证写通过。旧静态服务器在同一替换回归实际失败；旧 Bearer 表达式对长空格加两个换行的畸形值在隔离进程超出 1.5 秒预算，修复后完成。纯空格值没有复现超时，且 Node HTTP parser 本身拒绝含换行的 HTTP header，未把畸形值探针写为已证实可远程利用的 HTTP 攻击。

该 src 安全改动尚待新的完整 CI、CodeQL 实际安全门禁及候选包核对；下文 29b02f5a / 应用 896baa52 的全量与包证据只证明改动前源码。正式收费、会员限制、归档和实际资金门槛保持未启用/未通过。证据 acceptance-windows-security-final-fixes.json/log、acceptance-security-before-fixes.json。

2026-10-10（Asia/Shanghai）更新。上一已核验应用候选为 **1.3.0 / 896baa52**，修复 Node22 中文目录递归复制的原生崩溃；实际 Node22 完整本机回归已通过：363 文件、3830 通过、0 失败、0 取消、47 条件跳过。最新受审 head 29b02f5a 的四平台 CI、新包核对、30 项原生窗口及 18 项包内专项已通过；CodeQL workflow 成功，但 PR 安全门禁有 27 条注释需工程审查/修复。前一 60b8935b 的 CI/982 文件候选包/107 嵌入源码核对及 30 项原生窗口检查仅证明旧源码。正常邮箱登录与换账号证据亦保留原始来源。完整托盘、系统协议付款返回和安装器生命周期仍待验收。

这里需要的是 Windows 客户端测试电脑。官方后端仍使用现有付费 InsForge，付款由 Waffo 处理，不需要 Windows 服务器。

本轮已在原 Windows 工作区重新拉取功能分支。当前源码和本机回归统一记录在 [上线前交接总表](cloud-release-readiness.md)。下文按来源保留 Mac 交叉包和 10 月 8 日实机记录；这些包都不是后续合入主干后源码的正式发行产物。

## 当前 Windows 接续证据

896baa52：安装包中的 Node22.22.2 补查暴露 native recursive copy 的 Unicode 路径退出码 3221226505。已用隔离目录复现，技能导入/链接 fallback 的 fs.cpSync 在 Windows 使用恒真 filter 保留全部条目并选择 JS 遍历，同步安全 guard 不变。新增子进程测试复制中文用户目录和 UTF-8 嵌套文件，并强制链接 EPERM 验证真实复制；TRAE trim fixture 保留真实完整运行库检查。

实际 Node22 的完整本机回归在 188 秒自然结束：3877 项、3830 通过、0 失败、0 取消、47 跳过；四项 profile 与子进程 Node PATH 隔离，四份变更文件在运行中及提交绑定一致。证据 acceptance-windows-node22-copy-full-fixed.json/log、acceptance-node22-copy-commit-binding.json；此前 Node22 的单文件崩溃保留在 acceptance-windows-packaged-node22-full.json/log。Node22 专项 62 通过/6 跳过，Node24 专项 74 通过/6 跳过，无失败或取消。最新受审 head 为 29b02f5a，应用源码仍为 896baa52；CI 37973812448 四个 job 均通过，Windows Node24 与实际包内 Node22 全量均 3840 通过/37 跳过/0 失败/0 取消，.NET 117/117。CodeQL workflow 成功，但安全门禁并未通过，见总表。

受审 head **29b02f5a9960cdb0b16cfb2d5215ad1c9f4336c1** 的 Windows 产物已独立下载核验：archive 195992529 字节、SHA256 7af2e4e1a6e81d809536a9c138edb92caa19093384c0a2ad5a767f8ca4bdd48f，与 GitHub digest 相同；checkout a4e489556b14aaa67a32dceb46d67fc71a92eb33 的 tree 275f67f25cbe7d2d81cba5fbebeea85b31060851 与受审 head 一致。982/982 文件大小/hash、107 份嵌入源码 Git blob 全匹配；四项现有私钥/管理 key 字节模式零命中。ZIP 115719886 字节、SHA256 a33757e232db0499cfb03792805a58f5d09ba6b164694c75174220d164c79e80；Inno 81394638 字节、SHA256 692c733aae89b33f3a0b0e96dff8dd8e938cf64ea63489508ed595eea51c5082。

实际新 CI DLL/EmbeddedServer 的 30 项原生窗口检查通过，node22-copy-ci-native-final/native-smoke.json；实际包内 Node22.22.2/OpenClaw/中文技能复制另有 18/18，acceptance-node22-copy-packaged-modules.json。前两次宿主构造失败（多复制 CLR host 文件影响 framework 查找；Smoke deps 预解析 harness 内 DLL）均保留失败记录；最终只复用 Smoke 测试宿主并移除其应用 deps 绑定，发布 DLL、WebView2 loader 与 EmbeddedServer 全部来自新包，源码位置断言通过。没有操作已有用户安装；不是完整 Program.Main/单实例/Job Object、OS 协议支付返回或安装/升级/卸载证明。

CodeQL 的 workflow 37973812430 执行成功，但 PR 的 CodeQL 安全门禁 113968044957 失败，报 27 条新注释（13 high、14 medium）；分支总计 42 条 open，主干 23 条 open，按告警编号比较有 21 条仅在分支存在。扫描流程成功不等于安全验收通过，注释数量也不等于已经确认的可利用漏洞。原始注释、分支/主干比较私有保存；工程继续逐项判定和修复，不能把 Owner 登录或资金门槛当作这部分工程工作的替代。

以下 60b8935b 是前一阶段。

60b8935b 修复 OpenClaw npm 的 Windows .cmd 启动问题：读取 PATH 对应 npm 包声明的 JS bin，用当前 Node 直接运行，保持中文/空格/&/% 路径和特殊参数，不启动 cmd shell。hook/session plugin 共用启动逻辑，启动失败、超时及信号退出不会误报成功；53 项相关回归通过。完整回归 3876 项、3829 通过、47 跳过、无失败或取消，184 秒自然结束。运行中源码 hash 保持，并在提交前逐文件核对；acceptance-windows-release-full.json/log 与提交绑定记录提供来源。

Windows CI 改为构建 Dashboard 后运行完整 Node 测试，并校验官方 SQLite 测试工具大小与 SHA3-256；不修改产品或系统 PATH。47 项本机跳过保留原因，新增平台限制仅用于 Unix nvm/procfs、POSIX env/shebang 和 Linux Bash 包装夹具，Linux/macOS 继续执行。Windows 原生进程/端口和 Node 通知链仍测，目录链接用 junction 实测。POSIX mode 不是 NTFS ACL 证明，本地扩展路径的 UNC 前缀覆盖不等于 WSL 挂载证明。最新 CI 37970035795 四个 job / CodeQL 37970035738 全部通过；Windows CI Node 3839 通过、37 跳过、无失败或取消，本机额外十个符号链接用例在 CI 通过。macOS Node 3870/4 跳过，Linux Node 3866/8 跳过，均无失败；Windows .NET 117/117。

60b8935b 产物的 archive SHA256 c24b1da9e8f461a0082dc58fe3c8a47d5f7415e14fea8b5506e04558e7685a80 与 GitHub digest 相同；实际 checkout f828941f2f934887d08153402a60d4ebcd8d7e5b 的 tree 649e60a7dca5380593263e2d90031c7aa85f49b2 与受审 head 一致。982/982 文件大小/hash 和 107 个嵌入源码 blob 匹配，四项私钥/管理 key 字节模式零命中。ZIP SHA256 bfd3dcc267e60841fac380c67de56dd2378ea67fde3a0565f902524020cc7012，Inno SHA256 9a2622e808153a1ae240b8f7abc864a3b6816dfaba9f387dd97b6e27c32366c4。实际新 CI DLL 与 EmbeddedServer 的 30 项原生窗口检查通过，release-ci-native/native-smoke.json；实际打包 Node22.22.2/包内 OpenClaw 模块另有 17/17，acceptance-release-packaged-openclaw.json。Node24 全量与 Node22 专项范围分开，未称 Node22 全量通过。详细大小与原始证据见总表；以下 b0a6544d 及旧记录仅证明各自源码，安装器生命周期和完整 Program.Main/协议付款返回仍未执行。

后续排障修复了 TypeScript 检查启动 npm.cmd 的 EINVAL、Markdown 索引路径使用 Windows 反斜杠，以及 Ark timeout fixture 将所有 where 查询都错误映射至 arkcli.exe 的卡住。前两组 11/11、Ark 专项通过，Node24 全仓随后在 172 秒自然结束：3764 通过、67 失败、0 取消、38 跳过，未触发测试文件超时；不是全绿。进一步修复 Roo/Kilo 自定义目录列表拆开 Windows 盘符的问题，使用系统 path.delimiter；真实目录扫描和两次解析去重/backfill 14/14 通过。新的 CI 已覆盖这些检查。该 src 改动发生在下文 8497d6e9 包之后，旧包不能代替新候选的打包验收。

b0a6544d 的 CI 37965509474 四项及 CodeQL 37965509485 全部通过。精确 head 的隔离全仓 Node24 回归自然结束：3770 通过、61 失败、0 取消、38 跳过，168 秒，无文件超时，acceptance-windows-after-drive-fix.json/log；仍不是全绿。新 CI 包已独立下载验证：archive SHA256 4e9e35e9abd18b817c3d53c97dc45fd4ed156a614d3f9c22ec8f281f3316b06c 与 GitHub digest 一致，checkout 7fed619a2dbadde08353923ec62128adcb1cb10f 的 Git tree 与 head 一致，981/981 文件和 106 个嵌入源码 blob 均匹配。ZIP SHA256 cb394f582aee5726b89c45eb983f2815f9218ae55cb701368eefbc7a75166bb3，安装器 SHA256 424b9e3fd37b7e0b46cd05bd69d43059320f99fccac8b24791ca5c6e641a362f。当前四项私钥/管理 key 字节模式零命中；旧 QA 凭据已清除，未把上一轮十项扫描数量沿用到新包。新 CI DLL 与打包 Node 的 30/30 原生窗口检查通过，证据 triage-ci-native/native-smoke.json；完整托盘、协议付款返回及安装器生命周期仍待验证。

1c96a2cc 的 CI 37956050272 四个 job 全部通过，Windows .NET 117 项及完整 ZIP/Inno 安装器构建成功；CodeQL 全通过、开放告警为 0。Dashboard 当前 1192/1192 通过。旧全仓 Windows Node 快照为 3728 通过、80 失败、20 取消、38 跳过；新的 Node22 隔离对照为 3738 通过、70 失败、20 取消、38 跳过，最新 e6186b35 主干亦有 93 失败。具体匹配边界见总表，不能以目标组或 Linux/macOS 全绿替代。新增同步专项的三项失败来自真实 AppData 混入 fixture；隔离 APPDATA/LOCALAPPDATA 后 27/27，已加入 Windows CI。

原生测试宿主加载发布目录 DLL，并使用隔离 WebView2/应用数据。最初宿主输出目录缺少 EmbeddedServer，使应用的开发 fallback 使用系统 Node16，auth proxy 返回 502；该次不能算嵌入 Node 登录证明。补齐宿主的打包资源后，普通邮箱登录真实 InsForge 测试账号成功、Pro 年付 US$39.99/月付 US$4.99 显示正确、固定期切换正确，试用/付款在 preview 禁用。系统浏览器 loopback、安全 URL 拒绝、窗口隐藏/重开均已执行；不是完整 Program.Main 托盘或 OS 深链返回证明。

当前干净 1.3.0 发布目录通过 34/34 原生检查，并显式断言使用打包 Node。普通 UI 的登录 B、重载保持、退出后重载清除及切换 A 共 7/7 通过，身份使用实际账户页的邮箱/UUID核对。A/B 专用账号随后已删除并验证旧密码被拒绝；原有用户和安装数据不变。

私有证据位于 .tmp/windows-cloud/acceptance-rc-clean/、acceptance-native-ui-rc.json、acceptance-qa-cleanup.json、acceptance-auth-gifts.json（16 项真实 API）、acceptance-live-preview.json（8 项正式 preview API）。这些 API 测试不等于成功 Windows 赠送 GUI 或真实资金验收。

CI 51bdcdfd 的完整 review artifact 已下载并验证 GitHub archive digest，ZIP 独立解压 981/981 文件大小与 SHA256 一致。实际 workflow checkout 为 merge SHA 042850b2，其 tree 与 review head 51bdcdfd 相同；该旧包版本 1.2.2。1.3.0 的本地干净包已验证 379 个输入、981 文件；CI 已生成新版 ZIP/安装器。最终 artifact 已完成独立下载核对；来源与完整 hash 如下，不沿用旧包 hash。

最终源码 8497d6e998369a8d4c90b2901ec089ed5dd7930a 的 CI artifact 已独立下载：archive 195981496 字节、SHA256 241d97ae378869532f172976b4662104696648b3af73e3410de4979cb80dc6c8，与 GitHub digest 一致。实际 checkout 为 7fd5fbfb86e6dda495fb773a8e09465a8eb0198d，Git tree 与受审 head 相同。1.3.0 ZIP 115718586 字节、SHA256 c3fab9a59fbe318c9d016897d1db7d712bceb53daba5ce1fa75bac64e9323fd4；Inno 安装器 81384336 字节、SHA256 0f898ddd528997710ce6684757b471b6caab81d8fbc3d02d1a520003a30edd30。解压 981/981 文件大小与 hash 一致，106 个嵌入 CLI/入口/清单源文件与 Git blob 一致，10 项实际私钥/管理 key/已撤销 QA 凭据的逐字节扫描命中为 0。安装器尚未执行安装/升级/卸载。

最终 CI DLL 与打包 Node 已执行 30/30 原生检查，证据为 final-ci-native/native-smoke.json。首轮仅复制宿主顶层文件而缺少 WebView2Loader.dll，导致窗口初始化失败；CI 包含此 loader，补齐宿主的 CI loader 后通过，失败记录保留为 native-loader-fixture-failure.json。此次不是 Program.Main、深链付款返回或安装器生命周期测试。旧混用目录包含残留前端 hash 文件，校验器已拒绝，该目录不能作发行包。

本机安装 Inno 的动作被自动审批审核拒绝，仅返回 blocked by policy，未执行；CI 使用预装编译器的构建已通过。完整托盘测试和工具拒绝的协议点击仍保持待设备验收，不用其他工具绕过。已有个人安装、注册表和历史数据保留。

## 2026-10-09 Mac 赠送码交接（历史）

2026-10-09赠送码更新。代码`77ca20241d0f6d0830acdbbb720e3bf078591dc2`已加入账户兑换、领取记录、重复领取保护及赠送期的结账提示。新的自包含测试包为`.tmp/waffo/hosted/native/gift-refresh/TokenTracker-private-pro-gifts-win-x64.zip`，111615167字节、975个文件，SHA256为`27eceecbbf794caf1cbaf4a60f92bae3ad6cecec341ff7bebacf593476194eed`。877个相关Git源码blob与构建输入一致；独立解压与私有凭据扫描通过。版本仍1.1.13，包不作为正式Release发布。

Windows实机接续时，除下文登录、付款返回和安装器步骤外，补充正常登录后兑换、重复输入、刷新、退出切换账号和撤回后的显示检查。测试路由须由工程侧准备；普通包直接打开不会自动接专用沙盒。macOS/Linux私有管理命令已验证，Windows的NTFS私有ACL未验证，原码生成和断线恢复暂时关闭，应用内兑换不受影响。本轮真实网页验证使用Mac上的Ego Browser，已审查390px/1280px浅深色视口截图；两个真实账号退出HTTP200，服务端会话清除且重载仍未登录。该 Mac 阶段没有新增 Windows GUI 证据；当前 Windows 登录/退出/切换证据见上文，成功礼遇兑换尚未证明。

## 2026-10-09 Mac 接续记录（赠送码之前）

Windows端工作结束后，Mac已快进整合`e40f47f4`，继续修复本地认证及支付返回。新普通Windows入口仅接受`tokentracker://billing/return?order=<canonical UUID>`，导航到当前本地后端的结账查询页；不从链接授予权益或指定账号/环境。正常OAuth回调保持，导航、history和入口日志不再输出完整URL/code。

这6个Windows文件经独立review；官方.NET8.0.425在Mac ARM64执行117/117单测，Release/win-x64交叉编译零警告、零错误。该结果没有新的Windows GUI或OS协议导航证明，下文63项实机单测及窗口证据仍绑定旧源码。当时前端1129项与后端3818项通过、2项跳过，均为Mac验证。本轮Windows117单测与合入主干后的1190前端结果见总表。

既有InsForge已增加独立的真实QA网关和HTTPS返回页，身份仍由真实InsForge签发；详见[原生沙盒手册](native-sandbox-gateway-runbook.md)。普通包不自动连接QA网关，也不携带沙盒密码、JWT、刷新token或Waffo私钥。另一台电脑从功能分支重新构建；当前Mac本地测试包仅作交叉打包证据。

当时的交叉测试包为`.tmp/waffo/hosted/native/TokenTracker-current-private-cloud-win-x64.zip`，来源代码`60780e40863ca20416641b0c14f9a1151ac2e507`。大小111609766字节，SHA256为`1a36e7a9cc2838ae341d2f980ab3e3b9f9536544268da3707e4d33ea054aa8ba`。975个文件独立解压后逐字节和SHA一致；102份CLI、1份入口、274份Windows网页与各自产物集合相同，609份相关源码与该commit的Git blob一致。这份包早于上文赠送码包。

Windows网页按现有发布流程以`TOKENTRACKER_BUILD_PET=1`独立构建，包含`index.html`、`pet.html`、`quota.html`和全部法律页面。未复用Mac无宠物入口的网页产物。使用官方Node22.22.2已校验缓存和.NET8.0.425自包含发布，运行时8.0.31。没有执行Windows、安装器或协议导航；这份包替代下文旧ZIP作为本轮工程测试包，源码与包核对不能代替设备验收。

## 2026-10-08 Windows 本机记录（历史）

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

## Windows 剩余工程步骤

1. 使用专用 Windows 测试账户和临时 TokenTracker 数据目录，保留用户原有安装、配置与本地历史。先读回包 hash，再准备 WebView2 运行环境。
2. 工程侧准备真实应用测试账号、白名单、沙盒 API 路由与付款返回地址。当前测试函数使用 `-sandbox` 后缀，普通发行包仍使用正式路由，直接打开 ZIP 不等于已接好沙盒。Mac 的 5195/5196/5205 操作器地址也不能直接照搬到 Windows。
3. 核对运行时配置与实际请求地址。公钥可进入客户端，服务端密钥、Waffo 私钥和当前测试账号的密码/JWT 不能打包或通过文件搬运。
4. 实测 WebView2 打开系统浏览器收银台、拒付重试、成功付款、关掉返回页及重新聚焦客户端。确认原订单页通过轮询、focus/visibility 恢复会员状态，且不会重复购买。
5. 实测免费本地功能、社区上传、会员同步、暂停恢复、到期或后端离线，以及退出登录和换账号。核对本地队列及旧账号数据不丢失、不混入另一账号。
6. 正式 Windows 安装器发布前，在专用测试账户执行 PowerShell bundling 和 Inno Setup，检查干净安装、覆盖升级、卸载与用户数据保留，以及协议注册、单实例和子进程退出。当前 ZIP、发布 DLL 和交叉编译证据不能代替这些步骤。

每条记录 Windows/WebView2/Node 版本、实际 HTTP 状态与请求目的地、服务端账本或权限读回和关键截图。禁止用“编译通过”代替窗口或付款返回验证。

## 接续入口

在另一台电脑上使用已推送的 `feat/cloud-subscriptions` 分支及本页包 hash 接续。不要从 `main` 的普通发行包推断已包含本轮 Pro 代码。本地 ZIP 未作为正式 Release 发布，可由工程侧转交并校验，或在 Windows 从该分支重新构建。

继续读取 [上线前交接总表](cloud-release-readiness.md)、[交付清单](cloud-delivery.md) 和 [收款运维手册](cloud-billing-operations.md)。用户已授权提交和推送 `feat/cloud-subscriptions`，由主任务统一执行；仍不发布公开 PR、收费公告或启用生产收费。商户审核已通过，正式凭据、生产部署和真实结算门槛独立保留。
