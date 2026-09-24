import React, { useState } from "react";
import { Invoice, InvoiceStatus, AppSettings, Service, Employee, CustomerInput } from "../types";
import { updateInvoiceOnServer, deleteInvoiceOnServer, importInvoicesFromGoogleSheet } from "../lib/api";
import { calculateWorkingDaysDeliveryDate, getArabicDayName } from "../lib/businessDays";
import { generateWhatsAppWelcomeMessage, getWhatsAppUrl } from "../lib/whatsapp";
import { Search, Edit3, Trash2, Printer, Send, CheckCircle, CheckCircle2, PackageOpen, X, MapPin, Calendar, Info, RefreshCw, AlertCircle, Save, FileSpreadsheet, Download } from "lucide-react";
import ThermalReceipt from "./ThermalReceipt";

interface InvoiceQueryProps {
  invoices: Invoice[];
  services: Service[];
  settings: AppSettings;
  activeEmployee: Employee;
  onInvoiceUpdated: (updated: Invoice) => void;
  onInvoiceDeleted: (invoiceId: number) => void;
  onInvoicesLoaded?: (invoices: Invoice[]) => void;
}

export default function InvoiceQuery({ 
  invoices, 
  services, 
  settings, 
  activeEmployee, 
  onInvoiceUpdated, 
  onInvoiceDeleted,
  onInvoicesLoaded 
}: InvoiceQueryProps) {
  // Search parameters
  const [searchId, setSearchId] = useState("");
  const [searchName, setSearchName] = useState("");
  const [searchNationalId, setSearchNationalId] = useState("");
  const [searchPhone, setSearchPhone] = useState("");
  const [searchService, setSearchService] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // Import from Google Sheet status
  const [isImporting, setIsImporting] = useState(false);
  const [importResultModal, setImportResultModal] = useState<{
    count: number;
    newCount: number;
    updatedCount: number;
    totalInvoices: number;
    message: string;
  } | null>(null);

  // UI state for Drawer Number Prompt
  const [promptDrawerInvoice, setPromptDrawerInvoice] = useState<Invoice | null>(null);
  const [drawerNo, setDrawerNo] = useState("");

  // Edit Invoice modal state
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
  const [editCustomers, setEditCustomers] = useState<CustomerInput[]>([]);

  // Print Receipt modal state
  const [printInvoice, setPrintInvoice] = useState<Invoice | null>(null);

  const handleImportFromSheet = async () => {
    setIsImporting(true);
    try {
      const res = await importInvoicesFromGoogleSheet(settings?.googleSheetWebhookUrl);
      if (onInvoicesLoaded && Array.isArray(res.invoices)) {
        onInvoicesLoaded(res.invoices);
      }
      setImportResultModal({
        count: res.count,
        newCount: res.newCount,
        updatedCount: res.updatedCount,
        totalInvoices: res.totalInvoices || res.invoices?.length || 0,
        message: res.message
      });
    } catch (err: any) {
      alert("خطأ أثناء استيراد الفواتير من جوجل شيت: " + (err.message || err));
    } finally {
      setIsImporting(false);
    }
  };

  // Filtered invoices
  const filteredInvoices = invoices.filter((inv) => {
    if (searchId && !inv.invoiceId.toString().includes(searchId)) return false;
    
    // Date Range checks
    if (dateFrom && inv.date < dateFrom) return false;
    if (dateTo && inv.date > dateTo) return false;

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

  // WhatsApp triggers (deduplicated and clean)
  const handleSendWhatsAppWelcome = (inv: Invoice) => {
    if (!inv) return;

    const formattedMessage = generateWhatsAppWelcomeMessage(inv, services, settings);

    const targetCustomer = inv.customers.find(c => c.phone && c.phone.trim().length > 0) || inv.customers[0];
    const rawPhone = targetCustomer?.phone ? targetCustomer.phone.trim() : "";
    if (rawPhone) {
      const waUrl = getWhatsAppUrl(rawPhone, formattedMessage);
      const opened = window.open(waUrl, "_blank", "noopener,noreferrer");
      if (!opened) {
        const link = document.createElement("a");
        link.href = waUrl;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        document.body.appendChild(link);
        link.click();
        link.remove();
      }
    } else {
      alert("رقم هاتف العميل غير متوفر في هذه الفاتورة.");
    }
  };

  const handleSendWhatsAppReady = (inv: Invoice) => {
    let servicesText = inv.customers.map(c => c.services.map(s => s.serviceId).join(", ")).join(" - ");
    let readyTemplate = settings.readyMessage || "عزيزنا {اسم_العميل}، طلباتك بالفاتورة {رقم_الفاتورة} جاهزة في الدرج {رقم_الارشيف}.";
    
    const primaryCustomer = inv.customers[0];
    let msg = readyTemplate
      .replace(/{اسم_العميل}/g, primaryCustomer.arabicName)
      .replace(/{رقم_الفاتورة}/g, inv.invoiceId.toString())
      .replace(/{رقم_الارشيف}/g, inv.archiveDrawer || "")
      .replace(/{الخدمات}/g, servicesText);

    const rawPhone = primaryCustomer.phone ? primaryCustomer.phone.trim() : "";
    if (rawPhone) {
      let cleanPhone = rawPhone.replace(/\D/g, "");
      if (cleanPhone.startsWith("0")) cleanPhone = "2" + cleanPhone;
      const waUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`;
      window.open(waUrl, "_blank");
    } else {
      alert("رقم هاتف العميل غير متوفر.");
    }
  };

  const handleSendWhatsAppDelivered = (inv: Invoice) => {
    let deliveryTemplate = settings.deliveryMessage || "تم تسليم أوراقك بنجاح يا {اسم_العميل} الفاتورة {رقم_الفاتورة}.";
    const primaryCustomer = inv.customers[0];
    let msg = deliveryTemplate
      .replace(/{اسم_العميل}/g, primaryCustomer.arabicName)
      .replace(/{رقم_الفاتورة}/g, inv.invoiceId.toString());

    const rawPhone = primaryCustomer.phone ? primaryCustomer.phone.trim() : "";
    if (rawPhone) {
      let cleanPhone = rawPhone.replace(/\D/g, "");
      if (cleanPhone.startsWith("0")) cleanPhone = "2" + cleanPhone;
      const waUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`;
      window.open(waUrl, "_blank");
    } else {
      alert("رقم هاتف العميل غير متوفر.");
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

      editCustomers.forEach((cust) => {
        cust.services.forEach((s) => {
          const matched = services.find(srv => srv.id === s.serviceId || srv.name === s.serviceId);
          if (matched) {
            totalGov += matched.govPrice * s.quantity;
            totalOffice += matched.officeFee * s.quantity;
            totalAmount += (matched.govPrice + matched.officeFee) * s.quantity;
            s.price = (matched.govPrice + matched.officeFee) * s.quantity;

            // Recalculate delivery date according to official working days and Saturday rule for #
            const customHolidays = settings.customHolidays || [];
            const calcResult = calculateWorkingDaysDeliveryDate(
              editingInvoice.date || new Date(),
              matched.deliveryDaysOffset || 0,
              customHolidays,
              matched.name,
              settings.includeSaturdayAsWeekend !== false
            );
            s.deliveryDate = calcResult.deliveryDate;
          }
        });
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
              {invoices.length} فاتورة
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-1">البحث عن فواتير الأسر، تعيين أدراج الأرشفة، وتحديث الحالات واسترجاع السجلات</p>
        </div>

        {/* Action Buttons: Import previous invoices from Google Sheet */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={handleImportFromSheet}
            disabled={isImporting}
            className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white font-bold rounded-xl text-xs flex items-center gap-2 shadow-xs transition-all cursor-pointer font-cairo"
            title="استيراد واسترجاع جميع الفواتير السابقة المخزنة في قاعدة بيانات جوجل شيت إكسيل"
          >
            <FileSpreadsheet className={`w-4 h-4 ${isImporting ? "animate-spin" : ""}`} />
            <span>{isImporting ? "جاري استيراد الفواتير من الشيت..." : "استيراد الفواتير من شيت إكسيل (Google Sheets)"}</span>
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
                    <span>تاريخ: {inv.date}</span>
                    <span className="text-slate-300">|</span>
                    <span>بواسطة: {inv.employeeName}</span>
                  </div>
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

                      {/* Customer services list */}
                      <div className="mt-1.5 space-y-1 pl-1">
                        {cust.services.map((s, sIdx) => (
                          <div key={sIdx} className="flex justify-between text-[11px] text-slate-600">
                            <span>• {s.serviceId}</span>
                            <span className="font-mono">x{s.quantity}</span>
                          </div>
                        ))}
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

                <div className="flex gap-1.5">
                  {inv.status === InvoiceStatus.NEW && (
                    <button
                      onClick={() => handleOpenDrawerPrompt(inv)}
                      className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold font-cairo text-[11px] px-3 py-1.5 rounded-lg flex items-center gap-1.5 shadow-xs transition-colors"
                    >
                      <PackageOpen className="w-3.5 h-3.5" />
                      جاهز للتسليم
                    </button>
                  )}

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

        {/* Empty state when no invoices match or database was cleared */}
        {filteredInvoices.length === 0 && (
          <div className="col-span-full bg-white border border-slate-200 rounded-2xl p-10 text-center space-y-4 shadow-2xs">
            <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center mx-auto shadow-inner">
              <FileSpreadsheet className="w-8 h-8" />
            </div>
            <div className="space-y-1.5 max-w-md mx-auto">
              <h4 className="font-extrabold text-slate-800 text-base font-cairo">لا توجد فواتير معروضة حالياً</h4>
              <p className="text-xs text-slate-500 leading-relaxed font-cairo">
                إذا كنت قد قمت بتعديل الأكواد البرمجية أو إعادة تشغيل النظام وتم مسح الفواتير المحلية، يمكنك استرجاع واستيراد كافة الفواتير السابقة المخزنة بأمان في قاعدة بيانات شيت إكسيل (Google Sheets) بضغطة زر واحدة.
              </p>
            </div>
            <button
              onClick={handleImportFromSheet}
              disabled={isImporting}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white rounded-xl text-xs font-bold transition-all shadow-md cursor-pointer font-cairo"
            >
              <FileSpreadsheet className={`w-4 h-4 ${isImporting ? "animate-spin" : ""}`} />
              <span>{isImporting ? "جاري الاستيراد..." : "استيراد الفواتير السابقة من قاعدة بيانات الشيت إكسيل"}</span>
            </button>
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

                  <div className="grid md:grid-cols-2 gap-4">
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
                  </div>

                  {/* Edit selected services */}
                  <div className="space-y-2">
                    <span className="text-[11px] font-bold text-slate-600 block">تعديل الخدمات للعميل:</span>
                    {cust.services.map((s, sIdx) => (
                      <div key={sIdx} className="flex gap-3 items-center bg-slate-50 p-2.5 rounded-lg border border-slate-150">
                        <select
                          value={s.serviceId}
                          onChange={(e) => {
                            const updated = [...editCustomers];
                            updated[cIdx].services[sIdx].serviceId = e.target.value;
                            setEditCustomers(updated);
                          }}
                          className="flex-1 bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs"
                        >
                          {services.map((srv, idx) => (
                            <option key={srv.id} value={srv.name}>
                              {idx + 1}. {srv.name}
                            </option>
                          ))}
                        </select>
                        <input
                          type="number"
                          min="1"
                          value={s.quantity}
                          onChange={(e) => {
                            const updated = [...editCustomers];
                            updated[cIdx].services[sIdx].quantity = parseInt(e.target.value) || 1;
                            setEditCustomers(updated);
                          }}
                          className="w-16 bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-mono text-center"
                        />
                      </div>
                    ))}
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

      {/* Import Result Notification Modal */}
      {importResultModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl animate-fade-in-up font-cairo border border-slate-100">
            <div className="p-6 text-center space-y-4">
              <div className="w-14 h-14 bg-emerald-100 text-emerald-600 rounded-2xl flex items-center justify-center mx-auto shadow-inner">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <div className="space-y-1">
                <h3 className="font-extrabold text-base text-slate-900">تم استيراد الفواتير بنجاح!</h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  {importResultModal.message}
                </p>
              </div>

              <div className="grid grid-cols-3 gap-2 bg-slate-50 p-3 rounded-xl border border-slate-200 text-center">
                <div className="p-1.5">
                  <span className="text-[10px] text-slate-500 block font-bold">إجمالي بالشيت</span>
                  <span className="text-lg font-black text-slate-800 font-mono">{importResultModal.count}</span>
                </div>
                <div className="p-1.5 border-r border-l border-slate-200">
                  <span className="text-[10px] text-emerald-600 block font-bold">جديدة مضافة</span>
                  <span className="text-lg font-black text-emerald-600 font-mono">+{importResultModal.newCount}</span>
                </div>
                <div className="p-1.5">
                  <span className="text-[10px] text-blue-600 block font-bold">محدثة ومزامنة</span>
                  <span className="text-lg font-black text-blue-600 font-mono">{importResultModal.updatedCount}</span>
                </div>
              </div>

              <div className="pt-2">
                <button
                  onClick={() => setImportResultModal(null)}
                  className="w-full py-2.5 bg-slate-950 hover:bg-slate-900 text-white rounded-xl text-xs font-bold transition-all shadow-md cursor-pointer"
                >
                  إغلاق وعرض الفواتير المستوردة ({importResultModal.totalInvoices})
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
