import React, { useState, useEffect, useMemo } from "react";
import { AppSettings, Employee, DictionaryItem, DEFAULT_APPLICANT_CAPACITIES, Invoice, Service, MojeebTemplatesSettings, MojeebTemplateScenario, MojeebTemplateConfig } from "../types";
import EmployeeManager from "./EmployeeManager";
import { APPS_SCRIPT_CODE } from "../lib/appsScriptTemplate";
import { 
  updateSettingsOnServer, 
  testGoogleWebhook,
  pushDataToGoogleWebhook,
  pullDataFromGoogleWebhook,
  saveDictionaryWord,
  updateDictionaryWord,
  deleteDictionaryWord,
  sendWhatsAppViaMojeeb,
  sendWhatsAppTemplateViaMojeeb
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
  CalendarCheck,
  Database,
  RotateCcw,
  ArrowRightLeft,
  Clock,
  Info,
  UserCheck,
  ArrowUp,
  ArrowDown,
  Package,
  Send
} from "lucide-react";
import { 
  DEFAULT_OFFICIAL_HOLIDAYS, 
  HolidayItem, 
  getArabicDayName, 
  shiftDateToThursday,
  shiftDateToSunday,
  shiftHolidayToDate,
  revertHolidayShift
} from "../lib/businessDays";

import { GovernmentFine } from "../types";
import { DEFAULT_READY_PASSPORT_MESSAGE, DEFAULT_READY_GENERAL_MESSAGE, DEFAULT_PARTIAL_READY_MESSAGE, MOJEEB_TEMPLATE_PLACEHOLDERS, resolveMojeebTemplatePayload } from "../lib/whatsapp";

interface SettingsConfigProps {
  settings: AppSettings;
  activeEmployee: Employee;
  onSettingsUpdated: (settings: AppSettings) => void;
  employees: Employee[];
  onEmployeesUpdated: (employees: Employee[], previousUsername?: string) => Promise<any> | void;
  dictionary?: DictionaryItem[];
  onDictionaryUpdated?: (newDict: DictionaryItem[]) => void;
  governmentFines?: GovernmentFine[];
  onGovernmentFinesUpdated?: (fines: GovernmentFine[]) => void;
  onReloadDatabase?: () => Promise<void>;
  invoices?: Invoice[];
  services?: Service[];
}

export default function SettingsConfig({ 
  settings, 
  activeEmployee, 
  onSettingsUpdated, 
  employees, 
  onEmployeesUpdated,
  dictionary = [],
  onDictionaryUpdated,
  governmentFines = [],
  onGovernmentFinesUpdated,
  onReloadDatabase,
  invoices = [],
  services = []
}: SettingsConfigProps) {
  const [headerText, setHeaderText] = useState(settings.headerText || "مكتب مزايا للجوازات والمعاملات");
  const [subHeaderText, setSubHeaderText] = useState(settings.subHeaderText ?? "جوازات طنطا والمعاملات الحكومية");
  const [contactPhone, setContactPhone] = useState(settings.contactPhone || "01020304050");
  const [welcomeMessage, setWelcomeMessage] = useState(settings.welcomeMessage || "");
  const [readyMessage, setReadyMessage] = useState(settings.readyMessage || DEFAULT_READY_GENERAL_MESSAGE);
  const [readyPassportMessage, setReadyPassportMessage] = useState(settings.readyPassportMessage || DEFAULT_READY_PASSPORT_MESSAGE);
  const [partialReadyMessage, setPartialReadyMessage] = useState(settings.partialReadyMessage || DEFAULT_PARTIAL_READY_MESSAGE);
  const [deliveryMessage, setDeliveryMessage] = useState(settings.deliveryMessage || "");
  const [googleSheetUrl, setGoogleSheetUrl] = useState(settings.googleSheetUrl || "");
  const [googleSheetWebhookUrl, setGoogleSheetWebhookUrl] = useState(settings.googleSheetWebhookUrl || settings.googleSheetUrl || "");
  const [footerText, setFooterText] = useState(settings.footerText || "يسعدنا دائماً خدمتكم وثقتكم بنا");
  const [autoSyncWebhook, setAutoSyncWebhook] = useState(settings.autoSyncWebhook || false);
  const [mojeebAgentId, setMojeebAgentId] = useState(settings.mojeebAgentId || "");
  const [mojeebFromPhone, setMojeebFromPhone] = useState(settings.mojeebFromPhone || "");
  const [mojeebTemplates, setMojeebTemplates] = useState<MojeebTemplatesSettings>(settings.mojeebTemplates || {});
  const [activeMojeebScenario, setActiveMojeebScenario] = useState<MojeebTemplateScenario>("welcome");
  const [mojeebTestSendKind, setMojeebTestSendKind] = useState<"template" | "text">("template");
  const [mojeebTestMode, setMojeebTestMode] = useState<"phone" | "username">("phone");
  const [mojeebTestRecipient, setMojeebTestRecipient] = useState("");
  const [mojeebTestBody, setMojeebTestBody] = useState("رسالة تجريبية من نظام مكتب مزايا عبر واجهة مجيب (Mojeeb API).");
  const [mojeebTestLoading, setMojeebTestLoading] = useState(false);
  const [mojeebTestFeedback, setMojeebTestFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    setMojeebAgentId(settings.mojeebAgentId || "");
    setMojeebFromPhone(settings.mojeebFromPhone || "");
    setMojeebTemplates(settings.mojeebTemplates || {});
  }, [settings.mojeebAgentId, settings.mojeebFromPhone, settings.mojeebTemplates]);

  const getScenarioTemplate = (scenario: MojeebTemplateScenario): MojeebTemplateConfig => {
    const existing = mojeebTemplates[scenario];
    return {
      enabled: existing?.enabled ?? false,
      name: existing?.name || "",
      language: existing?.language || "ar",
      parameters: Array.isArray(existing?.parameters) ? existing.parameters : [],
      headerParameterKey: existing?.headerParameterKey || "",
      headerParameterValue: existing?.headerParameterValue || "",
      headerMediaUrl: existing?.headerMediaUrl || "",
      buttons: Array.isArray(existing?.buttons) ? existing.buttons : [],
    };
  };

  const updateScenarioTemplate = (scenario: MojeebTemplateScenario, patch: Partial<MojeebTemplateConfig>) => {
    setMojeebTemplates((prev) => ({
      ...prev,
      [scenario]: {
        ...getScenarioTemplate(scenario),
        ...patch,
      },
    }));
  };

  // Aman Report Pricing config
  const [amanNormalPrice, setAmanNormalPrice] = useState<number>(() => {
    return typeof settings.amanNormalPrice === "number" ? settings.amanNormalPrice : 1200;
  });
  const [amanUrgentPrice, setAmanUrgentPrice] = useState<number>(() => {
    return typeof settings.amanUrgentPrice === "number" ? settings.amanUrgentPrice : 1400;
  });

  // Passport forms stock config (مخزون استمارات الجوازات)
  const [passportFormsStock, setPassportFormsStock] = useState(() => {
    return settings.passportFormsStock || {
      normalTotalReceived: 0,
      urgentTotalReceived: 0,
      logs: [],
    };
  });
  const [stockAddNormal, setStockAddNormal] = useState<string>("");
  const [stockAddUrgent, setStockAddUrgent] = useState<string>("");
  const [stockAddNotes, setStockAddNotes] = useState<string>("");
  const [stockFeedback, setStockFeedback] = useState<string>("");
  const [stockSaveLoading, setStockSaveLoading] = useState(false);

  useEffect(() => {
    if (settings.passportFormsStock) {
      setPassportFormsStock(settings.passportFormsStock);
    }
  }, [settings.passportFormsStock]);

  // Passport forms stock calculation: deducts all executed passport operations (#) across invoices
  const formsStockUsedStats = useMemo(() => {
    let allNormalUsed = 0;
    let allUrgentUsed = 0;
    if (Array.isArray(invoices)) {
      invoices.forEach((inv) => {
        if (!inv || !Array.isArray(inv.customers)) return;
        inv.customers.forEach((cust) => {
          if (!cust || !Array.isArray(cust.services)) return;
          cust.services.forEach((s) => {
            const srvId = String(s.serviceId || "").trim();
            const matched = (services || []).find((srv) => srv.id === srvId || srv.name === srvId);
            const fullName = matched?.name || srvId;
            if (fullName.startsWith("#") && !fullName.startsWith("##")) {
              const isUrgent = fullName.includes("مستعجل") || fullName.includes("عاجل") || fullName.includes("سريع") || fullName.includes("فورى");
              const qty = Number(s.quantity) || 1;
              if (isUrgent) {
                allUrgentUsed += qty;
              } else {
                allNormalUsed += qty;
              }
            }
          });
        });
      });
    }

    const normalRec = Number(passportFormsStock.normalTotalReceived) || 0;
    const urgentRec = Number(passportFormsStock.urgentTotalReceived) || 0;
    const normalRemaining = normalRec > 0 ? normalRec - allNormalUsed : (allNormalUsed > 0 ? -allNormalUsed : 0);
    const urgentRemaining = urgentRec > 0 ? urgentRec - allUrgentUsed : (allUrgentUsed > 0 ? -allUrgentUsed : 0);

    return {
      allNormalUsed,
      allUrgentUsed,
      normalRemaining,
      urgentRemaining,
      isConfigured: normalRec > 0 || urgentRec > 0,
    };
  }, [invoices, services, passportFormsStock]);

  // Business days & Holidays config
  const [includeSaturdayAsWeekend, setIncludeSaturdayAsWeekend] = useState(settings.includeSaturdayAsWeekend !== false);
  const [customHolidays, setCustomHolidays] = useState<HolidayItem[]>(() => {
    if (settings.customHolidays && settings.customHolidays.length > 0) {
      return settings.customHolidays;
    }
    return DEFAULT_OFFICIAL_HOLIDAYS;
  });
  const [newHolidayDate, setNewHolidayDate] = useState("");
  const [newHolidayName, setNewHolidayName] = useState("");
  const [holidayYearFilter, setHolidayYearFilter] = useState("2026");
  const [holidaySearch, setHolidaySearch] = useState("");
  const [editingHolidayIdx, setEditingHolidayIdx] = useState<number | null>(null);
  const [editHolidayDate, setEditHolidayDate] = useState("");
  const [editHolidayName, setEditHolidayName] = useState("");
  const [customShiftIdx, setCustomShiftIdx] = useState<number | null>(null);
  const [customShiftDate, setCustomShiftDate] = useState("");
  const [customShiftReason, setCustomShiftReason] = useState("");
  const [holidaySaveLoading, setHolidaySaveLoading] = useState(false);
  const [holidayFeedback, setHolidayFeedback] = useState("");

  const handleSaveHolidaysDirectly = async (holidaysToSave: HolidayItem[] = customHolidays) => {
    setHolidaySaveLoading(true);
    setHolidayFeedback("");
    try {
      const payload: AppSettings = {
        ...settings,
        headerText: headerText.trim(),
        subHeaderText: subHeaderText.trim(),
        contactPhone: contactPhone.trim(),
        welcomeMessage: welcomeMessage.trim(),
        readyMessage: readyMessage.trim(),
        readyPassportMessage: readyPassportMessage.trim(),
        partialReadyMessage: partialReadyMessage.trim(),
        deliveryMessage: deliveryMessage.trim(),
        googleSheetUrl: googleSheetUrl.trim(),
        googleSheetWebhookUrl: googleSheetWebhookUrl.trim(),
        footerText: footerText.trim(),
        autoSyncWebhook: false,
        googleSheetsConnected: !!(googleSheetWebhookUrl.trim() || googleSheetUrl.trim() || settings.googleSheetsConnected),
        includeSaturdayAsWeekend: includeSaturdayAsWeekend,
        customHolidays: holidaysToSave,
        applicantCapacities: applicantCapacities.filter(c => c && c.trim()),
        amanNormalPrice: Number(amanNormalPrice) || 0,
        amanUrgentPrice: Number(amanUrgentPrice) || 0,
        passportFormsStock: passportFormsStock,
        mojeebAgentId: mojeebAgentId.trim(),
        mojeebFromPhone: mojeebFromPhone.trim(),
        mojeebTemplates,
      };

      const result = await updateSettingsOnServer(payload);
      onSettingsUpdated(result);
      setHolidayFeedback("تم حفظ وتثبيت قائمة العطلات الرسمية وترحيلاتها بالخادم وقاعدة البيانات بنجاح! 💾✅");
      setTimeout(() => setHolidayFeedback(""), 4500);
    } catch (err) {
      console.error(err);
      alert("حدث خطأ أثناء حفظ وتثبيت العطلات بالخادم.");
    } finally {
      setHolidaySaveLoading(false);
    }
  };

  // Applicant capacity configuration state & handlers (صفة مقدم الطلب لمعاملات الجوازات # و ##)
  const [applicantCapacities, setApplicantCapacities] = useState<string[]>(() => {
    if (settings.applicantCapacities && settings.applicantCapacities.length > 0) {
      return settings.applicantCapacities;
    }
    return DEFAULT_APPLICANT_CAPACITIES;
  });
  const [newCapacityInput, setNewCapacityInput] = useState("");
  const [editingCapacityIdx, setEditingCapacityIdx] = useState<number | null>(null);
  const [editCapacityValue, setEditCapacityValue] = useState("");
  const [capacityFeedback, setCapacityFeedback] = useState("");
  const [capacitySaveLoading, setCapacitySaveLoading] = useState(false);

  const handleSaveCapacitiesDirectly = async (capacitiesToSave: string[] = applicantCapacities) => {
    setCapacitySaveLoading(true);
    setCapacityFeedback("");
    try {
      const payload: AppSettings = {
        ...settings,
        headerText: headerText.trim(),
        subHeaderText: subHeaderText.trim(),
        contactPhone: contactPhone.trim(),
        welcomeMessage: welcomeMessage.trim(),
        readyMessage: readyMessage.trim(),
        readyPassportMessage: readyPassportMessage.trim(),
        partialReadyMessage: partialReadyMessage.trim(),
        deliveryMessage: deliveryMessage.trim(),
        googleSheetId: settings.googleSheetId || "",
        googleSheetUrl: googleSheetUrl.trim(),
        googleSheetWebhookUrl: googleSheetWebhookUrl.trim(),
        autoSyncWebhook: false,
        footerText: footerText.trim(),
        googleSheetsConnected: !!(googleSheetWebhookUrl.trim() || googleSheetUrl.trim() || settings.googleSheetsConnected),
        includeSaturdayAsWeekend: includeSaturdayAsWeekend,
        customHolidays: customHolidays,
        applicantCapacities: capacitiesToSave.filter(c => c && c.trim()),
        amanNormalPrice: Number(amanNormalPrice) || 0,
        amanUrgentPrice: Number(amanUrgentPrice) || 0,
        passportFormsStock: passportFormsStock,
        mojeebAgentId: mojeebAgentId.trim(),
        mojeebFromPhone: mojeebFromPhone.trim(),
        mojeebTemplates,
      };

      const result = await updateSettingsOnServer(payload);
      onSettingsUpdated(result);
      setCapacityFeedback("تم حفظ وتحديث مسميات صفة مقدم الطلب بنجاح! 💾✨");
      setTimeout(() => setCapacityFeedback(""), 3500);
    } catch (err) {
      console.error(err);
      alert("حدث خطأ أثناء حفظ مسميات صفة مقدم الطلب.");
    } finally {
      setCapacitySaveLoading(false);
    }
  };

  const handleAddCapacity = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = newCapacityInput.trim();
    if (!trimmed) return;
    if (applicantCapacities.includes(trimmed)) {
      alert("هذا المسمى موجود بالفعل في القائمة.");
      return;
    }
    const updated = [...applicantCapacities, trimmed];
    setApplicantCapacities(updated);
    setNewCapacityInput("");
    await handleSaveCapacitiesDirectly(updated);
  };

  const handleStartEditCapacity = (idx: number) => {
    setEditingCapacityIdx(idx);
    setEditCapacityValue(applicantCapacities[idx]);
  };

  const handleSaveEditCapacity = async () => {
    if (editingCapacityIdx === null) return;
    const trimmed = editCapacityValue.trim();
    if (!trimmed) {
      alert("لا يمكن ترك المسمى فارغاً.");
      return;
    }
    const updated = [...applicantCapacities];
    updated[editingCapacityIdx] = trimmed;
    setApplicantCapacities(updated);
    setEditingCapacityIdx(null);
    setEditCapacityValue("");
    await handleSaveCapacitiesDirectly(updated);
  };

  const handleDeleteCapacity = async (idx: number) => {
    const itemToDelete = applicantCapacities[idx];
    if (!confirm(`هل أنت متأكد من حذف صفة "${itemToDelete}" من القائمة المنسدلة؟`)) return;
    const updated = applicantCapacities.filter((_, i) => i !== idx);
    setApplicantCapacities(updated);
    if (editingCapacityIdx === idx) {
      setEditingCapacityIdx(null);
    }
    await handleSaveCapacitiesDirectly(updated);
  };

  const handleMoveCapacity = async (idx: number, direction: "up" | "down") => {
    const targetIdx = direction === "up" ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= applicantCapacities.length) return;
    const updated = [...applicantCapacities];
    const temp = updated[idx];
    updated[idx] = updated[targetIdx];
    updated[targetIdx] = temp;
    setApplicantCapacities(updated);
    await handleSaveCapacitiesDirectly(updated);
  };

  const handleResetCapacities = async () => {
    if (!confirm("هل تريد استعادة قائمة صفات مقدم الطلب الافتراضية (بنفسه، الأب، الأم، الزوج...)؟")) return;
    setApplicantCapacities(DEFAULT_APPLICANT_CAPACITIES);
    await handleSaveCapacitiesDirectly(DEFAULT_APPLICANT_CAPACITIES);
  };

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
  const [editingDictItem, setEditingDictItem] = useState<{ originalArabic: string; arabic: string; english: string } | null>(null);

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
  const appsScriptCode = APPS_SCRIPT_CODE;

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
      setReadyMessage(settings.readyMessage || DEFAULT_READY_GENERAL_MESSAGE);
      setReadyPassportMessage(settings.readyPassportMessage || DEFAULT_READY_PASSPORT_MESSAGE);
      setPartialReadyMessage(settings.partialReadyMessage || DEFAULT_PARTIAL_READY_MESSAGE);
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
          contactPhone: contactPhone.trim(),
          welcomeMessage: welcomeMessage.trim(),
          readyMessage: readyMessage.trim(),
          readyPassportMessage: readyPassportMessage.trim(),
          partialReadyMessage: partialReadyMessage.trim(),
          deliveryMessage: deliveryMessage.trim(),
          googleSheetUrl: rawUrl,
          googleSheetWebhookUrl: googleSheetWebhookUrl.trim(),
          autoSyncWebhook: false, // Strict manual mode
          footerText: footerText.trim(),
          googleSheetsConnected: true,
        };
        const result = await updateSettingsOnServer(payload);
        onSettingsUpdated(result);
        setShowScriptGuide(true);
        setSyncMessage("تم حفظ رابط ملف جوجل شيت! 📊 تم تفعيل النمط اليدوي (الحفظ عند الضغط على زر الحفظ فقط) لحماية بياناتك.");
        alert("تم حفظ رابط ملف جوجل شيت بنجاح! 📊\n🛡️ تم ضبط النظام على النمط اليدوي (المزامنة تتم فقط عند الضغط على زر حفظ).");
        return;
      }

      // Test Apps Script Webhook
      const testRes = await testGoogleWebhook(rawUrl);

      // Save settings in strict manual mode to protect services & prices
      const payload: AppSettings = {
        headerText: headerText.trim(),
        subHeaderText: subHeaderText.trim(),
        contactPhone: contactPhone.trim(),
        welcomeMessage: welcomeMessage.trim(),
        readyMessage: readyMessage.trim(),
        readyPassportMessage: readyPassportMessage.trim(),
        partialReadyMessage: partialReadyMessage.trim(),
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
    const confirmPull = window.confirm("تحذير: هل أنت متأكد من استيراد كافة البيانات من جوجل شيت؟\nسيتم تحديث قاعدة البيانات الشاملة بنقرة واحدة (كتالوج الخدمات + بنود الغرامات الحكومية + الفواتير + قاموس الأسماء + الإعدادات).");
    if (!confirmPull) return;

    setSyncLoading(true);
    setSyncMessage("جاري استيراد كافة البيانات الشاملة (الخدمات، الغرامات الحكومية، الفواتير، الإعدادات) من جوجل شيت...");
    try {
      const res = await pullDataFromGoogleWebhook(rawUrl);
      if (res.db && res.db.settings) {
        onSettingsUpdated(res.db.settings);
        if (res.db.settings.googleSheetWebhookUrl) {
          setGoogleSheetWebhookUrl(res.db.settings.googleSheetWebhookUrl);
        }
      }
      const fines = res.governmentFines || (res.db && res.db.governmentFines);
      if (fines && Array.isArray(fines) && onGovernmentFinesUpdated) {
        onGovernmentFinesUpdated(fines);
      }
      if (onReloadDatabase) {
        await onReloadDatabase();
      }
      const finesCount = fines?.length || 0;
      setSyncMessage(res.message || `تم استيراد البيانات وبنود الغرامات (${finesCount} بند) بنجاح!`);
      alert(res.message || `تم استيراد كافة البيانات بنجاح من جوجل شيت! 📥 (شامل: كتالوج الخدمات، ${finesCount} بند غرامة حكومية، الفواتير، قاموس الأسماء، والإعدادات).`);
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
      const res = await onEmployeesUpdated(updatedEmployees, activeEmployee.username);
      if (res && res.sheetSynced === false) {
        alert(res.message || "تم تحديث رقمك السري محلياً، وتعذر الحفظ في جوجل شيت حالياً.");
      } else {
        alert("تم تحديث وتلقيم رقمك السري بنجاح محلياً وفي جوجل شيت 🔐✅");
      }
      setMyCurrentPassword("");
      setMyNewPassword("");
      setMyConfirmPassword("");
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
      const res = await onEmployeesUpdated(updatedEmployees, emp.username);
      if (res && res.sheetSynced === false) {
        alert(res.message || `تم تحديث الرقم السري للموظف (${emp.name}) محلياً، وتعذر الحفظ في جوجل شيت.`);
      } else {
        alert(`تم تحديث الرقم السري للموظف (${emp.name}) بنجاح في الخادم وجوجل شيت.`);
      }
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
        contactPhone: contactPhone.trim(),
        welcomeMessage: welcomeMessage.trim(),
        readyMessage: readyMessage.trim(),
        readyPassportMessage: readyPassportMessage.trim(),
        partialReadyMessage: partialReadyMessage.trim(),
        deliveryMessage: deliveryMessage.trim(),
        googleSheetId: settings.googleSheetId || "",
        googleSheetUrl: googleSheetUrl.trim(),
        googleSheetWebhookUrl: googleSheetWebhookUrl.trim(),
        autoSyncWebhook: false, // Strict manual mode: No auto sync
        footerText: footerText.trim(),
        googleSheetsConnected: !!(googleSheetWebhookUrl.trim() || googleSheetUrl.trim() || settings.googleSheetsConnected),
        includeSaturdayAsWeekend: includeSaturdayAsWeekend,
        customHolidays: customHolidays,
        applicantCapacities: applicantCapacities.filter(c => c && c.trim()),
        amanNormalPrice: Number(amanNormalPrice) || 0,
        amanUrgentPrice: Number(amanUrgentPrice) || 0,
        passportFormsStock: passportFormsStock,
        mojeebAgentId: mojeebAgentId.trim(),
        mojeebFromPhone: mojeebFromPhone.trim(),
        mojeebTemplates,
      };

      const result = await updateSettingsOnServer(payload);
      onSettingsUpdated(result);
      alert("تم حفظ جميع الإعدادات محلياً وحفظ كافة البيانات على جوجل درايف بنجاح! 💾✅");
    } catch (err) {
      console.error(err);
      alert("حدث خطأ أثناء حفظ الإعدادات بالخادم.");
    } finally {
      setSaving(false);
    }
  };

  // Guard: Settings page is strictly accessible to manager / admin only
  if (activeEmployee.role !== "admin") {
    return (
      <div className="p-8 max-w-lg mx-auto my-12 bg-white border border-rose-200 rounded-2xl shadow-sm text-center font-cairo space-y-4">
        <div className="w-16 h-16 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center mx-auto">
          <Lock className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-black text-slate-800">صفحة إعدادات النظام مخصصة للمدير فقط 🔒</h2>
        <p className="text-sm text-slate-500 leading-relaxed">
          عذراً، الوصول لصفحة إعدادات النظام وتعديل صلاحيات الموظفين والربط مقتصر حصرياً على حساب المدير العام.
        </p>
      </div>
    );
  }

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
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h3 className="font-bold text-sm text-slate-800 flex items-center gap-1.5">
              <Settings className="w-4.5 h-4.5 text-slate-500" />
              <span>الملف التعريفي للمكتب وترويسة الفاتورة:</span>
            </h3>
          </div>

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
              <label className="text-xs font-bold text-slate-700 block">رقم هاتف التواصل والشكاوى (يظهر في الرسائل والإيصالات):</label>
              <input 
                type="text" 
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
                placeholder="e.g. 01020304050"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono"
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
        </div>

        {/* Aman Report Pricing Card */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h3 className="font-bold text-sm text-slate-800 flex items-center gap-1.5">
              <FileText className="w-4.5 h-4.5 text-emerald-600" />
              <span>تسعير معاملات كشف أمان وحساب الإجمالي:</span>
            </h3>
            <span className="text-[10px] bg-emerald-50 text-emerald-800 border border-emerald-200 font-bold px-2 py-0.5 rounded-full">
              كشف أمان
            </span>
          </div>

          <p className="text-xs text-slate-500">
            تُستخدم هذه القيم في نهاية تفصيلة كشف أمان لحساب إجمالي المبالغ بضرب عدد الجوازات العادية والسريعة في قيمتها، بالإضافة لضرب كل غرامة مسجلة في قيمتها من بند الغرامات.
          </p>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 block">
                قيمة الجواز العادي لكشف أمان (ج.م):
              </label>
              <input 
                type="number" 
                value={amanNormalPrice}
                onChange={(e) => setAmanNormalPrice(Number(e.target.value) || 0)}
                placeholder="1200"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono font-bold text-emerald-900"
              />
              <span className="text-[10px] text-slate-400">القيمة الافتراضية: 1200 ج.م</span>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 block">
                قيمة الجواز السريع لكشف أمان (ج.م):
              </label>
              <input 
                type="number" 
                value={amanUrgentPrice}
                onChange={(e) => setAmanUrgentPrice(Number(e.target.value) || 0)}
                placeholder="1400"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono font-bold text-amber-900"
              />
              <span className="text-[10px] text-slate-400">القيمة الافتراضية: 1400 ج.م</span>
            </div>
          </div>
        </div>

        {/* Passport Forms Stock Management Card (مخزون استمارات الجوازات) */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h3 className="font-bold text-sm text-slate-800 flex items-center gap-2">
              <Package className="w-4.5 h-4.5 text-amber-600" />
              <span>مخزون استمارات الجوازات (العادي والسريع) وإضافة استمارات جديدة:</span>
            </h3>
            <span className="text-[10px] bg-amber-50 text-amber-800 border border-amber-200 font-bold px-2.5 py-0.5 rounded-full">
              مخزون يومي
            </span>
          </div>

          <p className="text-xs text-slate-500">
            سجل إجمالي الاستمارات المخزنة لديك، وأضف ما يتم استلامه يومياً من استمارات عادية وسريعة. يتم خصم الاستمارات تلقائياً بحسب فواتير الجوازات التي تبدأ بـ (#) والمسجلة بكشف أمان لبيان الرصيد المتبقي بدقة.
          </p>

          {/* Current Total Received Stats & Live Deductions */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-1">
            {/* Normal Stock Card */}
            <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-3.5 space-y-2">
              <div className="flex items-center justify-between border-b border-emerald-100 pb-2">
                <div>
                  <span className="text-xs font-extrabold text-emerald-950 block">استمارات العادي (مخزون ورصيد):</span>
                  <span className="text-[11px] text-emerald-700">المستلم التراكمي: {passportFormsStock.normalTotalReceived || 0}</span>
                </div>
                <span className="text-[10px] bg-emerald-100/80 text-emerald-900 border border-emerald-300 font-bold px-2 py-0.5 rounded-md">
                  منفذ بالفواتير: {formsStockUsedStats.allNormalUsed}
                </span>
              </div>
              <div className="flex items-center justify-between pt-1">
                <span className="text-xs font-bold text-slate-700">الرصيد الفعلي المتبقي لدينا:</span>
                <span className={`font-mono text-2xl font-black ${
                  formsStockUsedStats.normalRemaining <= 5 ? "text-red-700" : "text-emerald-950"
                }`}>
                  {formsStockUsedStats.normalRemaining}
                </span>
              </div>
            </div>

            {/* Urgent Stock Card */}
            <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-3.5 space-y-2">
              <div className="flex items-center justify-between border-b border-amber-100 pb-2">
                <div>
                  <span className="text-xs font-extrabold text-amber-950 block">استمارات السريع (مخزون ورصيد):</span>
                  <span className="text-[11px] text-amber-700">المستلم التراكمي: {passportFormsStock.urgentTotalReceived || 0}</span>
                </div>
                <span className="text-[10px] bg-amber-100/80 text-amber-900 border border-amber-300 font-bold px-2 py-0.5 rounded-md">
                  منفذ بالفواتير: {formsStockUsedStats.allUrgentUsed}
                </span>
              </div>
              <div className="flex items-center justify-between pt-1">
                <span className="text-xs font-bold text-slate-700">الرصيد الفعلي المتبقي لدينا:</span>
                <span className={`font-mono text-2xl font-black ${
                  formsStockUsedStats.urgentRemaining <= 5 ? "text-red-700" : "text-amber-950"
                }`}>
                  {formsStockUsedStats.urgentRemaining}
                </span>
              </div>
            </div>
          </div>

          {/* Add / Adjust Daily Forms Form */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
            <div>
              <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <Plus className="w-4 h-4 text-emerald-600" />
                <span>إضافة أو تعديل (خصم بالسالب) استمارات مستلمة:</span>
              </h4>
              <p className="text-[11px] text-slate-500 mt-0.5">
                أدخل رقماً موجباً للإضافة أو <strong className="text-rose-700">رقماً سالباً (مثل -5)</strong> لخصم وتصحيح كمية تم إدخالها بالخطأ.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-700 block">عدد استمارات العادي (+ أو -):</label>
                <input
                  type="text"
                  inputMode="numeric"
                  dir="ltr"
                  value={stockAddNormal}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (/^-?\d*$/.test(val)) setStockAddNormal(val);
                  }}
                  placeholder="0 أو -5"
                  className={`w-full bg-white border rounded-xl px-3 py-1.5 text-xs font-mono font-bold text-left focus:outline-none focus:ring-1 ${
                    stockAddNormal.startsWith("-")
                      ? "border-rose-300 text-rose-700 focus:ring-rose-500"
                      : "border-slate-300 text-emerald-900 focus:ring-emerald-500"
                  }`}
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-700 block">عدد استمارات السريع (+ أو -):</label>
                <input
                  type="text"
                  inputMode="numeric"
                  dir="ltr"
                  value={stockAddUrgent}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (/^-?\d*$/.test(val)) setStockAddUrgent(val);
                  }}
                  placeholder="0 أو -5"
                  className={`w-full bg-white border rounded-xl px-3 py-1.5 text-xs font-mono font-bold text-left focus:outline-none focus:ring-1 ${
                    stockAddUrgent.startsWith("-")
                      ? "border-rose-300 text-rose-700 focus:ring-rose-500"
                      : "border-slate-300 text-amber-900 focus:ring-amber-500"
                  }`}
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-700 block">ملاحظات الاستلام / سبب التصحيح (اختياري):</label>
                <input
                  type="text"
                  value={stockAddNotes}
                  onChange={(e) => setStockAddNotes(e.target.value)}
                  placeholder="دفعة صباحية أو تصحيح خطأ..."
                  className="w-full bg-white border border-slate-300 rounded-xl px-3 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 font-cairo"
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
              {stockFeedback ? (
                <span className="text-xs font-bold text-emerald-700 animate-fade-in flex items-center gap-1">
                  <Check className="w-4 h-4" />
                  {stockFeedback}
                </span>
              ) : <span />}

              <button
                type="button"
                disabled={
                  stockSaveLoading ||
                  ((parseInt(stockAddNormal, 10) || 0) === 0 && (parseInt(stockAddUrgent, 10) || 0) === 0)
                }
                onClick={async () => {
                  const addN = parseInt(stockAddNormal, 10) || 0;
                  const addU = parseInt(stockAddUrgent, 10) || 0;
                  if (addN === 0 && addU === 0) return;

                  const prevNormal = Number(passportFormsStock.normalTotalReceived) || 0;
                  const prevUrgent = Number(passportFormsStock.urgentTotalReceived) || 0;
                  const nextNormal = Math.max(0, prevNormal + addN);
                  const nextUrgent = Math.max(0, prevUrgent + addU);
                  const deltaN = nextNormal - prevNormal;
                  const deltaU = nextUrgent - prevUrgent;

                  if (deltaN === 0 && deltaU === 0) {
                    setStockFeedback("المخزون المستلم يساوي صفر بالفعل ولا يمكن إنقاصه أكثر.");
                    setTimeout(() => setStockFeedback(""), 4000);
                    return;
                  }

                  setStockSaveLoading(true);
                  try {
                    const today = new Date().toISOString().split("T")[0];
                    const newLog = {
                      id: `stock-log-${Date.now()}`,
                      date: today,
                      normalAdded: deltaN,
                      urgentAdded: deltaU,
                      notes: stockAddNotes.trim() || (deltaN < 0 || deltaU < 0 ? "تصحيح وخصم كمية" : undefined),
                    };
                    const updatedStock = {
                      normalTotalReceived: nextNormal,
                      urgentTotalReceived: nextUrgent,
                      logs: [newLog, ...(passportFormsStock.logs || [])],
                    };
                    setPassportFormsStock(updatedStock);
                    setStockAddNormal("");
                    setStockAddUrgent("");
                    setStockAddNotes("");

                    const payload: AppSettings = {
                      ...settings,
                      headerText: headerText.trim(),
                      subHeaderText: subHeaderText.trim(),
                      contactPhone: contactPhone.trim(),
                      welcomeMessage: welcomeMessage.trim(),
                      readyMessage: readyMessage.trim(),
                      readyPassportMessage: readyPassportMessage.trim(),
                      partialReadyMessage: partialReadyMessage.trim(),
                      deliveryMessage: deliveryMessage.trim(),
                      googleSheetId: settings.googleSheetId || "",
                      googleSheetUrl: googleSheetUrl.trim(),
                      googleSheetWebhookUrl: googleSheetWebhookUrl.trim(),
                      autoSyncWebhook: false,
                      footerText: footerText.trim(),
                      googleSheetsConnected: !!(googleSheetWebhookUrl.trim() || googleSheetUrl.trim() || settings.googleSheetsConnected),
                      includeSaturdayAsWeekend: includeSaturdayAsWeekend,
                      customHolidays: customHolidays,
                      applicantCapacities: applicantCapacities.filter((c) => c && c.trim()),
                      amanNormalPrice: Number(amanNormalPrice) || 0,
                      amanUrgentPrice: Number(amanUrgentPrice) || 0,
                      passportFormsStock: updatedStock,
                      mojeebAgentId: mojeebAgentId.trim(),
                      mojeebFromPhone: mojeebFromPhone.trim(),
                      mojeebTemplates,
                    };

                    const result = await updateSettingsOnServer(payload);
                    onSettingsUpdated(result);
                    setStockFeedback(
                      deltaN < 0 || deltaU < 0
                        ? "تم تصحيح وتعديل عدد الاستمارات المستلمة في المخزون بنجاح! 📦✅"
                        : "تمت إضافة الاستمارات وتحديث رصيد المخزون بنجاح! 📦✅"
                    );
                    setTimeout(() => setStockFeedback(""), 4000);
                  } catch (err: any) {
                    alert("حدث خطأ أثناء حفظ رصيد الاستمارات: " + err.message);
                  } finally {
                    setStockSaveLoading(false);
                  }
                }}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs disabled:opacity-50"
              >
                <Plus className="w-4 h-4" />
                <span>{stockSaveLoading ? "جاري الحفظ..." : "حفظ وتأكيد التحديث بالمخزون 💾"}</span>
              </button>
            </div>
          </div>

          {/* Logs of Received Forms */}
          {passportFormsStock.logs && passportFormsStock.logs.length > 0 && (
            <div className="space-y-2 pt-1">
              <span className="text-xs font-bold text-slate-700 block">سجل الاستلامات والتعديلات السابقة:</span>
              <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                {passportFormsStock.logs.map((log) => (
                  <div key={log.id} className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="font-mono text-slate-500 font-bold">{log.date}</span>
                      <span className={`font-bold ${log.normalAdded < 0 ? "text-rose-700" : "text-emerald-800"}`}>
                        عادي: {log.normalAdded > 0 ? `+${log.normalAdded}` : log.normalAdded}
                      </span>
                      <span className={`font-bold ${log.urgentAdded < 0 ? "text-rose-700" : "text-amber-800"}`}>
                        سريع: {log.urgentAdded > 0 ? `+${log.urgentAdded}` : log.urgentAdded}
                      </span>
                      {log.notes && <span className="text-slate-500 text-[11px]">({log.notes})</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Mojeeb WhatsApp Business API Integration Card */}
        <div className="bg-white border border-emerald-200 rounded-2xl p-6 shadow-xs space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-emerald-100 pb-3">
            <h3 className="font-bold text-sm text-emerald-900 flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-emerald-600" />
              إعدادات إرسال واتساب عبر Mojeeb API (حماية الرقم من الحظر)
            </h3>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 px-2 py-1 rounded-lg font-mono">
                POST /v1/whatsapp/templates
              </span>
              <span className="text-[10px] font-bold bg-slate-50 text-slate-700 border border-slate-200 px-2 py-1 rounded-lg font-mono">
                POST /v1/whatsapp/messages
              </span>
            </div>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 text-xs text-amber-950 space-y-1.5 leading-relaxed">
            <div className="font-bold flex items-center gap-1.5">
              <Lock className="w-4 h-4 text-amber-700 shrink-0" />
              <span>حماية مفتاح API + قاعدة نافذة الـ 24 ساعة من ميتا:</span>
            </div>
            <p className="text-[11px] text-amber-900">
              يُحفظ مفتاح <code className="font-mono font-bold bg-amber-100 px-1.5 py-0.5 rounded">MOJEEB_API_KEY</code> (بنطاق <code className="font-mono font-bold bg-amber-100 px-1.5 py-0.5 rounded">whatsapp:send</code>) في <strong>متغيرات البيئة / Secrets</strong> الخاصة بالخادم فقط ولا يُدخل في المتصفح أبداً.
            </p>
            <p className="text-[11px] text-amber-900">
              <strong>الإرسال للعميل لأول مرة:</strong> فعّل <strong>قالب واتساب المعتمد</strong> أدناه (<code className="font-mono font-bold">/v1/whatsapp/templates</code>) ليصل العميل في أي وقت حتى لو لم يراسلك من قبل (خارج نافذة الـ 24 ساعة). عند عدم تفعيل قالب لنوع رسالة معين، يرسل النظام تلقائياً كرسالة نصية حرة (<code className="font-mono font-bold">/v1/whatsapp/messages</code>).
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 block">
                معرّف الوكيل في مجيب (agent_id - UUID)
              </label>
              <input
                type="text"
                value={mojeebAgentId}
                onChange={(e) => setMojeebAgentId(e.target.value)}
                placeholder="12345678-1234-1234-1234-123456789012"
                dir="ltr"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-mono focus:outline-hidden focus:border-emerald-500"
              />
              <p className="text-[10px] text-slate-500">
                الوكيل المُصرَّح له باستخدام مفتاح API (أو عبر <code className="font-mono">MOJEEB_AGENT_ID</code>).
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 block">
                رقم واتساب الأعمال المُرسِل (from - صيغة E.164)
              </label>
              <input
                type="text"
                value={mojeebFromPhone}
                onChange={(e) => setMojeebFromPhone(e.target.value)}
                placeholder="+201012345678"
                dir="ltr"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-mono focus:outline-hidden focus:border-emerald-500"
              />
              <p className="text-[10px] text-slate-500">
                يجب أن يطابق اتصال واتساب نشط على الوكيل بصيغة دولية مثل <code className="font-mono">+2010...</code> (أو عبر <code className="font-mono">MOJEEB_FROM_PHONE</code>).
              </p>
            </div>
          </div>

          {/* Approved WhatsApp Templates Configuration (First-Time / Proactive Messaging) */}
          {(() => {
            const scenarios: { key: MojeebTemplateScenario; label: string; badge?: string }[] = [
              { key: "welcome", label: "الترحيب / أول مرة", badge: "أساسي" },
              { key: "ready", label: "جاهز للتسليم" },
              { key: "delivered", label: "تم التسليم" },
              { key: "partialReady", label: "إشعار جزئي" },
              { key: "reminder", label: "تذكير موعد" },
            ];
            const currentTpl = getScenarioTemplate(activeMojeebScenario);

            return (
              <div className="border border-emerald-200 bg-emerald-50/40 rounded-2xl p-4 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h4 className="text-xs font-extrabold text-emerald-950 flex items-center gap-1.5">
                      <FileText className="w-4 h-4 text-emerald-600" />
                      قوالب واتساب المعتمدة من ميتا (للإرسال للعميل لأول مرة وخارج نافذة الـ 24 ساعة)
                    </h4>
                    <p className="text-[11px] text-slate-600 mt-0.5">
                      اختر نوع الإشعار واضبط اسم القالب ولغته ومتغيّراته كما اعتُمد في لوحة مجيب، ثم اضغط <strong>حفظ الإعدادات</strong> بالأسفل.
                    </p>
                  </div>
                </div>

                {/* Scenario Selector Tabs */}
                <div className="flex flex-wrap gap-1.5">
                  {scenarios.map((sc) => {
                    const cfg = mojeebTemplates[sc.key];
                    const isConfigured = Boolean(cfg?.enabled && cfg?.name?.trim());
                    const isActive = activeMojeebScenario === sc.key;
                    return (
                      <button
                        key={sc.key}
                        type="button"
                        onClick={() => setActiveMojeebScenario(sc.key)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 border transition-colors cursor-pointer ${
                          isActive
                            ? "bg-emerald-700 text-white border-emerald-700 shadow-xs"
                            : "bg-white text-slate-700 border-slate-200 hover:bg-emerald-50"
                        }`}
                      >
                        <span>{sc.label}</span>
                        {sc.badge && !isActive && (
                          <span className="text-[9px] bg-amber-100 text-amber-800 px-1.5 py-0.2 rounded">
                            {sc.badge}
                          </span>
                        )}
                        {isConfigured && (
                          <span
                            className={`w-2 h-2 rounded-full ${isActive ? "bg-emerald-300" : "bg-emerald-500"}`}
                            title="مفعّل بقالب معتمد"
                          />
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Enable Toggle + Template Name & Language */}
                <div className="bg-white border border-emerald-100 rounded-xl p-4 space-y-4">
                  <label className="flex items-center gap-2.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={currentTpl.enabled}
                      onChange={(e) => updateScenarioTemplate(activeMojeebScenario, { enabled: e.target.checked })}
                      className="w-4 h-4 accent-emerald-600 rounded cursor-pointer"
                    />
                    <span className="text-xs font-extrabold text-slate-800">
                      تفعيل الإرسال عبر القالب المعتمد لهذا النوع ({scenarios.find((s) => s.key === activeMojeebScenario)?.label})
                    </span>
                  </label>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-slate-700 block">
                        اسم القالب المعتمد لدى ميتا (<code className="font-mono">template.name</code>)
                      </label>
                      <input
                        type="text"
                        value={currentTpl.name}
                        onChange={(e) => updateScenarioTemplate(activeMojeebScenario, { name: e.target.value })}
                        placeholder="مثال: arabic_signup_message أو order_confirmation"
                        dir="ltr"
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono focus:outline-hidden focus:border-emerald-500"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-slate-700 block">
                        رمز لغة القالب (<code className="font-mono">template.language</code> — مثل ar أو ar_EG أو en_US)
                      </label>
                      <div className="flex gap-1.5">
                        <input
                          type="text"
                          value={currentTpl.language}
                          onChange={(e) => updateScenarioTemplate(activeMojeebScenario, { language: e.target.value })}
                          placeholder="ar"
                          dir="ltr"
                          className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono focus:outline-hidden focus:border-emerald-500"
                        />
                        {["ar", "ar_EG", "en", "en_US"].map((code) => (
                          <button
                            key={code}
                            type="button"
                            onClick={() => updateScenarioTemplate(activeMojeebScenario, { language: code })}
                            className={`px-2 py-1 rounded-lg text-[10px] font-mono font-bold border cursor-pointer ${
                              currentTpl.language === code
                                ? "bg-emerald-600 text-white border-emerald-600"
                                : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                            }`}
                          >
                            {code}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Body Parameters Builder */}
                  <div className="space-y-2 border-t border-slate-100 pt-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <span className="text-xs font-bold text-slate-800 block">
                          متغيّرات نص القالب (<code className="font-mono">template.parameters</code> — اختياري):
                        </span>
                        <span className="text-[10px] text-slate-500">
                          يعمل مع المتغيّرات المرقّمة (<code className="font-mono">1</code>, <code className="font-mono">2</code>...) أو المُسمّاة (<code className="font-mono">customer_name</code>). اتركه فارغاً إن لم يحوِ القالب متغيّرات.
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const list = currentTpl.parameters || [];
                          const nextKey = String(list.length + 1);
                          updateScenarioTemplate(activeMojeebScenario, {
                            parameters: [...list, { key: nextKey, value: "" }],
                          });
                        }}
                        className="px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-lg text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        إضافة متغيّر
                      </button>
                    </div>

                    {(currentTpl.parameters || []).length > 0 && (
                      <div className="space-y-2">
                        {(currentTpl.parameters || []).map((param, pIdx) => (
                          <div key={pIdx} className="grid grid-cols-12 gap-2 items-center">
                            <input
                              type="text"
                              value={param.key}
                              onChange={(e) => {
                                const updated = [...(currentTpl.parameters || [])];
                                updated[pIdx] = { ...updated[pIdx], key: e.target.value };
                                updateScenarioTemplate(activeMojeebScenario, { parameters: updated });
                              }}
                              placeholder="1 أو customer_name"
                              dir="ltr"
                              className="col-span-4 sm:col-span-3 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-mono focus:outline-hidden focus:border-emerald-500"
                            />
                            <input
                              type="text"
                              value={param.value}
                              onChange={(e) => {
                                const updated = [...(currentTpl.parameters || [])];
                                updated[pIdx] = { ...updated[pIdx], value: e.target.value };
                                updateScenarioTemplate(activeMojeebScenario, { parameters: updated });
                              }}
                              placeholder="القيمة أو متغيّر مثل {اسم_العميل}"
                              className="col-span-7 sm:col-span-8 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-hidden focus:border-emerald-500"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                const updated = (currentTpl.parameters || []).filter((_, i) => i !== pIdx);
                                updateScenarioTemplate(activeMojeebScenario, { parameters: updated });
                              }}
                              className="col-span-1 p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg flex items-center justify-center cursor-pointer"
                              title="حذف المتغيّر"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Quick Placeholder Chips */}
                    <div className="space-y-1 pt-1">
                      <span className="text-[10px] font-bold text-slate-500 block">
                        اضغط على أي رمز لإضافته كمتغيّر جديد تلقائياً (أو انسخه في القيمة):
                      </span>
                      <div className="flex flex-wrap gap-1">
                        {MOJEEB_TEMPLATE_PLACEHOLDERS.map((ph) => (
                          <button
                            key={ph.token}
                            type="button"
                            onClick={() => {
                              const list = currentTpl.parameters || [];
                              const emptyIdx = list.findIndex((p) => !p.value.trim());
                              if (emptyIdx >= 0) {
                                const updated = [...list];
                                updated[emptyIdx] = { ...updated[emptyIdx], value: ph.token };
                                updateScenarioTemplate(activeMojeebScenario, { parameters: updated });
                              } else {
                                updateScenarioTemplate(activeMojeebScenario, {
                                  parameters: [...list, { key: String(list.length + 1), value: ph.token }],
                                });
                              }
                            }}
                            className="text-[10px] font-bold bg-slate-100 hover:bg-emerald-100 text-slate-700 hover:text-emerald-900 border border-slate-200 px-2 py-0.5 rounded-md cursor-pointer transition-colors"
                            title={`إدراج ${ph.token}`}
                          >
                            {ph.label} <span className="font-mono opacity-75">{ph.token}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Optional Header Text Variable & Header Media URL */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 border-t border-slate-100 pt-3">
                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-slate-700 block">
                        متغيّر رأس النص (اسم المفتاح - اختياري)
                      </label>
                      <input
                        type="text"
                        value={currentTpl.headerParameterKey || ""}
                        onChange={(e) => updateScenarioTemplate(activeMojeebScenario, { headerParameterKey: e.target.value })}
                        placeholder="1 أو name (بحد أقصى متغيّر واحد)"
                        dir="ltr"
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-mono focus:outline-hidden focus:border-emerald-500"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-slate-700 block">
                        قيمة متغيّر رأس النص (اختياري)
                      </label>
                      <input
                        type="text"
                        value={currentTpl.headerParameterValue || ""}
                        onChange={(e) => updateScenarioTemplate(activeMojeebScenario, { headerParameterValue: e.target.value })}
                        placeholder="مثال: {اسم_العميل}"
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-hidden focus:border-emerald-500"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-slate-700 block">
                        رابط وسائط الرأس (<code className="font-mono">header_media_url</code> - اختياري)
                      </label>
                      <input
                        type="text"
                        value={currentTpl.headerMediaUrl || ""}
                        onChange={(e) => updateScenarioTemplate(activeMojeebScenario, { headerMediaUrl: e.target.value })}
                        placeholder="https://... (اتركه فارغاً لاستخدام صورة العيّنة)"
                        dir="ltr"
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-mono focus:outline-hidden focus:border-emerald-500"
                      />
                    </div>
                  </div>

                  {/* Optional Dynamic Buttons Builder */}
                  <div className="space-y-2 border-t border-slate-100 pt-3">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <span className="text-[11px] font-bold text-slate-700 block">
                          الأزرار الديناميكية (<code className="font-mono">template.buttons[]</code> — اختياري، للأزرار المتغيّرة فقط):
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const list = currentTpl.buttons || [];
                          updateScenarioTemplate(activeMojeebScenario, {
                            buttons: [...list, { index: list.length, type: "url_suffix", value: "" }],
                          });
                        }}
                        className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                      >
                        <Plus className="w-3 h-3" />
                        إضافة زر
                      </button>
                    </div>

                    {(currentTpl.buttons || []).map((btn, bIdx) => (
                      <div key={bIdx} className="grid grid-cols-12 gap-2 items-center">
                        <input
                          type="number"
                          min={0}
                          value={btn.index}
                          onChange={(e) => {
                            const updated = [...(currentTpl.buttons || [])];
                            updated[bIdx] = { ...updated[bIdx], index: Math.max(0, parseInt(e.target.value, 10) || 0) };
                            updateScenarioTemplate(activeMojeebScenario, { buttons: updated });
                          }}
                          placeholder="index"
                          dir="ltr"
                          title="فهرس الزر (يبدأ من 0)"
                          className="col-span-2 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-mono"
                        />
                        <select
                          value={btn.type}
                          onChange={(e) => {
                            const updated = [...(currentTpl.buttons || [])];
                            updated[bIdx] = { ...updated[bIdx], type: e.target.value as any };
                            updateScenarioTemplate(activeMojeebScenario, { buttons: updated });
                          }}
                          className="col-span-4 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-mono"
                        >
                          <option value="url_suffix">url_suffix (رابط ديناميكي)</option>
                          <option value="quick_reply_payload">quick_reply_payload (رد سريع)</option>
                          <option value="coupon_code">coupon_code (كود خصم)</option>
                          <option value="otp_code">otp_code (رمز تحقق OTP)</option>
                        </select>
                        <input
                          type="text"
                          value={btn.value}
                          onChange={(e) => {
                            const updated = [...(currentTpl.buttons || [])];
                            updated[bIdx] = { ...updated[bIdx], value: e.target.value };
                            updateScenarioTemplate(activeMojeebScenario, { buttons: updated });
                          }}
                          placeholder="القيمة أو {رقم_الفاتورة}"
                          dir="ltr"
                          className="col-span-5 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-mono"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const updated = (currentTpl.buttons || []).filter((_, i) => i !== bIdx);
                            updateScenarioTemplate(activeMojeebScenario, { buttons: updated });
                          }}
                          className="col-span-1 p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg flex items-center justify-center cursor-pointer"
                          title="حذف الزر"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Quick Test Send Box (Template OR Free Text) */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <Send className="w-4 h-4 text-emerald-600" />
                اختبار الإرسال عبر Mojeeb API:
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1 bg-white border border-slate-200 p-0.5 rounded-lg text-[11px] font-bold">
                  <button
                    type="button"
                    onClick={() => setMojeebTestSendKind("template")}
                    className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                      mojeebTestSendKind === "template" ? "bg-emerald-700 text-white" : "text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    قالب معتمد (أول مرة)
                  </button>
                  <button
                    type="button"
                    onClick={() => setMojeebTestSendKind("text")}
                    className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                      mojeebTestSendKind === "text" ? "bg-slate-800 text-white" : "text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    رسالة حرة (24 ساعة)
                  </button>
                </div>

                <div className="flex items-center gap-1 bg-white border border-slate-200 p-0.5 rounded-lg text-[11px] font-bold">
                  <button
                    type="button"
                    onClick={() => setMojeebTestMode("phone")}
                    className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                      mojeebTestMode === "phone" ? "bg-emerald-600 text-white" : "text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    برقم الهاتف (to)
                  </button>
                  <button
                    type="button"
                    onClick={() => setMojeebTestMode("username")}
                    className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                      mojeebTestMode === "username" ? "bg-emerald-600 text-white" : "text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    باسم المستخدم (@username)
                  </button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-600 block">
                  {mojeebTestMode === "phone" ? "رقم المستلم (مثال: 010... أو +2010...)" : "اسم المستخدم في واتساب (مثال: sara.k)"}
                </label>
                <input
                  type="text"
                  value={mojeebTestRecipient}
                  onChange={(e) => setMojeebTestRecipient(e.target.value)}
                  placeholder={mojeebTestMode === "phone" ? "+201012345678" : "@sara.k"}
                  dir="ltr"
                  className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono focus:outline-hidden focus:border-emerald-500"
                />
              </div>

              <div className="md:col-span-2 space-y-1">
                <label className="text-[11px] font-bold text-slate-600 block">
                  {mojeebTestSendKind === "template"
                    ? `سيتم اختبار القالب المحدد أعلاه (${getScenarioTemplate(activeMojeebScenario).name || "أدخل اسم القالب أعلاه"} / ${getScenarioTemplate(activeMojeebScenario).language || "ar"}) ببيانات تجريبية`
                    : "نص الرسالة الحرة التجريبية"}
                </label>
                <div className="flex gap-2">
                  {mojeebTestSendKind === "text" ? (
                    <input
                      type="text"
                      value={mojeebTestBody}
                      onChange={(e) => setMojeebTestBody(e.target.value)}
                      className="flex-1 bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-hidden focus:border-emerald-500"
                    />
                  ) : (
                    <div className="flex-1 bg-white border border-emerald-200 rounded-lg px-3 py-2 text-xs text-slate-700 flex items-center justify-between font-mono">
                      <span className="truncate">
                        {getScenarioTemplate(activeMojeebScenario).name
                          ? `${getScenarioTemplate(activeMojeebScenario).name} (${getScenarioTemplate(activeMojeebScenario).language || "ar"})`
                          : "لم يُكتب اسم القالب بعد في القسم أعلاه"}
                      </span>
                      <span className="text-[10px] bg-emerald-50 text-emerald-800 px-1.5 py-0.5 rounded font-cairo font-bold shrink-0">
                        {(getScenarioTemplate(activeMojeebScenario).parameters || []).length} متغيّر
                      </span>
                    </div>
                  )}
                  <button
                    type="button"
                    disabled={mojeebTestLoading}
                    onClick={async () => {
                      const target = mojeebTestRecipient.trim();
                      if (!target) {
                        setMojeebTestFeedback({
                          type: "error",
                          text: mojeebTestMode === "phone"
                            ? "أدخل رقم هاتف المستلم للتجربة."
                            : "أدخل اسم المستخدم في واتساب للتجربة."
                        });
                        return;
                      }

                      setMojeebTestLoading(true);
                      setMojeebTestFeedback(null);
                      try {
                        let res;
                        if (mojeebTestSendKind === "template") {
                          const tplCfg = getScenarioTemplate(activeMojeebScenario);
                          if (!tplCfg.name.trim() || !tplCfg.language.trim()) {
                            setMojeebTestFeedback({
                              type: "error",
                              text: "يرجى إدخال اسم القالب المعتمد ورمز اللغة في القسم أعلاه قبل إرسال التجربة."
                            });
                            return;
                          }
                          const sampleVars: Record<string, string> = {
                            "{اسم_المكتب}": headerText.trim() || "مكتب مزايا للجوازات",
                            "{الترويسة_الفرعية}": subHeaderText.trim() || "جوازات طنطا والمعاملات الحكومية",
                            "{اسم_العميل}": "أحمد محمد (تجربة)",
                            "{رقم_الفاتورة}": "1001",
                            "{تاريخ_اليوم}": new Date().toISOString().split("T")[0],
                            "{الموظف}": activeEmployee.name || "الموظف",
                            "{حالة_الفاتورة}": "جديدة",
                            "{الخدمات}": "استخراج جواز سفر عادي",
                            "{موعد_التسليم}": new Date().toISOString().split("T")[0],
                            "{السعر}": "1500.00 ج.م",
                            "{رقم_الارشيف}": "A-12",
                            "{هاتف_التواصل}": contactPhone.trim() || "01000000000",
                            "{رقم_التواصل}": contactPhone.trim() || "01000000000",
                            "{ملاحظة_التنفيذ}": "رسالة اختبار",
                            "{الرسالة_الكاملة}": mojeebTestBody.trim(),
                          };
                          const resolvedTemplate = resolveMojeebTemplatePayload(tplCfg, sampleVars);
                          res = await sendWhatsAppTemplateViaMojeeb({
                            agentId: mojeebAgentId.trim() || undefined,
                            from: mojeebFromPhone.trim() || undefined,
                            ...(mojeebTestMode === "phone" ? { to: target } : { recipientUsername: target }),
                            template: resolvedTemplate,
                            idempotencyKey: `settings-tpl-test-${Date.now()}`
                          });
                        } else {
                          res = await sendWhatsAppViaMojeeb({
                            agentId: mojeebAgentId.trim() || undefined,
                            from: mojeebFromPhone.trim() || undefined,
                            ...(mojeebTestMode === "phone" ? { to: target } : { recipientUsername: target }),
                            body: mojeebTestBody.trim(),
                            idempotencyKey: `settings-test-${Date.now()}`
                          });
                        }

                        if (!res.success) {
                          setMojeebTestFeedback({
                            type: "error",
                            text: res.error || "فشل الاختبار عبر واجهة مجيب."
                          });
                        } else {
                          const msgId = res.data?.id ? ` | معرّف الرسالة: ${res.data.id}` : "";
                          const status = res.data?.status ? ` | الحالة: ${res.data.status}` : "";
                          const type = res.data?.type ? ` | النوع: ${res.data.type}` : "";
                          setMojeebTestFeedback({
                            type: "success",
                            text: `نجح الإرسال! تم إدراج الرسالة في طابور مجيب (HTTP 202)${type}${status}${msgId}.`
                          });
                        }
                      } finally {
                        setMojeebTestLoading(false);
                      }
                    }}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 shadow-xs"
                  >
                    {mojeebTestLoading ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        جاري الإرسال...
                      </>
                    ) : (
                      <>
                        <Send className="w-3.5 h-3.5" />
                        {mojeebTestSendKind === "template" ? "إرسال تجربة القالب" : "إرسال تجربة"}
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>

            {mojeebTestFeedback && (
              <div
                className={`rounded-lg p-3 border text-xs font-bold flex items-start gap-2 ${
                  mojeebTestFeedback.type === "success"
                    ? "bg-emerald-50 border-emerald-200 text-emerald-900"
                    : "bg-rose-50 border-rose-200 text-rose-900"
                }`}
              >
                {mojeebTestFeedback.type === "success" ? (
                  <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                )}
                <span className="leading-relaxed">{mojeebTestFeedback.text}</span>
              </div>
            )}
          </div>
        </div>

        {/* WhatsApp Notification Message Templates Card */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-4">
          <h3 className="font-bold text-sm text-slate-800 flex items-center gap-1.5 border-b border-slate-100 pb-2">
            <MessageCircle className="w-4.5 h-4.5 text-blue-500" />
            قوالب رسائل تذكير الواتساب التلقائية:
          </h3>

          <div className="space-y-4">
            {/* First Welcome WhatsApp Message */}
            <div className="space-y-2 border border-blue-100 bg-blue-50/40 rounded-xl p-3.5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <label className="text-xs font-bold text-blue-900 block">
                  🌟 قالب رسالة استلام الطلب والترحيب الأولى (رسالة الفاتورة الأولى للعميل):
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setWelcomeMessage(`🧾 *{اسم_المكتب}*
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

{الخاتمة}`);
                  }}
                  className="text-[10px] font-bold text-blue-700 hover:text-blue-900 bg-white border border-blue-200 px-2 py-1 rounded-lg hover:bg-blue-50 transition-colors shadow-2xs self-start sm:self-auto cursor-pointer"
                >
                  استعادة قالب الفاتورة الحرارية المطابق للطباعة 🔄
                </button>
              </div>
              <p className="text-[11px] text-slate-600">
                هذه هي الرسالة الأولى التي تُرسل للعميل عبر الواتساب فور تسجيل الفاتورة، ومصممة لتكون متطابقة تماماً مع محتويات وشكل الفاتورة الحرارية المطبوعة (مع كافة تفاصيل الأسعار، الغرامات الحكومية، تعليمات كل خدمة ومواعيدها).
              </p>
              <textarea 
                value={welcomeMessage}
                onChange={(e) => setWelcomeMessage(e.target.value)}
                placeholder="قالب رسالة الواتساب الأولى..."
                rows={9}
                className="w-full bg-white border border-blue-200 rounded-xl p-3 text-xs font-mono leading-relaxed"
                dir="rtl"
              />
              <div className="space-y-1 text-[10px]">
                <div className="font-bold text-slate-600">المتغيرات الصالحة للإدراج السريع:</div>
                <div className="flex flex-wrap gap-1.5 font-mono">
                  {[
                    "{تفاصيل_الفاتورة}",
                    "{محتوى_الفاتورة}",
                    "{اسم_المكتب}",
                    "{الترويسة_الفرعية}",
                    "{رقم_الفاتورة}",
                    "{تاريخ_اليوم}",
                    "{الموظف}",
                    "{حالة_الفاتورة}",
                    "{موعد_التسليم}",
                    "{السعر}",
                    "{الخاتمة}",
                    "{اسم_العميل}",
                    "{الاسم}",
                    "{الاسم_الانجليزي}",
                    "{المهنة}",
                    "{صفة_مقدم_الطلب}",
                    "{الخدمات}",
                    "{تعليمات_الاستلام}",
                    "{فاصل}"
                  ].map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => setWelcomeMessage((prev) => prev + " " + tag)}
                      className="bg-white border border-slate-200 px-1.5 py-0.5 rounded text-blue-800 font-bold hover:bg-blue-50 transition-colors cursor-pointer"
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Ready WhatsApp Message for Passport Services (#) */}
            <div className="space-y-2 border border-amber-200 bg-amber-50/40 rounded-xl p-3.5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <label className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
                  <span>🛂</span>
                  <span>قالب رسالة جاهزية معاملات جوازات السفر (للخدمات التي تبدأ بـ #):</span>
                </label>
                <button
                  type="button"
                  onClick={() => setReadyPassportMessage(DEFAULT_READY_PASSPORT_MESSAGE)}
                  className="text-[10px] font-bold text-amber-800 hover:text-amber-950 bg-white border border-amber-300 px-2 py-1 rounded-lg hover:bg-amber-100/50 transition-colors shadow-2xs self-start sm:self-auto cursor-pointer"
                >
                  استعادة قالب جوازات السفر الافتراضي 🔄
                </button>
              </div>
              <p className="text-[11px] text-slate-600">
                هذا القالب يُرسل تلقائياً عند جاهزية أي فاتورة تشتمل على خدمات جوازات السفر (التي تبدأ أسمائها بـ #). تم تخصيص محتواه ليتضمن تعليمات استلام الجواز وحضور صاحب الشأن أو الأب/الزوج وأصل الفاتورة والبطاقة.
              </p>
              <textarea 
                value={readyPassportMessage}
                onChange={(e) => setReadyPassportMessage(e.target.value)}
                placeholder="قالب جاهزية جوازات السفر..."
                rows={6}
                className="w-full bg-white border border-amber-200 rounded-xl p-3 text-xs font-mono leading-relaxed"
                dir="rtl"
              />
              <div className="space-y-1 text-[10px]">
                <div className="font-bold text-slate-600">المتغيرات الصالحة للإدراج:</div>
                <div className="flex flex-wrap gap-1.5 font-mono">
                  {[
                    "{اسم_العميل}",
                    "{رقم_الفاتورة}",
                    "{رقم_الارشيف}",
                    "{الخدمات}",
                    "{اسم_المكتب}",
                    "{الترويسة_الفرعية}",
                    "{هاتف_التواصل}",
                    "{فاصل}"
                  ].map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => setReadyPassportMessage((prev) => prev + " " + tag)}
                      className="bg-white border border-slate-200 px-1.5 py-0.5 rounded text-amber-800 font-bold hover:bg-amber-50 transition-colors cursor-pointer"
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Ready WhatsApp Message for General Government Services (Other) */}
            <div className="space-y-2 border border-slate-200 bg-slate-50/70 rounded-xl p-3.5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <span>📑</span>
                  <span>قالب رسالة جاهزية المعاملات والخدمات الحكومية العامة (لباقي الخدمات):</span>
                </label>
                <button
                  type="button"
                  onClick={() => setReadyMessage(DEFAULT_READY_GENERAL_MESSAGE)}
                  className="text-[10px] font-bold text-slate-700 hover:text-slate-900 bg-white border border-slate-300 px-2 py-1 rounded-lg hover:bg-slate-100 transition-colors shadow-2xs self-start sm:self-auto cursor-pointer"
                >
                  استعادة قالب المعاملات العامة الافتراضي 🔄
                </button>
              </div>
              <p className="text-[11px] text-slate-600">
                هذا القالب يُرسل تلقائياً لباقي المعاملات الحكومية العادية (كالشهادات، القيد العائلي، التوثيق، إلخ) التي لا تشتمل على خدمات جوازات السفر (#).
              </p>
              <textarea 
                value={readyMessage}
                onChange={(e) => setReadyMessage(e.target.value)}
                placeholder="قالب جاهزية المعاملات العامة..."
                rows={5}
                className="w-full bg-white border border-slate-200 rounded-xl p-3 text-xs font-mono leading-relaxed"
                dir="rtl"
              />
              <div className="space-y-1 text-[10px]">
                <div className="font-bold text-slate-600">المتغيرات الصالحة للإدراج:</div>
                <div className="flex flex-wrap gap-1.5 font-mono">
                  {[
                    "{اسم_العميل}",
                    "{رقم_الفاتورة}",
                    "{رقم_الارشيف}",
                    "{الخدمات}",
                    "{اسم_المكتب}",
                    "{الترويسة_الفرعية}",
                    "{هاتف_التواصل}",
                    "{فاصل}"
                  ].map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => setReadyMessage((prev) => prev + " " + tag)}
                      className="bg-white border border-slate-200 px-1.5 py-0.5 rounded text-slate-800 font-bold hover:bg-slate-100 transition-colors cursor-pointer"
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Partial Ready Message for Multi-service / Family Invoices */}
            <div className="space-y-2 border border-sky-200 bg-sky-50/50 rounded-xl p-3.5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <label className="text-xs font-bold text-sky-950 flex items-center gap-1.5">
                  <span>⏳</span>
                  <span>قالب رسالة الإنجاز الجزئي للخدمات (إشعار العميل بانتهاء خدمة وجاري استكمال الباقي):</span>
                </label>
                <button
                  type="button"
                  onClick={() => setPartialReadyMessage(DEFAULT_PARTIAL_READY_MESSAGE)}
                  className="text-[10px] font-bold text-sky-800 hover:text-sky-950 bg-white border border-sky-300 px-2 py-1 rounded-lg hover:bg-sky-100/50 transition-colors shadow-2xs self-start sm:self-auto cursor-pointer"
                >
                  استعادة قالب الإنجاز الجزئي الافتراضي 🔄
                </button>
              </div>
              <p className="text-[11px] text-slate-600 leading-relaxed">
                يُرسل هذا القالب الفرعي عبر الواتساب عند الانتهاء من تنفيذ أي خدمة بعينها في الفاتورة (عند وجود أكثر من خدمة أو أكثر من فرد). يُفيد العميل بالخدمة التي تم إنجازها وملاحظتها مع طمأنته بأن باقي الخدمات قيد المتابعة تباعاً.
              </p>
              <textarea 
                value={partialReadyMessage}
                onChange={(e) => setPartialReadyMessage(e.target.value)}
                placeholder="قالب رسالة الإنجاز الجزئي للخدمات..."
                rows={7}
                className="w-full bg-white border border-sky-200 rounded-xl p-3 text-xs font-mono leading-relaxed"
                dir="rtl"
              />
              <div className="space-y-1 text-[10px]">
                <div className="font-bold text-slate-600">المتغيرات الصالحة للإدراج تلقائياً:</div>
                <div className="flex flex-wrap gap-1.5 font-mono">
                  {[
                    "{اسم_العميل}",
                    "{رقم_الفاتورة}",
                    "{الخدمة_المنجزة}",
                    "{تاريخ_الانجاز}",
                    "{ملاحظة_التنفيذ}",
                    "{الخدمات_المتبقية}",
                    "{اسم_المكتب}",
                    "{الترويسة_الفرعية}",
                    "{هاتف_التواصل}",
                    "{فاصل}"
                  ].map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => setPartialReadyMessage((prev) => prev + " " + tag)}
                      className="bg-white border border-slate-200 px-1.5 py-0.5 rounded text-sky-900 font-bold hover:bg-sky-50 transition-colors cursor-pointer"
                    >
                      {tag}
                    </button>
                  ))}
                </div>
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

        {/* Applicant Capacity Management Card (صفة مقدم الطلب لخدمات # و ##) */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div>
              <h3 className="font-extrabold text-sm text-slate-900 flex items-center gap-2">
                <UserCheck className="w-5 h-5 text-indigo-600" />
                <span>خيارات ومسميات صفة مقدم الطلب (معاملات الجوازات # و ##):</span>
              </h3>
              <p className="text-[11px] text-slate-500 mt-1">
                تظهر هذه القائمة المنسدلة تلقائياً عند تسجيل فاتورة جديدة بالخدمات التي تبدأ بـ # أو ##. وتظهر الصفة المختارة في الفاتورة المطبوعة ورسائل الواتساب المرسلة للعميل.
              </p>
            </div>
            <button
              type="button"
              onClick={handleResetCapacities}
              className="text-[11px] font-bold text-slate-600 hover:text-indigo-600 flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-indigo-50 border border-slate-200 rounded-xl transition-all cursor-pointer shrink-0 font-cairo"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>استعادة المسميات الافتراضية</span>
            </button>
          </div>

          {capacityFeedback && (
            <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-2 animate-fade-in font-cairo">
              <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{capacityFeedback}</span>
            </div>
          )}

          {/* Add New Capacity Input Form */}
          <div className="bg-indigo-50/50 border border-indigo-100 rounded-xl p-3.5 space-y-2">
            <label className="text-xs font-bold text-indigo-950 block font-cairo">
              إضافة صفة أو مسمى جديد لمقدم الطلب:
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={newCapacityInput}
                onChange={(e) => setNewCapacityInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddCapacity();
                  }
                }}
                placeholder="مثال: الوصي القانوني، العم، الخال، الجد..."
                className="flex-1 bg-white border border-slate-200 text-slate-800 rounded-xl px-3 py-2 text-xs font-cairo focus:outline-hidden focus:ring-2 focus:ring-indigo-500 shadow-2xs"
              />
              <button
                type="button"
                onClick={() => handleAddCapacity()}
                disabled={!newCapacityInput.trim()}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold font-cairo flex items-center gap-1.5 transition-all disabled:opacity-50 cursor-pointer shadow-xs"
              >
                <Plus className="w-4 h-4" />
                <span>إضافة للقائمة +</span>
              </button>
            </div>
          </div>

          {/* List of configured capacities */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-500 font-cairo px-1">
              <span>المسميات الحالية بالقائمة المنسدلة (مرتبة حسب الأولوية):</span>
              <span className="font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md font-mono text-[11px]">
                {applicantCapacities.length} مسمى
              </span>
            </div>

            <div className="grid gap-2">
              {applicantCapacities.map((cap, idx) => (
                <div
                  key={`${cap}-${idx}`}
                  className="flex items-center justify-between bg-slate-50/80 hover:bg-white border border-slate-200 rounded-xl p-2.5 transition-all shadow-2xs"
                >
                  {editingCapacityIdx === idx ? (
                    <div className="flex items-center gap-2 flex-1">
                      <input
                        type="text"
                        value={editCapacityValue}
                        onChange={(e) => setEditCapacityValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            handleSaveEditCapacity();
                          } else if (e.key === "Escape") {
                            setEditingCapacityIdx(null);
                          }
                        }}
                        autoFocus
                        className="flex-1 bg-white border border-indigo-300 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-800 font-cairo focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                      />
                      <button
                        type="button"
                        onClick={handleSaveEditCapacity}
                        className="p-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors cursor-pointer"
                        title="حفظ التعديل"
                      >
                        <Check className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingCapacityIdx(null)}
                        className="p-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg transition-colors cursor-pointer"
                        title="إلغاء"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-2.5">
                        <span className="w-6 h-6 rounded-lg bg-slate-200/80 text-slate-700 text-[11px] font-bold flex items-center justify-center font-mono shrink-0">
                          {idx + 1}
                        </span>
                        <span className="text-xs font-bold text-slate-800 font-cairo">
                          {cap}
                        </span>
                        {idx === 0 && (
                          <span className="text-[10px] bg-amber-100 text-amber-800 border border-amber-200 px-2 py-0.5 rounded-md font-bold font-cairo">
                            الافتراضي الأول 🌟
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleMoveCapacity(idx, "up")}
                          disabled={idx === 0}
                          className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-20 cursor-pointer rounded-md hover:bg-slate-100 transition-colors"
                          title="تحريك لأعلى"
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleMoveCapacity(idx, "down")}
                          disabled={idx === applicantCapacities.length - 1}
                          className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-20 cursor-pointer rounded-md hover:bg-slate-100 transition-colors"
                          title="تحريك لأسفل"
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleStartEditCapacity(idx)}
                          className="p-1 text-slate-500 hover:text-blue-600 cursor-pointer rounded-md hover:bg-blue-50 transition-colors mr-1"
                          title="تعديل المسمى"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteCapacity(idx)}
                          className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer rounded-md hover:bg-rose-50 transition-colors"
                          title="حذف المسمى"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-between items-center pt-2 border-t border-slate-100">
            <span className="text-[11px] text-slate-400 font-cairo">
              يتم حفظ التعديلات وحفظها مباشرة، أو يمكنك الضغط على زر الحفظ أدناه.
            </span>
            <button
              type="button"
              onClick={() => handleSaveCapacitiesDirectly(applicantCapacities)}
              disabled={capacitySaveLoading}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold font-cairo flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
            >
              <Save className="w-4 h-4" />
              <span>{capacitySaveLoading ? "جاري الحفظ..." : "حفظ المسميات 💾"}</span>
            </button>
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

            {/* Live Database Mode Notice */}
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3.5 text-xs text-emerald-950 flex items-start gap-3">
              <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <div className="font-bold flex items-center gap-2">
                  <span>جوجل شيت يعمل كقاعدة بيانات حية مركزية 📊</span>
                  <span className="px-2 py-0.5 bg-emerald-200 text-emerald-900 rounded-md text-[10px] font-bold">مزامنة فورية نشطة</span>
                </div>
                <p className="text-[11px] text-emerald-900 leading-relaxed font-cairo">
                  يتم حفظ وتحديث كتالوج الخدمات، الفواتير الجديدة أو المعدلة، والأسماء المترجمة للإنجليزي في ملف جوجل شيت تلقائياً وفورياً عند أي تعديل أو إنشاء. كما يمكنك دائماً استخدام زري التصدير والاستيراد الموحدين بالأسفل لرفع أو سحب كافة البيانات دفعة واحدة عند الحاجة.
                </p>
              </div>
            </div>

            {/* Unified Export & Import Panel for ALL Data */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 border-b border-slate-200 pb-2">
                <span className="font-bold text-slate-800 text-xs flex items-center gap-1.5 font-cairo">
                  <Database className="w-4 h-4 text-emerald-600" />
                  لوحة التصدير والاستيراد الموحدة الشاملة لكافة بيانات النظام:
                </span>
                <span className="text-[10px] text-emerald-800 bg-emerald-100/70 border border-emerald-200 px-2 py-0.5 rounded-md font-mono font-bold">
                  زر واحد موحد يجلب كل شيء (الخدمات + الغرامات + الموظفين والصلاحيات + الفواتير + القاموس + الإعدادات)
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                {/* Unified Import Button */}
                <button
                  type="button"
                  disabled={syncLoading || !googleSheetWebhookUrl.trim()}
                  onClick={handlePullWebhook}
                  className="py-3.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs flex flex-col items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-40 shadow-xs text-center"
                >
                  <div className="flex items-center gap-2 text-sm font-extrabold">
                    <Download className="w-4 h-4 text-blue-200" />
                    <span>استيراد كافة البيانات والموظفين من جوجل شيت 📥</span>
                  </div>
                  <span className="text-[10px] text-blue-100 font-normal leading-relaxed">
                    زر واحد موحد يجلب كل شيء: كتالوج الخدمات، بنود الغرامات الحكومية، حسابات وصلاحيات الموظفين، الفواتير، قاموس الأسماء، وقوالب رسائل الواتساب
                  </span>
                </button>

                {/* Unified Export Button */}
                <button
                  type="button"
                  disabled={syncLoading || !googleSheetWebhookUrl.trim()}
                  onClick={handlePushWebhook}
                  className="py-3.5 px-4 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-xs flex flex-col items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-40 shadow-xs text-center"
                >
                  <div className="flex items-center gap-2 text-sm font-extrabold">
                    <Download className="w-4 h-4 rotate-180 text-emerald-400" />
                    <span>تصدير وحفظ كافة البيانات والموظفين على جوجل شيت 📤</span>
                  </div>
                  <span className="text-[10px] text-slate-300 font-normal leading-relaxed">
                    حفظ شامل لكل البيانات: كتالوج الخدمات، بنود الغرامات الحكومية، حسابات وصلاحيات الموظفين، الفواتير، قاموس الأسماء، وقوالب رسائل الواتساب
                  </span>
                </button>
              </div>
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

        {/* Card 4: Employee Accounts & Permissions Management */}
        <EmployeeManager
          employees={employees}
          activeEmployee={activeEmployee}
          onEmployeesUpdated={onEmployeesUpdated}
          googleSheetWebhookUrl={googleSheetWebhookUrl || settings.googleSheetWebhookUrl}
        />

        {/* Card 5: Dedicated Customer Name Dictionary Management */}
        <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
          <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-blue-600" />
              <div>
                <h3 className="font-bold text-sm text-slate-800 font-cairo">قاموس الترجمة المعتمد وأسماء الجوازات</h3>
                <p className="text-[11px] text-slate-500 font-cairo">تسجيل الأسماء المترجمة واعتمادها لترجمتها فورياً بمجرد كتابة الاسم العربي في الفواتير</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="px-3 py-1.5 bg-blue-50 text-blue-700 font-bold rounded-lg text-xs font-mono border border-blue-200/60">
                {dictionary.length} اسم محفوظ
              </span>
            </div>
          </div>

          <div className="p-6 space-y-6">

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

        {/* Card 6: Official Egyptian Holidays & Business Working Days Settings with Prime Minister Decree Shifting */}
        <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
          <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <CalendarCheck className="w-5 h-5 text-indigo-600" />
              <div>
                <h3 className="font-bold text-sm text-slate-800 font-cairo">إدارة وترحيل وتعديل العطلات الرسمية وأيام العمل</h3>
                <p className="text-[11px] text-slate-500 font-cairo">
                  إمكانية ترحيل العطلات للخميس أو الأحد أو أي يوم محدد بقرارات رئيس مجلس الوزراء، وتعديل التواريخ والمسميات فورياً
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => handleSaveHolidaysDirectly(customHolidays)}
                disabled={holidaySaveLoading}
                className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs font-cairo disabled:opacity-50"
                title="تثبيت وحفظ جدول العطلات فوراً بالخادم وقاعدة البيانات"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{holidaySaveLoading ? "جاري الحفظ..." : "تثبيت وحفظ العطلات الرسمية 💾"}</span>
              </button>
              <button
                type="button"
                onClick={async () => {
                  const confirmed = window.confirm("هل تريد استعادة قائمة العطلات الرسمية الافتراضية المعتمدة لجمهورية مصر العربية (2025 - 2027)؟");
                  if (confirmed) {
                    setCustomHolidays(DEFAULT_OFFICIAL_HOLIDAYS);
                    await handleSaveHolidaysDirectly(DEFAULT_OFFICIAL_HOLIDAYS);
                  }
                }}
                className="px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-bold rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs font-cairo"
                title="استعادة القائمة الرسمية لجميع العطلات"
              >
                <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
                <span>استعادة الافتراضية 🔄</span>
              </button>
              <span className="px-3 py-1.5 bg-indigo-50 text-indigo-700 font-bold rounded-lg text-xs font-mono border border-indigo-200/60">
                {customHolidays.length} عطلة مسجلة
              </span>
            </div>
          </div>

          {/* Feedback banner */}
          {holidayFeedback && (
            <div className="mx-6 mt-4 p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-bold font-cairo flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-600" />
              <span>{holidayFeedback}</span>
            </div>
          )}

          <div className="p-6 space-y-6">
            {/* Weekend Configuration */}
            <div className="bg-indigo-50/50 border border-indigo-100 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h4 className="font-bold text-xs text-indigo-950 flex items-center gap-1.5 font-cairo">
                  <Calendar className="w-4 h-4 text-indigo-600" />
                  قاعدة احتساب يوم السبت كعطلة أو يوم عمل
                </h4>
                <p className="text-[11px] text-indigo-700/80 mt-1 font-cairo">
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
                <span className="text-xs font-bold text-slate-800 font-cairo">تجاوز السبت لباقي الخدمات (عطلة)</span>
              </label>
            </div>

            {/* Quick Add Custom or Decree Holiday */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
              <h4 className="font-bold text-xs text-slate-800 flex items-center gap-1.5 font-cairo">
                <Plus className="w-4 h-4 text-indigo-600" />
                إضافة عطلة استثنائية أو قرار إجازة جديد:
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
                <div className="sm:col-span-4 space-y-1">
                  <label className="text-[11px] font-bold text-slate-600 font-cairo">تاريخ العطلة:</label>
                  <input
                    type="date"
                    value={newHolidayDate}
                    onChange={(e) => setNewHolidayDate(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono"
                  />
                </div>
                <div className="sm:col-span-6 space-y-1">
                  <label className="text-[11px] font-bold text-slate-600 font-cairo">اسم العطلة أو سبب الإغلاق الحكومي:</label>
                  <input
                    type="text"
                    value={newHolidayName}
                    onChange={(e) => setNewHolidayName(e.target.value)}
                    placeholder="مثال: إجازة طارئة بقرار رئيس مجلس الوزراء..."
                    className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs font-cairo"
                  />
                </div>
                <div className="sm:col-span-2">
                  <button
                    type="button"
                    onClick={async () => {
                      if (!newHolidayDate || !newHolidayName.trim()) {
                        alert("يرجى تحديد التاريخ واسم العطلة أولاً.");
                        return;
                      }
                      if (customHolidays.some(h => h.date === newHolidayDate)) {
                        alert("هذا التاريخ مسجل بالفعل كعطلة رسمية.");
                        return;
                      }
                      const updated = [...customHolidays, { date: newHolidayDate, name: newHolidayName.trim() }];
                      updated.sort((a, b) => a.date.localeCompare(b.date));
                      setCustomHolidays(updated);
                      setNewHolidayDate("");
                      setNewHolidayName("");
                      await handleSaveHolidaysDirectly(updated);
                    }}
                    className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-3 rounded-lg text-xs flex items-center justify-center gap-1 transition-colors shadow-xs cursor-pointer font-cairo"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>إضافة وتثبيت</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Filter and Search Bar for Holidays */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
              <div className="flex items-center gap-1.5 w-full sm:w-auto">
                <span className="text-xs font-bold text-slate-600 font-cairo ml-1">تصفية بالسنة:</span>
                {["2026", "2025", "2027", "ALL"].map((yr) => (
                  <button
                    key={yr}
                    type="button"
                    onClick={() => setHolidayYearFilter(yr)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold font-mono transition-colors cursor-pointer ${
                      holidayYearFilter === yr 
                        ? "bg-indigo-600 text-white shadow-xs" 
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    {yr === "ALL" ? "الكل" : yr}
                  </button>
                ))}
              </div>

              <div className="relative w-full sm:w-64">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-2.5" />
                <input
                  type="text"
                  value={holidaySearch}
                  onChange={(e) => setHolidaySearch(e.target.value)}
                  placeholder="بحث في اسم العطلة..."
                  className="w-full pr-8 pl-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:bg-white font-cairo"
                />
              </div>
            </div>

            {/* Modal for Custom Shifting to Any Specific Date */}
            {customShiftIdx !== null && customHolidays[customShiftIdx] && (
              <div className="p-4 bg-amber-50/80 border-2 border-amber-300 rounded-xl space-y-3">
                <div className="flex justify-between items-center">
                  <h4 className="font-bold text-xs text-amber-950 flex items-center gap-1.5 font-cairo">
                    <Calendar className="w-4 h-4 text-amber-600" />
                    <span>ترحيل عطلة "{customHolidays[customShiftIdx].name}" إلى يوم آخر محدد:</span>
                  </h4>
                  <button
                    type="button"
                    onClick={() => setCustomShiftIdx(null)}
                    className="text-slate-400 hover:text-slate-600 p-1"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
                  <div className="sm:col-span-4 space-y-1">
                    <label className="text-[11px] font-bold text-slate-700 font-cairo">التاريخ البديل الجديد:</label>
                    <input
                      type="date"
                      value={customShiftDate}
                      onChange={(e) => setCustomShiftDate(e.target.value)}
                      className="w-full bg-white border border-amber-300 rounded-lg px-3 py-2 text-xs font-mono font-bold"
                    />
                    <span className="text-[10px] text-amber-800 font-bold block">
                      يوافق يوم: {getArabicDayName(customShiftDate) || "غير محدد"}
                    </span>
                  </div>
                  <div className="sm:col-span-5 space-y-1">
                    <label className="text-[11px] font-bold text-slate-700 font-cairo">السبب أو بيان القرار الحكومي:</label>
                    <input
                      type="text"
                      value={customShiftReason}
                      onChange={(e) => setCustomShiftReason(e.target.value)}
                      placeholder="مثال: بقرار رئيس مجلس الوزراء..."
                      className="w-full bg-white border border-amber-300 rounded-lg px-3 py-2 text-xs font-cairo"
                    />
                  </div>
                  <div className="sm:col-span-3 flex gap-2">
                    <button
                      type="button"
                      onClick={async () => {
                        if (!customShiftDate) {
                          alert("يرجى تحديد التاريخ البديل.");
                          return;
                        }
                        const target = customHolidays[customShiftIdx];
                        const updated = [...customHolidays];
                        updated[customShiftIdx] = shiftHolidayToDate(
                          target, 
                          customShiftDate, 
                          customShiftReason.trim() ? `مرحّلة لـ ${getArabicDayName(customShiftDate)} ${customShiftReason.trim()}` : undefined
                        );
                        updated.sort((a, b) => a.date.localeCompare(b.date));
                        setCustomHolidays(updated);
                        setCustomShiftIdx(null);
                        await handleSaveHolidaysDirectly(updated);
                      }}
                      className="flex-1 bg-amber-600 hover:bg-amber-700 text-white font-bold py-2 px-3 rounded-lg text-xs transition-colors shadow-xs cursor-pointer font-cairo"
                    >
                      تأكيد الترحيل والحفظ 💾
                    </button>
                    <button
                      type="button"
                      onClick={() => setCustomShiftIdx(null)}
                      className="px-3 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-xs font-bold font-cairo cursor-pointer"
                    >
                      إلغاء
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Comprehensive Holidays Table with Shifting to Thursday, Sunday, Custom Date, and Editing */}
            <div className="space-y-2">
              <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200 font-cairo">
                    <tr>
                      <th className="px-3.5 py-2.5 w-44">التاريخ واليوم</th>
                      <th className="px-3.5 py-2.5">المناسبة الرسمية</th>
                      <th className="px-3.5 py-2.5 text-center w-64">ترحيل العطلة (قرار رئيس الوزراء) 🏛️</th>
                      <th className="px-3.5 py-2.5 text-center w-20">تعديل</th>
                      <th className="px-3.5 py-2.5 text-center w-16">حذف</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white font-cairo">
                    {(() => {
                      const filtered = customHolidays
                        .map((h, idx) => ({ ...h, originalIndex: idx }))
                        .filter((h) => {
                          if (holidayYearFilter !== "ALL" && !h.date.startsWith(holidayYearFilter)) {
                            return false;
                          }
                          if (holidaySearch.trim() && !h.name.includes(holidaySearch.trim())) {
                            return false;
                          }
                          return true;
                        });

                      if (filtered.length === 0) {
                        return (
                          <tr>
                            <td colSpan={5} className="py-8 text-center text-slate-400 text-xs">
                              لا توجد عطلات تطابق خيارات التصفية الحالية.
                            </td>
                          </tr>
                        );
                      }

                      return filtered.map((item) => {
                        const dayName = getArabicDayName(item.date);
                        const isThursday = dayName === "الخميس";
                        const isSunday = dayName === "الأحد";
                        const isWeekend = dayName === "الجمعة" || dayName === "السبت";
                        const isEditing = editingHolidayIdx === item.originalIndex;

                        if (isEditing) {
                          return (
                            <tr key={item.originalIndex} className="bg-amber-50/50">
                              <td className="px-3.5 py-2">
                                <input
                                  type="date"
                                  value={editHolidayDate}
                                  onChange={(e) => setEditHolidayDate(e.target.value)}
                                  className="w-full bg-white border border-amber-300 rounded px-2 py-1 text-xs font-mono font-bold"
                                />
                                <span className="text-[10px] text-amber-700 font-bold block mt-1">
                                  {getArabicDayName(editHolidayDate)}
                                </span>
                              </td>
                              <td className="px-3.5 py-2">
                                <input
                                  type="text"
                                  value={editHolidayName}
                                  onChange={(e) => setEditHolidayName(e.target.value)}
                                  className="w-full bg-white border border-amber-300 rounded px-2 py-1 text-xs font-bold"
                                />
                              </td>
                              <td colSpan={3} className="px-3.5 py-2 text-center">
                                <div className="flex items-center justify-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      if (!editHolidayDate || !editHolidayName.trim()) {
                                        alert("يرجى ملء التاريخ والاسم.");
                                        return;
                                      }
                                      const updated = [...customHolidays];
                                      updated[item.originalIndex] = {
                                        ...updated[item.originalIndex],
                                        date: editHolidayDate,
                                        name: editHolidayName.trim()
                                      };
                                      updated.sort((a, b) => a.date.localeCompare(b.date));
                                      setCustomHolidays(updated);
                                      setEditingHolidayIdx(null);
                                      await handleSaveHolidaysDirectly(updated);
                                    }}
                                    className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs font-bold flex items-center gap-1 shadow-2xs cursor-pointer"
                                  >
                                    <Check className="w-3.5 h-3.5" />
                                    <span>حفظ التعديل 💾</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setEditingHolidayIdx(null)}
                                    className="px-2.5 py-1 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded text-xs font-bold cursor-pointer"
                                  >
                                    إلغاء
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        }

                        return (
                          <tr key={item.originalIndex} className="hover:bg-slate-50 transition-colors">
                            {/* Date & Day Name */}
                            <td className="px-3.5 py-2.5">
                              <div className="flex items-center gap-1.5">
                                <span className="font-mono font-bold text-slate-900">{item.date}</span>
                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                  isThursday 
                                    ? "bg-purple-50 text-purple-700 border border-purple-200" 
                                    : isSunday
                                    ? "bg-indigo-50 text-indigo-700 border border-indigo-200"
                                    : isWeekend 
                                    ? "bg-rose-50 text-rose-700 border border-rose-200"
                                    : "bg-blue-50 text-blue-700 border border-blue-200"
                                }`}>
                                  {dayName}
                                </span>
                              </div>
                              {item.originalDate && item.originalDate !== item.date && (
                                <span className="text-[10px] text-slate-400 block font-mono mt-0.5">
                                  مرحّلة من: {item.originalDate} ({getArabicDayName(item.originalDate)})
                                </span>
                              )}
                            </td>

                            {/* Holiday Name */}
                            <td className="px-3.5 py-2.5">
                              <span className="font-bold text-slate-800">{item.name}</span>
                              {item.shifted && (
                                <span className="mr-1.5 px-1.5 py-0.5 bg-amber-100 text-amber-800 text-[10px] font-bold rounded-sm border border-amber-200">
                                  مرحّلة بقرار حكومي
                                </span>
                              )}
                            </td>

                            {/* Shifting Actions: Thursday, Sunday, Other Day, Revert */}
                            <td className="px-3.5 py-2.5 text-center">
                              <div className="flex flex-wrap items-center justify-center gap-1.5">
                                {/* Shift to Thursday */}
                                <button
                                  type="button"
                                  onClick={async () => {
                                    const thursdayDate = shiftDateToThursday(item.date);
                                    if (thursdayDate === item.date) {
                                      alert("تاريخ هذه العطلة يوافق يوم الخميس بالفعل.");
                                      return;
                                    }
                                    const confirmShift = window.confirm(
                                      `هل تريد ترحيل عطلة "${item.name}" من يوم (${dayName} ${item.date}) إلى يوم (الخميس ${thursdayDate}) طبقاً لقرار مجلس الوزراء؟`
                                    );
                                    if (!confirmShift) return;

                                    const updated = [...customHolidays];
                                    updated[item.originalIndex] = shiftHolidayToDate(item, thursdayDate, "مرحّلة للخميس بقرار مجلس الوزراء");
                                    updated.sort((a, b) => a.date.localeCompare(b.date));
                                    setCustomHolidays(updated);
                                    await handleSaveHolidaysDirectly(updated);
                                  }}
                                  disabled={isThursday}
                                  className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold transition-all shadow-2xs cursor-pointer ${
                                    isThursday 
                                      ? "bg-purple-50 text-purple-600 border border-purple-200 opacity-60 cursor-not-allowed" 
                                      : "bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200"
                                  }`}
                                  title="ترحيل الإجازة إلى يوم الخميس التالي بقرار مجلس الوزراء"
                                >
                                  <ArrowRightLeft className="w-3 h-3 text-amber-600" />
                                  <span>للخميس 🗓️</span>
                                </button>

                                {/* Shift to Sunday */}
                                <button
                                  type="button"
                                  onClick={async () => {
                                    const sundayDate = shiftDateToSunday(item.date);
                                    if (sundayDate === item.date) {
                                      alert("تاريخ هذه العطلة يوافق يوم الأحد بالفعل.");
                                      return;
                                    }
                                    const confirmShift = window.confirm(
                                      `هل تريد ترحيل عطلة "${item.name}" من يوم (${dayName} ${item.date}) إلى يوم (الأحد ${sundayDate}) طبقاً لقرار مجلس الوزراء؟`
                                    );
                                    if (!confirmShift) return;

                                    const updated = [...customHolidays];
                                    updated[item.originalIndex] = shiftHolidayToDate(item, sundayDate, "مرحّلة للأحد بقرار مجلس الوزراء");
                                    updated.sort((a, b) => a.date.localeCompare(b.date));
                                    setCustomHolidays(updated);
                                    await handleSaveHolidaysDirectly(updated);
                                  }}
                                  disabled={isSunday}
                                  className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold transition-all shadow-2xs cursor-pointer ${
                                    isSunday 
                                      ? "bg-indigo-50 text-indigo-600 border border-indigo-200 opacity-60 cursor-not-allowed" 
                                      : "bg-indigo-50 hover:bg-indigo-100 text-indigo-900 border border-indigo-200"
                                  }`}
                                  title="ترحيل الإجازة إلى يوم الأحد بقرار مجلس الوزراء"
                                >
                                  <ArrowRightLeft className="w-3 h-3 text-indigo-600" />
                                  <span>للأحد 🗓️</span>
                                </button>

                                {/* Shift to Custom Date / Other Day */}
                                <button
                                  type="button"
                                  onClick={() => {
                                    setCustomShiftIdx(item.originalIndex);
                                    setCustomShiftDate(item.date);
                                    setCustomShiftReason("بقرار رئيس مجلس الوزراء");
                                  }}
                                  className="inline-flex items-center gap-1 px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-lg text-[10px] font-bold transition-all shadow-2xs cursor-pointer"
                                  title="ترحيل الإجازة إلى أي يوم محدد بقرار مجلس الوزراء"
                                >
                                  <Calendar className="w-3 h-3 text-slate-500" />
                                  <span>ليوم آخر 🏛️</span>
                                </button>

                                {/* Revert Shift if shifted */}
                                {item.shifted && (
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      const confirmRevert = window.confirm(`هل تريد إلغاء ترحيل عطلة "${item.name}" واستعادة تاريخها الأصلي (${item.originalDate})؟`);
                                      if (!confirmRevert) return;
                                      const updated = [...customHolidays];
                                      updated[item.originalIndex] = revertHolidayShift(item);
                                      updated.sort((a, b) => a.date.localeCompare(b.date));
                                      setCustomHolidays(updated);
                                      await handleSaveHolidaysDirectly(updated);
                                    }}
                                    className="inline-flex items-center gap-1 px-2 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg text-[10px] font-bold transition-all shadow-2xs cursor-pointer"
                                    title="إلغاء الترحيل واستعادة التاريخ الأصلي"
                                  >
                                    <RotateCcw className="w-3 h-3 text-rose-500" />
                                    <span>إلغاء الترحيل ↩️</span>
                                  </button>
                                )}
                              </div>
                            </td>

                            {/* Edit Action */}
                            <td className="px-3.5 py-2.5 text-center">
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingHolidayIdx(item.originalIndex);
                                  setEditHolidayDate(item.date);
                                  setEditHolidayName(item.name);
                                }}
                                className="p-1 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                                title="تعديل التاريخ أو المسمى يدوياً"
                              >
                                <Edit3 className="w-4 h-4" />
                              </button>
                            </td>

                            {/* Delete Action */}
                            <td className="px-3.5 py-2.5 text-center">
                              <button
                                type="button"
                                onClick={async () => {
                                  const confirmDelete = window.confirm(`هل أنت متأكد من حذف عطلة "${item.name}" من قائمة العطلات؟`);
                                  if (!confirmDelete) return;
                                  const updated = customHolidays.filter((_, i) => i !== item.originalIndex);
                                  setCustomHolidays(updated);
                                  await handleSaveHolidaysDirectly(updated);
                                }}
                                className="p-1 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                                title="حذف العطلة"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        );
                      });
                    })()}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Explanatory Guide Box */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-xs text-slate-600 flex items-start gap-2.5 font-cairo leading-relaxed">
              <Info className="w-4.5 h-4.5 text-blue-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-slate-800">
                  ملاحظة هامة حول ترحيل وتعديل العطلات بقرارات رئيس مجلس الوزراء:
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  بمجرد الضغط على زر <strong>(للخميس 🗓️)</strong> أو <strong>(للأحد 🗓️)</strong> أو <strong>(ليوم آخر 🏛️)</strong> أو تعديل تاريخ أي عطلة، يتم حفظها وتطبيق التاريخ الجديد فوراً وتجاوزه كعطلة رسمية عند حساب مواعيد استلام وتسليم الفواتير في النظام، وفي رسائل الواتساب والإيصالات المطبوعة. كما يتم احتساب مدة الخدمات المتعددة بالتتابع بحيث تبدأ الخدمة التالية بعد انتهاء الخدمة السابقة مباشرة.
                </p>
              </div>
            </div>

          </div>
        </div>

        {/* Submit Actions */}
        <div className="flex justify-end gap-2">
          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2.5 bg-slate-900 text-white hover:bg-slate-800 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-colors shadow-md disabled:opacity-50 cursor-pointer font-cairo"
          >
            <Save className="w-4 h-4" />
            {saving ? "جاري الحفظ والتهيئة..." : "حفظ جميع الإعدادات بالتكامل 💾"}
          </button>
        </div>

      </form>

    </div>
  );
}
