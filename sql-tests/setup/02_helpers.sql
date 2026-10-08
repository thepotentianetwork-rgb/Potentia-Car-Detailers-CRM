-- Test helpers live in their own schema (not pg_temp) so every test file,
-- which runs in its own psql session, can use them.
drop schema if exists sqltest cascade;
create schema sqltest;
grant usage on schema sqltest to anon, authenticated;

-- Act as an anonymous visitor (no JWT) / as a signed-in user.
create function sqltest.as_anon() returns void language sql as
  $$ select set_config('request.jwt.claim.sub', '', false); set role anon; $$;
create function sqltest.as_user(u uuid) returns void language sql as
  $$ select set_config('request.jwt.claim.sub', u::text, false); set role authenticated; $$;

-- Run q and require it to fail with a message matching pat (ILIKE).
create function sqltest.expect_error(q text, pat text) returns void language plpgsql as $$
begin
  begin
    execute q;
  exception when others then
    if sqlerrm ilike pat then return; end if;
    raise exception 'expected error like "%" but got "%" for: %', pat, sqlerrm, q;
  end;
  raise exception 'expected error like "%" but statement succeeded: %', pat, q;
end $$;

-- Quoted date literal n days from today in Denver (the default business tz).
create function sqltest.d(n int) returns text language sql as
  $$ select quote_literal(((now() at time zone 'America/Denver')::date + n)::text) $$;

grant execute on all functions in schema sqltest to anon, authenticated;
