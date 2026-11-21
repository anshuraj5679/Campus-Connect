import { RoleLayout } from "@/components/shared/role-layout";

export default function HodLayout({ children }: { children: React.ReactNode }) {
  return <RoleLayout sectionPrefix="/hod">{children}</RoleLayout>;
}
