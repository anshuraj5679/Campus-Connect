/**
 * Static seed data for BMS Institute of Technology and Management (BMSIT&M).
 * Names are illustrative; departments follow the official programme list.
 */

export const DEPARTMENTS = [
  { code: "CSE", name: "Computer Science and Engineering" },
  { code: "AIML", name: "Artificial Intelligence and Machine Learning" },
  { code: "CSBS", name: "Computer Science and Business Systems" },
  { code: "ECE", name: "Electronics and Communication Engineering" },
  { code: "EEE", name: "Electrical and Electronics Engineering" },
  { code: "ME", name: "Mechanical Engineering" },
  { code: "CIVIL", name: "Civil Engineering" },
] as const;

/** CSE: 4 clusters, each owning sections. */
export const CSE_CLUSTERS = [
  { name: "Cluster 1", sections: [{ name: "3A", room: "101" }, { name: "3B", room: "102" }] },
  { name: "Cluster 2", sections: [{ name: "5A", room: "204" }, { name: "5B", room: "205" }] },
  { name: "Cluster 3", sections: [{ name: "5C", room: "206" }, { name: "7A", room: "301" }] },
  { name: "Cluster 4", sections: [{ name: "7B", room: "302" }, { name: "3C", room: "103" }] },
];

export type SeedTeacher = {
  key: string;
  name: string;
  email: string;
  designation: string;
  cluster: number | null; // CSE cluster index (0-based); null = HOD
  cabin: string;
  isClusterHead?: boolean;
};

export const CSE_HOD: SeedTeacher = {
  key: "hod",
  name: "Dr. Meena Iyer",
  email: "hod@campusconnect.test",
  designation: "Professor & Head",
  cluster: null,
  cabin: "CSE Block, Room 401 (HOD Office)",
};

export const CSE_TEACHERS: SeedTeacher[] = [
  // Cluster 1
  { key: "anand", name: "Dr. Anand Kulkarni", email: "anand.kulkarni@bmsit.test", designation: "Professor", cluster: 0, cabin: "CSE Block, Room 311", isClusterHead: true },
  { key: "shwetha", name: "Prof. Shwetha Hegde", email: "shwetha.hegde@bmsit.test", designation: "Associate Professor", cluster: 0, cabin: "CSE Block, Room 312" },
  { key: "karthik", name: "Mr. Karthik Gowda", email: "karthik.gowda@bmsit.test", designation: "Assistant Professor", cluster: 0, cabin: "CSE Block, Room 313" },
  { key: "pooja", name: "Ms. Pooja Nair", email: "pooja.nair@bmsit.test", designation: "Assistant Professor", cluster: 0, cabin: "CSE Block, Room 314" },
  // Cluster 2 (demo cluster)
  { key: "rajesh", name: "Dr. Rajesh Sharma", email: "clusterhead@campusconnect.test", designation: "Professor", cluster: 1, cabin: "CSE Block, Room 321", isClusterHead: true },
  { key: "kavitha", name: "Prof. Kavitha Rao", email: "teacher@campusconnect.test", designation: "Assistant Professor", cluster: 1, cabin: "CSE Block, Room 312, 3rd floor" },
  { key: "suresh", name: "Dr. Suresh Babu K", email: "suresh.babu@bmsit.test", designation: "Associate Professor", cluster: 1, cabin: "CSE Block, Room 323" },
  { key: "divya", name: "Ms. Divya Shetty", email: "divya.shetty@bmsit.test", designation: "Assistant Professor", cluster: 1, cabin: "CSE Block, Room 324" },
  { key: "arjun", name: "Mr. Arjun Menon", email: "arjun.menon@bmsit.test", designation: "Assistant Professor", cluster: 1, cabin: "CSE Block, Room 325" },
  // Cluster 3
  { key: "lakshmi", name: "Dr. Lakshmi Narayan", email: "lakshmi.narayan@bmsit.test", designation: "Professor", cluster: 2, cabin: "CSE Block, Room 331", isClusterHead: true },
  { key: "ramesh", name: "Prof. Ramesh Iyengar", email: "ramesh.iyengar@bmsit.test", designation: "Associate Professor", cluster: 2, cabin: "CSE Block, Room 332" },
  { key: "sneha", name: "Ms. Sneha Patil", email: "sneha.patil@bmsit.test", designation: "Assistant Professor", cluster: 2, cabin: "CSE Block, Room 333" },
  { key: "vivek", name: "Mr. Vivek Reddy", email: "vivek.reddy@bmsit.test", designation: "Assistant Professor", cluster: 2, cabin: "CSE Block, Room 334" },
  // Cluster 4
  { key: "manjunath", name: "Dr. Manjunath B S", email: "manjunath.bs@bmsit.test", designation: "Professor", cluster: 3, cabin: "CSE Block, Room 341", isClusterHead: true },
  { key: "nandini", name: "Prof. Nandini Rao", email: "nandini.rao@bmsit.test", designation: "Associate Professor", cluster: 3, cabin: "CSE Block, Room 342" },
  { key: "harish", name: "Mr. Harish Kumar", email: "harish.kumar@bmsit.test", designation: "Assistant Professor", cluster: 3, cabin: "CSE Block, Room 343" },
  { key: "ayesha", name: "Ms. Ayesha Fathima", email: "ayesha.fathima@bmsit.test", designation: "Assistant Professor", cluster: 3, cabin: "CSE Block, Room 344" },
  { key: "deepak", name: "Prof. Deepak Joshi", email: "deepak.joshi@bmsit.test", designation: "Associate Professor", cluster: 3, cabin: "CSE Block, Room 345" },
];

/** Other departments: HOD, one Cluster Head, one teacher. */
export const OTHER_DEPT_STAFF: Record<string, { hod: string; ch: string; teacher: string }> = {
  AIML: { hod: "Dr. Priya Venkatesh", ch: "Dr. Sanjay Rao", teacher: "Ms. Ananya Bhat" },
  CSBS: { hod: "Dr. Ravi Shankar", ch: "Prof. Geetha Murthy", teacher: "Mr. Rohan Das" },
  ECE: { hod: "Dr. Usha Rani", ch: "Dr. Naveen Kumar", teacher: "Ms. Kavya Srinivas" },
  EEE: { hod: "Dr. Prakash Hegde", ch: "Prof. Mahesh Gupta", teacher: "Ms. Rekha Pai" },
  ME: { hod: "Dr. Mohan Kumar", ch: "Prof. Srinath Rao", teacher: "Mr. Imran Khan" },
  CIVIL: { hod: "Dr. Sunitha Gowda", ch: "Prof. Venkatesh Murthy", teacher: "Ms. Bhavana Kamath" },
};

export type Subject = { code: string; name: string; type: "THEORY" | "LAB"; hours: number };

export const SUBJECTS_BY_SEM: Record<number, Subject[]> = {
  3: [
    { code: "21CS32", name: "Data Structures and Applications", type: "THEORY", hours: 4 },
    { code: "21CS33", name: "Analog and Digital Electronics", type: "THEORY", hours: 3 },
    { code: "21CS34", name: "Computer Organization", type: "THEORY", hours: 3 },
    { code: "21MAT31", name: "Mathematics III", type: "THEORY", hours: 4 },
    { code: "21CSL35", name: "Data Structures Lab", type: "LAB", hours: 3 },
  ],
  5: [
    { code: "21CS53", name: "Database Management Systems", type: "THEORY", hours: 4 },
    { code: "21CS52", name: "Computer Networks", type: "THEORY", hours: 4 },
    { code: "21CS61", name: "Software Engineering & Project Management", type: "THEORY", hours: 3 },
    { code: "21AI63", name: "Machine Learning", type: "THEORY", hours: 3 },
    { code: "21CS44", name: "Operating Systems", type: "THEORY", hours: 3 },
    { code: "21CSL55", name: "DBMS Lab", type: "LAB", hours: 3 },
  ],
  7: [
    { code: "21CS71", name: "Big Data Analytics", type: "THEORY", hours: 4 },
    { code: "21CS72", name: "Cloud Computing", type: "THEORY", hours: 3 },
    { code: "21CS73", name: "Cryptography and Network Security", type: "THEORY", hours: 3 },
    { code: "21CSL76", name: "Cloud Computing Lab", type: "LAB", hours: 3 },
  ],
};

/** Fixed assignments that make the demo story predictable (section → subject code → teacher key). */
export const FIXED_ASSIGNMENTS: Record<string, Record<string, string>> = {
  "5A": { "21CS53": "kavitha", "21CSL55": "kavitha", "21CS61": "rajesh", "21CS52": "suresh", "21AI63": "divya", "21CS44": "arjun" },
  "5B": { "21CS53": "kavitha", "21CS61": "rajesh", "21CS52": "suresh", "21AI63": "divya", "21CS44": "arjun", "21CSL55": "arjun" },
};

const FIRST = ["Aarav", "Ananya", "Rohit", "Sneha", "Vikram", "Priya", "Karan", "Meghana", "Siddharth", "Nisha", "Rahul", "Kavya", "Aditya", "Shreya", "Varun", "Pallavi", "Nikhil", "Divya", "Manish", "Bhoomika", "Sachin", "Tejaswini", "Abhishek", "Harshitha", "Pranav", "Sahana", "Yash", "Deeksha", "Gautam", "Spoorthi", "Akash", "Ishita", "Suhas", "Chaitra", "Tarun", "Keerthana", "Mohit", "Ramya", "Kiran", "Lavanya"];
const LAST = ["Kumar", "Reddy", "Sharma", "Gowda", "Nair", "Rao", "Patil", "Hegde", "Iyer", "Shetty", "Menon", "Bhat", "Joshi", "Naik", "Kulkarni", "Das", "Pai", "Murthy", "Prasad", "Singh"];

export type SeedStudent = { name: string; email: string; usn: string; section: string; batchYear: number };

/** 40 students: 16 in 5A, 12 in 5B, 12 in 3A. Student #1 is the demo account. */
export function buildStudents(): SeedStudent[] {
  const plan: { section: string; count: number; batch: number; start: number }[] = [
    { section: "5A", count: 16, batch: 2024, start: 40 },
    { section: "5B", count: 12, batch: 2024, start: 80 },
    { section: "3A", count: 12, batch: 2025, start: 10 },
  ];
  const students: SeedStudent[] = [];
  let i = 0;
  for (const p of plan) {
    for (let n = 0; n < p.count; n++, i++) {
      const first = FIRST[i % FIRST.length];
      const last = LAST[(i * 7) % LAST.length];
      const num = p.start + n + (p.section === "5A" ? 5 : 0); // 5A starts at 045
      const usn = `1BY${String(p.batch).slice(2)}CS${String(num).padStart(3, "0")}`;
      const isDemo = i === 0;
      students.push({
        name: isDemo ? "Aarav Kumar" : `${first} ${last}`,
        email: isDemo ? "student@campusconnect.test" : `${first}.${last}${num}`.toLowerCase() + "@bmsit.test",
        usn,
        section: p.section,
        batchYear: p.batch,
      });
    }
  }
  return students;
}
