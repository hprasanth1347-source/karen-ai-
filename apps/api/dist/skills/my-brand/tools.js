import { z } from 'zod';
import { loadUserSetting, saveUserSetting } from '../../services/persistence.service.js';
import { DEFAULT_BRAND_SETTINGS } from '../types.js';
import { myBrandInstructions, myBrandMeta } from './meta.js';
let cachedBrand = { ...DEFAULT_BRAND_SETTINGS };
export async function loadBrandSettings(_userId) {
    try {
        const stored = await loadUserSetting('brand_settings');
        if (stored && typeof stored === 'object') {
            cachedBrand = { ...DEFAULT_BRAND_SETTINGS, ...stored };
        }
    }
    catch {
        // Keep cached
    }
    return cachedBrand;
}
export async function saveBrandSettings(updates, _userId) {
    cachedBrand = { ...cachedBrand, ...updates };
    await saveUserSetting('brand_settings', cachedBrand).catch(() => { });
    return cachedBrand;
}
const getBrandInput = z.object({});
const updateBrandInput = z.object({
    brandName: z.string().min(1).max(120).optional(),
    primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
    accentColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
    headingFont: z.string().min(1).max(80).optional(),
    bodyFont: z.string().min(1).max(80).optional(),
    tone: z.string().min(1).max(300).optional(),
});
export const getBrandSettingsTool = {
    name: 'get_brand_settings',
    description: "Fetch the owner's current brand name, colors, fonts, and tone.",
    inputSchema: getBrandInput,
    async execute(_args, ctx) {
        const brand = await loadBrandSettings(ctx.userId);
        return { ok: true, summary: `Loaded brand settings for ${brand.brandName}.`, data: brand };
    },
};
export const updateBrandSettingsTool = {
    name: 'update_brand_settings',
    description: "Update the owner's brand name, colors, fonts, or writing tone.",
    inputSchema: updateBrandInput,
    async execute(args, ctx) {
        const updated = await saveBrandSettings(args, ctx.userId);
        return { ok: true, summary: `Updated brand settings for ${updated.brandName}.`, data: updated };
    },
};
export const myBrandSkill = {
    meta: myBrandMeta,
    instructions: myBrandInstructions,
    tools: [getBrandSettingsTool, updateBrandSettingsTool],
};
