alter table health_run add column if not exists state text not null default 'current';
alter table health_run add column if not exists superseded_at timestamptz;
alter table health_run add column if not exists superseded_by text;
alter table health_run add column if not exists service_overalls jsonb not null default '{}'::jsonb;
alter table health_run add column if not exists metrics jsonb;
alter table health_run add column if not exists scored_at timestamptz not null default now();
alter table health_run add column if not exists rule_set_version int not null default 1;

alter table health_characteristic add column if not exists scope text not null default 'platform';
alter table health_characteristic add column if not exists suppressed_by jsonb;

alter table health_characteristic drop constraint if exists health_characteristic_pkey;
create unique index if not exists health_characteristic_run_scope_char
  on health_characteristic (run_id, scope, characteristic);

alter table accepted_decision add column if not exists scope text not null default 'platform';

insert into accepted_decision (
  id, rule_id, path_glob, decision, rationale, decided_by, scope
) values (
  'decision-cross-service-send-instruction',
  'duplication-cross-service',
  '**/send-instruction.ts',
  'accept',
  'Each service renders its own email. The send-instruction type is duplicated by design.',
  'scoring-model',
  'platform'
) on conflict (id) do nothing;
