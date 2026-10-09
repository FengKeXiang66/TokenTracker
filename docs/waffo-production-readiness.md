# Waffo 审核后的生产准备

2026-10-08 已通过实际 API 核对商户审核。商户为 production_enabled，Store 的生产与入账权限已生效。正式收费仍关闭，四个套餐 SKU 均没有生产版本。对外名称改为 TokenTracker Pro，现有 Cloud SKU 和接口名称保留。

2026-10-09 文档核对：商户审核结果来自此前 API 读回。本轮登录 Owner 提供的商户后台进行只读查看，工程未修改配置；当前生产产品为 0。Owner 随后生成正式密钥并提供本地文件，生产密钥列表已出现新建条目。本地确认 Base64 PKCS#8、RSA 2048 和签名校验通过，已在仓库外私有目录准备标准 PEM 及 DER 指纹，并验证限制 NTFS ACL；没有上传或修改服务端 secret。当前工程、设备和发布门槛见 [上线前交接总表](cloud-release-readiness.md)；正式启用前仍须核对部署侧商户、Store、产品、文件对应密钥环境与 policy。

2026-10-09 Owner 已确认商户结算／提现账户已添加、可用且完成关联，不再要求重复操作。财务页仍显示账户选择提示，账户管理页确认账户存在但没有独立关联／验证标记；不能仅据提示判定未关联，也不把 Owner 报告记为 API 读回。工程在试点前核对实际绑定。此前 `payoutAccounts` 为空是旧读回，不是当前状态。生产余额、处理中与累计提款均为 0，真实结算未验证；私有摘要保留在本机，不保存账户号码。

## 已处理

- Owner 于 2026-10-09 确认全球未税基础价 USD4.99/月、USD39.99/年，自动续费与固定期同价。
- 收银台已补上 TokenTracker 官方黑白 logo。灰黑配色、现有通知及产品状态经第二条 API 路径核对保持不变。
- 已核对网站和客服邮箱存在。它们由域名、邮箱或审核流程管理，不能在 Store.update 中猜填。
- 生产发布、退款与取消的接口契约已复核。测试密钥不能通过切换请求头变成正式密钥。
- Live checkout 增加前置校验。`WAFFO_LIVE_PRIVATE_KEY_SHA256` 必须匹配经 Owner 核验的正式私钥 PEM 解码后的 DER 字节。产品必须有生产版本，且 Store 的生产权限已开启。指纹只绑定文件，不证明密钥所属环境；仍要按正式后台或供应商 API 核对来源。

## 仍需按顺序完成

| 项目 | 当前状态和工程动作 |
| --- | --- |
| 正式密钥 | Owner 已生成并提供，生产列表条目及本地格式／签名已核对。下载文件虽以 .pem 命名，内容是 Base64 PKCS#8；接入当前要求 PEM 的 live adapter 时使用已在仓库外准备的标准 PEM，指纹基于其解码 DER。工程仍须以供应商读回绑定环境与商户／店铺，再接入服务端 |
| 结算账户 | Owner 已确认完成关联，本轮 UI 确认已有账户；工程试点前读回核对实际绑定，实际入账仍待试点结算。无需重复新增或关联 |
| 产品发布 | 本轮生产模式为 0 个产品。publish 首次把测试版本复制为 active 生产版本；SDK 没有原子创建 inactive 生产草稿的字段。保留当前测试 SKU，工程准备产物，发布按正式启用授权统一执行 |
| 接收与返回地址 | 现有InsForge已部署独立QA网关和静态HTTPS返回页，实际读取200；它们不能作为完整生产Dashboard或正式webhook。临时隧道已关闭，正式回调和完整`/billing/checkout`需按生产发布流程配置 |
| 实际支付方式 | 根据正式产品类型与货币读回收银台。文档提供 card、Apple Pay、Google Pay、WeChat；支付宝是商户结算渠道，不作为当前买家付款权益承诺 |
| 真实试点 | 发布与试点授权后核对真实付款、账本、权益、取消、退款和后续结算。正式年付版本、完整首期与下次扣款日期由工程验证 |

公开费率不等于当前账户合同。正式启用前核对卡/钱包固定费用、退款费用及最低提现手续费，避免用测试交易估算实际净收入。[官方费率](https://docs.waffo.ai/mor/fees)、[结算流程](https://docs.waffo.ai/merchant/payout-flow)。

## 启用门槛

未完成以上验收时，live policy 保持 preview，正式 checkout_verified 和促销开关保持关闭。没有公开 PR、公告或真实收费。

后端继续用现有付费InsForge。Windows工作已接续整合，最新普通支付返回的OS/GUI及安装器步骤仍需实际设备，见[交接文档](windows-cloud-acceptance.md)。Browser Use拒绝的外部协议点击需人工执行，不通过其他工具绕过；这些设备步骤不阻塞其余工程准备。

平台契约见 [认证与环境](https://docs.waffo.ai/api-reference/authentication)、[首次发布](https://docs.waffo.ai/api-reference/endpoints/subscription-products/publish-product)和 [Store 部分更新](https://docs.waffo.ai/api-reference/endpoints/stores/update-store)。
