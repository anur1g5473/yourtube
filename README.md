# YourTube

YourTube is the original training project extended with the internship features in `TASKS.md`. It keeps the existing Next.js, Express, MongoDB/Mongoose, and Firebase stack.

## Project layout

- `server/` — Express API, Mongoose models, local uploads, and provider integrations
- `yourtube/` — Next.js frontend
- `todo.md` and `progress.md` — implementation checklist and current status
- `GUIDE.md` — free-host deployment walkthrough and provider setup checklist

## Run locally

Requirements: Node.js, npm, MongoDB, and a Firebase project configured for Google sign-in.

1. Start MongoDB and create a local database.
2. In `server/`, copy `.env.example` to `.env`. Set `DB_URL`, `FIREBASE_PROJECT_ID`, `APP_SESSION_SECRET` (at least 32 characters), and `MEDIA_TOKEN_SECRET` (a separate random secret).
3. In `yourtube/`, copy `.env.example` to `.env.local`. Set `NEXT_PUBLIC_BACKEND_URL=http://localhost:5000`. Configure the Firebase web app credentials used by `yourtube/src/lib/firebase.js` for your Firebase project and authorized domains.
4. Install dependencies and start the backend:

   ```powershell
   cd server
   npm ci
   npm run dev
   ```

5. In a second terminal, install dependencies and start the frontend:

   ```powershell
   cd yourtube
   npm ci
   npm run dev
   ```

6. Open `http://localhost:3000`. The API health route is `http://localhost:5000/`.

Double-click `start.bat` in the project root to open the backend and frontend in separate command windows. If `server/.env` is absent, it uses the local MongoDB URL and the Firebase project already configured by the frontend, with fresh temporary session/media secrets. It tries to start `mongod` if it is on PATH or installed in a sibling `mongodb*` folder, storing local database files under `%LOCALAPPDATA%\\YourTube\\MongoData`. Existing `server/.env` settings are preserved. Provider credentials are not required to start the app, though their integrations and sign-in verification steps require their respective configuration.

The backend production command is `npm start`; the frontend production commands are `npm run build` and `npm start`.

## Feature integrations

Core application flows include authenticated playback and downloads, plan and billing history, watch progress, comments and moderation, signed meeting access, account security, email verification, optional SMS verification, and local IP geolocation.

Optional provider settings are in `server/.env.example`:

| Feature | Configuration |
| --- | --- |
| Razorpay test checkout | `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` |
| Security and receipt email | `RESEND_API_KEY`, `SECURITY_EMAIL_FROM` |
| SMS OTP | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_VERIFY_SERVICE_SID` |
| Local city/state/country lookup | `GEOIP_DB_PATH` pointing to a locally supplied GeoLite2 City `.mmdb` file |
| Jitsi as a Service meetings | `JITSI_APP_ID`, `JITSI_API_KEY_ID`, `JITSI_PRIVATE_KEY` |
| Comment translation | `TRANSLATION_API_URL`, and `TRANSLATION_API_KEY` if required by the selected service |
| Comment CAPTCHA | Backend `TURNSTILE_SECRET_KEY` and frontend `NEXT_PUBLIC_TURNSTILE_SITE_KEY` |
| Moderation access | `MODERATOR_EMAILS` |

Set all required values in your private local or hosted environment; do not commit `.env` files, provider credentials, private keys, or the GeoLite2 database. SMS sign-in is available only after a user verifies ownership of their phone number. Without a GeoLite2 database, sign-in continues and security events record an explicit location-lookup status.

## Deployment

The frontend can be deployed to Vercel from the `yourtube/` project directory:

- Build command: `npm run build`
- Output: Next.js default
- Set `NEXT_PUBLIC_BACKEND_URL` to the public HTTPS API URL.
- Set the frontend Turnstile site key and Firebase web-app configuration for the production domains.

For a free demo, follow [GUIDE.md](./GUIDE.md) to configure Vercel Hobby, MongoDB Atlas Free, and a Render Free web service. The Render Blueprint in `server/render.yaml` configures a 1 GB persistent disk and is for a disk-backed deployment, not a zero-cost Render Free instance. Configure Firebase authorized domains and optional Razorpay/Resend/Twilio/JaaS credentials only for integrations being enabled. Set the Vercel frontend's `NEXT_PUBLIC_BACKEND_URL` to the Render service's public HTTPS URL.

**Storage requirement:** local development uses `server/uploads`; Render deployment uses the persistent disk configured through `UPLOAD_DIR`. The 1 GB disk is a small demo starting point and can fill quickly because each rendition is uploaded separately. Monitor capacity and scale the disk before accepting more uploads. Persistent disks are tied to a single service instance, so use one backend instance unless media is migrated to shared object storage.

**Current external requirements:** live Razorpay, email, Twilio, translation, and JaaS flows require provider credentials. Live location results require a GeoLite2 City database file installed on the backend host. Timeline hover frames are extracted locally from authorized video. Uploaders may provide optional separately encoded 360p, 480p, 720p, and 1080p MP4 renditions; the player offers only the original and renditions that were uploaded. The app does not transcode videos automatically, and hosted playback requires durable storage for all uploaded files.

## Verification

Build the frontend production bundle:

```powershell
cd yourtube
npm run build
```

Check backend JavaScript syntax for a changed module:

```powershell
cd server
node --check controllers/security.js
npm test
```

## Submission readiness

This repository does not itself publish a public deployment. Before submitting, deploy the frontend and API, verify the public URL without relying on local services, configure durable media storage, run the required provider-backed flows, and record the final public demo URL and any evaluation credentials or instructions separately from this source repository.
