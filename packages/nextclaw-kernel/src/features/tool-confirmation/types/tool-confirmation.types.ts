import type { ToolRiskLevel } from "@nextclaw/core";

export type ToolConfirmationStatus = "pending" | "approved" | "rejected" | "timed_out";

export type PendingToolConfirmation = {
  id: string;
  sessionId: string;
  agentId?: string;
  toolName: string;
  args: Record<string, unknown>;
  risk: ToolRiskLevel;
  reasonHint?: string;
  status: ToolConfirmationStatus;
  createdAt: number;
  expiresAt: number;
  decidedAt?: number;
  decidedBy?: string;
};

export type ToolConfirmationAuditRecord = {
  id: string;
  sessionId: string;
  toolName: string;
  risk: ToolRiskLevel;
  decision: "approved" | "rejected" | "timed_out";
  decidedAt: number;
  decidedBy?: string;
};
