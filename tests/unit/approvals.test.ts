import { describe, expect, it } from "vitest";
import { canDecide, type ApprovalTarget } from "@/lib/services/approvalRules";

const base: ApprovalTarget = {
  id: "s1",
  name: "Riya",
  role: "STUDENT",
  isVerified: false,
  isActive: true,
  departmentId: "cse",
  clusterId: "c4",
  sectionId: "5j",
  sectionName: "5J",
  classTeacherId: "ct",
  clusterHeadId: "ch",
  hodId: "hod",
};
const who = (id: string, role = "TEACHER") => ({ id, role });

describe("account approval rules", () => {
  it("a student is approved by their section's class teacher, not other teachers or the Cluster Head", () => {
    expect(canDecide(who("ct"), base)).toBeNull();
    expect(canDecide(who("other"), base)).toMatch(/class teacher/);
    expect(canDecide(who("ch", "CLUSTER_HEAD"), base)).toMatch(/class teacher/);
  });

  it("the Cluster Head approves students while the section has no class teacher", () => {
    const t = { ...base, classTeacherId: null };
    expect(canDecide(who("ch", "CLUSTER_HEAD"), t)).toBeNull();
    expect(canDecide(who("ct"), t)).not.toBeNull();
  });

  it("a teacher is approved by their cluster's Cluster Head", () => {
    const t = { ...base, id: "t1", role: "TEACHER", classTeacherId: null, sectionId: null };
    expect(canDecide(who("ch", "CLUSTER_HEAD"), t)).toBeNull();
    expect(canDecide(who("other-ch", "CLUSTER_HEAD"), t)).toMatch(/Cluster Head/);
    expect(canDecide(who("ct"), t)).not.toBeNull();
  });

  it("a Cluster Head is approved by the HOD or the admin only", () => {
    const t = { ...base, id: "ch", role: "CLUSTER_HEAD", clusterHeadId: "ch" };
    expect(canDecide(who("hod", "HOD"), t)).toBeNull();
    expect(canDecide(who("admin", "ADMIN"), t)).toBeNull();
    expect(canDecide(who("ct"), t)).toMatch(/HOD or the admin/);
  });

  it("the HOD and the admin can always decide; nobody approves themselves", () => {
    expect(canDecide(who("hod", "HOD"), base)).toBeNull();
    expect(canDecide(who("admin", "ADMIN"), base)).toBeNull();
    expect(canDecide(who("ch", "CLUSTER_HEAD"), { ...base, id: "ch", role: "CLUSTER_HEAD", hodId: null })).toMatch(/own account/);
  });
});
