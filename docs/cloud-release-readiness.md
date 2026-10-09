# Cloud / Pro 上线前交接总表

2026-10-10（Asia/Shanghai）核对。Owner 已确认全球未税基础价 **USD4.99/月、USD39.99/年**，自动续费与固定期同价。工程已完成下列生产准备；**尚未达到正式收费发布标准**，实际资金、结算和原生设备门槛必须有真实证据。生产 policy 仍为 preview，launch_at 为 NULL，收费、会员限制、促销和生产归档均未启用。

## 源码、候选版本与审核

- 分支为 feat/cloud-subscriptions，草稿 PR 为 [#772](https://github.com/xiufengsun/TokenTracker/pull/772)。最新主干 e6186b350df7942f356ef9155af71fe81a9a99d1 已通过 ac9cfd8e 合入；六处文案冲突按键合并，Sessions 与 Pro 的独立修改均保留。最近 fetch 没有新增主干或功能分支提交。
- 应用审核 checkpoint 为 268896e7a1fabbe75f89f302d0bc5ed7b5cb5a4a。已修复 checkout 恢复缓存，只持久化六个允许的订单字段；用户身份运行时派生，密码、token、邮箱、收银台 URL 和额外字段不进入缓存。CodeQL 高危告警自动关闭，无人工 dismiss，功能分支开放告警为 0。
- 发行候选应用 checkpoint 为 **1.3.0 / 1c96a2ccb67a00a4037eddb7b8a5c613085c5a83**，通过 npm version --no-git-tag-version 同步所有平台和锁文件，不创建远端 tag，不复用已发布的 v1.2.2。该应用提交已通过完整 CI；安全修复 checkpoint 8497d6e9 亦通过完整 CI/CodeQL；后续精确 SHA 的 checks 以 PR 为准；合入 main、npm 发布和统一桌面发行遵循 [CLAUDE.md](../CLAUDE.md)。当前没有公开 Release、收费启用或公告。

## 已执行的验证

证据位于本机 .tmp/windows-cloud/，不进入仓库；私钥、测试账号凭据和完整供应商响应位于仓库外受限 NTFS 私有目录。

| 检查 | 结果与范围 |
| --- | --- |
| 完整 CI | 1c96a2cc 的 [CI 37956050272](https://github.com/xiufengsun/TokenTracker/actions/runs/37956050272) 四个 job 全部通过：Linux 全仓 Node/校验/构建、Rust fmt/clippy/tests、Windows .NET 117 项及完整 ZIP/Inno 安装器构建、macOS 全仓 Node 与 XCTest 239 项；[CodeQL 37956050235](https://github.com/xiufengsun/TokenTracker/actions/runs/37956050235) 同步通过。安全修复 8497d6e9 的 [CI 37960201255](https://github.com/xiufengsun/TokenTracker/actions/runs/37960201255) 及 CodeQL 37960201210 亦全部通过；后续文档提交 checks 读取 PR，不升级旧包来源 |
| Dashboard | 138 文件、1192/1192 通过，acceptance-dashboard-rc.log；缓存修复目标组 125/125，typecheck 通过 |
| Windows .NET | 117/117，integrated-dotnet.log 与 test-results/integrated-windows-native.trx；自包含 win-x64 构建成功 |
| Cloud 目标组 | 606 通过、10 跳过、0 失败，integrated-targets.log；不等于全部 Windows Node 测试 |
| Windows 全仓 Node | 旧未隔离快照为 3728 通过、80 失败、20 取消、38 跳过。新 Node22 隔离 USERPROFILE/HOME/APPDATA/LOCALAPPDATA 对照为 3738 通过、70 失败、20 取消、38 跳过；最新主干 e6186b35 为 3343 通过、93 失败、20 取消、34 跳过。98 个 not-ok 输出包含取消及父用例，97 个名称/文件在主干匹配；余下一项 trim 的依赖完整主干专项复现相同 Node22 fs.cpSync 进程退出，Node24 该组 4/4。没有把匹配名称当作全部原因分析，也不把全仓写为全绿 |
| Windows 同步专项修复 | 上述三项 sync-background 失败来自未隔离 APPDATA/LOCALAPPDATA，读取真实 Cursor 数据与发起额度请求；隔离两个目录后 27/27，acceptance-sync-background-isolated.log，加入 Windows CI |
| Windows 继续排障 | TypeScript 验证改为当前 Node 启动 Dashboard 已安装且与锁文件一致的 compiler，避免 execFile 启动 npm.cmd 的 EINVAL；Markdown 索引用 POSIX 分隔符，11/11 专项通过。Ark timeout fixture 仅对 arkcli 返回匹配的 where 路径，修复把 Kiro 等其他查询也送进永不结束模拟的卡住；该专项通过。随后 Node24 全量运行在 172 秒自然结束，3764 通过、67 失败、0 取消、38 跳过，未触发 120 秒文件超时。日志 acceptance-windows-after-triage.log；此快照早于下述目录修复，仍不是全绿 |
| Roo/Kilo Windows 目录修复 | 发现自定义 TOKENTRACKER_KILOCODE_ROOTS 按冒号拆开 Windows 盘符，已改用系统 path.delimiter：Windows 多目录使用分号，Unix 继续冒号。实际临时目录扫描、token 聚合、重新运行去重与同一记录 backfill 共 14/14 通过，并加入 Windows CI。该 src 改动后的候选包需要重新构建；8497d6e9 的旧包仅证明其原始版本 |
| 补充 Node24 Windows 对照 | v24.19.0、相同已安装依赖，主干 Dashboard 已独立构建，全部 profile 隔离。两边 usage-limits.test.js 均超过十分钟不结束，仅终止这两个确切测试进程以收尾；候选输出 3742 通过、69 失败、38 跳过，主干 3347 通过、89 失败、34 跳过。用例总数因未完成文件不同，不替代 Node22 完整快照，也不是通过结果；日志 acceptance-windows-node24-*.log |
| 当前原生窗口 | 1c96a2cc / 1.3.0 的干净发布目录通过 34/34 原生检查，明确断言使用打包 Node 而非系统 fallback；普通 UI 登录 B、重载保持、退出后重载清除、切换 A 的 7/7 检查通过。实际身份以邮箱与 UUID 核对。价格/固定期/preview 禁用已验证；最终 CI 产出 DLL/打包 Node 另执行 30/30 窗口/bridge/浏览器/页面检查通过；首次复制宿主缺少 WebView2Loader 的失败记录保留，补齐 CI loader 后通过。不是完整 Program.Main、付款协议返回或安装器生命周期证明 |
| 托管真实 API | 两个专用 auth 账号的登录/刷新轮换、账号隔离、无效赠送码、基础表与管理 RPC 拒绝共 16 项通过，acceptance-auth-gifts.json；生产 preview catalog/account/未登录拒绝/checkout 前置关闭共 8 项，acceptance-live-preview.json。没有成功 Windows 礼遇兑换或真实付款证明 |
| 函数与权限 | 当前 18 个 Cloud 和 14 个私有自部署函数构建成功。gift 远端源码与当前构建逐字节一致，四表 RLS 开启，客户端不可直接读 gift 管理数据/RPC；财务三表仅本人 SELECT，匿名拒绝 |
| 包来源 | 最终源码 8497d6e998369a8d4c90b2901ec089ed5dd7930a 的 CI artifact 已独立下载：archive 195981496 字节、SHA256 241d97ae378869532f172976b4662104696648b3af73e3410de4979cb80dc6c8，与 GitHub digest 一致。实际 checkout 为 7fd5fbfb86e6dda495fb773a8e09465a8eb0198d，Git tree 与受审 head 相同。1.3.0 ZIP 115718586 字节、SHA256 c3fab9a59fbe318c9d016897d1db7d712bceb53daba5ce1fa75bac64e9323fd4；Inno 安装器 81384336 字节、SHA256 0f898ddd528997710ce6684757b471b6caab81d8fbc3d02d1a520003a30edd30。解压 981/981 文件大小与 hash 一致，106 个嵌入 CLI/入口/清单源文件与 Git blob 一致，10 项实际私钥/管理 key/已撤销 QA 凭据的逐字节扫描命中为 0。安装器尚未执行安装/升级/卸载。 本地干净包 379 输入/981 文件；旧输出残留被拒绝并保留 |

## 后台安全复核

- InsForge advisor 全量扫描发现两张 2026-07-21 的历史 device/token 备份表未启用 RLS，匿名及 authenticated 有直接访问权限。已通过 20261010000000_secure-legacy-device-backups.sql 对这两个确切表启用 RLS、撤销客户端与 PUBLIC 权限；可选表不存在时跳过。保留全部行及管理员访问，不改其他业务表或客户数据。
- 前后行数一致、管理员 SELECT 保持，四个匿名/登录客户端实际 HTTP 读取均拒绝；重新扫描 rls-disabled 项为 0。证据为 acceptance-security-migration.json、acceptance-legacy-backup-http.json 与前后 grants/counts。
- 不把扫描全部告警写为清零：仍有 87 项 server-only RLS 无客户端 policy，以及一项数据库缓存命中率 73.29% 的性能告警。客户端角色无 BYPASSRLS，服务角色有访问权限；未增加公共 policy、未 suppress 告警、未更改付费实例规格。性能趋势和服务端权限仍按运行手册复核。
- 本轮仅用于验收的 A/B auth 账号已通过官方管理 API 删除，旧密码登录均为 401；gift 白名单仅移除本轮两项，原有两项保持。未删除财务记录或个人账号。验收凭据文件已移除密码/token；这些历史测试不能复用已撤销凭据。

## 正式后台准备的独立读回

- InsForge CLI 0.2.8 已安装、登录并关联现有 tokentracker 项目。此机器的系统 Node16 不满足 CLI 要求，CLI 专用 shim 使用已校验的 Node22.22.2，其他工具和系统 Node 不变；npm 更新可能覆盖 shim。项目配置和凭据均不提交。
- 备份 pre-pro-acceptance-20261009 已读回 completed。没有在生产执行恢复；隔离恢复演练仍为独立门槛。
- 正式后端的纯 schema/RPC/RLS 导出已私有保存并核对：470527 字节，SHA256 745c6196e64fa7725791a29bf0b451542fc14a66faa311a8b46ff6b84aad085f，包含 91 个表、146 个函数和 91 条 RLS 声明；未请求客户行数据。这不是完整供应商备份或恢复成功证明。当前没有可复用 InsForge 分支，本机无可用 Docker 环境；隔离恢复等待已有主机，或 Owner 明确付费分支的预算及运行时限。
- 已部署 tokentracker-billing 与 tokentracker-waffo-webhook 两个正式新增函数并读回源码逐字节一致，原有 41 个函数元数据不变。18 个候选函数的部署计划已核对：15 个现有远端源码/metadata 已保存用于回滚，2 个与候选完全一致，13 个旧同步/榜单 handler 与候选不同；3 个非 Waffo 历史 webhook 当前不存在。没有把构建成功写为这 13 个已部署，也没有开启会员限制。隔离恢复和 preview 免费/设备/导出回归仍先于替换。
- Owner 提供的 RSA2048 文件已规范化为标准 PEM，正式签名查询证明密钥可访问目标 production 商户/Store。八项 Waffo server secret 均写入并独立读回，包含 DER 指纹；没有进入 VITE、Git、安装包或日志。
- 四个套餐已发布为 active production 版本，USD4.99/月、USD39.99/年，续费/固定期同价，完整账期，无供应商试用；没有改动既有无关产品。
- 正式 HTTP webhook 已注册并读回：目标为现有后台 /functions/tokentracker-waffo-webhook，prod、12 个对应事件。旧回调不变；无签名 POST 返回 401 invalid_signature。未发生真实签名生产交易通知。
- 正式 catalog 返回 preview、配置可识别、checkout_verified=false；真实测试账号发起 checkout 返回 503 checkout_not_launched，在创建订单前拒绝。生产 orders/payments/subscriptions 均为 0。
- **提款账户已绑定目标商户且 payoutEnable=true，但正式 API 返回 channelStatus=unverified、channelVerifiedAt=NULL。** 这是当前独立证据，与 Owner 先前“已验证/可用”报告分开记录；无需重复新增账户，需核对渠道审核/验证状态。真实付款、账单和到账尚未验证。

## 仍阻止正式收费发布的事项

| 门槛 | 下一步与负责人 |
| --- | --- |
| 精确发行候选 | 最终安全迁移 CI/CodeQL 及包来源/hash/凭据扫描已通过；工程固定 8497d6e9 为此轮受审包来源，后续改应用需重新绑定；通过后才走统一 npm/macOS/Windows/Linux 流程 |
| Windows 设备路径 | 普通账号切换、退出/刷新已通过；成功礼遇兑换显示仍待验证；专用干净设备完成完整托盘入口、协议返回、安装/升级/卸载及数据保留。窗口测试与安装器编译不能代替生命周期 |
| 完整正式返回页 | 工程将受审的 Dashboard /billing/checkout 部署至正式 HTTPS 站点，并验证来源、账单归属、失焦/重开恢复；8497d6e9 的 [Vercel Preview](https://dashboard-2wg4xipef-sunxiufeng1992-8555s-projects.vercel.app) 部署读回 success，但四个账单/法律路由均跳转 Vercel Login，浏览器亦无 Vercel 登录会话。需要 Owner 提供正常预览访问后验收；登录页 HTTP200 不算应用通过，现有 QA 静态页不算完整生产 Dashboard |
| 托管访问与恢复 | 工程在保持 preview 的前提完成其他正式函数部署顺序、免费/过渡/设备/导出回归及隔离备份恢复；归档未通过独立门槛时继续关闭 |
| 真实资金 | Owner 确定试点可用付款方式与金额上限并实际付款/系统确认；工程核对签名回调、订单、账本、完整月/年账期、拒付重试、取消和退款。不得把沙盒或手工造账当作真实交易 |
| 渠道与结算 | Owner 在 Waffo 确认渠道验证为何仍为 unverified，核对合同费率/币种/结算条件，试点后确认实际入账；工程保存脱敏状态证据 |
| 条款与启用 | Owner 确认退款/续费/隐私/客服政策和启用时间；工程准备具体文案、部署与回滚结果后再实施收费、公告和公开发行 |

自动审批审核此前拒绝完整托盘 Program.Main/单实例/Job Object 的额外测试，以及本机安装 Inno 的动作，均仅返回 blocked by policy；未执行或改工具绕过。另一次本机旧测试输出的递归清理也被拒绝，已保留旧目录并使用新的干净目录。CI 使用已安装的 Inno 编译器完成构建。工具拒绝的外部协议点击仍由本人在设备上完成。

## Owner 当前事项

密钥生成、账户添加/关联和价格确认已经完成，无需重复。剩余本人事项为：确认 Waffo 渠道验证和结算合同；实际完成受控支付与必要的系统确认、后续到账核对；确定最终条款及启用时间。工程尚未完成的设备、部署和发行检查不能转写成 Owner 已验收。

## 文档入口

[Cloud 交付](cloud-delivery.md)、[收款运维](cloud-billing-operations.md)、[Waffo 生产准备](waffo-production-readiness.md)、[Windows 验收](windows-cloud-acceptance.md)、[原生沙盒手册](native-sandbox-gateway-runbook.md)、[赠送码](pro-gift-codes.md)、[自部署](self-hosting-status.md)、[归档](cloud-usage-archive.md)、[规格](cloud-subscriptions.md)、[中文指南](cloud-guide.zh-CN.md)、[公告草稿](cloud-announcement-draft.md)。历史证据保留其注明的 SHA/环境，不升级为最新证据。
