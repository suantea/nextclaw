import { NcpEventType, type NcpEndpointEvent } from "@nextclaw/ncp";
import { Contribution, eventKeys, type Unsubscribe } from "@nextclaw/shared";
import type { NextclawKernel } from "@kernel/app/nextclaw-kernel.js";
import { readMemoryCaptureRuntimeConfig, type MemoryCaptureRuntimeConfig } from "../learning-loop/config.js";
import type { MemoryStore } from "@nextclaw/core";

type SessionStore = {
  getSessionRecord: (sessionId: string) => Promise<{
    metadata: Record<string, unknown>;
    messages: unknown[];
  } | null>;
  updateSessionMetadata: (
    sessionId: string,
    patch: Record<string, unknown>,
  ) => Promise<void>;
};

export class MemoryCaptureContribution extends Contribution {
  private readonly sessionStore: SessionStore;
  private readonly inFlightSessionIds = new Set<string>();
  private readonly lastCaptureToolCallCount = new Map<string, number>();

  constructor(private readonly kernel: NextclawKernel) {
    super();
    this.sessionStore = kernel.sessionManager;
  }

  protected setup = (): void => {
    this.effect(() => {
      const unsubscribe: Unsubscribe = this.kernel.eventBus.on(
        eventKeys.ncpEvent,
        this.handleNcpEvent,
      );
      return () => {
        unsubscribe();
        this.inFlightSessionIds.clear();
        this.lastCaptureToolCallCount.clear();
      };
    });
  };

  private handleNcpEvent = (event: NcpEndpointEvent): void => {
    if (event.type !== NcpEventType.RunFinished) return;
    const sessionId = event.payload.sessionId?.trim() || null;
    if (!sessionId) return;
    void this.handleRunFinishedInBackground(sessionId).catch((error) => {
      console.warn(
        `[memory-capture] Failed for ${sessionId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    });
  };

  private handleRunFinishedInBackground = async (
    sessionId: string,
  ): Promise<void> => {
    if (this.inFlightSessionIds.has(sessionId)) return;
    const session = await this.sessionStore.getSessionRecord(sessionId);
    if (!session) return;
    const metadata = session.metadata ?? {};
    if (metadata["learning_loop_source_session_id"]) return;
    const runtimeConfig = this.readRuntimeConfig();
    if (!runtimeConfig.enabled) return;

    this.inFlightSessionIds.add(sessionId);
    try {
      const totalToolCalls = this.countToolCalls(session.messages);
      const lastCount = this.lastCaptureToolCallCount.get(sessionId) ?? 0;
      const interval = runtimeConfig.captureInterval;
      const delta = totalToolCalls - lastCount;
      if (delta < interval) {
        this.lastCaptureToolCallCount.set(sessionId, totalToolCalls);
        return;
      }
      await this.runCapture(sessionId, totalToolCalls, metadata, session.messages);
      this.lastCaptureToolCallCount.set(sessionId, totalToolCalls);
    } finally {
      this.inFlightSessionIds.delete(sessionId);
    }
  };

  private runCapture = async (
    sessionId: string,
    totalToolCalls: number,
    metadata: Record<string, unknown>,
    messages: unknown[],
  ): Promise<void> => {
    const workspace = this.kernel.workspacePath;
    if (!workspace) return;
    let store: MemoryStore;
    try {
      const mod = await import("@nextclaw/core");
      store = new mod.MemoryStore(workspace);
    } catch {
      return;
    }

    const recentMessages = messages as Array<{
      parts?: Array<{
        type?: string;
        result?: unknown;
        toolName?: string;
      }>;
    }>;
    const tail = recentMessages.slice(-6);
    const lines: string[] = [];
    for (const msg of tail) {
      if (!msg.parts) continue;
      for (const part of msg.parts) {
        if (
          part &&
          typeof part === "object" &&
          (part as { type?: string }).type === "tool-invocation" &&
          typeof (part as { result?: unknown }).result === "string"
        ) {
          const snippet = ((part as { result?: string }).result ?? "")
            .slice(0, 200)
            .replace(/\n/g, " ");
          lines.push(
            `[${(part as { toolName?: string }).toolName ?? "tool"}]: ${snippet}`,
          );
        }
      }
    }
    const captureText = lines.join("\n").trim();
    if (!captureText) return;

    store.appendToday(captureText);

    const profileKeywords = ["我叫", "喜欢", "偏好", "以后都", "记住我", "称呼"];
    const hasProfileSignal = profileKeywords.some((kw) =>
      captureText.includes(kw),
    );
    if (hasProfileSignal) {
      store.appendUserCandidate({
        id: `cap-${Date.now()}`,
        content: captureText,
        source: sessionId,
      });
    }

    await this.sessionStore.updateSessionMetadata(sessionId, {
      memory_last_capture_tool_call_count: totalToolCalls,
    });
  };

  private countToolCalls = (messages: unknown[]): number => {
    if (!Array.isArray(messages)) return 0;
    let count = 0;
    for (const msg of messages) {
      if (!msg || typeof msg !== "object" || Array.isArray(msg)) continue;
      const parts = (msg as { parts?: unknown[] }).parts;
      if (!Array.isArray(parts)) continue;
      for (const part of parts) {
        if (
          part &&
          typeof part === "object" &&
          (part as { type?: string }).type === "tool-invocation"
        ) {
          count += 1;
        }
      }
    }
    return count;
  };

  private readRuntimeConfig = (): MemoryCaptureRuntimeConfig => {
    return readMemoryCaptureRuntimeConfig(this.kernel.configManager.loadConfig());
  };
}

