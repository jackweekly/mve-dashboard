# Sparrow Ops

Sparrow Ops is a Rails 8 application that orchestrates optimization jobs. It
provides a live dashboard, job submission UI, background processing via
Sidekiq/Redis, and a stubbed integration point for a Python solver service.

## What’s in the box?

- Dashboard summarising queued/running/completed jobs with live updates.
- Job creation + duplication flow with JSON parameter editing.
- Sidekiq worker that simulates solver progress and broadcasts status.
- Seeds that create an admin account and example job/result data.
- Docker Compose stack for cloud/server deployments.

## Local development

### Prerequisites

| Tool | Version | Notes |
| --- | --- | --- |
| Ruby | 3.2.3 | Matches `.ruby-version`; install via `asdf`, `rbenv`, or Homebrew `ruby@3.2`. |
| Bundler | 2.4.19 | Install with `gem install bundler -v 2.4.19`. |
| PostgreSQL | 14+ (tested with 16) | Ensure a role/database user exists (defaults below). |
| Redis | 7+ | Required for Sidekiq and Turbo updates. |
| Chrome | Latest | Needed for system tests (headless via Selenium). |

### Bootstrapping

```bash
git clone https://github.com/<your-org>/mve-dashboard.git
cd mve-dashboard

bundle _2.4.19_ install

# Create databases, run migrations, and seed an example job + admin user
bin/rails db:setup

# Optional: customise environment defaults
export BASIC_AUTH_USERNAME=admin BASIC_AUTH_PASSWORD=password

# Launch Rails, Sidekiq, Tailwind, and a Redis watcher in one command
bin/dev
```

The app boots on `http://localhost:3000`. Default basic-auth credentials are
`admin` / `password` (override with env vars). Sidekiq’s web UI is available at
`/sidekiq` and uses `SIDEKIQ_WEB_USERNAME/SIDEKIQ_WEB_PASSWORD`.

### Environment variables (development)

- `BASIC_AUTH_USERNAME`, `BASIC_AUTH_PASSWORD` – guard the UI.
- `SIDEKIQ_WEB_USERNAME`, `SIDEKIQ_WEB_PASSWORD` – protect Sidekiq Web.
- `PY_SERVICE_URL` – URL of the Python solver service (defaults to
  `http://localhost:8000`; the bundled Ruby stub fakes responses today).
- `REDIS_URL`, `DATABASE_URL` – override connection strings if needed.

### Running tests

```bash
bundle _2.4.19_ exec rails test
```

The test suite executes controller, model, and system tests. System tests run
headless Chrome via Selenium; ensure Chrome is installed and accessible.

### Python service stub

Real solver integration lives behind `PythonClient`. The current implementation
stubs responses so the Rails UX flows end-to-end. When your FastAPI (or other)
service is ready, point `PY_SERVICE_URL` at it and swap the client
implementation.

## Cloud deployment

The repository includes `docker-compose.cloud.yml` and `.env.cloud.example` to
boot the full stack (web, Sidekiq, PostgreSQL, Redis) on any Docker-capable
server. `docs/cloud_deploy.md` covers:

1. Preparing an Ubuntu host (Docker, firewall, TLS proxy hints).
2. Populating `.env.cloud` (master key, DB/Redis URLs, auth credentials).
3. Building images, running migrations, and starting services.
4. Rolling updates, backups, and troubleshooting tips.

## Front-end diagnostics (Mapbox & buttons)

If the VRP map never appears or buttons such as “Run Demo”, “Launch Mission”,
or “Clear” stop responding, assume the front-end JavaScript bundle is not
initialising. The checklist below audits that pipeline end-to-end.

### CLI audit checklist

```bash
# Confirm Stimulus controllers are discoverable and the layout loads JS tags
ls app/javascript
cat app/views/layouts/application.html.erb | grep javascript

# Inspect the generated import map for the application entry point
bin/importmap json | jq '.imports.application'

# Run a production-parity asset build and confirm JS output exists
RAILS_ENV=production bin/rails assets:precompile
ls public/assets | grep js

# Rebuild Tailwind utilities used by the Mapbox layout
RAILS_ENV=production bin/rails tailwind:build

# Ensure the Content Security Policy allows Mapbox hosts and web workers
grep -R "content_security_policy" config/initializers

# Verify the Mapbox token is present in the deployed environment
echo $MAPBOX_ACCESS_TOKEN

# Restart the service and watch for runtime JavaScript or CSP errors
sudo systemctl restart mve-dashboard
sudo journalctl -u mve-dashboard -n 40 --no-pager
```

### Cache reset workflow

When assets appear stale, clear caches before re-running the production build
and restarting:

```bash
rm -rf tmp/cache public/assets
RAILS_ENV=production bin/rails assets:precompile
sudo systemctl restart mve-dashboard
```

Re-open the app in Chrome DevTools → Console to confirm Turbo, Stimulus, and
Mapbox initialise without errors after the restart.

## API Contract

### Create Job

-   **Endpoint:** `/jobs`
-   **Method:** `POST`
-   **Payload:**

    ```json
    {
      "problem_type": "<string>",
      "params": {},
      "solver": "<string>",
      "seed": "<integer>"
    }
    ```

### Get Job Status

-   **Endpoint:** `/jobs/<job_id>`
-   **Method:** `GET`
-   **Response:**

    ```json
    {
      "id": "<integer>",
      "status": "<string>",
      "progress": "<float>",
      "logs": "<string>"
    }
    ```

### Get Job Results

-   **Endpoint:** `/jobs/<job_id>/results`
-   **Method:** `GET`
-   **Response:**

    ```json
    {
      "metrics": {},
      "artifacts": [
        {
          "name": "<string>",
          "url": "<string>"
        }
      ]
    }
    ```

## API Contract

### Create Job

-   **Endpoint:** `/jobs`
-   **Method:** `POST`
-   **Payload:**

    ```json
    {
      "problem_type": "<string>",
      "params": {},
      "solver": "<string>",
      "seed": "<integer>"
    }
    ```

### Get Job Status

-   **Endpoint:** `/jobs/<job_id>`
-   **Method:** `GET`
-   **Response:**

    ```json
    {
      "id": "<integer>",
      "status": "<string>",
      "progress": "<float>",
      "logs": "<string>"
    }
    ```

### Get Job Results

-   **Endpoint:** `/jobs/<job_id>/results`
-   **Method:** `GET`
-   **Response:**

    ```json
    {
      "metrics": {},
      "artifacts": [
        {
          "name": "<string>",
          "url": "<string>"
        }
      ]
    }
    ```
