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
const PORT = 3000;

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
      id: "srv-102",
      name: "## استخراج جواز سفر عادي",
      govPrice: 1100,
      officeFee: 400,
      duration: "7 أيام عمل من تاريخ تقديم المستندات",
      instructions: "يرجى إحضار أصل بطاقة الرقم القومي سارية، الموقف من التجنيد للذكور، المؤهل الدراسي إن لم يكن مسجلاً بالبطاقة، و3 صور شخصية خلفية بيضاء.",
      deliveryDaysOffset: 7,
      notes: "يتم تسليم المستندات بمقر المكتب والفرع المخصص."
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
  settings: {
    headerText: "مكتب مزايا لخدمات الجوازات وتسهيل المعاملات\nطنطا - شارع المديرية - برج المعز - الدور الثاني\nتليفون: 01011223344",
    footerText: "شكراً لتعاملكم مع مكتب مزايا للجوازات.\nالرجاء الاحتفاظ بالفاتورة لتقديمها عند الاستلام.\nالاستلام شخصياً أو بتوكيل رسمي.",
    welcomeMessage: "عزيزنا {اسم_العميل}، تم استلام طلباتك بمكتب مزايا للجوازات بنجاح.\nرقم الفاتورة: {رقم_الفاتورة}\nالخدمات المطلوبة:\n{الخدمات}\nإجمالي الفاتورة: {السعر} جنيه.\nتاريخ اليوم: {تاريخ_اليوم}\nنسعد دائماً بخدمتكم.",
    readyMessage: "عزيزنا {اسم_العميل}، نفيدكم علماً بأن أوراقكم الخاصة بالفاتورة رقم {رقم_الفاتورة} جاهزة للتسليم الآن.\nالخدمات: {الخدمات}\nمكان الحفظ: درج رقم ({رقم_الارشيف})\nبرجاء التوجه للمكتب للاستلام مع إحضار الفاتورة الحرارية.",
    deliveryMessage: "تم تسليم جواز السفر والأوراق الخاصة بك بنجاح يا {اسم_العميل}.\nرقم الفاتورة: {رقم_الفاتورة}\nنسعد بتقييمكم لخدمات مكتب مزايا للجوازات ونراكم قريباً في معاملات أخرى.",
    whatsappTemplate: "مكتب مزايا للجوازات\n\nالعميل: {اسم_العميل}\n{الاسم_الانجليزي}\n{المهنة}\nالخدمات:\n{الخدمات}\n\nالإجمالي: {السعر} جنيه.\n\n{رسالة_الشكر}",
    googleSheetWebhookUrl: "https://script.google.com/macros/s/AKfycbz6j-7b_lwkN7wy2nkeIFcbx2rRw19yjTTAxtWVmt6CoualXSXno0UvIuDfpxcrJ15j/exec",
    autoSyncWebhook: true,
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
    return JSON.parse(data);
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

// API Endpoints

// 1. Gemini Word/Sentence translation using local dictionary and Gemini fallback
app.post("/api/gemini/translate", async (req, res) => {
  const { text } = req.body;
  if (!text || typeof text !== "string" || !text.trim()) {
    return res.status(400).json({ error: "Text is required" });
  }

  const cleanText = text.trim();
  const db = readDB();
  const dictionary = db.dictionary || [];

  // Function to clean Arabic word from common diacritics and letters for search
  const normalizeArabic = (str: string) => {
    return str
      .replace(/[أإآأ]/g, "ا")
      .replace(/ى/g, "ي")
      .replace(/ة/g, "ه")
      .replace(/[\u064B-\u065F]/g, ""); // strip diacritics
  };

  // Split sentence into words
  const words = cleanText.split(/\s+/).filter(Boolean);
  const translatedWords: string[] = [];
  let dictionaryUpdated = false;

  for (const word of words) {
    const normWord = normalizeArabic(word);
    
    // Check dictionary
    const dictMatch = dictionary.find(
      (item: any) => normalizeArabic(item.arabic) === normWord || item.arabic === word
    );

    if (dictMatch) {
      translatedWords.push(dictMatch.english.toUpperCase());
    } else {
      // Fallback to Gemini if initialized
      let translated = "";
      if (ai) {
        try {
          const prompt = `You are an official transliterator specializing in translating Arabic names to English for Egyptian Passports (معايير مصلحة الجوازات المصرية).
Translate only the following SINGLE Arabic name/word into its standardized logical English passport spelling.
Use CAPITAL letters. Return ONLY the translated English word itself, with no extra text, explanations, or punctuation.
Arabic Word: "${word}"`;

          const response = await ai.models.generateContent({
            model: "gemini-3.5-flash",
            contents: prompt,
            config: {
              temperature: 0.1,
            }
          });

          translated = (response.text || "").trim().toUpperCase().replace(/[^A-Z]/g, "");
        } catch (err) {
          console.error(`Gemini failed to translate word "${word}":`, err);
        }
      }

      // Simple algorithmic fallback if Gemini failed or is not available
      if (!translated) {
        // Simple phonetic dictionary proxy or basic English translit
        translated = word.toUpperCase(); // Fallback to original word or dummy
        // Let's do a tiny phonetic translation dictionary proxy
        const charMap: { [key: string]: string } = {
          "ا": "A", "أ": "A", "إ": "I", "آ": "A", "ب": "B", "ت": "T", "ث": "TH", "ج": "G", "ح": "H", "خ": "KH",
          "د": "D", "ذ": "ZH", "ر": "R", "ز": "Z", "س": "S", "ش": "SH", "ص": "S", "ض": "D", "ط": "T", "ظ": "Z",
          "ع": "A", "غ": "GH", "ف": "F", "ق": "Q", "ك": "K", "ل": "L", "م": "M", "ن": "N", "ه": "H", "و": "W",
          "ي": "Y", "ى": "A", "ة": "H", "ؤ": "W", "ئ": "Y", "لا": "LA"
        };
        let phonetic = "";
        for (let i = 0; i < word.length; i++) {
          const char = word[i];
          phonetic += charMap[char] || char;
        }
        translated = phonetic.toUpperCase();
      }

      // Save new translation to dictionary
      if (translated && translated !== word.toUpperCase()) {
        dictionary.push({ arabic: word, english: translated });
        dictionaryUpdated = true;
        translatedWords.push(translated);
      } else {
        translatedWords.push(word);
      }
    }
  }

  if (dictionaryUpdated) {
    db.dictionary = dictionary;
    writeDB(db);
  }

  const finalEnglish = translatedWords.join(" ");
  res.json({ arabic: cleanText, english: finalEnglish });
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
  res.json({ status: "success", message: "Database saved successfully" });
});

// 4. Create invoice endpoint to handle sequential number 100+
app.post("/api/db/invoices", (req, res) => {
  const db = readDB();
  const invoiceData = req.body;
  
  // Calculate next invoice ID
  const nextInvoiceId = db.invoices.length > 0 
    ? Math.max(...db.invoices.map((inv: any) => inv.invoiceId)) + 1 
    : 100;
  
  const newInvoice = {
    ...invoiceData,
    invoiceId: nextInvoiceId,
    date: new Date().toISOString().split("T")[0],
    notificationSent: false
  };

  db.invoices.push(newInvoice);
  writeDB(db);
  triggerBackgroundWebhookSync(db);

  res.json({ status: "success", invoice: newInvoice });
});

// 5. Update invoice
app.put("/api/db/invoices/:id", (req, res) => {
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
  
  writeDB(db);
  triggerBackgroundWebhookSync(db);
  res.json({ status: "success", invoice: db.invoices[index] });
});

// 6. Delete invoice
app.delete("/api/db/invoices/:id", (req, res) => {
  const invoiceId = parseInt(req.params.id);
  const db = readDB();
  
  const filtered = db.invoices.filter((inv: any) => inv.invoiceId !== invoiceId);
  if (db.invoices.length === filtered.length) {
    return res.status(404).json({ error: "Invoice not found" });
  }

  db.invoices = filtered;
  writeDB(db);
  triggerBackgroundWebhookSync(db);
  res.json({ status: "success", message: "Invoice deleted" });
});

// 7. Services CRUD endpoints
app.post("/api/db/services", (req, res) => {
  const service = req.body;
  const db = readDB();
  service.id = "srv-" + Date.now();
  db.services.push(service);
  writeDB(db);
  triggerBackgroundWebhookSync(db);
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
  triggerBackgroundWebhookSync(db);
  res.json({ status: "success", service: db.services[index] });
});

app.delete("/api/db/services/:id", (req, res) => {
  const id = req.params.id;
  const db = readDB();
  db.services = db.services.filter((srv: any) => srv.id !== id);
  writeDB(db);
  triggerBackgroundWebhookSync(db);
  res.json({ status: "success", message: "Service deleted" });
});

// 8. Collection Closings endpoint
app.post("/api/db/closings", (req, res) => {
  const closing = req.body;
  const db = readDB();
  closing.id = "cls-" + Date.now();
  closing.closeDate = new Date().toISOString().split("T")[0];
  db.collectionClosings.push(closing);
  writeDB(db);
  triggerBackgroundWebhookSync(db);
  res.json({ status: "success", closing });
});

// 9. Dictionary updates
app.post("/api/db/dictionary", (req, res) => {
  const dictItem = req.body;
  const db = readDB();
  
  // Prevent duplicate arabic
  db.dictionary = db.dictionary.filter(
    (item: any) => item.arabic.trim() !== dictItem.arabic.trim()
  );
  db.dictionary.push(dictItem);
  writeDB(db);
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
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: "push",
        db: db,
      }),
      redirect: "follow",
    });
    const result = await response.json().catch(() => ({ status: "success", message: "تم إرسال البيانات بنجاح" }));
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
    const result = await response.json();
    if (!result || !result.db) {
      throw new Error("لم يتم العثور على حقل البيانات db في استجابة السكربت.");
    }
    return result.db;
  } catch (err: any) {
    console.error("Webhook pull error:", err);
    throw new Error(err.message || "تعذر سحب البيانات من رابط السكربت");
  }
}

// Background auto sync trigger
function triggerBackgroundWebhookSync(db: any) {
  const webhookUrl = db.settings?.googleSheetWebhookUrl;
  const autoSync = db.settings?.autoSyncWebhook;
  if (webhookUrl && autoSync) {
    pushToGoogleWebhook(webhookUrl, db).catch((err) => {
      console.warn("Background Webhook sync deferred:", err.message);
    });
  }
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
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "test" }),
      redirect: "follow",
    });

    const data = await testResponse.json().catch(() => ({ status: "success" }));
    res.json({
      status: "success",
      message: data.message || "تم اختبار الاتصال بالسكربت بنجاح والملف يستجيب! 📊",
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

// Webhook Pull DB Endpoint
app.post("/api/sheets/webhook/pull", async (req, res) => {
  const { webhookUrl } = req.body;
  const db = readDB();
  const targetUrl = webhookUrl || db.settings.googleSheetWebhookUrl;

  if (!targetUrl || !targetUrl.startsWith("http")) {
    return res.status(400).json({ error: "الرجاء إدخال رابط سكربت Webhook صالح أولاً." });
  }

  try {
    const pulledDB = await pullFromGoogleWebhook(targetUrl);
    
    // Retain webhook configuration
    pulledDB.settings = {
      ...pulledDB.settings,
      googleSheetWebhookUrl: targetUrl,
      autoSyncWebhook: db.settings.autoSyncWebhook ?? true,
      googleSheetId: db.settings.googleSheetId,
      googleSheetUrl: db.settings.googleSheetUrl,
      googleSheetsConnected: true,
    };

    // Save to local file
    writeDB(pulledDB);

    res.json({
      status: "success",
      message: "تم استيراد كافة البيانات بنجاح من جوجل شيت واعتمادها كقاعدة بيانات نشطة! 📥",
      db: pulledDB,
    });
  } catch (err: any) {
    res.status(500).json({ error: "فشل استيراد البيانات من السكربت: " + err.message });
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

// 11. Update settings endpoint
app.post("/api/db/settings", (req, res) => {
  const newSettings = req.body;
  const db = readDB();
  db.settings = { ...db.settings, ...newSettings };
  writeDB(db);
  triggerBackgroundWebhookSync(db);
  res.json({ status: "success", settings: db.settings });
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
