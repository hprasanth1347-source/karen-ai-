import { config } from '../config/env.js';
import { ALL_SKILLS, SKILL_BY_NAME } from './registry.js';
const RULE_PATTERNS = [
    { skill: 'comfort-mode-safe', pattern: /\b(love\s*mode|comfort\s*mode|lonely|anxious|depressed|sad|stressed|heartbroken|comfort\s+me|suicid|self[- ]?harm)\b/i, weight: 8 },
    { skill: 'word-docs', pattern: /\b(docx|word\s+doc(ument)?|create\s+a?\s*doc\b|report\s+in\s+word)\b/i, weight: 6 },
    { skill: 'pdf-tools', pattern: /\b(pdf|make\s+this\s+a?\s*pdf|merge\s+pdf|rotate\s+pdf|watermark\s+pdf|extract\s+pdf)\b/i, weight: 6 },
    { skill: 'slide-decks', pattern: /\b(pptx|slides?|slide\s+deck|powerpoint|presentation|deck)\b/i, weight: 6 },
    { skill: 'spreadsheets', pattern: /\b(xlsx|excel|spreadsheet|workbook|budget\s+sheet|formula\s+sheet)\b/i, weight: 6 },
    { skill: 'my-brand', pattern: /\b(brand\s+(settings|colors?|fonts?|tone)|my\s+brand|update\s+brand)\b/i, weight: 6 },
    { skill: 'business-writing', pattern: /\b(status\s+report|newsletter|faq|announcement|formal\s+email|business\s+email)\b/i, weight: 5 },
    { skill: 'doc-coauthor', pattern: /\b(coauthor|outline\s+and\s+draft|revise\s+(this|my)\s+doc|proposal\s+draft)\b/i, weight: 5 },
    { skill: 'thanglish-writer', pattern: /\b(thanglish|tanglish|tamil|tamizh|machan|da\b|sollu|anuppu|pannu)\b/i, weight: 5 },
    { skill: 'instagram-dm-reply', pattern: /\b(insta(gram)?\s*(dm|dms|messages?|inbox)|reply\s+to\s+.*(dm|instagram|raghul)|waiting\s+on\s+instagram|pricing\s+dm)\b/i, weight: 7 },
    { skill: 'instagram-content', pattern: /\b(insta(gram)?\s*(caption|post|reel|hashtags?|schedule)|reel\s+idea|content\s+calendar)\b/i, weight: 6 },
    { skill: 'instagram-comments', pattern: /\b(insta(gram)?\s*comments?|hide\s+spam|comment\s+lead|reply\s+to\s+comments?)\b/i, weight: 6 },
    { skill: 'gmail-assistant', pattern: /\b(gmail|unread\s+e?mails?|inbox|e?mail\s+it|send\s+(an?\s+)?e?mail|reply\s+e?mail|follow[- ]?up\s+e?mail)\b/i, weight: 6 },
    { skill: 'drive-assistant', pattern: /\b(google\s+drive|drive\s+(pdf|file|doc|folder)|find\s+(my\s+)?file|aadhar|pan\s+card|share\s+from\s+drive)\b/i, weight: 6 },
    { skill: 'classroom-planner', pattern: /\b(due\s+this\s+week|classroom|assignments?\s+due|pending\s+assignments?|plan\s+my\s+exam\s+week|deadlines?)\b/i, weight: 6 },
    { skill: 'classroom-explainer', pattern: /\b(explain\s+(my\s+)?assignment|homework\s+help|study[- ]?note\s+draft)\b/i, weight: 6 },
    { skill: 'exam-prep', pattern: /\b(exam\s+prep|mock\s+test|quiz\s+me|revision\s+notes|cram|exam\s+tomorrow|prepare\s+me\s+for\s+.*exam)\b/i, weight: 6 },
    { skill: 'daily-briefing', pattern: /\b(daily\s+briefing|morning\s+briefing|digest|what('?s|\s+is)\s+on\s+my\s+plate|today('?s|\s+is)\s+summary)\b/i, weight: 6 },
    { skill: 'task-planner', pattern: /\b(add\s+task|create\s+task|plan\s+(it|my\s+week)|to-?do|remind\s+me|break\s+down\s+goal)\b/i, weight: 5 },
    { skill: 'memory-curator', pattern: /\b(remember\s+that|save\s+memory|don'?t\s+forget|note\s+about\s+me)\b/i, weight: 5 },
    { skill: 'doc-summarizer', pattern: /\b(summarize\s+(the\s+)?(doc|document|pdf)|document\s+vault|key\s+takeaways\s+from)\b/i, weight: 6 },
    { skill: 'meeting-notes', pattern: /\b(meeting\s+notes|minutes\s+of\s+meeting|action\s+items|turn\s+notes\s+into\s+tasks)\b/i, weight: 6 },
    { skill: 'whatsapp-assistant', pattern: /\b(whatsapp|wa\s+message|whatsapp\s+template|24h\s+window)\b/i, weight: 6 },
    { skill: 'contacts', pattern: /\b(contacts?|vip\s+contact|save\s+contact|phone\s+number\s+of|email\s+address\s+of)\b/i, weight: 5 },
];
async function classifyWithFastModel(prompt, currentPage) {
    const catalog = ALL_SKILLS.map((s) => `${s.meta.name}: ${s.meta.description.slice(0, 90)}`).join('\n');
    const classifierPrompt = `Select 0 to 3 skill names for this request (page: ${currentPage || '/chat'}).
Return ONLY JSON: {"skills":["name"],"confidence":0.0}
Skills:
${catalog}
Request: ${prompt.slice(0, 280)}`;
    try {
        if (config.GROQ_API_KEY) {
            const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${config.GROQ_API_KEY}`,
                },
                body: JSON.stringify({
                    model: config.AUTON_MODEL_ID || 'qwen/qwen3.8-27b',
                    messages: [{ role: 'user', content: classifierPrompt }],
                    temperature: 0,
                    max_tokens: 70,
                }),
                signal: AbortSignal.timeout(650),
            });
            if (res.ok) {
                const json = await res.json();
                const raw = json.choices?.[0]?.message?.content || '';
                const match = raw.match(/\{[\s\S]*\}/);
                if (match) {
                    const parsed = JSON.parse(match[0]);
                    if (Array.isArray(parsed.skills)) {
                        return {
                            skills: parsed.skills.filter((n) => typeof n === 'string' && SKILL_BY_NAME.has(n)),
                            confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.7,
                        };
                    }
                }
            }
        }
        else if (config.GEMINI_API_KEY) {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key=${config.GEMINI_API_KEY}`;
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: classifierPrompt }] }] }),
                signal: AbortSignal.timeout(650),
            });
            if (res.ok) {
                const json = await res.json();
                const raw = json.candidates?.[0]?.content?.parts?.[0]?.text || '';
                const match = raw.match(/\{[\s\S]*\}/);
                if (match) {
                    const parsed = JSON.parse(match[0]);
                    if (Array.isArray(parsed.skills)) {
                        return {
                            skills: parsed.skills.filter((n) => typeof n === 'string' && SKILL_BY_NAME.has(n)),
                            confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.7,
                        };
                    }
                }
            }
        }
    }
    catch {
        // Fast fallback on timeout/error
    }
    return null;
}
export async function routeSkills(prompt, options) {
    const startMs = Date.now();
    if (options?.loveMode) {
        const comfort = SKILL_BY_NAME.get('comfort-mode-safe');
        return {
            skills: comfort ? [comfort] : [],
            skillNames: comfort ? ['comfort-mode-safe'] : [],
            confidence: 1,
            latencyMs: Date.now() - startMs,
            lowConfidence: false,
        };
    }
    const scores = new Map();
    const lower = prompt.toLowerCase();
    const page = options?.currentPage?.toLowerCase() || '';
    for (const rule of RULE_PATTERNS) {
        if (rule.pattern.test(prompt)) {
            scores.set(rule.skill, (scores.get(rule.skill) || 0) + rule.weight);
        }
    }
    for (const skill of ALL_SKILLS) {
        let s = scores.get(skill.meta.name) || 0;
        for (const trig of skill.meta.triggerIntents) {
            if (lower.includes(trig.toLowerCase())) {
                s += 3;
            }
        }
        if (page && skill.meta.pageAffinity.some((p) => page.includes(p.toLowerCase()))) {
            s += 2;
        }
        if (s > 0) {
            scores.set(skill.meta.name, s);
        }
    }
    let ranked = Array.from(scores.entries())
        .sort((a, b) => b[1] - a[1])
        .filter(([, score]) => score >= 4);
    let confidence = ranked.length > 0 ? Math.min(1, ranked[0][1] / 8) : 0;
    // Optional fast LLM fallback when deterministic score is low/empty
    if (ranked.length === 0 && options?.useLlmFallback !== false) {
        const llm = await classifyWithFastModel(prompt, options?.currentPage);
        if (llm && llm.skills.length > 0) {
            ranked = llm.skills.map((name, idx) => [name, Math.max(4, 6 - idx)]);
            confidence = llm.confidence;
        }
    }
    const maxSkills = options?.maxSkills ?? 4;
    const selected = ranked
        .slice(0, maxSkills)
        .map(([name]) => SKILL_BY_NAME.get(name))
        .filter((m) => Boolean(m));
    return {
        skills: selected,
        skillNames: selected.map((s) => s.meta.name),
        confidence,
        latencyMs: Date.now() - startMs,
        lowConfidence: selected.length === 0 || confidence < 0.45,
    };
}
