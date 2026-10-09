# Cloud / Pro 上线前交接总表

2026-10-10（Asia/Shanghai）核对。Owner 已确认全球未税基础价 **USD4.99/月、USD39.99/年**，自动续费与固定期同价。工程已完成下列生产准备；**尚未达到正式收费发布标准**，实际资金、结算和原生设备门槛必须有真实证据。生产 policy 仍为 preview，launch_at 为 NULL，收费、会员限制、促销和生产归档均未启用。

## 源码、候选版本与审核

- 分支为 feat/cloud-subscriptions，草稿 PR 为 [#772](https://github.com/xiufengsun/TokenTracker/pull/772)。最新主干 e6186b350df7942f356ef9155af71fe81a9a99d1 已通过 ac9cfd8e 合入；六处文案冲突按键合并，Sessions 与 Pro 的独立修改均保留。最近 fetch 没有新增主干或功能分支提交。
- 应用审核 checkpoint 为 268896e7a1fabbe75f89f302d0bc5ed7b5cb5a4a。已修复 checkout 恢复缓存，只持久化六个允许的订单字段；用户身份运行时派生，密码、token、邮箱、收银台 URL 和额外字段不进入缓存。CodeQL 高危告警自动关闭，无人工 dismiss，功能分支开放告警为 0。
- 发行候选应用 checkpoint 为 **1.3.0 / 1c96a2ccb67a00a4037eddb7b8a5c613085c5a83**，通过 npm version --no-git-tag-version 同步所有平台和锁文件，不创建远端 tag，不复用已发布的 v1.2.2。该应用提交已通过完整 CI；后续安全迁移提交仍以 PR 最新精确 SHA 的 CI 为准；合入 main、npm 发布和统一桌面发行遵循 [CLAUDE.md](../CLAUDE.md)。当前没有公开 Release、收费启用或公告。

## 已执行的验证

证据位于本机 .tmp/windows-cloud/，不进入仓库；私钥、测试账号凭据和完整供应商响应位于仓库外受限 NTFS 私有目录。

| 检查 | 结果与范围 |
| --- | --- |
| 完整 CI | 1c96a2cc 的 [CI 37956050272](https://github.com/xiufengsun/TokenTracker/actions/runs/37956050272) 四个 job 全部通过：Linux 全仓 Node/校验/构建、Rust fmt/clippy/tests、Windows .NET 117 项及完整 ZIP/Inno 安装器构建、macOS 全仓 Node 与 XCTest 239 项；[CodeQL 37956050235](https://github.com/xiufengsun/TokenTracker/actions/runs/37956050235) 同步通过。安全迁移和后续提交的最终门槛读取 PR 最新 checks，不沿用旧 SHA |
| Dashboard | 138 文件、1192/1192 通过，acceptance-dashboard-rc.log；缓存修复目标组 125/125，typecheck 通过 |
| Windows .NET | 117/117，integrated-dotnet.log 与 test-results/integrated-windows-native.trx；自包含 win-x64 构建成功 |
| Cloud 目标组 | 606 通过、10 跳过、0 失败，integrated-targets.log；不等于全部 Windows Node 测试 |
| Windows 全仓 Node 快照 | 3866 项：3728 通过、80 失败、20 取消、38 跳过，acceptance-full-node.log。未全绿，不能把未分析失败全部归为主干问题 |
| Windows 同步专项修复 | 上述三项 sync-background 失败来自未隔离 APPDATA/LOCALAPPDATA，读取真实 Cursor 数据与发起额度请求；隔离两个目录后 27/27，acceptance-sync-background-isolated.log，加入 Windows CI |
| 当前原生窗口 | 1c96a2cc / 1.3.0 的干净发布目录通过 34/34 原生检查，明确断言使用打包 Node 而非系统 fallback；普通 UI 登录 B、重载保持、退出后重载清除、切换 A 的 7/7 检查通过。实际身份以邮箱与 UUID 核对。价格/固定期/preview 禁用已验证；不是完整 Program.Main、付款协议返回或安装器生命周期证明 |
| 托管真实 API | 两个专用 auth 账号的登录/刷新轮换、账号隔离、无效赠送码、基础表与管理 RPC 拒绝共 16 项通过，acceptance-auth-gifts.json；生产 preview catalog/account/未登录拒绝/checkout 前置关闭共 8 项，acceptance-live-preview.json。没有成功 Windows 礼遇兑换或真实付款证明 |
| 函数与权限 | 当前 18 个 Cloud 和 14 个私有自部署函数构建成功。gift 远端源码与当前构建逐字节一致，四表 RLS 开启，客户端不可直接读 gift 管理数据/RPC；财务三表仅本人 SELECT，匿名拒绝 |
| 包来源 | 当前本地干净 1.3.0 包的 379 个输入与 981 文件清单验证通过，acceptance-package-rc-clean.json；旧输出目录残留前端 hash 文件被校验器拒绝，已保留并重新建干净目录。CI 1.3.0 ZIP 与 Inno artifact 已生成，最终下载/hash/独立解压仍绑定最新源 SHA。51bdcdfd 的旧 1.2.2 包仅作历史证据 |

## 后台安全复核

- InsForge advisor 全量扫描发现两张 2026-07-21 的历史 device/token 备份表未启用 RLS，匿名及 authenticated 有直接访问权限。已通过 20261010000000_secure-legacy-device-backups.sql 对这两个确切表启用 RLS、撤销客户端与 PUBLIC 权限；可选表不存在时跳过。保留全部行及管理员访问，不改其他业务表或客户数据。
- 前后行数一致、管理员 SELECT 保持，四个匿名/登录客户端实际 HTTP 读取均拒绝；重新扫描 rls-disabled 项为 0。证据为 acceptance-security-migration.json、acceptance-legacy-backup-http.json 与前后 grants/counts。
- 不把扫描全部告警写为清零：仍有 87 项 server-only RLS 无客户端 policy，以及一项数据库缓存命中率 73.29% 的性能告警。客户端角色无 BYPASSRLS，服务角色有访问权限；未增加公共 policy、未 suppress 告警、未更改付费实例规格。性能趋势和服务端权限仍按运行手册复核。
- 本轮仅用于验收的 A/B auth 账号已通过官方管理 API 删除，旧密码登录均为 401；gift 白名单仅移除本轮两项，原有两项保持。未删除财务记录或个人账号。验收凭据文件已移除密码/token；这些历史测试不能复用已撤销凭据。

## 正式后台准备的独立读回

- InsForge CLI 0.2.8 已安装、登录并关联现有 tokentracker 项目。此机器的系统 Node16 不满足 CLI 要求，CLI 专用 shim 使用已校验的 Node22.22.2，其他工具和系统 Node 不变；npm 更新可能覆盖 shim。项目配置和凭据均不提交。
- 备份 pre-pro-acceptance-20261009 已读回 completed。没有在生产执行恢复；隔离恢复演练仍为独立门槛。
- 已部署 tokentracker-billing 与 tokentracker-waffo-webhook 两个正式新增函数并读回源码逐字节一致，原有 41 个函数元数据不变。没有替换其余生产同步/榜单函数或开启会员限制。
- Owner 提供的 RSA2048 文件已规范化为标准 PEM，正式签名查询证明密钥可访问目标 production 商户/Store。八项 Waffo server secret 均写入并独立读回，包含 DER 指纹；没有进入 VITE、Git、安装包或日志。
- 四个套餐已发布为 active production 版本，USD4.99/月、USD39.99/年，续费/固定期同价，完整账期，无供应商试用；没有改动既有无关产品。
- 正式 HTTP webhook 已注册并读回：目标为现有后台 /functions/tokentracker-waffo-webhook，prod、12 个对应事件。旧回调不变；无签名 POST 返回 401 invalid_signature。未发生真实签名生产交易通知。
- 正式 catalog 返回 preview、配置可识别、checkout_verified=false；真实测试账号发起 checkout 返回 503 checkout_not_launched，在创建订单前拒绝。生产 orders/payments/subscriptions 均为 0。
- **提款账户已绑定目标商户且 payoutEnable=true，但正式 API 返回 channelStatus=unverified、channelVerifiedAt=NULL。** 这是当前独立证据，与 Owner 先前“已验证/可用”报告分开记录；无需重复新增账户，需核对渠道审核/验证状态。真实付款、账单和到账尚未验证。

## 仍阻止正式收费发布的事项

| 门槛 | 下一步与负责人 |
| --- | --- |
| 精确发行候选 | 工程检查最终安全迁移提交的全部 CI/CodeQL，核对新包来源/hash/凭据扫描；通过后才走统一 npm/macOS/Windows/Linux 流程 |
| Windows 设备路径 | 普通账号切换、退出/刷新已通过；成功礼遇兑换显示仍待验证；专用干净设备完成完整托盘入口、协议返回、安装/升级/卸载及数据保留。窗口测试与安装器编译不能代替生命周期 |
| 完整正式返回页 | 工程将受审的 Dashboard /billing/checkout 部署至正式 HTTPS 站点，并验证来源、账单归属、失焦/重开恢复；Vercel 的 1c96a2cc Preview 部署成功但受 SSO 保护，未登录探测到的是 Vercel Login，不算应用 HTTP 200；现有 QA 静态页不算完整生产 Dashboard |
| 托管访问与恢复 | 工程在保持 preview 的前提完成其他正式函数部署顺序、免费/过渡/设备/导出回归及隔离备份恢复；归档未通过独立门槛时继续关闭 |
| 真实资金 | Owner 确定试点可用付款方式与金额上限并实际付款/系统确认；工程核对签名回调、订单、账本、完整月/年账期、拒付重试、取消和退款。不得把沙盒或手工造账当作真实交易 |
| 渠道与结算 | Owner 在 Waffo 确认渠道验证为何仍为 unverified，核对合同费率/币种/结算条件，试点后确认实际入账；工程保存脱敏状态证据 |
| 条款与启用 | Owner 确认退款/续费/隐私/客服政策和启用时间；工程准备具体文案、部署与回滚结果后再实施收费、公告和公开发行 |

自动审批审核此前拒绝完整托盘 Program.Main/单实例/Job Object 的额外测试，以及本机安装 Inno 的动作，均仅返回 blocked by policy；未执行或改工具绕过。另一次本机旧测试输出的递归清理也被拒绝，已保留旧目录并使用新的干净目录。CI 使用已安装的 Inno 编译器完成构建。工具拒绝的外部协议点击仍由本人在设备上完成。

## Owner 当前事项

密钥生成、账户添加/关联和价格确认已经完成，无需重复。剩余本人事项为：确认 Waffo 渠道验证和结算合同；实际完成受控支付与必要的系统确认、后续到账核对；确定最终条款及启用时间。工程尚未完成的设备、部署和发行检查不能转写成 Owner 已验收。

## 文档入口

[Cloud 交付](cloud-delivery.md)、[收款运维](cloud-billing-operations.md)、[Waffo 生产准备](waffo-production-readiness.md)、[Windows 验收](windows-cloud-acceptance.md)、[原生沙盒手册](native-sandbox-gateway-runbook.md)、[赠送码](pro-gift-codes.md)、[自部署](self-hosting-status.md)、[归档](cloud-usage-archive.md)、[规格](cloud-subscriptions.md)、[中文指南](cloud-guide.zh-CN.md)、[公告草稿](cloud-announcement-draft.md)。历史证据保留其注明的 SHA/环境，不升级为最新证据。
