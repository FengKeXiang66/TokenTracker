# Waffo 审核后的生产准备

2026-10-10 当前状态：已使用 Owner 提供的正式 RSA2048 密钥，通过签名 production API 核对目标商户和 Store。四个 Pro 套餐均已发布为 active 生产版本，未税 USD4.99/月、USD39.99/年，自动续费与固定期同价。正式收费仍关闭，live policy 为 preview。

八项 Waffo server secret 已配置并独立读回，标准 PEM 和 DER 指纹来自仓库外受限 NTFS 私有目录；客户端和 Git 不包含密钥。两个正式 billing/webhook 函数源码与受审构建逐字节一致。正式 HTTP webhook 的地址、prod 标记和 12 个事件已独立读回；无签名 POST 返回 401 invalid_signature。完整当前证据与候选版本见 [上线前交接总表](cloud-release-readiness.md)。

Owner 已完成结算／提现账户添加与关联，无需重复。最新签名 API 确认账户绑定目标商户且 payoutEnable=true，但 channelStatus 为 unverified、channelVerifiedAt 为 NULL。Owner 先前“已验证／可用”报告与该读回分开记录。只读取绑定、状态和币种，不保存账户号码；实际付款和结算未验证。

已登录后台的只读页面核对可见 1 个支付宝中国 CNY 提款账户，页面注明账户由所有店铺共用；账户页没有渠道“已验证／待审核”状态标签。账户存在不等于渠道验证完成，不据此重新添加或修改绑定。证据 acceptance-release-waffo-ui.json 仅保存这些脱敏事实，不保存身份、账号或页面完整内容；本轮没有发起付款或提款。

2026-10-10 官方 [提款账户说明](https://docs.waffo.ai/merchant/payout-accounts)明确：新账户在首笔真实提款核对收款人后才标为 Verified；[提款流程](https://docs.waffo.ai/merchant/payout-flow)说明每次提款都需选择目标账户，没有默认账户。因此，当前 unverified **可能表示尚未完成首次提款**，不能仅凭此字段认定配置错误或要求发布前重新验证。这个解释是对官方流程与当前零交易状态的推断，不是实际到账证明。Owner 后续核对合同条件，并在真实收入满足提款条件后亲自完成首笔提款/到账核对；遇到失败或异常状态再向 Waffo 确认。

## 已处理

- Owner 于 2026-10-09 确认全球未税基础价 USD4.99/月、USD39.99/年，自动续费与固定期同价。
- 收银台已补上 TokenTracker 官方黑白 logo。灰黑配色、现有通知及产品状态经第二条 API 路径核对保持不变。
- 已核对网站和客服邮箱存在。它们由域名、邮箱或审核流程管理，不能在 Store.update 中猜填。
- 生产发布、退款与取消的接口契约已复核。测试密钥不能通过切换请求头变成正式密钥。
- Live checkout 增加前置校验。`WAFFO_LIVE_PRIVATE_KEY_SHA256` 必须匹配经 Owner 核验的正式私钥 PEM 解码后的 DER 字节。产品必须有生产版本，且 Store 的生产权限已开启。指纹只绑定文件，不证明密钥所属环境；仍要按正式后台或供应商 API 核对来源。

## 仍需按顺序完成

| 项目 | 当前状态和工程动作 |
| --- | --- |
| 正式密钥 | 规范化、DER 指纹、provider 环境与商户／店铺归属及八项 server secret 接入、读回已完成 |
| 结算账户 | 已添加且绑定正确；unverified 不单独作为配置未完成的证据。Owner 核对合同条件，并在首笔真实提款后核对验证状态及到账，无需重新添加 |
| 产品发布 | 四个 production SKU 已发布并读回 active、价格／货币／完整月年账期一致，无关既有产品不变；应用收费仍关闭 |
| 接收与返回地址 | 正式 webhook 已部署并注册、拒绝无签名请求。完整正式 HTTPS Dashboard /billing/checkout 仍待受审发布；QA 静态页不能代替 |
| 实际支付方式 | 根据正式产品类型与货币读回收银台。文档提供 card、Apple Pay、Google Pay、WeChat；支付宝是商户结算渠道，不作为当前买家付款权益承诺 |
| 真实试点 | 发布与试点授权后核对真实付款、账本、权益、取消、退款和后续结算。正式年付版本、完整首期与下次扣款日期由工程验证 |

公开费率不等于当前账户合同。正式启用前核对卡/钱包固定费用、退款费用及最低提现手续费，避免用测试交易估算实际净收入。[官方费率](https://docs.waffo.ai/mor/fees)、[结算流程](https://docs.waffo.ai/merchant/payout-flow)。

## 启用门槛

未完成以上验收时，live policy 保持 preview，正式 checkout_verified 和促销开关保持关闭。[PR #772](https://github.com/xiufengsun/TokenTracker/pull/772) 已公开可见、仍为 draft，未合并；没有发布上线公告、开启真实收费或公开发行。最新通过的工程提交、后端 19 候选/14 待替换以及仍未完成的发布门槛见 [总表](cloud-release-readiness.md)。

后端继续用现有付费InsForge。Windows工作已接续整合，最新普通支付返回的OS/GUI及安装器步骤仍需实际设备，见[交接文档](windows-cloud-acceptance.md)。Browser Use拒绝的外部协议点击需人工执行，不通过其他工具绕过；这些设备步骤不阻塞其余工程准备。

平台契约见 [认证与环境](https://docs.waffo.ai/api-reference/authentication)、[首次发布](https://docs.waffo.ai/api-reference/endpoints/subscription-products/publish-product)和 [Store 部分更新](https://docs.waffo.ai/api-reference/endpoints/stores/update-store)。
