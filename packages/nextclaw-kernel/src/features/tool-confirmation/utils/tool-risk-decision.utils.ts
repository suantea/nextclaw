import type { ToolRiskLevel, ToolRiskPolicy } from "@nextclaw/core";

export type EvaluateToolRiskInput = {
  toolName: string;
  args: Record<string, unknown>;
  policy: ToolRiskPolicy;
};

export type ToolRiskDecision = {
  risk: ToolRiskLevel;
  requiresConfirmation: boolean;
  reasonHint?: string;
};

/**
 * 评估一次工具调用是否命中高风险并需要人工确认。
 *
 * - 未登记的工具默认 low，不要求确认。
 * - risk 为 high/critical 时要求确认；若该工具声明了 requireConfirmWhen
 *   条件，则仅在至少一个条件命中时要求确认（空条件 = 总是要求确认）。
 * - 条件格式：`key`（参数存在且非空）或 `key=value`（参数强等匹配）。
 */
export function evaluateToolRisk({ toolName, args, policy }: EvaluateToolRiskInput): ToolRiskDecision {
  const entry = policy.entries[toolName];
  const risk: ToolRiskLevel = entry?.risk ?? "low";
  const reasonHint = entry?.reasonHint;

  if (risk !== "high" && risk !== "critical") {
    return { risk, requiresConfirmation: false };
  }

  const conditions = entry?.requireConfirmWhen ?? [];
  const requiresConfirmation =
    conditions.length === 0 || conditions.some((condition) => matchesCondition(condition, args));

  return { risk, requiresConfirmation, reasonHint };
}

function matchesCondition(condition: string, args: Record<string, unknown>): boolean {
  const separatorIndex = condition.indexOf("=");
  if (separatorIndex === -1) {
    return isTruthy(args[condition]);
  }
  const key = condition.slice(0, separatorIndex);
  const expected = condition.slice(separatorIndex + 1);
  return String(args[key]) === expected;
}

function isTruthy(value: unknown): boolean {
  return value !== undefined && value !== null && value !== "";
}
