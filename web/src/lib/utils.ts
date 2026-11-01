export function cn(...classes: (string | boolean | undefined | null)[]): string {
  return classes.filter(Boolean).join(" ");
}

export interface EthioMonth {
  index: number;
  fidel: string;
  latin: string;
  days: number;
}

export const ETHIOPIAN_MONTHS: EthioMonth[] = [
  { index: 1, fidel: "መስከረም", latin: "Meskerem", days: 30 },
  { index: 2, fidel: "ጥቅምት", latin: "Tikimt", days: 30 },
  { index: 3, fidel: "ኅዳር", latin: "Hidar", days: 30 },
  { index: 4, fidel: "ታኅሣሥ", latin: "Tahsas", days: 30 },
  { index: 5, fidel: "ጥር", latin: "Tir", days: 30 },
  { index: 6, fidel: "የካቲት", latin: "Yakatit", days: 30 },
  { index: 7, fidel: "መጋቢት", latin: "Megabit", days: 30 },
  { index: 8, fidel: "ሚያዝያ", latin: "Miazia", days: 30 },
  { index: 9, fidel: "ግንቦት", latin: "Ginbot", days: 30 },
  { index: 10, fidel: "ሰኔ", latin: "Sene", days: 30 },
  { index: 11, fidel: "ሐምሌ", latin: "Hamle", days: 30 },
  { index: 12, fidel: "ነሐሴ", latin: "Nehase", days: 30 },
  { index: 13, fidel: "ጳጉሜ", latin: "Pagume", days: 6 },
];

export function getEthioMonthName(
  monthNumber: number | null | undefined,
  script: "latin" | "fidel" = "latin",
): string {
  if (!monthNumber || monthNumber < 1 || monthNumber > 13) return "";
  const m = ETHIOPIAN_MONTHS[monthNumber - 1];
  return script === "fidel" ? m.fidel : m.latin;
}

export function formatLifespan(
  birthYearEC?: number | null,
  deathYearEC?: number | null,
  isDeceased?: boolean,
  era?: string,
): string {
  if (!birthYearEC && !deathYearEC) {
    return isDeceased ? (era && era !== "EC" ? "ሟች" : "Deceased") : "";
  }
  const suffix = era !== undefined ? (era ? ` ${era}` : "") : " EC";
  const birth = birthYearEC ? `${birthYearEC}` : "?";
  if (isDeceased) {
    const death = deathYearEC ? `${deathYearEC}` : "?";
    return `${birth} – ${death}${suffix}`;
  }
  return `b. ${birth}${suffix}`;
}

export function formatFullDateEC(
  year?: number | null,
  month?: number | null,
  day?: number | null,
  monthName?: string,
  era?: string,
): string {
  if (!year) return "";
  const parts: string[] = [];
  if (day) parts.push(`${day}`);
  if (monthName) {
    parts.push(monthName);
  } else if (month && month >= 1 && month <= 13) {
    parts.push(ETHIOPIAN_MONTHS[month - 1].latin);
  }
  const suffix = era !== undefined ? (era ? ` ${era}` : "") : " EC";
  parts.push(`${year}${suffix}`);
  return parts.join(" ");
}

export function formatRole(role: string): string {
  switch (role) {
    case "OWNER":
      return "Owner";
    case "ADMIN":
      return "Admin";
    case "EDITOR":
      return "Editor";
    case "VIEWER":
      return "Viewer";
    default:
      return role;
  }
}

export function getLocalizedRole(role: string, t: (k: string) => string): string {
  switch (role) {
    case "OWNER":
      return t("admin.roleOwner");
    case "ADMIN":
      return t("admin.roleAdmin");
    case "EDITOR":
      return t("admin.roleEditor");
    case "VIEWER":
      return t("admin.roleViewer");
    default:
      return formatRole(role);
  }
}
