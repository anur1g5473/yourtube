# Progress Tracker

## Status: In progress

### Completed
- Existing app structure preserved; no `node_modules` review or changes
- Subscription comparison page added with monthly, quarterly, and yearly pricing options
- Razorpay order creation and server-side payment-signature / capture verification added
- Subscription records now retain billing history and expire to Free when the paid period ends
- Subscription routes require a verified Firebase ID token, mapped to the existing YourTube user record
- Download route now authenticates users, checks Free daily/Bronze monthly quota, blocks repeat same-period downloads, and records transfer status and audit metadata
- Downloads page shows quota and download history; watch-page download uses the authorized file route
- Custom player now supports PiP, captions when a video supplies a track, remaining-time/buffer indicators, keyboard shortcuts, control auto-hide, watch-progress resume/save, completion tracking, single-video playback, and next-video countdown
- Authenticated watch-progress API persists user progress across devices
- Comments now support authenticated replies, reactions, sorting, edit-window enforcement, soft deletion, report-to-review flow, link/profanity-term checks, duplicate/flood limits, and optional configured translation service
- Comments support authenticated @channelname suggestions, persisted mention references with links to channels, and author avatar/name/optional profile-location display
- Translation results are cached per target language with optional provider-detected source language; editing the source comment clears stale translations
- Isolated MongoDB concurrency checks confirmed Free-plan reservation limits, duplicate paid-download conflicts, quota release after interruption, and safe concurrent retries; the download controller now returns 409 for unique-index duplicate races rather than a server error
- Channel owners can edit an optional location; older profile-update clients remain compatible when location is omitted
- Comment edits now retain prior revisions; authors can view the history of their own comments
- Repeated comment posting now requires server-verified Cloudflare Turnstile CAPTCHA (configure both frontend site key and backend secret)
- Manual theme preference is saved to the user profile; accounts without a preference get the required 5 AM–12 PM IST light / otherwise dark default
- Security events now derive account identity and IP/user-agent details server-side behind Firebase authentication; a signed-in security history page is available
- Email OTP now gates sign-in on untrusted browsers, IP changes, and browser/platform changes; Firebase ID token alone is no longer accepted for protected APIs without a signed YourTube session
- Security events and trusted browsers now retain approximate city/state/country using a local MaxMind GeoLite2 City database; a detected location change requires OTP, and lookup failures are recorded as explicit statuses without blocking sign-in
- Added verified mobile-number enrollment through Twilio Verify and an email/SMS choice for sign-in OTP; unverified numbers cannot receive login codes, and phone values are kept out of public user-profile responses
- Added timeline hover previews by seeking a muted, authorization-bound video element and capturing individual frames locally; no external preview service or uploaded thumbnail assets are required
- Video uploads accept optional separately encoded 360p, 480p, 720p, and 1080p MP4 renditions; the player can switch among the uploaded variants using session-bound signed URLs while retaining playback position/state
- Backend quality tests cover upload metadata, source and alternate rendition streaming, session revocation, and playback of source-only legacy records; frontend production build passes
- Added a project-level setup/deployment README and changed the backend scripts so `npm run dev` uses nodemon while production `npm start` runs Node directly
- Trusted browser records expire after 30 days, sessions can be revoked on sign-out, and the security page lets users revoke individual browsers
- Removed public static `/uploads` hosting; playback URLs are short-lived signed links tied to the user's active app session, and premium videos require an active paid plan for playback and download
- Video streams support byte ranges; video file paths are omitted from public video/history/liked/watch-later API responses
- Premium videos now require an active paid tier for playback and downloads; billing verification sends an itemized email receipt and records failed/sent state with an owner-only retry action
- Added an administrator-only reported-comment moderation queue for approve/remove decisions
- Added meeting creation/join pages with cryptographically random room IDs and Jitsi Meet embed controls for audio/video, screen sharing, chat, participant list, hand raise, and leave
- Replaced client-only public Jitsi rooms with server-recorded JaaS rooms and authenticated, room-scoped, short-lived RS256 tokens; only the room owner receives moderator claims, and the meeting screen exposes host mute/lobby/kick/co-host actions
- JaaS token claims were verified using generated RSA keys and isolated MongoDB for room creation, owner/non-owner roles, and unknown-room rejection
- Latest frontend production build passes, and changed comment API/model files pass Node syntax checks
- The JaaS client obtains its domain and room name from the authenticated backend, so the old public-Jitsi frontend domain setting was removed

### Current focus
- Configure Render, hosted MongoDB, and provider credentials; then run provider-backed smoke tests and record the public demo URL.

### Next milestone
- Deploy the Express API with persistent media storage, configure hosted MongoDB and provider secrets, and deploy the Next.js frontend to Vercel.

### Blockers / decisions pending
- Razorpay test credentials and `FIREBASE_PROJECT_ID` must be configured in the server environment before purchase flow can run.
- Hosted backend and MongoDB configuration; the local server `.env` currently has no Twilio credentials or GeoLite2 database path configured
- Final public demo URL, durable hosted video storage, and provider-backed validation are still required before internship submission
- Add JaaS app ID/API key/private key to server environment and verify a live call; generated-key tests validate token signing and room authorization locally
- Email OTP uses Resend; configure `APP_SESSION_SECRET`, `RESEND_API_KEY`, and `SECURITY_EMAIL_FROM` before email verification. Twilio SMS requires `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_VERIFY_SERVICE_SID`.
- Private playback now requires an authenticated session and uses signed expiring stream links; direct `/uploads/...` access is disabled. No web player can fully prevent a user from saving media they are authorized to stream; quotas apply to the authorized download route, not DRM-level capture prevention.
- Timeline frame previews are generated locally from the authorized video stream. Quality selection is available for renditions supplied during upload; the app does not transcode source media automatically.
- Comment translation caches up to 20 target-language results per comment and stores optional detected source language; set `TRANSLATION_API_URL` (and `TRANSLATION_API_KEY` when required) to enable live translation.
- Added a Render Blueprint for the backend with a user-selected 1 GB persistent media disk and `UPLOAD_DIR`; hosted MongoDB, provider secrets, Vercel configuration, and actual deployment still need account setup.
- Backend now waits for MongoDB before listening, reports database readiness at `/health`, and returns explicit upload validation/size-limit errors for Render health checks and API clients.
- CAPTCHA is wired through Cloudflare Turnstile; set the frontend site key and backend secret to activate it.
- GeoLite2 City lookup is local-only and optional: place the database file on the backend host (do not commit it) and set `GEOIP_DB_PATH`; events distinguish resolved, not found, unconfigured, and lookup-failed statuses.
- Security activity, email/SMS OTP verification, trusted-device expiry/revocation, and server-side session validation are implemented. Local MaxMind geolocation requires a user-provided GeoLite2 City `.mmdb` file at `GEOIP_DB_PATH`; IP addresses are not sent to an external lookup provider.
- Twilio Verify is optional until configured. Users can enroll an E.164 mobile number from the security page; only after Twilio confirms possession is it offered for login verification.
- Calls now target JaaS and require a signed-in account plus a server-issued token; the meeting creator receives moderator privileges. Live JaaS calls and moderation still need the user's app ID, API key ID, and RSA private key in server deployment secrets. Recording is disabled in signed tokens; in-call file sharing is allowed.
- Comment edit history and @mentions are available; optional commenter location is shown when supplied. Translation metadata/caching is implemented, but live translation still needs a configured provider endpoint/key.
- Subscription email receipts are implemented through Resend, with retry tracking in billing history. Payment activation is returned independently of receipt-delivery/state-write failures. MongoDB quota races passed against an isolated local MongoDB test instance; live Razorpay checkout, Resend delivery, and hosted deployment still require configured credentials/services.

### Notes
- The app is not yet feature-complete for final submission.
- The current work is aligned to the current stack and intended deployment path.
- Build stability is good. Subscription APIs verify captured payment before activation; premium access checks use active paid tiers. Automatic recurring billing is not implemented. Download quotas apply at the authenticated download endpoint; playback links are session-bound, but authorized streaming cannot prevent capture at the device.
