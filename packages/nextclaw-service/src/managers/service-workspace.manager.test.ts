import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { ServiceWorkspaceManager } from "./service-workspace.manager.js";

const tempDirs: string[] = [];

function createTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "nextclaw-workspace-test-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (!dir) {
      continue;
    }
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("ServiceWorkspaceManager", () => {
  it("creates the skills directory without seeding builtin skills into the workspace", () => {
    const workspace = createTempDir();
    const manager = new ServiceWorkspaceManager(join(workspace, "missing-templates"));

    manager.createWorkspaceTemplates(workspace);

    expect(existsSync(join(workspace, "skills"))).toBe(true);
    expect(existsSync(join(workspace, "USAGE.md"))).toBe(false);
    expect(existsSync(join(workspace, "skills", "nextclaw-self-manage", "SKILL.md"))).toBe(false);
  });

  it("copies templates from the configured distribution directory", () => {
    const workspace = createTempDir();
    const templatesDir = createTempDir();
    const templates = [
      "AGENTS.md",
      "SOUL.md",
      "USER.md",
      "IDENTITY.md",
      "TOOLS.md",
      "BOOT.md",
      "BOOTSTRAP.md",
      "MEMORY.md",
      "memory/MEMORY.md"
    ];
    for (const template of templates) {
      const templatePath = join(templatesDir, template);
      mkdirSync(dirname(templatePath), { recursive: true });
      writeFileSync(templatePath, "${APP_NAME} template");
    }

    const result = new ServiceWorkspaceManager(templatesDir).createWorkspaceTemplates(workspace);

    expect(result.created).toContain("AGENTS.md");
    expect(result.created).toContain("memory/MEMORY.md");
    expect(readFileSync(join(workspace, "AGENTS.md"), "utf-8")).toBe("nextclaw template");
  });

  it("migrates an unmodified legacy workspace template to the shipped template", () => {
    const workspace = createTempDir();
    const templatesDir = createTempDir();
    writeFileSync(join(templatesDir, "SOUL.md"), "You are ${APP_NAME}, a long-term personal partner.");
    writeFileSync(
      join(workspace, "SOUL.md"),
      [
        "# SOUL.md - Who You Are",
        "",
        "You are nextclaw, a lightweight AI assistant.",
        "",
        "## Core Truths",
        "",
        "- Be genuinely helpful, not performatively helpful.",
        "- Have opinions when useful; do not be a blank interface.",
        "- Be resourceful before asking; try first, then ask if stuck.",
        "- Earn trust through competence; be careful with external actions.",
        "- Remember you are a guest in the user's life.",
        "",
        "## Boundaries",
        "",
        "- Private things stay private.",
        "- Ask before doing anything external (messages, posts, destructive actions).",
        "- Never send half-baked replies on messaging surfaces.",
        "- You are not the user's voice; be careful in group chats.",
        "",
        "## Vibe",
        "",
        "Concise when needed, thorough when it matters. No corporate fluff. No sycophancy.",
        "",
        "## Continuity",
        "",
        "You wake up fresh each session. These files are your memory. Read them and update them.",
        "",
        "If you change this file, tell the user.",
      ].join("\n"),
    );

    const result = new ServiceWorkspaceManager(templatesDir).createWorkspaceTemplates(workspace);

    expect(result.migrated).toContain("SOUL.md");
    expect(result.created).not.toContain("SOUL.md");
    expect(readFileSync(join(workspace, "SOUL.md"), "utf-8")).toBe(
      "You are nextclaw, a long-term personal partner.",
    );
  });

  it("keeps partially edited legacy templates untouched", () => {
    const workspace = createTempDir();
    const templatesDir = createTempDir();
    writeFileSync(join(templatesDir, "SOUL.md"), "You are ${APP_NAME}, a long-term personal partner.");
    const partiallyEdited = "You are nextclaw, a lightweight AI assistant.\n\nMy own additions stay here.";
    writeFileSync(join(workspace, "SOUL.md"), partiallyEdited);

    const result = new ServiceWorkspaceManager(templatesDir).createWorkspaceTemplates(workspace);

    expect(result.migrated).not.toContain("SOUL.md");
    expect(result.created).not.toContain("SOUL.md");
    expect(readFileSync(join(workspace, "SOUL.md"), "utf-8")).toBe(partiallyEdited);
  });

  it("leaves customized workspace template files untouched", () => {
    const workspace = createTempDir();
    const templatesDir = createTempDir();
    writeFileSync(join(templatesDir, "SOUL.md"), "You are ${APP_NAME}, a long-term personal partner.");
    const customized = "My custom soul. Do not regenerate.";
    writeFileSync(join(workspace, "SOUL.md"), customized);

    const result = new ServiceWorkspaceManager(templatesDir).createWorkspaceTemplates(workspace);

    expect(result.migrated).not.toContain("SOUL.md");
    expect(result.created).not.toContain("SOUL.md");
    expect(readFileSync(join(workspace, "SOUL.md"), "utf-8")).toBe(customized);
  });
});
