-- One current health_run per commit SHA. Concurrent writers fail the second insert.
create unique index if not exists health_run_one_current_per_sha
  on health_run (commit_sha)
  where state = 'current';
