# GOOGLE CLOUD & OAUTH SETUP GUIDE — KAREN AI

## 1. Create Google Cloud Project & OAuth Client
1. Open [Google Cloud Console](https://console.cloud.google.com/) and create or select your project.
2. Enable the required APIs:
   - **Gmail API**
   - **Google Drive API**
   - **Google Sheets API**
   - **Google Calendar API**
   - **Google People API** (Contacts)
   - **Google Tasks API**
   - **Google Classroom API**
3. Configure **OAuth Consent Screen**:
   - User type: **External** (add your Google account under **Test users** while in Testing mode).
   - Note: Gmail (`gmail.readonly`, `gmail.send`) and full Drive scopes are **Restricted Scopes** requiring Google app verification for public production release.
4. Create **OAuth 2.0 Client ID** (Web application):
   - Authorized redirect URI (Local): `http://localhost:8080/api/v1/auth/google/callback`
   - Authorized redirect URI (Production): `https://<your-domain>/api/v1/auth/google/callback`

## 2. Student Least-Privilege Classroom Scopes
Karen AI requests student read-only scopes for Classroom (never teacher scopes):
- `https://www.googleapis.com/auth/classroom.courses.readonly`
- `https://www.googleapis.com/auth/classroom.coursework.me.readonly`
- `https://www.googleapis.com/auth/classroom.announcements.readonly`
- `https://www.googleapis.com/auth/classroom.rosters` (for class join where permitted)

## 3. Environment Variables
Set in `.env` / Vercel:
```env
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REDIRECT_URI=https://your-domain/api/v1/auth/google/callback
GOOGLE_CLASSROOM_ENABLED=true
GOOGLE_CLASSROOM_TIMEZONE=Asia/Kolkata
```
