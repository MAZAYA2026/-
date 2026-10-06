import React, { useState, useRef, useEffect, useMemo } from "react";
import { Invoice, Service, Employee, AppSettings, InvoiceStatus, CustomerInput } from "../types";
import { updateInvoiceOnServer, createInvoiceOnServer, syncAmanReportToGoogleSheets } from "../lib/api";
import { 
  Calendar, 
  Printer, 
  FileSpreadsheet, 
  Filter, 
  CheckCircle2, 
  AlertCircle, 
  Database, 
  Plus, 
  RefreshCw, 
  Check, 
  Save 
} from "lucide-react";

export interface AmanRowItem {
  id: string;
  invoiceId?: number;
  customerIndex?: number;
  arabicName: string;
  birthDate: string;
  notes: string;
  date: string;
  isCustomManual?: boolean;
}

interface AmanReportProps {
  invoices: Invoice[];
  services: Service[];
  activeEmployee: Employee;
  settings?: AppSettings;
  onInvoiceUpdated?: (updated: Invoice) => void;
  onInvoiceCreated?: (newInv: Invoice) => void;
}

export default function AmanReport({ 
  invoices, 
  services, 
  activeEmployee, 
  settings, 
  onInvoiceUpdated, 
  onInvoiceCreated 
}: AmanReportProps) {
  // Date filters: from and to
  const todayStr = new Date().toISOString().split("T")[0];
  const [dateFrom, setDateFrom] = useState(todayStr);
  const [dateTo, setDateTo] = useState(todayStr);

  // Auto-save feedback message
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isSyncingSheets, setIsSyncingSheets] = useState(false);

  const reportPrintRef = useRef<HTMLDivElement>(null);

  const extractBirthDate = (birthDate?: string, nationalId?: string): string => {
    if (birthDate && birthDate.trim() && birthDate !== "N/A") return birthDate.trim();
    if (nationalId && nationalId.length >= 7) {
      const cleanId = nationalId.replace(/\D/g, "");
      if (cleanId.length >= 7) {
        const centuryDigit = parseInt(cleanId[0]);
        const yy = cleanId.substring(1, 3);
        const mm = cleanId.substring(3, 5);
        const dd = cleanId.substring(5, 7);
        const year = (centuryDigit === 3 ? 2000 : 1900) + parseInt(yy);
        return `${year}/${mm}/${dd}`;
      }
    }
    return "";
  };

  // Extract base customers from invoices whose services start with single '#' ONLY.
  // Single '#' means: starts with '#' but NOT starting with '##' (e.g. ## is regular, # is single-hash مستعجل).
  const baseCustomers = useMemo(() => {
    const list: AmanRowItem[] = [];

    invoices.forEach((inv) => {
      // Filter by date range (from and to)
      if (inv.date < dateFrom || inv.date > dateTo) return;

      inv.customers.forEach((cust, cIdx) => {
        const amanService = cust.services.find((s) => {
          const serviceName = s.serviceId;
          return serviceName.startsWith("#") && !serviceName.startsWith("##");
        });

        if (amanService) {
          list.push({
            id: `inv-${inv.invoiceId}-c-${cIdx}`,
            arabicName: cust.arabicName || "",
            birthDate: extractBirthDate(cust.birthDate, cust.nationalId),
            notes: amanService.notes || cust.profession || "",
            date: inv.date,
            invoiceId: inv.invoiceId,
            customerIndex: cIdx,
          });
        }
      });
    });

    return list;
  }, [invoices, dateFrom, dateTo]);

  // Local table rows to support in-place editing, manual typing, and instant response
  const [tableRows, setTableRows] = useState<AmanRowItem[]>([]);

  // Track original values to detect real changes onBlur
  const originalValuesRef = useRef<Map<string, { arabicName: string; birthDate: string; notes: string }>>(new Map());

  // Initialize or re-sync tableRows when baseCustomers change
  useEffect(() => {
    setTableRows((prev) => {
      // Map existing edited items by id if already present
      const prevMap = new Map<string, AmanRowItem>(prev.map((r: AmanRowItem) => [r.id, r]));
      
      const updated: AmanRowItem[] = baseCustomers.map((base) => {
        const existing = prevMap.get(base.id);
        if (existing) {
          return {
            ...base,
            arabicName: existing.arabicName,
            birthDate: existing.birthDate,
            notes: existing.notes,
          };
        }
        return base;
      });

      // Update original values cache
      baseCustomers.forEach((b) => {
        originalValuesRef.current.set(b.id, {
          arabicName: b.arabicName,
          birthDate: b.birthDate,
          notes: b.notes,
        });
      });

      return updated;
    });
  }, [baseCustomers]);

  // Rows per official A4 print page
  const ROWS_PER_PAGE = 35;
  const totalPages = Math.max(1, Math.ceil(tableRows.length / ROWS_PER_PAGE));
  const totalAllocatedRows = totalPages * ROWS_PER_PAGE;

  // Complete rows array padded with empty editable rows up to totalAllocatedRows
  const displayRows: AmanRowItem[] = useMemo(() => {
    const list = [...tableRows];
    while (list.length < totalAllocatedRows) {
      const idx = list.length;
      list.push({
        id: `empty-row-${idx}`,
        arabicName: "",
        birthDate: "",
        notes: "",
        date: dateFrom,
        isCustomManual: true,
      });
    }
    return list;
  }, [tableRows, totalAllocatedRows, dateFrom]);

  const showSaveNotice = (msg: string) => {
    setSaveStatus(msg);
    setTimeout(() => {
      setSaveStatus((current) => (current === msg ? null : current));
    }, 4000);
  };

  // Handle cell edit
  const handleCellChange = (rowIndex: number, field: "arabicName" | "birthDate" | "notes", value: string) => {
    setTableRows((prev) => {
      const copy = [...prev];
      // Expand if typing in an empty padded slot
      while (copy.length <= rowIndex) {
        copy.push({
          id: `manual-${Date.now()}-${copy.length}`,
          arabicName: "",
          birthDate: "",
          notes: "",
          date: dateFrom,
          isCustomManual: true,
        });
      }
      copy[rowIndex] = {
        ...copy[rowIndex],
        [field]: value,
      };
      return copy;
    });
  };

  // Trigger auto-save on blur
  const handleCellBlur = async (rowIndex: number) => {
    const row = displayRows[rowIndex];
    if (!row) return;

    const trimmedName = row.arabicName.trim();
    const trimmedBirthDate = row.birthDate.trim();
    const trimmedNotes = row.notes.trim();

    // Check if row had cached original value
    const orig = originalValuesRef.current.get(row.id);
    if (orig) {
      if (
        orig.arabicName === trimmedName &&
        orig.birthDate === trimmedBirthDate &&
        orig.notes === trimmedNotes
      ) {
        return; // No change made
      }
    } else {
      // For empty row, if nothing was entered, ignore
      if (!trimmedName && !trimmedBirthDate && !trimmedNotes) {
        return;
      }
    }

    setIsSaving(true);
    try {
      // Case 1: Linked to an existing invoice
      if (row.invoiceId !== undefined && row.customerIndex !== undefined) {
        const targetInvoice = invoices.find((inv) => inv.invoiceId === row.invoiceId);
        if (targetInvoice && targetInvoice.customers[row.customerIndex]) {
          const updatedCustomers = targetInvoice.customers.map((c, cIdx) => {
            if (cIdx !== row.customerIndex) return c;
            return {
              ...c,
              arabicName: trimmedName || c.arabicName,
              birthDate: trimmedBirthDate || c.birthDate,
              services: c.services.map((s) => {
                if (s.serviceId.startsWith("#") && !s.serviceId.startsWith("##")) {
                  return { ...s, notes: trimmedNotes };
                }
                return s;
              }),
            };
          });

          const updatedInvoice = {
            ...targetInvoice,
            customers: updatedCustomers,
          };

          const savedInv = await updateInvoiceOnServer(targetInvoice.invoiceId, updatedInvoice);
          onInvoiceUpdated?.(savedInv);

          // Update cached values
          originalValuesRef.current.set(row.id, {
            arabicName: trimmedName,
            birthDate: trimmedBirthDate,
            notes: trimmedNotes,
          });

          showSaveNotice(`تم حفظ تعديل العميل (${trimmedName}) بالفاتورة وجوجل شيت تلقائياً ✓`);

          // Background sync dedicated Aman sheet if webhook available
          const webhookUrl = settings?.googleSheetWebhookUrl;
          if (webhookUrl && webhookUrl.startsWith("http")) {
            syncAmanReportToGoogleSheets({
              dateFrom,
              dateTo,
              amanRows: displayRows.filter(r => r.arabicName.trim().length > 0),
              webhookUrl,
            }).catch(() => {});
          }
        }
      } 
      // Case 2: Manual entry in an empty row (missing customer added)
      else if (trimmedName.length > 0) {
        // Find default # service from catalog
        const defaultAmanService = services.find(
          (s) => s.name.startsWith("#") && !s.name.startsWith("##")
        ) || {
          id: "# استخراج جواز سفر",
          name: "# استخراج جواز سفر",
          govPrice: 0,
          officeFee: 0,
        };

        const newCustomer: CustomerInput = {
          arabicName: trimmedName,
          englishName: "",
          englishNameOption: "gemini",
          nationalId: "",
          birthDate: trimmedBirthDate,
          phone: "",
          profession: "",
          services: [
            {
              serviceId: defaultAmanService.name || defaultAmanService.id,
              quantity: 1,
              price: (defaultAmanService.govPrice || 0) + (defaultAmanService.officeFee || 0),
              deliveryDate: dateFrom,
              notes: trimmedNotes,
            },
          ],
        };

        const newInvoiceData: Partial<Invoice> = {
          date: row.date || dateFrom || todayStr,
          status: InvoiceStatus.NEW,
          employeeName: activeEmployee?.name || "الموظف",
          customers: [newCustomer],
          totalGov: defaultAmanService.govPrice || 0,
          totalOffice: defaultAmanService.officeFee || 0,
          totalAmount: (defaultAmanService.govPrice || 0) + (defaultAmanService.officeFee || 0),
        };

        const createdInv = await createInvoiceOnServer(newInvoiceData);
        onInvoiceCreated?.(createdInv);

        // Update row to link with newly created invoice
        const newRowId = `inv-${createdInv.invoiceId}-c-0`;
        setTableRows((prev) => {
          const copy = [...prev];
          if (copy[rowIndex]) {
            copy[rowIndex] = {
              ...copy[rowIndex],
              id: newRowId,
              invoiceId: createdInv.invoiceId,
              customerIndex: 0,
              isCustomManual: false,
            };
          }
          return copy;
        });

        originalValuesRef.current.set(newRowId, {
          arabicName: trimmedName,
          birthDate: trimmedBirthDate,
          notes: trimmedNotes,
        });

        showSaveNotice(`تم تسجيل العميل (${trimmedName}) وحفظ الفاتورة وجوجل شيت تلقائياً 💾✓`);

        // Background sync dedicated Aman sheet if webhook available
        const webhookUrl = settings?.googleSheetWebhookUrl;
        if (webhookUrl && webhookUrl.startsWith("http")) {
          syncAmanReportToGoogleSheets({
            dateFrom,
            dateTo,
            amanRows: displayRows.filter(r => r.arabicName.trim().length > 0),
            webhookUrl,
          }).catch(() => {});
        }
      }
    } catch (err: any) {
      console.error("Auto-save failed on blur:", err);
      showSaveNotice(`خطأ أثناء الحفظ التلقائي: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  // Add an empty row for quick entry
  const handleAddNewRow = () => {
    setTableRows((prev) => [
      ...prev,
      {
        id: `manual-new-${Date.now()}`,
        arabicName: "",
        birthDate: "",
        notes: "",
        date: dateFrom,
        isCustomManual: true,
      },
    ]);
    showSaveNotice("تمت إضافة سطر جديد للكشف، اكتب الاسم وسيحفظ تلقائياً عند الخروج من الخلية ✍️");
  };

  // Direct manual sync to Google Sheets
  const handleManualSyncToSheets = async () => {
    const webhookUrl = settings?.googleSheetWebhookUrl;
    if (!webhookUrl || !webhookUrl.startsWith("http")) {
      alert("الرجاء التأكد من إدخال رابط سكربت Webhook الخاص بجوجل شيت في شاشة الإعدادات أولاً.");
      return;
    }

    setIsSyncingSheets(true);
    try {
      const activeRows = displayRows.filter(r => r.arabicName.trim().length > 0);
      const res = await syncAmanReportToGoogleSheets({
        dateFrom,
        dateTo,
        amanRows: activeRows,
        webhookUrl,
      });

      alert(res.message || "تم حفظ ومزامنة كشف أمان في ملف جوجل شيت بنجاح! 📑✅");
      showSaveNotice("تمت المزامنة بنجاح مع ملف جوجل شيت 📊✓");
    } catch (err: any) {
      alert("فشل مزامنة كشف أمان مع جوجل شيت: " + err.message);
    } finally {
      setIsSyncingSheets(false);
    }
  };

  // Excel Export to CSV with exact requested format
  const handleExportToExcel = () => {
    const activeRows = displayRows.filter((c) => c.arabicName.trim().length > 0);
    if (activeRows.length === 0) {
      alert("لا توجد بيانات لتصديرها للفترة المحددة.");
      return;
    }

    const todayDisplay = dateFrom === dateTo ? dateFrom : `من ${dateFrom} إلى ${dateTo}`;

    // Prepare CSV content with Arabic UTF-8 BOM
    let csvContent = "\ufeff";
    csvContent += "قسم جوازات طنطا - كشف حركة التابع للخدمات الجماهيرية\r\n";
    csvContent += `التاريخ: ${todayDisplay}\r\n\r\n`;
    csvContent += "م,الاسم,تاريخ الميلاد,الملاحظات\r\n";

    activeRows.forEach((cust, idx) => {
      const cleanName = cust.arabicName.replace(/,/g, " ");
      const cleanNotes = (cust.notes || "").replace(/,/g, " ");
      csvContent += `${idx + 1},${cleanName},${cust.birthDate || ""},${cleanNotes}\r\n`;
    });

    csvContent += "\r\n,,,توقيع رئيس القسم\r\n";

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `كشف_حركة_الخدمات_الجماهيرية_${dateFrom}_${dateTo}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Canvas ref for exact measurement of text length in centimeters
  const measurementCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Dynamic font sizing for customer name:
  // User explicit requirement: "لا تقم تصغير حجم الخط للأسم المكتوب الا بعد تخطى طوله 8سم بعدها ابدأ فى التقليل"
  // Keep font size at default official 20px up to 8cm; start reducing only after exceeding 8cm
  const getNameFontSize = (name: string): string => {
    if (!name || !name.trim()) return "20px";
    const clean = name.trim();

    // 1. Precise measurement via HTML Canvas (1cm = 37.79527559px at 96 DPI)
    if (typeof document !== "undefined") {
      try {
        if (!measurementCanvasRef.current) {
          measurementCanvasRef.current = document.createElement("canvas");
        }
        const ctx = measurementCanvasRef.current.getContext("2d");
        if (ctx) {
          ctx.font = "bold 20px 'Cairo', sans-serif";
          const metrics = ctx.measureText(clean);
          const widthInCm = metrics.width / 37.79527559;

          // Do NOT reduce font size until length strictly exceeds 8cm
          if (widthInCm <= 8.0) {
            return "20px";
          }
          if (widthInCm <= 8.6) {
            return "18.5px";
          }
          if (widthInCm <= 9.2) {
            return "17px";
          }
          if (widthInCm <= 9.8) {
            return "15.5px";
          }
          return "14px";
        }
      } catch (e) {
        // Fallback below
      }
    }

    // 2. Character length fallback: at 20px Cairo bold, ~28-29 characters correspond to 8cm
    const len = clean.length;
    if (len <= 28) return "20px";
    if (len <= 32) return "18.5px";
    if (len <= 36) return "17px";
    if (len <= 40) return "15.5px";
    return "14px";
  };

  // Direct print of the styled A4 pages
  const handlePrintA4 = () => {
    const printContent = reportPrintRef.current?.innerHTML;
    if (!printContent) return;

    // Create a temporary print container
    const printDiv = document.createElement("div");
    printDiv.id = "print-container-dynamic";
    printDiv.innerHTML = `
      <div style="direction: rtl; text-align: right; width: 100%; font-family: 'Cairo', sans-serif !important; background: white !important;">
        ${printContent}
      </div>
    `;

    // Add custom stylesheet specifically for dynamic A4 printing
    const style = document.createElement("style");
    style.id = "print-stylesheet-dynamic";
    style.innerHTML = `
      @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@700;800&display=swap');
      @page {
        size: A4 portrait;
        margin: 5mm 8mm;
      }
      @media print {
        html, body {
          margin: 0 !important;
          padding: 0 !important;
          background: white !important;
          font-family: 'Cairo', sans-serif !important;
        }
        body > *:not(#print-container-dynamic) {
          display: none !important;
        }
        #print-container-dynamic {
          display: block !important;
          width: 100% !important;
          margin: 0 !important;
          padding: 0 !important;
          background: white !important;
          color: black !important;
          direction: rtl !important;
          text-align: right !important;
          font-family: 'Cairo', sans-serif !important;
        }
        .a4-print-page {
          page-break-after: always !important;
          break-after: page !important;
          box-shadow: none !important;
          border: none !important;
          background: white !important;
          width: 100% !important;
          max-height: 285mm !important;
          height: 285mm !important;
          display: flex !important;
          flex-direction: column !important;
          justify-content: space-between !important;
          box-sizing: border-box !important;
          margin: 0 !important;
          padding: 2mm 0 !important;
          overflow: hidden !important;
          font-family: 'Cairo', sans-serif !important;
        }
        .a4-print-page:last-child {
          page-break-after: avoid !important;
          break-after: avoid !important;
        }
        table {
          border-collapse: collapse !important;
          width: 100% !important;
          border: 2px solid black !important;
          font-family: 'Cairo', sans-serif !important;
        }
        tr {
          height: 7.1mm !important;
          max-height: 7.1mm !important;
          box-sizing: border-box !important;
        }
        th, td {
          border: 1px solid black !important;
          padding: 0 4px !important;
          font-family: 'Cairo', sans-serif !important;
          font-weight: 700 !important;
          line-height: 1.1 !important;
          vertical-align: middle !important;
        }
        input {
          border: none !important;
          outline: none !important;
          background: transparent !important;
          box-shadow: none !important;
          padding: 0 !important;
          font-family: 'Cairo', sans-serif !important;
          font-weight: 700 !important;
          color: black !important;
          width: 100% !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        input::placeholder {
          color: transparent !important;
        }
        * {
          font-family: 'Cairo', sans-serif !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
      }
    `;

    document.head.appendChild(style);
    document.body.appendChild(printDiv);

    // Call native window print directly on the current window
    window.print();

    // Clean up elements after standard delay
    setTimeout(() => {
      if (document.body.contains(printDiv)) {
        document.body.removeChild(printDiv);
      }
      if (document.head.contains(style)) {
        document.head.removeChild(style);
      }
    }, 1000);
  };

  // Header display string based on chosen dates
  const headerDateDisplay = dateFrom === dateTo ? dateFrom : `من ${dateFrom} إلى ${dateTo}`;

  // Count active non-empty names
  const activeCount = displayRows.filter((r) => r.arabicName.trim().length > 0).length;

  return (
    <div className="space-y-6 font-cairo">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900">كشف حركة التابع للخدمات الجماهيرية (قسم جوازات طنطا)</h2>
          <p className="text-xs text-slate-500 mt-1">
            كشف رسمي يستوعب 35 صفاً لكل ورقة A4. يتيح اختيار التاريخ من وإلى، والكتابة والتعديل المباشر بالخلايا مع الحفظ التلقائي اللحظي ومزامنة جوجل شيت.
          </p>
        </div>

        {/* Real-time Save & Sync status badge */}
        {(saveStatus || isSaving || isSyncingSheets) && (
          <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-800 px-3.5 py-1.5 rounded-xl text-xs font-bold shadow-xs animate-fade-in self-start md:self-auto">
            {isSaving || isSyncingSheets ? (
              <RefreshCw className="w-4 h-4 text-emerald-600 animate-spin" />
            ) : (
              <Check className="w-4 h-4 text-emerald-600" />
            )}
            <span>{saveStatus || (isSyncingSheets ? "جاري مزامنة جوجل شيت..." : "جاري الحفظ التلقائي...")}</span>
          </div>
        )}
      </div>

      {/* Date Filter & Action Bar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          
          {/* Date range pickers (From - To) */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl shrink-0">
              <Filter className="w-5 h-5" />
            </div>

            {/* From Date */}
            <div className="space-y-0.5">
              <label className="text-[11px] font-bold text-slate-700 block">من تاريخ:</label>
              <input 
                type="date" 
                value={dateFrom} 
                onChange={(e) => setDateFrom(e.target.value)} 
                className="bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs font-mono font-bold focus:bg-white focus:ring-1 focus:ring-blue-500"
              />
            </div>

            {/* To Date */}
            <div className="space-y-0.5">
              <label className="text-[11px] font-bold text-slate-700 block">إلى تاريخ:</label>
              <input 
                type="date" 
                value={dateTo} 
                onChange={(e) => setDateTo(e.target.value)} 
                className="bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs font-mono font-bold focus:bg-white focus:ring-1 focus:ring-blue-500"
              />
            </div>

            {/* Quick Presets */}
            <div className="flex items-center gap-1.5 pt-4 flex-wrap">
              <button
                type="button"
                onClick={() => {
                  setDateFrom(todayStr);
                  setDateTo(todayStr);
                }}
                className={`px-2.5 py-1.5 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                  dateFrom === todayStr && dateTo === todayStr
                    ? "bg-blue-600 text-white"
                    : "bg-slate-100 hover:bg-slate-200 text-slate-700"
                }`}
              >
                اليوم
              </button>

              <button
                type="button"
                onClick={() => {
                  const d = new Date();
                  d.setDate(d.getDate() - 1);
                  const yStr = d.toISOString().split("T")[0];
                  setDateFrom(yStr);
                  setDateTo(yStr);
                }}
                className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg transition-colors cursor-pointer"
              >
                أمس
              </button>

              <button
                type="button"
                onClick={() => {
                  const d = new Date();
                  d.setDate(d.getDate() - 6);
                  setDateFrom(d.toISOString().split("T")[0]);
                  setDateTo(todayStr);
                }}
                className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg transition-colors cursor-pointer"
              >
                آخر 7 أيام
              </button>

              <button
                type="button"
                onClick={() => {
                  const d = new Date();
                  const firstDay = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
                  setDateFrom(firstDay);
                  setDateTo(todayStr);
                }}
                className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg transition-colors cursor-pointer"
              >
                هذا الشهر
              </button>

              <button
                type="button"
                onClick={() => {
                  setDateFrom("2025-01-01");
                  setDateTo(todayStr);
                }}
                className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg transition-colors cursor-pointer"
              >
                الكل
              </button>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={handleAddNewRow}
              className="px-3.5 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-xs"
              title="إضافة سطر جديد للكتابة اليدوية"
            >
              <Plus className="w-4 h-4" />
              إضافة سطر جديد ➕
            </button>

            <button
              type="button"
              disabled={isSyncingSheets}
              onClick={handleManualSyncToSheets}
              className="px-3.5 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors shadow-xs cursor-pointer disabled:opacity-50"
              title="مزامنة فورية لكشف أمان مع ملف جوجل شيت"
            >
              <Database className="w-4 h-4" />
              {isSyncingSheets ? "جاري المزامنة..." : "مزامنة جوجل شيت 📊"}
            </button>

            <button
              type="button"
              onClick={handleExportToExcel}
              className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors shadow-xs cursor-pointer"
            >
              <FileSpreadsheet className="w-4 h-4" />
              تصدير إكسيل (CSV)
            </button>

            <button
              type="button"
              onClick={handlePrintA4}
              className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors shadow-xs cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              طباعة الكشف A4 (35 صف)
            </button>
          </div>

        </div>

        {/* Tip & hint note */}
        <div className="bg-blue-50/70 border border-blue-100 rounded-xl px-3.5 py-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-blue-900">
          <div className="flex items-center gap-2">
            <span className="font-bold">💡 ميزة الكتابة والتعديل المباشر:</span>
            <span>
              يمكنك النقر على أي خانة اسم أو تاريخ ميلاد أو ملاحظات والتعديل فيها بحرية، وسيتم الحفظ التلقائي ومزامنة جوجل شيت بمجرد الخروج من الخلية.
            </span>
          </div>
          <span className="font-mono font-bold shrink-0 bg-blue-100 text-blue-800 px-2 py-0.5 rounded-md text-[11px]">
            المسجلين حالياً: {activeCount} عميل
          </span>
        </div>
      </div>

      {/* Screen Preview & Printable Canvas */}
      <div className="bg-slate-100/70 rounded-2xl border border-slate-200 p-4 sm:p-6 overflow-x-auto">
        <div className="text-xs text-slate-600 mb-4 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>
              معاينة كشف الحركة للطباعة (A4) - الفترة: <strong>{headerDateDisplay}</strong> | الإجمالي: <strong>{activeCount} عميل</strong>
            </span>
          </div>
          {totalPages > 1 && (
            <span className="text-xs font-bold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-200">
              إجمالي الصفحات: {totalPages} صفحات (35 صف لكل ورقة)
            </span>
          )}
        </div>

        {/* Report Print Canvas for Iframe / Native Print */}
        <div ref={reportPrintRef} className="mx-auto text-black">
          {Array.from({ length: totalPages }).map((_, pageIdx) => {
            const startIdx = pageIdx * ROWS_PER_PAGE;
            const pageCustomers = displayRows.slice(startIdx, startIdx + ROWS_PER_PAGE);

            return (
              <div 
                key={pageIdx} 
                className="a4-print-page bg-white border border-slate-300 shadow-md mx-auto mb-8 last:mb-0 text-black flex flex-col justify-between"
                style={{ 
                  width: "210mm", 
                  height: "297mm", 
                  maxHeight: "297mm",
                  padding: "5mm 8mm",
                  boxSizing: "border-box",
                  fontFamily: "'Cairo', sans-serif" 
                }}
              >
                <div>
                  {/* Header Banner - Cairo 20 Bold */}
                  <div className="flex justify-between items-center border-b-2 border-black pb-1 mb-1 text-black font-cairo">
                    <div className="text-right" style={{ fontFamily: "'Cairo', sans-serif", fontSize: "20px", fontWeight: "bold" }}>
                      قسم جوازات طنطا
                    </div>
                    <div className="text-center" style={{ fontFamily: "'Cairo', sans-serif", fontSize: "20px", fontWeight: "bold" }}>
                      كشف حركة التابع للخدمات الجماهيرية
                    </div>
                    <div className="text-left" style={{ fontFamily: "'Cairo', sans-serif", fontSize: "20px", fontWeight: "bold" }}>
                      التاريخ: {headerDateDisplay}
                    </div>
                  </div>

                  {/* Table - 4 Columns: م (1cm), الاسم (9.5cm), تاريخ الميلاد (3.5cm), الملاحظات (باقي المساحة) */}
                  <table 
                    className="w-full border-2 border-black text-right" 
                    style={{ 
                      borderCollapse: "collapse", 
                      width: "100%", 
                      tableLayout: "fixed",
                      fontFamily: "'Cairo', sans-serif", 
                      direction: "rtl" 
                    }}
                  >
                    <colgroup>
                      <col style={{ width: "1cm" }} />
                      <col style={{ width: "9.5cm" }} />
                      <col style={{ width: "3.5cm" }} />
                      <col />
                    </colgroup>
                    <tbody>
                      {Array.from({ length: ROWS_PER_PAGE }).map((_, rIdx) => {
                        const globalIndex = startIdx + rIdx;
                        const row = pageCustomers[rIdx];
                        const absoluteNumber = globalIndex + 1;

                        const rowName = row ? row.arabicName : "";
                        const rowBirthDate = row ? row.birthDate : "";
                        const rowNotes = row ? row.notes : "";

                        return (
                          <tr 
                            key={rIdx} 
                            className="border border-black group hover:bg-blue-50/20 transition-colors" 
                            style={{ height: "7.1mm", maxHeight: "7.1mm" }}
                          >
                            {/* 1. Sequence Number */}
                            <td 
                              className="border border-black text-center font-bold p-0 bg-slate-50/30" 
                              style={{ width: "1cm", fontFamily: "'Cairo', sans-serif", fontSize: "20px", fontWeight: "bold", lineHeight: 1.1 }}
                            >
                              {absoluteNumber}
                            </td>

                            {/* 2. Customer Name (Editable In-Place) */}
                            <td 
                              className="border border-black text-right font-bold p-0 relative" 
                              style={{ 
                                width: "9.5cm", 
                                fontFamily: "'Cairo', sans-serif", 
                                lineHeight: 1.1, 
                                whiteSpace: "nowrap" 
                              }}
                            >
                              <input
                                type="text"
                                value={rowName}
                                placeholder="اضغط لكتابة الاسم..."
                                onChange={(e) => handleCellChange(globalIndex, "arabicName", e.target.value)}
                                onBlur={() => handleCellBlur(globalIndex)}
                                className="w-full h-full bg-transparent border-0 px-1 text-right font-bold text-black focus:outline-none focus:ring-1 focus:ring-blue-500 focus:bg-blue-50/70 rounded-xs transition-colors"
                                style={{ 
                                  fontFamily: "'Cairo', sans-serif", 
                                  fontSize: getNameFontSize(rowName), 
                                  fontWeight: "bold", 
                                  lineHeight: 1.1 
                                }}
                              />
                            </td>

                            {/* 3. Birth Date (Editable In-Place) */}
                            <td 
                              className="border border-black text-center font-bold p-0" 
                              style={{ 
                                width: "3.5cm", 
                                fontFamily: "'Cairo', sans-serif", 
                                fontSize: "20px", 
                                fontWeight: "bold", 
                                lineHeight: 1.1, 
                                whiteSpace: "nowrap" 
                              }}
                            >
                              <input
                                type="text"
                                value={rowBirthDate}
                                placeholder="مواليد..."
                                onChange={(e) => handleCellChange(globalIndex, "birthDate", e.target.value)}
                                onBlur={() => handleCellBlur(globalIndex)}
                                className="w-full h-full bg-transparent border-0 px-1 text-center font-bold text-black focus:outline-none focus:ring-1 focus:ring-blue-500 focus:bg-blue-50/70 rounded-xs transition-colors"
                                style={{ 
                                  fontFamily: "'Cairo', sans-serif", 
                                  fontSize: "20px", 
                                  fontWeight: "bold", 
                                  lineHeight: 1.1 
                                }}
                              />
                            </td>

                            {/* 4. Notes (Editable In-Place) */}
                            <td 
                              className="border border-black text-right p-0" 
                              style={{ 
                                fontFamily: "'Cairo', sans-serif", 
                                fontSize: "20px", 
                                fontWeight: "bold", 
                                lineHeight: 1.1 
                              }}
                            >
                              <input
                                type="text"
                                value={rowNotes}
                                placeholder="ملاحظات..."
                                onChange={(e) => handleCellChange(globalIndex, "notes", e.target.value)}
                                onBlur={() => handleCellBlur(globalIndex)}
                                className="w-full h-full bg-transparent border-0 px-1 text-right font-bold text-black focus:outline-none focus:ring-1 focus:ring-blue-500 focus:bg-blue-50/70 rounded-xs transition-colors"
                                style={{ 
                                  fontFamily: "'Cairo', sans-serif", 
                                  fontSize: "20px", 
                                  fontWeight: "bold", 
                                  lineHeight: 1.1 
                                }}
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Signoff Section */}
                <div 
                  className="flex justify-start items-center px-4 pt-2 mt-2 border-t-2 border-black text-black font-cairo"
                  style={{ height: "14mm", maxHeight: "15mm", boxSizing: "border-box" }}
                >
                  <div className="flex items-center gap-3" style={{ fontFamily: "'Cairo', sans-serif", fontSize: "20px", fontWeight: "bold" }}>
                    <span>رئيس القسم :</span>
                    <span className="inline-block border-b-2 border-dotted border-black w-72 h-4 mb-1"></span>
                  </div>
                </div>

              </div>
            );
          })}
        </div>
      </div>

    </div>
  );
}
