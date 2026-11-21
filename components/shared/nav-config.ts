import {
  Bell,
  CalendarDays,
  CalendarOff,
  CalendarX2,
  ChartColumn,
  CircleUser,
  Clock,
  FilePlus as FilePlus2,
  FileUp,
  House,
  Landmark,
  LayoutDashboard,
  Megaphone,
  MessageSquareExclamationPoint,
  MessagesSquare,
  Network,
  ScrollText,
  Settings,
  UserSearch,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import type { Role } from "@/lib/auth/roles";

/** Cookie that remembers the desktop sidebar's collapsed state. */
export const SIDEBAR_COOKIE = "cc_sidebar";

export type NavItem = { label: string; href: string; icon: LucideIcon };
export type NavGroup = { label?: string; items: NavItem[] };

const teachingGroup: NavGroup = {
  label: "My Teaching",
  items: [
    { label: "My Dashboard", href: "/teacher", icon: LayoutDashboard },
    { label: "Timetable", href: "/teacher/timetable", icon: CalendarDays },
    { label: "Mark Unavailability", href: "/teacher/unavailability", icon: CalendarOff },
    { label: "Complaint Responses", href: "/teacher/complaints", icon: MessagesSquare },
  ],
};

const generalGroup: NavGroup = {
  label: "General",
  items: [
    { label: "Find a Teacher", href: "/teachers", icon: UserSearch },
    { label: "Notices", href: "/notices", icon: Megaphone },
    { label: "Notifications", href: "/notifications", icon: Bell },
    { label: "My Account", href: "/account", icon: CircleUser },
  ],
};

export const NAV_BY_ROLE: Record<Role, NavGroup[]> = {
  STUDENT: [
    {
      items: [
        { label: "Home", href: "/student", icon: House },
        { label: "Find a Teacher", href: "/teachers", icon: UserSearch },
        { label: "My Complaints", href: "/student/complaints", icon: MessageSquareExclamationPoint },
        { label: "Raise a Complaint", href: "/student/complaints/new", icon: FilePlus2 },
      ],
    },
    {
      label: "General",
      items: [
        { label: "Notices", href: "/notices", icon: Megaphone },
        { label: "Notifications", href: "/notifications", icon: Bell },
        { label: "My Account", href: "/account", icon: CircleUser },
      ],
    },
  ],
  TEACHER: [teachingGroup, generalGroup],
  CLUSTER_HEAD: [
    {
      label: "Cluster",
      items: [
        { label: "Cluster Overview", href: "/cluster-head", icon: LayoutDashboard },
        { label: "Complaints", href: "/cluster-head/complaints", icon: MessageSquareExclamationPoint },
        { label: "Cluster Teachers", href: "/cluster-head/teachers", icon: Users },
        { label: "Announcements", href: "/cluster-head/announcements", icon: Megaphone },
      ],
    },
    teachingGroup,
    generalGroup,
  ],
  HOD: [
    {
      label: "Department",
      items: [
        { label: "Department Overview", href: "/hod", icon: LayoutDashboard },
        { label: "Complaints", href: "/hod/complaints", icon: MessageSquareExclamationPoint },
        { label: "Clusters", href: "/hod/clusters", icon: Network },
        { label: "Announcements", href: "/hod/announcements", icon: Megaphone },
        { label: "Reports", href: "/hod/reports", icon: ChartColumn },
      ],
    },
    teachingGroup,
    generalGroup,
  ],
  ADMIN: [
    { items: [{ label: "Overview", href: "/admin", icon: LayoutDashboard }] },
    {
      label: "Structure",
      items: [
        { label: "Departments & Clusters", href: "/admin/structure", icon: Landmark },
        { label: "Users", href: "/admin/users", icon: Users },
        { label: "Bulk Import", href: "/admin/import", icon: FileUp },
      ],
    },
    {
      label: "Academic Calendar",
      items: [
        { label: "Period Slots", href: "/admin/periods", icon: Clock },
        { label: "Holidays", href: "/admin/holidays", icon: CalendarX2 },
        { label: "College Settings", href: "/admin/settings", icon: Settings },
      ],
    },
    {
      label: "Communication",
      items: [
        { label: "Announcements", href: "/admin/announcements", icon: Megaphone },
        { label: "Complaints", href: "/admin/complaints", icon: Wrench },
      ],
    },
    {
      label: "System",
      items: [
        { label: "Audit Log", href: "/admin/audit", icon: ScrollText },
        { label: "Find a Teacher", href: "/teachers", icon: UserSearch },
        { label: "Notifications", href: "/notifications", icon: Bell },
        { label: "My Account", href: "/account", icon: CircleUser },
      ],
    },
  ],
};

/** Mobile bottom tab bar for students (spec §5.2). */
export const STUDENT_TABS: NavItem[] = [
  { label: "Home", href: "/student", icon: House },
  { label: "Teachers", href: "/teachers", icon: UserSearch },
  { label: "Complaints", href: "/student/complaints", icon: MessageSquareExclamationPoint },
  { label: "Notices", href: "/notices", icon: Megaphone },
  { label: "Profile", href: "/account", icon: CircleUser },
];

/**
 * Active-link rule: exact match for section roots ("/teacher"),
 * prefix match for everything else ("/student/complaints/CMP-…").
 */
const EXACT = new Set(["/student", "/teacher", "/cluster-head", "/hod", "/admin", "/student/complaints"]);

export function isNavActive(pathname: string, href: string): boolean {
  if (EXACT.has(href)) return pathname === href;
  return pathname === href || pathname.startsWith(href + "/");
}
