import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { APP_NAME, DEFAULT_PANELS_DIR, DEFAULT_SKILLS_DIR } from "@nextclaw/core";

// Controlled template migration: a workspace file is refreshed only when it
// still exactly matches the previously shipped template. Any user edit
// disables migration for that file and keeps the user's content.
const legacyTemplateContents: Record<string, string> = {
  "SOUL.md": `# SOUL.md - Who You Are

You are ${APP_NAME}, a lightweight AI assistant.

## Core Truths

- Be genuinely helpful, not performatively helpful.
- Have opinions when useful; do not be a blank interface.
- Be resourceful before asking; try first, then ask if stuck.
- Earn trust through competence; be careful with external actions.
- Remember you are a guest in the user's life.

## Boundaries

- Private things stay private.
- Ask before doing anything external (messages, posts, destructive actions).
- Never send half-baked replies on messaging surfaces.
- You are not the user's voice; be careful in group chats.

## Vibe

Concise when needed, thorough when it matters. No corporate fluff. No sycophancy.

## Continuity

You wake up fresh each session. These files are your memory. Read them and update them.

If you change this file, tell the user.`,
  "IDENTITY.md": `# IDENTITY.md - Who Am I?

Fill this in during your first conversation. Make it yours.

- Name:
- Creature: (AI? robot? familiar? something weirder?)
- Vibe: (warm? sharp? calm? chaotic?)
- Emoji:
- Avatar: (workspace-relative path or URL)

This is not just metadata. It is the start of figuring out who you are.`,
};

export class ServiceWorkspaceManager {
  constructor(private readonly templatesDir: string) {}

  readonly createWorkspaceTemplates = (workspace: string, options: { force?: boolean } = {}): { created: string[]; migrated: string[] } => {
    const created: string[] = [];
    const migrated: string[] = [];
    const force = Boolean(options.force);
    const templateDir = this.resolveTemplateDir();
    if (!templateDir) {
      console.warn("Warning: Template directory not found. Skipping workspace templates.");
    }
    const templateFiles = [
      { source: "AGENTS.md", target: "AGENTS.md" },
      { source: "SOUL.md", target: "SOUL.md" },
      { source: "USER.md", target: "USER.md" },
      { source: "IDENTITY.md", target: "IDENTITY.md" },
      { source: "TOOLS.md", target: "TOOLS.md" },
      { source: "BOOT.md", target: "BOOT.md" },
      { source: "BOOTSTRAP.md", target: "BOOTSTRAP.md" },
      { source: "MEMORY.md", target: "MEMORY.md" },
      { source: "memory/MEMORY.md", target: "memory/MEMORY.md" }
    ];

    if (templateDir) {
      for (const entry of templateFiles) {
        const filePath = join(workspace, entry.target);
        if (!force && existsSync(filePath)) {
          if (this.migrateLegacyTemplate(templateDir, filePath, entry)) {
            migrated.push(entry.target);
          }
          continue;
        }
        const templatePath = join(templateDir, entry.source);
        if (!existsSync(templatePath)) {
          console.warn(`Warning: Template file missing: ${templatePath}`);
          continue;
        }
        const raw = readFileSync(templatePath, "utf-8");
        const content = raw.replace(/\$\{APP_NAME\}/g, APP_NAME);
        mkdirSync(dirname(filePath), { recursive: true });
        writeFileSync(filePath, content);
        created.push(entry.target);
      }
    }

    this.ensureWorkspaceDir(workspace, "memory", created);
    this.ensureWorkspaceDir(workspace, DEFAULT_SKILLS_DIR, created);
    this.ensureWorkspaceDir(workspace, DEFAULT_PANELS_DIR, created);
    return { created, migrated };
  };

  private readonly migrateLegacyTemplate = (
    templateDir: string,
    filePath: string,
    entry: { source: string; target: string },
  ): boolean => {
    const legacyContent = legacyTemplateContents[entry.target];
    if (!legacyContent) {
      return false;
    }
    const templatePath = join(templateDir, entry.source);
    if (!existsSync(templatePath)) {
      return false;
    }
    const existing = readFileSync(filePath, "utf-8");
    if (existing.trim() !== legacyContent.trim()) {
      return false;
    }
    const raw = readFileSync(templatePath, "utf-8");
    writeFileSync(filePath, raw.replace(/\$\{APP_NAME\}/g, APP_NAME));
    return true;
  };

  private readonly ensureWorkspaceDir = (
    workspace: string,
    dirName: string,
    created: string[],
  ): void => {
    const dir = join(workspace, dirName);
    if (existsSync(dir)) {
      return;
    }
    mkdirSync(dir, { recursive: true });
    created.push(join(dirName, ""));
  };

  private readonly resolveTemplateDir = (): string | null => {
    const override = process.env.NEXTCLAW_TEMPLATE_DIR?.trim();
    if (override) {
      return override;
    }
    return existsSync(this.templatesDir) ? this.templatesDir : null;
  };

}
