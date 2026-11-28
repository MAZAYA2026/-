import express from "express";
import path from "path";
import fs from "fs";
import dotenv from "dotenv";
import { GoogleGenAI, Type, ThinkingLevel } from "@google/genai";

// Load environment variables
dotenv.config();

const app = express();
const PORT = Number(process.env.DEFAULT_APP_PORT || process.env.PORT) || 3000;

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// Initialize Gemini client if API key is available
const geminiApiKey = process.env.GEMINI_API_KEY || "";
let ai: GoogleGenAI | null = null;

if (geminiApiKey && geminiApiKey !== "MY_GEMINI_API_KEY") {
  try {
    ai = new GoogleGenAI({
      apiKey: geminiApiKey,
      apiVersion: "v1beta",
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
    if (!parsed.amanReport || !Array.isArray(parsed.amanReport)) {
      parsed.amanReport = [];
    }
    if (!parsed.potentialCustomers || !Array.isArray(parsed.potentialCustomers)) {
      parsed.potentialCustomers = [];
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

// NOTE: Custom English name edits on passport invoices are strictly temporary for that specific customer/invoice
// and must NEVER modify, overwrite, or auto-sync db.dictionary or Google Sheets.
// Dictionary modifications occur ONLY through explicit dictionary management routes (/api/db/dictionary).

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

async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number = 15000): Promise<Response> {
  const controller = new AbortController();
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      fetch(url, { ...options, signal: controller.signal }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new Error("انتهت مهلة الاتصال بجوجل شيت (Timeout)"));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// Shared helper: Sync employees & login credentials to Google Sheets Apps Script cleanly with strict error checking
async function syncEmployeesListToWebhook(targetUrl: string, db: any): Promise<{
  sheetSynced: boolean;
  needsScriptUpdate?: boolean;
  sheetError?: string;
  count: number;
  message: string;
}> {
  const employees = db.employees || [];
  if (!targetUrl || !targetUrl.startsWith("http")) {
    return {
      sheetSynced: false,
      count: employees.length,
      sheetError: "لم يتم ضبط رابط سكربت جوجل شيت (Webhook URL) في الإعدادات.",
      message: "تم الحفظ في الخادم المحلي فقط (رابط جوجل شيت غير مضبوط)."
    };
  }

  try {
    const response = await fetchWithTimeout(targetUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        action: "push_employees",
        employees: employees,
        db: { employees: employees }
      }),
      redirect: "follow",
    }, 15000);

    const text = await response.text();
    let data: any = null;
    try {
      data = JSON.parse(text);
    } catch {
      if (text.includes("Script function not found")) {
        return {
          sheetSynced: false,
          needsScriptUpdate: true,
          count: employees.length,
          sheetError: "دالة الحفظ غير منشورة في Apps Script (Script function not found: doPost). يرجى نشر إصدار جديد (Deploy > New version).",
          message: "تم الحفظ محلياً فقط — يرجى تحديث نشر كود Apps Script في جوجل شيت."
        };
      }
      if (text.includes("Authorization is required") || text.includes("accounts.google.com")) {
        return {
          sheetSynced: false,
          count: employees.length,
          sheetError: "السكربت يتطلب صلاحية وصول (Who has access = Anyone).",
          message: "تم الحفظ محلياً فقط — تعذر الوصول لجوجل شيت بسبب صلاحيات السكربت."
        };
      }
      if (text.includes("<!DOCTYPE") || text.includes("<html")) {
        return {
          sheetSynced: false,
          count: employees.length,
          sheetError: "الرابط أرجع صفحة خطأ من جوجل بدلاً من استجابة السكربت. تأكد من رابط Web App URL.",
          message: "تم الحفظ محلياً فقط — استجابة غير صالحة من جوجل شيت."
        };
      }
    }

    const isUnknownAction =
      text.includes("غير معروف") ||
      text.includes("Unknown action") ||
      (data && data.error && (String(data.error).includes("غير معروف") || String(data.error).includes("Unknown")));

    if (isUnknownAction) {
      console.log("push_employees not recognized by older Apps Script, falling back to full push...");
      try {
        await pushToGoogleWebhook(targetUrl, db);
        // Verify whether the deployed script actually wrote Employees_الموظفين_والصلاحيات
        try {
          const pulledCheck = await pullFromGoogleWebhook(targetUrl);
          if (Array.isArray(pulledCheck?.employees) && pulledCheck.employees.length > 0) {
            return {
              sheetSynced: true,
              count: employees.length,
              message: `تم تسجيل وتأكيد حفظ ${employees.length} حساب موظف وصلاحياتهم في ورقة (Employees_الموظفين_والصلاحيات) بملف جوجل درايف بنجاح! 👥✅`
            };
          }
        } catch {}
        return {
          sheetSynced: false,
          needsScriptUpdate: true,
          count: employees.length,
          sheetError: "كود Apps Script المنشور حالياً في جوجل شيت من إصدار قديم لا يدعم ورقة الموظفين (Employees_الموظفين_والصلاحيات). يرجى نسخ كود السكربت المحدث من قسم إعدادات جوجل شيت ثم عمل (Deploy > New version).",
          message: "تم الحفظ في الخادم المحلي، لكن كود Apps Script في جوجل شيت قديم ويحتاج تحديثاً لحفظ ورقة الموظفين."
        };
      } catch (fbErr: any) {
        return {
          sheetSynced: false,
          count: employees.length,
          sheetError: fbErr.message || "فشل تحديث بيانات الموظفين في جوجل شيت.",
          message: "تم الحفظ محلياً فقط — تعذر الإرسال إلى جوجل شيت."
        };
      }
    }

    if (data && data.error) {
      return {
        sheetSynced: false,
        count: employees.length,
        sheetError: String(data.error),
        message: "تم الحفظ محلياً فقط — خطأ من سكربت جوجل شيت: " + String(data.error)
      };
    }

    return {
      sheetSynced: true,
      count: employees.length,
      message: data?.message || `تم حفظ وتحديث ${employees.length} حساب موظف وصلاحيات الدخول في ورقة (Employees_الموظفين_والصلاحيات) بملف جوجل درايف بنجاح! 👥✅`
    };
  } catch (sheetErr: any) {
    console.warn("Could not sync employees to Google Sheets:", sheetErr.message);
    return {
      sheetSynced: false,
      count: employees.length,
      sheetError: sheetErr.message || "تعذر الاتصال برابط جوجل شيت.",
      message: "تم الحفظ محلياً، وتعذر الاتصال بجوجل شيت حالياً: " + (sheetErr.message || "")
    };
  }
}

// Dedicated Update Employees Endpoint with immediate Google Sheet Sync
app.post("/api/db/employees", async (req, res) => {
  const { employees } = req.body;
  if (!Array.isArray(employees)) {
    return res.status(400).json({ error: "بيانات الموظفين غير صالحة" });
  }

  const normalizedEmployees = employees
    .filter((emp: any) => emp && typeof emp.username === "string" && emp.username.trim().length > 0)
    .map((emp: any) => ({
      username: emp.username.trim(),
      name: (emp.name || emp.username).toString().trim(),
      role: emp.role === "admin" ? "admin" : "employee",
      ...(emp.password && String(emp.password).trim() ? { password: String(emp.password).trim() } : {}),
      permissions: {
        canCreateInvoices: emp.permissions?.canCreateInvoices !== false,
        canEditInvoices: emp.permissions?.canEditInvoices !== false,
        canViewCollection: emp.role === "admin" ? true : Boolean(emp.permissions?.canViewCollection),
        canManageServices: emp.role === "admin" ? true : Boolean(emp.permissions?.canManageServices),
        canViewAmanReport: emp.permissions?.canViewAmanReport !== false,
      },
    }));

  const db = readDB();
  db.employees = normalizedEmployees;
  writeDB(db);

  const targetUrl = db.settings?.googleSheetWebhookUrl;
  const syncResult = await syncEmployeesListToWebhook(targetUrl, db);

  res.json({
    status: "success",
    message: syncResult.sheetSynced
      ? `تم تحديث وحفظ بيانات وصلاحيات الموظفين محلياً وفي جوجل شيت بنجاح! 👥☁️✅`
      : `تم الحفظ في الخادم المحلي! ⚠️ (${syncResult.sheetError || syncResult.message})`,
    employees: db.employees,
    sheetSynced: syncResult.sheetSynced,
    needsScriptUpdate: Boolean(syncResult.needsScriptUpdate),
    sheetError: syncResult.sheetError,
  });
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
    const postponed = (db.amanPostponedRows || []).map((r: any) => ({
      ...r,
      birthDate: formatCleanBirthDate(r.birthDate),
    }));

    const res = await fetch(targetUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        action: "push_postponed_aman",
        postponedRows: postponed,
        amanPostponedRows: postponed,
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
          amanPostponedRows: postponed,
          postponedRows: postponed,
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

// Atomic helper to push BOTH Aman Report and Postponed Aman to Google Sheets in one operation
async function pushAmanAndPostponedDirectlyToSheet(db: any): Promise<boolean> {
  const targetUrl = db.settings?.googleSheetWebhookUrl;
  if (!targetUrl || !targetUrl.startsWith("http")) return false;

  const cleanAman = (db.amanReport || []).map((r: any) => ({
    ...r,
    birthDate: formatCleanBirthDate(r.birthDate),
  }));
  const cleanPostponed = (db.amanPostponedRows || []).map((r: any) => ({
    ...r,
    birthDate: formatCleanBirthDate(r.birthDate),
  }));

  try {
    const res = await fetch(targetUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        action: "sync_aman_and_postponed",
        amanRows: cleanAman,
        postponedRows: cleanPostponed,
        amanPostponedRows: cleanPostponed,
      }),
      redirect: "follow",
    });

    const text = await res.text();
    let result: any = null;
    try {
      result = JSON.parse(text);
    } catch {}

    // Fallback if older deployed Apps Script doesn't recognize sync_aman_and_postponed yet
    if (text.includes("غير معروف") || text.includes("Unknown action") || (result && result.error && String(result.error).includes("غير معروف"))) {
      console.log("sync_aman_and_postponed not supported by remote Apps Script, performing sequential push...");
      const p1 = await pushAmanDirectlyToSheet(db);
      await new Promise(res => setTimeout(res, 500));
      const p2 = await pushPostponedDirectlyToSheet(db);
      return p1 || p2;
    }
    return true;
  } catch (err: any) {
    console.warn("Combined Aman & Postponed sheet push notice:", err.message);
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

// Egyptian 14-digit National ID Parser & Age Calculator
function parseEgyptianNationalId(nid: string) {
  if (!nid) return null;
  const clean = nid.replace(/[٠-٩]/g, d => "٠١٢٣٤٥٦٧٨٩".indexOf(d).toString()).replace(/\D/g, "");
  if (clean.length !== 14) return null;
  const century = parseInt(clean[0]);
  const year = parseInt(clean.substring(1, 3));
  const month = parseInt(clean.substring(3, 5));
  const day = parseInt(clean.substring(5, 7));
  const fullYear = (century === 2 ? 1900 : century === 3 ? 2000 : 1900) + year;
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  const birthDate = `${fullYear}-${mm}-${dd}`;
  const gender = parseInt(clean[12]) % 2 === 1 ? "ذكر" : "أنثى";

  const today = new Date();
  let age = today.getFullYear() - fullYear;
  const m = today.getMonth() - (month - 1);
  if (m < 0 || (m === 0 && today.getDate() < day)) {
    age--;
  }

  return { birthDate, gender, age, cleanNid: clean };
}

// Helper to directly push Potential Customers to Google Sheets
async function pushPotentialCustomersDirectlyToSheet(db: any): Promise<boolean> {
  const targetUrl = db.settings?.googleSheetWebhookUrl;
  if (!targetUrl || !targetUrl.startsWith("http")) return false;

  try {
    const list = db.potentialCustomers || [];
    const res = await fetch(targetUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        action: "push_potential_customers",
        potentialCustomers: list,
        db: { potentialCustomers: list }
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
          potentialCustomers: list
        }),
        redirect: "follow",
      });
    }
    return true;
  } catch (err: any) {
    console.warn("Direct Google Sheet potential customers push notice:", err.message);
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
      const isUrgent = srvName.includes("مستعجل") || srvName.includes("عاجل") || srvName.includes("سريع") || srvName.includes("فورى");
      const fineName = (amanSrv.fineName || "").trim();
      const fineAmt = Number(amanSrv.fineAmount) || 0;
      const hasFine = !!(fineName || fineAmt > 0);

      // User requirement: In notes column, do NOT put profession, and if no fines do NOT write 'لا توجد غرامة'
      let finePart = "";
      if (hasFine) {
        const cleanName = fineName || "غرامة حكومية";
        finePart = cleanName.startsWith("غرامة") ? cleanName : `غرامة ${cleanName}`;
      }
      const noteText = finePart ? `${isUrgent ? "سريع" : "عادي"} - ${finePart}` : (isUrgent ? "سريع" : "عادي");

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
        serviceType: isUrgent ? "سريع" : "عادي",
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

// Bootstrap Aman report from invoices if empty
(() => {
  try {
    const db = readDB();
    if ((!db.amanReport || db.amanReport.length === 0) && db.invoices && db.invoices.length > 0) {
      db.invoices.forEach((inv: any) => syncInvoiceToAmanReport(inv, db));
      writeDB(db);
    }
  } catch (err) {
    console.error("Error bootstrapping Aman report from invoices:", err);
  }
})();

// 4. Create invoice endpoint: Records directly to Google Sheet
app.post("/api/db/invoices", async (req, res) => {
  const db = readDB();
  const invoiceData = req.body;
  
  // Server-side duplicate suppression: prevent accidental rapid double-posting
  if (Array.isArray(db.invoices) && db.invoices.length > 0) {
    const recentInvoice = db.invoices[db.invoices.length - 1];
    const isSameEmployee = recentInvoice.employeeName === invoiceData.employeeName;
    const isSameTotal = Number(recentInvoice.totalAmount) === Number(invoiceData.totalAmount);
    const recentCustCount = recentInvoice.customers?.length || 0;
    const newCustCount = invoiceData.customers?.length || 0;

    if (isSameEmployee && isSameTotal && recentCustCount === newCustCount && newCustCount > 0) {
      const firstRecent = recentInvoice.customers[0];
      const firstNew = invoiceData.customers[0];
      const isSameName = (firstRecent?.arabicName || "").trim() === (firstNew?.arabicName || "").trim();
      const isSameNid = (firstRecent?.nationalId || "").trim() === (firstNew?.nationalId || "").trim();

      if (isSameName && isSameNid) {
        console.warn(`[Duplicate Suppressed] Ignored duplicate invoice submission for customer ${firstNew?.arabicName}, returning existing invoice #${recentInvoice.invoiceId}`);
        return res.json({ status: "success", invoice: recentInvoice, isDuplicateSuppressed: true, sheetSynced: true });
      }
    }
  }

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

  // Keep per-customer English name edits isolated to this invoice only; never overwrite db.dictionary.

  // User requirement: Automatically register services starting with # into Aman Report
  const amanModified = syncInvoiceToAmanReport(newInvoice, db);

  // User explicit requirement: Automatically delete potential customers once registered in an invoice
  // "عايز بعد استخدام العملاء المحتملين فى الفواتير يتم حذفهم من العملاء المحتملين علشان كدا خلاص تم الانتهاء من الغرض منهم وتسجيلهم بنجاح فى فواتير"
  let potentialModified = false;
  if (Array.isArray(db.potentialCustomers) && Array.isArray(newInvoice.customers) && db.potentialCustomers.length > 0) {
    const originalCount = db.potentialCustomers.length;
    const invNids = new Set(
      newInvoice.customers
        .map((c: any) => (c.nationalId || "").toString().trim())
        .filter((nid: string) => nid.length >= 10)
    );
    const invNames = new Set(
      newInvoice.customers
        .map((c: any) => (c.arabicName || "").toString().trim())
        .filter((name: string) => name.length >= 3)
    );

    db.potentialCustomers = db.potentialCustomers.filter((p: any) => {
      const pNid = (p.nationalId || "").toString().trim();
      const pName = (p.arabicName || "").toString().trim();
      const matchNid = pNid && invNids.has(pNid);
      const matchName = pName && invNames.has(pName);
      return !(matchNid || matchName);
    });

    if (db.potentialCustomers.length !== originalCount) {
      potentialModified = true;
      console.log(`[Potential Customers] Deleted ${originalCount - db.potentialCustomers.length} potential customer(s) registered in Invoice #${nextInvoiceId}`);
    }
  }

  writeDB(db);

  // User explicit requirement: "الفواتير التى تنفذ يتم تسجيلها مباشرة على جوجل شيت وليس تسجيل محلى فقط"
  const pushed = await pushInvoicesDirectlyToSheet(db);

  // User explicit requirement: "عند عمل الفواتير التى تبدأ ب# قم بتسجيل البيانات المطلوب لورقة امان فى ورقة الشيت الخاصة بذلك"
  if (amanModified) {
    await pushAmanDirectlyToSheet(db);
  }

  if (potentialModified) {
    pushPotentialCustomersDirectlyToSheet(db).catch(err =>
      console.warn("Background potential customers sheet push notice:", err.message)
    );
  }

  res.json({ 
    status: "success", 
    invoice: newInvoice, 
    sheetSynced: pushed,
    potentialCustomers: db.potentialCustomers || []
  });
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
  
  // Keep per-customer English name edits isolated to this invoice only; never overwrite db.dictionary.

  // User requirement: Automatically register services starting with # into Aman Report
  const amanUpdated = syncInvoiceToAmanReport(db.invoices[index], db);

  writeDB(db);

  // Return response immediately so frontend interactions are instantaneous
  res.json({ status: "success", invoice: db.invoices[index] });

  // Record directly on Google Sheet in background without delaying client response
  pushInvoicesDirectlyToSheet(db).catch((err: any) =>
    console.warn("Background invoices sheet push notice:", err.message)
  );

  if (amanUpdated) {
    pushAmanDirectlyToSheet(db).catch((err: any) =>
      console.warn("Background aman sheet push notice:", err.message)
    );
  }
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

// Helper to get Google OAuth2 Bearer token from request authorization header
function getGoogleAuthClient(req: any): { accessToken: string } | null {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }
  const token = authHeader.split(" ")[1];
  if (!token) return null;
  return { accessToken: token };
}

async function googleApiFetch(url: string, accessToken: string, options: RequestInit = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  let json: any = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    const errMsg = json?.error?.message || text || `HTTP ${res.status}`;
    throw new Error(errMsg);
  }
  return json;
}

// Ensure Google Spreadsheet has the correct sheets/tabs and returns its details
async function ensureSpreadsheetExists(authClient: { accessToken: string }, spreadsheetId?: string) {
  let targetId = spreadsheetId;
  let targetUrl = "";

  if (targetId) {
    try {
      // Check if file exists in drive
      const file = await googleApiFetch(
        `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(targetId)}`,
        authClient.accessToken
      );
      if (file && file.id) {
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
    const created = await googleApiFetch(
      `https://sheets.googleapis.com/v4/spreadsheets?fields=spreadsheetId,spreadsheetUrl`,
      authClient.accessToken,
      {
        method: "POST",
        body: JSON.stringify(resource),
      }
    );
    targetId = created.spreadsheetId || "";
    targetUrl = created.spreadsheetUrl || "";
    console.log("Created new Google Sheet:", targetId);

    // Batch update to rename/add sheets
    try {
      await googleApiFetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(targetId)}:batchUpdate`,
        authClient.accessToken,
        {
          method: "POST",
          body: JSON.stringify({
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
          })
        }
      );
      console.log("Configured tabs in new Google Sheet.");
    } catch (batchErr) {
      console.error("Error creating tabs:", batchErr);
    }
  }

  return { spreadsheetId: targetId, spreadsheetUrl: targetUrl };
}

// Push local data to Google Sheets
async function pushDataToSheets(authClient: { accessToken: string }, spreadsheetId: string, db: any) {

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
      await googleApiFetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(r)}:clear`,
        authClient.accessToken,
        {
          method: "POST",
          body: "{}",
        }
      );
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

  await googleApiFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values:batchUpdate`,
    authClient.accessToken,
    {
      method: "POST",
      body: JSON.stringify({
        valueInputOption: "RAW",
        data: dataToUpdate
      }),
    }
  );
}

// Pull data from Google Sheets
async function pullDataFromSheets(authClient: { accessToken: string }, spreadsheetId: string) {
  const ranges = [
    "Settings!A1:B100",
    "Services!A1:H1000",
    "Invoices!A1:M50000",
    "Employees!A1:I100",
    "CollectionClosings!A1:F5000",
    "Dictionary!A1:B10000"
  ];
  const params = new URLSearchParams();
  for (const r of ranges) {
    params.append("ranges", r);
  }
  const responseData = await googleApiFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values:batchGet?${params.toString()}`,
    authClient.accessToken
  );

  const valueRanges = responseData.valueRanges || [];
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
    const response = await fetchWithTimeout(webhookUrl, {
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
        amanPostponedRows: db.amanPostponedRows || [],
        employees: db.employees || []
      }),
      redirect: "follow",
    }, 25000);

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
    const response = await fetchWithTimeout(webhookUrl, {
      method: "GET",
      redirect: "follow",
    }, 25000);

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

// Dedicated Webhook Sync Employees Endpoint
app.post("/api/sheets/webhook/sync-employees", async (req, res) => {
  const { webhookUrl } = req.body;
  const db = readDB();
  const targetUrl = webhookUrl || db.settings.googleSheetWebhookUrl;

  if (!targetUrl || !targetUrl.startsWith("http")) {
    return res.status(400).json({ error: "الرجاء إدخال رابط سكربت Webhook صالح أولاً في قسم إعدادات جوجل شيت." });
  }

  const syncResult = await syncEmployeesListToWebhook(targetUrl, db);
  if (!syncResult.sheetSynced) {
    return res.status(syncResult.needsScriptUpdate ? 400 : 500).json({
      error: syncResult.sheetError || syncResult.message,
      needsScriptUpdate: Boolean(syncResult.needsScriptUpdate),
      savedInSheet: false
    });
  }

  return res.json({
    status: "success",
    savedInSheet: true,
    count: syncResult.count,
    message: syncResult.message
  });
});

// Dedicated Webhook Pull Employees Endpoint
app.post("/api/sheets/webhook/pull-employees", async (req, res) => {
  const { webhookUrl } = req.body;
  const db = readDB();
  const targetUrl = webhookUrl || db.settings.googleSheetWebhookUrl;

  if (!targetUrl || !targetUrl.startsWith("http")) {
    return res.status(400).json({ error: "الرجاء إدخال رابط سكربت Webhook صالح أولاً في قسم إعدادات جوجل شيت." });
  }

  try {
    const pulledDB = await pullFromGoogleWebhook(targetUrl);
    if (pulledDB && Array.isArray(pulledDB.employees) && pulledDB.employees.length > 0) {
      // Merge with existing passwords if pulled sheet didn't include password
      const mergedEmployees = pulledDB.employees.map((pEmp: any) => {
        const pUName = String(pEmp.username || "").trim().toLowerCase();
        const local = (db.employees || []).find((e: any) => String(e.username || "").trim().toLowerCase() === pUName);
        return {
          ...pEmp,
          password: (pEmp.password && String(pEmp.password).trim()) ? String(pEmp.password).trim() : (local?.password || "")
        };
      });
      db.employees = mergedEmployees;
      writeDB(db);

      return res.json({
        status: "success",
        message: `تم استيراد وتحديث ${mergedEmployees.length} حساب موظف وصلاحياتهم من شيت جوجل درايف بنجاح! 📥`,
        employees: mergedEmployees,
        count: mergedEmployees.length
      });
    }

    return res.json({
      status: "success",
      message: "لم يتم العثور على موظفين في شيت جوجل درايف، تم الاحتفاظ بالموظفين الحاليين.",
      employees: db.employees || [],
      count: db.employees?.length || 0
    });
  } catch (err: any) {
    res.status(500).json({ error: "فشل استيراد بيانات الموظفين من السكربت: " + err.message });
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
            const isUrgent = srvName.includes("مستعجل") || srvName.includes("عاجل") || srvName.includes("سريع") || srvName.includes("فورى");
            const hasFine = !!(amanSrv.fineName || (amanSrv.fineAmount && amanSrv.fineAmount > 0));
            extracted.push({
              id: `inv-${inv.invoiceId}-c-${cIdx}`,
              arabicName: cust.arabicName || "",
              birthDate: cust.birthDate || "",
              notes: amanSrv.notes || "",
              invoiceId: inv.invoiceId,
              customerIndex: cIdx,
              date: inv.date || "",
              serviceType: isUrgent ? "سريع" : "عادي",
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

    // Index local aman rows by invoiceId or name to preserve passportSerial
    const localAmanMap = new Map<string, any>();
    if (Array.isArray(db.amanReport)) {
      db.amanReport.forEach((r: any) => {
        if (r.invoiceId) localAmanMap.set(`inv-${r.invoiceId}-${r.customerIndex ?? 0}`, r);
        if (r.arabicName) localAmanMap.set(`name-${r.arabicName.trim()}`, r);
      });
    }

    rawAman.forEach((row: any) => {
      // Retain or restore passportSerial
      if (!row.passportSerial) {
        const local = (row.invoiceId ? localAmanMap.get(`inv-${row.invoiceId}-${row.customerIndex ?? 0}`) : null) ||
                      (row.arabicName ? localAmanMap.get(`name-${row.arabicName.trim()}`) : null);
        if (local && local.passportSerial) {
          row.passportSerial = local.passportSerial;
        } else {
          row.passportSerial = "";
        }
      }

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
              row.serviceType = (srvName.includes("مستعجل") || srvName.includes("عاجل") || srvName.includes("سريع") || srvName.includes("فورى")) ? "سريع" : "عادي";
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
  const { rows, postponedRows, syncWithSheets } = req.body;
  const db = readDB();
  if (Array.isArray(rows)) {
    db.amanReport = rows.map((r: any) => ({
      ...r,
      birthDate: formatCleanBirthDate(r.birthDate),
    }));
  }
  if (Array.isArray(postponedRows)) {
    db.amanPostponedRows = postponedRows.map((r: any) => ({
      ...r,
      birthDate: formatCleanBirthDate(r.birthDate),
    }));
  }
  writeDB(db);

  let sheetSyncResult: any = null;
  if (syncWithSheets) {
    if (Array.isArray(postponedRows)) {
      sheetSyncResult = await pushAmanAndPostponedDirectlyToSheet(db);
    } else {
      sheetSyncResult = await pushAmanDirectlyToSheet(db);
    }
  }

  res.json({
    status: "success",
    rows: db.amanReport || [],
    postponedRows: db.amanPostponedRows || [],
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

// ATOMIC: Cut row from Aman Report and transfer to Postponed sheet
app.post("/api/db/aman-cut-and-postpone", async (req, res) => {
  const { activeRows, postponedRows } = req.body;
  const db = readDB();

  if (Array.isArray(activeRows)) {
    db.amanReport = activeRows.map((r: any) => ({
      ...r,
      birthDate: formatCleanBirthDate(r.birthDate),
    }));
  }
  if (Array.isArray(postponedRows)) {
    db.amanPostponedRows = postponedRows.map((r: any) => ({
      ...r,
      birthDate: formatCleanBirthDate(r.birthDate),
    }));
  }
  writeDB(db);

  const sheetSynced = await pushAmanAndPostponedDirectlyToSheet(db);

  res.json({
    status: "success",
    sheetSynced,
    activeRows: db.amanReport,
    postponedRows: db.amanPostponedRows,
    message: sheetSynced 
      ? "تم ترحيل الاسم وتحديث ورقة كشف أمان وورقة الأسماء المرحلة بملف الشيت بنجاح! ✂️📑"
      : "تم ترحيل الاسم محلياً بقاعدة البيانات.",
  });
});

// ATOMIC: Insert postponed item into Aman Report
app.post("/api/db/aman-insert-postponed", async (req, res) => {
  const { activeRows, postponedRows } = req.body;
  const db = readDB();

  if (Array.isArray(activeRows)) {
    db.amanReport = activeRows.map((r: any) => ({
      ...r,
      birthDate: formatCleanBirthDate(r.birthDate),
    }));
  }
  if (Array.isArray(postponedRows)) {
    db.amanPostponedRows = postponedRows.map((r: any) => ({
      ...r,
      birthDate: formatCleanBirthDate(r.birthDate),
    }));
  }
  writeDB(db);

  const sheetSynced = await pushAmanAndPostponedDirectlyToSheet(db);

  res.json({
    status: "success",
    sheetSynced,
    activeRows: db.amanReport,
    postponedRows: db.amanPostponedRows,
    message: sheetSynced 
      ? "تم إدراج الاسم في كشف أمان وتحديث ورقة كشف أمان والأسماء المرحلة بنجاح! 📑✅"
      : "تم إدراج الاسم في كشف أمان محلياً بقاعدة البيانات.",
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

    // Merge or retain employees
    if (!pulledDB.employees || pulledDB.employees.length === 0) {
      pulledDB.employees = db.employees || [];
    } else {
      pulledDB.employees = pulledDB.employees.map((pEmp: any) => {
        const pUName = String(pEmp.username || "").trim().toLowerCase();
        const local = (db.employees || []).find((e: any) => String(e.username || "").trim().toLowerCase() === pUName);
        return {
          ...pEmp,
          password: (pEmp.password && String(pEmp.password).trim()) ? String(pEmp.password).trim() : (local?.password || "")
        };
      });
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

// ========================================================
// 🎯 Potential Customers & AI Document OCR Endpoints
// ========================================================

// 1. AI Document Scanner (Egyptian National ID & Birth Certificate)
app.post("/api/ocr/scan-document", async (req, res) => {
  const { image, documentType } = req.body;
  if (!image) {
    return res.status(400).json({ error: "لم يتم استلام صورة المستند للمسح" });
  }

  let mimeType = "image/jpeg";
  let base64Data = image;

  if (image.startsWith("data:")) {
    const parts = image.split(";base64,");
    if (parts.length === 2) {
      mimeType = parts[0].replace("data:", "").split(";")[0] || "image/jpeg";
      base64Data = parts[1];
    }
  }

  if (!ai) {
    return res.status(503).json({
      error: "ميزة المسح الذكي بالذكاء الاصطناعي تتطلب ضبط GEMINI_API_KEY بالخادم."
    });
  }

  try {
    let prompt = "";
    if (documentType === "national_id_front") {
      prompt = `أنت نظام ذكي رسمي لاستخراج البيانات من وجه بطاقة الرقم القومي المصرية (Egyptian National ID Card - Front).
اقرأ البيانات واستخرج التالي وأرجعه حصراً بصيغة كائن JSON بدون أي ماركداون:
{
  "arabicName": "الاسم الرباعي أو الخماسي المكتوب باللغة العربية على البطاقة",
  "nationalId": "الرقم القومي المكون من 14 رقماً بالضبط بأرقام إنجليزية (0-9)"
}
قواعد دقيقة:
1. الرقم القومي 14 رقم بالضبط بدون مسافات.
2. الاسم يجب أن يكون باللغة العربية كاملاً.`;
    } else if (documentType === "national_id_back") {
      prompt = `أنت نظام ذكي رسمي لاستخراج البيانات من ظهر بطاقة الرقم القومي المصرية (Egyptian National ID Card - Back).
اقرأ المهنة والوظيفة المكتوبة بخلف البطاقة المصرية واستخرجها وأرجع كائن JSON حصراً:
{
  "profession": "المهنة أو الوظيفة المكتوبة باللغة العربية بحد أقصى 32 حرف (مثل: حاصل على بكالوريوس تجارة، مهندس، ربة منزل، محاسب، طالب، عامل، مدرس، طبيب، سائق، بدون عمل، إلخ)"
}`;
    } else if (documentType === "birth_certificate") {
      prompt = `أنت نظام ذكي رسمي لاستخراج البيانات من شهادة الميلاد المصرية المميكنة (Egyptian Birth Certificate).
اقرأ البيانات واستخرج التالي وأرجع كائن JSON حصراً:
{
  "arabicName": "الاسم الكامل للمولود باللغة العربية",
  "nationalId": "الرقم القومي للمولود المكون من 14 رقماً بالضبط بأرقام إنجليزية (0-9)",
  "birthDate": "تاريخ الميلاد بصيغة YYYY-MM-DD"
}
قواعد:
1. استخرج الاسم والرقم القومي 14 رقم بدقة.`;
    } else {
      prompt = `أنت قارئ مستندات رسمي مصري (بطاقة رقم قومي أو شهادة ميلاد). استخرج الاسم والرقم القومي والمهنة إن وجدت وأرجع كائن JSON:
{
  "arabicName": "الاسم بالعربي",
  "nationalId": "الرقم القومي 14 رقم",
  "profession": "المهنة إن وجدت"
}`;
    }

    const imagePart = {
      inlineData: {
        mimeType: mimeType || "image/jpeg",
        data: base64Data
      }
    };
    const textPart = { text: prompt };

    // Ultra-fast Gemini Vision OCR using gemini-3.1-flash-lite with JSON response constraint
    const candidateModels = ["gemini-3.1-flash-lite", "gemini-flash-latest", "gemini-3.8-flash"];
    let aiResponse: any = null;
    let lastError: any = null;

    for (const modelName of candidateModels) {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          aiResponse = await ai.models.generateContent({
            model: modelName,
            contents: { parts: [imagePart, textPart] },
            config: {
              responseMimeType: "application/json",
            }
          });
          if (aiResponse && aiResponse.text) {
            break;
          }
        } catch (err: any) {
          lastError = err;
          const errMsg = err?.message || JSON.stringify(err);
          const isTransient = errMsg.includes("503") || errMsg.includes("UNAVAILABLE") || errMsg.includes("429") || errMsg.includes("high demand");
          if (isTransient && attempt === 0) {
            console.warn(`[OCR Retry] ${modelName} encountered spike (503/429), retrying in 500ms...`);
            await new Promise((r) => setTimeout(r, 500));
            continue;
          }
          console.warn(`[OCR Fallback] ${modelName} unavailable, switching to next candidate model...`, err?.message || err);
          break;
        }
      }
      if (aiResponse && aiResponse.text) {
        break;
      }
    }

    if (!aiResponse || !aiResponse.text) {
      throw lastError || new Error("تعذر قراءة المستند حالياً بسبب ضغط مؤقت على الخدمة، يرجى إعادة المحاولة.");
    }

    const rawText = aiResponse.text || "{}";
    let extracted: any = {};
    try {
      const cleanJson = rawText.replace(/```(?:json)?\n?/gi, "").replace(/```/g, "").trim();
      extracted = JSON.parse(cleanJson);
    } catch {
      const nameMatch = rawText.match(/"arabicName"\s*:\s*"([^"]+)"/);
      const nidMatch = rawText.match(/"nationalId"\s*:\s*"([^"]+)"/);
      const profMatch = rawText.match(/"profession"\s*:\s*"([^"]+)"/);
      extracted = {
        arabicName: nameMatch ? nameMatch[1] : "",
        nationalId: nidMatch ? nidMatch[1] : "",
        profession: profMatch ? profMatch[1] : ""
      };
    }

    // Clean up National ID
    if (extracted.nationalId) {
      extracted.nationalId = String(extracted.nationalId)
        .replace(/[٠-٩]/g, (d: string) => "٠١٢٣٤٥٦٧٨٩".indexOf(d).toString())
        .replace(/\D/g, "");
    }

    // Extract exact birth date and age from 14-digit Egyptian National ID
    if (extracted.nationalId && extracted.nationalId.length === 14) {
      const nidInfo = parseEgyptianNationalId(extracted.nationalId);
      if (nidInfo) {
        extracted.birthDate = nidInfo.birthDate;
        extracted.calculatedAge = nidInfo.age;
        extracted.gender = nidInfo.gender;
        
        // As per user specification for birth certificate:
        // "وكذلك عند تصوير شهادة الميلاد يقوم النظام بقراءة الاسم والرقم القومى وتدوين المهنة اما طالب او طفل"
        if (documentType === "birth_certificate") {
          extracted.profession = nidInfo.age >= 6 ? "طالب" : "طفل";
        }
      }
    } else if (documentType === "birth_certificate" && (!extracted.profession || !extracted.profession.trim())) {
      extracted.profession = "طالب";
    }

    res.json({
      status: "success",
      extracted,
      documentType,
      message: "تم استخراج البيانات بنجاح بواسطة الذكاء الاصطناعي ✨"
    });
  } catch (err: any) {
    console.error("AI OCR Document Scanner Error:", err);
    res.status(500).json({ error: "فشل استخراج البيانات من المستند: " + err.message });
  }
});

// 1B. AI Smart One-Sentence Voice Dictation (Arabic Egyptian Speech -> Structured Customer Fields)
app.post("/api/voice/parse-customer", async (req, res) => {
  const { audio, mimeType: rawMimeType, applicantCapacities } = req.body || {};

  if (!audio || typeof audio !== "string") {
    return res.status(400).json({ error: "لم يتم استلام التسجيل الصوتي للمعالجة." });
  }

  let mimeType = typeof rawMimeType === "string" && rawMimeType.trim()
    ? rawMimeType.split(";")[0].trim().toLowerCase()
    : "audio/webm";
  let base64Data = audio.trim();

  if (base64Data.startsWith("data:")) {
    const parts = base64Data.split(";base64,");
    if (parts.length === 2) {
      mimeType = parts[0].replace("data:", "").split(";")[0].trim().toLowerCase() || mimeType;
      base64Data = parts[1].trim();
    }
  }

  const allowedAudioMimes = new Set([
    "audio/webm",
    "audio/mp4",
    "audio/m4a",
    "audio/ogg",
    "audio/wav",
    "audio/wave",
    "audio/x-wav",
    "audio/mpeg",
    "audio/mp3",
    "audio/aac",
    "audio/flac",
  ]);
  if (!allowedAudioMimes.has(mimeType)) {
    mimeType = "audio/webm";
  }

  if (base64Data.length < 200) {
    return res.status(400).json({ error: "التسجيل الصوتي قصير جداً، يرجى التحدث بوضوح ثم الضغط على إيقاف." });
  }
  if (base64Data.length > 16 * 1024 * 1024) {
    return res.status(413).json({ error: "حجم التسجيل الصوتي كبير جداً، يرجى اختصار الإملاء لأقل من 45 ثانية." });
  }

  if (!ai) {
    return res.status(503).json({
      error: "ميزة الإملاء الصوتي الذكي تتطلب ضبط GEMINI_API_KEY في إعدادات الخادم (Settings > Secrets أو Render Environment Variables)."
    });
  }

  const callWithTransientRetry = async <T>(fn: () => Promise<T>, label: string): Promise<T> => {
    let lastErr: any = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        return await fn();
      } catch (err: any) {
        lastErr = err;
        const msg = err?.message || JSON.stringify(err);
        const isTransient = msg.includes("503") || msg.includes("UNAVAILABLE") || msg.includes("429") || msg.includes("high demand");
        if (isTransient && attempt === 0) {
          console.warn(`[Voice ${label}] Transient error, retrying in 600ms...`);
          await new Promise((r) => setTimeout(r, 600));
          continue;
        }
        throw err;
      }
    }
    throw lastErr;
  };

  try {
    const audioPart = {
      inlineData: {
        mimeType,
        data: base64Data,
      },
    };

    const capacitiesList = Array.isArray(applicantCapacities) && applicantCapacities.length > 0
      ? applicantCapacities.map((c: any) => String(c || "").trim()).filter(Boolean)
      : ["بنفسه", "الأب", "الأم", "الزوج", "الزوجة", "الأخ", "الأخت", "الابن", "الابنة", "الوكيل"];

    const extractionRules = `قواعد الاستخراج الصارمة:
1. arabicName: الاسم الكامل باللغة العربية فقط (بدون كلمات توضيحية مثل: الاسم، العميل، المواطن، أستاذ، السيد، اسمه). إذا لم يُذكر اسم أرجع سلسلة فارغة "".
2. nationalId: الرقم القومي المصري المكون من 14 رقماً بأرقام إنجليزية (0-9) بدون مسافات (يبدأ عادةً بـ 2 أو 3). حوّل الأرقام المنطوقة بالعربية المصرية مثل (اتنين تسعة خمسة صفر واحد...) إلى أرقام إنجليزية بدقة. لا تخلط بينه وبين رقم الهاتف. إذا لم يُذكر أرجع "".
3. phone: رقم الهاتف بأرقام إنجليزية (0-9) بدون مسافات (مثل رقم مصري من 11 رقم يبدأ بـ 010 أو 011 أو 012 أو 015، وحوّل "زيرو عشرة" إلى 010 و"زيرو حداشر" إلى 011 و"زيرو اتناشر" إلى 012 و"زيرو خمستاشر" إلى 015). إذا لم يُذكر أرجع "".
4. profession: المهنة أو الوظيفة باللغة العربية (بحد أقصى 32 حرفاً، بدون كلمة "المهنة" أو "شغال" أو "وظيفته"، مثل: مهندس مدني، محاسب، ربة منزل، طالب، حاصل على بكالوريوس تجارة، طبيب، سائق، بدون عمل). إذا لم تُذكر أرجع "".
5. applicantCapacity: صفة مقدم الطلب إذا ذُكرت صراحةً، واختر أقرب قيمة مطابقة من هذه القائمة فقط: [${capacitiesList.join("، ")}]. إذا لم تُذكر أرجع "".
6. لا تخترع أو تخمّن أي حقل لم يُذكر في التسجيل الصوتي.`;

    const baseExtractionSchemaProps = {
      arabicName: {
        type: Type.STRING,
        description: "Full customer Arabic name without label words, or empty string if not spoken.",
      },
      nationalId: {
        type: Type.STRING,
        description: "14-digit Egyptian National ID in Western digits (0-9), or empty string if not spoken.",
      },
      phone: {
        type: Type.STRING,
        description: "Phone number in Western digits (0-9), or empty string if not spoken.",
      },
      profession: {
        type: Type.STRING,
        description: "Customer Arabic profession (max 32 chars), or empty string if not spoken.",
      },
      applicantCapacity: {
        type: Type.STRING,
        description: "Applicant capacity matching the provided Arabic options, or empty string if not spoken.",
      },
    };

    const candidateFlashModels = ["gemini-4-hydrogen", "gemini-3.1-flash-lite", "gemini-flash-latest"];

    let transcript = "";
    let parsed: any = null;
    let transcribeSucceeded = false;

    // Stage 1: Try dedicated Egyptian Arabic audio transcription via gemini-3.5-transcribe (v1beta)
    try {
      const transcribeResp = await callWithTransientRetry(
        () =>
          ai!.models.generateContent({
            model: "gemini-3.5-transcribe",
            contents: {
              parts: [
                audioPart,
                {
                  text: "Transcribe this Egyptian Arabic audio accurately in Arabic script. Preserve all spoken Arabic person names, Egyptian national ID digits, phone numbers, professions, and applicant relationship terms accurately.",
                },
              ],
            },
          }),
        "Transcribe"
      );

      transcript = (transcribeResp.text || "").trim();
      transcribeSucceeded = true;
    } catch (transcribeErr: any) {
      const tMsg = String(transcribeErr?.message || "");
      console.warn(
        "[Voice Transcribe] gemini-3.5-transcribe unavailable, falling back to direct multimodal audio extraction:",
        tMsg
      );
    }

    if (transcribeSucceeded) {
      if (!transcript) {
        return res.status(422).json({
          error: "لم يتم التقاط كلام واضح في التسجيل الصوتي، يرجى التحدث بالقرب من الميكروفون وإعادة المحاولة.",
        });
      }

      // Stage 2: Structured Customer Field Extraction from transcript
      const extractionPrompt = `النص المفرغ من إملاء موظف مكتب جوازات مصري:
"""
${transcript}
"""

استخرج فقط البيانات المذكورة فعلياً في النص وأرجعها بصيغة JSON حسب المخطط المحدد.
${extractionRules}`;

      let extractLastErr: any = null;
      for (const modelName of candidateFlashModels) {
        try {
          const extractConfig: any = {
            systemInstruction:
              "You are an accurate Arabic data extraction assistant for an Egyptian passports and government services office. Extract only explicitly spoken customer fields into strict JSON without hallucinating missing fields.",
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: baseExtractionSchemaProps,
              required: ["arabicName", "nationalId", "phone", "profession", "applicantCapacity"],
            },
          };
          if (modelName === "gemini-4-hydrogen") {
            extractConfig.thinkingConfig = { thinkingLevel: ThinkingLevel.LOW };
          }

          const extractResp = await callWithTransientRetry(
            () =>
              ai!.models.generateContent({
                model: modelName,
                contents: extractionPrompt,
                config: extractConfig,
              }),
            `Extract:${modelName}`
          );

          const rawJson = (extractResp.text || "{}").replace(/```(?:json)?\n?/gi, "").replace(/```/g, "").trim();
          parsed = JSON.parse(rawJson);
          break;
        } catch (err: any) {
          extractLastErr = err;
          console.warn(`[Voice Extract Fallback] ${modelName} failed:`, err?.message || err);
        }
      }

      if (!parsed) {
        throw extractLastErr || new Error("تعذر استخراج بيانات العميل من النص المفرغ.");
      }
    } else {
      // Fallback Direct Multimodal Audio -> Transcript + Structured JSON in one request
      const directAudioPrompt = `استمع إلى التسجيل الصوتي باللهجة العربية المصرية لموظف مكتب جوازات يملي بيانات عميل في جملة واحدة.
أولاً: فرّغ الكلام المسموع بدقة في الحقل transcript باللغة العربية.
ثانياً: استخرج فقط البيانات المذكورة فعلياً في التسجيل وأرجعها بصيغة JSON حسب المخطط المحدد.
${extractionRules}`;

      let directLastErr: any = null;
      for (const modelName of candidateFlashModels) {
        try {
          const directConfig: any = {
            systemInstruction:
              "You are an accurate Egyptian Arabic speech-to-data assistant for an Egyptian passports office. Transcribe the audio accurately in Arabic script into 'transcript', and extract only explicitly spoken customer fields into strict JSON without hallucinating.",
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                transcript: {
                  type: Type.STRING,
                  description: "Exact Arabic transcription of the spoken audio.",
                },
                ...baseExtractionSchemaProps,
              },
              required: ["transcript", "arabicName", "nationalId", "phone", "profession", "applicantCapacity"],
            },
          };
          if (modelName === "gemini-4-hydrogen") {
            directConfig.thinkingConfig = { thinkingLevel: ThinkingLevel.LOW };
          }

          const directResp = await callWithTransientRetry(
            () =>
              ai!.models.generateContent({
                model: modelName,
                contents: {
                  parts: [audioPart, { text: directAudioPrompt }],
                },
                config: directConfig,
              }),
            `DirectAudio:${modelName}`
          );

          const rawJson = (directResp.text || "{}").replace(/```(?:json)?\n?/gi, "").replace(/```/g, "").trim();
          parsed = JSON.parse(rawJson);
          transcript = String(parsed.transcript || "").trim();
          break;
        } catch (err: any) {
          directLastErr = err;
          console.warn(`[Voice DirectAudio Fallback] ${modelName} failed:`, err?.message || err);
        }
      }

      if (!parsed) {
        throw directLastErr || new Error("تعذر معالجة التسجيل الصوتي عبر نماذج الذكاء الاصطناعي المتاحة.");
      }

      if (!transcript && !parsed.arabicName && !parsed.nationalId && !parsed.phone && !parsed.profession) {
        return res.status(422).json({
          error: "لم يتم التقاط كلام واضح في التسجيل الصوتي، يرجى التحدث بالقرب من الميكروفون وإعادة المحاولة.",
        });
      }
    }

    const toWesternDigits = (val: string) =>
      String(val || "")
        .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
        .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));

    const arabicName = String(parsed.arabicName || "").replace(/[a-zA-Z0-9]/g, "").replace(/\s+/g, " ").trim();
    const nationalId = toWesternDigits(parsed.nationalId || "").replace(/\D/g, "").slice(0, 14);
    const phone = toWesternDigits(parsed.phone || "").replace(/\D/g, "");
    const profession = String(parsed.profession || "").replace(/[a-zA-Z]/g, "").replace(/\s+/g, " ").trim().slice(0, 32);
    const rawCapacity = String(parsed.applicantCapacity || "").trim();
    const matchedCapacity = rawCapacity
      ? capacitiesList.find((opt) => opt === rawCapacity || opt.includes(rawCapacity) || rawCapacity.includes(opt)) || ""
      : "";

    let birthDate = "";
    if (nationalId.length >= 7) {
      const nidInfo = parseEgyptianNationalId(nationalId.padEnd(14, "0"));
      if (nidInfo?.birthDate) {
        birthDate = nidInfo.birthDate.replace(/-/g, "/");
      }
    }

    return res.json({
      status: "success",
      transcript,
      extracted: {
        arabicName,
        nationalId,
        birthDate,
        phone,
        profession,
        applicantCapacity: matchedCapacity,
      },
    });
  } catch (err: any) {
    console.error("AI Voice Dictation Error:", err);
    const msg = String(err?.message || "");
    if (msg.includes("API_KEY_INVALID") || msg.includes("PERMISSION_DENIED") || msg.includes("403")) {
      return res.status(403).json({
        error: "مفتاح GEMINI_API_KEY غير صالح أو غير مفعل على الخادم. يرجى مراجعة إعدادات الأسرار (Settings > Secrets).",
      });
    }
    if (msg.includes("RESOURCE_EXHAUSTED") || msg.includes("429")) {
      return res.status(429).json({
        error: "تم تجاوز حد الطلبات المؤقت لخدمة الذكاء الاصطناعي، يرجى المحاولة بعد قليل.",
      });
    }
    return res.status(500).json({
      error: "تعذر تفريغ الصوت واستخراج البيانات: " + (msg || "خطأ غير متوقع"),
    });
  }
});

// 2. GET all potential customers
app.get("/api/db/potential-customers", (req, res) => {
  const db = readDB();
  db.potentialCustomers = db.potentialCustomers || [];

  const invNids = new Set(
    (db.invoices || []).flatMap((inv: any) => 
      (inv.customers || []).map((c: any) => (c.nationalId || "").toString().trim()).filter((nid: string) => nid.length >= 10)
    )
  );
  const invNames = new Set(
    (db.invoices || []).flatMap((inv: any) => 
      (inv.customers || []).map((c: any) => (c.arabicName || "").toString().trim()).filter((name: string) => name.length >= 3)
    )
  );

  const prevLen = db.potentialCustomers.length;
  db.potentialCustomers = db.potentialCustomers.filter((p: any) => {
    if (p.status === "تم_التحويل_لفاتورة") return false;
    const pNid = (p.nationalId || "").toString().trim();
    const pName = (p.arabicName || "").toString().trim();
    if (pNid && invNids.has(pNid)) return false;
    if (pName && invNames.has(pName)) return false;
    return true;
  });

  if (db.potentialCustomers.length !== prevLen) {
    writeDB(db);
    pushPotentialCustomersDirectlyToSheet(db).catch(err =>
      console.warn("Background potential customers cleanup sheet push notice:", err.message)
    );
  }

  res.json({
    status: "success",
    potentialCustomers: db.potentialCustomers || []
  });
});

// 3. POST save potential customer(s)
app.post("/api/db/potential-customers", async (req, res) => {
  const { customer, customers, syncWithSheets } = req.body;
  const db = readDB();
  db.potentialCustomers = db.potentialCustomers || [];

  const itemsToAdd: any[] = [];
  if (customer && typeof customer === "object") {
    itemsToAdd.push(customer);
  }
  if (Array.isArray(customers)) {
    itemsToAdd.push(...customers);
  }

  const added: any[] = [];
  for (const item of itemsToAdd) {
    const newId = item.id || `prospect-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const newItem = {
      ...item,
      id: newId,
      createdAt: item.createdAt || new Date().toISOString().split("T")[0],
      status: item.status || "جديد"
    };
    db.potentialCustomers.unshift(newItem);
    added.push(newItem);
  }

  writeDB(db);

  if (syncWithSheets) {
    pushPotentialCustomersDirectlyToSheet(db).catch(err =>
      console.warn("Background potential customers sheet push notice:", err.message)
    );
  }

  res.json({
    status: "success",
    potentialCustomers: db.potentialCustomers,
    added,
    message: `تم حفظ ${added.length} من العملاء المحتملين بنجاح!`
  });
});

// 4. PUT update potential customer
app.put("/api/db/potential-customers/:id", async (req, res) => {
  const { id } = req.params;
  const updateData = req.body;
  const db = readDB();
  db.potentialCustomers = db.potentialCustomers || [];

  const idx = db.potentialCustomers.findIndex((c: any) => c.id === id);
  if (idx === -1) {
    return res.status(404).json({ error: "العميل المحتمل غير موجود" });
  }

  db.potentialCustomers[idx] = {
    ...db.potentialCustomers[idx],
    ...updateData,
    id
  };

  writeDB(db);

  pushPotentialCustomersDirectlyToSheet(db).catch(err =>
    console.warn("Background potential customers sheet push notice:", err.message)
  );

  res.json({
    status: "success",
    potentialCustomer: db.potentialCustomers[idx],
    potentialCustomers: db.potentialCustomers,
    message: "تم تحديث بيانات العميل المحتمل بنجاح"
  });
});

// 5. DELETE potential customer
app.delete("/api/db/potential-customers/:id", async (req, res) => {
  const { id } = req.params;
  const db = readDB();
  db.potentialCustomers = db.potentialCustomers || [];

  db.potentialCustomers = db.potentialCustomers.filter((c: any) => c.id !== id);
  writeDB(db);

  pushPotentialCustomersDirectlyToSheet(db).catch(err =>
    console.warn("Background potential customers sheet push notice:", err.message)
  );

  res.json({
    status: "success",
    potentialCustomers: db.potentialCustomers,
    message: "تم حذف العميل المحتمل بنجاح"
  });
});

// 6. Direct Webhook Sync Potential Customers to Google Sheet
app.post("/api/sheets/webhook/sync-potential-customers", async (req, res) => {
  const { webhookUrl, potentialCustomers } = req.body;
  const db = readDB();
  const targetUrl = webhookUrl || db.settings?.googleSheetWebhookUrl;

  if (!targetUrl || !targetUrl.startsWith("http")) {
    return res.status(400).json({ error: "الرجاء إدخال رابط سكربت Webhook صالح أولاً في قسم إعدادات جوجل شيت." });
  }

  try {
    if (Array.isArray(potentialCustomers)) {
      db.potentialCustomers = potentialCustomers;
      writeDB(db);
    }
    const synced = await pushPotentialCustomersDirectlyToSheet(db);
    res.json({
      status: "success",
      synced,
      message: `تم حفظ ومزامنة ورقة (العملاء المحتملين) بجوجل شيت بنجاح! 📑✅`
    });
  } catch (err: any) {
    res.status(500).json({ error: "فشل إرسال العملاء المحتملين إلى السكربت: " + err.message });
  }
});

// ==========================================
// Mojeeb WhatsApp Business API Proxy Route
// POST https://api.mojeeb.app/v1/whatsapp/messages
// Keeps MOJEEB_API_KEY strictly server-side in process.env
// ==========================================
const MOJEEB_MESSAGES_URL = "https://api.mojeeb.app/v1/whatsapp/messages";
const MOJEEB_TEMPLATES_URL = "https://api.mojeeb.app/v1/whatsapp/templates";
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const E164_REGEX = /^\+[1-9]\d{6,14}$/;
const META_TEMPLATE_LANG_REGEX = /^[a-zA-Z]{2,3}(_[a-zA-Z0-9]{2,8})?$/;

function normalizePhoneToE164Server(rawPhone: string): string {
  const western = String(rawPhone || "")
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .trim();

  if (!western) return "";

  const hadPlus = western.startsWith("+");
  let digits = western.replace(/\D/g, "");
  if (!digits) return "";

  if (digits.startsWith("00")) {
    return `+${digits.slice(2)}`;
  }
  if (hadPlus) {
    return `+${digits}`;
  }
  if (digits.startsWith("0") && digits.length === 11) {
    return `+2${digits}`;
  }
  if (digits.length === 10 && digits.startsWith("1")) {
    return `+20${digits}`;
  }
  if (digits.startsWith("20") && digits.length === 12) {
    return `+${digits}`;
  }
  return `+${digits}`;
}

function isSafePublicHttpsUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== "https:") return false;
    const host = parsed.hostname.toLowerCase();
    if (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "::1" ||
      host === "0.0.0.0" ||
      host === "169.254.169.254" ||
      host.startsWith("10.") ||
      host.startsWith("192.168.") ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(host) ||
      host.endsWith(".local")
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

function mapMojeebErrorByCode(code: string, details: any, retryAfter?: string | null): string {
  switch (code) {
    case "invalid_request_body":
      return `بيانات الطلب غير مكتملة أو تجاوزت الحد المسموح${details?.param ? ` (الحقل: ${details.param})` : ""}.`;
    case "invalid_phone_number":
      return "رقم هاتف العميل المستلم (to) غير صالح بصيغة E.164 الدولية (مثال: +2010xxxxxxxx).";
    case "recipient_required":
      return "يجب تحديد رقم هاتف المستلم (to) أو اسم المستخدم في واتساب (recipient_username).";
    case "recipient_conflict":
      return "لا يمكن إرسال رقم الهاتف واسم المستخدم معاً — أرسل أحدهما فقط.";
    case "recipient_not_found":
      return "لم يراسل أي عميل بهذا الاسم (recipient_username) أرقام واتساب الوكيل على هذا الحساب من قبل.";
    case "invalid_from_phone":
      return "رقم واتساب الأعمال المُرسِل (from) غير صالح بصيغة E.164 الدولية (مثال: +2010xxxxxxxx).";
    case "from_phone_not_found_for_agent": {
      const phones = Array.isArray(details?.available_phones) && details.available_phones.length > 0
        ? ` الأرقام المتاحة على الوكيل: ${details.available_phones.join(" , ")}`
        : "";
      return `رقم الإرسال (from) لا يطابق أي اتصال واتساب نشط على هذا الوكيل.${phones}`;
    }
    case "media_url_invalid":
      return "رابط الملف (media_url) غير صالح أو غير قابل للقراءة من قِبل موقع مجيب.";
    case "auth_template_needs_phone":
      return "قوالب المصادقة (OTP) لا يمكن إرسالها باسم المستخدم في واتساب — يجب الإرسال برقم الهاتف (to) فقط.";
    case "template_not_found": {
      const templates = Array.isArray(details?.available_templates) && details.available_templates.length > 0
        ? ` القوالب المتاحة على هذا الرقم: ${details.available_templates.join(" , ")}`
        : "";
      return `لا يوجد على هذا الاتصال قالب بهذا الاسم (template.name).${templates}`;
    }
    case "template_not_found_for_language": {
      const langs = Array.isArray(details?.available_languages) && details.available_languages.length > 0
        ? ` اللغات المتاحة لهذا القالب: ${details.available_languages.join(" , ")}`
        : "";
      return `القالب غير موجود برمز اللغة المحدد (template.language).${langs}`;
    }
    case "template_header_media_url_invalid":
      return "رابط وسائط رأس القالب (header_media_url) غير صالح، أو ليس رابط HTTPS كاملاً، أو ملف مرفوع منتهي الصلاحية/لا يطابق صيغة الرأس.";
    case "agent_not_authorized":
      return "مفتاح API غير مصرّح له باستخدام هذا الوكيل (agent_id). راجع صلاحيات المفتاح في مجيب.";
    case "insufficient_scope":
      return "مفتاح API لا يمتلك صلاحية الإرسال المطلوبة (whatsapp:send).";
    case "rate_limit_exceeded":
      return `تم تجاوز حد الإرسال المسموح لمفتاح API.${retryAfter ? ` يرجى المحاولة بعد ${retryAfter} ثانية.` : ""}`;
    case "video_send_rate_limited":
      return `تم بلوغ الحد الأقصى لإرسال الفيديوهات (10 فيديوهات/دقيقة).${retryAfter ? ` أعد المحاولة بعد ${retryAfter} ثانية.` : ""}`;
    default:
      return details?.message || "تعذر إرسال رسالة الواتساب عبر موقع مجيب (Mojeeb API).";
  }
}

app.post("/api/whatsapp/mojeeb/send", async (req, res) => {
  const apiKey = (process.env.MOJEEB_API_KEY || "").trim();
  if (!apiKey) {
    return res.status(503).json({
      code: "mojeeb_api_key_missing",
      error: "مفتاح ربط موقع مجيب (MOJEEB_API_KEY) غير مضاف بعد في إعدادات الأسرار (Secrets) على الخادم. يرجى إضافته لتفعيل الإرسال عبر Mojeeb API.",
    });
  }

  const db = readDB();
  const {
    to,
    recipientUsername,
    body,
    mediaUrl,
    idempotencyKey,
    correlationId,
    agentId: overrideAgentId,
    from: overrideFrom,
  } = req.body || {};

  const resolvedAgentId = String(
    overrideAgentId || db.settings?.mojeebAgentId || process.env.MOJEEB_AGENT_ID || ""
  ).trim();
  const resolvedFromRaw = String(
    overrideFrom || db.settings?.mojeebFromPhone || process.env.MOJEEB_FROM_PHONE || ""
  ).trim();
  const resolvedFrom = normalizePhoneToE164Server(resolvedFromRaw);

  if (!resolvedAgentId || !UUID_REGEX.test(resolvedAgentId)) {
    return res.status(400).json({
      code: "invalid_request_body",
      error: "يرجى إدخال معرّف الوكيل (Agent ID - UUID) بشكل صحيح في إعدادات النظام (قسم ربط مجيب API).",
    });
  }

  if (!resolvedFrom || !E164_REGEX.test(resolvedFrom)) {
    return res.status(400).json({
      code: "invalid_from_phone",
      error: "يرجى إدخال رقم واتساب الأعمال المُرسِل (From) بصيغة E.164 الدولية (مثل +2010xxxxxxxx) في إعدادات النظام.",
    });
  }

  const rawTo = typeof to === "string" ? to.trim() : "";
  const rawUsername = typeof recipientUsername === "string" ? recipientUsername.trim() : "";

  if (!rawTo && !rawUsername) {
    return res.status(422).json({
      code: "recipient_required",
      error: "يجب توفير رقم هاتف العميل أو اسم مستخدم واتساب للإرسال.",
    });
  }

  if (rawTo && rawUsername) {
    return res.status(422).json({
      code: "recipient_conflict",
      error: "لا يمكن إرسال رقم الهاتف واسم المستخدم معاً — يرجى إرسال أحدهما فقط.",
    });
  }

  let normalizedTo = "";
  if (rawTo) {
    normalizedTo = normalizePhoneToE164Server(rawTo);
    if (!E164_REGEX.test(normalizedTo)) {
      return res.status(422).json({
        code: "invalid_phone_number",
        error: `رقم هاتف العميل (${rawTo}) غير صالح بصيغة E.164 الدولية.`,
      });
    }
    if (normalizedTo === resolvedFrom) {
      return res.status(422).json({
        code: "invalid_phone_number",
        error: "لا يمكن الإرسال من رقم واتساب الأعمال إلى نفس الرقم (ميتا ترفض الإرسال للرقم نفسه).",
      });
    }
  }

  const messageBody = typeof body === "string" ? body.trim() : "";
  const cleanMediaUrl = typeof mediaUrl === "string" ? mediaUrl.trim() : "";

  if (!messageBody && !cleanMediaUrl) {
    return res.status(422).json({
      code: "invalid_request_body",
      error: "يجب كتابة نص الرسالة أو إرفاق رابط ملف صالح (media_url).",
    });
  }

  if (cleanMediaUrl && !isSafePublicHttpsUrl(cleanMediaUrl)) {
    return res.status(422).json({
      code: "media_url_invalid",
      error: "يجب أن يكون رابط الملف (media_url) رابط HTTPS عاماً وصالحاً.",
    });
  }

  const mojeebPayload: Record<string, any> = {
    agent_id: resolvedAgentId,
    from: resolvedFrom,
  };

  if (normalizedTo) {
    mojeebPayload.to = normalizedTo;
  } else {
    mojeebPayload.recipient_username = rawUsername;
  }

  if (messageBody) {
    mojeebPayload.text = { body: messageBody };
  }
  if (cleanMediaUrl) {
    mojeebPayload.media_url = cleanMediaUrl;
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };

  if (typeof idempotencyKey === "string" && idempotencyKey.trim().length > 0 && idempotencyKey.trim().length <= 128) {
    headers["Idempotency-Key"] = idempotencyKey.trim();
  }
  if (typeof correlationId === "string" && /^[a-zA-Z0-9._-]{1,64}$/.test(correlationId.trim())) {
    headers["X-Correlation-ID"] = correlationId.trim();
  }

  try {
    const upstreamResponse = await fetchWithTimeout(
      MOJEEB_MESSAGES_URL,
      {
        method: "POST",
        headers,
        body: JSON.stringify(mojeebPayload),
      },
      15000
    );

    const retryAfter = upstreamResponse.headers.get("retry-after");
    const responseCorrelationId = upstreamResponse.headers.get("x-correlation-id") || undefined;
    const rawText = await upstreamResponse.text();
    let parsed: any = null;
    try {
      parsed = rawText ? JSON.parse(rawText) : null;
    } catch {
      parsed = null;
    }

    if (upstreamResponse.status === 202 || upstreamResponse.ok) {
      return res.status(upstreamResponse.status).json({
        status: parsed?.status || "queued",
        data: parsed || { id: "", status: "queued" },
        correlationId: responseCorrelationId,
        message: `تم إرسال الرسالة إلى طابور التسليم عبر مجيب API بنجاح ✅${parsed?.id ? ` (رقم الرسالة: ${parsed.id})` : ""}`,
      });
    }

    const errObj = parsed?.error || parsed || {};
    const errCode = typeof errObj.code === "string" ? errObj.code : `http_${upstreamResponse.status}`;
    const friendlyError = mapMojeebErrorByCode(errCode, errObj, retryAfter);

    return res.status(upstreamResponse.status >= 400 && upstreamResponse.status < 600 ? upstreamResponse.status : 502).json({
      code: errCode,
      error: friendlyError,
      retryAfter: retryAfter || undefined,
      availablePhones: Array.isArray(errObj.available_phones) ? errObj.available_phones : undefined,
      correlationId: responseCorrelationId,
    });
  } catch (err: any) {
    return res.status(502).json({
      code: "mojeeb_network_error",
      error: "تعذر الاتصال بخادم موقع مجيب (api.mojeeb.app) حالياً: " + (err?.message || "خطأ في الاتصال"),
    });
  }
});

// ==========================================
// Mojeeb WhatsApp Approved Template Proxy Route
// POST https://api.mojeeb.app/v1/whatsapp/templates
// Sends pre-approved templates anytime (including first contact / outside Meta's 24h window)
// ==========================================
app.post("/api/whatsapp/mojeeb/template", async (req, res) => {
  const apiKey = (process.env.MOJEEB_API_KEY || "").trim();
  if (!apiKey) {
    return res.status(503).json({
      code: "mojeeb_api_key_missing",
      error: "مفتاح ربط موقع مجيب (MOJEEB_API_KEY) غير مضاف بعد في إعدادات الأسرار (Secrets) على الخادم. يرجى إضافته لتفعيل إرسال القوالب عبر Mojeeb API.",
    });
  }

  const db = readDB();
  const {
    to,
    recipientUsername,
    template,
    idempotencyKey,
    correlationId,
    agentId: overrideAgentId,
    from: overrideFrom,
  } = req.body || {};

  const resolvedAgentId = String(
    overrideAgentId || db.settings?.mojeebAgentId || process.env.MOJEEB_AGENT_ID || ""
  ).trim();
  const resolvedFromRaw = String(
    overrideFrom || db.settings?.mojeebFromPhone || process.env.MOJEEB_FROM_PHONE || ""
  ).trim();
  const resolvedFrom = normalizePhoneToE164Server(resolvedFromRaw);

  if (!resolvedAgentId || !UUID_REGEX.test(resolvedAgentId)) {
    return res.status(400).json({
      code: "invalid_request_body",
      error: "يرجى إدخال معرّف الوكيل (Agent ID - UUID) بشكل صحيح في إعدادات النظام (قسم ربط مجيب API).",
    });
  }

  if (!resolvedFrom || !E164_REGEX.test(resolvedFrom)) {
    return res.status(400).json({
      code: "invalid_from_phone",
      error: "يرجى إدخال رقم واتساب الأعمال المُرسِل (From) بصيغة E.164 الدولية (مثل +2010xxxxxxxx) في إعدادات النظام.",
    });
  }

  const rawTo = typeof to === "string" ? to.trim() : "";
  const rawUsername = typeof recipientUsername === "string" ? recipientUsername.trim() : "";

  if (!rawTo && !rawUsername) {
    return res.status(422).json({
      code: "recipient_required",
      error: "يجب توفير رقم هاتف العميل أو اسم مستخدم واتساب لإرسال القالب.",
    });
  }

  if (rawTo && rawUsername) {
    return res.status(422).json({
      code: "recipient_conflict",
      error: "لا يمكن إرسال رقم الهاتف واسم المستخدم معاً — يرجى إرسال أحدهما فقط.",
    });
  }

  let normalizedTo = "";
  if (rawTo) {
    normalizedTo = normalizePhoneToE164Server(rawTo);
    if (!E164_REGEX.test(normalizedTo)) {
      return res.status(422).json({
        code: "invalid_phone_number",
        error: `رقم هاتف العميل (${rawTo}) غير صالح بصيغة E.164 الدولية.`,
      });
    }
    if (normalizedTo === resolvedFrom) {
      return res.status(422).json({
        code: "invalid_phone_number",
        error: "لا يمكن الإرسال من رقم واتساب الأعمال إلى نفس الرقم (ميتا ترفض الإرسال للرقم نفسه).",
      });
    }
  }

  if (!template || typeof template !== "object" || Array.isArray(template)) {
    return res.status(422).json({
      code: "invalid_request_body",
      error: "بيانات القالب (template) مطلوبة لإرسال قالب واتساب.",
    });
  }

  const templateName = typeof template.name === "string" ? template.name.trim() : "";
  const templateLanguage = typeof template.language === "string" ? template.language.trim() : "";

  if (!templateName || templateName.length > 512) {
    return res.status(422).json({
      code: "invalid_request_body",
      error: "يرجى تحديد اسم القالب المعتمد لدى ميتا (template.name).",
    });
  }

  if (!templateLanguage || !META_TEMPLATE_LANG_REGEX.test(templateLanguage)) {
    return res.status(422).json({
      code: "invalid_request_body",
      error: "يرجى تحديد رمز لغة القالب الصحيح لدى ميتا (مثل ar أو ar_EG أو en أو en_US باستخدام شرطة سفلية _ عند وجود رمز دولة).",
    });
  }

  const templateObj: Record<string, any> = {
    name: templateName,
    language: templateLanguage,
  };

  // Optional body parameters (flat key -> string value map; supports both positional "1" and named "customer_name")
  if (template.parameters && typeof template.parameters === "object" && !Array.isArray(template.parameters)) {
    const cleanParams: Record<string, string> = {};
    for (const [k, v] of Object.entries(template.parameters)) {
      const cleanKey = String(k || "").trim();
      if (!cleanKey) continue;
      cleanParams[cleanKey] = v === undefined || v === null ? "" : String(v);
    }
    if (Object.keys(cleanParams).length > 0) {
      templateObj.parameters = cleanParams;
    }
  }

  // Optional text header parameters (max 1 variable per Meta template rules)
  if (template.header_parameters && typeof template.header_parameters === "object" && !Array.isArray(template.header_parameters)) {
    const cleanHeaderParams: Record<string, string> = {};
    const entries = Object.entries(template.header_parameters).filter(([k]) => String(k || "").trim().length > 0);
    if (entries.length > 1) {
      return res.status(422).json({
        code: "invalid_request_body",
        error: "رأس القالب النصي (header_parameters) يسمح بمتغيّر واحد كحد أقصى حسب قواعد ميتا.",
      });
    }
    for (const [k, v] of entries) {
      cleanHeaderParams[String(k).trim()] = v === undefined || v === null ? "" : String(v);
    }
    if (Object.keys(cleanHeaderParams).length > 0) {
      templateObj.header_parameters = cleanHeaderParams;
    }
  }

  // Optional header media URL (IMAGE / VIDEO / DOCUMENT) — strictly public HTTPS URL
  if (typeof template.header_media_url === "string" && template.header_media_url.trim().length > 0) {
    const cleanHeaderUrl = template.header_media_url.trim();
    if (!isSafePublicHttpsUrl(cleanHeaderUrl)) {
      return res.status(422).json({
        code: "template_header_media_url_invalid",
        error: "يجب أن يكون رابط وسائط رأس القالب (header_media_url) رابط https:// عاماً وكاملاً.",
      });
    }
    templateObj.header_media_url = cleanHeaderUrl;
  }

  // Optional dynamic buttons[]
  if (Array.isArray(template.buttons) && template.buttons.length > 0) {
    const cleanButtons: Record<string, any>[] = [];
    for (const btn of template.buttons) {
      if (!btn || typeof btn !== "object") continue;
      const idx = Number(btn.index);
      if (!Number.isInteger(idx) || idx < 0 || idx > 20) {
        return res.status(422).json({
          code: "invalid_request_body",
          error: "فهرس الزر (index) يجب أن يكون رقماً صحيحاً يبدأ من الصفر (0).",
        });
      }
      const entry: Record<string, any> = { index: idx };
      if (typeof btn.url_suffix === "string" && btn.url_suffix.trim().length > 0) {
        entry.url_suffix = btn.url_suffix.trim();
      } else if (typeof btn.otp_code === "string" && btn.otp_code.trim().length > 0) {
        entry.otp_code = btn.otp_code.trim();
      } else if (typeof btn.quick_reply_payload === "string" && btn.quick_reply_payload.trim().length > 0) {
        entry.quick_reply_payload = btn.quick_reply_payload.trim();
      } else if (typeof btn.coupon_code === "string" && btn.coupon_code.trim().length > 0) {
        const code = btn.coupon_code.trim();
        if (code.length > 15) {
          return res.status(422).json({
            code: "invalid_request_body",
            error: "رمز قسيمة النسخ (coupon_code) يجب ألا يتجاوز 15 حرفاً حسب قواعد ميتا.",
          });
        }
        entry.coupon_code = code;
      } else if (btn.action && typeof btn.action === "object" && !Array.isArray(btn.action)) {
        entry.action = btn.action;
      } else {
        continue;
      }
      cleanButtons.push(entry);
    }
    if (cleanButtons.length > 0) {
      templateObj.buttons = cleanButtons;
    }
  }

  const mojeebPayload: Record<string, any> = {
    agent_id: resolvedAgentId,
    from: resolvedFrom,
    template: templateObj,
  };

  if (normalizedTo) {
    mojeebPayload.to = normalizedTo;
  } else {
    mojeebPayload.recipient_username = rawUsername;
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };

  if (typeof idempotencyKey === "string" && idempotencyKey.trim().length > 0 && idempotencyKey.trim().length <= 128) {
    headers["Idempotency-Key"] = idempotencyKey.trim();
  }
  if (typeof correlationId === "string" && /^[a-zA-Z0-9._-]{1,64}$/.test(correlationId.trim())) {
    headers["X-Correlation-ID"] = correlationId.trim();
  }

  try {
    const upstreamResponse = await fetchWithTimeout(
      MOJEEB_TEMPLATES_URL,
      {
        method: "POST",
        headers,
        body: JSON.stringify(mojeebPayload),
      },
      15000
    );

    const retryAfter = upstreamResponse.headers.get("retry-after");
    const responseCorrelationId = upstreamResponse.headers.get("x-correlation-id") || undefined;
    const rawText = await upstreamResponse.text();
    let parsed: any = null;
    try {
      parsed = rawText ? JSON.parse(rawText) : null;
    } catch {
      parsed = null;
    }

    if (upstreamResponse.status === 202 || upstreamResponse.ok) {
      return res.status(upstreamResponse.status).json({
        status: parsed?.status || "queued",
        data: parsed || { id: "", status: "queued", type: "template" },
        correlationId: responseCorrelationId,
        message: `تم إدراج قالب واتساب "${templateName}" في طابور الإرسال عبر مجيب API بنجاح ✅${parsed?.id ? ` (رقم الرسالة: ${parsed.id})` : ""}`,
      });
    }

    const errObj = parsed?.error || parsed || {};
    const errCode = typeof errObj.code === "string" ? errObj.code : `http_${upstreamResponse.status}`;
    const friendlyError = mapMojeebErrorByCode(errCode, errObj, retryAfter);

    return res.status(upstreamResponse.status >= 400 && upstreamResponse.status < 600 ? upstreamResponse.status : 502).json({
      code: errCode,
      error: friendlyError,
      retryAfter: retryAfter || undefined,
      availablePhones: Array.isArray(errObj.available_phones) ? errObj.available_phones : undefined,
      availableTemplates: Array.isArray(errObj.available_templates) ? errObj.available_templates : undefined,
      availableLanguages: Array.isArray(errObj.available_languages) ? errObj.available_languages : undefined,
      correlationId: responseCorrelationId,
    });
  } catch (err: any) {
    return res.status(502).json({
      code: "mojeeb_network_error",
      error: "تعذر الاتصال بخادم موقع مجيب (api.mojeeb.app) حالياً: " + (err?.message || "خطأ في الاتصال"),
    });
  }
});

// Vite Middleware Integration for Dev / Static Asset Server for Production
async function startServer() {
  const isProd = process.env.NODE_ENV === "production" || Boolean(process.argv[1]?.endsWith("server.cjs"));
  if (!isProd) {
    const { createServer: createViteServer } = await import("vite");
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
