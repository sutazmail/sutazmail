# SutazMail v2 — Architecture (enterprise rebuild)

> Status: approved research → design. All mailserver capabilities below were VERIFIED live on
> 2026-07-03 against the production `mailserver` container (docker-mailserver v15.1.0,
> Dovecot 2.3.19.1) — see "Verified capabilities". No assumptions.

## Verified capabilities (live probe, 2026-07-03)

| Capability | Status | Mechanism |
|---|---|---|
| End-user credential check | ✅ verified | `doveadm auth test` works (rc=77 + "auth failed" on bad pw); IMAP:143 / Sieve:4190 also reachable on `tottynotti-network` for direct protocol auth |
| ManageSieve | ✅ already enabled | `ENABLE_MANAGESIEVE=1`, Dovecot listens `0.0.0.0:4190`; capability includes `vacation`, `regex`, `imap4flags`, `date`, `duplicate` |
| Auto-responder | ✅ supported | Sieve `vacation` extension in `managesieve_sieve_capability` |
| Quota read | ✅ verified | `doveadm quota get -u <user>` returns STORAGE/MESSAGE rows; quota plugin loaded (`quota = count:User quota`, `quota_vsizes = yes`) |
| Quota set | ✅ available | `setup quota set <email> [<quota>]` / `setup quota del`; `dovecot-quotas.cf` in config volume |
| Master account (act-on-behalf) | ✅ available | `setup dovecot-master add <user> [<pw>]`; login as `user@domain*master` (IMAP/POP3 documented; ManageSieve support to be verified at P1 with a real master account) |
| Per-user Sieve storage | ✅ verified | `sieve_dir = ~/sieve`, active script `~/.dovecot.sieve`; user homes at `/var/mail/<dom>/<user>/home` |
| rspamd | ✅ running | controller at `0.0.0.0:11334` (auth mechanism TBD at P3); greylisting + learn enabled, `MOVE_SPAM_TO_JUNK=1` |
| App passwords | ❌ not native | DMS has no per-user app passwords; would require a custom supplementary passdb (touches mailserver config — scoped as P1-optional, needs owner approval) |
| DMS REST bridge | ✅ live (v1 uses it) | `POST http://mailserver:8888/`, `Authorization: <DMS_API_KEY>`, runs shell as root — remains the trust boundary for `setup`/`doveadm` commands |

Feature parity benchmarks: mailcow self-service = password, app passwords, temp aliases, spam
score + black/whitelist, quarantine. Modoboa = auto-reply (per-sender timeout), forwarding,
Sieve filters via ManageSieve (sievelib), per-domain limits, "Reseller" role (≙ our Org).

## System components

```
                    ┌─────────────────────────────┐
  HTTPS (DSM nginx) │  sutazmail-v2 (Next.js 16)  │   127.0.0.1:8095 → :3000
  mailadmin.sutaz…  │  app router, RSC, actions   │
                    └──────┬──────────┬───────────┘
                           │          │
              Prisma (TCP) │          │ docker network (tottynotti-network)
                    ┌──────▼─────┐    │
                    │sutazmail-db│    ├──► mailserver:8888  DMS REST (setup/doveadm, root shell — whitelisted templates only)
                    │postgres:16 │    ├──► mailserver:4190  ManageSieve (end-user auth + sieve mgmt via master login)
                    └────────────┘    └──► mailserver:143   IMAP (auth fallback / mailbox checks)
```

- **Stack:** new dir `/volume1/docker/sutazmail-v2/` — services `sutazmail-v2` (image
  `sutazmail/app:0.2.0`, port `127.0.0.1:8095:3000`) + `sutazmail-db` (postgres:16-alpine,
  internal only, named volume). Both on `tottynotti-network` (external). Live v1 stack is untouched
  until P5 cutover.
- **Same repo** (`C:\Users\root\Desktop\Airbnb\sutazmail`) evolves to v2; the NAS v1 stack keeps its
  own source copy, so v1 remains rebuildable independently.

## Identity, tenancy, auth

- **Roles:** `SUPERADMIN` (us), `ORG_ADMIN` (client org admin, scoped to their org's domains),
  `USER` (mailbox owner). Every query is org-scoped; RBAC guards `requireUser()/requireOrgAdmin()/
  requireSuperadmin()` at the top of every action/route (same enforcement style as v1's requireAdmin).
- **Admins (SUPERADMIN/ORG_ADMIN):** local credential — bcrypt hash in Postgres (User.passwordHash),
  cost 12. TOTP 2FA optional per user (secret in DB, otplib).
- **End users (USER):** NO password stored by us. Login = direct SASL PLAIN authentication against
  Dovecot at `mailserver:4190` (ManageSieve — same passdb as IMAP; no shell involved, password never
  on a command line). A `User` row (provisioned by their org admin, matching the mailbox address)
  must exist — Dovecot-auth alone is not enough.
- **Sessions:** DB-backed (Session row: id, userId, expiresAt, ip/ua) + HMAC-signed cookie carrying
  the session id (v1's signing scheme, `timingSafeEqual`). DB backing enables revocation + audit.
- **Act-on-behalf:** app-owned Dovecot master account (created once: `setup dovecot-master add
  sutazmail <generated>`); credential lives only in v2 env. All mailbox-scoped operations (sieve
  get/put/activate for vacation/forwarding rules) authenticate as `user@dom*sutazmail` AFTER our
  RBAC check. Admin never needs a user's password.

## Prisma schema (draft — final in prisma/schema.prisma)

```prisma
model Org        { id, name, slug @unique, createdAt; domains Domain[]; users User[]; auditLogs AuditLog[]; subscription Subscription? }
model Domain     { id, name @unique, orgId → Org, createdAt; verifiedDkim Boolean @default(false) }  // must match live mailserver domains
model User       { id, email @unique (= mailbox address for USER role), displayName, role Role, orgId → Org,
                   passwordHash String? (admins only), totpSecret String?, totpEnabled Boolean @default(false),
                   createdAt, disabledAt DateTime?; sessions Session[] }
model Session    { id @id (cuid), userId → User, expiresAt, createdAt, ip, userAgent }
model AuditLog   { id, orgId → Org?, actorId → User?, action String, target String, detail Json?, createdAt }  // append-only
model Invite     { id, email, role, orgId → Org, tokenHash, expiresAt, acceptedAt? }
model Plan       { id, name, priceMonthlyCents, limits Json }          // P4
model Subscription { id, orgId @unique → Org, planId → Plan, status, stripeCustomerId?, stripeSubId? }  // P4
enum Role { SUPERADMIN ORG_ADMIN USER }
```

Consistency rule: mailboxes/aliases live in the mailserver (source of truth for MAIL); Postgres is
source of truth for IDENTITY/TENANCY/AUDIT. Provisioning writes both (mailserver first, DB second,
audit always); a reconcile view flags drift (mailbox exists without User row or vice versa).

## Mail integration surfaces

1. **DMS REST bridge (existing, v1-proven):** whitelisted templates only — `setup email add/update/
   del/list`, `setup alias add/del/list`, `setup quota set/del`, `setup config dkim`, `doveadm quota
   get -u`, `doveadm auth test` (fallback), `setup dovecot-master …` (bootstrap only). Every value
   validated + shell-quoted (v1 `validate.ts` carries over).
2. **ManageSieve client (new, `src/server/sieve.ts`):** minimal RFC 5804 client over TCP socket —
   AUTHENTICATE PLAIN (end-user login check; master login for management), LISTSCRIPTS, GETSCRIPT,
   PUTSCRIPT, SETACTIVE. Powers: vacation auto-responder (sieve `vacation :days N :subject …`),
   forwarding rules (`redirect` + optional `keep`), user filter rules. We generate sieve scripts from
   structured settings (never free-text from users) in a dedicated managed section.
3. **IMAP LOGIN check (new, tiny):** optional fallback auth verifier at `mailserver:143`.

## Security invariants (carry over from v1 + new)

- REST bridge runs shell as root ⇒ ONLY fixed command templates, whitelisted verbs, validated args,
  single-quote shell quoting; never client strings. No passwords in `setup` command lines except
  account create/update (already v1 behavior; passed quoted, never logged) — end-user auth NEVER
  goes through the bridge.
- Master credential + DMS key + session secret: server-side env only; never in the client bundle.
- Rate limits on login + Dovecot auth attempts (protect fail2ban budget); audit log on every mutation.
- Org scoping enforced in EVERY query via the RBAC guard's returned context (no raw prisma calls in pages).

## Deploy facts (verified in v1)

Next standalone needs `ENV HOSTNAME=0.0.0.0 PORT=3000`; compose v2.20 interpolates `$` in `.env`
(escape as `$$`); build on the NAS (`docker compose up -d --build`); loopback publish + DSM reverse
proxy (isolated conf, wildcard cert `_archive/Jx3ljV`); port 8095 for v2 (verify free before deploy).

## Phases

P0 foundation (DB, schema, auth+RBAC, design system, shell) → P1 self-service portal → P2 admin/
multi-tenant → P3 deliverability → P4 billing-ready → P5 cutover. Each phase ends with REAL e2e
verification against the live mailserver (throwaway accounts, real IMAP/ManageSieve logins), no mocks.
