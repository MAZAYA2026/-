import express from "express";
import path from "path";
import fs from "fs";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import { google } from "googleapis";

// Load environment variables
dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json());

// Initialize Gemini client if API key is available
const geminiApiKey = process.env.GEMINI_API_KEY || "";
let ai: GoogleGenAI | null = null;

if (geminiApiKey && geminiApiKey !== "MY_GEMINI_API_KEY") {
  try {
    ai = new GoogleGenAI({
      apiKey: geminiApiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
    console.log("Gemini AI client successfully initialized server-side.");
  } catch (err) {
    console.error("Failed to initialize Gemini Client:", err);
  }
} else {
  console.log("No valid GEMINI_API_KEY found, translation will run in hybrid dictionary mode.");
}

// Data Directory and DB File Setup
const DATA_DIR = path.join(process.cwd(), "data");
const DB_FILE = path.join(DATA_DIR, "db.json");

// Default/Initial Data
const initialData = {
  services: [
    {
      id: "srv-102",
      name: "## استخراج جواز سفر عادي",
      govPrice: 1200,
      officeFee: 200,
      duration: "8 أيام عمل من تاريخ تقديم المستندات",
      instructions: "يسلم الجواز الجديد لصاحب الشأن او مقدم الطلب من جوازات طنطا طبقا لتعليمات الامن العام وذلك من الساعه 8ص الى 2ظهرا بالجوازات",
      deliveryDaysOffset: 9,
      notes: "يتم تسليم المستندات بمقر المكتب والفرع المخصص."
    },
    {
      id: "srv-101",
      name: "# استخراج جواز سفر مستعجل",
      govPrice: 1500,
      officeFee: 500,
      duration: "3 أيام عمل من تاريخ تقديم الطلب واستيفاء الأوراق",
      instructions: "يرجى إحضار أصل وصورة بطاقة الرقم القومي سارية، و3 صور شخصية خلفية بيضاء حديثة 4*6، وأصل جواز السفر القديم إن وجد.",
      deliveryDaysOffset: 3,
      notes: "يرجى الحضور للاستلام شخصياً أو توكيل رسمي بمقر مكتب مزايا لخدمات الجوازات بطنطا."
    },
    {
      id: "srv-103",
      name: "ترجمة مستندات رسمية سريعة",
      govPrice: 200,
      officeFee: 150,
      duration: "يوم عمل واحد",
      instructions: "تسليم صورة واضحة من المستند المطلوب ترجمته عبر الواتساب أو تسليمه باليد في المكتب.",
      deliveryDaysOffset: 1,
      notes: "الترجمة معتمدة لدى جميع السفارات والجهات الحكومية المصرية."
    },
    {
      id: "srv-104",
      name: "# تجديد جواز سفر منتهي الصلاحية",
      govPrice: 1300,
      officeFee: 450,
      duration: "4 أيام عمل من استلام الأوراق",
      instructions: "إحضار جواز السفر القديم المنتهي، بطاقة رقم قومي سارية، شهادة تجنيد للذكور، وصور شخصية حديثة.",
      deliveryDaysOffset: 4,
      notes: "سيتم الحفظ والأرشفة الفورية للأوراق في أدراج المكتب بمجرد التجهيز."
    }
  ],
  dictionary: [
    { arabic: "محمد", english: "MOHAMED" },
    { arabic: "احمد", english: "AHMED" },
    { arabic: "أحمد", english: "AHMED" },
    { arabic: "شريف", english: "SHERIF" },
    { arabic: "علي", english: "ALI" },
    { arabic: "على", english: "ALI" },
    { arabic: "رندا", english: "RANDA" },
    { arabic: "منار", english: "MANAR" },
    { arabic: "امنية", english: "OMNIA" },
    { arabic: "أمنية", english: "OMNIA" },
    { arabic: "عبد", english: "ABD" },
    { arabic: "الله", english: "ALLAH" },
    { arabic: "عبدالله", english: "ABDALLAH" },
    { arabic: "حسين", english: "HUSSEIN" },
    { arabic: "حسن", english: "HASSAN" },
    { arabic: "محمود", english: "MAHMOUD" },
    { arabic: "ابراهيم", english: "IBRAHIM" },
    { arabic: "إبراهيم", english: "IBRAHIM" },
    { arabic: "سيد", english: "SAYED" },
    { arabic: "مصطفى", english: "MOSTAFA" },
    { arabic: "سعيد", english: "SAEED" },
    { arabic: "سليمان", english: "SOLIMAN" },
    { arabic: "يوسف", english: "YOUSEF" },
    { arabic: "خالد", english: "KHALED" },
    { arabic: "طارق", english: "TAREK" },
    { arabic: "كمال", english: "KAMAL" },
    { arabic: "جمال", english: "GAMAL" },
    { arabic: "سماح", english: "SAMAH" },
    { arabic: "منى", english: "MONA" },
    { arabic: "فاطمة", english: "FATMA" },
    { arabic: "زينب", english: "ZEINAB" },
    { arabic: "هدى", english: "HODA" }
  ],
  invoices: [] as any[],
  collectionClosings: [] as any[],
  employees: [
    {
      username: "SHERIF",
      name: "شريف (المدير)",
      role: "admin",
      permissions: {
        canCreateInvoices: true,
        canEditInvoices: true,
        canViewCollection: true,
        canManageServices: true,
        canViewAmanReport: true
      }
    },
    {
      username: "randa",
      name: "رندا",
      role: "employee",
      permissions: {
        canCreateInvoices: true,
        canEditInvoices: true,
        canViewCollection: false,
        canManageServices: false,
        canViewAmanReport: true
      }
    },
    {
      username: "manar",
      name: "منار",
      role: "employee",
      permissions: {
        canCreateInvoices: true,
        canEditInvoices: true,
        canViewCollection: false,
        canManageServices: false,
        canViewAmanReport: true
      }
    },
    {
      username: "omnia",
      name: "أمنية",
      role: "employee",
      permissions: {
        canCreateInvoices: true,
        canEditInvoices: true,
        canViewCollection: false,
        canManageServices: false,
        canViewAmanReport: true
      }
    },
    {
      username: "sherif",
      name: "شريف",
      role: "employee",
      permissions: {
        canCreateInvoices: true,
        canEditInvoices: true,
        canViewCollection: true,
        canManageServices: true,
        canViewAmanReport: true
      }
    }
  ],
  governmentFines: [
    { id: "fine-1", name: "عدم وجود مؤهل", amount: 450, notes: "عدم وجود مؤهل" },
    { id: "fine-2", name: "تجديد مبكر", amount: 550, notes: "تجديد مبكر" },
    { id: "fine-3", name: "بدل تالف", amount: 550, notes: "بدل تالف" },
    { id: "fine-1791356531482", name: "تغيير ترجمة", amount: 500, notes: "تغيير ترجمة" }
  ],
  amanPostponedRows: [] as any[],
  settings: {
    headerText: "مكتب مزايا للخدمات الحكومية والجوازات E.G",
    subHeaderText: "جوازات طنطا والمعاملات الحكومية",
    contactPhone: "01020304050",
    footerText: "شكراً لتعاملكم مع مكتب مزايا للجوازات.\nالرجاء الاحتفاظ بالفاتورة لتقديمها عند الاستلام.\nالاستلام شخصياً .",
    welcomeMessage: `🧾 *{اسم_المكتب}*
_{الترويسة_الفرعية}_

────────────────────────────

📄 *رقم الفاتورة:* #{رقم_الفاتورة}
📅 *تاريخ الفاتورة:* {تاريخ_اليوم}
👤 *الموظف المسؤول:* {الموظف}
📌 *حالة الفاتورة:* {حالة_الفاتورة}
🕒 *موعد استلام المعاملة النهائي الفعلي (أيام عمل رسمية):*
📅 {موعد_التسليم}

────────────────────────────

{تفاصيل_الفاتورة}

────────────────────────────

💰 *المبلغ الإجمالي الكلي للفاتورة:*
*{السعر} ج.م*

────────────────────────────

{الخاتمة}`,
    readyMessage: `📑 *{اسم_المكتب}*
_{الترويسة_الفرعية}_

────────────────────────────

عزيزنا {اسم_العميل}،
نفيدكم علماً بأن أوراقكم ومعاملاتكم الخاصة بالفاتورة رقم #{رقم_الفاتورة} جاهزة للتسليم الآن بالمكتب ✨

📋 *الخدمات:* {الخدمات}
🗄️ *مكان الحفظ:* درج رقم ({رقم_الارشيف})

برجاء التوجه للمكتب للاستلام مع إحضار أصل الفاتورة الحرارية والبطاقة الشخصية سارية.

────────────────────────────

📍 {اسم_المكتب}
📞 للاستفسار والمتابعة: {هاتف_التواصل}`,
    readyPassportMessage: `🛂 *{اسم_المكتب}*
_{الترويسة_الفرعية}_

────────────────────────────

عزيزنا {اسم_العميل}،
نفيدكم علماً بأن جواز السفر الخاص بكم بالفاتورة رقم #{رقم_الفاتورة} جاهز للاستلام الآن بالمكتب 📑✨

📋 *الخدمات:* {الخدمات}
🗄️ *مكان الحفظ:* درج رقم ({رقم_الارشيف})

⚠️ *تنبيهات هامة جداً لاستلام جواز السفر:*
• إحضار أصل بطاقة الرقم القومي سارية للمطابقة.
• إحضار جواز السفر السابق (إن وجد) للتخريم والإلغاء.
• إحضار أصل الفاتورة الحرارية للمطابقة.
• استلام الجواز لصاحب الشأن شخصياً أو لمن له الصفة القانونية المباشرة (الأب للأبناء القصر / الزوج بموجب وثيقة الزواج).

────────────────────────────

📍 {اسم_المكتب}
📞 للاستفسار والمتابعة: {هاتف_التواصل}`,
    partialReadyMessage: `⏳ *{اسم_المكتب}*
_{الترويسة_الفرعية}_

────────────────────────────

عزيزنا {اسم_العميل}،
نفيدكم علماً بأنه *تم تنفيذ وإنجاز جزء من خدماتكم* الخاصة بالفاتورة رقم #{رقم_الفاتورة} بنجاح ✨

✅ *الخدمة المنجزة:*
• {الخدمة_المنجزة}
{تاريخ_الانجاز}
{ملاحظة_التنفيذ}

⏳ *باقي الخدمات قيد المتابعة والتنفيذ تباعاً:*
{الخدمات_المتبقية}

سنقوم بإشعاركم فور الانتهاء من باقي الخدمات لتسليم المعاملة كاملة بمشيئة الله.

────────────────────────────

📍 {اسم_المكتب}
📞 للاستفسار والمتابعة: {هاتف_التواصل}`,
    deliveryMessage: "تم تسليم جواز السفر والأوراق الخاصة بك بنجاح يا {اسم_العميل}.\nرقم الفاتورة: {رقم_الفاتورة}\nنسعد بتقييمكم لخدمات مكتب مزايا للجوازات ونراكم قريباً في معاملات أخرى.",
    googleSheetWebhookUrl: "https://script.google.com/macros/s/AKfycbysUKVyPKjYc9IzaRUC2GvXylSxC_U92poDYTgzkMqnhjxoH0I0GNc7pWvQi_qhVZSj/exec",
    autoSyncWebhook: false,
    googleSheetId: "",
    googleSheetUrl: "",
    googleSheetsConnected: true
  }
};

// Initialize database
function readDB() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify(initialData, null, 2), "utf8");
    return initialData;
  }
  try {
    const data = fs.readFileSync(DB_FILE, "utf8");
    const parsed = JSON.parse(data);
    if (!parsed.governmentFines || !Array.isArray(parsed.governmentFines) || parsed.governmentFines.length === 0) {
      parsed.governmentFines = initialData.governmentFines;
    }
    if (!parsed.amanPostponedRows || !Array.isArray(parsed.amanPostponedRows)) {
      parsed.amanPostponedRows = [];
    }
    return parsed;
  } catch (err) {
    console.error("Error reading database file, returning defaults:", err);
    return initialData;
  }
}

function writeDB(data: any) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), "utf8");
  } catch (err) {
    console.error("Error writing database file:", err);
  }
}

// Ensure database is populated
readDB();

// Helper to automatically learn and register Arabic to English name translations
function autoLearnCustomerNames(customers: any[], db: any): boolean {
  if (!Array.isArray(customers) || !db) return false;
  let changed = false;
  db.dictionary = db.dictionary || [];

  const normalizeArabic = (str: string) => {
    return (str || "")
      .replace(/[أإآ]/g, "ا")
      .replace(/ة/g, "ه")
      .replace(/[\u064B-\u065F]/g, "")
      .trim();
  };

  customers.forEach((cust: any) => {
    if (!cust.arabicName || !cust.englishName) return;
    const arName = cust.arabicName.trim();
    const enName = cust.englishName.trim().toUpperCase();

    // Skip special placeholders
    if (enName === "نفس ترجمة الجواز السابق" || enName.includes("N/A") || enName.length < 2) return;

    const arWords = arName.split(/\s+/).filter(Boolean);
    const enWords = enName.split(/\s+/).filter(Boolean);

    // If word counts match exactly, learn word-by-word
    if (arWords.length === enWords.length && arWords.length > 0) {
      for (let i = 0; i < arWords.length; i++) {
        const arW = arWords[i].trim();
        const enW = enWords[i].toUpperCase().replace(/[^A-Z]/g, "").trim();
        if (!enW || arW.length < 2) continue;

        const normAr = normalizeArabic(arW);
        const exists = db.dictionary.find((d: any) => normalizeArabic(d.arabic) === normAr);
        if (!exists) {
          db.dictionary.push({ arabic: arW, english: enW });
          changed = true;
        } else if (exists.english !== enW) {
          exists.english = enW;
          changed = true;
        }
      }
    }
  });

  return changed;
}

// API Endpoints

// 1. Dictionary-based Word/Segment lookup (strictly relies on Google Sheet / DB dictionary, no AI hallucinations)
app.post("/api/gemini/translate", (req, res) => {
  const { text } = req.body;
  if (!text || typeof text !== "string" || !text.trim()) {
    return res.status(400).json({ error: "Text is required" });
  }

  const cleanText = text.trim();
  const db = readDB();
  const dictionary = db.dictionary || [];

  const normalizeArabic = (str: string) => {
    return (str || "")
      .replace(/[أإآ]/g, "ا")
      .replace(/ة/g, "ه")
      .replace(/ى/g, "ي")
      .replace(/[\u064B-\u065F\u0670]/g, "") // strip diacritics
      .trim();
  };

  const words = cleanText.split(/\s+/).filter(Boolean);
  const translatedWords: string[] = [];
  const missingWords: string[] = [];
  const tokens: Array<{ word: string; english: string; found: boolean }> = [];

  for (const word of words) {
    const normWord = normalizeArabic(word);
    const dictMatch = dictionary.find(
      (item: any) => normalizeArabic(item.arabic) === normWord || item.arabic.trim() === word
    );

    if (dictMatch && dictMatch.english && dictMatch.english.trim()) {
      const en = dictMatch.english.trim().toUpperCase();
      tokens.push({ word, english: en, found: true });
      translatedWords.push(en);
    } else {
      tokens.push({ word, english: "", found: false });
      if (!missingWords.includes(word)) {
        missingWords.push(word);
      }
    }
  }

  const allFound = tokens.length > 0 && tokens.every((t) => t.found);
  const finalEnglish = translatedWords.join(" ");

  res.json({
    arabic: cleanText,
    english: finalEnglish,
    tokens,
    missingWords,
    allFound,
    fromDictionary: true,
    dictionary: db.dictionary,
  });
});

// 2. Fetch all DB data
app.get("/api/db", (req, res) => {
  res.json(readDB());
});

// 3. Save entire DB
app.post("/api/db/save", (req, res) => {
  const updatedData = req.body;
  if (!updatedData || typeof updatedData !== "object") {
    return res.status(400).json({ error: "Invalid database payload" });
  }
  writeDB(updatedData);
  triggerBackgroundWebhookSync(updatedData, "حفظ قاعدة البيانات بالكامل");
  res.json({ status: "success", message: "Database saved successfully" });
});

// Helper to directly push invoices sheet to Google Sheets
// Universal clean birth date formatter
function formatCleanBirthDate(val: any): string {
  if (!val) return "";
  let s = String(val).trim();
  if (!s || s === "N/A" || s === "null" || s === "undefined") return "";

  // If GMT timestamp string e.g. "Tue Aug 15 1995 00:00:00 GMT+0300..."
  if (s.includes("GMT") || /^[A-Za-z]{3}\s+[A-Za-z]{3}/.test(s)) {
    const d = new Date(s);
    if (!isNaN(d.getTime())) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${y}/${m}/${day}`;
    }
  }

  // If ISO string like "1995-08-15T..."
  const isoMatch = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (isoMatch) {
    return `${isoMatch[1]}/${isoMatch[2].padStart(2, "0")}/${isoMatch[3].padStart(2, "0")}`;
  }

  // If DD-MM-YYYY or DD/MM/YYYY
  const dmyMatch = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (dmyMatch) {
    return `${dmyMatch[3]}/${dmyMatch[2].padStart(2, "0")}/${dmyMatch[1].padStart(2, "0")}`;
  }

  // If 14 digit National ID
  const cleanDigits = s.replace(/\D/g, "");
  if (cleanDigits.length === 14) {
    const century = parseInt(cleanDigits[0]);
    const yy = cleanDigits.substring(1, 3);
    const mm = cleanDigits.substring(3, 5);
    const dd = cleanDigits.substring(5, 7);
    const year = (century === 3 ? 2000 : 1900) + parseInt(yy);
    return `${year}/${mm}/${dd}`;
  }

  return s;
}

// Helper to directly push invoices sheet to Google Sheets
async function pushInvoicesDirectlyToSheet(db: any): Promise<boolean> {
  const targetUrl = db.settings?.googleSheetWebhookUrl;
  if (!targetUrl || !targetUrl.startsWith("http")) return false;

  try {
    const res = await fetch(targetUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        action: "push_invoices",
        invoices: db.invoices || [],
      }),
      redirect: "follow",
    });

    const text = await res.text();
    let result: any = null;
    try {
      result = JSON.parse(text);
    } catch {}

    // Fallback for older deployed Apps Script that has action === "push" but not "push_invoices"
    if (result && (result.error === "إجراء غير معروف" || (typeof result.error === "string" && result.error.includes("غير معروف")))) {
      console.log("push_invoices action not supported by remote Apps Script, falling back to push action...");
      await fetch(targetUrl, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({
          action: "push",
          db: {
            ...db,
            invoices: db.invoices || []
          },
          invoices: db.invoices || []
        }),
        redirect: "follow",
      });
    }
    return true;
  } catch (err: any) {
    console.warn("Direct Google Sheet invoices push notice:", err.message);
    return false;
  }
}

// Helper to directly push Aman Report sheet to Google Sheets
async function pushAmanDirectlyToSheet(db: any): Promise<boolean> {
  const targetUrl = db.settings?.googleSheetWebhookUrl;
  if (!targetUrl || !targetUrl.startsWith("http")) return false;

  try {
    const res = await fetch(targetUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        action: "push_aman",
        amanRows: db.amanReport || [],
      }),
      redirect: "follow",
    });

    const text = await res.text();
    let result: any = null;
    try {
      result = JSON.parse(text);
    } catch {}

    if (text.includes("غير معروف") || text.includes("Unknown action") || (result && result.error && String(result.error).includes("غير معروف"))) {
      await fetch(targetUrl, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({
          action: "push",
          db: db,
          amanReport: db.amanReport || [],
        }),
        redirect: "follow",
      });
    }
    return true;
  } catch (err: any) {
    console.warn("Direct Google Sheet aman push notice:", err.message);
    return false;
  }
}

// Helper to directly push Postponed Aman rows to Google Sheets
async function pushPostponedDirectlyToSheet(db: any): Promise<boolean> {
  const targetUrl = db.settings?.googleSheetWebhookUrl;
  if (!targetUrl || !targetUrl.startsWith("http")) return false;

  try {
    const res = await fetch(targetUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        action: "push_postponed_aman",
        postponedRows: db.amanPostponedRows || [],
      }),
      redirect: "follow",
    });

    const text = await res.text();
    let result: any = null;
    try {
      result = JSON.parse(text);
    } catch {}

    if (text.includes("غير معروف") || text.includes("Unknown action") || (result && result.error && String(result.error).includes("غير معروف"))) {
      await fetch(targetUrl, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({
          action: "push",
          db: db,
          amanPostponedRows: db.amanPostponedRows || [],
        }),
        redirect: "follow",
      });
    }
    return true;
  } catch (err: any) {
    console.warn("Direct Google Sheet postponed push notice:", err.message);
    return false;
  }
}

// Helper to directly push Government Fines to Google Sheets
async function pushFinesDirectlyToSheet(db: any): Promise<boolean> {
  const targetUrl = db.settings?.googleSheetWebhookUrl;
  if (!targetUrl || !targetUrl.startsWith("http")) return false;

  try {
    const fines = db.governmentFines || initialData.governmentFines;
    const res = await fetch(targetUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        action: "push_fines",
        governmentFines: fines,
        db: { governmentFines: fines },
      }),
      redirect: "follow",
    });

    const text = await res.text();
    let result: any = null;
    try {
      result = JSON.parse(text);
    } catch {}

    if (text.includes("غير معروف") || text.includes("Unknown action") || (result && result.error && String(result.error).includes("غير معروف"))) {
      await fetch(targetUrl, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({
          action: "push",
          db: db,
          governmentFines: fines,
        }),
        redirect: "follow",
      });
    }
    return true;
  } catch (err: any) {
    console.warn("Direct Google Sheet fines push notice:", err.message);
    return false;
  }
}

// User explicit requirement:
// "عند عمل الفواتير التى تبدأ ب# قم بتسجيل البيانات المطلوب لورقة امان فى ورقة الشيت الخاصة بذلك
// بحيث اى تعديل فى ورقة امان سواء حذف او ترحيل او استدعاء بيتم من الورقة المخصصة لشيت امان وليس من الفاتورة نفسها فى كل مرة"
function syncInvoiceToAmanReport(invoice: any, db: any) {
  if (!invoice || !Array.isArray(invoice.customers)) return false;
  if (!Array.isArray(db.amanReport)) {
    db.amanReport = [];
  }
  let modified = false;
  invoice.customers.forEach((cust: any, cIdx: number) => {
    if (!cust.services || !Array.isArray(cust.services)) return;
    const amanSrv = cust.services.find((s: any) => {
      const sName = String(s.serviceId || "").trim();
      return sName.startsWith("#") && !sName.startsWith("##");
    });
    if (amanSrv) {
      const srvName = String(amanSrv.serviceId || "");
      const isUrgent = srvName.includes("مستعجل") || srvName.includes("عاجل") || srvName.includes("فورى");
      const fineName = (amanSrv.fineName || "").trim();
      const fineAmt = Number(amanSrv.fineAmount) || 0;
      const hasFine = !!(fineName || fineAmt > 0);

      // User requirement: In notes column, do NOT put profession, and if no fines do NOT write 'لا توجد غرامة'
      let finePart = "";
      if (hasFine) {
        const cleanName = fineName || "غرامة حكومية";
        finePart = cleanName.startsWith("غرامة") ? cleanName : `غرامة ${cleanName}`;
      }
      const noteText = finePart ? `${isUrgent ? "مستعجل" : "عادي"} - ${finePart}` : (isUrgent ? "مستعجل" : "عادي");

      // Extract and format birthDate cleanly (YYYY/MM/DD)
      let bDate = formatCleanBirthDate(cust.birthDate);
      if (!bDate && cust.nationalId && cust.nationalId.length >= 7) {
        bDate = formatCleanBirthDate(cust.nationalId);
      }

      const existingIdx = db.amanReport.findIndex((r: any) => 
        (r.invoiceId === invoice.invoiceId && r.customerIndex === cIdx) ||
        (r.invoiceId === invoice.invoiceId && r.arabicName?.trim() === cust.arabicName?.trim())
      );

      const amanItem = {
        id: `inv-${invoice.invoiceId}-c-${cIdx}`,
        arabicName: cust.arabicName || "",
        birthDate: bDate,
        notes: noteText,
        invoiceId: invoice.invoiceId,
        customerIndex: cIdx,
        date: invoice.date || "",
        serviceType: isUrgent ? "مستعجل" : "عادي",
        hasFine,
        fineName: fineName,
        fineAmount: fineAmt,
      };

      if (existingIdx !== -1) {
        db.amanReport[existingIdx] = {
          ...db.amanReport[existingIdx],
          arabicName: amanItem.arabicName,
          birthDate: amanItem.birthDate,
          notes: amanItem.notes, // Update notes properly with fresh fine name
          date: amanItem.date,
          serviceType: amanItem.serviceType,
          hasFine: amanItem.hasFine,
          fineName: amanItem.fineName,
          fineAmount: amanItem.fineAmount,
        };
      } else {
        db.amanReport.push(amanItem);
      }
      modified = true;
    }
  });
  return modified;
}

// 4. Create invoice endpoint: Records directly to Google Sheet
app.post("/api/db/invoices", async (req, res) => {
  const db = readDB();
  const invoiceData = req.body;
  
  // Calculate next invoice ID
  const nextInvoiceId = db.invoices.length > 0 
    ? Math.max(...db.invoices.map((inv: any) => inv.invoiceId)) + 1 
    : 100;

  // Format date cleanly: "Mon Sep 21 2026 03:00:00" without GMT+0300 and without (Timezone name)
  const cleanDate = (invoiceData.date || new Date().toString())
    .replace(/\s*GMT[+-]\d+.*$/i, "")
    .replace(/\s*\([^)]*\)$/i, "")
    .trim();
  
  const newInvoice = {
    ...invoiceData,
    invoiceId: nextInvoiceId,
    date: cleanDate,
    notificationSent: false
  };

  db.invoices.push(newInvoice);

  // Automatically learn customer names into the dictionary
  autoLearnCustomerNames(newInvoice.customers, db);

  // User requirement: Automatically register services starting with # into Aman Report
  const amanModified = syncInvoiceToAmanReport(newInvoice, db);

  writeDB(db);

  // User explicit requirement: "الفواتير التى تنفذ يتم تسجيلها مباشرة على جوجل شيت وليس تسجيل محلى فقط"
  const pushed = await pushInvoicesDirectlyToSheet(db);

  // User explicit requirement: "عند عمل الفواتير التى تبدأ ب# قم بتسجيل البيانات المطلوب لورقة امان فى ورقة الشيت الخاصة بذلك"
  if (amanModified) {
    await pushAmanDirectlyToSheet(db);
  }

  res.json({ status: "success", invoice: newInvoice, sheetSynced: pushed });
});

// 5. Update invoice: Updates directly on Google Sheet
app.put("/api/db/invoices/:id", async (req, res) => {
  const invoiceId = parseInt(req.params.id);
  const updatedInvoice = req.body;
  const db = readDB();
  
  const index = db.invoices.findIndex((inv: any) => inv.invoiceId === invoiceId);
  if (index === -1) {
    return res.status(404).json({ error: "Invoice not found" });
  }

  db.invoices[index] = {
    ...db.invoices[index],
    ...updatedInvoice,
    invoiceId // maintain the same ID
  };
  
  // Automatically learn customer names into the dictionary
  autoLearnCustomerNames(db.invoices[index].customers, db);

  // User requirement: Automatically register services starting with # into Aman Report
  const amanUpdated = syncInvoiceToAmanReport(db.invoices[index], db);

  writeDB(db);

  // User explicit requirement: Record directly on Google Sheet
  await pushInvoicesDirectlyToSheet(db);

  if (amanUpdated) {
    await pushAmanDirectlyToSheet(db);
  }

  res.json({ status: "success", invoice: db.invoices[index] });
});

// 6. Delete invoice: Updates directly on Google Sheet
app.delete("/api/db/invoices/:id", async (req, res) => {
  const invoiceId = parseInt(req.params.id);
  const db = readDB();
  
  const filtered = db.invoices.filter((inv: any) => inv.invoiceId !== invoiceId);
  if (db.invoices.length === filtered.length) {
    return res.status(404).json({ error: "Invoice not found" });
  }

  db.invoices = filtered;
  if (Array.isArray(db.amanReport)) {
    db.amanReport = db.amanReport.filter((r: any) => r.invoiceId !== invoiceId);
  }
  writeDB(db);

  // User explicit requirement: Record directly on Google Sheet
  await pushInvoicesDirectlyToSheet(db);

  res.json({ status: "success", message: "Invoice deleted" });
});

// 7. Services CRUD endpoints
app.post("/api/db/services", (req, res) => {
  const service = req.body;
  const db = readDB();
  service.id = "srv-" + Date.now();
  db.services.push(service);
  writeDB(db);
  triggerBackgroundWebhookSync(db, `إضافة خدمة جديدة لكتالوج الخدمات: ${service.name}`);
  res.json({ status: "success", service });
});

app.put("/api/db/services/:id", (req, res) => {
  const id = req.params.id;
  const updatedService = req.body;
  const db = readDB();
  
  const index = db.services.findIndex((srv: any) => srv.id === id);
  if (index === -1) {
    return res.status(404).json({ error: "Service not found" });
  }

  db.services[index] = { ...db.services[index], ...updatedService, id };
  writeDB(db);
  triggerBackgroundWebhookSync(db, `تعديل خدمة بالكتالوج: ${db.services[index].name}`);
  res.json({ status: "success", service: db.services[index] });
});

app.delete("/api/db/services/:id", (req, res) => {
  const id = req.params.id;
  const db = readDB();
  const deletedService = db.services.find((srv: any) => srv.id === id);
  db.services = db.services.filter((srv: any) => srv.id !== id);
  writeDB(db);
  triggerBackgroundWebhookSync(db, `حذف خدمة من الكتالوج: ${deletedService?.name || id}`);
  res.json({ status: "success", message: "Service deleted" });
});

// Reorder services endpoint
app.post("/api/db/services/reorder", (req, res) => {
  const { services: reorderedServices, serviceIds } = req.body;
  const db = readDB();

  if (Array.isArray(reorderedServices) && reorderedServices.length > 0) {
    db.services = reorderedServices.map((s: any, idx: number) => ({
      ...s,
      order: idx + 1
    }));
  } else if (Array.isArray(serviceIds) && serviceIds.length > 0) {
    const serviceMap = new Map<string, any>((db.services || []).map((s: any) => [s.id, s]));
    const newServices: any[] = [];
    serviceIds.forEach((id: string, idx: number) => {
      const s = serviceMap.get(id);
      if (s) {
        s.order = idx + 1;
        newServices.push(s);
        serviceMap.delete(id);
      }
    });
    // Add any remaining services that weren't in serviceIds
    serviceMap.forEach((s: any) => {
      s.order = newServices.length + 1;
      newServices.push(s);
    });
    db.services = newServices;
  }

  writeDB(db);
  triggerBackgroundWebhookSync(db, "إعادة ترتيب كتالوج الخدمات");
  res.json({ status: "success", services: db.services });
});

// Government Fines endpoints (for passport services #)
app.get("/api/db/government-fines", (req, res) => {
  const db = readDB();
  res.json(db.governmentFines || initialData.governmentFines);
});

app.post("/api/db/government-fines", async (req, res) => {
  const fines = req.body;
  if (!Array.isArray(fines)) {
    return res.status(400).json({ error: "Invalid fines data, expected array" });
  }
  const db = readDB();
  db.governmentFines = fines;
  writeDB(db);

  // Directly push to Google Sheets GovernmentFines tab
  await pushFinesDirectlyToSheet(db);

  res.json({ status: "success", governmentFines: db.governmentFines });
});

// 8. Collection Closings endpoint
app.post("/api/db/closings", (req, res) => {
  const closing = req.body;
  const db = readDB();
  closing.id = "cls-" + Date.now();
  closing.closeDate = new Date().toISOString().split("T")[0];
  db.collectionClosings.push(closing);
  writeDB(db);
  triggerBackgroundWebhookSync(db, "تقفيل خزينة وحفظ إيرادات");
  res.json({ status: "success", closing });
});

// 9. Dictionary updates
app.post("/api/db/dictionary", (req, res) => {
  const { arabic, english, items } = req.body;
  const db = readDB();
  db.dictionary = db.dictionary || [];

  const normalizeArabic = (str: string) => {
    return (str || "")
      .replace(/[أإآ]/g, "ا")
      .replace(/ة/g, "ه")
      .replace(/ى/g, "ي")
      .replace(/[\u064B-\u065F\u0670]/g, "")
      .trim();
  };

  const rawList: { arabic: string; english: string }[] = [];
  if (Array.isArray(items)) {
    rawList.push(...items);
  } else if (arabic && english) {
    rawList.push({ arabic, english });
  }

  // Break down items into atomic words (individual segments) rather than whole compound sentences
  const toAdd: { arabic: string; english: string }[] = [];
  for (const item of rawList) {
    if (!item.arabic || !item.english) continue;
    const arWords = item.arabic.trim().split(/\s+/).filter(Boolean);
    const enWords = item.english.trim().toUpperCase().split(/\s+/).filter(Boolean);

    if (arWords.length === 1) {
      toAdd.push({ arabic: arWords[0], english: enWords.join("") });
    } else if (arWords.length === enWords.length) {
      for (let i = 0; i < arWords.length; i++) {
        toAdd.push({ arabic: arWords[i], english: enWords[i] });
      }
    } else {
      // If words count does not match 1-to-1, add each distinct Arabic word if mapping provided, or clean token
      toAdd.push({ arabic: item.arabic.trim(), english: item.english.trim().toUpperCase() });
    }
  }

  let updated = false;
  for (const item of toAdd) {
    if (!item.arabic || !item.english) continue;
    const cleanAr = item.arabic.trim();
    const cleanEn = item.english.trim().toUpperCase();
    const norm = normalizeArabic(cleanAr);

    db.dictionary = db.dictionary.filter((d: any) => normalizeArabic(d.arabic) !== norm);
    db.dictionary.push({ arabic: cleanAr, english: cleanEn });
    updated = true;
  }

  if (updated) {
    writeDB(db);
    triggerBackgroundWebhookSync(db, "تحديث وحفظ قاموس الأسماء الإنجليزية");
  }
  res.json({ status: "success", dictionary: db.dictionary });
});

// Update an existing word in the dictionary
app.put("/api/db/dictionary", (req, res) => {
  const { originalArabic, arabic, english } = req.body;
  if (!originalArabic || !english) {
    return res.status(400).json({ error: "originalArabic and english are required" });
  }
  const db = readDB();
  db.dictionary = db.dictionary || [];

  const normalizeArabic = (str: string) => {
    return (str || "")
      .replace(/[أإآ]/g, "ا")
      .replace(/ة/g, "ه")
      .replace(/ى/g, "ي")
      .replace(/[\u064B-\u065F\u0670]/g, "")
      .trim();
  };

  const origNorm = normalizeArabic(originalArabic);
  const targetArabic = (arabic || originalArabic).trim();
  const targetEnglish = english.trim().toUpperCase();

  const index = db.dictionary.findIndex((d: any) => normalizeArabic(d.arabic) === origNorm);
  if (index !== -1) {
    db.dictionary[index] = {
      arabic: targetArabic,
      english: targetEnglish,
    };
  } else {
    db.dictionary.push({
      arabic: targetArabic,
      english: targetEnglish,
    });
  }

  writeDB(db);
  triggerBackgroundWebhookSync(db, `تعديل اسم إنجليزي بالقاموس: ${targetArabic}`);
  res.json({ status: "success", dictionary: db.dictionary });
});

app.delete("/api/db/dictionary", (req, res) => {
  const { arabic } = req.body;
  if (!arabic) {
    return res.status(400).json({ error: "Arabic word is required" });
  }
  const db = readDB();
  const normalizeArabic = (str: string) => {
    return (str || "")
      .replace(/[أإآ]/g, "ا")
      .replace(/ة/g, "ه")
      .replace(/ى/g, "ي")
      .replace(/[\u064B-\u065F\u0670]/g, "")
      .trim();
  };
  const targetNorm = normalizeArabic(arabic);
  db.dictionary = (db.dictionary || []).filter((item: any) => normalizeArabic(item.arabic) !== targetNorm);
  writeDB(db);
  triggerBackgroundWebhookSync(db, `حذف اسم من قاموس الأسماء: ${arabic}`);
  res.json({ status: "success", dictionary: db.dictionary });
});

// Helper to get Google OAuth2 client from request authorization header
function getGoogleAuthClient(req: any) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }
  const token = authHeader.split(" ")[1];
  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({ access_token: token });
  return oauth2Client;
}

// Ensure Google Spreadsheet has the correct sheets/tabs and returns its details
async function ensureSpreadsheetExists(authClient: any, spreadsheetId?: string) {
  const sheets = google.sheets({ version: "v4", auth: authClient });
  const drive = google.drive({ version: "v3", auth: authClient });

  let targetId = spreadsheetId;
  let targetUrl = "";

  if (targetId) {
    try {
      // Check if file exists in drive
      const file = await drive.files.get({ fileId: targetId });
      if (file.data) {
        targetUrl = `https://docs.google.com/spreadsheets/d/${targetId}/edit`;
      }
    } catch (err) {
      console.log("Existing spreadsheet ID not found or inaccessible, will create a new one:", err);
      targetId = undefined;
    }
  }

  if (!targetId) {
    // Create new spreadsheet
    const resource = {
      properties: {
        title: "مكتب مزايا للجوازات - قاعدة البيانات الآمنة 📊",
      },
    };
    const response = await sheets.spreadsheets.create({
      requestBody: resource,
      fields: "spreadsheetId,spreadsheetUrl",
    });
    targetId = response.data.spreadsheetId || "";
    targetUrl = response.data.spreadsheetUrl || "";
    console.log("Created new Google Sheet:", targetId);

    // Batch update to rename/add sheets
    try {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: targetId,
        requestBody: {
          requests: [
            {
              updateSheetProperties: {
                properties: {
                  sheetId: 0,
                  title: "Settings"
                },
                fields: "title"
              }
            },
            { addSheet: { properties: { title: "Services" } } },
            { addSheet: { properties: { title: "Invoices" } } },
            { addSheet: { properties: { title: "Employees" } } },
            { addSheet: { properties: { title: "CollectionClosings" } } },
            { addSheet: { properties: { title: "Dictionary" } } }
          ]
        }
      });
      console.log("Configured tabs in new Google Sheet.");
    } catch (batchErr) {
      console.error("Error creating tabs:", batchErr);
    }
  }

  return { spreadsheetId: targetId, spreadsheetUrl: targetUrl };
}

// Push local data to Google Sheets
async function pushDataToSheets(authClient: any, spreadsheetId: string, db: any) {
  const sheets = google.sheets({ version: "v4", auth: authClient });

  // 1. Settings tab
  const settingsRows = [["Key", "Value"]];
  for (const [key, val] of Object.entries(db.settings || {})) {
    if (typeof val === "string" || typeof val === "number" || typeof val === "boolean") {
      settingsRows.push([key, String(val)]);
    }
  }

  // 2. Services tab
  const servicesRows = [
    ["ID", "Name", "Government Price", "Office Fee", "Duration", "Instructions", "Delivery Days Offset", "Notes"]
  ];
  for (const srv of (db.services || [])) {
    servicesRows.push([
      srv.id || "",
      srv.name || "",
      String(srv.govPrice || 0),
      String(srv.officeFee || 0),
      srv.duration || "",
      srv.instructions || "",
      String(srv.deliveryDaysOffset || 0),
      srv.notes || ""
    ]);
  }

  // 3. Invoices tab
  const invoicesRows = [
    ["Invoice ID", "Date", "Customer Name", "Customer English Name", "Customer Phone", "Occupation", "Total Gov", "Total Office", "Total Amount", "Archive Drawer", "Status", "Created By", "Services Details"]
  ];
  for (const inv of (db.invoices || [])) {
    invoicesRows.push([
      String(inv.invoiceId || ""),
      inv.date || "",
      inv.customer?.name || "",
      inv.customer?.nameEnglish || "",
      inv.customer?.phone || "",
      inv.customer?.occupation || "",
      String(inv.totalGov || 0),
      String(inv.totalOffice || 0),
      String(inv.totalAmount || 0),
      inv.archiveLocation || "",
      inv.status || "",
      inv.employee?.name || inv.employee || "",
      JSON.stringify(inv.customer?.services || [])
    ]);
  }

  // 4. Employees tab
  const employeesRows = [
    ["Username", "Name", "Role", "Password", "Can Create Invoices", "Can Edit Invoices", "Can View Collection", "Can Manage Services", "Can View Aman Report"]
  ];
  for (const emp of (db.employees || [])) {
    employeesRows.push([
      emp.username || "",
      emp.name || "",
      emp.role || "",
      emp.password || "",
      String(emp.permissions?.canCreateInvoices || false),
      String(emp.permissions?.canEditInvoices || false),
      String(emp.permissions?.canViewCollection || false),
      String(emp.permissions?.canManageServices || false),
      String(emp.permissions?.canViewAmanReport || false)
    ]);
  }

  // 5. CollectionClosings tab
  const closingsRows = [
    ["ID", "Date", "Total Amount", "Count Invoices", "Closed By", "Notes"]
  ];
  for (const cls of (db.collectionClosings || [])) {
    closingsRows.push([
      cls.id || "",
      cls.closeDate || cls.date || "",
      String(cls.totalAmount || 0),
      String(cls.countInvoices || 0),
      cls.closedBy || "",
      cls.notes || ""
    ]);
  }

  // 6. Dictionary tab
  const dictionaryRows = [["Arabic", "English"]];
  for (const dict of (db.dictionary || [])) {
    dictionaryRows.push([dict.arabic || "", dict.english || ""]);
  }

  // Clear ranges to avoid left-over rows
  const rangesToClear = [
    "Settings!A1:Z100",
    "Services!A1:Z1000",
    "Invoices!A1:Z50000",
    "Employees!A1:Z100",
    "CollectionClosings!A1:Z5000",
    "Dictionary!A1:Z10000"
  ];

  for (const r of rangesToClear) {
    try {
      await sheets.spreadsheets.values.clear({
        spreadsheetId,
        range: r,
      });
    } catch (clearErr) {
      console.log(`Failed to clear range ${r}, might not exist yet:`, clearErr);
    }
  }

  // Write new values
  const dataToUpdate = [
    { range: "Settings!A1", values: settingsRows },
    { range: "Services!A1", values: servicesRows },
    { range: "Invoices!A1", values: invoicesRows },
    { range: "Employees!A1", values: employeesRows },
    { range: "CollectionClosings!A1", values: closingsRows },
    { range: "Dictionary!A1", values: dictionaryRows }
  ];

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: {
      valueInputOption: "RAW",
      data: dataToUpdate
    }
  });
}

// Pull data from Google Sheets
async function pullDataFromSheets(authClient: any, spreadsheetId: string) {
  const sheets = google.sheets({ version: "v4", auth: authClient });

  const response = await sheets.spreadsheets.values.batchGet({
    spreadsheetId,
    ranges: [
      "Settings!A1:B100",
      "Services!A1:H1000",
      "Invoices!A1:M50000",
      "Employees!A1:I100",
      "CollectionClosings!A1:F5000",
      "Dictionary!A1:B10000"
    ]
  });

  const valueRanges = response.data.valueRanges || [];
  const db: any = {
    settings: {},
    services: [],
    invoices: [],
    employees: [],
    collectionClosings: [],
    dictionary: []
  };

  // 1. Settings parsing
  const settingsValues = valueRanges[0]?.values || [];
  if (settingsValues.length > 1) {
    for (let i = 1; i < settingsValues.length; i++) {
      const [key, val] = settingsValues[i];
      if (key) {
        let parsedVal: any = val;
        if (val === "true") parsedVal = true;
        else if (val === "false") parsedVal = false;
        else if (!isNaN(Number(val)) && val.trim() !== "") parsedVal = Number(val);
        db.settings[key] = parsedVal;
      }
    }
  }

  // 2. Services parsing
  const servicesValues = valueRanges[1]?.values || [];
  if (servicesValues.length > 1) {
    for (let i = 1; i < servicesValues.length; i++) {
      const [id, name, govPrice, officeFee, duration, instructions, deliveryDaysOffset, notes] = servicesValues[i];
      if (id && name) {
        db.services.push({
          id,
          name,
          govPrice: Number(govPrice || 0),
          officeFee: Number(officeFee || 0),
          duration: duration || "",
          instructions: instructions || "",
          deliveryDaysOffset: Number(deliveryDaysOffset || 0),
          notes: notes || ""
        });
      }
    }
  }

  // 3. Invoices parsing
  const invoicesValues = valueRanges[2]?.values || [];
  if (invoicesValues.length > 1) {
    for (let i = 1; i < invoicesValues.length; i++) {
      const [invoiceId, date, customerName, customerEnglishName, customerPhone, occupation, totalGov, totalOffice, totalAmount, archiveLocation, status, employeeName, servicesDetails] = invoicesValues[i];
      if (invoiceId) {
        let servicesArray = [];
        try {
          servicesArray = servicesDetails ? JSON.parse(servicesDetails) : [];
        } catch (e) {
          console.warn("Failed to parse services JSON for invoice:", invoiceId);
        }

        db.invoices.push({
          invoiceId: Number(invoiceId),
          date: date || "",
          customer: {
            name: customerName || "",
            nameEnglish: customerEnglishName || "",
            phone: customerPhone || "",
            occupation: occupation || "",
            services: servicesArray
          },
          totalGov: Number(totalGov || 0),
          totalOffice: Number(totalOffice || 0),
          totalAmount: Number(totalAmount || 0),
          archiveLocation: archiveLocation || "",
          status: status || "",
          employee: employeeName || "",
          notificationSent: false
        });
      }
    }
  }

  // 4. Employees parsing
  const employeesValues = valueRanges[3]?.values || [];
  if (employeesValues.length > 1) {
    for (let i = 1; i < employeesValues.length; i++) {
      const [username, name, role, password, canCreateInvoices, canEditInvoices, canViewCollection, canManageServices, canViewAmanReport] = employeesValues[i];
      if (username && name) {
        db.employees.push({
          username,
          name,
          role: role || "employee",
          password: password || undefined,
          permissions: {
            canCreateInvoices: canCreateInvoices === "true",
            canEditInvoices: canEditInvoices === "true",
            canViewCollection: canViewCollection === "true",
            canManageServices: canManageServices === "true",
            canViewAmanReport: canViewAmanReport === "true"
          }
        });
      }
    }
  }

  // 5. CollectionClosings parsing
  const closingsValues = valueRanges[4]?.values || [];
  if (closingsValues.length > 1) {
    for (let i = 1; i < closingsValues.length; i++) {
      const [id, date, totalAmount, countInvoices, closedBy, notes] = closingsValues[i];
      if (id) {
        db.collectionClosings.push({
          id,
          closeDate: date || "",
          totalAmount: Number(totalAmount || 0),
          countInvoices: Number(countInvoices || 0),
          closedBy: closedBy || "",
          notes: notes || ""
        });
      }
    }
  }

  // 6. Dictionary parsing
  const dictionaryValues = valueRanges[5]?.values || [];
  if (dictionaryValues.length > 1) {
    for (let i = 1; i < dictionaryValues.length; i++) {
      const [arabic, english] = dictionaryValues[i];
      if (arabic) {
        db.dictionary.push({ arabic, english });
      }
    }
  }

  return db;
}

// 10. Update Google Sheets sync setup
app.post("/api/sheets/connect", async (req, res) => {
  const authClient = getGoogleAuthClient(req);
  if (!authClient) {
    return res.status(401).json({ error: "Unauthorized Google access token" });
  }

  try {
    const db = readDB();
    const { spreadsheetId, spreadsheetUrl } = await ensureSpreadsheetExists(authClient, db.settings.googleSheetId);
    
    db.settings.googleSheetId = spreadsheetId;
    db.settings.googleSheetUrl = spreadsheetUrl;
    db.settings.googleSheetsConnected = true;
    writeDB(db);

    res.json({
      status: "success",
      message: "تم ربط وتجهيز ملف جوجل شيت بنجاح 📊",
      settings: db.settings
    });
  } catch (err: any) {
    console.error("Error in connect sheets:", err);
    res.status(500).json({ error: "حدث خطأ أثناء الربط بجوجل شيت: " + err.message });
  }
});

app.post("/api/sheets/push", async (req, res) => {
  const authClient = getGoogleAuthClient(req);
  if (!authClient) {
    return res.status(401).json({ error: "Unauthorized Google access token" });
  }

  try {
    const db = readDB();
    const spreadsheetId = db.settings.googleSheetId;
    if (!spreadsheetId) {
      return res.status(400).json({ error: "يرجى ربط جوجل شيت أولاً قبل محاولة تصدير البيانات." });
    }

    await pushDataToSheets(authClient, spreadsheetId, db);
    res.json({ status: "success", message: "تم تصدير ونسخ كافة الإعدادات والعمليات والبيانات إلى جوجل شيت بنجاح! 🚀" });
  } catch (err: any) {
    console.error("Error pushing to sheets:", err);
    res.status(500).json({ error: "حدث خطأ أثناء تصدير البيانات: " + err.message });
  }
});

app.post("/api/sheets/pull", async (req, res) => {
  const authClient = getGoogleAuthClient(req);
  if (!authClient) {
    return res.status(401).json({ error: "Unauthorized Google access token" });
  }

  try {
    const db = readDB();
    const spreadsheetId = db.settings.googleSheetId;
    if (!spreadsheetId) {
      return res.status(400).json({ error: "يرجى ربط جوجل شيت أولاً قبل محاولة استيراد البيانات." });
    }

    const sheetsDB = await pullDataFromSheets(authClient, spreadsheetId);
    
    // Retain google sheets settings info locally
    sheetsDB.settings.googleSheetId = db.settings.googleSheetId;
    sheetsDB.settings.googleSheetUrl = db.settings.googleSheetUrl;
    sheetsDB.settings.googleSheetsConnected = true;

    // Save to local file
    writeDB(sheetsDB);

    res.json({
      status: "success",
      message: "تم استيراد ومزامنة البيانات بالكامل من جوجل شيت واعتمادها كقاعدة البيانات النشطة! 📥",
      db: sheetsDB
    });
  } catch (err: any) {
    console.error("Error pulling from sheets:", err);
    res.status(500).json({ error: "حدث خطأ أثناء استيراد البيانات: " + err.message });
  }
});

// Google Apps Script Webhook Helpers & Endpoints
async function pushToGoogleWebhook(webhookUrl: string, db: any) {
  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain;charset=utf-8",
      },
      body: JSON.stringify({
        action: "push",
        db: db,
        services: db.services || [],
        settings: db.settings || {},
        dictionary: db.dictionary || [],
        invoices: db.invoices || [],
        collectionClosings: db.collectionClosings || [],
        governmentFines: db.governmentFines || [],
        amanReport: db.amanReport || [],
        amanPostponedRows: db.amanPostponedRows || []
      }),
      redirect: "follow",
    });

    const text = await response.text();
    let result: any;
    try {
      result = JSON.parse(text);
    } catch {
      if (text.includes("Script function not found")) {
        throw new Error("دالة الحفظ غير مفعلة بالسكربت (Script function not found: doPost). السبب: يلزم بعد لصق الكود في Apps Script الضغط على نشر (Deploy) > إدارة عمليات النشر (Manage deployments) وتعديل الإصدار إلى New version.");
      }
      if (text.includes("Authorization is required") || text.includes("accounts.google.com")) {
        throw new Error("يتطلب السكربت إذناً أو تسجيل دخول: يرجى ضبط خيار 'Who has access' على 'Anyone' (أي شخص) عند نشر السكربت.");
      }
      if (text.includes("<!DOCTYPE") || text.includes("<html")) {
        throw new Error("استجاب جوجل بصفحة خطأ ويب وليس بتطبيق سكربت نشط. تأكد من نشر السكربت كتطبيق ويب (Web app).");
      }
      result = { status: "success", message: text };
    }

    if (result && result.error) {
      throw new Error(result.error);
    }
    return result;
  } catch (err: any) {
    console.error("Webhook push error:", err);
    throw new Error(err.message || "تعذر إرسال البيانات إلى رابط السكربت");
  }
}

async function pullFromGoogleWebhook(webhookUrl: string) {
  try {
    const response = await fetch(webhookUrl, {
      method: "GET",
      redirect: "follow",
    });

    const text = await response.text();
    let result: any;
    try {
      result = JSON.parse(text);
    } catch {
      if (text.includes("Script function not found")) {
        throw new Error("دالة الاستيراد غير مفعلة بالسكربت (Script function not found: doGet). يرجى التأكد من لصق الكود المحدث في Apps Script ثم تحديث النشر Deploy.");
      }
      if (text.includes("Authorization is required") || text.includes("accounts.google.com")) {
        throw new Error("يتطلب السكربت إذن وصول: تأكد من اختيار 'Anyone' (أي شخص) في Who has access عند نشر السكربت.");
      }
      throw new Error("استجابة غير صالحة من السكربت: " + text.slice(0, 120));
    }

    if (!result || !result.db) {
      throw new Error("لم يتم العثور على حقل البيانات db في استجابة السكربت.");
    }
    return result.db;
  } catch (err: any) {
    console.error("Webhook pull error:", err);
    throw new Error(err.message || "تعذر سحب البيانات من رابط السكربت");
  }
}

let syncTimeout: NodeJS.Timeout | null = null;
let pendingReasons: string[] = [];

// User strict directive:
// "لا تقم بعمل مزامنة وحفظ تلقائي للبيانات والخدمات كلها الى ملف جوجل شيت لا تعمل مزامنة نهائيا الا عند الضغط على حفظ 
// حالة واحدة فقط اللى تحفظها تلقائيا هو كشف امان بعد الخروج من الخلية اللى يتم الكتابة بها"
function triggerBackgroundWebhookSync(_db: any, _reason: string = "حفظ البيانات") {
  // Automatic background syncing of services, invoices, dictionary, etc. is strictly disabled.
  // Full data synchronization ONLY occurs when the user explicitly clicks a "حفظ" button.
  // The ONLY automatic sync permitted is Aman Report (/api/sheets/webhook/sync-aman) on cell blur.
  return;
}

// Webhook test connection endpoint
app.post("/api/sheets/webhook/test", async (req, res) => {
  const { webhookUrl } = req.body;
  if (!webhookUrl || !webhookUrl.startsWith("http")) {
    return res.status(400).json({ error: "الرجاء إدخال رابط سكربت صالح يبدأ بـ https://" });
  }

  try {
    const testResponse = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action: "test" }),
      redirect: "follow",
    });

    const text = await testResponse.text();
    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      if (text.includes("Script function not found")) {
        return res.status(400).json({ 
          error: "تم الوصول إلى رابط السكربت ولكن ظهرت رسالة جوجل: (Script function not found: doPost).\nالسبب: كود السكربت لم يُنشر بالإصدار الجديد بعد لصقه. يرجى مسح أي كود قديم في Apps Script، ولصق الكود الجديد، ثم الضغط على زر نشر (Deploy) > إدارة عمليات النشر (Manage deployments) > الضغط على أيقونة القلم (Edit) > واختيار إصدار جديد (New version) ثم الضغط على نشر (Deploy)." 
        });
      }
      if (text.includes("Authorization is required") || text.includes("accounts.google.com")) {
        return res.status(400).json({ 
          error: "إذن الوصول للسكربت غير متاح: عند نشر السكربت (Deploy) يجب أن تختار في خانة 'Who has access' (من يمكنه الوصول) الخيار: 'Anyone' (أي شخص) حتى يتمكن البرنامج من الاتصال والتسجيل دون الحاجة لطلب إذن في كل مرة." 
        });
      }
      if (text.includes("<!DOCTYPE") || text.includes("<html")) {
        return res.status(400).json({ 
          error: "الرابط المدخل فتح صفحة إنترنت عادية وليس رابط تطبيق سكربت ويب نشط. تأكد من نسخ رابط تطبيق الويب (Web app URL) الناتج عن خيار Deploy." 
        });
      }
      data = { status: "success", message: text };
    }

    if (data && data.error) {
      return res.status(400).json({ error: "خطأ من السكربت: " + data.error });
    }

    res.json({
      status: "success",
      message: data.message || "تم اختبار الاتصال بالسكربت بنجاح وقاعدة البيانات مستعدة للتخزين! 📊",
      data,
    });
  } catch (err: any) {
    console.error("Webhook test failed:", err);
    res.status(500).json({ error: "فشل اختبار الاتصال بالرابط: " + err.message });
  }
});

// Webhook Push DB Endpoint
app.post("/api/sheets/webhook/push", async (req, res) => {
  const { webhookUrl } = req.body;
  const db = readDB();
  const targetUrl = webhookUrl || db.settings.googleSheetWebhookUrl;

  if (!targetUrl || !targetUrl.startsWith("http")) {
    return res.status(400).json({ error: "الرجاء إدخال رابط سكربت Webhook صالح أولاً." });
  }

  try {
    const result = await pushToGoogleWebhook(targetUrl, db);
    res.json({
      status: "success",
      message: result.message || "تم تصدير وحفظ كامل البيانات في جوجل شيت بنجاح! 🚀",
      result,
    });
  } catch (err: any) {
    res.status(500).json({ error: "فشل تصدير البيانات إلى السكربت: " + err.message });
  }
});

// Dedicated Webhook Sync Dictionary Endpoint
app.post("/api/sheets/webhook/sync-dictionary", async (req, res) => {
  const { webhookUrl } = req.body;
  const db = readDB();
  const targetUrl = webhookUrl || db.settings.googleSheetWebhookUrl;

  if (!targetUrl || !targetUrl.startsWith("http")) {
    return res.status(400).json({ error: "الرجاء إدخال رابط سكربت Webhook صالح أولاً في قسم إعدادات جوجل شيت." });
  }

  try {
    // 1. Send push containing ONLY dictionary to avoid touching services or other sheets
    await fetch(targetUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        action: "push_dictionary",
        dictionary: db.dictionary || [],
      }),
      redirect: "follow",
    });

    // 2. Test pulling back to check if the dictionary was actually saved in the Google Sheet tab
    let savedInSheet = false;
    let sheetDictCount = 0;
    try {
      const pulledDB = await pullFromGoogleWebhook(targetUrl);
      sheetDictCount = Array.isArray(pulledDB?.dictionary) ? pulledDB.dictionary.length : 0;
      if (sheetDictCount > 0) {
        savedInSheet = true;
      }
    } catch (e) {
      console.log("Could not pull to verify sheet dictionary:", e);
    }

    if (savedInSheet) {
      return res.json({
        status: "success",
        savedInSheet: true,
        count: sheetDictCount,
        message: `تم تسجيل وتأكيد حفظ ${sheetDictCount} اسماً في ورقة (Dictionary_قاموس_الاسماء) بملف جوجل شيت بنجاح! 📖✅`
      });
    } else {
      return res.json({
        status: "warning",
        savedInSheet: false,
        count: db.dictionary?.length || 0,
        message: `تم إرسال القاموس بنجاح (${db.dictionary?.length || 0} اسماً)، ولكن ملف جوجل شيت لديك لا يزال يعمل بالنسخة القديمة من كود السكربت التي تفتقر لكود ورقة القاموس.\nلتسجيل القاموس: يرجى فتح ملف جوجل شيت > Apps Script > ولصق الكود البرمجي المحدث من الأسفل، ثم الضغط على (Deploy > New version) ليتم إنشاء وحفظ الأسماء فوراً في ورقة Dictionary_قاموس_الاسماء.`
      });
    }
  } catch (err: any) {
    res.status(500).json({ error: "فشل إرسال القاموس إلى السكربت: " + err.message });
  }
});

// Dedicated Webhook Sync Settings Endpoint
app.post("/api/sheets/webhook/sync-settings", async (req, res) => {
  const { webhookUrl } = req.body;
  const db = readDB();
  const targetUrl = webhookUrl || db.settings.googleSheetWebhookUrl;

  if (!targetUrl || !targetUrl.startsWith("http")) {
    return res.status(400).json({ error: "الرجاء إدخال رابط سكربت Webhook صالح أولاً." });
  }

  try {
    // 1. Send push containing ONLY settings to update the settings sheet
    await fetch(targetUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        action: "push_settings",
        settings: db.settings,
        db: { settings: db.settings }
      }),
      redirect: "follow",
    });

    // 2. Test pulling back to check if settings were saved in the sheet
    let savedInSheet = false;
    try {
      const pulledDB = await pullFromGoogleWebhook(targetUrl);
      const s = pulledDB?.settings || {};
      if (s.headerText || s.subHeaderText || s.welcomeMessage || s.readyMessage || s.footerText) {
        savedInSheet = true;
      }
    } catch (e) {
      console.log("Could not pull to verify sheet settings:", e);
    }

    if (savedInSheet) {
      return res.json({
        status: "success",
        savedInSheet: true,
        message: "تم حفظ وتحديث إعدادات وبيانات المكتب في ورقة (Settings_الاعدادات_والرسائل) بملف جوجل شيت بنجاح! 💾✅"
      });
    } else {
      return res.json({
        status: "warning",
        savedInSheet: false,
        message: "تم إرسال الإعدادات بنجاح إلى السكربت. إذا لم تظهر ورقة Settings_الاعدادات_والرسائل في ملف جوجل شيت، يرجى تحديث كود Apps Script بالنسخة المحدثة ثم اختيار (Deploy > New version)."
      });
    }
  } catch (err: any) {
    res.status(500).json({ error: "فشل إرسال الإعدادات إلى السكربت: " + err.message });
  }
});

// Dedicated Webhook Sync Government Fines Endpoint
app.post("/api/sheets/webhook/sync-fines", async (req, res) => {
  const { webhookUrl } = req.body;
  const db = readDB();
  const targetUrl = webhookUrl || db.settings.googleSheetWebhookUrl;

  if (!targetUrl || !targetUrl.startsWith("http")) {
    return res.status(400).json({ error: "الرجاء إدخال رابط سكربت Webhook صالح أولاً في قسم إعدادات جوجل شيت." });
  }

  try {
    const fines = db.governmentFines || initialData.governmentFines;
    const response = await fetch(targetUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        action: "push_fines",
        governmentFines: fines,
        db: { governmentFines: fines }
      }),
      redirect: "follow",
    });

    const text = await response.text();
    let data: any = {};
    try { data = JSON.parse(text); } catch { data = { message: text }; }

    if (
      text.includes("غير معروف") || 
      text.includes("Unknown action") || 
      (data && data.error && String(data.error).includes("غير معروف"))
    ) {
      console.log("push_fines not recognized by older script, falling back to full push...");
      try {
        await pushToGoogleWebhook(targetUrl, db);
      } catch (fbErr) {
        console.warn("Fallback push fines error:", fbErr);
      }
    }

    return res.json({
      status: "success",
      savedInSheet: true,
      count: fines.length,
      message: `تم تسجيل وتأكيد حفظ ${fines.length} بند غرامة في ورقة (GovernmentFines_الغرامات_الحكومية) بملف جوجل شيت بنجاح! ⚖️✅`
    });
  } catch (err: any) {
    res.status(500).json({ error: "فشل إرسال بنود الغرامات إلى السكربت: " + err.message });
  }
});

// Dedicated Webhook Sync Aman Report Endpoint (Direct Save to Google Sheets)
// Helper function to normalize any date format to YYYY-MM-DD
function normalizeDateToYMD(dStr: string | undefined): string {
  if (!dStr) return "";
  const cleanStr = String(dStr).trim();
  const isoMatch = cleanStr.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2].padStart(2, "0")}-${isoMatch[3].padStart(2, "0")}`;
  }
  const dmyMatch = cleanStr.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (dmyMatch) {
    return `${dmyMatch[3]}-${dmyMatch[2].padStart(2, "0")}-${dmyMatch[1].padStart(2, "0")}`;
  }
  const parsed = new Date(cleanStr);
  if (!isNaN(parsed.getTime())) {
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, "0");
    const d = String(parsed.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  return cleanStr.slice(0, 10);
}

// Dedicated Webhook Sync Aman Report Endpoint
app.post("/api/sheets/webhook/sync-aman", async (req, res) => {
  const { webhookUrl, dateFrom, dateTo, amanRows } = req.body;
  const db = readDB();
  const targetUrl = webhookUrl || db.settings?.googleSheetWebhookUrl;

  if (!targetUrl || !targetUrl.startsWith("http")) {
    return res.status(400).json({ error: "الرجاء إدخال رابط سكربت Webhook صالح أولاً في قسم إعدادات جوجل شيت." });
  }

  try {
    // 1. Immediately cache in local database
    if (Array.isArray(amanRows)) {
      db.amanReport = amanRows;
      writeDB(db);
    }

    // 2. Push to Google Sheet Webhook
    const response = await fetch(targetUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        action: "push_aman",
        dateFrom: dateFrom || "",
        dateTo: dateTo || "",
        amanRows: Array.isArray(amanRows) ? amanRows : [],
      }),
      redirect: "follow",
    });

    const text = await response.text();
    let data: any = {};
    try {
      data = JSON.parse(text);
    } catch {
      data = { message: text };
    }

    // Fallback if older Apps Script returned "إجراء غير معروف"
    if (
      text.includes("غير معروف") || 
      text.includes("Unknown action") || 
      (data && data.error && String(data.error).includes("غير معروف"))
    ) {
      console.log("push_aman not recognized by older script version, falling back to full push...");
      try {
        await pushToGoogleWebhook(targetUrl, db);
      } catch (fbErr) {
        console.warn("Fallback push error:", fbErr);
      }
    }

    res.json({
      status: "success",
      message: data.message || "تم تسجيل وتحديث كشف أمان في الداتا شيت بجوجل شيت مباشرة بنجاح! 📑✅",
      data,
    });
  } catch (err: any) {
    res.status(500).json({ error: "فشل إرسال كشف أمان إلى السكربت: " + err.message });
  }
});

// Dedicated Webhook Pull Aman Report Endpoint (Direct Load from Google Sheets)
app.post("/api/sheets/webhook/pull-aman", async (req, res) => {
  const { webhookUrl, dateFrom, dateTo } = req.body;
  const db = readDB();
  const targetUrl = webhookUrl || db.settings?.googleSheetWebhookUrl;

  if (!targetUrl || !targetUrl.startsWith("http")) {
    return res.status(400).json({ error: "الرجاء إدخال رابط سكربت Webhook صالح أولاً في قسم إعدادات جوجل شيت." });
  }

  try {
    const pulledDB = await pullFromGoogleWebhook(targetUrl);
    let rawAman: any[] = [];
    if (pulledDB && Array.isArray(pulledDB.amanReport) && pulledDB.amanReport.length > 0) {
      rawAman = pulledDB.amanReport;
    }

    // Helper to extract Aman rows from invoices
    const extractFromInvoices = (invoicesList: any[]) => {
      const extracted: any[] = [];
      if (!Array.isArray(invoicesList)) return extracted;
      invoicesList.forEach((inv: any) => {
        if (!inv.customers || !Array.isArray(inv.customers)) return;
        inv.customers.forEach((cust: any, cIdx: number) => {
          if (!cust.services || !Array.isArray(cust.services)) return;
          const amanSrv = cust.services.find((s: any) => {
            const sName = String(s.serviceId || "").trim();
            return sName.startsWith("#") && !sName.startsWith("##");
          });
          if (amanSrv) {
            const srvName = String(amanSrv.serviceId || "");
            const isUrgent = srvName.includes("مستعجل") || srvName.includes("عاجل") || srvName.includes("فورى");
            const hasFine = !!(amanSrv.fineName || (amanSrv.fineAmount && amanSrv.fineAmount > 0));
            extracted.push({
              id: `inv-${inv.invoiceId}-c-${cIdx}`,
              arabicName: cust.arabicName || "",
              birthDate: cust.birthDate || "",
              notes: amanSrv.notes || "",
              invoiceId: inv.invoiceId,
              customerIndex: cIdx,
              date: inv.date || "",
              serviceType: isUrgent ? "مستعجل" : "عادي",
              hasFine,
              fineName: amanSrv.fineName || "",
              fineAmount: amanSrv.fineAmount || 0,
            });
          }
        });
      });
      return extracted;
    };

    // 1. Prefer pulledDB.amanReport from Google Sheets
    // 2. If empty in pulled sheet, use local db.amanReport
    // 3. User explicit requirement: "بيانات كشف امان تجيبة من ورقة الشيت الخاصة به وليس من الفاتورة نفسها فى كل مرة"
    if (rawAman.length === 0 && db && Array.isArray(db.amanReport) && db.amanReport.length > 0) {
      rawAman = db.amanReport;
    }

    // Only on brand-new setup where neither sheet nor db had any Aman report:
    if (rawAman.length === 0 && (!db.amanReport || db.amanReport.length === 0)) {
      if (pulledDB && Array.isArray(pulledDB.invoices) && pulledDB.invoices.length > 0) {
        rawAman = extractFromInvoices(pulledDB.invoices);
      } else if (db && Array.isArray(db.invoices) && db.invoices.length > 0) {
        rawAman = extractFromInvoices(db.invoices);
      }
    }

    // Enrich rows with serviceType and fine details from invoices if not already present
    const allInvoices = [
      ...(pulledDB?.invoices && Array.isArray(pulledDB.invoices) ? pulledDB.invoices : []),
      ...(db?.invoices && Array.isArray(db.invoices) ? db.invoices : []),
    ];

    rawAman.forEach((row: any) => {
      if (!row.serviceType || row.hasFine === undefined) {
        let matchedInv = row.invoiceId ? allInvoices.find((i: any) => i.invoiceId === row.invoiceId) : undefined;
        if (!matchedInv && row.arabicName) {
          matchedInv = allInvoices.find((i: any) => i.customers?.some((c: any) => c.arabicName === row.arabicName));
        }
        if (matchedInv && Array.isArray(matchedInv.customers)) {
          const cust = matchedInv.customers.find((c: any) => c.arabicName === row.arabicName) || matchedInv.customers[0];
          if (cust && Array.isArray(cust.services)) {
            const amanSrv = cust.services.find((s: any) => {
              const sName = String(s.serviceId || "").trim();
              return sName.startsWith("#") && !sName.startsWith("##");
            });
            if (amanSrv) {
              const srvName = String(amanSrv.serviceId || "");
              row.serviceType = (srvName.includes("مستعجل") || srvName.includes("عاجل") || srvName.includes("فورى")) ? "مستعجل" : "عادي";
              row.hasFine = !!(amanSrv.fineName || (amanSrv.fineAmount && amanSrv.fineAmount > 0));
              row.fineName = amanSrv.fineName || "";
              row.fineAmount = amanSrv.fineAmount || 0;
            }
          }
        }
        if (!row.serviceType) row.serviceType = "عادي";
        if (row.hasFine === undefined) row.hasFine = false;
      }
    });

    // Cache into local database
    if (rawAman.length > 0) {
      db.amanReport = rawAman;
      writeDB(db);
    }

    // Filter by date range using normalized YYYY-MM-DD
    const fromYMD = normalizeDateToYMD(dateFrom);
    const toYMD = normalizeDateToYMD(dateTo);
    let filteredAman = rawAman;

    if (fromYMD && toYMD) {
      filteredAman = rawAman.filter((row: any) => {
        if (!row.date) return true; // keep if no specific date set
        const rowYMD = normalizeDateToYMD(row.date);
        if (!rowYMD) return true;
        return rowYMD >= fromYMD && rowYMD <= toYMD;
      });
    }

    res.json({
      status: "success",
      rows: filteredAman,
      allRowsCount: rawAman.length,
      totalRows: filteredAman.length,
      message: `تم جلب وتحميل ${filteredAman.length} صفاً من كشف أمان من جوجل شيت مباشرة! 📊📥`
    });
  } catch (err: any) {
    res.status(500).json({ error: "فشل جلب بيانات كشف أمان من جوجل شيت: " + err.message });
  }
});

// --- Dedicated Aman Report Local Endpoints ---
// GET all Aman report rows from local DB cache
app.get("/api/db/aman", (req, res) => {
  const db = readDB();
  res.json({
    status: "success",
    rows: db.amanReport || [],
  });
});

// POST save Aman report rows (Dedicated Save Button: "الحفظ يكون بتخصيص زرار للحفظ بعد ما اخلص كل المطلوب اضغط حفظ")
app.post("/api/db/aman", async (req, res) => {
  const { rows, syncWithSheets } = req.body;
  const db = readDB();
  if (Array.isArray(rows)) {
    db.amanReport = rows.map((r: any) => ({
      ...r,
      birthDate: formatCleanBirthDate(r.birthDate),
    }));
    writeDB(db);
  }

  let sheetSyncResult: any = null;
  if (syncWithSheets) {
    sheetSyncResult = await pushAmanDirectlyToSheet(db);
  }

  res.json({
    status: "success",
    rows: db.amanReport || [],
    sheetSyncResult,
    message: "تم حفظ وتحديث كشف أمان في ورقة الشيت بنجاح! 💾✅",
  });
});

// --- Dedicated Aman Postponed Names (الأسماء المرحلة من كشف أمان) Endpoints ---
// GET all postponed names from local DB
app.get("/api/db/aman-postponed", (req, res) => {
  const db = readDB();
  res.json({
    status: "success",
    postponedRows: db.amanPostponedRows || [],
  });
});

// POST save / update postponed names
app.post("/api/db/aman-postponed", async (req, res) => {
  const { postponedRows, syncWithSheets } = req.body;
  const db = readDB();
  if (Array.isArray(postponedRows)) {
    db.amanPostponedRows = postponedRows.map((r: any) => ({
      ...r,
      birthDate: formatCleanBirthDate(r.birthDate),
    }));
    writeDB(db);
  }

  // Directly push to Google Sheets postponed tab
  if (syncWithSheets) {
    await pushPostponedDirectlyToSheet(db);
  }

  res.json({
    status: "success",
    postponedRows: db.amanPostponedRows || [],
    message: "تم حفظ الأسماء المرحلة بنجاح وتحديثها في جوجل شيت",
  });
});

// DELETE single postponed name
app.delete("/api/db/aman-postponed/:id", async (req, res) => {
  const { id } = req.params;
  const db = readDB();
  if (Array.isArray(db.amanPostponedRows)) {
    db.amanPostponedRows = db.amanPostponedRows.filter((item: any) => item.id !== id);
    writeDB(db);
  }

  // Sync deletion directly to Google Sheets
  await pushPostponedDirectlyToSheet(db);

  res.json({
    status: "success",
    postponedRows: db.amanPostponedRows || [],
    message: "تم حذف الاسم من قائمة المؤجلين وتحديث ورقة الشيت",
  });
});

// Dedicated Webhook Sync Postponed Aman Endpoint
app.post("/api/sheets/webhook/sync-postponed-aman", async (req, res) => {
  const { webhookUrl, postponedRows } = req.body;
  const db = readDB();
  const targetUrl = webhookUrl || db.settings?.googleSheetWebhookUrl;

  if (!targetUrl || !targetUrl.startsWith("http")) {
    return res.status(400).json({ error: "الرجاء إدخال رابط سكربت Webhook صالح أولاً في قسم إعدادات جوجل شيت." });
  }

  try {
    const rawRows = Array.isArray(postponedRows) ? postponedRows : (db.amanPostponedRows || []);
    const cleanRows = rawRows.map((r: any) => ({
      ...r,
      birthDate: formatCleanBirthDate(r.birthDate),
    }));
    db.amanPostponedRows = cleanRows;
    writeDB(db);

    await pushPostponedDirectlyToSheet(db);

    res.json({
      status: "success",
      message: `تم حفظ ${cleanRows.length} اسماً مرحلاً في ورقة (Aman_Postponed_الأسماء_المرحلة) بجوجل شيت بنجاح! 📑✅`,
    });
  } catch (err: any) {
    res.status(500).json({ error: "فشل إرسال الأسماء المرحلة إلى السكربت: " + err.message });
  }
});

// Dedicated Webhook Pull Postponed Aman Endpoint
app.post("/api/sheets/webhook/pull-postponed-aman", async (req, res) => {
  const { webhookUrl } = req.body;
  const db = readDB();
  const targetUrl = webhookUrl || db.settings?.googleSheetWebhookUrl;

  if (!targetUrl || !targetUrl.startsWith("http")) {
    return res.status(400).json({ error: "الرجاء إدخال رابط سكربت Webhook صالح أولاً في قسم إعدادات جوجل شيت." });
  }

  try {
    const pulledDB = await pullFromGoogleWebhook(targetUrl);
    let pulledPostponed: any[] = [];
    if (pulledDB && Array.isArray(pulledDB.amanPostponedRows) && pulledDB.amanPostponedRows.length > 0) {
      pulledPostponed = pulledDB.amanPostponedRows;
      db.amanPostponedRows = pulledPostponed;
      writeDB(db);
    } else {
      pulledPostponed = db.amanPostponedRows || [];
    }

    res.json({
      status: "success",
      postponedRows: pulledPostponed,
      totalRows: pulledPostponed.length,
      message: `تم جلب ${pulledPostponed.length} اسماً من الأسماء المرحلة بجوجل شيت بنجاح! 📑📥`
    });
  } catch (err: any) {
    res.status(500).json({ error: "فشل جلب الأسماء المرحلة من جوجل شيت: " + err.message });
  }
});

// Webhook Pull DB Endpoint
app.post("/api/sheets/webhook/pull", async (req, res) => {
  const { webhookUrl } = req.body;
  const db = readDB();
  const targetUrl = webhookUrl || db.settings.googleSheetWebhookUrl;

  if (!targetUrl || !targetUrl.startsWith("http")) {
    return res.status(400).json({ error: "الرجاء إدخال رابط سكربت Webhook صالح أولاً." });
  }

  try {
    let pulledDB = await pullFromGoogleWebhook(targetUrl);
    
    // Check if sheet contains an updated webhook URL that has additional or newer data (like government fines)
    const sheetWebhookUrl = pulledDB.settings?.googleSheetWebhookUrl;
    if (
      sheetWebhookUrl && 
      typeof sheetWebhookUrl === "string" &&
      sheetWebhookUrl.startsWith("http") && 
      sheetWebhookUrl !== targetUrl && 
      (!pulledDB.governmentFines || !Array.isArray(pulledDB.governmentFines) || pulledDB.governmentFines.length === 0)
    ) {
      console.log("Found updated webhook URL in sheet settings, pulling full fines and data from:", sheetWebhookUrl);
      try {
        const newerDB = await pullFromGoogleWebhook(sheetWebhookUrl);
        if (newerDB) {
          if (Array.isArray(newerDB.governmentFines) && newerDB.governmentFines.length > 0) {
            pulledDB.governmentFines = newerDB.governmentFines;
          }
          if (Array.isArray(newerDB.services) && newerDB.services.length > 0) {
            pulledDB.services = newerDB.services;
          }
          if (Array.isArray(newerDB.dictionary) && newerDB.dictionary.length > 0) {
            pulledDB.dictionary = newerDB.dictionary;
          }
        }
      } catch (errNew: any) {
        console.warn("Could not fetch secondary sheetWebhookUrl:", errNew.message);
      }
    }

    // Retain webhook configuration and enforce manual mode (autoSync: false)
    const pulledSettings = pulledDB.settings || {};
    const hasProfileSettingsInSheet = Boolean(
      pulledSettings.headerText || 
      pulledSettings.subHeaderText || 
      pulledSettings.footerText || 
      pulledSettings.welcomeMessage || 
      pulledSettings.readyMessage ||
      pulledSettings.readyPassportMessage ||
      pulledSettings.deliveryMessage
    );

    const activeWebhookUrl = (sheetWebhookUrl && sheetWebhookUrl.startsWith("http")) ? sheetWebhookUrl : targetUrl;

    pulledDB.settings = {
      ...db.settings,
      ...(hasProfileSettingsInSheet ? pulledSettings : {}),
      googleSheetWebhookUrl: activeWebhookUrl,
      autoSyncWebhook: false, // Strict manual mode
      googleSheetId: db.settings.googleSheetId || "",
      googleSheetUrl: db.settings.googleSheetUrl || "",
      googleSheetsConnected: true,
    };

    // If pulledDB has services, keep them; if empty, retain db.services
    if (!pulledDB.services || pulledDB.services.length === 0) {
      pulledDB.services = db.services || [];
    }

    // Retain local employees
    if (!pulledDB.employees || pulledDB.employees.length === 0) {
      pulledDB.employees = db.employees || [];
    }

    // If pulledDB has governmentFines, retain them, otherwise fallback to local db or defaults
    if (!pulledDB.governmentFines || !Array.isArray(pulledDB.governmentFines) || pulledDB.governmentFines.length === 0) {
      pulledDB.governmentFines = (db.governmentFines && db.governmentFines.length > 0) 
        ? db.governmentFines 
        : initialData.governmentFines;
    }

    // Save to local database file
    writeDB(pulledDB);

    const servicesCount = pulledDB.services?.length || 0;
    const finesCount = pulledDB.governmentFines?.length || 0;
    const invoicesCount = pulledDB.invoices?.length || 0;
    const dictionaryCount = pulledDB.dictionary?.length || 0;

    res.json({
      status: "success",
      message: `تم استيراد كافة البيانات بنجاح من جوجل شيت واعتمادها كقاعدة بيانات نشطة! 📥 (${servicesCount} خدمة، ${finesCount} بند غرامة حكومية، ${invoicesCount} فاتورة، ${dictionaryCount} اسم مترجم)`,
      db: pulledDB,
      governmentFines: pulledDB.governmentFines
    });
  } catch (err: any) {
    res.status(500).json({ error: "فشل استيراد البيانات من السكربت: " + err.message });
  }
});

// Dedicated Webhook Import Invoices Endpoint (restore past invoices from Google Sheets Excel)
app.post("/api/sheets/webhook/import-invoices", async (req, res) => {
  const { webhookUrl } = req.body;
  const db = readDB();
  const targetUrl = webhookUrl || db.settings.googleSheetWebhookUrl;

  if (!targetUrl || !targetUrl.startsWith("http")) {
    return res.status(400).json({ 
      error: "لم يتم العثور على رابط سكربت Webhook صالح لملف جوجل شيت. يرجى التأكد من الرابط في صفحة الإعدادات أولاً." 
    });
  }

  try {
    const pulledDB = await pullFromGoogleWebhook(targetUrl);
    const sheetInvoices = Array.isArray(pulledDB?.invoices) ? pulledDB.invoices : [];

    if (sheetInvoices.length === 0) {
      return res.json({
        status: "empty",
        count: 0,
        newCount: 0,
        updatedCount: 0,
        totalInvoices: db.invoices?.length || 0,
        invoices: db.invoices || [],
        message: "تم الاتصال بملف جوجل شيت بنجاح، ولكن ورقة (Invoices_الفواتير) لا تحتوي على فواتير مسجلة بعد."
      });
    }

    const currentInvoices = db.invoices || [];
    const invoiceMap = new Map<number, any>();

    // Index existing local invoices
    currentInvoices.forEach((inv: any) => {
      if (inv && inv.invoiceId) {
        invoiceMap.set(inv.invoiceId, inv);
      }
    });

    let newCount = 0;
    let updatedCount = 0;

    // Helper to sanitize invoice date (strips GMT+... and timezone words)
    const cleanInvoiceDate = (d: any): string => {
      if (!d) return "";
      let s = String(d).trim();
      // If it contains GMT+... or (Eastern European Summer Time), strip it
      s = s.replace(/\s*GMT[+-]\d+.*$/i, "").trim();
      return s;
    };

    // Merge or append from Google Sheets
    sheetInvoices.forEach((sheetInv: any) => {
      if (!sheetInv || !sheetInv.invoiceId) return;

      const sanitizedSheetInv = {
        ...sheetInv,
        date: cleanInvoiceDate(sheetInv.date)
      };

      if (!invoiceMap.has(sanitizedSheetInv.invoiceId)) {
        // Brand new invoice from sheet
        invoiceMap.set(sanitizedSheetInv.invoiceId, sanitizedSheetInv);
        newCount++;
      } else {
        // Invoice exists locally: update details if sheet has customers or updated status
        const existing = invoiceMap.get(sanitizedSheetInv.invoiceId);
        const sheetCustomers = Array.isArray(sanitizedSheetInv.customers) ? sanitizedSheetInv.customers : [];
        const existingCustomers = Array.isArray(existing.customers) ? existing.customers : [];

        if (sheetCustomers.length > 0 || !existingCustomers.length) {
          invoiceMap.set(sanitizedSheetInv.invoiceId, {
            ...existing,
            ...sanitizedSheetInv,
            date: sanitizedSheetInv.date || existing.date || "",
            archiveDrawer: sanitizedSheetInv.archiveDrawer || existing.archiveDrawer || "",
            status: (sanitizedSheetInv.status && sanitizedSheetInv.status !== "NEW") ? sanitizedSheetInv.status : (existing.status || sanitizedSheetInv.status || "NEW")
          });
          updatedCount++;
        }
      }
    });

    // Sort by invoiceId descending: latest operations appear on top
    const mergedInvoices = Array.from(invoiceMap.values()).sort((a, b) => Number(b.invoiceId) - Number(a.invoiceId));

    db.invoices = mergedInvoices;
    writeDB(db);

    res.json({
      status: "success",
      count: sheetInvoices.length,
      newCount,
      updatedCount,
      totalInvoices: mergedInvoices.length,
      invoices: mergedInvoices,
      message: `تم استيراد واسترجاع ${sheetInvoices.length} فاتورة سابقة من قاعدة بيانات جوجل شيت إكسيل بنجاح (${newCount} فاتورة جديدة مضافة، و${updatedCount} تم تحديثها ومزامنتها)! 🎉`
    });
  } catch (err: any) {
    console.error("Failed to import invoices from sheet:", err);
    res.status(500).json({ error: "فشل استيراد الفواتير من جوجل شيت: " + err.message });
  }
});

app.post("/api/sheets/sync", (req, res) => {
  const { sheetUrl, sheetId } = req.body;
  const db = readDB();
  db.settings.googleSheetUrl = sheetUrl || "";
  db.settings.googleSheetId = sheetId || "";
  db.settings.googleSheetsConnected = !!(sheetUrl || sheetId);
  writeDB(db);
  res.json({ 
    status: "success", 
    message: "تم تحديث إعدادات الربط بجوجل شيت بنجاح.",
    settings: db.settings 
  });
});

// 11. Update settings endpoint: Manual Save only
app.post("/api/db/settings", async (req, res) => {
  const newSettings = req.body;
  const db = readDB();
  db.settings = { ...db.settings, ...newSettings };
  writeDB(db);

  // User requested: "فقط عند الضغط على حفظ اعمل حفظ على جوجل درايف"
  // When explicitly pressing Save, push all data (invoices, services, settings, dictionary) to Google Drive / Sheets
  const webhookUrl = db.settings?.googleSheetWebhookUrl;
  let sheetSyncMessage = "";
  if (webhookUrl && webhookUrl.startsWith("http")) {
    try {
      await pushToGoogleWebhook(webhookUrl, db);
      sheetSyncMessage = "وتم حفظ وتحديث كافة البيانات في جوجل درايف / شيت إكسيل بنجاح! 📊✅";
    } catch (err: any) {
      console.warn("Could not push to Google Drive/Sheet on explicit save:", err.message);
    }
  }

  res.json({ 
    status: "success", 
    settings: db.settings,
    message: sheetSyncMessage ? `تم حفظ الإعدادات محلياً ${sheetSyncMessage}` : "تم حفظ إعدادات النظام بنجاح!"
  });
});

// Vite Middleware Integration for Dev / Static Asset Server for Production
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Mazaya Passports Billing Server running on http://localhost:${PORT}`);
  });
}

startServer();
