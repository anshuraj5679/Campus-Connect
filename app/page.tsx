import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { homeForRole } from "@/lib/auth/roles";

/** "/" sends each user to their role's home (the middleware usually does this first). */
export default async function RootPage() {
  const user = await getCurrentUser();
  redirect(user ? homeForRole(user.role) : "/login");
}
