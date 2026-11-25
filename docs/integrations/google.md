# Google Workspace Integration Guide (Gmail & Drive)

## Scopes Required
- `https://www.googleapis.com/auth/gmail.readonly`
- `https://www.googleapis.com/auth/gmail.compose`
- `https://www.googleapis.com/auth/drive.readonly`

## Setup
1. Open Google Cloud Console: https://console.cloud.google.com
2. Create project: `karen-ultra`
3. Enable **Gmail API** and **Google Drive API**
4. Configure OAuth Consent Screen (Internal or Test User with Owner email)
5. Create OAuth 2.0 Web Client:
   - Authorized Redirect URI: `http://localhost:8080/api/v1/auth/google/callback`
6. Add `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` to `.env`.
