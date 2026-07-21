# First Move — Build Week Submission

## One-sentence pitch

First Move helps someone break out of passive scrolling or inactivity by choosing one tiny intentional action, tracking a bounded session, and caring for a forgiving virtual kitten.

## Devpost project description

First Move is a private, mobile-first Next.js app designed for the moment when a person knows their current scrolling or inactivity is not helping but cannot easily switch states. Instead of presenting an overwhelming productivity system, it asks what is happening, offers five neutral directions—including Rest and Intentional Entertainment—and turns the choice into one editable First Move.

The user can track a short countdown or stopwatch session, stop without punishment, review what happened, and see the activity in a local timeline, trends, and calendar. Tasks, habits, a Mini Journal, points, and an original pixel kitten provide continuity without accounts or cloud storage. Morning Start optionally uses a current toothbrush photo as a concrete transition into the day.

GPT-5.6 Luna adds multimodal toothbrush verification and structured daily planning, while deterministic mocks and complete manual paths keep the experience usable without an API key.

## Problem

When someone is trapped in passive scrolling, lying in bed, overwhelmed by a large task, or unsure whether they need action or rest, a conventional task manager starts too late. The hardest step is often switching into an intentional state at all. Shame, streak loss, and large plans can add more friction.

## Solution

First Move narrows the moment to one decision at a time:

- notice the stuck state
- choose a direction
- select or write one tiny physical or visible action
- choose a bounded duration
- track the actual time
- stop, continue, rest, or use entertainment intentionally
- receive neutral feedback and an optional short reflection

Missed days and stopped sessions never harm the kitten or remove progress.

## How GPT-5.6 is used

**Multimodal toothbrush verification:** GPT-5.6 Luna receives a low-detail, explicitly submitted image through the Responses API. Strict structured output reports `passed`, `detectedObject`, and `shortMessage`. The check passes only for a clearly visible real toothbrush.

**Structured daily planning:** GPT-5.6 Luna organizes only the submitted brain dump into one First Move, up to three priority tasks, and up to three optional tasks. Every proposal has one of five categories, a bounded duration, and a concrete first step. The result is editable and is never applied automatically.

## How Codex is used

Codex supported the architecture and implementation; designed strict data models and safe migrations; built timestamp-based timer/session logic; created and repaired tests; integrated browser camera compression and server-side OpenAI routes; and debugged responsive and accessibility behavior across phone, tablet, and desktop viewports.

## Technical implementation

- Next.js 16 App Router, React 19, TypeScript, Tailwind CSS, and npm
- Versioned, normalized `localStorage` repository with malformed-data recovery
- Separate Task, Habit, ActivityIntent, ActivitySession, reward, journal, inventory, and progress models
- Timestamp-derived countdown/stopwatch recovery across refreshes
- Local-date aggregation for Today, trends, calendar history, active days, and milestones
- Official OpenAI JavaScript SDK and Responses API with strict JSON schemas
- Browser-side image compression to a maximum 768-pixel JPEG
- Original local SVG kitten, CSS step animations, reduced-motion handling, and pointer-clamped wand play
- Node test runner with mocked OpenAI dependencies and no network calls

## Challenges

- Separating intended activity from actual tracked sessions without duplicating tasks
- Making rewards, daily records, and milestone grants idempotent across reload and migration
- Recovering running timers from timestamps under browser throttling
- Supporting camera, upload, mock, and live verification without retaining images
- Keeping a feature-rich local app readable at 100% zoom across 375–1440 pixel widths
- Giving each kitten interaction a recognizable state with small SVG/CSS primitives

## Accomplishments

- A complete local manual path works without AI or credentials
- Both AI features are explicit, structured, bounded, and reviewable
- No database, authentication, or cloud account is required
- Refresh-safe sessions feed accurate timelines and history
- The kitten uses forgiving lifetime active-day progression rather than punishment
- Production builds and the automated test suite run without live API requests

## Lessons learned

- The product’s real unit is not a task; it is the transition from stuck to intentional.
- Intent and tracked time need separate models.
- Local-first still requires migrations, validation, and idempotency.
- Mock mode is useful product infrastructure, not only test infrastructure.
- Neutral language matters as much as timer accuracy in an intentional-use tool.
- A small visual companion can reinforce continuity without punitive mechanics.

## Next steps

- Conduct user research and shorten the First Move flow further
- Add export/import and optional encrypted synchronization
- Expand screen-reader and end-to-end browser testing
- Add installable PWA/offline polish
- Add user-authored local template packs
- Add visible live-request cost estimates and deployment usage caps

## Testing instructions

```bash
npm install
npm test
npm run lint
npm run type-check
npm run build
npm run dev
```

Leave `OPENAI_LIVE_VISION` and `OPENAI_LIVE_PLANNING` false for the deterministic, credential-free demo. Open `http://localhost:3000`, use the development Morning Check pass control, organize a sample brain dump, confirm the plan, start and complete a short session, add a Mini Journal entry, and inspect Today and Cat.

## Demo video script — under 3 minutes

**0:00–0:15 — Problem and promise**  
“When you know scrolling is making the moment worse but still cannot switch, a large productivity system is another obstacle. First Move asks for one tiny intentional action.”

**0:15–0:40 — Morning Start**  
Show the toothbrush photo flow, explain local compression, click Verify, and show the kitten feedback. Mention that mock mode is safe by default and live GPT-5.6 Luna verification is opt-in.

**0:40–1:10 — Plan the day**  
Enter a short brain dump, click Organize with AI, show the structured plan, edit one item, use Make this smaller, and confirm. Explain that GPT-5.6 Luna receives only submitted text and nothing saves before review.

**1:10–1:35 — First Move and Focus**  
Choose a stuck state and direction, edit the move, select two minutes, start it, and show the Focus timer. Stop early or complete it and show the neutral review.

**1:35–1:55 — Today**  
Show tracked time, the activity timeline, Trends, Calendar, and the private Mini Journal. Emphasize local-date aggregation and on-device journal storage.

**1:55–2:25 — Cat Room**  
Show points, one food interaction, yarn or wand play, milestone cards, and the garden preview. Explain lifetime active days and no absence punishment.

**2:25–2:45 — Architecture and safety**  
Show the README architecture diagram in words: validated local state, server-only key, two explicit API routes, structured outputs, no retries, and full mock/manual fallbacks.

**2:45–2:55 — Close**  
“First Move does not ask you to fix the whole day. It helps you choose the next two minutes.”

## Shot-by-shot demo checklist

- [ ] Clean browser at 100% zoom; hide bookmarks and unrelated tabs
- [ ] First Moves view and problem statement
- [ ] Morning Check camera/upload preview and explicit Verify click
- [ ] Success state and kitten drinking reaction
- [ ] Brain dump and explicit Organize with AI click
- [ ] Editable structured review, reorder, and Make this smaller
- [ ] Confirmed compact plan summary
- [ ] Stuck state, direction, editable First Move, and duration
- [ ] Focus countdown/stopwatch and neutral session review
- [ ] Today summary, timeline, Trends, Calendar, and Mini Journal privacy note
- [ ] Cat food/toy/trick interaction and active-day milestone cards
- [ ] Day-100 garden/butterfly development preview
- [ ] Mobile-width navigation and one-column layout
- [ ] Final title card with repository/demo URL

## Disclaimer

First Move is inspired by behavioral activation and intentional-use design, but it is not medical treatment, does not diagnose any condition, and does not claim to stimulate or repair the prefrontal cortex. It is not a crisis service or substitute for professional care.
