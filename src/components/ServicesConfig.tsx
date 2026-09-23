import React, { useState } from "react";
import { Service, Employee } from "../types";
import { 
  createServiceOnServer, 
  updateServiceOnServer, 
  deleteServiceOnServer, 
  reorderServicesOnServer,
  pullDataFromGoogleWebhook,
  pushDataToGoogleWebhook
} from "../lib/api";
import { 
  Plus, Edit3, Trash2, Check, X, ShieldAlert, Sparkles, FolderPlus, DollarSign, Clock, FileText,
  ArrowUp, ArrowDown, ChevronsUp, ChevronsDown, ArrowUpDown, CheckCircle2, ArrowDownAZ, Hash, Loader2,
  Download
} from "lucide-react";

interface ServicesConfigProps {
  services: Service[];
  activeEmployee: Employee;
  onServiceCreated: (srv: Service) => void;
  onServiceUpdated: (srv: Service) => void;
  onServiceDeleted: (id: string) => void;
  onServicesReordered?: (services: Service[]) => void;
  googleSheetWebhookUrl?: string;
  onReloadDatabase?: () => Promise<void>;
}

export default function ServicesConfig({ 
  services, 
  activeEmployee, 
  onServiceCreated, 
  onServiceUpdated, 
  onServiceDeleted,
  onServicesReordered,
  googleSheetWebhookUrl,
  onReloadDatabase
}: ServicesConfigProps) {
  const [editingServiceId, setEditingServiceId] = useState<string | null>(null);

  // Sheet sync states
  const [sheetLoading, setSheetLoading] = useState(false);
  const [sheetFeedback, setSheetFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const handlePullFromSheets = async () => {
    const confirmPull = window.confirm("هل تريد استيراد وسحب أحدث الخدمات والأسعار من ملف جوجل شيت؟");
    if (!confirmPull) return;

    setSheetLoading(true);
    setSheetFeedback(null);
    try {
      const res = await pullDataFromGoogleWebhook(googleSheetWebhookUrl);
      if (onReloadDatabase) {
        await onReloadDatabase();
      }
      setSheetFeedback({
        type: "success",
        message: `تم استيراد ${res.db?.services?.length || 0} خدمة بنجاح من ملف جوجل شيت! 📥`
      });
      setTimeout(() => setSheetFeedback(null), 4000);
    } catch (err: any) {
      setSheetFeedback({
        type: "error",
        message: `فشل الاستيراد: ${err.message}`
      });
    } finally {
      setSheetLoading(false);
    }
  };

  const handlePushToSheets = async () => {
    const confirmPush = window.confirm("هل تريد رفع وحفظ مسميات الخدمات والأسعار الحالية إلى ملف جوجل شيت الآن؟");
    if (!confirmPush) return;

    setSheetLoading(true);
    setSheetFeedback(null);
    try {
      const res = await pushDataToGoogleWebhook(googleSheetWebhookUrl);
      setSheetFeedback({
        type: "success",
        message: res.message || "تم حفظ وتصدير الخدمات إلى جوجل شيت بنجاح! 📤"
      });
      setTimeout(() => setSheetFeedback(null), 4000);
    } catch (err: any) {
      setSheetFeedback({
        type: "error",
        message: `فشل التصدير: ${err.message}`
      });
    } finally {
      setSheetLoading(false);
    }
  };

  // Form states for creating/editing
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [name, setName] = useState("");
  const [govPrice, setGovPrice] = useState(0);
  const [officeFee, setOfficeFee] = useState(0);
  const [duration, setDuration] = useState("");
  const [instructions, setInstructions] = useState("");
  const [deliveryDaysOffset, setDeliveryDaysOffset] = useState(1);
  const [notes, setNotes] = useState("");

  // Reordering states
  const [isSavingOrder, setIsSavingOrder] = useState(false);
  const [orderFeedback, setOrderFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const showFeedback = (message: string, type: "success" | "error" = "success") => {
    setOrderFeedback({ type, message });
    setTimeout(() => {
      setOrderFeedback(null);
    }, 3000);
  };

  const handleMoveService = async (index: number, direction: "up" | "down" | "top" | "bottom") => {
    if (!activeEmployee.permissions.canManageServices) {
      alert("عذراً، ليست لديك صلاحية لإدارة وتعديل الخدمات.");
      return;
    }

    if (direction === "up" && index === 0) return;
    if (direction === "down" && index === services.length - 1) return;

    const newServices = [...services];
    if (direction === "up") {
      const temp = newServices[index];
      newServices[index] = newServices[index - 1];
      newServices[index - 1] = temp;
    } else if (direction === "down") {
      const temp = newServices[index];
      newServices[index] = newServices[index + 1];
      newServices[index + 1] = temp;
    } else if (direction === "top") {
      const [item] = newServices.splice(index, 1);
      newServices.unshift(item);
    } else if (direction === "bottom") {
      const [item] = newServices.splice(index, 1);
      newServices.push(item);
    }

    const updated = newServices.map((s, idx) => ({ ...s, order: idx + 1 }));
    if (onServicesReordered) {
      onServicesReordered(updated);
    }

    try {
      setIsSavingOrder(true);
      await reorderServicesOnServer(updated);
      showFeedback("تم حفظ الترتيب الجديد للخدمات بنجاح");
    } catch (err) {
      console.error(err);
      showFeedback("تعذر حفظ الترتيب على الخادم، يرجى المحاولة مرة أخرى", "error");
    } finally {
      setIsSavingOrder(false);
    }
  };

  const handleSortPreset = async (preset: "passportFirst" | "alphabetical" | "priceDesc" | "priceAsc") => {
    if (!activeEmployee.permissions.canManageServices) {
      alert("عذراً، ليست لديك صلاحية لإدارة وتعديل الخدمات.");
      return;
    }

    const newServices = [...services];
    if (preset === "passportFirst") {
      newServices.sort((a, b) => {
        const aPass = a.name.startsWith("#") || a.name.startsWith("##");
        const bPass = b.name.startsWith("#") || b.name.startsWith("##");
        if (aPass && !bPass) return -1;
        if (!aPass && bPass) return 1;
        return a.name.localeCompare(b.name, "ar");
      });
    } else if (preset === "alphabetical") {
      newServices.sort((a, b) => a.name.localeCompare(b.name, "ar"));
    } else if (preset === "priceDesc") {
      newServices.sort((a, b) => (b.govPrice + b.officeFee) - (a.govPrice + a.officeFee));
    } else if (preset === "priceAsc") {
      newServices.sort((a, b) => (a.govPrice + a.officeFee) - (b.govPrice + b.officeFee));
    }

    const updated = newServices.map((s, idx) => ({ ...s, order: idx + 1 }));
    if (onServicesReordered) {
      onServicesReordered(updated);
    }

    try {
      setIsSavingOrder(true);
      await reorderServicesOnServer(updated);
      showFeedback("تم تطبيق الترتيب الجديد وحفظه بنجاح");
    } catch (err) {
      console.error(err);
      showFeedback("حدث خطأ أثناء حفظ الترتيب السريع", "error");
    } finally {
      setIsSavingOrder(false);
    }
  };

  const resetForm = () => {
    setName("");
    setGovPrice(0);
    setOfficeFee(0);
    setDuration("");
    setInstructions("");
    setDeliveryDaysOffset(1);
    setNotes("");
    setEditingServiceId(null);
  };

  const handleCreateService = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeEmployee.permissions.canManageServices) {
      alert("عذراً، ليست لديك صلاحية لإدارة وتعديل الخدمات.");
      return;
    }

    if (!name.trim()) return;

    try {
      const payload: Partial<Service> = {
        name: name.trim(),
        govPrice,
        officeFee,
        duration: duration.trim(),
        instructions: instructions.trim(),
        deliveryDaysOffset,
        notes: notes.trim()
      };

      const result = await createServiceOnServer(payload);
      onServiceCreated(result);
      resetForm();
      setShowCreateForm(false);
      alert("تمت إضافة الخدمة الجديدة وحفظها في قاعدة البيانات وملف جوجل شيت لحظياً! ⚡📊");
    } catch (err) {
      console.error(err);
      alert("حدث خطأ أثناء إضافة الخدمة الجديدة.");
    }
  };

  const handleOpenEdit = (srv: Service) => {
    if (!activeEmployee.permissions.canManageServices) {
      alert("عذراً، ليست لديك صلاحية لإدارة وتعديل الخدمات.");
      return;
    }
    setEditingServiceId(srv.id);
    setName(srv.name);
    setGovPrice(srv.govPrice);
    setOfficeFee(srv.officeFee);
    setDuration(srv.duration);
    setInstructions(srv.instructions);
    setDeliveryDaysOffset(srv.deliveryDaysOffset || 1);
    setNotes(srv.notes || "");
  };

  const handleUpdateService = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingServiceId) return;

    try {
      const payload: Partial<Service> = {
        name: name.trim(),
        govPrice,
        officeFee,
        duration: duration.trim(),
        instructions: instructions.trim(),
        deliveryDaysOffset,
        notes: notes.trim()
      };

      const result = await updateServiceOnServer(editingServiceId, payload);
      onServiceUpdated(result);
      resetForm();
      alert("تم حفظ التعديلات وتحديث الأسعار في قاعدة البيانات وملف جوجل شيت لحظياً! ⚡📊");
    } catch (err) {
      console.error(err);
      alert("حدث خطأ أثناء حفظ التحديثات للخدمة.");
    }
  };

  const handleDeleteService = async (id: string) => {
    if (!activeEmployee.permissions.canManageServices) {
      alert("عذراً، ليست لديك صلاحية لإدارة وتعديل الخدمات.");
      return;
    }

    const srv = services.find(s => s.id === id);
    const srvName = srv ? srv.name : "هذه الخدمة";
    if (!confirm(`⚠️ تأكيد الحذف:\nهل أنت متأكد تماماً من حذف خدمة "${srvName}" نهائياً من الكتالوج وقاعدة البيانات وملف جوجل شيت؟`)) return;

    try {
      await deleteServiceOnServer(id);
      onServiceDeleted(id);
      showFeedback("تم حذف الخدمة وتحديث ملف جوجل شيت لحظياً! ⚡📊");
    } catch (err) {
      console.error(err);
      alert("حدث خطأ أثناء حذف الخدمة.");
    }
  };

  return (
    <div className="space-y-6 font-cairo">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900">شاشة كتالوج وإعدادات الخدمات</h2>
          <p className="text-sm text-slate-500 mt-1">تحديد الرسوم والمدد الزمنية والتعليمات وتوليد الهاشات الفردية (#)</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-2">
          {googleSheetWebhookUrl && (
            <>
              <div 
                className="flex items-center gap-1.5 px-3 py-2 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold rounded-xl shadow-xs"
                title="أي تعديل أو حفظ في الخدمات والأسعار يُحفظ تلقائياً في ملف جوجل شيت لحظياً"
              >
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                <span>مزامنة لحظية مع جوجل شيت ⚡</span>
              </div>

              <button
                type="button"
                onClick={handlePullFromSheets}
                disabled={sheetLoading}
                className="px-3.5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 transition-colors shadow-xs cursor-pointer disabled:opacity-50"
                title="سحب واستيراد أحدث مسميات الخدمات والأسعار من ملف جوجل شيت"
              >
                <Download className={`w-4 h-4 ${sheetLoading ? "animate-spin" : ""}`} />
                <span>استيراد الخدمات من جوجل شيت 📥</span>
              </button>

              <button
                type="button"
                onClick={handlePushToSheets}
                disabled={sheetLoading}
                className="px-3.5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white font-bold text-xs rounded-xl flex items-center gap-1.5 transition-colors shadow-xs cursor-pointer disabled:opacity-50"
                title="تصدير وحفظ قائمة الخدمات الحالية في ملف جوجل شيت"
              >
                <Download className="w-4 h-4 rotate-180 text-emerald-400" />
                <span>تصدير للشيت 📤</span>
              </button>
            </>
          )}

          {!showCreateForm && (
            <button
              onClick={() => {
                resetForm();
                setShowCreateForm(true);
              }}
              className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-xs rounded-xl flex items-center gap-1.5 transition-colors shadow-xs cursor-pointer"
            >
              <Plus className="w-4.5 h-4.5" />
              إضافة خدمة جديدة
            </button>
          )}
        </div>
      </div>

      {/* Sheet Feedback Alert */}
      {sheetFeedback && (
        <div className={`p-3.5 rounded-xl text-xs font-bold flex items-center justify-between shadow-xs ${
          sheetFeedback.type === "success" 
            ? "bg-emerald-50 text-emerald-900 border border-emerald-200" 
            : "bg-rose-50 text-rose-900 border border-rose-200"
        }`}>
          <span>{sheetFeedback.message}</span>
          <button 
            type="button" 
            onClick={() => setSheetFeedback(null)} 
            className="text-slate-400 hover:text-slate-700 font-bold p-1 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* Permission guard info */}
      {!activeEmployee.permissions.canManageServices && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-2xl p-4 flex items-start gap-3 text-xs leading-relaxed">
          <ShieldAlert className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
          <div>
            أنت مسجل حالياً بحساب <strong>{activeEmployee.name}</strong> وليس لديك صلاحيات لتعديل رسوم خدمات مكتب مزايا. يرجى تسجيل الدخول بحساب المدير <strong>SHERIF</strong> للتحكم الكامل.
          </div>
        </div>
      )}

      {/* CREATE FORM */}
      {showCreateForm && (
        <form onSubmit={handleCreateService} className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4 max-w-2xl">
          <div className="flex justify-between items-center border-b border-slate-100 pb-2">
            <h3 className="font-bold text-sm text-slate-800 flex items-center gap-1.5">
              <FolderPlus className="w-5 h-5 text-blue-500" />
              تكوين وإدراج خدمة جديدة
            </h3>
            <button type="button" onClick={() => setShowCreateForm(false)}>
              <X className="w-5 h-5 text-slate-400" />
            </button>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 block">اسم الخدمة بالكامل (ابدأ بـ # أو ## للجوازات):</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="مثال: # استخراج جواز سفر مستعجل"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs"
                required
              />
              <span className="text-[9px] text-slate-400 leading-none">
                تنبيه: الخدمات التي تبدأ بـ (#) يُحتسب يوم السبت يوم عمل لها. أما باقي الخدمات فيُعتبر السبت عطلة.
              </span>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 block">عدد أيام العمل للتنفيذ:</label>
              <input
                type="number"
                min="0"
                value={deliveryDaysOffset}
                onChange={(e) => setDeliveryDaysOffset(parseInt(e.target.value) || 0)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono"
                required
              />
              <span className="text-[9px] font-bold block text-indigo-700">
                {name.trim().startsWith("#") ? "⚡ تبدأ بـ (#): يوم السبت يُحسب يوم عمل رسمي (تجاوز الجمعة والعطلات الرسمية فقط)." : "💤 لا تبدأ بـ (#): يوم السبت عطلة رسمية (تجاوز الجمعة والسبت والعطلات الرسمية)."}
              </span>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 block">الرسوم الحكومية بالجنيه:</label>
              <input
                type="number"
                min="0"
                value={govPrice}
                onChange={(e) => setGovPrice(parseFloat(e.target.value) || 0)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono"
                required
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 block">رسوم وأتعاب المكتب بالجنيه:</label>
              <input
                type="number"
                min="0"
                value={officeFee}
                onChange={(e) => setOfficeFee(parseFloat(e.target.value) || 0)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono"
                required
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-700 block">مدة تنفيذ الخدمة بالتفصيل (نص طويل):</label>
            <input
              type="text"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              placeholder="مثال: 3 أيام عمل من تاريخ توريد الأوراق الرسمية"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs"
              required
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-700 block">تعليمات التسليم للعميل:</label>
            <textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="مثال: يرجى الحضور الشخصي بالمكتب مع أصل البطاقة لاستلام الأرشيف المجهز..."
              rows={2}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs"
              required
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-700 block">ملاحظات إضافية اختيارية:</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="أية شروط أو ملاحظات أمان أخرى..."
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs"
            />
          </div>

          <div className="flex gap-2 justify-end pt-2">
            <button
              type="button"
              onClick={() => setShowCreateForm(false)}
              className="px-4 py-2 border border-slate-200 text-slate-500 text-xs font-bold rounded-lg"
            >
              إلغاء
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-slate-900 text-white hover:bg-slate-800 text-xs font-bold rounded-lg"
            >
              حفظ وإدراج الخدمة 💾
            </button>
          </div>
        </form>
      )}

      {/* EDIT FORM (INLINE OR BLOCK) */}
      {editingServiceId && (
        <form onSubmit={handleUpdateService} className="bg-white border-2 border-blue-500 rounded-2xl p-6 shadow-md space-y-4 max-w-2xl">
          <div className="flex justify-between items-center border-b border-slate-100 pb-2">
            <h3 className="font-bold text-sm text-blue-700 flex items-center gap-1.5">
              <Edit3 className="w-5 h-5" />
              تعديل تفاصيل الخدمة الحالية
            </h3>
            <button type="button" onClick={resetForm}>
              <X className="w-5 h-5 text-slate-400" />
            </button>
          </div>

          {/* Same inputs as Create Form but populated */}
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 block">اسم الخدمة بالكامل:</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs"
                required
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 block">أيام العمل للتنفيذ:</label>
              <input
                type="number"
                min="0"
                value={deliveryDaysOffset}
                onChange={(e) => setDeliveryDaysOffset(parseInt(e.target.value) || 0)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono"
                required
              />
              <span className="text-[9px] font-bold block text-indigo-700">
                {name.trim().startsWith("#") ? "⚡ تبدأ بـ (#): يوم السبت يُحسب يوم عمل رسمي لهذه الخدمة." : "💤 لا تبدأ بـ (#): يوم السبت عطلة رسمية لهذه الخدمة."}
              </span>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 block">الرسوم الحكومية بالجنيه:</label>
              <input
                type="number"
                min="0"
                value={govPrice}
                onChange={(e) => setGovPrice(parseFloat(e.target.value) || 0)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono"
                required
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 block">رسوم وأتعاب المكتب بالجنيه:</label>
              <input
                type="number"
                min="0"
                value={officeFee}
                onChange={(e) => setOfficeFee(parseFloat(e.target.value) || 0)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono"
                required
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-700 block">مدة تنفيذ الخدمة بالتفصيل (نص طويل):</label>
            <input
              type="text"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs"
              required
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-700 block">تعليمات التسليم للعميل:</label>
            <textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              rows={2}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs"
              required
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-700 block">ملاحظات إضافية اختيارية:</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs"
            />
          </div>

          <div className="flex gap-2 justify-end pt-2">
            <button
              type="button"
              onClick={resetForm}
              className="px-4 py-2 border border-slate-200 text-slate-500 text-xs font-bold rounded-lg"
            >
              تجاهل التعديلات
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-blue-600 text-white hover:bg-blue-500 text-xs font-bold rounded-lg"
            >
              تأكيد الحفظ والتحديث 💾
            </button>
          </div>
        </form>
      )}

      {/* REORDERING TOOLBAR */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <ArrowUpDown className="w-4 h-4 text-blue-600" />
            <span className="font-bold text-sm text-slate-900">ترتيب ظهور الخدمات المعروضة</span>
            {isSavingOrder && (
              <span className="flex items-center gap-1 text-[11px] text-blue-600 font-medium mr-2">
                <Loader2 className="w-3 h-3 animate-spin" />
                جاري الحفظ...
              </span>
            )}
            {orderFeedback && (
              <span className={`flex items-center gap-1 text-[11px] font-bold mr-2 ${
                orderFeedback.type === "success" ? "text-emerald-600" : "text-rose-600"
              }`}>
                <CheckCircle2 className="w-3.5 h-3.5" />
                {orderFeedback.message}
              </span>
            )}
          </div>
          <p className="text-[11px] text-slate-500 mt-0.5">
            استخدم أزرار الأسهم (⬆️ / ⬇️) في الجدول لتقديم أو تأخير أي خدمة، أو اختر أحد خيارات الترتيب التلقائي السريع. الترتيب ينعكس فورياً في شاشات تسجيل الفواتير.
          </p>
        </div>

        {/* Quick sort presets */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-bold text-slate-500 ml-1">ترتيب سريع:</span>
          <button
            type="button"
            disabled={isSavingOrder}
            onClick={() => handleSortPreset("passportFirst")}
            className="px-2.5 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-xs font-bold flex items-center gap-1 border border-blue-200 transition-colors cursor-pointer"
            title="وضع خدمات الجوازات التي تبدأ بـ # في بداية القائمة"
          >
            <Hash className="w-3.5 h-3.5" />
            الجوازات أولاً (#)
          </button>
          <button
            type="button"
            disabled={isSavingOrder}
            onClick={() => handleSortPreset("alphabetical")}
            className="px-2.5 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-700 rounded-lg text-xs font-bold flex items-center gap-1 border border-slate-200 transition-colors cursor-pointer"
            title="ترتيب أبجدي من الألف إلى الياء"
          >
            <ArrowDownAZ className="w-3.5 h-3.5" />
            أبجدياً (أ - ي)
          </button>
          <button
            type="button"
            disabled={isSavingOrder}
            onClick={() => handleSortPreset("priceDesc")}
            className="px-2.5 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-700 rounded-lg text-xs font-bold flex items-center gap-1 border border-slate-200 transition-colors cursor-pointer"
            title="الأعلى سعراً أولاً"
          >
            <DollarSign className="w-3.5 h-3.5" />
            الأعلى سعراً
          </button>
          <button
            type="button"
            disabled={isSavingOrder}
            onClick={() => handleSortPreset("priceAsc")}
            className="px-2.5 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-700 rounded-lg text-xs font-bold flex items-center gap-1 border border-slate-200 transition-colors cursor-pointer"
            title="الأقل سعراً أولاً"
          >
            <DollarSign className="w-3.5 h-3.5" />
            الأقل سعراً
          </button>
        </div>
      </div>

      {/* SERVICES LIST */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 font-bold">
                <th className="p-3 w-28 text-center">الترتيب والتحريك</th>
                <th className="p-3">اسم الخدمة بالكامل</th>
                <th className="p-3">الرسوم الحكومية</th>
                <th className="p-3">رسوم أتعاب المكتب</th>
                <th className="p-3">الإجمالي الجاري</th>
                <th className="p-3">مدة تنفيذ الخدمة</th>
                <th className="p-3">التعليمات</th>
                <th className="p-3 text-left">الخيارات</th>
              </tr>
            </thead>
            <tbody>
              {services.map((srv, idx) => {
                const isPassport = srv.name.startsWith("#") || srv.name.startsWith("##");
                const total = srv.govPrice + srv.officeFee;

                return (
                  <tr key={srv.id} className="border-b border-slate-150 hover:bg-slate-50/50 transition-colors">
                    {/* Reorder controls */}
                    <td className="p-2.5 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <span className="w-6 h-6 rounded-md bg-slate-100 text-slate-700 text-[11px] font-mono font-black flex items-center justify-center border border-slate-200">
                          {idx + 1}
                        </span>
                        <div className="flex items-center gap-0.5">
                          <button
                            type="button"
                            disabled={idx === 0 || isSavingOrder}
                            onClick={() => handleMoveService(idx, "up")}
                            className={`p-1.5 rounded-md transition-colors ${
                              idx === 0 || isSavingOrder
                                ? "text-slate-300 cursor-not-allowed"
                                : "text-slate-600 hover:text-blue-700 hover:bg-blue-50 active:bg-blue-100 cursor-pointer"
                            }`}
                            title="تقديم للأعلى (خطوة واحدة)"
                          >
                            <ArrowUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={idx === services.length - 1 || isSavingOrder}
                            onClick={() => handleMoveService(idx, "down")}
                            className={`p-1.5 rounded-md transition-colors ${
                              idx === services.length - 1 || isSavingOrder
                                ? "text-slate-300 cursor-not-allowed"
                                : "text-slate-600 hover:text-blue-700 hover:bg-blue-50 active:bg-blue-100 cursor-pointer"
                            }`}
                            title="تأخير للأسفل (خطوة واحدة)"
                          >
                            <ArrowDown className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={idx === 0 || isSavingOrder}
                            onClick={() => handleMoveService(idx, "top")}
                            className={`p-1 rounded transition-colors ${
                              idx === 0 || isSavingOrder
                                ? "text-slate-300 cursor-not-allowed"
                                : "text-slate-400 hover:text-blue-700 hover:bg-blue-50 cursor-pointer"
                            }`}
                            title="نقل لأول القائمة تماماً"
                          >
                            <ChevronsUp className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            disabled={idx === services.length - 1 || isSavingOrder}
                            onClick={() => handleMoveService(idx, "bottom")}
                            className={`p-1 rounded transition-colors ${
                              idx === services.length - 1 || isSavingOrder
                                ? "text-slate-300 cursor-not-allowed"
                                : "text-slate-400 hover:text-blue-700 hover:bg-blue-50 cursor-pointer"
                            }`}
                            title="نقل لآخر القائمة تماماً"
                          >
                            <ChevronsDown className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    </td>

                    <td className="p-3">
                      <div className="font-bold text-slate-900 flex items-center gap-1.5">
                        <span>{srv.name}</span>
                        {isPassport && (
                          <span className="bg-blue-50 border border-blue-100 text-blue-600 text-[8px] px-1.5 py-0.5 rounded-sm font-bold">
                            مصلحة الجوازات
                          </span>
                        )}
                      </div>
                      {srv.notes && <div className="text-[10px] text-slate-400 mt-0.5">{srv.notes}</div>}
                    </td>
                    <td className="p-3 font-mono font-bold text-slate-800">{srv.govPrice.toFixed(2)} ج.م</td>
                    <td className="p-3 font-mono font-bold text-emerald-600">{srv.officeFee.toFixed(2)} ج.م</td>
                    <td className="p-3 font-mono font-black text-slate-900">{total.toFixed(2)} ج.م</td>
                    <td className="p-3 text-slate-600 font-medium">{srv.duration}</td>
                    <td className="p-3 text-slate-400 max-w-xs truncate" title={srv.instructions}>{srv.instructions}</td>
                    <td className="p-3 text-left">
                      <div className="inline-flex gap-1">
                        <button
                          onClick={() => handleOpenEdit(srv)}
                          className="p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900 rounded-lg transition-colors"
                          title="تعديل الخدمة"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteService(srv.id)}
                          className="p-1.5 text-rose-500 hover:bg-rose-50 hover:text-rose-700 rounded-lg transition-colors"
                          title="حذف من الكتالوج"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
