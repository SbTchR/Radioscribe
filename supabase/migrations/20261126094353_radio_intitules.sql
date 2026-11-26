begin;

alter table radio_private.cues
  add column base_title text,
  add column artist text check (artist is null or (kind = 'music' and length(artist) between 1 and 160));

create function radio_private.cue_label(p_kind text, p_index integer) returns text
language sql immutable set search_path = '' as $$
  select case p_kind
    when 'chronicle' then 'Chronique ' || (p_index + 1)
    when 'music' then 'Musique ' || p_index
    when 'transition' then 'Transition ' || (p_index + 1)
    when 'jingle' then 'Jingle ' || (p_index + 1)
    when 'opening' then 'Prise d’antenne' || case when p_index = 0 then '' else ' ' || (p_index + 1) end
    when 'closing' then 'Remise d’antenne' || case when p_index = 0 then '' else ' ' || (p_index + 1) end
  end
$$;

-- Keep identifiable defaults, then pair the remaining parts and labels in order.
with groups as (
  select show_id, kind, count(*)::integer as cue_count from radio_private.cues group by show_id, kind
), labels as (
  select g.show_id, g.kind, slot.idx, radio_private.cue_label(g.kind, slot.idx) as title
  from groups g cross join lateral generate_series(0, g.cue_count - 1) as slot(idx)
), reserved as (
  select distinct on (c.show_id, c.kind, c.title) c.id, c.show_id, c.kind, c.title
  from radio_private.cues c
  left join labels l on l.show_id = c.show_id and l.kind = c.kind and l.title = c.title
  where l.title is not null or (c.kind = 'jingle' and c.title in ('Jingle d’ouverture', 'Jingle intermédiaire', 'Jingle de fin'))
  order by c.show_id, c.kind, c.title, c.position, c.id
), unused_cues as (
  select c.id, c.show_id, c.kind,
    row_number() over (partition by c.show_id, c.kind order by c.position, c.id) as slot
  from radio_private.cues c where not exists (select 1 from reserved r where r.id = c.id)
), unused_labels as (
  select l.show_id, l.kind, l.title,
    row_number() over (partition by l.show_id, l.kind order by l.idx) as slot
  from labels l where not exists (
    select 1 from reserved r where r.show_id = l.show_id and r.kind = l.kind and r.title = l.title
  )
), assignments as (
  select id, title from reserved
  union all
  select c.id, l.title from unused_cues c join unused_labels l using (show_id, kind, slot)
)
update radio_private.cues c set base_title = a.title from assignments a where a.id = c.id;

alter table radio_private.cues alter column base_title set not null;
alter table radio_private.cues add constraint cues_unique_base_title unique (show_id, base_title);

create function radio_private.next_cue_label(p_show uuid, p_kind text, p_title text) returns text
language plpgsql stable set search_path = '' as $$
declare next_title text;
begin
  if p_kind = 'jingle' and p_title in ('Jingle d’ouverture', 'Jingle intermédiaire', 'Jingle de fin')
     and not exists (select 1 from radio_private.cues where show_id = p_show and base_title = p_title) then
    return p_title;
  end if;
  select chosen.label into next_title
  from generate_series(0, (select count(*)::integer from radio_private.cues where show_id = p_show and kind = p_kind)) as slot(idx)
  cross join lateral (select radio_private.cue_label(p_kind, slot.idx) as label) chosen
  where not exists (select 1 from radio_private.cues where show_id = p_show and base_title = chosen.label)
  order by slot.idx limit 1;
  return next_title;
end $$;

create or replace function radio_private.new_cue(p_show uuid, p_kind text, p_title text, p_position integer) returns uuid
language plpgsql set search_path = '' as $$
declare
  result uuid;
  doc_id uuid;
  base text := radio_private.next_cue_label(p_show, p_kind, p_title);
  topic text := coalesce(nullif(trim(p_title), ''), base);
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
        'title', topic, 'people', speakers, 'sections', jsonb_build_array('intro'), 'speed', 170)),
      'intro', jsonb_build_object('rev', gen_random_uuid(), 'data', jsonb_build_object(
        'kind', section_type, 'title', case when p_kind = 'chronicle' then 'Introduction' else topic end,
        'angles', jsonb_build_array(), 'blocks', jsonb_build_array(), 'done', false))
    ))).id;
  end if;
  insert into radio_private.cues (show_id, position, kind, title, room, base_title)
  values (p_show, p_position, p_kind, topic, doc_id, base) returning id into result;
  return result;
end $$;

create function radio_private.add_cue_details(p_show uuid, p_kind text, p_title text, p_after uuid, p_artist text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare cue_id uuid;
begin
  cue_id := public.radio_program_add(p_show, p_kind, p_title, p_after);
  update radio_private.cues set artist = nullif(trim(p_artist), '') where id = cue_id and kind = 'music';
  return cue_id;
end $$;

create function radio_private.update_cue_details(
  p_show uuid, p_cue uuid, p_title text, p_seconds integer, p_names text[], p_artist text
) returns void
language plpgsql security definer set search_path = '' as $$
declare default_title text;
begin
  perform radio_private.lock_program(p_show);
  select base_title into strict default_title from radio_private.cues where show_id = p_show and id = p_cue and not archived;
  perform public.radio_program_update(p_show, p_cue, coalesce(nullif(trim(p_title), ''), default_title), p_seconds, p_names);
  update radio_private.cues set artist = nullif(trim(p_artist), '') where id = p_cue and kind = 'music';
end $$;

create function radio_private.read_program(p_show uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', s.id, 'title', s.title, 'manager', authority.manager,
    'managerKey', case when authority.manager then s.manager_key end,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id, 'kind', c.kind, 'baseTitle', c.base_title, 'artist', c.artist,
        'title', coalesce(m.data->>'title', c.title), 'room', c.room, 'archived', c.archived,
        'assigned', c.assigned or team.named, 'names', team.names,
        'code', case when authority.manager or radio_private.member(c.room) then r.code end,
        'editable', not c.archived and radio_private.member(c.room),
        'seconds', coalesce((progress.data->>'seconds')::int, c.seconds),
        'status', progress.data->>'status',
        'unreadMessages', case when authority.manager and c.room is not null and not c.archived then (
          select count(*) from radio_private.records message where message.room = c.room
            and message.pupil_message_version > r.feedback_read_version
        ) end
      ) order by c.position, c.id)
      from radio_private.cues c
      left join radio_private.rooms r on r.id = c.room
      left join radio_private.records m on m.room = c.room and m.key = 'meta'
      cross join lateral (
        select coalesce(jsonb_agg(p.value->>'name' order by p.slot), '[]'::jsonb) names,
          coalesce(bool_or((p.value->>'name') is distinct from
            ((case when c.kind = 'chronicle' then 'Chronique ' else 'Animateur ' end) || p.slot)), false) named
        from jsonb_array_elements(case when jsonb_typeof(m.data->'people') = 'array'
                                     then m.data->'people' else '[]'::jsonb end) with ordinality as p(value, slot)
      ) team
      left join lateral (select radio_private.cue_progress(c.room, m.data, c.kind) data where c.room is not null) progress on true
      where c.show_id = s.id and (not c.archived or authority.manager)
    ), '[]'::jsonb))
  from radio_private.shows s
  cross join lateral (select radio_private.manage(p_show) manager) authority
  where (select auth.uid()) is not null and s.id = p_show and radio_private.view_show(p_show)
$$;

create or replace function public.radio_program_read(p_show uuid) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select radio_private.read_program(p_show)
$$;

create function public.radio_program_add_details(p_show uuid, p_kind text, p_title text, p_after uuid, p_artist text) returns uuid
language sql security invoker set search_path = '' as $$
  select radio_private.add_cue_details(p_show, p_kind, p_title, p_after, p_artist)
$$;

create function public.radio_program_update_details(
  p_show uuid, p_cue uuid, p_title text, p_seconds integer, p_names text[], p_artist text
) returns void language sql security invoker set search_path = '' as $$
  select radio_private.update_cue_details(p_show, p_cue, p_title, p_seconds, p_names, p_artist)
$$;

revoke all on function radio_private.cue_label(text,integer), radio_private.next_cue_label(uuid,text,text),
  radio_private.read_program(uuid), radio_private.add_cue_details(uuid,text,text,uuid,text),
  radio_private.update_cue_details(uuid,uuid,text,integer,text[],text) from public, anon, authenticated;
grant execute on function radio_private.read_program(uuid), radio_private.add_cue_details(uuid,text,text,uuid,text),
  radio_private.update_cue_details(uuid,uuid,text,integer,text[],text) to authenticated;
revoke all on function public.radio_program_add_details(uuid,text,text,uuid,text),
  public.radio_program_update_details(uuid,uuid,text,integer,text[],text) from public, anon;
grant execute on function public.radio_program_add_details(uuid,text,text,uuid,text),
  public.radio_program_update_details(uuid,uuid,text,integer,text[],text) to authenticated;

commit;
