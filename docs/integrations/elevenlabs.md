# ElevenLabs Strict Female Voice Policy Guide

## Strict Voice Rules
- Fallback to generic browser speech synthesis is **disabled by server policy**.
- Fallback to male voices is **disabled**.
- Only owner-confirmed female voice IDs are allowed to synthesize speech.

## Setup
1. Register at https://elevenlabs.io.
2. Select or clone a natural female voice (e.g., Rachel, Bella, or a custom trained female voice).
3. Copy Voice ID into `VOICE_FEMALE_VOICE_ID` in `.env`.
4. Add your API key into `VOICE_API_KEY`.
5. After hearing sample output to confirm it is female, set `VOICE_FEMALE_CONFIRMED=true`.
