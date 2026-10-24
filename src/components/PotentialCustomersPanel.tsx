import React, { useState, useMemo } from "react";
import { 
  Users, 
  Search, 
  Camera, 
  Plus, 
  Download, 
  RefreshCw, 
  Trash2, 
  Edit2, 
  CheckCircle, 
  FileText, 
  User, 
  ArrowRight, 
  Sparkles, 
  Phone, 
  Calendar, 
  Briefcase, 
  FileSpreadsheet,
  CheckSquare,
  Square,
  AlertCircle
} from "lucide-react";
import { PotentialCustomer, DictionaryItem, AppSettings } from "../types";
import { 
  savePotentialCustomers, 
  updatePotentialCustomerOnServer, 
  deletePotentialCustomerOnServer, 
  syncPotentialCustomersToGoogleSheets, 
  exportPotentialCustomersToExcel 
} from "../lib/api";
import DocumentScannerModal from "./DocumentScannerModal";

interface PotentialCustomersPanelProps {
  potentialCustomers: PotentialCustomer[];
  onCustomersUpdated: (updatedList: PotentialCustomer[]) => void;
  onUseCustomerInInvoice: (customer: PotentialCustomer) => void;
  dictionary?: DictionaryItem[];
  settings?: AppSettings;
}

export default function PotentialCustomersPanel({
  potentialCustomers,
  onCustomersUpdated,
  onUseCustomerInInvoice,
  dictionary = [],
  settings,
}: PotentialCustomersPanelProps) {
  // Search & Filter state
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "new" | "used">("all");
  const [docFilter, setDocFilter] = useState<"all" | "national_id" | "birth_cert">("all");

  // Selection state
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Modals state
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<PotentialCustomer | null>(null);

  // Syncing state
  const [isSyncing, setIsSyncing] = useState(false);
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);

  // Manual Add Form State
  const [manualForm, setManualForm] = useState({
    arabicName: "",
    englishName: "",
    nationalId: "",
    birthDate: "",
    profession: "",
    phone: "",
    applicantCapacity: "",
    documentType: "بطاقة_رقم_قومي" as "بطاقة_رقم_قومي" | "شهادة_ميلاد" | "يدوي",
    notes: "",
  });

  const showNotice = (msg: string) => {
    setNoticeMessage(msg);
    setTimeout(() => setNoticeMessage(null), 4000);
  };

  // Filtered List
  const filteredCustomers = useMemo(() => {
    return potentialCustomers.filter((c) => {
      // Search
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        const nameMatch = c.arabicName?.toLowerCase().includes(term);
        const enMatch = c.englishName?.toLowerCase().includes(term);
        const nidMatch = c.nationalId?.includes(term);
        const profMatch = c.profession?.toLowerCase().includes(term);
        const phoneMatch = c.phone?.includes(term);
        if (!nameMatch && !enMatch && !nidMatch && !profMatch && !phoneMatch) {
          return false;
        }
      }

      // Status
      if (statusFilter === "new" && c.status === "تم_التحويل_لفاتورة") return false;
      if (statusFilter === "used" && c.status !== "تم_التحويل_لفاتورة") return false;

      // Document Type
      if (docFilter === "national_id" && c.documentType !== "بطاقة_رقم_قومي") return false;
      if (docFilter === "birth_cert" && c.documentType !== "شهادة_ميلاد") return false;

      return true;
    });
  }, [potentialCustomers, searchTerm, statusFilter, docFilter]);

  // Counters
  const totalCount = potentialCustomers.length;
  const idCardsCount = potentialCustomers.filter((c) => c.documentType !== "شهادة_ميلاد").length;
  const birthCertsCount = potentialCustomers.filter((c) => c.documentType === "شهادة_ميلاد").length;
  const newCount = potentialCustomers.filter((c) => c.status !== "تم_التحويل_لفاتورة").length;
  const usedCount = potentialCustomers.filter((c) => c.status === "تم_التحويل_لفاتورة").length;

  // Purge any legacy converted customers
  const handlePurgeUsed = async () => {
    const used = potentialCustomers.filter((c) => c.status === "تم_التحويل_لفاتورة");
    if (used.length === 0) return;
    if (!confirm(`هل تريد حذف جميع العملاء المحولين لفواتير وعددهم (${used.length}) نهائياً؟`)) return;
    try {
      for (const c of used) {
        await deletePotentialCustomerOnServer(c.id);
      }
      const updatedList = potentialCustomers.filter((c) => c.status !== "تم_التحويل_لفاتورة");
      onCustomersUpdated(updatedList);
      showNotice(`تم حذف ${used.length} عميل محول لفاتورة بنجاح.`);
    } catch (err: any) {
      alert("خطأ أثناء الحذف: " + err.message);
    }
  };

  // Toggle selection
  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    if (selectedIds.length === filteredCustomers.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredCustomers.map((c) => c.id));
    }
  };

  // Save new scanned customer
  const handleSaveScannedCustomer = async (cust: Partial<PotentialCustomer>, useImmediately?: boolean) => {
    try {
      const updated = await savePotentialCustomers([cust]);
      onCustomersUpdated(updated);
      showNotice("تم حفظ العميل في قائمة العملاء المحتملين بنجاح! 💾");

      if (useImmediately && updated.length > 0) {
        const target = updated.find((c) => c.nationalId === cust.nationalId) || updated[0];
        if (target) {
          onUseCustomerInInvoice(target);
        }
      }
    } catch (err: any) {
      alert("خطأ أثناء الحفظ: " + err.message);
    }
  };

  // Save manual customer
  const handleSaveManual = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualForm.arabicName.trim() || !manualForm.nationalId.trim()) {
      alert("يرجى إدخال الاسم الرباعي والرقم القومي 14 رقم.");
      return;
    }

    try {
      const newCust: Partial<PotentialCustomer> = {
        arabicName: manualForm.arabicName.trim(),
        englishName: manualForm.englishName.trim() || undefined,
        nationalId: manualForm.nationalId.trim(),
        birthDate: manualForm.birthDate.trim() || undefined,
        profession: manualForm.profession.trim() || "",
        phone: manualForm.phone.trim() || undefined,
        applicantCapacity: manualForm.applicantCapacity.trim() || undefined,
        documentType: manualForm.documentType,
        notes: manualForm.notes.trim() || undefined,
        status: "جديد",
        createdAt: new Date().toISOString().split("T")[0],
      };

      const updated = await savePotentialCustomers([newCust]);
      onCustomersUpdated(updated);
      setIsManualModalOpen(false);
      setManualForm({
        arabicName: "",
        englishName: "",
        nationalId: "",
        birthDate: "",
        profession: "",
        phone: "",
        applicantCapacity: "",
        documentType: "بطاقة_رقم_قومي",
        notes: "",
      });
      showNotice("تمت إضافة العميل المحتمل بنجاح!");
    } catch (err: any) {
      alert("خطأ أثناء الإضافة: " + err.message);
    }
  };

  // Edit Customer
  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCustomer) return;

    try {
      const updatedItem = await updatePotentialCustomerOnServer(editingCustomer.id, editingCustomer);
      const updatedList = potentialCustomers.map((c) =>
        c.id === updatedItem.id ? updatedItem : c
      );
      onCustomersUpdated(updatedList);
      setEditingCustomer(null);
      showNotice("تم تحديث بيانات العميل بنجاح!");
    } catch (err: any) {
      alert("خطأ أثناء التعديل: " + err.message);
    }
  };

  // Delete Customer
  const handleDeleteCustomer = async (id: string) => {
    if (!confirm("هل أنت متأكد من رغبتك في حذف هذا العميل من القائمة؟")) return;
    try {
      await deletePotentialCustomerOnServer(id);
      const updatedList = potentialCustomers.filter((c) => c.id !== id);
      onCustomersUpdated(updatedList);
      setSelectedIds((prev) => prev.filter((i) => i !== id));
      showNotice("تم حذف العميل بنجاح.");
    } catch (err: any) {
      alert("خطأ أثناء الحذف: " + err.message);
    }
  };

  // Bulk Delete
  const handleBulkDelete = async () => {
    if (!confirm(`هل أنت متأكد من حذف ${selectedIds.length} عميل محدد؟`)) return;
    try {
      for (const id of selectedIds) {
        await deletePotentialCustomerOnServer(id);
      }
      const updatedList = potentialCustomers.filter((c) => !selectedIds.includes(c.id));
      onCustomersUpdated(updatedList);
      setSelectedIds([]);
      showNotice(`تم حذف ${selectedIds.length} عميل بنجاح.`);
    } catch (err: any) {
      alert("خطأ أثناء الحذف: " + err.message);
    }
  };

  // Export to Excel / CSV
  const handleExportExcel = () => {
    const listToExport = selectedIds.length > 0
      ? potentialCustomers.filter((c) => selectedIds.includes(c.id))
      : filteredCustomers;

    if (listToExport.length === 0) {
      alert("لا توجد بيانات عملاء لتصديرها.");
      return;
    }
    exportPotentialCustomersToExcel(listToExport);
  };

  // Sync to Google Sheet
  const handleSyncToGoogleSheets = async () => {
    const webhookUrl = settings?.googleSheetWebhookUrl;
    if (!webhookUrl || !webhookUrl.startsWith("http")) {
      alert("يرجى إدخال رابط سكربت Webhook صالح أولاً في قسم إعدادات جوجل شيت.");
      return;
    }

    setIsSyncing(true);
    try {
      const res = await syncPotentialCustomersToGoogleSheets(webhookUrl);
      showNotice(res.message || "تمت مزامنة ورقة العملاء المحتملين مع جوجل شيت بنجاح! 📊");
    } catch (err: any) {
      alert("فشل المزامنة مع جوجل شيت: " + err.message);
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="space-y-6 font-cairo">
      
      {/* Header Banner & Metrics */}
      <div className="bg-linear-to-r from-slate-900 via-slate-800 to-indigo-950 rounded-3xl p-6 text-white shadow-lg border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-indigo-600/30 rounded-2xl border border-indigo-400/30 text-indigo-300">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold flex items-center gap-2">
                <span>قائمة العملاء المحتملين</span>
                <span className="text-xs bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2.5 py-0.5 rounded-full font-bold">
                  {newCount} متاح للاستخدام
                </span>
              </h1>
              <p className="text-xs text-slate-300">
                تسجيل ومسح بيانات العملاء من البطاقات الشخصية وشهادات الميلاد وتجهيزها للاستخدام المباشر في الفواتير
              </p>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => setIsScannerOpen(true)}
            className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-md hover:shadow-indigo-500/20 transition-all cursor-pointer"
            title="فتح الكاميرا ومسح البطاقة الشخصية أو شهادة الميلاد بالذكاء الاصطناعي"
          >
            <Camera className="w-4 h-4 text-emerald-300" />
            <span>📸 تصوير / مسح مستند ذكي</span>
          </button>

          <button
            type="button"
            onClick={() => setIsManualModalOpen(true)}
            className="px-3.5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>إضافة يدوية</span>
          </button>

          <button
            type="button"
            onClick={handleExportExcel}
            className="px-3.5 py-2.5 bg-emerald-700 hover:bg-emerald-600 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs transition-all cursor-pointer"
            title="تصدير شيت إكسيل للعملاء المحتملين (ورقة جديدة مخصصة)"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-200" />
            <span>تصدير إكسيل</span>
          </button>

          <button
            type="button"
            onClick={handleSyncToGoogleSheets}
            disabled={isSyncing}
            className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl transition-all cursor-pointer disabled:opacity-50"
            title="مزامنة مع ورقة (العملاء المحتملين) بجوجل شيت"
          >
            <RefreshCw className={`w-4 h-4 ${isSyncing ? "animate-spin text-indigo-400" : ""}`} />
          </button>
        </div>
      </div>

      {/* Notice Message */}
      {noticeMessage && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-xs font-bold text-emerald-900 flex items-center gap-2 shadow-xs animate-in fade-in">
          <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{noticeMessage}</span>
        </div>
      )}

      {/* Informational tip */}
      <div className="bg-slate-50 border border-slate-200 rounded-2xl px-4 py-2.5 flex items-center justify-between text-xs text-slate-600">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-indigo-500 shrink-0" />
          <span>💡 <strong>ميزة تلقائية:</strong> يتم حذف العميل المحتمل تلقائياً من هذه القائمة بمجرد استخدامه وحفظه داخل فاتورة لانتهاء الغرض منه.</span>
        </div>
        {usedCount > 0 && (
          <button
            type="button"
            onClick={handlePurgeUsed}
            className="px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold transition-all cursor-pointer shadow-xs shrink-0"
          >
            حذف المحولين سابقاً ({usedCount}) 🗑️
          </button>
        )}
      </div>

      {/* Stat Cards Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 rounded-2xl p-4 flex items-center justify-between shadow-2xs">
          <div className="space-y-1">
            <span className="text-xs text-slate-500 font-bold">إجمالي العملاء المحتملين</span>
            <div className="text-2xl font-black text-slate-900 font-mono">{totalCount}</div>
          </div>
          <div className="p-3 bg-slate-100 rounded-xl text-slate-700">
            <Users className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white border border-emerald-200 rounded-2xl p-4 flex items-center justify-between shadow-2xs">
          <div className="space-y-1">
            <span className="text-xs text-emerald-700 font-bold">بطاقات رقم قومي</span>
            <div className="text-2xl font-black text-emerald-700 font-mono">{idCardsCount}</div>
          </div>
          <div className="p-3 bg-emerald-50 rounded-xl text-emerald-700">
            <User className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white border border-blue-200 rounded-2xl p-4 flex items-center justify-between shadow-2xs">
          <div className="space-y-1">
            <span className="text-xs text-blue-700 font-bold">شهادات ميلاد</span>
            <div className="text-2xl font-black text-blue-800 font-mono">{birthCertsCount}</div>
          </div>
          <div className="p-3 bg-blue-50 rounded-xl text-blue-700">
            <FileText className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Search & Filter Toolbar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3 shadow-2xs">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          
          {/* Search Bar */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="ابحث بالاسم، الرقم القومي، المهنة، أو رقم الهاتف..."
              className="w-full bg-slate-50 border border-slate-200 rounded-xl pr-10 pl-4 py-2.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 font-bold"
            />
          </div>

          {/* Status Filter Tabs */}
          <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl text-xs font-bold">
            <button
              onClick={() => setStatusFilter("all")}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                statusFilter === "all" ? "bg-white text-slate-900 shadow-xs" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              الكل ({totalCount})
            </button>
            <button
              onClick={() => setStatusFilter("new")}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                statusFilter === "new" ? "bg-white text-emerald-700 shadow-xs" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              متاح جديد ({newCount})
            </button>
            <button
              onClick={() => setStatusFilter("used")}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                statusFilter === "used" ? "bg-white text-blue-700 shadow-xs" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              مستخدم بفاتورة ({usedCount})
            </button>
          </div>

          {/* Doc Type Filter */}
          <div className="flex items-center gap-1.5 text-xs font-bold">
            <select
              value={docFilter}
              onChange={(e: any) => setDocFilter(e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-700 focus:outline-hidden"
            >
              <option value="all">كافة المستندات</option>
              <option value="national_id">بطاقات رقم قومي</option>
              <option value="birth_cert">شهادات ميلاد</option>
            </select>
          </div>

        </div>

        {/* Selected Items Bulk Actions Bar */}
        {selectedIds.length > 0 && (
          <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-2.5 flex items-center justify-between text-xs text-indigo-950 font-bold animate-in fade-in">
            <div className="flex items-center gap-2">
              <CheckSquare className="w-4 h-4 text-indigo-600" />
              <span>تم تحديد {selectedIds.length} عميل محتمل</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleExportExcel}
                className="px-2.5 py-1 bg-white border border-indigo-300 hover:bg-indigo-100 rounded-lg text-indigo-800 transition-colors"
              >
                تصدير المحددين لإكسيل
              </button>
              <button
                type="button"
                onClick={handleBulkDelete}
                className="px-2.5 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg transition-colors flex items-center gap-1"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>حذف المحددين</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Main Table View */}
      <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-right border-collapse text-xs">
            <thead>
              <tr className="bg-slate-100/80 border-b border-slate-200 text-slate-600 font-bold font-cairo">
                <th className="p-3.5 w-10 text-center">
                  <button
                    type="button"
                    onClick={handleSelectAll}
                    className="p-1 hover:text-indigo-600 cursor-pointer"
                  >
                    {selectedIds.length === filteredCustomers.length && filteredCustomers.length > 0 ? (
                      <CheckSquare className="w-4 h-4 text-indigo-600" />
                    ) : (
                      <Square className="w-4 h-4 text-slate-400" />
                    )}
                  </button>
                </th>
                <th className="p-3.5">الاسم بالكامل (عربي / إنجليزي)</th>
                <th className="p-3.5">الرقم القومي (14 رقم)</th>
                <th className="p-3.5">تاريخ الميلاد</th>
                <th className="p-3.5">المهنة بالاستمارة</th>
                <th className="p-3.5">نوع المستند</th>
                <th className="p-3.5">الهاتف</th>
                <th className="p-3.5">الحالة</th>
                <th className="p-3.5 text-center">الإجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-150">
              {filteredCustomers.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-12 text-center text-slate-400">
                    <Users className="w-10 h-10 mx-auto text-slate-300 mb-2" />
                    <p className="font-bold text-sm text-slate-600">لا يوجد عملاء محتملون يطابقون البحث</p>
                    <p className="text-xs text-slate-400 mt-1">
                      يمكنك مسح وجه وظهور بطاقات العملاء أو شهادات الميلاد بالضغط على "مسح مستند ذكي"
                    </p>
                  </td>
                </tr>
              ) : (
                filteredCustomers.map((cust, idx) => {
                  const isSelected = selectedIds.includes(cust.id);
                  const isUsed = cust.status === "تم_التحويل_لفاتورة";

                  return (
                    <tr
                      key={cust.id}
                      className={`hover:bg-slate-50/80 transition-colors ${
                        isSelected ? "bg-indigo-50/50" : ""
                      }`}
                    >
                      <td className="p-3.5 text-center">
                        <button
                          type="button"
                          onClick={() => handleToggleSelect(cust.id)}
                          className="cursor-pointer"
                        >
                          {isSelected ? (
                            <CheckSquare className="w-4 h-4 text-indigo-600" />
                          ) : (
                            <Square className="w-4 h-4 text-slate-300 hover:text-slate-500" />
                          )}
                        </button>
                      </td>

                      <td className="p-3.5">
                        <div className="font-bold text-slate-900 text-xs">
                          {idx + 1}. {cust.arabicName}
                        </div>
                        {cust.englishName && (
                          <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                            {cust.englishName}
                          </div>
                        )}
                        {cust.notes && (
                          <div className="text-[10px] text-amber-700 bg-amber-50 rounded-sm px-1.5 py-0.2 mt-0.5 inline-block">
                            📝 {cust.notes}
                          </div>
                        )}
                      </td>

                      <td className="p-3.5 font-mono font-bold text-slate-800 tracking-wider">
                        {cust.nationalId}
                      </td>

                      <td className="p-3.5 font-mono text-slate-600">
                        {cust.birthDate || "-"}
                      </td>

                      <td className="p-3.5">
                        <span className="font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded-md">
                          {cust.profession || (cust.documentType === "شهادة_ميلاد" ? "طالب" : "غير محدد")}
                        </span>
                      </td>

                      <td className="p-3.5">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${
                          cust.documentType === "شهادة_ميلاد"
                            ? "bg-amber-50 text-amber-800 border-amber-200"
                            : "bg-indigo-50 text-indigo-800 border-indigo-200"
                        }`}>
                          {cust.documentType === "شهادة_ميلاد" ? "📜 شهادة ميلاد" : "🆔 بطاقة شخصية"}
                        </span>
                      </td>

                      <td className="p-3.5 font-mono text-slate-600">
                        {cust.phone || <span className="text-slate-300 text-[10px]">يكتب عند الفاتورة</span>}
                      </td>

                      <td className="p-3.5">
                        {isUsed ? (
                          <span className="text-[10px] font-bold bg-blue-100 text-blue-800 px-2 py-0.5 rounded-md border border-blue-200">
                            فاتورة #{cust.invoiceId || ""}
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-md border border-emerald-200">
                            متاح للاستخدام ✨
                          </span>
                        )}
                      </td>

                      <td className="p-3.5">
                        <div className="flex items-center justify-center gap-1.5">
                          {/* Use immediately in invoice */}
                          <button
                            type="button"
                            onClick={() => onUseCustomerInInvoice(cust)}
                            className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[11px] font-bold flex items-center gap-1 shadow-2xs transition-colors cursor-pointer"
                            title="إدراج هذا العميل في فاتورة جديدة الآن"
                          >
                            <Sparkles className="w-3 h-3" />
                            <span>إنشاء فاتورة</span>
                          </button>

                          {/* Edit */}
                          <button
                            type="button"
                            onClick={() => setEditingCustomer(cust)}
                            className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer"
                            title="تعديل بيانات العميل"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>

                          {/* Delete */}
                          <button
                            type="button"
                            onClick={() => handleDeleteCustomer(cust.id)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                            title="حذف العميل"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* AI OCR Document Scanner Modal */}
      <DocumentScannerModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onSaveCustomer={handleSaveScannedCustomer}
        dictionary={dictionary}
        applicantCapacities={settings?.applicantCapacities}
        allowDirectUse={true}
      />

      {/* Manual Add Customer Modal */}
      {isManualModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs font-cairo">
          <div className="bg-white rounded-3xl p-6 shadow-2xl border border-slate-200 w-full max-w-lg space-y-4">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Plus className="w-5 h-5 text-indigo-600" />
              <span>إضافة عميل محتمل يدوياً</span>
            </h2>

            <form onSubmit={handleSaveManual} className="space-y-3.5 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-bold text-slate-700 block">
                    الاسم بالكامل (عربي) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={manualForm.arabicName}
                    onChange={(e) => setManualForm({ ...manualForm, arabicName: e.target.value })}
                    placeholder="الاسم الرباعي..."
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-900"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-700 block">الاسم بالإنجليزي</label>
                  <input
                    type="text"
                    value={manualForm.englishName}
                    onChange={(e) => setManualForm({ ...manualForm, englishName: e.target.value.toUpperCase() })}
                    placeholder="FULL NAME..."
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono font-bold"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-700 block">
                    الرقم القومي (14 رقم) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={14}
                    value={manualForm.nationalId}
                    onChange={(e) => setManualForm({ ...manualForm, nationalId: e.target.value.replace(/\D/g, "") })}
                    placeholder="29508121601234"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono font-bold"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-700 block">تاريخ الميلاد</label>
                  <input
                    type="date"
                    value={manualForm.birthDate}
                    onChange={(e) => setManualForm({ ...manualForm, birthDate: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono font-bold"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-700 block">المهنة</label>
                  <input
                    type="text"
                    value={manualForm.profession}
                    onChange={(e) => setManualForm({ ...manualForm, profession: e.target.value })}
                    placeholder="المهنة بالبطاقة..."
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-700 block">رقم الهاتف (اختياري)</label>
                  <input
                    type="tel"
                    maxLength={11}
                    value={manualForm.phone}
                    onChange={(e) => setManualForm({ ...manualForm, phone: e.target.value.replace(/\D/g, "") })}
                    placeholder="01XXXXXXXXX"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono font-bold"
                  />
                </div>

                <div className="space-y-1 sm:col-span-2">
                  <label className="font-bold text-slate-700 block">نوع المستند</label>
                  <select
                    value={manualForm.documentType}
                    onChange={(e: any) => setManualForm({ ...manualForm, documentType: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold"
                  >
                    <option value="بطاقة_رقم_قومي">بطاقة رقم قومي</option>
                    <option value="شهادة_ميلاد">شهادة ميلاد</option>
                    <option value="يدوي">إدخال يدوي</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsManualModalOpen(false)}
                  className="px-4 py-2 border border-slate-300 text-slate-700 hover:bg-slate-100 rounded-xl font-bold cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold cursor-pointer"
                >
                  حفظ العميل
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Customer Modal */}
      {editingCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs font-cairo">
          <div className="bg-white rounded-3xl p-6 shadow-2xl border border-slate-200 w-full max-w-lg space-y-4">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Edit2 className="w-5 h-5 text-indigo-600" />
              <span>تعديل بيانات العميل المحتمل</span>
            </h2>

            <form onSubmit={handleSaveEdit} className="space-y-3.5 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-bold text-slate-700 block">الاسم بالكامل (عربي)</label>
                  <input
                    type="text"
                    required
                    value={editingCustomer.arabicName}
                    onChange={(e) => setEditingCustomer({ ...editingCustomer, arabicName: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-900"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-700 block">الاسم بالإنجليزي</label>
                  <input
                    type="text"
                    value={editingCustomer.englishName || ""}
                    onChange={(e) => setEditingCustomer({ ...editingCustomer, englishName: e.target.value.toUpperCase() })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono font-bold"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-700 block">الرقم القومي</label>
                  <input
                    type="text"
                    required
                    maxLength={14}
                    value={editingCustomer.nationalId}
                    onChange={(e) => setEditingCustomer({ ...editingCustomer, nationalId: e.target.value.replace(/\D/g, "") })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono font-bold"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-700 block">تاريخ الميلاد</label>
                  <input
                    type="date"
                    value={editingCustomer.birthDate || ""}
                    onChange={(e) => setEditingCustomer({ ...editingCustomer, birthDate: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono font-bold"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-700 block">المهنة</label>
                  <input
                    type="text"
                    value={editingCustomer.profession || ""}
                    onChange={(e) => setEditingCustomer({ ...editingCustomer, profession: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-700 block">رقم الهاتف</label>
                  <input
                    type="tel"
                    maxLength={11}
                    value={editingCustomer.phone || ""}
                    onChange={(e) => setEditingCustomer({ ...editingCustomer, phone: e.target.value.replace(/\D/g, "") })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono font-bold"
                  />
                </div>

                <div className="space-y-1 sm:col-span-2">
                  <label className="font-bold text-slate-700 block">ملاحظات</label>
                  <input
                    type="text"
                    value={editingCustomer.notes || ""}
                    onChange={(e) => setEditingCustomer({ ...editingCustomer, notes: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setEditingCustomer(null)}
                  className="px-4 py-2 border border-slate-300 text-slate-700 hover:bg-slate-100 rounded-xl font-bold cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold cursor-pointer"
                >
                  حفظ التعديلات
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
