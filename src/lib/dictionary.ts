import { DictionaryItem } from "../types";

/**
 * Normalizes Arabic text for consistent dictionary matching (strips diacritics, unifies hamzas & taa marbuta).
 */
export function normalizeArabic(str: string): string {
  if (!str) return "";
  return str
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/[\u064B-\u065F\u0670]/g, "") // strip tashkeel / diacritics
    .trim();
}

export interface WordTokenMatch {
  word: string;
  english: string;
  found: boolean;
}

export interface NameBreakdownResult {
  tokens: WordTokenMatch[];
  allFound: boolean;
  missingWords: string[];
  assembledEnglish: string;
}

/**
 * Breaks down an Arabic name into atomic word tokens and matches each against the dictionary.
 * Does not rely on AI; strictly queries the stored dictionary.
 */
export function breakdownArabicName(
  arabicName: string,
  dictionary: DictionaryItem[] = []
): NameBreakdownResult {
  if (!arabicName || !arabicName.trim()) {
    return {
      tokens: [],
      allFound: false,
      missingWords: [],
      assembledEnglish: "",
    };
  }

  const rawWords = arabicName.trim().split(/\s+/).filter(Boolean);
  if (rawWords.length === 0) {
    return {
      tokens: [],
      allFound: false,
      missingWords: [],
      assembledEnglish: "",
    };
  }

  const tokens: WordTokenMatch[] = [];
  const missingWords: string[] = [];
  const englishParts: string[] = [];

  // Group compound prefixes like "عبد" + "الرحمن" or "عبد" + "الله" if the user has compound entries
  let i = 0;
  while (i < rawWords.length) {
    const word = rawWords[i];
    const nextWord = rawWords[i + 1];

    // Check if word + nextWord exists as a 2-word phrase in dictionary (e.g., "عبد الرحمن")
    if (nextWord) {
      const combinedArabic = `${word} ${nextWord}`;
      const normCombined = normalizeArabic(combinedArabic);
      const combinedMatch = dictionary.find(
        (d) => normalizeArabic(d.arabic) === normCombined || d.arabic.trim() === combinedArabic
      );

      if (combinedMatch) {
        const en = combinedMatch.english.trim().toUpperCase();
        tokens.push({ word: combinedArabic, english: en, found: true });
        englishParts.push(en);
        i += 2;
        continue;
      }
    }

    // Single word lookup
    const normW = normalizeArabic(word);
    const match = dictionary.find(
      (d) => normalizeArabic(d.arabic) === normW || d.arabic.trim() === word
    );

    if (match && match.english && match.english.trim()) {
      const en = match.english.trim().toUpperCase();
      tokens.push({ word, english: en, found: true });
      englishParts.push(en);
    } else {
      tokens.push({ word, english: "", found: false });
      if (!missingWords.includes(word)) {
        missingWords.push(word);
      }
    }
    i++;
  }

  const allFound = tokens.length > 0 && tokens.every((t) => t.found && t.english.length > 0);

  return {
    tokens,
    allFound,
    missingWords,
    assembledEnglish: englishParts.join(" "),
  };
}

/**
 * Splits customer Arabic and English full names into individual atomic word tokens
 * for storing in the dictionary and Google Sheets without saving whole compound sentences.
 */
export function extractAtomicWordTokens(
  arabicName: string,
  englishName: string
): Array<{ arabic: string; english: string }> {
  if (!arabicName || !englishName) return [];
  const cleanAr = arabicName.trim();
  const cleanEn = englishName.trim().toUpperCase();

  if (cleanEn === "نفس ترجمة الجواز السابق" || cleanEn.includes("N/A") || cleanEn.length < 2) {
    return [];
  }

  const arWords = cleanAr.split(/\s+/).filter(Boolean);
  const enWords = cleanEn.split(/\s+/).filter(Boolean);

  const results: Array<{ arabic: string; english: string }> = [];

  // When word counts match 1-to-1
  if (arWords.length === enWords.length && arWords.length > 0) {
    for (let i = 0; i < arWords.length; i++) {
      const arW = arWords[i].trim();
      const enW = enWords[i].replace(/[^A-Z]/g, "").trim();
      if (arW.length >= 2 && enW.length >= 2) {
        results.push({ arabic: arW, english: enW });
      }
    }
  }

  return results;
}
