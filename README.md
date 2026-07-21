# First Move

First Move is a private, mobile-first web app for people who notice they are stuck in passive scrolling or inactivity but still find it difficult to switch into something intentional. It reduces the next decision to one small action, a bounded period of time, and a neutral choice about what comes next.

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

- Next.js 16 App Router, React 19, strict TypeScript, and Tailwind CSS
- Client-side application shell in `src/app/first-move-app.tsx`
- Small domain modules under `src/lib` for dates, models, repository validation, sessions, rewards, history, planning, Morning Check, and cat progress
- Versioned browser persistence with safe normalization and migration
- Two Node.js route handlers: `/api/verify-toothbrush` and `/api/organize-day`
- Official OpenAI JavaScript SDK using the Responses API and strict structured outputs
- Dependency-free SVG/CSS charts and original SVG kitten artwork

Timers persist timestamps rather than decrement-only counters, so refreshes and background throttling do not reset elapsed time. Reward and milestone records use deterministic source IDs or explicit grant tracking to prevent duplicate awards.

## Local data and privacy

Tasks, habits, intents, sessions, rewards, journal entries, inventory, and progress stay in this browser’s `localStorage`. Clearing browser data removes them; there is currently no account, cloud backup, or cross-device sync.

Toothbrush images are resized in the browser to JPEG with a maximum dimension of 768 pixels. They are not written to local storage. In live mode, the selected image is sent only after the user clicks **Verify photo** and is not logged or retained by this application. Mini Journal text, habits, history, cat state, and images are excluded from daily-planning requests.

## GPT-5.6 Luna integration

GPT-5.6 Luna powers two optional, reviewable capabilities:

1. **Multimodal toothbrush verification:** the server submits one low-detail image and accepts only a structured result indicating whether a real physical toothbrush is clearly visible. Ambiguous scenes, drawings, screenshots, and text-only images must fail.
2. **Structured daily planning:** the server submits only the user’s explicit brain dump and receives one First Move, up to three priority tasks, up to three optional tasks, fixed categories and durations, and a concrete first step for every item. Nothing is saved before review and confirmation.

Both integrations default to the `gpt-5.6-luna` model identifier and can be overridden with `OPENAI_MODEL`.

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
| `OPENAI_API_KEY` | Live AI only | unset | Server-side OpenAI credential |
| `OPENAI_MODEL` | No | `gpt-5.6-luna` | Model used by both live routes |
| `OPENAI_LIVE_VISION` | No | `false` | Set exactly `true` to enable live toothbrush verification |
| `OPENAI_LIVE_PLANNING` | No | `false` | Set exactly `true` to enable live daily planning |

Never commit `.env.local` or credentials. Enabling a live flag without `OPENAI_API_KEY` returns a safe configuration error and does not fall back to an undisclosed paid call.

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
4. For a live demo, add `OPENAI_API_KEY` as a protected server environment variable, set only the desired live flag to `true`, and optionally set `OPENAI_MODEL`.
5. Redeploy, then verify one request manually. Monitor OpenAI usage limits and hosting logs without logging submitted text or images.

The API routes require a Node.js runtime. A static-only host cannot provide live AI verification or planning.

## Current limitations

- Single anonymous browser profile; no authentication, sync, export/import, or backup
- Browser timers cannot guarantee system-level alarms when the browser or device suspends the page
- No app/site blocking, native mobile app, payments, social features, or shared pet
- Camera behavior depends on browser support, HTTPS, and user permission
- AI output can be wrong and always requires user review
- The kitten is intentionally lightweight SVG/CSS animation rather than a full game
- Accessibility has received semantic, keyboard, contrast, touch-target, and reduced-motion attention, but has not received a formal third-party audit

## Post-hackathon roadmap

- Add local export/import and optional encrypted sync
- Add opt-in sound and vibration completion cues with clearer browser limitations
- Expand end-to-end accessibility testing and screen-reader validation
- Improve offline/PWA support and installability
- Add more local First Move templates and user-authored template packs
- Run user research on the stuck-to-intent flow and simplify it further
- Add transparent per-request cost estimates and administrator usage caps for live AI

## License

No license has been selected for this Build Week repository yet.
