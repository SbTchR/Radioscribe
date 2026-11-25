begin;
create schema radio_private;
revoke all on schema radio_private from public, anon, authenticated;
create table radio_private.rooms(id uuid primary key default gen_random_uuid(), code text unique not null);
create table radio_private.members(room uuid references radio_private.rooms on delete cascade, person uuid not null, primary key(room,person));
create table radio_private.records(room uuid references radio_private.rooms on delete cascade, key text not null, rev uuid not null, data jsonb not null, primary key(room,key));
create table radio_private.receipts(room uuid references radio_private.rooms on delete cascade, op uuid not null, primary key(room,op));
create table radio_private.attempts(person uuid primary key, since timestamptz not null, n integer not null);
-- Only this notification table is published. Its payload contains no script or invitation code.
create table public.radio_changes(room uuid primary key references radio_private.rooms on delete cascade, version bigint not null default 0);
alter table public.radio_changes enable row level security;
revoke all on public.radio_changes from public,anon,authenticated;
grant select on public.radio_changes to authenticated;
create function radio_private.member(p_room uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from radio_private.members where room=p_room and person=(select auth.uid()))
$$;
grant usage on schema radio_private to authenticated;
revoke all on all tables in schema radio_private from public,anon,authenticated;
create policy members_read on public.radio_changes for select to authenticated using(radio_private.member(room));
alter publication supabase_realtime add table public.radio_changes;

create function public.radio_create(p_rows jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare r radio_private.rooms; k text; v jsonb;
begin
 if auth.uid() is null then raise exception 'Session requise'; end if;
 if not (p_rows ?& array['meta','intro']) or jsonb_array_length(p_rows->'meta'->'data'->'people') not between 2 and 4 or length(p_rows::text)>10000 then raise exception 'Projet invalide'; end if;
 insert into radio_private.rooms(code) values(upper(substr(replace(gen_random_uuid()::text,'-',''),1,12))) returning * into r;
 insert into radio_private.members values(r.id,auth.uid());
 for k,v in select * from jsonb_each(p_rows) loop
 insert into radio_private.records values(r.id,k,(v->>'rev')::uuid,v->'data');
 end loop;
 insert into public.radio_changes(room) values(r.id);
 return jsonb_build_object('id',r.id,'code',r.code);
end $$;

create function public.radio_join(p_code text) returns uuid language plpgsql security definer set search_path='' as $$
declare found_room uuid; attempts integer;
begin
 if auth.uid() is null then raise exception 'Session requise'; end if;
 insert into radio_private.attempts as a values(auth.uid(),now(),1)
 on conflict(person) do update set n=case when a.since<now()-interval '10 minutes' then 1 else a.n+1 end,
 since=case when a.since<now()-interval '10 minutes' then now() else a.since end returning n into attempts;
 if attempts>24 then return null; end if;
 select id into found_room from radio_private.rooms where code=upper(regexp_replace(p_code,'[[:space:]-]','','g'));
 if found_room is not null then insert into radio_private.members values(found_room,auth.uid()) on conflict do nothing; end if;
 return found_room;
end $$;

create function public.radio_read(p_room uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('rows',(select jsonb_object_agg(key,jsonb_build_object('rev',rev,'data',data)) from radio_private.records where room=p_room),'version',c.version)
 from public.radio_changes c where c.room=p_room and radio_private.member(p_room)
$$;

create function public.radio_apply(p_room uuid,p_id uuid,p_changes jsonb) returns text language plpgsql security definer set search_path='' as $$
declare c jsonb; current_rev uuid;
begin
 if not radio_private.member(p_room) then raise exception 'Accès au projet refusé'; end if;
 perform 1 from public.radio_changes where room=p_room for update;
 if exists(select 1 from radio_private.receipts where room=p_room and op=p_id) then return 'ok'; end if;
 if jsonb_typeof(p_changes)<>'array' or jsonb_array_length(p_changes)=0 or length(p_changes::text)>4000000 then raise exception 'Modification invalide'; end if;
 for c in select value from jsonb_array_elements(p_changes) loop
 select rev into current_rev from radio_private.records where room=p_room and key=c->>'key';
 if current_rev is distinct from (c->>'before')::uuid then return 'conflict'; end if;
 end loop;
 for c in select value from jsonb_array_elements(p_changes) loop
 if c->'after'='null'::jsonb then delete from radio_private.records where room=p_room and key=c->>'key';
 else insert into radio_private.records values(p_room,c->>'key',(c->'after'->>'rev')::uuid,c->'after'->'data')
 on conflict(room,key) do update set data=excluded.data,rev=excluded.rev;
 end if;
 end loop;
 insert into radio_private.receipts values(p_room,p_id);
 update public.radio_changes set version=version+1 where room=p_room;
 return 'ok';
end $$;
revoke all on function radio_private.member(uuid), public.radio_create(jsonb), public.radio_join(text), public.radio_read(uuid), public.radio_apply(uuid,uuid,jsonb) from public,anon;
grant execute on function radio_private.member(uuid), public.radio_create(jsonb), public.radio_join(text), public.radio_read(uuid), public.radio_apply(uuid,uuid,jsonb) to authenticated;
create policy radio_presence_read on realtime.messages for select to authenticated using (
 extension='presence' and exists(select 1 from public.radio_changes where 'radio:'||room::text=(select realtime.topic()))
);
create policy radio_presence_write on realtime.messages for insert to authenticated with check (
 extension='presence' and exists(select 1 from public.radio_changes where 'radio:'||room::text=(select realtime.topic()))
);
commit;
