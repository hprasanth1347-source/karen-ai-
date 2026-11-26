# Built-In Skills Architecture (`apps/api/src/skills/`)

Karen AI executes skills **invisibly** as native TypeScript modules compiled directly into the API bundle (zero runtime filesystem reads, fully compatible with Vercel serverless).

## Folder Layout

Each skill lives in `apps/api/src/skills/<name>/`:
- `instructions.md` — Playbook Karen follows (workflow, design rules, edge cases).
- `meta.ts` — Exports `SkillMeta` (`name`, `description`, `triggerIntents`, `allowedAgentTools`, `pageAffinity`, `outputTypes`) and `instructions` string.
- `tools.ts` — Typed, Zod-validated `SkillToolDefinition` functions and `SkillModule` export.
- `index.ts` — Re-exports the skill module.

## Adding a Built-In Skill

1. Create `apps/api/src/skills/<name>/{instructions.md,meta.ts,tools.ts,index.ts}`.
2. Register the skill in `apps/api/src/skills/registry.ts` (`ALL_SKILLS`).
3. Add deterministic intent patterns in `apps/api/src/skills/router.ts` (`RULE_PATTERNS`).
4. Add router and tool unit tests in `apps/api/src/skills/skills.test.ts`.
5. Run `npm run typecheck` and `npx tsx --test apps/api/src/skills/skills.test.ts`.

## Security & Safety

- **Untrusted Data**: Fetched Gmail, Drive, Classroom, Instagram DM, Document Vault, and Web Search results are wrapped in `<untrusted_content source="...">...</untrusted_content>` with `[[...]]` action tags stripped.
- **Outbound Approvals**: Email sends, Instagram DMs, WhatsApp messages, and Drive file shares always create an approval request in `approval_requests`.
- **Tool Allowlist**: `executeSkillToolCalls` only exposes tools declared in the routed skill's `meta.allowedAgentTools`, capped at 8 steps per turn.
- **Comfort Mode Isolation**: In Love & Comfort Mode, only `comfort-mode-safe` is routed, and zero outbound tools are permitted.
- **Audit Trail**: Every skill tool execution is logged quietly to `audit_logs` (`SKILL_TOOL_CALL`).
