# Karen Ultra — VPS & Docker Deployment Guide

## Architecture
Production deployment utilizes Docker Compose with three service containers:
- `web`: Nginx serving the static Vite production bundle.
- `api`: Node.js Express API.
- `worker`: Background job runner.

## 1. Server Prerequisites
- Ubuntu 22.04 LTS or 24.04 LTS VPS
- Docker & Docker Compose v2+
- Domain pointing to the VPS IP

## 2. Deploy with Docker Compose
Clone the repository and build:
```bash
git clone <your-repo> /opt/karen-ultra
cd /opt/karen-ultra
cp .env.example .env
nano .env # Add production secrets

docker compose -f docker-compose.prod.yml up -d --build
```

## 3. SSL with Let's Encrypt & Certbot
```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com
```
