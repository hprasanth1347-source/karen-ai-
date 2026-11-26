# PDF Tools Skill

Use this playbook to create, extract, merge, split, rotate, watermark, or fill AcroForm fields in PDFs.

## Design Rules
- Use clean typography, generous margins (50pt), clear heading hierarchy using the owner's brand accent/primary colors, and readable page footers.
- Never claim a PDF was generated or modified unless the verification check (reopening with `pdf-lib`) passes.

## Workflow
1. To create a new PDF from text/sections, call `create_pdf`.
2. To extract text from an existing PDF, call `extract_pdf_text`. If the PDF is scanned (0 extracted characters), return a clear "OCR not available for scanned PDFs" message.
3. To merge, rotate, or watermark PDFs, call `transform_pdf`.
4. Always verify page count and structure before reporting completion.
