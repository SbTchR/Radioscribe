begin;

create function radio_private.apply_changes(p_room uuid, p_id uuid, p_changes jsonb) returns text
language plpgsql security definer set search_path = '' as $$
declare
  change jsonb;
  current_rev uuid;
  current_data jsonb;
  next_data jsonb;
  meta_to_save jsonb;
  cue_kind text;
  can_adjust_speed boolean;
begin
  if not radio_private.member(p_room) then raise exception 'Accès au projet refusé'; end if;
  perform 1 from public.radio_changes where room = p_room for update;
  if not radio_private.member(p_room) then raise exception 'Accès au projet refusé'; end if;
  if exists(select 1 from radio_private.receipts where room = p_room and op = p_id) then return 'ok'; end if;
  if jsonb_typeof(p_changes) <> 'array' or jsonb_array_length(p_changes) = 0 or length(p_changes::text) > 4000000 then
    raise exception 'Modification invalide';
  end if;
  select kind, radio_private.manage(show_id) into cue_kind, can_adjust_speed
  from radio_private.cues where room = p_room;
  for change in select value from jsonb_array_elements(p_changes) loop
    if change->>'key' like 'feedback:%' then raise exception 'Retour enseignant protégé'; end if;
    select rev, data into current_rev, current_data from radio_private.records where room = p_room and key = change->>'key';
    if current_rev is distinct from (change->>'before')::uuid then return 'conflict'; end if;
    next_data := change->'after'->'data';
    if change->>'key' = 'meta' then
      if jsonb_typeof(next_data) is distinct from 'object' then
        raise exception 'Structure du script invalide';
      end if;
      -- Discard only the protected field from older clients that still send it.
      if not coalesce(can_adjust_speed, false) then
        next_data := jsonb_set(next_data, '{speed}', coalesce(current_data->'speed', '170'::jsonb));
      end if;
      meta_to_save := next_data;
    end if;
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
      insert into radio_private.records (room, key, rev, data)
      values (p_room, change->>'key', (change->'after'->>'rev')::uuid,
        case when change->>'key' = 'meta' then meta_to_save else change->'after'->'data' end)
      on conflict(room,key) do update set data = excluded.data, rev = excluded.rev;
    end if;
  end loop;
  insert into radio_private.receipts values (p_room, p_id);
  update public.radio_changes set version = version + 1 where room = p_room;
  return 'ok';
end $$;
revoke all on function radio_private.apply_changes(uuid,uuid,jsonb) from public, anon, authenticated;
grant execute on function radio_private.apply_changes(uuid,uuid,jsonb) to authenticated;

create or replace function public.radio_apply(p_room uuid, p_id uuid, p_changes jsonb) returns text
language sql security invoker set search_path = '' as $$
  select radio_private.apply_changes(p_room, p_id, p_changes)
$$;

commit;
