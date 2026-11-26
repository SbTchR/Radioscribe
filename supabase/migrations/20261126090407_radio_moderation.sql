begin;

alter table radio_private.records add column pupil_author uuid;

create or replace function radio_private.post_message(
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
  insert into radio_private.records (room, key, rev, data, pupil_message_version, pupil_author)
  values (p_room, record_key, gen_random_uuid(), jsonb_build_object(
    'text', radio_private.message_text(p_text), 'block', p_block, 'parent', p_parent,
    'role', case when manager then 'teacher' else 'student' end,
    'sender', p_sender, 'recipient', p_recipient,
    'important', coalesce(p_important, false), 'createdAt', clock_timestamp()
  ), case when not manager then message_version end, case when not manager then auth.uid() end);
end $$;

create or replace function radio_private.change_comment(
  p_room uuid, p_entry text, p_rev uuid, p_text text, p_important boolean
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  manager boolean := radio_private.lock_discussion(p_room);
  current_entry radio_private.records;
  next_data jsonb;
begin
  select * into current_entry from radio_private.records
  where room = p_room and key = p_entry and key like 'feedback:%'
    and not coalesce((data->>'deleted')::boolean, false);
  if not found or current_entry.rev is distinct from p_rev then
    raise exception 'Ce message a changé. Rouvre la discussion pour voir la version à jour.';
  end if;

  if current_entry.data->>'role' = 'student' then
    if manager then
      if p_text is not null then raise exception 'Tu peux supprimer ce message d’élève.'; end if;
    elsif current_entry.pupil_author is distinct from auth.uid() then
      raise exception 'Tu peux modifier ou supprimer les messages que tu as envoyés.';
    end if;
  elsif not manager then
    raise exception 'Accès enseignant requis';
  end if;
  if not manager and coalesce(p_important, false) then raise exception 'Accès enseignant requis'; end if;

  if p_text is null then
    -- Retain the thread ID and drop its text and unread marker.
    next_data := (current_entry.data - 'text' - 'alertToken') || '{"deleted":true,"important":false}'::jsonb;
  else
    next_data := current_entry.data || jsonb_build_object(
      'text', radio_private.message_text(p_text), 'edited', true, 'important', coalesce(p_important, false)
    );
    if p_important and not coalesce((current_entry.data->>'important')::boolean, false) then
      next_data := next_data || jsonb_build_object('alertToken', gen_random_uuid());
    end if;
  end if;
  update radio_private.records set
    rev = gen_random_uuid(), data = next_data,
    pupil_message_version = case when p_text is not null then pupil_message_version end,
    pupil_author = case when p_text is not null then pupil_author end
  where room = p_room and key = p_entry;
  update public.radio_changes set version = version + 1 where room = p_room;
end $$;

create function radio_private.read_room(p_room uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'rows', (
      select jsonb_object_agg(key, jsonb_build_object('rev', rev, 'data', data) ||
        case when pupil_author = (select auth.uid()) then '{"owned":true}'::jsonb else '{}'::jsonb end)
      from radio_private.records where room = p_room and (permission.editable or key not like 'feedback:%')
    ),
    'version', changes.version,
    'code', case when permission.editable then r.code end,
    'context', jsonb_build_object('showId', c.show_id, 'kind', c.kind, 'editable', permission.editable,
                                   'manager', radio_private.manage(c.show_id))
  )
  from radio_private.rooms r
  join public.radio_changes changes on changes.room = r.id
  left join radio_private.cues c on c.room = r.id
  cross join lateral (select radio_private.member(p_room) as editable) permission
  where (select auth.uid()) is not null and r.id = p_room and not coalesce(c.archived, false)
    and (permission.editable or radio_private.view_show(c.show_id))
$$;
revoke all on function radio_private.read_room(uuid) from public, anon, authenticated;
grant execute on function radio_private.read_room(uuid) to authenticated;

create or replace function public.radio_read(p_room uuid) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select radio_private.read_room(p_room)
$$;

commit;
