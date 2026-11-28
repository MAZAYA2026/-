import { DictionaryItem, PotentialCustomer } from "../types";
import { breakdownArabicName } from "./dictionary";

export interface ParsedFastCustomer {
  tempId: string;
  arabicName: string;
  englishName: string;
  nationalId: string;
  birthDate: string;
  profession: string;
  phone: string;
  applicantCapacity: string;
  documentType: "بطاقة_رقم_قومي" | "شهادة_ميلاد" | "يدوي";
  notes: string;
  cardFrontImage?: string;
  cardBackImage?: string;
}

export const QUICK_PROFESSIONS: string[] = [
  "طالب",
  "طفل",
  "ربة منزل",
  "موظف",
  "بدون عمل",
  "عامل",
  "محاسب",
  "مهندس",
  "بالمعاش",
];

const KNOWN_PROFESSION_WORDS = new Set([
  "طالب",
  "طالبة",
  "طفل",
  "طفلة",
  "رضيع",
  "ربة منزل",
  "رب منزل",
  "موظف",
  "موظفة",
  "بدون عمل",
  "لا يعمل",
  "عامل",
  "عاملة",
  "محاسب",
  "محاسبة",
  "مهندس",
  "مهندسة",
  "طبيب",
  "طبيبة",
  "دكتور",
  "دكتورة",
  "صيدلي",
  "صيدلانية",
  "معلم",
  "معلمة",
  "مدرس",
  "مدرسة",
  "بالمعاش",
  "معاش",
  "متقاعد",
  "متقاعدة",
  "تاجر",
  "سائق",
  "نجار",
  "حداد",
  "سباك",
  "كهربائي",
  "حلاق",
  "فلاح",
  "مزارع",
  "محامي",
  "محامية",
  "ضابط",
  "صاحب عمل",
  "أعمال حرة",
  "اعمال حرة",
  "حرفي",
  "فني",
  "ممرض",
  "ممرضة",
]);

/**
 * Converts Arabic-Indic (٠-٩) and Persian (۰-۹) digits to Western ASCII digits (0-9).
 */
export function normalizeDigits(input: string): string {
  if (!input) return "";
  return input
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

/**
 * Extracts YYYY-MM-DD birth date deterministically from a 14-digit Egyptian National ID.
 * Digit 1: Century (2 = 1900s, 3 = 2000s)
 * Digits 2-3: Year, 4-5: Month, 6-7: Day
 */
export function extractBirthDateFromNationalId(rawNid: string): string {
  const nid = normalizeDigits(rawNid).replace(/\D/g, "");
  if (!/^[23]\d{13}$/.test(nid)) return "";

  const centuryCode = nid[0];
  const yearPrefix = centuryCode === "2" ? "19" : "20";
  const year = Number(`${yearPrefix}${nid.slice(1, 3)}`);
  const month = Number(nid.slice(3, 5));
  const day = Number(nid.slice(5, 7));

  if (month < 1 || month > 12 || day < 1 || day > 31) return "";

  const checkDate = new Date(year, month - 1, day);
  if (
    checkDate.getFullYear() !== year ||
    checkDate.getMonth() !== month - 1 ||
    checkDate.getDate() !== day
  ) {
    return "";
  }

  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * Infers document type and default profession (طفل/طالب) from birth date deterministically.
 */
export function inferDocAndProfessionFromBirthDate(birthDate: string): {
  documentType: "بطاقة_رقم_قومي" | "شهادة_ميلاد";
  suggestedProfession: string;
  ageYears: number | null;
} {
  if (!birthDate || !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) {
    return {
      documentType: "بطاقة_رقم_قومي",
      suggestedProfession: "",
      ageYears: null,
    };
  }

  const [y, m, d] = birthDate.split("-").map(Number);
  const today = new Date();
  let age = today.getFullYear() - y;
  const monthDiff = today.getMonth() + 1 - m;
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < d)) {
    age--;
  }

  if (age < 6) {
    return {
      documentType: "شهادة_ميلاد",
      suggestedProfession: "طفل",
      ageYears: age,
    };
  }
  if (age < 15) {
    return {
      documentType: "شهادة_ميلاد",
      suggestedProfession: "طالب",
      ageYears: age,
    };
  }

  return {
    documentType: "بطاقة_رقم_قومي",
    suggestedProfession: "",
    ageYears: age,
  };
}

/**
 * Instant dictionary-based Arabic-to-English name assembly (0ms, zero AI).
 */
export function translateNameWithDictionary(
  arabicName: string,
  dictionary: DictionaryItem[] = []
): string {
  if (!arabicName || !arabicName.trim()) return "";
  try {
    const res = breakdownArabicName(arabicName, dictionary);
    return (res.assembledEnglish || "").trim().toUpperCase();
  } catch {
    return "";
  }
}

export function createEmptyFastCustomer(seedIndex = 0): ParsedFastCustomer {
  return {
    tempId: `fast-${Date.now()}-${seedIndex}-${Math.random().toString(36).slice(2, 7)}`,
    arabicName: "",
    englishName: "",
    nationalId: "",
    birthDate: "",
    profession: "",
    phone: "",
    applicantCapacity: "",
    documentType: "بطاقة_رقم_قومي",
    notes: "",
  };
}

function normalizeDateToIso(raw: string): string {
  const clean = normalizeDigits(raw).trim();
  const isoMatch = clean.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (isoMatch) {
    const [, y, m, d] = isoMatch;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  const dmyMatch = clean.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (dmyMatch) {
    const [, d, m, y] = dmyMatch;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return "";
}

function isKnownProfessionPhrase(text: string): boolean {
  const cleaned = text.trim().replace(/[^\u0600-\u06FF\s]/g, "").trim();
  if (!cleaned) return false;
  if (KNOWN_PROFESSION_WORDS.has(cleaned)) return true;
  const words = cleaned.split(/\s+/);
  return words.length === 1 && KNOWN_PROFESSION_WORDS.has(words[0]);
}

function parseSingleBlock(
  blockLines: string[],
  dictionary: DictionaryItem[],
  index: number
): ParsedFastCustomer | null {
  const joined = normalizeDigits(blockLines.join("\n")).trim();
  if (!joined) return null;

  let arabicName = "";
  let englishName = "";
  let nationalId = "";
  let birthDate = "";
  let profession = "";
  let phone = "";
  let applicantCapacity = "";
  let documentType: "بطاقة_رقم_قومي" | "شهادة_ميلاد" | "يدوي" | "" = "";
  let notes = "";

  // Extract 14-digit NID and 11-digit Egyptian phone across the block
  const nidMatch = joined.match(/(?<!\d)([23]\d{13})(?!\d)/);
  if (nidMatch) {
    nationalId = nidMatch[1];
  }

  const phoneMatch = joined.replace(/\+20(?=\d{10})/g, "0").match(/(?<!\d)(01[0125]\d{8})(?!\d)/);
  if (phoneMatch) {
    phone = phoneMatch[1];
  }

  const dateMatch = joined.match(/(?<!\d)(\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[-/]\d{1,2}[-/]\d{4})(?!\d)/);
  if (dateMatch) {
    birthDate = normalizeDateToIso(dateMatch[1]);
  }

  const leftoverArabicParts: string[] = [];

  for (const rawLine of blockLines) {
    const lineNorm = normalizeDigits(rawLine)
      .replace(/^[\d٠-٩]+[\.\-\)\:]\s*/, "")
      .trim();
    if (!lineNorm) continue;

    // Split delimited line (e.g., "أحمد محمد علي | 29508121601234 | محاسب")
    const parts = lineNorm.split(/\s*[|\t;،,]\s*|\s+-\s+/).map((p) => p.trim()).filter(Boolean);

    for (const part of parts) {
      // Check labeled format: "الاسم: ..."
      const labelMatch = part.match(/^([^:：]{2,25})\s*[:：]\s*(.+)$/);
      if (labelMatch) {
        const label = labelMatch[1].trim();
        const val = labelMatch[2].trim();

        if (/الاسم\s*(?:الإنجليزي|الانجليزي|بالانجليزي|بالإنجليزية|en)/i.test(label)) {
          englishName = val.toUpperCase();
          continue;
        }
        if (/اسم|الاسم/.test(label)) {
          arabicName = val.replace(/(?<!\d)[23]\d{13}(?!\d)/g, "").trim();
          continue;
        }
        if (/قومي|الرقم|بطاقة/.test(label)) {
          const digits = val.replace(/\D/g, "");
          if (/^[23]\d{13}$/.test(digits)) nationalId = digits;
          continue;
        }
        if (/مهن|وظيف|عمل/.test(label)) {
          profession = val;
          continue;
        }
        if (/هاتف|موبايل|تليفون|جوال|اتصال|واتس/.test(label)) {
          const pDigits = val.replace(/\+20(?=\d{10})/g, "0").replace(/\D/g, "");
          if (/^01[0125]\d{8}$/.test(pDigits)) phone = pDigits;
          else if (pDigits.length >= 8) phone = pDigits.slice(0, 11);
          continue;
        }
        if (/ميلاد/.test(label)) {
          const parsedD = normalizeDateToIso(val);
          if (parsedD) birthDate = parsedD;
          continue;
        }
        if (/صفة|مقدم/.test(label)) {
          applicantCapacity = val;
          continue;
        }
        if (/نوع|مستند/.test(label)) {
          if (/ميلاد/.test(val)) documentType = "شهادة_ميلاد";
          else if (/بطاقة|قومي/.test(val)) documentType = "بطاقة_رقم_قومي";
          continue;
        }
        if (/ملاحظ/.test(label)) {
          notes = val;
          continue;
        }
      }

      // Unlabeled part: strip extracted NID / phone / date / pure symbols
      let stripped = part
        .replace(/(?<!\d)[23]\d{13}(?!\d)/g, " ")
        .replace(/\+20(?=\d{10})/g, "0")
        .replace(/(?<!\d)01[0125]\d{8}(?!\d)/g, " ")
        .replace(/(?<!\d)(\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[-/]\d{1,2}[-/]\d{4})(?!\d)/g, " ")
        .replace(/[^\u0600-\u06FFa-zA-Z\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();

      if (!stripped) continue;

      // Pure English line
      if (/^[a-zA-Z\s]+$/.test(stripped) && stripped.length >= 3) {
        if (!englishName) englishName = stripped.toUpperCase();
        continue;
      }

      if (/[\u0600-\u06FF]/.test(stripped)) {
        if (stripped === "شهادة ميلاد" || stripped === "شهاده ميلاد") {
          documentType = "شهادة_ميلاد";
          continue;
        }
        if (stripped === "بطاقة شخصية" || stripped === "بطاقة رقم قومي") {
          documentType = "بطاقة_رقم_قومي";
          continue;
        }
        leftoverArabicParts.push(stripped);
      }
    }
  }

  // Resolve Arabic Name & Profession from unlabeled fragments
  for (const frag of leftoverArabicParts) {
    const wordCount = frag.split(/\s+/).filter(Boolean).length;
    if (!profession && isKnownProfessionPhrase(frag)) {
      profession = frag;
    } else if (!arabicName && wordCount >= 2) {
      arabicName = frag;
    } else if (!arabicName && leftoverArabicParts.length === 1) {
      arabicName = frag;
    } else if (!profession) {
      profession = frag;
    } else if (!notes) {
      notes = frag;
    }
  }

  if (!arabicName && !nationalId) return null;

  // Deterministic birthDate from NID
  if (!birthDate && nationalId) {
    birthDate = extractBirthDateFromNationalId(nationalId);
  }

  // Infer doc type & age profession
  const inferred = inferDocAndProfessionFromBirthDate(birthDate);
  const finalDocType: "بطاقة_رقم_قومي" | "شهادة_ميلاد" | "يدوي" =
    documentType || (nationalId ? inferred.documentType : "يدوي");

  if (!profession && inferred.suggestedProfession) {
    profession = inferred.suggestedProfession;
  }

  if (!englishName && arabicName) {
    englishName = translateNameWithDictionary(arabicName, dictionary);
  }

  return {
    tempId: `fast-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 6)}`,
    arabicName: arabicName.trim(),
    englishName: englishName.trim().toUpperCase(),
    nationalId,
    birthDate,
    profession: profession.trim(),
    phone,
    applicantCapacity,
    documentType: finalDocType,
    notes,
  };
}

/**
 * Parses raw WhatsApp messages, pasted lists, or delimited rows into structured customer records in 0ms (no AI).
 */
export function parsePastedCustomerText(
  rawText: string,
  dictionary: DictionaryItem[] = []
): ParsedFastCustomer[] {
  if (!rawText || !rawText.trim()) return [];

  const normalized = normalizeDigits(rawText).replace(/\r\n/g, "\n").trim();

  // First split by blank lines or horizontal separators (--- / === / ***)
  const rawChunks = normalized
    .split(/\n\s*\n+|\n\s*[-=_*]{3,}\s*\n/)
    .map((c) => c.trim())
    .filter(Boolean);

  const blocks: string[][] = [];

  for (const chunk of rawChunks) {
    const lines = chunk
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);

    if (lines.length === 0) continue;

    // Helpers to identify per-person boundaries inside a chunk without blank lines
    const isNumberedLine = (l: string) => /^[\d]+[\.\-\)\:]\s+[\u0600-\u06FFa-zA-Z]/.test(l);
    const isNameLabelLine = (l: string) =>
      /^(?:[\d]+[\.\-\)\:]\s*)?(?:الاسم|اسم|العميل|المواطن|الفرد|الشخص)\s*[:：]/.test(l);
    const isMetaFieldOnlyLine = (l: string) =>
      /^(?:الرقم\s*القومي|الرقم|رقم\s*البطاقة|البطاقة|المهنة|الوظيفة|العمل|الهاتف|الموبايل|التليفون|الجوال|تاريخ\s*الميلاد|الميلاد|الصفة|صفة\s*مقدم\s*الطلب|نوع\s*المستند|المستند|ملاحظات)\s*[:：]/.test(l) ||
      /^\+?\d[\d\s\-/]+$/.test(l) ||
      isKnownProfessionPhrase(l);

    const nidCountInChunk = (chunk.match(/(?<!\d)[23]\d{13}(?!\d)/g) || []).length;
    const linesWithNid = lines.filter((l) => /(?<!\d)[23]\d{13}(?!\d)/.test(l));
    const numberedStartsCount = lines.filter(isNumberedLine).length;
    const nameLabelCount = lines.filter(isNameLabelLine).length;

    // Case 1: Every line contains a 14-digit NID -> one customer per line
    if (lines.length > 1 && linesWithNid.length >= 2 && linesWithNid.length === lines.length) {
      for (const l of lines) {
        blocks.push([l]);
      }
      continue;
    }

    // Case 2: Numbered list of multiple people (e.g., "1- ... 2- ... 6- ...") with or without sub-lines
    if (numberedStartsCount >= 2) {
      let currentBlock: string[] = [];
      for (const line of lines) {
        if (isNumberedLine(line) && currentBlock.length > 0) {
          blocks.push(currentBlock);
          currentBlock = [line];
        } else {
          currentBlock.push(line);
        }
      }
      if (currentBlock.length > 0) blocks.push(currentBlock);
      continue;
    }

    // Case 3: Repeated "الاسم: ..." labels without blank lines between people
    if (nameLabelCount >= 2) {
      let currentBlock: string[] = [];
      for (const line of lines) {
        if (isNameLabelLine(line) && currentBlock.length > 0) {
          blocks.push(currentBlock);
          currentBlock = [line];
        } else {
          currentBlock.push(line);
        }
      }
      if (currentBlock.length > 0) blocks.push(currentBlock);
      continue;
    }

    // Case 4: Multiple NIDs in the same chunk without blank lines
    if (nidCountInChunk > 1) {
      let currentBlock: string[] = [];
      let currentHasNid = false;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const nextLine = lines[i + 1] || "";
        const lineHasNid = /(?<!\d)[23]\d{13}(?!\d)/.test(line);
        const nextHasNid = /(?<!\d)[23]\d{13}(?!\d)/.test(nextLine);
        const isMetaLabel = isMetaFieldOnlyLine(line);
        const isNumberedStart = isNumberedLine(line);
        const isNameLabel = isNameLabelLine(line);

        if (currentHasNid) {
          if (
            lineHasNid ||
            isNumberedStart ||
            isNameLabel ||
            (nextHasNid && !isMetaLabel)
          ) {
            blocks.push(currentBlock);
            currentBlock = [line];
            currentHasNid = lineHasNid;
            continue;
          }
        }

        currentBlock.push(line);
        if (lineHasNid) currentHasNid = true;
      }

      if (currentBlock.length > 0) {
        blocks.push(currentBlock);
      }
      continue;
    }

    // Case 5: Multiple standalone person lines without NIDs yet (e.g., 6 family names one per line)
    if (lines.length >= 2) {
      const hasAnyMetaOnlyLine = lines.some(isMetaFieldOnlyLine);
      const personLikeLines = lines.filter((l) => {
        const arabicWords = l.replace(/[^\u0600-\u06FF\s]/g, " ").trim().split(/\s+/).filter(Boolean);
        return arabicWords.length >= 2 || /[|\t;،,]|\s-\s/.test(l);
      });
      if (!hasAnyMetaOnlyLine && personLikeLines.length === lines.length) {
        for (const l of lines) {
          blocks.push([l]);
        }
        continue;
      }
    }

    blocks.push(lines);
  }

  const parsed: ParsedFastCustomer[] = [];
  blocks.forEach((b, idx) => {
    const item = parseSingleBlock(b, dictionary, idx);
    if (item) parsed.push(item);
  });

  return parsed;
}

/**
 * Parses CSV/TSV text exported from Excel or Google Sheets into structured customer records in 0ms.
 */
function parseCsvRow(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === delimiter) {
        result.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
  }
  result.push(current.trim());
  return result;
}

export function parseCsvCustomers(
  rawCsv: string,
  dictionary: DictionaryItem[] = []
): ParsedFastCustomer[] {
  if (!rawCsv || !rawCsv.trim()) return [];

  const cleanCsv = rawCsv.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").trim();
  const lines = cleanCsv.split("\n").filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];

  const firstLine = lines[0];
  const delimiter =
    firstLine.includes("\t")
      ? "\t"
      : firstLine.includes(";") && !firstLine.includes(",")
        ? ";"
        : ",";

  const firstCells = parseCsvRow(firstLine, delimiter);
  const looksLikeHeader = firstCells.some((c) =>
    /الاسم|arabic|الرقم\s*القومي|national|المهنة|profession|الهاتف|phone|الميلاد|birth/i.test(c)
  );

  // Header mapping
  let colMap = {
    arabicName: 0,
    englishName: -1,
    nationalId: 1,
    birthDate: -1,
    profession: 2,
    phone: 3,
    applicantCapacity: -1,
    documentType: -1,
    notes: -1,
  };

  let startIdx = 0;

  if (looksLikeHeader) {
    startIdx = 1;
    colMap = {
      arabicName: -1,
      englishName: -1,
      nationalId: -1,
      birthDate: -1,
      profession: -1,
      phone: -1,
      applicantCapacity: -1,
      documentType: -1,
      notes: -1,
    };

    firstCells.forEach((h, i) => {
      const hl = h.trim().toLowerCase();
      if (/إنجليزي|انجليزي|english/.test(hl)) colMap.englishName = i;
      else if (/الاسم|عربي|arabic|name/.test(hl) && colMap.arabicName === -1) colMap.arabicName = i;
      else if (/قومي|national|nid|id/.test(hl) && !/invoice|فاتورة/.test(hl)) colMap.nationalId = i;
      else if (/ميلاد|birth/.test(hl)) colMap.birthDate = i;
      else if (/مهن|وظيف|profession|job/.test(hl)) colMap.profession = i;
      else if (/هاتف|موبايل|تليفون|phone/.test(hl)) colMap.phone = i;
      else if (/صفة|capacity/.test(hl)) colMap.applicantCapacity = i;
      else if (/مستند|document/.test(hl)) colMap.documentType = i;
      else if (/ملاحظ|note/.test(hl)) colMap.notes = i;
    });
  }

  const parsed: ParsedFastCustomer[] = [];

  for (let r = startIdx; r < lines.length; r++) {
    const cells = parseCsvRow(lines[r], delimiter);
    if (cells.every((c) => !c)) continue;

    const get = (idx: number) => (idx >= 0 && idx < cells.length ? cells[idx].trim() : "");

    const arabicName = get(colMap.arabicName);
    let englishName = get(colMap.englishName).toUpperCase();
    const rawNid = normalizeDigits(get(colMap.nationalId)).replace(/^'/, "").replace(/\D/g, "");
    const nationalId = rawNid.slice(0, 14);
    let birthDate = normalizeDateToIso(get(colMap.birthDate));
    let profession = get(colMap.profession);
    const phone = normalizeDigits(get(colMap.phone)).replace(/\D/g, "").slice(0, 11);
    const applicantCapacity = get(colMap.applicantCapacity);
    const rawDocType = get(colMap.documentType);
    const notes = get(colMap.notes);

    if (!arabicName && !nationalId) continue;

    if (!birthDate && nationalId) {
      birthDate = extractBirthDateFromNationalId(nationalId);
    }

    const inferred = inferDocAndProfessionFromBirthDate(birthDate);
    let documentType: "بطاقة_رقم_قومي" | "شهادة_ميلاد" | "يدوي" = inferred.documentType;
    if (/ميلاد/.test(rawDocType)) documentType = "شهادة_ميلاد";
    else if (/بطاقة|قومي/.test(rawDocType)) documentType = "بطاقة_رقم_قومي";
    else if (/يدوي/.test(rawDocType)) documentType = "يدوي";

    if (!profession && inferred.suggestedProfession) {
      profession = inferred.suggestedProfession;
    }

    if (!englishName && arabicName) {
      englishName = translateNameWithDictionary(arabicName, dictionary);
    }

    parsed.push({
      tempId: `csv-${Date.now()}-${r}`,
      arabicName,
      englishName,
      nationalId,
      birthDate,
      profession,
      phone,
      applicantCapacity,
      documentType,
      notes,
    });
  }

  return parsed;
}

export function toPotentialCustomerPayload(item: ParsedFastCustomer): Partial<PotentialCustomer> {
  const todayStr = new Date().toISOString().split("T")[0];
  return {
    arabicName: item.arabicName.trim(),
    englishName: item.englishName.trim() ? item.englishName.trim().toUpperCase() : undefined,
    nationalId: normalizeDigits(item.nationalId).replace(/\D/g, "").trim(),
    birthDate: item.birthDate.trim() || extractBirthDateFromNationalId(item.nationalId) || undefined,
    profession: item.profession.trim(),
    phone: normalizeDigits(item.phone).replace(/\D/g, "").trim() || undefined,
    applicantCapacity: item.applicantCapacity.trim() || undefined,
    documentType: item.documentType,
    notes: item.notes.trim() || undefined,
    cardFrontImage: item.cardFrontImage || undefined,
    cardBackImage: item.cardBackImage || undefined,
    status: "جديد",
    createdAt: todayStr,
  };
}

export function downloadFastImportCsvTemplate() {
  const headers = [
    "الاسم بالكامل (عربي)",
    "الاسم بالإنجليزي",
    "الرقم القومي (14 رقم)",
    "تاريخ الميلاد",
    "المهنة",
    "رقم الهاتف",
    "صفة مقدم الطلب",
    "ملاحظات",
  ];

  const sampleRows = [
    [
      "أحمد محمد علي حسن",
      "",
      "'29508121601234",
      "",
      "محاسب",
      "'01012345678",
      "بنفسه",
      "مثال لبطاقة رقم قومي",
    ],
    [
      "يوسف أحمد محمد علي",
      "",
      "'31504101605678",
      "",
      "طالب",
      "'01012345678",
      "الأب",
      "مثال لشهادة ميلاد",
    ],
  ];

  const csvContent =
    "\uFEFF" +
    [headers.join(","), ...sampleRows.map((row) => row.map((v) => `"${v}"`).join(","))].join("\r\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", "نموذج_استيراد_العملاء_المحتملين.csv");
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
