import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from "node:fs";
import { join, relative } from "node:path";
import { ensureDir, todayDate } from "../../../../shared/lib/core-utils/utils/helpers.utils.js";

const readTextIfExists = (path: string): string => (existsSync(path) ? readFileSync(path, "utf-8") : "");

export type MemoryDigestCategory = "personal" | "procedure" | "wiki";

export type MemoryCandidate = {
  id: string;
  content: string;
  createdAt: string;
  source?: string;
};

export class MemoryStore {
  private memoryDir: string;
  private memoryFile: string;
  private workspaceMemoryFile: string;

  // New directory layout
  private userFile: string;
  private userCandidatesFile: string;
  private digestDir: string;
  private sourceDir: string;
  private indexDir: string;

  constructor(private workspace: string) {
    this.memoryDir = ensureDir(join(workspace, "memory"));
    this.memoryFile = join(this.memoryDir, "MEMORY.md");
    this.workspaceMemoryFile = join(workspace, "MEMORY.md");

    this.userFile = join(workspace, "USER.md");
    this.userCandidatesFile = join(workspace, "USER.candidates.md");
    this.digestDir = ensureDir(join(this.memoryDir, "digest"));
    this.sourceDir = ensureDir(join(this.memoryDir, "source"));
    this.indexDir = ensureDir(join(this.memoryDir, "index"));
  }

  // ── Legacy paths (backward compatible) ──────────────────────────────

  getTodayFile = (): string => join(this.memoryDir, `${todayDate()}.md`);

  readToday = (): string => readTextIfExists(this.getTodayFile());

  appendToday = (content: string): void => {
    const todayFile = this.getTodayFile();
    const prefix = existsSync(todayFile) ? `${readTextIfExists(todayFile)}\n` : `# ${todayDate()}\n\n`;
    writeFileSync(todayFile, `${prefix}${content}`, "utf-8");
  };

  readLongTerm = (): string => {
    return readTextIfExists(this.memoryFile);
  };

  readWorkspaceMemory = (): string => {
    return readTextIfExists(this.workspaceMemoryFile);
  };

  writeLongTerm = (content: string): void => {
    writeFileSync(this.memoryFile, content, "utf-8");
  };

  getRecentMemories = (days = 7): string => {
    const memories: string[] = [];
    const today = new Date();
    for (let i = 0; i < days; i += 1) {
      const date = new Date(today);
      date.setDate(today.getDate() - i);
      const dateStr = date.toISOString().slice(0, 10);
      const path = join(this.memoryDir, `${dateStr}.md`);
      if (existsSync(path)) {
        memories.push(readFileSync(path, "utf-8"));
      }
    }
    return memories.length ? memories.join("\n\n---\n\n") : "";
  };

  listMemoryFiles = (): string[] => {
    if (!existsSync(this.memoryDir)) {
      return [];
    }
    return readdirSync(this.memoryDir)
      .filter((name) => /^\d{4}-\d{2}-\d{2}\.md$/.test(name))
      .sort()
      .reverse()
      .map((name) => join(this.memoryDir, name));
  };

  getMemoryContext = (): string => {
    return [
      ["Workspace Memory", this.readWorkspaceMemory()],
      ["Long-term Memory", this.readLongTerm()],
      ["Today's Notes", this.readToday()],
    ].flatMap(([title, content]) => (content ? [`## ${title}\n${content}`] : []))
      .join("\n\n");
  };

  // ── User profile (USER.md) ──────────────────────────────────────────

  readUser = (): string => readTextIfExists(this.userFile);

  writeUser = (content: string): void => {
    writeFileSync(this.userFile, content, "utf-8");
  };

  hasUser = (): boolean => existsSync(this.userFile);

  // ── User profile candidates ─────────────────────────────────────────

  readUserCandidates = (): MemoryCandidate[] => {
    const raw = readTextIfExists(this.userCandidatesFile);
    if (!raw.trim()) return [];
    const lines = raw.split("\n").filter((l) => l.trim());
    const candidates: MemoryCandidate[] = [];
    let current: Partial<MemoryCandidate> = {};
    for (const line of lines) {
      if (line.startsWith("id:")) {
        if (current.id && current.content) candidates.push(current as MemoryCandidate);
        current = { id: line.slice(3).trim() };
      } else if (line.startsWith("content:")) {
        current.content = line.slice(8).trim();
      } else if (line.startsWith("created_at:")) {
        current.createdAt = line.slice(11).trim();
      } else if (line.startsWith("source:")) {
        current.source = line.slice(7).trim();
      }
    }
    if (current.id && current.content) candidates.push(current as MemoryCandidate);
    return candidates;
  };

  writeUserCandidates = (candidates: MemoryCandidate[]): void => {
    if (candidates.length === 0) {
      if (existsSync(this.userCandidatesFile)) writeFileSync(this.userCandidatesFile, "", "utf-8");
      return;
    }
    const lines = candidates.map((c) => [
      `id: ${c.id}`,
      `content: ${c.content}`,
      `created_at: ${c.createdAt}`,
      ...(c.source ? [`source: ${c.source}`] : []),
      "",
    ].join("\n"));
    writeFileSync(this.userCandidatesFile, lines.join("\n"), "utf-8");
  };

  appendUserCandidate = (candidate: Omit<MemoryCandidate, "createdAt">): void => {
    const candidates = this.readUserCandidates();
    candidates.push({
      ...candidate,
      createdAt: new Date().toISOString(),
    });
    this.writeUserCandidates(candidates);
  };

  removeUserCandidate = (id: string): void => {
    const candidates = this.readUserCandidates().filter((c) => c.id !== id);
    this.writeUserCandidates(candidates);
  };

  // ── Digest nodes ─────────────────────────────────────────────────────

  getDigestFilePath = (category: MemoryDigestCategory, nodeId: string): string => {
    return join(this.digestDir, category, `${nodeId}.md`);
  };

  listDigestFiles = (category?: MemoryDigestCategory): string[] => {
    if (category) {
      const catDir = join(this.digestDir, category);
      if (!existsSync(catDir)) return [];
      return readdirSync(catDir)
        .filter((name) => name.endsWith(".md"))
        .map((name) => join(catDir, name));
    }
    const results: string[] = [];
    for (const cat of ["personal", "procedure", "wiki"] as MemoryDigestCategory[]) {
      const catDir = join(this.digestDir, cat);
      if (!existsSync(catDir)) continue;
      for (const name of readdirSync(catDir).filter((n) => n.endsWith(".md"))) {
        results.push(join(catDir, name));
      }
    }
    return results.sort();
  };

  readDigest = (category: MemoryDigestCategory, nodeId: string): string => {
    return readTextIfExists(this.getDigestFilePath(category, nodeId));
  };

  writeDigest = (category: MemoryDigestCategory, nodeId: string, content: string): void => {
    ensureDir(join(this.digestDir, category));
    writeFileSync(this.getDigestFilePath(category, nodeId), content, "utf-8");
  };

  // ── Source conversations (read-only reference) ───────────────────────

  listSourceFiles = (): string[] => {
    if (!existsSync(this.sourceDir)) return [];
    return readdirSync(this.sourceDir)
      .filter((name) => name.endsWith(".jsonl"))
      .sort()
      .map((name) => join(this.sourceDir, name));
  };

  getSourcePath = (hash: string): string => join(this.sourceDir, `${hash}.jsonl`);

  // ── Index (rebuildable, not committed) ──────────────────────────────

  getIndexDir = (): string => this.indexDir;

  // ── Per-file daily read helper (for BM25 index building) ────────────

  readTodayFromFile = (filePath: string): string => readTextIfExists(filePath);

  // ── Compatibility shim: old MEMORY.md still readable ────────────────

  isLegacyMemory = (): boolean => existsSync(this.workspaceMemoryFile) || existsSync(this.memoryFile);
}
