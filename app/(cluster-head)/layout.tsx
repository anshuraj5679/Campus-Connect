import { RoleLayout } from "@/components/shared/role-layout";

export default function ClusterHeadLayout({ children }: { children: React.ReactNode }) {
  return <RoleLayout sectionPrefix="/cluster-head">{children}</RoleLayout>;
}
