import { describe, expect, it } from "vitest";
import {
  ROLES,
  canAccessPath,
  homeForRole,
  isPublicPath,
  isRole,
  rolesForPath,
} from "@/lib/auth/roles";
import { safeNextPath } from "@/lib/validators/auth";
import { getInitials } from "@/lib/format";
import { isNavActive } from "@/components/shared/nav-config";

describe("route access", () => {
  it("sends every role to its own home, which it can open", () => {
    for (const role of ROLES) {
      expect(canAccessPath(role, homeForRole(role))).toBe(true);
    }
  });

  it("keeps students out of staff areas", () => {
    expect(canAccessPath("STUDENT", "/teacher")).toBe(false);
    expect(canAccessPath("STUDENT", "/cluster-head/complaints")).toBe(false);
    expect(canAccessPath("STUDENT", "/hod")).toBe(false);
    expect(canAccessPath("STUDENT", "/admin/users")).toBe(false);
  });

  it("lets Cluster Heads and HODs use the teacher area (they also teach)", () => {
    expect(canAccessPath("CLUSTER_HEAD", "/teacher/timetable")).toBe(true);
    expect(canAccessPath("HOD", "/teacher/unavailability")).toBe(true);
    expect(canAccessPath("ADMIN", "/teacher")).toBe(false);
  });

  it("does not let a Cluster Head open HOD or admin pages", () => {
    expect(canAccessPath("CLUSTER_HEAD", "/hod")).toBe(false);
    expect(canAccessPath("CLUSTER_HEAD", "/admin")).toBe(false);
    expect(canAccessPath("TEACHER", "/cluster-head")).toBe(false);
  });

  it("matches whole path segments, not string prefixes", () => {
    // "/students-portal" must not be treated as "/student"
    expect(rolesForPath("/students-portal")).toBeNull();
    expect(rolesForPath("/teacherx")).toBeNull();
    expect(rolesForPath("/student/complaints/CMP-2026-0001")).toEqual(["STUDENT"]);
  });

  it("opens shared pages to every role", () => {
    for (const role of ROLES) {
      expect(canAccessPath(role, "/notifications")).toBe(true);
      expect(canAccessPath(role, "/notices")).toBe(true);
      expect(canAccessPath(role, "/account")).toBe(true);
    }
  });

  it("recognises public pages", () => {
    expect(isPublicPath("/login")).toBe(true);
    expect(isPublicPath("/forbidden")).toBe(true);
    expect(isPublicPath("/student")).toBe(false);
  });

  it("validates role strings", () => {
    expect(isRole("HOD")).toBe(true);
    expect(isRole("hod")).toBe(false);
    expect(isRole(undefined)).toBe(false);
  });
});

describe("safeNextPath (open-redirect protection)", () => {
  it("allows same-site relative paths", () => {
    expect(safeNextPath("/student/complaints")).toBe("/student/complaints");
  });
  it("rejects absolute and protocol-relative URLs", () => {
    expect(safeNextPath("https://evil.example")).toBeNull();
    expect(safeNextPath("//evil.example")).toBeNull();
    expect(safeNextPath("/\\evil.example")).toBeNull();
    expect(safeNextPath(undefined)).toBeNull();
  });
});

describe("getInitials", () => {
  it("ignores honorifics", () => {
    expect(getInitials("Dr. Rajesh Sharma")).toBe("RS");
    expect(getInitials("Prof. Kavitha Rao")).toBe("KR");
    expect(getInitials("Aarav")).toBe("A");
  });
});

describe("isNavActive", () => {
  it("matches section roots exactly and sub-pages by prefix", () => {
    expect(isNavActive("/student", "/student")).toBe(true);
    expect(isNavActive("/student/teachers", "/student")).toBe(false);
    expect(isNavActive("/teachers/abc", "/teachers")).toBe(true);
    // "My Complaints" must not light up together with "Raise a Complaint"
    expect(isNavActive("/student/complaints/new", "/student/complaints")).toBe(false);
    expect(isNavActive("/student/complaints/new", "/student/complaints/new")).toBe(true);
  });
});
