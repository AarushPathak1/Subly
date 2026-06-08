# Subly — Student Subleasing Marketplace

A trust-first sublease platform built exclusively for verified university students. Every listing is invite-gated, `.edu`-verified, AI-matched for semantic compatibility, and scored for fraud before it reaches a renter. When both parties are ready to move forward, listers confirm the match through Subly — paying a flat fee based on the listed rent, with an optional sublease agreement add-on.

---

## System Architecture

```mermaid
graph TD
    Browser["Browser\nNext.js 14 App Router"]

    subgraph Gateway["Go Gateway :8080"]
        AUTH_MW["authMiddleware\n(Clerk session → X-User-ID)"]
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
    end

    subgraph Storage
        PG[("PostgreSQL 16\nusers · listings\nuser_profiles · conversations\nmessages · invite_requests")]
        PINECONE[("Pinecone\nvector index\n1536-dim cosine")]
        S3[("AWS S3\nlisting images")]
    end

    STRIPE["Stripe\nHosted Checkout"]
    RESEND["Resend\nTransactional Email"]
    OPENAI["OpenAI\ngpt-4o-mini + text-embedding-3-small"]

    Browser -->|"Bearer token"| AUTH_MW
    AUTH_MW -->|"validates via /validate"| AUTH
    AUTH_MW -->|"injects X-User-ID"| PROXY
    PROXY --> AUTH
    PROXY --> LISTINGS
    PROXY --> MATCHING

    AUTH -->|"upsert user / invite_requests"| PG
    AUTH -->|"magic link email"| RESEND

    LISTINGS -->|"INSERT listing / conversation / message"| PG
    LISTINGS -->|"full payload"| Q1
    LISTINGS -->|"listing_id"| Q2

    Q1 -->|"consume"| MATCHING
    MATCHING -->|"embed text"| OPENAI
    MATCHING -->|"upsert vector + metadata"| PINECONE
    MATCHING -->|"UPDATE embedding_id"| PG
    MATCHING -->|"top-5 query"| PINECONE
    MATCHING -->|"JOIN scam_score"| PG

    Q2 -->|"consume"| TRUST
    TRUST -->|"keyword + price check"| PG
    TRUST -->|"LLM tone analysis"| OPENAI
    TRUST -->|"UPDATE scam_score, status=active"| PG

    Browser -->|"PUT image (pre-signed)"| S3
    Browser -->|"Checkout redirect"| STRIPE
    STRIPE -->|"session webhook"| Browser
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
  → Thread opens with 5s polling

Both parties chat in-app
  → Lister clicks "Confirm this match" → fee panel shown (tier based on initial rent)
  → Optional: +$19 sublease agreement add-on
  → Browser → Stripe Checkout (hosted)
  → Stripe redirects to /messages/{id}/confirmed?session_id=...
  → Server action verifies Stripe session → Listings Service marks confirmed_at
  → Thread shows confirmed banner; agreement template rendered if purchased
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
| **Payments** | Stripe Hosted Checkout | Flat fee per confirmed match (tier based on initial listing rent). Agreement add-on optional. Fee is locked to initial rent at conversation creation — immune to price manipulation. Webhook route as backup confirmation path. |
| **Vector DB** | Pinecone | Managed ANN index with metadata filtering. Hard constraints (university, rent ceiling, bedrooms) applied before re-ranking by cosine similarity — avoiding false positives from pure vector search. |
| **Message Broker** | RabbitMQ | Durable queues decouple listing creation from the two expensive downstream operations (embedding + fraud scoring). Single-consumer queues are an architectural invariant. |
| **Database** | PostgreSQL 16 | ACID guarantees for transactional data (rent in cents, confirmed_at). `uuid-ossp` and `pg_trgm` extensions. LATERAL subqueries for unread count and last message preview. `updated_at` triggers on all mutable tables. |
| **Image Storage** | AWS S3 + Pre-signed URLs | Browser uploads directly to S3 — servers never handle image bytes. Eliminates a bottleneck and keeps all compute services stateless. |
| **Transactional Email** | Resend | Invite emails after admin approval. Falls back to stdout when `RESEND_API_KEY` is unset for local development. |
| **Validation** | Zod | Single schema shared between Server Actions (server-side parse) and form components (client-side parse). One source of truth, two enforcement points. |

---

## Payment Model

Subly charges the lister a one-time match confirmation fee when they decide to proceed with a renter. The fee is based on the listing's rent **at the time the conversation was created** — not when payment is made — making it immune to price manipulation.

| Monthly rent | Match fee | Agreement add-on |
|---|---|---|
| Under $1,000/mo | $29 | +$19 |
| $1,000–$1,999/mo | $49 | +$19 |
| $2,000+/mo | $79 | +$19 |

The agreement add-on generates a pre-filled sublease agreement template with digital-signing guidance. It is optional and intended for situations where the leasing office is not handling paperwork directly.

No payment is required from the renter. There are no subscription fees, listing fees, or per-message charges.

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
| `/listings/my` | Clerk + edu | Manage your listings (pause / reactivate / mark leased) |
| `/listings/[id]` | Clerk + edu | Listing detail — images, trust badge, "Message lister" CTA |
| `/listings/[id]/edit` | Clerk + owner | Edit listing (ownership enforced server-side) |
| `/messages` | Clerk + edu | Inbox — all conversations with unread indicators |
| `/messages/[id]` | Clerk + edu | Thread — chat, confirm panel (lister), renter info banner |
| `/messages/[id]/confirmed` | Clerk + edu | Post-payment page — verifies Stripe session, marks match confirmed, renders agreement if purchased |
| `/admin/invites` | Admin only | Review and approve/reject invite requests |
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

Fix: the trust service now sets both fields atomically:
```python
cur.execute(
    "UPDATE listings SET scam_score = %s, status = 'active' WHERE id = %s",
    (final, listing_id)
)
```

The trust service owns the `draft → active` transition because it is the only component that knows when scoring is complete.

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

Credentials stay server-side. Each key is namespaced `listings/{uuid}/{sanitized-filename}`. Images are uploaded before form submission; the submit button is disabled while any upload is in flight.

### 7. Invite-gated signup with HMAC magic links

1. Visitor submits email and university → stored as `pending` invite request
2. Admin approves at `/admin/invites` → HMAC-SHA256 token generated (30-min TTL)
3. Resend fires magic link email (logs to stdout if `RESEND_API_KEY` is unset)
4. Visitor clicks link → token validated → Clerk account created → token redeemed
5. Single-use `redeemed_at` column prevents replay attacks

---

## Test Coverage

| Layer | Framework | Tests | Coverage |
|---|---|---|---|
| Web — schemas | Vitest | 29 | Zod validation for all form schemas |
| Web — server actions | Vitest + fetch mocks | 27 | Fee calculation, fetch resilience, Stripe checkout session creation and payment verification |
| Web — ThreadClient | Vitest + Testing Library | 32 | Message rendering, send input, polling, confirm panel (fee tiers, agreement checkbox, Stripe redirect), renter/lister/confirmed banners |
| Web — AppNavUI | Vitest + Testing Library | 15 | Unread badge boundaries, nav links, back arrow, active highlighting |
| Web — components | Vitest + Testing Library | 16 | GetStartedFlow, UniversityCombobox |
| Listings service | Go testing + httptest | 27 | Conversation lifecycle (create, list, get, send, confirm), access control, idempotency, field capture |
| Gateway | Go testing + httptest | 7 | Auth middleware — missing header, auth errors, unverified users, verified user injection |
| Matching service | pytest + FastAPI TestClient | — | Health, search, and matches endpoints with mocked Pinecone/OpenAI |
| Trust service | pytest | — | Keyword scoring, formula, score capping |

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

### 2. Run the DB migration (first time, or after a reset)

```bash
docker compose up postgres -d
docker exec subly-postgres psql -U subly -d subly -c "$(cat infra/postgres/migrate_payments.sql)"
```

### 3. Start all services

```bash
docker compose up --build
```

First build takes ~3 minutes. Eight containers start together.

| Service | URL |
|---|---|
| Web app | http://localhost:3000 |
| Gateway | http://localhost:8080/healthz |
| RabbitMQ management | http://localhost:15672 (`subly` / `subly_secret`) |
| Postgres | `localhost:5434` (`subly` / `subly_secret` / db: `subly`) |

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
│   │   └── conversations_test.go  # Integration tests (conversations, messages, confirm)
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
│       │   └── admin/invites/     # Admin invite management
│       ├── components/
│       │   ├── AppNav.tsx         # Async server wrapper — fetches unread count
│       │   ├── AppNavUI.tsx       # Pure presentational nav — safe in client trees
│       │   └── ...
│       └── lib/
│           ├── actions.ts         # Server Actions (messaging, Stripe checkout, S3)
│           ├── schemas.ts         # Zod validation schemas
│           └── auth.ts            # requireEduVerified, getSessionUser
├── infra/
│   ├── postgres/
│   │   ├── init.sql               # Full schema (users, listings, conversations, messages, ...)
│   │   ├── migrate_chat.sql       # Migration: add messaging columns
│   │   └── migrate_payments.sql   # Migration: add payment confirmation columns
│   └── rabbitmq/
├── docker-compose.yml
└── .env.example
```

---

## Environment Variables

```bash
# Infrastructure (defaults work locally)
POSTGRES_USER=subly
POSTGRES_PASSWORD=subly_secret
POSTGRES_DB=subly
RABBITMQ_USER=subly
RABBITMQ_PASS=subly_secret

# Clerk (required)
CLERK_SECRET_KEY=sk_test_...
CLERK_PUBLISHABLE_KEY=pk_test_...

# OpenAI (embeddings + fraud LLM — required)
OPENAI_API_KEY=sk-...

# Pinecone (required)
PINECONE_API_KEY=...
PINECONE_INDEX=subly-listings

# Stripe — match confirmation payments (required for payment flow)
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# AWS S3 — listing image uploads via pre-signed URLs (optional)
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
S3_BUCKET_NAME=subly-listing-images

# Resend — transactional email for magic links (optional; logs to stdout if unset)
RESEND_API_KEY=re_...
FROM_EMAIL=Subly <invites@subly.app>

# Admin
ADMIN_SECRET=dev-admin-secret-change-in-prod
ADMIN_USER_IDS=user_clerk_id_1,user_clerk_id_2
INVITE_SECRET=dev-invite-secret-change-in-prod
INTERNAL_SECRET=dev-internal-secret-change-in-prod

# URLs
APP_URL=http://localhost:3000
```
