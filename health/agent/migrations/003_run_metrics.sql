alter table health_run add column if not exists modules int;
alter table health_run add column if not exists dependencies int;
alter table health_run add column if not exists duplication_pct double precision;
alter table health_run add column if not exists orphan_count int;
alter table health_run add column if not exists cycle_count int;
