# Deploying SutazMail anywhere

One command brings up the complete stack on any Linux host with Docker:
[docker-mailserver](https://docker-mailserver.github.io/docker-mailserver/latest/)
(Postfix + Dovecot + rspamd + fail2ban), the REST bridge SutazMail drives it with,
Postgres, and the SutazMail admin console + self-service portal.

## Quick start

```sh
git clone https://github.com/sutazmail/sutazmail.git
cd sutazmail/deploy
./deploy.sh          # interactive — asks for your mail domain + admin email
```

Unattended:

```sh
MAIL_DOMAIN=example.com SUPERADMIN_EMAIL=you@example.com ./deploy.sh
```

The script is idempotent — re-run it any time; it reuses `.env` and skips finished steps.

What it does, end to end:

1. Checks prerequisites (docker, compose v2, openssl).
2. Generates all secrets (DB password, REST-bridge API key, session secret,
   Dovecot master password, admin + postmaster passwords; bcrypt runs in a
   throwaway node container — nothing is installed on the host).
   Writes `.env` (0600) and a one-time `sutazmail-credentials-*.txt` (0600).
3. Creates the first mailbox `postmaster@<domain>` (docker-mailserver refuses to
   boot with zero accounts).
4. Builds and starts the stack, waits for the mail server to be healthy.
5. Creates the app's Dovecot master account (powers portal auto-responder /
   forwarding / password features).
6. Generates the domain's 2048-bit DKIM key.
7. Waits for the app health endpoint, then prints the MX / SPF / DMARC / DKIM
   records to publish at your registrar.

## After the script

- **Reverse proxy:** the app binds `127.0.0.1:8095` (change with `APP_HOST_PORT`).
  Put nginx / Caddy / Traefik in front for HTTPS.
- **Mail TLS:** set `SSL_TYPE=letsencrypt` in `mailserver.env` and mount your
  certificates (see the [DMS TLS docs](https://docker-mailserver.github.io/docker-mailserver/latest/config/security/ssl/)),
  then `docker compose up -d`.
- **DNS:** publish the printed records. The SutazMail UI shows them per domain
  (Domains page) and they are fully editable there — add, change, delete, or
  repoint any record; DNS templates live in Settings.
- Log in with your admin email, add domains and mailboxes from the UI. Mailbox
  owners log into the portal with their own email + mailbox password.

## Files

| File | Purpose |
| --- | --- |
| `deploy.sh` | One-shot, idempotent setup — the only thing you need to run. |
| `docker-compose.yml` | The stack: `mailserver`, `sutazmail-db` (internal-only network), `sutazmail` (built from the repo root). |
| `.env.example` | Every variable, documented. `deploy.sh` writes the real `.env`. |
| `mailserver.env` | docker-mailserver settings (no secrets — the API key is injected from `.env`). |
| `dms-config/` | Mounted at `/tmp/docker-mailserver`: DMS config lives here, plus `dms-gui/rest-api.py` (the REST bridge) and `user-patches.sh`, which installs the bridge into supervisor on **every** container start, so recreates never lose it. |
| `data/` | Created at runtime: mail data/state/logs + Postgres (git-ignored). Back this up. |

## Operations

```sh
docker compose logs -f sutazmail      # app logs
docker compose logs -f mailserver     # mail logs
docker compose exec mailserver setup  # the DMS admin CLI
docker compose up -d --build          # redeploy after a git pull
```

**Backups:** `deploy/data/` (mail + Postgres) and your filled-in `.env` are the
only state. Snapshot both.

**Security model:** the REST bridge executes shell commands as root inside the
mail container and is reachable ONLY on the internal docker network, keyed by
`DMS_API_KEY`. SutazMail is the sole intended client and builds every command
from a whitelisted template with validated inputs (`src/server/mailserver.ts`).
The database sits on its own internal-only network. The app is loopback-bound.

> **Note:** the Sutaz NAS production deployment uses the repo-root
> `docker-compose.yml` (pre-existing mailserver on a shared docker network) —
> this directory is the portable template for every other server.
