# First Move Mobile — M0

This is an independent Expo React Native project. The Next.js Web app remains at the repository root and is not a package workspace dependency.

## M0 boundary

- Expo SDK 57, React Native, TypeScript, and Expo Router.
- Placeholder tabs for First Moves, Today, Focus, Cat, and Settings.
- Loading, signed-out, Guest Mode, authenticated, and privacy-safe error states.
- Email magic links using `firstmove://auth/callback`.
- Supabase sessions persisted through an `expo-secure-store` adapter backed by iOS Keychain and Android Keystore-encrypted storage. Long session values are safely chunked.
- Schema-v8 guest storage and validated, account-scoped cloud caches remain separate.
- Existing initialized accounts are read through `cloud_workspace_status` and then `get_cloud_workspace_v2` only.
- Empty accounts show that cloud setup is unavailable until M1.

M0 does not import, merge, initialize, or write business data. It does not call `initialize_cloud_workspace`, `initialize_cloud_workspace_v2`, or `sync_cloud_workspace_v1`.

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

The generated `/mobile/ios` and `/mobile/android` directories are ignored. M0 does not include store-release or EAS configuration.

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
- [ ] An empty account shows “Cloud setup is not available until M1” and makes no setup/import RPC.
- [ ] Invalid/expired links and failed hydration show generic errors without exposing email, token, journal, or payload data.
- [ ] Sign out returns to signed-out state while Guest Mode data and the account-scoped validated cache remain present.
