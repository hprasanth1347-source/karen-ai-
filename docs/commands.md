# Karen AI — Command Understanding Engine (`apps/api/src/commands/`)

Karen routes every non-slash text, voice transcript, caption, and file message in Telegram and Web Chat through one unified Command Understanding Engine (`apps/api/src/commands/engine.ts`).

## Supported Natural Command Patterns

### Google Classroom
- `"show pending assignments"`, `"what's due tomorrow"`, `"what's overdue"`, `"assignments due this week"`, `"show submitted assignments"`
- `"show grades for maths"`, `"check my classroom grades"`
- `"join this class https://classroom.google.com/c/...?cjc=..."`, `"join class code abc123 course 123456789"`
  - Note: Google does not allow joining by a bare code alone; Karen explains this and provides an **Open Classroom to join** button.
- `"explain assignment 2"`, `"exam tomorrow help"`, `"mark it done"` (personal status only)

### Gmail
- `"show latest 5 mails"`, `"unread mails from college"`, `"mail from ravi"`, `"important mails today"`
- `"open the first mail"`, `"reply ok to that mail"`
- `"send email to ravi@x.com about tomorrow's meeting"`, `"mail this file to sir@college.edu"` (always shows Preview card with Send/Cancel)

### Google Drive Upload
- Send a file/photo with caption `"save this to drive"`, or upload first and say `"save it to drive"` within 30 minutes
- `"save this to drive in the college folder"` (asks before creating a new folder)
- Requires `https://www.googleapis.com/auth/drive.file` scope (existing users reconnect Google once; Karen shows a **Reconnect Google to allow saving files** button if missing).

### Instagram DM
- `"send hi to _.raghul._.15 on insta"`, `"dm raghul where are you"`, `"raghul ku insta la hi sollu"`, `"check my instagram dms"`
- Always shows a Preview card before sending; missing message/recipient asks one clarifying question.

### Macros & Shortcuts
- `"teach Karen: when I say 'my work' show pending assignments and latest 5 mails"`
- `/macros` — list saved macros, `/macros delete <trigger>` — delete macro, `/cancel` — cancel pending action, `/help` — generated from tool registry.

## Manual Verification Checklist
1. Send `"show pending assignments"` -> verify numbered cards + freshness (`Updated just now` or `Updated X min ago`).
2. Send `"join class code abc123"` -> verify clear explanation + `Open Classroom to join` button.
3. Upload a PDF in Telegram with caption `"save this to drive"` -> verify upload or `Reconnect Google to allow saving files` button if scope missing.
4. Send `"send hi to _.raghul._.15 on insta"` -> verify Preview card -> tap Send -> verify single send (double-tap shows `Already processed`).
5. Say `"tell me about the moon"` -> verify NO tools are triggered and Karen replies conversationally.
