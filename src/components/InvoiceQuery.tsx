import React, { useState, useRef, useEffect, useCallback } from "react";
import { Invoice, InvoiceStatus, AppSettings, Service, Employee, CustomerInput, GovernmentFine, DEFAULT_APPLICANT_CAPACITIES } from "../types";
import { updateInvoiceOnServer, deleteInvoiceOnServer, importInvoicesFromGoogleSheet } from "../lib/api";
import { calculateWorkingDaysDeliveryDate, getArabicDayName, recalculateCustomerServicesDeliveryDates } from "../lib/businessDays";
import { generateWhatsAppWelcomeMessage, generateWhatsAppReadyMessage, generateWhatsAppPartialReadyMessage, getWhatsAppUrl } from "../lib/whatsapp";
import { Search, Edit3, Trash2, Printer, Send, CheckCircle, PackageOpen, X, MapPin, Calendar, Info, RefreshCw, AlertCircle, Save, AlertTriangle, CheckSquare, Square, Clock, MessageSquare, Check, Sparkles } from "lucide-react";
import ThermalReceipt from "./ThermalReceipt";

interface InvoiceQueryProps {
  invoices: Invoice[];
  services: Service[];
  settings: AppSettings;
  activeEmployee: Employee;
  onInvoiceUpdated: (updated: Invoice) => void;
  onInvoiceDeleted: (invoiceId: number) => void;
  onInvoicesLoaded?: (invoices: Invoice[]) => void;
  governmentFines?: GovernmentFine[];
}

export default function InvoiceQuery({ 
  invoices, 
  services, 
  settings, 
  activeEmployee, 
  onInvoiceUpdated, 
  onInvoiceDeleted,
  onInvoicesLoaded,
  governmentFines = []
}: InvoiceQueryProps) {
  const applicantCapacityOptions = (settings.applicantCapacities && settings.applicantCapacities.length > 0)
    ? settings.applicantCapacities
    : DEFAULT_APPLICANT_CAPACITIES;
  // Search parameters
  const [searchId, setSearchId] = useState("");
  const [searchName, setSearchName] = useState("");
  const [searchNationalId, setSearchNationalId] = useState("");
  const [searchPhone, setSearchPhone] = useState("");
  const [searchService, setSearchService] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // UI state for Drawer Number Prompt
  const [promptDrawerInvoice, setPromptDrawerInvoice] = useState<Invoice | null>(null);
  const [drawerNo, setDrawerNo] = useState("");

  // Edit Invoice modal state
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
  const [editCustomers, setEditCustomers] = useState<CustomerInput[]>([]);

  // Print Receipt modal state
  const [printInvoice, setPrintInvoice] = useState<Invoice | null>(null);

  // Execution Note and Partial WhatsApp Modal State
  const [noteModal, setNoteModal] = useState<{
    invoice: Invoice;
    customerIndex: number;
    serviceIndex: number;
    currentNote: string;
    completed: boolean;
    serviceName: string;
    customerName: string;
  } | null>(null);

  // Loading from Google Sheets state
  const [isLoadingSheets, setIsLoadingSheets] = useState(false);
  const [sheetNotice, setSheetNotice] = useState<string | null>(null);

  // Track that initial fetch from Google Sheets happens only once upon mount
  const hasFetchedOnMountRef = useRef(false);

  // Function to load all invoices directly from Google Sheets
  const handleLoadInvoicesFromSheet = useCallback(async (isSilent = false) => {
    const webhookUrl = settings?.googleSheetWebhookUrl;
    if (!webhookUrl || !webhookUrl.startsWith("http")) return;

    if (!isSilent) setIsLoadingSheets(true);
    try {
      const res = await importInvoicesFromGoogleSheet(webhookUrl);
      if (res && Array.isArray(res.invoices)) {
        onInvoicesLoaded?.(res.invoices);
        setSheetNotice(`تم جلب وتحميل ${res.invoices.length} فاتورة مسجلة من جوجل شيت بنجاح! 📊📥`);
        setTimeout(() => setSheetNotice(null), 4000);
      }
    } catch (err: any) {
      console.warn("Notice: fetch invoices from sheet:", err.message);
      if (!isSilent) {
        setSheetNotice(`تعذر الاتصال بملف جوجل شيت: ${err.message}`);
        setTimeout(() => setSheetNotice(null), 5000);
      }
    } finally {
      setIsLoadingSheets(false);
    }
  }, [settings?.googleSheetWebhookUrl, onInvoicesLoaded]);

  // Local invoices state for instantaneous optimistic UI updates (0ms delay on checkmarks)
  const [localInvoices, setLocalInvoices] = useState<Invoice[]>(invoices);

  useEffect(() => {
    setLocalInvoices(invoices);
  }, [invoices]);

  // User explicit requirement:
  // "شاشة الاستعلام والمحفوظات لا تعمل جلب للفواتير من جوجل شيت باستمرار انما مرة واحدة فقط عند الفتح اول مرة"
  useEffect(() => {
    if (!hasFetchedOnMountRef.current) {
      hasFetchedOnMountRef.current = true;
      if (invoices.length === 0) {
        handleLoadInvoicesFromSheet(true);
      }
    }
  }, [handleLoadInvoicesFromSheet, invoices.length]);

  // Clean date helper function: strips GMT+... and (Eastern European Summer Time)
  const formatInvoiceDateDisplay = (dateVal: string | undefined): string => {
    if (!dateVal) return "";
    let s = String(dateVal).trim();
    // Remove GMT offset and any timezone text like GMT+0300 (Eastern European Summer Time)
    s = s.replace(/\s*GMT[+-]\d+.*$/i, "")
         .replace(/\s*\([^)]*\)$/i, "")
         .trim();
    return s;
  };

  // Filtered invoices, sorted by invoiceId descending so newest operations appear at the top
  const filteredInvoices = localInvoices
    .filter((inv) => {
      if (searchId && !inv.invoiceId.toString().includes(searchId)) return false;
      
      // Date Range checks: supports both YYYY-MM-DD and formatted text dates
      if (dateFrom || dateTo) {
        const invDateStr = inv.date || "";
        const parsedTime = Date.parse(invDateStr);
        if (!isNaN(parsedTime)) {
          const iso = new Date(parsedTime).toISOString().split("T")[0];
          if (dateFrom && iso < dateFrom) return false;
          if (dateTo && iso > dateTo) return false;
        } else {
          if (dateFrom && invDateStr < dateFrom) return false;
          if (dateTo && invDateStr > dateTo) return false;
        }
      }

      // Inside customers
      if (searchName || searchNationalId || searchPhone || searchService) {
        const match = inv.customers.some((cust) => {
          if (searchName && !cust.arabicName.includes(searchName) && !(cust.englishName || "").toLowerCase().includes(searchName.toLowerCase())) return false;
          if (searchNationalId && !cust.nationalId.includes(searchNationalId)) return false;
          if (searchPhone && !cust.phone.includes(searchPhone)) return false;
          if (searchService) {
            const serviceMatch = cust.services.some((s) => s.serviceId.includes(searchService));
            if (!serviceMatch) return false;
          }
          return true;
        });
        if (!match) return false;
      }

      return true;
    })
    .sort((a, b) => {
      const diff = Number(b.invoiceId) - Number(a.invoiceId);
      if (diff !== 0) return diff;
      const bTime = Date.parse(b.date || "") || 0;
      const aTime = Date.parse(a.date || "") || 0;
      return bTime - aTime;
    });

  const handleOpenDrawerPrompt = (inv: Invoice) => {
    setPromptDrawerInvoice(inv);
    setDrawerNo(inv.archiveDrawer || "");
  };

  const handleSaveDrawerNo = async () => {
    if (!promptDrawerInvoice) return;
    if (!drawerNo.trim()) {
      alert("الرجاء إدخال رقم الدرج لتسهيل الأرشفة.");
      return;
    }

    try {
      const updatedData = {
        ...promptDrawerInvoice,
        status: InvoiceStatus.READY,
        archiveDrawer: drawerNo.trim()
      };

      const result = await updateInvoiceOnServer(promptDrawerInvoice.invoiceId, updatedData);
      onInvoiceUpdated(result);
      setPromptDrawerInvoice(null);
      setDrawerNo("");

      // Trigger automatic WhatsApp dispatch
      handleSendWhatsAppReady(result);
    } catch (err) {
      console.error(err);
      alert("حدث خطأ أثناء حفظ درج الأرشيف.");
    }
  };

  const handleSetDelivered = async (inv: Invoice) => {
    if (!confirm("هل أنت متأكد من تسليم الأوراق للعميل وتغيير الحالة إلى تم التسليم؟")) return;

    try {
      const updatedData = {
        ...inv,
        status: InvoiceStatus.DELIVERED
      };

      const result = await updateInvoiceOnServer(inv.invoiceId, updatedData);
      onInvoiceUpdated(result);

      // Trigger automatic WhatsApp Delivered dispatch
      handleSendWhatsAppDelivered(result);
    } catch (err) {
      console.error(err);
      alert("حدث خطأ أثناء تحديث حالة التسليم.");
    }
  };

  const handleDeleteInvoice = async (invoiceId: number) => {
    if (!activeEmployee.permissions.canEditInvoices) {
      alert("ليست لديك صلاحية حذف الفواتير.");
      return;
    }

    if (!confirm(`⚠️ تأكيد الحذف:\nهل أنت متأكد تماماً من حذف الفاتورة رقم #${invoiceId} بشكل نهائي؟\nسيتم حذفها نهائياً من قاعدة البيانات وملف جوجل شيت ولا يمكن استرجاعها.`)) return;

    try {
      await deleteInvoiceOnServer(invoiceId);
      onInvoiceDeleted(invoiceId);
    } catch (err) {
      console.error(err);
      alert("حدث خطأ أثناء حذف الفاتورة.");
    }
  };

  const lastWhatsAppDispatchTime = useRef<number>(0);

  // WhatsApp triggers (deduplicated, single-dispatch, and debounced)
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
      window.open(waUrl, "_blank");
    } else {
      alert("رقم هاتف العميل غير متوفر في هذه الفاتورة.");
    }
  };

  const handleSendWhatsAppReady = (inv: Invoice) => {
    const { message: msg } = generateWhatsAppReadyMessage(inv, services, settings);

    const targetCustomer = inv.customers.find(c => c.phone && c.phone.trim().length > 0) || inv.customers[0];
    const rawPhone = targetCustomer?.phone ? targetCustomer.phone.trim() : "";
    if (rawPhone) {
      let cleanPhone = rawPhone.replace(/\D/g, "");
      if (cleanPhone.startsWith("0")) cleanPhone = "2" + cleanPhone;
      const waUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`;
      window.open(waUrl, "_blank");
    } else {
      alert("رقم هاتف العميل غير متوفر في هذه الفاتورة.");
    }
  };

  const handleSendWhatsAppDelivered = (inv: Invoice) => {
    const deliveryTemplate = settings.deliveryMessage || "تم تسليم أوراقك بنجاح يا {اسم_العميل} الفاتورة {رقم_الفاتورة}.";
    const customerNames = inv.customers.length > 1
      ? inv.customers.map(c => c.arabicName).join(" و ")
      : (inv.customers[0]?.arabicName || "");

    const msg = deliveryTemplate
      .replace(/{اسم_العميل}/g, customerNames)
      .replace(/{رقم_الفاتورة}/g, inv.invoiceId.toString());

    const targetCustomer = inv.customers.find(c => c.phone && c.phone.trim().length > 0) || inv.customers[0];
    const rawPhone = targetCustomer?.phone ? targetCustomer.phone.trim() : "";
    if (rawPhone) {
      let cleanPhone = rawPhone.replace(/\D/g, "");
      if (cleanPhone.startsWith("0")) cleanPhone = "2" + cleanPhone;
      const waUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`;
      window.open(waUrl, "_blank");
    } else {
      alert("رقم هاتف العميل غير متوفر.");
    }
  };

  // WhatsApp Partial Execution Notification
  const handleSendWhatsAppPartial = (inv: Invoice, custIdx: number, sIdx: number) => {
    const { message: msg, targetPhone: rawPhone } = generateWhatsAppPartialReadyMessage(inv, custIdx, sIdx, services, settings);
    if (rawPhone) {
      let cleanPhone = rawPhone.replace(/\D/g, "");
      if (cleanPhone.startsWith("0")) cleanPhone = "2" + cleanPhone;
      const waUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`;
      window.open(waUrl, "_blank");
    } else {
      alert("رقم هاتف العميل غير متوفر في هذه الفاتورة.");
    }
  };

  // Toggle individual service completion with timestamp and instantaneous optimistic UI update (0ms response)
  const handleToggleServiceCompleted = async (inv: Invoice, custIdx: number, sIdx: number) => {
    const targetInvId = inv.invoiceId;
    let targetUpdatedInvoice: Invoice | null = null;

    // 1. ⚡ Synchronous instantaneous local state update - 0ms response!
    setLocalInvoices((prev) => {
      return prev.map((item) => {
        if (item.invoiceId !== targetInvId) return item;
        const copy = JSON.parse(JSON.stringify(item)) as Invoice;
        const targetService = copy.customers[custIdx]?.services[sIdx];
        if (!targetService) return item;

        const newCompleted = !targetService.completed;
        targetService.completed = newCompleted;
        if (newCompleted) {
          const now = new Date();
          const dateStr = now.toISOString().split("T")[0];
          const timeStr = now.toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit", hour12: true });
          targetService.completedAt = `${dateStr} (${timeStr})`;
        } else {
          targetService.completedAt = undefined;
        }
        targetUpdatedInvoice = copy;
        return copy;
      });
    });

    if (targetUpdatedInvoice) {
      // 2. Notify parent App
      onInvoiceUpdated(targetUpdatedInvoice);

      // 3. Save to server asynchronously in background without blocking UI
      try {
        await updateInvoiceOnServer((targetUpdatedInvoice as Invoice).invoiceId, targetUpdatedInvoice as Invoice);
      } catch (err) {
        console.error("Failed to update service completion:", err);
        // Revert on error
        setLocalInvoices(invoices);
        onInvoiceUpdated(inv);
        alert("حدث خطأ أثناء حفظ حالة إنجاز الخدمة.");
      }
    }
  };

  // Save execution note from note modal
  const handleSaveExecutionNote = async (noteText: string, andSendWhatsApp: boolean) => {
    if (!noteModal) return;
    const { invoice: currentInv, customerIndex: cIdx, serviceIndex: sIdx } = noteModal;
    try {
      const cloned = JSON.parse(JSON.stringify(currentInv)) as Invoice;
      cloned.customers[cIdx].services[sIdx].executionNote = noteText.trim();
      const result = await updateInvoiceOnServer(cloned.invoiceId, cloned);
      onInvoiceUpdated(result);
      setNoteModal(null);

      if (andSendWhatsApp) {
        handleSendWhatsAppPartial(result, cIdx, sIdx);
      }
    } catch (err) {
      console.error(err);
      alert("حدث خطأ أثناء حفظ ملاحظة الخدمة.");
    }
  };

  // EDIT INVOICE LOGIC
  const handleOpenEdit = (inv: Invoice) => {
    if (!activeEmployee.permissions.canEditInvoices) {
      alert("عذراً، ليست لديك صلاحية تعديل مدخلات الفواتير.");
      return;
    }
    setEditingInvoice(inv);
    // clone customers array so we can edit
    setEditCustomers(JSON.parse(JSON.stringify(inv.customers)));
  };

  const handleSaveEdit = async () => {
    if (!editingInvoice) return;

    try {
      // Recalculate invoice totals
      let totalGov = 0;
      let totalOffice = 0;
      let totalAmount = 0;

      const customHolidays = settings.customHolidays || [];
      const includeSaturday = settings.includeSaturdayAsWeekend !== false;

      editCustomers.forEach((cust) => {
        cust.services.forEach((s) => {
          const matched = services.find(srv => srv.id === s.serviceId || srv.name === s.serviceId);
          if (matched) {
            const fine = s.fineAmount || 0;
            totalGov += (matched.govPrice + fine) * s.quantity;
            totalOffice += matched.officeFee * s.quantity;
            totalAmount += (matched.govPrice + fine + matched.officeFee) * s.quantity;
            s.price = (matched.govPrice + fine + matched.officeFee) * s.quantity;
          }
        });

        // Recalculate delivery dates sequentially (service 2 starts after service 1, etc.)
        cust.services = recalculateCustomerServicesDeliveryDates(
          cust.services,
          editingInvoice.date || new Date(),
          services,
          customHolidays,
          includeSaturday
        );
      });

      const updated = {
        ...editingInvoice,
        customers: editCustomers,
        totalGov,
        totalOffice,
        totalAmount,
        employeeName: activeEmployee.name
      };

      const result = await updateInvoiceOnServer(editingInvoice.invoiceId, updated);
      onInvoiceUpdated(result);
      setEditingInvoice(null);
      alert("تم حفظ تعديلات الفاتورة بنجاح في قاعدة البيانات.");
    } catch (err) {
      console.error(err);
      alert("حدث خطأ أثناء تعديل وحفظ بيانات الفاتورة بالخادم.");
    }
  };

  const handleEditCustomerField = (cIdx: number, field: keyof CustomerInput, value: any) => {
    const updated = [...editCustomers];
    updated[cIdx] = { ...updated[cIdx], [field]: value };
    setEditCustomers(updated);
  };

  return (
    <div className="space-y-6">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-extrabold text-slate-900 font-cairo">شاشة الاستعلام والمحفوظات</h2>
            <span className="text-[11px] font-bold bg-slate-100 text-slate-600 px-2.5 py-0.5 rounded-full border border-slate-200 font-mono">
              {invoices.length} فاتورة مسجلة
            </span>
            {isLoadingSheets && (
              <span className="flex items-center gap-1.5 text-xs font-bold text-blue-700 bg-blue-50 px-3 py-1 rounded-full border border-blue-200 animate-pulse">
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                جاري جلب الفواتير من جوجل شيت...
              </span>
            )}
          </div>
          <p className="text-sm text-slate-500 mt-1">
            يتم جلب الفواتير مباشرة من جوجل شيت عند فتح الشاشة، والبحث وتعيين الأدراج وتحديث الحالات.
          </p>
        </div>

        {/* Actions & Refresh */}
        <div className="flex items-center gap-3">
          {sheetNotice && (
            <div className="text-xs font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-xl flex items-center gap-1.5 shadow-xs">
              <Check className="w-4 h-4 text-emerald-600" />
              <span>{sheetNotice}</span>
            </div>
          )}

          <button
            type="button"
            disabled={isLoadingSheets}
            onClick={() => handleLoadInvoicesFromSheet(false)}
            className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50 shadow-sm hover:shadow active:scale-95"
            title="جلب الفواتير المسجلة على جوجل شيت عند الحاجة"
          >
            <RefreshCw className={`w-4 h-4 ${isLoadingSheets ? "animate-spin text-white" : ""}`} />
            <span>{isLoadingSheets ? "جاري الجلب من شيت..." : "جلب الفواتير من جوجل شيت 📥"}</span>
          </button>
        </div>
      </div>

      {/* Search Panel Filter Cards */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-xs p-6 space-y-4">
        <h3 className="font-bold text-sm text-slate-800 font-cairo flex items-center gap-1.5 mb-2">
          <Search className="w-4 h-4 text-slate-500" />
          محددات البحث المتقدم:
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-500 font-cairo">رقم الفاتورة</label>
            <input 
              type="text" 
              value={searchId} 
              onChange={(e) => setSearchId(e.target.value)} 
              placeholder="e.g. 104"
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-2 text-xs font-mono"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-500 font-cairo">اسم العميل</label>
            <input 
              type="text" 
              value={searchName} 
              onChange={(e) => setSearchName(e.target.value)} 
              placeholder="أحمد أو علي..."
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-2 text-xs font-cairo"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-500 font-cairo">الرقم القومي</label>
            <input 
              type="text" 
              value={searchNationalId} 
              onChange={(e) => setSearchNationalId(e.target.value)} 
              placeholder="14 رقم"
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-2 text-xs font-mono"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-500 font-cairo">رقم الهاتف</label>
            <input 
              type="text" 
              value={searchPhone} 
              onChange={(e) => setSearchPhone(e.target.value)} 
              placeholder="01xxxxxxxxx"
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-2 text-xs font-mono"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-500 font-cairo">نوع الخدمة</label>
            <input 
              type="text" 
              value={searchService} 
              onChange={(e) => setSearchService(e.target.value)} 
              placeholder="جواز أو تجديد..."
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-2 text-xs font-cairo"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-500 font-cairo">من تاريخ</label>
            <input 
              type="date" 
              value={dateFrom} 
              onChange={(e) => setDateFrom(e.target.value)} 
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-mono"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-500 font-cairo">إلى تاريخ</label>
            <input 
              type="date" 
              value={dateTo} 
              onChange={(e) => setDateTo(e.target.value)} 
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-mono"
            />
          </div>

        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
          <button 
            onClick={() => {
              setSearchId("");
              setSearchName("");
              setSearchNationalId("");
              setSearchPhone("");
              setSearchService("");
              setDateFrom("");
              setDateTo("");
            }}
            className="px-4 py-2 border border-slate-200 text-slate-600 hover:bg-slate-100 rounded-lg text-xs font-bold font-cairo flex items-center gap-1"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            تصفير الفلترة
          </button>
        </div>
      </div>

      {/* Results Header */}
      <div className="flex justify-between items-center text-xs text-slate-500 px-1 font-cairo">
        <span>عرض النتائج: {filteredInvoices.length} فاتورة مطابقة من أصل {invoices.length}</span>
      </div>

      {/* Grid of Invoices */}
      <div className="grid md:grid-cols-2 gap-5">
        {filteredInvoices.map((inv) => {
          
          return (
            <div 
              key={inv.invoiceId} 
              className={`bg-white border rounded-2xl shadow-xs overflow-hidden transition-all duration-200 hover:shadow-md flex flex-col justify-between border-r-8 ${
                inv.status === "NEW" ? "border-r-blue-500" :
                inv.status === "READY" ? "border-r-emerald-500" : "border-r-rose-500"
              }`}
            >
              
              {/* Card Header */}
              <div className="p-5 border-b border-slate-100 bg-slate-50/50 flex justify-between items-start">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-slate-900 font-mono">فاتورة #{inv.invoiceId}</span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold font-cairo ${
                      inv.status === "NEW" ? "bg-blue-50 text-blue-700 border border-blue-100" :
                      inv.status === "READY" ? "bg-emerald-50 text-emerald-700 border border-emerald-100" : "bg-rose-50 text-rose-700 border border-rose-100"
                    }`}>
                      {inv.status === "NEW" ? "جديدة" : inv.status === "READY" ? "جاهزة للتسليم" : "تم التسليم للعميل"}
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-400 font-mono flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-slate-300" />
                    <span>تاريخ: {formatInvoiceDateDisplay(inv.date)}</span>
                    <span className="text-slate-300">|</span>
                    <span>بواسطة: {inv.employeeName}</span>
                  </div>
                  {(() => {
                    const customHolidays = settings.customHolidays || [];
                    const includeSaturday = settings.includeSaturdayAsWeekend !== false;
                    const allDates: string[] = [];
                    let hasMultiple = false;
                    inv.customers.forEach((c) => {
                      if (c.services.length > 1) hasMultiple = true;
                      const seqServices = recalculateCustomerServicesDeliveryDates(
                        c.services,
                        inv.date || new Date(),
                        services,
                        customHolidays,
                        includeSaturday
                      );
                      seqServices.forEach((s) => {
                        if (s.deliveryDate) allDates.push(s.deliveryDate);
                      });
                    });
                    const maxDate = allDates.length > 0 ? [...allDates].sort().reverse()[0] : "";
                    if (!maxDate) return null;
                    const dayName = getArabicDayName(maxDate);
                    return (
                      <div className="text-[10px] text-indigo-700 bg-indigo-50/80 border border-indigo-100 rounded-md px-2 py-0.5 mt-1 inline-flex items-center gap-1 font-bold font-cairo">
                        <Calendar className="w-3 h-3 text-indigo-500" />
                        <span>موعد التسليم النهائي: {dayName ? `${dayName} ` : ""}{maxDate}</span>
                        {hasMultiple && <span className="text-[9px] text-indigo-500 font-normal font-cairo">(تراكمي)</span>}
                      </div>
                    );
                  })()}
                </div>

                <div className="flex gap-1.5 no-print">
                  <button 
                    onClick={() => handleOpenEdit(inv)}
                    className="p-1.5 text-slate-500 hover:bg-slate-200/50 hover:text-slate-950 rounded-lg transition-colors"
                    title="تعديل الفاتورة"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                  <button 
                    onClick={() => setPrintInvoice(inv)}
                    className="p-1.5 text-slate-500 hover:bg-slate-200/50 hover:text-slate-950 rounded-lg transition-colors"
                    title="طباعة إيصال حراري"
                  >
                    <Printer className="w-4 h-4" />
                  </button>
                  <button 
                    onClick={() => handleDeleteInvoice(inv.invoiceId)}
                    className="p-1.5 text-rose-400 hover:bg-rose-50 hover:text-rose-600 rounded-lg transition-colors"
                    title="حذف الفاتورة"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Card Body - Customer breakdowns */}
              <div className="p-5 space-y-4 flex-1">
                {inv.customers.map((cust, cIdx) => {
                  
                  return (
                    <div key={cIdx} className="border-b border-slate-100 pb-3 last:border-0 last:pb-0 text-xs">
                      <div className="flex justify-between font-bold text-slate-800 text-xs font-cairo">
                        <span>{cIdx + 1}. {cust.arabicName}</span>
                        <span className="font-mono text-slate-500">{cust.phone}</span>
                      </div>
                      
                      {cust.englishName && (
                        <div className="text-[10px] text-slate-500 font-mono mt-0.5 pr-3">
                          EN: {cust.englishName}
                        </div>
                      )}

                      {cust.profession && (
                        <div className="text-[10px] text-slate-500 font-cairo pr-3">
                          المهنة بالاستمارة: {cust.profession}
                        </div>
                      )}

                      {cust.applicantCapacity && (
                        <div className="text-[10px] text-blue-700 font-bold font-cairo pr-3">
                          صفة مقدم الطلب: {cust.applicantCapacity}
                        </div>
                      )}

                      {/* Customer services list */}
                      <div className="mt-2 space-y-2 pl-1">
                        {cust.services.map((s, sIdx) => {
                          const matched = services.find(srv => srv.id === s.serviceId || srv.name === s.serviceId);
                          const isCompleted = !!s.completed;
                          return (
                            <div 
                              key={sIdx} 
                              className={`p-2.5 rounded-xl border transition-all ${
                                isCompleted 
                                  ? "bg-emerald-50/70 border-emerald-200/90 text-emerald-950" 
                                  : "bg-slate-50/70 border-slate-150 text-slate-800"
                              }`}
                            >
                              <div className="flex items-start justify-between gap-2 text-xs">
                                <div className="flex items-start gap-2 flex-1">
                                  {/* Completion Checkbox */}
                                  <button
                                    type="button"
                                    onClick={() => handleToggleServiceCompleted(inv, cIdx, sIdx)}
                                    className={`mt-0.5 p-1 rounded-lg border transition-all flex items-center justify-center shrink-0 cursor-pointer ${
                                      isCompleted
                                        ? "bg-emerald-600 border-emerald-700 text-white shadow-xs"
                                        : "bg-white border-slate-300 text-slate-300 hover:border-emerald-500 hover:text-emerald-500"
                                    }`}
                                    title={isCompleted ? "اضغط لإلغاء إتمام الخدمة" : "اضغط لوضع علامة تم الانتهاء من تنفيذ هذه الخدمة"}
                                  >
                                    <Check className={`w-3.5 h-3.5 ${isCompleted ? "stroke-[3]" : "opacity-0 hover:opacity-100"}`} />
                                  </button>

                                  <div className="flex-1 space-y-1">
                                    <div className="flex flex-wrap items-center gap-1.5 font-bold font-cairo">
                                      <span className={isCompleted ? "line-through text-emerald-800" : "text-slate-800"}>
                                        {s.serviceId}
                                      </span>
                                      {isCompleted && (
                                        <span className="bg-emerald-600 text-white text-[10px] px-1.5 py-0.2 rounded-md font-bold">
                                          ✓ تم الإنجاز
                                        </span>
                                      )}
                                    </div>

                                    {/* Completion Timestamp */}
                                    {s.completedAt && (
                                      <div className="flex items-center gap-1 text-[10px] text-emerald-700 font-mono font-medium">
                                        <Clock className="w-3 h-3 text-emerald-600 shrink-0" />
                                        <span>تاريخ الإنجاز: {s.completedAt}</span>
                                      </div>
                                    )}

                                    {/* Execution Note */}
                                    {s.executionNote && s.executionNote.trim() && (
                                      <div className="bg-white/90 border border-emerald-200 text-emerald-900 text-[10px] rounded-lg p-1.5 font-cairo">
                                        <span className="font-bold text-emerald-700">📝 ملاحظة التنفيذ: </span>
                                        <span>{s.executionNote}</span>
                                      </div>
                                    )}

                                    {/* Action buttons for this specific service: Note & WhatsApp Partial */}
                                    <div className="flex flex-wrap items-center gap-1 pt-0.5">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setNoteModal({
                                            invoice: inv,
                                            customerIndex: cIdx,
                                            serviceIndex: sIdx,
                                            currentNote: s.executionNote || "",
                                            completed: isCompleted,
                                            serviceName: matched?.name || s.serviceId,
                                            customerName: cust.arabicName
                                          });
                                        }}
                                        className="text-[10px] font-bold text-blue-700 hover:text-blue-900 bg-white border border-blue-200 hover:bg-blue-50 px-2 py-0.5 rounded-md flex items-center gap-1 transition-colors shadow-2xs cursor-pointer font-cairo"
                                        title="كتابة أو تعديل ملاحظة أثناء تنفيذ هذه الخدمة (تأخير، مندوب، إلخ)"
                                      >
                                        <Edit3 className="w-2.5 h-2.5 text-blue-600" />
                                        <span>{s.executionNote ? "تعديل الملاحظة" : "إضافة ملاحظة تنفيذ"}</span>
                                      </button>

                                      {isCompleted && (
                                        <button
                                          type="button"
                                          onClick={() => handleSendWhatsAppPartial(inv, cIdx, sIdx)}
                                          className="text-[10px] font-bold text-emerald-800 hover:text-emerald-950 bg-emerald-100 hover:bg-emerald-200 border border-emerald-300 px-2 py-0.5 rounded-md flex items-center gap-1 transition-colors shadow-2xs cursor-pointer font-cairo"
                                          title="إرسال إشعار واتساب للعميل بانتهاء هذه الخدمة وجاري استكمال باقي المعاملات"
                                        >
                                          <MessageSquare className="w-2.5 h-2.5 text-emerald-700" />
                                          <span>إشعار جزئي واتساب 📲</span>
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                </div>

                                <div className="flex flex-col items-end gap-1 font-mono text-[10px]">
                                  <div className="flex items-center gap-1">
                                    {s.fineAmount && s.fineAmount > 0 ? (
                                      <span className="text-amber-800 bg-amber-50 px-1.5 py-0.5 rounded-sm border border-amber-200 font-cairo">
                                        {s.fineName || "غرامة"}: +{s.fineAmount * s.quantity} ج.م
                                      </span>
                                    ) : null}
                                    {s.deliveryDate && (
                                      <span className="text-indigo-800 bg-indigo-50 px-1.5 py-0.5 rounded-sm border border-indigo-200">
                                        {s.deliveryDate}
                                      </span>
                                    )}
                                    <span className="text-slate-500 font-bold">x{s.quantity}</span>
                                  </div>
                                </div>
                              </div>

                              {/* Individual Delivery Instructions */}
                              {matched?.instructions && (
                                <div className="text-[10px] text-blue-800 bg-blue-50/80 px-2 py-1 rounded-md border border-blue-100/90 mt-1 leading-tight">
                                  <span className="font-bold">📋 تعليمات التسليم: </span>
                                  <span>{matched.instructions}</span>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}

                {/* Archive Drawer badge if ready */}
                {inv.archiveDrawer && (
                  <div className="bg-amber-50 border border-amber-100 text-amber-800 rounded-lg p-2.5 text-xs font-cairo flex items-center gap-1.5">
                    <MapPin className="w-4 h-4 text-amber-500" />
                    <span>مكان الحفظ: <strong>درج حفظ الأرشيف رقم ({inv.archiveDrawer})</strong></span>
                  </div>
                )}
              </div>

              {/* Card Footer Actions - Change state triggers */}
              <div className="p-5 border-t border-slate-100 bg-slate-50/20 flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm font-bold text-slate-900 font-mono">
                  {inv.totalAmount.toFixed(2)} <span className="text-[10px] text-slate-500 font-cairo">ج.م</span>
                </div>

                <div className="flex gap-1.5 items-center">
                  {inv.status === InvoiceStatus.NEW && (() => {
                    const totalServices = inv.customers.reduce((acc, c) => acc + c.services.length, 0);
                    const completedServices = inv.customers.reduce((acc, c) => acc + c.services.filter(s => s.completed).length, 0);
                    const hasCompletedSome = completedServices > 0;
                    const allCompleted = totalServices > 0 && completedServices === totalServices;
                    const isMulti = totalServices > 1 || inv.customers.length > 1;

                    return (
                      <div className="flex items-center gap-1.5">
                        {isMulti && (
                          <span className={`text-[10px] font-bold px-2 py-1 rounded-md font-cairo ${
                            allCompleted 
                              ? "bg-emerald-100 text-emerald-800 border border-emerald-300" 
                              : (hasCompletedSome ? "bg-amber-100 text-amber-800 border border-amber-300" : "bg-slate-100 text-slate-500 border border-slate-200")
                          }`}>
                            إنجاز: {completedServices} من {totalServices}
                          </span>
                        )}
                        <button
                          onClick={() => handleOpenDrawerPrompt(inv)}
                          className={`font-bold font-cairo text-[11px] px-3.5 py-1.5 rounded-lg flex items-center gap-1.5 transition-all cursor-pointer ${
                            allCompleted
                              ? "bg-emerald-600 hover:bg-emerald-500 text-white shadow-md ring-2 ring-emerald-400 ring-offset-1 animate-pulse"
                              : (hasCompletedSome
                                  ? "bg-emerald-700 hover:bg-emerald-600 text-white shadow-xs"
                                  : "bg-emerald-600 hover:bg-emerald-500 text-white shadow-xs")
                          }`}
                          title={
                            allCompleted
                              ? "تم إنجاز كامل الخدمات بنجاح! جاهز للتسليم الآن"
                              : (hasCompletedSome ? `تم إنجاز ${completedServices} خدمة. اضغط للأرشفة وتجهيز التسليم` : "جاهز للتسليم")
                          }
                        >
                          <PackageOpen className="w-3.5 h-3.5" />
                          <span>جاهز للتسليم</span>
                          {allCompleted && <Sparkles className="w-3 h-3 text-amber-300" />}
                        </button>
                      </div>
                    );
                  })()}

                  {inv.status === InvoiceStatus.READY && (
                    <button
                      onClick={() => handleSetDelivered(inv)}
                      className="bg-rose-600 hover:bg-rose-500 text-white font-bold font-cairo text-[11px] px-3 py-1.5 rounded-lg flex items-center gap-1.5 shadow-xs transition-colors"
                    >
                      <CheckCircle className="w-3.5 h-3.5" />
                      تم تسليم الأوراق
                    </button>
                  )}

                  {/* Resend buttons for WhatsApp messages */}
                  <button
                    onClick={() => {
                      if (inv.status === InvoiceStatus.NEW) handleSendWhatsAppWelcome(inv);
                      else if (inv.status === InvoiceStatus.READY) handleSendWhatsAppReady(inv);
                      else handleSendWhatsAppDelivered(inv);
                    }}
                    className="border border-slate-200 text-slate-600 hover:bg-slate-100 font-bold font-cairo text-[11px] px-2.5 py-1.5 rounded-lg flex items-center gap-1"
                    title={
                      inv.status === InvoiceStatus.NEW 
                        ? "إعادة إرسال رسالة الترحيب بالفاتورة" 
                        : (inv.status === InvoiceStatus.READY ? "إعادة إرسال إشعار جاهزية الأوراق" : "إعادة إرسال إشعار تسليم الأوراق")
                    }
                  >
                    <Send className="w-3.5 h-3.5" />
                    إشعار
                  </button>
                </div>
              </div>

            </div>
          );
        })}

        {/* Empty state when no invoices match */}
        {filteredInvoices.length === 0 && (
          <div className="col-span-full bg-white border border-slate-200 rounded-2xl p-10 text-center space-y-2 shadow-2xs">
            <div className="w-12 h-12 bg-slate-100 text-slate-400 rounded-2xl flex items-center justify-center mx-auto">
              <Search className="w-6 h-6" />
            </div>
            <h4 className="font-extrabold text-slate-800 text-sm font-cairo">لا توجد فواتير معروضة</h4>
            <p className="text-xs text-slate-500 font-cairo">
              لم يتم العثور على فواتير تطابق محددات البحث الحالية. يمكنك تعديل خيارات البحث أو إنشاء فاتورة جديدة.
            </p>
          </div>
        )}
      </div>

      {/* DRAWER NUMBER INPUT PROMPT MODAL */}
      {promptDrawerInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl animate-fade-in-up font-cairo">
            <div className="px-6 py-4 bg-slate-950 text-white flex justify-between items-center">
              <h4 className="font-bold text-sm">أرشفة وتجهيز الاستمارة للتسليم</h4>
              <button onClick={() => setPromptDrawerInvoice(null)}>
                <X className="w-4 h-4 text-slate-400" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-xs text-slate-600 leading-relaxed">
                يرجى كتابة رقم درج حفظ الأرشيف حتى يسهل العثور على أوراق العميل <strong>{promptDrawerInvoice.customers[0]?.arabicName}</strong> عند حضوره للاستلام لاحقاً:
              </p>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">رقم درج الأرشيف (أحرف أو أرقام):</label>
                <input 
                  type="text" 
                  value={drawerNo}
                  onChange={(e) => setDrawerNo(e.target.value)}
                  placeholder="مثال: درج أ-4 أو درج 12"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-hidden focus:border-blue-500 font-bold"
                  autoFocus
                />
              </div>
            </div>
            <div className="px-6 py-4 bg-slate-50 flex justify-end gap-2 border-t border-slate-100">
              <button 
                onClick={() => setPromptDrawerInvoice(null)}
                className="px-4 py-2 text-slate-500 text-xs font-bold"
              >
                إلغاء
              </button>
              <button 
                onClick={handleSaveDrawerNo}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg flex items-center gap-1 transition-colors"
              >
                حفظ وإرسال إشعار جاهز 🚀
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SERVICE EXECUTION NOTE & PARTIAL WHATSAPP MODAL */}
      {noteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl animate-fade-in-up font-cairo">
            <div className="px-6 py-4 bg-slate-900 text-white flex justify-between items-center">
              <div className="flex items-center gap-2">
                <span className="text-emerald-400 font-bold">✓</span>
                <h4 className="font-bold text-sm">ملاحظة تنفيذ الخدمة وإشعار الواتساب</h4>
              </div>
              <button 
                onClick={() => setNoteModal(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="bg-sky-50 border border-sky-100 rounded-xl p-3 text-xs text-sky-950 space-y-1">
                <div className="font-bold flex items-center justify-between">
                  <span>الخدمة: <strong>{noteModal.serviceName}</strong></span>
                  <span className="font-mono text-[11px] text-sky-700">فاتورة #{noteModal.invoice.invoiceId}</span>
                </div>
                <div className="text-[11px] text-slate-600">
                  العميل: <strong className="text-slate-800">{noteModal.customerName}</strong>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 flex items-center justify-between">
                  <span>ملاحظة التنفيذ (اختياري):</span>
                  <span className="text-[10px] text-slate-400">مثلاً: تأخير بسبب فحص أمني / مع مندوب كذا</span>
                </label>
                <textarea
                  value={noteModal.currentNote}
                  onChange={(e) => setNoteModal({ ...noteModal, currentNote: e.target.value })}
                  placeholder="اكتب أي ملاحظة تمت أثناء تنفيذ هذه الخدمة (كتأخير بسبب كذا أو مع مندوب كذا أو خلافه)..."
                  rows={3}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs focus:outline-hidden focus:border-blue-500 font-cairo leading-relaxed"
                  autoFocus
                />
              </div>

              <p className="text-[11px] text-slate-500 leading-relaxed bg-amber-50/70 border border-amber-200/60 p-2.5 rounded-lg text-amber-900">
                📲 يمكنك حفظ الملاحظة فقط، أو حفظها وإرسال <strong>إشعار واتساب فوري</strong> للعميل يفيد بأن هذه الخدمة تم إنجازها بنجاح وجاري استكمال باقي المعاملات تباعاً.
              </p>
            </div>

            <div className="px-6 py-4 bg-slate-50 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setNoteModal(null)}
                className="px-3 py-1.5 text-slate-500 hover:text-slate-700 text-xs font-bold"
              >
                إلغاء
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleSaveExecutionNote(noteModal.currentNote, false)}
                  className="px-3.5 py-2 bg-white border border-slate-300 hover:bg-slate-100 text-slate-800 text-xs font-bold rounded-lg transition-colors cursor-pointer"
                >
                  حفظ الملاحظة فقط 💾
                </button>
                <button
                  type="button"
                  onClick={() => handleSaveExecutionNote(noteModal.currentNote, true)}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                  حفظ وإرسال واتساب 📲
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* EDIT INVOICE COMPLETE DETAIL MODAL */}
      {editingInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col justify-between overflow-hidden shadow-2xl font-cairo">
            
            <div className="px-6 py-4 bg-slate-900 text-white flex justify-between items-center">
              <h4 className="font-bold text-md">تعديل بيانات الفاتورة #{editingInvoice.invoiceId}</h4>
              <button onClick={() => setEditingInvoice(null)}>
                <X className="w-5 h-5 text-slate-300" />
              </button>
            </div>

            <div className="p-6 space-y-6 overflow-y-auto flex-1">
              {editCustomers.map((cust, cIdx) => (
                <div key={cIdx} className="border border-slate-200 rounded-xl p-4 space-y-4">
                  <h5 className="font-bold text-xs text-slate-800 border-b border-slate-100 pb-1.5">بيانات العميل رقم {cIdx + 1}</h5>
                  
                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-slate-600">الاسم العربي:</label>
                      <input 
                        type="text" 
                        value={cust.arabicName} 
                        onChange={(e) => handleEditCustomerField(cIdx, "arabicName", e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-slate-600">رقم الهاتف:</label>
                      <input 
                        type="text" 
                        value={cust.phone} 
                        onChange={(e) => handleEditCustomerField(cIdx, "phone", e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs"
                      />
                    </div>
                  </div>

                  {/* English Name on its own separate full-width row */}
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-700 font-cairo flex items-center justify-between">
                      <span>الاسم بالإنجليزي (حروف كبيرة):</span>
                      <span className="text-[10px] text-slate-400 font-mono">CAPITAL</span>
                    </label>
                    <input 
                      type="text" 
                      value={cust.englishName} 
                      onChange={(e) => handleEditCustomerField(cIdx, "englishName", e.target.value.toUpperCase())}
                      dir="ltr"
                      placeholder="MOHAMED AHMED..."
                      className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3.5 py-2.5 text-xs font-bold font-mono tracking-wide text-slate-800 focus:outline-hidden focus:border-blue-500 focus:bg-white"
                    />
                  </div>

                  <div className="grid md:grid-cols-3 gap-4">
                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-slate-600">الرقم القومي:</label>
                      <input 
                        type="text" 
                        value={cust.nationalId} 
                        onChange={(e) => handleEditCustomerField(cIdx, "nationalId", e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-slate-600">المهنة:</label>
                      <input 
                        type="text" 
                        value={cust.profession} 
                        onChange={(e) => handleEditCustomerField(cIdx, "profession", e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-slate-600">صفة مقدم الطلب:</label>
                      <select 
                        value={cust.applicantCapacity || ""} 
                        onChange={(e) => handleEditCustomerField(cIdx, "applicantCapacity", e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-bold font-cairo cursor-pointer"
                      >
                        <option value="" disabled className="text-slate-400">-- اختر صفة مقدم الطلب --</option>
                        {applicantCapacityOptions.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Edit selected services */}
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-[11px] font-bold text-slate-600">تعديل الخدمات للعميل:</span>
                      <button
                        type="button"
                        onClick={() => {
                          const updated = [...editCustomers];
                          updated[cIdx].services.push({
                            serviceId: services[0]?.name || "",
                            quantity: 1,
                            price: 0,
                            deliveryDate: ""
                          });
                          setEditCustomers(updated);
                        }}
                        className="text-[11px] font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1 cursor-pointer font-cairo"
                      >
                        + إضافة خدمة إضافية
                      </button>
                    </div>
                    {cust.services.map((s, sIdx) => {
                      const isPass = s.serviceId.trim().startsWith("#");
                      return (
                        <div key={sIdx} className="space-y-1.5 bg-slate-50 p-2.5 rounded-lg border border-slate-150">
                          <div className="flex gap-2 items-center">
                            <select
                              value={s.serviceId}
                              onChange={(e) => {
                                const updated = [...editCustomers];
                                updated[cIdx].services[sIdx].serviceId = e.target.value;
                                if (!e.target.value.trim().startsWith("#")) {
                                  updated[cIdx].services[sIdx].fineName = "";
                                  updated[cIdx].services[sIdx].fineAmount = 0;
                                }
                                setEditCustomers(updated);
                              }}
                              className="flex-1 bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-cairo"
                            >
                              {services.map((srv, idx) => (
                                <option key={srv.id} value={srv.name}>
                                  {idx + 1}. {srv.name}
                                </option>
                              ))}
                            </select>
                            <div className="flex items-center gap-1">
                              <span className="text-[10px] text-slate-400 font-cairo">الكمية:</span>
                              <input
                                type="number"
                                min="1"
                                value={s.quantity}
                                onChange={(e) => {
                                  const updated = [...editCustomers];
                                  updated[cIdx].services[sIdx].quantity = parseInt(e.target.value) || 1;
                                  setEditCustomers(updated);
                                }}
                                className="w-14 bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-mono text-center font-bold"
                              />
                            </div>
                            {cust.services.length > 1 && (
                              <button
                                type="button"
                                onClick={() => {
                                  const updated = [...editCustomers];
                                  updated[cIdx].services = updated[cIdx].services.filter((_, i) => i !== sIdx);
                                  setEditCustomers(updated);
                                }}
                                className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                                title="حذف هذه الخدمة"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>

                          {/* Government fine selection when service starts with # */}
                          {isPass && (
                            <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-200/60 text-[11px]">
                              <span className="text-amber-800 font-bold flex items-center gap-1">
                                <AlertTriangle className="w-3 h-3 text-amber-600" />
                                غرامة حكومية:
                              </span>
                              <select
                                value={s.fineName || ""}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  const updated = [...editCustomers];
                                  if (!val) {
                                    updated[cIdx].services[sIdx].fineName = "";
                                    updated[cIdx].services[sIdx].fineAmount = 0;
                                  } else {
                                    const found = governmentFines.find(f => f.name === val);
                                    updated[cIdx].services[sIdx].fineName = val;
                                    updated[cIdx].services[sIdx].fineAmount = found ? found.amount : (updated[cIdx].services[sIdx].fineAmount || 500);
                                  }
                                  setEditCustomers(updated);
                                }}
                                className="bg-white border border-amber-300 rounded-md px-2 py-1 text-xs text-amber-950 font-cairo"
                              >
                                <option value="">-- بدون غرامة --</option>
                                {governmentFines.map(f => (
                                  <option key={f.id} value={f.name}>
                                    {f.name} (+{f.amount} ج.م)
                                  </option>
                                ))}
                                <option value="__custom__">غرامة مخصصة...</option>
                              </select>
                              {s.fineName && (
                                <div className="flex items-center gap-1">
                                  <input
                                    type="number"
                                    min="0"
                                    value={s.fineAmount || 0}
                                    onChange={(e) => {
                                      const updated = [...editCustomers];
                                      updated[cIdx].services[sIdx].fineAmount = parseFloat(e.target.value) || 0;
                                      setEditCustomers(updated);
                                    }}
                                    className="w-16 bg-white border border-amber-300 rounded-md px-1.5 py-1 text-xs font-mono font-bold text-amber-950"
                                  />
                                  <span className="text-[10px] text-slate-400">ج.م</span>
                                </div>
                              )}
                            </div>
                          )}

                          {/* Service Completion & Execution Note inside Edit Modal */}
                          <div className="pt-2 border-t border-slate-200/60 space-y-2">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <label className="flex items-center gap-2 cursor-pointer text-xs font-bold font-cairo">
                                <input
                                  type="checkbox"
                                  checked={!!s.completed}
                                  onChange={(e) => {
                                    const checked = e.target.checked;
                                    const updated = [...editCustomers];
                                    updated[cIdx].services[sIdx].completed = checked;
                                    if (checked) {
                                      const now = new Date();
                                      const dateStr = now.toISOString().split("T")[0];
                                      const timeStr = now.toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit", hour12: true });
                                      updated[cIdx].services[sIdx].completedAt = `${dateStr} (${timeStr})`;
                                    } else {
                                      updated[cIdx].services[sIdx].completedAt = undefined;
                                    }
                                    setEditCustomers(updated);
                                  }}
                                  className="w-4 h-4 rounded-sm text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                                />
                                <span className={s.completed ? "text-emerald-700" : "text-slate-700"}>
                                  تم الانتهاء من تنفيذ هذه الخدمة
                                </span>
                              </label>

                              {s.completedAt && (
                                <span className="text-[10px] text-emerald-700 font-mono font-medium bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                                  📅 أُنجزت في: {s.completedAt}
                                </span>
                              )}
                            </div>

                            <div className="space-y-1">
                              <label className="text-[10px] font-bold text-slate-500 block">ملاحظة أثناء تنفيذ الخدمة (تأخير، مندوب، إلخ):</label>
                              <input
                                type="text"
                                value={s.executionNote || ""}
                                onChange={(e) => {
                                  const updated = [...editCustomers];
                                  updated[cIdx].services[sIdx].executionNote = e.target.value;
                                  setEditCustomers(updated);
                                }}
                                placeholder="اكتب ملاحظة التنفيذ هنا (اختياري)..."
                                className="w-full bg-white border border-slate-200 rounded-md px-2.5 py-1.5 text-xs text-slate-800 font-cairo"
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                </div>
              ))}
            </div>

            <div className="px-6 py-4 bg-slate-50 flex justify-end gap-3 border-t border-slate-100">
              <button 
                onClick={() => setEditingInvoice(null)}
                className="px-4 py-2 border border-slate-200 text-slate-600 hover:bg-slate-100 rounded-lg text-sm font-medium"
              >
                إلغاء التعديل
              </button>
              <button 
                onClick={handleSaveEdit}
                className="px-5 py-2 bg-slate-900 text-white hover:bg-slate-800 rounded-lg text-sm font-bold flex items-center gap-1.5 transition-colors"
              >
                <Save className="w-4 h-4" />
                حفظ التعديلات الفورية
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Thermal receipt overlay */}
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
