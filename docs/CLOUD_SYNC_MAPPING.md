# First Move schema-v8 to Supabase mapping

Status: historical Phase B1 mapping audit and current schema reference. Since this audit, the frozen Web Sync v1 runtime and every repository migration through `20260731180000_continuous_cloud_sync.sql` have been implemented and remotely applied; Mobile M1E reuses the same RPC/canonical contract for already-initialized accounts. The mapping tables below are preserved rather than rewritten; current delivery status lives in `PRD.md`, `TASKS.md`, and `docs/MOBILE_V1_HANDOFF.md`.

## Mapping conventions

- Current sources are [`src/lib/models.ts`](../src/lib/models.ts), [`src/lib/daily-plan-state.ts`](../src/lib/daily-plan-state.ts), [`src/lib/planning-review.ts`](../src/lib/planning-review.ts), [`src/lib/repository.ts`](../src/lib/repository.ts), [`src/lib/app-state.ts`](../src/lib/app-state.ts), [`src/lib/sessions.ts`](../src/lib/sessions.ts), [`src/lib/rewards.ts`](../src/lib/rewards.ts), [`src/lib/reflections.ts`](../src/lib/reflections.ts), [`src/lib/morning-check.ts`](../src/lib/morning-check.ts), [`src/lib/cat-store.ts`](../src/lib/cat-store.ts), and [`src/lib/progress.ts`](../src/lib/progress.ts).
- Cloud entity IDs are UUIDs. Phase B2 Start fresh creates new cloud UUIDs; it does not reinterpret or upload prefixed local string IDs.
- Mutable rows use optimistic `version`, server `updated_at`, and `deleted_at` tombstones. Direct hard DELETE is denied to authenticated clients.
- Append-only rows are readable by their owner but writable only through trusted commands/RPCs. Corrections use compensating events.
- `local_date` is a PostgreSQL `date`; instants are UTC `timestamptz`; `timezone` is the captured IANA timezone.
- For a closed session, `local_date` and `timezone` are finalized from `endedAt`, matching the current active-day logic. An open session may initially carry its start day and update it transactionally when closed.

## Profile, settings, and top-level state

| Current TypeScript source and field | Target table.column | Model | Conflict rule | Deletion rule | Idempotency / uniqueness |
| --- | --- | --- | --- | --- | --- |
| `AppState.schemaVersion` (`models.ts`) | Client codec metadata; `import_batches.source_schema_version` only for a future import | Client-only | Highest supported local codec; never LWW | Removed only with local cache | One version per serialized local snapshot |
| Authenticated identity (Phase A Supabase Auth) | `profiles.user_id`, all owned `user_id` columns | Mutable owner identity | `auth.uid()` is authoritative | Auth-user deletion cascades account data | `profiles.user_id` PK |
| `UserProgress.firstUseDate` (`models.ts`, `progress.ts`) | `profiles.first_use_local_date` | Mutable singleton | Earliest accepted first-use date; do not move later automatically | Account cascade only | One profile per user |
| Device/profile timezone (new cloud metadata) | `profiles.timezone` | Mutable singleton | Explicit field update; never rewrites historic dates | Account cascade only | One profile per user |
| `Inventory.selectedFurnitureId` (`models.ts`, `cat-store.ts`) | `user_settings.selected_furniture_id` | Server-maintained mutable projection | Version-checked command; server verifies catalog kind and positive owned balance | Account cascade; selecting none sets NULL | One `user_settings` row per user |
| `UserProgress.points` | `point_balances.points_tenths` view from `reward_ledger` | Derived | Ledger sum always wins | Never client-deleted | No writable balance column |
| `UserProgress.activeDateKeys` | `active_days.local_date` view | Derived | Set union of qualifying facts | Follows source tombstones; immutable checks remain | Unique by SQL `UNION` |
| `UserProgress.unlockedMilestones` | Derived from active-day count and milestone thresholds | Derived | Monotonic product rule | Never reduced by missed days | Threshold set `{21,50,100}` |
| `UserProgress.grantedMilestones` | `milestone_grants.milestone_day` | Append-only | First grant wins | Account cascade only | Unique `(user_id,milestone_day)` |
| `UserProgress.lastActiveDate` | `max(active_days.local_date)` | Derived | Recompute from canonical facts | Not directly deletable | Derived |
| `UserProgress.journeyDay` | `profiles.first_use_local_date` plus viewing local date | Derived | Recompute at read time | Not directly deletable | Derived |
| `UserProgress.totalActiveDays` | `count(active_days.local_date)` | Derived | Recompute at read time | Not directly deletable | Derived |
| `UserProgress.gentleStreak` | Derived from ordered `active_days` | Derived | Recompute at read time | Not directly deletable | Derived |
| `AppState.tasks`, `habits`, `activityIntents`, `sessions`, `rewardEvents`, `journalEntries`, `morningChecks`, `morningAttempts`, `inventory` | Respective normalized rows below | Container only | Per-entity rules below | Local snapshot remains untouched through B1–B4 | No giant production JSON row |

There is no current general preferences model in schema-v8. `profiles` covers cloud timezone/first-use metadata, and `user_settings` covers the one current persisted setting-like field, selected furniture.

## Tasks and task completions

Source: `Task` in `models.ts`; mutations and reward creation in `app-state.ts`.

| Field | Target | Model / conflict | Deletion | Idempotency / uniqueness |
| --- | --- | --- | --- | --- |
| `Task.id` | `tasks.id` | Mutable entity; client-generated cloud UUID | Tombstone task | PK plus unique `(user_id,id)` |
| `title` | `tasks.title` | Same-field concurrent edits require user choice; non-overlapping edits merge by version | Retained in tombstone for history | Length 1–160 |
| `direction` | `tasks.direction` | Same as title | Same task tombstone | Enum of five directions |
| `order` | `tasks.rank` | Convert integer order to stable rank; concurrent order resolves by `(rank,id)` | Same task tombstone | Indexed per user; rebalance is idempotent mutation |
| `createdAt` | `tasks.created_at` | Server canonical creation instant for Start fresh | Preserved | PK makes create idempotent |
| `updatedAt` | `tasks.updated_at` | Server timestamp plus `version` | Preserved | Version-checked update |
| `completedOn[]` | One `task_completions` row per `local_date`; `timezone`, `occurred_at` captured | Completion and uncompletion are independent mutable facts; explicit re-complete restores tombstone | Uncomplete sets `deleted_at`; task history/reward remains | Unique `(user_id,task_id,local_date)` |

The task reward command inserts `reward_ledger.source_id = task_completions.id`, not `tasks.id`, so each daily completion can earn once.

## Habits, schedules, and completions

Source: `Habit`, `HabitSchedule`, and `Weekday` in `models.ts`; mutations in `app-state.ts`.

| Field | Target | Model / conflict | Deletion | Idempotency / uniqueness |
| --- | --- | --- | --- | --- |
| `Habit.id` | `habits.id` | Mutable entity, optimistic version | Habit tombstone | PK plus unique `(user_id,id)` |
| `title` | `habits.title` | Same-field conflict is surfaced | Same tombstone | Length 1–160 |
| `direction` | `habits.direction` | Same-field conflict is surfaced | Same tombstone | Direction enum |
| `schedule.kind` | `habits.schedule_kind` | Version-checked; switching to daily tombstones active weekday rows | Same tombstone | `daily` or `weekdays` check |
| `schedule.weekdays[]` | One `habit_schedule_weekdays` row per weekday | Set merge; same weekday add/remove uses row version/tombstone | Weekday removal sets `deleted_at` | Unique `(user_id,habit_id,weekday)` |
| `createdAt` | `habits.created_at` | Server canonical for Start fresh | Preserved | PK create |
| `updatedAt` | `habits.updated_at` | Server timestamp plus version | Preserved | Version-checked update |
| `completedOn[]` | One `habit_completions` row per `local_date`, with timezone/occurrence instant | Same completion rule as tasks | Uncomplete tombstones; reward remains | Unique `(user_id,habit_id,local_date)` |

Habit rewards use `reward_ledger.source_id = habit_completions.id`.

## Activity intents

Source: `ActivityIntent` in `models.ts`; creation/cancellation in `app-state.ts`.

| Field | Target | Model / conflict | Deletion | Idempotency / uniqueness |
| --- | --- | --- | --- | --- |
| `id` | `activity_intents.id` | Mutable state record | Cancel becomes `status='cancelled'`; later retention uses tombstone | PK and client mutation UUID |
| `stuckState` | `stuck_state` | Immutable after accepted create | Retained for history | Six-value check |
| `direction` | `direction` | Version-checked before session starts | Retained | Direction enum |
| `moveText` | `move_text` | Same-field conflict surfaced | Retained | Length 1–160 |
| `intendedDurationMinutes` | `intended_duration_minutes` | Version-checked | Retained | One of 2/5/10/25 |
| `linkedTaskId` | `linked_task_id` | Parent ownership enforced by composite FK | Parent uses tombstone, not hard delete | At most one task/habit link |
| `linkedHabitId` | `linked_habit_id` | Same | Same | At most one task/habit link |
| `createdAt` | `created_at` | Server canonical for Start fresh | Preserved | PK create |
| `status: "pending"` | `status` (`pending`, later `consumed`/`cancelled`) | First valid transition wins | Status transition before eventual tombstone | Partial unique: one pending intent per user |

## Activity sessions

Source: `ActivitySession` in `models.ts`; state machine in `sessions.ts`.

| Field | Target | Model / conflict | Deletion | Idempotency / uniqueness |
| --- | --- | --- | --- | --- |
| `id` | `activity_sessions.id` | Mutable state machine | Tombstone only; closed history is retained | PK plus one-open-session partial unique index |
| `mode` | `mode` | Immutable after start | Retained | Countdown/stopwatch enum |
| `direction` | `direction` | Editable during review with version check | Retained | Direction enum |
| `label` | `label` | Editable during review; same-field conflict surfaced | Retained | Length 1–160 |
| `targetDurationMinutes` | `target_duration_minutes` | Immutable after start | Retained | Countdown requires 1–720; stopwatch may be NULL |
| `linkedTaskId` | `linked_task_id` | Review can relink; version checked | Parent tombstone preserves FK | At most one of task/habit/intent |
| `linkedHabitId` | `linked_habit_id` | Same | Same | Same check |
| `linkedIntentId` | `linked_intent_id` | Same | Same | Same check |
| `status` | `status` | Server state machine; first valid close wins; closed cannot reopen | Closed rows retained | One running/paused row per user |
| `startedAt` | `started_at` | Immutable occurrence instant | Preserved | Required |
| `lastResumedAt` | `last_resumed_at` | Pause/resume transition under row version | Cleared on pause/close | Status consistency check |
| `accumulatedElapsedMs` | `accumulated_elapsed_ms` | Server transition result wins | Preserved | Nonnegative |
| `endedAt` | `ended_at` | First valid close wins | Preserved | Required for closed status |
| `actualElapsedMs` | `actual_elapsed_ms` | Calculated in close transaction | Preserved | Nonnegative; required closed |
| `reviewedAt` | `reviewed_at` | Last accepted review version | Preserved | Optional instant |
| No current field | `device_id` | Device that created/owns active timer control | Device tombstone does not delete session | Composite device ownership FK |
| Derived from `endedAt` (or provisional start while open) | `local_date`, `timezone` | Finalized in close transaction | Preserved | History/active-day index |

Session closure and its reward must be one transaction; `reward_ledger.source_id = activity_sessions.id`.

## Daily plans

Source: `DailyPlanRecord` in `daily-plan-state.ts` and `PlanningReviewItem` in `planning-review.ts`. The brain dump and raw model response are transient and intentionally have no database target.

| Field | Target | Model / conflict | Deletion | Idempotency / uniqueness |
| --- | --- | --- | --- | --- |
| `DailyPlanRecord.dateKey` | `daily_plans.local_date`; importing/current timezone to `timezone` | One mutable plan per local day; concurrent edits require item-level reconciliation | Plan tombstone | Unique `(user_id,local_date)` |
| `items[]` | Normalized `daily_plan_items` child rows | Item-level merge by UUID/version; order by position | Removed item tombstone | Max seven active positions 0–6 |
| `PlanningReviewItem.id` | `daily_plan_items.id` | New cloud UUID in Start fresh; local labels are not uploaded | Item tombstone | PK plus `(user_id,id)` |
| `group` | `item_group` | Version-checked | Preserved | One active `first-move` per plan; server command enforces max 3 priority/3 optional |
| `title` | `title` | Same-field conflict surfaced | Preserved | Length 1–160 |
| `firstStep` | `first_step` | Same-field conflict surfaced | Preserved | Length 1–160 |
| `category` | `direction` | Version-checked | Preserved | Direction enum |
| `durationMinutes` | `duration_minutes` | Version-checked | Preserved | One of 2/5/10/25 |
| Array order | `position` | Version-checked reorder; deterministic `(position,id)` read | Preserved | Unique active `(user_id,daily_plan_id,position)` |

## Morning records

Source: `MorningCheck` and `MorningAttempt` in `models.ts`; commands in `morning-check.ts`.

| Field | Target | Model / conflict | Deletion | Idempotency / uniqueness |
| --- | --- | --- | --- | --- |
| `MorningCheck.dateKey` | `morning_checks.local_date`; captured `timezone` | First successful server command wins | Immutable in production; account cascade only | Unique `(user_id,local_date)` |
| `verifiedAt` | `verified_at` | Trusted success instant | Immutable | One successful row per day |
| `captureMethod` | `capture_method` | Metadata only | Immutable | Camera/upload check |
| `verifierMode` | `verifier_mode` | Metadata only | Immutable | Mock/live check |
| Generated cloud ID | `morning_checks.id` | Append-only fact | Immutable | PK and `(user_id,id)` |
| `MorningAttempt.dateKey` | `morning_attempts.local_date`; timezone captured | Atomic server counter | Retained for quota/audit; account cascade | PK `(user_id,local_date)` |
| `count` | `attempt_count` | Atomic increment; server value wins | Not client-deletable | Check 0–3 |

The development-only local Morning reset is not a production cloud operation. `reward_ledger.source_id = morning_checks.id`. Toothbrush image bytes, previews, hashes, and object-storage paths have no table or column.

## Mini Journal

Source: `JournalEntry` in `models.ts`; save/delete in `reflections.ts`.

| Field | Target | Model / conflict | Deletion | Idempotency / uniqueness |
| --- | --- | --- | --- | --- |
| `dateKey` | `journal_entries.local_date`; captured `timezone` | One private row per date | Delete sets `deleted_at`; explicit restore required | Unique `(user_id,local_date)` |
| `whatHelped` | `what_helped` | Legacy/current optional field; never auto-merge text | Same journal tombstone | Max 1000 |
| `completed` | `completed` | Concurrent private text never auto-merges; retain local conflict copy | Same | Max 1000 |
| `difficult` | `difficult` | Same | Same | Max 1000 |
| `nextStep` | `next_step` | Same | Same | Max 1000 |
| `mood` | `mood` | Same-base conflict surfaced | Same | Integer 1–5 |
| `energy` | `energy` | Same | Same | Integer 1–5 |
| `freeText` | `free_text` | Never auto-merge | Same | Max 1000 |
| `updatedAt` | `updated_at` plus `version` | Server timestamp/version | Preserved | Version-checked |
| Generated stable cloud ID | `id` | Mutable row identity | Retained across delete/restore | PK; unique date prevents recreation reward |

Journal RLS is owner-only. The reflection reward uses `reward_ledger.source_id = journal_entries.id`; editing, deletion, or restoration cannot create a second reward.

## Rewards and point balance

Source: `RewardEvent` in `models.ts`; constants/calculation in `rewards.ts`; creation in `app-state.ts`, `sessions.ts`, `reflections.ts`, `morning-check.ts`, and `cat-store.ts`.

| Field | Target | Model / conflict | Deletion | Idempotency / uniqueness |
| --- | --- | --- | --- | --- |
| `id` | `reward_ledger.id` (new UUID); semantic local ID to `idempotency_key` only during future import | Append-only | No client update/delete; corrections compensate | UUID PK and unique `(user_id,idempotency_key)` |
| `source` | `source_type`; local `store` becomes `purchase` | Append-only | Immutable | Checked source types |
| `sourceId` | Completed source row UUID in `source_id`; purchase mutation UUID for purchases | Append-only | Immutable | Unique `(user_id,source_type,source_id)` for task/habit/session/morning/reflection |
| `dateKey` | `local_date`, with captured `timezone` | Occurrence metadata | Immutable | Indexed by user/date |
| `points` | `points_tenths` | Server-calculated integer tenths; task 50, habit 30, reflection 20, morning 50, session formula, purchase negative price | Immutable | Nonzero; zero-reward sessions create no ledger row |
| `createdAt` | `created_at` | Server transaction instant | Immutable | Event PK/idempotency |

Clients never write `UserProgress.points` or any total balance. `point_balances` is only the sum of append-only ledger deltas.

## Inventory, purchases, and milestones

Source: `InventoryItem`/`Inventory` in `models.ts`, catalog in `cat-items.ts`, purchases/consumption in `cat-store.ts`, and grants in `progress.ts`.

| Current field/operation | Target | Model / conflict | Deletion | Idempotency / uniqueness |
| --- | --- | --- | --- | --- |
| `Inventory.items[]` | Set of `inventory_balances` projections backed by `inventory_events` | Server event history and projection are authoritative | Events immutable; zero quantity remains representable as a balance row | One balance row per `(user_id,item_id)` |
| `InventoryItem.itemId` | `inventory_balances.item_id`, `inventory_events.item_id`, reference `inventory_items.id` | Catalog/server command authoritative | Events immutable; inactive catalog rows retained | Balance PK `(user_id,item_id)` |
| `quantity` | `inventory_balances.quantity` | Transactional projection of event sum; never accepted from client | Projection not client-deletable | Nonnegative; one balance row/item |
| Purchase command | One negative `reward_ledger` row plus positive `inventory_events(kind='purchase')`, then balance projection | Per-user transaction lock; server price/unlock/balance wins | Events immutable | Mutation UUID creates `purchase:<uuid>` idempotency key in both ledgers |
| `useFood` | Negative `inventory_events(kind='consume')`, then balance projection | Transaction rejects quantity below zero | Event immutable | Client mutation UUID; one consume event |
| Durable ownership | Positive purchase/grant event and balance 1 | Server rejects second durable purchase | Never confiscated | Purchase RPC and durable check |
| `selectedFurnitureId` | `user_settings.selected_furniture_id` | Server validates furniture kind and owned balance | Set NULL to deselect | One settings row/user |
| `unlockedMilestones` | Derived active-day thresholds | Derived | Never reduced for absence | Fixed thresholds |
| `grantedMilestones` | `milestone_grants` | Append-only first grant; inventory grants in same transaction | Immutable | Unique `(user_id,milestone_day)` |

The catalog includes all active current items and inactive legacy furniture (`cat-bed`, `window-cushion`). Legacy `soft-kitten-food` maps to `cat-food`; no separate cloud balance is created.

## Security and policy matrix

Every exposed user-owned table contains `user_id`, enables RLS, and has an owner-only SELECT policy explicitly scoped `TO authenticated`. Mutable tables have owner-only INSERT/UPDATE policies. Every user-owned table has an explicit authenticated hard-DELETE denial; soft deletion is an UPDATE. Server-only tables additionally have explicit denied client INSERT/UPDATE policies:

- `import_batches`
- `import_entity_mappings`
- `client_mutations`
- `morning_checks`
- `morning_attempts`
- `reward_ledger`
- `user_settings`
- `inventory_events`
- `inventory_balances`
- `milestone_grants`
- `ai_usage_events`

`inventory_items` is a non-user-owned reference catalog with authenticated read-only RLS. All server-only mutations require narrowly scoped RPCs or trusted server routes. Browser/mobile clients receive only the project URL and publishable key; they never receive service-role, database, JWT-signing, RevenueCat secret, or OpenAI keys.

PostgREST exposure is privilege allowlisted: `anon` has no access to the public schema; `authenticated` receives SELECT/INSERT/UPDATE only on owner-mutable tables, SELECT only on server-authoritative/import/catalog tables and security-invoker views, and EXECUTE only on explicitly approved functions. No client role receives table DELETE privileges.

## Remaining mapping gaps before sync code

The migration now covers every persisted schema-v8 field and the separate daily-plan store, but implementation contracts remain:

1. Define typed cloud DTOs and UUID generation; current local prefixed IDs cannot be sent as UUIDs.
2. Implement transactional commands for completion-plus-reward, session close-plus-reward, morning success-plus-reward, reflection first-save reward, consume food, select furniture, and client mutation receipts.
3. Implement daily-plan command validation for no more than one First Move, three priority, three optional, and seven total active items.
4. Define a monotonic pull cursor/change-log mechanism; `updated_at,id` is only the documented fallback.
5. Decide which authenticated user may update `profiles.timezone` and how travel changes are validated.
6. Add generated Supabase TypeScript types only after B1 migration application tooling is approved.
