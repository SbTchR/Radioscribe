begin;

alter table radio_private.rooms add column feedback_read_version bigint not null default 0;
alter table radio_private.records add column pupil_message_version bigint;
create index pupil_messages_by_room on radio_private.records (room, pupil_message_version)
  where pupil_message_version is not null;

-- Apply the same lock as script edits and archiving before inspecting the group.
create function radio_private.lock_discussion(p_room uuid) returns boolean
language plpgsql set search_path = '' as $$
declare program uuid;
begin
  if not radio_private.member(p_room) then raise exception 'Accès au groupe refusé'; end if;
  perform 1 from public.radio_changes where room = p_room for update;
  select show_id into program from radio_private.cues where room = p_room and not archived;
  if program is null or not radio_private.member(p_room) then
    raise exception 'Accès au groupe refusé';
  end if;
  return radio_private.manage(program);
end $$;

create function radio_private.message_text(p_text text) returns text
language plpgsql immutable set search_path = '' as $$
declare body text := regexp_replace(p_text, '^[[:space:]]+|[[:space:]]+$', '', 'g');
begin
  if body is null or length(body) not between 1 and 2500 then
    raise exception 'Le message doit contenir de 1 à 2500 caractères';
  end if;
  return body;
end $$;

create function radio_private.post_message(
  p_room uuid, p_id uuid, p_text text, p_block text, p_parent text,
  p_sender text, p_recipient text, p_important boolean
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  manager boolean := radio_private.lock_discussion(p_room);
  record_key text := 'feedback:' || p_id::text;
  thread jsonb;
  people jsonb;
  message_version bigint;
begin
  if p_id is null then raise exception 'Identifiant du message manquant'; end if;
  if exists (select 1 from radio_private.records where room = p_room and key = record_key) then
    return;
  end if;

  if not manager then
    if p_block is not null or coalesce(p_important, false) then
      raise exception 'Accès enseignant requis';
    end if;
    select data->'people' into people from radio_private.records where room = p_room and key = 'meta';
    if not exists (select 1 from jsonb_array_elements(people) p where p->>'id' = p_sender) then
      raise exception 'Choisis ton prénom dans l’équipe';
    end if;
    if p_recipient is not null and (
      p_recipient = p_sender or not exists (
        select 1 from jsonb_array_elements(people) p where p->>'id' = p_recipient
      )
    ) then raise exception 'Choisis un autre membre de ton groupe'; end if;
  elsif p_sender is not null or p_recipient is not null then
    raise exception 'Destinataire invalide';
  end if;

  if p_parent is not null then
    select data into thread from radio_private.records
    where room = p_room and key = p_parent and key like 'feedback:%' and data->>'parent' is null;
    if thread is null or p_recipient is not null or p_block is not null then
      raise exception 'Cette discussion est indisponible';
    end if;
    p_block := thread->>'block';
  elsif p_block is not null and not exists (
    select 1 from radio_private.records where room = p_room and key = p_block and data ? 'speaker'
  ) then
    raise exception 'Cette réplique a été retirée';
  end if;

  update public.radio_changes set version = version + 1 where room = p_room
  returning version into message_version;
  insert into radio_private.records (room, key, rev, data, pupil_message_version)
  values (p_room, record_key, gen_random_uuid(), jsonb_build_object(
    'text', radio_private.message_text(p_text), 'block', p_block, 'parent', p_parent,
    'role', case when manager then 'teacher' else 'student' end,
    'sender', p_sender, 'recipient', p_recipient,
    'important', coalesce(p_important, false), 'createdAt', clock_timestamp()
  ), case when not manager then message_version end);
end $$;

create function radio_private.change_comment(
  p_room uuid, p_entry text, p_rev uuid, p_text text, p_important boolean
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  current_entry radio_private.records;
  next_data jsonb;
begin
  if not radio_private.lock_discussion(p_room) then raise exception 'Accès enseignant requis'; end if;
  select * into current_entry from radio_private.records
  where room = p_room and key = p_entry and key like 'feedback:%'
    and coalesce(data->>'role', 'teacher') = 'teacher' and not coalesce((data->>'deleted')::boolean, false);
  if not found or current_entry.rev is distinct from p_rev then
    raise exception 'Ce commentaire a changé. Rouvre la discussion pour voir la version à jour.';
  end if;

  if p_text is null then
    -- Keep the thread address when a reply references this comment.
    next_data := (current_entry.data - 'text' - 'alertToken') || '{"deleted":true,"important":false}'::jsonb;
  else
    next_data := current_entry.data || jsonb_build_object(
      'text', radio_private.message_text(p_text), 'edited', true, 'important', coalesce(p_important, false)
    );
    if p_important and not coalesce((current_entry.data->>'important')::boolean, false) then
      next_data := next_data || jsonb_build_object('alertToken', gen_random_uuid());
    end if;
  end if;
  update radio_private.records set rev = gen_random_uuid(), data = next_data
  where room = p_room and key = p_entry;
  update public.radio_changes set version = version + 1 where room = p_room;
end $$;

create function radio_private.mark_feedback_read(p_room uuid, p_version bigint) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not radio_private.lock_discussion(p_room) then raise exception 'Accès enseignant requis'; end if;
  update radio_private.rooms r set feedback_read_version = least(c.version, p_version)
  from public.radio_changes c where c.room = r.id and r.id = p_room
    and least(c.version, p_version) > r.feedback_read_version and p_version is not null;
end $$;

revoke all on function radio_private.lock_discussion(uuid), radio_private.message_text(text),
  radio_private.post_message(uuid,uuid,text,text,text,text,text,boolean),
  radio_private.change_comment(uuid,text,uuid,text,boolean),
  radio_private.mark_feedback_read(uuid,bigint) from public, anon, authenticated;
grant execute on function radio_private.post_message(uuid,uuid,text,text,text,text,text,boolean),
  radio_private.change_comment(uuid,text,uuid,text,boolean),
  radio_private.mark_feedback_read(uuid,bigint) to authenticated;

create function public.radio_post_message(
  p_room uuid, p_id uuid, p_text text, p_block text, p_parent text,
  p_sender text, p_recipient text, p_important boolean
) returns void language sql security invoker set search_path = '' as $$
  select radio_private.post_message(p_room, p_id, p_text, p_block, p_parent, p_sender, p_recipient, p_important)
$$;

create function public.radio_change_comment(
  p_room uuid, p_entry text, p_rev uuid, p_text text, p_important boolean
) returns void language sql security invoker set search_path = '' as $$
  select radio_private.change_comment(p_room, p_entry, p_rev, p_text, p_important)
$$;

create function public.radio_mark_feedback_read(p_room uuid, p_version bigint)
returns void language sql security invoker set search_path = '' as $$
  select radio_private.mark_feedback_read(p_room, p_version)
$$;

revoke all on function public.radio_post_message(uuid,uuid,text,text,text,text,text,boolean),
  public.radio_change_comment(uuid,text,uuid,text,boolean),
  public.radio_mark_feedback_read(uuid,bigint) from public, anon;
grant execute on function public.radio_post_message(uuid,uuid,text,text,text,text,text,boolean),
  public.radio_change_comment(uuid,text,uuid,text,boolean),
  public.radio_mark_feedback_read(uuid,bigint) to authenticated;

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
