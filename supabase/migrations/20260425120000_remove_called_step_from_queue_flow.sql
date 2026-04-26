create or replace function public.enforce_queue_status_flow()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = old.status then
    return new;
  end if;

  if new.status = 'cancelado' and old.status in ('aguardando', 'chamado', 'em_atendimento') then
    return new;
  end if;

  if old.status = 'aguardando' and new.status = 'chamado' then
    return new;
  end if;

  if old.status = 'aguardando' and new.status = 'em_atendimento' then
    return new;
  end if;

  if old.status = 'chamado' and new.status = 'em_atendimento' then
    return new;
  end if;

  if old.status = 'em_atendimento' and new.status = 'finalizado' then
    return new;
  end if;

  raise exception 'transicao de status invalida: % -> %', old.status, new.status;
end;
$$;

create or replace function public.stamp_queue_status()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = old.status then
    return new;
  end if;

  if new.status = 'chamado' and old.called_at is null then
    new.called_at = timezone('utc', now());
    if auth.uid() is not null and new.called_by is null then
      new.called_by = auth.uid();
    end if;
  end if;

  if old.status = 'aguardando' and new.status = 'em_atendimento' and old.called_at is null then
    new.called_at = timezone('utc', now());
    if auth.uid() is not null and new.called_by is null then
      new.called_by = auth.uid();
    end if;
  end if;

  if new.status = 'em_atendimento' and old.started_at is null then
    new.started_at = timezone('utc', now());
    if auth.uid() is not null and new.started_by is null then
      new.started_by = auth.uid();
    end if;
  end if;

  if new.status = 'finalizado' and old.finished_at is null then
    new.finished_at = timezone('utc', now());
    if auth.uid() is not null and new.finished_by is null then
      new.finished_by = auth.uid();
    end if;
  end if;

  if new.status = 'cancelado' and old.canceled_at is null then
    new.canceled_at = timezone('utc', now());
  end if;

  return new;
end;
$$;
