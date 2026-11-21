/**
 * Institution-level display settings (overridable through env vars).
 */
export const siteConfig = {
  appName: "CampusConnect",
  collegeName: process.env.NEXT_PUBLIC_COLLEGE_NAME ?? "BMS Institute of Technology and Management",
  collegeShortName: process.env.NEXT_PUBLIC_COLLEGE_SHORT_NAME ?? "BMSIT&M",
  crestInitials: process.env.NEXT_PUBLIC_CREST_INITIALS ?? "BMS",
  collegeAddress: "Doddaballapur Main Road, Avalahalli, Yelahanka, Bengaluru 560119",
  collegeTagline: "Affiliated to VTU · NAAC 'A' · NBA accredited programmes",
  academicYearLabel: process.env.NEXT_PUBLIC_ACADEMIC_YEAR_LABEL ?? "AY 2026–27 · Odd Sem",
  timeZone: "Asia/Kolkata",
} as const;

/** Demo mode shows one-click demo logins and the "Simulate time" control. */
export const isDemoMode = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
