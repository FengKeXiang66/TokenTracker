# Cloud / Pro 上线前交接总表

## 最新已核验候选：1.3.0 / c3909232

应用与受审来源 **c3909232d416ff113aad417da892deafe1c50a84**。第二批改动使设备身份配置写入通过随机 wx/0600 临时文件原子替换；WorkBuddy trace 从同一打开的 descriptor 检查和读取；Bot 帧构建使用独立 mkdtemp 目录，只清理自己的文件；Windows 包清单大小/hash 从同一 buffer 获取；代理错误只返回限长首行或通用信息，不调用未知异常的 toString。Windows POSIX mode 不作为 NTFS ACL 证明。

本机实际 Node22 目标组 **414 通过/1 文件符号链接权限跳过/0 失败/0 取消**，12 文件、415 项、92.246 秒自然结束；十份源码/测试运行前后 hash 及提交 blob 一致。旧 Bot 临时文件与 WorkBuddy 路径替换均在同一新增回归中实际失败，修复后通过。证据 acceptance-windows-security-second-combined.json/log、acceptance-security-second-commit-binding.json 及两个 before 探针。

[CI 37980273730](https://github.com/xiufengsun/TokenTracker/actions/runs/37980273730) 四个 job 全通过：Windows Node24 与实际打包 Node22 均 **3891 项、3851 通过、40 条件跳过、0 失败/取消**，分别 206.348 秒/181.320 秒；.NET **117/117**。Linux Node **3881 通过/8 跳过**、macOS Node **3885 通过/4 跳过**及 **239 项原生测试**全通过，Rust job 全通过。新增文件链接替换、代理异常和 WorkBuddy 替换回归在 Windows CI 实际执行，文件链接回归在 macOS/Linux 亦执行通过。证据 acceptance-security-second-ci.json 与各 job log。

第二批五项源码告警自动关闭。完整 SARIF/源码与回归逐项核对后，5 条隔离测试告警以 used in tests、11 条预期且受约束的数据流以 false positive 标记，并逐条读回；未禁用查询或忽略目录。实际 PR 安全 check **113989824128 已为 success**，标题为 No new alerts in code changed by this pull request；历史注释计数仍 16，不能写成原始扫描零告警。分支仍有 **15 条主干已有 open**，未一并关闭；具体依据和剩余范围见 [逐项安全审查](cloud-security-review.md)，证据 acceptance-security-reviewed-adjudications.json、acceptance-security-second-gate.json。

该提交的 Windows archive **195991257 字节 / SHA256 4b1c5348409bee4d0f9614ba196e2e3b6a1b0a777912c2186df7dd462478b4fe** 与 GitHub digest 相同；实际 checkout **a9e0c1e6aaede654385fe88f1269f61537761712** 的 tree **65cd95e5a136a0fdca3dea4a105862d76f8a28c9** 与受审 head 一致。**984/984 文件大小/hash、109 份嵌入源码 Git blob** 全匹配；四项现有私钥/管理 key 字节模式零命中。ZIP **115721260 字节 / SHA256 dd1a078431508ce709799d578cebc3896e26f7d4a27fea3830d8c2362f330766**；Inno **81392446 字节 / SHA256 1647ad975e4548fec1228134b2f75188a65b48df295c023c496c4b8b19ecbe2b**。

实际该包的 DLL/EmbeddedServer **30/30 原生窗口检查**通过；实际打包 Node22.22.2 和包内 OpenClaw/Unicode 技能复制/原子 JSON/Bearer/代理/WorkBuddy 模块 **55 通过、1 本机链接权限跳过、无失败/取消**。测试只复用 Smoke 宿主，应用 DLL/运行时/loader 来自新包，来源断言通过；未操作已有用户安装。证据 security-second-ci-native-final/native-smoke.json、acceptance-security-second-packaged-modules.json 和合并 checkpoint。不是完整 Program.Main/托盘、单实例/Job Object、OS 协议付款返回或安装/升级/卸载证明。

最近 fetch：main **e6186b35**、功能分支 **c3909232** 均无外部新增提交，主干已为当前分支祖先；PR MERGEABLE/CLEAN，保持 draft。UTC 19:32 正式后台只读核对仍 hosted/preview、launch_at=NULL、live 订单/支付/订阅均 0；Waffo 商户 active、payoutEnable=true、绑定匹配，但 channelStatus=unverified/channelVerifiedAt=NULL。没有开启收费、会员限制、促销或归档。当前工程与 Owner 门槛继续以本文后续表格为准。

## 第一批安全修复：CI 已通过，安全门禁与新包待验收

第一批已修复 Bearer 前缀解析的重叠正则、静态文件检查/读取竞态，以及 gift admin 的私有凭据与 resume 文件校验/读取竞态。Windows 私有文件入口仍按原 ACL 门槛关闭。支付测试 URL 条件改为精确 origin 判断。

对应 Windows Node22 目标回归 89 通过/7 条件跳过、无失败或取消，九份变更与提交 blob 一致。旧静态服务器替换回归实际失败；旧 Bearer 表达式对长空格加两个换行的畸形值在隔离进程超出 1.5 秒预算，修复后完成。纯空格值未复现超时，Node HTTP parser 本身拒绝含换行的 header，未声称已经证实可远程利用的 HTTP 攻击。证据 acceptance-windows-security-final-fixes.json/log、acceptance-security-before-fixes.json；其后完整跨平台 CI 结果见上。

2026-10-10（Asia/Shanghai）核对。Owner 已确认全球未税基础价 **USD4.99/月、USD39.99/年**，自动续费与固定期同价。工程已完成下列生产准备；**尚未达到正式收费发布标准**，实际资金、结算和原生设备门槛必须有真实证据。生产 policy 仍为 preview，launch_at 为 NULL，收费、会员限制、促销和生产归档均未启用。

## 已核验 checkpoint：Node22 中文路径兼容修复

上一已核验应用 checkpoint 为 **1.3.0 / 896baa52b060dac3f7d34ce22312a0f184a87fcd**。补查安装包实际使用的 Node22.22.2 发现递归复制中文目录会原生终止，退出码 3221226505；此前同应用源码的完整 Node22 结果为 3825 通过、1 个文件失败、47 跳过，缺少该崩溃文件内另外三项结果，不能按完整用例通过计数。隔离目录的 native copy 复现相同退出码，而保留全部条目的 JS 遍历能成功；[Node 官方问题记录](https://github.com/nodejs/node/issues/59636)有同类 Windows Unicode copy 退出。

技能导入与链接失败的复制分支现在为 Windows 的 fs.cpSync 添加恒真 filter，选择 Node 的 JS 目录遍历；不跳过文件，保留同步调用、嵌套路径 guard 和链接处理。新回归用隔离子进程实际复制中文用户目录、嵌套 UTF-8 文件，并强制 EPERM 覆盖链接 fallback；不操作用户技能。TRAE trim fixture 使用同一 Windows 遍历方式，继续检验完整的裁剪后运行库。

修复后的实际 Node22.22.2 完整回归：**363 文件、3877 项，3830 通过、0 失败、0 取消、47 跳过**，188 秒自然结束，四项 profile 隔离、子进程 PATH 固定同一 Node，未修改系统 PATH。四份变更文件运行前后 hash 一致，提交 Git blob 全匹配；证据 acceptance-windows-node22-copy-full-fixed.json/log、acceptance-node22-copy-commit-binding.json。Node22 专项 62 通过/6 条件跳过，Node24 专项 74 通过/6 条件跳过，均无失败或取消。

Windows CI 使用实际打包 Node22 再跑完整测试，另保留 Node24 全量。[CI 37973812448](https://github.com/xiufengsun/TokenTracker/actions/runs/37973812448) 四个 job 全通过；Windows 两个 Node 版本均为 3840 通过/37 跳过/0 失败/0 取消，分别 201 秒和 167 秒，.NET 117/117；Linux Node 3867/8 跳过、macOS Node 3871/4 跳过及 239 项原生测试全通过。十项本机链接权限跳过在 CI 实际运行通过。证据 acceptance-node22-copy-ci.json 与各 job log。

受审 head **29b02f5a9960cdb0b16cfb2d5215ad1c9f4336c1** 的 Windows 产物已独立下载核验：archive 195992529 字节、SHA256 7af2e4e1a6e81d809536a9c138edb92caa19093384c0a2ad5a767f8ca4bdd48f，与 GitHub digest 相同；checkout a4e489556b14aaa67a32dceb46d67fc71a92eb33 的 tree 275f67f25cbe7d2d81cba5fbebeea85b31060851 与受审 head 一致。982/982 文件大小/hash、107 份嵌入源码 Git blob 全匹配；四项现有私钥/管理 key 字节模式零命中。ZIP 115719886 字节、SHA256 a33757e232db0499cfb03792805a58f5d09ba6b164694c75174220d164c79e80；Inno 81394638 字节、SHA256 692c733aae89b33f3a0b0e96dff8dd8e938cf64ea63489508ed595eea51c5082。

实际新 CI DLL/EmbeddedServer 的 30 项原生窗口检查通过，node22-copy-ci-native-final/native-smoke.json；实际包内 Node22.22.2/OpenClaw/中文技能复制另有 18/18，acceptance-node22-copy-packaged-modules.json。前两次宿主构造失败（多复制 CLR host 文件影响 framework 查找；Smoke deps 预解析 harness 内 DLL）均保留失败记录；最终只复用 Smoke 测试宿主并移除其应用 deps 绑定，发布 DLL、WebView2 loader 与 EmbeddedServer 全部来自新包，源码位置断言通过。没有操作已有用户安装；不是完整 Program.Main/单实例/Job Object、OS 协议支付返回或安装/升级/卸载证明。

CodeQL 的 workflow 37973812430 执行成功，但 PR 的 CodeQL 安全门禁 113968044957 失败，报 27 条新注释（13 high、14 medium）；分支总计 42 条 open，主干 23 条 open，按告警编号比较有 21 条仅在分支存在。扫描流程成功不等于安全验收通过，注释数量也不等于已经确认的可利用漏洞。原始注释、分支/主干比较私有保存；工程继续逐项判定和修复，不能把 Owner 登录或资金门槛当作这部分工程工作的替代。

该历史 checkpoint 受审 head 为 29b02f5a，应用源码为 896baa52。此前 CI 37973032260 的 macOS notify fixture 在标记文件刚创建、尚未写完时读取到空内容；29b02f5a 仅把 Bun/Deno 测试标记改为临时文件写完后 rename，不改变产品行为，不忽略空内容失败。Windows 对应目标文件 40 通过/4 条件跳过；旧 CI 被替代运行取消，不能记为全绿。替代运行全部构建/测试通过，结果见上；安全门禁独立保持未通过。

## 前一 checkpoint：Windows Node24 全量回归

应用 checkpoint 已推进到 **1.3.0 / 60b8935b0211d249771765aeeec03b12778f0a6d**。本机 Node24.19.0 的 362 文件完整回归在 184 秒自然结束：**3876 项，3829 通过、0 失败、0 取消、47 跳过**，未触发测试超时。四项 profile 隔离，SQLite CLI 仅加入测试子进程 PATH。运行前后 29 份变更文件的 SHA256 一致，并在提交前再次逐文件校验；证据 acceptance-windows-release-full.json/log 与提交绑定记录。下文 b0a6544d 的 61 项失败是此前快照。

修复了真实 Windows OpenClaw npm 启动问题：从 PATH 对应 npm prefix 的 package.json 解析 JS bin，以当前 Node 直接启动；路径中文、空格、&、% 与特殊参数保持字面值，不交给 cmd.exe 重解释。命令 hook 与 session plugin 共用启动器，超时、启动错误和信号退出均不能误报成功。53 项相关回归通过。其他修复包括 where/which 探测夹具、中文系统默认语言、原生路径分隔符、SQLite WAL 写进程退出等待，以及 NTFS 大 inode 数字下的测试哨兵。

47 项跳过保留具体理由；本次新增的平台限定用于 Unix nvm/procfs、POSIX env/shebang 和 Linux Bash 打包夹具，Linux/macOS CI 仍执行这些检查。Windows 原生进程/端口、Node 通知链与目录 junction 检查仍运行。POSIX mode bits 不作为 NTFS ACL 证据；UNC 前缀分支用本地可读别名验证，不等于真实 WSL 挂载验收。

Windows CI 已扩大为完整 Node 回归，并在 Dashboard 构建后运行；SQLite 3.54.0 官方工具的大小及 SHA3-256 在解压前校验。这是测试依赖，没有加入产品或系统 PATH。[CI 37970035795](https://github.com/xiufengsun/TokenTracker/actions/runs/37970035795) 四个 job 及 [CodeQL 37970035738](https://github.com/xiufengsun/TokenTracker/actions/runs/37970035738) **全部通过**。Windows Node 为 3839 通过、0 失败、0 取消、37 跳过；本机额外跳过的十项符号链接测试在 CI 实际通过。macOS Node 为 3870 通过/4 跳过，Linux Node 为 3866 通过/8 跳过，均无失败或取消；Windows .NET 117/117。日志 acceptance-release-ci.json/log，差异为 acceptance-release-ci-skip-comparison.json。

60b8935b 新候选产物已独立下载核对：archive **195989292 字节 / SHA256 c24b1da9e8f461a0082dc58fe3c8a47d5f7415e14fea8b5506e04558e7685a80** 与 GitHub digest 一致。实际 checkout f828941f2f934887d08153402a60d4ebcd8d7e5b 的 Git tree **649e60a7dca5380593263e2d90031c7aa85f49b2** 与受审应用 head 相同；**982/982 文件大小/hash、107 个嵌入源码 Git blob** 匹配。ZIP **115719733 字节 / SHA256 bfd3dcc267e60841fac380c67de56dd2378ea67fde3a0565f902524020cc7012**；Inno **81391778 字节 / SHA256 9a2622e808153a1ae240b8f7abc864a3b6816dfaba9f387dd97b6e27c32366c4**。四项现有私钥/管理 key 字节模式零命中。证据 acceptance-release-artifact-download.json、acceptance-release-artifact-verification.json；不沿用旧包 hash 或已清除的 QA 凭据扫描数量。

实际新 CI DLL/EmbeddedServer 已通过 **30/30 原生窗口检查**，release-ci-native/native-smoke.json；实际打包 Node22.22.2 与包内 OpenClaw 模块另通过 **17/17**，acceptance-release-packaged-openclaw.json，不使用仓库模块或系统 Node。Node24 全量与打包 Node22 的这组专项范围分开，未称 Node22 全量通过。安装器生命周期、Program.Main 完整托盘、操作系统协议付款返回、真实 WSL 挂载和 NTFS ACL 仍无本轮通过证据。

同轮正式后台只读复核仍为 hosted/preview、launch_at=NULL，生产订单/支付/订阅全部为 0，acceptance-release-live-state.json。Waffo 查询未请求账号/银行号码，仍为 payoutEnable=true、绑定匹配、channelStatus=unverified、channelVerifiedAt=NULL；最新响应保留在受限私有目录。未启用收费或改变商户账户。

## 源码、候选版本与审核

- 分支为 feat/cloud-subscriptions，草稿 PR 为 [#772](https://github.com/xiufengsun/TokenTracker/pull/772)。最新主干 e6186b350df7942f356ef9155af71fe81a9a99d1 已通过 ac9cfd8e 合入；六处文案冲突按键合并，Sessions 与 Pro 的独立修改均保留。最近 fetch 没有新增主干或功能分支提交。
- 应用审核 checkpoint 为 268896e7a1fabbe75f89f302d0bc5ed7b5cb5a4a。已修复 checkout 恢复缓存，只持久化六个允许的订单字段；用户身份运行时派生，密码、token、邮箱、收银台 URL 和额外字段不进入缓存。CodeQL 高危告警自动关闭，无人工 dismiss，功能分支开放告警为 0。
- 初始 1.3.0 版本 checkpoint 为 **1c96a2ccb67a00a4037eddb7b8a5c613085c5a83**，通过 npm version --no-git-tag-version 同步所有平台和锁文件，不创建远端 tag，不复用已发布的 v1.2.2。该应用提交已通过完整 CI；安全修复 checkpoint 8497d6e9 亦通过完整 CI/CodeQL；后续精确 SHA 的 checks 以 PR 为准；合入 main、npm 发布和统一桌面发行遵循 [CLAUDE.md](../CLAUDE.md)。当前没有公开 Release、收费启用或公告。
- 前一应用 checkpoint 为 **1.3.0 / b0a6544d039ab29e2add90c06a2e0da79201168e**，包含 Roo/Kilo Windows 盘符修复及验收工具修复。其 [CI 37965509474](https://github.com/xiufengsun/TokenTracker/actions/runs/37965509474) 四个 job 和 [CodeQL 37965509485](https://github.com/xiufengsun/TokenTracker/actions/runs/37965509485) 全部通过；草稿 PR 仍无冲突。下文旧 checkpoint/包只证明其各自来源。

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
| Roo/Kilo Windows 目录修复 | 发现自定义 TOKENTRACKER_KILOCODE_ROOTS 按冒号拆开 Windows 盘符，已改用系统 path.delimiter：Windows 多目录使用分号，Unix 继续冒号。实际临时目录扫描、token 聚合、重新运行去重与同一记录 backfill 共 14/14 通过，并加入 Windows CI。该 src 改动后的候选包已重新构建和独立核对，见最新候选包行；8497d6e9 的旧包仅证明其原始版本 |
| 修复后完整 Windows 回归 | 精确 b0a6544d、干净工作树、Node24.19.0、四项 profile 隔离，361 个文件自然结束：3869 项、3770 通过、61 失败、0 取消、38 跳过；168 秒，未触发 120 秒测试文件超时。acceptance-windows-after-drive-fix.json/log。比排障前快照减少六项失败；仍需继续逐项分析剩余失败，不是发布通过结果 |
| 前一 Windows 候选包 | b0a6544d 的 archive 195982701 字节、SHA256 4e9e35e9abd18b817c3d53c97dc45fd4ed156a614d3f9c22ec8f281f3316b06c，与 GitHub digest 一致。checkout 7fed619a2dbadde08353923ec62128adcb1cb10f 的 tree fda90533f0c2beb2df425e13327ea67046d4a09b 与 head 一致；981/981 文件清单/大小/hash、106 嵌入源码 Git blob 匹配。ZIP 115718626 字节、SHA256 cb394f582aee5726b89c45eb983f2815f9218ae55cb701368eefbc7a75166bb3；Inno 81385377 字节、SHA256 424b9e3fd37b7e0b46cd05bd69d43059320f99fccac8b24791ca5c6e641a362f。四项现有私钥/管理 key 字节模式零命中，未宣称重新扫描已清除的旧 QA 凭据。实际新 CI DLL/打包 Node 原生 30/30 通过，triage-ci-native/native-smoke.json；安装器生命周期、完整托盘及协议付款返回未执行 |
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
| 精确发行候选 | 最新 c3909232 四平台 CI、Windows Node24/包内 Node22 全量、984 文件/109 嵌入源码/hash/四项密钥扫描、30 原生窗口及 55 包内专项通过。PR 安全门禁在逐条判定后通过，15 条主干已有告警保持 open 需各自审查；真实资金、恢复、受保护前端和原生生命周期仍未通过。后续源码改变须重新按来源核对，正式发行走统一 npm/macOS/Windows/Linux 流程 |
| Windows 设备路径 | 普通账号切换、退出/刷新已通过；成功礼遇兑换显示仍待验证；专用干净设备完成完整托盘入口、协议返回、安装/升级/卸载及数据保留。窗口测试与安装器编译不能代替生命周期 |
| 完整正式返回页 | 工程将受审的 Dashboard /billing/checkout 部署至正式 HTTPS 站点，并验证来源、账单归属、失焦/重开恢复；8497d6e9 的 [Vercel Preview](https://dashboard-2wg4xipef-sunxiufeng1992-8555s-projects.vercel.app) 部署读回 success，但四个账单/法律路由均跳转 Vercel Login，浏览器亦无 Vercel 登录会话。需要 Owner 提供正常预览访问后验收；登录页 HTTP200 不算应用通过，现有 QA 静态页不算完整生产 Dashboard |
| 托管访问与恢复 | 工程在保持 preview 的前提完成其他正式函数部署顺序、免费/过渡/设备/导出回归及隔离备份恢复；归档未通过独立门槛时继续关闭 |
| 真实资金 | Owner 确定试点可用付款方式与金额上限并实际付款/系统确认；工程核对签名回调、订单、账本、完整月/年账期、拒付重试、取消和退款。不得把沙盒或手工造账当作真实交易 |
| 渠道与结算 | Owner 在 Waffo 确认渠道验证为何仍为 unverified，核对合同费率/币种/结算条件，试点后确认实际入账；工程保存脱敏状态证据 |
| 条款与启用 | Owner 确认退款/续费/隐私/客服政策和启用时间；工程准备具体文案、部署与回滚结果后再实施收费、公告和公开发行 |

自动审批审核此前拒绝完整托盘 Program.Main/单实例/Job Object 的额外测试，以及本机安装 Inno 的动作，均仅返回 blocked by policy；未执行或改工具绕过。另一次本机旧测试输出的递归清理也被拒绝，已保留旧目录并使用新的干净目录。CI 使用已安装的 Inno 编译器完成构建。工具拒绝的外部协议点击仍由本人在设备上完成。

此前各 checkpoint 的“CodeQL 通过”描述扫描 workflow 的执行结果，不作为当前 PR 安全告警清零证明。

## Owner 当前事项

密钥生成、账户添加/关联和价格确认已经完成，无需重复。剩余本人事项为：确认 Waffo 渠道验证和结算合同；登录受保护的 Vercel Preview 以便继续前端验收；提供隔离恢复环境，或明确 InsForge 分支预算及运行时限；实际完成受控支付与必要的系统确认、后续到账核对；确定最终条款及启用时间。专用 Windows 设备上的协议与安装生命周期还需要可执行的验收环境。工程尚未完成的部署和发行检查不能转写成 Owner 已验收；后台应继续保持 preview。

## 文档入口

[Cloud 交付](cloud-delivery.md)、[收款运维](cloud-billing-operations.md)、[Waffo 生产准备](waffo-production-readiness.md)、[Windows 验收](windows-cloud-acceptance.md)、[原生沙盒手册](native-sandbox-gateway-runbook.md)、[赠送码](pro-gift-codes.md)、[自部署](self-hosting-status.md)、[归档](cloud-usage-archive.md)、[规格](cloud-subscriptions.md)、[中文指南](cloud-guide.zh-CN.md)、[公告草稿](cloud-announcement-draft.md)。历史证据保留其注明的 SHA/环境，不升级为最新证据。
