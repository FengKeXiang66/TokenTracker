# Cloud / Pro 上线前交接总表

2026-10-09（Asia/Shanghai）核对。**当前结论：工程交接已更新，生产上线门槛尚未通过。** Owner 已确认全球未税基础价 USD4.99/月、USD39.99/年，自动续费与固定期同价，并要求继续完成全部验收。收费、会员限制、促销、生产归档与公告继续保持未启用状态，价格确认不代表这些操作已经执行。

## 源码与冲突

- 本机从 `e40f47f4` 快进到功能分支 `a6b3f722ef389142e7879736917db68d6ed2c158`，旧 Windows 修复仍在祖先历史中，没有拉取冲突。
- 主干已推进到 `e6186b350df7942f356ef9155af71fe81a9a99d1`（1.2.2）。本轮通过 `ac9cfd8e56d46c0d767a3323870f775edc0feeab` 合入功能分支。实际合并的 6 个冲突是 `copy.csv` 和 de/ja/ko/zh/zh-TW 的 `dashboard.json`；按键核对基础、双方值，保留 Sessions 与 Pro 的全部独立改动，没有通过选择整个文件覆盖一方。
- Windows 验收 fixture 修复为 `940e344f011e7869f4436c16cc97cca531ae8d56`，日期断言修复为 `e3213df0aff0074ea322ea759655e9a86b33949c`。以下当前回归绑定这些已整合的应用源码；交接文档后续提交不改变运行产物。
- 托管应用当前版本继承主干 1.2.2，所有受管版本一致。`v1.2.2` 已存在，**不能用相同版本重新发这批 Pro 代码**。正式发布时按 [CLAUDE.md](../CLAUDE.md) 选定高于 1.2.2 的新版本、同步全部受管文件，并让精确候选 SHA 通过 CI 和统一桌面发布流程。

## 本轮 Windows 回归

环境为 Windows 11 10.0.22000、Node 22.22.2、.NET SDK 8.0.425。CI 使用 Node 24；本机结果不能替代其 Linux、macOS、Windows jobs。

| 检查 | 当前结果与证据 |
| --- | --- |
| 原生 .NET | 117/117 通过；`integrated-dotnet.log`、`test-results/integrated-windows-native.trx` |
| Windows 自包含发布 | Release/win-x64 成功，`integrated-publish.log`。本轮输出仅为 .NET 发布目录，未再次生成完整嵌入 ZIP 或 Inno 安装器 |
| Dashboard 全量 | 138 个文件、1190/1190 通过，`integrated-dashboard-final.log`。首次合并后为 1189 通过、1 失败，修复 Sessions 日期断言与 UI mock 的 locale 不一致后复跑全量；生产日期格式未改 |
| Cloud／自部署／赠送／认证／Windows／Sessions 目标组 | 606 通过、10 跳过、0 失败；`integrated-targets.log`。该组不包含耗时的 legacy-baseurl 全文件，也不是全仓 `npm test` |
| 合并路径专项 | Sessions、认证、本地代理、架构、bot 等 136/136 通过，`integrated-node.log` |
| 全部校验与构建 | copy、locale、UI hardcode、guardrails、versions、bot frames、Dashboard typecheck 及带 pet/quota 的 Vite build 通过，`integrated-validators.log` |
| 函数构建 | 当前源码 18 个 Cloud、14 个私有自部署函数独立构建通过，`integrated-functions.log`；未部署 |
| 完整 CI | 当前整合源码的全仓 Linux/macOS CI、XCTest/Rust 和 Windows CI 尚未提供结果；10 月 8 日 Windows 全仓失败不能被目标组通过覆盖 |

证据目录为本机 `.tmp/windows-cloud/`，不进入公共仓库。首次扩展目标组在 `a6b3f722` 为 551 通过、3 失败、10 跳过（`latest-targets.log`）。本轮已修复三项测试问题：QA fixture 依赖不存在的 Mac 内嵌目录，并在本机 `fs.cpSync` 处异常退出，改为锁文件生产依赖和常规文件复制；Windows 私有配置测试改为验证现有读取器拒绝无法证明私有的文件，没有放宽权限；端口识别用目录 junction 验证 realpath，避免要求文件 symlink 权限。修复后目标组全部通过。跳过项涉及平台工具、Windows 私有原码生成和原有条件；不能计作已通过。

## 证据范围与包

- Mac 赠送阶段 3846 项 Node、1169 项前端、两个 PostgreSQL 连接和真实网页兑换／退出记录属于 `77ca2024` 那批源码。本轮没有重新访问 InsForge 账本，也没有把它们称为本轮 Windows 实测。
- Mac 交叉包 `60780e40`、赠送包 `77ca2024`、Windows 旧实机包 `8e45d91e` 的 hash 和来源保存在 [Windows 交接](windows-cloud-acceptance.md)。它们早于本轮主干整合，不能当作当前候选包。`.tmp/waffo/` 是原 Mac 工作区路径，当前 Windows 工作区没有这些文件；交接需私下转交并验 hash，或从精确源码重新构建。
- 旧 Windows 29 项发布 DLL／WebView2 集成只覆盖窗口、页面及浏览器 loopback 交接。新赠送 GUI、真实登录／换账号、浏览器→OS→App、完整托盘、单实例、Job Object、安装／升级／卸载仍待各自验证。
- 自部署官方本地 Linux 平台、隔离 PostgreSQL 和公网 VPS 是三种不同环境。13-step 官方栈与 14-step gift installer 记录不能当成一次真实版本升级；未测升级、公网 HTTPS 和原生回调保持待办。

## 上线阻塞与责任

### 本轮 Waffo 后台只读核对

Owner 在本轮侧边浏览器完成登录后，工程侧直接查看了其提供的 TokenTracker 商店和商户财务。生产模式产品列表为 **0 个产品**。Owner 随后生成正式密钥并提供本地文件，生产密钥列表已出现新建条目；本地解析确认下载文件为 Base64 编码的 PKCS#8、RSA 2048，签名／验签通过。已在仓库外私有目录准备标准 PEM 和 DER 指纹，NTFS ACL 仅允许当前用户、SYSTEM 和 Administrators；没有上传或修改服务端 secret。密钥条目存在与文件来源报告不能替代供应商 API 对文件、正式环境和目标商户归属的绑定核对。

Owner 随后确认已完成提款账户关联，记为 Owner 已完成事项，无需重复新增或关联。财务页仍显示“请选择提款账户”／“选择此账户”；账户管理页确认既有账户存在，但没有独立的关联或验证标记。本轮 UI 不足以判定该提示是未关联还是每次提款选择，工程在试点前读回核对，不把 Owner 报告冒充独立 API 证据。

生产概览订单数为 0；商户可提款、处理中和累计提款金额均为 0。工程未点击创建密钥、账户关联、产品发布或提款；没有记录账户号码。私有摘要为 `.tmp/windows-cloud/waffo-ui-readiness.json`，本地密钥校验为 `.tmp/windows-cloud/waffo-live-key-local-check.json`（仅路径、格式与指纹，没有私钥）。这些结果不等于 InsForge 服务端密钥／policy／schema 的重新读回。

| 门槛 | 已有结果 | 还需完成 | 负责人 |
| --- | --- | --- | --- |
| 精确候选源码与 CI | 当前主干冲突已解决，定向 Windows 回归通过 | 新版本、精确 SHA 的全部 CI、完整跨平台包／来源 hash 与凭据扫描 | 工程 |
| Windows 与原生返回 | 当前 .NET 117 单测；旧 WebView2 记录 | 当前赠送 GUI、真实账号切换、完整托盘、安装器；浏览器协议点击后检查订单归属与服务端权益。工具此前拒绝的外部协议点击由本人执行 | 工程＋Owner 设备操作 |
| 托管生产 preview | 沙盒付款、访问、礼遇和退款历史证据 | 重读部署源码／schema／policy；备份恢复、gift/RLS、正式回调与完整返回页、免费／过渡／导出校验 | 工程 |
| 商户生产凭据与产品 | 历史审核通过；正式密钥已生成并提供，生产列表有条目，本地 RSA 校验通过；生产产品 0 | 工程以供应商读回绑定文件／环境／归属，接入正式 server secret 与 DER 指纹，核对正式产品及完整月／年账期 | 工程；Owner 密钥准备已完成 |
| 提款账户与结算 | 本轮 UI 确认账户已添加，Owner 已确认关联；UI 提示语未独立证明关联状态 | 工程试点前读回；合同费率／币种／条件、试点后平台账单与真实入账 | 工程核对；Owner 确认条款与实际到账 |
| 真实资金试点 | 沙盒付款不涉及真实扣款 | 明确试点金额上限和付款方式，实际付款／取消／退款、账本／权益及后续结算 | Owner 授权和实际操作，工程验证 |
| 价格、条款与发布 | Owner 已确认 USD4.99/月、USD39.99/年，自动续费与固定期同价 | 续费／退款／隐私／客服条款、启用时间和公告／正式发布授权；工程通过草稿 PR 完成跨平台 CI | Owner 决定，工程实施 |
| 历史归档 | 本地及隔离托管恢复／修正记录 | 生产部署顺序、备份、查询预算、并发维护／擦除／恢复及有界任务验收 | 工程；未通过时继续关闭归档 |
| 自部署支持范围 | 本地官方栈和标准页面切换已测 | 公网 VPS／TLS／原生路由及具体版本升级；可选 OAuth／邮件配置后才承诺 | 工程；未通过时保持技术预览 |

## Owner 当前只需处理什么

1. 正式密钥生成／本地文件提供、提款账户关联已由 Owner 完成，不再列为重复待办；保管原始私钥，勿粘贴 key、JWT 或管理员凭据。工程负责正式环境、归属、secret 接入及账户绑定读回。
2. 确认当前合同费率、结算币种和条件，账户／身份资料只在平台处理；试点后私下核对平台账单和实际到账。
3. 价格已确认，无需重复确认。正式条款和真实小额试点的金额上限与方式仍需明确，并本人完成付款、必要的系统／外部协议确认及结算到账核对。
4. 所有适用门槛有证据后，再批准生产启用时间、公开 PR、公告和统一版本发布。源码检查／推送的授权不等于这些上线动作的授权。

## 文档入口与交接规则

| 内容 | 文档 |
| --- | --- |
| 阶段交付与私有证据边界 | [Cloud 交付](cloud-delivery.md) |
| 部署／回滚／webhook／礼遇迁移 | [收款运维](cloud-billing-operations.md) |
| 商户正式准备与 Owner 事项 | [Waffo 生产准备](waffo-production-readiness.md) |
| Windows 来源包与设备步骤 | [Windows 验收](windows-cloud-acceptance.md) |
| 原生 QA 网关与人工协议点击 | [原生沙盒手册](native-sandbox-gateway-runbook.md) |
| 礼遇发行／兑换／停用／撤回 | [赠送码](pro-gift-codes.md) |
| 自部署安装、证据和剩余场景 | [后端安装](self-hosting-backend.md)、[实现状态](self-hosting-status.md)、[剩余验收](self-hosting-remaining-acceptance.md) |
| 归档独立启用门槛 | [使用量归档](cloud-usage-archive.md) |
| 产品与对外文案 | [规格](cloud-subscriptions.md)、[英文说明](cloud-guide.md)、[中文说明](cloud-guide.zh-CN.md)、[公告草稿](cloud-announcement-draft.md) |

每项通过必须注明源码 SHA、环境／平台、执行日期、结果和私有证据位置。远端 `active`、已保存源码、编译通过、单个窗口恢复、旧包 hash 或 Owner 报告各证明不同事实。没有执行或没有证据的门槛保持待验收；发布前重新核对移动分支和供应商状态。
