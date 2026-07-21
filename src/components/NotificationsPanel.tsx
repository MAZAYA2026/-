import React, { useState } from "react";
import { Invoice, AppSettings } from "../types";
import { updateInvoiceOnServer } from "../lib/api";
import { Bell, Send, CheckCircle, Clock, Calendar, Search, Filter, AlertTriangle, MessageSquare, RefreshCw } from "lucide-react";

interface NotificationsPanelProps {
  invoices: Invoice[];
  settings: AppSettings;
  onInvoiceUpdated: (updated: Invoice) => void;
}

export default function NotificationsPanel({ invoices, settings, onInvoiceUpdated }: NotificationsPanelProps) {
  // Filters: today, tomorrow, this_week, all
  const [timeFilter, setTimeFilter] = useState<"today" | "tomorrow" | "this_week" | "all">("all");
  const [searchQuery, setSearchQuery] = useState("");

  const getTodayDateString = () => new Date().toISOString().split("T")[0];
  const getTomorrowDateString = () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().split("T")[0];
  };

  const getEndOfWeekDateString = () => {
    const endOfWeek = new Date();
    endOfWeek.setDate(endOfWeek.getDate() + 7);
    return endOfWeek.toISOString().split("T")[0];
  };

  const todayStr = getTodayDateString();
  const tomorrowStr = getTomorrowDateString();
  const endOfWeekStr = getEndOfWeekDateString();

  // Extract all due notification records from invoices
  // An invoice customer has services, and each service has a deliveryDate.
  const getDueNotifications = () => {
    const list: {
      invoice: Invoice;
      customerName: string;
      phone: string;
      servicesDue: string[];
      deliveryDate: string;
      isSent: boolean;
    }[] = [];

    invoices.forEach((inv) => {
      // Look through customers
      inv.customers.forEach((cust) => {
        // Collect all services that match our delivery dates or are overdue
        const servicesDueList: string[] = [];
        let maxDeliveryDate = "";

        cust.services.forEach((s) => {
          if (!s.deliveryDate) return;

          // Check if delivery date matches filters
          let matchesFilter = false;
          if (timeFilter === "today") {
            matchesFilter = s.deliveryDate === todayStr;
          } else if (timeFilter === "tomorrow") {
            matchesFilter = s.deliveryDate === tomorrowStr;
          } else if (timeFilter === "this_week") {
            matchesFilter = s.deliveryDate >= todayStr && s.deliveryDate <= endOfWeekStr;
          } else {
            // "all" - shows anything due today or earlier (overdue), or ahead
            matchesFilter = true;
          }

          if (matchesFilter) {
            servicesDueList.push(s.serviceId);
            if (!maxDeliveryDate || s.deliveryDate > maxDeliveryDate) {
              maxDeliveryDate = s.deliveryDate;
            }
          }
        });

        // Add to notification list if there are services due and matches search
        if (servicesDueList.length > 0) {
          if (searchQuery && !cust.arabicName.includes(searchQuery) && !inv.invoiceId.toString().includes(searchQuery)) {
            return;
          }

          list.push({
            invoice: inv,
            customerName: cust.arabicName,
            phone: cust.phone,
            servicesDue: servicesDueList,
            deliveryDate: maxDeliveryDate,
            isSent: !!inv.notificationSent
          });
        }
      });
    });

    // Sort by delivery date ascending
    return list.sort((a, b) => a.deliveryDate.localeCompare(b.deliveryDate));
  };

  const notifications = getDueNotifications();
  const unsentCount = notifications.filter(n => !n.isSent).length;

  // Handle WhatsApp Reminder click
  const handleSendReminder = async (record: typeof notifications[0]) => {
    // Composition of custom reminder message
    let reminderText = `عزيزنا العميل ${record.customerName}، نفيدكم علماً بأن طلبكم رقم (${record.invoice.invoiceId}) لخدمة: (${record.servicesDue.join(", ")}) قد حان موعد تسليمها اليوم (${record.deliveryDate}).\n\nيسعدنا حضورك لمكتب مزايا للجوازات لاستلام أوراقك. شكراً لتعاملك معنا.`;
    
    if (settings.readyMessage) {
      reminderText = settings.readyMessage
        .replace(/{اسم_العميل}/g, record.customerName)
        .replace(/{رقم_الفاتورة}/g, record.invoice.invoiceId.toString())
        .replace(/{الخدمات}/g, record.servicesDue.join(", "))
        .replace(/{رقم_الارشيف}/g, record.invoice.archiveDrawer || "درج الحفظ المخصص");
    }

    const waUrl = `https://wa.me/${record.phone.startsWith('0') ? '2' : ''}${record.phone}?text=${encodeURIComponent(reminderText)}`;
    window.open(waUrl, "_blank");

    // Update notification state to "Sent" on backend
    try {
      const updatedInvoice = {
        ...record.invoice,
        notificationSent: true
      };
      const result = await updateInvoiceOnServer(record.invoice.invoiceId, updatedInvoice);
      onInvoiceUpdated(result);
    } catch (err) {
      console.error("Failed to update notification sent state:", err);
    }
  };

  return (
    <div className="space-y-6 font-cairo">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900">شاشة التذكير وإشعارات مواعيد التسليم</h2>
          <p className="text-sm text-slate-500 mt-1">تنبيهات تلقائية لمواعيد مراجعة الجوازات وطباعة الإيصال الفوري</p>
        </div>
      </div>

      {/* Notifications Indicator Badge Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        
        {/* Unsent Counter Card */}
        <div className="bg-rose-50 border border-rose-200 rounded-2xl p-5 flex items-center justify-between shadow-xs">
          <div className="space-y-1">
            <span className="text-xs text-rose-800 font-bold">إشعارات متبقية لم ترسل</span>
            <div className="text-3xl font-black font-mono text-rose-700">{unsentCount}</div>
          </div>
          <div className="p-3 bg-rose-500 rounded-xl text-white animate-pulse">
            <Bell className="w-6 h-6" />
          </div>
        </div>

        {/* Total Monitored Card */}
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 flex items-center justify-between shadow-xs">
          <div className="space-y-1">
            <span className="text-xs text-slate-600 font-bold">إجمالي مواعيد التسليم المعينة</span>
            <div className="text-3xl font-black font-mono text-slate-800">{notifications.length}</div>
          </div>
          <div className="p-3 bg-slate-800 rounded-xl text-white">
            <Calendar className="w-6 h-6" />
          </div>
        </div>

        {/* Today Due Card */}
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-5 flex items-center justify-between shadow-xs">
          <div className="space-y-1">
            <span className="text-xs text-blue-800 font-bold">يستحق الاستلام اليوم</span>
            <div className="text-3xl font-black font-mono text-blue-700">
              {notifications.filter(n => n.deliveryDate === todayStr).length}
            </div>
          </div>
          <div className="p-3 bg-blue-500 rounded-xl text-white">
            <Clock className="w-6 h-6" />
          </div>
        </div>

        {/* This Week Due Card */}
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 flex items-center justify-between shadow-xs">
          <div className="space-y-1">
            <span className="text-xs text-emerald-800 font-bold">يستحق الاستلام هذا الأسبوع</span>
            <div className="text-3xl font-black font-mono text-emerald-700">
              {notifications.filter(n => n.deliveryDate >= todayStr && n.deliveryDate <= endOfWeekStr).length}
            </div>
          </div>
          <div className="p-3 bg-emerald-500 rounded-xl text-white">
            <CheckCircle className="w-6 h-6" />
          </div>
        </div>

      </div>

      {/* Filter Options */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="البحث باسم العميل أو رقم الفاتورة للسرعة..."
            className="w-full bg-slate-50 border border-slate-200 rounded-xl pr-10 pl-4 py-2 text-xs focus:outline-hidden"
          />
        </div>

        {/* Time Filter Buttons */}
        <div className="flex gap-1 bg-slate-100 p-1 rounded-xl text-xs font-bold no-print">
          <button
            onClick={() => setTimeFilter("all")}
            className={`px-4 py-2 rounded-lg transition-colors ${timeFilter === "all" ? "bg-white text-slate-900 shadow-xs" : "text-slate-500 hover:text-slate-800"}`}
          >
            عرض الكل
          </button>
          <button
            onClick={() => setTimeFilter("today")}
            className={`px-4 py-2 rounded-lg transition-colors ${timeFilter === "today" ? "bg-white text-slate-900 shadow-xs" : "text-slate-500 hover:text-slate-800"}`}
          >
            مواعيد اليوم
          </button>
          <button
            onClick={() => setTimeFilter("tomorrow")}
            className={`px-4 py-2 rounded-lg transition-colors ${timeFilter === "tomorrow" ? "bg-white text-slate-900 shadow-xs" : "text-slate-500 hover:text-slate-800"}`}
          >
            مواعيد الغد
          </button>
          <button
            onClick={() => setTimeFilter("this_week")}
            className={`px-4 py-2 rounded-lg transition-colors ${timeFilter === "this_week" ? "bg-white text-slate-900 shadow-xs" : "text-slate-500 hover:text-slate-800"}`}
          >
            هذا الأسبوع
          </button>
        </div>

      </div>

      {/* Notification List Panel */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
        {notifications.length === 0 ? (
          <div className="text-center py-12 space-y-2">
            <Clock className="w-8 h-8 text-slate-300 mx-auto" />
            <p className="text-xs text-slate-400 font-bold">لا توجد إشعارات موافقة لمحددات التوقيت والبحث.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {notifications.map((record, idx) => {
              const isOverdue = record.deliveryDate < todayStr;
              
              return (
                <div key={idx} className="p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 hover:bg-slate-50/50 transition-colors">
                  
                  {/* Info details */}
                  <div className="space-y-1 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-xs text-slate-900">فاتورة #{record.invoice.invoiceId}</span>
                      <span className="text-slate-300">|</span>
                      <span className="font-bold text-sm text-slate-800">{record.customerName}</span>
                      {isOverdue && !record.isSent && (
                        <span className="bg-rose-50 border border-rose-100 text-rose-700 text-[9px] px-1.5 py-0.5 rounded-sm font-bold flex items-center gap-0.5">
                          <AlertTriangle className="w-3 h-3 text-rose-500" />
                          متأخر
                        </span>
                      )}
                    </div>

                    <div className="text-xs text-slate-500 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono">
                      <span>الهاتف: {record.phone}</span>
                      <span className="text-slate-300">•</span>
                      <span className="text-slate-700 font-cairo">الخدمة: <strong>{record.servicesDue.join(", ")}</strong></span>
                      <span className="text-slate-300">•</span>
                      <span className={`font-bold flex items-center gap-1 ${isOverdue ? "text-rose-600" : "text-amber-700"}`}>
                        <Calendar className="w-3.5 h-3.5" />
                        موعد التسليم: {record.deliveryDate}
                      </span>
                    </div>
                  </div>

                  {/* Actions / Sent Status */}
                  <div className="flex items-center gap-3 w-full sm:w-auto justify-end border-t border-slate-50 sm:border-0 pt-3 sm:pt-0">
                    <div className="text-xs flex items-center gap-1.5 font-bold">
                      {record.isSent ? (
                        <span className="text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-100 flex items-center gap-1">
                          <CheckCircle className="w-3.5 h-3.5" />
                          تم الإرسال مسبقاً
                        </span>
                      ) : (
                        <span className="text-slate-400 bg-slate-50 px-2.5 py-1 rounded-full border border-slate-200">
                          بانتظار التنبيه
                        </span>
                      )}
                    </div>

                    <button
                      onClick={() => handleSendReminder(record)}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold font-cairo flex items-center justify-center gap-1.5 transition-colors shadow-xs"
                    >
                      <Send className="w-3.5 h-3.5" />
                      إرسال تذكير واتساب
                    </button>
                  </div>

                </div>
              );
            })}
          </div>
        )}
      </div>

    </div>
  );
}
