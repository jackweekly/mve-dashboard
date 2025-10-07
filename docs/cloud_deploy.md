# Cloud Deployment Guide

The project ships with a production-ready Docker setup so you can boot a full
stack (Rails web, Sidekiq, PostgreSQL, Redis) on any cloud VM that has Docker
installed. These instructions assume an Ubuntu 22.04 host, but the same steps
apply to any recent Linux distribution.

## 1. Prepare the host

```bash
# Update the OS and install Docker + Compose plugin
sudo apt-get update && sudo apt-get upgrade -y
sudo apt-get install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Allow your user to talk to the Docker daemon without sudo (log out/in afterwards)
sudo usermod -aG docker "$USER"
```

Opening the firewall so you can reach the app from your laptop:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

## 2. Pull the application

```bash
git clone https://github.com/<your-org>/mve-dashboard.git
cd mve-dashboard
```

Copy the production env template, add secrets, and make sure the values line up
with how you want to run the stack:

```bash
cp .env.cloud.example .env.cloud
# edit .env.cloud with your editor of choice
```

Things you **must** set before booting:

- `RAILS_MASTER_KEY` – from `config/master.key` in this repo (or the matching
  credentials file you manage separately).
- `DATABASE_URL`, `POSTGRES_*` – keep these aligned. If you prefer a managed
  database, delete the `postgres` section from `docker-compose.cloud.yml` and
  point `DATABASE_URL` at the managed instance instead.
- `BASIC_AUTH_*` and `SIDEKIQ_WEB_*` – change from defaults for security.
- `HOSTNAME` – the public hostname or IP you will use (e.g. `api.example.com`).

If you are terminating SSL on the VM (via nginx/Caddy), point that proxy to
`http://127.0.0.1:80`.

## 3. Build and boot the stack

```bash
# Build images for web/worker/migrate targets
sudo docker compose -f docker-compose.cloud.yml build

# Run migrations once (safe to rerun on deploy)
sudo docker compose -f docker-compose.cloud.yml run --rm migrate

# Bring up the long-running services (web, worker, redis, postgres)
sudo docker compose -f docker-compose.cloud.yml up -d web worker redis postgres
```

Tail the logs if you want to observe the boot process:

```bash
sudo docker compose -f docker-compose.cloud.yml logs -f web worker
```

At this point the Rails app listens on port 80. Visit
`http://<HOSTNAME or VM public IP>/` from your laptop. Sidekiq’s web UI lives at
`/sidekiq` and is protected by Basic Auth using the credentials you set.

## 4. Day 2 operations

### Deploying updates

```bash
git pull origin main
sudo docker compose -f docker-compose.cloud.yml build
sudo docker compose -f docker-compose.cloud.yml run --rm migrate
sudo docker compose -f docker-compose.cloud.yml up -d web worker
```

This preserves your Postgres data volume. For Redis you can add persistence by
removing the `--appendonly no` flag in the compose file if desired.

### Backups

The PostgreSQL container stores data in the named volume `postgres-data`.
Snapshot it at the infrastructure level (e.g. taking volume snapshots) or use
`pg_dump` against the container:

```bash
sudo docker compose -f docker-compose.cloud.yml exec postgres \
  pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" > backup.sql
```

### SSL termination

Pair the stack with a reverse proxy (nginx, Caddy, Traefik) that handles TLS.
Point the proxy to the `web` container on port 3000 (compose already maps that
service to port 80 on the host). Remember to keep `config/environments/production.rb`
set to `config.assume_ssl = true` so Rails knows to generate HTTPS URLs.

## 5. Troubleshooting

- `RAILS_MASTER_KEY` missing → the container exits immediately. Check `web`
  logs and ensure the key is present in `.env.cloud`.
- Database connection errors → confirm the `postgres` service is healthy (`docker
  compose ps`) and the credentials in `.env.cloud` match the container env vars.
- HTTP 403 / host not allowed → verify `HOSTNAME` in `.env.cloud` matches the
  hostname you use in the browser. Wildcards aren’t supported; add extra hosts
  in `config/environments/production.rb` if needed.

With Docker in place, you can replicate the same stack locally on another
machine by reusing the same compose file and env configuration.
