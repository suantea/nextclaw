# 迭代完成说明

- 2026-09-18 对 maintainability 红区注册表（`scripts/governance/maintainability/maintainability-hotspots.mjs`）做完整性对账：6 条红区中 3 条指向已经不存在文件——`packages/nextclaw-core/src/agent/loop.ts`、`packages/nextclaw/src/cli/commands/diagnostics.ts`、`packages/nextclaw-ui/src/components/config/ProviderForm.tsx`，导致 `pnpm lint:maintainability:hotspots` 退出码为 1，且红区守卫对其接任者完全失效（触达这些接任者不再要求留痕）。
- 按文件现状重指向 2 条：`core-runtime` → `packages/ncp-packages/nextclaw-ncp-agent-runtime-next/src/runtime/agent-runtime.service.ts`（728 行，kernel 消费的 NCP 主运行链路，orchestrator 预算 600），`cli-service-runtime` → `packages/nextclaw-service/src/services/diagnostics/diagnostics-commands.service.ts`（526 行；renderer 已下沉到 `utils/diagnostics/diagnostics-render.utils.ts`，但 runtime status 采集仍内联）。链名同步改为 `agent-runtime-main-chain`。
- 退役 1 条：`ui-config-forms`。原 `ProviderForm.tsx` 的拆分缝（form state / auth flow hook / field sections / submit adapter）已执行完成，接任模块为 `features/settings/{components/config,hooks,utils}` 下 15 个文件，最大 420 行，均在预算内。
- 根因不是单次遗漏，而是机制缺口：`structure-governance` CI 只跑 diff-only 治理门与 backlog ratchet，没有任何步骤校验清单完整性，所以目录重构后注册表可以长期静默失效。本次在 CI 加入 `pnpm lint:maintainability:hotspots` 步骤，并在脚本中对失效条目输出可操作的提示（重指向或退役）。
- `docs/workflows/maintainability-hotspot-freeze.md` 原先另行重复维护一份红区清单（7 条，实际已与数据源不一致，且引用了已不存在的 `post-edit-maintainability-guard`）。本次删除重复清单、改为指向数据源，修正失效引用，并把「重指向 / 退役」判定口径固化进文档。

## 判定依据与放弃的理由

- 判定口径：原路径消失后，若同一职责仍落在某个现存 owner 上则重指向；只有当原拆分缝确实执行完成、接任模块都在预算内时才退役。因此 `ui-config-forms` 退役、`cli-service-runtime` 重指向，而不是三条一起退役。
- 放弃「把 3 条死条目直接删除」：会让 NCP 主运行链路（728 行，超 orchestrator 预算 600）和诊断采集服务失去红区保护，等于用删清单掩盖漂移。
- 放弃「把 `server-config.store.ts`（1011 行）、discord（584）、telegram（417）一起重新评估」：本次只做完整性对账，避免为抵消漂移扩大范围；它们的条目仍然有效。
- 放弃新增红区条目（如渠道扩展平行重复的 weixin）：属于清单扩容决策，需要独立的证据与预算评估，不在本次范围。

# 测试/验证/验收方式

- `node scripts/governance/maintainability/maintainability-hotspots.mjs`：退出码 `0`，5 条红区全部 `exists: true`；对账前同一命令退出码为 `1`。
- `node scripts/governance/maintainability/maintainability-hotspots.mjs --json`：逐条确认 `path` 与磁盘现状一致。
- `pnpm lint:maintainability:hotspots`：与 CI 新增步骤使用同一入口，退出码 `0`。
- `node .agents/skills/development-review/scripts/check-maintainability.mjs --paths <变更文件>`：确认守卫读取新注册表后不再报失效条目，且对变更文件无新增 finding。
- `node --test .agents/skills/development-review/scripts/maintainability-guard-hotspots.test.mjs`：确认红区留痕检测逻辑未受注册表变更影响。

# 发布/部署方式

- 不适用（纯内部治理与 CI 变更，没有用户可见产品路径，不产生 changeset）。
- CI 变更随 PR 合入后即生效；注册表完整性从下一次同类重构起自动阻断。

# 用户/产品视角的验收步骤

- 不适用（内部治理机制，无用户可操作入口）。开发者与 AI 的验收入口是 `pnpm lint:maintainability:hotspots`，以及触达红区文件时 `pnpm lint:maintainability:guard` 是否要求迭代 README 中的 `## 红区触达与减债记录`。

# 可维护性总结汇总

- 红区清单重新变成单一 owner 事实：数据源 + 同一命令，文档不再复制清单。
- 复发防线从「靠人记得」变为 CI 门：清单指向的路径必须存在。
- 触达红区文件时的留痕要求对新接任者重新生效，守卫覆盖率从 3/6 恢复到 5/5。
