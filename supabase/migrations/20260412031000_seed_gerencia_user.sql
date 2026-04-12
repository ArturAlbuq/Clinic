-- supabase/migrations/20260412031000_seed_gerencia_user.sql

-- Cria usuário gerencia apenas se não existir (ambiente local/staging)
do $$
declare
  v_user_id uuid;
begin
  -- Verificar se já existe
  select id into v_user_id
  from auth.users
  where email = 'gerencia@clinic.local'
  limit 1;

  if v_user_id is null then
    -- Inserir no auth.users (local/staging apenas)
    insert into auth.users (
      id,
      instance_id,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_user_meta_data,
      created_at,
      updated_at,
      aud,
      role
    ) values (
      gen_random_uuid(),
      '00000000-0000-0000-0000-000000000000',
      'gerencia@clinic.local',
      crypt('chris@clinic123', gen_salt('bf')),
      now(),
      jsonb_build_object('full_name', 'Gerência'),
      now(),
      now(),
      'authenticated',
      'authenticated'
    )
    returning id into v_user_id;

    -- Inserir o perfil com role gerencia
    -- (o trigger handle_new_user cria com role 'recepcao', então fazemos upsert com a role correta)
    insert into public.profiles (id, full_name, role)
    values (v_user_id, 'Gerência', 'gerencia')
    on conflict (id) do update set role = 'gerencia', full_name = 'Gerência';
  else
    -- Garantir que o perfil existente tem role gerencia
    insert into public.profiles (id, full_name, role)
    values (v_user_id, 'Gerência', 'gerencia')
    on conflict (id) do update set role = 'gerencia', full_name = 'Gerência';
  end if;
end;
$$;
