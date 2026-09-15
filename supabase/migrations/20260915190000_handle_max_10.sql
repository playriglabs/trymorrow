-- Handles are the whole gift link (trymorrow.money/maya), so they cap at 10 characters instead of 20.
-- Every existing handle was 6-8 characters when this was written, so no row is orphaned.
-- Safe to re-run: the old check is found by its definition rather than a guessed name, and
-- re-running simply finds nothing left to drop.
do $$
declare
  existing text;
begin
  for existing in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    where rel.relname = 'users'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) like '%a-z0-9\_%'
  loop
    execute format('alter table users drop constraint %I', existing);
  end loop;
end $$;

alter table users
  add constraint users_handle_check check (handle ~ '^[a-z0-9_]{3,10}$');

notify pgrst, 'reload schema';
