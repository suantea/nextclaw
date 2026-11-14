import type { ContextProviderRunContextService } from "@kernel/contributions/context-provider/services/context-provider-run-context.service.js";
import { truncateContextText } from "@kernel/contributions/context-provider/utils/context-text.utils.js";
import type {
  AgentRunRequest,
  ContextBlock,
  ContextProvider,
} from "@kernel/types/agent-run.types.js";
import { MemoryStore } from "@nextclaw/core";
import { Bm25Index } from "@nextclaw/core";

export class WorkspaceMemoryContextProvider implements ContextProvider {
  constructor(private readonly context: ContextProviderRunContextService) {}

  provide = async (
    request: AgentRunRequest,
  ): Promise<readonly ContextBlock[]> => {
    const { contextConfig, projectContext } =
      await this.context.resolve(request);
    const memoryConfig = contextConfig.memory;
    if (!memoryConfig.enabled) {
      return [];
    }

    const store = new MemoryStore(projectContext.hostWorkspace);
    const blocks: ContextBlock[] = [];

    // Always inject pinned USER.md profile (top-priority, not subject to char limit truncation)
    const userContent = store.readUser();
    if (userContent.trim()) {
      blocks.push(`# User Profile\n${userContent}`);
    }

    // BM25 recall for workspace memory and daily notes
    const query = typeof request.metadata?.recallQuery === "string"
      ? request.metadata.recallQuery
      : "";
    if (query.trim()) {
      const bm25 = new Bm25Index();
      // Index workspace MEMORY.md + digest nodes + recent daily files
      const workspaceMemory = store.readWorkspaceMemory();
      if (workspaceMemory.trim()) {
        bm25.addDocument({ id: "MEMORY.md", content: workspaceMemory });
      }
      for (const digestFile of store.listDigestFiles()) {
        const content = store.readDigest(
          digestFile.includes("/personal/") ? "personal"
            : digestFile.includes("/procedure/") ? "procedure"
            : "wiki",
          digestFile.split("/").pop()!.replace(".md", ""),
        );
        if (content.trim()) {
          bm25.addDocument({ id: digestFile, content });
        }
      }
      for (const dailyFile of store.listMemoryFiles().slice(0, 14)) {
        // Read via list-based approach — index using store.readDaily
        const content = store.readTodayFromFile(dailyFile);
        if (content.trim()) {
          bm25.addDocument({ id: dailyFile, content });
        }
      }
      const hits = bm25.search(query, 8);
      if (hits.length > 0) {
        const recallText = hits
          .map((d) => `[${d.path ?? d.id}]\n${d.content.slice(0, 400)}`)
          .join("\n\n---\n\n");
        blocks.push(`# Memory Recall\n${recallText}`);
      }
    } else {
      // Fallback: still inject workspace + long-term memory (limited)
      const full = store.getMemoryContext();
      if (full.trim()) {
        blocks.push(truncateContextText(full, memoryConfig.maxChars));
      }
    }

    return blocks;
  };
}

