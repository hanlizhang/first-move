begin;
create extension if not exists pgtap with schema extensions;

select plan(20);

select has_table('public', 'import_batches', 'import batch audit exists');
select has_table('public', 'import_entity_mappings', 'durable import mapping exists');
select has_column('public', 'import_batches', 'snapshot_sha256', 'snapshot digest is recorded');
select has_column('public', 'import_batches', 'verified_at', 'verification completion is recorded');
select has_column('public', 'import_entity_mappings', 'payload_sha256', 'mapping payload digest is recorded');
select has_index('public', 'import_entity_mappings', 'import_entity_mappings_pkey', 'mapping local identity is unique');
select has_index('public', 'import_batches', 'import_batches_user_id_snapshot_sha256_key', 'snapshot import is idempotent');

select table_privs_are('public', 'tasks', 'authenticated', array['SELECT', 'INSERT', 'UPDATE'], 'tasks expose minimum mutable privileges');
select table_privs_are('public', 'journal_entries', 'authenticated', array['SELECT', 'INSERT', 'UPDATE'], 'journals expose minimum owner-mutable privileges');
select table_privs_are('public', 'import_batches', 'authenticated', array['SELECT'], 'import batches are client read-only');
select table_privs_are('public', 'import_entity_mappings', 'authenticated', array['SELECT'], 'import mappings are client read-only');
select table_privs_are('public', 'reward_ledger', 'authenticated', array['SELECT'], 'reward ledger is client read-only');
select table_privs_are('public', 'inventory_events', 'authenticated', array['SELECT'], 'inventory events are client read-only');
select table_privs_are('public', 'inventory_balances', 'authenticated', array['SELECT'], 'inventory balances are client read-only');
select table_privs_are('public', 'milestone_grants', 'authenticated', array['SELECT'], 'milestones are client read-only');
select table_privs_are('public', 'ai_usage_events', 'authenticated', array['SELECT'], 'AI usage is client read-only');
select table_privs_are('public', 'inventory_items', 'authenticated', array['SELECT'], 'catalog is client read-only');
select table_privs_are('public', 'tasks', 'anon', array[]::text[], 'anon has no task privileges');
select table_privs_are('public', 'journal_entries', 'anon', array[]::text[], 'anon has no journal privileges');
select table_privs_are('public', 'reward_ledger', 'anon', array[]::text[], 'anon has no economic privileges');

select * from finish();
rollback;
