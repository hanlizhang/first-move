# First Move Mobile — M0 + M1A + M1B

This is an independent Expo React Native project. The Next.js Web app remains at the repository root and is not a package workspace dependency.

## M0 boundary

- Expo SDK 57, React Native, TypeScript, and Expo Router.
- Placeholder tabs for First Moves, Today, Focus, Cat, and Settings.
- Loading, signed-out, Guest Mode, authenticated, and privacy-safe error states.
- Email magic links using `firstmove://auth/callback`.
- Supabase sessions persisted through an `expo-secure-store` adapter backed by iOS Keychain and Android Keystore-encrypted storage. Long session values are safely chunked.
- Schema-v8 Guest storage, per-account local storage, and validated account-scoped cloud caches remain separate.
- Existing initialized accounts are read through `cloud_workspace_status` and then `get_cloud_workspace_v2` only.
- Empty accounts show that cloud setup remains unavailable in M1B.

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

M1A/M1B do not implement Tasks/Habits UI, cloud writes, post-session choices, Cat, Morning Start, AI, RevenueCat, notifications, background services, or SQL changes.

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
- [ ] An empty account shows that cloud setup is unavailable in M1B and makes no setup/import RPC.
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

- [ ] In Guest Mode, save each allowed duration (2/5/10/25) and confirm Focus starts that exact countdown; no other duration control appears.
- [ ] Start, wait, pause, leave Focus, return, and confirm paused remaining time does not change; resume and confirm it continues from the saved value.
- [ ] With a countdown running, reload/restart the app and confirm the remaining time reflects wall-clock time rather than resetting.
- [ ] Let a timer expire, including while the app is away, and confirm one completed session with actual elapsed time equal to its bound.
- [ ] Stop early and confirm neutral stopped wording plus the actual elapsed time; confirm no reward, points, timeline, or history UI appears.
- [ ] Cancel before start and confirm the pending intent is removed; cancel while running and confirm the session is removed while the pending First Move remains ready.
- [ ] Repeated taps/reloads never create two open sessions or duplicate a completed session.
- [ ] Create an authenticated intent/session, sign out, continue as Guest, and confirm only prior Guest data appears; sign back into the same account and confirm its local state returns.
- [ ] Sign into a different account and confirm neither Guest nor the first account’s local state is shown or merged.
