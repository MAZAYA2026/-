import React, { useState, useEffect } from "react";
import { Service, CustomerInput, Invoice, InvoiceStatus, AppSettings, Employee, DictionaryItem } from "../types";
import { createInvoiceOnServer, saveDictionaryWord } from "../lib/api";
import { calculateWorkingDaysDeliveryDate, getArabicDayName, isNonWorkingDay } from "../lib/businessDays";
import { generateWhatsAppWelcomeMessage, getWhatsAppUrl } from "../lib/whatsapp";
import { breakdownArabicName, extractAtomicWordTokens, normalizeArabic } from "../lib/dictionary";
import { Plus, Trash2, FileText, UserPlus, Sparkles, Printer, Send, Check, AlertCircle, Info, Calendar, BookOpen, ShieldAlert } from "lucide-react";
import ThermalReceipt from "./ThermalReceipt";

interface InvoiceCreatorProps {
  services: Service[];
  settings: AppSettings;
  activeEmployee: Employee;
  onInvoiceCreated: (invoice: Invoice) => void;
  dictionary?: DictionaryItem[];
  onDictionaryUpdated?: (newDict: DictionaryItem[]) => void;
}

export default function InvoiceCreator({ services, settings, activeEmployee, onInvoiceCreated, dictionary = [], onDictionaryUpdated }: InvoiceCreatorProps) {
  // Master form state: list of customers on this invoice
  const [customers, setCustomers] = useState<CustomerInput[]>([createEmptyCustomer()]);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  
  // Missing word translation inputs and saving state
  const [missingWordInputs, setMissingWordInputs] = useState<{ [word: string]: string }>({});
  const [savingWord, setSavingWord] = useState<string | null>(null);

  // States for printing overlay
  const [printInvoice, setPrintInvoice] = useState<Invoice | null>(null);
  const [lastCreatedInvoice, setLastCreatedInvoice] = useState<Invoice | null>(null);
  const [showSuccessToast, setShowSuccessToast] = useState(false);
  const [createdInvoiceId, setCreatedInvoiceId] = useState<number | null>(null);

  function createEmptyCustomer(): CustomerInput {
    return {
      arabicName: "",
      englishName: "",
      englishNameOption: "dictionary",
      nationalId: "",
      birthDate: "",
      phone: "",
      profession: "",
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

    return `${dd}-${mm}-${year}`; // DD-MM-YYYY
  };

  // Handler for service dropdown selection
  const handleServiceChange = (cIdx: number, sIdx: number, val: string) => {
    const updated = [...customers];
    const item = updated[cIdx].services[sIdx];
    item.serviceId = val;

    const matched = services.find(s => s.id === val || s.name === val);
    if (matched) {
      item.price = (matched.govPrice + matched.officeFee) * item.quantity;
      
      // Calculate delivery date automatically based on official working days:
      // Services starting with '#' consider Saturday a working day; other services consider Saturday a holiday.
      const offset = matched.deliveryDaysOffset || 0;
      const customHolidays = settings.customHolidays || [];
      const calcResult = calculateWorkingDaysDeliveryDate(
        new Date(),
        offset,
        customHolidays,
        matched.name,
        settings.includeSaturdayAsWeekend !== false
      );
      item.deliveryDate = calcResult.deliveryDate;
    } else {
      item.price = 0;
      item.deliveryDate = "";
    }

    setCustomers(updated);
  };

  const handleQtyChange = (cIdx: number, sIdx: number, qty: number) => {
    const updated = [...customers];
    const item = updated[cIdx].services[sIdx];
    item.quantity = Math.max(1, qty);

    const matched = services.find(s => s.id === item.serviceId || s.name === item.serviceId);
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

  // Submit invoice to database
  const handleSubmitInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) {
      // scroll to errors
      const firstError = Object.keys(errors)[0];
      if (firstError) {
        document.getElementsByName(firstError)?.[0]?.focus();
      }
      return;
    }

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
        
        // Prepare services with resolved names
        const formattedServices = cust.services.map(s => {
          const matched = services.find(srv => srv.id === s.serviceId || srv.name === s.serviceId);
          const serviceName = matched ? matched.name : s.serviceId;
          
          if (matched) {
            totalGov += matched.govPrice * s.quantity;
            totalOffice += matched.officeFee * s.quantity;
            totalAmount += (matched.govPrice + matched.officeFee) * s.quantity;
          }

          return {
            serviceId: serviceName, // save full name for printing/archiving
            quantity: s.quantity,
            price: s.price,
            deliveryDate: s.deliveryDate
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
          services: formattedServices
        };
      });

      const invoiceData: Partial<Invoice> = {
        status: InvoiceStatus.NEW,
        employeeName: activeEmployee.name,
        customers: formattedCustomers,
        totalGov,
        totalOffice,
        totalAmount,
        date: new Date().toISOString().split("T")[0]
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

  // WhatsApp welcome link generator (deduplicated and clean)
  const handleSendWhatsAppWelcome = (inv: Invoice) => {
    if (!inv) return;
    
    const formattedMessage = generateWhatsAppWelcomeMessage(inv, services, settings);

    const targetCustomer = inv.customers.find(c => c.phone && c.phone.trim().length > 0) || inv.customers[0];
    const rawPhone = targetCustomer?.phone ? targetCustomer.phone.trim() : "";
    if (rawPhone) {
      const waUrl = getWhatsAppUrl(rawPhone, formattedMessage);
      
      const win = window.open(waUrl, "_blank", "noopener,noreferrer");
      if (!win) {
        const link = document.createElement("a");
        link.href = waUrl;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        document.body.appendChild(link);
        link.click();
        link.remove();
      }
    } else {
      alert("رقم هاتف العميل غير متوفر في هذه الفاتورة لإرسال رسالة الواتساب.");
    }
  };

  return (
    <div className="space-y-6">
      
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
              <h4 className="font-bold text-slate-900 font-cairo text-sm">تم إنشاء الفاتورة بنجاح!</h4>
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
                    
                    <div className="flex items-center gap-1.5 text-blue-700 text-xs font-bold border-b border-blue-100/60 pb-1.5">
                      <Sparkles className="w-4 h-4" />
                      <span>بيانات استمارة الجوازات (مطلوبة لتفعيل الخدمة #)</span>
                    </div>

                    {/* English Name translation panel on a separate dedicated full-width row */}
                    <div className="space-y-3 bg-white/90 p-4 rounded-xl border border-blue-200/80 shadow-xs">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <label className="text-xs font-bold text-slate-800 font-cairo flex items-center gap-1.5">
                          <BookOpen className="w-3.5 h-3.5 text-blue-600" />
                          <span>الاسم باللغة الإنجليزية (القاموس المعتمد للجوازات)</span>
                          <span className="text-rose-500">*</span>
                          <span className="text-[10px] text-slate-400 font-normal mr-1">(أحرف كبيرة CAPITAL تلقائياً)</span>
                        </label>
                        
                        {/* Options */}
                        <div className="flex items-center gap-4 text-xs text-slate-600 font-medium">
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
                            const updated = [...customers];
                            updated[cIdx].englishName = e.target.value.toUpperCase();
                            if (customer.englishNameOption === "previous" && e.target.value !== "نفس ترجمة الجواز السابق") {
                              updated[cIdx].englishNameOption = "dictionary";
                            }
                            setCustomers(updated);
                          }}
                          placeholder="مثال: MOHAMED AHMED MAHMOUD ALI"
                          dir="ltr"
                          className={`w-full bg-slate-50 border rounded-xl px-4 py-3 text-sm font-bold font-mono tracking-wide focus:outline-hidden transition-all ${
                            errors[`c-${cIdx}-englishName`] 
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
                          <div className="p-3.5 bg-amber-50/90 border-2 border-amber-300 rounded-xl space-y-3 animate-fade-in">
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
                                        onChange={(e) => setMissingWordInputs(prev => ({ ...prev, [missingWord]: e.target.value.toUpperCase() }))}
                                        placeholder={`اكتب ترجمة (${missingWord}) بالإنجليزية...`}
                                        dir="ltr"
                                        className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-mono font-bold uppercase text-slate-800 focus:outline-hidden focus:border-blue-500 focus:bg-white"
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

                    {/* Passport complementary fields in 3 columns: National ID, Birth Date, Profession */}
                    <div className="grid md:grid-cols-3 gap-4">
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
                          <p className="text-[10px] text-rose-600 flex items-center gap-1 mt-1">
                            <AlertCircle className="w-3.5 h-3.5" />
                            <span>{errors[`c-${cIdx}-nationalId`]}</span>
                          </p>
                        )}
                      </div>

                      {/* Calculated Birth Date */}
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-500 font-cairo flex items-center gap-1">
                          تاريخ الميلاد المحسوب <span className="text-[9px] text-slate-400">(مستخرج تلقائياً)</span>
                        </label>
                        <div className="w-full bg-slate-100 border border-slate-200 text-slate-600 rounded-xl px-3 py-2.5 text-xs font-mono font-bold flex items-center gap-2">
                          <Calendar className="w-4 h-4 text-slate-400" />
                          <span>{customer.birthDate || "ادخل الرقم القومي لحسابه"}</span>
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
                          onChange={(e) => handleProfessionChange(cIdx, e.target.value)}
                          maxLength={32}
                          placeholder="المهنة بالبطاقة (أقصى 32 حرف)"
                          className={`w-full bg-slate-50 border rounded-xl px-3 py-2.5 text-xs focus:outline-hidden ${
                            errors[`c-${cIdx}-profession`] ? "border-rose-300 bg-rose-50/10" : "border-slate-200"
                          }`}
                        />
                        {errors[`c-${cIdx}-profession`] && (
                          <p className="text-[10px] text-rose-600 flex items-center gap-1 mt-1">
                            <AlertCircle className="w-3.5 h-3.5" />
                            <span>{errors[`c-${cIdx}-profession`]}</span>
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center text-[11px] text-slate-500 px-1 pt-1">
                      <Info className="w-4 h-4 text-blue-500 shrink-0 ml-1.5" />
                      <span>سيقوم النظام بحساب تاريخ الميلاد وتجهيز بيانات استمارة الجوازات تلقائياً.</span>
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
                          <div className="bg-white p-3 rounded-lg border border-slate-200 text-[11px] space-y-1.5 leading-relaxed text-slate-600">
                            <div className="grid md:grid-cols-2 gap-2 text-slate-700">
                              <div>
                                <span className="font-bold text-slate-800">مدة تنفيذ الخدمة:</span> {selectedServiceObj.duration}
                              </div>
                              <div className="text-amber-700 flex items-center gap-1 font-bold">
                                <Calendar className="w-3.5 h-3.5" />
                                <span>
                                  موعد الاستلام التلقائي المحسوب: {srv.deliveryDate ? `${getArabicDayName(srv.deliveryDate) ? getArabicDayName(srv.deliveryDate) + " " : ""}${srv.deliveryDate} (أيام عمل ${selectedServiceObj.name.trim().startsWith("#") ? "• السبت عمل" : "• السبت عطلة"})` : "غير محدد"}
                                </span>
                              </div>
                            </div>
                            <div>
                              <span className="font-bold text-slate-800">تعليمات التسليم:</span> {selectedServiceObj.instructions}
                            </div>
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
              className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-800 text-white font-extrabold font-cairo text-sm py-3 px-4 rounded-xl flex items-center justify-center gap-2 shadow-md transition-all pt-2.5"
            >
              <FileText className="w-5 h-5" />
              {loading ? "جاري الحفظ والترجمة..." : "حفظ الفاتورة وإنتاج الإيصال 💾"}
            </button>
          </div>

        </div>

      </form>

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
