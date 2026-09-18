# Maintainability Hotspot Freeze

## 目标

把仓库内已经确认的 maintainability 红区从“大家知道它危险”升级为“有固定清单、有明确边界、有默认留痕要求”的治理机制。

本文件对应仓库治理方案中的 `Phase 2: Hotspot Freeze`，与以下文件配套：

- 红区数据源（清单唯一 owner）：[`scripts/governance/maintainability/maintainability-hotspots.mjs`](../../scripts/governance/maintainability/maintainability-hotspots.mjs)
- 默认守卫：[`development-review`](../../.agents/skills/development-review/SKILL.md) 的 diff-only maintainability 检查（`pnpm lint:maintainability:guard`）
- 上层方案：[`2026-03-19-repo-maintainability-governance-plan.md`](../plans/2026-03-19-repo-maintainability-governance-plan.md)

## 默认规则

1. 红区文件清单以数据源文件为准；本文件不再重复维护清单，避免两处漂移。
2. 触达红区文件时，不允许继续把 unrelated logic 塞进原文件。
3. 触达红区文件时，必须在本次 `docs/logs/v<semver>-<slug>/README.md` 增加 `## 红区触达与减债记录`。
4. `红区触达与减债记录` 下必须为每个被触达的红区文件写一个独立块，标题格式固定为 `### <repo-path>`。
5. 每个红区块必须至少包含三行：
   - `- 本次是否减债：是/否`
   - `- 说明：...`
   - `- 下一步拆分缝：...`
6. 默认通过 `pnpm lint:maintainability:guard` 在收尾阶段校验这条规则；缺失日志或格式不完整视为阻塞项。
7. 清单完整性由 `pnpm lint:maintainability:hotspots` 保证，并已接入 `structure-governance` CI：任何条目指向不存在的文件都会失败。

## 查看红区清单

- 全部红区：`node scripts/governance/maintainability/maintainability-hotspots.mjs`
- 只看指定红区：`node scripts/governance/maintainability/maintainability-hotspots.mjs --paths <repo-path>`
- 机器可读输出：追加 `--json`

每个红区的链路归属、允许新增职责、禁止新增职责与下一步拆分缝，都以数据源文件中的定义为准。命令退出码非 0 表示存在失效条目，必须先对账。

## 日志模板

```md
## 红区触达与减债记录

### packages/nextclaw-service/src/services/diagnostics/diagnostics-commands.service.ts
- 本次是否减债：否
- 说明：本次只修复诊断字段映射错误，未继续向文件内增加新的编排阶段。
- 下一步拆分缝：把 runtime status collector 从命令服务中拆出。
```

## 何时更新红区清单

- 某文件持续成为 maintainability report 热点
- 某文件明显已经无法一句话说清职责
- 某文件位于主链路，且继续增长会显著提高后续改动风险
- 某文件已拆分稳定，不再需要红区冻结时

更新红区清单时，必须同步：

- 更新 [`scripts/governance/maintainability/maintainability-hotspots.mjs`](../../scripts/governance/maintainability/maintainability-hotspots.mjs)
- 运行 `node scripts/governance/maintainability/maintainability-hotspots.mjs`，确认退出码为 0
- 在对应迭代 README 中记录为什么新增、移除或调整红区

## 条目判定口径

仓库发生目录重构后，原红区路径可能整体消失。此时按下列口径二选一，不接受“文件没了就默认忽略”：

- **重指向**：原文件消失，但同一职责仍落在某个现存 owner 上（含已经拆出部分职责、但仍在同一文件内联多职责、且自身处或接近预算上限的文件）。把条目改到该 owner，并按当前实际职责重写理由、禁止项与拆分缝。
- **退役**：原文件消失，且原拆分缝已执行完成、接任模块都在各自预算内。此时删除条目，并在迭代 README 记录退役依据。

判定以文件现状与预算数据为准，不以“是否还有历史包袱”的印象为准。
