-- supabase/migrations/20260412031000_seed_gerencia_user.sql

-- Cria usuario gerencia apenas se nao existir (ambiente local/staging)
-- e garante que o registro no auth fique compativel com o fluxo atual
-- do Supabase Auth para email/senha.
do $$
declare
  v_now timestamptz := timezone('utc', now());
  v_user_id uuid;
begin
  select id into v_user_id
  from auth.users
  where email = 'gerencia@clinic.local'
  limit 1;

  if v_user_id is null then
    insert into auth.users (
      id,
      instance_id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at,
      confirmation_token,
      recovery_token,
      email_change,
      email_change_token_new,
      email_change_token_current,
      phone_change,
      phone_change_token,
      reauthentication_token,
      is_sso_user,
      is_anonymous
    ) values (
      gen_random_uuid(),
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated',
      'gerencia@clinic.local',
      crypt('chris@clinic123', gen_salt('bf')),
      v_now,
      jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
      jsonb_build_object(
        'full_name',
        'Gerencia',
        'role',
        'gerencia',
        'email_verified',
        true
      ),
      v_now,
      v_now,
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      false,
      false
    )
    returning id into v_user_id;
  else
    update auth.users
    set
      instance_id = coalesce(instance_id, '00000000-0000-0000-0000-000000000000'),
      aud = coalesce(aud, 'authenticated'),
      role = coalesce(role, 'authenticated'),
      email_confirmed_at = coalesce(email_confirmed_at, v_now),
      raw_app_meta_data =
        coalesce(raw_app_meta_data, '{}'::jsonb)
        || jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
      raw_user_meta_data =
        coalesce(raw_user_meta_data, '{}'::jsonb)
        || jsonb_build_object(
          'full_name',
          'Gerencia',
          'role',
          'gerencia',
          'email_verified',
          true
        ),
      confirmation_token = coalesce(confirmation_token, ''),
      recovery_token = coalesce(recovery_token, ''),
      email_change = coalesce(email_change, ''),
      email_change_token_new = coalesce(email_change_token_new, ''),
      email_change_token_current = coalesce(email_change_token_current, ''),
      phone_change = coalesce(phone_change, ''),
      phone_change_token = coalesce(phone_change_token, ''),
      reauthentication_token = coalesce(reauthentication_token, ''),
      is_sso_user = false,
      is_anonymous = false,
      updated_at = v_now
    where id = v_user_id;
  end if;

  insert into auth.identities (
    provider_id,
    user_id,
    identity_data,
    provider,
    last_sign_in_at,
    created_at,
    updated_at
  )
  select
    v_user_id::text,
    v_user_id,
    jsonb_build_object(
      'sub',
      v_user_id::text,
      'email',
      'gerencia@clinic.local',
      'email_verified',
      true,
      'phone_verified',
      false
    ),
    'email',
    null,
    v_now,
    v_now
  where not exists (
    select 1
    from auth.identities
    where user_id = v_user_id
      and provider = 'email'
  );

  insert into public.profiles (id, full_name, role)
  values (v_user_id, 'Gerencia', 'gerencia')
  on conflict (id) do update
  set
    role = 'gerencia',
    full_name = 'Gerencia';
end;
$$;
