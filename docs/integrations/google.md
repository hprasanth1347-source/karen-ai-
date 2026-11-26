# Google Workspace OAuth Setup (Drive, Gmail & Google Classroom)

## Why Your Connection Can Expire After 7 Days
In Google Cloud Console, if your **OAuth consent screen** is left in **Testing** mode, Google automatically expires OAuth refresh tokens every **7 days**, forcing you to reconnect.

To keep Drive, Gmail, and Google Classroom permanently connected until you click **Disconnect**:

## Step-by-Step Setup

1. Open [Google Cloud Console](https://console.cloud.google.com/) and select your project.
2. Enable the required APIs under **APIs & Services → Library**:
   - **Google Drive API**
   - **Gmail API**
   - **Google Classroom API**
3. Go to **Google Auth Platform → Audience** (or **APIs & Services → OAuth consent screen**):
   - Set **Publishing status** to **In production** (click **Publish App**).
   - For personal use (under 100 users / owner-only), you do not need to complete Google's commercial verification unless you open it to external public users; you may see an "Unverified app → Advanced → Go to Karen AI" prompt once on initial connect.
4. Go to **APIs & Services → Credentials → OAuth 2.0 Client IDs**:
   - Ensure **Authorized redirect URIs** includes:
     - `https://karen-ai-me.vercel.app/api/v1/auth/google/callback`
     - `http://localhost:8080/api/v1/auth/google/callback` (for local development)
5. Set environment variables in Vercel / `.env`:
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`
   - `GOOGLE_REDIRECT_URI=https://karen-ai-me.vercel.app/api/v1/auth/google/callback`
6. Connect once from `/drive` or `/classroom`. KAREN stores your AES-256-GCM encrypted `refresh_token` in Supabase `provider_connections` and refreshes access tokens automatically 5 minutes before expiry.

## Google Classroom: Joining by Class ID, Invite Link & Pending Invitations

Google Classroom's REST API (`POST /v1/courses/{courseId}/students?enrollmentCode=<code>`) requires **both** a numeric `courseId` and the `enrollmentCode` — Google does not provide a lookup endpoint by the 5–12 character class code alone.

- **Invite link**: Paste `https://classroom.google.com/c/<slug>?cjc=<code>`. Karen URL-safe base64-decodes `<slug>` to the numeric Class ID and extracts `cjc` as the class code.
- **Class ID + code**: Enter the numeric Class ID (or paste a `classroom.google.com/c/<slug>` URL — Karen auto-decodes and displays `Detected ID: ...`) plus the 5–12 character class code.
- **Pending invitations**: Accepts invitations from `GET /v1/invitations?userId=me`.
- **Google Drive Upload (`drive.file` scope)**: Existing users must reconnect Google once to grant `https://www.googleapis.com/auth/drive.file`.
