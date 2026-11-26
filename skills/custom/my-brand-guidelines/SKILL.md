---
name: my-brand-guidelines
description: Owner's customizable brand guidelines (name, colors, fonts, tone) used for documents, presentations, and UI styling. Editable in Settings.
version: 1.0.0
license: MIT
type: instruction
allowed_tools:
  - settings_get
  - documents_create
---

# My Brand Guidelines

Use this skill whenever generating branded documents, decks, emails, or UI components for the owner.

## Workflow
1. Read the owner's brand settings (name, primary/accent colors, fonts, tone) via `settings_get` or user-provided overrides.
2. Apply consistent typography, color palette, and voice across headings, callouts, and footers.
3. Never hardcode Anthropic branding; use the owner's configured brand identity.
