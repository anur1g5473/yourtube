<div align="center">

# ▶️ YourTube

### A video-sharing and learning platform built on the original internship training project

**Next.js · Express · MongoDB · Firebase**

</div>

YourTube extends the existing training project with video discovery and playback, account security, memberships, downloads, moderated comments, and private video meetings. The original stack and project structure are retained.

> **Project status:** Core features are implemented and the app builds locally. Provider-backed checks (including Razorpay test checkout, live JaaS meetings, and translation) still require provider credentials. Hosting and live end-to-end checks are not completed by this repository.

## ✨ Highlights

- 🎬 **Video library and player** — explore and search videos, resume watch progress, view timeline previews, and switch among quality renditions supplied with an upload.
- 🔐 **Private playback and downloads** — authenticated, short-lived playback links, premium-access checks, range streaming, and download quotas/history.
- 💳 **Memberships** — plan comparison, payment-order creation and verification, billing history, cancellation, and entitlement checks.
- 💬 **Comments and moderation** — replies, reactions, edit history, reports, moderator review, optional CAPTCHA, and configurable translation.
- 🛡️ **Account security** — email/SMS verification flows, trusted-device/session management, security activity, and optional local GeoLite2 lookup.
- 📹 **Meetings** — private Jitsi as a Service (JaaS) rooms with short-lived tokens and host controls.
- 📱 **Responsive UI** — Next.js Pages Router frontend with desktop and mobile layouts.

## 🧰 Technology

| Area | Stack |
| --- | --- |
| Frontend | Next.js 15, React 19, TypeScript, Tailwind CSS |
| Backend | Node.js, Express 5 |
| Database | MongoDB with Mongoose |
| Identity | Firebase Authentication |
| Integrations | Razorpay, Resend, Twilio Verify, Cloudflare Turnstile, JaaS, optional MaxMind GeoLite2 |

## 📁 Repository layout

```text
.
├── server/             # Express API, MongoDB models, media and provider services
├── yourtube/           # Next.js frontend
├── start.bat           # Windows local launcher (MongoDB + API + frontend)
├── README.md           # Project overview and setup
└── server/render.yaml  # Render configuration with a persistent media disk
```

## 🚀 Run locally

### Requirements

- Node.js and npm
- MongoDB Community Server
- A Firebase project for Google sign-in (needed for authentication; public pages can be previewed without signing in)

### Fast start on Windows

1. Clone or download the repository.
2. Install the project dependencies once:

   ```powershell
   cd server
   npm ci
   cd ..\yourtube
   npm ci
   ```

3. Double-click `start.bat` in the project root.
4. Open **http://localhost:3000**. The backend runs on **http://localhost:5000**.

The launcher tries to start `mongod` if it is on `PATH` or installed in a sibling `mongodb*` directory. If there is no `server/.env`, it uses the local MongoDB URL, the Firebase project configured by the frontend, and newly generated temporary session/media secrets for that run. MongoDB data is stored under `%LOCALAPPDATA%\YourTube\MongoData`. It does not overwrite existing environment files.

### Configure local environment manually

For repeatable configuration, create `server/.env` from `server/.env.example` and `yourtube/.env.local` from `yourtube/.env.example`.

Set at least the following values in `server/.env`:

```env
PORT=5000
DB_URL=mongodb://127.0.0.1:27017/yourtube
FIREBASE_PROJECT_ID=your-firebase-project-id
APP_SESSION_SECRET=use-a-random-secret-at-least-32-characters-long
MEDIA_TOKEN_SECRET=use-a-different-random-secret-at-least-32-characters
UPLOAD_DIR=./uploads
```

Set the frontend API URL in `yourtube/.env.local`:

```env
NEXT_PUBLIC_BACKEND_URL=http://localhost:5000
```

Configure the Firebase web app values in `yourtube/src/lib/firebase.js` to match the project ID used by the backend. In Firebase Authentication, enable Google sign-in and authorize `localhost` for local development.

Start MongoDB, then run the backend and frontend in separate terminals:

```powershell
# Terminal 1
cd server
npm run dev
```

```powershell
# Terminal 2
cd yourtube
npm run dev
```

The backend waits for MongoDB before listening. Check **http://localhost:5000/health** for `{"status":"ok"}` when the database is connected. If it reports `database_unavailable`, check MongoDB and `DB_URL`.

### Browse without provider credentials

You can open the frontend without configuring paid/external providers. Public pages can render, but actions that need the API require a running backend and MongoDB. Sign-in, protected playback/downloads, payment checkout, email/SMS delivery, CAPTCHA, translation, GeoIP, and JaaS each depend on their corresponding configuration.

## 🧪 Tests and build

Run the backend tests:

```powershell
cd server
npm test
```

Build and type-check the frontend:

```powershell
cd yourtube
npm run build
```

Run the backend directly in production mode with `npm start` from `server/`. Run the built frontend with `npm start` from `yourtube/`.

## 🔌 Optional integrations

Provider credentials belong in the backend environment unless marked public. Do not commit secrets, `.env` files, private keys, database connection strings, or GeoLite database files.

| Feature | Environment variables | Notes |
| --- | --- | --- |
| Razorpay test checkout | `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` | Use test-mode credentials for simulated payments. Never expose the secret to the browser. |
| Security/receipt email | `RESEND_API_KEY`, `SECURITY_EMAIL_FROM`; optional `SUPPORT_EMAIL` | The sender address/domain must be verified with the email provider. |
| SMS verification | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_VERIFY_SERVICE_SID` | Uses Twilio Verify; phone ownership must be verified before SMS sign-in. |
| Comment CAPTCHA | Backend `TURNSTILE_SECRET_KEY`; frontend `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Use keys registered for the frontend domain. |
| Translation | `TRANSLATION_API_URL`; optional `TRANSLATION_API_KEY` | Requires a provider compatible with the backend's expected API format. |
| JaaS meetings | `JITSI_APP_ID`, `JITSI_API_KEY_ID`, `JITSI_PRIVATE_KEY` | Live room creation and calls require valid JaaS credentials. |
| Moderator access | `MODERATOR_EMAILS` | Comma-separated account email addresses. |
| Local GeoIP | `GEOIP_DB_PATH` | Points to a locally supplied GeoLite2 City `.mmdb` file; do not commit the database. |

See `server/.env.example` and `yourtube/.env.example` for the complete variable list. Features whose provider is not configured may be unavailable; this is expected and does not prevent the app from starting.

## ☁️ Hosting

The frontend and backend can deploy from **one GitHub repository** as separate projects/services:

- **Vercel:** import the repository, set the project Root Directory to `yourtube`, and configure `NEXT_PUBLIC_BACKEND_URL` to the public HTTPS API URL.
- **Backend:** deploy `server/` as a Node service with `npm ci` and `npm start`. Set `DB_URL`, `FIREBASE_PROJECT_ID`, `APP_SESSION_SECRET`, and `MEDIA_TOKEN_SECRET` in the host's secret/environment settings.
- **MongoDB:** use a hosted MongoDB connection string and allow the backend host to connect.

For a small free demo, Vercel Hobby, MongoDB Atlas Free, and Render Free are possible options, subject to their current terms and limits. Render Free services sleep when idle and have ephemeral filesystems; **videos uploaded to a free Render instance are not durable and can disappear after sleep, restart, or redeployment**. The supplied `server/render.yaml` requests a **1 GB persistent disk**, which is not the zero-cost Render Free setup. Durable video hosting needs paid persistent storage or an object-storage integration; Cloudflare R2 is not yet integrated into this project.

Add the deployed frontend domain to Firebase Authentication's authorized domains. After setting or changing `NEXT_PUBLIC_BACKEND_URL`, redeploy the frontend because this value is embedded during the Next.js build.

## ✅ Before final submission

- [ ] Configure hosted MongoDB and deploy the backend and frontend.
- [ ] Verify the public frontend and backend health endpoint.
- [ ] Test Google sign-in and session verification on the deployed domains.
- [ ] Complete Razorpay checkout using test credentials and verify premium entitlements.
- [ ] Validate upload/playback with the chosen durable media-storage plan.
- [ ] Test JaaS, translation, and other provider-backed features if required.
- [ ] Check mobile/responsive behavior and keep the public demo available for evaluation.

## 📚 More information

- `server/.env.example` — backend settings and provider integrations.
- `yourtube/.env.example` — frontend public environment variables.
- `server/render.yaml` — Render disk-backed service configuration.
- `todo.md` — implementation checklist.
- Deployment guide (if provided separately): `GUIDE.md`.
