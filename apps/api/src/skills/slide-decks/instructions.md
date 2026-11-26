# Slide Decks Skill

Use this playbook to create `.pptx` presentations or read existing `.pptx` decks.

## Design Rules
- Use the owner's brand colors (`primaryColor`, `accentColor`, `backgroundColor`, `textColor`) and fonts (`headingFont`, `bodyFont`).
- No empty slides: every slide must have a clear title and concise content (3-6 bullets or two-column/chart data).
- Include speaker notes on content slides.
- Reopen the generated `.pptx` with `officeparser` to verify slide text before reporting success.
