// Utility to calculate delivery dates taking into account working days, weekends (Fridays, Saturdays), and Egyptian official national holidays.

export interface HolidayItem {
  date: string; // YYYY-MM-DD
  name: string; // اسم العطلة أو المناسبة
}

// Built-in list of official Egyptian government holidays for 2025, 2026, 2027 and annual fixed events
export const DEFAULT_OFFICIAL_HOLIDAYS: HolidayItem[] = [
  // Fixed annual national holidays
  { date: "2025-01-07", name: "عيد الميلاد المجيد" },
  { date: "2025-01-25", name: "ثورة 25 يناير وعيد الشرطة" },
  { date: "2025-03-30", name: "عيد الفطر المبارك (وقفة)" },
  { date: "2025-03-31", name: "عيد الفطر المبارك" },
  { date: "2025-04-01", name: "عيد الفطر المبارك" },
  { date: "2025-04-02", name: "عيد الفطر المبارك" },
  { date: "2025-04-21", name: "شم النسيم" },
  { date: "2025-04-25", name: "عيد تحرير سيناء" },
  { date: "2025-05-01", name: "عيد العمال" },
  { date: "2025-06-05", name: "وقفة عرفات" },
  { date: "2025-06-06", name: "عيد الأضحى المبارك" },
  { date: "2025-06-07", name: "عيد الأضحى المبارك" },
  { date: "2025-06-08", name: "عيد الأضحى المبارك" },
  { date: "2025-06-26", name: "رأس السنة الهجرية" },
  { date: "2025-06-30", name: "ثورة 30 يونيو" },
  { date: "2025-07-23", name: "ثورة 23 يوليو" },
  { date: "2025-09-04", name: "المولد النبوي الشريف" },
  { date: "2025-10-06", name: "عيد القوات المسلحة (6 أكتوبر)" },

  // 2026 Holidays
  { date: "2026-01-07", name: "عيد الميلاد المجيد" },
  { date: "2026-01-25", name: "ثورة 25 يناير وعيد الشرطة" },
  { date: "2026-03-19", name: "وقفة عيد الفطر المبارك" },
  { date: "2026-03-20", name: "عيد الفطر المبارك" },
  { date: "2026-03-21", name: "عيد الفطر المبارك" },
  { date: "2026-03-22", name: "عيد الفطر المبارك" },
  { date: "2026-04-13", name: "شم النسيم" },
  { date: "2026-04-25", name: "عيد تحرير سيناء" },
  { date: "2026-05-01", name: "عيد العمال" },
  { date: "2026-05-26", name: "وقفة عرفات" },
  { date: "2026-05-27", name: "عيد الأضحى المبارك" },
  { date: "2026-05-28", name: "عيد الأضحى المبارك" },
  { date: "2026-05-29", name: "عيد الأضحى المبارك" },
  { date: "2026-06-16", name: "رأس السنة الهجرية" },
  { date: "2026-06-30", name: "ثورة 30 يونيو" },
  { date: "2026-07-23", name: "ثورة 23 يوليو" },
  { date: "2026-08-25", name: "المولد النبوي الشريف" },
  { date: "2026-10-06", name: "عيد القوات المسلحة (6 أكتوبر)" },

  // 2027 Holidays
  { date: "2027-01-07", name: "عيد الميلاد المجيد" },
  { date: "2027-01-25", name: "ثورة 25 يناير وعيد الشرطة" },
  { date: "2027-03-09", name: "عيد الفطر المبارك" },
  { date: "2027-03-10", name: "عيد الفطر المبارك" },
  { date: "2027-03-11", name: "عيد الفطر المبارك" },
  { date: "2027-05-01", name: "عيد العمال" },
  { date: "2027-05-16", name: "عيد الأضحى المبارك" },
  { date: "2027-06-30", name: "ثورة 30 يونيو" },
  { date: "2027-07-23", name: "ثورة 23 يوليو" },
  { date: "2027-10-06", name: "عيد القوات المسلحة (6 أكتوبر)" }
];

/**
 * Format a Date object as YYYY-MM-DD using local time
 */
export function formatDateYMD(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Parses YYYY-MM-DD safely into a local Date object (at midday to avoid timezone shifts)
 */
export function parseDateYMD(str: string): Date {
  if (!str) return new Date();
  const parts = str.split("T")[0].split("-");
  if (parts.length === 3) {
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10) - 1;
    const d = parseInt(parts[2], 10);
    return new Date(y, m, d, 12, 0, 0);
  }
  const parsed = new Date(str);
  return isNaN(parsed.getTime()) ? new Date() : parsed;
}

/**
 * Determines whether Saturday is a working day for a service.
 * Special Rule:
 * - Services that start with '#' (e.g. '## استخراج جواز سفر عادي', '#...'):
 *   Saturday is considered a normal working day (يوم عمل وليس عطلة).
 * - All other services (not starting with '#'):
 *   Saturday is an official weekend/holiday (عطلة أسبوعية للمصالح الحكومية).
 */
export function isSaturdayWorkDayForService(serviceNameOrId?: string): boolean {
  if (!serviceNameOrId) return false;
  return serviceNameOrId.trim().startsWith("#");
}

export function shouldIncludeSaturdayAsWeekend(serviceNameOrId?: string, globalSaturdayWeekendSetting: boolean = true): boolean {
  if (serviceNameOrId && isSaturdayWorkDayForService(serviceNameOrId)) {
    return false; // Saturday is NOT a weekend; it is a working day!
  }
  return globalSaturdayWeekendSetting;
}

/**
 * Checks if a given date is a non-working day for passport offices / government departments:
 * - Friday (day 5) is always an official weekend.
 * - Saturday (day 6) is a weekend for most ministries and government administrations (configurable).
 * - Official State / National Holidays (عطلات رسمية للدولة).
 */
export function isNonWorkingDay(
  date: Date, 
  customHolidays: HolidayItem[] = [],
  includeSaturdayAsWeekend: boolean = true
): { isHoliday: boolean; reason?: string } {
  const dayOfWeek = date.getDay(); // 0 = Sunday, 1 = Monday, ..., 5 = Friday, 6 = Saturday

  // Friday is the primary official weekend
  if (dayOfWeek === 5) {
    return { isHoliday: true, reason: "عطلة أسبوعية رسمية (يوم الجمعة)" };
  }

  // Saturday is the weekend for passport offices and government agencies
  if (includeSaturdayAsWeekend && dayOfWeek === 6) {
    return { isHoliday: true, reason: "عطلة أسبوعية رسمية (يوم السبت)" };
  }

  const dateStr = formatDateYMD(date);

  // Check custom holidays first
  const custom = customHolidays.find(h => h.date === dateStr);
  if (custom) {
    return { isHoliday: true, reason: custom.name || "عطلة رسمية مسجلة" };
  }

  // Check standard Egyptian national holidays
  const builtIn = DEFAULT_OFFICIAL_HOLIDAYS.find(h => h.date === dateStr);
  if (builtIn) {
    return { isHoliday: true, reason: builtIn.name };
  }

  return { isHoliday: false };
}

/**
 * Calculates the final delivery date by adding N working days to the start date:
 * - Skips all Fridays.
 * - Skips all Saturdays (unless the service starts with '#' where Saturday is a working day).
 * - Skips all official national state holidays (عطلات الدولة والمصالح الحكومية).
 * - If the period crosses 2 or more Fridays or consecutive holidays, all are bypassed until N real working days are completed.
 * - Guarantees the resulting delivery day is also a working day (never falls on Friday/Saturday/Holiday).
 */
export function calculateWorkingDaysDeliveryDate(
  startDateStr: string | Date,
  workingDaysOffset: number,
  customHolidays: HolidayItem[] = [],
  includeSaturdayAsWeekendOrServiceName: boolean | string = true,
  globalSaturdayWeekendSetting: boolean = true
): { 
  deliveryDate: string; 
  skippedDaysCount: number; 
  skippedHolidays: { date: string; reason: string }[];
  isSaturdayWorkDay: boolean;
} {
  const startDate = typeof startDateStr === "string" ? parseDateYMD(startDateStr) : new Date(startDateStr.getTime());
  
  let includeSaturdayAsWeekend = true;
  let isSaturdayWorkDay = false;

  if (typeof includeSaturdayAsWeekendOrServiceName === "string") {
    isSaturdayWorkDay = isSaturdayWorkDayForService(includeSaturdayAsWeekendOrServiceName);
    includeSaturdayAsWeekend = !isSaturdayWorkDay && globalSaturdayWeekendSetting;
  } else if (typeof includeSaturdayAsWeekendOrServiceName === "boolean") {
    includeSaturdayAsWeekend = includeSaturdayAsWeekendOrServiceName;
    isSaturdayWorkDay = !includeSaturdayAsWeekend;
  }
  
  if (workingDaysOffset <= 0) {
    // If 0 days offset (same day), ensure it's not landing on a holiday/weekend
    const cur = new Date(startDate.getTime());
    let skippedHolidays: { date: string; reason: string }[] = [];
    while (true) {
      const check = isNonWorkingDay(cur, customHolidays, includeSaturdayAsWeekend);
      if (!check.isHoliday) break;
      skippedHolidays.push({ date: formatDateYMD(cur), reason: check.reason || "عطلة" });
      cur.setDate(cur.getDate() + 1);
    }
    return {
      deliveryDate: formatDateYMD(cur),
      skippedDaysCount: skippedHolidays.length,
      skippedHolidays,
      isSaturdayWorkDay
    };
  }

  const currentDate = new Date(startDate.getTime());
  let addedWorkingDays = 0;
  const skippedHolidays: { date: string; reason: string }[] = [];

  // Iterate day by day starting from the next calendar day
  while (addedWorkingDays < workingDaysOffset) {
    currentDate.setDate(currentDate.getDate() + 1);
    const check = isNonWorkingDay(currentDate, customHolidays, includeSaturdayAsWeekend);

    if (check.isHoliday) {
      // It's a weekend or national holiday, skip it and do not count towards working days
      skippedHolidays.push({
        date: formatDateYMD(currentDate),
        reason: check.reason || "عطلة رسمية"
      });
    } else {
      // It's a valid government working day
      addedWorkingDays++;
    }
  }

  return {
    deliveryDate: formatDateYMD(currentDate),
    skippedDaysCount: skippedHolidays.length,
    skippedHolidays,
    isSaturdayWorkDay
  };
}

/**
 * Returns Arabic day name for a given YYYY-MM-DD date string
 */
export function getArabicDayName(dateStr: string): string {
  try {
    const d = parseDateYMD(dateStr);
    const days = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
    return days[d.getDay()] || "";
  } catch {
    return "";
  }
}
