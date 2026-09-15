# First Move

First Move is a private cross-platform product with a Next.js Web app and an Expo React Native Mobile app. It helps people who notice they are stuck in passive scrolling or inactivity reduce the next decision to one small action, a bounded period of time, and a neutral choice about what comes next.

The app is inspired by behavioral activation and intentional-use design. It is not medical treatment, a diagnostic tool, or a substitute for professional care, and it makes no claim to stimulate or repair the brain.

## Core flow

1. Notice or declare that you are stuck.
2. Choose Work & Study, Daily Life, Exercise & Movement, Intentional Entertainment, or Rest.
3. Accept, edit, or write one very small First Move.
4. Track a 2, 5, 10, 25, 50, or custom-minute session, or use the stopwatch.
5. Continue, stop intentionally, rest, or choose bounded entertainment without punishment.
6. Receive duplicate-safe local points and virtual-kitten feedback.
7. Optionally add a private Mini Journal entry.

Morning Start adds a fixed toothbrush-photo check before daily planning. “I’m Stuck” remains available independently at any time.

## Features

Web provides the complete feature set below. Mobile currently implements Guest/auth foundations, I’m Stuck and First Move, Countdown and Stopwatch Focus, Tasks/Habits, and authenticated sync for already-initialized accounts; remaining Mobile release work is tracked in `TASKS.md`.

- Current-photo toothbrush check with camera and upload fallback
- Local First Move templates for six stuck states and five directions
- Editable manual tasks and daily or selected-weekday habits
- Optional structured daily planning from a text brain dump
- Refresh-safe countdown and stopwatch sessions with post-session review
- Today timeline, local-date calendar, and 7/30-day trends
- Private Mini Journal with optional mood and energy ratings
- Duplicate-safe local rewards and active-day milestones
- Original local SVG pixel kitten, consumable food, toys, tricks, and garden milestone
- Responsive mutually exclusive app views with reduced-motion support

## Architecture

- Next.js 16 App Router, React 19, strict TypeScript, and Tailwind CSS for the root Web project
- Independent Expo SDK 57, React Native, TypeScript, and Expo Router project under `/mobile`
- Supabase Auth and the existing Web Sync v1 backend/RPC/canonical contract shared by authenticated Web and Mobile clients
- Client-side application shell in `src/app/first-move-app.tsx`
- Small domain modules under `src/lib` for dates, models, repository validation, sessions, rewards, history, planning, Morning Check, and cat progress
- Versioned Web browser persistence and owner-scoped Mobile AsyncStorage persistence with validation and migration
- Two paid-AI dispatch route handlers (`/api/verify-toothbrush` and `/api/organize-day`) plus the read-only `/api/ai-access/status` presentation route
- Official OpenAI JavaScript SDK using the Responses API and strict structured outputs
- Dependency-free SVG/CSS charts and original SVG kitten artwork

Timers persist timestamps rather than decrement-only counters, so refreshes and background throttling do not reset elapsed time. Reward and milestone records use deterministic source IDs or explicit grant tracking to prevent duplicate awards.

## Local data and privacy

Guest Mode remains local-only. Web keeps its versioned working/cache state in browser `localStorage` and its immutable pre-setup guest backup in IndexedDB; clearing browser site data can remove unsynced Web progress. Mobile keeps Guest data, per-account working/cache state, and its durable sync queue in device-local AsyncStorage, while auth sessions use platform-secure storage; clearing app/device storage can remove that local Mobile data.

Authenticated Web and Mobile clients use the same Supabase Auth UUID and canonical Supabase workspace. Web supports the feature-gated Start fresh, Import this device, and Use cloud progress lifecycle. Mobile currently hydrates and writes implemented Task, Habit, ActivityIntent, and ActivitySession mutations only for already-initialized accounts; Mobile empty-account setup/import remains deferred.

Toothbrush images are resized in the browser to JPEG with a maximum dimension of 768 pixels. They are not written to local storage. In live mode, the selected image is sent only after the user clicks **Verify photo** and is not logged or retained by this application. Mini Journal text, habits, history, cat state, and images are excluded from daily-planning requests.

## GPT-5.6 Luna integration

GPT-5.6 Luna powers two optional, reviewable capabilities:

1. **Multimodal toothbrush verification:** the server submits one low-detail image and accepts only a structured result indicating whether a real physical toothbrush is clearly visible. Ambiguous scenes, drawings, screenshots, and text-only images must fail.
2. **Structured daily planning:** the server submits only the user’s explicit brain dump and receives one First Move, up to three priority tasks, up to three optional tasks, fixed categories and durations, and a concrete first step for every item. Nothing is saved before review and confirmation.

Both integrations use the fixed `gpt-5.6-luna` model identifier. Live dispatch requires an authenticated Supabase bearer session, authoritative RevenueCat entitlement verification, and an atomic server-side quota reservation.

Authenticated Free accounts receive exactly five lifetime paid-provider actions shared across AI features. Active Pro accounts receive 1 daily-plan, 3 toothbrush-verification, and 5 Make this smaller actions per authoritative local day. Web Settings displays the trusted plan and remaining allowance; it does not authorize dispatch. Guest has no live paid-provider access and retains manual/local/mock fallbacks.

## Codex collaboration

Codex was used throughout Build Week for:

- product architecture and implementation
- strict data models, validation, and migrations
- timestamp-based timer and session logic
- unit and route-handler tests
- camera compression and OpenAI API integration
- responsive-layout and accessibility debugging

The project documents decisions in `PRD.md`, tracks delivery in `TASKS.md`, and keeps repository-specific safety rules in `AGENTS.md`.

## Cost controls and mock fallbacks

- Mock vision and mock planning are the safe defaults and require no API credentials.
- A live request occurs only after the relevant user button is clicked.
- Startup, rendering, refresh, tests, and builds never call OpenAI.
- SDK automatic retries are disabled and server requests have a 20-second timeout.
- Responses use `store: false`, reasoning effort `none`, structured output, low verbosity, and bounded output tokens.
- Images must be JPEG or PNG and no larger than 2 MiB; planning input is limited to 2,000 characters and an 8 KiB request.
- Morning Check allows at most three client attempts per local date.
- Manual tasks, local templates, manual planning, and all core tracking remain usable when AI is disabled or fails.
- Skipping Morning Start records no verification or reward and advances to Plan my day with a date-scoped local presentation marker.

## Local setup

Requirements: Node.js 20 or newer and npm.

```bash
git clone <repository-url>
cd first-move
npm install
cp .env.example .env.local   # optional; mock mode works without this
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment variables

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Auth/sync only | unset | Public Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Auth/sync only | unset | Public Supabase client key protected by RLS |
| `NEXT_PUBLIC_CLOUD_SETUP_ENABLED` | Web cloud setup/sync | unset | Enables the Web Sync v1 setup/runtime when exactly `true` |
| `OPENAI_API_KEY` | Live AI only | unset | Server-side OpenAI credential |
| `OPENAI_LIVE_VISION` | No | `false` | Set exactly `true` to enable live toothbrush verification |
| `OPENAI_LIVE_PLANNING` | No | `false` | Set exactly `true` to enable live daily planning |
| `SUPABASE_SERVICE_ROLE_KEY` | Live AI only | unset | Server-only key for the narrowly granted quota reservation RPC |
| `REVENUECAT_SECRET_API_KEY` | Live AI only | unset | Server-only RevenueCat REST API v1 secret used to verify `pro` |
| `AI_SERVER_REGION_CODE` | No | `ZZ` | Trusted two-letter deployment-region ledger metadata; not an allowlist |

Never commit `.env.local` or credentials. Enabling a live flag without `OPENAI_API_KEY` returns a safe configuration error and does not fall back to an undisclosed paid call.

Mobile uses its separate public Expo environment contract documented in `mobile/README.md`.

## Testing

```bash
npm test
npm run lint
npm run type-check
npm run build
git diff --check
```

Tests mock OpenAI clients and make no live requests. For a manual mock test, leave both live flags false, run the app, choose the development pass/fail result for Morning Check, and use **Organize with AI** to receive deterministic mock suggestions.

## Deployment

1. Import the repository into a Node-compatible Next.js host such as Vercel.
2. Use `npm run build` as the build command and the normal Next.js output preset.
3. Deploy with both live flags unset or `false` for a no-cost mock demo.
4. For a live demo, add `OPENAI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and `REVENUECAT_SECRET_API_KEY` as protected server environment variables, then set only the desired live flag to `true`.
5. Migration `20260915120000_ai_access_r1.sql` is already remotely applied; do not reapply it as part of Web presentation work.
6. Redeploy, then verify plan/allowance status and one request manually. Monitor OpenAI usage limits and hosting logs without logging submitted text or images.

The API routes require a Node.js runtime. A static-only host cannot provide live AI verification or planning.

Vercel builds the root Next.js Web app. EAS builds the independent `/mobile` Expo app; the repository is intentionally not a package workspace.

## Current limitations

- Mobile empty-account Start fresh/Import and production-ready Today/Cat/release polish remain deferred
- True-device iOS/Android and remaining Mobile↔Web/offline/restart/account-switch acceptance remain release gates
- Running timers are device-owned and are not taken over or synchronized in realtime across devices
- Browser timers cannot guarantee system-level alarms when the browser or device suspends the page
- Authenticated server-controlled AI quotas and Web plan/allowance presentation are implemented; Guest paid-provider AI is excluded, while production region allowlisting/rate limits and Mobile AI UI remain deferred
- Camera behavior depends on browser support, HTTPS, and user permission
- AI output can be wrong and always requires user review
- The kitten is intentionally lightweight SVG/CSS animation rather than a full game
- Accessibility has received semantic, keyboard, contrast, touch-target, and reduced-motion attention, but has not received a formal third-party audit

## Release backlog

The current deferred release work—including Web Billing, Mobile AI UI, Make this smaller provider integration, production AI region/rate controls, true-device testing, and store submission—is tracked in `TASKS.md`.

## License

No license has been selected for this Build Week repository yet.
