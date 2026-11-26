# Vendored Official Skills (`anthropics/skills`)

- **Upstream Repository:** `https://github.com/anthropics/skills`
- **Pinned Commit:** `e4bb5d960d87126ff3b3a8af1a104b7db67560ba`
- **Vendored Date:** `2026-11-26`
- **License:** Apache License 2.0 (see `THIRD_PARTY_NOTICES.md` and per-skill `LICENSE.txt`)
- **Deduplication:** Repeated `scripts/office/schemas` directories from `docx`, `pptx`, and `xlsx` were deduplicated into `skills/shared/office/schemas/`.

## Vendored Skills (17)
| Skill | Type | Default Status | Notes |
| :--- | :--- | :--- | :--- |
| `docx` | script | Enabled | Word document creation/editing via `skill-runner` |
| `pdf` | script | Enabled | PDF forms, extraction, merge/split via `skill-runner` |
| `pptx` | script | Enabled | PowerPoint deck creation/editing via `skill-runner` |
| `xlsx` | script | Enabled | Excel spreadsheets & formula recalculation via `skill-runner` |
| `algorithmic-art` | script | Enabled | Generative p5.js art via `skill-runner` |
| `canvas-design` | script | Enabled | Visual posters/PNG/PDF design via `skill-runner` |
| `slack-gif-creator` | script | Enabled | Animated GIF creation via `skill-runner` |
| `web-artifacts-builder` | script | Enabled | React/HTML artifact bundling via `skill-runner` |
| `webapp-testing` | script | Enabled | Playwright testing (allowlisted URLs only, SSRF-blocked) |
| `internal-comms` | instruction | Enabled | Status reports, newsletters, FAQs, email drafts |
| `doc-coauthoring` | instruction | Enabled | Collaborative document drafting saved to Documents |
| `frontend-design` | instruction | Enabled | Production UI design guidance |
| `theme-factory` | instruction | Enabled | Theme styling for decks, docs & UI |
| `mcp-builder` | instruction | Enabled | Owner-only developer MCP server builder (downloadable code) |
| `claude-api` | instruction | Enabled | Developer API reference |
| `skill-creator` | instruction | Enabled | Powers "Create skill with Karen" (saved disabled for review) |
| `brand-guidelines` | instruction | **Disabled** | Anthropic-branded template; use `my-brand-guidelines` instead |
