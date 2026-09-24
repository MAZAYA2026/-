import React, { useState, useEffect } from "react";
import { AppSettings, Employee, DictionaryItem } from "../types";
import { 
  updateSettingsOnServer, 
  testGoogleWebhook,
  pushDataToGoogleWebhook,
  pullDataFromGoogleWebhook,
  syncDictionaryToGoogleWebhook,
  syncSettingsToGoogleWebhook,
  saveDictionaryWord,
  updateDictionaryWord,
  deleteDictionaryWord
} from "../lib/api";
import { 
  Save, 
  ShieldCheck, 
  MessageCircle, 
  FileText, 
  Settings, 
  Globe, 
  HelpCircle, 
  AlertCircle, 
  Lock, 
  Unlock, 
  Users, 
  CheckCircle, 
  RefreshCw, 
  ExternalLink,
  Link as LinkIcon,
  Code,
  Copy,
  Download,
  Check,
  BookOpen,
  Search,
  Plus,
  Trash2,
  Edit3,
  X,
  Calendar,
  CalendarCheck
} from "lucide-react";
import { DEFAULT_OFFICIAL_HOLIDAYS, HolidayItem } from "../lib/businessDays";

interface SettingsConfigProps {
  settings: AppSettings;
  activeEmployee: Employee;
  onSettingsUpdated: (settings: AppSettings) => void;
  employees: Employee[];
  onEmployeesUpdated: (employees: Employee[]) => void;
  dictionary?: DictionaryItem[];
  onDictionaryUpdated?: (newDict: DictionaryItem[]) => void;
}

export default function SettingsConfig({ 
  settings, 
  activeEmployee, 
  onSettingsUpdated, 
  employees, 
  onEmployeesUpdated,
  dictionary = [],
  onDictionaryUpdated
}: SettingsConfigProps) {
  const [headerText, setHeaderText] = useState(settings.headerText || "مكتب مزايا للجوازات والمعاملات");
  const [subHeaderText, setSubHeaderText] = useState(settings.subHeaderText ?? "جوازات طنطا والمعاملات الحكومية");
  const [welcomeMessage, setWelcomeMessage] = useState(settings.welcomeMessage || "");
  const [whatsappTemplate, setWhatsappTemplate] = useState(settings.whatsappTemplate || "");
  const [readyMessage, setReadyMessage] = useState(settings.readyMessage || "");
  const [deliveryMessage, setDeliveryMessage] = useState(settings.deliveryMessage || "");
  const [googleSheetUrl, setGoogleSheetUrl] = useState(settings.googleSheetUrl || "");
  const [googleSheetWebhookUrl, setGoogleSheetWebhookUrl] = useState(settings.googleSheetWebhookUrl || settings.googleSheetUrl || "");
  const [footerText, setFooterText] = useState(settings.footerText || "يسعدنا دائماً خدمتكم وثقتكم بنا");
  const [autoSyncWebhook, setAutoSyncWebhook] = useState(settings.autoSyncWebhook || false);

  // Business days & Holidays config
  const [includeSaturdayAsWeekend, setIncludeSaturdayAsWeekend] = useState(settings.includeSaturdayAsWeekend !== false);
  const [customHolidays, setCustomHolidays] = useState<HolidayItem[]>(settings.customHolidays || []);
  const [newHolidayDate, setNewHolidayDate] = useState("");
  const [newHolidayName, setNewHolidayName] = useState("");

  const [saving, setSaving] = useState(false);
  const [showScriptGuide, setShowScriptGuide] = useState(false);
  const [copiedScript, setCopiedScript] = useState(false);
  const [syncLoading, setSyncLoading] = useState(false);
  const [syncMessage, setSyncMessage] = useState("");

  // Dictionary management states
  const [dictSearch, setDictSearch] = useState("");
  const [newArWord, setNewArWord] = useState("");
  const [newEnWord, setNewEnWord] = useState("");
  const [dictLoading, setDictLoading] = useState(false);
  const [dictFeedback, setDictFeedback] = useState("");
  const [dictSyncLoading, setDictSyncLoading] = useState(false);
  const [dictSyncResult, setDictSyncResult] = useState<{ type: "success" | "warning" | "error"; message: string } | null>(null);
  const [showDictScriptGuide, setShowDictScriptGuide] = useState(false);
  const [editingDictItem, setEditingDictItem] = useState<{ originalArabic: string; arabic: string; english: string } | null>(null);

  // Settings sheet sync states
  const [settingsSyncLoading, setSettingsSyncLoading] = useState(false);
  const [settingsSyncResult, setSettingsSyncResult] = useState<{ type: "success" | "warning" | "error"; message: string } | null>(null);

  const handleSyncSettingsToSheet = async () => {
    const rawUrl = googleSheetWebhookUrl.trim();
    if (!rawUrl) {
      alert("الرجاء إدخال رابط سكربت Webhook الخاص بجوجل شيت أولاً.");
      return;
    }

    setSettingsSyncLoading(true);
    setSettingsSyncResult(null);
    try {
      // 1. Save settings locally first
      const payload: AppSettings = {
        headerText: headerText.trim(),
        subHeaderText: subHeaderText.trim(),
        welcomeMessage: welcomeMessage.trim(),
        whatsappTemplate: whatsappTemplate.trim(),
        readyMessage: readyMessage.trim(),
        deliveryMessage: deliveryMessage.trim(),
        googleSheetId: settings.googleSheetId || "",
        googleSheetUrl: googleSheetUrl.trim(),
        googleSheetWebhookUrl: rawUrl,
        autoSyncWebhook: autoSyncWebhook,
        footerText: footerText.trim(),
        googleSheetsConnected: true,
        includeSaturdayAsWeekend: includeSaturdayAsWeekend,
        customHolidays: customHolidays
      };
      const result = await updateSettingsOnServer(payload);
      onSettingsUpdated(result);

      // 2. Push settings directly to sheet
      const res = await syncSettingsToGoogleWebhook(rawUrl);
      setSettingsSyncResult({
        type: res.savedInSheet ? "success" : "warning",
        message: res.message || "تم حفظ وتصدير الإعدادات وبيانات المكتب إلى جوجل شيت بنجاح! 💾✅"
      });
      setTimeout(() => setSettingsSyncResult(null), 7000);
    } catch (err: any) {
      setSettingsSyncResult({
        type: "error",
        message: `فشل حفظ الإعدادات في جوجل شيت: ${err.message}`
      });
    } finally {
      setSettingsSyncLoading(false);
    }
  };

  const handlePullSettingsFromSheet = async () => {
    const rawUrl = googleSheetWebhookUrl.trim();
    if (!rawUrl) {
      alert("الرجاء إدخال رابط سكربت Webhook الخاص بجوجل شيت أولاً.");
      return;
    }
    const confirmPull = window.confirm("هل تريد استيراد وسحب بيانات الملف التعريفي والترويسة وقوالب الرسائل المسجلة في ملف جوجل شيت واعتمادها الآن؟");
    if (!confirmPull) return;

    setSettingsSyncLoading(true);
    setSettingsSyncResult(null);
    try {
      const res = await pullDataFromGoogleWebhook(rawUrl);
      if (res.db && res.db.settings) {
        const s = res.db.settings;
        if (s.headerText) setHeaderText(s.headerText);
        if (s.subHeaderText !== undefined) setSubHeaderText(s.subHeaderText);
        if (s.welcomeMessage) setWelcomeMessage(s.welcomeMessage);
        if (s.whatsappTemplate) setWhatsappTemplate(s.whatsappTemplate);
        if (s.readyMessage) setReadyMessage(s.readyMessage);
        if (s.deliveryMessage) setDeliveryMessage(s.deliveryMessage);
        if (s.footerText) setFooterText(s.footerText);
        onSettingsUpdated(s);
        setSettingsSyncResult({
          type: "success",
          message: "تم بنجاح استيراد بيانات الملف التعريفي والرسائل من ملف جوجل شيت! 📥✅"
        });
      } else {
        setSettingsSyncResult({
          type: "warning",
          message: "لم يتم العثور على إعدادات مسجلة في ملف جوجل شيت."
        });
      }
      setTimeout(() => setSettingsSyncResult(null), 7000);
    } catch (err: any) {
      setSettingsSyncResult({
        type: "error",
        message: `فشل الاستيراد من جوجل شيت: ${err.message}`
      });
    } finally {
      setSettingsSyncLoading(false);
    }
  };

  const handleSyncDictionaryToSheets = async () => {
    setDictSyncLoading(true);
    setDictSyncResult(null);
    try {
      const res = await syncDictionaryToGoogleWebhook(settings.googleSheetWebhookUrl);
      if (res.savedInSheet) {
        setDictSyncResult({
          type: "success",
          message: res.message || "تم تسجيل القاموس في ملف جوجل شيت بنجاح! 📖✅"
        });
      } else {
        setDictSyncResult({
          type: "warning",
          message: res.message || "تم إرسال القاموس بنجاح، ولكن يلزم تحديث كود السكربت في ملف جوجل شيت لإنشاء ورقة القاموس."
        });
      }
    } catch (err: any) {
      setDictSyncResult({
        type: "error",
        message: err.message || "فشلت المزامنة مع جوجل شيت."
      });
    } finally {
      setDictSyncLoading(false);
    }
  };

  const handleAddDictionaryWord = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newArWord.trim() || !newEnWord.trim()) return;

    setDictLoading(true);
    try {
      const updatedDict = await saveDictionaryWord(newArWord.trim(), newEnWord.trim().toUpperCase());
      if (onDictionaryUpdated) {
        onDictionaryUpdated(updatedDict);
      }
      setNewArWord("");
      setNewEnWord("");
      setDictFeedback("تم حفظ الاسم الجديد في القاموس وقاعدة البيانات وملف جوجل شيت بنجاح! 📖");
      setTimeout(() => setDictFeedback(""), 4000);
    } catch (err) {
      console.error(err);
      alert("حدث خطأ أثناء حفظ الاسم في القاموس.");
    } finally {
      setDictLoading(false);
    }
  };

  const handleDeleteDictionaryWord = async (arabic: string, english: string) => {
    if (!confirm(`⚠️ تأكيد الحذف:\nهل أنت متأكد من حذف الاسم "${arabic}" (${english}) نهائياً من قاموس الترجمة وقاعدة البيانات وملف جوجل شيت؟`)) {
      return;
    }

    setDictLoading(true);
    try {
      const updatedDict = await deleteDictionaryWord(arabic);
      if (onDictionaryUpdated) {
        onDictionaryUpdated(updatedDict);
      }
      setDictFeedback(`تم حذف "${arabic}" من القاموس وقاعدة البيانات.`);
      setTimeout(() => setDictFeedback(""), 4000);
    } catch (err) {
      console.error(err);
      alert("حدث خطأ أثناء حذف الكلمة من القاموس.");
    } finally {
      setDictLoading(false);
    }
  };

  const handleStartEditDict = (item: DictionaryItem) => {
    setEditingDictItem({
      originalArabic: item.arabic,
      arabic: item.arabic,
      english: item.english,
    });
  };

  const handleCancelEditDict = () => {
    setEditingDictItem(null);
  };

  const handleSaveEditDict = async () => {
    if (!editingDictItem || !editingDictItem.arabic.trim() || !editingDictItem.english.trim()) return;

    setDictLoading(true);
    try {
      const updatedDict = await updateDictionaryWord(
        editingDictItem.originalArabic,
        editingDictItem.arabic.trim(),
        editingDictItem.english.trim().toUpperCase()
      );
      if (onDictionaryUpdated) {
        onDictionaryUpdated(updatedDict);
      }
      setDictFeedback(`تم تعديل وحفظ الاسم "${editingDictItem.arabic}" (${editingDictItem.english.trim().toUpperCase()}) في القاموس وجوجل شيت بنجاح! 📖✅`);
      setEditingDictItem(null);
      setTimeout(() => setDictFeedback(""), 4000);
    } catch (err) {
      console.error(err);
      alert("حدث خطأ أثناء تعديل الاسم في القاموس.");
    } finally {
      setDictLoading(false);
    }
  };

  // Comprehensive Google Apps Script code for all data (Invoices, Services, Closings, Settings, Dictionary)
  const appsScriptCode = `// سكربت الربط التلقائي وقاعدة البيانات الشاملة لمكتب مزايا مع جوجل شيت
function doPost(e) {
  try {
    var contents = {};
    if (e && e.postData && e.postData.contents) {
      try {
        contents = JSON.parse(e.postData.contents);
      } catch(parseErr) {
        contents = { action: "push" };
      }
    }
    
    var action = contents.action || "push";
    var ss = SpreadsheetApp.getActiveSpreadsheet();

    // 0. Test Connection
    if (action === "test") {
      return ContentService.createTextOutput(JSON.stringify({ 
        status: "success", 
        message: "تم الاتصال بنجاح بملف جوجل شيت وقاعدة البيانات جاهزة ومستعدة للتخزين! 📊" 
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // 1. Push / Sync All Data
    if (action === "push" || action === "sync") {
      var db = contents.db || contents;

      // --- Sheet 1: Invoices_الفواتير ---
      if (db.invoices && Array.isArray(db.invoices)) {
        var invSheet = getOrCreateSheet(ss, "Invoices_الفواتير");
        invSheet.clearContents();
        var invHeaders = [
          "رقم الفاتورة", "التاريخ", "الحالة", "الموظف", "مكان الحفظ (رقم الدرج)", 
          "رسوم حكومية", "رسوم مكتب", "الإجمالي الكلي", "أسماء العملاء", "أرقام الهواتف", 
          "الخدمات المطلوبة", "تفاصيل العملاء كاملة (JSON)"
        ];
        var invRows = [invHeaders];
        for (var i = 0; i < db.invoices.length; i++) {
          var inv = db.invoices[i];
          var custNames = [];
          var custPhones = [];
          var servicesList = [];
          if (inv.customers && Array.isArray(inv.customers)) {
            for (var k = 0; k < inv.customers.length; k++) {
              var c = inv.customers[k];
              custNames.push(c.arabicName + (c.englishName ? " (" + c.englishName + ")" : ""));
              if (c.phone) custPhones.push(c.phone);
              if (c.services && Array.isArray(c.services)) {
                for (var sIdx = 0; sIdx < c.services.length; sIdx++) {
                  servicesList.push(c.services[sIdx].serviceId + " x" + (c.services[sIdx].quantity || 1));
                }
              }
            }
          }
          invRows.push([
            inv.invoiceId || "",
            inv.date || "",
            inv.status || "",
            inv.employeeName || "",
            inv.archiveDrawer || "",
            inv.totalGov || 0,
            inv.totalOffice || 0,
            inv.totalAmount || 0,
            custNames.join(" | "),
            custPhones.join(" | "),
            servicesList.join(" , "),
            JSON.stringify(inv.customers || [])
          ]);
        }
        if (invRows.length > 0) {
          invSheet.getRange(1, 1, invRows.length, invRows[0].length).setValues(invRows);
          formatHeader(invSheet, invHeaders.length);
        }
      }

      // --- Sheet 2: Services_الخدمات_والاسعار ---
      if (db.services && Array.isArray(db.services)) {
        var srvSheet = getOrCreateSheet(ss, "Services_الخدمات_والاسعار");
        srvSheet.clearContents();
        var srvHeaders = ["الترتيب", "المعرف ID", "اسم الخدمة", "السعر الحكومي", "رسوم المكتب", "إجمالي السعر", "مدة التنفيذ", "تعليمات التسليم", "إزاحة أيام التسليم", "ملاحظات للعميل"];
        var srvRows = [srvHeaders];
        for (var s = 0; s < db.services.length; s++) {
          var srv = db.services[s];
          srvRows.push([
            srv.order || (s + 1),
            srv.id || "",
            srv.name || "",
            srv.govPrice || 0,
            srv.officeFee || 0,
            (Number(srv.govPrice) || 0) + (Number(srv.officeFee) || 0),
            srv.duration || "",
            srv.instructions || "",
            srv.deliveryDaysOffset || 0,
            srv.notes || ""
          ]);
        }
        if (srvRows.length > 0) {
          srvSheet.getRange(1, 1, srvRows.length, srvRows[0].length).setValues(srvRows);
          formatHeader(srvSheet, srvHeaders.length);
        }
      }

      // --- Sheet 3: Closings_تقفيل_الخزينة ---
      if (db.collectionClosings && Array.isArray(db.collectionClosings)) {
        var clsSheet = getOrCreateSheet(ss, "Closings_تقفيل_الخزينة");
        clsSheet.clearContents();
        var clsHeaders = ["المعرف ID", "تاريخ الإغلاق", "تم الإغلاق بواسطة", "الإيراد الكلي", "صافي أرباح المكتب", "المبلغ النقدي المحصل", "المبلغ الآجل", "ملاحظات"];
        var clsRows = [clsHeaders];
        for (var c = 0; c < db.collectionClosings.length; c++) {
          var cls = db.collectionClosings[c];
          clsRows.push([
            cls.id || "",
            cls.closeDate || "",
            cls.closedBy || "",
            cls.revenue || 0,
            cls.profit || 0,
            cls.cashAmount || 0,
            cls.deferredAmount || 0,
            cls.notes || ""
          ]);
        }
        if (clsRows.length > 0) {
          clsSheet.getRange(1, 1, clsRows.length, clsRows[0].length).setValues(clsRows);
          formatHeader(clsSheet, clsHeaders.length);
        }
      }

      // --- Sheet 4: Settings_الاعدادات_والرسائل ---
      if (db.settings) {
        var stSheet = getOrCreateSheet(ss, "Settings_الاعدادات_والرسائل");
        stSheet.clearContents();
        var stHeaders = ["بند الإعداد (Setting Name)", "القيمة المحفوظة (Value)", "المعرف البرمجي (Key)"];
        var stRows = [
          stHeaders,
          ["اسم وبيانات المكتب بالترويسة", db.settings.headerText || "", "headerText"],
          ["الترويسة الفرعية", db.settings.subHeaderText || "", "subHeaderText"],
          ["رسالة الترحيب واستلام الطلب", db.settings.welcomeMessage || "", "welcomeMessage"],
          ["قالب رسالة الفاتورة (واتساب)", db.settings.whatsappTemplate || "", "whatsappTemplate"],
          ["قالب رسالة جاهزية الأوراق للاستلام", db.settings.readyMessage || "", "readyMessage"],
          ["قالب رسالة تم التسليم بنجاح", db.settings.deliveryMessage || "", "deliveryMessage"],
          ["تذييل الفاتورة المطبوعة", db.settings.footerText || "", "footerText"],
          ["إعدادات النظام كاملة (JSON)", JSON.stringify(db.settings || {}), "settings_json"]
        ];
        stSheet.getRange(1, 1, stRows.length, stRows[0].length).setValues(stRows);
        formatHeader(stSheet, stHeaders.length);
        try {
          stSheet.setColumnWidth(1, 240);
          stSheet.setColumnWidth(2, 450);
          stSheet.setColumnWidth(3, 160);
        } catch(cwErr) {}
      }

      // --- Sheet 5: Dictionary_قاموس_الاسماء ---
      var dictData = db.dictionary || contents.dictionary;
      if (dictData && Array.isArray(dictData)) {
        var dictSheet = ss.getSheetByName("Dictionary_قاموس_الاسماء") || 
                        ss.getSheetByName("Dictionary") || 
                        ss.getSheetByName("قاموس_الاسماء") || 
                        ss.insertSheet("Dictionary_قاموس_الاسماء");
        dictSheet.clearContents();
        var dictHeaders = ["م", "الاسم بالعربي", "الاسم بالإنجليزي (معايير الجوازات)"];
        var dictRows = [dictHeaders];
        for (var d = 0; d < dictData.length; d++) {
          dictRows.push([
            d + 1,
            dictData[d].arabic || "", 
            dictData[d].english || ""
          ]);
        }
        if (dictRows.length > 0) {
          dictSheet.getRange(1, 1, dictRows.length, dictRows[0].length).setValues(dictRows);
          formatHeader(dictSheet, dictHeaders.length);
          try {
            dictSheet.setColumnWidth(1, 60);
            dictSheet.setColumnWidth(2, 220);
            dictSheet.setColumnWidth(3, 260);
          } catch(cwErr) {}
        }
      }

      return ContentService.createTextOutput(JSON.stringify({ 
        status: "success", 
        message: "تم تحديث وحفظ كافة البيانات في ملف جوجل شيت بنجاح! 🚀" 
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // 2. Direct Specific Settings Push
    if (action === "push_settings") {
      var stData = contents.settings || (contents.db && contents.db.settings) || {};
      var sSheet = getOrCreateSheet(ss, "Settings_الاعدادات_والرسائل");
      sSheet.clearContents();
      var sHeaders = ["بند الإعداد (Setting Name)", "القيمة المحفوظة (Value)", "المعرف البرمجي (Key)"];
      var sRows = [
        sHeaders,
        ["اسم وبيانات المكتب بالترويسة", stData.headerText || "", "headerText"],
        ["الترويسة الفرعية", stData.subHeaderText || "", "subHeaderText"],
        ["رسالة الترحيب واستلام الطلب", stData.welcomeMessage || "", "welcomeMessage"],
        ["قالب رسالة الفاتورة (واتساب)", stData.whatsappTemplate || "", "whatsappTemplate"],
        ["قالب رسالة جاهزية الأوراق للاستلام", stData.readyMessage || "", "readyMessage"],
        ["قالب رسالة تم التسليم بنجاح", stData.deliveryMessage || "", "deliveryMessage"],
        ["تذييل الفاتورة المطبوعة", stData.footerText || "", "footerText"],
        ["إعدادات النظام كاملة (JSON)", JSON.stringify(stData || {}), "settings_json"]
      ];
      sSheet.getRange(1, 1, sRows.length, sRows[0].length).setValues(sRows);
      formatHeader(sSheet, sHeaders.length);
      try {
        sSheet.setColumnWidth(1, 240);
        sSheet.setColumnWidth(2, 450);
        sSheet.setColumnWidth(3, 160);
      } catch(cwErr) {}

      return ContentService.createTextOutput(JSON.stringify({ 
        status: "success", 
        message: "تم حفظ وتحديث إعدادات وبيانات المكتب في ورقة (Settings_الاعدادات_والرسائل) بملف جوجل شيت بنجاح! 💾✅" 
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // 3. Direct Specific Dictionary Push
    if (action === "push_dictionary") {
      var dictList = contents.dictionary || (contents.db && contents.db.dictionary) || [];
      if (Array.isArray(dictList)) {
        var dSheet = ss.getSheetByName("Dictionary_قاموس_الاسماء") || 
                     ss.getSheetByName("Dictionary") || 
                     ss.getSheetByName("قاموس_الاسماء") || 
                     ss.insertSheet("Dictionary_قاموس_الاسماء");
        dSheet.clearContents();
        var dHeaders = ["م", "الاسم بالعربي", "الاسم بالإنجليزي (معايير الجوازات)"];
        var dRows = [dHeaders];
        for (var k = 0; k < dictList.length; k++) {
          dRows.push([
            k + 1,
            dictList[k].arabic || "", 
            dictList[k].english || ""
          ]);
        }
        if (dRows.length > 0) {
          dSheet.getRange(1, 1, dRows.length, dRows[0].length).setValues(dRows);
          formatHeader(dSheet, dHeaders.length);
          try {
            dSheet.setColumnWidth(1, 60);
            dSheet.setColumnWidth(2, 220);
            dSheet.setColumnWidth(3, 260);
          } catch(cwErr) {}
        }
        return ContentService.createTextOutput(JSON.stringify({ 
          status: "success", 
          message: "تم تسجيل وتحديث ورقة قاموس الأسماء (" + dictList.length + " اسم) بملف جوجل شيت بنجاح! 📖✅" 
        })).setMimeType(ContentService.MimeType.JSON);
      }
    }

    return ContentService.createTextOutput(JSON.stringify({ error: "إجراء غير معروف" }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  try {
    if (e && e.parameter && e.parameter.action === "test") {
      return ContentService.createTextOutput(JSON.stringify({ 
        status: "success", 
        message: "تم الاتصال بنجاح بملف جوجل شيت! 📊" 
      })).setMimeType(ContentService.MimeType.JSON);
    }

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var db = {
      settings: {},
      services: [],
      invoices: [],
      collectionClosings: [],
      dictionary: []
    };

    // 1. Read Services
    var srvSheet = ss.getSheetByName("Services_الخدمات_والاسعار") || ss.getSheetByName("Services");
    if (srvSheet) {
      var srvValues = srvSheet.getDataRange().getValues();
      for (var s = 1; s < srvValues.length; s++) {
        var row = srvValues[s];
        if (row[1] || row[2]) {
          var idVal = String(row[1] || row[0]);
          var nameVal = String(row[2] || row[1]);
          var govVal = Number(row[3] || row[2]) || 0;
          var offVal = Number(row[4] || row[3]) || 0;
          db.services.push({
            order: Number(row[0]) || s,
            id: idVal,
            name: nameVal,
            govPrice: govVal,
            officeFee: offVal,
            duration: String(row[6] || row[4] || ""),
            instructions: String(row[7] || row[5] || ""),
            deliveryDaysOffset: Number(row[8] || row[6]) || 0,
            notes: String(row[9] || row[7] || "")
          });
        }
      }
    }

    // 2. Read Invoices
    var invSheet = ss.getSheetByName("Invoices_الفواتير") || ss.getSheetByName("Invoices");
    if (invSheet) {
      var invValues = invSheet.getDataRange().getValues();
      for (var v = 1; v < invValues.length; v++) {
        var iRow = invValues[v];
        if (iRow[0]) {
          var custData = [];
          var rawJson = iRow[11] || iRow[8];
          try {
            custData = rawJson ? JSON.parse(rawJson) : [];
          } catch(e){}
          db.invoices.push({
            invoiceId: Number(iRow[0]),
            date: String(iRow[1] || ""),
            status: String(iRow[2] || "NEW"),
            employeeName: String(iRow[3] || ""),
            archiveDrawer: String(iRow[4] || ""),
            totalGov: Number(iRow[5]) || 0,
            totalOffice: Number(iRow[6]) || 0,
            totalAmount: Number(iRow[7]) || 0,
            customers: custData
          });
        }
      }
    }

    // 3. Read Closings
    var clsSheet = ss.getSheetByName("Closings_تقفيل_الخزينة") || ss.getSheetByName("CollectionClosings");
    if (clsSheet) {
      var clsValues = clsSheet.getDataRange().getValues();
      for (var c = 1; c < clsValues.length; c++) {
        var cRow = clsValues[c];
        if (cRow[0]) {
          db.collectionClosings.push({
            id: String(cRow[0]),
            closeDate: String(cRow[1] || ""),
            closedBy: String(cRow[2] || ""),
            revenue: Number(cRow[3]) || 0,
            profit: Number(cRow[4]) || 0,
            cashAmount: Number(cRow[5]) || 0,
            deferredAmount: Number(cRow[6]) || 0,
            notes: String(cRow[7] || "")
          });
        }
      }
    }

    // 4. Read Settings
    var stSheet = ss.getSheetByName("Settings_الاعدادات_والرسائل") || 
                  ss.getSheetByName("Settings") || 
                  ss.getSheetByName("الاعدادات") || 
                  ss.getSheetByName("الاعدادات_والرسائل");
    if (stSheet) {
      var stValues = stSheet.getDataRange().getValues();
      for (var st = 1; st < stValues.length; st++) {
        var row = stValues[st];
        var label = String(row[0] || "").trim();
        var val = row[1] !== undefined && row[1] !== null ? String(row[1]) : "";
        var key = String(row[2] || "").trim();

        // 1. Check direct key
        if (key && key !== "settings_json") {
          db.settings[key] = val;
        }

        // 2. Fallback matching by label
        if (label.indexOf("ترويسة") !== -1 && label.indexOf("فرعية") === -1) {
          db.settings.headerText = val;
        } else if (label.indexOf("فرعية") !== -1) {
          db.settings.subHeaderText = val;
        } else if (label.indexOf("ترحيب") !== -1 || label.indexOf("استلام الطلب") !== -1 || label.indexOf("welcome") !== -1) {
          db.settings.welcomeMessage = val;
        } else if (label.indexOf("واتساب") !== -1 || label.indexOf("whatsapp") !== -1) {
          db.settings.whatsappTemplate = val;
        } else if (label.indexOf("جاهزية") !== -1 || label.indexOf("ready") !== -1) {
          db.settings.readyMessage = val;
        } else if (label.indexOf("التسليم بنجاح") !== -1 || label.indexOf("delivery") !== -1) {
          db.settings.deliveryMessage = val;
        } else if (label.indexOf("تذييل") !== -1 || label.indexOf("footer") !== -1) {
          db.settings.footerText = val;
        }

        // 3. Complete JSON backup
        if (label.indexOf("JSON") !== -1 || key === "settings_json") {
          try {
            var parsed = JSON.parse(val);
            db.settings = Object.assign({}, parsed, db.settings);
          } catch(e){}
        }
      }
    }

    // 5. Read Dictionary
    var dictSheet = ss.getSheetByName("Dictionary_قاموس_الاسماء") || 
                    ss.getSheetByName("Dictionary") || 
                    ss.getSheetByName("قاموس_الاسماء");
    if (dictSheet) {
      var dictValues = dictSheet.getDataRange().getValues();
      if (dictValues && dictValues.length > 1) {
        for (var d = 1; d < dictValues.length; d++) {
          var dRow = dictValues[d];
          var ar = "";
          var en = "";
          if (dRow.length >= 3 && dRow[1]) {
            ar = dRow[1];
            en = dRow[2];
          } else if (dRow.length >= 2 && dRow[0]) {
            ar = dRow[0];
            en = dRow[1];
          }
          if (ar && en) {
            db.dictionary.push({
              arabic: String(ar).trim(),
              english: String(en).trim().toUpperCase()
            });
          }
        }
      }
    }

    return ContentService.createTextOutput(JSON.stringify({ status: "success", db: db }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function getOrCreateSheet(ss, name) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
  }
  return sheet;
}

function formatHeader(sheet, numCols) {
  try {
    sheet.setRightToLeft(true);
    sheet.setFrozenRows(1);
    var range = sheet.getRange(1, 1, 1, numCols);
    range.setBackground("#1e293b");
    range.setFontColor("#ffffff");
    range.setFontWeight("bold");
    range.setHorizontalAlignment("center");
  } catch(e) {}
}`;

  const handleCopyScript = () => {
    navigator.clipboard.writeText(appsScriptCode);
    setCopiedScript(true);
    setTimeout(() => setCopiedScript(false), 3000);
  };

  useEffect(() => {
    if (settings) {
      setHeaderText(settings.headerText || "مكتب مزايا للجوازات والمعاملات");
      setSubHeaderText(settings.subHeaderText ?? "جوازات طنطا والمعاملات الحكومية");
      setWelcomeMessage(settings.welcomeMessage || "");
      setWhatsappTemplate(settings.whatsappTemplate || "");
      setReadyMessage(settings.readyMessage || "");
      setDeliveryMessage(settings.deliveryMessage || "");
      setGoogleSheetUrl(settings.googleSheetUrl || "");
      setGoogleSheetWebhookUrl(settings.googleSheetWebhookUrl || settings.googleSheetUrl || "");
      setFooterText(settings.footerText || "يسعدنا دائماً خدمتكم وثقتكم بنا");
    }
  }, [settings]);

  // Test connection, save URL, and push all data
  const handleTestAndConnect = async () => {
    const rawUrl = googleSheetWebhookUrl.trim();
    if (!rawUrl) {
      alert("الرجاء إدخال رابط قاعدة بيانات جوجل شيت أولاً.");
      return;
    }

    setSyncLoading(true);
    setSyncMessage("جاري فحص الاتصال برابط قاعدة بيانات جوجل شيت...");
    try {
      if (rawUrl.includes("docs.google.com/spreadsheets")) {
        setGoogleSheetUrl(rawUrl);
        const payload: AppSettings = {
          headerText: headerText.trim(),
          subHeaderText: subHeaderText.trim(),
          welcomeMessage: welcomeMessage.trim(),
          whatsappTemplate: whatsappTemplate.trim(),
          readyMessage: readyMessage.trim(),
          deliveryMessage: deliveryMessage.trim(),
          googleSheetUrl: rawUrl,
          googleSheetWebhookUrl: googleSheetWebhookUrl.trim(),
          autoSyncWebhook: true,
          footerText: footerText.trim(),
          googleSheetsConnected: true,
        };
        const result = await updateSettingsOnServer(payload);
        onSettingsUpdated(result);
        setShowScriptGuide(true);
        setSyncMessage("تم حفظ رابط ملف جوجل شيت! 📊 لتفعيل الحفظ والمزامنة المباشرة، انسخ كود السكربت من الزر المخصص بالأسفل وضعه في Apps Script الخاص بملف الشيت.");
        alert("تم حفظ رابط ملف جوجل شيت بنجاح! 📊\nلتفعيل المزامنة التلقائية اللحظية، انسخ كود السكربت من الزر المخصص بالأسفل وركبه في Extensions > Apps Script بالملف.");
        return;
      }

      // Test Apps Script Webhook
      const testRes = await testGoogleWebhook(rawUrl);

      // Save settings in strict manual mode to protect services & prices
      const payload: AppSettings = {
        headerText: headerText.trim(),
        subHeaderText: subHeaderText.trim(),
        welcomeMessage: welcomeMessage.trim(),
        whatsappTemplate: whatsappTemplate.trim(),
        readyMessage: readyMessage.trim(),
        deliveryMessage: deliveryMessage.trim(),
        googleSheetWebhookUrl: rawUrl,
        googleSheetUrl: googleSheetUrl || "",
        autoSyncWebhook: false, // Strict manual mode
        footerText: footerText.trim(),
        googleSheetsConnected: true,
      };
      const result = await updateSettingsOnServer(payload);
      onSettingsUpdated(result);
      setAutoSyncWebhook(false);

      setSyncMessage(testRes.message || "تم الاتصال بنجاح وتفعيل ملف جوجل شيت! 📊 تم تفعيل النمط اليدوي للحفاظ على الخدمات والأسعار من التعديل التلقائي.");
      alert("تم الاتصال بنجاح بملف جوجل شيت! 📊\n\n🛡️ تم ضبط النظام على (التعامل اليدوي فقط) ولن يتم تصدير أو استيراد البيانات تلقائياً عند فتح البرنامج أو تعديل البرمجة، وذلك لحماية مسميات الخدمات والأسعار من المسح أو التغيير.\n\n📥 اضغط على زر (استيراد وسحب البيانات من جوجل شيت) لجلب خدماتك وبياناتك فوراً.\n📤 اضغط على زر (تصدير وتحديث كافة البيانات في جوجل شيت) لرفع البيانات الحالية.");
    } catch (err: any) {
      console.error(err);
      setSyncMessage(`فشل الاتصال: ${err.message}`);
      alert(`فشل اختبار الاتصال بالرابط: ${err.message}\nتأكد من نشر السكربت واختيار Who has access: Anyone.`);
    } finally {
      setSyncLoading(false);
    }
  };

  const handlePushWebhook = async () => {
    const rawUrl = googleSheetWebhookUrl.trim();
    if (!rawUrl) {
      alert("الرجاء إدخال رابط قاعدة بيانات جوجل شيت أولاً.");
      return;
    }
    const confirmPush = window.confirm("هل ترغب في رفع وتحديث كافة البيانات في جوجل شيت الآن؟ (فواتير، خدمات، أسعار، حركات وتقفيل الخزينة، رسائل، إعدادات)");
    if (!confirmPush) return;

    setSyncLoading(true);
    setSyncMessage("جاري تصدير ونقل كافة البيانات إلى جوجل شيت...");
    try {
      const res = await pushDataToGoogleWebhook(rawUrl);
      setSyncMessage(res.message || "تم تصدير البيانات بنجاح!");
      alert("تم تصدير وحفظ كامل البيانات في جوجل شيت بنجاح! 🚀");
    } catch (err: any) {
      console.error(err);
      setSyncMessage(`فشل التصدير: ${err.message}`);
      alert(`فشل التصدير: ${err.message}`);
    } finally {
      setSyncLoading(false);
    }
  };

  const handlePullWebhook = async () => {
    const rawUrl = googleSheetWebhookUrl.trim();
    if (!rawUrl) {
      alert("الرجاء إدخال رابط قاعدة بيانات جوجل شيت أولاً.");
      return;
    }
    const confirmPull = window.confirm("تحذير: هل أنت متأكد من استيراد البيانات من جوجل شيت؟ سيتم تحديث قاعدة البيانات بالبيانات الواردة من شيت.");
    if (!confirmPull) return;

    setSyncLoading(true);
    setSyncMessage("جاري سحب واستيراد البيانات من جوجل شيت...");
    try {
      const res = await pullDataFromGoogleWebhook(rawUrl);
      onSettingsUpdated(res.db.settings);
      setSyncMessage(res.message || "تم استيراد البيانات بنجاح!");
      alert("تم استيراد كافة البيانات بنجاح من جوجل شيت! 📥 سيتم إعادة تحميل الصفحة الآن لتطبيق التحديثات.");
      window.location.reload();
    } catch (err: any) {
      console.error(err);
      setSyncMessage(`فشل الاستيراد: ${err.message}`);
      alert(`فشل الاستيراد: ${err.message}`);
    } finally {
      setSyncLoading(false);
    }
  };

  // Passcode States
  const [myCurrentPassword, setMyCurrentPassword] = useState("");
  const [myNewPassword, setMyNewPassword] = useState("");
  const [myConfirmPassword, setMyConfirmPassword] = useState("");

  const handleChangeMyPassword = async () => {
    if (activeEmployee.password && activeEmployee.password.trim() !== "") {
      if (myCurrentPassword !== activeEmployee.password) {
        alert("الرقم السري الحالي غير صحيح.");
        return;
      }
    }
    
    if (!myNewPassword.trim()) {
      alert("الرجاء إدخال رقم سري جديد صالح.");
      return;
    }
    
    if (myNewPassword !== myConfirmPassword) {
      alert("الرقم السري الجديد وتأكيده غير متطابقين.");
      return;
    }

    const updatedEmployees = employees.map((emp) => 
      emp.username === activeEmployee.username ? { ...emp, password: myNewPassword.trim() } : emp
    );

    try {
      await onEmployeesUpdated(updatedEmployees);
      alert("تم تحديث وتلقيم رقمك السري بنجاح في قاعدة البيانات الآمنة للخصوصية 🔐");
      setMyCurrentPassword("");
      setMyNewPassword("");
      setMyConfirmPassword("");
      // Update local reference to reflect immediately
      activeEmployee.password = myNewPassword.trim();
    } catch (err) {
      console.error(err);
      alert("حدث خطأ أثناء حفظ الرقم السري.");
    }
  };

  const handleAdminResetPassword = async (emp: Employee) => {
    const newPass = prompt(`أدخل الرقم السري الجديد للموظف (${emp.name}):`, emp.password || "");
    if (newPass === null) return; // user cancelled

    const updatedEmployees = employees.map((e) => 
      e.username === emp.username ? { ...e, password: newPass.trim() || undefined } : e
    );

    try {
      await onEmployeesUpdated(updatedEmployees);
      alert(`تم تحديث الرقم السري للموظف (${emp.name}) بنجاح في الخادم.`);
    } catch (err) {
      console.error(err);
      alert("حدث خطأ أثناء تعديل رقم الموظف.");
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeEmployee.permissions.canManageServices) {
      alert("عذراً، تحتاج إلى صلاحيات إدارة كاملة لتغيير معلمات النظام الأساسية.");
      return;
    }

    setSaving(true);
    try {
      const payload: AppSettings = {
        headerText: headerText.trim(),
        subHeaderText: subHeaderText.trim(),
        welcomeMessage: welcomeMessage.trim(),
        whatsappTemplate: whatsappTemplate.trim(),
        readyMessage: readyMessage.trim(),
        deliveryMessage: deliveryMessage.trim(),
        googleSheetId: settings.googleSheetId || "",
        googleSheetUrl: googleSheetUrl.trim(),
        googleSheetWebhookUrl: googleSheetWebhookUrl.trim(),
        autoSyncWebhook: autoSyncWebhook,
        footerText: footerText.trim(),
        googleSheetsConnected: !!(googleSheetWebhookUrl.trim() || googleSheetUrl.trim() || settings.googleSheetsConnected),
        includeSaturdayAsWeekend: includeSaturdayAsWeekend,
        customHolidays: customHolidays
      };

      const result = await updateSettingsOnServer(payload);
      onSettingsUpdated(result);
      alert("تم حفظ إعدادات النظام وتحديثها في ملف جوجل شيت بنجاح! 💾✅");
    } catch (err) {
      console.error(err);
      alert("حدث خطأ أثناء حفظ الإعدادات بالخادم.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 font-cairo">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900">شاشة تهيئة النظام والمعلمات</h2>
          <p className="text-sm text-slate-500 mt-1">تعديل معلومات المكتب المطبوعة، قوالب إرسال الواتساب والربط الرقمي</p>
        </div>
      </div>

      <form onSubmit={handleSaveSettings} className="space-y-6 max-w-3xl">
        
        {/* Core Office Profile Card */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <h3 className="font-bold text-sm text-slate-800 flex items-center gap-1.5">
              <Settings className="w-4.5 h-4.5 text-slate-500" />
              <span>الملف التعريفي للمكتب وترويسة الفاتورة:</span>
            </h3>
            
            {/* Quick Settings Sync Buttons */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handlePullSettingsFromSheet}
                disabled={settingsSyncLoading}
                className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 text-[11px] font-bold rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                title="سحب أحدث بيانات الترويسة والرسائل من ملف جوجل شيت"
              >
                <span>استيراد الإعدادات من جوجل شيت 📥</span>
              </button>

              <button
                type="button"
                onClick={handleSyncSettingsToSheet}
                disabled={settingsSyncLoading}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shadow-xs"
                title="حفظ وتصدير بيانات الترويسة والرسائل في ورقة Settings بجوجل شيت فوراً"
              >
                <span>{settingsSyncLoading ? "جاري الحفظ..." : "تصدير وحفظ في جوجل شيت 📤"}</span>
              </button>
            </div>
          </div>

          {/* Sync status alert for settings */}
          {settingsSyncResult && (
            <div className={`p-3 rounded-xl text-xs font-bold flex items-center gap-2 ${
              settingsSyncResult.type === "success" 
                ? "bg-emerald-50 text-emerald-800 border border-emerald-200" 
                : settingsSyncResult.type === "warning" 
                ? "bg-amber-50 text-amber-800 border border-amber-200" 
                : "bg-rose-50 text-rose-800 border border-rose-200"
            }`}>
              <span>{settingsSyncResult.message}</span>
            </div>
          )}

          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 block">اسم المكتب المعتمد بالترويسة:</label>
              <input 
                type="text" 
                value={headerText}
                onChange={(e) => setHeaderText(e.target.value)}
                placeholder="e.g. مكتب مزايا للخدمات الحكومية والجوازات"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs"
                required
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 block">رقم هاتف التواصل والشكاوى:</label>
              <input 
                type="text" 
                value={welcomeMessage}
                onChange={(e) => setWelcomeMessage(e.target.value)}
                placeholder="e.g. 01020304050"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono"
                required
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-700 block">السطر الفرعي في ترويسة الفاتورة المطبوعة:</label>
            <input 
              type="text" 
              value={subHeaderText}
              onChange={(e) => setSubHeaderText(e.target.value)}
              placeholder="e.g. جوازات طنطا والمعاملات الحكومية"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs"
            />
            <p className="text-[10px] text-slate-400">
              النص الذي يظهر مباشرة أسفل اسم المكتب في إيصال الطباعة الحرارية (افتراضياً: جوازات طنطا والمعاملات الحكومية)
            </p>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-700 block">تذييل إيصال الطباعة الحرارية (8 سم):</label>
            <input 
              type="text" 
              value={footerText}
              onChange={(e) => setFooterText(e.target.value)}
              placeholder="يسعدنا خدمتكم - طنطا شارع الجلاء بجوار الجوازات"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-700 block">شروط وأحكام تسليم المعاملات الافتراضية:</label>
            <textarea 
              value={whatsappTemplate}
              onChange={(e) => setWhatsappTemplate(e.target.value)}
              placeholder="مثال: يرجى إحضار أصل البطاقة الشخصية لمطابقتها عند التسليم..."
              rows={3}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs"
              required
            />
          </div>
        </div>

        {/* WhatsApp Notification Message Templates Card */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-4">
          <h3 className="font-bold text-sm text-slate-800 flex items-center gap-1.5 border-b border-slate-100 pb-2">
            <MessageCircle className="w-4.5 h-4.5 text-blue-500" />
            قوالب رسائل تذكير الواتساب التلقائية:
          </h3>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 block">قالب الإخطار بجاهزية الأوراق (مرحلة Ready):</label>
              <textarea 
                value={readyMessage}
                onChange={(e) => setReadyMessage(e.target.value)}
                placeholder="أهلاً {اسم_العميل}، طلبك {الخدمات} جاهز للتسليم في مكتب مزايا بالدرج {رقم_الارشيف}."
                rows={3}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs"
              />
              <div className="flex flex-wrap gap-1.5 text-[9px] text-slate-400 font-mono">
                <span>متغيرات صالحة:</span>
                <span className="bg-slate-100 px-1 py-0.5 rounded text-slate-700 font-bold">{"{اسم_العميل}"}</span>
                <span className="bg-slate-100 px-1 py-0.5 rounded text-slate-700 font-bold">{"{رقم_الفاتورة}"}</span>
                <span className="bg-slate-100 px-1 py-0.5 rounded text-slate-700 font-bold">{"{رقم_الارشيف}"}</span>
                <span className="bg-slate-100 px-1 py-0.5 rounded text-slate-700 font-bold">{"{الخدمات}"}</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 block">قالب رسالة تأكيد التسليم الناجح (مرحلة Delivered):</label>
              <textarea 
                value={deliveryMessage}
                onChange={(e) => setDeliveryMessage(e.target.value)}
                placeholder="عزيزنا {اسم_العميل}، تم تسليم كامل مستندات الفاتورة {رقم_الفاتورة} بنجاح وسرور."
                rows={2}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs"
              />
              <div className="flex flex-wrap gap-1.5 text-[9px] text-slate-400 font-mono">
                <span>متغيرات صالحة:</span>
                <span className="bg-slate-100 px-1 py-0.5 rounded text-slate-700 font-bold">{"{اسم_العميل}"}</span>
                <span className="bg-slate-100 px-1 py-0.5 rounded text-slate-700 font-bold">{"{رقم_الفاتورة}"}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Unified Google Sheets Master Database Card */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div>
              <h3 className="font-extrabold text-sm text-slate-900 flex items-center gap-2">
                <Globe className="w-5 h-5 text-emerald-600" />
                قاعدة بيانات النظام (Google Sheets Master Database):
              </h3>
              <p className="text-[11px] text-slate-500 mt-1">
                مكان واحد فقط لربط ملف جوجل شيت ليعمل كقاعدة بيانات شاملة تسجل كل شيء (خدمات، أسعار، فواتير، حركات الخزينة، رسائل، وإعدادات).
              </p>
            </div>
            {googleSheetWebhookUrl && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                قاعدة البيانات متصلة وجاهزة
              </span>
            )}
          </div>

          <div className="space-y-4 text-xs">
            {/* Single Unified URL Input */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-800 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <LinkIcon className="w-4 h-4 text-emerald-600" />
                  رابط قاعدة بيانات جوجل شيت (Google Sheet URL / Webhook):
                </span>
                <button
                  type="button"
                  onClick={() => setShowScriptGuide(!showScriptGuide)}
                  className="text-[11px] text-emerald-700 hover:text-emerald-900 font-bold flex items-center gap-1 cursor-pointer bg-emerald-50 px-2 py-1 rounded-md border border-emerald-200"
                >
                  <Code className="w-3.5 h-3.5" />
                  {showScriptGuide ? "إخفاء كود إعداد الشيت" : "كود إعداد قاعدة البيانات في جوجل شيت (Apps Script) 📋"}
                </button>
              </label>

              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="url"
                  value={googleSheetWebhookUrl}
                  onChange={(e) => {
                    setGoogleSheetWebhookUrl(e.target.value);
                    if (e.target.value.includes("docs.google.com/spreadsheets")) {
                      setGoogleSheetUrl(e.target.value);
                    }
                  }}
                  placeholder="https://script.google.com/macros/s/AKfycbx.../exec أو رابط المستند"
                  className="flex-1 bg-slate-50 border border-slate-300 focus:border-emerald-600 focus:bg-white rounded-xl px-3.5 py-2.5 text-xs font-mono text-left dir-ltr transition-all"
                  required
                />
                <button
                  type="button"
                  disabled={syncLoading || !googleSheetWebhookUrl.trim()}
                  onClick={handleTestAndConnect}
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 shadow-xs whitespace-nowrap"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${syncLoading ? "animate-spin" : ""}`} />
                  ربط وحفظ وتفعيل قاعدة البيانات 🚀
                </button>
              </div>

              {googleSheetUrl && (
                <div className="flex items-center justify-between pt-1 text-[11px] text-slate-500">
                  <span>مستند جوجل شيت المرتبط:</span>
                  <a
                    href={googleSheetUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-emerald-700 hover:text-emerald-900 font-bold flex items-center gap-1 underline"
                  >
                    <ExternalLink className="w-3 h-3" />
                    فتح ملف جوجل شيت في نافذة جديدة
                  </a>
                </div>
              )}
            </div>

            {/* Protection Notice: Manual Sync Mode */}
            <div className="bg-emerald-50/90 border border-emerald-200 rounded-xl p-3.5 text-xs text-emerald-950 flex items-start gap-3">
              <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <div className="font-bold flex items-center gap-2">
                  <span>نمط المزامنة: تعامل يدوي فقط (حماية تامة لمسميات الخدمات والأسعار) 🛡️</span>
                  <span className="px-2 py-0.5 bg-emerald-200/80 text-emerald-900 rounded-md text-[10px] font-bold">نشط</span>
                </div>
                <p className="text-[11px] text-emerald-800 leading-relaxed">
                  تم إيقاف التصدير والاستيراد التلقائي عند بداية فتح البرنامج أو عند تعديل البرمجة، لضمان عدم مسح مسميات الخدمات وأسعارها التي قمت بتخصيصها. يتم النقل والتبادل يدوياً بالكامل فقط عند ضغطك على أزرار الاستيراد أو التصدير أدناه.
                </p>
              </div>
            </div>

            {/* Sync Action Buttons */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <button
                type="button"
                disabled={syncLoading || !googleSheetWebhookUrl.trim()}
                onClick={handlePullWebhook}
                className="py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs flex flex-col items-center justify-center gap-1 transition-colors cursor-pointer disabled:opacity-40 shadow-xs"
              >
                <div className="flex items-center gap-2 text-sm">
                  <Download className="w-4 h-4 text-blue-200" />
                  <span>استيراد وسحب البيانات من جوجل شيت 📥</span>
                </div>
                <span className="text-[10px] text-blue-100 font-normal">سحب أحدث مسميات الخدمات والأسعار والفواتير والقاموس من الشيت</span>
              </button>

              <button
                type="button"
                disabled={syncLoading || !googleSheetWebhookUrl.trim()}
                onClick={handlePushWebhook}
                className="py-3 px-4 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-xs flex flex-col items-center justify-center gap-1 transition-colors cursor-pointer disabled:opacity-40 shadow-xs"
              >
                <div className="flex items-center gap-2 text-sm">
                  <Download className="w-4 h-4 rotate-180 text-emerald-400" />
                  <span>تصدير وتحديث كافة البيانات في جوجل شيت 📤</span>
                </div>
                <span className="text-[10px] text-slate-300 font-normal">رفع وتحديث كافة البيانات الحالية في أوراق العمل بملف جوجل شيت</span>
              </button>
            </div>

            {/* Script Setup Instructions Guide */}
            {showScriptGuide && (
              <div className="bg-slate-900 text-slate-100 rounded-xl p-4 space-y-3 font-sans mt-3">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <span className="font-bold text-xs text-amber-400 flex items-center gap-1.5">
                    <Code className="w-4 h-4" />
                    طريقة تجهيز ملف جوجل شيت ليعمل كقاعدة بيانات (خطوة واحدة فقط):
                  </span>
                  <button
                    type="button"
                    onClick={handleCopyScript}
                    className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold rounded-lg flex items-center gap-1 cursor-pointer transition-colors"
                  >
                    {copiedScript ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    {copiedScript ? "تم النسخ بنجاح! ✓" : "نسخ كود السكربت 📋"}
                  </button>
                </div>

                <ol className="text-[11px] space-y-2 text-slate-300 list-decimal list-inside leading-relaxed font-cairo">
                  <li>افتح ملف Google Sheets الذي ترغب باستخدامه (جديد أو موجود).</li>
                  <li>من القائمة العلوية اضغط على <strong>امتدادات (Extensions)</strong> ثم اختر <strong>Apps Script</strong>.</li>
                  <li>امسح أي كود موجود هناك والصق الكود المنسوخ بالكامل، ثم اضغط <strong>حفظ (Save / Ctrl+S)</strong>.</li>
                  <li>
                    اضغط زر <strong>نشر (Deploy)</strong> الأزرق في أعلى الصفحة:
                    <ul className="list-disc list-inside mr-4 mt-1 space-y-1 text-slate-300">
                      <li><strong>إذا كانت أول مرة:</strong> اختر <strong>نشر جديد (New deployment)</strong> &gt; اختر النوع <strong>تطبيق ويب (Web app)</strong> &gt; وفي خيار <strong>من يمكنه الوصول (Who has access)</strong> اختر: <span className="text-amber-400 font-bold">أي شخص (Anyone)</span> ثم اضغط <strong>Deploy</strong>.</li>
                      <li><strong className="text-amber-300">إذا كنت قد نشرت مسبقاً وتظهر رسالة (Script function not found):</strong> اختر <strong>إدارة عمليات النشر (Manage deployments)</strong> &gt; اضغط على <strong>أيقونة القلم (تعديل - Edit)</strong> &gt; في خانة <strong>الإصدار (Version)</strong> اختر <span className="text-emerald-400 font-bold">إصدار جديد (New version)</span> &gt; ثم اضغط <strong>نشر (Deploy)</strong>.</li>
                    </ul>
                  </li>
                  <li>انسخ رابط الويب (Web app URL) وضعه في الخانة بالأعلى واضغط <strong>"ربط وحفظ وتفعيل قاعدة البيانات 🚀"</strong>. سيقوم السكربت تلقائياً بإنشاء أوراق العمل الخمسة وتنسيقها وحفظ كافة بيانات النظام بها وتفعيل الحفظ التلقائي الفوري!</li>
                </ol>

                <div className="relative mt-2">
                  <pre className="bg-slate-950 p-3 rounded-lg text-[10px] text-emerald-400 font-mono overflow-x-auto max-h-48 dir-ltr text-left">
                    {appsScriptCode}
                  </pre>
                </div>
              </div>
            )}

            {/* Status Feedback Message */}
            {syncMessage && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2 text-emerald-900 text-xs font-medium">
                <span className="w-2 h-2 bg-emerald-600 rounded-full animate-ping"></span>
                <span>{syncMessage}</span>
              </div>
            )}
          </div>
        </div>

        {/* Passcode / Privacy Management Card */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-4">
          <h3 className="font-bold text-sm text-slate-800 flex items-center gap-1.5 border-b border-slate-100 pb-2">
            <ShieldCheck className="w-4.5 h-4.5 text-blue-500" />
            إدارة الخصوصية والأرقام السرية (للموظفين):
          </h3>

          <div className="grid md:grid-cols-2 gap-6 text-xs">
            {/* Section A: Change my own passcode */}
            <div className="bg-slate-50 p-4 rounded-xl space-y-3.5 border border-slate-150">
              <h4 className="font-bold text-slate-700 flex items-center gap-1.5 border-b border-slate-200 pb-1.5">
                <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                تغيير الرقم السري الخاص بك ({activeEmployee.name})
              </h4>
              <div className="space-y-2">
                {activeEmployee.password && activeEmployee.password.trim() !== "" && (
                  <div className="space-y-1">
                    <label className="text-[11px] text-slate-500 font-medium block">الرقم السري الحالي للتحقق:</label>
                    <input 
                      type="password" 
                      value={myCurrentPassword}
                      onChange={(e) => setMyCurrentPassword(e.target.value)}
                      placeholder="أدخل رقمك السري الحالي"
                      className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-mono"
                    />
                  </div>
                )}
                <div className="space-y-1">
                  <label className="text-[11px] text-slate-500 font-medium block">الرقم السري الجديد:</label>
                  <input 
                    type="password" 
                    value={myNewPassword}
                    onChange={(e) => setMyNewPassword(e.target.value)}
                    placeholder="أدخل الرقم السري الجديد"
                    className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] text-slate-500 font-medium block">تأكيد الرقم السري الجديد:</label>
                  <input 
                    type="password" 
                    value={myConfirmPassword}
                    onChange={(e) => setMyConfirmPassword(e.target.value)}
                    placeholder="أدخل الرقم السري الجديد مرة أخرى"
                    className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-mono"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleChangeMyPassword}
                  className="w-full py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg transition-colors cursor-pointer"
                >
                  تحديث الرقم السري الخاص بي 🔐
                </button>
              </div>
            </div>

            {/* Section B: Admin Password Reset (Only visible to admin) */}
            <div className="bg-slate-50 p-4 rounded-xl space-y-3.5 border border-slate-150 flex flex-col justify-between">
              <div>
                <h4 className="font-bold text-slate-700 flex items-center gap-1.5 border-b border-slate-200 pb-1.5">
                  <span className="w-2 h-2 bg-amber-500 rounded-full"></span>
                  لوحة تحكم المدير لإدارة حسابات الموظفين
                </h4>
                {activeEmployee.role === "admin" ? (
                  <div className="space-y-3 pt-1">
                    <p className="text-[11px] text-slate-500">
                      بصفتك مديراً للنظام، يمكنك تصفير أو تعديل الرقم السري لأي موظف كاونتر في حال فقدانه أو لتحديثه:
                    </p>
                    <div className="space-y-2 max-h-[150px] overflow-y-auto pr-1">
                      {employees && employees.map((emp) => (
                        <div key={emp.username} className="flex items-center justify-between p-2 bg-white rounded-lg border border-slate-150 text-[11px]">
                          <div className="flex flex-col">
                            <span className="font-bold text-slate-700">{emp.name} ({emp.username})</span>
                            <span className="text-[9px] text-slate-400">
                              {emp.password ? `🔒 محمي برقم سري: ${emp.password}` : "🔓 غير محمي برقم سري"}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleAdminResetPassword(emp)}
                            className="px-2.5 py-1 bg-amber-600 hover:bg-amber-500 text-white text-[10px] font-bold rounded-md transition-colors cursor-pointer"
                          >
                            تعديل الرقم السري ✏️
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="p-4 text-center text-slate-400 bg-white/50 rounded-xl border border-dashed border-slate-200 flex flex-col items-center justify-center gap-1.5 mt-4">
                    <AlertCircle className="w-5 h-5 text-slate-400" />
                    <span>هذه اللوحة مخصصة لمدير النظام فقط لإعادة ضبط أرقام الموظفين عند فقدانها.</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Card 5: Dedicated Customer Name Dictionary Management */}
        <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
          <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-blue-600" />
              <div>
                <h3 className="font-bold text-sm text-slate-800 font-cairo">قاموس الترجمة المعتمد وأسماء الجوازات (Google Sheet Dictionary)</h3>
                <p className="text-[11px] text-slate-500 font-cairo">تسجيل الأسماء المترجمة وحفظها في قاعدة البيانات وجوجل شيت لترجمتها فورياً بمجرد كتابة الاسم العربي</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleSyncDictionaryToSheets}
                disabled={dictSyncLoading}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-bold rounded-lg text-xs flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs disabled:opacity-50 font-cairo"
                title="تسجيل القاموس بالكامل إلى ملف جوجل شيت فوراً"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${dictSyncLoading ? "animate-spin" : ""}`} />
                <span>{dictSyncLoading ? "جارِ التسجيل في الشيت..." : "⚡ تسجيل القاموس في جوجل شيت"}</span>
              </button>
              <span className="px-3 py-1.5 bg-blue-50 text-blue-700 font-bold rounded-lg text-xs font-mono border border-blue-200/60">
                {dictionary.length} اسم محفوظ
              </span>
            </div>
          </div>

          <div className="p-6 space-y-6">
            
            {/* Sync to Sheet Result Notice */}
            {dictSyncResult && (
              <div className={`p-4 rounded-xl border text-xs font-cairo ${
                dictSyncResult.type === "success" 
                  ? "bg-emerald-50 border-emerald-200 text-emerald-900" 
                  : dictSyncResult.type === "warning"
                  ? "bg-amber-50 border-amber-200 text-amber-900"
                  : "bg-red-50 border-red-200 text-red-900"
              }`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2.5">
                    {dictSyncResult.type === "success" ? (
                      <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                    ) : (
                      <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                    )}
                    <div>
                      <p className="font-bold text-sm whitespace-pre-line">{dictSyncResult.message}</p>
                      {dictSyncResult.type === "warning" && (
                        <div className="mt-2.5 flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText(appsScriptCode);
                              alert("تم نسخ كود السكربت المحدث بنجاح! 📋\nالآن افتح ملف جوجل شيت > ملحقات (Extensions) > Apps Script > الصق الكود واضغط Deploy > Manage deployments > تعديل القلم > New version > نشر.");
                            }}
                            className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-lg text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                          >
                            <Copy className="w-3.5 h-3.5" />
                            <span>نسخ كود السكربت المحدث الآن 📋</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setShowDictScriptGuide(!showDictScriptGuide)}
                            className="px-3 py-1.5 bg-white border border-amber-300 text-amber-800 hover:bg-amber-100 font-bold rounded-lg text-xs transition-colors cursor-pointer"
                          >
                            {showDictScriptGuide ? "إخفاء الخطوات" : "عرض خطوات تحديث السكربت (دقيقة واحدة)"}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setDictSyncResult(null)}
                    className="text-slate-400 hover:text-slate-600 text-xs px-1"
                  >
                    ✕
                  </button>
                </div>

                {/* Collapsible Step-by-step Guide */}
                {showDictScriptGuide && dictSyncResult.type === "warning" && (
                  <div className="mt-3 pt-3 border-t border-amber-200 text-amber-950 space-y-2 text-xs">
                    <p className="font-bold">خطوات تفعيل ورقة القاموس في ملف جوجل شيت لديك:</p>
                    <ol className="list-decimal list-inside space-y-1 pr-1 text-slate-700">
                      <li>افتح ملف جوجل شيت الخاص بك.</li>
                      <li>من القائمة العلوية اضغط على <strong>ملحقات (Extensions)</strong> ثم <strong>Apps Script</strong>.</li>
                      <li>امسح الكود القديم الموجود في المحرر، ثم الصق الكود الذي نسخته بالأعلى.</li>
                      <li>اضغط على زر <strong>حفظ (Save 💾)</strong>.</li>
                      <li>اضغط على <strong>نشر (Deploy)</strong> باللون الأزرق أعلى اليمين &gt; ثم <strong>إدارة عمليات النشر (Manage deployments)</strong>.</li>
                      <li>اضغط على <strong>أيقونة القلم ✏️ (تعديل)</strong> بجانب النشر الحالي.</li>
                      <li>في خانة <strong>الإصدار (Version)</strong> اختر <strong>New version (إصدار جديد)</strong>.</li>
                      <li>اضغط <strong>نشر (Deploy)</strong> ثم <strong>تم (Done)</strong>.</li>
                      <li>ارجع هنا واضغط على زر <strong>⚡ تسجيل القاموس في جوجل شيت</strong> وستظهر الورقة فوراً في ملفك!</li>
                    </ol>
                  </div>
                )}
              </div>
            )}

            {/* Feedback alert */}
            {dictFeedback && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs font-bold flex items-center gap-2 animate-fade-in font-cairo">
                <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{dictFeedback}</span>
              </div>
            )}

            {/* Sub-form: Add new dictionary translation pair */}
            <div className="bg-slate-50/80 p-4 rounded-xl border border-slate-200/80 space-y-3">
              <span className="text-xs font-bold text-slate-700 font-cairo block">
                ➕ إضافة اسم جديد إلى القاموس المعتمد وقاعدة بيانات جوجل شيت:
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                <div className="sm:col-span-5">
                  <input
                    type="text"
                    value={newArWord}
                    onChange={(e) => setNewArWord(e.target.value)}
                    placeholder="الاسم بالعربي (مثال: عبد الرحمن)"
                    className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-hidden focus:border-blue-500 font-cairo"
                  />
                </div>
                <div className="sm:col-span-5">
                  <input
                    type="text"
                    value={newEnWord}
                    onChange={(e) => setNewEnWord(e.target.value.toUpperCase())}
                    placeholder="الترجمة بالإنجليزية (مثال: ABDELRAHMAN)"
                    dir="ltr"
                    className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-mono font-bold uppercase text-slate-800 placeholder-slate-400 focus:outline-hidden focus:border-blue-500"
                  />
                </div>
                <div className="sm:col-span-2">
                  <button
                    type="button"
                    onClick={handleAddDictionaryWord}
                    disabled={dictLoading || !newArWord.trim() || !newEnWord.trim()}
                    className="w-full h-full py-2.5 px-3 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-40 shadow-xs font-cairo"
                  >
                    <Plus className="w-4 h-4" />
                    <span>حفظ 💾</span>
                  </button>
                </div>
              </div>
              <p className="text-[10px] text-slate-500 font-cairo">
                💡 النظام يقوم أيضاً بالحفظ التلقائي للأسماء الجديدة فور إصدار أي فاتورة جوازات، ليتم سحبها فورياً في أي فاتورة لاحقة بنفس الاسم.
              </p>
            </div>

            {/* Search and Table of registered names */}
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="relative flex-1 max-w-sm">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={dictSearch}
                    onChange={(e) => setDictSearch(e.target.value)}
                    placeholder="بحث في القاموس بالاسم العربي أو الإنجليزي..."
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl pr-9 pl-3 py-2 text-xs text-slate-800 focus:outline-hidden focus:border-blue-500 font-cairo"
                  />
                </div>
                <span className="text-[11px] text-slate-500 font-cairo">
                  عرض {dictionary.filter(i => !dictSearch.trim() || i.arabic.toLowerCase().includes(dictSearch.trim().toLowerCase()) || i.english.toLowerCase().includes(dictSearch.trim().toLowerCase())).length} من أصل {dictionary.length} اسم
                </span>
              </div>

              {/* Words List Container */}
              <div className="border border-slate-200 rounded-xl overflow-hidden max-h-72 overflow-y-auto">
                {dictionary.length === 0 ? (
                  <div className="p-8 text-center text-slate-400 font-cairo text-xs">
                    القاموس فارغ حالياً. قم بإضافة أسماء بالأعلى أو أنشئ فواتير جديدة وسيتعلم النظام الأسماء ويحفظها تلقائياً.
                  </div>
                ) : (
                  <table className="w-full text-right text-xs">
                    <thead className="bg-slate-100/80 text-slate-600 font-cairo border-b border-slate-200 sticky top-0">
                      <tr>
                        <th className="px-4 py-2.5 w-12 text-center">#</th>
                        <th className="px-4 py-2.5">الاسم بالعربي</th>
                        <th className="px-4 py-2.5">الترجمة المعتمدة بالإنجليزية</th>
                        <th className="px-4 py-2.5 w-20 text-center">إجراءات</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {dictionary
                        .filter(i => {
                          if (!dictSearch.trim()) return true;
                          const q = dictSearch.trim().toLowerCase();
                          return i.arabic.toLowerCase().includes(q) || i.english.toLowerCase().includes(q);
                        })
                        .map((item, idx) => {
                          const isEditing = editingDictItem && editingDictItem.originalArabic === item.arabic;
                          return (
                            <tr key={idx} className={`${isEditing ? "bg-blue-50/40" : "hover:bg-slate-50/80"} transition-colors`}>
                              <td className="px-4 py-2.5 text-center text-slate-400 font-mono text-[11px]">{idx + 1}</td>
                              <td className="px-4 py-2.5 font-bold text-slate-800 font-cairo">
                                {isEditing ? (
                                  <input
                                    type="text"
                                    value={editingDictItem.arabic}
                                    onChange={(e) => setEditingDictItem({ ...editingDictItem, arabic: e.target.value })}
                                    className="w-full bg-white border border-blue-300 rounded-lg px-2.5 py-1 text-xs font-bold text-slate-800 focus:outline-hidden focus:border-blue-500 font-cairo"
                                    placeholder="الاسم بالعربي"
                                  />
                                ) : (
                                  item.arabic
                                )}
                              </td>
                              <td className="px-4 py-2.5 font-mono font-bold text-blue-700 tracking-wide dir-ltr text-right">
                                {isEditing ? (
                                  <input
                                    type="text"
                                    value={editingDictItem.english}
                                    onChange={(e) => setEditingDictItem({ ...editingDictItem, english: e.target.value.toUpperCase() })}
                                    dir="ltr"
                                    className="w-full bg-white border border-blue-300 rounded-lg px-2.5 py-1 text-xs font-mono font-bold text-blue-700 uppercase focus:outline-hidden focus:border-blue-500"
                                    placeholder="الترجمة بالإنجليزي"
                                  />
                                ) : (
                                  item.english
                                )}
                              </td>
                              <td className="px-4 py-2.5 text-center">
                                {isEditing ? (
                                  <div className="flex items-center justify-center gap-1">
                                    <button
                                      type="button"
                                      onClick={handleSaveEditDict}
                                      disabled={dictLoading || !editingDictItem.arabic.trim() || !editingDictItem.english.trim()}
                                      title="حفظ التعديل في القاموس وجوجل شيت 💾"
                                      className="p-1.5 text-emerald-600 hover:text-emerald-800 hover:bg-emerald-50 rounded-lg transition-colors cursor-pointer disabled:opacity-40"
                                    >
                                      <Check className="w-4 h-4" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={handleCancelEditDict}
                                      disabled={dictLoading}
                                      title="إلغاء التعديل"
                                      className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                                    >
                                      <X className="w-4 h-4" />
                                    </button>
                                  </div>
                                ) : (
                                  <div className="flex items-center justify-center gap-1">
                                    <button
                                      type="button"
                                      onClick={() => handleStartEditDict(item)}
                                      disabled={dictLoading}
                                      title="تعديل هذا الاسم بالإنجليزي أو العربي"
                                      className="p-1.5 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                                    >
                                      <Edit3 className="w-4 h-4" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteDictionaryWord(item.arabic, item.english)}
                                      disabled={dictLoading}
                                      title="حذف هذا الاسم من القاموس"
                                      className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  </div>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

          </div>
        </div>

        {/* Card 6: Official Egyptian Holidays & Business Working Days Settings */}
        <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
          <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <CalendarCheck className="w-5 h-5 text-indigo-600" />
              <div>
                <h3 className="font-bold text-sm text-slate-800 font-cairo">احتساب أيام العمل والعطلات الرسمية لمواعيد الاستلام</h3>
                <p className="text-[11px] text-slate-500 font-cairo">تجاوز أيام الجمعة والسبت والعطلات الحكومية والرسمية للدولة تلقائياً عند تحديد موعد تسليم المعاملات</p>
              </div>
            </div>
            <span className="px-3 py-1.5 bg-indigo-50 text-indigo-700 font-bold rounded-lg text-xs font-mono border border-indigo-200/60">
              {DEFAULT_OFFICIAL_HOLIDAYS.length + customHolidays.length} عطلة معتمدة
            </span>
          </div>

          <div className="p-6 space-y-6">
            {/* Weekend Configuration */}
            <div className="bg-indigo-50/50 border border-indigo-100 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h4 className="font-bold text-xs text-indigo-950 flex items-center gap-1.5">
                  <Calendar className="w-4 h-4 text-indigo-600" />
                  قاعدة احتساب يوم السبت كعطلة أو يوم عمل
                </h4>
                <p className="text-[11px] text-indigo-700/80 mt-1">
                  • <strong>الخدمات التي تبدأ بـ (#)</strong>: يُحتسب يوم السبت <strong>يوم عمل رسمي</strong> دائماً (لا يُعتبر عطلة).<br />
                  • <strong>باقي الخدمات</strong>: يُعتبر يوم السبت <strong>عطلة رسمية</strong> بالإضافة ليوم الجمعة والعطلات الرسمية للدولة.
                </p>
              </div>
              <label className="flex items-center gap-2 cursor-pointer bg-white px-3 py-2 rounded-lg border border-indigo-200 shadow-2xs shrink-0">
                <input
                  type="checkbox"
                  checked={includeSaturdayAsWeekend}
                  onChange={(e) => setIncludeSaturdayAsWeekend(e.target.checked)}
                  className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                />
                <span className="text-xs font-bold text-slate-800">تجاوز السبت لباقي الخدمات (عطلة)</span>
              </label>
            </div>

            {/* Add Custom Holiday */}
            <div className="space-y-3">
              <h4 className="font-bold text-xs text-slate-800 flex items-center gap-1.5">
                <Plus className="w-4 h-4 text-indigo-600" />
                إضافة عطلة استثنائية أو قرار حكومي جديد بإجازة:
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
                <div className="sm:col-span-4 space-y-1">
                  <label className="text-[11px] font-bold text-slate-600">تاريخ العطلة (يوم-شهر-سنة):</label>
                  <input
                    type="date"
                    value={newHolidayDate}
                    onChange={(e) => setNewHolidayDate(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono"
                  />
                </div>
                <div className="sm:col-span-6 space-y-1">
                  <label className="text-[11px] font-bold text-slate-600">اسم العطلة أو سبب الإغلاق الحكومي:</label>
                  <input
                    type="text"
                    value={newHolidayName}
                    onChange={(e) => setNewHolidayName(e.target.value)}
                    placeholder="مثال: إجازة طارئة بقرار رئيس الوزراء..."
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs"
                  />
                </div>
                <div className="sm:col-span-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (!newHolidayDate || !newHolidayName.trim()) {
                        alert("يرجى تحديد التاريخ واسم العطلة أولاً.");
                        return;
                      }
                      if (customHolidays.some(h => h.date === newHolidayDate)) {
                        alert("هذا التاريخ مضاف بالفعل كعطلة.");
                        return;
                      }
                      setCustomHolidays([...customHolidays, { date: newHolidayDate, name: newHolidayName.trim() }]);
                      setNewHolidayDate("");
                      setNewHolidayName("");
                    }}
                    className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-3 rounded-lg text-xs flex items-center justify-center gap-1 transition-colors shadow-xs cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>إضافة العطلة</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Custom Holidays Table */}
            {customHolidays.length > 0 && (
              <div className="space-y-2">
                <h5 className="font-bold text-xs text-slate-700">العطلات الإضافية المخصصة المسجلة:</h5>
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full text-right text-xs">
                    <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                      <tr>
                        <th className="px-4 py-2">التاريخ</th>
                        <th className="px-4 py-2">المناسبة</th>
                        <th className="px-4 py-2 text-center w-20">حذف</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {customHolidays.map((item, idx) => (
                        <tr key={idx} className="hover:bg-slate-50">
                          <td className="px-4 py-2 font-mono font-bold text-slate-900">{item.date}</td>
                          <td className="px-4 py-2 font-bold text-indigo-900">{item.name}</td>
                          <td className="px-4 py-2 text-center">
                            <button
                              type="button"
                              onClick={() => {
                                setCustomHolidays(customHolidays.filter((_, i) => i !== idx));
                              }}
                              className="p-1 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Built-in National Holidays Reference Collapsible */}
            <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/50 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-xs text-slate-800 flex items-center gap-1.5">
                  <CheckCircle className="w-4 h-4 text-emerald-600" />
                  قائمة العطلات الرسمية المدمجة لجمهورية مصر العربية (2025 - 2027)
                </span>
                <span className="text-[11px] text-slate-500 font-mono">مفعلة تلقائياً ({DEFAULT_OFFICIAL_HOLIDAYS.length} مناسبة)</span>
              </div>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                تشمل: أعياد الفطر، الأضحى، وقفة عرفات، 6 أكتوبر، 25 يناير، 30 يونيو، 23 يوليو، المولد النبوي الشريف، رأس السنة الهجرية، شم النسيم، عيد العمال، تحرير سيناء، وعيد الميلاد المجيد. النظام يتجاوز هذه الأيام تلقائياً في حساب تاريخ التسليم.
              </p>
            </div>

          </div>
        </div>

        {/* Submit Actions */}
        <div className="flex justify-end gap-2">
          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2.5 bg-slate-900 text-white hover:bg-slate-800 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-colors shadow-md disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {saving ? "جاري الحفظ والتهيئة..." : "حفظ جميع الإعدادات بالتكامل 💾"}
          </button>
        </div>

      </form>

    </div>
  );
}
