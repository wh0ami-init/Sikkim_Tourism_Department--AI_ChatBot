<div align="center">

<img src="https://raw.githubusercontent.com/wh0ami-init/Sikkim_Tourism_Department--AI_ChatBot/master/frontend/public/images/govt-of-sikkim-logo.png" alt="Government of Sikkim Emblem" width="110" />

# Sikkim Tourism Assistant : AI Chat Interface

### AI-Powered Visitor Information System
**Tourism & Civil Aviation Department, Government of Sikkim**

[![Backend Tests](https://img.shields.io/badge/backend%20tests-68%20passing-brightgreen?style=for-the-badge&logo=pytest&logoColor=white)](#quality-assurance--verification)
[![Frontend Build](https://img.shields.io/badge/frontend%20build-passing-brightgreen?style=for-the-badge&logo=vite&logoColor=white)](#quality-assurance--verification)
[![Security Controls](https://img.shields.io/badge/security-controls%20reviewed-blue?style=for-the-badge&logo=shieldsdotio&logoColor=white)](#security-controls)
[![Python](https://img.shields.io/badge/python-3.11-3776AB?style=for-the-badge&logo=python&logoColor=white)](#requirements)
[![Node](https://img.shields.io/badge/node-20%2B-339933?style=for-the-badge&logo=node.js&logoColor=white)](#requirements)
[![FastAPI](https://img.shields.io/badge/FastAPI-005571?style=for-the-badge&logo=fastapi)](#architecture)
[![React](https://img.shields.io/badge/React-18-61DAFB?style=for-the-badge&logo=react&logoColor=black)](#architecture)
[![License](https://img.shields.io/badge/status-official%20deployment-blue?style=for-the-badge)](#)

*This system will serve as the official AI-driven point of contact between the*
*Tourism & Civil Aviation Department and visitors to the State of Sikkim.*

</div>

---

## 📑 Table of Contents

- [Purpose &amp; Scope](#purpose--scope)
- [Features](#features)
- [Architecture](#architecture)
- [Requirements](#requirements)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
- [Production Deployment & Handover](#production-deployment--handover)
- [Admin Operations](#admin-operations)
- [Circular Ingestion](#circular-ingestion)
- [MySQL Setup](#mysql-setup)
- [API Summary](#api-summary)
- [Security Controls](#security-controls)
- [Quality Assurance &amp; Verification](#quality-assurance--verification)
- [Project Structure](#project-structure)
- [Governance &amp; Support](#governance--support)

---

## Purpose & Scope

This repository shall constitute the reference implementation of the Sikkim
Tourism Assistant — a conversational, AI-assisted information platform that
will be deployed on behalf of the Tourism & Civil Aviation Department,
Government of Sikkim.

Upon deployment, the system will:

- respond to visitor enquiries regarding destinations, permits, travel
  seasons, and entry requirements across the State;
- surface official road-status advisories, cancellation orders, and notices
  as they are published or manually ingested by department staff;
- provide department administrators with a secure console through which the
  destination catalogue and official circulars can be maintained; and
- support local development and controlled Department handover before
  official-domain integration.

All configuration, credentials, and data ingestion pathways described in this
document have been designed for **official, single-department use** and
should not be repurposed for unrelated deployments without a corresponding
security review.

---

## Features

| Capability                         | Description |
|------------------------------------| --- |
| **Streaming AI chat**              | Visitor questions will be answered in real time via Server-Sent Events, grounded in the Department's destination and circular records. |
| **Retrieval-Augmented Generation** | Gemini embeddings and a Qdrant vector store will retrieve the most relevant official data before Groq's language model composes a response. |
| **Image-assisted queries**         | Visitors will be able to attach a photograph (JPEG/PNG/WebP), which will be interpreted through Gemini Vision in a Sikkim tourism context. |
| **No separate vector database to run** | Qdrant runs in-memory by default (or remote if `QDRANT_URL` is set) — no separate service to provision for evaluation, though a MySQL database is required. |
| **Administrator console**          | Authorised staff will be able to create, edit, and remove destinations; manage official circulars; and rotate their own credentials. |
| **Circular ingestion**             | Road-status reports, cancellation orders, and general notices will be ingested automatically from the Department's website, or uploaded manually (PDF/JPG/PNG/WebP) when a document is never published online. |
| **Responsive frontend**            | A React + Vite interface will present destinations, live weather, and themeable chat to visitors across desktop and mobile devices. |

---

## Architecture

```text
                     ┌────────────────────────────┐
                     │   React + Vite Frontend    │
                     │  (visitor-facing website)  │
                     └──────────────┬─────────────┘
                                    │  HTTPS / Server-Sent Events
                                    ▼
                     ┌───────────────────────────────┐
                     │        FastAPI Backend        │
                     │                               │
                     │  ├─ Destination & conversation│
                     │  │   repository (MySQL)       │
                     │  ├─ Qdrant vector store       │
                     │  │   (in-memory or remote)    │
                     │  ├─ Gemini — embeddings &     │
                     │  │   vision                   │
                     │  └─ Groq — text generation    │
                     └───────────────────────────────┘
```

During local development, Vite will proxy `/api/*` requests to
`http://localhost:8000`. In production, the Vercel configuration will proxy
requests to the Railway-hosted backend declared in
[`frontend/vercel.json`](frontend/vercel.json).

---

## Requirements

The following will be required before the system can be built or deployed:

- **Python 3.11**
- **Node.js 20+**
- A **Gemini API key**, for embeddings and image-assisted chat
- A **Groq API key**, for the default text-chat model
- **Firefox**, only where `ENABLE_CIRCULAR_SCRAPER=true`

Every Python dependency — application, scraper, and test suite alike — will
be sourced from the single authoritative manifest:
[`backend/requirements.txt`](backend/requirements.txt).

---

## Quick Start

### Automated setup

The appropriate script for the host operating system should be executed
from the repository root:

```bash
# macOS
chmod +x scripts/setup-mac.sh
./scripts/setup-mac.sh

# Linux
chmod +x scripts/setup-linux.sh
./scripts/setup-linux.sh

# Windows (Command Prompt)
scripts\setup-windows.bat
```

Running any of these scripts will create the `backend/v_env` virtual
environment, install all backend and frontend packages, and copy
`backend/.env.example` to `backend/.env` where the latter does not already
exist.

### Manual setup

```bash
# Terminal 1 — Backend
cd backend
python3.11 -m venv v_env
source v_env/bin/activate              # Windows: v_env\Scripts\activate.bat
pip install -r requirements.txt
cp .env.example .env                   # Windows: copy .env.example .env
python main.py
```

```bash
# Terminal 2 — Frontend
cd frontend
npm install
npm run dev
```

Once both processes are running, the visitor site will be reachable at
`http://localhost:5173`, and the backend will be reachable at
`http://localhost:8000`. Interactive API documentation will be available at
`http://localhost:8000/api/docs`, in development environments only.

---

## Configuration

`backend/.env.example` should be copied to `backend/.env` before the backend
is started. A real `.env` file, or any credential contained within it, must
never be committed to version control.

| Area | Variables | Notes |
| --- | --- | --- |
| AI | `GEMINI_API_KEY`, `GEMINI_MODEL`, `GEMINI_EMBEDDING_MODEL` | A Gemini key will be required for embeddings and image-assisted chat. |
| Text chat | `GROQ_API_KEY`, `GROQ_MODEL`, `GROQ_FALLBACK_MODEL` | Groq will power the default text-response path. |
| Optional AI | `ENABLE_PROMPT_GUARD`, `PROMPT_GUARD_MODEL`, `TAVILY_API_KEY`, `ENABLE_FOLLOWUPS` | These will remain disabled unless explicitly enabled in `.env`. |
| Database | `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_DATABASE` | MySQL is required — the app connects to it on startup. |
| Vector store | `QDRANT_URL`, `QDRANT_API_KEY`, `QDRANT_COLLECTION` | `QDRANT_URL` should be left empty for in-memory mode. |
| Browser access | `ALLOWED_ORIGINS`, `ALLOWED_METHODS`, `ALLOWED_HEADERS`, `ENVIRONMENT` | Production deployments will require explicit HTTPS origins; a wildcard CORS value will be rejected outright. |
| Admin | `ADMIN_API_KEY` | This one-time, server-side bootstrap secret will be required to create the first administrator account. |
| Circulars | `ENABLE_CIRCULAR_SCRAPER`, `CIRCULARS_ALLOWED_HOST`, `CIRCULARS_NOTICE_URL`, `CIRCULARS_SYNC_INTERVAL_MINUTES`, `CIRCULARS_MAX_PDF_BYTES`, `CIRCULARS_MAX_PER_RUN` | The scheduled browser-based scraper should remain disabled on constrained web-hosting tiers. |

The bootstrap key should be generated with:

```bash
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

---

## Production Deployment & Handover

The sanctioned deployment topology will be **Vercel (frontend) + Railway
(backend)**.

1. The `frontend/` directory will be deployed to Vercel.
2. The `backend/` directory will be deployed to Railway, using:

   ```bash
   pip install -r requirements.txt
   uvicorn main:app --host 0.0.0.0 --port $PORT
   ```

3. At minimum, the following Railway environment variables will be
   required:

   ```ini
   ENVIRONMENT=production
   ALLOWED_ORIGINS=https://<official-frontend-domain>
   GEMINI_API_KEY=<secret>
   GROQ_API_KEY=<secret>
   ADMIN_API_KEY=<at-least-32-character-bootstrap-secret>
   ```

4. Should the Railway public URL change, the `/api/:path*` rewrite
   destination in [`frontend/vercel.json`](frontend/vercel.json) must be
   updated accordingly.

In production, OpenAPI documentation will remain hidden, and the Vercel
configuration will apply Content-Security-Policy, HSTS, anti-framing,
no-sniff, referrer, and permissions headers to every frontend response.

The backend enforces request-size limits for chat and circular uploads. The
Department should additionally use a WAF or gateway with distributed rate
limiting when running more than one backend instance. The in-process limiter
cannot coordinate counters across multiple containers.

### Department handover responsibilities

The Department's hosting and security team must complete the following before
the service is integrated into `sikkimtourism.gov.in`:

- set the final official HTTPS frontend origin in `ALLOWED_ORIGINS` — never use
  a wildcard;
- manage all production secrets in Railway or the approved secret manager;
- rotate the bootstrap secret after first-admin setup and define administrator
  ownership, MFA/SSO, and credential-recovery policy;
- configure database backups, restore testing, monitoring, incident contacts,
  and a WAF/distributed limiter;
- approve privacy notice, retention rules, accessibility testing, and the
  operational workflow for validating destinations and circulars; and
- commission independent vulnerability assessment / penetration testing before
  public launch under the official domain.

---

Department staff will access `/admin` on the frontend to create the first
administrator account, authenticated by the server-side `ADMIN_API_KEY`.
Following this one-time setup, every subsequent admin action will require
the administrator's own username and password; credentials will be held in
browser memory only, and will never be written to local storage.

Through the admin console, authorised staff will be able to:

- create, edit, and delete destinations;
- re-index destinations within Qdrant;
- upload and manage official circulars; and
- rotate their own credentials from `/admin/security`.

Destination imagery will remain restricted to local `/images/` paths, so
that it stays compatible with the frontend's Content Security Policy.

---

## Circular Ingestion

Manual uploads will accept PDF, JPEG, PNG, and WebP files. Every upload will
be bounded to a configured size, verified against its file signature,
deduplicated by SHA-256 hash, and processed for text extraction prior to
storage.

The automated scraper will remain disabled by default:

```ini
ENABLE_CIRCULAR_SCRAPER=false
```

It should be enabled only on infrastructure with Firefox installed and
sufficient available memory. Once enabled, it will validate the configured
host before loading any page or downloading any file, will bound the number
of documents processed per run, and will disable redirects on every PDF
fetch.

---

## MySQL Setup

MySQL is required for every deployment (including local development):

1. The schema will be created with:

   ```bash
   mysql -u root -p < docs/schema.sql
   ```

2. The `MYSQL_*` values should be set in `backend/.env`.

3. Populate the destination catalogue through the protected `/admin` console
   or an approved operational import. This repository does not include a
   destination seed script.

4. Migrations under [`docs/migrations`](docs/migrations) should be applied
   only when an existing schema is being upgraded. New installations should
   rely on `docs/schema.sql` instead.

Qdrant will be repopulated from the active repository automatically on every
backend startup. The admin destination-sync action should be used after any
persistent destination record is edited directly.

---

## API Summary

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Reports service health and, outside production, development diagnostics. |
| `GET` | `/api/destinations` | Will return searchable/filterable public destination summaries. |
| `GET` | `/api/destinations/categories` | Will list the available destination categories. |
| `GET` | `/api/destinations/{id}` | Will return the full record for a single destination. |
| `POST` | `/api/conversations` | Will create a new, anonymous conversation. |
| `GET` | `/api/conversations/{id}` | Will return a conversation and its stored messages. |
| `POST` | `/api/conversations/{id}/chat` | Will stream the assistant's response over Server-Sent Events. |
| `POST` | `/api/admin/auth/setup` | Will bootstrap the first administrator account; requires `X-Admin-Key`. |
| `POST` | `/api/admin/auth/login` | Will verify an administrator's submitted credentials. |
| Various | `/api/admin/*` | Will expose protected destination, circular, credential, and vector-sync operations. |

The chat endpoint will accept a text message, an optional idempotency key,
and an optional JPEG/PNG/WebP image of up to 4 MB. It will emit
Server-Sent Events of the form:

```text
data: {"text":"..."}

data: [DONE]
```

---

## Security Controls

The following controls have been implemented and will remain in force for
every deployment of this system:

- Rate limiting will protect public database-backed routes, conversation
  creation, chat, admin setup, admin login, and protected admin operations.
- Admin bootstrap will fail closed in the absence of `ADMIN_API_KEY`; every
  subsequent admin request will be authenticated against scrypt password
  hashes using constant-time comparison.
- API responses will carry CSP, no-sniff, anti-framing, referrer,
  permissions, cache, and — in production — HSTS headers.
- Vercel will apply equivalent browser protections to the frontend.
- Production CORS will accept only explicit HTTPS origins, with wildcard
  methods and headers rejected.
- Remote MySQL connections will verify the certificate authority and server
  identity.
- Chat and upload request bodies will be bounded before JSON or multipart
  parsing can allocate unbounded memory.
- Retrieved, OCR, and web-search context will be treated as untrusted data;
  instruction-like prompt-injection text will be removed before it reaches the
  answer model.
- Image attachments and circular uploads will be subject to MIME,
  signature, size, and payload validation before processing.
- The circular scraper will enforce a host allow-list and bounded,
  redirect-free downloads.
- All MySQL queries are parameterised; no user-supplied value is ever
  interpolated into SQL text.

---

## Quality Assurance & Verification

```bash
# Backend
cd backend
source v_env/bin/activate
pytest tests -q
pip check
pip-audit --local

# Frontend
cd frontend
npm audit
npm run build
```

**Verified status as of the most recent audit:**

| Check | Result |
| --- | --- |
| Backend test suite | ✅ **68 passing** |
| Frontend production build (`tsc && vite build`) | ✅ **Clean, no errors** |
| Python dependency audit | ✅ No known advisories reported for `requirements.txt` at the last audit. |
| Frontend dependency audit | ✅ No known advisories reported for the lockfile at the last audit. |
| SQL injection review (`mysql_repo.py`) | ✅ **All queries parameterised** |
| SSRF review (circular scraper) | ✅ **Host allow-list enforced, redirects blocked** |
| Admin authentication review | ✅ **scrypt hashing, constant-time comparison, fail-closed bootstrap** |

> **Note on `pip-audit`:** this tool may still report advisories against
> *transitive* dependencies pulled in by tooling such as Selenium or
> BeautifulSoup (for example, `pypdf`, `urllib3`, or `soupsieve`). These
> packages are not pinned directly in `requirements.txt` and will resolve to
> whichever version is newest at install time; the audit should therefore be
> re-run after installation, and any package it flags should be upgraded on
> its own rather than treated as a defect in this repository's code.

---

## Project Structure

```text
backend/
  app/
    database/       MySQL repository
    models/         Pydantic API models and validation
    routers/         Chat and destination routes
    services/        RAG, vector store, admin auth, circular ingestion
    config.py        Environment-backed settings
    startup.py       Vector-store population and synchronisation
  tests/             Backend regression tests
  main.py            FastAPI application and admin routes
  requirements.txt   Single Python dependency manifest
frontend/
  src/               React pages, components, hooks, and API client
  public/images/     Local destination and branding assets
  vercel.json        Deployment rewrite and frontend security headers
docs/
  schema.sql         New-installation MySQL schema
  migrations/        Incremental schema migrations
scripts/             Platform setup scripts
```

---

## Governance & Support

This system has been developed for the exclusive use of the **Tourism &
Civil Aviation Department, Government of Sikkim**, and will be maintained
under its authority. Any modification intended for production use should be
reviewed against the [Security Controls](#security-controls) and
[Quality Assurance](#quality-assurance--verification) sections above prior to
deployment.

<div align="center">

**Tourism & Civil Aviation Department · Government of Sikkim**

</div>
