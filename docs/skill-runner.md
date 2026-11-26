# Karen Skill-Runner Service

Vercel serverless functions cannot execute Python (`pypdf`, `reportlab`, `python-docx`, `openpyxl`, `python-pptx`), LibreOffice headless conversions, or Playwright Chromium. `apps/skill-runner` is a dedicated isolated Docker service that executes **script skills** on behalf of `@karen/api`.

## Security Guarantees
- **Bearer Auth:** `POST /run` requires `Authorization: Bearer <SKILL_RUNNER_SECRET>` verified with `crypto.timingSafeEqual` (fail-closed).
- **Non-Root Container:** Runs as UID `10001` (`runner`) with `/skills` mounted read-only.
- **Fresh Temp Directory:** Every invocation gets an isolated `/tmp/skill-runs/<uuid>` directory that is deleted on completion.
- **No Secret Leakage:** Child processes receive only `PATH`, `HOME`, `SKILL_WORK_DIR`, `SKILL_OUT_DIR`, and `NODE_PATH` — never Supabase service role keys or user OAuth tokens.
- **SSRF Guard:** Blocks `localhost`, `127.0.0.1`, `.local`, `.internal`, and RFC1918 private IP ranges in URL arguments.
- **Resource Caps:** 60s default timeout (max 120s), 512MB RAM, 1.0 CPU, 25MB max total output, output file extension allowlist.

## Deploy with Docker Compose (VPS)
```bash
cd apps/skill-runner
SKILL_RUNNER_SECRET=$(openssl rand -hex 32) docker compose up -d --build
```

## Deploy to Railway / Fly.io
1. Point service build to `apps/skill-runner/Dockerfile` with repo root as build context.
2. Set environment variables:
   - `SKILL_RUNNER_SECRET` (same secret configured in Vercel `@karen/api`)
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `SKILLS_STORAGE_BUCKET=karen-skill-outputs` (create private bucket in Supabase Storage)
3. Set `SKILL_RUNNER_URL=https://your-runner-host` in Vercel `@karen/api` environment variables.

## Optional E2B Sandbox Adapter
If `E2B_API_KEY` is configured in `@karen/api` without `SKILL_RUNNER_URL`, the API routes script skill executions through E2B Code Interpreter sandboxes.
