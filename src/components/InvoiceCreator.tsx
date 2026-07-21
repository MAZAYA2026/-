import React, { useState, useEffect } from "react";
import { Service, CustomerInput, Invoice, InvoiceStatus, AppSettings, Employee } from "../types";
import { translateWithGemini, createInvoiceOnServer, saveDictionaryWord } from "../lib/api";
import { Plus, Trash2, FileText, UserPlus, Sparkles, Printer, Send, Check, AlertCircle, Info, Calendar } from "lucide-react";
import ThermalReceipt from "./ThermalReceipt";

interface InvoiceCreatorProps {
  services: Service[];
  settings: AppSettings;
  activeEmployee: Employee;
  onInvoiceCreated: (invoice: Invoice) => void;
}

export default function InvoiceCreator({ services, settings, activeEmployee, onInvoiceCreated }: InvoiceCreatorProps) {
  // Master form state: list of customers on this invoice
  const [customers, setCustomers] = useState<CustomerInput[]>([createEmptyCustomer()]);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  
  // States for printing overlay
  const [printInvoice, setPrintInvoice] = useState<Invoice | null>(null);
  const [showSuccessToast, setShowSuccessToast] = useState(false);
  const [createdInvoiceId, setCreatedInvoiceId] = useState<number | null>(null);

  function createEmptyCustomer(): CustomerInput {
    return {
      arabicName: "",
      englishName: "",
      englishNameOption: "gemini",
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
      
      // Calculate delivery date automatically based on offsetDays
      const today = new Date();
      const offset = matched.deliveryDaysOffset || 0;
      today.setDate(today.getDate() + offset);
      item.deliveryDate = today.toISOString().split("T")[0];
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

  // Perform translation
  const handleTranslateName = async (cIdx: number) => {
    const customer = customers[cIdx];
    if (!customer.arabicName.trim()) {
      alert("الرجاء إدخال الاسم العربي أولاً ليتم ترجمته.");
      return;
    }

    setLoading(true);
    try {
      const result = await translateWithGemini(customer.arabicName);
      const updated = [...customers];
      updated[cIdx].englishName = result.english;
      setCustomers(updated);
    } catch (err) {
      console.error(err);
      alert("حدث خطأ أثناء الترجمة باستخدام الذكاء الاصطناعي. تم استخدام ترجمة مبدئية.");
    } finally {
      setLoading(false);
    }
  };

  const addCustomer = () => {
    setCustomers([...customers, createEmptyCustomer()]);
  };

  const removeCustomer = (cIdx: number) => {
    if (customers.length === 1) return;
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
        if (cust.englishNameOption === "gemini" && !cust.englishName.trim()) {
          newErrors[`c-${cIdx}-englishName`] = "الاسم الإنجليزي إلزامي للخدمات التي تبدأ بـ # أو ##.";
          isValid = false;
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

  // Automatically trigger translation on Arabic Name blur if Passport related
  const handleArabicNameBlur = (cIdx: number) => {
    const cust = customers[cIdx];
    const isPass = isPassportRelated(cust);
    if (isPass && cust.arabicName.trim() && !cust.englishName.trim() && cust.englishNameOption === "gemini") {
      handleTranslateName(cIdx);
    }
  };

  // WhatsApp welcome link generator
  const handleSendWhatsAppWelcome = (inv: Invoice) => {
    if (!inv) return;
    
    // We compose the message following the exact variable substitution guidelines
    // {اسم_العميل} {رقم_الفاتورة} {الخدمات} {تاريخ_اليوم}
    // "إذا احتوت الفاتورة على أكثر من عميل، يتم فصل بيانات كل عميل بقسم مستقل داخل نفس الرسالة."
    
    let customersText = "";
    inv.customers.forEach((cust, idx) => {
      const isPass = cust.englishName || cust.profession;
      let servicesLines = cust.services.map(s => `• ${s.serviceId} (عدد: ${s.quantity}) - السعر: ${s.price} ج.م`).join("\n");
      
      let passDetails = "";
      if (isPass) {
        passDetails = `\n  الاسم بالإنجليزي: ${cust.englishName || 'N/A'}\n  المهنة: ${cust.profession || 'N/A'}`;
        // If passport-related, append duration and delivery instructions
        const passportServices = cust.services.filter(s => s.serviceId.startsWith('#') || s.serviceId.startsWith('##'));
        passportServices.forEach(ps => {
          const matched = services.find(srv => srv.name === ps.serviceId);
          if (matched) {
            passDetails += `\n  - مدة التنفيذ: ${matched.duration}\n  - تعليمات التسليم: ${matched.instructions}`;
          }
        });
      }

      customersText += `العميل (${idx + 1}): ${cust.arabicName}${passDetails}\nالخدمات المطلوبة:\n${servicesLines}\n`;
      customersText += `------------------------------------\n`;
    });

    let welcomeTemplate = settings.welcomeMessage || "مرحباً بك {اسم_العميل}، تم استلام طلبك برقم {رقم_الفاتورة} للخدمات: {الخدمات}";
    
    // Replace variables in templates
    const primaryCustomerName = inv.customers[0]?.arabicName || "عميلنا العزيز";
    
    let formattedMessage = welcomeTemplate
      .replace(/{اسم_العميل}/g, primaryCustomerName)
      .replace(/{رقم_الفاتورة}/g, inv.invoiceId.toString())
      .replace(/{الخدمات}/g, customersText)
      .replace(/{السعر}/g, inv.totalAmount.toString())
      .replace(/{تاريخ_اليوم}/g, inv.date);

    // Append generic footer settings
    formattedMessage += `\n\n${settings.footerText || ""}`;

    const mainPhone = inv.customers[0]?.phone;
    if (mainPhone) {
      const encodedMsg = encodeURIComponent(formattedMessage);
      const waUrl = `https://wa.me/${mainPhone.startsWith('0') ? '2' + mainPhone : mainPhone}?text=${encodedMsg}`;
      window.open(waUrl, "_blank");
    } else {
      alert("رقم هاتف العميل غير متوفر.");
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
              onClick={() => {
                const invoiceMock = printInvoice;
                if (invoiceMock) handleSendWhatsAppWelcome(invoiceMock);
              }}
              className="flex-1 md:flex-initial bg-emerald-600 hover:bg-emerald-700 text-white font-bold font-cairo text-xs px-4 py-2 rounded-lg flex items-center justify-center gap-2 transition-colors shadow-xs"
            >
              <Send className="w-4 h-4" />
              رسالة واتس ترحيبية
            </button>
            <button 
              onClick={() => setPrintInvoice(printInvoice)}
              className="flex-1 md:flex-initial bg-slate-900 hover:bg-slate-800 text-white font-bold font-cairo text-xs px-4 py-2 rounded-lg flex items-center justify-center gap-2 transition-colors shadow-xs"
            >
              <Printer className="w-4 h-4" />
              طباعة إيصال 8سم
            </button>
            <button 
              onClick={() => {
                setShowSuccessToast(false);
                setCreatedInvoiceId(null);
              }}
              className="px-3 py-2 text-slate-500 hover:text-slate-800 font-bold text-xs"
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
                      onChange={(e) => {
                        const updated = [...customers];
                        updated[cIdx].arabicName = e.target.value;
                        setCustomers(updated);
                      }}
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

                    <div className="grid md:grid-cols-3 gap-4">
                      
                      {/* English Name translation panel */}
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-700 font-cairo flex justify-between">
                          <span>الاسم باللغة الإنجليزية <span className="text-rose-500">*</span></span>
                          <span className="text-[10px] text-slate-400">تلقائي CAPITAL</span>
                        </label>
                        
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={customer.englishNameOption === "previous" ? "نفس ترجمة الجواز السابق" : customer.englishName}
                            onChange={(e) => {
                              if (customer.englishNameOption === "previous") return;
                              const updated = [...customers];
                              updated[cIdx].englishName = e.target.value.toUpperCase();
                              setCustomers(updated);
                            }}
                            disabled={customer.englishNameOption === "previous"}
                            placeholder="AHMED MOHAMED"
                            className={`flex-1 bg-slate-50 border rounded-xl px-3 py-2.5 text-xs focus:outline-hidden font-mono ${
                              errors[`c-${cIdx}-englishName`] ? "border-rose-300 bg-rose-50/10" : "border-slate-200"
                            }`}
                          />
                          {customer.englishNameOption === "gemini" && (
                            <button
                              type="button"
                              onClick={() => handleTranslateName(cIdx)}
                              className="px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1 transition-colors"
                              title="ترجم بالقاموس والذكاء الاصطناعي"
                            >
                              <Sparkles className="w-3.5 h-3.5" />
                              ترجم
                            </button>
                          )}
                        </div>

                        {/* Options */}
                        <div className="flex gap-3 text-[10px] text-slate-500 pt-1">
                          <label className="flex items-center gap-1.5 cursor-pointer">
                            <input
                              type="radio"
                              name={`c-${cIdx}-eng-opt`}
                              checked={customer.englishNameOption === "gemini"}
                              onChange={() => {
                                const updated = [...customers];
                                updated[cIdx].englishNameOption = "gemini";
                                setCustomers(updated);
                              }}
                              className="w-3 h-3 text-blue-500 focus:ring-0 bg-slate-50"
                            />
                            <span>ترجمة مباشرة للطلب</span>
                          </label>
                          <label className="flex items-center gap-1.5 cursor-pointer">
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
                              className="w-3 h-3 text-blue-500 focus:ring-0 bg-slate-50"
                            />
                            <span>نفس ترجمة الجواز السابق</span>
                          </label>
                        </div>

                        {errors[`c-${cIdx}-englishName`] && (
                          <p className="text-[10px] text-rose-600 flex items-center gap-1 mt-1">
                            <AlertCircle className="w-3 h-3" />
                            <span>{errors[`c-${cIdx}-englishName`]}</span>
                          </p>
                        )}
                      </div>

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

                    </div>

                    <div className="grid md:grid-cols-2 gap-4">
                      {/* Profession */}
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-700 font-cairo flex justify-between">
                          <span>المهنة بالبطاقة أو جواز السفر <span className="text-rose-500">*</span></span>
                          <span className={`text-[10px] ${customer.profession.length >= 32 ? "text-rose-500 font-bold" : "text-slate-400"}`}>
                            {customer.profession.length} / 32 حرف بالمسافات
                          </span>
                        </label>
                        <input
                          type="text"
                          value={customer.profession}
                          onChange={(e) => handleProfessionChange(cIdx, e.target.value)}
                          maxLength={32}
                          placeholder="المهنة ببطاقة العميل (بحد أقصى 32 حرفاً)"
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

                      <div className="flex items-end text-[11px] text-slate-500 p-2 leading-snug">
                        <Info className="w-4.5 h-4.5 text-blue-500 shrink-0 ml-1.5" />
                        <span>سيقوم المعالج باستخلاص القرن وسنة الميلاد بالكامل وفق منظومة مصلحة الجوازات المصرية.</span>
                      </div>
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
                              {services.map((s) => (
                                <option key={s.id} value={s.id}>
                                  {s.name} (حكومي: {s.govPrice} - مكتب: {s.officeFee})
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
                                <span>موعد الاستلام التلقائي المحسوب: {srv.deliveryDate}</span>
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
        />
      )}

    </div>
  );
}
