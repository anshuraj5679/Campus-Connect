import { RoleLayout } from "@/components/shared/role-layout";

/** Pages every signed-in user can open: notices, notifications, account. */
export default function SharedLayout({ children }: { children: React.ReactNode }) {
  return <RoleLayout>{children}</RoleLayout>;
}
