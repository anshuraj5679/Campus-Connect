import { RoleLayout } from "@/components/shared/role-layout";

export default function StudentLayout({ children }: { children: React.ReactNode }) {
  return <RoleLayout sectionPrefix="/student">{children}</RoleLayout>;
}
