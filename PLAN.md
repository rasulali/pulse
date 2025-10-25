# Pulse AI - Daily Pipeline Plan

## STATUS

**Last Updated**: 2025-10-25

### Completed
- ✅ Database migration (`migrations/create_posts_messages_tables.sql`)
  - Renamed `apify_scraper_options` → `config`
  - Created `posts`, `messages`, `pipeline_jobs` tables
  - Added RLS policies
- ✅ Updated existing endpoints to use `config` table
  - `/api/links/refresh`
  - `/api/links/refresh-one`
- ✅ Environment variables documented
  - OpenAI SDK installed
  - Pinecone SDK installed
  - Using Pinecone's native Cohere reranking (no separate API key needed)
- ✅ Complete pipeline architecture designed

### Pending Implementation
- ⏳ `/api/scrape/verify-and-run` - Start async Apify scraping
- ⏳ `/api/scrape/check-apify` - Poll Apify run status
- ⏳ `/api/scrape/process-posts` - Batch post processing (10 posts)
- ⏳ `/api/scrape/vectorize` - Batch vectorization (10 posts)
- ⏳ `/api/signals/generate` - Batch message generation (1 message)
- ⏳ `/api/telegram/send-batch` - Batch Telegram delivery (10 users)
- ⏳ `/api/cron/advance` - Orchestrator (state machine)
- ⏳ Admin panel "Run Pipeline" button
- ⏳ Pipeline status dashboard
- ⏳ Cloudflare cron configuration (`wrangler.jsonc`)

---

## Overview
Automated daily LinkedIn scraping → vectorization → AI message generation → Telegram delivery.

**Key Constraint**: Cloudflare Workers 30-second timeout per request.

**Solution**: Small batches + state machine with retry logic.

---

## Database Schema

### New Tables

#### `config` (renamed from `apify_scraper_options`)
```sql
- id (bigint, primary key)
- cookie_default (jsonb)
- limit_per_source (int, default: 2)
- user_agent (text)
- min_delay (int, default: 2)
- max_delay (int, default: 8)
- deep_scrape (boolean, default: false)
- raw_data (boolean, default: false)
- proxy (jsonb)
- message_system_prompt (text) -- NEW
- singleton (boolean, unique, default: true)
- created_at, updated_at (timestamptz)
```

#### `posts`
```sql
- id (bigint, primary key)
- urn (text, unique) -- LinkedIn post URN for deduplication
- name (text) -- Author name
- occupation (text) -- Author occupation
- headline (text) -- Author headline
- text (text, not null) -- Cleaned post content
- posted_at (timestamptz, not null)
- industry_ids (bigint[], not null) -- Array of industries
- created_at (timestamptz)

Indexes:
- posts_urn_key (unique)
- posts_posted_at_idx (DESC)
- posts_industry_ids_idx (GIN)
```

#### `messages`
```sql
- id (bigint, primary key)
- industry_id (bigint, FK to industries)
- signal_id (bigint, FK to signals)
- message_text (text, not null)
- created_at (timestamptz)

Indexes:
- messages_created_at_idx (DESC)
- messages_industry_signal_idx (industry_id, signal_id)
```

#### `pipeline_jobs`
```sql
- id (bigint, primary key)
- status (text, not null)
  -- Values: 'idle', 'scraping', 'processing', 'vectorizing', 'generating', 'sending', 'completed', 'failed'
- apify_run_id (text)
- current_batch_offset (int, default: 0)
- total_items (int, default: 0)
- error_message (text)
- retry_count (int, default: 0)
- max_retries (int, default: 3)
- admin_chat_ids (bigint[], not null, default: '{}') -- Telegram chat IDs for error notifications
- started_at (timestamptz)
- updated_at (timestamptz)
```

---

## Pipeline Architecture

### Cron Schedule
**Single cron**: `*/5 * * * *` (every 5 minutes)

Calls: `/api/cron/advance`

### State Machine Flow

```
idle → scraping → processing → vectorizing → generating → sending → completed
  ↓        ↓           ↓            ↓            ↓           ↓
failed ←---+----+------+------------+------------+-----------+
  ↓
retry (if retry_count < max_retries)
  ↓
notify admins (if retry_count >= max_retries)
```

---

## Endpoints

### 1. `/api/scrape/verify-and-run` (POST)

**Purpose**: Start async Apify scraping

**Process**:
1. Fetch config singleton
2. Fetch linkedin WHERE allowed=true
3. Build Apify payload with profile URLs
4. Call Apify **async** endpoint (returns run_id immediately)
5. Save run_id to pipeline_jobs, set status='scraping'

**Output**:
```json
{
  "ok": true,
  "apify_run_id": "abc123"
}
```

**Batch size**: N/A (just starts the run)

---

### 2. `/api/scrape/check-apify` (POST)

**Purpose**: Check if Apify run is complete

**Process**:
1. Get apify_run_id from pipeline_jobs
2. Check Apify run status via API
3. If status='SUCCEEDED':
   - Fetch dataset URL
   - Count total items
   - Update pipeline_jobs: status='processing', total_items=count, current_batch_offset=0
4. If status='RUNNING': do nothing (check again next cron)
5. If status='FAILED': increment retry_count or fail

**Output**:
```json
{
  "ok": true,
  "status": "SUCCEEDED",
  "total_items": 150
}
```

---

### 3. `/api/scrape/process-posts` (POST)

**Purpose**: Process one batch of scraped posts

**Input**:
```json
{
  "batch_offset": 0,
  "batch_size": 10
}
```

**Process** (for each item in batch):
1. Extract profile URL
2. Find linkedin profile in DB by URL
3. Skip if profile not found
4. Extract occupation/headline with fallbacks:
   ```ts
   occupation = item.author?.occupation || item.activityOfUser?.occupation || item.activityDescription?.occupation
   headline = item.authorHeadline
   ```
5. **Verify** against linkedin table:
   - If profile.occupation exists: check `scrapedOccupation === profile.occupation`
   - If profile.headline exists: check `scrapedHeadline === profile.headline`
   - If mismatch: set `allowed=false`, skip post
6. Extract URN, check if exists in posts (deduplicate)
7. Filter posts older than 24h (postedAtTimestamp)
8. Clean text (remove emojis, control chars, collapse whitespace)
9. Extract name (firstName + lastName with fallbacks)
10. Insert into posts table

**Output**:
```json
{
  "ok": true,
  "inserted": 8,
  "skipped": 2
}
```

**Batch size**: 10 posts

**Update pipeline_jobs**:
- Increment current_batch_offset by 10
- If current_batch_offset >= total_items: status='vectorizing', current_batch_offset=0

---

### 4. `/api/scrape/vectorize` (POST)

**Purpose**: Vectorize one batch of posts

**Input**:
```json
{
  "batch_offset": 0,
  "batch_size": 10
}
```

**Process**:
1. If batch_offset=0: delete all vectors from Pinecone namespace='default'
2. Fetch 10 posts WHERE created_at >= (now - 24h) LIMIT 10 OFFSET batch_offset
3. Generate embeddings via OpenAI:
   ```ts
   model: 'text-embedding-3-small'
   input: posts.map(p => p.text)
   dimensions: 1536
   ```
4. Build Pinecone vectors:
   ```ts
   {
     values: embedding,
     metadata: {
       industry_ids: post.industry_ids,  // Array [1,3,5]
       text: post.text
     }
   }
   ```
5. Upsert to Pinecone namespace='default'

**Output**:
```json
{
  "ok": true,
  "vectorized": 10
}
```

**Batch size**: 10 posts

**Update pipeline_jobs**:
- Increment current_batch_offset by 10
- If current_batch_offset >= total_items: status='generating', current_batch_offset=0

---

### 5. `/api/signals/generate` (POST)

**Purpose**: Generate one message for one (industry, signal) pair

**Input**:
```json
{
  "batch_offset": 0
}
```

**Process**:
1. Fetch config.message_system_prompt
2. Fetch all industries WHERE visible=true
3. Fetch all signals WHERE visible=true
4. Calculate total pairs = industries.length × signals.length
5. Get industry/signal at batch_offset:
   ```ts
   industryIdx = Math.floor(batch_offset / signals.length)
   signalIdx = batch_offset % signals.length
   industry = industries[industryIdx]
   signal = signals[signalIdx]
   ```
6. Generate embedding from signal.prompt (OpenAI, text-embedding-3-small, 1536 dims)
7. Query Pinecone with native Cohere reranking:
   ```ts
   {
     vector: embedding,
     topK: 10,
     filter: { industry_ids: { $in: [industry.id] } },
     includeMetadata: true,
     rerankQuery: signal.prompt,
     rerankTopK: 10
   }
   // Note: Uses Pinecone's built-in Cohere integration (no separate API key needed)
   ```
8. If no results: skip
9. Format context: `posts.map(p => p.metadata.text).join('\n\n')`
10. Build user message: `CONTEXT: ${context}\n\nQUERY: ${signal.prompt}`
11. Call GPT:
    ```ts
    model: 'gpt-5-mini'
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage }
    ]
    ```
12. Insert into messages table

**Output**:
```json
{
  "ok": true,
  "generated": 1,
  "industry": "Banking",
  "signal": "Events"
}
```

**Batch size**: 1 message (1 industry × signal pair)

**Update pipeline_jobs**:
- Increment current_batch_offset by 1
- If current_batch_offset >= total_pairs: status='sending', current_batch_offset=0, total_items=(count of users)

---

### 6. `/api/telegram/send-batch` (POST)

**Purpose**: Send messages to one batch of users

**Input**:
```json
{
  "batch_offset": 0,
  "batch_size": 10
}
```

**Process**:
1. Fetch today's messages: WHERE created_at >= current_date
2. Fetch 10 users: WHERE telegram_chat_id IS NOT NULL LIMIT 10 OFFSET batch_offset
3. For each user:
   - Filter messages: WHERE industry_id IN user.industry_ids AND signal_id IN user.signal_ids
   - Send each message via Telegram:
     ```ts
     POST https://api.telegram.org/bot${token}/sendMessage
     {
       chat_id: user.telegram_chat_id,
       text: message.message_text,
       parse_mode: 'HTML'
     }
     ```

**Output**:
```json
{
  "ok": true,
  "sent": 15
}
```

**Batch size**: 10 users

**Update pipeline_jobs**:
- Increment current_batch_offset by 10
- If current_batch_offset >= total_items: status='completed'

---

### 7. `/api/cron/advance` (POST)

**Purpose**: Orchestrator - advances pipeline one step

**Process**:
1. Get active pipeline_job (status NOT IN ['completed', 'failed'])
2. If none exists AND current hour = 4: create new job with status='idle'
3. Based on current status, call appropriate endpoint:

```ts
switch (job.status) {
  case 'idle':
    await fetch('/api/scrape/verify-and-run')
    break

  case 'scraping':
    await fetch('/api/scrape/check-apify')
    break

  case 'processing':
    await fetch('/api/scrape/process-posts', {
      body: JSON.stringify({
        batch_offset: job.current_batch_offset,
        batch_size: 10
      })
    })
    break

  case 'vectorizing':
    await fetch('/api/scrape/vectorize', {
      body: JSON.stringify({
        batch_offset: job.current_batch_offset,
        batch_size: 10
      })
    })
    break

  case 'generating':
    await fetch('/api/signals/generate', {
      body: JSON.stringify({
        batch_offset: job.current_batch_offset
      })
    })
    break

  case 'sending':
    await fetch('/api/telegram/send-batch', {
      body: JSON.stringify({
        batch_offset: job.current_batch_offset,
        batch_size: 10
      })
    })
    break
}
```

4. **Error handling**:
   ```ts
   try {
     // ... call endpoint
   } catch (error) {
     job.retry_count++
     job.error_message = error.message
   
     if (job.retry_count >= job.max_retries) {
       job.status = 'failed'
   
       // Notify admins
       for (const chatId of job.admin_chat_ids) {
         await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
           method: 'POST',
           body: JSON.stringify({
             chat_id: chatId,
             text: `⚠️ Pipeline Failed\n\nStatus: ${job.status}\nError: ${error.message}\nRetries: ${job.retry_count}/${job.max_retries}`,
             parse_mode: 'HTML'
           })
         })
       }
     }
   
     await supabase.from('pipeline_jobs').update(job).eq('id', job.id)
   }
   ```

**Output**:
```json
{
  "ok": true,
  "current_status": "processing",
  "progress": "30/150"
}
```

---

## Admin Panel Features

### Scraper Config Panel
- Edit config table (singleton)
- Fields: cookies, user_agent, delays, proxy, message_system_prompt

### Manual Pipeline Trigger
- Button: "Run Daily Pipeline Now"
- Calls `/api/scrape/verify-and-run` directly

### Pipeline Status Dashboard
- Shows current pipeline_jobs status
- Progress bar: current_batch_offset / total_items
- Error messages if any
- Retry count

### Admin Notification Setup
- Add/remove Telegram chat IDs to pipeline_jobs.admin_chat_ids

---

## Environment Variables

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://yfqvassjjhewjkfsrptt.supabase.co
SUPABASE_SECRET_KEY=

# Apify
APIFY_TOKEN=

# Pinecone (includes native Cohere reranking - no separate Cohere API key needed)
PINECONE_API_KEY=
PINECONE_INDEX_NAME=pulse-linkedin

# OpenAI (for embeddings and message generation)
OPENAI_API_KEY=

# Telegram
TELEGRAM_BOT_TOKEN=
TELEGRAM_WEBHOOK_SECRET=
NEXT_PUBLIC_TELEGRAM_BOT_USERNAME=PulseJisBot
```

---

## Deployment Checklist

1. ✅ Run migration: `migrations/create_posts_messages_tables.sql`
2. ✅ Verify table rename: `apify_scraper_options` → `config`
3. ✅ Add message_system_prompt to config
4. ✅ Create pipeline_jobs table
5. ✅ Update wrangler.jsonc with cron schedule
6. ✅ Deploy to Cloudflare Workers
7. ✅ Test manual pipeline trigger from admin
8. ✅ Monitor first automated run

---

## Text Cleaning Logic

```ts
function cleanText(text: string): string {
  if (!text) return ''

  let s = text
  // Remove emojis
  s = s.replace(/[\u{1f300}-\u{1f5ff}\u{1f600}-\u{1f64f}\u{1f680}-\u{1f6ff}\u{2600}-\u{26ff}\u{2700}-\u{27bf}]/gu, '')
  // Remove control characters
  s = s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, '')
  // Replace underscores/asterisks with space
  s = s.replace(/[_*~`]+/g, ' ')
  // Collapse whitespace
  s = s.replace(/\s+/g, ' ').trim()

  return s
}
```

---

## Key Design Decisions

1. **Conservative batch sizes** (10 items) to avoid timeouts
2. **Retry logic** (max 3 retries) for transient failures
3. **Admin notifications** via Telegram on pipeline failure
4. **State persistence** in pipeline_jobs table
5. **Single cron** (every 5 min) for simplicity
6. **Async Apify** to avoid blocking
7. **HTML formatting** for Telegram (more reliable than Markdown)
8. **Pinecone single namespace** with metadata filtering
9. **Pinecone native Cohere reranking** (top 100 → top 10) for better message quality
10. **Anonymous data** (no author names exposed to users)
