# YourTube: Free Deployment Guide

Last checked: October 10, 2026. Free-tier allowances and provider dashboards change; confirm each provider's current terms before deploying.

## What can be hosted for free

For a free demonstration, use one GitHub repository containing both apps, with:

| Part | Suggested service | Important limit |
| --- | --- | --- |
| Next.js frontend | [Vercel Hobby](https://vercel.com/docs/plans/hobby) | Free plan intended for personal projects and small-scale applications; usage limits and plan terms apply. |
| Express API | [Render Free Web Service](https://render.com/docs/free) | Spins down after inactivity, has a cold start, and its filesystem is temporary. |
| MongoDB | [MongoDB Atlas Free cluster](https://www.mongodb.com/docs/atlas/tutorial/deploy-free-tier-cluster/) | Small development database with a limited feature set and storage capacity. |

**Important for video uploads:** this project currently writes uploaded MP4 files and renditions to the backend filesystem. Render Free does not provide a persistent disk, so uploaded media can disappear when the service sleeps, restarts, or redeploys. MongoDB may still contain the video record, but its file will no longer be playable. Do not use this free setup to store important videos.

For persistent local-file storage, the existing Render configuration in `server/render.yaml` requests a 1 GB persistent disk. Render documents persistent disks as a paid-service feature; deploying that Blueprint is **not** the free setup. Another possible future option is [Cloudflare R2](https://developers.cloudflare.com/r2/pricing/), whose current free tier includes 10 GB-month of Standard storage and free egress, but **this application does not currently integrate with R2**. Supporting it requires code changes to upload, authorize, stream, and delete media from object storage.

Render Free is appropriate for an evaluation/demo, not a production service. It sleeps after 15 minutes without traffic, and the first request after sleep can take about a minute. Its free-instance hours are pooled by workspace. Check [Render's current free-instance limits](https://render.com/docs/free) before relying on availability.

## Do the frontend and backend need separate repositories?

No. Use **one repository** containing this project root, including `server/` and `yourtube/`. Create a Render service and a Vercel project from that same repository:

- Render Root Directory: `server`
- Vercel Root Directory: `yourtube`

Both platforms support monorepos: [Render monorepos](https://render.com/docs/monorepo-support) and [Vercel monorepos](https://vercel.com/docs/monorepos). Separate repositories are optional and would add setup work without a benefit for this project.

## 1. Prepare and push the repository

1. Confirm the application works locally. Start MongoDB and double-click `start.bat`; the local frontend is `http://localhost:3000` and the API is `http://localhost:5000`.
2. From the `you_tube2.0-main` folder, create a GitHub repository. Make it private while preparing the deployment if you prefer; the hosting services can deploy from a connected private repository.
3. Initialize Git and push the project root (not just one app). In PowerShell, from the project root:

   ```powershell
   git init
   git add .
   git status --short
   ```

4. **Before committing or pushing**, inspect the status and make sure `.env`, `.env.local`, `node_modules`, `.next`, uploaded media, and GeoLite `.mmdb` files are not staged. The root `.gitignore` excludes these. Never publish passwords, API secrets, Firebase service-account keys, private keys, or database connection strings.
5. Commit and push to the empty GitHub repository:

   ```powershell
   git commit -m "Prepare YourTube deployment"
   git branch -M main
   git remote add origin https://github.com/YOUR_GITHUB_NAME/YOUR_REPOSITORY.git
   git push -u origin main
   ```

   Replace the example remote with your own repository URL. Do not put credentials into the URL.

If a secret was ever committed, deleting it from a later commit is not enough: revoke/rotate it with its provider and remove it from Git history before making the repository public.

## 2. Create the free MongoDB database

1. Create a MongoDB Atlas account and project.
2. Create an **Atlas Free** cluster. Free clusters are small development databases; review the [current feature and storage limits](https://www.mongodb.com/docs/atlas/reference/free-shared-limitations/).
3. Create a database user with a strong, unique password. Use only the privileges needed for this project; do not use an Atlas account password or an administrative database user as an application credential.
4. Under **Network Access**, allow the backend to connect:
   - Prefer adding the outbound IP ranges shown in the Render service's **Connect → Outbound** panel. Render explains outbound ranges [here](https://render.com/docs/outbound-ip-addresses).
   - Render Free may use shared regional ranges. Avoid `0.0.0.0/0` when possible. If you choose it because the required ranges cannot be managed, use a strong database-user password, least-privilege access, and monitor/rotate credentials; it makes the database reachable from any IP subject to authentication.
5. In Atlas, choose **Connect → Drivers**, copy the Node.js connection string, replace the password and database name (for example `yourtube`), and URL-encode special characters in the password.
6. Keep the resulting URI private. It will become the Render `DB_URL` secret in the next section.

## 3. Deploy the backend on Render Free

Create this service **manually** in the Render dashboard. Do not use `server/render.yaml` for this free deployment because it declares a persistent disk.

1. In Render, choose **New → Web Service** and connect the GitHub repository.
2. Use these service settings:
   - **Root Directory:** `server`
   - **Runtime:** Node
   - **Build Command:** `npm ci`
   - **Start Command:** `npm start`
   - **Health Check Path:** `/health`
   - **Instance Type:** Free
   - **Disk:** do not attach one for a zero-cost deployment.
3. In the service's **Environment** settings, add:

   | Variable | Value |
   | --- | --- |
   | `DB_URL` | The Atlas connection string from step 2. |
   | `FIREBASE_PROJECT_ID` | The Firebase project ID matching the frontend Firebase configuration. |
   | `APP_SESSION_SECRET` | A new random secret, at least 32 characters. |
   | `MEDIA_TOKEN_SECRET` | A different new random secret, at least 32 characters. |
   | `NODE_ENV` | `production` |

   Render provides `PORT` automatically. Do not set either signing secret to the example text in `.env.example`. Generate two separate secrets locally, for example with Node:

   ```powershell
   node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
   ```

   Run it twice and enter the results directly into Render's secret fields; do not commit them or paste them into chat. Leave `UPLOAD_DIR` unset for this free setup; the app then uses its default local uploads folder, which remains ephemeral on Render Free.
4. Save the environment and deploy. In the Render logs, wait for `Mongodb connected` and `server running on port ...`.
5. Open `https://YOUR-SERVICE.onrender.com/health`. It must return HTTP 200 with `{"status":"ok"}`. A 503 means MongoDB is not connected; check the `DB_URL`, Atlas database user, password encoding, and Atlas Network Access. `/` also returns a simple backend response.
6. Copy the public Render HTTPS URL. The first request after inactivity may be slow while the free instance wakes.

## 4. Configure Firebase sign-in

The web Firebase configuration is currently in `yourtube/src/lib/firebase.js`; it is frontend configuration, not a server secret.

1. If the existing Firebase project is yours and is the one you intend to use, keep its configuration. Otherwise create/use your Firebase project and update the web-app configuration in `yourtube/src/lib/firebase.js`.
2. Ensure that `FIREBASE_PROJECT_ID` in Render exactly matches that project's ID.
3. In Firebase Authentication, enable Google sign-in and add the Vercel production domain (and any preview domain you intend to use) to **Authorized domains**.
4. Check the Google OAuth consent screen and authorized domains if Google sign-in reports an unauthorized-domain or OAuth configuration error.

You can browse public pages without signing in. Uploading, playback authorization, downloads, account-specific data, and meetings require the relevant app account/session flow.

## 5. Deploy the frontend on Vercel Hobby

1. In Vercel, choose **Add New → Project** and import the same GitHub repository.
2. Set the **Root Directory** to `yourtube` and enable the option to include files from outside the root only if Vercel prompts for it (this app's frontend imports stay within `yourtube`).
3. Keep the detected Next.js framework and default build settings:
   - **Build Command:** `npm run build`
   - **Output Directory:** Next.js default; do not override it.
4. Add this environment variable for Production (and Preview if you want preview deployments to use the API):

   | Variable | Value |
   | --- | --- |
   | `NEXT_PUBLIC_BACKEND_URL` | The Render backend base URL, e.g. `https://YOUR-SERVICE.onrender.com` (no trailing slash). |

   `NEXT_PUBLIC_TURNSTILE_SITE_KEY` is optional and should only be set if you also configure the matching `TURNSTILE_SECRET_KEY` on Render.
5. Deploy and copy the Vercel production domain.
6. Add that domain to Firebase Authentication's authorized domains. If you use a custom domain, add it as well.
7. If you change an environment variable after deployment, redeploy the frontend so the Next.js build receives the new value.

## 6. Optional provider integrations

The app can start without these providers, but their features will be unavailable or incomplete until configured. Add secrets in Render's Environment page, not in source files.

| Feature | Render environment variables | Notes |
| --- | --- | --- |
| Razorpay test checkout | `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` | Use **test-mode** keys from Razorpay. Test mode simulates payments; it does not charge real money. Follow the [Razorpay test-payment guide](https://razorpay.com/docs/payments/payments/test-card-details/). Never expose the secret in a `NEXT_PUBLIC_` variable. |
| Security and billing emails | `RESEND_API_KEY`, `SECURITY_EMAIL_FROM`; optional `SUPPORT_EMAIL` | Verify the sender/domain with Resend. Email-based sign-in verification and receipts depend on a working sender. |
| SMS verification | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_VERIFY_SERVICE_SID` | Configure a Twilio Verify service. Users must verify their own phone before SMS can be used. |
| Comment CAPTCHA | Render: `TURNSTILE_SECRET_KEY`; Vercel: `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Create matching Cloudflare Turnstile keys for the public frontend domain. |
| Comment translation | `TRANSLATION_API_URL`; optionally `TRANSLATION_API_KEY` | Use a provider endpoint compatible with the request/response format expected by this project's translation controller. |
| Jitsi as a Service meetings | `JITSI_APP_ID`, `JITSI_API_KEY_ID`, `JITSI_PRIVATE_KEY` | Use JaaS credentials. Preserve private-key newlines (Render environment values can represent them as `\n`). Live meeting tests need valid JaaS credentials. |
| Comment moderation | `MODERATOR_EMAILS` | Comma-separated moderator account email addresses. |
| GeoIP lookup | `GEOIP_DB_PATH` and a GeoLite2 City `.mmdb` file | Requires a locally supplied database file. Do not commit it. Render Free's filesystem is temporary, so this is not a durable free-host setup. |

Only enable optional providers you actually configured. Provider keys are server-side secrets except the public Turnstile site key and Firebase web-app configuration.

## 7. Verify the deployed app

Run the local checks before deploying:

```powershell
cd server
npm test
cd ..\yourtube
npm run build
```

Then check the live services:

- [ ] Render `/health` returns HTTP 200 and the Render logs show MongoDB connected.
- [ ] The Vercel homepage loads; `/explore`, `/plans`, and `/meetings` load without 404.
- [ ] The browser can request `https://YOUR-SERVICE.onrender.com/video/getall` and receives a JSON array (possibly empty).
- [ ] Sign-in works using the configured Firebase project, and OTP verification works if email credentials are configured.
- [ ] Upload a disposable MP4. Test video playback and any uploaded quality variants while the Render instance remains active. On Render Free, do not expect that media file to survive sleep/redeploy.
- [ ] Confirm a free account cannot play/download premium content; confirm an active paid test subscription can. Use Razorpay test mode only.
- [ ] Test download quota and history, comments/moderation, and watch progress with the relevant signed-in accounts.
- [ ] Test translation, CAPTCHA, SMS, GeoIP, and JaaS calls only if their provider settings are configured.
- [ ] Open the production Vercel URL in a private/incognito window and on a mobile viewport. Keep the public URL available through evaluation.

## 8. Common deployment problems

| Symptom | Check |
| --- | --- |
| Browser reports `AxiosError: Network Error` | Confirm Vercel `NEXT_PUBLIC_BACKEND_URL` is the public Render HTTPS URL, then redeploy Vercel. Check Render is live and inspect browser network/console errors. |
| Render `/health` returns 503 | The health check intentionally fails until MongoDB is connected. Check `DB_URL`, Atlas credentials, URI encoding, and Network Access. |
| Render service takes a long time to answer | The free service may have spun down; wait for cold start and retry. |
| Uploaded video becomes unavailable | Expected if Render Free's filesystem was cleared after sleep, restart, or deploy. Use paid persistent storage or implement object storage for durable files. |
| Sign-in reports Firebase/authentication errors | Match the Firebase project IDs, enable Google provider, and authorize the deployed Vercel domain in Firebase. |
| Checkout button reports missing payment configuration | Add Razorpay **test** key ID and secret to Render and redeploy/restart the backend. |
| Email/SMS/CAPTCHA/translation/meeting feature reports configuration errors | Configure the matching provider variables on the service that uses them; don't put server secrets in Vercel. |
| A route returns 404 | Check the route path and ensure the latest frontend commit finished deploying. Current routes include `/explore`, `/plans`, `/meetings`, and `/subscriptions` (redirects to `/plans`). |

## 9. What is complete versus still pending in `plan.md`

Several checkboxes in the original plan were stale even though the implementation was complete. They have been corrected to reflect the code:

- Implemented: premium entitlement checks for private playback and downloads; private media endpoints; trusted-device/OTP sessions; optional local GeoIP; timeline previews and supplied-rendition quality selection; CAPTCHA and comment edit history; secured JaaS room tokens and owner moderation.
- Still needs external setup/live verification: Razorpay test checkout, translation-provider response, live multi-user JaaS call, hosted MongoDB/backend/frontend integration, and final submission URL.
- Entitlement logic is implemented, but must still be exercised end to end with an active subscription created through Razorpay test mode.
- Persistent video hosting is not a zero-cost Render Free capability with the current local-file implementation.

The source plan is [plan.md](./plan.md); the implementation tracker is [todo.md](./todo.md).

## Official service references

- [Vercel Hobby plan](https://vercel.com/docs/plans/hobby)
- [Vercel monorepos](https://vercel.com/docs/monorepos)
- [Render Free services and limitations](https://render.com/docs/free)
- [Render persistent disks](https://render.com/docs/disks)
- [Render monorepo configuration](https://render.com/docs/monorepo-support)
- [Render outbound IP ranges](https://render.com/docs/outbound-ip-addresses)
- [MongoDB Atlas Free cluster setup](https://www.mongodb.com/docs/atlas/tutorial/deploy-free-tier-cluster/)
- [Cloudflare R2 pricing and free tier](https://developers.cloudflare.com/r2/pricing/)
- [Razorpay test card/payment guide](https://razorpay.com/docs/payments/payments/test-card-details/)
