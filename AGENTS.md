# AGENTS.md

> **Rule:** Keep this file continuously updated. It is the single source of truth for agents/LLMs to retain full project context. Any backend change (schema, RLS, endpoints, envs, flows) must be reflected here immediately.

---

## Project Snapshot

* **Name:** Pulse AI (Phase 1)
* **Runtime:** Next.js 15 on Cloudflare (`ai.alee.az`)
* **DB/Auth:** Supabase (Postgres + RLS)
* **Bot:** Telegram via webhook (`/api/tg/webhook`)
* **Public Reads:** `industries`, `signals` (only where `visible = true`)
* **Private Writes:** `users` table writes occur **only** via server route using `SUPABASE_SECRET_KEY` (service role)

---

## Data Layer (Postgres)

### Tables

#### `public.industries`

* `id` bigint generated always as identity (PK)
* `name` text not null
* `visible` boolean not null

#### `public.signals`

* `id` bigint generated always as identity (PK)
* `name` text not null
* `visible` boolean not null
* `prompt` text not null

#### `public.users`

* `id` bigserial (PK)
* `email` text not null (unique by `lower(email)`)
* `first_name` text null
* `last_name` text null
* `industry_ids` bigint[] not null
* `signal_ids` bigint[] not null
* `telegram_start_token` text not null
* `telegram_chat_id` bigint null
* `created_at` timestamptz default now()

### Indexes / Constraints

```sql
create unique index if not exists users_email_lower_idx
  on public.users (lower(email));
```

### RLS (Row-Level Security)

```sql
alter table public.industries enable row level security;
alter table public.signals    enable row level security;
alter table public.users      enable row level security;

-- public reads (visible rows only)
create policy if not exists industries_public_read
on public.industries for select to anon, authenticated
using (visible = true);

create policy if not exists signals_public_read
on public.signals for select to anon, authenticated
using (visible = true);

-- dashboard (supabase-authenticated) full CRUD on users
create policy if not exists users_authed_all
on public.users for all to authenticated
using (true) with check (true);

-- no anon policy on users => no client-side insert/update/delete/select
-- server route with SUPABASE_SECRET_KEY bypasses RLS for inserts
```

### RPC Functions

* None in phase 1. (If you add any, document signature, security, and usage here.)

---

## Backend Endpoints (Next.js App Routes)

### `POST /api/register`

**Purpose:** Insert row into `users` and return Telegram deep link.
**Auth:** Service role (`SUPABASE_SECRET_KEY`) → bypasses RLS.
**Inputs:**

```json
{
  "email": "string (required)",
  "firstName": "string (optional)",
  "lastName": "string (optional)",
  "industryIds": "number[] (required, bigint[])",
  "signalIds": "number[] (required, bigint[])"
}
```

**Logic:**

1. Normalize/validate `email` (lowercase/trim); reject if missing/invalid.
2. Check duplicates: `select id from users where email = <lower(email)> limit 1`.
3. Insert with `telegram_start_token = uuid`.
4. Return `telegramLink = https://t.me/${NEXT_PUBLIC_TELEGRAM_BOT_USERNAME}?start=${token}`.
5. Do **not** call `.select()` post-insert for anon flows.

**Errors:**

* `409` if user exists.
* `400` validation/db failures.

---

### `POST /api/tg/webhook`

**Purpose:** Bind Telegram chat and send first message.
**Security:** Verify header `x-telegram-bot-api-secret-token === TELEGRAM_WEBHOOK_SECRET`.
**Input:** Telegram Update object; expects `/start <token>` in `message.text`.
**Logic:**

1. Parse `message`/`edited_message`, extract `chat.id` and `/start <token>`.
2. With service role, find `users` by `telegram_start_token`.
3. `update users set telegram_chat_id = chat.id` (optionally null out/rotate start token).
4. Send welcome message via `sendMessage`.

**Non-/start handling:** Politely instruct user to return to site and use the link.

---

## Environment Variables

**Public**

* `NEXT_PUBLIC_SUPABASE_URL`
* `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME`

**Secrets (server-only)**

* `SUPABASE_SECRET_KEY` (service role)
* `TELEGRAM_BOT_TOKEN`
* `TELEGRAM_WEBHOOK_SECRET`

> If you keep a publishable key (e.g., `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY`), use only for read-only queries to `industries`/`signals` or proxy via server routes.

---

## Telegram Ops

**Set webhook (no env vars):**

```bash
curl -sS -X POST "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://ai.alee.az/api/tg/webhook","secret_token":"<YOUR_WEBHOOK_SECRET>"}'
```

**Check webhook:**

```bash
curl -sS "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getWebhookInfo"
```

**Delete webhook:**

```bash
curl -sS "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/deleteWebhook"
```

---

## Frontend (Phase 1 behavior summary)

* Loads `industries` & `signals` (visible=true). Autoselects if single option.
* Validates: email, at least one industry and one signal.
* On submit → `POST /api/register` → shows Telegram deep link.
* UI:

  * “Open Telegram” (new tab)
  * “Copy” button with fixed size; ✓ on success, red ✕ with red border on failure.
  * Toast: **sm** full-width bottom (respect page padding), **md+** bottom-right.

---

## Invariants / Assumptions

* `users` table is **not** publicly writable/readable; only server route (service role) inserts.
* Email uniqueness is enforced both in app and DB (`lower(email)` index).
* `industry_ids` and `signal_ids` are **bigint[]** and must contain valid IDs from public lists.
* Telegram chat binding occurs **once** per valid `/start <token>`; subsequent `/start` without token is ignored or re-instructed.

---

## Agent Operating Instructions

1. Treat **this file** as canonical. Update it whenever you:

   * change DB schema/RLS/indexes,
   * add/edit routes or bot commands,
   * alter env naming/usage,
   * introduce RPC, cron, or background jobs.
2. Prefer minimal server routes with service role for privileged actions; avoid exposing secrets in client.
3. When writing new flows, specify:

   * endpoint(s), inputs/outputs, auth model,
   * DB mutations/queries, RLS implications,
   * fallback and error paths,
   * any required indexes or constraints.

---

## Roadmap Placeholders (Phase 2+; keep updated)

* **Daily Agents:** scheduler triggers report generation & Telegram sends to `telegram_chat_id`.
* **Scraping:** Apify sources → cleaned documents.
* **Embeddings:** OpenAI `text-embeddings-3-small (1536)` → vector store (Pinecone).
* **Reports:** GPT-5 generates human-readable summaries by `signal`.
* **Dashboard:** authenticated CRUD over `users`, `industries`, `signals`; audit logs.

---

## Change Log (append entries below)

* **2025-10-24** — Phase 1 baseline captured: schema, RLS, `/api/register`, `/api/tg/webhook`, envs, Telegram ops, UI behavior.
