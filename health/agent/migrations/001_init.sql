create table if not exists health_run (
  run_id         text primary key,
  commit_sha     text not null,
  commit_message text,
  created_at     timestamptz not null default now(),
  overall_score  int not null
);

create table if not exists health_characteristic (
  run_id          text references health_run(run_id) on delete cascade,
  characteristic  text not null,
  score           int not null,
  reasoning       text,
  recommendations jsonb,
  signals_used    jsonb,
  primary key (run_id, characteristic)
);

create table if not exists accepted_decision (
  id          text primary key,
  rule_id     text not null,
  path_glob   text not null,
  decision    text not null,
  rationale   text not null,
  decided_by  text not null,
  decided_at  timestamptz not null default now(),
  active      boolean not null default true
);
