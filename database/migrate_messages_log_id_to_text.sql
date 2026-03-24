begin;

alter table if exists messages_log
  drop constraint if exists messages_log_pkey;

alter table if exists messages_log
  alter column id drop default;

alter table if exists messages_log
  alter column id type text using id::text;

alter table if exists messages_log
  add primary key (id);

commit;

NOTIFY pgrst, 'reload schema';
