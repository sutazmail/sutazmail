# SutazMail v2 — Design Direction

> Output of /frontend-design-direction (2026-07-03). Governs the P0 design system and all v2 UI.

## 1. Purpose
Two distinct jobs in one product:
- **Admin console** (org admins + superadmin): daily-use operations tool — provisioning, tenancy,
  deliverability. Optimized for scanning tables and acting fast.
- **Self-service portal** (mailbox owners, non-technical): occasional task tool — "set my vacation
  reply", "forward my mail", "change my password". Optimized for clarity, not density.

## 2. Audience → layout split
- Admin console: 240px grouped sidebar (Mail / Tenancy / Deliverability sections), topbar with org
  context switcher (superadmin) + user menu. Dense tables (13–14px data), inline row actions.
- Portal: NO sidebar. Centered `max-w-3xl` column, top tab bar (Overview · Auto-responder ·
  Forwarding · Security). Big touch targets, plain language ("When you're away…" not "Sieve vacation").

## 3. Tone
**Quiet-technical** — the Postmark/Resend/Linear register. Restraint over decoration: neutral
surfaces, weight-based type hierarchy, semantic color reserved for meaning (status, destructive).
No gradients, no blobs, no cards-in-cards, no marketing hero inside the product.

## 4. Memorable detail (the ownable one)
**Two-tone address typography.** Email addresses are the product's atomic object — they always
render in Geist Mono as `local` (foreground) + `@domain` (muted), via an `<Addr />` component.
Domains render as neutral pills with a health dot (emerald/amber/red). This is identity + function:
you can scan a 50-row table and read locals instantly, and health is visible everywhere an address
or domain appears.

## 5. Tokens (delta to globals.css — keep everything else)
- Keep: Geist Sans/Mono, oklch neutral scale, rose primary `oklch(0.645 0.246 16.439)`, radius 0.625rem.
- Fix: dark `--sidebar-primary` is off-brand blue-violet (hue 264) → align to primary.
- Add semantic status tokens (both modes): `--success` (emerald ~oklch 0.696 0.17 162),
  `--warning` (amber ~oklch 0.769 0.188 70), `--info` (sky ~oklch 0.685 0.169 237) + fg pairs.
- Charts: replace grayscale chart-1..5 with a functional sequence (rose, sky, emerald, amber, neutral).

## 6. Components (P0 shell kit)
`Addr` (two-tone address) · `DomainPill` (+health dot) · `StatusDot`/`StatusBadge` ·
`PageHeader` (title, description, primary action — one per page) · `EmptyState` (one line + one action) ·
`DataTable` (skeleton loading, error-with-retry, empty states built in) · `ConfirmDialog`
(destructive ops; typed-name confirm for irreversible) · `Kbd`, `CopyButton` (DNS records, DKIM).

## 7. States & motion
Every async view ships loading (skeleton, stable dimensions), empty, and error(retry) states — no
layout shift between them. Motion: 150ms ease-out on nav/dialog/hover only; no decorative animation.

## 8. Accessibility & responsive
WCAG AA contrast in both modes (status colors chosen for ≥4.5:1 on background); `focus-visible`
ring everywhere interactive; tables collapse to definition-list cards under `md`; toolbars keep
fixed heights so filters/labels never reflow the page.

## Review checklist (from the skill — apply before each phase ships)
First viewport = the workflow, not marketing · hierarchy scannable · text fits (mono addresses
truncate middle, never overflow) · palette multi-dimensional but restrained · icons only for known
actions · stable responsive dimensions · motion clarifies state · matches repo conventions.
