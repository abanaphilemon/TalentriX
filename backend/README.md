# TalentriX — Backend

Express + Mongoose backend for the TalentriX verified talent marketplace.

## Overview

All backend logic lives in a single file: `server.js`. It contains every Mongoose model, API endpoint, helper function, and scheduled job. This makes the backend easy to audit, deploy, and reason about.

## Tech Stack

| Package | Purpose |
|---------|---------|
| Express 5 | HTTP framework |
| Mongoose 9 | MongoDB ODM |
| bcryptjs | Password hashing |
| jsonwebtoken | JWT auth tokens |
| nodemailer | SMTP email (interview reminders, onboarding) |
| dotenv | Environment variable loading |
| cors | Cross-origin requests |

## Getting Started

### Prerequisites

- Node.js v18+
- MongoDB running locally (`mongodb://localhost:27017/talentbridge`) or an Atlas URI

### Install & Run

```bash
cd backend
cp .env.example .env   # edit with your secrets
npm install
npm start              # production
npm run dev            # development (nodemon)
```

Server runs on `http://localhost:5000` by default.

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `MONGO_URI` | Yes | `mongodb://localhost:27017/talentbridge` | MongoDB connection string |
| `PORT` | No | `5000` | HTTP port |
| `JWT_SECRET` | Yes | — | Secret for signing JWT tokens |
| `FRONTEND_URL` | Yes | `http://localhost:5173` | Used for CORS and redirects |
| `CORS_ORIGINS` | No | — | Comma-separated allowed origins |
| `SMTP_HOST` | No | — | SMTP server for interview emails (falls back to console log) |
| `SMTP_PORT` | No | `587` | SMTP port |
| `SMTP_USER` | No | — | SMTP username |
| `SMTP_PASS` | No | — | SMTP password |
| `SMTP_FROM` | No | — | From address for emails |

Monnify keys, chat pricing, and STUN/TURN servers are stored in the database via the admin CMS, not in env vars.

## Project Structure

```
backend/
├── server.js          ← all models, routes, helpers, and jobs
├── .env.example       ← env template
├── .env               ← your actual env (git-ignored)
├── package.json
└── README.md
```

## Database Models

All models are defined in `server.js`.

| Model | Purpose | Key Fields |
|-------|---------|------------|
| **User** | All accounts (hub/seeker/employer/admin) | `role`, `status`, `active`, `onboardingDone`, `interviewDone`, `pubkey`, `e2ePriv`, `hubRef`, `hubId`, `hubRating`, `experience[]`, `education[]`, `certifications[]`, `projects[]`, `cv` |
| **Message** | E2E encrypted chat messages | `from`, `to`, `iv`, `ct`, `read` |
| **SiteContent** | Landing page CMS content | Single document with `branding`, `hero`, `about`, `features`, `cta`, `collaborators`, `footer`, etc. |
| **Review** | Visitor reviews (admin-approved) | `name`, `rating`, `role`, `message`, `approved` |
| **Job** | Internal job listings | Standard job fields |
| **Interview** | Admin onboarding interview bookings | `seekerId`, `adminId`, `startAt`, `endAt`, `status` (proposed/accepted/rejected/completed/cancelled/expired) |
| **Signal** | WebRTC SDP offers/answers | `interviewId`, `callId`, `from`, `type` (offer/answer), `sdp` |
| **IceCandidate** | WebRTC ICE candidates | `interviewId`, `callId`, `from`, `candidate` |
| **TalentRequest** | Employer role-matching requests | `role`, `skills[]`, `tools[]`, `requirements[]`, `budget`, `results[]`, `status` |
| **Grant** | Hub-published grants | `hubId`, `title`, `description`, `deadline`, etc. |
| **SiteConfig** | Generic key/value config store | `key`, `value` (used for Monnify, chat pricing, ICE servers) |
| **ChatPayment** | Per-pair unlock payment | `employerId`, `seekerId`, `amount`, `paymentRef`, `status` (pending/paid/failed/closed), `lockedBy` |
| **ChatClosure** | Chat-ended record (post-template trigger) | `employerId`, `seekerId`, `employed`, `postAgreed`, `reason`, `status` |
| **Notification** | In-app bell notifications | `userId`, `type`, `title`, `body`, `payload`, `read` |
| **Call** | Instant video call rooms | `creatorId`, `callerId`, `status`, `roomType` |
| **CallSignal** / **CallIceCandidate** | Signaling for instant calls | Same pattern as interview signals |
| **SupportTicket** | User ↔ admin support thread | `userId`, `userRole`, `subject`, `category`, `status`, `priority`, `messages[]` |
| **TalentReview** | Employer review of an unlocked talent | `employerId`, `seekerId`, `rating` (1–5), `review` |
| **EmailConnection** | Seeker's connected mailbox (Gmail/Outlook/SMTP) | `userId` (unique), `provider`, `email`, `host`, `port`, `secure`, encrypted `secret` |
| **Application** | AI-assisted job application | `seekerId`, `jobId`, `jobTitle`, `company`, `toEmail`, `subject`, `coverLetter`, `method` (email/draft), `status` (draft/sent/failed) |

## API Endpoints

### Public (no auth)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/` | Health check |
| `POST` | `/api/register` | Register a new account |
| `POST` | `/api/login` | Login (matches email + role) |
| `GET` | `/api/jobs` | List job postings |
| `GET` | `/api/jobs/external` | External job feeds (Remotive, Arbeitnow, RemoteOK) |
| `GET` | `/api/grants/external` | External grant feeds (grants.gov, EU Funding) |
| `GET` | `/api/public/profile/:id` | Public portfolio for a job seeker |
| `GET` | `/api/seekers/:id/reviews` | Public talent reviews (shown at the bottom of the portfolio) |
| `GET` | `/api/content` | Landing page content |
| `GET` | `/api/reviews` | Approved visitor reviews |
| `POST` | `/api/reviews` | Submit a review (pending approval) |
| `POST` | `/api/payment/webhook` | Monnify payment callback |

### Authenticated (any role)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/dashboard` | Role-appropriate dashboard data |
| `GET` | `/api/me` | Current user profile |
| `GET` / `PUT` | `/api/profile` | Read / update own profile |
| `POST` | `/api/request-reset` | Email a password-reset code (email + role) |
| `POST` | `/api/reset-password` | Redeem a reset code and set a new password |
| `GET` / `PUT` | `/api/chat/keys` | Get / provision E2E keypair |
| `GET` | `/api/chat/threads` | List chat threads |
| `GET` | `/api/chat/unread` | Unread message count |
| `GET` | `/api/chat/thread/:id` | Messages in a thread |
| `POST` | `/api/chat/messages` | Send a chat message |
| `POST` | `/api/interviews/propose` | Propose an onboarding interview slot |
| `GET` | `/api/interviews/me` | My interviews |
| `GET` | `/api/interviews/slots` | Available slots |
| `GET` | `/api/interview/iceServers` | STUN/TURN config |
| Signal/ICE endpoints | `/api/interviews/signal/*`, `/api/interviews/ice/*` | WebRTC signaling |
| `POST` | `/api/calls` | Create instant call room |
| `GET` | `/api/calls/:id` | Get call room |
| `POST` | `/api/calls/:id/close` | Close call room |
| Signal/ICE endpoints | `/api/calls/signal/*`, `/api/calls/ice/*` | Instant call signaling |
| `GET` | `/api/notifications` | List notifications |
| `POST` | `/api/notifications/read-all` | Mark all read |
| `POST` | `/api/notifications/:id/read` | Mark one read |
| `POST` | `/api/support/tickets` | Open a support ticket |
| `GET` | `/api/support/tickets` | List my own tickets |
| `GET` | `/api/support/tickets/:id` | View one of my tickets |
| `POST` | `/api/support/tickets/:id/messages` | Reply on my ticket (owner only) |
| `GET` | `/api/ai/status` | Whether the platform AI is configured |
| `GET` | `/api/email/status` | Connected mailbox status |
| `POST` | `/api/email/connect` | Connect Gmail/Outlook/SMTP (verifies + stores encrypted) |
| `DELETE` | `/api/email/connect` | Disconnect the mailbox |
| `POST` | `/api/ai/apply/draft` | AI-draft a cover letter for a job (no send) |
| `POST` | `/api/ai/apply/send` | Email the application + CV from the seeker's inbox (or record a draft) |
| `GET` | `/api/applications` | My AI applications (sent + drafts) |

### Hub-only

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/hub/link` | Get unique invite link |
| `GET` | `/api/hub/seekers` | List hub members |
| `PUT` | `/api/hub/rate/:id` | Endorse/rate a member |
| `GET` | `/api/hub/grants` | List grants |
| `POST` | `/api/hub/grants` | Create a grant |
| `PUT` | `/api/hub/grants/:id` | Update a grant |
| `DELETE` | `/api/hub/grants/:id` | Delete a grant |

### Employer-only

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/seekers` | Browse talent pool (filterable by skill, hub, email) |
| `GET` | `/api/hubs` | List partner hubs |
| `POST` | `/api/talent-requests` | Create a talent-matching request |
| `GET` | `/api/talent-requests` | List my requests |
| `POST` | `/api/talent-requests/:id/match` | Run matching |
| `DELETE` | `/api/talent-requests/:id` | Close a request |
| `POST` | `/api/payment/init` | Initiate Monnify payment |
| `GET` | `/api/payment/price` | Current chat pricing |
| `GET` | `/api/payment/check/:seekerId` | Check payment status for a seeker |
| `GET` | `/api/payment/my-payments` | My payment history |
| `GET` | `/api/payment/verify/:paymentRef` | Verify payment status |
| `POST` | `/api/chat/leave` | Leave chat (triggers closure + lock) |
| `DELETE` | `/api/chat/thread/:id` | Remove a conversation from my inbox only (partner's copy is untouched) |
| `GET` | `/api/employer/chat-closures/pending` | Pending closure records |
| `POST` | `/api/employer/chat-closures/:id/answer` | Answer closure (employed? post templates?) |
| `GET` | `/api/employer/reviewables` | Talents I've unlocked that can be reviewed |
| `GET` | `/api/employer/reviews` | My reviews of talent |
| `POST` | `/api/seekers/:id/review` | Create / update a review for an unlocked talent |

### Admin-only

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/admin/users` | List all users |
| `PATCH` | `/api/admin/users/:id` | Approve / reject / toggle active |
| `DELETE` | `/api/admin/users/:id` | Hard delete a user |
| `GET` | `/api/admin/reviews` | List all reviews |
| `PATCH` | `/api/admin/reviews/:id` | Approve / reject a review |
| `DELETE` | `/api/admin/reviews/:id` | Delete a review |
| `GET` | `/api/admin/interviews` | List all interviews |
| `PATCH` | `/api/admin/interviews/:id` | Accept / reject / cancel / complete |
| `GET` | `/api/admin/support/tickets` | List all support tickets (filter by `status`, `q`) |
| `GET` | `/api/admin/support/tickets/:id` | View a ticket's full thread |
| `POST` | `/api/admin/support/tickets/:id/messages` | Reply as admin (notifies the owner) |
| `PATCH` | `/api/admin/support/tickets/:id` | Update status / priority (notifies the owner) |
| `DELETE` | `/api/admin/talent-reviews/:id` | Delete an inappropriate talent review |
| `GET` | `/api/admin/config/:key` | Read platform config |
| `PUT` | `/api/admin/config/:key` | Write platform config (AI key kept when blank) |
| `POST` | `/api/admin/ai/models` | Live-test a provider key and list its models |
| `GET` | `/api/admin/ai/config` | Saved AI config (key masked) + live model list |
| `GET` | `/api/admin/applications` | Every AI application across the platform |
| `PUT` | `/api/admin/me/credentials` | Change admin password |
| `PUT` | `/api/content` | Save landing page content |
| `POST` | `/api/content/reset` | Reset content to defaults |

## Key Flows

### Registration & Approval

1. User registers (email + password or Google OAuth) with a role (`hub`/`seeker`/`employer`).
2. Account starts as `status: 'pending'`.
3. Admin approves via `PATCH /api/admin/users/:id`.
4. Hubs and seekers then complete onboarding (profile + portfolio) and an admin interview.
5. Employer accounts skip onboarding and go straight to their dashboard.

### Secure Chat

1. Employer pays a one-off fee via Monnify (`POST /api/payment/init` → redirect → webhook).
2. Payment unlocks chat + call for that employer↔seeker pair.
3. Both parties provision ECDH keypairs (`PUT /api/chat/keys`).
4. Messages are encrypted client-side; server stores only `iv` + `ct` (AES-GCM ciphertext).
5. Chat auto-locks after 48 hours idle or when the employer leaves (`POST /api/chat/leave`).
6. Locking creates a `ChatClosure` record — the post-template sharing flow begins.

### Video Calls

**Onboarding interviews:**
1. User proposes a slot (`POST /api/interviews/propose`) — Lagos timezone, 3-hour blocks.
2. Admin accepts (`PATCH /api/admin/interviews/:id`).
3. Both join the WebRTC room; SDP + ICE signals are polled from MongoDB.

**Instant chat calls:**
1. Employer initiates from SecureChat (`POST /api/calls`).
2. Receiver picks up; both join the same WebRTC room.
3. Same polling-based signaling mechanism.

### Post-Template Sharing

1. Chat locks (leave or 48h expiry) → `ChatClosure` created.
2. Employer sees closure popup, answers: employed? share news?
3. If yes: `buildPostTemplates` generates LinkedIn / Instagram / X captions + 1080×1080 SVG designs.
4. Templates delivered as notifications to **employer**, **talent**, and **hub** (if linked) — each with personalized copy.

### Customer Support Tickets

1. Hub / seeker / employer opens a ticket (`POST /api/support/tickets`) from the dashboard's Help button.
2. Ticket stores a user↔admin message thread (`messages[]`, each tagged `from: user|admin`).
3. Admin answers from the **Support Tickets** section in the admin panel; each reply and status change creates a `Notification` (type `support`) for the ticket owner — surfacing in their bell.
4. Owners can keep chatting until the ticket is `closed`.

### Talent Reviews

1. An employer who has ever unlocked a talent (payment status `paid` or `closed`) is eligible to review them.
2. `GET /api/employer/reviewables` lists eligible talents + any existing review; the employer rates 1–5 stars with an optional note (`POST /api/seekers/:id/review`, one review per pair, editable).
3. Reviews appear at the **bottom of the talent's public portfolio** (`GET /api/seekers/:id/reviews`).
4. Admins can remove inappropriate reviews (`DELETE /api/admin/talent-reviews/:id`).

### AI Auto-Apply

1. **Admin setup:** In the admin panel's **AI & Automation → AI Auto-Apply** section the admin picks a provider, enters an API key, loads the live model list, and picks the model (auto-selected when only one exists). Saved via `PUT /api/admin/config/ai` into the `SiteConfig('ai')` doc.
2. **Seeker connects their inbox:** In the "Apply with AI" modal a seeker connects Gmail / Outlook / custom SMTP with an app password (`POST /api/email/connect`). Credentials are verified and the password stored AES-256-GCM encrypted.
3. **Drafting:** The seeker clicks **Apply with AI** on a job → `POST /api/ai/apply/draft` has the configured model write a tailored cover letter (subject + body) from the seeker's structured profile + plain-text CV (`cv` data URL), returning an editable draft + any discovered apply email.
4. **Sending:** The seeker confirms → `POST /api/ai/apply/send`.
   - With a destination address: the application email (cover letter + CV attachment) is sent **from the seeker's own inbox**; an `Application` record is stored with status `sent` and a `Notification` is created.
   - Without an address: the application is recorded as status `draft` and the seeker is handed off to the original posting to finish manually.
5. **Visibility:** Seekers track everything in the **My Applications** tab; admins see all applications in the admin AI section.
6. **Providers supported:** OpenAI, Google Gemini, Anthropic (native APIs) plus Groq, OpenRouter, Together and any OpenAI-compatible base URL.

## Security Notes

- **E2E encryption:** Server never sees plaintext chat. Each user has an ECDH P-256 keypair; messages use AES-GCM.
- **Contact locking:** Email, phone, LinkedIn, GitHub, website are masked for anyone without a paid connection.
- **Role-scoped login:** An account only works in its own role space (employer login won't work as seeker).
- **Admin interview gate:** Hubs and seekers cannot access their dashboard until interviewed.
- **Payment isolation:** Each payment is scoped to one employer↔seeker pair and cannot be reused.

## Troubleshooting

- **MongoDB connection error:** Ensure MongoDB is running locally or `MONGO_URI` points to a valid Atlas cluster.
- **Email not sending:** Without SMTP configured, emails are logged to the console. Check `server.log` or stdout.
- **JWT errors:** Ensure `JWT_SECRET` is set and consistent across server restarts.
- **CORS errors:** Add your frontend origin to `CORS_ORIGINS` in `backend/.env`.

## License

ISC
