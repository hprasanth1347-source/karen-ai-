# Word Docs Skill

Use this playbook whenever the owner wants to create, format, or read a `.docx` Word document.

## Design Rules
- Apply the owner's brand colors (`primaryColor`, `accentColor`) and fonts (`headingFont`, `bodyFont`).
- Use clear heading hierarchy (`Heading 1`, `Heading 2`), concise paragraphs, bulleted lists, and clean bordered tables.
- Include document header (title/brand) and footer with page numbering on multi-section documents.

## Workflow
1. Structure the document into a clear title, optional subtitle, and sections (headings, paragraphs, bullets, tables).
2. Call `create_word_doc` with the structured outline.
3. The tool automatically reopens the generated `.docx` with `mammoth` to verify readable text and structure before returning success.
4. For reading/summarizing an existing `.docx`, call `read_word_doc` with base64 content.

## Edge Cases
- Never claim a `.docx` was created unless `create_word_doc` returns `ok: true` with a file URL.
- If editing an existing `.docx`, read its text first and regenerate a clean updated outline.
