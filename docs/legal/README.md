# Slater legal documents: DRAFTS

**Status: drafts, not reviewed by a lawyer, not live.** The live pages are still the
TermsFeed ones linked in the footers of `public/index.html` and `public/login.html`.
This folder is not served by the app, so pushing it publishes nothing.

| File | What | Notes |
|---|---|---|
| `terms.md` | Terms of Service | Includes acceptable use, copyright (DMCA), client portal visitors, billing via Paddle |
| `privacy.md` | Privacy Policy | Includes cookies, service providers, retention, rights |
| `refund.md` | Refund Policy | 14 days, aligned with Paddle as Merchant of Record |
| `cookie.md` | Cookie Policy | Drafted 2026-11-04; expands section 6 of `privacy.md`; no consent banner needed (essential-only cookies) |
| (later) `dpa.md` | Data Processing Agreement | Before selling to EU/UK businesses |

Drafted 2026-11-02 (cookie.md: 2026-11-04) from how the code actually works (see the facts list below),
with John's decisions:
- Payments: **Paddle** as Merchant of Record; **monthly and yearly** subscriptions.
- Refunds: **14 days**, no questions, first purchase.
- Who can buy: **anyone, 18 or older**, any country (Paddle blocks sanctioned ones).
- Accounts: **Pause / Cancel / Delete** (common SaaS practice): pause keeps data up to
  12 months; cancel = 30-day grace, then deleted; delete = gone within 30 days,
  backups within 90.
- Law and courts: **Washington**, courts of **Pierce County**. Arbitration left for
  the lawyer to advise on.

## Before these go live
1. Lawyer review (John). Items marked **[CONFIRM: ...]** or **[LAWYER: ...]** in the
   text are open questions.
2. Things the text promises that are **not built yet**: self-serve Pause / Cancel /
   Delete, data export, Paddle billing, self-hosted fonts (no Google Fonts), DMCA
   agent registration. Either build them first or soften the text.
3. Then: turn each into a page (`/terms`, `/privacy`, `/refunds`), switch the footer
   links, add a Privacy link to the client portal footer, update "Last updated".

## Facts these drafts rely on (check again if the app changes)
- Company: Production Labs LLC, 1116 N Cedar Street, Tacoma, WA 98406, hello@productionlabs.io.
- Hosting + database: Railway (US). Files + database backups: Cloudflare R2.
  Email: Resend (transactional only, no marketing). Receipt scanning: Anthropic API.
  Payments (planned): Paddle.
- Account data (`users`): name, email, company/DBA, phone, time zone, logo, bcrypt
  password hash, license. Licenses: key, plan, up to 3 devices; per device a
  fingerprint, user agent, last seen (`license_devices`).
- Customer content: projects (schedules, crew, talent, Key Personnel, locations,
  workback, notes, expenses), contacts/organizations/locations, receipt images
  (stored in Postgres, sent to Anthropic only when scanning), client portal data.
- Client portal: visitor-typed names, approvals/change requests + notes, uploaded
  files (14 days, then deleted; 5 GB/file); emails to the account owner and chosen
  Key Personnel with per-recipient download links.
- Cookies: login session (24 h, essential), portal password cookie (30 days,
  essential). Local storage: last opened project, portal visitor's typed name.
  No analytics, no ads, no tracking pixels, no consent tool.
- Logs: the app logs method + path only (portal and download tokens masked); the
  hosting provider may log IP addresses. Rate limiting keeps IPs in memory ~15 min.
- Backups: daily, kept 90 days.
