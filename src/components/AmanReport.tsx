import React, { useState, useRef } from "react";
import { Invoice, Service, Employee } from "../types";
import { Calendar, Printer, FileSpreadsheet, Filter, CheckCircle2, AlertCircle } from "lucide-react";

interface AmanReportProps {
  invoices: Invoice[];
  services: Service[];
  activeEmployee: Employee;
}

export default function AmanReport({ invoices, services, activeEmployee }: AmanReportProps) {
  // Date filters
  const [dateFrom, setDateFrom] = useState(new Date().toISOString().split("T")[0]);
  const [dateTo, setDateTo] = useState(new Date().toISOString().split("T")[0]);

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

  // We filter customers whose services start with single '#' ONLY.
  // Single '#' means: starts with '#' but NOT starting with '##' (e.g. ## is regular, # is single-hash مستعجل).
  // "كشف أمان للخدمات وتحديدا للخدمات التى تبدأ بعلامة # فقط"
  const getAmanCustomers = () => {
    const list: {
      arabicName: string;
      birthDate: string;
      date: string;
      invoiceId: number;
    }[] = [];

    invoices.forEach((inv) => {
      // Filter by date range
      if (inv.date < dateFrom || inv.date > dateTo) return;

      inv.customers.forEach((cust) => {
        const hasAmanService = cust.services.some((s) => {
          const serviceName = s.serviceId;
          return serviceName.startsWith("#") && !serviceName.startsWith("##");
        });

        if (hasAmanService) {
          list.push({
            arabicName: cust.arabicName,
            birthDate: extractBirthDate(cust.birthDate, cust.nationalId),
            date: inv.date,
            invoiceId: inv.invoiceId,
          });
        }
      });
    });

    return list;
  };

  const amanCustomers = getAmanCustomers();

  // Excel Export to CSV with exact requested format
  const handleExportToExcel = () => {
    if (amanCustomers.length === 0) {
      alert("لا توجد بيانات لتصديرها للفترة المحددة.");
      return;
    }

    const todayDisplay = dateFrom === dateTo ? dateFrom : `${dateFrom} إلى ${dateTo}`;

    // Prepare CSV content with Arabic UTF-8 BOM
    let csvContent = "\ufeff";
    csvContent += "قسم جوازات طنطا - كشف حركة التابع للخدمات الجماهيرية\r\n";
    csvContent += `التاريخ: ${todayDisplay}\r\n\r\n`;
    csvContent += "م,الاسم,تاريخ الميلاد,الملاحظات\r\n";

    amanCustomers.forEach((cust, idx) => {
      const cleanName = cust.arabicName.replace(/,/g, " ");
      csvContent += `${idx + 1},${cleanName},${cust.birthDate || ""},\r\n`;
    });

    csvContent += "\r\n,,,توقيع رئيس القسم\r\n";

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `كشف_حركة_الخدمات_الجماهيرية_${dateFrom}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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
        th {
          border: 1px solid black !important;
          padding: 0 4px !important;
          font-family: 'Cairo', sans-serif !important;
          font-size: 20px !important;
          font-weight: 700 !important;
          line-height: 1.1 !important;
          background-color: #f8fafc !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        td {
          border: 1px solid black !important;
          padding: 0 4px !important;
          font-family: 'Cairo', sans-serif !important;
          font-size: 20px !important;
          font-weight: 700 !important;
          line-height: 1.1 !important;
          vertical-align: middle !important;
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

    // Call native window print directly on the top frame / current window
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

  // The user explicitly requested: the page accommodates exactly 35 rows
  const ROWS_PER_PAGE = 35;
  const totalPages = Math.max(1, Math.ceil(amanCustomers.length / ROWS_PER_PAGE));

  // Arabic Page numbers array (used if multiple sheets are needed)
  const arabicPageNames = ["الورقة الأولى", "الورقة الثانية", "الورقة الثالثة", "الورقة الرابعة", "الورقة الخامسة"];

  // Format today's date
  const today = new Date();
  const todayFormatted = `${today.getFullYear()}/${String(today.getMonth() + 1).padStart(2, "0")}/${String(today.getDate()).padStart(2, "0")}`;

  return (
    <div className="space-y-6 font-cairo">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900">كشف حركة التابع للخدمات الجماهيرية (قسم جوازات طنطا)</h2>
          <p className="text-xs text-slate-500 mt-1">كشف رسمي معتمد يستوعب 35 صفاً لكل ورقة A4 ومجهز للطباعة المباشرة والتوقيع اليدوي</p>
        </div>
      </div>

      {/* Date Filter Bar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="p-2 bg-blue-50 text-blue-600 rounded-lg shrink-0">
            <Filter className="w-5 h-5" />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="space-y-0.5">
              <label className="text-[10px] text-slate-500 block">التاريخ:</label>
              <input 
                type="date" 
                value={dateFrom} 
                onChange={(e) => {
                  setDateFrom(e.target.value);
                  setDateTo(e.target.value);
                }} 
                className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-mono"
              />
            </div>
            <button
              type="button"
              onClick={() => {
                const now = new Date().toISOString().split("T")[0];
                setDateFrom(now);
                setDateTo(now);
              }}
              className="mt-3.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg transition-colors cursor-pointer"
            >
              اليوم الحالي
            </button>
          </div>
        </div>

        <div className="flex gap-2 w-full sm:w-auto">
          <button
            onClick={handleExportToExcel}
            className="flex-1 sm:flex-initial px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors shadow-xs cursor-pointer"
          >
            <FileSpreadsheet className="w-4 h-4" />
            تصدير للإكسيل (CSV)
          </button>
          <button
            onClick={handlePrintA4}
            className="flex-1 sm:flex-initial px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors shadow-xs cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            طباعة الكشف A4 (35 صف)
          </button>
        </div>
      </div>

      {/* Screen Preview */}
      <div className="bg-slate-100/70 rounded-2xl border border-slate-200 p-4 sm:p-6 overflow-x-auto">
        <div className="text-xs text-slate-600 mb-4 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>معاينة كشف الحركة للطباعة (A4) - المسجلين: <strong>{amanCustomers.length} عميل</strong> (35 صف لكل ورقة)</span>
          </div>
          {totalPages > 1 && (
            <span className="text-xs font-bold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-200">
              إجمالي الصفحات: {totalPages} صفحات
            </span>
          )}
        </div>

        {amanCustomers.length === 0 ? (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl p-5 flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-amber-500 shrink-0" />
            <div className="text-xs">
              لا توجد أي معاملات لخدمات تبدأ بـ (#) فقط في التاريخ المختار ({dateFrom}).
            </div>
          </div>
        ) : (
          /* Report Print Canvas for Iframe / Print */
          <div ref={reportPrintRef} className="mx-auto text-black">
            {Array.from({ length: totalPages }).map((_, pageIdx) => {
              const startIdx = pageIdx * ROWS_PER_PAGE;
              const pageCustomers = amanCustomers.slice(startIdx, startIdx + ROWS_PER_PAGE);

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
                    {/* Header Banner - Exact Requested Format: Cairo 20 Bold */}
                    <div className="flex justify-between items-center border-b-2 border-black pb-1 mb-1 text-black font-cairo">
                      <div className="text-right" style={{ fontFamily: "'Cairo', sans-serif", fontSize: "20px", fontWeight: "bold" }}>
                        قسم جوازات طنطا
                      </div>
                      <div className="text-center" style={{ fontFamily: "'Cairo', sans-serif", fontSize: "20px", fontWeight: "bold" }}>
                        كشف حركة التابع للخدمات الجماهيرية
                      </div>
                      <div className="text-left" style={{ fontFamily: "'Cairo', sans-serif", fontSize: "20px", fontWeight: "bold" }}>
                        التاريخ: {todayFormatted}
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
                      <thead>
                        <tr className="bg-slate-50 border-b-2 border-black" style={{ height: "7.2mm" }}>
                          <th className="border border-black text-center font-bold" style={{ width: "1cm", fontFamily: "'Cairo', sans-serif", fontSize: "20px", fontWeight: "bold", padding: "0 1px" }}>م</th>
                          <th className="border border-black text-right font-bold" style={{ width: "9.5cm", fontFamily: "'Cairo', sans-serif", fontSize: "20px", fontWeight: "bold", padding: "0 4px" }}>الاسم</th>
                          <th className="border border-black text-center font-bold" style={{ width: "3.5cm", fontFamily: "'Cairo', sans-serif", fontSize: "20px", fontWeight: "bold", padding: "0 2px", whiteSpace: "nowrap" }}>تاريخ الميلاد</th>
                          <th className="border border-black text-center font-bold" style={{ fontFamily: "'Cairo', sans-serif", fontSize: "20px", fontWeight: "bold", padding: "0 2px" }}>الملاحظات</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Array.from({ length: ROWS_PER_PAGE }).map((_, rIdx) => {
                          const cust = pageCustomers[rIdx];
                          const absoluteIdx = startIdx + rIdx + 1;

                          return (
                            <tr key={rIdx} className="border border-black" style={{ height: "7.1mm", maxHeight: "7.1mm" }}>
                              <td className="border border-black text-center font-bold p-0" style={{ width: "1cm", fontFamily: "'Cairo', sans-serif", fontSize: "20px", fontWeight: "bold", lineHeight: 1.1 }}>
                                {absoluteIdx}
                              </td>
                              <td className="border border-black text-right font-bold" style={{ width: "9.5cm", fontFamily: "'Cairo', sans-serif", fontSize: "20px", fontWeight: "bold", lineHeight: 1.1, padding: "0 4px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {cust ? cust.arabicName : ""}
                              </td>
                              <td className="border border-black text-center font-bold" style={{ width: "3.5cm", fontFamily: "'Cairo', sans-serif", fontSize: "20px", fontWeight: "bold", lineHeight: 1.1, padding: "0 2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {cust ? cust.birthDate : ""}
                              </td>
                              <td className="border border-black text-right" style={{ fontFamily: "'Cairo', sans-serif", fontSize: "20px", fontWeight: "bold", lineHeight: 1.1, padding: "0 4px" }}>
                                {/* عامود الملاحظات للكتابة اليدوية به كملاحظات */}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Signoff Section - Compact space not exceeding 10mm to preserve single A4 page */}
                  <div 
                    className="flex justify-end items-center px-4 pt-1 mt-1 border-t border-black text-black font-cairo"
                    style={{ height: "10mm", maxHeight: "10mm", boxSizing: "border-box" }}
                  >
                    <div className="flex items-center gap-3" style={{ fontFamily: "'Cairo', sans-serif", fontSize: "20px", fontWeight: "bold" }}>
                      <span>توقيع رئيس القسم :</span>
                      <span className="inline-block border-b border-dotted border-black w-56 h-4 mb-1"></span>
                    </div>
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
