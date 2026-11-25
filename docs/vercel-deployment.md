# Vercel deployment

Deploy the repository as one Vercel project with the **Root Directory** set to the repository root (`.`). The root `vercel.json` builds the Vite frontend as a static site and publishes the Express API as a Vercel Function:

- The frontend is built from `apps/web` and served from `apps/web/dist`.
- `api/index.ts` forwards `/api/*` requests to the Express application in `apps/api/src/app.ts`; the Vercel rewrite preserves the original API path for Express routing.
- Remaining paths rewrite to `index.html` so React Router routes such as `/instagram` work on refresh.

The web app uses same-origin `/api/...` requests, so `VITE_API_URL` can remain unset. Add the production API and frontend variables described in `.env.example` in Vercel project settings. Do not commit secrets. Set `ALLOWED_ORIGINS`, `WEB_ORIGIN`, and `APP_URL` to the deployed Vercel origin.

The Instagram webhook callback is `https://YOUR_PROJECT.vercel.app/api/v1/instagram/webhook`; set `META_VERIFY_TOKEN` to the same random token configured in Meta.

The `apps/worker` entrypoint currently only registers placeholder jobs and has no queue connection, so it is not deployed. The API disables Instagram polling automatically on Vercel. Incoming Instagram messages must arrive through Meta webhooks; webhook handling completes before the API acknowledges the event. Polling remains enabled by default on non-Vercel hosts and can be controlled with `INSTAGRAM_AUTO_REPLY_POLLING_ENABLED`.

Vercel functions run on demand and are subject to plan limits. This setup does not provide a continuously running poller or a guaranteed delivery-time SLA.
