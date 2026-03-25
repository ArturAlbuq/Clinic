import { redirectToRoleHome } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  await redirectToRoleHome();
}
