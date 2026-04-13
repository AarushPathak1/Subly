# Subly — Student Subleasing Marketplace

Distributed, trust-first subleasing platform for college students.

## Architecture

```
web (Next.js :3000)
  └─▶ gateway (Go :8080)
        ├─▶ /api/auth     → auth service     (Node/Clerk :3001)
        ├─▶ /api/listings → listings service (Go/Postgres :3002)
        └─▶ /api/matching → matching service (Python/Pinecone :3003)

Infrastructure:
  PostgreSQL :5432   — primary datastore
  RabbitMQ   :5672   — async scam-detection queue
               :15672  — management UI
```

## Quick start

```bash
cp .env.example .env
# fill in CLERK_*, PINECONE_API_KEY, OPENAI_API_KEY

docker compose up --build
```

| Service        | URL                          |
|----------------|------------------------------|
| Web            | http://localhost:3000        |
| Gateway        | http://localhost:8080        |
| Auth API       | http://localhost:3001        |
| Listings API   | http://localhost:3002        |
| Matching API   | http://localhost:3003        |
| RabbitMQ UI    | http://localhost:15672       |

## Services

| Directory             | Language      | Purpose                              |
|-----------------------|---------------|--------------------------------------|
| `gateway/`            | Go            | Reverse proxy, CORS, routing         |
| `services/auth/`      | Node.js/Clerk | .edu verification, user management   |
| `services/listings/`  | Go/PostgreSQL | CRUD for subleases, scam queue pub   |
| `services/matching/`  | Python/FastAPI| Pinecone vector search + embedding   |
| `web/`                | Next.js 14    | App Router frontend with Clerk auth  |
| `infra/postgres/`     | SQL           | Initial schema                       |
| `infra/rabbitmq/`     | Config        | RabbitMQ settings                    |
