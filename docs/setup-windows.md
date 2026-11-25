# Karen Ultra — Windows & VS Code Beginner Setup Guide

## Requirements
- Windows 10/11
- Node.js v20+ (LTS)
- Visual Studio Code

## Step-by-Step Setup

### 1. Clone & Enter Directory
Open PowerShell in your workspace:
```powershell
cd D:\karen-ultra-source\karen-ultra
```

### 2. Configure Environment Variables
Copy `.env.example` to `.env`:
```powershell
Copy-Item .env.example .env
```
Open `.env` in VS Code and fill in your keys as needed.

### 3. Install Dependencies
```powershell
npm install
```

### 4. Setup Database
1. Create a free project on [Supabase](https://supabase.com).
2. Open the **SQL Editor** in your Supabase dashboard.
3. Paste and run the contents of `supabase/migrations/0002_karen_ultra_complete.sql`.
4. Copy your project URL, anon key, and service role key into `.env`.

### 5. Start Development Server
```powershell
npm run dev
```
- Web Dashboard: [http://localhost:5173](http://localhost:5173)
- API Server: [http://localhost:8080](http://localhost:8080)
- API Health Check: [http://localhost:8080/api/health](http://localhost:8080/api/health)
