# Feature map and activation requirements

| Feature | UI/source included | Activation requirement |
|---|---|---|
| Responsive desktop/mobile | Yes | None |
| AI chat | Yes | Gemini or Groq server key |
| Female-only speech output | Policy enforced; provider adapter boundary | Female voice provider + voice ID + API key |
| Speech input | Browser feature detection | Browser microphone permission and browser support |
| Telegram tunnel | Owner-only webhook adapter | Bot token, webhook secret, owner chat ID, HTTPS |
| WhatsApp | Integration slot + safe design | WhatsApp Cloud API account, phone number ID, token, approved templates/permissions |
| Instagram | Integration slot + safe design | Meta app, eligible professional account, app review/permissions, webhooks |
| Gmail | Integration slot | Google OAuth consent, Gmail scopes |
| Drive | Integration slot | Google OAuth consent, Drive scopes |
| Personal memory | Database schema | Authenticated API + RLS + encryption for sensitive facts |
| Document analysis | Upload UI + schema | Storage bucket, secure upload API, PDF/DOCX/XLSX parser and indexing worker |
| Contacts and favourites | Schema + UI placeholders | Authenticated CRUD API |
| Approval queue | Schema + approval-first interaction design | Provider send adapters + owner verification |
| Notifications | UI placeholders + schema | Webhook event ingestion + push provider |
| Activity log | Schema + UI placeholder | Audit middleware on every action |
