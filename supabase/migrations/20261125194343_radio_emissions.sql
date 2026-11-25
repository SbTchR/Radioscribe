begin;

create table radio_private.shows (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(title) between 1 and 160),
  manager_key uuid not null default gen_random_uuid()
);
create table radio_private.show_managers (
  show_id uuid not null references radio_private.shows on delete cascade,
  person uuid not null,
  primary key (show_id, person)
);
create table radio_private.cues (
  id uuid primary key default gen_random_uuid(),
  show_id uuid not null references radio_private.shows on delete cascade,
  position integer not null,
  kind text not null check (kind in ('chronicle', 'opening', 'transition', 'closing', 'music', 'jingle')),
  title text not null check (length(title) between 1 and 160),
  room uuid unique references radio_private.rooms,
  seconds integer not null default 0 check (seconds between 0 and 36000),
  assigned boolean not null default false,
  archived boolean not null default false,
  check ((room is null) = (kind in ('music', 'jingle')))
);
create index cues_show_order on radio_private.cues (show_id, position);
alter table radio_private.shows enable row level security;
alter table radio_private.show_managers enable row level security;
alter table radio_private.cues enable row level security;
revoke all on radio_private.shows, radio_private.show_managers, radio_private.cues from public, anon, authenticated;

-- Current invitations use 32^5 possible codes. Previously issued links continue to work.
alter table radio_private.rooms add column legacy_code text unique;
create function radio_private.short_code() returns text
language sql volatile set search_path = '' as $$
  select string_agg(substr('23456789ABCDEFGHJKLMNPQRSTUVWXYZ', (get_byte(bytes, idx) & 31) + 1, 1), '' order by idx)
  from (select decode(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10), 'hex') bytes) seed
  cross join generate_series(0, 4) idx
$$;

do $$
declare old_room radio_private.rooms;
begin
  for old_room in select * from radio_private.rooms where length(code) > 5 loop
    loop
      begin
        update radio_private.rooms set legacy_code = old_room.code, code = radio_private.short_code()
        where id = old_room.id;
        exit;
      exception when unique_violation then
        -- A different room used this short code. Keep the earlier reservation.
      end;
    end loop;
  end loop;
  update public.radio_changes set version = version + 1;
end $$;
alter table radio_private.rooms add constraint radio_short_code check (code ~ '^[2-9A-HJ-NP-Z]{5}$');

create function radio_private.manage(p_show uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from radio_private.show_managers where show_id = p_show and person = (select auth.uid())
  )
$$;

-- The existing Realtime policy calls member(). Only writers receive room events.
create or replace function radio_private.member(p_room uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from radio_private.rooms r
    left join radio_private.cues c on c.room = r.id
    where r.id = p_room and not coalesce(c.archived, false) and (
      radio_private.manage(c.show_id) or exists (
        select 1 from radio_private.members m where m.room = r.id and m.person = (select auth.uid())
      )
    )
  )
$$;

create function radio_private.view_show(p_show uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select radio_private.manage(p_show) or exists (
    select 1 from radio_private.cues c
    join radio_private.members m on m.room = c.room
    where c.show_id = p_show and not c.archived and m.person = (select auth.uid())
  )
$$;

create function radio_private.new_room(p_rows jsonb) returns radio_private.rooms
language plpgsql set search_path = '' as $$
declare
  result radio_private.rooms;
  record_key text;
  value jsonb;
begin
  for attempt in 1..32 loop
    insert into radio_private.rooms(code) values (radio_private.short_code())
    on conflict(code) do nothing returning * into result;
    exit when result.id is not null;
  end loop;
  if result.id is null then raise exception 'Impossible d’attribuer un code. Réessaie.'; end if;
  for record_key, value in select * from jsonb_each(p_rows) loop
    insert into radio_private.records values (result.id, record_key, (value->>'rev')::uuid, value->'data');
  end loop;
  insert into public.radio_changes(room) values (result.id);
  return result;
end $$;

create or replace function public.radio_create(p_rows jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare result radio_private.rooms;
begin
  if auth.uid() is null then raise exception 'Session requise'; end if;
  if not (p_rows ?& array['meta','intro'])
     or jsonb_array_length(p_rows->'meta'->'data'->'people') not between 2 and 4
     or length(p_rows::text) > 10000
     or exists (select 1 from jsonb_object_keys(p_rows) k where k like 'feedback:%') then
    raise exception 'Projet invalide';
  end if;
  result := radio_private.new_room(p_rows);
  insert into radio_private.members values (result.id, auth.uid());
  return jsonb_build_object('id', result.id, 'code', result.code);
end $$;

create or replace function public.radio_join(p_code text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  found_room uuid;
  attempts integer;
  normalized text := upper(regexp_replace(left(p_code, 32), '[[:space:]-]', '', 'g'));
begin
  if auth.uid() is null then raise exception 'Session requise'; end if;
  insert into radio_private.attempts as a values (auth.uid(), now(), 1)
  on conflict(person) do update set
    n = case when a.since < now()-interval '10 minutes' then 1 else least(a.n + 1, 25) end,
    since = case when a.since < now()-interval '10 minutes' then now() else a.since end
  returning n into attempts;
  if attempts > 24 then return null; end if;
  select r.id into found_room from radio_private.rooms r
  left join radio_private.cues c on c.room = r.id
  where (r.code = normalized or r.legacy_code = normalized) and not coalesce(c.archived, false);
  if found_room is not null then
    insert into radio_private.members values (found_room, auth.uid()) on conflict do nothing;
  end if;
  return found_room;
end $$;

create or replace function public.radio_read(p_room uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'rows', (select jsonb_object_agg(key, jsonb_build_object('rev', rev, 'data', data))
             from radio_private.records where room = p_room
               and (permission.editable or key not like 'feedback:%')),
    'version', changes.version,
    'code', case when permission.editable then r.code end,
    'context', jsonb_build_object('showId', c.show_id, 'kind', c.kind, 'editable', permission.editable,
                                   'manager', radio_private.manage(c.show_id))
  )
  from radio_private.rooms r
  join public.radio_changes changes on changes.room = r.id
  left join radio_private.cues c on c.room = r.id
  cross join lateral (select radio_private.member(p_room) as editable) permission
  where r.id = p_room and not coalesce(c.archived, false)
    and (permission.editable or radio_private.view_show(c.show_id))
$$;

create or replace function public.radio_apply(p_room uuid, p_id uuid, p_changes jsonb) returns text
language plpgsql security definer set search_path = '' as $$
declare
  change jsonb;
  current_rev uuid;
  current_data jsonb;
  next_data jsonb;
  cue_kind text;
begin
  if not radio_private.member(p_room) then raise exception 'Accès au projet refusé'; end if;
  perform 1 from public.radio_changes where room = p_room for update;
  if not radio_private.member(p_room) then raise exception 'Accès au projet refusé'; end if;
  if exists(select 1 from radio_private.receipts where room = p_room and op = p_id) then return 'ok'; end if;
  if jsonb_typeof(p_changes) <> 'array' or jsonb_array_length(p_changes) = 0 or length(p_changes::text) > 4000000 then
    raise exception 'Modification invalide';
  end if;
  select kind into cue_kind from radio_private.cues where room = p_room;
  for change in select value from jsonb_array_elements(p_changes) loop
    if change->>'key' like 'feedback:%' then raise exception 'Retour enseignant protégé'; end if;
    select rev, data into current_rev, current_data from radio_private.records where room = p_room and key = change->>'key';
    if current_rev is distinct from (change->>'before')::uuid then return 'conflict'; end if;
    next_data := change->'after'->'data';
    if cue_kind is not null and change->>'key' = 'meta' then
      if next_data->'people' is distinct from current_data->'people'
         or (cue_kind <> 'chronicle' and next_data->'title' is distinct from current_data->'title') then
        raise exception 'L’équipe et le nom des animations se modifient dans le conducteur';
      end if;
      if jsonb_typeof(next_data->'sections') is distinct from 'array'
         or (cue_kind <> 'chronicle' and next_data->'sections' is distinct from '["intro"]'::jsonb)
         or coalesce(length(trim(next_data->>'title')), 0) not between 1 and 160
         or coalesce((next_data->>'speed')::integer, 0) not between 100 and 180 then
        raise exception 'Structure du script invalide';
      end if;
    end if;
    if cue_kind in ('opening','transition','closing') and change->>'key' = 'intro'
       and (next_data->>'kind' is distinct from cue_kind or next_data->'title' is distinct from current_data->'title') then
      raise exception 'Cette séquence est définie par le conducteur';
    end if;
  end loop;
  for change in select value from jsonb_array_elements(p_changes) loop
    if change->'after' = 'null'::jsonb then
      delete from radio_private.records where room = p_room and key = change->>'key';
    else
      insert into radio_private.records values (p_room, change->>'key', (change->'after'->>'rev')::uuid, change->'after'->'data')
      on conflict(room,key) do update set data = excluded.data, rev = excluded.rev;
    end if;
  end loop;
  insert into radio_private.receipts values (p_room, p_id);
  update public.radio_changes set version = version + 1 where room = p_room;
  return 'ok';
end $$;

create function radio_private.new_cue(p_show uuid, p_kind text, p_title text, p_position integer) returns uuid
language plpgsql set search_path = '' as $$
declare
  result uuid;
  doc_id uuid;
  role_name text := case when p_kind = 'chronicle' then 'Chroniqueur ' else 'Animateur ' end;
  section_type text := case when p_kind = 'chronicle' then 'intro' else p_kind end;
  speakers jsonb;
begin
  if p_kind in ('chronicle','opening','transition','closing') then
    speakers := jsonb_build_array(
      jsonb_build_object('id', gen_random_uuid(), 'name', role_name || '1'),
      jsonb_build_object('id', gen_random_uuid(), 'name', role_name || '2')
    );
    doc_id := (radio_private.new_room(jsonb_build_object(
      'meta', jsonb_build_object('rev', gen_random_uuid(), 'data', jsonb_build_object(
        'title', p_title, 'people', speakers, 'sections', jsonb_build_array('intro'), 'speed', 170)),
      'intro', jsonb_build_object('rev', gen_random_uuid(), 'data', jsonb_build_object(
        'kind', section_type, 'title', case when p_kind = 'chronicle' then 'Introduction' else p_title end,
        'angles', jsonb_build_array(), 'blocks', jsonb_build_array(), 'done', false))
    ))).id;
  end if;
  insert into radio_private.cues (show_id, position, kind, title, room)
  values (p_show, p_position, p_kind, p_title, doc_id) returning id into result;
  return result;
end $$;

create function public.radio_program_create(p_title text, p_count integer, p_animated boolean) returns uuid
language plpgsql security definer set search_path = '' as $$
declare program uuid; position integer := 0;
begin
  if auth.uid() is null then raise exception 'Session requise'; end if;
  if p_count is null or p_count not between 1 and 24 or p_animated is null then
    raise exception 'Prévois de 1 à 24 chroniques au départ';
  end if;
  insert into radio_private.shows(title) values (trim(p_title)) returning id into program;
  insert into radio_private.show_managers values (program, auth.uid());
  perform radio_private.new_cue(program, 'jingle', 'Jingle d’ouverture', position);
  if p_animated then
    position := position + 1;
    perform radio_private.new_cue(program, 'opening', 'Prise d’antenne', position);
  end if;
  position := position + 1;
  perform radio_private.new_cue(program, 'music', 'Musique 0', position);
  for i in 1..p_count loop
    if p_animated then
      position := position + 1;
      perform radio_private.new_cue(program, 'transition', 'Transition ' || i, position);
    end if;
    position := position + 1;
    perform radio_private.new_cue(program, 'chronicle', 'Chronique ' || i, position);
    position := position + 1;
    perform radio_private.new_cue(program, 'music', 'Musique ' || i, position);
    if p_count >= 3 and i = (p_count + 1) / 2 then
      position := position + 1;
      perform radio_private.new_cue(program, 'jingle', 'Jingle intermédiaire', position);
    end if;
  end loop;
  if p_animated then
    position := position + 1;
    perform radio_private.new_cue(program, 'closing', 'Remise d’antenne', position);
  end if;
  perform radio_private.new_cue(program, 'jingle', 'Jingle de fin', position + 1);
  return program;
end $$;

create function public.radio_program_claim(p_show uuid, p_key uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not exists (
    select 1 from radio_private.shows where id = p_show and manager_key = p_key
  ) then return false; end if;
  insert into radio_private.show_managers values (p_show, auth.uid()) on conflict do nothing;
  return true;
end $$;

create function radio_private.cue_progress(p_room uuid, p_meta jsonb, p_kind text) returns jsonb
language sql stable set search_path = '' as $$
  with sections as (
    select section.key, section.data from radio_private.records section
    join jsonb_array_elements_text(case when jsonb_typeof(p_meta->'sections') = 'array'
                                        then p_meta->'sections' else '[]'::jsonb end) sid
      on section.key = sid
    where section.room = p_room
  ), replies as (
    select r.data->>'text' text from sections s
    cross join lateral jsonb_array_elements_text(case when jsonb_typeof(s.data->'blocks') = 'array'
                                                       then s.data->'blocks' else '[]'::jsonb end) bid
    join radio_private.records r on r.room = p_room and r.key = bid
  )
  select jsonb_build_object(
    'seconds', coalesce(round(60.0 * sum(regexp_count(text, '[[:alnum:]]+([’''-][[:alnum:]]+)*')) /
              greatest(coalesce(case when p_meta->>'speed' ~ '^[0-9]{1,3}$' then (p_meta->>'speed')::int end, 170), 1)), 0),
    'status', case
      when not coalesce(bool_or(length(trim(text)) > 0), false) then 'empty'
      when (p_kind <> 'chronicle' or exists(select 1 from sections where key = 'end'))
        and (select bool_and(data->'done' = 'true'::jsonb) from sections) then 'ready'
      else 'draft' end)
  from replies
$$;

create function public.radio_program_read(p_show uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', s.id, 'title', s.title, 'manager', authority.manager,
    'managerKey', case when authority.manager then s.manager_key end,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id, 'kind', c.kind, 'title', coalesce(m.data->>'title', c.title), 'room', c.room, 'archived', c.archived,
        'assigned', c.assigned, 'names', coalesce((select jsonb_agg(p->>'name')
           from jsonb_array_elements(case when jsonb_typeof(m.data->'people') = 'array'
                                        then m.data->'people' else '[]'::jsonb end) p), '[]'::jsonb),
        'code', case when authority.manager or radio_private.member(c.room) then r.code end,
        'editable', not c.archived and radio_private.member(c.room),
        'seconds', coalesce((progress.data->>'seconds')::int, c.seconds),
        'status', progress.data->>'status'
      ) order by c.position, c.id)
      from radio_private.cues c
      left join radio_private.rooms r on r.id = c.room
      left join radio_private.records m on m.room = c.room and m.key = 'meta'
      left join lateral (select radio_private.cue_progress(c.room, m.data, c.kind) data where c.room is not null) progress on true
      where c.show_id = s.id and (not c.archived or authority.manager)
    ), '[]'::jsonb))
  from radio_private.shows s
  cross join lateral (select radio_private.manage(p_show) manager) authority
  where s.id = p_show and radio_private.view_show(p_show)
$$;

create function radio_private.lock_program(p_show uuid) returns void
language plpgsql set search_path = '' as $$
begin
  if not radio_private.manage(p_show) then raise exception 'Accès enseignant requis'; end if;
  perform 1 from radio_private.shows where id = p_show for update;
end $$;

create function public.radio_program_rename(p_show uuid, p_title text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform radio_private.lock_program(p_show);
  update radio_private.shows set title = trim(p_title) where id = p_show;
end $$;

create function public.radio_program_add(p_show uuid, p_kind text, p_title text, p_after uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare slot integer;
begin
  perform radio_private.lock_program(p_show);
  if (select count(*) from radio_private.cues where show_id = p_show and not archived) >= 120 then
    raise exception 'Le conducteur contient déjà 120 éléments';
  end if;
  if p_after is null then
    select coalesce(max(position), -1) + 1 into slot from radio_private.cues where show_id = p_show;
  else
    select position + 1 into slot from radio_private.cues where show_id = p_show and id = p_after and not archived;
    if slot is null then raise exception 'L’emplacement a changé. Rouvre le conducteur.'; end if;
    update radio_private.cues set position = position + 1 where show_id = p_show and position >= slot;
  end if;
  return radio_private.new_cue(p_show, p_kind, trim(p_title), slot);
end $$;

create function public.radio_program_update(p_show uuid, p_cue uuid, p_title text, p_seconds integer, p_names text[]) returns void
language plpgsql security definer set search_path = '' as $$
declare
  cue radio_private.cues;
  meta jsonb;
  people jsonb;
  new_people jsonb := '[]'::jsonb;
  name_count integer;
  keep_ids text[];
begin
  perform radio_private.lock_program(p_show);
  select * into strict cue from radio_private.cues where show_id = p_show and id = p_cue and not archived;
  update radio_private.cues set title = trim(p_title), seconds = case when cue.room is null then p_seconds else 0 end,
    assigned = assigned or (cue.room is not null and p_names is not null) where id = p_cue;
  if cue.room is null then return; end if;
  perform 1 from public.radio_changes where room = cue.room for update;
  select data into meta from radio_private.records where room = cue.room and key = 'meta';
  people := meta->'people';
  if p_names is not null then
    name_count := cardinality(p_names);
    if name_count not between (case when cue.kind = 'chronicle' then 2 else 1 end) and 4
       or exists(select 1 from unnest(p_names) n where n is null or length(trim(n)) not between 1 and 40)
       or (select count(distinct lower(trim(n))) from unnest(p_names) n) <> name_count then
      raise exception 'Indique des prénoms distincts et respecte la taille de l’équipe';
    end if;
    for i in 1..name_count loop
      new_people := new_people || jsonb_build_array(jsonb_build_object(
        'id', coalesce(people->(i - 1)->>'id', gen_random_uuid()::text),
        'name', trim(p_names[i])
      ));
    end loop;
    select array_agg(p->>'id') into keep_ids from jsonb_array_elements(new_people) p;
    if exists (
      select 1 from radio_private.records
      where room = cue.room and data ? 'speaker' and not (data->>'speaker' = any(keep_ids))
    ) then raise exception 'Réattribue les répliques de la personne avant de la retirer'; end if;
    people := new_people;
  end if;
  update radio_private.records set rev = gen_random_uuid(),
    data = data || jsonb_build_object('title', trim(p_title), 'people', people)
  where room = cue.room and key = 'meta';
  if cue.kind <> 'chronicle' then
    update radio_private.records set rev = gen_random_uuid(), data = data || jsonb_build_object('title', trim(p_title))
    where room = cue.room and key = 'intro';
  end if;
  update public.radio_changes set version = version + 1 where room = cue.room;
end $$;

create function public.radio_program_move(p_show uuid, p_cue uuid, p_step integer) returns void
language plpgsql security definer set search_path = '' as $$
declare current_cue radio_private.cues; neighbor radio_private.cues;
begin
  perform radio_private.lock_program(p_show);
  if p_step not in (-1, 1) then raise exception 'Déplacement invalide'; end if;
  select * into strict current_cue from radio_private.cues where show_id = p_show and id = p_cue and not archived;
  select * into neighbor from radio_private.cues where show_id = p_show and not archived
    and (position - current_cue.position) * p_step > 0
    order by (position - current_cue.position) * p_step limit 1;
  if neighbor.id is not null then
    update radio_private.cues set position = case when id = p_cue then neighbor.position else current_cue.position end
    where id in (p_cue, neighbor.id);
  end if;
end $$;

create function public.radio_program_archive(p_show uuid, p_cue uuid, p_archived boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare doc uuid;
begin
  perform radio_private.lock_program(p_show);
  select room into strict doc from radio_private.cues where show_id = p_show and id = p_cue;
  perform 1 from public.radio_changes where room = doc for update;
  update radio_private.cues set archived = p_archived where id = p_cue;
  update public.radio_changes set version = version + 1 where room = doc;
end $$;

create function public.radio_add_feedback(p_room uuid, p_block text, p_text text, p_important boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare program uuid;
begin
  select show_id into program from radio_private.cues where room = p_room and not archived;
  if not radio_private.manage(program) then raise exception 'Accès enseignant requis'; end if;
  perform 1 from public.radio_changes where room = p_room for update;
  if not radio_private.member(p_room) then raise exception 'Accès au projet refusé'; end if;
  if p_text is null or length(trim(p_text)) not between 1 and 2500 then
    raise exception 'Le message doit contenir de 1 à 2500 caractères';
  end if;
  if p_block is not null and not exists (
    select 1 from radio_private.records where room = p_room and key = p_block and data ? 'speaker'
  ) then raise exception 'Cette réplique a été retirée'; end if;
  insert into radio_private.records values (p_room, 'feedback:' || gen_random_uuid()::text, gen_random_uuid(),
    jsonb_build_object('text', trim(p_text), 'block', p_block, 'important', coalesce(p_important, false), 'createdAt', now()));
  update public.radio_changes set version = version + 1 where room = p_room;
end $$;

revoke execute on all functions in schema radio_private from public, anon, authenticated;
grant execute on function radio_private.member(uuid) to authenticated;
revoke all on function public.radio_program_create(text,integer,boolean), public.radio_program_claim(uuid,uuid),
  public.radio_program_read(uuid), public.radio_program_rename(uuid,text), public.radio_program_add(uuid,text,text,uuid),
  public.radio_program_update(uuid,uuid,text,integer,text[]), public.radio_program_move(uuid,uuid,integer),
  public.radio_program_archive(uuid,uuid,boolean), public.radio_add_feedback(uuid,text,text,boolean) from public, anon;
grant execute on function public.radio_program_create(text,integer,boolean), public.radio_program_claim(uuid,uuid),
  public.radio_program_read(uuid), public.radio_program_rename(uuid,text), public.radio_program_add(uuid,text,text,uuid),
  public.radio_program_update(uuid,uuid,text,integer,text[]), public.radio_program_move(uuid,uuid,integer),
  public.radio_program_archive(uuid,uuid,boolean), public.radio_add_feedback(uuid,text,text,boolean) to authenticated;

commit;
