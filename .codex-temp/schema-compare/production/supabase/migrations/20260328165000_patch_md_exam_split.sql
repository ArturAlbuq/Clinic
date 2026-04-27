create or replace function public.sync_queue_item_room()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.room_slug := case new.exam_type
    when 'fotografia' then 'fotografia-escaneamento'
    when 'escaneamento_intra_oral' then 'fotografia-escaneamento'
    when 'periapical' then 'periapical'
    when 'interproximal' then 'periapical'
    when 'panoramica' then 'panoramico'
    when 'telerradiografia' then 'panoramico'
    when 'tomografia' then 'tomografia'
    else null
  end;

  if new.room_slug is null then
    raise exception 'sala nao encontrada para o exame %', new.exam_type;
  end if;

  return new;
end;
$$;

alter table public.exam_rooms
  drop column if exists exam_type;

insert into public.exam_rooms (slug, name, sort_order)
values
  ('fotografia-escaneamento', 'Fotos e escaneamento', 1),
  ('periapical', 'Radiografia intra-oral', 2),
  ('panoramico', 'Radiografia extra-oral', 3),
  ('tomografia', 'Tomografia', 4)
on conflict (slug) do update
set
  name = excluded.name,
  sort_order = excluded.sort_order;

update public.queue_items as q
set exam_type = case q.exam_type
  when 'fotografia_escaneamento' then 'fotografia'::public.exam_type
  when 'periapical' then 'periapical'::public.exam_type
  when 'panoramico' then 'panoramica'::public.exam_type
  when 'tomografia' then 'tomografia'::public.exam_type
  else q.exam_type
end
where q.exam_type in (
  'fotografia_escaneamento'::public.exam_type,
  'periapical'::public.exam_type,
  'panoramico'::public.exam_type,
  'tomografia'::public.exam_type
);

create or replace function public.sync_queue_item_room()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.room_slug := case new.exam_type
    when 'fotografia' then 'fotografia-escaneamento'
    when 'escaneamento_intra_oral' then 'fotografia-escaneamento'
    when 'periapical' then 'periapical'
    when 'interproximal' then 'periapical'
    when 'panoramica' then 'panoramico'
    when 'telerradiografia' then 'panoramico'
    when 'tomografia' then 'tomografia'
    else null
  end;

  if new.room_slug is null then
    raise exception 'sala nao encontrada para o exame %', new.exam_type;
  end if;

  return new;
end;
$$;
