import React, { useState } from "react";
import { Invoice, CollectionClosing, Employee } from "../types";
import { createClosingOnServer, saveDB, fetchDB } from "../lib/api";
import { DollarSign, Coins, TrendingUp, Calendar, Lock, BookOpen, AlertCircle, Sparkles, Check, FileText } from "lucide-react";

interface CollectionPanelProps {
  invoices: Invoice[];
  closings: CollectionClosing[];
  activeEmployee: Employee;
  onClosingCreated: (closing: CollectionClosing) => void;
  onDBResetAfterClosing: () => void;
}

export default function CollectionPanel({ invoices, closings, activeEmployee, onClosingCreated, onDBResetAfterClosing }: CollectionPanelProps) {
  // Date range filters for analysis
  const [filterDateFrom, setFilterDateFrom] = useState(new Date().toISOString().split("T")[0]);
  const [filterDateTo, setFilterDateTo] = useState(new Date().toISOString().split("T")[0]);

  // Drawer closing form states
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [cashAmount, setCashAmount] = useState(0);
  const [deferredAmount, setDeferredAmount] = useState(0);
  const [closingNotes, setClosingNotes] = useState("");

  // Determine invoices that are active (created after the latest closing)
  const getLatestClosingDate = () => {
    if (closings.length === 0) return "1970-01-01";
    // Sort closings by date descending
    const sorted = [...closings].sort((a, b) => b.closeDate.localeCompare(a.closeDate));
    return sorted[0].closeDate;
  };

  const latestCloseDate = getLatestClosingDate();

  // Invoices currently in the drawer (active/unclosed shift)
  const activeShiftInvoices = invoices.filter(inv => inv.date > latestCloseDate);

  // Totals calculations
  const calculateTotals = (items: Invoice[]) => {
    let revenue = 0;
    let gov = 0;
    let profit = 0; // Office fees are pure profit

    items.forEach((inv) => {
      revenue += inv.totalAmount;
      gov += inv.totalGov;
      profit += inv.totalOffice;
    });

    return { revenue, gov, profit };
  };

  const activeTotals = calculateTotals(activeShiftInvoices);

  // Analysis totals based on filtered date range
  const filteredInvoicesForAnalysis = invoices.filter(
    (inv) => inv.date >= filterDateFrom && inv.date <= filterDateTo
  );
  const analysisTotals = calculateTotals(filteredInvoicesForAnalysis);

  // Handle drawer close submission
  const handlePerformClosing = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeEmployee.permissions.canViewCollection) {
      alert("ليست لديك الصلاحية لإجراء التقفيل المالي.");
      return;
    }

    if (activeShiftInvoices.length === 0) {
      alert("لا يمكن تقفيل الخزنة لعدم وجود فواتير أو إيرادات جديدة في الوردية الحالية.");
      return;
    }

    if (!confirm("هل أنت متأكد من تقفيل الخزنة وتصفير الرصيد الحالي؟ سيتم أرشفة هذه الفترة وتصفير كاش الوردية للبدء من جديد.")) return;

    try {
      const newClosing: Partial<CollectionClosing> = {
        closedBy: activeEmployee.name,
        revenue: activeTotals.revenue,
        profit: activeTotals.profit,
        cashAmount,
        deferredAmount,
        notes: closingNotes.trim()
      };

      const savedClosing = await createClosingOnServer(newClosing);
      onClosingCreated(savedClosing);

      // Re-fetch or reset trigger to update parent UI state
      onDBResetAfterClosing();
      
      // Reset form fields
      setCashAmount(0);
      setDeferredAmount(0);
      setClosingNotes("");
      setShowCloseModal(false);
      alert("تم تقفيل الخزنة بنجاح وحفظ الوردية التاريخية وأرشفة الفواتير المحددة.");
    } catch (err) {
      console.error(err);
      alert("حدث خطأ أثناء إجراء تقفيل الخزنة.");
    }
  };

  return (
    <div className="space-y-6 font-cairo">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900">شاشة التحصيل المالي واليومية</h2>
          <p className="text-sm text-slate-500 mt-1">مطابقة الوردية، تصفير الخزنة وأرشفة العوائد الصافية للمكتب</p>
        </div>
      </div>

      {/* Grid of Active Ward/Shift Totals */}
      <div className="bg-slate-900 text-white rounded-2xl p-6 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div>
            <h3 className="font-bold text-sm text-slate-400">حالة الخزنة الحالية (الوردية الجارية):</h3>
            <p className="text-xs text-slate-500 mt-0.5">منذ آخر تقفيل مالي وتصفير بالخادم بتاريخ: <span className="text-amber-400 font-mono">{latestCloseDate === "1970-01-01" ? "بداية تشغيل النظام" : latestCloseDate}</span></p>
          </div>
          {activeEmployee.permissions.canViewCollection && (
            <button
              onClick={() => setShowCloseModal(true)}
              className="px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-xs rounded-xl flex items-center gap-1.5 transition-colors shadow-lg shadow-amber-500/10"
            >
              <Lock className="w-4 h-4" />
              تقفيل الخزنة (إنهاء اليومية)
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
          
          <div className="bg-slate-800/60 rounded-xl p-4 border border-slate-800">
            <div className="flex justify-between items-start">
              <span className="text-xs text-slate-400 font-bold">إجمالي إيراد الخزنة الكلي</span>
              <DollarSign className="w-5 h-5 text-blue-400" />
            </div>
            <div className="mt-3 font-mono text-2xl font-black text-blue-400">
              {activeTotals.revenue.toFixed(2)} <span className="text-xs font-cairo text-slate-400">ج.م</span>
            </div>
            <div className="text-[10px] text-slate-500 mt-1">مجموع التحصيل الكلي للخدمات بالدرج</div>
          </div>

          <div className="bg-slate-800/60 rounded-xl p-4 border border-slate-800">
            <div className="flex justify-between items-start">
              <span className="text-xs text-slate-400 font-bold">الرسوم الحكومية المستحقة</span>
              <Coins className="w-5 h-5 text-slate-300" />
            </div>
            <div className="mt-3 font-mono text-2xl font-black text-slate-300">
              {activeTotals.gov.toFixed(2)} <span className="text-xs font-cairo text-slate-400">ج.م</span>
            </div>
            <div className="text-[10px] text-slate-500 mt-1">تذهب بالكامل لتوريدات الجوازات</div>
          </div>

          <div className="bg-slate-800/60 rounded-xl p-4 border border-slate-800">
            <div className="flex justify-between items-start">
              <span className="text-xs text-slate-400 font-bold">أرباح المكتب الصافية ⚡</span>
              <TrendingUp className="w-5 h-5 text-emerald-400" />
            </div>
            <div className="mt-3 font-mono text-2xl font-black text-emerald-400">
              {activeTotals.profit.toFixed(2)} <span className="text-xs font-cairo text-slate-400">ج.م</span>
            </div>
            <div className="text-[10px] text-slate-500 mt-1">رسوم خدمات مكتب مزايا الصافية</div>
          </div>

        </div>
      </div>

      {/* Reconciled Analysis Section with Date range */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-4">
        <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
          <BookOpen className="w-5 h-5 text-slate-500" />
          <h3 className="font-bold text-sm text-slate-800">كشف الإيرادات والتحليلات التاريخية للفترات</h3>
        </div>

        {/* Date Filter */}
        <div className="flex flex-col sm:flex-row items-center gap-3 bg-slate-50 p-4 rounded-xl">
          <span className="text-xs font-bold text-slate-700">اختر فترة زمنية للمراجعة:</span>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <input 
              type="date" 
              value={filterDateFrom} 
              onChange={(e) => setFilterDateFrom(e.target.value)} 
              className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-mono"
            />
            <span className="text-slate-400">إلى</span>
            <input 
              type="date" 
              value={filterDateTo} 
              onChange={(e) => setFilterDateTo(e.target.value)} 
              className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-mono"
            />
          </div>
        </div>

        {/* Dynamic calculation display */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1">
          <div className="border border-slate-100 p-4 rounded-xl bg-slate-50/50">
            <span className="text-xs text-slate-500 font-bold">المبالغ المحصلة بالفترة:</span>
            <div className="text-lg font-bold font-mono text-slate-800 mt-1">
              {analysisTotals.revenue.toFixed(2)} ج.م
            </div>
          </div>
          <div className="border border-slate-100 p-4 rounded-xl bg-slate-50/50">
            <span className="text-xs text-slate-500 font-bold">الرسوم الحكومية للفترة:</span>
            <div className="text-lg font-bold font-mono text-slate-800 mt-1">
              {analysisTotals.gov.toFixed(2)} ج.م
            </div>
          </div>
          <div className="border border-slate-100 p-4 rounded-xl bg-emerald-50/30 border-emerald-100/50">
            <span className="text-xs text-emerald-800 font-bold">أرباح مكتب مزايا للفترة:</span>
            <div className="text-lg font-bold font-mono text-emerald-700 mt-1">
              {analysisTotals.profit.toFixed(2)} ج.م
            </div>
          </div>
        </div>
      </div>

      {/* Archive Logs of Closed Days / Shifts */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-4">
        <h3 className="font-bold text-sm text-slate-800">سجل تقفيل الخزائن السابق وأرشيف الوردية:</h3>

        {closings.length === 0 ? (
          <div className="text-center py-6 text-xs text-slate-400">
            لا توجد أي عمليات تقفيل خزنة مسجلة مسبقاً.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead>
                <tr className="bg-slate-50 text-slate-500 font-bold border-b border-slate-100">
                  <th className="p-3">تاريخ التقفيل</th>
                  <th className="p-3">المسؤول</th>
                  <th className="p-3">إجمالي الإيرادات</th>
                  <th className="p-3">الربح الصافي</th>
                  <th className="p-3">الكاش الفعلي</th>
                  <th className="p-3">المبالغ الآجلة</th>
                  <th className="p-3">ملاحظات</th>
                </tr>
              </thead>
              <tbody>
                {[...closings].reverse().map((cls) => (
                  <tr key={cls.id} className="border-b border-slate-100 hover:bg-slate-50/40">
                    <td className="p-3 font-bold font-mono text-slate-700">{cls.closeDate}</td>
                    <td className="p-3 font-medium text-slate-800">{cls.closedBy}</td>
                    <td className="p-3 font-bold font-mono text-blue-600">{cls.revenue.toFixed(2)}</td>
                    <td className="p-3 font-bold font-mono text-emerald-600">{cls.profit.toFixed(2)}</td>
                    <td className="p-3 font-bold font-mono text-slate-800">{cls.cashAmount.toFixed(2)}</td>
                    <td className="p-3 font-bold font-mono text-amber-600">{cls.deferredAmount.toFixed(2)}</td>
                    <td className="p-3 text-slate-500 max-w-xs truncate" title={cls.notes}>{cls.notes || "لا توجد ملاحظات"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* CLOSE DRAWER MODAL */}
      {showCloseModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <form onSubmit={handlePerformClosing} className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl animate-fade-in-up">
            
            <div className="px-6 py-4 bg-slate-900 text-white flex justify-between items-center">
              <h4 className="font-bold text-md flex items-center gap-1.5">
                <Lock className="w-5 h-5 text-amber-500" />
                تقفيل الوردية اليومية (إغلاق الخزنة)
              </h4>
              <button type="button" onClick={() => setShowCloseModal(false)}>
                <span className="text-xl font-bold font-mono">&times;</span>
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl p-3 flex items-start gap-2.5 text-xs">
                <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                <div>
                  عند الضغط على حفظ التقفيل، سيتم تصفير الرصيد الجاري بالخزنة فورياً وأرشفته بشكل دائم، مما يتيح لك بدء وردية جديدة من الصفر للمطابقة السليمة.
                </div>
              </div>

              {/* Read only summary */}
              <div className="bg-slate-50 rounded-xl p-4 border border-slate-100 space-y-1.5 text-xs text-slate-600">
                <div className="flex justify-between">
                  <span>إجمالي الإيراد الدفتري بالوردية:</span>
                  <span className="font-bold font-mono text-slate-900">{activeTotals.revenue.toFixed(2)} ج.م</span>
                </div>
                <div className="flex justify-between">
                  <span>صافي أرباح مكتب مزايا:</span>
                  <span className="font-bold font-mono text-emerald-600">{activeTotals.profit.toFixed(2)} ج.م</span>
                </div>
              </div>

              {/* Form Inputs */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">المبلغ الكاش الفعلي بالدرج:</label>
                  <input 
                    type="number" 
                    value={cashAmount}
                    onChange={(e) => setCashAmount(parseFloat(e.target.value) || 0)}
                    placeholder="0.00"
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono font-bold text-slate-900"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">مبالغ آجلة / شيكات:</label>
                  <input 
                    type="number" 
                    value={deferredAmount}
                    onChange={(e) => setDeferredAmount(parseFloat(e.target.value) || 0)}
                    placeholder="0.00"
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono font-bold text-slate-900"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">ملاحظات تسوية الخزنة:</label>
                <textarea 
                  value={closingNotes}
                  onChange={(e) => setClosingNotes(e.target.value)}
                  placeholder="مثال: مطابقة سليمة، عجز 5 جنيه، تم تحويل كاش لفيديكس..."
                  rows={3}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs focus:outline-hidden"
                />
              </div>

            </div>

            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-2">
              <button 
                type="button" 
                onClick={() => setShowCloseModal(false)}
                className="px-4 py-2 text-slate-500 text-xs font-bold"
              >
                إلغاء
              </button>
              <button 
                type="submit"
                className="px-5 py-2 bg-slate-900 text-white text-xs font-bold rounded-lg flex items-center gap-1 hover:bg-slate-800 transition-colors"
              >
                تأكيد التقفيل والتصفير 🔒
              </button>
            </div>

          </form>
        </div>
      )}

    </div>
  );
}
