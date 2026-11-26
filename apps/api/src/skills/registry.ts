import type { SkillModule } from './types.js';
import { wordDocsSkill } from './word-docs/index.js';
import { pdfToolsSkill } from './pdf-tools/index.js';
import { slideDecksSkill } from './slide-decks/index.js';
import { spreadsheetsSkill } from './spreadsheets/index.js';
import { myBrandSkill } from './my-brand/index.js';
import { businessWritingSkill } from './business-writing/index.js';
import { docCoauthorSkill } from './doc-coauthor/index.js';
import { thanglishWriterSkill } from './thanglish-writer/index.js';
import { instagramDmReplySkill } from './instagram-dm-reply/index.js';
import { instagramContentSkill } from './instagram-content/index.js';
import { instagramCommentsSkill } from './instagram-comments/index.js';
import { gmailAssistantSkill } from './gmail-assistant/index.js';
import { driveAssistantSkill } from './drive-assistant/index.js';
import { classroomPlannerSkill } from './classroom-planner/index.js';
import { classroomExplainerSkill } from './classroom-explainer/index.js';
import { examPrepSkill } from './exam-prep/index.js';
import { dailyBriefingSkill } from './daily-briefing/index.js';
import { taskPlannerSkill } from './task-planner/index.js';
import { memoryCuratorSkill } from './memory-curator/index.js';
import { docSummarizerSkill } from './doc-summarizer/index.js';
import { meetingNotesSkill } from './meeting-notes/index.js';
import { whatsappAssistantSkill } from './whatsapp-assistant/index.js';
import { contactsSkill } from './contacts/index.js';
import { comfortModeSafeSkill } from './comfort-mode-safe/index.js';

export const ALL_SKILLS: SkillModule[] = [
  wordDocsSkill,
  pdfToolsSkill,
  slideDecksSkill,
  spreadsheetsSkill,
  myBrandSkill,
  businessWritingSkill,
  docCoauthorSkill,
  thanglishWriterSkill,
  instagramDmReplySkill,
  instagramContentSkill,
  instagramCommentsSkill,
  gmailAssistantSkill,
  driveAssistantSkill,
  classroomPlannerSkill,
  classroomExplainerSkill,
  examPrepSkill,
  dailyBriefingSkill,
  taskPlannerSkill,
  memoryCuratorSkill,
  docSummarizerSkill,
  meetingNotesSkill,
  whatsappAssistantSkill,
  contactsSkill,
  comfortModeSafeSkill,
];

export const SKILL_BY_NAME = new Map<string, SkillModule>(
  ALL_SKILLS.map((s) => [s.meta.name, s])
);
