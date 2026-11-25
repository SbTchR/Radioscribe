begin;

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
      if cue_kind <> 'chronicle' and next_data->'title' is distinct from current_data->'title' then
        raise exception 'Le nom de l’animation se modifie dans le conducteur';
      end if;
      if next_data->'people' is distinct from current_data->'people' then
        -- The conductor owns roster size and order. Writers can rename existing voices.
        if jsonb_typeof(next_data->'people') is distinct from 'array' then
          raise exception 'Équipe invalide';
        end if;
        if jsonb_array_length(next_data->'people') <> jsonb_array_length(current_data->'people') or exists (
          select 1
          from jsonb_array_elements(next_data->'people') with ordinality as person(value, slot)
          where person.value->'id' is distinct from current_data->'people'->((person.slot - 1)::int)->'id'
            or jsonb_typeof(person.value->'name') is distinct from 'string'
            or length(person.value->>'name') not between 1 and 40
            or trim(person.value->>'name') is distinct from person.value->>'name'
        ) then
          raise exception 'Modifie seulement les prénoms des voix de l’équipe';
        end if;
        if (select count(distinct lower(person->>'name')) from jsonb_array_elements(next_data->'people') person)
            <> jsonb_array_length(next_data->'people') then
          raise exception 'Indique un prénom distinct pour chaque voix';
        end if;
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

create or replace function public.radio_program_read(p_show uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', s.id, 'title', s.title, 'manager', authority.manager,
    'managerKey', case when authority.manager then s.manager_key end,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id, 'kind', c.kind, 'title', coalesce(m.data->>'title', c.title), 'room', c.room, 'archived', c.archived,
        'assigned', c.assigned or team.named, 'names', team.names,
        'code', case when authority.manager or radio_private.member(c.room) then r.code end,
        'editable', not c.archived and radio_private.member(c.room),
        'seconds', coalesce((progress.data->>'seconds')::int, c.seconds),
        'status', progress.data->>'status'
      ) order by c.position, c.id)
      from radio_private.cues c
      left join radio_private.rooms r on r.id = c.room
      left join radio_private.records m on m.room = c.room and m.key = 'meta'
      cross join lateral (
        select coalesce(jsonb_agg(p.value->>'name' order by p.slot), '[]'::jsonb) names,
          coalesce(bool_or((p.value->>'name') is distinct from
            ((case when c.kind = 'chronicle' then 'Chroniqueur ' else 'Animateur ' end) || p.slot)), false) named
        from jsonb_array_elements(case when jsonb_typeof(m.data->'people') = 'array'
                                     then m.data->'people' else '[]'::jsonb end) with ordinality as p(value, slot)
      ) team
      left join lateral (select radio_private.cue_progress(c.room, m.data, c.kind) data where c.room is not null) progress on true
      where c.show_id = s.id and (not c.archived or authority.manager)
    ), '[]'::jsonb))
  from radio_private.shows s
  cross join lateral (select radio_private.manage(p_show) manager) authority
  where s.id = p_show and radio_private.view_show(p_show)
$$;

commit;
