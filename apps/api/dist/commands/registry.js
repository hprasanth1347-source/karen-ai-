import { classroomExamPrepTool, classroomExplainTool, classroomGradesTool, classroomJoinTool, classroomListAssignmentsTool, classroomSetPersonalStatusTool, } from './tools/classroom.tools.js';
import { gmailListTool, gmailReadTool, gmailSendTool } from './tools/gmail.tools.js';
import { driveUploadTool } from './tools/drive.tools.js';
import { instagramReadDmsTool, instagramSendDmTool } from './tools/instagram.tools.js';
import { macroDeleteTool, macroListTool, macroSaveTool } from './tools/macros.tools.js';
import { calendarCreateEventTool, calendarListEventsTool, googleContactsCreateTool, googleContactsSearchTool, googleTasksCreateTool, googleTasksListTool, memoryListTool, memorySaveTool, sheetsCreateTool, sheetsEditTool, sheetsReadTool, } from './tools/workspace.tools.js';
export const COMMAND_TOOLS = [
    classroomListAssignmentsTool,
    classroomGradesTool,
    classroomJoinTool,
    classroomExplainTool,
    classroomExamPrepTool,
    classroomSetPersonalStatusTool,
    gmailListTool,
    gmailReadTool,
    gmailSendTool,
    driveUploadTool,
    instagramReadDmsTool,
    instagramSendDmTool,
    macroSaveTool,
    macroListTool,
    macroDeleteTool,
    calendarListEventsTool,
    calendarCreateEventTool,
    googleTasksListTool,
    googleTasksCreateTool,
    sheetsCreateTool,
    sheetsReadTool,
    sheetsEditTool,
    memoryListTool,
    memorySaveTool,
    googleContactsSearchTool,
    googleContactsCreateTool,
];
export const COMMAND_TOOL_MAP = new Map(COMMAND_TOOLS.map((t) => [t.name, t]));
export function generateRegistryHelpText() {
    const groups = new Map();
    for (const t of COMMAND_TOOLS) {
        const arr = groups.get(t.category) || [];
        arr.push(t);
        groups.set(t.category, arr);
    }
    const sections = ['*Karen AI — Natural Commands & Tools*'];
    for (const [cat, tools] of groups.entries()) {
        sections.push(`\n*${cat.toUpperCase()}*`);
        for (const t of tools) {
            sections.push(`• \`${t.name}\` — ${t.description}`);
        }
    }
    sections.push('\nSlash shortcuts: /help, /pending, /assignments, /grades, /macros, /cancel, /status');
    return sections.join('\n');
}
