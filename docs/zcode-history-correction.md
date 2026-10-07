# ZCode history correction in v0.96.0

After upgrading to v0.96.0, earlier ZCode totals can decrease, including months already uploaded to your account. This is an intentional correction for double-counted cache and reasoning tokens, tracked in [#554](https://github.com/xiufengsun/TokenTracker/issues/554) and [#584](https://github.com/xiufengsun/TokenTracker/issues/584).

ZCode's input counter includes cache reads and writes, and its output counter includes reasoning. Older versions added these components again. Corrected total usage is the original input plus output; cached and reasoning tokens remain represented in their respective columns and are counted once. The amount of the decrease depends on the workload. The 40–50% decrease reported in #584 is one user's measurement, not a universal adjustment.

On the first applicable sync, TokenTracker backs up existing queue files before rewriting their ZCode rows, resets the ZCode parser cursor, and rescans the local ZCode database. It queues retractions for the previous buckets and publishes replacement totals when account sync runs. This replaces previously uploaded historical buckets, rather than only sending new usage. The migration does not edit ZCode's database or other providers' usage. A second unchanged sync does not repeat the migration.

The local migration marker `zcodeInclusiveTokenRepair_2026_09` in `~/.tokentracker/tracker/cursors.json` records the correction time and queue-row counts. Adjacent `*.bak.*` queue backups preserve the earlier queue. Keep those backups and the original ZCode database if an individual discrepancy needs investigation; restoring inflated rows is not a fix. Do not upload full databases, session files, credentials, or cursor files to a public issue. A version number, affected dates, and redacted aggregate counters are enough to start.

## 中文说明

升级到 v0.96.0 后，ZCode 过去月份（包括已经上传到账号的数据）的总量可能下降。这是对缓存和推理 token 重复计数的历史修正，不是统一扣减：ZCode 的 input 已包含缓存读写，output 已包含推理，修正后的总量是原始 input + output，各分项仍然保留且只计一次。#584 中约 40–50% 的降幅来自该用户的工作负载，不能推广到所有用户。

首次适用的同步会先备份原有队列，再重建 ZCode 统计并在账号同步时覆盖原有历史桶；不会修改 ZCode 原始数据库，也不会修改其他来源的用量。迁移完成时间记录在本地 `cursors.json` 的 `zcodeInclusiveTokenRepair_2026_09` 中，重复同步不会再次运行此迁移。如有无法解释的差异，请保留本地数据库及 `*.bak.*` 备份，仅提交版本、日期和去敏后的汇总计数，不要公开完整日志、数据库、凭据或 cursor 文件（如 `cursors.json`）。
