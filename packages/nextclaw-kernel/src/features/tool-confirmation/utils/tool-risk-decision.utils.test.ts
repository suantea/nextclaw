import { describe, expect, it } from "vitest";
import { ToolRiskPolicySchema } from "@nextclaw/core";
import { evaluateToolRisk } from "./tool-risk-decision.utils.js";

const EMPTY_POLICY = ToolRiskPolicySchema.parse({});

describe("evaluateToolRisk", () => {
  it("treats unregistered tools as low risk without confirmation", () => {
    const decision = evaluateToolRisk({
      toolName: "fs.read",
      args: { path: "/tmp/a.txt" },
      policy: EMPTY_POLICY,
    });

    expect(decision.risk).toBe("low");
    expect(decision.requiresConfirmation).toBe(false);
  });

  it("requires confirmation for high risk tools without extra conditions", () => {
    const policy = ToolRiskPolicySchema.parse({
      entries: { "exec.run": { risk: "high" } },
    });

    const decision = evaluateToolRisk({
      toolName: "exec.run",
      args: { command: "rm -rf /" },
      policy,
    });

    expect(decision.risk).toBe("high");
    expect(decision.requiresConfirmation).toBe(true);
  });

  it("keeps the reason hint for UI display", () => {
    const policy = ToolRiskPolicySchema.parse({
      entries: {
        "fs.remove": {
          risk: "critical",
          reasonHint: "删除文件不可恢复，需要用户确认",
        },
      },
    });

    const decision = evaluateToolRisk({
      toolName: "fs.remove",
      args: { path: "/tmp/data.db" },
      policy,
    });

    expect(decision.reasonHint).toBe("删除文件不可恢复，需要用户确认");
  });

  it("requires confirmation only when a requireConfirmWhen condition matches", () => {
    const policy = ToolRiskPolicySchema.parse({
      entries: {
        "fs.remove": {
          risk: "critical",
          requireConfirmWhen: ["recursive=true"],
        },
      },
    });

    const matching = evaluateToolRisk({
      toolName: "fs.remove",
      args: { path: "/tmp", recursive: "true" },
      policy,
    });
    expect(matching.requiresConfirmation).toBe(true);

    const notMatching = evaluateToolRisk({
      toolName: "fs.remove",
      args: { path: "/tmp/data.db" },
      policy,
    });
    expect(notMatching.requiresConfirmation).toBe(false);
  });

  it("matches bare-key conditions by argument presence", () => {
    const policy = ToolRiskPolicySchema.parse({
      entries: {
        "fs.remove": { risk: "critical", requireConfirmWhen: ["recursive"] },
      },
    });

    const decision = evaluateToolRisk({
      toolName: "fs.remove",
      args: { recursive: true },
      policy,
    });

    expect(decision.requiresConfirmation).toBe(true);
  });
});
