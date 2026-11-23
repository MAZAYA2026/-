import React, { useState, useEffect, useRef, useMemo } from "react";
import { Service, CustomerInput, Invoice, InvoiceStatus, AppSettings, Employee, DictionaryItem, GovernmentFine, DEFAULT_APPLICANT_CAPACITIES, PotentialCustomer } from "../types";
import { createInvoiceOnServer, saveDictionaryWord } from "../lib/api";
import { calculateWorkingDaysDeliveryDate, getArabicDayName, isNonWorkingDay, recalculateCustomerServicesDeliveryDates } from "../lib/businessDays";
import { generateWhatsAppWelcomeMessage, buildInvoiceTemplateVariables, dispatchWhatsAppViaMojeebSmart } from "../lib/whatsapp";
import { breakdownArabicName, extractAtomicWordTokens, normalizeArabic } from "../lib/dictionary";
import { playLanguageWarningSound } from "../lib/audio";
import { Plus, Trash2, FileText, UserPlus, Sparkles, Printer, Send, Check, AlertCircle, Info, Calendar, BookOpen, ShieldAlert, CalendarCheck, AlertTriangle, Volume2, Users, Camera, CheckSquare, Square, Search, X, RefreshCw, ChevronDown, ChevronUp } from "lucide-react";
import ThermalReceipt from "./ThermalReceipt";
import DocumentScannerModal from "./DocumentScannerModal";
import { getCustomerTheme, getArabicOrdinalLabel, getServiceItemTheme } from "../lib/customerVisualThemes";

interface InvoiceCreatorProps {
  services: Service[];
  settings: AppSettings;
  activeEmployee: Employee;
  onInvoiceCreated: (invoice: Invoice) => void;
  dictionary?: DictionaryItem[];
  onDictionaryUpdated?: (newDict: DictionaryItem[]) => void;
  governmentFines?: GovernmentFine[];
  potentialCustomers?: PotentialCustomer[];
  initialCustomerToCreate?: PotentialCustomer | null;
  onPotentialCustomerConverted?: (convertedId: string) => void;
}

export default function InvoiceCreator({ 
  services, 
  settings, 
  activeEmployee, 
  onInvoiceCreated, 
  dictionary = [], 
  onDictionaryUpdated,
  governmentFines = [],
  potentialCustomers = [],
  initialCustomerToCreate = null,
  onPotentialCustomerConverted
}: InvoiceCreatorProps) {
  const applicantCapacityOptions = (settings.applicantCapacities && settings.applicantCapacities.length > 0)
    ? settings.applicantCapacities
    : DEFAULT_APPLICANT_CAPACITIES;

  // Master form state: list of customers on this invoice
  const [customers, setCustomers] = useState<CustomerInput[]>([createEmptyCustomer()]);
  const [collapsedCustomers, setCollapsedCustomers] = useState<Record<number, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ [key: string]: string }>({});

  // Double-click and duplicate submission prevention locks
  const isSubmittingRef = useRef<boolean>(false);
  const lastSubmitTimeRef = useRef<number>(0);
  
  // Potential Customers modal & AI OCR scanner states
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isSelectProspectModalOpen, setIsSelectProspectModalOpen] = useState(false);
  const [selectedProspectIds, setSelectedProspectIds] = useState<string[]>([]);
  const [prospectSearchTerm, setProspectSearchTerm] = useState("");

  // Missing word translation inputs and saving state
  const [missingWordInputs, setMissingWordInputs] = useState<{ [word: string]: string }>({});
  const [savingWord, setSavingWord] = useState<string | null>(null);

  // States for printing overlay
  const [printInvoice, setPrintInvoice] = useState<Invoice | null>(null);
  const [lastCreatedInvoice, setLastCreatedInvoice] = useState<Invoice | null>(null);
  const [showSuccessToast, setShowSuccessToast] = useState(false);
  const [createdInvoiceId, setCreatedInvoiceId] = useState<number | null>(null);
  const [sendingWhatsApp, setSendingWhatsApp] = useState(false);
  const [whatsappNotice, setWhatsappNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Auto pre-fill if initialCustomerToCreate is provided from Potential Customers tab
  useEffect(() => {
    if (initialCustomerToCreate) {
      const p = initialCustomerToCreate;
      const passportService = services.find((s) => s.name.startsWith("##") || s.name.startsWith("#"));
      const defaultServiceId = passportService ? passportService.name : (services[0]?.name || "");

      let en = p.englishName || "";
      if (!en && p.arabicName) {
        try {
          const breakdown = breakdownArabicName(p.arabicName, dictionary);
          if (breakdown && breakdown.assembledEnglish) {
            en = breakdown.assembledEnglish.toUpperCase();
          }
        } catch {}
      }

      const prefilled: CustomerInput = {
        arabicName: p.arabicName,
        englishName: en,
        englishNameOption: "dictionary",
        nationalId: p.nationalId,
        birthDate: p.birthDate || "",
        profession: p.profession || "",
        phone: p.phone || "",
        applicantCapacity: p.applicantCapacity || "",
        services: [
          {
            serviceId: defaultServiceId,
            quantity: 1,
            price: 0,
            deliveryDate: "",
          },
        ],
      };
      setCustomers([prefilled]);
    }
  }, [initialCustomerToCreate]);

  // Handle confirming selection of customers from potential customers list
  const handleConfirmSelectProspects = () => {
    const selectedList = potentialCustomers.filter((p) => selectedProspectIds.includes(p.id));
    if (selectedList.length === 0) {
      setIsSelectProspectModalOpen(false);
      return;
    }

    const passportService = services.find((s) => s.name.startsWith("##") || s.name.startsWith("#"));
    const defaultServiceId = passportService ? passportService.name : (services[0]?.name || "");

    const newCustomers: CustomerInput[] = selectedList.map((p) => {
      let en = p.englishName || "";
      if (!en && p.arabicName) {
        try {
          const breakdown = breakdownArabicName(p.arabicName, dictionary);
          if (breakdown && breakdown.assembledEnglish) {
            en = breakdown.assembledEnglish.toUpperCase();
          }
        } catch {}
      }

      return {
        arabicName: p.arabicName,
        englishName: en,
        englishNameOption: "dictionary",
        nationalId: p.nationalId,
        birthDate: p.birthDate || "",
        profession: p.profession || "",
        phone: p.phone || "", // Kept empty for the employee to type
        applicantCapacity: p.applicantCapacity || "", // Kept unselected so employee notices and selects
        services: [
          {
            serviceId: defaultServiceId,
            quantity: 1,
            price: 0,
            deliveryDate: "",
          },
        ],
      };
    });

    setCustomers(newCustomers);
    setIsSelectProspectModalOpen(false);
    setSelectedProspectIds([]);
  };

  // Handle scanned customer direct insertion
  const handleScannedCustomerDirect = (cust: Partial<PotentialCustomer>, useImmediately?: boolean) => {
    const passportService = services.find((s) => s.name.startsWith("##") || s.name.startsWith("#"));
    const defaultServiceId = passportService ? passportService.name : (services[0]?.name || "");

    const newCustomerInput: CustomerInput = {
      arabicName: cust.arabicName || "",
      englishName: cust.englishName || "",
      englishNameOption: "dictionary",
      nationalId: cust.nationalId || "",
      birthDate: cust.birthDate || "",
      profession: cust.profession || "",
      phone: cust.phone || "",
      applicantCapacity: cust.applicantCapacity || "",
      services: [
        {
          serviceId: defaultServiceId,
          quantity: 1,
          price: 0,
          deliveryDate: "",
        },
      ],
    };

    if (customers.length === 1 && !customers[0].arabicName.trim() && !customers[0].nationalId.trim()) {
      setCustomers([newCustomerInput]);
    } else {
      setCustomers((prev) => [...prev, newCustomerInput]);
    }
  };

  function createEmptyCustomer(): CustomerInput {
    return {
      arabicName: "",
      englishName: "",
      englishNameOption: "dictionary",
      nationalId: "",
      birthDate: "",
      phone: "",
      profession: "",
      applicantCapacity: "",
      services: [
        {
          serviceId: "",
          quantity: 1,
          price: 0,
          deliveryDate: ""
        }
      ]
    };
  }

  // Check if any selected service across the whole invoice starts with # or ##
  // This governs the visibility of English Name, National ID, and Profession
  const isPassportRelated = (customer: CustomerInput) => {
    return customer.services.some(s => {
      if (!s.serviceId) return false;
      const matchedSrv = services.find(srv => srv.id === s.serviceId || srv.name === s.serviceId);
      if (!matchedSrv) return false;
      return matchedSrv.name.startsWith("#") || matchedSrv.name.startsWith("##");
    });
  };

  // Extract Birth Date from National ID
  const calculateBirthDateFromNationalId = (nid: string): string => {
    if (!nid || nid.length < 7) return "";
    const cleanId = nid.trim();
    if (!/^\d+$/.test(cleanId)) return "";

    const centuryDigit = parseInt(cleanId[0]);
    const yy = cleanId.substring(1, 3);
    const mm = cleanId.substring(3, 5);
    const dd = cleanId.substring(5, 7);

    let year = 1900 + parseInt(yy);
    if (centuryDigit === 3) {
      year = 2000 + parseInt(yy);
    } else if (centuryDigit === 2) {
      year = 1900 + parseInt(yy);
    } else {
      // General fallbacks if code starts with something else
      return "";
    }

    // Verify valid months and days
    const month = parseInt(mm);
    const day = parseInt(dd);
    if (month < 1 || month > 12 || day < 1 || day > 31) {
      return "";
    }

    return `${year}/${mm}/${dd}`; // YYYY/MM/DD
  };

  // Detect language mismatch across any active customer input fields
  const activeLanguageMismatch = React.useMemo(() => {
    for (let idx = 0; idx < customers.length; idx++) {
      const cust = customers[idx];
      // 1. Arabic Name: typed English
      if (/[a-zA-Z]/.test(cust.arabicName)) {
        return {
          customerIndex: idx + 1,
          fieldName: "الاسم العربي",
          expectedLang: "العربية",
          wrongLang: "الإنجليزية",
          keyHint: "التحويل إلى العربية (Alt + Shift)",
          sampleText: cust.arabicName,
        };
      }
      // 2. Profession: typed English
      if (/[a-zA-Z]/.test(cust.profession)) {
        return {
          customerIndex: idx + 1,
          fieldName: "المهنة",
          expectedLang: "العربية",
          wrongLang: "الإنجليزية",
          keyHint: "التحويل إلى العربية (Alt + Shift)",
          sampleText: cust.profession,
        };
      }
      // 3. English Name: typed Arabic (when not "previous" option)
      if (
        cust.englishNameOption !== "previous" &&
        cust.englishName &&
        cust.englishName !== "نفس ترجمة الجواز السابق" &&
        /[\u0600-\u06FF]/.test(cust.englishName)
      ) {
        return {
          customerIndex: idx + 1,
          fieldName: "الاسم باللغة الإنجليزية",
          expectedLang: "الإنجليزية",
          wrongLang: "العربية",
          keyHint: "التحويل إلى الإنجليزية (Alt + Shift)",
          sampleText: cust.englishName,
        };
      }
    }

    // 4. Missing word translation inputs: typed Arabic
    for (const [missingWord, val] of Object.entries(missingWordInputs)) {
      if (typeof val === "string" && /[\u0600-\u06FF]/.test(val)) {
        return {
          customerIndex: 1,
          fieldName: `ترجمة المقطع (${missingWord}) بالإنجليزية`,
          expectedLang: "الإنجليزية",
          wrongLang: "العربية",
          keyHint: "التحويل إلى الإنجليزية (Alt + Shift)",
          sampleText: val,
        };
      }
    }

    return null;
  }, [customers, missingWordInputs]);

  // Audible warning chime when mismatch is detected
  useEffect(() => {
    if (activeLanguageMismatch) {
      playLanguageWarningSound();
    }
  }, [activeLanguageMismatch?.fieldName, activeLanguageMismatch?.customerIndex, activeLanguageMismatch?.wrongLang]);

  // Handler for service dropdown selection
  const handleServiceChange = (cIdx: number, sIdx: number, val: string) => {
    const updated = [...customers];
    const item = updated[cIdx].services[sIdx];
    item.serviceId = val;

    const matched = services.find(s => s.id === val || s.name === val);
    const isPass = matched?.name?.trim().startsWith("#");
    if (!isPass) {
      item.fineName = "";
      item.fineAmount = 0;
      item.fines = [];
    }

    if (matched) {
      item.price = (matched.govPrice + (item.fineAmount || 0) + matched.officeFee) * item.quantity;
    } else {
      item.price = 0;
      item.deliveryDate = "";
    }

    // Recalculate sequential delivery dates for all services of this customer:
    // If multiple services are selected, service 2 starts after service 1 finishes, service 3 after service 2, etc.
    const customHolidays = settings.customHolidays || [];
    updated[cIdx].services = recalculateCustomerServicesDeliveryDates(
      updated[cIdx].services,
      new Date(),
      services,
      customHolidays,
      settings.includeSaturdayAsWeekend !== false
    );

    setCustomers(updated);
  };

  const handleQtyChange = (cIdx: number, sIdx: number, qty: number) => {
    const updated = [...customers];
    const item = updated[cIdx].services[sIdx];
    item.quantity = Math.max(1, qty);

    const matched = services.find(s => s.id === item.serviceId || s.name === item.serviceId);
    if (matched) {
      item.price = (matched.govPrice + (item.fineAmount || 0) + matched.officeFee) * item.quantity;
    }

    // Recalculate sequential delivery dates for all services of this customer
    const customHolidays = settings.customHolidays || [];
    updated[cIdx].services = recalculateCustomerServicesDeliveryDates(
      updated[cIdx].services,
      new Date(),
      services,
      customHolidays,
      settings.includeSaturdayAsWeekend !== false
    );

    setCustomers(updated);
  };

  // Multi-fine support handlers for passport services (User requirement: امكانية اختيار اكثر من غرامة لنفس الشخص)
  const handleAddFineToService = (cIdx: number, sIdx: number, fineNameVal: string) => {
    if (!fineNameVal) return;
    const updated = [...customers];
    const item = updated[cIdx].services[sIdx];
    if (!Array.isArray(item.fines)) {
      item.fines = [];
      if (item.fineName || (item.fineAmount && item.fineAmount > 0)) {
        item.fines.push({ name: item.fineName || "غرامة حكومية", amount: item.fineAmount || 0 });
      }
    }

    if (fineNameVal === "__custom__") {
      item.fines.push({ name: "غرامة مخصصة", amount: 500 });
    } else {
      const found = governmentFines.find((f) => f.name === fineNameVal);
      item.fines.push({ name: fineNameVal, amount: found ? found.amount : 0 });
    }

    item.fineAmount = item.fines.reduce((sum, f) => sum + (f.amount || 0), 0);
    item.fineName = item.fines.map((f) => f.name).join(" + ");

    const matched = services.find((s) => s.id === item.serviceId || s.name === item.serviceId);
    if (matched) {
      item.price = (matched.govPrice + (item.fineAmount || 0) + matched.officeFee) * item.quantity;
    }
    setCustomers(updated);
  };

  const handleUpdateFineInService = (cIdx: number, sIdx: number, fIdx: number, patch: Partial<{ name: string; amount: number }>) => {
    const updated = [...customers];
    const item = updated[cIdx].services[sIdx];
    if (!Array.isArray(item.fines)) {
      item.fines = [];
      if (item.fineName || (item.fineAmount && item.fineAmount > 0)) {
        item.fines.push({ name: item.fineName || "غرامة حكومية", amount: item.fineAmount || 0 });
      }
    }
    if (item.fines[fIdx]) {
      item.fines[fIdx] = { ...item.fines[fIdx], ...patch };
      if (patch.amount !== undefined) {
        item.fines[fIdx].amount = Math.max(0, patch.amount);
      }
    }
    item.fineAmount = item.fines.reduce((sum, f) => sum + (f.amount || 0), 0);
    item.fineName = item.fines.map((f) => f.name).join(" + ");

    const matched = services.find((s) => s.id === item.serviceId || s.name === item.serviceId);
    if (matched) {
      item.price = (matched.govPrice + (item.fineAmount || 0) + matched.officeFee) * item.quantity;
    }
    setCustomers(updated);
  };

  const handleRemoveFineFromService = (cIdx: number, sIdx: number, fIdx: number) => {
    const updated = [...customers];
    const item = updated[cIdx].services[sIdx];
    if (Array.isArray(item.fines)) {
      item.fines = item.fines.filter((_, i) => i !== fIdx);
    }
    item.fineAmount = (item.fines || []).reduce((sum, f) => sum + (f.amount || 0), 0);
    item.fineName = (item.fines || []).map((f) => f.name).join(" + ");

    const matched = services.find((s) => s.id === item.serviceId || s.name === item.serviceId);
    if (matched) {
      item.price = (matched.govPrice + (item.fineAmount || 0) + matched.officeFee) * item.quantity;
    }
    setCustomers(updated);
  };

  const handleRemoveAllFines = (cIdx: number, sIdx: number) => {
    const updated = [...customers];
    const item = updated[cIdx].services[sIdx];
    item.fines = [];
    item.fineName = "";
    item.fineAmount = 0;
    const matched = services.find((s) => s.id === item.serviceId || s.name === item.serviceId);
    if (matched) {
      item.price = (matched.govPrice + matched.officeFee) * item.quantity;
    }
    setCustomers(updated);
  };

  const handleNationalIdChange = (cIdx: number, val: string) => {
    const updated = [...customers];
    const numeric = val.replace(/\D/g, "").substring(0, 14); // numeric and 14 chars max
    updated[cIdx].nationalId = numeric;
    
    // Automatically extract birth date
    if (numeric.length >= 7) {
      updated[cIdx].birthDate = calculateBirthDateFromNationalId(numeric);
    } else {
      updated[cIdx].birthDate = "";
    }
    setCustomers(updated);
  };

  const handlePhoneChange = (cIdx: number, val: string) => {
    const updated = [...customers];
    const numeric = val.replace(/\D/g, ""); // allow digits only
    updated[cIdx].phone = numeric;
    setCustomers(updated);
  };

  const handleProfessionChange = (cIdx: number, val: string) => {
    const updated = [...customers];
    // Limit to exactly 32 letters with spaces
    updated[cIdx].profession = val.substring(0, 32);
    setCustomers(updated);
  };

  // Perform dictionary lookup
  const handleTranslateName = (cIdx: number) => {
    const customer = customers[cIdx];
    if (!customer.arabicName.trim()) {
      alert("الرجاء إدخال الاسم العربي أولاً ليتم ترجمته بالقاموس.");
      return;
    }

    const breakdown = breakdownArabicName(customer.arabicName, dictionary);
    const updated = [...customers];
    if (breakdown.assembledEnglish) {
      updated[cIdx].englishName = breakdown.assembledEnglish;
    }
    setCustomers(updated);
  };

  const handleSaveMissingWord = async (cIdx: number, arWord: string, providedEn?: string) => {
    const enVal = (providedEn || missingWordInputs[arWord] || "").trim().toUpperCase();
    if (!enVal) {
      alert(`الرجاء إدخال ترجمة المقطع (${arWord}) بالإنجليزية أولاً.`);
      return;
    }
    setSavingWord(arWord);
    try {
      const updatedDict = await saveDictionaryWord(arWord, enVal);
      if (onDictionaryUpdated) {
        onDictionaryUpdated(updatedDict);
      }
      // Re-evaluate customer's full name with the updated dictionary
      const cust = customers[cIdx];
      const newBreakdown = breakdownArabicName(cust.arabicName, updatedDict);
      const updated = [...customers];
      if (newBreakdown.assembledEnglish) {
        updated[cIdx].englishName = newBreakdown.assembledEnglish;
      }
      setCustomers(updated);
      setMissingWordInputs(prev => {
        const next = { ...prev };
        delete next[arWord];
        return next;
      });
    } catch (err) {
      console.error(err);
      alert("حدث خطأ أثناء حفظ الاسم في القاموس وجوجل شيت.");
    } finally {
      setSavingWord(null);
    }
  };

  const addCustomer = () => {
    const newIdx = customers.length;
    setCustomers((prev) => [...prev, createEmptyCustomer()]);
    setTimeout(() => {
      const cardEl = document.getElementById(`invoice-customer-card-${newIdx}`);
      cardEl?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      const nameInput = document.getElementById(`customer-arabic-name-${newIdx}`) as HTMLInputElement | null;
      nameInput?.focus();
    }, 60);
  };

  const toggleCustomerCollapse = (cIdx: number) => {
    setCollapsedCustomers((prev) => ({ ...prev, [cIdx]: !prev[cIdx] }));
  };

  const removeCustomer = (cIdx: number) => {
    if (customers.length === 1) return;
    const custName = customers[cIdx]?.arabicName?.trim() || `العميل رقم (${cIdx + 1})`;
    const confirmed = window.confirm(`⚠️ تأكيد الحذف:\nهل أنت متأكد من حذف بيانات ${custName} من الفاتورة؟`);
    if (!confirmed) return;

    const updated = customers.filter((_, idx) => idx !== cIdx);
    setCustomers(updated);
    setCollapsedCustomers({});
  };

  const addServiceToCustomer = (cIdx: number) => {
    const updated = [...customers];
    updated[cIdx].services.push({
      serviceId: "",
      quantity: 1,
      price: 0,
      deliveryDate: ""
    });
    setCustomers(updated);
  };

  const removeServiceFromCustomer = (cIdx: number, sIdx: number) => {
    const updated = [...customers];
    if (updated[cIdx].services.length === 1) return;
    const srvId = updated[cIdx].services[sIdx]?.serviceId;
    const matched = services.find(s => s.id === srvId || s.name === srvId);
    const srvTitle = matched?.name || srvId || "هذه الخدمة";
    const confirmed = window.confirm(`⚠️ تأكيد الحذف:\nهل أنت متأكد من إزالة خدمة "${srvTitle}" من طلبات هذا العميل؟`);
    if (!confirmed) return;

    updated[cIdx].services = updated[cIdx].services.filter((_, idx) => idx !== sIdx);
    
    // Recalculate remaining services sequentially
    const customHolidays = settings.customHolidays || [];
    updated[cIdx].services = recalculateCustomerServicesDeliveryDates(
      updated[cIdx].services,
      new Date(),
      services,
      customHolidays,
      settings.includeSaturdayAsWeekend !== false
    );

    setCustomers(updated);
  };

  // Form Validation
  const validateForm = (): boolean => {
    const newErrors: { [key: string]: string } = {};
    let isValid = true;

    customers.forEach((cust, cIdx) => {
      if (!cust.arabicName.trim()) {
        newErrors[`c-${cIdx}-arabicName`] = "الاسم العربي إلزامي للعميل.";
        isValid = false;
      }

      // Check phone
      if (!cust.phone.trim()) {
        newErrors[`c-${cIdx}-phone`] = "رقم الهاتف إلزامي للتواصل وإرسال الإشعارات.";
        isValid = false;
      } else {
        if (cust.phone.startsWith("01")) {
          if (cust.phone.length !== 11) {
            newErrors[`c-${cIdx}-phone`] = "رقم الهاتف المصري يبدأ بـ 01 ويجب أن يتكون من 11 رقماً.";
            isValid = false;
          }
        }
      }

      // Check passport service flags
      const isPass = isPassportRelated(cust);
      if (isPass) {
        if (cust.englishNameOption !== "previous") {
          const breakdown = breakdownArabicName(cust.arabicName, dictionary);
          if (!cust.englishName.trim() || !breakdown.allFound) {
            newErrors[`c-${cIdx}-englishName`] = "من فضلك تأكد من ترجمة الاسم بالإنجليزي قبل مغادرة المكتب";
            isValid = false;
          }
        }
        if (!cust.nationalId.trim()) {
          newErrors[`c-${cIdx}-nationalId`] = "الرقم القومي إلزامي لخدمات الجوازات.";
          isValid = false;
        } else if (cust.nationalId.length !== 14) {
          newErrors[`c-${cIdx}-nationalId`] = "الرقم القومي يجب أن يتكون من 14 رقماً بالكامل.";
          isValid = false;
        }
        if (!cust.profession.trim()) {
          newErrors[`c-${cIdx}-profession`] = "المهنة إلزامية لخدمات الجوازات لتسجيل المعاملة.";
          isValid = false;
        }
        if (!cust.applicantCapacity || !cust.applicantCapacity.trim()) {
          newErrors[`c-${cIdx}-applicantCapacity`] = "يرجى تحديد صفة مقدم الطلب (بنفسه، الأب، الأم، الزوج...).";
          isValid = false;
        }
      }

      // Services validation
      cust.services.forEach((srv, sIdx) => {
        if (!srv.serviceId) {
          newErrors[`c-${cIdx}-s-${sIdx}-id`] = "يجب اختيار خدمة صالحة.";
          isValid = false;
        }
      });
    });

    setErrors(newErrors);
    return isValid;
  };

  // Submit invoice to database (protected against accidental double-clicks)
  const handleSubmitInvoice = async (e: React.FormEvent) => {
    e.preventDefault();

    // Prevent double clicking, dual submission, or rapid re-triggering
    const now = Date.now();
    if (isSubmittingRef.current || loading || now - lastSubmitTimeRef.current < 2000) {
      console.warn("Duplicate invoice submission attempt blocked.");
      return;
    }

    if (!validateForm()) {
      // scroll to errors
      const firstError = Object.keys(errors)[0];
      if (firstError) {
        document.getElementsByName(firstError)?.[0]?.focus();
      }
      return;
    }

    isSubmittingRef.current = true;
    lastSubmitTimeRef.current = now;
    setLoading(true);

    try {
      // User explicit requirement:
      // "عند عمل فواتير خاصة بالجوازات عايز امكانية التعديل فى الاسم المعروض بالانجليزى الذى يتم جلبة من القاموس دون ان يتم حفظة فى قاعدة البيانات حيث ان هذا التعديل بيكون مؤقت فقط خاص لهذا العميل وليس بوجة عام لجميع المواطنين"
      // Custom English name modifications stay strictly on this invoice and are NOT auto-saved to the global dictionary.

      // Calculate totals
      let totalGov = 0;
      let totalOffice = 0;
      let totalAmount = 0;

      const formattedCustomers = customers.map(cust => {
        const isPass = isPassportRelated(cust);
        
        // Recalculate sequential delivery dates right here to guarantee exact accuracy:
        // Service 2 starts after Service 1 completes, Service 3 after Service 2, etc.
        const customHolidays = settings.customHolidays || [];
        const seqServices = recalculateCustomerServicesDeliveryDates(
          cust.services,
          new Date(),
          services,
          customHolidays,
          settings.includeSaturdayAsWeekend !== false
        );

        // Prepare services with resolved names
        const formattedServices = seqServices.map(s => {
          const matched = services.find(srv => srv.id === s.serviceId || srv.name === s.serviceId);
          const serviceName = matched ? matched.name : s.serviceId;
          
          if (matched) {
            const fine = s.fineAmount || 0;
            totalGov += (matched.govPrice + fine) * s.quantity;
            totalOffice += matched.officeFee * s.quantity;
            totalAmount += (matched.govPrice + fine + matched.officeFee) * s.quantity;
          }

          return {
            serviceId: serviceName, // save full name for printing/archiving
            quantity: s.quantity,
            price: s.price,
            deliveryDate: s.deliveryDate,
            fineName: s.fineName,
            fineAmount: s.fineAmount
          };
        });

        return {
          arabicName: cust.arabicName.trim(),
          englishName: isPass ? (cust.englishNameOption === "previous" ? "نفس ترجمة الجواز السابق" : cust.englishName.trim().toUpperCase()) : "",
          englishNameOption: cust.englishNameOption,
          nationalId: isPass ? cust.nationalId : "",
          birthDate: isPass ? cust.birthDate : "",
          phone: cust.phone,
          profession: isPass ? cust.profession.trim() : "",
          applicantCapacity: isPass ? (cust.applicantCapacity?.trim() || "") : "",
          services: formattedServices
        };
      });

      const cleanDate = new Date().toString()
        .replace(/\s*GMT[+-]\d+.*$/i, "")
        .replace(/\s*\([^)]*\)$/i, "")
        .trim();

      const invoiceData: Partial<Invoice> = {
        status: InvoiceStatus.NEW,
        employeeName: activeEmployee.name,
        customers: formattedCustomers,
        totalGov,
        totalOffice,
        totalAmount,
        date: cleanDate
      };

      const created = await createInvoiceOnServer(invoiceData);
      
      onInvoiceCreated(created);
      setLastCreatedInvoice(created);
      setPrintInvoice(created);
      setCreatedInvoiceId(created.invoiceId);
      setShowSuccessToast(true);

      // Clear Form
      setCustomers([createEmptyCustomer()]);
      setCollapsedCustomers({});
      setErrors({});
    } catch (err) {
      console.error(err);
      alert("حدث خطأ أثناء حفظ الفاتورة بالخادم، يرجى المحاولة لاحقاً.");
    } finally {
      setLoading(false);
      // Keep safety lock active for 1.5 seconds after saving to absorb rapid clicks
      setTimeout(() => {
        isSubmittingRef.current = false;
      }, 1500);
    }
  };

  // Automatically trigger dictionary lookup on Arabic Name change or blur if Passport related
  const handleArabicNameChange = (cIdx: number, val: string) => {
    const updated = [...customers];
    updated[cIdx].arabicName = val;
    
    // Auto instant lookup if name matches dictionary and translation option is active
    if (updated[cIdx].englishNameOption !== "previous" && val.trim().length >= 2) {
      const breakdown = breakdownArabicName(val, dictionary);
      if (breakdown.assembledEnglish) {
        updated[cIdx].englishName = breakdown.assembledEnglish;
      }
    }
    setCustomers(updated);
  };

  const handleArabicNameBlur = (cIdx: number) => {
    const cust = customers[cIdx];
    const isPass = isPassportRelated(cust);
    if (isPass && cust.arabicName.trim() && cust.englishNameOption !== "previous") {
      const breakdown = breakdownArabicName(cust.arabicName, dictionary);
      if (breakdown.assembledEnglish) {
        const updated = [...customers];
        updated[cIdx].englishName = breakdown.assembledEnglish;
        setCustomers(updated);
      }
    }
  };

  const lastWhatsAppDispatchTime = useRef<number>(0);

  // Mojeeb WhatsApp API welcome message dispatcher (deduplicated, single-dispatch, and debounced)
  const handleSendWhatsAppWelcome = async (inv: Invoice) => {
    if (!inv || sendingWhatsApp) return;

    // Prevent accidental double clicks
    const now = Date.now();
    if (now - lastWhatsAppDispatchTime.current < 2000) {
      return;
    }
    lastWhatsAppDispatchTime.current = now;

    const targetCustomer = inv.customers.find(c => c.phone && c.phone.trim().length > 0) || inv.customers[0];
    const rawPhone = targetCustomer?.phone ? targetCustomer.phone.trim() : "";
    if (!rawPhone) {
      setWhatsappNotice({
        type: "error",
        text: "رقم هاتف العميل غير متوفر في هذه الفاتورة لإرسال رسالة الواتساب."
      });
      return;
    }

    const formattedMessage = generateWhatsAppWelcomeMessage(inv, services, settings);
    const templateVars = buildInvoiceTemplateVariables(inv, services, settings, {
      fullMessage: formattedMessage,
    });
    setSendingWhatsApp(true);
    setWhatsappNotice(null);

    try {
      const result = await dispatchWhatsAppViaMojeebSmart({
        scenario: "welcome",
        settings,
        to: rawPhone,
        freeTextBody: formattedMessage,
        variables: templateVars,
        idempotencyKey: `welcome-${inv.invoiceId}-${Math.floor(Date.now() / 10000)}`
      });

      if (!result.success) {
        setWhatsappNotice({
          type: "error",
          text: result.error || "تعذر إرسال رسالة الواتساب عبر مجيب API."
        });
        return;
      }

      const msgIdText = result.data?.id ? ` (مرجع: ${result.data.id})` : "";
      const modeLabel = result.dispatchMode === "template"
        ? `قالب معتمد "${result.templateName}"`
        : "رسالة نصية حرة";
      setWhatsappNotice({
        type: "success",
        text: `تم إدراج رسالة الواتساب الترحيبية للفاتورة #${inv.invoiceId} (${modeLabel}) في طابور الإرسال عبر مجيب API بنجاح${msgIdText}.`
      });
    } finally {
      setSendingWhatsApp(false);
    }
  };

  // Precomputed live invoice totals for the horizontal footer bar
  const liveTotals = useMemo(() => {
    let govWithFines = 0;
    let office = 0;
    let grand = 0;
    let totalServicesCount = 0;

    customers.forEach((c) => {
      c.services.forEach((s) => {
        totalServicesCount += 1;
        const matched = services.find((srv) => srv.id === s.serviceId || srv.name === s.serviceId);
        if (matched) {
          govWithFines += (matched.govPrice + (s.fineAmount || 0)) * s.quantity;
          office += matched.officeFee * s.quantity;
        }
        grand += s.price || 0;
      });
    });

    return { govWithFines, office, grand, totalServicesCount };
  }, [customers, services]);

  return (
    <div dir="rtl" className="space-y-3 font-cairo">
      
      {/* LARGE Attention-Grabbing Language Mismatch Alert Banner */}
      {activeLanguageMismatch && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-50 w-[95%] max-w-2xl bg-amber-500 border-4 border-amber-700 text-slate-950 rounded-3xl p-5 sm:p-6 shadow-2xl animate-bounce font-cairo">
          <div className="flex items-start gap-4">
            <div className="p-3.5 bg-amber-700 text-white rounded-2xl shrink-0 shadow-lg">
              <AlertTriangle className="w-9 h-9 sm:w-11 sm:h-11 animate-pulse" />
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-xl sm:text-2xl font-black text-slate-950">
                  ⚠️ تنبيه لفت نظر: لغة لوحة المفاتيح غير صحيحة!
                </h3>
                <span className="flex items-center gap-1.5 bg-amber-950 text-amber-200 text-xs font-black px-3 py-1.5 rounded-xl shadow-xs shrink-0">
                  <Volume2 className="w-4 h-4 text-amber-400 animate-pulse" />
                  <span>صوت تنبيه</span>
                </span>
              </div>
              <p className="text-sm sm:text-base font-extrabold text-amber-950 mt-2 leading-relaxed">
                أنت تكتب الآن باللغة <span className="underline decoration-2 decoration-red-700 font-black">{activeLanguageMismatch.wrongLang}</span> داخل خانة (
                <strong>{activeLanguageMismatch.fieldName}</strong> للعميل #{activeLanguageMismatch.customerIndex}) والمطلوب كتابتها باللغة <span className="underline decoration-2 decoration-emerald-800 font-black">{activeLanguageMismatch.expectedLang}</span>!
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2.5 bg-amber-600/35 p-3 rounded-2xl border border-amber-600/50">
                <span className="text-xs sm:text-sm font-black text-slate-950">
                  اضغط الآن على اختصار لوحة المفاتيح:
                </span>
                <div className="flex items-center gap-1.5 font-mono font-black text-xs sm:text-sm">
                  <kbd className="px-3 py-1 bg-white text-slate-900 rounded-xl shadow-md border border-slate-300 text-sm font-bold">Alt</kbd>
                  <span className="text-slate-900 font-black">+</span>
                  <kbd className="px-3 py-1 bg-white text-slate-900 rounded-xl shadow-md border border-slate-300 text-sm font-bold">Shift</kbd>
                </div>
                <span className="text-xs sm:text-sm font-black text-amber-950 bg-amber-400/90 px-3 py-1 rounded-xl">
                  ⬅️ {activeLanguageMismatch.keyHint}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Compact Unified Workspace Top Bar (Title + Employee + Quick OCR/Prospects + Quick Add Family Member) */}
      <div className="bg-slate-900 text-white rounded-2xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 shadow-xs">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 min-w-0">
          <h2 className="text-sm sm:text-base font-extrabold text-white whitespace-nowrap">
            شاشة تنفيذ الفاتورة
          </h2>
          <span className="text-slate-600 hidden sm:inline" aria-hidden="true">|</span>
          <span className="text-xs text-slate-300 font-semibold whitespace-nowrap">
            الموظف: <strong className="text-amber-400">{activeEmployee.name}</strong>
          </span>
          <span className="text-slate-600 hidden md:inline" aria-hidden="true">·</span>
          <span className="text-[11px] text-slate-400 hidden xl:inline">
            يمين: بيانات العميل والترجمة — يسار: الخدمات المطلوبة
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => {
              setSelectedProspectIds([]);
              setProspectSearchTerm("");
              setIsSelectProspectModalOpen(true);
            }}
            className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <CheckSquare className="w-3.5 h-3.5 text-emerald-300" />
            <span>
              العملاء المحتملين{potentialCustomers.length > 0 ? ` (${potentialCustomers.length})` : ""}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setIsScannerOpen(true)}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <Camera className="w-3.5 h-3.5 text-indigo-300" />
            <span>مسح بطاقة / شهادة ميلاد</span>
          </button>

          <button
            type="button"
            onClick={addCustomer}
            className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0"
            title="إضافة فرد أسرة جديد لنفس الفاتورة"
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>+ فرد أسرة</span>
          </button>
        </div>
      </div>

      {/* Mojeeb WhatsApp Dispatch Status Banner */}
      {whatsappNotice && (
        <div
          className={`rounded-xl px-4 py-2.5 border flex items-start justify-between gap-3 shadow-xs font-cairo ${
            whatsappNotice.type === "success"
              ? "bg-emerald-50 border-emerald-200 text-emerald-900"
              : "bg-rose-50 border-rose-200 text-rose-900"
          }`}
        >
          <div className="flex items-start gap-2.5 text-xs font-bold leading-relaxed">
            {whatsappNotice.type === "success" ? (
              <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            )}
            <span>{whatsappNotice.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setWhatsappNotice(null)}
            className="p-1 rounded-lg hover:bg-black/5 text-current shrink-0 cursor-pointer"
            aria-label="إغلاق التنبيه"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Success Notification */}
      {showSuccessToast && createdInvoiceId && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 flex flex-col md:flex-row items-center justify-between gap-3 shadow-xs animate-fade-in-up">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-500 rounded-lg text-white shrink-0">
              <Check className="w-4 h-4" />
            </div>
            <div>
              <h4 className="font-bold text-slate-900 font-cairo text-xs sm:text-sm">تم إنشاء الفاتورة وتسجيلها مباشرة على جوجل شيت!</h4>
              <p className="text-xs text-slate-600 mt-0.5">رقم الفاتورة: <span className="font-bold font-mono tabular-nums">#{createdInvoiceId}</span></p>
            </div>
          </div>
          <div className="flex items-center gap-2 w-full md:w-auto">
            <button 
              type="button"
              disabled={sendingWhatsApp}
              onClick={() => {
                const targetInv = lastCreatedInvoice || printInvoice;
                if (targetInv) {
                  handleSendWhatsAppWelcome(targetInv);
                } else {
                  setWhatsappNotice({
                    type: "error",
                    text: "لم يتم العثور على بيانات الفاتورة لإرسال رسالة الواتساب."
                  });
                }
              }}
              className="flex-1 md:flex-initial bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed text-white font-bold font-cairo text-xs px-3.5 py-2 rounded-lg flex items-center justify-center gap-1.5 transition-colors shadow-xs cursor-pointer whitespace-nowrap"
              title="إرسال رسالة ترحيبية للعميل مباشرة عبر Mojeeb WhatsApp API"
            >
              {sendingWhatsApp ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  جاري الإرسال...
                </>
              ) : (
                <>
                  <Send className="w-3.5 h-3.5" />
                  رسالة واتس ترحيبية (API)
                </>
              )}
            </button>
            <button 
              type="button"
              onClick={() => {
                const targetInv = lastCreatedInvoice || printInvoice;
                if (targetInv) {
                  setPrintInvoice(targetInv);
                } else {
                  alert("لم يتم العثور على بيانات الفاتورة لإعادة الطباعة.");
                }
              }}
              className="flex-1 md:flex-initial bg-slate-900 hover:bg-slate-800 text-white font-bold font-cairo text-xs px-3.5 py-2 rounded-lg flex items-center justify-center gap-1.5 transition-colors shadow-xs cursor-pointer whitespace-nowrap"
            >
              <Printer className="w-3.5 h-3.5" />
              إعادة طباعة إيصال 8سم
            </button>
            <button 
              type="button"
              onClick={() => {
                setShowSuccessToast(false);
                setCreatedInvoiceId(null);
                setLastCreatedInvoice(null);
              }}
              className="px-2.5 py-1.5 text-slate-500 hover:text-slate-800 font-bold text-xs cursor-pointer whitespace-nowrap"
            >
              تجاهل
            </button>
          </div>
        </div>
      )}

      {/* Invoice Form */}
      <form onSubmit={handleSubmitInvoice} className="space-y-3">

        {/* Compact Color-Coded Navigator Bar when invoice has multiple customers */}
        {customers.length > 1 && (
          <div className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 flex flex-wrap items-center justify-between gap-2 font-cairo">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-bold text-slate-600 ml-1 flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-slate-500" />
                <span>أفراد الفاتورة ({customers.length}):</span>
              </span>
              {customers.map((c, idx) => {
                const t = getCustomerTheme(idx);
                const cTotal = c.services.reduce((sum, s) => sum + (s.price || 0), 0);
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      setCollapsedCustomers((prev) => ({ ...prev, [idx]: false }));
                      setTimeout(() => {
                        document.getElementById(`invoice-customer-card-${idx}`)?.scrollIntoView({
                          behavior: "smooth",
                          block: "nearest",
                        });
                      }, 30);
                    }}
                    className={`px-2.5 py-1 rounded-lg border text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${t.navChipActive}`}
                  >
                    <span className={`w-4.5 h-4.5 rounded-full text-[10px] font-mono font-black flex items-center justify-center ${t.badgeBg}`}>
                      {idx + 1}
                    </span>
                    <span className="max-w-[130px] truncate">{c.arabicName?.trim() || `العميل ${getArabicOrdinalLabel(idx)}`}</span>
                    <span className="text-[10px] opacity-80 font-mono tabular-nums">
                      ({c.services.length} · {cTotal.toFixed(0)} ج.م)
                    </span>
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={() => {
                const anyExpanded = customers.some((_, idx) => !collapsedCustomers[idx]);
                const nextState: Record<number, boolean> = {};
                customers.forEach((_, idx) => {
                  nextState[idx] = anyExpanded;
                });
                setCollapsedCustomers(nextState);
              }}
              className="text-[11px] font-bold text-slate-600 hover:text-slate-900 px-2 py-1 rounded-lg hover:bg-slate-200/70 transition-colors cursor-pointer whitespace-nowrap"
            >
              {customers.some((_, idx) => !collapsedCustomers[idx]) ? "طي الكل" : "توسيع الكل"}
            </button>
          </div>
        )}

        {/* Horizontal Widescreen Customer Cards */}
        <div className="space-y-3">
          {customers.map((customer, cIdx) => {
            const isPass = isPassportRelated(customer);
            const theme = getCustomerTheme(cIdx);
            const customerTotal = customer.services.reduce((sum, s) => sum + (s.price || 0), 0);
            const customerOrdinal = getArabicOrdinalLabel(cIdx);
            const isCollapsed = customers.length > 1 && Boolean(collapsedCustomers[cIdx]);

            return (
              <div
                key={cIdx}
                id={`invoice-customer-card-${cIdx}`}
                className={`bg-white rounded-2xl shadow-sm overflow-hidden relative transition-all ${theme.cardBorder}`}
              >
                {/* Compact Customer Header Strip */}
                <div className={`px-4 py-2 flex flex-wrap justify-between items-center gap-2 ${theme.headerBg}`}>
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className={`w-6 h-6 rounded-lg text-xs font-black font-mono flex items-center justify-center shrink-0 ${theme.badgeBg}`}>
                      {cIdx + 1}
                    </span>
                    <div className="flex flex-wrap items-center gap-2 min-w-0 text-xs">
                      <h3 className={`font-extrabold whitespace-nowrap ${theme.titleText}`}>
                        العميل {customerOrdinal}
                      </h3>
                      {customer.arabicName?.trim() && (
                        <>
                          <span className="text-slate-400" aria-hidden="true">·</span>
                          <span className="font-bold text-slate-900 truncate max-w-[220px]">
                            {customer.arabicName.trim()}
                          </span>
                        </>
                      )}
                      {customer.phone?.trim() && isCollapsed && (
                        <>
                          <span className="text-slate-400" aria-hidden="true">·</span>
                          <span className="font-mono text-[11px] text-slate-600 tabular-nums">
                            {customer.phone}
                          </span>
                        </>
                      )}
                      {isPass && (
                        <>
                          <span className="text-slate-400" aria-hidden="true">·</span>
                          <span className="text-[11px] font-bold text-blue-700 whitespace-nowrap">
                            جوازات (#)
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5 shrink-0 text-xs">
                    <span className="text-slate-600 font-semibold whitespace-nowrap">
                      {customer.services.length} {customer.services.length === 1 ? "خدمة" : "خدمات"}
                    </span>
                    <span className="text-slate-300" aria-hidden="true">|</span>
                    <span className="font-mono font-black text-slate-900 tabular-nums whitespace-nowrap">
                      {customerTotal.toFixed(0)} ج.م
                    </span>

                    {customers.length > 1 && (
                      <>
                        <button
                          type="button"
                          onClick={() => toggleCustomerCollapse(cIdx)}
                          className="px-2 py-1 bg-white/90 border border-slate-200 text-slate-700 hover:bg-slate-100 rounded-lg transition-colors text-[11px] font-bold flex items-center gap-1 cursor-pointer whitespace-nowrap"
                          title={isCollapsed ? "توسيع بيانات هذا العميل" : "طي بيانات هذا العميل لتوفير مساحة"}
                        >
                          {isCollapsed ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
                          <span>{isCollapsed ? "توسيع" : "طي"}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => removeCustomer(cIdx)}
                          className="px-2 py-1 bg-white/90 border border-rose-200 text-rose-600 hover:bg-rose-50 hover:text-rose-700 rounded-lg transition-colors text-[11px] font-bold flex items-center gap-1 cursor-pointer whitespace-nowrap"
                          title={`حذف العميل ${customerOrdinal}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>حذف</span>
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Widescreen 2-Column Split Body (RTL: First col = RIGHT Customer/Translation, Second col = LEFT Services) */}
                {!isCollapsed && (
                  <div className="grid grid-cols-1 lg:grid-cols-12 items-stretch divide-y lg:divide-y-0 lg:divide-x lg:divide-x-reverse divide-slate-200">
                    
                    {/* =================================================================== */}
                    {/* RIGHT COLUMN: Customer Info, Phone, Passport Data & Name Translation */}
                    {/* =================================================================== */}
                    <div className="lg:col-span-6 p-3.5 space-y-2.5 bg-white min-w-0">
                      <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                        <span className="text-[11px] font-extrabold text-slate-700">
                          بيانات العميل{isPass ? " والاستمارة والترجمة" : ""}
                        </span>
                        {isPass && (
                          <span className="text-[10px] font-bold text-blue-700 flex items-center gap-1">
                            <Sparkles className="w-3 h-3" />
                            <span>حقول الجوازات مفعّلة</span>
                          </span>
                        )}
                      </div>

                      {/* Row 1: Arabic Name & Phone side by side */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <div className="space-y-1">
                          <label htmlFor={`customer-arabic-name-${cIdx}`} className="text-[11px] font-bold text-slate-700 flex items-center gap-1">
                            <span>الاسم العربي</span>
                            <span className="text-rose-500 font-mono">*</span>
                          </label>
                          <input
                            id={`customer-arabic-name-${cIdx}`}
                            name={`c-${cIdx}-arabicName`}
                            type="text"
                            value={customer.arabicName}
                            onChange={(e) => handleArabicNameChange(cIdx, e.target.value)}
                            onBlur={() => handleArabicNameBlur(cIdx)}
                            placeholder="مثال: أحمد محمد علي"
                            className={`w-full bg-slate-50 border rounded-lg px-3 py-2 text-xs font-semibold focus:outline-hidden focus:ring-2 transition-all ${
                              errors[`c-${cIdx}-arabicName`]
                                ? "border-rose-400 focus:ring-rose-200 text-rose-900 bg-rose-50/20"
                                : "border-slate-200 focus:border-red-500 focus:bg-white focus:ring-red-100"
                            }`}
                            required
                          />
                          {/[a-zA-Z]/.test(customer.arabicName) && (
                            <div className="bg-amber-100 border border-amber-300 text-amber-950 px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1.5 animate-pulse">
                              <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                              <span>حروف إنجليزية في الاسم العربي! اضغط (Alt + Shift)</span>
                            </div>
                          )}
                          {errors[`c-${cIdx}-arabicName`] && (
                            <p className="text-[10px] text-rose-600 flex items-center gap-1">
                              <AlertCircle className="w-3 h-3 shrink-0" />
                              <span>{errors[`c-${cIdx}-arabicName`]}</span>
                            </p>
                          )}
                        </div>

                        <div className="space-y-1">
                          <label className="text-[11px] font-bold text-slate-700 flex justify-between items-center">
                            <span>رقم الهاتف <span className="text-rose-500 font-mono">*</span></span>
                            <span className={`text-[10px] font-mono tabular-nums ${customer.phone.length === 11 ? "text-emerald-600 font-bold" : "text-slate-400"}`}>
                              {customer.phone.length}/11
                            </span>
                          </label>
                          <input
                            name={`c-${cIdx}-phone`}
                            type="text"
                            value={customer.phone}
                            onChange={(e) => handlePhoneChange(cIdx, e.target.value)}
                            placeholder="01XXXXXXXXX"
                            dir="ltr"
                            className={`w-full bg-slate-50 border rounded-lg px-3 py-2 text-xs font-mono font-bold text-right focus:outline-hidden focus:ring-2 transition-all ${
                              errors[`c-${cIdx}-phone`]
                                ? "border-rose-400 focus:ring-rose-200 text-rose-900 bg-rose-50/20"
                                : "border-slate-200 focus:border-red-500 focus:bg-white focus:ring-red-100"
                            }`}
                            required
                          />
                          {errors[`c-${cIdx}-phone`] && (
                            <p className="text-[10px] text-rose-600 flex items-center gap-1">
                              <AlertCircle className="w-3 h-3 shrink-0" />
                              <span>{errors[`c-${cIdx}-phone`]}</span>
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Passport & Translation Fields (visible conditionally when any service starts with # or ##) */}
                      {isPass && (
                        <div className="pt-2.5 border-t border-blue-100 bg-blue-50/35 -mx-3.5 px-3.5 pb-2 space-y-2.5 animate-fade-in">
                          {/* Compact 2x2 Grid: National ID, Birth Date, Profession, Applicant Capacity */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                            {/* National ID */}
                            <div className="space-y-1">
                              <label className="text-[11px] font-bold text-slate-700 flex justify-between items-center">
                                <span>الرقم القومي <span className="text-rose-500">*</span></span>
                                <span className={`text-[10px] font-mono tabular-nums ${customer.nationalId.length === 14 ? "text-emerald-600 font-bold" : "text-slate-400"}`}>
                                  {customer.nationalId.length}/14
                                </span>
                              </label>
                              <input
                                name={`c-${cIdx}-nationalId`}
                                type="text"
                                value={customer.nationalId}
                                onChange={(e) => handleNationalIdChange(cIdx, e.target.value)}
                                placeholder="14 رقماً"
                                dir="ltr"
                                className={`w-full bg-white border rounded-lg px-2.5 py-1.5 text-xs font-mono font-bold text-right focus:outline-hidden focus:ring-2 focus:ring-blue-100 focus:border-blue-400 ${
                                  errors[`c-${cIdx}-nationalId`] ? "border-rose-400 bg-rose-50/20" : "border-slate-200"
                                }`}
                              />
                              {errors[`c-${cIdx}-nationalId`] && (
                                <p className="text-[10px] text-rose-600 flex items-center gap-1">
                                  <AlertCircle className="w-3 h-3 shrink-0" />
                                  <span>{errors[`c-${cIdx}-nationalId`]}</span>
                                </p>
                              )}
                            </div>

                            {/* Birth Date */}
                            <div className="space-y-1">
                              <label className="text-[11px] font-bold text-slate-700 flex items-center justify-between">
                                <span>تاريخ الميلاد</span>
                                <span className="text-[10px] text-slate-400 font-normal">تلقائي</span>
                              </label>
                              <input
                                type="text"
                                value={customer.birthDate}
                                onChange={(e) => {
                                  const updated = [...customers];
                                  updated[cIdx].birthDate = e.target.value;
                                  setCustomers(updated);
                                }}
                                placeholder="YYYY/MM/DD"
                                dir="ltr"
                                className="w-full bg-white border border-slate-200 text-slate-800 rounded-lg px-2.5 py-1.5 text-xs font-mono font-bold text-right focus:outline-hidden focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                              />
                            </div>

                            {/* Profession */}
                            <div className="space-y-1">
                              <label className="text-[11px] font-bold text-slate-700 flex justify-between items-center">
                                <span>المهنة بالبطاقة <span className="text-rose-500">*</span></span>
                                <span className={`text-[10px] font-mono tabular-nums ${customer.profession.length >= 32 ? "text-rose-500 font-bold" : "text-slate-400"}`}>
                                  {customer.profession.length}/32
                                </span>
                              </label>
                              <input
                                name={`c-${cIdx}-profession`}
                                type="text"
                                value={customer.profession}
                                onChange={(e) => {
                                  if (/[a-zA-Z]/.test(e.target.value)) {
                                    playLanguageWarningSound();
                                  }
                                  handleProfessionChange(cIdx, e.target.value);
                                }}
                                maxLength={32}
                                placeholder="المهنة (أقصى 32 حرف)"
                                className={`w-full bg-white border rounded-lg px-2.5 py-1.5 text-xs focus:outline-hidden transition-all ${
                                  /[a-zA-Z]/.test(customer.profession)
                                    ? "border-amber-500 ring-2 ring-amber-300 bg-amber-50/40 text-amber-950 font-bold"
                                    : errors[`c-${cIdx}-profession`]
                                      ? "border-rose-400 bg-rose-50/20"
                                      : "border-slate-200 focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                                }`}
                              />
                              {/[a-zA-Z]/.test(customer.profession) && (
                                <p className="text-[10px] text-amber-800 font-bold">
                                  ⚠️ حروف إنجليزية بالمهنة! حوّل للعربية (Alt + Shift)
                                </p>
                              )}
                              {errors[`c-${cIdx}-profession`] && (
                                <p className="text-[10px] text-rose-600 flex items-center gap-1">
                                  <AlertCircle className="w-3 h-3 shrink-0" />
                                  <span>{errors[`c-${cIdx}-profession`]}</span>
                                </p>
                              )}
                            </div>

                            {/* Applicant Capacity */}
                            <div className="space-y-1">
                              <label className="text-[11px] font-bold text-slate-700 flex justify-between items-center">
                                <span>صفة مقدم الطلب <span className="text-rose-500">*</span></span>
                                <span className={`text-[10px] font-bold ${customer.applicantCapacity ? "text-emerald-700" : "text-amber-700"}`}>
                                  {customer.applicantCapacity ? "محدد ✓" : "مطلوب"}
                                </span>
                              </label>
                              <select
                                name={`c-${cIdx}-applicantCapacity`}
                                value={customer.applicantCapacity || ""}
                                onChange={(e) => {
                                  const updated = [...customers];
                                  updated[cIdx].applicantCapacity = e.target.value;
                                  setCustomers(updated);
                                  if (errors[`c-${cIdx}-applicantCapacity`]) {
                                    const errs = { ...errors };
                                    delete errs[`c-${cIdx}-applicantCapacity`];
                                    setErrors(errs);
                                  }
                                }}
                                className={`w-full border rounded-lg px-2.5 py-1.5 text-xs font-bold focus:outline-hidden cursor-pointer transition-all ${
                                  errors[`c-${cIdx}-applicantCapacity`]
                                    ? "border-rose-400 bg-rose-50/40 text-rose-900 ring-2 ring-rose-200"
                                    : !customer.applicantCapacity
                                      ? "border-amber-400 bg-amber-50/60 text-amber-950"
                                      : "bg-white border-slate-200 text-slate-800"
                                }`}
                              >
                                <option value="" disabled className="text-slate-400 font-normal">
                                  -- اختر الصفة (إلزامي) --
                                </option>
                                {applicantCapacityOptions.map((opt) => (
                                  <option key={opt} value={opt} className="text-slate-900 font-bold">
                                    {opt}
                                  </option>
                                ))}
                              </select>
                              {errors[`c-${cIdx}-applicantCapacity`] && (
                                <p className="text-[10px] text-rose-600 flex items-center gap-1">
                                  <AlertCircle className="w-3 h-3 shrink-0" />
                                  <span>{errors[`c-${cIdx}-applicantCapacity`]}</span>
                                </p>
                              )}
                            </div>
                          </div>

                          {/* English Name & Dictionary Translation Panel */}
                          <div className="pt-2 border-t border-blue-200/70 space-y-2">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <label className="text-[11px] font-bold text-slate-800 flex items-center gap-1">
                                <BookOpen className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                                <span>الاسم بالإنجليزية <span className="text-rose-500">*</span></span>
                              </label>

                              <div className="flex items-center gap-3 text-[11px] text-slate-700 font-semibold">
                                <label className="flex items-center gap-1 cursor-pointer hover:text-blue-700">
                                  <input
                                    type="radio"
                                    name={`c-${cIdx}-eng-opt`}
                                    checked={customer.englishNameOption !== "previous"}
                                    onChange={() => {
                                      const updated = [...customers];
                                      updated[cIdx].englishNameOption = "dictionary";
                                      const breakdown = breakdownArabicName(customer.arabicName, dictionary);
                                      if (breakdown.assembledEnglish) {
                                        updated[cIdx].englishName = breakdown.assembledEnglish;
                                      }
                                      setCustomers(updated);
                                    }}
                                    className="w-3.5 h-3.5 text-blue-600 focus:ring-0 cursor-pointer"
                                  />
                                  <span>القاموس المعتمد</span>
                                </label>
                                <label className="flex items-center gap-1 cursor-pointer hover:text-blue-700">
                                  <input
                                    type="radio"
                                    name={`c-${cIdx}-eng-opt`}
                                    checked={customer.englishNameOption === "previous"}
                                    onChange={() => {
                                      const updated = [...customers];
                                      updated[cIdx].englishNameOption = "previous";
                                      updated[cIdx].englishName = "نفس ترجمة الجواز السابق";
                                      setCustomers(updated);
                                    }}
                                    className="w-3.5 h-3.5 text-blue-600 focus:ring-0 cursor-pointer"
                                  />
                                  <span>نفس الجواز السابق</span>
                                </label>
                              </div>
                            </div>

                            <div className="flex items-center gap-1.5">
                              <input
                                name={`c-${cIdx}-englishName`}
                                type="text"
                                value={customer.englishNameOption === "previous" ? "نفس ترجمة الجواز السابق" : customer.englishName}
                                onChange={(e) => {
                                  const val = e.target.value.toUpperCase();
                                  if (customer.englishNameOption !== "previous" && /[\u0600-\u06FF]/.test(val)) {
                                    playLanguageWarningSound();
                                  }
                                  const updated = [...customers];
                                  updated[cIdx].englishName = val;
                                  if (customer.englishNameOption === "previous" && val !== "نفس ترجمة الجواز السابق") {
                                    updated[cIdx].englishNameOption = "dictionary";
                                  }
                                  setCustomers(updated);
                                }}
                                placeholder="MOHAMED AHMED ALI"
                                dir="ltr"
                                className={`flex-1 min-w-0 bg-white border rounded-lg px-3 py-1.5 text-xs font-bold font-mono tracking-wide focus:outline-hidden transition-all ${
                                  customer.englishNameOption !== "previous" && /[\u0600-\u06FF]/.test(customer.englishName)
                                    ? "border-amber-500 bg-amber-50/40 text-amber-950 ring-2 ring-amber-300"
                                    : errors[`c-${cIdx}-englishName`]
                                      ? "border-rose-400 bg-rose-50/20 text-rose-900"
                                      : "border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 text-slate-900"
                                } ${customer.englishNameOption === "previous" ? "italic text-slate-600 font-sans" : ""}`}
                              />
                              {customer.englishNameOption !== "previous" && (
                                <button
                                  type="button"
                                  onClick={() => handleTranslateName(cIdx)}
                                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-[11px] font-bold flex items-center gap-1 transition-colors shrink-0 cursor-pointer whitespace-nowrap"
                                  title="تطبيق الترجمة من قاموس الأسماء المعتمد"
                                >
                                  <BookOpen className="w-3.5 h-3.5" />
                                  <span>القاموس</span>
                                </button>
                              )}
                            </div>

                            {customer.englishNameOption !== "previous" && (
                              <p className="text-[10.5px] text-slate-500">
                                التعديل اليدوي للاسم الإنجليزي مؤقت لهذه الفاتورة فقط ولا يغيّر القاموس العام.
                              </p>
                            )}

                            {customer.englishNameOption !== "previous" && /[\u0600-\u06FF]/.test(customer.englishName) && (
                              <div className="bg-amber-100 border border-amber-300 text-amber-950 px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1.5 animate-pulse">
                                <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                                <span>حروف عربية داخل الاسم الإنجليزي! حوّل للإنجليزية (Alt + Shift)</span>
                              </div>
                            )}

                            {/* Dictionary status & missing words */}
                            {(() => {
                              if (customer.englishNameOption === "previous" || !customer.arabicName.trim()) return null;
                              const breakdown = breakdownArabicName(customer.arabicName, dictionary);

                              if (breakdown.allFound) {
                                return (
                                  <div className="flex items-center gap-1.5 text-[11px] text-emerald-800 bg-emerald-50 px-2.5 py-1.5 rounded-lg border border-emerald-200">
                                    <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                    <span>جميع مقاطع الاسم معتمدة من القاموس وجوجل شيت ✓</span>
                                  </div>
                                );
                              }

                              return (
                                <div className="p-2.5 bg-amber-50 border border-amber-300 rounded-xl space-y-2">
                                  <div className="flex items-center gap-1.5 text-amber-950 font-bold text-[11px]">
                                    <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                                    <span>من فضلك تأكد من ترجمة الاسم بالإنجليزي قبل مغادرة المكتب</span>
                                  </div>

                                  <div className="space-y-1.5">
                                    {breakdown.missingWords.map((missingWord) => {
                                      const inputVal = missingWordInputs[missingWord] || "";
                                      const isSaving = savingWord === missingWord;

                                      return (
                                        <div key={missingWord} className="flex items-center gap-1.5 bg-white p-1.5 rounded-lg border border-amber-200">
                                          <span className="px-2 py-0.5 bg-amber-100 text-amber-950 font-bold rounded text-[11px] shrink-0">
                                            {missingWord}
                                          </span>
                                          <input
                                            type="text"
                                            value={inputVal}
                                            onChange={(e) => {
                                              const val = e.target.value.toUpperCase();
                                              if (/[\u0600-\u06FF]/.test(val)) {
                                                playLanguageWarningSound();
                                              }
                                              setMissingWordInputs((prev) => ({ ...prev, [missingWord]: val }));
                                            }}
                                            placeholder={`ترجمة ${missingWord} بالإنجليزية...`}
                                            dir="ltr"
                                            className={`flex-1 min-w-0 bg-slate-50 border rounded-md px-2 py-1 text-xs font-mono font-bold uppercase text-slate-800 focus:outline-hidden ${
                                              /[\u0600-\u06FF]/.test(inputVal)
                                                ? "border-amber-500 ring-2 ring-amber-300 bg-amber-50/50"
                                                : "border-slate-300 focus:border-blue-500 focus:bg-white"
                                            }`}
                                          />
                                          <button
                                            type="button"
                                            onClick={() => handleSaveMissingWord(cIdx, missingWord)}
                                            disabled={isSaving || !inputVal.trim()}
                                            className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-[11px] font-bold flex items-center gap-1 transition-colors shrink-0 disabled:opacity-40 cursor-pointer whitespace-nowrap"
                                          >
                                            <Plus className="w-3 h-3" />
                                            <span>{isSaving ? "حفظ..." : "حفظ بالقاموس"}</span>
                                          </button>
                                        </div>
                                      );
                                    })}
                                  </div>

                                  {(() => {
                                    if (!customer.englishName.trim()) return null;
                                    const arWords = customer.arabicName.trim().split(/\s+/).filter(Boolean);
                                    const enWords = customer.englishName.trim().split(/\s+/).filter(Boolean);
                                    if (arWords.length !== enWords.length || arWords.length === 0) return null;

                                    return (
                                      <button
                                        type="button"
                                        onClick={async () => {
                                          const tokens = extractAtomicWordTokens(customer.arabicName, customer.englishName);
                                          for (const t of tokens) {
                                            if (breakdown.missingWords.includes(t.arabic)) {
                                              await handleSaveMissingWord(cIdx, t.arabic, t.english);
                                            }
                                          }
                                        }}
                                        className="w-full py-1.5 px-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[11px] font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                                      >
                                        <Check className="w-3.5 h-3.5" />
                                        <span>حفظ المقاطع الجديدة بالقاموس دفعة واحدة</span>
                                      </button>
                                    );
                                  })()}
                                </div>
                              );
                            })()}

                            {errors[`c-${cIdx}-englishName`] && (
                              <p className="text-[10.5px] text-rose-600 flex items-center gap-1 font-bold">
                                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                                <span>{errors[`c-${cIdx}-englishName`]}</span>
                              </p>
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* =================================================================== */}
                    {/* LEFT COLUMN: Requested Services for this Customer (1 or multiple)   */}
                    {/* =================================================================== */}
                    <div className={`lg:col-span-6 p-3.5 space-y-2.5 min-w-0 flex flex-col ${theme.servicesBoxBg}`}>
                      <div className="flex items-center justify-between gap-2 border-b border-slate-200/80 pb-1.5">
                        <div className="flex items-center gap-2 min-w-0">
                          <h4 className={`text-[11px] font-extrabold truncate ${theme.titleText}`}>
                            الخدمات المطلوبة ({customer.services.length})
                          </h4>
                        </div>
                        <button
                          type="button"
                          onClick={() => addServiceToCustomer(cIdx)}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1 cursor-pointer transition-all whitespace-nowrap shrink-0 ${theme.addServiceBtn}`}
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>إضافة خدمة أخرى</span>
                        </button>
                      </div>

                      <div className="space-y-2.5 flex-1">
                        {customer.services.map((srv, sIdx) => {
                          const selectedServiceObj = services.find((s) => s.id === srv.serviceId || s.name === srv.serviceId);
                          const sTheme = getServiceItemTheme(sIdx);

                          return (
                            <div key={sIdx} className={`rounded-xl overflow-hidden transition-all ${sTheme.wrapper}`}>
                              {/* Compact Service Sub-Header */}
                              <div className={`px-3 py-1.5 flex items-center justify-between gap-2 ${sTheme.headerBg}`}>
                                <div className="flex items-center gap-1.5 min-w-0">
                                  <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-black shrink-0 ${sTheme.badge}`}>
                                    خدمة {sIdx + 1}
                                  </span>
                                  <span className={`text-xs font-extrabold truncate ${sTheme.title}`}>
                                    {selectedServiceObj ? selectedServiceObj.name : "اختر الخدمة من القائمة"}
                                  </span>
                                </div>

                                <div className="flex items-center gap-2 shrink-0">
                                  <span className="text-xs font-mono font-black tabular-nums text-slate-900">
                                    {srv.price.toFixed(0)} ج.م
                                  </span>
                                  {customer.services.length > 1 && (
                                    <button
                                      type="button"
                                      onClick={() => removeServiceFromCustomer(cIdx, sIdx)}
                                      className="p-1 bg-white border border-rose-200 text-rose-600 hover:bg-rose-50 rounded-md transition-colors cursor-pointer"
                                      title="حذف هذه الخدمة"
                                      aria-label="حذف هذه الخدمة"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </div>
                              </div>

                              {/* Compact Single-Row Service Selector + Qty + Total */}
                              <div className="p-2.5 space-y-2">
                                <div className="grid grid-cols-12 gap-2 items-end">
                                  {/* Service Dropdown */}
                                  <div className="col-span-7 sm:col-span-8 space-y-0.5">
                                    <label className="text-[10px] font-bold text-slate-600">
                                      الخدمة المطلوبة <span className="text-rose-500">*</span>
                                    </label>
                                    <select
                                      name={`c-${cIdx}-s-${sIdx}-id`}
                                      value={srv.serviceId}
                                      onChange={(e) => handleServiceChange(cIdx, sIdx, e.target.value)}
                                      className={`w-full bg-white border rounded-lg px-2.5 py-1.5 text-xs font-semibold focus:outline-hidden focus:border-red-500 focus:ring-2 focus:ring-red-100 transition-all ${
                                        errors[`c-${cIdx}-s-${sIdx}-id`] ? "border-rose-400 text-rose-900 bg-rose-50/20" : "border-slate-200"
                                      }`}
                                      required
                                    >
                                      <option value="">-- اختر الخدمة --</option>
                                      {services.map((s, idx) => (
                                        <option key={s.id} value={s.id}>
                                          {idx + 1}. {s.name} ({s.govPrice + s.officeFee} ج.م)
                                        </option>
                                      ))}
                                    </select>
                                  </div>

                                  {/* Quantity */}
                                  <div className="col-span-2 space-y-0.5">
                                    <label className="text-[10px] font-bold text-slate-600 block text-center">العدد</label>
                                    <input
                                      type="number"
                                      min="1"
                                      value={srv.quantity}
                                      onChange={(e) => handleQtyChange(cIdx, sIdx, parseInt(e.target.value) || 1)}
                                      className="w-full bg-white border border-slate-200 rounded-lg px-1.5 py-1.5 text-xs font-mono font-bold text-center tabular-nums focus:outline-hidden focus:border-red-500 focus:ring-2 focus:ring-red-100"
                                      required
                                    />
                                  </div>

                                  {/* Computed Price */}
                                  <div className="col-span-3 sm:col-span-2 space-y-0.5">
                                    <label className="text-[10px] font-bold text-slate-500 block text-center">السعر</label>
                                    <div className="w-full bg-slate-100 border border-slate-200 text-slate-800 rounded-lg px-2 py-1.5 text-xs font-mono font-bold tabular-nums text-center truncate">
                                      {srv.price.toFixed(0)}
                                    </div>
                                  </div>
                                </div>

                                {errors[`c-${cIdx}-s-${sIdx}-id`] && (
                                  <p className="text-[10px] text-rose-600 flex items-center gap-1">
                                    <AlertCircle className="w-3 h-3 shrink-0" />
                                    <span>{errors[`c-${cIdx}-s-${sIdx}-id`]}</span>
                                  </p>
                                )}

                                {/* Compact Embedded Service Metadata */}
                                {selectedServiceObj && (
                                  <div className="space-y-1.5 text-[11px]">
                                    {/* Duration + Delivery Date on one tight line */}
                                    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 bg-slate-50 border border-slate-200/80 rounded-lg px-2.5 py-1.5 text-slate-700">
                                      <span>
                                        <strong className="text-slate-900">المدة:</strong> {selectedServiceObj.duration}
                                      </span>
                                      <span className="text-amber-800 font-bold flex items-center gap-1">
                                        <Calendar className="w-3 h-3 shrink-0" />
                                        <span>
                                          الاستلام: {srv.deliveryDate ? `${getArabicDayName(srv.deliveryDate) ? getArabicDayName(srv.deliveryDate) + " " : ""}${srv.deliveryDate}` : "غير محدد"}
                                        </span>
                                      </span>
                                    </div>

                                    {sIdx > 0 && customer.services[sIdx - 1]?.deliveryDate && (
                                      <div className="text-[10.5px] text-blue-800 bg-blue-50/70 px-2.5 py-1 rounded-md border border-blue-200/70">
                                        يبدأ احتسابها بعد انتهاء الخدمة السابقة ({customer.services[sIdx - 1].deliveryDate})
                                      </div>
                                    )}

                                    {/* Compact Delivery Instructions */}
                                    <div className="bg-blue-50/70 border border-blue-200/80 rounded-lg px-2.5 py-1.5 text-blue-950 leading-snug">
                                      <span className="font-bold text-blue-900">تعليمات التسليم: </span>
                                      <span>
                                        {selectedServiceObj.instructions || "يرجى إحضار أصل بطاقة الرقم القومي سارية أو المستندات الأصلية للمطابقة عند الاستلام."}
                                      </span>
                                    </div>

                                    {/* Government Fines for Passport Services (#) */}
                                    {selectedServiceObj.name.trim().startsWith("#") && (() => {
                                      const currentFines: { name: string; amount: number }[] = Array.isArray(srv.fines) && srv.fines.length > 0
                                        ? srv.fines
                                        : (srv.fineName || (srv.fineAmount && srv.fineAmount > 0))
                                          ? [{ name: srv.fineName || "غرامة حكومية", amount: srv.fineAmount || 0 }]
                                          : [];

                                      return (
                                        <div className="bg-amber-50/80 border border-amber-200 rounded-lg p-2 space-y-1.5 text-[11px]">
                                          <div className="flex items-center justify-between gap-2">
                                            <span className="font-bold text-amber-950 flex items-center gap-1">
                                              <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                                              <span>غرامات الجواز الحكومية</span>
                                            </span>
                                            {currentFines.length > 0 && (
                                              <button
                                                type="button"
                                                onClick={() => handleRemoveAllFines(cIdx, sIdx)}
                                                className="text-[10px] text-rose-600 hover:text-rose-800 font-bold cursor-pointer"
                                              >
                                                إلغاء الكل ✕
                                              </button>
                                            )}
                                          </div>

                                          {currentFines.length > 0 && (
                                            <div className="space-y-1">
                                              {currentFines.map((fine, fIdx) => (
                                                <div key={fIdx} className="flex items-center gap-1.5 bg-white border border-amber-300 rounded-md p-1">
                                                  <input
                                                    type="text"
                                                    value={fine.name}
                                                    onChange={(e) => handleUpdateFineInService(cIdx, sIdx, fIdx, { name: e.target.value })}
                                                    placeholder="مسمى الغرامة..."
                                                    className="flex-1 min-w-0 bg-amber-50/30 border border-amber-200 rounded px-2 py-1 text-[11px] text-amber-950 font-semibold focus:outline-hidden focus:ring-1 focus:ring-amber-500"
                                                  />
                                                  <div className="relative w-20 shrink-0">
                                                    <input
                                                      type="number"
                                                      min="0"
                                                      value={fine.amount}
                                                      onChange={(e) => handleUpdateFineInService(cIdx, sIdx, fIdx, { amount: parseFloat(e.target.value) || 0 })}
                                                      className="w-full bg-amber-50/30 border border-amber-200 rounded px-1.5 py-1 text-[11px] font-mono font-bold text-left tabular-nums text-amber-950 focus:outline-hidden focus:ring-1 focus:ring-amber-500"
                                                    />
                                                  </div>
                                                  <button
                                                    type="button"
                                                    onClick={() => handleRemoveFineFromService(cIdx, sIdx, fIdx)}
                                                    className="p-1 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded cursor-pointer shrink-0"
                                                    title="حذف الغرامة"
                                                  >
                                                    <Trash2 className="w-3 h-3" />
                                                  </button>
                                                </div>
                                              ))}
                                            </div>
                                          )}

                                          <select
                                            value=""
                                            onChange={(e) => {
                                              if (e.target.value) {
                                                handleAddFineToService(cIdx, sIdx, e.target.value);
                                                e.target.value = "";
                                              }
                                            }}
                                            className="w-full bg-white border border-amber-300 rounded-md px-2 py-1 text-[11px] text-amber-950 font-bold cursor-pointer hover:bg-amber-50/50 transition-colors"
                                          >
                                            <option value="">
                                              {currentFines.length === 0 ? "+ إضافة غرامة حكومية للجواز..." : "+ إضافة غرامة أخرى..."}
                                            </option>
                                            {governmentFines.map((f) => (
                                              <option key={f.id} value={f.name}>
                                                {f.name} (+{f.amount} ج.م)
                                              </option>
                                            ))}
                                            <option value="__custom__">غرامة أخرى بمبلغ مخصص...</option>
                                          </select>

                                          {currentFines.length > 0 && (
                                            <div className="flex items-center justify-between text-[10.5px] font-bold text-amber-950 bg-amber-100/70 rounded px-2 py-1">
                                              <span>إجمالي الغرامات ({currentFines.length}):</span>
                                              <span className="font-mono tabular-nums">
                                                +{(srv.fineAmount || 0) * srv.quantity} ج.م
                                              </span>
                                            </div>
                                          )}
                                        </div>
                                      );
                                    })()}

                                    {selectedServiceObj.notes && (
                                      <div className="text-slate-600 bg-slate-50 px-2 py-1 rounded text-[10.5px]">
                                        <span className="font-bold">ملاحظات:</span> {selectedServiceObj.notes}
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Cumulative Delivery Date Summary for Multiple Services */}
                      {customer.services.length > 1 && (() => {
                        const validDates = customer.services.map((s) => s.deliveryDate).filter(Boolean);
                        const finalDelivery = validDates.length > 0 ? validDates[validDates.length - 1] : "";
                        const finalDayName = finalDelivery ? getArabicDayName(finalDelivery) : "";
                        return finalDelivery ? (
                          <div className="bg-emerald-50 border border-emerald-300 rounded-lg px-2.5 py-1.5 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                            <span className="text-emerald-950 font-bold flex items-center gap-1.5">
                              <CalendarCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                              <span>الاستلام النهائي المتتابع:</span>
                            </span>
                            <span className="font-mono font-black text-emerald-900 tabular-nums">
                              {finalDayName ? `${finalDayName} ` : ""}{finalDelivery}
                            </span>
                          </div>
                        ) : null;
                      })()}

                      {/* Secondary bottom quick-add button when customer already has 2+ services */}
                      {customer.services.length > 1 && (
                        <button
                          type="button"
                          onClick={() => addServiceToCustomer(cIdx)}
                          className="w-full py-1.5 border border-dashed border-slate-300 hover:border-slate-500 bg-white/80 hover:bg-white text-slate-700 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1 transition-colors cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>إضافة خدمة تالية للعميل {customerOrdinal}</span>
                        </button>
                      )}
                    </div>

                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Compact Horizontal Widescreen Totals & Primary Action Bar */}
        <div className="bg-slate-900 text-white rounded-2xl px-4 py-3 shadow-md flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
          
          {/* Right: Add Family Member Button */}
          <button
            type="button"
            onClick={addCustomer}
            className="px-4 py-2.5 border border-dashed border-sky-400/70 bg-sky-500/10 hover:bg-sky-500/20 text-sky-200 hover:text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer whitespace-nowrap shrink-0"
          >
            <UserPlus className="w-4 h-4 text-sky-300" />
            <span>إضافة عميل / فرد أسرة جديد</span>
          </button>

          {/* Center: Compact Horizontal Totals Breakdown */}
          <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1.5 text-xs">
            <div className="flex items-center gap-1.5 text-slate-300">
              <span>العملاء:</span>
              <span className="font-mono font-bold text-white tabular-nums">{customers.length}</span>
              <span className="text-slate-600" aria-hidden="true">·</span>
              <span>الخدمات:</span>
              <span className="font-mono font-bold text-white tabular-nums">{liveTotals.totalServicesCount}</span>
            </div>
            <div className="flex items-center gap-1.5 text-slate-300">
              <span>حكومي وغرامات:</span>
              <span className="font-mono font-bold text-slate-100 tabular-nums">{liveTotals.govWithFines.toFixed(0)} ج.م</span>
            </div>
            <div className="flex items-center gap-1.5 text-slate-300">
              <span>أتعاب المكتب:</span>
              <span className="font-mono font-bold text-slate-100 tabular-nums">{liveTotals.office.toFixed(0)} ج.م</span>
            </div>
            <div className="flex items-center gap-1.5 border-r border-slate-700 pr-4">
              <span className="font-bold text-emerald-400">الإجمالي النهائي:</span>
              <span className="font-mono text-base font-black text-emerald-400 tabular-nums">
                {liveTotals.grand.toFixed(2)} ج.م
              </span>
            </div>
          </div>

          {/* Left: Save & Issue Receipt Primary CTA */}
          <button
            type="submit"
            disabled={loading}
            className={`font-extrabold text-xs sm:text-sm py-2.5 px-5 rounded-xl flex items-center justify-center gap-2 shadow-sm transition-all whitespace-nowrap shrink-0 ${
              loading
                ? "bg-emerald-800 text-emerald-200 cursor-not-allowed opacity-75 pointer-events-none"
                : "bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer active:scale-98"
            }`}
            title={loading ? "جاري المعالجة، يرجى الانتظار..." : "حفظ الفاتورة الحالية وإصدار الإيصال"}
          >
            {loading ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin text-emerald-300" />
                <span>جاري الحفظ...</span>
              </>
            ) : (
              <>
                <FileText className="w-4 h-4" />
                <span>حفظ الفاتورة وإصدار الإيصال</span>
              </>
            )}
          </button>

        </div>

      </form>

      {/* Modal: Select From Potential Customers */}
      {isSelectProspectModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-xs font-cairo">
          <div className="bg-white rounded-3xl p-6 shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[88vh] flex flex-col space-y-4">
            
            <div className="flex items-center justify-between border-b border-slate-150 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-indigo-50 border border-indigo-200 text-indigo-700 rounded-xl">
                  <Users className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-900">
                    اختيار من قائمة العملاء المحتملين
                  </h3>
                  <p className="text-xs text-slate-500">
                    حدد عميلاً واحداً أو أكثر ليتم إدراج بياناتهم فوراً في الفاتورة وتوفير وقت الكتابة
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsSelectProspectModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-800 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Search within available prospects */}
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={prospectSearchTerm}
                onChange={(e) => setProspectSearchTerm(e.target.value)}
                placeholder="ابحث بالاسم أو الرقم القومي أو المهنة..."
                className="w-full bg-slate-50 border border-slate-200 rounded-xl pr-10 pl-3 py-2 text-xs font-bold text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {/* List of available customers */}
            <div className="flex-1 overflow-y-auto space-y-2 max-h-[46vh] pr-1">
              {potentialCustomers
                .filter((p) => {
                  if (p.status === "تم_التحويل_لفاتورة") return false;
                  if (prospectSearchTerm) {
                    const term = prospectSearchTerm.toLowerCase();
                    const nMatch = p.arabicName?.toLowerCase().includes(term);
                    const nidMatch = p.nationalId?.includes(term);
                    const pMatch = p.profession?.toLowerCase().includes(term);
                    if (!nMatch && !nidMatch && !pMatch) return false;
                  }
                  return true;
                })
                .map((p) => {
                  const isChecked = selectedProspectIds.includes(p.id);
                  return (
                    <div
                      key={p.id}
                      onClick={() => {
                        setSelectedProspectIds((prev) =>
                          prev.includes(p.id) ? prev.filter((id) => id !== p.id) : [...prev, p.id]
                        );
                      }}
                      className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                        isChecked
                          ? "bg-indigo-50/80 border-indigo-300 shadow-2xs"
                          : "bg-slate-50/70 border-slate-200 hover:bg-slate-100/70"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <button type="button" className="text-indigo-600">
                          {isChecked ? <CheckSquare className="w-5 h-5" /> : <Square className="w-5 h-5 text-slate-300" />}
                        </button>
                        <div>
                          <div className="font-bold text-xs text-slate-900 flex items-center gap-2">
                            <span>{p.arabicName}</span>
                            {p.documentType && (
                              <span className="text-[10px] bg-white border border-slate-200 px-1.5 py-0.2 rounded-md text-slate-500 font-normal">
                                {p.documentType === "شهادة_ميلاد" ? "📜 شهادة ميلاد" : "🆔 بطاقة رقم قومي"}
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] font-mono text-slate-600 mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                            <span>الرقم القومي: {p.nationalId}</span>
                            {p.birthDate && <span>الميلاد: {p.birthDate}</span>}
                            {p.profession && <span className="font-bold text-slate-800">المهنة: {p.profession}</span>}
                          </div>
                        </div>
                      </div>
                      <div className="text-left shrink-0">
                        <span className="text-[10px] font-bold text-indigo-700 bg-indigo-100/60 px-2 py-0.5 rounded-md">
                          جاهز للإدراج
                        </span>
                      </div>
                    </div>
                  );
                })}

              {potentialCustomers.length === 0 && (
                <div className="text-center py-10 text-slate-400 space-y-2">
                  <Users className="w-10 h-10 mx-auto text-slate-300" />
                  <p className="font-bold text-xs text-slate-600">لا يوجد عملاء محتملون متاحون حالياً</p>
                  <p className="text-[11px] text-slate-400">
                    يمكنك تصوير مستندات العملاء (بطاقة أو شهادة ميلاد) بالضغط على "مسح بطاقة / شهادة ميلاد"
                  </p>
                </div>
              )}
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-between border-t border-slate-150 pt-3">
              <span className="text-xs text-slate-500 font-bold">
                تم تحديد: {selectedProspectIds.length} عميل
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsSelectProspectModalOpen(false)}
                  className="px-4 py-2 border border-slate-300 text-slate-700 hover:bg-slate-100 rounded-xl text-xs font-bold cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="button"
                  disabled={selectedProspectIds.length === 0}
                  onClick={handleConfirmSelectProspects}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-md cursor-pointer transition-all"
                >
                  <Sparkles className="w-4 h-4 text-emerald-300" />
                  <span>تأكيد إدراج بيانات العملاء المحددين ({selectedProspectIds.length})</span>
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* AI OCR Document Scanner Modal */}
      <DocumentScannerModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onSaveCustomer={(cust, useImmediately) => handleScannedCustomerDirect(cust, useImmediately)}
        dictionary={dictionary}
        applicantCapacities={applicantCapacityOptions}
        allowDirectUse={true}
      />

      {/* Embedded Thermal receipt rendering when active */}
      {printInvoice && (
        <ThermalReceipt 
          invoice={printInvoice}
          settings={settings}
          services={services}
          onClose={() => setPrintInvoice(null)}
          onSendWhatsApp={() => handleSendWhatsAppWelcome(printInvoice)}
          sendingWhatsApp={sendingWhatsApp}
        />
      )}

    </div>
  );
}
