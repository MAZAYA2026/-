import React, { useState, useEffect, useRef, useMemo } from "react";
import { Service, CustomerInput, Invoice, InvoiceStatus, AppSettings, Employee, DictionaryItem, GovernmentFine, DEFAULT_APPLICANT_CAPACITIES, PotentialCustomer } from "../types";
import { createInvoiceOnServer, saveDictionaryWord } from "../lib/api";
import { calculateWorkingDaysDeliveryDate, getArabicDayName, isNonWorkingDay, recalculateCustomerServicesDeliveryDates } from "../lib/businessDays";
import { generateWhatsAppWelcomeMessage, getWhatsAppUrl } from "../lib/whatsapp";
import { breakdownArabicName, extractAtomicWordTokens, normalizeArabic } from "../lib/dictionary";
import { playLanguageWarningSound } from "../lib/audio";
import { Plus, Trash2, FileText, UserPlus, Sparkles, Printer, Send, Check, AlertCircle, Info, Calendar, BookOpen, ShieldAlert, CalendarCheck, AlertTriangle, Volume2, Users, Camera, CheckSquare, Square, Search, X, RefreshCw } from "lucide-react";
import ThermalReceipt from "./ThermalReceipt";
import DocumentScannerModal from "./DocumentScannerModal";

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
    setCustomers([...customers, createEmptyCustomer()]);
  };

  const removeCustomer = (cIdx: number) => {
    if (customers.length === 1) return;
    const custName = customers[cIdx]?.arabicName?.trim() || `العميل رقم (${cIdx + 1})`;
    const confirmed = window.confirm(`⚠️ تأكيد الحذف:\nهل أنت متأكد من حذف بيانات ${custName} من الفاتورة؟`);
    if (!confirmed) return;

    const updated = customers.filter((_, idx) => idx !== cIdx);
    setCustomers(updated);
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
      // Auto-save any new word tokens from customer names into dictionary and Google Sheets (as atomic words)
      for (const cust of customers) {
        if (cust.arabicName && cust.englishName && cust.englishNameOption !== "previous") {
          const tokens = extractAtomicWordTokens(cust.arabicName, cust.englishName);
          for (const token of tokens) {
            const exists = dictionary.some(
              d => normalizeArabic(d.arabic) === normalizeArabic(token.arabic) && d.english.toUpperCase() === token.english.toUpperCase()
            );
            if (!exists) {
              try {
                const newDict = await saveDictionaryWord(token.arabic, token.english);
                if (onDictionaryUpdated) {
                  onDictionaryUpdated(newDict);
                }
              } catch (e) {
                console.warn("Could not auto-save token:", token, e);
              }
            }
          }
        }
      }

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

  // WhatsApp welcome link generator (deduplicated, single-dispatch, and debounced)
  const handleSendWhatsAppWelcome = (inv: Invoice) => {
    if (!inv) return;
    
    // Prevent double clicking or dual simultaneous dispatch
    const now = Date.now();
    if (now - lastWhatsAppDispatchTime.current < 2000) {
      return;
    }
    lastWhatsAppDispatchTime.current = now;

    const formattedMessage = generateWhatsAppWelcomeMessage(inv, services, settings);

    const targetCustomer = inv.customers.find(c => c.phone && c.phone.trim().length > 0) || inv.customers[0];
    const rawPhone = targetCustomer?.phone ? targetCustomer.phone.trim() : "";
    if (rawPhone) {
      const waUrl = getWhatsAppUrl(rawPhone, formattedMessage);
      
      // Open single tab cleanly without redundant fallback triggers
      window.open(waUrl, "_blank");
    } else {
      alert("رقم هاتف العميل غير متوفر في هذه الفاتورة لإرسال رسالة الواتساب.");
    }
  };

  return (
    <div className="space-y-6">
      
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

      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900 font-cairo">شاشة تنفيذ الفاتورة</h2>
          <p className="text-sm text-slate-500 mt-1">تفريغ فواتير واستمارات عملاء الجوازات وتعيين الفترات</p>
        </div>
        <div className="flex items-center gap-2 bg-blue-50 border border-blue-100 text-blue-800 px-4 py-2 rounded-xl text-xs font-bold font-cairo">
          <Info className="w-4 h-4 text-blue-500" />
          <span>الموظف الحالي: {activeEmployee.name}</span>
        </div>
      </div>

      {/* Success Notification */}
      {showSuccessToast && createdInvoiceId && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-5 flex flex-col md:flex-row items-center justify-between gap-4 shadow-sm animate-fade-in-up">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-500 rounded-lg text-white">
              <Check className="w-5 h-5" />
            </div>
            <div>
              <h4 className="font-bold text-slate-900 font-cairo text-sm">تم إنشاء الفاتورة وتسجيلها مباشرة على جوجل شيت! 📊✅</h4>
              <p className="text-xs text-slate-600 mt-0.5">رقم الفاتورة: <span className="font-bold font-mono">#{createdInvoiceId}</span></p>
            </div>
          </div>
          <div className="flex items-center gap-2 w-full md:w-auto">
            <button 
              type="button"
              onClick={() => {
                const targetInv = lastCreatedInvoice || printInvoice;
                if (targetInv) {
                  handleSendWhatsAppWelcome(targetInv);
                } else {
                  alert("لم يتم العثور على بيانات الفاتورة لإرسال رسالة الواتساب.");
                }
              }}
              className="flex-1 md:flex-initial bg-emerald-600 hover:bg-emerald-700 text-white font-bold font-cairo text-xs px-4 py-2.5 rounded-lg flex items-center justify-center gap-2 transition-colors shadow-xs cursor-pointer"
            >
              <Send className="w-4 h-4" />
              رسالة واتس ترحيبية
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
              className="flex-1 md:flex-initial bg-slate-900 hover:bg-slate-800 text-white font-bold font-cairo text-xs px-4 py-2.5 rounded-lg flex items-center justify-center gap-2 transition-colors shadow-xs cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              إعادة طباعة إيصال 8سم
            </button>
            <button 
              type="button"
              onClick={() => {
                setShowSuccessToast(false);
                setCreatedInvoiceId(null);
                setLastCreatedInvoice(null);
              }}
              className="px-3 py-2 text-slate-500 hover:text-slate-800 font-bold text-xs cursor-pointer"
            >
              تجاهل
            </button>
          </div>
        </div>
      )}

      {/* Invoice Form */}
      <form onSubmit={handleSubmitInvoice} className="space-y-6">
        
        {/* Quick Action Toolbar: Select from Potential Customers & AI OCR Document Scanner */}
        <div className="bg-linear-to-r from-slate-900 via-indigo-950 to-slate-900 border border-indigo-900/40 rounded-2xl p-4 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-md">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-indigo-600/30 rounded-xl border border-indigo-400/30 text-indigo-300 shrink-0">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-white flex items-center gap-2">
                <span>تعبئة سريعة لبيانات الجوازات (# أو ##)</span>
                {potentialCustomers.length > 0 && (
                  <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] px-2 py-0.5 rounded-full font-bold">
                    {potentialCustomers.length} عميل محتمل جاهز
                  </span>
                )}
              </h4>
              <p className="text-[11px] text-slate-300">
                يمكنك إدخال البيانات يدوياً كالمعتاد، أو الاختيار المباشر من قائمة العملاء المحتملين أو مسح المستند بالذكاء الاصطناعي
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                setSelectedProspectIds([]);
                setProspectSearchTerm("");
                setIsSelectProspectModalOpen(true);
              }}
              className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
            >
              <CheckSquare className="w-4 h-4 text-emerald-300" />
              <span>📋 اختيار من العملاء المحتملين</span>
            </button>

            <button
              type="button"
              onClick={() => setIsScannerOpen(true)}
              className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <Camera className="w-4 h-4 text-indigo-300" />
              <span>📸 مسح بطاقة / شهادة ميلاد</span>
            </button>
          </div>
        </div>

        {/* Customers list section */}
        {customers.map((customer, cIdx) => {
          const isPass = isPassportRelated(customer);

          return (
            <div key={cIdx} className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden relative">
              
              {/* Customer Index Header */}
              <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-slate-200 text-slate-700 text-xs font-bold font-mono flex items-center justify-center">
                    {cIdx + 1}
                  </span>
                  <h3 className="font-bold text-sm text-slate-800 font-cairo">بيانات العميل</h3>
                </div>
                {customers.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeCustomer(cIdx)}
                    className="p-1.5 text-rose-500 hover:bg-rose-50 hover:text-rose-700 rounded-lg transition-colors text-xs font-bold font-cairo flex items-center gap-1"
                  >
                    <Trash2 className="w-4 h-4" />
                    حذف هذا العميل
                  </button>
                )}
              </div>

              {/* Customer input fields */}
              <div className="p-6 space-y-6">
                
                {/* Row 1: Arabic Name & Phone */}
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700 font-cairo flex items-center gap-1">
                      الاسم العربي الثنائي أو الثلاثي <span className="text-rose-500 font-mono">*</span>
                    </label>
                    <input
                      type="text"
                      value={customer.arabicName}
                      onChange={(e) => handleArabicNameChange(cIdx, e.target.value)}
                      onBlur={() => handleArabicNameBlur(cIdx)}
                      placeholder="مثال: أحمد محمد علي"
                      className={`w-full bg-slate-50 border rounded-xl px-4 py-3 text-sm focus:outline-hidden focus:ring-2 transition-all ${
                        errors[`c-${cIdx}-arabicName`] 
                          ? "border-rose-400 focus:ring-rose-200 text-rose-900 bg-rose-50/20" 
                          : "border-slate-200 focus:border-blue-500 focus:ring-blue-100"
                      }`}
                      required
                    />
                    {/[a-zA-Z]/.test(customer.arabicName) && (
                      <div className="bg-amber-100 border border-amber-300 text-amber-950 px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 mt-1.5 animate-pulse">
                        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                        <span>⚠️ تنبيه لفت نظر: تم إدخال حروف إنجليزية في خانة الاسم العربي! يرجى تحويل لغة الكتابة بالضغط على (Alt + Shift)</span>
                      </div>
                    )}
                    {errors[`c-${cIdx}-arabicName`] && (
                      <p className="text-[11px] text-rose-600 flex items-center gap-1 mt-1">
                        <AlertCircle className="w-3.5 h-3.5" />
                        <span>{errors[`c-${cIdx}-arabicName`]}</span>
                      </p>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700 font-cairo flex justify-between items-center">
                      <span>رقم الهاتف <span className="text-rose-500 font-mono">*</span></span>
                      <span className={`text-[10px] font-mono ${customer.phone.length === 11 ? "text-emerald-600 font-bold" : "text-slate-400"}`}>
                        {customer.phone.length} / 11 رقم
                      </span>
                    </label>
                    <input
                      type="text"
                      value={customer.phone}
                      onChange={(e) => handlePhoneChange(cIdx, e.target.value)}
                      placeholder="رقم الهاتف (مصر: 11 رقم يبدأ بـ 01)"
                      className={`w-full bg-slate-50 border rounded-xl px-4 py-3 text-sm focus:outline-hidden focus:ring-2 transition-all ${
                        errors[`c-${cIdx}-phone`] 
                          ? "border-rose-400 focus:ring-rose-200 text-rose-900 bg-rose-50/20" 
                          : "border-slate-200 focus:border-blue-500 focus:ring-blue-100"
                      }`}
                      required
                    />
                    {errors[`c-${cIdx}-phone`] && (
                      <p className="text-[11px] text-rose-600 flex items-center gap-1 mt-1">
                        <AlertCircle className="w-3.5 h-3.5" />
                        <span>{errors[`c-${cIdx}-phone`]}</span>
                      </p>
                    )}
                  </div>
                </div>

                {/* Passport specific fields row: visible conditionally if starts with # or ## */}
                {isPass && (
                  <div className="bg-blue-50/40 p-4 rounded-xl border border-blue-100/60 space-y-4 animate-fade-in">
                    
                    <div className="flex items-center gap-1.5 text-blue-700 text-xs font-bold border-b border-blue-100/60 pb-1.5 font-cairo">
                      <Sparkles className="w-4 h-4" />
                      <span>بيانات استمارة الجوازات (مطلوبة لتفعيل الخدمة #)</span>
                    </div>

                    {/* Passport complementary fields in 4 columns: National ID, Birth Date, Profession, Applicant Capacity */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                      {/* National ID */}
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-700 font-cairo flex justify-between items-center">
                          <span>الرقم القومي للعميل (14 رقم) <span className="text-rose-500">*</span></span>
                          <span className={`text-[10px] font-mono ${customer.nationalId.length === 14 ? "text-emerald-600 font-bold" : "text-slate-400"}`}>
                            {customer.nationalId.length} / 14 رقم
                          </span>
                        </label>
                        <input
                          type="text"
                          value={customer.nationalId}
                          onChange={(e) => handleNationalIdChange(cIdx, e.target.value)}
                          placeholder="الرقم القومي المكون من 14 رقماً"
                          className={`w-full bg-slate-50 border rounded-xl px-3 py-2.5 text-xs focus:outline-hidden font-mono ${
                            errors[`c-${cIdx}-nationalId`] ? "border-rose-300 bg-rose-50/10" : "border-slate-200"
                          }`}
                        />
                        {errors[`c-${cIdx}-nationalId`] && (
                          <p className="text-[10px] text-rose-600 flex items-center gap-1 mt-1 font-cairo">
                            <AlertCircle className="w-3.5 h-3.5" />
                            <span>{errors[`c-${cIdx}-nationalId`]}</span>
                          </p>
                        )}
                      </div>

                      {/* Calculated / Editable Birth Date */}
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-700 font-cairo flex items-center justify-between">
                          <span>تاريخ الميلاد <span className="text-[9px] text-slate-400">(مستخرج تلقائياً)</span></span>
                        </label>
                        <div className="relative flex items-center">
                          <input
                            type="text"
                            value={customer.birthDate}
                            onChange={(e) => {
                              const updated = [...customers];
                              updated[cIdx].birthDate = e.target.value;
                              setCustomers(updated);
                            }}
                            placeholder="YYYY/MM/DD (أو من الرقم القومي)"
                            className="w-full bg-slate-50 border border-slate-200 text-slate-800 rounded-xl px-3 py-2.5 text-xs font-mono font-bold focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                      </div>

                      {/* Profession */}
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-700 font-cairo flex justify-between">
                          <span>المهنة بالبطاقة أو الجواز <span className="text-rose-500">*</span></span>
                          <span className={`text-[10px] ${customer.profession.length >= 32 ? "text-rose-500 font-bold" : "text-slate-400"}`}>
                            {customer.profession.length} / 32 حرف
                          </span>
                        </label>
                        <input
                          type="text"
                          value={customer.profession}
                          onChange={(e) => {
                            if (/[a-zA-Z]/.test(e.target.value)) {
                              playLanguageWarningSound();
                            }
                            handleProfessionChange(cIdx, e.target.value);
                          }}
                          maxLength={32}
                          placeholder="المهنة بالبطاقة (أقصى 32 حرف)"
                          className={`w-full bg-slate-50 border rounded-xl px-3 py-2.5 text-xs focus:outline-hidden transition-all ${
                            /[a-zA-Z]/.test(customer.profession)
                              ? "border-amber-500 ring-2 ring-amber-400 bg-amber-50/40 text-amber-950 font-bold"
                              : errors[`c-${cIdx}-profession`] ? "border-rose-300 bg-rose-50/10" : "border-slate-200"
                          }`}
                        />
                        {/[a-zA-Z]/.test(customer.profession) && (
                          <div className="bg-amber-100 border border-amber-300 text-amber-950 px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1.5 mt-1 animate-pulse font-cairo">
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                            <span>⚠️ حروف إنجليزية في خانة المهنة! يرجى التحويل للعربية (Alt + Shift)</span>
                          </div>
                        )}
                        {errors[`c-${cIdx}-profession`] && (
                          <p className="text-[10px] text-rose-600 flex items-center gap-1 mt-1 font-cairo">
                            <AlertCircle className="w-3.5 h-3.5" />
                            <span>{errors[`c-${cIdx}-profession`]}</span>
                          </p>
                        )}
                      </div>

                      {/* Applicant Capacity (صفة مقدم الطلب) */}
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-700 font-cairo flex justify-between items-center">
                          <span>صفة مقدم الطلب <span className="text-rose-500">*</span></span>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md transition-all ${
                            customer.applicantCapacity 
                              ? "bg-emerald-100 text-emerald-800" 
                              : "bg-amber-100 text-amber-900 border border-amber-300 animate-pulse"
                          }`}>
                            {customer.applicantCapacity ? "تم التحديد ✓" : "مطلوب تحديدها ⚠️"}
                          </span>
                        </label>
                        <select
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
                          className={`w-full bg-slate-50 border rounded-xl px-3 py-2.5 text-xs font-bold font-cairo focus:outline-hidden focus:ring-2 focus:ring-blue-500 cursor-pointer shadow-xs transition-all ${
                            errors[`c-${cIdx}-applicantCapacity`]
                              ? "border-rose-400 bg-rose-50/40 text-rose-900 ring-2 ring-rose-200"
                              : !customer.applicantCapacity
                                ? "border-amber-400 bg-amber-50/40 text-amber-950 font-bold ring-1 ring-amber-300"
                                : "border-slate-200 text-slate-800 font-bold"
                          }`}
                        >
                          <option value="" disabled className="text-slate-400 font-normal">
                            -- اختر صفة مقدم الطلب (إلزامي) --
                          </option>
                          {applicantCapacityOptions.map((opt) => (
                            <option key={opt} value={opt} className="text-slate-900 font-bold">
                              {opt}
                            </option>
                          ))}
                        </select>
                        {errors[`c-${cIdx}-applicantCapacity`] && (
                          <p className="text-[10px] text-rose-600 flex items-center gap-1 mt-1 font-cairo">
                            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                            <span>{errors[`c-${cIdx}-applicantCapacity`]}</span>
                          </p>
                        )}
                        {!customer.applicantCapacity && !errors[`c-${cIdx}-applicantCapacity`] && (
                          <p className="text-[10px] text-amber-700 flex items-center gap-1 mt-0.5 font-cairo font-medium">
                            <span>⚠️ يرجى الانتباه لتحديد الصفة (بنفسه، الأب، الأم، الزوج...)</span>
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center text-[11px] text-slate-500 px-1 pt-0.5 font-cairo">
                      <Info className="w-4 h-4 text-blue-500 shrink-0 ml-1.5" />
                      <span>سيقوم النظام بحساب تاريخ الميلاد وتجهيز بيانات استمارة الجوازات تلقائياً.</span>
                    </div>

                    {/* English Name translation panel - placed UNDER National ID & Profession so switching to English is the very last step! */}
                    <div className="space-y-3 bg-white/95 p-4 rounded-xl border border-blue-200/90 shadow-xs">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <label className="text-xs font-bold text-slate-800 font-cairo flex items-center gap-1.5">
                          <BookOpen className="w-3.5 h-3.5 text-blue-600" />
                          <span>الاسم باللغة الإنجليزية (القاموس المعتمد للجوازات)</span>
                          <span className="text-rose-500">*</span>
                          <span className="text-[10px] text-blue-600 font-bold mr-1">(التحويل للإنجليزية آخر خطوة بعد إنهاء البيانات)</span>
                        </label>
                        
                        {/* Options */}
                        <div className="flex items-center gap-4 text-xs text-slate-600 font-medium font-cairo">
                          <label className="flex items-center gap-1.5 cursor-pointer hover:text-blue-700 transition-colors">
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
                            <span>ترجمة معتمدة بالقاموس وجوجل شيت</span>
                          </label>
                          <label className="flex items-center gap-1.5 cursor-pointer hover:text-blue-700 transition-colors">
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
                            <span>نفس ترجمة الجواز السابق</span>
                          </label>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <input
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
                          placeholder="مثال: MOHAMED AHMED MAHMOUD ALI"
                          dir="ltr"
                          className={`w-full bg-slate-50 border rounded-xl px-4 py-3 text-sm font-bold font-mono tracking-wide focus:outline-hidden transition-all ${
                            customer.englishNameOption !== "previous" && /[\u0600-\u06FF]/.test(customer.englishName)
                              ? "border-amber-500 bg-amber-50/40 text-amber-950 ring-2 ring-amber-400"
                              : errors[`c-${cIdx}-englishName`] 
                                ? "border-rose-400 bg-rose-50/20 text-rose-900 focus:ring-rose-200" 
                                : "border-slate-300 focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-100 text-slate-800"
                          } ${customer.englishNameOption === "previous" ? "italic text-slate-600 font-sans" : ""}`}
                        />
                        {customer.englishNameOption !== "previous" && (
                          <button
                            type="button"
                            onClick={() => handleTranslateName(cIdx)}
                            className="px-4 py-3 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors shrink-0 shadow-xs cursor-pointer whitespace-nowrap font-cairo"
                            title="تطبيق الترجمة من قاموس الأسماء المعتمد"
                          >
                            <BookOpen className="w-4 h-4" />
                            <span>تطبيق القاموس</span>
                          </button>
                        )}
                      </div>

                      {customer.englishNameOption !== "previous" && /[\u0600-\u06FF]/.test(customer.englishName) && (
                        <div className="bg-amber-100 border border-amber-300 text-amber-950 px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-2 mt-1.5 animate-pulse font-cairo">
                          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                          <span>⚠️ تنبيه: تم إدخال حروف عربية داخل خانة الاسم الإنجليزي! يرجى تحويل لوحة المفاتيح إلى الإنجليزية (Alt + Shift)</span>
                        </div>
                      )}

                      {/* Dictionary status and missing words alert section */}
                      {(() => {
                        if (customer.englishNameOption === "previous" || !customer.arabicName.trim()) return null;
                        const breakdown = breakdownArabicName(customer.arabicName, dictionary);

                        // All words found in dictionary
                        if (breakdown.allFound) {
                          return (
                            <div className="flex items-center gap-2 text-xs text-emerald-800 bg-emerald-50 px-3 py-2 rounded-xl border border-emerald-200/90 font-cairo">
                              <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                              <span>تم اعتماد ترجمة جميع مقاطع الاسم بالكامل من قاموس جوجل شيت المعتمد 📖✅</span>
                            </div>
                          );
                        }

                        // Some words missing in dictionary
                        return (
                          <div className="p-3.5 bg-amber-50/90 border-2 border-amber-300 rounded-xl space-y-3 animate-fade-in font-cairo">
                            {/* Required explicit prompt */}
                            <div className="flex items-center gap-2 text-amber-900 font-bold text-xs font-cairo">
                              <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
                              <span className="text-sm">من فضلك تأكد من ترجمة الاسم بالإنجليزي قبل مغادرة المكتب</span>
                            </div>
                            <p className="text-[11px] text-amber-800 font-cairo leading-relaxed">
                              يوجد مقطع أو أكثر من اسم المواطن غير مسجل في قاموس جوجل شيت. يرجى كتابة ترجمة المقطع بالإنجليزية وفقاً لرغبة العميل لاعتماده وحفظه كمرجع لنا في قاعدة البيانات:
                            </p>

                            {/* Missing words dedicated inputs */}
                            <div className="space-y-2 pt-1 border-t border-amber-200/80">
                              {breakdown.missingWords.map((missingWord) => {
                                const inputVal = missingWordInputs[missingWord] || "";
                                const isSaving = savingWord === missingWord;

                                return (
                                  <div key={missingWord} className="flex flex-col sm:flex-row sm:items-center gap-2 bg-white/95 p-2.5 rounded-lg border border-amber-200 shadow-2xs">
                                    <div className="flex items-center gap-1.5 shrink-0">
                                      <span className="text-[11px] font-medium text-slate-500 font-cairo">المقطع غير المسجل:</span>
                                      <span className="px-2.5 py-0.5 bg-amber-100 text-amber-900 font-bold rounded-md text-xs font-cairo">
                                        {missingWord}
                                      </span>
                                    </div>

                                    <div className="flex-1">
                                      <input
                                        type="text"
                                        value={inputVal}
                                        onChange={(e) => {
                                          const val = e.target.value.toUpperCase();
                                          if (/[\u0600-\u06FF]/.test(val)) {
                                            playLanguageWarningSound();
                                          }
                                          setMissingWordInputs(prev => ({ ...prev, [missingWord]: val }));
                                        }}
                                        placeholder={`اكتب ترجمة (${missingWord}) بالإنجليزية...`}
                                        dir="ltr"
                                        className={`w-full bg-slate-50 border rounded-lg px-2.5 py-1.5 text-xs font-mono font-bold uppercase text-slate-800 focus:outline-hidden ${
                                          /[\u0600-\u06FF]/.test(inputVal)
                                            ? "border-amber-500 ring-2 ring-amber-400 bg-amber-50/50"
                                            : "border-slate-300 focus:border-blue-500 focus:bg-white"
                                        }`}
                                      />
                                    </div>

                                    <button
                                      type="button"
                                      onClick={() => handleSaveMissingWord(cIdx, missingWord)}
                                      disabled={isSaving || !inputVal.trim()}
                                      className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-lg text-xs font-bold font-cairo flex items-center justify-center gap-1 transition-colors shrink-0 disabled:opacity-40 cursor-pointer shadow-xs whitespace-nowrap"
                                    >
                                      <Plus className="w-3.5 h-3.5" />
                                      <span>{isSaving ? "جاري الحفظ..." : "حفظ في القاموس والشيت 💾"}</span>
                                    </button>
                                  </div>
                                );
                              })}
                            </div>

                            {/* Batch save if customer.englishName has matched word count */}
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
                                  className="w-full py-2 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold font-cairo flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-xs mt-1"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                  <span>حفظ ترجمة المقاطع الجديدة في القاموس وجوجل شيت دفعة واحدة 💾</span>
                                </button>
                              );
                            })()}
                          </div>
                        );
                      })()}

                      {errors[`c-${cIdx}-englishName`] && (
                        <p className="text-[11px] text-rose-600 flex items-center gap-1 mt-1 font-cairo font-bold">
                          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                          <span>{errors[`c-${cIdx}-englishName`]}</span>
                        </p>
                      )}
                    </div>

                  </div>
                )}

                {/* Customer services list inside */}
                <div className="space-y-3 pt-4 border-t border-slate-100">
                  <div className="flex justify-between items-center">
                    <h4 className="text-xs font-bold text-slate-700 font-cairo">الخدمات المطلوبة لهذا العميل:</h4>
                    <button
                      type="button"
                      onClick={() => addServiceToCustomer(cIdx)}
                      className="text-xs text-blue-600 hover:text-blue-700 font-bold font-cairo flex items-center gap-1"
                    >
                      <Plus className="w-4 h-4" />
                      أضف خدمة أخرى للعميل
                    </button>
                  </div>

                  {customer.services.map((srv, sIdx) => {
                    const selectedServiceObj = services.find(s => s.id === srv.serviceId || s.name === srv.serviceId);

                    return (
                      <div key={sIdx} className="space-y-3 p-4 bg-slate-50 rounded-xl border border-slate-150 relative">
                        
                        {/* Remove Service Button */}
                        {customer.services.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeServiceFromCustomer(cIdx, sIdx)}
                            className="absolute top-2.5 left-2.5 p-1 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
                            title="إلغاء الخدمة"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}

                        <div className="grid md:grid-cols-4 gap-4">
                          
                          {/* Service Dropdown */}
                          <div className="md:col-span-2 space-y-1">
                            <label className="text-[10px] font-bold text-slate-600 font-cairo">الخدمة المطلوبة <span className="text-rose-500">*</span></label>
                            <select
                              value={srv.serviceId}
                              onChange={(e) => handleServiceChange(cIdx, sIdx, e.target.value)}
                              className={`w-full bg-white border rounded-lg px-3 py-2 text-xs focus:outline-hidden ${
                                errors[`c-${cIdx}-s-${sIdx}-id`] ? "border-rose-400 text-rose-900 bg-rose-50/20" : "border-slate-200"
                              }`}
                              required
                            >
                              <option value="">-- اختر الخدمة --</option>
                              {services.map((s, idx) => (
                                <option key={s.id} value={s.id}>
                                  {idx + 1}. {s.name} (حكومي: {s.govPrice} - مكتب: {s.officeFee})
                                </option>
                              ))}
                            </select>
                          </div>

                          {/* Quantity */}
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-600 font-cairo">الكمية / عدد النسخ</label>
                            <input
                              type="number"
                              min="1"
                              value={srv.quantity}
                              onChange={(e) => handleQtyChange(cIdx, sIdx, parseInt(e.target.value) || 1)}
                              className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-hidden font-mono"
                              required
                            />
                          </div>

                          {/* Computed Price */}
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-500 font-cairo">السعر الكلي للخدمة</label>
                            <div className="w-full bg-slate-100 border border-slate-200 text-slate-700 rounded-lg px-3 py-2 text-xs font-mono font-bold flex justify-between">
                              <span>{srv.price.toFixed(2)}</span>
                              <span className="text-[10px] text-slate-400 font-cairo">ج.م</span>
                            </div>
                          </div>

                        </div>

                        {/* Embedded Service metadata details when selected */}
                        {selectedServiceObj && (
                          <div className="bg-white p-3 rounded-lg border border-slate-200 text-[11px] space-y-2 leading-relaxed text-slate-600">
                            <div className="grid md:grid-cols-2 gap-2 text-slate-700">
                              <div>
                                <span className="font-bold text-slate-800">مدة تنفيذ الخدمة:</span> {selectedServiceObj.duration}
                              </div>
                              <div className="text-amber-700 flex flex-wrap items-center gap-1 font-bold">
                                <Calendar className="w-3.5 h-3.5" />
                                <span>
                                  موعد الاستلام: {srv.deliveryDate ? `${getArabicDayName(srv.deliveryDate) ? getArabicDayName(srv.deliveryDate) + " " : ""}${srv.deliveryDate} (أيام عمل ${selectedServiceObj.name.trim().startsWith("#") ? "• السبت عمل" : "• السبت عطلة"})` : "غير محدد"}
                                </span>
                                {sIdx > 0 && customer.services[sIdx - 1]?.deliveryDate && (
                                  <span className="text-[10px] text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded-sm border border-blue-200 mr-1">
                                    يبدأ احتسابها بعد انتهاء الخدمة السابقة ({customer.services[sIdx - 1].deliveryDate})
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Prominent individual delivery instructions */}
                            <div className="bg-blue-50/80 border border-blue-200 rounded-lg p-2.5 text-blue-950">
                              <div className="font-bold text-xs flex items-center gap-1.5 text-blue-900 mb-0.5">
                                <Info className="w-3.5 h-3.5 text-blue-600" />
                                <span>📋 تعليمات تسليم واستلام هذه الخدمة:</span>
                              </div>
                              <div className="text-[11.5px] leading-relaxed pr-5">
                                {selectedServiceObj.instructions || "يرجى إحضار أصل بطاقة الرقم القومي سارية أو المستندات الأصلية للمطابقة عند الاستلام."}
                              </div>
                            </div>

                            {/* Government Fines option for passport services starting with # */}
                            {selectedServiceObj.name.trim().startsWith("#") && (() => {
                              const currentFines: { name: string; amount: number }[] = Array.isArray(srv.fines) && srv.fines.length > 0
                                ? srv.fines
                                : (srv.fineName || (srv.fineAmount && srv.fineAmount > 0))
                                  ? [{ name: srv.fineName || "غرامة حكومية", amount: srv.fineAmount || 0 }]
                                  : [];

                              return (
                                <div className="bg-amber-50/80 border border-amber-200 rounded-lg p-2.5 space-y-2 text-xs">
                                  <div className="flex items-center justify-between">
                                    <span className="font-bold text-amber-900 flex items-center gap-1.5">
                                      <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                                      <span>الغرامات الحكومية للخدمة (يمكنك إضافة أكثر من غرامة لنفس الجواز):</span>
                                    </span>
                                    {currentFines.length > 0 && (
                                      <button
                                        type="button"
                                        onClick={() => handleRemoveAllFines(cIdx, sIdx)}
                                        className="text-[10px] text-red-600 hover:text-red-800 font-bold cursor-pointer"
                                      >
                                        إلغاء كافة الغرامات ✕
                                      </button>
                                    )}
                                  </div>

                                  {/* List of currently selected fines */}
                                  {currentFines.length > 0 && (
                                    <div className="space-y-1.5 pt-0.5">
                                      {currentFines.map((fine, fIdx) => (
                                        <div key={fIdx} className="flex items-center gap-2 bg-white border border-amber-300 rounded-lg p-1.5 shadow-2xs">
                                          <span className="text-[11px] font-bold text-amber-800 shrink-0">
                                            غرامة {fIdx + 1}:
                                          </span>
                                          <input
                                            type="text"
                                            value={fine.name}
                                            onChange={(e) => handleUpdateFineInService(cIdx, sIdx, fIdx, { name: e.target.value })}
                                            placeholder="مسمى الغرامة..."
                                            className="flex-1 bg-amber-50/30 border border-amber-200 rounded-md px-2 py-1 text-xs text-amber-950 font-cairo font-semibold focus:outline-none focus:ring-1 focus:ring-amber-500"
                                          />
                                          <div className="relative w-24 shrink-0">
                                            <input
                                              type="number"
                                              min="0"
                                              value={fine.amount}
                                              onChange={(e) => handleUpdateFineInService(cIdx, sIdx, fIdx, { amount: parseFloat(e.target.value) || 0 })}
                                              placeholder="المبلغ"
                                              className="w-full bg-amber-50/30 border border-amber-200 rounded-md px-2 py-1 text-xs font-mono text-amber-950 font-bold text-left focus:outline-none focus:ring-1 focus:ring-amber-500"
                                            />
                                            <span className="absolute left-1.5 top-1 text-[9px] text-slate-400">ج.م</span>
                                          </div>
                                          <button
                                            type="button"
                                            onClick={() => handleRemoveFineFromService(cIdx, sIdx, fIdx)}
                                            className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-md transition-colors cursor-pointer shrink-0"
                                            title="حذف هذه الغرامة"
                                          >
                                            <Trash2 className="w-3.5 h-3.5" />
                                          </button>
                                        </div>
                                      ))}
                                    </div>
                                  )}

                                  {/* Add new fine selector */}
                                  <div className="flex items-center gap-2 pt-0.5">
                                    <select
                                      value=""
                                      onChange={(e) => {
                                        if (e.target.value) {
                                          handleAddFineToService(cIdx, sIdx, e.target.value);
                                          e.target.value = "";
                                        }
                                      }}
                                      className="flex-1 bg-white border border-amber-300 rounded-lg px-2.5 py-1.5 text-xs text-amber-950 font-cairo cursor-pointer font-bold hover:bg-amber-50/50 transition-colors"
                                    >
                                      <option value="">
                                        {currentFines.length === 0 ? "➕ إضافة غرامة حكومية للجواز..." : "➕ إضافة غرامة أخرى للجواز..."}
                                      </option>
                                      {governmentFines.map((f) => (
                                        <option key={f.id} value={f.name}>
                                          {f.name} (+{f.amount} ج.م)
                                        </option>
                                      ))}
                                      <option value="__custom__">غرامة أخرى بمبلغ مخصص...</option>
                                    </select>
                                  </div>

                                  {/* Subtotal of fines */}
                                  {currentFines.length > 0 && (
                                    <div className="bg-amber-100/70 border border-amber-300/80 rounded-md p-1.5 text-[11px] text-amber-900 font-bold flex items-center justify-between">
                                      <span className="flex items-center gap-1">
                                        <Check className="w-3.5 h-3.5 text-amber-700" />
                                        <span>إجمالي الغرامات المضافة ({currentFines.length} غرامة):</span>
                                      </span>
                                      <span className="font-mono text-xs font-black text-amber-950">
                                        +{(srv.fineAmount || 0) * srv.quantity} ج.م ({srv.fineAmount} ج.م × {srv.quantity})
                                      </span>
                                    </div>
                                  )}
                                </div>
                              );
                            })()}

                            {selectedServiceObj.notes && (
                              <div className="text-slate-500 bg-slate-50 p-1.5 rounded-sm">
                                <span className="font-bold">ملاحظات:</span> {selectedServiceObj.notes}
                              </div>
                            )}
                          </div>
                        )}

                      </div>
                    );
                  })}

                  {/* Cumulative Delivery Date Summary for Multiple Services */}
                  {customer.services.length > 1 && (() => {
                    const validDates = customer.services.map(s => s.deliveryDate).filter(Boolean);
                    const finalDelivery = validDates.length > 0 ? validDates[validDates.length - 1] : "";
                    const finalDayName = finalDelivery ? getArabicDayName(finalDelivery) : "";
                    return finalDelivery ? (
                      <div className="bg-emerald-50/90 border border-emerald-300 rounded-xl p-3 flex flex-wrap items-center justify-between gap-2 text-xs font-cairo">
                        <div className="flex items-center gap-2 text-emerald-950 font-bold">
                          <CalendarCheck className="w-4.5 h-4.5 text-emerald-600" />
                          <span>الميعاد النهائي الفعلي لتسليم كافة خدمات ({customer.arabicName?.trim() || `العميل ${cIdx + 1}`}):</span>
                        </div>
                        <div className="font-mono font-black text-emerald-900 bg-white px-3 py-1 rounded-lg border border-emerald-300 shadow-2xs text-xs flex items-center gap-1.5">
                          <span>{finalDayName ? `${finalDayName} ` : ""}{finalDelivery}</span>
                          <span className="text-[10px] text-emerald-600 font-normal font-cairo">(تراكمي متتابع)</span>
                        </div>
                      </div>
                    ) : null;
                  })()}
                </div>

              </div>

            </div>
          );
        })}

        {/* Master Actions & Invoice Totals */}
        <div className="flex flex-col md:flex-row gap-4 items-stretch justify-between">
          
          <button
            type="button"
            onClick={addCustomer}
            className="px-5 py-3 border-2 border-dashed border-blue-200 hover:border-blue-400 text-blue-600 hover:bg-blue-50/50 rounded-2xl text-xs font-bold font-cairo flex items-center justify-center gap-2 transition-all"
          >
            <UserPlus className="w-4.5 h-4.5" />
            إضافة عميل / أفراد أسرة للفاتورة المجمعة
          </button>

          {/* Totals Breakdown Card */}
          <div className="bg-slate-900 text-white rounded-2xl p-5 shadow-lg space-y-3 w-full md:max-w-md">
            <h4 className="font-bold text-xs font-cairo text-slate-400 border-b border-slate-800 pb-1.5">حسابات الفاتورة المجمعة</h4>
            <div className="space-y-1.5 text-xs font-mono text-slate-300">
              <div className="flex justify-between">
                <span className="font-cairo">الرسوم الحكومية للأوراق:</span>
                <span>
                  {customers.reduce((tot, c) => tot + c.services.reduce((sTot, s) => {
                    const matched = services.find(srv => srv.id === s.serviceId || srv.name === s.serviceId);
                    return sTot + (matched ? matched.govPrice * s.quantity : 0);
                  }, 0), 0).toFixed(2)} ج.م
                </span>
              </div>
              <div className="flex justify-between">
                <span className="font-cairo">أتعاب وتصاريح المكتب:</span>
                <span>
                  {customers.reduce((tot, c) => tot + c.services.reduce((sTot, s) => {
                    const matched = services.find(srv => srv.id === s.serviceId || srv.name === s.serviceId);
                    return sTot + (matched ? matched.officeFee * s.quantity : 0);
                  }, 0), 0).toFixed(2)} ج.م
                </span>
              </div>
              <div className="flex justify-between text-sm font-bold text-white pt-2 border-t border-slate-800">
                <span className="font-cairo text-emerald-400">الإجمالي النهائي للفاتورة:</span>
                <span className="text-emerald-400">
                  {customers.reduce((tot, c) => tot + c.services.reduce((sTot, s) => sTot + s.price, 0), 0).toFixed(2)} ج.م
                </span>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className={`w-full font-extrabold font-cairo text-sm py-3.5 px-4 rounded-xl flex items-center justify-center gap-2 shadow-md transition-all pt-2.5 ${
                loading
                  ? "bg-emerald-800 text-emerald-200 cursor-not-allowed opacity-75 pointer-events-none"
                  : "bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer active:scale-98"
              }`}
              title={loading ? "جاري المعالجة، يرجى الانتظار..." : "حفظ الفاتورة الحالية وإصدار الإيصال"}
            >
              {loading ? (
                <>
                  <RefreshCw className="w-5 h-5 animate-spin text-emerald-300" />
                  <span>جاري الحفظ وإصدار الإيصال...</span>
                </>
              ) : (
                <>
                  <FileText className="w-5 h-5" />
                  <span>حفظ الفاتورة وإنتاج الإيصال 💾</span>
                </>
              )}
            </button>
          </div>

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
        />
      )}

    </div>
  );
}
