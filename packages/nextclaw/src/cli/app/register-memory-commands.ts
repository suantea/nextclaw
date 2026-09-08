import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { Command } from "commander";

const ensureDir = (dir: string): void => {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
};

function getWorkspaceFromContext(cwd: string): string {
  return cwd;
}

function readTextIfExists(path: string): string {
  return existsSync(path) ? readFileSync(path, "utf-8") : "";
}

// ── memory subcommand ─────────────────────────────────────────────────

export function registerMemoryCommands(program: Command): void {
  const memory = program.command("memory").description("Manage agent memory files");

  memory
    .command("list")
    .description("List all memory files (daily notes)")
    .option("--json", "Output JSON", false)
    .option("-n, --days <number>", "Number of days to look back", "7")
    .action((opts: { json?: boolean; days: string }) => {
      const cwd = process.cwd();
      const memoryDir = join(cwd, "memory");
      const days = Number.parseInt(opts.days, 10);
      if (isNaN(days) || days < 1) {
        console.error("Invalid --days value");
        process.exit(1);
      }
      if (!existsSync(memoryDir)) {
        console.log("No memory directory found.");
        return;
      }
      const files = readdirSync(memoryDir)
        .filter((name) => /^\d{4}-\d{2}-\d{2}\.md$/.test(name))
        .sort()
        .reverse()
        .slice(0, days);
      if (opts.json) {
        console.log(JSON.stringify(files.map((f) => join(memoryDir, f)), null, 2));
        return;
      }
      if (files.length === 0) {
        console.log("No memory files found.");
        return;
      }
      console.log("Memory files:");
      for (const f of files) {
        console.log(`  ${join("memory", f)}`);
      }
    });

  memory
    .command("search <query>")
    .description("Search memory files by keyword (regex match)")
    .option("--json", "Output JSON", false)
    .option("-n, --limit <number>", "Max results", "20")
    .action((query: string, opts: { json?: boolean; limit: string }) => {
      const cwd = process.cwd();
      const memoryDir = join(cwd, "memory");
      const limit = Number.parseInt(opts.limit, 10);
      const results: Array<{ path: string; line: number; text: string }> = [];
      const queryLower = query.toLowerCase();
      if (existsSync(memoryDir)) {
        const files = readdirSync(memoryDir).filter((n) => n.endsWith(".md"));
        for (const file of files) {
          const filePath = join(memoryDir, file);
          const content = readTextIfExists(filePath);
          const lines = content.split("\n");
          for (let i = 0; i < lines.length; i++) {
            if (lines[i].toLowerCase().includes(queryLower)) {
              results.push({ path: filePath, line: i + 1, text: lines[i].trim() });
              if (results.length >= limit) break;
            }
          }
          if (results.length >= limit) break;
        }
      }
      // Also check workspace MEMORY.md
      const workspaceMemory = join(cwd, "MEMORY.md");
      if (existsSync(workspaceMemory)) {
        const content = readTextIfExists(workspaceMemory);
        const lines = content.split("\n");
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].toLowerCase().includes(queryLower)) {
            results.push({ path: workspaceMemory, line: i + 1, text: lines[i].trim() });
            if (results.length >= limit) break;
          }
        }
      }
      if (opts.json) {
        console.log(JSON.stringify(results, null, 2));
        return;
      }
      if (results.length === 0) {
        console.log("No matches found.");
        return;
      }
      console.log(`Found ${results.length} match(es):`);
      for (const r of results) {
        console.log(`  ${r.path}:${r.line} — ${r.text}`);
      }
    });

  memory
    .command("rebuild-index")
    .description("Rebuild searchable index (no-op placeholder for future BM25)")
    .action(() => {
      console.log("Index rebuild triggered. BM25 indexing coming in a future PR.");
    });
}

// ── profile subcommand ────────────────────────────────────────────────

export function registerProfileCommands(program: Command): void {
  const profile = program.command("profile").description("Manage agent profile (USER.md + candidates)");

  profile
    .command("show")
    .description("Show current USER.md content")
    .option("--json", "Output JSON", false)
    .action((opts: { json?: boolean }) => {
      const cwd = process.cwd();
      const userFile = join(cwd, "USER.md");
      const content = readTextIfExists(userFile);
      if (!content.trim()) {
        console.log("No USER.md found. Profile is empty.");
        return;
      }
      if (opts.json) {
        console.log(JSON.stringify({ hasProfile: true, content }, null, 2));
        return;
      }
      console.log("USER.md content:");
      console.log(content);
    });

  profile
    .command("edit")
    .description("Open USER.md in default editor")
    .action(() => {
      const cwd = process.cwd();
      const userFile = join(cwd, "USER.md");
      ensureDir(cwd);
      if (!existsSync(userFile)) {
        writeFileSync(userFile, "# User Profile\n\n", "utf-8");
      }
      const editor = process.env.EDITOR || "vim";
      console.log(`Opening ${userFile} with ${editor}...`);
      // Note: In a real implementation, we'd spawn the editor process.
      // For now, just log and let the user edit manually.
      console.log("Please edit the file manually or set EDITOR env var.");
    });

  profile
    .command("candidates")
    .description("List pending profile candidate entries")
    .option("--json", "Output JSON", false)
    .action((opts: { json?: boolean }) => {
      const cwd = process.cwd();
      const candidatesFile = join(cwd, "USER.candidates.md");
      const raw = readTextIfExists(candidatesFile);
      if (!raw.trim()) {
        console.log("No pending candidates.");
        return;
      }
      const lines = raw.split("\n").filter((l) => l.trim());
      const candidates: Array<{ id: string; content: string; createdAt: string; source?: string }> = [];
      let current: Partial<typeof candidates[0]> = {};
      for (const line of lines) {
        if (line.startsWith("id:")) current.id = line.slice(3).trim();
        else if (line.startsWith("content:")) current.content = line.slice(8).trim();
        else if (line.startsWith("created_at:")) current.createdAt = line.slice(11).trim();
        else if (line.startsWith("source:")) current.source = line.slice(7).trim();
        else if (line.trim() === "") {
          if (current.id && current.content) candidates.push(current as typeof candidates[0]);
          current = {};
        }
      }
      if (current.id && current.content) candidates.push(current as typeof candidates[0]);
      if (opts.json) {
        console.log(JSON.stringify(candidates, null, 2));
        return;
      }
      if (candidates.length === 0) {
        console.log("No pending candidates.");
        return;
      }
      console.log(`Found ${candidates.length} pending candidate(s):`);
      for (const c of candidates) {
        console.log(`  [${c.id}] ${c.content.slice(0, 80)}${c.content.length > 80 ? "..." : ""}`);
      }
    });

  profile
    .command("approve <id>")
    .description("Approve a candidate and append it to USER.md")
    .option("--json", "Output JSON", false)
    .action((id: string, opts: { json?: boolean }) => {
      const cwd = process.cwd();
      const userFile = join(cwd, "USER.md");
      const candidatesFile = join(cwd, "USER.candidates.md");
      const raw = readTextIfExists(candidatesFile);
      const lines = raw.split("\n").filter((l) => l.trim());
      let target: (typeof lines)[number] | null = null;
      const remaining: string[] = [];
      let buffer: string[] = [];
      for (const line of lines) {
        buffer.push(line);
        if (line.startsWith("id:") && line.slice(3).trim() === id) {
          target = buffer.join("\n");
        }
        if (line.trim() === "" && buffer.length > 0) {
          if (target) {
            // skip this block
          } else {
            remaining.push(...buffer);
          }
          buffer = [];
        }
      }
      if (buffer.length > 0 && !target) {
        remaining.push(...buffer);
      }
      if (!target) {
        console.error(`Candidate with id="${id}" not found.`);
        process.exit(1);
      }
      // Extract content from the candidate block
      const contentMatch = target.match(/^content:\s*(.+)$/m);
      if (!contentMatch) {
        console.error("Invalid candidate format.");
        process.exit(1);
      }
      const content = contentMatch[1].trim();
      // Append to USER.md
      const existing = readTextIfExists(userFile);
      const newContent = existing.trim()
        ? `${existing.trim()}\n\n## ${new Date().toISOString().slice(0, 10)}\n${content}`
        : `# User Profile\n\n## ${new Date().toISOString().slice(0, 10)}\n${content}`;
      writeFileSync(userFile, newContent, "utf-8");
      // Remove approved candidate
      const newCandidates = remaining.filter((l) => !l.startsWith(`id: ${id}`) || l !== `id: ${id}`).join("\n");
      writeFileSync(candidatesFile, newCandidates.trim() ? newCandidates + "\n" : "", "utf-8");
      console.log(`✓ Approved candidate "${id}" and appended to USER.md.`);
      if (opts.json) {
        console.log(JSON.stringify({ approved: id, target: userFile }));
      }
    });

  profile
    .command("reject <id>")
    .description("Remove a candidate without approving")
    .option("--json", "Output JSON", false)
    .action((id: string, opts: { json?: boolean }) => {
      const cwd = process.cwd();
      const candidatesFile = join(cwd, "USER.candidates.md");
      const raw = readTextIfExists(candidatesFile);
      const lines = raw.split("\n").filter((l) => l.trim());
      const remaining: string[] = [];
      let inTarget = false;
      let buffer: string[] = [];
      for (const line of lines) {
        if (line.startsWith("id:") && line.slice(3).trim() === id) {
          inTarget = true;
        }
        if (inTarget) {
          buffer.push(line);
          if (line.trim() === "") {
            // end of block
            inTarget = false;
            buffer = [];
          }
        } else {
          if (line.trim() !== "") remaining.push(line);
        }
      }
      const newContent = remaining.join("\n");
      writeFileSync(candidatesFile, newContent.trim() ? newContent + "\n" : "", "utf-8");
      console.log(`✓ Rejected candidate "${id}".`);
      if (opts.json) {
        console.log(JSON.stringify({ rejected: id }));
      }
    });
}
