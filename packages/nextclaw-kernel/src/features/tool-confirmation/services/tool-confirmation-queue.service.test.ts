import { describe, expect, it } from "vitest";
import { ToolConfirmationQueueService } from "./tool-confirmation-queue.service.js";

const BASE_NOW = 1_800_000_000_000;

function createQueue(): ToolConfirmationQueueService {
  return new ToolConfirmationQueueService();
}

describe("ToolConfirmationQueueService", () => {
  it("enqueues a pending confirmation that expires after the timeout", () => {
    const queue = createQueue();
    const record = queue.enqueue({
      sessionId: "session-1",
      agentId: "agent-1",
      toolName: "fs.remove",
      args: { path: "/tmp/data.db" },
      risk: "critical",
      confirmTimeoutSec: 120,
      now: BASE_NOW,
    });

    expect(record.status).toBe("pending");
    expect(record.expiresAt).toBe(BASE_NOW + 120_000);
    expect(queue.listPending("session-1")).toHaveLength(1);
  });

  it("resolves an approval and writes an audit record", () => {
    const queue = createQueue();
    const record = queue.enqueue({
      sessionId: "session-1",
      toolName: "exec.run",
      args: {},
      risk: "high",
      confirmTimeoutSec: 120,
      now: BASE_NOW,
    });

    const resolved = queue.resolve(record.id, "approved", "desktop-ui", BASE_NOW + 5_000);

    expect(resolved?.status).toBe("approved");
    expect(resolved?.decidedBy).toBe("desktop-ui");
    expect(queue.listAudit("session-1")).toHaveLength(1);
    expect(queue.listAudit("session-1")[0].decision).toBe("approved");
  });

  it("rejects a request and keeps the pending list empty after resolution", () => {
    const queue = createQueue();
    const record = queue.enqueue({
      sessionId: "session-2",
      toolName: "fs.remove",
      args: {},
      risk: "critical",
      confirmTimeoutSec: 120,
      now: BASE_NOW,
    });

    const resolved = queue.resolve(record.id, "rejected", "cli", BASE_NOW + 1_000);

    expect(resolved?.status).toBe("rejected");
    expect(queue.listPending("session-2")).toHaveLength(0);
    expect(queue.listAudit("session-2")).toHaveLength(1);
  });

  it("turns expired pending confirmations into timed_out via consumeExpired", () => {
    const queue = createQueue();
    const record = queue.enqueue({
      sessionId: "session-3",
      toolName: "fs.remove",
      args: {},
      risk: "high",
      confirmTimeoutSec: 120,
      now: BASE_NOW,
    });

    const expired = queue.consumeExpired(BASE_NOW + 121_000);

    expect(expired).toHaveLength(1);
    expect(expired[0].status).toBe("timed_out");
    expect(queue.listAudit("session-3")[0].decision).toBe("timed_out");
  });

  it("refuses to approve after the timeout has passed", () => {
    const queue = createQueue();
    const record = queue.enqueue({
      sessionId: "session-4",
      toolName: "fs.remove",
      args: {},
      risk: "critical",
      confirmTimeoutSec: 30,
      now: BASE_NOW,
    });

    const lateResolution = queue.resolve(record.id, "approved", "desktop-ui", BASE_NOW + 31_000);

    expect(lateResolution?.status).toBe("timed_out");
    expect(queue.listAudit("session-4")[0].decision).toBe("timed_out");
  });
});
