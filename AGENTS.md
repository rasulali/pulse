# AGENTS.md

**Purpose:** Canonical, LLM-friendly blueprint of Pulse AI’s app, auth, DB, endpoints, and policies.
**Rule:** Keep this file accurate. Update on any change to envs, schema, RLS, routes, or endpoints.

---

## PROJECT

```json
{
  "name": "Pulse AI (Phase 1)",
  "domain_prod": "https://ai.alee.az",
  "runtime": "Next.js 15 (App Router) on Cloudflare (OpenNext)",
  "db": "Supabase Postgres + RLS",
  "bots": ["Telegram bot via webhook"],
  "ui_style": "Neumorphism (soft bg #f3f4f6, inset inputs, rounded-2xl, black CTA)",
  "llms": ["gpt-5", "gpt-5-mini (later: reports)"]
}
````

---

## ENV_VARS

```json
{
  "public": {
    "NEXT_PUBLIC_SUPABASE_URL": "<string>",
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY": "<string>",
    "NEXT_PUBLIC_TELEGRAM_BOT_USERNAME": "PulseJisBot"
  },
  "server_only": {
    "SUPABASE_SECRET_KEY": "<string>",
    "TELEGRAM_BOT_TOKEN": "<string>",
    "TELEGRAM_WEBHOOK_SECRET": "<string>",
    "APIFY_TOKEN": "<string>",
    "APIFY_ACTOR": "curious_coder~linkedin-post-search-scraper",
    "APIFY_MEMORY_MBYTES": "8192",
    "APIFY_DEFAULT_DATASET_URL": "<string?>"
  },
  "notes": [
    "Public keys are client-exposed; server_only keys must never be exposed.",
    "Webhook compares 'x-telegram-bot-api-secret-token' to TELEGRAM_WEBHOOK_SECRET.",
    "APIFY_TOKEN is required for actor runs and dataset fetch.",
    "APIFY_MEMORY_MBYTES=8192 configures 8GB without optional add-ons."
  ]
}
```

---

## UI_ROUTES

```json
{
  "/": {
    "name": "Admin",
    "auth_required": true,
    "navbar_inline": { "left": "Admin", "right": ["user.email", "Logout"] }
  },
  "/login": {
    "name": "Neumorphic Login",
    "auth_required": false,
    "form_fields": ["email", "password"],
    "success_redirect": "/"
  },
  "/register": {
    "name": "Public Telegram onboarding form",
    "creates_supabase_auth_user": false
  }
}
```

---

## AUTH_ROUTING

```json
{
  "guards": [
    "If unauthenticated and requesting '/': redirect to '/login'.",
    "If authenticated and requesting '/login': redirect to '/'.",
    "If requesting unknown/private routes: redirect to '/'; auth guard re-applies."
  ],
  "impl": "Client-side guards inside pages for Phase 1 (middleware optional later)"
}
```

---

## CLIENT_INIT

```json
{
  "supabase_client": {
    "createClient_args": [
      "process.env.NEXT_PUBLIC_SUPABASE_URL",
      "process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY"
    ],
    "auth_calls": ["auth.getUser()", "auth.signInWithPassword()", "auth.signOut()"]
  }
}
```

---

## API_ENDPOINTS

```json
{
    "/api/links/add": {
        "method": "POST",
        "auth": "server-only (SUPABASE_SECRET_KEY)",
        "input": {
            "url": "string"
        },
        "effect": "Insert linkedin.allowed=false"
    },
    "/api/links/bulk": {
        "method": "POST",
        "auth": "server-only",
        "input": "text/plain (one URL per line)",
        "effect": "Upsert many into linkedin.allowed=false"
    },
    "/api/links/toggle": {
        "method": "POST",
        "auth": "server-only",
        "input": {
            "id": "number",
            "next": "boolean"
        },
        "effect": "Set allowed to next"
    },
    "/api/links/delete": {
        "method": "POST",
        "auth": "server-only",
        "input": {
            "id": "number"
        },
        "effect": "Delete one linkedin row"
    },
    "/api/links/delete-all": {
        "method": "POST",
        "auth": "server-only",
        "input": {
            "scope": "allowed | not_allowed | all"
        },
        "effect": "Bulk delete with WHERE by scope"
    },
    "/api/links/allow-all": {
        "method": "POST",
        "auth": "server-only",
        "input": "none",
        "effect": "Set allowed=true where allowed=false"
    },
    "/api/links/refresh": {
        "method": "POST",
        "auth": "server-only",
        "effect": "Run APIFY actor with 8GB; limitPerSource=1; urls from linkedin.allowed=true"
    },
    "/api/links/refresh-one": {
        "method": "POST",
        "auth": "server-only",
        "input": {
            "id": "number"
        },
        "effect": "Run actor for a single linkedin.url"
    },
    "/api/links/refresh-from-dataset": {
        "method": "POST",
        "auth": "server-only",
        "input": {
            "datasetUrl?": "string"
        },
        "effect": "Pull results from dataset (datasetUrl or APIFY_DEFAULT_DATASET_URL)"
    },
    "/api/register": {
        "method": "POST",
        "auth": "server-only (service role via SUPABASE_SECRET_KEY)",
        "input": {
            "email": "string",
            "firstName": "string?",
            "lastName": "string?",
            "industryIds": "number[] (bigint[])",
            "signalIds": "number[] (bigint[])"
        },
        "process": [
            "Validate payload; normalize email lower/trim",
            "Check duplicate by lower(email)",
            "Insert users row with generated telegram_start_token",
            "Return Telegram deep link = https://t.me/${NEXT_PUBLIC_TELEGRAM_BOT_USERNAME}?start=${token}"
        ],
        "success": {
            "telegramLink": "string"
        },
        "errors": [
            "409 user exists",
            "400 validation",
            "500 db failure"
        ],
        "notes": [
            "Does NOT create a Supabase auth user"
        ]
    },
    "/api/tg/webhook": {
        "method": "POST",
        "security": "header x-telegram-bot-api-secret-token === TELEGRAM_WEBHOOK_SECRET",
        "input": "Telegram Update object; expects '/start <token>' in message/edited_message",
        "logic": [
            "Extract chat.id + token",
            "Lookup users by telegram_start_token (service role)",
            "Update telegram_chat_id = chat.id",
            "Send confirmation message via sendMessage"
        ],
        "success": {
            "ok": true
        },
        "errors": [
            "403 forbidden (bad secret)",
            "400 invalid token",
            "404 token not found"
        ]
    }
}
```

---

## RLS_POLICIES (SPEC)

```json
{
  "model": "All authenticated Supabase users are admins with FULL CRUD on industries/signals/users. Anonymous users may SELECT industries/signals where visible = true.",
  "anon": {
    "industries": "SELECT where visible = true",
    "signals": "SELECT where visible = true",
    "users": "no access"
  },
  "authenticated": {
    "industries": "SELECT/INSERT/UPDATE/DELETE",
    "signals": "SELECT/INSERT/UPDATE/DELETE",
    "users": "SELECT/INSERT/UPDATE/DELETE"
  }
}
```

### RLS_POLICIES_SQL (idempotent; execute in Supabase SQL editor)

```sql
alter table public.linkedin       enable row level security;
alter table public.scraper_input  enable row level security;

create policy if not exists linkedin_crud_authed
on public.linkedin for all
to authenticated
using (true) with check (true);

create policy if not exists scraper_input_crud_authed
on public.scraper_input for all
to authenticated
using (true) with check (true);

-- Enable RLS
alter table public.industries enable row level security;
alter table public.signals    enable row level security;
alter table public.users      enable row level security;

-- Public read for industries/signals (visible = true)
create policy if not exists "public read (categories)"
on public.industries for select
to anon, authenticated
using (visible = true);

create policy if not exists "public read (signals)"
on public.signals for select
to anon, authenticated
using (visible = true);

-- FULL CRUD for authenticated (admins) on industries
create policy if not exists industries_select_authed
on public.industries for select
to authenticated using (true);

create policy if not exists industries_insert_authed
on public.industries for insert
to authenticated with check (true);

create policy if not exists industries_update_authed
on public.industries for update
to authenticated using (true) with check (true);

create policy if not exists industries_delete_authed
on public.industries for delete
to authenticated using (true);

-- FULL CRUD for authenticated (admins) on signals
create policy if not exists signals_select_authed
on public.signals for select
to authenticated using (true);

create policy if not exists signals_insert_authed
on public.signals for insert
to authenticated with check (true);

create policy if not exists signals_update_authed
on public.signals for update
to authenticated using (true) with check (true);

create policy if not exists signals_delete_authed
on public.signals for delete
to authenticated using (true);

-- FULL CRUD for authenticated (admins) on users (forum-like records)
create policy if not exists users_select_authed
on public.users for select
to authenticated using (true);

create policy if not exists users_insert_authed
on public.users for insert
to authenticated with check (true);

create policy if not exists users_update_authed
on public.users for update
to authenticated using (true) with check (true);

create policy if not exists users_delete_authed
on public.users for delete
to authenticated using (true);
```

---

## SQL_SCHEMAS

### INTERPRETED_SCHEMA (machine-readable)

```json
{
    "tables": [
        {
            "schema": "public",
            "name": "linkedin",
            "columns": [
                {
                    "name": "id",
                    "type": "bigint",
                    "identity": "always",
                    "not_null": true
                },
                {
                    "name": "url",
                    "type": "text",
                    "not_null": true,
                    "unique": true
                },
                {
                    "name": "name",
                    "type": "text",
                    "not_null": false
                },
                {
                    "name": "occupation",
                    "type": "text",
                    "not_null": false
                },
                {
                    "name": "headline",
                    "type": "text",
                    "not_null": false
                },
                {
                    "name": "allowed",
                    "type": "boolean",
                    "not_null": true,
                    "default": "false"
                },
                {
                    "name": "created_at",
                    "type": "timestamptz",
                    "default": "now()"
                },
                {
                    "name": "updated_at",
                    "type": "timestamptz",
                    "default": "now()"
                }
            ],
            "primary_key": [
                "id"
            ],
            "indexes": [
                "linkedin_url_key (unique)"
            ]
        },
        {
            "schema": "public",
            "name": "scraper_input",
            "columns": [
                {
                    "name": "id",
                    "type": "bigint",
                    "identity": "always",
                    "not_null": true
                },
                {
                    "name": "cookie_default",
                    "type": "jsonb",
                    "not_null": true
                },
                {
                    "name": "limit_per_source",
                    "type": "int4",
                    "not_null": true,
                    "default": "1"
                },
                {
                    "name": "deep_scrape",
                    "type": "boolean",
                    "not_null": true,
                    "default": "false"
                },
                {
                    "name": "raw_data",
                    "type": "boolean",
                    "not_null": true,
                    "default": "false"
                },
                {
                    "name": "min_delay",
                    "type": "int4",
                    "not_null": true,
                    "default": "2"
                },
                {
                    "name": "max_delay",
                    "type": "int4",
                    "not_null": true,
                    "default": "8"
                },
                {
                    "name": "proxy",
                    "type": "jsonb",
                    "not_null": true,
                    "default": "{\"useApifyProxy\":true,\"apifyProxyGroups\":[\"RESIDENTIAL\"],\"apifyProxyCountry\":\"AZ\"}"
                },
                {
                    "name": "user_agent",
                    "type": "text",
                    "not_null": true,
                    "default": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36"
                },
                {
                    "name": "created_at",
                    "type": "timestamptz",
                    "default": "now()"
                },
                {
                    "name": "updated_at",
                    "type": "timestamptz",
                    "default": "now()"
                }
            ],
            "primary_key": [
                "id"
            ]
        },
        {
            "schema": "public",
            "name": "industries",
            "columns": [
                {
                    "name": "id",
                    "type": "bigint",
                    "identity": "always",
                    "not_null": true
                },
                {
                    "name": "name",
                    "type": "text",
                    "not_null": true
                },
                {
                    "name": "visible",
                    "type": "boolean",
                    "not_null": true
                }
            ],
            "primary_key": [
                "id"
            ]
        },
        {
            "schema": "public",
            "name": "signals",
            "columns": [
                {
                    "name": "id",
                    "type": "bigint",
                    "identity": "always",
                    "not_null": true
                },
                {
                    "name": "name",
                    "type": "text",
                    "not_null": true
                },
                {
                    "name": "visible",
                    "type": "boolean",
                    "not_null": true
                },
                {
                    "name": "prompt",
                    "type": "text",
                    "not_null": true,
                    "default": "''::text"
                }
            ],
            "primary_key": [
                "id"
            ]
        },
        {
            "schema": "public",
            "name": "users",
            "columns": [
                {
                    "name": "id",
                    "type": "bigint",
                    "not_null": true,
                    "default": "nextval('users_id_seq'::regclass)"
                },
                {
                    "name": "email",
                    "type": "text",
                    "not_null": true
                },
                {
                    "name": "first_name",
                    "type": "text",
                    "not_null": false
                },
                {
                    "name": "last_name",
                    "type": "text",
                    "not_null": false
                },
                {
                    "name": "industry_ids",
                    "type": "ARRAY",
                    "element_type_hint": "bigint",
                    "not_null": true
                },
                {
                    "name": "signal_ids",
                    "type": "ARRAY",
                    "element_type_hint": "bigint",
                    "not_null": true
                },
                {
                    "name": "telegram_start_token",
                    "type": "text",
                    "not_null": true
                },
                {
                    "name": "telegram_chat_id",
                    "type": "bigint",
                    "not_null": false
                },
                {
                    "name": "created_at",
                    "type": "timestamptz",
                    "not_null": false,
                    "default": "now()"
                }
            ],
            "primary_key": [
                "id"
            ],
            "notes": [
                "industry_ids/signal_ids are intended as bigint[]; RAW_DDL currently shows generic ARRAY."
            ]
        }
    ]
}
```

**Run/monitor flow**

- `refresh`/`refresh-one`: start APIFY run (`APIFY_ACTOR`), memory = `APIFY_MEMORY_MBYTES`.
- On completion or dataset-read, each item is normalized and used to **update** the matching `linkedin.url` row.

------

## SCRAPER EXTRACTION RULES (occupation/headline/name)

```json
{
  "source_fields": {
    "occupation_candidates": [
      "author.occupation",
      "activityOfUser.occupation",
      "activityDescription.occupation"
    ],
    "headline_candidate": "authorHeadline",
    "name_candidates": ["authorName", "authorFullName", "author.firstName + ' ' + author.lastName"]
  },
  "validation": {
    "alpha_regex": "[A-Za-z\\u00C0-\\u024F\\u0400-\\u04FF]",
    "occupation_first": true,
    "headline_second": true,
    "one_or_the_other_never_both": true,
    "flag_when_missing_or_non_alpha": true
  },
  "persistence": {
    "if_valid_occupation":   { "occupation": "<value>", "headline": null },
    "else_if_valid_headline":{ "occupation": null,       "headline": "<value>" },
    "else":                  { "occupation": null,       "headline": null, "allowed_hint": "stay or move to not allowed" },
    "always_store_name":     true
  }
}
```

------

## FRONTEND BEHAVIOR (admin page summary)

```json
{
  "lists": {
    "allowed": "linkedin.allowed = true, sorted by name; items with missing secondary text (occupation/headline) float to top with orange flag",
    "not_allowed": "linkedin.allowed = false"
  },
  "actions": {
    "per_item": ["Refresh one", "Move -> / <-", "Open profile (name is a link)", "Delete one"],
    "bulk": ["Add single URL", "Upload text file (one URL per line)", "Allow All (send all)", "Delete All (allowed | not_allowed | all)"],
    "refresh_all": {
      "confirm_modal": true,
      "freeze_tables_while_running": true,
      "cancel_supported": true,
      "dataset_mode_switch": "uses refresh-from-dataset when configured"
    }
  }
}
```

------

### RAW_DDL (context only; do not execute)

```sql
-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.industries (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  name text NOT NULL,
  visible boolean NOT NULL,
  CONSTRAINT industries_pkey PRIMARY KEY (id)
);
CREATE TABLE public.signals (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  name text NOT NULL,
  visible boolean NOT NULL,
  prompt text NOT NULL DEFAULT ''::text,
  CONSTRAINT signals_pkey PRIMARY KEY (id)
);
CREATE TABLE public.users (
  id bigint NOT NULL DEFAULT nextval('users_id_seq'::regclass),
  email text NOT NULL,
  first_name text,
  last_name text,
  industry_ids ARRAY NOT NULL,
  signal_ids ARRAY NOT NULL,
  telegram_start_token text NOT NULL,
  telegram_chat_id bigint,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT users_pkey PRIMARY KEY (id)
);
```

---

## ARTIFACTS

```json
{
  "indexes": {
    "path": "artifacts/indexes.json",
    "source_query": "INDEXES_JSON_DEEP_NO_CONSTRAINTS",
    "description": "Non-constraint indexes only (e.g., users_email_lower_idx)."
  },
  "constraints": {
    "path": "artifacts/constraints.json",
    "source_query": "CONSTRAINTS_JSON (PK + UNIQUE)",
    "description": "Primary/Unique constraints with schema-qualified DDL."
  }
}
```

---

## FILES_OF_INTEREST

```json
{
  "app": [
    "src/app/page.tsx",
    "src/app/login/page.tsx",
    "src/app/register/page.tsx",
    "src/app/api/register/route.ts",
    "src/app/api/tg/webhook/route.ts",
    "src/app/layout.tsx",
    "src/app/globals.css"
  ],
  "config": [
    "open-next.config.ts",
    "next.config.ts",
    "wrangler.jsonc",
    "tsconfig.json",
    "cloudflare-env.d.ts",
    "postcss.config.mjs"
  ],
  "public": ["public/_headers"],
  "docs": ["AGENTS.md"]
}
```

---

## TELEGRAM_OPS

```bash
# Set webhook (prod)
curl -sS -X POST "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://ai.alee.az/api/tg/webhook","secret_token":"'"$TELEGRAM_WEBHOOK_SECRET"'"}'

# Verify
curl -sS "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/getWebhookInfo"

# Remove
curl -sS "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/deleteWebhook"
```

---

## RPC_FUNCTIONS

```json
{
  "status": "no functions yet"
}
```
