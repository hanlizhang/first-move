# First Move Mobile — M0 through M1E

This is an independent Expo React Native project. The Next.js Web app remains at the repository root and is not a package workspace dependency.

Current status: M0 through M1E are implemented. The deep-link callback, magic-link sign-in, authenticated session persistence across restart, and canonical initialized-workspace hydration are manually verified on iOS Simulator. True-device iOS/Android acceptance and the full Mobile↔Web/offline/restart/account-switch M1E checklist remain pending.

The M0–M1D sections below preserve each increment’s historical boundary. M1E supersedes their authenticated read-only/no-business-write constraints for the current app.

## M0 boundary

- Expo SDK 57, React Native, TypeScript, and Expo Router.
- Placeholder tabs for First Moves, Today, Focus, Cat, and Settings.
- Loading, signed-out, Guest Mode, authenticated, and privacy-safe error states.
- Email magic links using `firstmove://auth/callback`.
- Supabase sessions persisted through an `expo-secure-store` adapter backed by iOS Keychain and Android Keystore-encrypted storage. Long session values are safely chunked.
- Schema-v8 Guest storage, per-account local storage, and validated account-scoped cloud caches remain separate.
- Existing initialized accounts are read through `cloud_workspace_status` and then `get_cloud_workspace_v2` only.
- Empty accounts show that Mobile cloud setup/import remains unavailable.

M0 does not import, merge, initialize, or write business data. It does not call `initialize_cloud_workspace`, `initialize_cloud_workspace_v2`, or `sync_cloud_workspace_v1`.

## M1A boundary

- The local, non-AI I’m Stuck path works in Guest Mode without an account or network.
- All six stuck states and the exact five PRD directions use the same offline template semantics as Web.
- A suggestion can be replaced, edited, entered manually, or shortened to a valid 2/5/10/25-minute duration.
- Saving creates one validated pending `ActivityIntent` in the active schema-v8 local workspace through AsyncStorage.
- Signed-in use writes only to a local namespace for that Supabase Auth UUID; Guest data and other accounts remain separate.
- Cloud hydration is still read-only and no business-data RPC is called.

## M1B boundary

- Focus starts the current pending intent as one local schema-v8 `ActivitySession`.
- Countdown creation is restricted to the intent’s 2, 5, 10, or 25 minute bound.
- Elapsed and remaining time derive from persisted timestamps, so running and paused sessions restore after reload or app restart.
- Pause, resume, automatic zero completion, neutral early stop, and cancellation are local and duplicate-safe.
- Completed and stopped sessions save actual elapsed time. M1B itself introduced no client-authoritative reward or history behavior; the current server contract may derive the documented reduced reward for a stopped Session.
- Signing out exposes neither the account-local intent nor its session in Guest Mode; neither workspace is deleted or merged.

## M1C boundary

- Focus keeps a pending First Move in its own prominent card while standalone Countdown and Stopwatch remain available.
- Quick Countdown offers 2/5/10/25/50-minute presets and validated whole custom minutes from 1 through 720.
- Standalone Countdown and Stopwatch accept an optional title, one of the five directions, and one existing Task or Habit link or no link. They never create an `ActivityIntent`.
- Selecting Intentional Entertainment as the standalone direction keeps those normal Focus duration options. Only the separate dedicated Intentional Entertainment flow is limited to 5/10 minutes.
- The same M1B timestamp engine handles Countdown and Stopwatch start, pause, resume, recovery, stop/cancel, duplicate prevention, and actual elapsed time.
- A running timer is owned by the device that started it. Persisted Session state converges through normal sync; running timers are not synchronized or taken over in realtime across devices.
- Completed and intentionally stopped Sessions are saved before review. `Edit details` is optional and can update title/direction; standalone Sessions can also link, relink, or unlink an existing Task/Habit.
- Completing or stopping an assisted Session clears its pending state but retains the full historical Intent as consumed. Cancelling the Session creates no closed result and keeps the First Move pending.
- Guest and per-Supabase-UUID local workspaces remain separate. Active canonical Tasks/Habits are offered only from the current UUID’s validated read-only cache and retain their UUID without being copied.
- M1E now preserves ordered assisted start/close mutations and serializes only the active pending Intent view to the current snapshot RPC; retained local `consumed` history is never sent back as pending.

## M1D boundary

- Today opens dedicated Tasks and Habits screens backed only by the currently selected Guest or Supabase-UUID account-local AsyncStorage namespace.
- Tasks use the schema-v8 `Task` shape and support UUID-v4 creation, title/direction edits, complete/uncomplete for the current local date, and removal from the active list.
- Habits use the schema-v8 `Habit` and `HabitSchedule` shapes and support UUID-v4 creation, title/direction/schedule edits, current-date check/uncheck when scheduled, and removal from the active list.
- Daily and non-empty selected-weekday schedules use the canonical `sun` through `sat` values. Titles normalize whitespace and remain bounded to 160 characters; timestamps remain ISO instants.
- Active canonical Tasks/Habits from the current authenticated UUID are shown separately as read-only. They retain their canonical UUID and are never copied into account-local state.
- Focus uses one compact linked-item field that opens a searchable modal with No linked item, Tasks, Habits, local/canonical source labels, and an explicit selected state.
- Active-list deletion leaves historical `linkedTaskId` / `linkedHabitId` values intact. M1E now translates deletion of an already-canonical row through the existing `deleted_at` tombstone contract.
- M1D creates no rewards or history and calls no business-write RPC.

At their original milestone boundaries, M1A/M1B/M1C/M1D did not implement authenticated cloud business writes, Phase B2 setup choices, post-session choices, rewards/history presentation, Cat, Morning Start, AI, RevenueCat, notifications, background services, or SQL/RPC changes. M1E now supplies the scoped authenticated writes described below.

## M1E authenticated writes

- Guest Mode remains fully local. An authenticated account becomes editable only after `cloud_workspace_status` confirms it is initialized and a canonical `get_cloud_workspace_v2` response has passed the complete schema-v8 validator.
- On first successful M1E hydration, canonical Supabase state replaces that UUID’s working/cache state. Existing account-local M1D rows are never submitted or merged into the full snapshot, so they cannot accidentally tombstone canonical rows. Empty accounts remain write-disabled; Start fresh and Import this device remain future work.
- Authenticated Task, Habit/check-in, pending Intent, and Session lifecycle/review changes update the owner-local working copy immediately after their full snapshot is durably queued in AsyncStorage.
- The queue stores one stable device UUID and ordered mutation UUIDs per Supabase Auth UUID. It survives restart, retries the same mutation ID, revalidates the current session UUID before every dispatch, and is never drained by another account or Guest Mode.
- Startup, foreground, manual retry, and manual refresh flush pending writes before any canonical read. A failed or invalid response leaves the mutation queued and never replaces valid local state; only a fully validated response becomes canonical and updates the working/cache copy.
- Mobile reuses `sync_cloud_workspace_v1` with schema-v8 state, unchanged canonical daily-plan passthrough, empty economic-command arrays, current IANA timezone, and stable relationship UUIDs. Retained local consumed Intent history is filtered from the wire so the RPC receives only the active pending Intent view.
- Task/Habit completion and Session rewards remain server-derived. Mobile never calculates or submits a point balance, reward ledger mutation, purchase, or inventory consumption command.
- Running timers remain device-owned and non-realtime; only persisted Session state converges through this sync runtime.
- Deliberately still local or unavailable: Guest data, offline templates, transient form state, empty-account setup/import, Today/history presentation, post-session choices, Cat/Morning Start, AI, RevenueCat, notifications, and background services.

## Local setup

```sh
cd mobile
cp .env.example .env.local
npm install
npm start
```

Fill `.env.local` with only:

```text
EXPO_PUBLIC_SUPABASE_URL=...
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
```

Do not place a service-role key, database password, JWT signing secret, OpenAI key, or RevenueCat secret in the mobile project.

Press `i` for iOS or `a` for Android from the Expo CLI. Guest navigation can be inspected in Expo Go. The custom `firstmove://` callback needs a native development build:

```sh
cd mobile
npx expo run:ios
# or
npx expo run:android
```

The generated `/mobile/ios` and `/mobile/android` directories are ignored. The simulator development profile does not require committing generated native projects.

## Supabase redirect URL

Add this exact URL to the Supabase Auth redirect allow list before testing email sign-in:

```text
firstmove://auth/callback
```

This is a manual dashboard change. Repository setup and automated checks do not change remote Supabase configuration.

## Checks

```sh
cd mobile
npm run lint
npm run type-check
npm test
npx expo install --check
npx expo export --platform ios --output-dir dist/ios-check
npx expo export --platform android --output-dir dist/android-check
cd ..
git diff --check
```

## Manual M0 acceptance

These checklists preserve milestone-specific checks. The recorded iOS Simulator verification is marked below; true-device acceptance remains open.

- [ ] A clean launch shows loading, then signed-out state when no secure session exists.
- [ ] Continue as guest opens all five placeholder tabs without a network request.
- [x] A valid `firstmove://auth/callback` deep link reaches the callback screen on iOS Simulator.
- [x] Magic-link sign-in restores the expected Supabase Auth UUID on iOS Simulator.
- [x] The authenticated session persists across an iOS Simulator app restart.
- [x] An initialized account completes validated canonical workspace hydration from `get_cloud_workspace_v2` on iOS Simulator; M1E now makes that hydrated workspace editable.
- [ ] An empty account shows that Mobile cloud setup/import is unavailable and makes no setup/import RPC.
- [ ] Invalid/expired links and failed hydration show generic errors without exposing email, token, journal, or payload data.
- [ ] Sign out returns to signed-out state while Guest Mode data and the account-scoped validated cache remain present.
- [ ] Complete equivalent true-device iOS and Android acceptance.

## Manual M1A acceptance

- [ ] Guest Mode reaches all six stuck states and exactly five directions without network access.
- [ ] Every state/direction pair shows an offline suggestion; Choose another cycles to a different local template.
- [ ] Wording edits and manual entry accept a non-empty move up to 160 characters.
- [ ] Make duration shorter follows 25 → 10 → 5 → 2 and never goes below two minutes.
- [ ] Saving survives app restart and Focus displays the same pending `ActivityIntent` without starting a timer.
- [ ] Change or Cancel removes only the pending intent and leaves other guest data intact.
- [ ] Signed-in use stores the move locally and performs no cloud business-data mutation.

## Manual M1B acceptance

- [ ] In Guest Mode, save each allowed First Move duration (2/5/10/25) and confirm the pending card starts that exact countdown while standalone Focus controls remain separate.
- [ ] Start, wait, pause, leave Focus, return, and confirm paused remaining time does not change; resume and confirm it continues from the saved value.
- [ ] With a countdown running, reload/restart the app and confirm the remaining time reflects wall-clock time rather than resetting.
- [ ] Let a timer expire, including while the app is away, and confirm one completed session with actual elapsed time equal to its bound.
- [ ] Stop early and confirm neutral stopped wording plus the actual elapsed time; confirm no reward, points, timeline, or history UI appears.
- [ ] Cancel before start and confirm the pending intent is removed; cancel while running and confirm the session is removed while the pending First Move remains ready.
- [ ] Repeated taps/reloads never create two open sessions or duplicate a completed session.
- [ ] Create an authenticated intent/session, sign out, continue as Guest, and confirm only prior Guest data appears; sign back into the same account and confirm its local state returns.
- [ ] Sign into a different account and confirm neither Guest nor the first account’s local state is shown or merged.

## Manual M1C acceptance

- [ ] Create a pending First Move and confirm Focus shows its title, direction, intended duration, and existing Task/Habit relationship in a separate card above the standalone tools.
- [ ] While that First Move is pending, start a standalone Countdown and then a standalone Stopwatch; confirm neither Session has `linkedIntentId` and the First Move remains pending after each closes.
- [ ] Start the pending card with **Start this First Move**; complete once and stop once, confirming each saved Session retains `linkedIntentId`, only that matching Intent becomes consumed, and its full Task/Habit relationship remains readable.
- [ ] Cancel a running assisted Session before and after its nominal zero time; confirm no completed/stopped record is created and the First Move remains pending.
- [ ] Start Countdown with each 2/5/10/25/50 preset, plus custom 1 and 720; confirm blank, 0, decimals, exponents, and 721 cannot start.
- [ ] For Countdown and Stopwatch, verify optional blank title defaults, all five directions, no link, a Task link, and a Habit link. Selecting a parent prefills title/direction but both remain editable.
- [ ] Pause, leave Focus, restart the app, return, and resume each mode; confirm paused time is excluded, running time catches up from timestamps, and only Countdown completes automatically at zero.
- [ ] Stop each mode and confirm actual elapsed time plus the saved result appear immediately with no **Save session** action; leave Focus and return to confirm the record remains.
- [ ] Use **Edit details** to change title/direction and link, relink, then unlink a standalone Session. Confirm elapsed time/status stay unchanged and no Task/Habit is created or completed.
- [ ] Edit an assisted Session and confirm its First Move relationship cannot be replaced by a direct Task/Habit link.
- [ ] With an initialized account, link a validated canonical Task and Habit; confirm the local Session stores their stable UUIDs, no parent is copied, and no business-write RPC occurs.
- [ ] Switch between Guest, account A, and account B while Focus data exists; confirm local Sessions and canonical link choices never cross owners, including during hydration/loading.
- [ ] Confirm stopped/completed Sessions add no rewards, points, Today/history entries, notifications, or background service behavior in M1C.

## Manual M1D acceptance

- [ ] In Guest Mode, open Today → Tasks, create a Task, and confirm its normalized title, chosen direction, UUID-v4 identity, created/updated ISO timestamps, order, and empty `completedOn` survive an app restart.
- [ ] Edit that Task’s title and each of the five directions; complete and uncomplete it for the device’s current local date and confirm no reward/history record is created.
- [ ] Delete the Task through the confirmation alert and confirm it leaves the active Task list and new Focus choices while any existing Session/Intent `linkedTaskId` remains unchanged.
- [ ] Open Today → Habits, create one daily Habit and one selected-weekday Habit; confirm an empty selected-weekday set cannot be saved and stored weekday values use `sun`–`sat`.
- [ ] Edit a Habit’s title, direction, and schedule in both directions; on a scheduled local date check and uncheck it, and confirm an unscheduled Habit is labeled and cannot be checked.
- [ ] Delete the Habit through the confirmation alert and confirm it leaves the active Habit list and new Focus choices while historical `linkedHabitId` values remain unchanged.
- [ ] In Focus Countdown, Stopwatch, and standalone Session review, confirm the old long inline list is replaced by one compact field showing `No linked item` or the selected `Task:` / `Habit:` label.
- [ ] Open the linked-item modal, search by title and direction, inspect separate Tasks and Habits groups, choose and clear a relationship, and confirm the selected state is visible and the saved fields remain exactly `linkedTaskId` or `linkedHabitId`.
- [ ] Sign in to initialized account A and confirm account-local Tasks/Habits are editable while canonical Tasks/Habits appear separately as read-only with no edit, check, or delete action; confirm canonical linking preserves the existing UUID.
- [ ] Switch among Guest, account A, and account B and confirm Tasks, Habits, completions, schedules, and Focus choices never merge or cross owners. Sign out and back in to confirm no namespace was deleted.
- [ ] Monitor Supabase requests while creating, editing, completing, scheduling, and deleting account-local items; confirm only auth/status/read hydration occurs and no business-write, setup, import, SQL, or new RPC path is invoked.
- [ ] Confirm M1D adds no rewards, Today timeline/history, post-session choices, Cat/Morning/AI/RevenueCat behavior, notifications, or native dependency.

## Manual M1E acceptance

Prerequisite: use a Web-initialized Supabase account and the same account on Mobile. Do not initialize or push a database from Mobile.

### Mobile → Web

- [ ] Sign in on Mobile and confirm the state moves through **Loading cloud progress** or **Syncing** before **Synced**; authentication alone must never display **Synced**.
- [ ] Confirm canonical Web Tasks and Habits appear in Mobile as one editable working set with their existing UUIDs; confirm old account-local M1D rows were not merged or uploaded.
- [ ] On Mobile, create a Task, edit its title and direction, complete/uncomplete it for today, then delete it. After each settled sync, refresh Web and confirm the same stable parent, local-date completion state, and final soft deletion.
- [ ] On Mobile, create a daily Habit and a selected-weekday Habit, edit title/direction/schedule, check/uncheck today, then delete it. Refresh Web and confirm weekdays, completion facts, stable UUIDs, and tombstone behavior.
- [ ] Create/cancel a pending First Move, then create another and run its Session through start, pause, resume, complete or stop, and review. Refresh Web and confirm ordered Intent/Session relationships and unchanged stable IDs.
- [ ] Complete a Task, Habit, and qualifying Session; confirm Web shows only server-derived rewards/points and that repeated refresh/retry never duplicates them.

### Web → Mobile

- [ ] With no Mobile writes pending, create or edit Tasks/Habits on Web, foreground Mobile or choose **Refresh cloud data**, and confirm the validated canonical state replaces the Mobile working copy.
- [ ] Confirm Web deletions disappear from active Mobile lists while historical Focus relationship labels/IDs remain safe.
- [ ] Confirm an invalid/interrupted canonical read shows **Sync error** or **Offline** and leaves the last valid Mobile working copy unchanged.

### Offline retry

- [ ] After one successful authenticated hydration, disconnect Mobile and create/edit Task/Habit data plus a pending Intent or Session change. Confirm immediate UI updates and **Offline · retry pending** without data loss.
- [ ] Reconnect and choose **Retry and refresh**. Confirm pending snapshots upload in order before the next read, the UI reaches **Synced**, Web converges, and no reward or completion is duplicated.
- [ ] While a write remains failed, choose refresh and confirm the pending local state is not overwritten by an older cloud read.

### App restart

- [ ] Create an authenticated change offline, force-quit, relaunch offline, and confirm the same UUID-scoped working state and pending count restore from AsyncStorage.
- [ ] Reconnect and retry; confirm the original mutation UUID is reused idempotently, the queue clears only after a valid canonical response, and the app reaches **Synced**.

### Account switching and Guest Mode

- [ ] Leave account A with a pending offline change, sign out, and sign into account B. Confirm B never displays or sends A’s state or queue.
- [ ] Make and sync a B change, then return to A and retry. Confirm each owner converges independently and A’s queued mutation is sent only while A is the revalidated current session.
- [ ] Continue as Guest, make Task/Habit/Intent/Session changes offline, and confirm no cloud status/read/write RPC is issued and no account namespace changes.
- [ ] Sign into an uninitialized account and confirm **Cloud writes disabled**, no editing controls, and no initialization/import/write RPC. **Check cloud setup again** may only re-run the existing status boundary.
