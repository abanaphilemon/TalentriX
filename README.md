# TalentriX — Verified Talent Marketplace

A secure, end-to-end platform connecting **employers**, **talent hubs**, and **job seekers** through verified portfolios, encrypted messaging, and built-in video calls.

## What TalentriX Is

TalentriX is **not** a job board. It is a controlled, verified marketplace where:

- **Job seekers** build a structured public portfolio, get approved by an administrator, and complete a live onboarding video interview before entering the talent pool.
- **Talent hubs** generate a unique invite link for their community, endorse and rate their members, and publish grants.
- **Employers** browse a filterable talent pool, view candidate portfolios, unlock a private E2E-encrypted chat for a small one-off connect fee, and start a video call — no third-party tools required.
- **Admins** approve accounts, run onboarding interviews, manage CMS content, and moderate the platform.

## How the System Works

### 1. Registration & Onboarding

Every new account starts as `pending`. An administrator must approve it. Hubs and job seekers then go through a structured onboarding flow (profile, portfolio, skills, experience), followed by a mandatory onboarding video interview with an admin. Only after the interview is marked `completed` does the dashboard unlock.

### 2. Talent Pools & Portfolios

Job seekers who complete onboarding appear in the employer talent pool. Each seeker has a public portfolio page (`/portfolio/:id`) showing: skills, experience, education, certifications, projects, languages, and a hub endorsement badge (if they joined via a hub invite link). Contact details (email, phone, LinkedIn, GitHub, website) are masked by default.

### 3. Secure Paid Chat

Employers pay a small one-off fee (configurable, processed through Monnify) to unlock a private chat with a specific candidate. The chat is **end-to-end encrypted** — the server stores only AES-GCM ciphertext and never reads message content. Messages flow between two WebRTC-provisioned ECDH keypairs. The employer can message and call; the candidate replies free.

### 4. Chat Locking & Post-Template Sharing

A paid chat locks after 48 hours of inactivity, or when the employer explicitly leaves the chat. When a chat ends, a closure record is created. The employer is asked whether the hire was successful and whether they'd like to share the news. If they agree, personalized social media post templates (LinkedIn, Instagram, X) are generated and delivered as in-app notifications to the employer, the talent, and the hub (if linked). Each party receives captions written from their own perspective, plus a downloadable 1080×1080 collaboration design.

### 5. Video Calls

Built-in WebRTC video calls work in two contexts:
- **Onboarding interviews:** admin-scheduled calls between a user and an admin (3-hour Lagos timezone blocks).
- **Instant chat calls:** on-demand calls between an employer and a paid-for candidate, opened from within the secure chat.

Both use a self-hosted signaling mechanism (SDP offers/answers + ICE candidates stored and polled via MongoDB), with configurable STUN/TURN servers.

### 6. Talent Requests

Employers can describe a role (title, skills, tools, requirements, budget) and receive a ranked list of matched candidates from the pool. Matching is scored: skills (50%), tools (30%), role fit (20%) using substring and fuzzy matching.

### 7. Admin CMS

Administrators manage the entire landing page through an in-app CMS (branding, hero, about, features, CTA, partners, footer, contact). Content is stored in MongoDB and served to the frontend via `GET /api/content`. The CMS also manages review moderation, user approvals, interview scheduling, and platform configuration (Monnify keys, chat pricing, ICE servers).

## Architecture

```
┌──────────────┐      ┌──────────────┐
│   Frontend   │─────→│   Backend    │
│   (Vite +    │      │  (Express 5  │
│    React)    │      │  + Mongoose) │
└──────┬───────┘      └──────┬───────┘
       │                     │
       │  /api proxy         │
       └─────────────────────┘

Frontend:  Vercel (static SPA, /api proxied to backend)
Backend:   Render  (Node.js, MongoDB Atlas or local)
Payments:  Monnify (Nigerian payment gateway — card/transfer)
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Vite 5, Tailwind CSS 3, Framer Motion 11, Three.js (hero 3D scene) |
| Backend | Node.js, Express 5, Mongoose 9, bcryptjs, jsonwebtoken, nodemailer |
| Database | MongoDB (Atlas or local) |
| Auth | Email/password + Google OAuth, JWT tokens |
| Payments | Monnify (card, bank transfer) |
| Video/WebRTC | Self-hosted signaling via MongoDB polls + STUN/TURN |
| Deployment | Vercel (frontend) + Render (backend) |

## Directory Structure

```
Talent-Bridge-AI/
├── README.md                   ← this file
├── package.json                ← root: setup, dev, build, start scripts
├── backend/
│   ├── README.md               ← backend-specific docs
│   ├── server.js               ← all backend code (Express, models, routes, helpers)
│   ├── .env.example            ← environment variable template
│   └── package.json
├── frontend/
│   ├── README.md               ← frontend-specific docs
│   ├── src/
│   │   ├── main.jsx            ← React entry point
│   │   ├── App.jsx             ← routes, guards, layout
│   │   ├── context/
│   │   │   ├── AuthContext.jsx  ← auth state, role, sign-in/out
│   │   │   └── ContentContext.jsx ← CMS content (landing page data)
│   │   ├── data/content.js      ← default static data (fallback)
│   │   ├── lib/image.js         ← image utilities
│   │   ├── pages/               ← page-level components (dashboards, etc.)
│   │   └── components/          ← reusable UI (Header, Hero, SecureChat, etc.)
│   ├── index.html
│   ├── vite.config.js
│   ├── tailwind.config.js
│   ├── postcss.config.js
│   └── vercel.json              ← SPA rewrite + /api proxy to Render
└── deliverables/                 ← project submission documents
```

## Quick Start

### Prerequisites

- Node.js v18+
- MongoDB (local install or Atlas URI)

### 1. Clone & install

```bash
git clone <repo-url>
cd Talent-Bridge-AI
npm run setup
```

This installs backend and frontend dependencies and copies `.env.example` → `.env` in each directory.

### 2. Configure environment

Edit `backend/.env`:

```bash
MONGO_URI=mongodb://localhost:27017/talentbridge
PORT=5000
JWT_SECRET=<any-random-secret>
FRONTEND_URL=http://localhost:5173
CORS_ORIGINS=http://localhost:5173

# Optional: SMTP for interview reminder emails (falls back to console logging)
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=your_smtp_username
SMTP_PASS=your_smtp_password
SMTP_FROM=TalentriX <noreply@example.com>
```

Edit `frontend/.env`:

```bash
VITE_API_URL=http://localhost:5000/api
VITE_GOOGLE_CLIENT_ID=<your-google-oauth-client-id>
```

### 3. Start development

```bash
npm run dev          # runs backend (port 5000) + frontend (port 5173) in parallel
```

### 4. First-time setup

1. Open `http://localhost:5173`
2. Register as an **Employer** or **Hub** or **Job Seeker**
3. Log in to the admin panel (`/admin` — default credentials in `.env` or DB) and approve the new account
4. Hubs and seekers must complete onboarding + interview before accessing their dashboard

## Key Features at a Glance

| Feature | How It Works |
|---------|-------------|
| Public portfolios | `/portfolio/:id` — skills, experience, projects, endorsements |
| Encrypted chat | E2E via ECDH keypairs + AES-GCM; server stores only ciphertext |
| Video calls | Self-hosted WebRTC signaling via MongoDB (no third-party) |
| Paid connect | One-off fee via Monnify to unlock chat + call with a candidate |
| Hub endorsement | Hubs rate and recommend their talent; badge shown on portfolios |
| Post-templates | LinkedIn/Instagram/X captions + 1080×1080 designs after a confirmed hire |
| Admin CMS | Full landing page editor via `/admin` panel |
| AI interview scheduling | Admin-scheduled onboarding video calls (Lagos timezone blocks) |
| Talent matching | Rule-based scoring (skills 50%, tools 30%, role fit 20%) |

## Deployment

### Frontend (Vercel)

1. Push to GitHub
2. Import the repo in Vercel
3. Framework: Vite, Root Directory: `frontend`, Build Command: `npm run build`, Output: `dist`
4. Add env: `VITE_API_URL` = your Render backend URL + `/api` (or leave unset — `vercel.json` rewrites `/api/*` to the default Render URL)

### Backend (Render)

1. Create a Web Service on Render
2. Root Directory: `backend`
3. Build Command: `npm install`
4. Start Command: `npm start`
5. Add env vars from `backend/.env.example`

### MongoDB

Use MongoDB Atlas (free tier) or a local instance. Set `MONGO_URI` in `backend/.env`.

## License

ISC
