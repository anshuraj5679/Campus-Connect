import type { Role } from "./roles";

/**
 * Seeded demo accounts shown on the login page when NEXT_PUBLIC_DEMO_MODE=true.
 * They are created by `npm run seed:demo` (scripts/seed-demo-users.ts).
 * The `.test` domain is reserved, so these addresses can never belong to a real person.
 */
export type DemoAccount = {
  role: Role;
  email: string;
  fullName: string;
  subtitle: string;
};

export const DEMO_ACCOUNTS: DemoAccount[] = [
  {
    role: "STUDENT",
    email: "student@campusconnect.test",
    fullName: "Aarav Kumar",
    subtitle: "1BY24CS045 · CSE 5A",
  },
  {
    role: "TEACHER",
    email: "teacher@campusconnect.test",
    fullName: "Prof. Kavitha Rao",
    subtitle: "Asst. Professor · CSE",
  },
  {
    role: "CLUSTER_HEAD",
    email: "clusterhead@campusconnect.test",
    fullName: "Dr. Rajesh Sharma",
    subtitle: "Cluster Head · Cluster 2",
  },
  {
    role: "HOD",
    email: "hod@campusconnect.test",
    fullName: "Dr. Meena Iyer",
    subtitle: "HOD · Computer Science",
  },
  {
    role: "ADMIN",
    email: "admin@campusconnect.test",
    fullName: "Mr. Suresh Patil",
    subtitle: "Administrator · Office",
  },
];

/** Shared demo password. Server-only: never import this from a client component. */
export function getDemoPassword(): string {
  return process.env.DEMO_PASSWORD ?? "Demo@12345";
}
