import { redirect } from "next/navigation";
import { EmptyState } from "@/components/empty-state";
import { getSessionContext } from "@/lib/auth";
import { ROLE_HOME } from "@/lib/constants";
import { isSupabaseConfigured } from "@/lib/env";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

type LoginPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const LOGIN_ERRORS: Record<string, string> = {
  perfil: "Seu acesso existe, mas o perfil interno ainda não foi provisionado.",
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  if (!isSupabaseConfigured()) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4 py-10">
        <div className="w-full max-w-3xl">
          <EmptyState
            title="Configuração do Supabase pendente"
            description="Defina NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY para liberar o login. O README traz o setup completo."
          />
        </div>
      </div>
    );
  }

  const params = await searchParams;
  const session = await getSessionContext();

  if (session.profile) {
    redirect(ROLE_HOME[session.profile.role]);
  }

  const errorParam = typeof params.error === "string" ? params.error : undefined;

  return <LoginForm serverError={errorParam ? LOGIN_ERRORS[errorParam] : undefined} />;
}
