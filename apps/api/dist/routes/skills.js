import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Router } from 'express';
import { success, error } from '../utils/response.js';
const router = Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const skillsRoot = path.resolve(__dirname, '../../../../skills/document-skills');
function readSkill(name) {
    const skillDir = path.resolve(skillsRoot, name);
    if (path.dirname(skillDir) !== skillsRoot && skillDir !== skillsRoot) {
        throw new Error('Invalid skill name');
    }
    const skillFile = path.join(skillDir, 'SKILL.md');
    if (!fs.existsSync(skillFile))
        return null;
    const content = fs.readFileSync(skillFile, 'utf8');
    const frontmatter = content.match(/^---\s*\n([\s\S]*?)\n---/);
    const fields = new Map();
    if (frontmatter) {
        for (const line of frontmatter[1].split(/\r?\n/)) {
            const match = line.match(/^([a-zA-Z_-]+):\s*(.*)$/);
            if (match)
                fields.set(match[1], match[2].replace(/^"|"$/g, '').trim());
        }
    }
    return {
        name: fields.get('name') || name,
        description: fields.get('description') || '',
        license: fields.get('license') || 'Apache-2.0',
        path: `skills/document-skills/${name}`,
    };
}
router.get('/skills/document', (_req, res) => {
    try {
        const manifestPath = path.join(skillsRoot, 'manifest.json');
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        const skills = ['docx', 'pdf', 'pptx', 'xlsx']
            .map(readSkill)
            .filter((skill) => Boolean(skill));
        return success(res, { ...manifest, skills });
    }
    catch (err) {
        return error(res, err instanceof Error ? err.message : 'Skill registry unavailable', 500);
    }
});
router.get('/skills/document/:name', (req, res) => {
    try {
        if (!/^[a-z0-9-]+$/.test(req.params.name)) {
            return error(res, 'Invalid skill name', 400);
        }
        const skill = readSkill(req.params.name);
        if (!skill)
            return error(res, 'Skill not found', 404);
        const skillFile = path.join(skillsRoot, req.params.name, 'SKILL.md');
        return success(res, { ...skill, instructions: fs.readFileSync(skillFile, 'utf8') });
    }
    catch (err) {
        return error(res, err instanceof Error ? err.message : 'Skill unavailable', 500);
    }
});
export default router;
