import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

function loadEnvFile(fileName) {
  const filePath = path.resolve(process.cwd(), fileName);

  if (!fs.existsSync(filePath)) {
    return;
  }

  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function requiredSeedPassword(envKey) {
  const password = process.env[envKey]?.trim();

  if (!password) {
    throw new Error(`Defina ${envKey} no .env.local antes de rodar o seed.`);
  }

  return password;
}

loadEnvFile(".env.local");
loadEnvFile(".env");

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error(
    "Defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY antes de rodar o seed.",
  );
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

const rooms = [
  {
    exam_type: "fotografia_escaneamento",
    name: "Fotos/escaneamento",
    slug: "fotografia-escaneamento",
    sort_order: 1,
  },
  {
    exam_type: "periapical",
    name: "Radiografia intra-oral",
    slug: "periapical",
    sort_order: 2,
  },
  {
    exam_type: "panoramico",
    name: "Radiografia extra-oral",
    slug: "panoramico",
    sort_order: 3,
  },
  {
    exam_type: "tomografia",
    name: "Tomografia",
    slug: "tomografia",
    sort_order: 4,
  },
];

const allRoomSlugs = rooms.map((room) => room.slug);

const users = [
  {
    email: "admin@clinic.local",
    full_name: "Admin Clínica",
    passwordEnv: "SEED_ADMIN_PASSWORD",
    role: "admin",
    room_slugs: [],
  },
  {
    email: "recepcao1@clinic.local",
    full_name: "Recepção 1",
    passwordEnv: "SEED_RECEPCAO1_PASSWORD",
    role: "recepcao",
    room_slugs: [],
  },
  {
    email: "geovanna@clinic.local",
    full_name: "GEOVANNA",
    passwordEnv: "SEED_GEOVANNA_PASSWORD",
    role: "recepcao",
    room_slugs: [],
  },
  {
    email: "clara@clinic.local",
    full_name: "CLARA",
    passwordEnv: "SEED_CLARA_PASSWORD",
    role: "recepcao",
    room_slugs: [],
  },
  {
    email: "karol@clinic.local",
    full_name: "KAROL",
    passwordEnv: "SEED_KAROL_PASSWORD",
    role: "recepcao",
    room_slugs: [],
  },
  {
    email: "atendimento1@clinic.local",
    full_name: "Atendimento 1",
    passwordEnv: "SEED_ATENDIMENTO1_PASSWORD",
    role: "atendimento",
    room_slugs: allRoomSlugs,
  },
  {
    email: "diego@clinic.local",
    full_name: "DIEGO",
    passwordEnv: "SEED_DIEGO_PASSWORD",
    role: "atendimento",
    room_slugs: allRoomSlugs,
  },
  {
    email: "ayrton@clinic.local",
    full_name: "AYRTON",
    passwordEnv: "SEED_AYRTON_PASSWORD",
    role: "atendimento",
    room_slugs: allRoomSlugs,
  },
  {
    email: "juliane@clinic.local",
    full_name: "JULIANE",
    passwordEnv: "SEED_JULIANE_PASSWORD",
    role: "atendimento",
    room_slugs: allRoomSlugs,
  },
];

async function seedRooms() {
  const { error } = await supabase
    .from("exam_rooms")
    .upsert(rooms, { onConflict: "slug" });

  if (error) {
    throw error;
  }
}

async function seedUsers() {
  const { data: authUsers, error: listError } =
    await supabase.auth.admin.listUsers({
      page: 1,
      perPage: 100,
    });

  if (listError) {
    throw listError;
  }

  for (const user of users) {
    const existingUser = authUsers.users.find((entry) => entry.email === user.email);
    const password = requiredSeedPassword(user.passwordEnv);

    let userId = existingUser?.id;

    if (existingUser) {
      const { data, error } = await supabase.auth.admin.updateUserById(
        existingUser.id,
        {
          email: user.email,
          email_confirm: true,
          password,
          user_metadata: {
            full_name: user.full_name,
            role: user.role,
          },
        },
      );

      if (error || !data.user) {
        throw error ?? new Error(`Falha ao atualizar ${user.email}.`);
      }

      userId = data.user.id;
    } else {
      const { data, error } = await supabase.auth.admin.createUser({
        email: user.email,
        email_confirm: true,
        password,
        user_metadata: {
          full_name: user.full_name,
          role: user.role,
        },
      });

      if (error || !data.user) {
        throw error ?? new Error(`Falha ao criar ${user.email}.`);
      }

      userId = data.user.id;
    }

    const { error: profileError } = await supabase.from("profiles").upsert({
      full_name: user.full_name,
      id: userId,
      role: user.role,
    });

    if (profileError) {
      throw profileError;
    }

    const { error: deleteAccessError } = await supabase
      .from("profile_room_access")
      .delete()
      .eq("profile_id", userId);

    if (deleteAccessError) {
      throw deleteAccessError;
    }

    if (user.room_slugs.length) {
      const { error: accessError } = await supabase
        .from("profile_room_access")
        .insert(
          user.room_slugs.map((room_slug) => ({
            profile_id: userId,
            room_slug,
          })),
        );

      if (accessError) {
        throw accessError;
      }
    }
  }
}

async function main() {
  await seedRooms();
  await seedUsers();

  console.log("Seed concluído.");
  console.log(
    "Usuários gerenciados:",
    users.map((user) => `${user.email} (${user.full_name})`).join(", "),
  );
  console.log("Senhas: configuradas por variáveis de ambiente individuais.");
}

main().catch((error) => {
  console.error("Falha no seed:", error.message);
  process.exit(1);
});
