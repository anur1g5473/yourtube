# Todo List

## Completed
- [x] Preserve the existing project and tech stack.
- [x] Add responsive subscription comparison and billing page.
- [x] Add authenticated Razorpay order creation and payment verification/capture endpoints.
- [x] Persist verified purchases as separate subscription/billing history entries.
- [x] Add Firebase ID-token authentication for subscription endpoints.
- [x] Enforce Free daily and Bronze monthly download quotas on authenticated file-download requests.
- [x] Add duplicate-download checks, transfer audit records, and a quota/history page.
- [x] Add authenticated playback-position persistence and resume across sessions/devices.
- [x] Add player PiP, available captions, buffering/remaining-time indicators, keyboard shortcuts, controls auto-hide, completion threshold, and next-video countdown.
- [x] Add comment replies, reactions, sorting, report flow, moderation status, soft-delete, edit limits, and basic spam/link checks.
- [x] Add translation endpoint wiring for a configured translation provider.
- [x] Persist manual theme choice and apply the required login-time IST theme default.
- [x] Add authenticated security log collection and a security activity page.
- [x] Add administrator-only comment report queue and approve/remove actions.
- [x] Add meeting room creation/join UI with random IDs and provider-supported in-call controls.
- [x] Persist comment edit revisions and let authors review prior versions.
- [x] Validate the frontend production build and syntax-check changed backend APIs/models.

## In progress
- [ ] End-to-end test Razorpay test checkout after setting server credentials.
- [x] Remove the public `/uploads` static route; stream through short-lived user/session-bound URLs with plan checks, and hide local paths from video metadata.
- [x] Test download limits, duplicate paid-download races, and interrupted-download retries against an isolated MongoDB instance.
- [x] Add email OTP challenges, new-device/new-IP/browser checks, trusted-browser management/revocation, and signed application sessions.
- [x] Add local MaxMind GeoLite2 city/state/country lookups, location-change OTP checks, and security-page location/status display (provide a local database file to enable lookups).
- [x] Add verified mobile-number enrollment and Twilio SMS as an alternate sign-in OTP channel (requires Twilio Verify credentials).
- [x] Implement JaaS-authenticated private rooms, room-scoped signed tokens, owner-only moderator tokens, and host moderation controls.
- [ ] Add JaaS app ID/API key/private key to deployment secrets and verify a live multi-user call.
- [x] Require Turnstile CAPTCHA after repeated comment attempts (requires deployment site/secret keys).
- [x] Add authenticated @channelname suggestions, persisted mention references, and channel links in comments.
- [ ] Configure a translation provider endpoint and verify translation output.
- [x] Add timeline hover frame previews using the authorized video stream.
- [x] Display the dimensions of the currently encoded video source.
- [x] Support optional 360p/480p/720p/1080p MP4 uploads and session-authorized quality switching.
- [x] Let users set an optional profile location and show commenter avatars/channel names/location on comments.
- [x] Persist source-language detection and up to 20 language-tagged translations per comment; clear stale translations after edits.
- [x] Enforce paid-plan checks for premium video playback and downloads.
- [x] Send a transaction receipt after payment verification, record delivery status, and allow the account owner to retry failed receipt emails.

## Pending
- [ ] Connect hosted MongoDB and backend environment configuration on Render (1 GB persistent disk configuration is prepared).
- [ ] Deploy frontend to Vercel and backend to managed hosting.
- [ ] Validate end-to-end app flow against the internship requirements.
- [x] Add a project setup and deployment README.
- [ ] Add the public demo URL and final demo notes after deployment and end-to-end validation.

## Priority order
1. Configure and live-test Razorpay, Resend, translation, and JaaS credentials
2. Configure Twilio Verify and supply the local GeoLite2 City database
3. Provide video preview/quality assets and complete final feature validation
4. Deploy to hosted MongoDB/backend and Vercel; finish submission documentation
