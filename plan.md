# Final Internship Project Plan

## 1. Project goal
Build and finalize the existing YourTube training project as a production-ready internship submission, while preserving the current stack and extending the app with the remaining required features.

## 2. Tech stack to keep
- Frontend: Next.js (Pages Router)
- Backend: Express + Mongoose
- Database: MongoDB for local testing, later hosted MongoDB
- Hosting target: Vercel for frontend, managed backend + MongoDB hosting for production
- Keep the current app structure and avoid replacing the project with a new stack.

## 3. What is already done
- Frontend app builds successfully after dependency cleanup.
- Core app layout and navigation are in place.
- Auth flow foundation exists.
- Video watch pages and media player foundation are present.
- Basic user actions such as history, likes, and watch later exist.
- Backend route foundations for subscription, downloads, and security have been added.
- Subscription, download, and security schemas/controllers are implemented as a starting point.

## 4. Remaining major work
Priority order for final completion:

### Phase 1 — Finish required feature foundation
1. Complete subscription system
   - [x] add user-facing plan comparison and billing history UI
   - [x] create Razorpay orders on the server and verify/capture payment before activation
   - [x] retain purchase history and support cancellation/expiry status
   - [ ] test checkout end-to-end with configured Razorpay test credentials
   - [x] enforce subscription entitlements across premium playback and downloads (live renewal/provider flow still needs validation)
2. Complete download system
   - [x] enforce quota logic for Free daily and Bronze monthly plans on the authenticated download endpoint
   - [x] show download history and quota usage in UI
   - [x] move media delivery from public static uploads to private/authenticated playback and download routes
3. Complete login security flow
   - [x] persist the manual theme choice and derive the initial theme from IST login hour
   - [x] authenticate the security-log dashboard and collect basic IP/device/browser details
   - [x] trusted-device detection, OTP/new-device verification, and signed-session logic
   - [x] optional local city/state/country geolocation lookup and session management (GeoLite2 database and provider credentials are environment-dependent)

### Phase 2 — Advanced user experience features
4. Upgrade custom player and watch experience
   - [x] authenticated progress save/resume, completion tracking, and single-playback behavior
   - [x] PiP, captions when available, keyboard controls, buffering/remaining time, control auto-hide, next-video countdown
   - [x] timeline frame previews and switching between uploaded quality variants (renditions are uploaded separately; no automatic transcoding)
5. Multilingual + moderated comments
   - [x] add reports, review status, replies, reactions, sorting, edit window, soft deletion and baseline spam checks
   - [x] wire a configurable translation provider endpoint
   - [x] add moderator review UI
   - [x] add server-verified CAPTCHA and comment edit history
   - [ ] configure a translation provider and verify translation end to end
6. Real-time communication feature
   - [x] create/join meetings and integrate provider audio/video, chat, screen share, participant view and hand raise
   - [x] implement secured JaaS rooms with short-lived JWT authentication and owner-only host moderation
   - [ ] configure live JaaS credentials and verify a multi-user call; recording is not implemented

### Phase 3 — Finalization and deployment
7. Final polish and production readiness
   - bug fixes and edge-case handling
   - environment variables for hosted services
   - loading, empty states, and validation
8. Deployment
   - deploy frontend to Vercel
   - deploy backend and MongoDB on hosted services
   - verify public URLs and production flow
9. Submission package
   - review against instructions/tasks list
   - create final README / demo notes
   - test the complete flow end-to-end

## 5. Execution plan
- Keep the current stack and only extend what is missing.
- Do not rewrite the app architecture.
- Prefer finishing one feature cluster fully before moving to the next cluster.
- Validate with a build after each major change.
- Use MongoDB locally while developing; prepare environment variables for hosted production.

## 6. Risks / open decisions
- Razorpay is selected and integrated; end-to-end checkout remains pending test-mode credentials.
- JaaS is selected and integrated; live calls remain pending JaaS credentials.
- Final hosted backend and DB setup need environment configuration.
- Free backend instances have ephemeral storage; preserving uploaded videos requires a paid persistent disk or a separately implemented object-storage integration.
- If instructions and task list differ from what is already implemented, prioritize the instructions.md and task list for final acceptance.

## 7. Recommended order of work
1. Plans + subscriptions UI and API
2. Downloads + quota enforcement
3. Security + trusted-device logic
4. Comments moderation + translation
5. Custom player enhancements
6. Real-time meeting/call feature
7. Deployment and submission check

## 8. Success criteria for final submission
- App is fully runnable and consistent with the training project.
- Core requested features are implemented or clearly wired in; provider-backed verification is still pending.
- Frontend and backend connect correctly in hosted environment config.
- No major build/runtime regression from the current baseline.
- Final submission is demo-ready and documented.
