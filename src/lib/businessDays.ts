// Utility to calculate delivery dates taking into account working days, weekends (Fridays, Saturdays), and Egyptian official national holidays.

export interface HolidayItem {
  date: string; // YYYY-MM-DD
  name: string; // اسم العطلة أو المناسبة
  originalDate?: string; // التاريخ الأصلي قبل الترحيل بقرار رئيس الوزراء
  shifted?: boolean; // تم ترحيلها بقرار حكومي
}

// Built-in list of official Egyptian government holidays for 2025, 2026, 2027 and annual fixed events
export const DEFAULT_OFFICIAL_HOLIDAYS: HolidayItem[] = [
  // Fixed annual national holidays - 2025
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
 * Returns the effective list of holidays.
 * If customHolidays is provided and has items, it is authoritative.
 * Otherwise returns the built-in Egyptian official holidays list.
 */
export function getEffectiveHolidays(customHolidays?: HolidayItem[]): HolidayItem[] {
  if (customHolidays && customHolidays.length > 0) {
    return customHolidays;
  }
  return DEFAULT_OFFICIAL_HOLIDAYS;
}

/**
 * Shifts a holiday date to the nearest Thursday of that week
 * according to Egyptian Prime Minister decrees (قرار ترحيل الإجازات إلى يوم الخميس).
 */
export function shiftDateToThursday(dateStr: string): string {
  const d = parseDateYMD(dateStr);
  const day = d.getDay(); // 0 = Sun, 1 = Mon, 2 = Tue, 3 = Wed, 4 = Thu, 5 = Fri, 6 = Sat
  let daysToAdd = 0;
  if (day < 4) {
    // Sun(0), Mon(1), Tue(2), Wed(3) -> Thu(4)
    daysToAdd = 4 - day;
  } else if (day === 4) {
    daysToAdd = 0; // Already Thursday
  } else if (day === 5) {
    // Friday -> following Thursday (+6)
    daysToAdd = 6;
  } else if (day === 6) {
    // Saturday -> following Thursday (+5)
    daysToAdd = 5;
  }
  const shifted = new Date(d.getTime());
  shifted.setDate(shifted.getDate() + daysToAdd);
  return formatDateYMD(shifted);
}

/**
 * Shifts a holiday date to Sunday
 * according to Egyptian Prime Minister decrees (قرار ترحيل الإجازات إلى يوم الأحد).
 */
export function shiftDateToSunday(dateStr: string): string {
  const d = parseDateYMD(dateStr);
  const day = d.getDay(); // 0 = Sun, 1 = Mon, 2 = Tue, 3 = Wed, 4 = Thu, 5 = Fri, 6 = Sat
  let daysToAdd = 0;
  if (day === 0) {
    daysToAdd = 0; // Already Sunday
  } else if (day === 4) {
    // Thursday -> following Sunday (+3)
    daysToAdd = 3;
  } else if (day === 5) {
    // Friday -> following Sunday (+2)
    daysToAdd = 2;
  } else if (day === 6) {
    // Saturday -> following Sunday (+1)
    daysToAdd = 1;
  } else {
    // Mon(1), Tue(2), Wed(3) -> following Sunday
    daysToAdd = 7 - day;
  }
  const shifted = new Date(d.getTime());
  shifted.setDate(shifted.getDate() + daysToAdd);
  return formatDateYMD(shifted);
}

/**
 * Shifts a holiday to a specific target date with an official decree label
 */
export function shiftHolidayToDate(item: HolidayItem, targetDate: string, customReason?: string): HolidayItem {
  const baseName = item.name.replace(/\s*\(مرحّلة.*\)/g, "").trim();
  const dayName = getArabicDayName(targetDate);
  const reasonText = customReason || `مرحّلة ليوم ${dayName} بقرار رئيس الوزراء`;
  return {
    ...item,
    date: targetDate,
    name: `${baseName} (${reasonText})`,
    originalDate: item.originalDate || item.date,
    shifted: true
  };
}

/**
 * Reverts a shifted holiday back to its original calendar date
 */
export function revertHolidayShift(item: HolidayItem): HolidayItem {
  const baseName = item.name.replace(/\s*\(مرحّلة.*\)/g, "").trim();
  return {
    ...item,
    date: item.originalDate || item.date,
    name: baseName,
    originalDate: undefined,
    shifted: false
  };
}

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
 * - Official State / National Holidays (عطلات الدولة والمرحلة بقرارات رئيس الوزراء).
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
  const effective = getEffectiveHolidays(customHolidays);

  const matchedHoliday = effective.find(h => h.date === dateStr);
  if (matchedHoliday) {
    return { isHoliday: true, reason: matchedHoliday.name || "عطلة رسمية" };
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
 * Sequential Services Delivery Date Calculation:
 * When a customer selects multiple services, the duration of the second service
 * begins AFTER the completion of the first service (تراكمي متتابع),
 * providing the real, actual final delivery date for each service and for the total order.
 */
export function recalculateCustomerServicesDeliveryDates<T extends { 
  serviceId: string; 
  deliveryDate?: string; 
  price?: number; 
  quantity?: number;
}>(
  servicesList: T[],
  startDateStr: string | Date,
  catalogServices: { id: string; name: string; deliveryDaysOffset?: number; duration?: string }[],
  customHolidays: HolidayItem[] = [],
  globalSaturdayWeekendSetting: boolean = true
): T[] {
  let currentStart = typeof startDateStr === "string" ? startDateStr : formatDateYMD(startDateStr);

  return servicesList.map((item) => {
    if (!item.serviceId) {
      return { ...item, deliveryDate: "" };
    }

    const itemRaw = item.serviceId || "";
    const itemClean = itemRaw.replace(/^[#\s]+/, "").trim();

    // Match service by ID, exact name, trimmed name, or clean name without '#' prefix
    const matched = catalogServices.find(s => 
      s.id === itemRaw || 
      s.name.trim() === itemRaw.trim() ||
      (s.name && s.name.replace(/^[#\s]+/, "").trim() === itemClean) ||
      (itemRaw && s.id === itemRaw.trim())
    );

    let offset = 0;
    if (matched && typeof matched.deliveryDaysOffset === "number") {
      offset = matched.deliveryDaysOffset;
    } else if (matched?.duration) {
      // Fallback: extract number of days from duration string e.g. "3 أيام عمل" -> 3
      const numMatch = matched.duration.match(/\d+/);
      if (numMatch) {
        offset = parseInt(numMatch[0], 10);
      } else if (matched.duration.includes("يوم واحد") || matched.duration.includes("يوم عمل")) {
        offset = 1;
      }
    }

    const serviceName = matched ? matched.name : itemRaw;
    const calc = calculateWorkingDaysDeliveryDate(
      currentStart,
      offset,
      customHolidays,
      serviceName,
      globalSaturdayWeekendSetting
    );

    // If a delivery date is computed, the next service in the sequential queue starts from this date
    if (calc.deliveryDate) {
      currentStart = calc.deliveryDate;
    }

    return {
      ...item,
      deliveryDate: calc.deliveryDate
    };
  });
}

/**
 * Helper to get the actual final delivery date for a customer's services
 */
export function getCustomerFinalDeliveryDate<T extends { deliveryDate?: string }>(servicesList: T[]): {
  deliveryDate: string;
  dayName: string;
  hasMultipleServices: boolean;
  allDates: string[];
} {
  const allDates: string[] = [];
  servicesList.forEach(s => {
    if (s.deliveryDate && s.deliveryDate.trim()) {
      allDates.push(s.deliveryDate.trim());
    }
  });

  const sorted = [...allDates].sort();
  const deliveryDate = sorted.length > 0 ? sorted[sorted.length - 1] : "";
  const dayName = deliveryDate ? getArabicDayName(deliveryDate) : "";

  return {
    deliveryDate,
    dayName,
    hasMultipleServices: servicesList.length > 1,
    allDates
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

