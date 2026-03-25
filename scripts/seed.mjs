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

const DEFAULT_PASSWORD = "Clinic123!";
const ADMIN_PASSWORD = "PadrePio123";

const rooms = [
  {
    exam_type: "fotografia_escaneamento",
    name: "Fotografia / escaneamento intra-oral",
    slug: "fotografia-escaneamento",
    sort_order: 1,
  },
  {
    exam_type: "periapical",
    name: "Periapical",
    slug: "periapical",
    sort_order: 2,
  },
  {
    exam_type: "panoramico",
    name: "Panorâmico",
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

const users = [
  {
    email: "admin@clinic.local",
    full_name: "Admin Clínica",
    password: ADMIN_PASSWORD,
    role: "admin",
  },
  {
    email: "recepcao1@clinic.local",
    full_name: "Recepção 1",
    role: "recepcao",
  },
  {
    email: "recepcao2@clinic.local",
    full_name: "Recepção 2",
    role: "recepcao",
  },
  {
    email: "recepcao3@clinic.local",
    full_name: "Recepção 3",
    role: "recepcao",
  },
  {
    email: "atendimento1@clinic.local",
    full_name: "Atendimento 1",
    role: "atendimento",
  },
  {
    email: "atendimento2@clinic.local",
    full_name: "Atendimento 2",
    role: "atendimento",
  },
  {
    email: "atendimento3@clinic.local",
    full_name: "Atendimento 3",
    role: "atendimento",
  },
  {
    email: "atendimento4@clinic.local",
    full_name: "Atendimento 4",
    role: "atendimento",
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
    const password = user.password ?? DEFAULT_PASSWORD;

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
  }
}

async function main() {
  await seedRooms();
  await seedUsers();

  console.log("Seed concluído.");
  console.log("Senha do admin:", ADMIN_PASSWORD);
  console.log("Senha padrão para os demais usuários:", DEFAULT_PASSWORD);
  console.log("Usuários criados:", users.map((user) => user.email).join(", "));
}

main().catch((error) => {
  console.error("Falha no seed:", error.message);
  process.exit(1);
});
