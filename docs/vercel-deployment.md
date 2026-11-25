# Vercel deployment

The root `vercel.json` configures one Vercel project with two services:

- `web` is public for all paths except `/api/*`.
- `api` is public through the `/api/*` rewrite.

Import the repository as one Vercel project and keep the project root at the repository root. Add the API and frontend environment variables to that project's settings. Use the production values described in `.env.example`; do not commit secrets. Set `ALLOWED_ORIGINS`, `WEB_ORIGIN`, and `APP_URL` to the deployed Vercel origin.

The web app uses same-origin `/api/...` requests. The rewrite routes those requests to the API, so `VITE_API_URL` can remain unset. The Instagram webhook callback is `https://YOUR_PROJECT.vercel.app/api/v1/instagram/webhook`; set `META_VERIFY_TOKEN` to the same random token configured in Meta.

No service binding is configured: the browser-side Vite app calls the API through the public same-origin rewrite, and the API has no server-side calls to another Vercel service. Bindings are runtime-only and cannot be consumed by the static frontend bundle.

The `apps/worker` entrypoint currently only registers placeholder jobs and has no queue connection, so it is not included as a deployable service. The API disables Instagram polling automatically on Vercel. Incoming Instagram messages must arrive through Meta webhooks; webhook handling completes before the API acknowledges the event. Polling remains enabled by default on non-Vercel hosts and can be controlled with `INSTAGRAM_AUTO_REPLY_POLLING_ENABLED`.

Vercel functions run on demand and are subject to plan limits. This setup does not provide a continuously running poller or a guaranteed delivery-time SLA.
