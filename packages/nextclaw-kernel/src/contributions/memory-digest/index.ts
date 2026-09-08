/**
 * Auto-Digest: daily cron-driven consolidation of recent daily memories
 * into structured digest nodes (personal / procedure / wiki).
 *
 * Triggered by a cron job that calls `DigestContribution.runOnce()`,
 * which reads recent daily notes from MemoryStore and writes merged
 * digest entries with `## Sources` back-references.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Contribution, eventKeys, type Unsubscribe } from "@nextclaw/shared";
import { NcpEventType, type NcpEndpointEvent } from "@nextclaw/ncp";
import type { NextclawKernel } from "@kernel/app/nextclaw-kernel.js";
import { readMemoryCaptureRuntimeConfig, type MemoryCaptureRuntimeConfig } from "@kernel/contributions/learning-loop/index.js";
import type { MemoryDigestCategory, MemoryStore } from "@nextclaw/core";

type DigestNode = {
  id: string;
  category: MemoryDigestCategory;
  content: string;
  sources: string[];
  createdAt: string;
  updatedAt: string;
};

const DIGEST_CATEGORIES: MemoryDigestCategory[] = ["personal", "procedure", "wiki"];
const DEFAULT_WINDOW_DAYS = 3;

function readTextIfExists(path: string): string {
  return existsSync(path) ? readFileSync(path, "utf-8") : "";
}

export class DigestContribution extends Contribution {
  private readonly inFlight = new Set<string>();

  constructor(kernel: NextclawKernel) {
    super({ id: "nextclaw.memory-digest" });
    this.kernel = kernel as unknown as NextclawKernel;
  }

  protected setup = (): void => {
    this.effect(() => {
      const unsubscribe: Unsubscribe = this.kernel.eventBus.on(
        eventKeys.ncpEvent,
        this.handleNcpEvent,
      );
      return () => unsubscribe();
    });
  };

  private handleNcpEvent = (event: NcpEndpointEvent): void => {
    if (event.type !== NcpEventType.RunFinished) return;
    const sessionId = event.payload.sessionId?.trim() || null;
    if (!sessionId) return;
    void this.maybeRunDigest(sessionId).catch((err) => {
      console.warn(`[memory-digest] Failed for ${sessionId}: ${err}`);
    });
  };

  private maybeRunDigest = async (sessionId: string): Promise<void> => {
    if (this.inFlight.has(sessionId)) return;
    const config = this.readConfig();
    if (!config.enabled) return;

    this.inFlight.add(sessionId);
    try {
      await this.runOnce();
    } finally {
      this.inFlight.delete(sessionId);
    }
  };

  /**
   * Run once: scan recent daily notes, extract memory units,
   * CREATE / REFINE digest nodes, write ## Sources back-references.
   */
  runOnce = async (): Promise<{ created: number; refined: number }> => {
    const config = this.readConfig();
    const workspace = this.kernel.workspacePath;
    if (!workspace) return { created: 0, refined: 0 };

    let store: MemoryStore;
    try {
      const mod = await import("@nextclaw/core");
      store = new mod.MemoryStore(workspace);
    } catch {
      return { created: 0, refined: 0 };
    }

    const windowDays = config.digestWindowDays ?? DEFAULT_WINDOW_DAYS;
    const recentFiles = store.listMemoryFiles().slice(0, windowDays);
    if (recentFiles.length === 0) return { created: 0, refined: 0 };

    // Parse recent daily notes into memory units
    const units: Array<{ content: string; sourceFile: string; date: string }> = [];
    for (const filePath of recentFiles) {
      const content = readTextIfExists(filePath);
      if (!content.trim()) continue;
      const date = filePath.split("/").pop()?.replace(".md", "") ?? "unknown";
      units.push({ content, sourceFile: filePath, date });
    }

    if (units.length === 0) return { created: 0, refined: 0 };

    let created = 0;
    let refined = 0;

    // For each category, check existing digest nodes and merge
    for (const category of DIGEST_CATEGORIES) {
      const existingNodes = this.readExistingDigestNodes(store, category);
      const existingIds = new Set(existingNodes.map((n) => n.id));

      for (const unit of units) {
        // Simple keyword-based categorization (placeholder for LLM-based classification)
        const cat = this.categorizeUnit(unit.content);
        if (cat !== category) continue;

        const nodeId = this.extractNodeId(unit.content);
        const normalizedId = nodeId || `auto-${unit.date}-${category}`;

        if (existingIds.has(normalizedId)) {
          // REFINE: append to existing node
          const node = existingNodes.find((n) => n.id === normalizedId);
          if (node) {
            const newSource = `memory/${unit.date}.md`;
            if (!node.sources.includes(newSource)) {
              node.sources.push(newSource);
            }
            node.content += `\n\n> **${unit.date}**\n${unit.content.slice(0, 300)}`;
            node.updatedAt = new Date().toISOString();
            store.writeDigest(category, normalizedId, this.nodeToMarkdown(node));
            refined += 1;
          }
        } else {
          // CREATE: new digest node
          const node: DigestNode = {
            id: normalizedId,
            category,
            content: unit.content.slice(0, 500),
            sources: [`memory/${unit.date}.md`],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          store.writeDigest(category, normalizedId, this.nodeToMarkdown(node));
          created += 1;
        }
      }
    }

    return { created, refined };
  };

  private readConfig = (): MemoryCaptureRuntimeConfig => {
    return readMemoryCaptureRuntimeConfig(this.kernel.configManager.loadConfig());
  };

  private categorizeUnit = (content: string): MemoryDigestCategory => {
    const lower = content.toLowerCase();
    if (/偏好|称呼|用户|我喜欢|以后都|记住我/.test(lower)) return "personal";
    if (/步骤|流程|方法|命令|如何|怎么做|教程|指南/.test(lower)) return "procedure";
    return "wiki";
  };

  private extractNodeId = (content: string): string => {
    const match = content.match(/^##\s+(.+)$/m);
    return match?.[1]?.trim()?.toLowerCase().replace(/\s+/g, "-") || "";
  };

  private readExistingDigestNodes = (
    store: MemoryStore,
    category: MemoryDigestCategory,
  ): DigestNode[] => {
    const files = store.listDigestFiles(category);
    const nodes: DigestNode[] = [];
    for (const file of files) {
      const content = readTextIfExists(file);
      if (!content.trim()) continue;
      const id = file.split("/").pop()?.replace(".md", "") ?? "unknown";
      const sourcesMatch = content.match(/##\s*Sources\s*\n([\s\S]*?)(?=\n##|\n---|$)/);
      const sources = sourcesMatch
        ? sourcesMatch[1].split("\n").filter((l) => l.startsWith("-")).map((l) => l.slice(1).trim())
        : [];
      nodes.push({
        id,
        category,
        content,
        sources,
        createdAt: "",
        updatedAt: new Date().toISOString(),
      });
    }
    return nodes;
  };

  private nodeToMarkdown = (node: DigestNode): string => {
    return `# ${node.id}\n\n${node.content}\n\n## Sources\n${node.sources.map((s) => `- ${s}`).join("\n")}\n`;
  };
}
