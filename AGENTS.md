# AGENTS.md

**Purpose:** Canonical, LLM-friendly blueprint of Pulse AI's app, auth, DB, endpoints, and policies.
**Rule:** Keep this file accurate. Update on any change to envs, schema, RLS, routes, or endpoints.

**Current Status**: Pipeline fully implemented and tested end-to-end on localhost. All 7 endpoints operational. Ready for production deployment.

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
    "OPENAI_API_KEY": "<string>",
    "PINECONE_API_KEY": "<string>",
    "PINECONE_INDEX_NAME": "pulse-linkedin"
  },
  "notes": [
    "Public keys are client-exposed; server_only keys must never be exposed.",
    "Webhook compares 'x-telegram-bot-api-secret-token' to TELEGRAM_WEBHOOK_SECRET.",
    "APIFY_TOKEN is required for actor runs and dataset fetch.",
    "Apify memory allocation (MB) configured in config.memory_mbytes table field (default: 512).",
    "OPENAI_API_KEY used for embeddings (text-embedding-3-small) and message generation (gpt-5-mini).",
    "PINECONE_API_KEY and PINECONE_INDEX_NAME for vector storage (1536 dims, single namespace).",
    "CRITICAL: Pinecone metadata arrays must be strings, not numbers. industry_ids stored as string[] via .map(String).",
    "Rerank feature removed: Node.js SDK v6 doesn't support it. Using semantic search with topK=10."
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
            "url": "string",
            "industry_ids": "number[]"
        },
        "effect": "Insert linkedin.allowed=false with industry_ids"
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
        "effect": "Run APIFY actor sync with 8GB; uses config table settings",
        "notes": [
            "Normalizes scraped name/occupation/headline text (NFKC, zero-width removed, whitespace collapsed) before validating characters",
            "Sets occupation/headline only when the normalized strings contain readable characters (rx test); occupation takes precedence over headline for allowed flag"
        ]
    },
    "/api/links/refresh-one": {
        "method": "POST",
        "auth": "server-only",
        "input": {
            "id": "number"
        },
        "effect": "Run actor sync for a single linkedin.url",
        "notes": [
            "Applies same normalized text validation as /api/links/refresh prior to updating occupation/headline/allowed"
        ]
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
    },
    "/api/scrape/verify-and-run": {
        "method": "POST",
        "auth": "server-only",
        "input": "none",
        "process": [
            "Fetch config singleton",
            "Fetch industries WHERE visible=true; bail if none",
            "Fetch linkedin WHERE allowed=true AND industry_ids intersect visible industries",
            "Build Apify payload with filtered profile URLs",
            "Start ASYNC Apify run (returns run_id immediately)",
            "Create pipeline_jobs row with status='scraping', apify_run_id"
        ],
        "output": {
            "ok": true,
            "apify_run_id": "string"
        },
        "notes": ["Does NOT wait for completion; polling done by /api/scrape/check-apify"]
    },
    "/api/scrape/check-apify": {
        "method": "POST",
        "auth": "server-only",
        "input": "none",
        "process": [
            "Get current pipeline_jobs row with status='scraping'",
            "Check Apify run status via API",
            "If SUCCEEDED: fetch dataset, count items, update status='processing'",
            "If RUNNING: do nothing",
            "If FAILED: increment retry_count or set status='failed'"
        ],
        "output": {
            "ok": true,
            "status": "SUCCEEDED | RUNNING | FAILED",
            "total_items": "number?"
        }
    },
    "/api/scrape/process-posts": {
        "method": "POST",
        "auth": "server-only",
        "input": {
            "batch_offset": "number",
            "batch_size": "number (default: 10)"
        },
        "process": [
            "Fetch items from Apify dataset (batch_offset, batch_size)",
            "For each item:",
            "  - Extract profile URL, find linkedin profile",
            "  - Extract occupation/headline with fallbacks; normalize (NFKC, remove zero-width, collapse whitespace)",
            "  - Verify: if profile.occupation exists, compare normalized strings; if profile.headline exists, compare normalized strings",
            "  - If mismatch: set allowed=false, capture unverified_reason/details/unverified_at (diff + run metadata), skip",
            "  - Check URN exists in posts (deduplicate)",
            "  - Filter posts older than 24h",
            "  - Clean text (emojis, control chars, whitespace)",
            "  - Extract name with fallbacks",
            "  - Insert into posts with industry_ids from profile",
            "Update pipeline_jobs: increment current_batch_offset",
            "If done (offset >= total_items): set status='vectorizing', reset offset"
        ],
        "output": {
            "ok": true,
            "inserted": "number",
            "skipped": "number"
        }
    },
    "/api/scrape/vectorize": {
        "method": "POST",
        "auth": "server-only",
        "input": {
            "batch_offset": "number",
            "batch_size": "number (default: 10)"
        },
        "process": [
            "If batch_offset=0: delete all Pinecone vectors (namespace='default')",
            "Fetch posts WHERE created_at >= now()-24h LIMIT batch_size OFFSET batch_offset",
            "Generate embeddings via OpenAI (text-embedding-3-small, 1536 dims)",
            "Build vectors with metadata: {industry_ids, text}",
            "Upsert to Pinecone namespace='default'",
            "Update pipeline_jobs: increment current_batch_offset",
            "If done: set status='generating', reset offset"
        ],
        "output": {
            "ok": true,
            "vectorized": "number"
        }
    },
    "/api/signals/generate": {
        "method": "POST",
        "auth": "server-only",
        "input": {
            "batch_offset": "number"
        },
        "process": [
            "Fetch industries WHERE visible=true",
            "Fetch signals WHERE visible=true",
            "Calculate pair at batch_offset: industryIdx = floor(offset/signals.length), signalIdx = offset%signals.length",
            "Generate embedding from signal.embedding_query",
            "Query Pinecone: vector=embedding, topK=10, filter={industry_ids: {$in: [String(industry.id)]}}",
            "NOTE: industry.id converted to string for Pinecone metadata compatibility",
            "Format context from results",
            "Call GPT-5-mini with signal.prompt as system prompt + userMessage",
            "Insert message into messages table",
            "Update pipeline_jobs: increment current_batch_offset",
            "If done (offset >= total_pairs): set status='sending', count recipients (admins only when config.debug = true), reset offset"
        ],
        "output": {
            "ok": true,
            "generated": 1
        }
    },
    "/api/admin/industries": {
        "method": "GET | POST",
        "auth": "server-only",
        "actions": {
            "GET": "Fetch all industries",
            "create": "Insert new industry with name & visible",
            "update": "Update industry by id",
            "delete": "Delete industry by id",
            "toggle-visible": "Toggle visible field for industry"
        }
    },
    "/api/admin/signals": {
        "method": "GET | POST",
        "auth": "server-only",
        "actions": {
            "GET": "Fetch all signals",
            "create": "Insert new signal with name, visible, prompt, embedding_query",
            "update": "Update signal by id",
            "delete": "Delete signal by id",
            "toggle-visible": "Toggle visible field for signal"
        }
    },
    "/api/admin/users": {
        "method": "GET | POST",
        "auth": "server-only",
        "actions": {
            "GET": "Fetch all users with is_admin flag (from pipeline_jobs.admin_chat_ids)",
            "delete": "Delete user by id",
            "toggle-admin": "Add/remove user's telegram_chat_id from pipeline_jobs.admin_chat_ids"
        }
    },
    "/api/admin/config": {
        "method": "GET | POST",
        "auth": "server-only",
        "input": {
            "limit_per_source": "number (optional)",
            "cookie_default": "jsonb (optional)",
            "memory_mbytes": "number (optional)",
            "debug": "boolean (optional)"
        },
        "effect": "Update config singleton; only provided fields are updated"
    },
    "/api/admin/jobs": {
        "method": "POST",
        "auth": "server-only",
        "status": "PENDING - Not yet implemented",
        "actions": {
            "pause": "Set job status='paused', preserve previous_status for resume",
            "resume": "Restore job to previous_status, continue from current_batch_offset",
            "cancel": "Set job status='cancelled', terminal state"
        },
        "input": {
            "action": "pause | resume | cancel",
            "job_id": "number"
        },
        "notes": [
            "Paused jobs are skipped by cron/advance",
            "Resume restores the job to its pre-pause state",
            "Cancel is a terminal state, job cannot be resumed",
            "May require adding 'previous_status' column to pipeline_jobs table"
        ]
    },
    "/api/telegram/send-batch": {
        "method": "POST",
        "auth": "server-only",
        "input": {
            "batch_offset": "number",
            "batch_size": "number (default: 10)"
        },
        "process": [
            "Fetch today's messages",
            "Fetch recipients with telegram_chat_id (admins only when config.debug = true) LIMIT batch_size OFFSET batch_offset",
            "Sync pipeline_jobs.total_items with current recipient count",
            "For each user: filter messages by industry_ids AND signal_ids",
            "Send via Telegram API with parse_mode='HTML'",
            "Update pipeline_jobs: increment current_batch_offset",
            "If done: set status='completed'"
        ],
        "output": {
            "ok": true,
            "sent": "number"
        }
    },
    "/api/cron/advance": {
        "method": "POST",
        "auth": "Cloudflare Cron Trigger",
        "schedule": "*/5 * * * * (every 5 minutes)",
        "process": [
            "Get active pipeline_jobs row (status NOT IN ['completed', 'failed'])",
            "If none exists AND hour=4: create new job with status='idle'",
            "Switch on job.status:",
            "  - 'idle': call /api/scrape/verify-and-run",
            "  - 'scraping': call /api/scrape/check-apify",
            "  - 'processing': call /api/scrape/process-posts with batch params",
            "  - 'vectorizing': call /api/scrape/vectorize with batch params",
            "  - 'generating': call /api/signals/generate with batch params",
            "  - 'sending': call /api/telegram/send-batch with batch params",
            "On error: increment retry_count; if >= max_retries: set status='failed', notify admins via Telegram"
        ],
        "output": {
            "ok": true,
            "current_status": "string",
            "progress": "string (e.g., '30/150')"
        }
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
alter table public.linkedin                enable row level security;
alter table public.config                  enable row level security;
alter table public.posts                   enable row level security;
alter table public.messages                enable row level security;

create policy if not exists linkedin_crud_authed
on public.linkedin for all
to authenticated
using (true) with check (true);

create policy if not exists config_crud_authed
on public.config for all
to authenticated
using (true) with check (true);

create policy if not exists posts_crud_authed
on public.posts for all
to authenticated
using (true) with check (true);

create policy if not exists messages_crud_authed
on public.messages for all
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
                    "name": "industry_ids",
                    "type": "ARRAY",
                    "element_type_hint": "bigint",
                    "not_null": true,
                    "default": "'{}'::bigint[]"
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
                },
                {
                    "name": "unverified_reason",
                    "type": "text",
                    "not_null": false,
                    "description": "Human-readable reason why profile was unverified (e.g., 'Occupation mismatch')"
                },
                {
                    "name": "unverified_details",
                    "type": "jsonb",
                    "not_null": false,
                    "description": "Structured data showing what changed (stored vs scraped values, run metadata)"
                },
                {
                    "name": "unverified_at",
                    "type": "timestamptz",
                    "not_null": false,
                    "description": "Timestamp when the pipeline flipped allowed=false"
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
            "name": "config",
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
                    "not_null": true,
                    "default": "[]::jsonb"
                },
                {
                    "name": "limit_per_source",
                    "type": "int4",
                    "not_null": true,
                    "default": "2"
                },
                {
                    "name": "user_agent",
                    "type": "text",
                    "not_null": true,
                    "default": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36"
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
                    "name": "proxy",
                    "type": "jsonb",
                    "not_null": true,
                    "default": "{\"useApifyProxy\": true, \"apifyProxyGroups\": [\"RESIDENTIAL\"], \"apifyProxyCountry\": \"AZ\"}"
                },
                {
                    "name": "memory_mbytes",
                    "type": "int4",
                    "not_null": true,
                    "default": "512",
                    "description": "Memory allocation in MB for Apify actor runs"
                },
                {
                    "name": "debug",
                    "type": "boolean",
                    "not_null": true,
                    "default": "false",
                    "description": "When true, Telegram pipeline sends only to admins"
                },
                {
                    "name": "singleton",
                    "type": "boolean",
                    "not_null": true,
                    "default": "true",
                    "unique": true
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
            "name": "posts",
            "columns": [
                {
                    "name": "id",
                    "type": "bigint",
                    "identity": "always",
                    "not_null": true
                },
                {
                    "name": "urn",
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
                    "name": "text",
                    "type": "text",
                    "not_null": true
                },
                {
                    "name": "posted_at",
                    "type": "timestamptz",
                    "not_null": true
                },
                {
                    "name": "industry_ids",
                    "type": "ARRAY",
                    "element_type_hint": "bigint",
                    "not_null": true,
                    "default": "'{}'::bigint[]"
                },
                {
                    "name": "source_url",
                    "type": "text",
                    "not_null": false,
                    "description": "URL of the LinkedIn post (original or repost)"
                },
                {
                    "name": "author_url",
                    "type": "text",
                    "not_null": false,
                    "description": "URL of the LinkedIn profile we scraped this post from"
                },
                {
                    "name": "created_at",
                    "type": "timestamptz",
                    "default": "now()"
                }
            ],
            "primary_key": [
                "id"
            ],
            "indexes": [
                "posts_urn_key (unique)",
                "posts_posted_at_idx",
                "posts_industry_ids_idx (gin)"
            ]
        },
        {
            "schema": "public",
            "name": "messages",
            "columns": [
                {
                    "name": "id",
                    "type": "bigint",
                    "identity": "always",
                    "not_null": true
                },
                {
                    "name": "industry_id",
                    "type": "bigint",
                    "not_null": true
                },
                {
                    "name": "signal_id",
                    "type": "bigint",
                    "not_null": true
                },
                {
                    "name": "message_text",
                    "type": "text",
                    "not_null": true
                },
                {
                    "name": "delivered_user_ids",
                    "type": "ARRAY",
                    "element_type_hint": "bigint",
                    "not_null": true,
                    "default": "'{}'::bigint[]",
                    "description": "REQUIRED: Track which users received this message to prevent duplicate sends"
                },
                {
                    "name": "created_at",
                    "type": "timestamptz",
                    "default": "now()"
                }
            ],
            "primary_key": [
                "id"
            ],
            "indexes": [
                "messages_created_at_idx",
                "messages_industry_signal_idx"
            ],
            "foreign_keys": [
                {
                    "column": "industry_id",
                    "references": "public.industries(id)"
                },
                {
                    "column": "signal_id",
                    "references": "public.signals(id)"
                }
            ]
        },
        {
            "schema": "public",
            "name": "pipeline_jobs",
            "columns": [
                {
                    "name": "id",
                    "type": "bigint",
                    "identity": "always",
                    "not_null": true
                },
                {
                    "name": "status",
                    "type": "text",
                    "not_null": true,
                    "default": "idle"
                },
                {
                    "name": "apify_run_id",
                    "type": "text",
                    "not_null": false
                },
                {
                    "name": "current_batch_offset",
                    "type": "int4",
                    "not_null": false,
                    "default": "0"
                },
                {
                    "name": "total_items",
                    "type": "int4",
                    "not_null": false,
                    "default": "0"
                },
                {
                    "name": "error_message",
                    "type": "text",
                    "not_null": false
                },
                {
                    "name": "retry_count",
                    "type": "int4",
                    "not_null": false,
                    "default": "0"
                },
                {
                    "name": "max_retries",
                    "type": "int4",
                    "not_null": false,
                    "default": "3"
                },
                {
                    "name": "admin_chat_ids",
                    "type": "ARRAY",
                    "element_type_hint": "bigint",
                    "not_null": true,
                    "default": "'{}'::bigint[]"
                },
                {
                    "name": "started_at",
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
            "notes": [
                "Tracks daily pipeline state machine progress with batching support",
                "Status values: 'idle', 'scraping', 'processing', 'vectorizing', 'generating', 'sending', 'completed', 'failed', 'paused' (future), 'cancelled' (future)",
                "admin_chat_ids: Telegram chat IDs to notify on pipeline failure"
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
                },
                {
                    "name": "embedding_query",
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

------

## AUTOMATED DAILY PIPELINE

**Cloudflare Cron Schedule**: `*/5 * * * *` (every 5 minutes)

**Orchestrator**: `/api/cron/advance`

**State Machine Flow**:

```
idle → scraping → processing → vectorizing → generating → sending → completed
  ↓        ↓           ↓            ↓            ↓           ↓
failed ←---+----+------+------------+------------+-----------+
  ↓        ↓           ↓            ↓            ↓           ↓
paused ←---+----+------+------------+------------+-----------+ (future: can resume to previous state)
  ↓        ↓           ↓            ↓            ↓           ↓
cancelled ←+----+------+------------+------------+-----------+ (future: terminal state)
```

**Pipeline Stages**:

1. **idle** (04:00 UTC trigger)
   - Creates new pipeline_jobs row
   - Transitions to: scraping

2. **scraping** (async Apify)
   - Starts Apify run (does not wait)
   - Polls every 5 min until complete
   - Batch size: N/A
   - Transitions to: processing

3. **processing** (batch: 10 posts)
   - Verifies profiles (occupation/headline exact match)
   - Deduplicates by URN
   - Filters posts older than 24h
   - Cleans text, inserts into posts table
   - Transitions to: vectorizing

4. **vectorizing** (batch: 10 posts)
   - Deletes old Pinecone vectors (first batch only)
   - Generates OpenAI embeddings (text-embedding-3-small, 1536 dims)
   - Upserts to Pinecone namespace='default'
   - Metadata: {industry_ids: string[], text: string, source_url: string, author_url: string, name: string}
   - CRITICAL: industry_ids converted to strings via .map(String)
   - Transitions to: generating

5. **generating** (batch: 1 message)
   - For each (industry, signal) pair:
     - Generates embedding from signal.embedding_query
     - Queries Pinecone with semantic search (topK=10)
     - Filter: industry_ids contains String(industry_id)
     - Formats context with URLs: TEXT, AUTHOR, AUTHOR_URL, SOURCE_URL per post
     - Calls GPT-5-mini to generate message with structured context
     - GPT output includes: clickable author names, "Sources:" section with post links
     - Inserts HTML-formatted message into messages table
   - NOTE: Rerank removed (Node.js SDK v6 doesn't support it)
   - Transitions to: sending

6. **sending** (batch: 10 users)
   - Fetches today's messages
   - Filters messages by user's industry_ids AND signal_ids
   - Sends via Telegram API (parse_mode: HTML)
   - Transitions to: completed

**Error Handling**:

- Retry logic: max 3 retries per step
- On failure: increments retry_count
- If retry_count >= max_retries:
  - Sets status='failed'
  - Notifies admin_chat_ids via Telegram

**Manual Trigger**:

- Admin panel button "Run Daily Pipeline"
- Calls `/api/scrape/verify-and-run` directly
- Bypasses 04:00 UTC schedule

**Testing Script**:

- `run-pipeline.sh` - Interactive localhost testing
- Displays SQL reset command and copies to clipboard
- Loops calling `/api/cron/advance` every 2 seconds
- Shows colored output with status and progress

**Known Issues & Fixes Applied**:

1. **Pinecone metadata type error** (CRITICAL)
   - Issue: Pinecone only supports string[], not number[] in metadata
   - Fix: Convert industry_ids to strings: `(post.industry_ids || []).map(String)`
   - Applied in: vectorize/route.ts and signals/generate/route.ts

2. **Pinecone rerank not supported**
   - Issue: Node.js SDK v6 doesn't support rerank parameter
   - Fix: Removed rerank, using semantic search with topK=10
   - Applied in: signals/generate/route.ts

3. **Source Attribution in Messages**
   - Feature: Messages now include clickable source links
   - Posts table stores source_url (post link) and author_url (profile link)
   - For reposts: author_url = reposter's profile (inputUrl), source_url = repost link
   - Pinecone metadata includes: text, industry_ids, source_url, author_url, name
   - GPT receives structured context with URLs and generates HTML links
   - Message format: author names as <a> links, "Sources:" section at bottom

4. **Telegram webhook registration**
   - Issue: Setting telegram_start_token=null failed (NOT NULL column)
   - Fix: Removed null assignment, only update telegram_chat_id
   - Applied in: tg/webhook/route.ts

5. **Supabase .not() query syntax**
   - Issue: `.not("status", "in", ["completed", "failed"])` threw PGRST100 error
   - Fix: Changed to `.not("status", "in", "(completed,failed)")`
   - Applied in: page.tsx and cron/advance/route.ts

6. **Refresh endpoints timeout on production** (PENDING FIX)
   - Issue: /api/links/refresh and /api/links/refresh-one use sync Apify runs (run-sync-get-dataset-items)
   - Problem: Sync runs wait for Apify completion, causing serverless function timeouts (25-30s limit)
   - Current behavior: Pipeline uses async runs (/runs endpoint) with polling, which works fine
   - Required fix: Convert refresh endpoints to use async Apify runs with either:
     - Option 1: Backend polling with timeout (25s max)
     - Option 2: Reuse pipeline_jobs system with frontend polling
     - Option 3: Hybrid approach (try sync first, fallback to async)
   - Affected endpoints: /api/links/refresh, /api/links/refresh-one
   - Status: Documented, not yet implemented

7. **Race condition in message generation** (FIXED)
   - Issue: Multiple cron jobs could generate duplicate messages for same industry-signal pair
   - Root cause: GPT API calls take 10-30s; next cron job starts before offset is updated
   - Fix: Update current_batch_offset BEFORE calling GPT (optimistic lock)
   - Applied in: signals/generate/route.ts:205-214
   - Result: Each offset processed exactly once, no duplicates

8. **Telegram message bombardment** (FIXED)
   - Issue: Users received same messages repeatedly every cron run
   - Root cause: No tracking of which messages were delivered to which users
   - Fix: Added delivered_user_ids column to messages table (bigint[])
   - Implementation:
     - Filter out already-delivered messages before sending (send-batch/route.ts:91)
     - Record user_id after successful send (send-batch/route.ts:115-121)
     - Initialize empty array when creating messages (generate/route.ts:302)
   - Applied in: telegram/send-batch/route.ts, signals/generate/route.ts
   - Database migration required: ALTER TABLE messages ADD COLUMN delivered_user_ids int8[] DEFAULT '{}'
   - Result: Each user receives each message exactly once

9. **Add Language option** (PENDING UPDATE)
10. **Add Signal changing option after registration** (PENDING UPDATE)
11. **Add Job Control (Pause/Cancel)** (PENDING UPDATE)
   - Feature: Admin dashboard controls to pause or cancel running pipeline jobs
   - Implementation: Add pause/cancel buttons in admin UI next to job status
   - Backend: New endpoint /api/admin/jobs with actions: pause, resume, cancel
   - Job states: Add 'paused' and 'cancelled' statuses to pipeline_jobs
   - Behavior:
     - Pause: Set status='paused', cron advance skips paused jobs
     - Resume: Restore previous status (scraping/processing/etc), continue from current_batch_offset
     - Cancel: Set status='cancelled', stop all processing
   - Use cases: Stop runaway jobs, debug issues, manually control pipeline timing

12. **Profile unverification tracking & diff** (COMPLETED)
    - Pipeline writes `unverified_reason`, `unverified_details`, and `unverified_at` whenever occupation/headline mismatches are detected (includes stored vs scraped values, run ID, dataset index).
    - Admin dashboard renders a git-style diff between stored and scraped values plus run metadata (e.g., "31 Oct 2025 · Run xyz") inside the Not Allowed table.
    - Allowing a profile again clears unverification metadata so future mismatches can be tracked cleanly.

------

## SCRAPER EXTRACTION RULES (occupation/headline/name)

```json
{
  "routing_logic": {
    "isActivity_true": {
      "description": "Post is a repost/activity (reposter data available)",
      "name_source": "activityOfUser.firstName + activityOfUser.lastName",
      "occupation_source": "activityOfUser.occupation",
      "headline_source": "IGNORE (not available for reposters)"
    },
    "isActivity_false": {
      "description": "Post is original (author data available)",
      "name_source": "author.firstName + author.lastName",
      "occupation_source": "author.occupation",
      "headline_source": "authorHeadline"
    }
  },
  "validation": {
    "alpha_regex": "[A-Za-z\\u00C0-\\u024F\\u0400-\\u04FF]",
    "occupation_and_headline_independent": true,
    "both_can_be_stored": true,
    "allowed_requires_at_least_one_valid": true
  },
  "persistence": {
    "name": "always store if available",
    "occupation": "store if valid (contains alpha chars), else null",
    "headline": "store if valid (contains alpha chars) AND isActivity=false, else null",
    "allowed": "true if (validOccupation OR validHeadline), false otherwise"
  },
  "examples": [
    {
      "case": "isActivity=true, valid occupation",
      "result": { "name": "Gunay Abdulsalamova", "occupation": "Senior corporate customer service...", "headline": null, "allowed": true }
    },
    {
      "case": "isActivity=false, valid occupation AND headline",
      "result": { "name": "Abbas Ibrahimov", "occupation": "CEO / Chairman...", "headline": "CEO / Chairman...", "allowed": true }
    },
    {
      "case": "isActivity=false, occupation invalid, headline valid",
      "result": { "name": "John Doe", "occupation": null, "headline": "Software Engineer", "allowed": true }
    },
    {
      "case": "both invalid",
      "result": { "name": "Jane Doe", "occupation": null, "headline": null, "allowed": false }
    }
  ]
}
```

------

## FRONTEND BEHAVIOR (admin page summary)

```json
{
  "lists": {
    "allowed": "linkedin.allowed = true, sorted by name; items with missing secondary text (occupation/headline) float to top with orange flag",
    "not_allowed": "linkedin.allowed = false; shows an unverification panel with run date/ID and a git diff between stored and scraped values when available"
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
  },
  "admin_config": {
    "layout": "2-column grid: Users (left) | Config/Industries/Signals (right, stacked)",
    "users": {
      "columns": ["Email", "Name", "Chat ID", "Admin badge", "Actions"],
      "actions": ["Toggle Admin (add/remove from pipeline_jobs.admin_chat_ids)", "Delete"]
    },
    "config": {
      "fields": [
        "limit_per_source (number)",
        "memory_mbytes (number)",
        "cookie_default (JSON textarea)",
        "Debug mode toggle (PiPlugs button: amber=Debug/admin-only send, green=Prod/send to all)"
      ],
      "action": "Save Config button (numeric/JSON fields) + instant debug toggle"
    },
    "industries": {
      "columns": ["Name", "Visible toggle button (right-aligned, green when visible)", "Edit", "Delete"],
      "action": "Add Industry button"
    },
    "signals": {
      "columns": ["Name", "Visible toggle button (right-aligned, green when visible)", "Edit", "Delete"],
      "action": "Add Signal button (modal with name, visible, prompt, embedding_query)"
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
  embedding_query text NOT NULL DEFAULT ''::text,
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
  "pipeline": [
    "src/app/api/scrape/verify-and-run/route.ts",
    "src/app/api/scrape/check-apify/route.ts",
    "src/app/api/scrape/process-posts/route.ts",
    "src/app/api/scrape/vectorize/route.ts",
    "src/app/api/signals/generate/route.ts",
    "src/app/api/telegram/send-batch/route.ts",
    "src/app/api/cron/advance/route.ts",
    "src/lib/text.ts"
  ],
  "admin": [
    "src/app/api/admin/industries/route.ts",
    "src/app/api/admin/signals/route.ts",
    "src/app/api/admin/users/route.ts",
    "src/app/api/admin/config/route.ts"
  ],
  "config": [
    "open-next.config.ts",
    "next.config.ts",
    "wrangler.jsonc",
    "tsconfig.json",
    "cloudflare-env.d.ts",
    "postcss.config.mjs"
  ],
  "scripts": [
    "run-pipeline.sh"
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
