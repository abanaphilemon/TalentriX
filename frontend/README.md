# TalentriX — Frontend

React single-page application for the TalentriX verified talent marketplace. Built with Vite, Tailwind CSS, Framer Motion, and Three.js.

## Overview

The frontend serves two purposes:

1. **Landing page** — a public marketing site (hero, about, reviews, partners, contact) with content managed via an admin CMS.
2. **Authenticated dashboards** — role-based views for hubs, job seekers, employers, and admins, including onboarding, portfolios, secure chat, video calls, and post-template sharing.

## Tech Stack

| Layer | Tools |
|-------|-------|
| Framework | React 18 + Vite 5 |
| Styling | Tailwind CSS 3, PostCSS |
| Animations | Framer Motion 11, react-intersection-observer |
| 3D | Three.js, @react-three/fiber, @react-three/drei (hero scene) |
| Routing | react-router-dom 7 |
| Auth | @react-oauth/google, jwt-decode |
| Forms | react-hook-form |
| Icons | lucide-react |

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- Backend running on `http://localhost:5000` (see `backend/README.md`)

### Install & Run

```bash
cd frontend
cp .env.example .env    # fill in your values
npm install
npm run dev             # starts on http://localhost:5173
```

### Build for Production

```bash
npm run build           # outputs to dist/
npm run preview         # preview the production build locally
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_API_URL` | Yes | Backend API URL. Use `http://localhost:5000/api` for local dev. Leave unset for Vercel (proxied via `vercel.json`). |
| `VITE_GOOGLE_CLIENT_ID` | Yes | Google OAuth Web Client ID for the "Get Started" Google sign-in button. Create one at [Google Cloud Console](https://console.cloud.google.com/apis/credentials). |

## Project Structure

```
frontend/
├── index.html
├── package.json
├── vite.config.js              ← Vite config (proxy /api → localhost:5000)
├── tailwind.config.js          ← Tailwind theme (primary: #FFD700, secondary: #000)
├── postcss.config.js
├── vercel.json                 ← SPA rewrite + /api proxy to Render backend
├── public/
│   └── favicon.svg
└── src/
    ├── main.jsx                ← React entry point
    ├── App.jsx                 ← All routes, role guards, layout
    ├── index.css               ← Tailwind directives + glass utilities
    ├── context/
    │   ├── AuthContext.jsx     ← Auth state, role, sign-in/out, token
    │   └── ContentContext.jsx  ← CMS content (fetched from /api/content)
    ├── data/
    │   └── content.js          ← Default static content (fallback when DB is empty)
    ├── lib/
    │   └── image.js            ← Image read/conversion utilities
    ├── components/
    │   ├── Header.jsx          ← Sticky glass nav, user pill, mobile drawer
    │   ├── Hero.jsx            ← Full-viewport hero with 3D scene
    │   ├── HeroScene.jsx       ← Three.js floating geometric shapes
    │   ├── About.jsx           ← Two-column about section
    │   ├── CtaSection.jsx      ← Dark CTA banner (also exports FadeIn helper)
    │   ├── Reviews.jsx         ← Approved reviews + submit form
    │   ├── Collaborators.jsx   ← Partner logo grid
    │   ├── Contact.jsx         ← Contact form + info card
    │   ├── Footer.jsx          ← 4-column footer + newsletter
    │   ├── RoleSelectModal.jsx ← Step 1: pick hub / seeker / employer
    │   ├── AuthPage.jsx        ← Step 2: login / register (email + Google)
    │   ├── SecureChat.jsx      ← E2E encrypted chat + video call UI
    │   ├── ChatClosureModal.jsx← Chat-ended popup (employed? share news?)
    │   ├── NotificationCenter.jsx ← In-app bell (notifications, post templates, support)
    │   ├── SupportCenter.jsx     ← User help ticket modal (create / view / reply)
    │   └── SupportManager.jsx    ← Admin support-ticket manager (list, reply, status)
    └── pages/
        ├── HubDashboard.jsx        ← Hub: talent pool, grants, endorsements
        ├── SeekerDashboard.jsx     ← Seeker: portfolio editor, jobs, grants
        ├── EmployerDashboard.jsx   ← Employer: talent pool, chat, payment, closures, talent reviews
        ├── PortfolioPage.jsx       ← Public portfolio view (/portfolio/:id)
        ├── OnboardingPage.jsx      ← Profile setup (hub + seeker)
        ├── InterviewSchedulingPage.jsx ← Propose onboarding interview slot
        ├── VideoCallPage.jsx       ← WebRTC video call room
        ├── RegisterPage.jsx        ← Standalone registration page
        ├── AdminLoginPage.jsx      ← Admin login
        ├── AdminDashboard.jsx      ← Admin: CMS, users, reviews, interviews, config
        └── EmployerRequestTalent.jsx ← Employer: describe a role, get matches
```

## Pages & Routes

| Path | Component | Description |
|------|-----------|-------------|
| `/` | `LandingPage` | Public marketing site (hero, about, reviews, partners, contact) |
| `/register` | `RegisterPage` | Registration page (guests only) |
| `/onboarding` | `OnboardingPage` | Profile + portfolio setup (hub/seeker, pre-dashboard) |
| `/interview` | `InterviewSchedulingPage` | Propose a video interview slot (hub/seeker) |
| `/call/:id` | `VideoCallPage` | WebRTC video call room |
| `/portfolio/:id` | `PortfolioPage` | Public job seeker portfolio |
| `/dashboard/hub` | `HubDashboard` | Hub dashboard (talent pool, grants, endorsements) |
| `/dashboard/seeker` | `SeekerDashboard` | Job seeker dashboard (portfolio, jobs, grants) |
| `/dashboard/employer` | `EmployerDashboard` | Employer dashboard (talent pool, chat, payment, closures, rate & review unlocked talent) |
| `/admin` | `AdminDashboard` | Admin CMS + user/interview/review/support-ticket management |

## Key Features

### Landing Page

- Hero with 3D floating geometric shapes (Three.js via @react-three/fiber)
- Content managed via admin CMS — fetched from `GET /api/content`, falls back to static defaults
- Reviews section with visitor submission form (admin-approved before display)
- Fully responsive, scroll-animated sections (Framer Motion + intersection observer)

### Auth Flow

1. Click "Get Started" → `RoleSelectModal` (pick hub/seeker/employer)
2. → `AuthPage` (login or register tabs, Google OAuth + email/password)
3. On success: JWT stored in `localStorage` as `tbai.token`, role as `tbai.role`
4. Role-specific guards in `App.jsx` route to the correct dashboard or onboarding

### Onboarding Flow (Hubs & Seekers)

1. `/onboarding` — structured profile setup (photo, skills, experience, education, CV upload)
2. `/interview` — propose a video interview slot (Lagos timezone, 3-hour blocks)
3. Admin approves → interview marked completed → dashboard unlocks

### Employer Dashboard

- **Talent Pool:** filterable/searchable grid; click to view portfolio or open chat
- **Secure Chat:** E2E encrypted messages; "Video call" button opens a WebRTC room in a new tab; "Leave chat" triggers the closure flow
- **Payment:** one-off fee via Monnify to unlock chat with a candidate
- **Closure Modal:** when chat locks, employer answers: employed? share news? → post templates
- **Notification Bell:** in-app notifications (post-template delivery with copy/download)

### Job Seeker Dashboard

- **Portfolio Editor:** structured profile (skills, experience, education, certifications, projects, languages)
- **Job Listings:** internal jobs + external feeds (RemoteOK, Remotive, Arbeitnow)
- **Grant Catalog:** grants published by their hub (if linked)
- **Secure Chat:** reply to employer messages, initiate video calls
- **Notification Bell:** post-template delivery after a confirmed hire

### Hub Dashboard

- **Talent Pool:** list of registered members, endorse/rate each member
- **Grant Catalog:** create, edit, delete grants for your talent pool
- **Invite Link:** unique registration link for new talent
- **Notification Bell:** post-template delivery after a confirmed hire (if hub-linked)

### Admin Dashboard

- **Content CMS:** full landing page editor (hero, about, features, CTA, partners, footer, contact)
- **User Management:** approve / reject / toggle accounts
- **Interview Management:** accept / reject / complete onboarding interviews
- **Review Moderation:** approve / reject visitor reviews
- **Support Tickets:** list, search, reply to, and change status/priority of user tickets (open-count badge in the sidebar)
- **Platform Config:** Monnify keys, chat pricing, ICE server config

### Video Calls

Self-hosted WebRTC signaling (no Twilio/Daily.co). SDP offers/answers and ICE candidates are stored in MongoDB and polled by both parties. Supports:
- Admin onboarding interviews (scheduled via the interview page)
- Instant chat calls (opened from SecureChat, requires active payment)

### Post-Template Sharing

When a chat ends (leave or 48h expiry), the closure flow generates:
- LinkedIn / Instagram / X captions (personalized per party: employer, talent, hub)
- 1080×1080 SVG collaboration design (downloadable as PNG)
- Delivered via in-app notifications to all three parties

### Customer Support Tickets

- Every dashboard (hub / seeker / employer) has a **Help & Support** button in the header
- Users open tickets (subject, category, message), view their ticket history, and keep replying until the ticket is closed
- The admin panel's **Support Tickets** section lists/search/filters tickets, shows the full user↔admin thread, and lets admin reply or move status (open / in progress / resolved / closed)
- Admin replies and status changes notify the user through the bell (type `support`)

### Talent Reviews

- Employers can **rate (1–5 ★) and review** any talent they have previously unlocked (ever paid)
- A **Review** / **Reviewed** star button appears on matching talent cards; a "Review this talent" modal handles stars + optional note (editable)
- Reviews render at the bottom of the talent's **public portfolio** under "What employers say"
- Admin can delete inappropriate reviews via the backend endpoint

## Design Tokens

| Token | Value | Usage |
|-------|-------|-------|
| `primary` | `#FFD700` | CTAs, accents, gold gradients |
| `secondary` | `#000000` | Headings, dark backgrounds |
| `tertiary` | `#FFFFFF` | Body surfaces, text on dark |

## Deployment

### Vercel (recommended)

1. Import the GitHub repo in Vercel
2. Framework: Vite, Root Directory: `frontend`
3. Build Command: `npm run build`, Output: `dist`
4. Env: set `VITE_GOOGLE_CLIENT_ID`
5. `vercel.json` rewrites `/api/*` to the default Render backend automatically

### Manual

```bash
npm run build        # static files in dist/
# serve dist/ with any static server (nginx, Caddy, etc.)
```

## License

MIT
