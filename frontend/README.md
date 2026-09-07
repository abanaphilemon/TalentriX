# Talent Bridge AI — Frontend

A production-ready React landing page for **Talent Bridge AI**, an AI-powered recruitment platform. Built with Vite, Tailwind CSS, Framer Motion, and Three.js.

## ✨ Features

- **Hero** with floating 3D geometric shapes (torus, icosahedron, octahedron, orbiting cube) using `@react-three/fiber` + `@react-three/drei`
- **Glass morphism** throughout — translucent cards with backdrop-blur, soft borders, and layered shadows
- **Scroll-triggered fade-in animations** via Framer Motion + `react-intersection-observer`
- **Sticky glass header** with mobile hamburger drawer
- **Validated contact form** built with React Hook Form
- **Google sign-in / first-time onboarding** via Google Identity Services — first-time users pick a role before entering
- **Modern login/register page** with Login/Register tabs, email+password validation, and Google OAuth
- **Role-based entry flow** — pick Talent Hub / Job Seeker / Employer before authenticating
- **Fully responsive** — mobile / tablet / desktop
- **Gold-on-black accent system** (`#FFD700`, `#000`, `#FFF8E1`)

## 🛠 Tech Stack

| Layer       | Tools                                             |
| ----------- | ------------------------------------------------- |
| Framework   | React 18 + Vite                                   |
| Styling     | Tailwind CSS 3                                    |
| Animations  | Framer Motion 11                                  |
| 3D          | three.js, @react-three/fiber, @react-three/drei   |
| Auth        | @react-oauth/google, jwt-decode                   |
| Forms       | react-hook-form                                   |
| Icons       | lucide-react                                      |
| Scroll FX   | react-intersection-observer                       |

## 📁 Project Structure

```text
frontend/
├── .env.example              # VITE_GOOGLE_CLIENT_ID template
├── index.html
├── package.json
├── postcss.config.js
├── tailwind.config.js
├── vite.config.js
├── public/
│   └── favicon.svg
└── src/
    ├── main.jsx              # React entry point
    ├── App.jsx               # Root layout (wraps providers)
    ├── index.css             # Tailwind + glass utilities
    ├── context/
    │   └── AuthContext.jsx    # User state, role, auth methods
    ├── data/
    │   └── content.js         # Nav, testimonials, partners, roles
    └── components/
        ├── Header.jsx         # Sticky nav + mobile menu + user pill
        ├── Hero.jsx           # Full-viewport hero with CTAs
        ├── HeroScene.jsx      # 3D floating shapes
        ├── RoleSelectModal.jsx# Step 1: pick hub / seeker / employer
        ├── AuthPage.jsx       # Step 2: modern login/register w/ Google
        ├── CtaSection.jsx     # Bold mid-page CTA banner
        ├── About.jsx          # Two-column with feature grid
        ├── Testimonials.jsx   # 3 glass quote cards
        ├── Collaborators.jsx  # 2x3 partner logo grid
        ├── Contact.jsx        # Form + contact info
        └── Footer.jsx         # 4-column footer + copyright bar
```

## 🚀 Getting Started

### Prerequisites

- Node.js 18+ and npm (or pnpm/yarn)
- A Google Cloud OAuth **Web Client ID** (free) — see [🔐 Google Sign-In Setup](#-google-sign-in-setup) below

### Install & Run

```bash
cd frontend
cp .env.example .env       # then paste your VITE_GOOGLE_CLIENT_ID
npm install
npm run dev
```

The app starts on <http://localhost:5173>.

### Build for Production

```bash
npm run build      # outputs static files to dist/
npm run preview    # locally preview the production build
```

## 🔐 Auth Flow

Clicking **Get Started** opens a two-step flow:

1. **Pick a role** — Talent Hub / Job Seeker / Employer
2. **Login or Register** — Google OAuth *or* email + password

### Auth flow at a glance

| Step                | Component             | What happens                                              |
| ------------------- | --------------------- | --------------------------------------------------------- |
| 1. Role selection   | `RoleSelectModal`     | Pick one of 3 cards; advances to login/register           |
| 2. Login / Register | `AuthPage`            | Tabs for Login / Register; Google OAuth + email/password  |
| Success             | Header avatar pill    | Shows name + role badge + dropdown menu                   |

User state is persisted in `localStorage`:

- `tbai.user` — Google profile or email/password profile
- `tbai.role` — `'hub'` / `'seeker'` / `'employer'`
- `tbai.accounts` — list of registered email/password accounts
- `tbai.session` — current email/password session

## 🔐 Google Sign-In Setup

The Google OAuth button inside `AuthPage` uses **Google Identity Services**.

1. Go to <https://console.cloud.google.com/apis/credentials>
2. Create an **OAuth 2.0 Client ID** of type **Web application**
3. Under **Authorized JavaScript origins**, add `http://localhost:5173` (and your prod origin)
4. Copy the Client ID into `frontend/.env`:

   ```text
   VITE_GOOGLE_CLIENT_ID=xxxxxxxxxxxx.apps.googleusercontent.com
   ```

5. Restart `npm run dev`

> Without a Client ID the form still works — only the Google button shows a setup hint instead of breaking.

## 🎨 Design Tokens

Defined in `tailwind.config.js`:

| Token           | Value                              | Usage                         |
| --------------- | ---------------------------------- | ----------------------------- |
| `primary`       | `#FFD700`                          | CTAs, accents, gold gradients |
| `secondary`     | `#000000`                          | Headings, dark backgrounds    |
| `tertiary`      | `#FFFFFF`                          | Body surfaces, text on dark   |
| `accent`        | `#1a1a1a`                          | Subtle dark surfaces          |
| `hero-gradient` | white → `#FFF8E1` → gold           | Page background               |

## 🖼 Outsourced Assets

- Hero photo & About photo: <https://unsplash.com>
- Avatars: <https://ui-avatars.com>
- Google profile pictures: returned by Google Identity Services
- Partner logos: styled text (initials + brand name)
- Icons: <https://lucide.dev>

## 🧩 Customization

- **Copy & data**: edit `src/data/content.js`
- **Colors**: edit `tailwind.config.js` (`theme.extend.colors`)
- **3D scene**: tweak positions/colors in `src/components/HeroScene.jsx`
- **Auth flow**: edit `src/context/AuthContext.jsx`, `src/components/RoleSelectModal.jsx`, and `src/components/AuthPage.jsx`
- **Sections**: each file in `src/components/` is self-contained

## 📜 License

MIT — feel free to use this as a starting point for your own project.
