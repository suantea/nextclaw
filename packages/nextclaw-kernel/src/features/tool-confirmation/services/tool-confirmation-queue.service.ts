import { randomUUID } from "node:crypto";
import type { ToolRiskLevel } from "@nextclaw/core";
import type {
  PendingToolConfirmation,
  ToolConfirmationAuditRecord,
} from "@kernel/features/tool-confirmation/types/tool-confirmation.types.js";

export type CreatePendingToolConfirmationInput = {
  sessionId: string;
  agentId?: string;
  toolName: string;
  args: Record<string, unknown>;
  risk: ToolRiskLevel;
  reasonHint?: string;
  confirmTimeoutSec: number;
  now?: number;
};

export type ToolConfirmationResolution = "approved" | "rejected";

/**
 * 高风险工具调用的挂起队列（内存实现）。
 *
 * - 命中确认策略的调用先进入 pending，不直接执行；
 * - 批准/拒绝记录裁决来源；超时由 consumeExpired 统一转为 timed_out 并审计；
 * - 同一会话可查询 pending，供确认卡/文本指令消费。
 */
export class ToolConfirmationQueueService {
  private readonly pending = new Map<string, PendingToolConfirmation>();
  private readonly audit: ToolConfirmationAuditRecord[] = [];

  enqueue = (input: CreatePendingToolConfirmationInput): PendingToolConfirmation => {
    const now = input.now ?? Date.now();
    const record: PendingToolConfirmation = {
      id: `confirm_${randomUUID()}`,
      sessionId: input.sessionId,
      agentId: input.agentId,
      toolName: input.toolName,
      args: input.args,
      risk: input.risk,
      reasonHint: input.reasonHint,
      status: "pending",
      createdAt: now,
      expiresAt: now + input.confirmTimeoutSec * 1000,
    };
    this.pending.set(record.id, record);
    return record;
  };

  resolve = (
    id: string,
    resolution: ToolConfirmationResolution,
    decidedBy?: string,
    now: number = Date.now(),
  ): PendingToolConfirmation | undefined => {
    const record = this.pending.get(id);
    if (!record || record.status !== "pending") {
      return record;
    }
    if (now >= record.expiresAt) {
      return this.timeOut(id, now);
    }
    record.status = resolution;
    record.decidedAt = now;
    record.decidedBy = decidedBy;
    this.audit.push({
      id: `audit_${randomUUID()}`,
      sessionId: record.sessionId,
      toolName: record.toolName,
      risk: record.risk,
      decision: resolution,
      decidedAt: now,
      decidedBy,
    });
    return record;
  };

  listPending = (sessionId?: string): PendingToolConfirmation[] => {
    const records = [...this.pending.values()].filter((record) => record.status === "pending");
    return sessionId === undefined ? records : records.filter((record) => record.sessionId === sessionId);
  };

  consumeExpired = (now: number = Date.now()): PendingToolConfirmation[] => {
    const expired: PendingToolConfirmation[] = [];
    for (const [id, record] of this.pending) {
      if (record.status === "pending" && now >= record.expiresAt) {
        expired.push(this.timeOut(id, now));
      }
    }
    return expired;
  };

  listAudit = (sessionId?: string): ToolConfirmationAuditRecord[] => {
    const records = this.audit;
    return sessionId === undefined
      ? [...records].reverse()
      : [...records.filter((record) => record.sessionId === sessionId)].reverse();
  };

  private timeOut = (id: string, now: number): PendingToolConfirmation => {
    const record = this.pending.get(id);
    if (!record) {
      throw new Error(`Unknown pending confirmation: ${id}`);
    }
    record.status = "timed_out";
    record.decidedAt = now;
    this.audit.push({
      id: `audit_${randomUUID()}`,
      sessionId: record.sessionId,
      toolName: record.toolName,
      risk: record.risk,
      decision: "timed_out",
      decidedAt: now,
    });
    return record;
  };
}
