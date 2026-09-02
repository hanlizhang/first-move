# First Move Mobile — M0 + M1A + M1B + M1C + M1D

This is an independent Expo React Native project. The Next.js Web app remains at the repository root and is not a package workspace dependency.

## M0 boundary

- Expo SDK 57, React Native, TypeScript, and Expo Router.
- Placeholder tabs for First Moves, Today, Focus, Cat, and Settings.
- Loading, signed-out, Guest Mode, authenticated, and privacy-safe error states.
- Email magic links using `firstmove://auth/callback`.
- Supabase sessions persisted through an `expo-secure-store` adapter backed by iOS Keychain and Android Keystore-encrypted storage. Long session values are safely chunked.
- Schema-v8 Guest storage, per-account local storage, and validated account-scoped cloud caches remain separate.
- Existing initialized accounts are read through `cloud_workspace_status` and then `get_cloud_workspace_v2` only.
- Empty accounts show that cloud setup remains unavailable until M1E.

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
- Completed and stopped sessions save actual elapsed time. M1B adds no rewards, points, timeline, history, or statistics.
- Signing out exposes neither the account-local intent nor its session in Guest Mode; neither workspace is deleted or merged.

## M1C boundary

- Focus keeps a pending First Move in its own prominent card while standalone Countdown and Stopwatch remain available.
- Quick Countdown offers 2/5/10/25/50-minute presets and validated whole custom minutes from 1 through 720.
- Standalone Countdown and Stopwatch accept an optional title, one of the five directions, and one existing Task or Habit link or no link. They never create an `ActivityIntent`.
- The same M1B timestamp engine handles Countdown and Stopwatch start, pause, resume, recovery, stop/cancel, duplicate prevention, and actual elapsed time.
- Completed and intentionally stopped Sessions are saved before review. `Edit details` is optional and can update title/direction; standalone Sessions can also link, relink, or unlink an existing Task/Habit.
- Completing or stopping an assisted Session clears its pending state but retains the full historical Intent as consumed. Cancelling the Session creates no closed result and keeps the First Move pending.
- Guest and per-Supabase-UUID local workspaces remain separate. Active canonical Tasks/Habits are offered only from the current UUID’s validated read-only cache and retain their UUID without being copied.
- A later cloud writer must preserve ordered assisted start/close mutations and serialize only the active pending Intent view to the current snapshot RPC; retained local `consumed` history must never be sent back as pending.

## M1D boundary

- Today opens dedicated Tasks and Habits screens backed only by the currently selected Guest or Supabase-UUID account-local AsyncStorage namespace.
- Tasks use the schema-v8 `Task` shape and support UUID-v4 creation, title/direction edits, complete/uncomplete for the current local date, and removal from the active list.
- Habits use the schema-v8 `Habit` and `HabitSchedule` shapes and support UUID-v4 creation, title/direction/schedule edits, current-date check/uncheck when scheduled, and removal from the active list.
- Daily and non-empty selected-weekday schedules use the canonical `sun` through `sat` values. Titles normalize whitespace and remain bounded to 160 characters; timestamps remain ISO instants.
- Active canonical Tasks/Habits from the current authenticated UUID are shown separately as read-only. They retain their canonical UUID and are never copied into account-local state.
- Focus uses one compact linked-item field that opens a searchable modal with No linked item, Tasks, Habits, local/canonical source labels, and an explicit selected state.
- Active-list deletion leaves historical `linkedTaskId` / `linkedHabitId` values intact. A later authenticated writer must translate deletion of an already-canonical row to the existing `deleted_at` tombstone contract.
- M1D creates no rewards or history and calls no business-write RPC.

M1A/M1B/M1C/M1D do not implement authenticated cloud business writes, Phase B2 setup choices, post-session choices, rewards/history, Cat, Morning Start, AI, RevenueCat, notifications, background services, or SQL/RPC changes.

## M1E authenticated-write work remaining

- Add explicit Start fresh, Import this device, and Use cloud progress choices without automatically merging or deleting Guest data.
- Add an explicit activation choice for account-local M1D records that already coexist with an initialized canonical workspace. Never submit the account-local array as a full snapshot before reconciliation, because absent canonical rows would be tombstoned by `sync_cloud_workspace_v1`; after activation, expose canonical parents for editing under their same UUID rather than copying them to new IDs.
- Add a stable device identity plus a durable, retry-safe, ordered local mutation/outbox pipeline. Assisted Focus delivery must create its Intent before closing its Session and serialize only the active pending Intent view.
- Serialize UUID Task/Habit parents before relationships; materialize a referenced local parent that was deleted before the outbox existed before tombstoning it; map later active-list deletion to canonical tombstones; converge title, direction, Task rank, Habit schedule weekdays, and completion/uncompletion facts by local date and captured IANA timezone.
- Treat acknowledged validated Supabase responses as canonical, keep the account-local cache and pending work on failure, and never expose one auth UUID’s cache or writes to another owner.
- Let the server create idempotent Task/Habit completion rewards. Do not trust or synthesize a Mobile point total or client reward ledger.
- Only after those paths exist, enable canonical Task/Habit editing and run Web/iOS/Android same-account create/edit/delete/schedule/check/offline-retry plus owner-isolation acceptance.

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

- [ ] A clean launch shows loading, then signed-out state when no secure session exists.
- [ ] Continue as guest opens all five placeholder tabs without a network request.
- [ ] A valid email request says to check email and uses `firstmove://auth/callback`.
- [ ] Opening a valid link reaches the callback screen, restores the same Supabase Auth UUID, and survives app restart.
- [ ] An initialized account loads a verified read-only summary from `get_cloud_workspace_v2`.
- [ ] An empty account shows that cloud setup is unavailable until M1E and makes no setup/import RPC.
- [ ] Invalid/expired links and failed hydration show generic errors without exposing email, token, journal, or payload data.
- [ ] Sign out returns to signed-out state while Guest Mode data and the account-scoped validated cache remain present.

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
