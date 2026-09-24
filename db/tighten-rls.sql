-- Run AFTER PR #7 is merged and deployed (the old client relied on these).
-- Drops every policy granted to `public` on the albert_* tables, leaving only the
-- albert_app role policies (the API) — the anon key can then only open realtime channels.
do $$
declare p record;
begin
  for p in
    select schemaname, tablename, policyname
    from pg_policies
    where tablename like 'albert_%' and 'public' = any(roles::text[]::text[])
  loop
    execute format('drop policy %I on %I.%I', p.policyname, p.schemaname, p.tablename);
    raise notice 'dropped % on %', p.policyname, p.tablename;
  end loop;
end $$;
