# Windows 客户端验收交接

2026-10-08 13:08 UTC 更新。按用户要求，Windows 实机验收等测试电脑准备好后接续，不阻塞 Web 和 InsForge 后端工作。

这里需要的是 Windows 客户端测试电脑。官方后端仍使用现有付费 InsForge，付款由 Waffo 处理，不需要 Windows 服务器。

## 已完成

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
