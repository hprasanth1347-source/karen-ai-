# Telegram Tunnel Setup Guide

## Setup Steps
1. Open Telegram and search for `@BotFather`.
2. Send `/newbot` and follow prompts to name your bot (e.g., `KarenUltraOwnerBot`).
3. Copy the HTTP API token into `TELEGRAM_BOT_TOKEN` in `.env`.
4. Message `@userinfobot` on Telegram to get your numeric user ID.
5. Add your ID to `TELEGRAM_OWNER_CHAT_ID` in `.env`.
6. Set webhook URL using Telegram's API or let Karen listen to polling mode in local development.
7. Only messages sent from your owner chat ID will be processed.
