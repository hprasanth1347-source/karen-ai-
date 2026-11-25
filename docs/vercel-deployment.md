# Vercel deployment

Deploy the frontend and API as separate Vercel projects from the same repository:

1. Import the repository and set the project root to `apps/web`.
2. Create a second Vercel project for the same repository with project root `apps/api`.
3. Configure each project's environment variables before deploying. For the API, use the production values listed in `.env.example`, including the required Supabase and security settings, plus `META_APP_SECRET`, `META_VERIFY_TOKEN`, and the Instagram access token/account settings. Do not commit secrets.
4. Set `VITE_API_URL` in the frontend project to `https://YOUR_API_PROJECT.vercel.app/api/v1`. Also set the frontend's Supabase URL and publishable/anonymous key.
5. In Meta's webhook settings, use `https://YOUR_API_PROJECT.vercel.app/api/v1/instagram/webhook` as the callback URL and enter the same value configured as `META_VERIFY_TOKEN`.

The API disables Instagram polling automatically on Vercel. Incoming Instagram messages must arrive through Meta webhooks; webhook handling completes before the API acknowledges the event. Polling remains enabled by default on non-Vercel hosts and can be controlled with `INSTAGRAM_AUTO_REPLY_POLLING_ENABLED`.

Vercel functions run on demand and are subject to plan limits. This setup does not provide a continuously running poller or a guaranteed delivery-time SLA.
