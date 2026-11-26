export function voiceStatus() {
    const voiceId = process.env.VOICE_FEMALE_VOICE_ID;
    const confirmed = process.env.VOICE_FEMALE_CONFIRMED === 'true';
    return { ready: Boolean(process.env.VOICE_PROVIDER === 'elevenlabs' && process.env.VOICE_API_KEY && voiceId && confirmed), femaleOnly: true, voiceIdConfigured: Boolean(voiceId), femaleVoiceConfirmed: confirmed, language: process.env.VOICE_LANGUAGE || 'en-IN', fallback: 'disabled' };
}
export async function synthesizeFemaleVoice(text) {
    const status = voiceStatus();
    if (!status.ready)
        throw new Error('Female voice is not configured and verified. No alternate voice will be used.');
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${process.env.VOICE_FEMALE_VOICE_ID}`, {
        method: 'POST',
        headers: { 'xi-api-key': process.env.VOICE_API_KEY, 'content-type': 'application/json', 'accept': 'audio/mpeg' },
        body: JSON.stringify({ text, model_id: 'eleven_multilingual_v2', voice_settings: { stability: 0.55, similarity_boost: 0.8 } })
    });
    if (!response.ok)
        throw new Error(`Female voice provider failed (${response.status})`);
    return Buffer.from(await response.arrayBuffer());
}
