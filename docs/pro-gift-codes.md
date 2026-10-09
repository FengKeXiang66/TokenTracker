# Pro 赠送码

赠送码由 TokenTracker 后端发放会员权益。Waffo 继续处理付费订阅，赠送不创建订单、付款或自动续费。

## 用户体验

账户中的 Pro 区提供“兑换会员”入口。用户登录后输入兑换码，服务端核验并绑定账号；每个码只能领取一次，同一账号重试不会重复加时。可赠送30、90或365天，所有日期以服务端为准。领取记录与付款记录分别显示，赠送用户拥有完整Pro权益和标识。

自动续费未关闭或仍有待处理付款时，兑换不会消耗码。用户先处理现有订阅或订单，再领取。固定期会员、已关闭续费的会员在当前已付权益结束后接续赠送期。礼遇期间暂不创建新的付费订单，避免付费期与赠送期重叠。未来礼遇的既定日期不会随付款退款改写，赠送也不会改变供应商的扣款日。

码的领取截止时间与领取后的会员期限分别管理。批次停用只阻止尚未领取的码；撤回已经领取的权益是另一项明确管理操作。到期后回到免费社区权限，完整本地功能和记录保留。

## 私有管理

管理命令使用现有InsForge的服务端凭据，不在网页暴露管理员密钥。环境必须明确指定。原码只写一次到私有JSON文件，数据库仅保存哈希；命令输出只包含批次、数量和文件路径。不要把原码文件、管理员配置或服务密钥加入仓库。

原码生成和断线恢复使用已经验证的macOS/Linux私有文件权限。Windows的NTFS私有ACL尚未验证，因此这两项管理操作暂时关闭；Windows用户在应用内兑换不受影响。其他管理查询可通过服务端环境凭据运行，Windows不读取未经验证ACL的管理员配置文件。生成文件前需要Git检查；Git缺失或检查失败会拒绝写入，仓库内文件必须被ignore。

```sh
node scripts/pro-gift-codes.cjs generate --environment sandbox \
  --project-file /absolute/private/.insforge/project.json \
  --days 30 --count 10 --expires 2026-12-01T00:00:00Z \
  --label contributors --out /absolute/private/contributor-codes.json
```

网络超时后复用已经保存的文件，命令会提交同一个批次及哈希集合。

```sh
node scripts/pro-gift-codes.cjs generate --environment sandbox \
  --project-file /absolute/private/.insforge/project.json \
  --resume /absolute/private/contributor-codes.json
```

`list`查看最近最多100个批次，`codes --batch UUID`查看该批次最多1000个领取记录和码尾号，`disable --batch UUID`停用未领取码，`revoke --grant UUID`撤回单个已领取权益。每条命令都需要同样的环境与私有配置参数。也可通过`INSFORGE_BASE_URL`、`INSFORGE_SERVICE_ROLE_KEY`传入服务端配置。

正式环境仍受现有发布门槛控制。自部署保持免费，不显示官方兑换入口；当前验收先在已有InsForge的受控沙盒完成，不启用正式收费或批量给真实用户发码。
