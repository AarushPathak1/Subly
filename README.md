# Subly — Student Subleasing Marketplace

A trust-first sublease platform built exclusively for verified university students. Every listing is invite-gated, `.edu`-verified, AI-matched for semantic compatibility, and scored for fraud before it reaches a renter. When both parties are ready to move forward, listers confirm the match through Subly — paying a flat fee based on the listed rent.

---

## System Architecture

```mermaid
graph TD
    Browser["Browser\nNext.js 14 App Router"]

    subgraph Gateway["Go Gateway :8080"]
        STRIP["stripInternalHeaders\n(deletes client-supplied\nX-Internal-Call/-Secret)"]
        AUTH_MW["authMiddleware\n(Clerk session → X-User-ID,\nor X-Internal-Secret bypass)"]
        RATE["rate limiters\n(per-user auth routes,\nper-last-hop-IP public routes)"]
        PROXY["Reverse Proxy"]
    end

    subgraph Services
        AUTH["Auth Service\nNode.js + Clerk :3001"]
        LISTINGS["Listings Service\nGo + pgx :3002"]
        MATCHING["Matching Service\nPython + FastAPI :3003"]
        TRUST["Trust Service\nPython Worker :3004"]
    end

    subgraph Queues["RabbitMQ"]
        Q1["listings.new"]
        Q2["listing.scam_check"]
        Q3["notifications.*\n(DLX → dead.notifications)"]
    end

    subgraph Storage
        PG[("PostgreSQL 16\nusers · listings\nuser_profiles · conversations\nmessages · invite_requests · reports")]
        PINECONE[("Pinecone\nvector index\n1536-dim cosine")]
        S3[("AWS S3\nlisting images\nMIME + size restricted")]
    end

    STRIPE["Stripe\nHosted Checkout"]
    RESEND["Resend\nTransactional Email"]
    OPENAI["OpenAI\ngpt-4o-mini + text-embedding-3-small"]
    POSTHOG["PostHog\nProduct Analytics"]
    SENTRY["Sentry\nError Tracking"]

    Browser -->|"Bearer token"| STRIP
    STRIP --> AUTH_MW
    AUTH_MW -->|"validates via /validate"| AUTH
    AUTH_MW -->|"injects X-User-ID"| RATE
    RATE --> PROXY
    PROXY --> AUTH
    PROXY --> LISTINGS
    PROXY --> MATCHING

    AUTH -->|"upsert user / invite_requests"| PG
    AUTH -->|"magic link + notification emails\n(HTML-escaped)"| RESEND
    AUTH -->|"consume, ack/nack"| Q3

    LISTINGS -->|"INSERT listing / conversation / message"| PG
    LISTINGS -->|"full payload (create + trust-relevant edits)"| Q1
    LISTINGS -->|"listing_id (create + trust-relevant edits)"| Q2
    LISTINGS -->|"publish"| Q3

    Q1 -->|"consume"| MATCHING
    MATCHING -->|"embed text"| OPENAI
    MATCHING -->|"upsert vector + metadata"| PINECONE
    MATCHING -->|"UPDATE embedding_id"| PG
    MATCHING -->|"top-5 query"| PINECONE
    MATCHING -->|"JOIN title/address/image/scam_score"| PG

    Q2 -->|"consume"| TRUST
    TRUST -->|"keyword + price check"| PG
    TRUST -->|"LLM tone analysis"| OPENAI
    TRUST -->|"UPDATE scam_score, status=active\nWHERE status='draft'"| PG

    Browser -->|"PUT image (pre-signed,\nMIME-whitelisted, size-capped)"| S3
    Browser -->|"Checkout redirect (lister-only)"| STRIPE
    STRIPE -->|"session webhook"| Browser

    Browser -->|"named events"| POSTHOG
    PROXY -->|"errors"| SENTRY
    Browser -->|"errors"| SENTRY
```

### Request flow — posting a listing

```
Browser → Gateway (auth check) → Listings Service → Postgres (draft)
                                                   ↓
                                      listings.new ──→ Matching (embed → Pinecone)
                               listing.scam_check ──→ Trust (score → Postgres, status=active)
```

### Messaging and payment flow

```
Renter clicks "Message lister" on listing detail
  → Listings Service: upsert conversation (listing_id, renter_id) — idempotent
  → Thread opens with 30s polling

Both parties chat in-app
  → Lister clicks "Confirm this match" → fee panel shown (tier based on initial rent)
  → Browser → Stripe Checkout (hosted)
  → Stripe redirects to /messages/{id}/confirmed?session_id=...
  → Server action verifies Stripe session → Listings Service marks confirmed_at
  → Thread shows confirmed banner
```

### Invite flow — joining the platform

```
Visitor fills invite form → Auth Service stores invite_request (pending)
Admin approves via /admin/invites → Auth Service generates HMAC token
                                  → Resend sends magic link email
Visitor clicks magic link → /signup?token=X → verifies token
                          → Creates Clerk account → .edu verification → Onboarding
```

---

## Tech Stack

| Layer | Technology | Why |
|---|---|---|
| **Frontend** | Next.js 14 App Router | Server Components eliminate client/server waterfalls for auth-gated pages. Server Actions replace API routes for form submissions, keeping auth logic server-side. Split `AppNav` (async server, fetches unread count) / `AppNavUI` (pure presentational, safe in client trees) avoids the server-only import constraint. |
| **API Gateway** | Go | Goroutine-per-request handles high concurrency with minimal memory overhead — ideal for a reverse proxy that validates a Clerk session on every inbound request before forwarding. |
| **Auth Service** | Node.js + Clerk | Clerk handles OAuth, MFA, and session management. `.edu` domain verification is the platform's core trust primitive. Invite-gated signup with HMAC-signed magic links prevents unauthorized access. |
| **Listings Service** | Go + pgx | Handles listings, conversations, and messages in a single service. Type-safe Postgres driver with connection pooling. Upsert pattern (`ON CONFLICT ... DO UPDATE ... RETURNING id`) for idempotent conversation creation. Transactional message insert + `last_message_at` update. |
| **Matching Service** | Python + FastAPI | Python is the lingua franca for ML tooling. FastAPI's async support lets the service run a RabbitMQ consumer and serve HTTP traffic in the same process. |
| **Trust Service** | Python | Isolated worker — no HTTP surface beyond `/healthz`. Three-signal scoring (keyword heuristics 30%, price anomaly 20%, LLM tone 50%) runs fully async after listing creation. |
| **Payments** | Stripe Hosted Checkout | Flat fee per confirmed match (tier based on initial listing rent). Fee is locked to initial rent at conversation creation — immune to price manipulation. Webhook route as backup confirmation path. |
| **Vector DB** | Pinecone | Managed ANN index with metadata filtering. Hard constraints (university, rent ceiling, bedrooms) applied before re-ranking by cosine similarity — avoiding false positives from pure vector search. |
| **Message Broker** | RabbitMQ | Durable queues decouple listing creation from the two expensive downstream operations (embedding + fraud scoring). Single-consumer queues are an architectural invariant. |
| **Database** | PostgreSQL 16 | ACID guarantees for transactional data (rent in cents, confirmed_at). `uuid-ossp` and `pg_trgm` extensions. LATERAL subqueries for unread count and last message preview. `updated_at` triggers on all mutable tables. |
| **Image Storage** | AWS S3 + Pre-signed URLs | Browser uploads directly to S3 — servers never handle image bytes. Eliminates a bottleneck and keeps all compute services stateless. |
| **Transactional Email** | Resend | Invite emails after admin approval. Falls back to stdout when `RESEND_API_KEY` is unset for local development. |
| **Validation** | Zod | Single schema shared between Server Actions (server-side parse) and form components (client-side parse). One source of truth, two enforcement points. |
| **Analytics** | PostHog | Tracks pageviews, listing creation, message sends, match confirmations, reviews, and payment completion via named events. Autocapture is disabled — only the named events fire. No-ops client- and server-side when keys are unset. |

---

## Payment Model

Subly charges the lister a one-time match confirmation fee when they decide to proceed with a renter. The fee is based on the listing's rent **at the time the conversation was created** — not when payment is made — making it immune to price manipulation.

| Monthly rent | Match fee |
|---|---|
| Under $1,000/mo | $29 |
| $1,000–$1,999/mo | $49 |
| $2,000+/mo | $79 |

No payment is required from the renter. There are no subscription fees, listing fees, or per-message charges.

---

## Database Migrations

`infra/postgres/init.sql` is applied automatically on first boot via the Docker entrypoint. For existing databases, apply the numbered migrations in order:

```bash
psql $DATABASE_URL -f infra/postgres/migrate_chat.sql           # 1 — chat columns
psql $DATABASE_URL -f infra/postgres/migrate_payments.sql       # 2 — payment columns
psql $DATABASE_URL -f infra/postgres/migrate_expiration.sql     # 3 — expired status enum
psql $DATABASE_URL -f infra/postgres/migrate_reviews.sql        # 4 — reviews table
psql $DATABASE_URL -f infra/postgres/migrate_saved_listings.sql # 5 — saved listings (bookmarks)
psql $DATABASE_URL -f infra/postgres/migrate_viewings.sql       # 6 — viewing scheduler columns
psql $DATABASE_URL -f infra/postgres/migrate_view_count.sql     # 7 — listing view_count column
psql $DATABASE_URL -f infra/postgres/migrate_reports.sql        # 8 — reports table
```

All statements are idempotent (`IF NOT EXISTS`) except the enum addition in migration 3, which uses `ADD VALUE IF NOT EXISTS` and must **not** be run inside a transaction block.

---

## Pages & Routes

| Route | Auth | Purpose |
|---|---|---|
| `/` | Public | Landing page — scroll-aware nav, invite request form |
| `/signup` | Public | Magic link signup (invite token required) |
| `/signup/complete` | Public | Post-signup redirect handler |
| `/onboarding` | Clerk + edu | Vibe Check preferences form |
| `/dashboard` | Clerk + edu | Personalized AI match feed ranked by semantic similarity |
| `/listings` | Clerk + edu | Browse all active listings with filters |
| `/listings/new` | Clerk + edu | Create a new sublease listing |
| `/listings/my` | Clerk + edu | Manage your listings (pause / reactivate / mark leased), including per-listing view counts |
| `/listings/saved` | Clerk + edu | Your bookmarked (saved) listings |
| `/listings/[id]` | Clerk + edu | Listing detail — images, trust badge, "Message lister" CTA, Save/bookmark button, "Report listing" button (`POST /api/listings/reports`), increments the view count for non-owners |
| `/listings/[id]/edit` | Clerk + owner | Edit listing (ownership enforced server-side) |
| `/messages` | Clerk + edu | Inbox — all conversations with unread indicators |
| `/messages/[id]` | Clerk + edu | Thread — chat, viewing-proposal scheduler, confirm panel (lister), renter info banner |
| `/messages/[id]/confirmed` | Clerk + edu | Post-payment page — verifies Stripe session, marks match confirmed |
| `/settings` | Clerk + edu | Edit profile preferences (university, budget, vibe text) post-onboarding |
| `/profile` | Clerk + edu | Redirects to your own `/users/[id]` page |
| `/users/[id]` | Clerk + edu | Public user profile — member since, their active listings, reviews, "Report user" button |
| `/admin/invites` | Admin only (auth-gated: signed-out users redirected by middleware, non-admins get a 404) | Review and approve/reject invite requests |
| `/admin/reports` | Admin only (auth-gated: signed-out users redirected by middleware, non-admins get a 404) | Trust & safety moderation queue — view reports, mark reviewed/dismissed/actioned |
| `/help` | Public | FAQ — matching, trust scoring, match fee, reporting scams, account deletion, contact |
| `/privacy`, `/terms`, `/cookies` | Public | Legal pages (includes payment terms and Stripe disclosure) |

---

## Key Engineering Decisions

### 1. Idempotent conversation creation

When a renter messages a lister, Subly must create exactly one conversation per `(listing_id, renter_id)` pair regardless of how many times the user clicks. The upsert pattern handles this without a separate `SELECT`:

```sql
INSERT INTO conversations (listing_id, renter_id, lister_id, initial_rent_cents)
VALUES ($1, $2, $3, $4)
ON CONFLICT (listing_id, renter_id)
DO UPDATE SET listing_id = EXCLUDED.listing_id  -- no-op forces RETURNING to fire
RETURNING id
```

The fake `DO UPDATE` ensures `RETURNING id` works on both the insert and conflict paths — a single round-trip whether the conversation is new or existing.

### 2. Payment fee locked to initial rent

The match confirmation fee is calculated from `initial_rent_cents` captured at conversation creation, not the listing's current rent. This means a lister who edits their listing price after a conversation starts cannot reduce the fee they'll pay — a common vector for marketplace fee manipulation.

### 3. AppNav server/client split

The nav displays an unread message count badge fetched on every page render. Making `AppNav` an async server component that calls the gateway introduces a server-only import (`auth` from `@clerk/nextjs/server`). Since `NonEduGate` is a client component that renders the nav, importing the async version would break the build.

Solution: split into two exports in separate files:
- `AppNav` (async server) — fetches unread count, renders `AppNavUI`
- `AppNavUI` (pure presentational, no server imports) — safe to import from client components

### 4. Listings stuck in draft — trust service gap

After the trust service scored a listing, it updated `scam_score` but never transitioned `status` from `draft` to `active`. The browse page and dashboard only return `status = 'active'` rows, so all listings were permanently invisible.

Fix: the trust service now sets both fields atomically, and only when the listing is currently in `draft` — this also prevents the worker from un-pausing or un-leasing a listing that a lister or admin has since moved out of draft:
```python
cur.execute(
    "UPDATE listings SET scam_score = %s, status = 'active' WHERE id = %s AND status = 'draft'",
    (final, listing_id)
)
```

The trust service owns the `draft → active` transition because it is the only component that knows when scoring is complete. Editing a listing's trust-relevant fields (title/description/address/rent) resets it back to `draft` so this same path re-scores it before it's visible again.

### 5. RabbitMQ single-consumer invariant

During scaffolding, both the Matching and Trust services declared consumers on `listing.scam_check`. RabbitMQ distributes messages round-robin — each message went to one consumer only, so embedding and scoring never both ran on the same listing.

Fix: strict queue ownership:

| Queue | Owner | Payload |
|---|---|---|
| `listings.new` | Matching (sole consumer) | Full listing JSON |
| `listing.scam_check` | Trust (sole consumer) | `{"listing_id": "..."}` |

### 6. S3 direct upload via pre-signed URLs

```
1. Browser calls getPresignedUrl() Server Action
2. Server generates a PutObject signed URL (5-min TTL, scoped to one S3 key)
3. Browser PUTs the file directly to S3 — server not in the upload path
4. Browser records the public S3 URL in component state
5. On submit, the URL array is sent as plain strings to the Listings Service
```

Credentials stay server-side. Each key is namespaced `listings/{uuid}/{sanitized-filename}`. Images are uploaded before form submission; the submit button is disabled while any upload is in flight. The server-side action rejects any `contentType` outside `image/jpeg|png|webp|gif`, signs the `PutObjectCommand` with an exact `ContentLength` (capped at 10MB) so S3 itself enforces the size limit, and rejects uploads once a listing already has 8 images.

### 7. Invite-gated signup with HMAC magic links

1. Visitor submits email and university → stored as `pending` invite request
2. Admin approves at `/admin/invites` → HMAC-SHA256 token generated (30-min TTL)
3. Resend fires magic link email (logs to stdout if `RESEND_API_KEY` is unset)
4. Visitor clicks link → token validated → Clerk account created → token redeemed
5. Single-use `redeemed_at` column prevents replay attacks, and the signature is compared with `crypto.timingSafeEqual` to avoid timing side-channels

---

## Key Security Properties

| Property | Enforced by |
|---|---|
| Client-supplied `X-Internal-Call`/`X-Internal-Secret` headers never reach an upstream service or bypass rate limiting | `stripInternalHeaders` middleware (gateway) strips both headers on every public route; `authMiddleware` strips them on every auth-required route before deciding whether to honor a *real* `X-Internal-Secret` |
| Rate limiting can't be evaded by IP spoofing | `clientIP` keys on the **last** (rightmost) hop of `X-Forwarded-For`, which Railway's ingress appends and a client cannot forge without controlling the proxy — not the spoofable first hop |
| Only the lister can trigger a Stripe charge / confirm a match | `createCheckoutSession` (web) checks the caller's session user ID against `conversation.lister_id` before creating a Checkout session; the listings service repeats the check server-side |
| Listing image uploads are restricted to images, capped at 10MB, and capped at 8 per listing | `getPresignedUrl` whitelists MIME types, signs `PutObjectCommand` with an exact `ContentLength`, and checks the existing image count before issuing a URL |
| Editing a listing's title/description/address/rent invalidates its trust badge | `handleUpdate` (listings service) detects the change, force-resets `status='draft'` and `scam_score=0`, and republishes to `listing.scam_check` + `listings.new` |
| The trust worker can never silently un-pause or un-lease a listing | the scam-score `UPDATE` only flips `status` when the current value is `draft` (`WHERE status='draft'`) |
| `/admin/*` pages are inaccessible to non-admins and unauthenticated visitors | `middleware.ts` protects `/admin(.*)`; each admin page additionally checks `ADMIN_USER_IDS` server-side and calls `notFound()` for non-admins |
| Email notification templates can't be used for HTML/script injection | `escapeHtml` wraps every user-supplied string (e.g. listing title) interpolated into a notification email's HTML body |
| Failed notification emails are retried via dead-lettering, not silently dropped or retried forever | each `notifications.*` queue declares `x-dead-letter-exchange`/`-routing-key` pointing at `dead.notifications`; consumers `nack(msg, false, false)` on failure instead of always `ack`-ing |
| Counterparties' raw `.edu` emails aren't exposed before a match is confirmed | `handleListConversations`/`handleGetConversation` return only the email's username portion until `confirmed_at IS NOT NULL` |
| Invite token signatures are compared in constant time | `verifySignedToken` uses `crypto.timingSafeEqual` instead of `!==` |

---

## Test Coverage

| Layer | Framework | Tests | Coverage |
|---|---|---|---|
| Web (all suites) | Vitest + Testing Library | 363+ | Schemas, server actions, ThreadClient, AppNavUI (incl. mobile drawer), ReviewsSection, ReportButton, SaveButton, MyListingsClient delete flow, middleware route protection, and other components |
| Auth service | Jest + supertest | 109+ | Invite flow, account deletion, notifications (ack/nack + dead-letter queue), error handler, log redaction (`logSafeIdentifier`), `escapeHtml`, constant-time HMAC comparison, viewing-responded email |
| Listings service | Go testing + httptest | 184+ | Conversation lifecycle, email masking pre/post confirmation, unread-count endpoint, reviews, saved listings, reports (incl. admin moderation), field validation, trust-relevant-edit re-scoring, access control, idempotency |
| Gateway | Go testing + httptest | 60+ | Auth middleware, internal-header stripping (client can't forge `X-Internal-Call`), last-hop IP rate limiting, unverified users, verified user injection |
| Matching service | pytest + FastAPI TestClient | 13 | Health, search (now requires `X-User-ID`), and matches (incl. title/address/image join) endpoints with mocked Pinecone/OpenAI |
| Trust service | pytest | 17 | Keyword scoring, formula, score capping, draft-only status transition |

<sup>Counts refreshed 2026-06-26.</sup>

Run web tests: `cd web && npm test`

Run Go tests (requires `DATABASE_URL`):
```bash
cd services/listings
DATABASE_URL="postgresql://subly:subly_secret@localhost:5434/subly" go test -v ./...
```

---

## Quick Start

### Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (running)
- API keys for Clerk, OpenAI, Pinecone, and Stripe (see below)

### 1. Clone and configure

```bash
git clone https://github.com/AarushPathak1/Subly.git
cd Subly
cp .env.example .env
```

Fill in `.env`:

| Variable | Where to get it |
|---|---|
| `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY` | [dashboard.clerk.com](https://dashboard.clerk.com) → API Keys |
| `OPENAI_API_KEY` | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) |
| `PINECONE_API_KEY` | [app.pinecone.io](https://app.pinecone.io) → create index `subly-listings`, dimension `1536`, metric `cosine` |
| `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY` | [dashboard.stripe.com](https://dashboard.stripe.com) → Developers → API Keys |
| `STRIPE_WEBHOOK_SECRET` | `stripe listen --forward-to localhost:3000/api/stripe/webhook` (local) or Stripe dashboard (production) |
| `AWS_*`, `S3_BUCKET_NAME` | AWS Console → S3 + IAM user with `s3:PutObject`. Optional — omit to test without image uploads. |
| `RESEND_API_KEY` | [resend.com](https://resend.com). Optional — magic links log to stdout when unset. |

### 2. Run the DB migrations (first time, or after a reset)

```bash
docker compose up postgres -d
psql $DATABASE_URL -f infra/postgres/migrate_chat.sql           # 1 — chat columns
psql $DATABASE_URL -f infra/postgres/migrate_payments.sql       # 2 — payment columns
psql $DATABASE_URL -f infra/postgres/migrate_expiration.sql     # 3 — expired status enum (not transactional)
psql $DATABASE_URL -f infra/postgres/migrate_reviews.sql        # 4 — reviews table
psql $DATABASE_URL -f infra/postgres/migrate_saved_listings.sql # 5 — saved listings (bookmarks)
psql $DATABASE_URL -f infra/postgres/migrate_viewings.sql       # 6 — viewing scheduler columns
psql $DATABASE_URL -f infra/postgres/migrate_view_count.sql     # 7 — listing view_count column
psql $DATABASE_URL -f infra/postgres/migrate_reports.sql        # 8 — reports table
```

`init.sql` is applied automatically on first boot. The numbered migrations are for existing databases only.

### 3. Start all services

```bash
docker compose up --build
```

First build takes ~3 minutes. Eight containers start together.

| Service | URL |
|---|---|
| Web app | http://localhost:3000 |
| Gateway | http://localhost:8080/healthz |
| Postgres | `localhost:5434` (credentials from your `.env`) |

### 4. Test the full loop

1. Go to `localhost:3000` → submit an invite request with a non-`.edu` email
2. Open `localhost:3000/admin/invites` (set `ADMIN_USER_IDS` to your Clerk user ID)
3. Approve the invite → magic link generated (emailed if Resend is configured)
4. Click the link → create Clerk account → verify `.edu` email → complete Vibe Check
5. Post a sublease at `/listings/new`
6. Watch RabbitMQ — messages flow through `listings.new` (embedding) and `listing.scam_check` (scoring)
7. Dashboard shows AI-ranked match cards; **High Risk** badge on listings scoring above 0.7
8. From the listing detail, click **Message lister** to start a conversation
9. As the lister, open the thread and click **Confirm this match** → pay via Stripe test card `4242 4242 4242 4242`
10. Confirmed banner appears on the thread for both parties

### Useful commands

```bash
# Stream all service logs
docker compose logs -f

# Stream a single service
docker compose logs -f trust

# Rebuild one service after a code change
docker compose up --build web -d

# Full reset (removes all data)
docker compose down -v
```

> **Code changes to `web/` are NOT picked up by a running container automatically.** If you edit anything under `web/src` (or any other service's source), you must rebuild and restart that container before the change takes effect:
> ```bash
> docker compose build web && docker compose up -d web
> ```
> (Substitute the service name — `gateway`, `listings`, `matching`, `trust`, `auth` — for any other service you've changed.)

---

## Project Structure

```
subly/
├── gateway/                   # Go reverse proxy + Clerk session middleware
├── services/
│   ├── auth/                  # Node.js + Clerk — invite flow, .edu verification, user profiles
│   ├── listings/              # Go + pgx — listings, conversations, messages, match confirmation
│   │   ├── main.go            # All HTTP handlers + RabbitMQ publisher
│   │   ├── handlers_test.go   # Unit + integration tests (listings)
│   │   ├── conversations_test.go  # Integration tests (conversations, messages, confirm, email masking)
│   │   └── reports_test.go    # Report creation + admin moderation (list/update status)
│   ├── matching/              # Python + FastAPI — Pinecone embedding + semantic search
│   └── trust/                 # Python worker — heuristic + LLM fraud scoring + status promotion
├── web/                       # Next.js 14 App Router
│   └── src/
│       ├── app/
│       │   ├── page.tsx           # Landing page
│       │   ├── LandingNav.tsx     # Scroll-aware nav (white over hero, slate below)
│       │   ├── dashboard/         # AI match feed
│       │   ├── listings/          # Browse, detail, new, edit, my
│       │   ├── messages/          # Inbox + thread (ThreadClient.tsx) + confirmed page
│       │   ├── onboarding/        # Vibe Check form
│       │   ├── api/stripe/webhook/  # Stripe webhook handler
│       │   ├── help/              # Public FAQ page
│       │   └── admin/             # Admin invite management + reports moderation (auth-gated)
│       ├── components/
│       │   ├── AppNav.tsx         # Async server wrapper — fetches unread count via dedicated endpoint
│       │   ├── AppNavUI.tsx       # Pure presentational nav (mobile hamburger + drawer) — safe in client trees
│       │   └── ...
│       └── lib/
│           ├── actions.ts         # Server Actions (messaging, Stripe checkout, S3)
│           ├── schemas.ts         # Zod validation schemas
│           └── auth.ts            # requireEduVerified, getSessionUser
├── infra/
│   ├── postgres/
│   │   ├── init.sql                   # Full schema (users, listings, conversations, messages, ...)
│   │   ├── migrate_chat.sql           # Migration 1: add messaging columns
│   │   ├── migrate_payments.sql       # Migration 2: add payment confirmation columns
│   │   ├── migrate_expiration.sql     # Migration 3: add expired status enum
│   │   ├── migrate_reviews.sql        # Migration 4: add reviews table
│   │   ├── migrate_saved_listings.sql # Migration 5: add saved listings (bookmarks)
│   │   ├── migrate_viewings.sql       # Migration 6: add viewing scheduler columns
│   │   ├── migrate_view_count.sql     # Migration 7: add listing view_count column
│   │   └── migrate_reports.sql        # Migration 8: add reports table
│   └── rabbitmq/
├── docker-compose.yml
└── .env.example
```

---

## Environment Variables

All variables marked **required** must be present in `.env` — docker-compose will fail loudly if they are missing (uses `:?` expansion, not silent defaults).

```bash
# Infrastructure
POSTGRES_USER=subly          # default fine
POSTGRES_PASSWORD=            # required — no default
POSTGRES_DB=subly            # default fine
RABBITMQ_USER=subly          # default fine
RABBITMQ_PASS=               # required — no default

# Clerk (required — https://dashboard.clerk.com)
CLERK_SECRET_KEY=sk_test_...
CLERK_PUBLISHABLE_KEY=pk_test_...

# OpenAI — embeddings + fraud LLM (required)
OPENAI_API_KEY=sk-...

# Pinecone (required)
PINECONE_API_KEY=...
PINECONE_INDEX=subly-listings

# Stripe — match confirmation payments (required for payment flow)
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Service-to-service auth (required)
INTERNAL_SECRET=             # required — generate a random secret

# Admin and invite secrets (required)
ADMIN_SECRET=                # required — generate a random secret
ADMIN_USER_IDS=user_clerk_id_1,user_clerk_id_2
INVITE_SECRET=               # required — generate a random secret

# URLs
APP_URL=http://localhost:3000

# AWS S3 — listing image uploads via pre-signed URLs (optional)
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
S3_BUCKET_NAME=subly-listing-images

# Resend — transactional email for magic links (optional; logs to stdout if unset)
RESEND_API_KEY=re_...
FROM_EMAIL=Subly <invites@subly.app>

# PostHog — product analytics (optional; client and server no-op if keys unset)
NEXT_PUBLIC_POSTHOG_KEY=
NEXT_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com
POSTHOG_API_KEY=
POSTHOG_HOST=https://us.i.posthog.com

# Sentry — error tracking (optional; services no-op if DSN unset)
SENTRY_DSN=
NEXT_PUBLIC_SENTRY_DSN=
SENTRY_ENVIRONMENT=development
NEXT_PUBLIC_SENTRY_ENVIRONMENT=development
SENTRY_ORG=
SENTRY_PROJECT=
SENTRY_AUTH_TOKEN=

# Structured logging — gateway and listings Go services (optional; defaults shown)
LOG_LEVEL=info
LOG_FORMAT=json
```

The web app uses `@sentry/nextjs` for client, server, and edge error tracking; it stays fully inert (no init, no network calls) until `SENTRY_DSN`/`NEXT_PUBLIC_SENTRY_DSN` is set, and source-map upload during build only runs if `SENTRY_AUTH_TOKEN` is also present. The gateway and listings services emit structured JSON logs (`LOG_LEVEL`/`LOG_FORMAT`) with per-request `X-Request-ID` correlation and panic recovery instead of crashing the process.
