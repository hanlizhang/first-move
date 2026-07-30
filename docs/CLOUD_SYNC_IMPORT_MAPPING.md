# First Move guest import mapping

Status: pre-implementation design. No SQL has been executed and no remote project has been linked.

Implementation note: Phase B2 now implements this design locally through `20260730120000_import_workspace.sql`. That migration has not been pushed to the remote project; the UI remains disabled unless `NEXT_PUBLIC_CLOUD_SETUP_ENABLED=true`.

## 1. First-sync choices

After email authentication, the application checks for any cloud workspace before offering a write:

- **Empty account:** offer **Import this device** and **Start fresh**.
- **Account with cloud data:** offer **Use cloud progress**. Do not upload this device’s guest data. Preserve a new local snapshot and defer advanced merge.
- **Existing incomplete import of the same snapshot:** offer **Resume import** using the existing batch and mappings.

Authentication alone does not activate cloud mode. Guest mode remains authoritative until initialization commits, canonical cloud data hydrates into a separate cache, and verification passes.

## 2. Snapshot contract

Before any import/start-fresh read, validation, UUID generation, network call, or mode change:

1. Copy every current `localStorage` key and exact string value into memory.
2. Canonically serialize the origin, capture time, readable schema version, import-format version, and key/value pairs sorted by key.
3. Persist that immutable envelope in a dedicated IndexedDB backup store, not in `localStorage`, so creating the backup cannot change the captured key set.
4. Compute SHA-256 over the envelope. Keep the raw snapshot only on the device; send only its digest and normalized import payload.
5. Read the snapshot back and verify its digest before continuing.

The known product keys are `first-move:app-state` and `first-move:daily-plans:v1`, but the backup captures all keys so unknown current or legacy settings are not silently lost. A snapshot is never deleted automatically on import success, logout, account deletion, cache rebuild, or use of cloud progress.

## 3. Durable identifiers

`import_batches.snapshot_sha256` identifies the exact guest snapshot. `import_entity_mappings` records:

`(user_id, import_batch_id, entity_type, local_id) -> (cloud_id, payload_sha256)`.

The importer creates UUID v4 values once, writes the mapping before dependent rows, and reuses it on every retry. The same local identity with a different payload digest fails as `mapping_payload_mismatch`; it never overwrites the cloud row. The unique cloud-ID constraint prevents two local records from sharing a UUID.

| Entity | Canonical `local_id` |
| --- | --- |
| Profile/settings | `profile`, `user-settings` |
| Task/habit/intent/session/reward | Existing local ID |
| Task completion | `<task-id>:<local-date>` |
| Habit weekday | `<habit-id>:<weekday>` |
| Habit completion | `<habit-id>:<local-date>` |
| Daily plan | `<local-date>` |
| Daily-plan item | `<local-date>:<item-id>:<position>` |
| Morning check/attempt/journal | `<local-date>` |
| Inventory opening event/balance | `<canonical-item-id>` |
| Milestone | `<21|50|100>` |

The date/position namespace repeated daily-plan labels such as `first-move`. Legacy `soft-kitten-food` becomes `cat-food` before hashing and mapping.

## 4. Schema-v8 normalization

The importer validates with the schema-v8 rules before UUID generation. Invalid raw data remains in the untouched snapshot and is listed in a local report rather than silently uploaded.

| Local source | Cloud target | Relationship handling |
| --- | --- | --- |
| `progress.firstUseDate` | `profiles.first_use_local_date` | Cached progress totals are verification inputs, not authority |
| `inventory.selectedFurnitureId` | `user_settings.selected_furniture_id` | Valid only when the imported balance owns it |
| `tasks[]` | `tasks` | `order` becomes stable rank; parent mapping first |
| `Task.completedOn[]` | `task_completions` | One child per task/date |
| `habits[]` and schedule | `habits`, `habit_schedule_weekdays` | Parent then weekday children |
| `Habit.completedOn[]` | `habit_completions` | One child per habit/date |
| `activityIntents[]` | `activity_intents` | Linked task/habit mappings must resolve |
| `sessions[]` | `activity_sessions` | Device/task/habit/intent mappings must resolve |
| Daily-plan localStorage | `daily_plans`, `daily_plan_items` | Parent then mapped ordered items |
| `morningChecks[]` | `morning_checks` | Metadata only; no image, hash, or blob |
| `morningAttempts[]` | `morning_attempts` | Count preserved within 0–3 |
| `journalEntries[]` | `journal_entries` | All private fields, including `whatHelped`, preserved |
| `rewardEvents[]` | `reward_ledger` | Points convert exactly to integer tenths; source mappings resolve |
| `inventory.items[]` | opening `inventory_events` and `inventory_balances` | Auditable `correction` event reconstructs each positive current balance |
| `progress.grantedMilestones[]` | `milestone_grants` | Imported as already granted; milestone RPC is not invoked |

`activeDateKeys`, `unlockedMilestones`, `lastActiveDate`, `journeyDay`, `totalActiveDays`, `gentleStreak`, and cached `progress.points` are verification inputs only. Cloud values derive from canonical facts and ledgers.

Task/habit/session rewards resolve `source_id` to their mapped source row. Morning/reflection rewards resolve to the mapped check/journal row. Store debits retain the local reward ID as idempotency key and get a mapped UUID source. Because schema v8 does not retain a complete purchase/consume/milestone inventory history, import uses one `correction` opening event per positive current balance and never invents missing history or extra inventory.

## 5. Transaction and retry algorithm

1. Create and verify the local snapshot.
2. Normalize both known stores; calculate expected counts, `sum(reward.points * 10)`, canonical inventory balances, milestone set, and reference manifest.
3. Query account state. If cloud data exists outside the matching incomplete batch, stop and offer **Use cloud progress**.
4. Create or resume the `import_batches` row keyed by `(user_id, snapshot_sha256)`.
5. Generate mappings in dependency order and persist them idempotently.
6. In one trusted server transaction, lock the user/batch and insert: profile/device/settings; tasks/habits; schedule and completion children; intents; sessions; daily plans/items; morning metadata/journals; reward ledger; imported milestones; inventory opening events/projections.
7. Every insert uses the recorded UUID or semantic key. Existing rows must match their payload digest; mismatch aborts.
8. Verify table counts, all foreign references, reward-ledger sum, inventory event sums versus projections, milestone set, one-open-session invariant, and derived active days.
9. Mark the batch completed with imported counts, verified balances, and `verified_at` in the same transaction.
10. Hydrate canonical rows into a separate cloud cache, repeat integrity checks, and only then activate cloud mode.

Any failure rolls back that attempt, leaves guest mode active, and retains the snapshot. A response lost after commit is resolved by reading the completed batch and mappings, not replaying economic events.

## 6. Start fresh and existing cloud data

Start fresh uses the same pre-operation snapshot requirement. It creates an empty verified workspace and completed `start_fresh` batch without uploading or deleting guest records.

Cloud data exists when any workspace/import/core/ledger row exists for the user. If it exists and is not the resumable matching import, v1 does not merge or import. After explicit **Use cloud progress**, the device hydrates cloud data while retaining its snapshot.

## 7. Trust boundary

Clients may read their import audit and mapping rows but cannot write them directly. A future narrow authenticated server endpoint or security-definer RPC validates the normalized payload, derives ownership from `auth.uid()`, performs the transaction, and writes server-authoritative tables. Service-role, database, OpenAI, and RevenueCat secrets never enter clients.
