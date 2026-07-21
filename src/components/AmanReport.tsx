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

  // We filter customers whose services start with single '#' ONLY.
  // Single '#' means: starts with '#' but NOT starting with '##' (e.g. ## is regular, # is single-hash مستعجل).
  // "كشف أمان للخدمات وتحديدا للخدمات التى تبدأ بعلامة # فقط"
  const getAmanCustomers = () => {
    const list: {
      arabicName: string;
      birthDate: string;
      serviceName: string;
      date: string;
      invoiceId: number;
    }[] = [];

    invoices.forEach((inv) => {
      // Filter by date range
      if (inv.date < dateFrom || inv.date > dateTo) return;

      inv.customers.forEach((cust) => {
        cust.services.forEach((s) => {
          const serviceName = s.serviceId;
          const startsWithSingleHash = serviceName.startsWith("#") && !serviceName.startsWith("##");
          
          if (startsWithSingleHash) {
            list.push({
              arabicName: cust.arabicName,
              birthDate: cust.birthDate || "N/A",
              serviceName: serviceName,
              date: inv.date,
              invoiceId: inv.invoiceId
            });
          }
        });
      });
    });

    return list;
  };

  const amanCustomers = getAmanCustomers();

  // Excel Export to CSV with exact format
  const handleExportToExcel = () => {
    if (amanCustomers.length === 0) {
      alert("لا توجد بيانات لتصديرها للفترة المحددة.");
      return;
    }

    // Prepare CSV content with Arabic UTF-8 BOM
    let csvContent = "\ufeff";
    csvContent += "قسم جوازات طنطا - كشف حركة للخدمات الجماهيرية\r\n";
    csvContent += `الفترة: من ${dateFrom} إلى ${dateTo}\r\n\r\n`;
    csvContent += "مسلسل,الاسم الكامل,تاريخ الميلاد,الملاحظات\r\n";

    amanCustomers.forEach((cust, idx) => {
      // Clean commas from names
      const cleanName = cust.arabicName.replace(/,/g, " ");
      csvContent += `${idx + 1},${cleanName},${cust.birthDate},\r\n`;
    });

    csvContent += "\r\nرئيس قسم جوازات طنطا والتوقيع\r\n";

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `كشف_أمان_طنطا_${dateFrom}_إلى_${dateTo}.csv`);
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
      <div style="direction: rtl; text-align: right; width: 210mm; font-family: 'Cairo', sans-serif !important; background: white !important;">
        ${printContent}
      </div>
    `;

    // Add custom stylesheet specifically for dynamic A4 printing
    const style = document.createElement("style");
    style.id = "print-stylesheet-dynamic";
    style.innerHTML = `
      @media print {
        body > *:not(#print-container-dynamic) {
          display: none !important;
        }
        #print-container-dynamic {
          display: block !important;
          width: 210mm !important;
          height: auto !important;
          margin: 0 !important;
          padding: 0 !important;
          background: white !important;
          color: black !important;
          direction: rtl !important;
          text-align: right !important;
        }
        /* Keep each nested card on its own A4 page */
        #print-container-dynamic > div > div {
          page-break-after: always !important;
          break-after: page !important;
          box-shadow: none !important;
          border: none !important;
          background: white !important;
        }
        #print-container-dynamic > div > div:last-child {
          page-break-after: avoid !important;
          break-after: avoid !important;
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

  // Grouping customers for paginated A4 layout (approx 6 rows per sheet for size 22 text)
  const ROWS_PER_PAGE = 6;
  const totalPages = Math.max(1, Math.ceil(amanCustomers.length / ROWS_PER_PAGE));

  // Arabic Page numbers array
  const arabicPageNames = ["الورقة الأولى", "الورقة الثانية", "الورقة الثالثة", "الورقة الرابعة", "الورقة الخامسة", "الورقة السادسة", "الورقة السابعة", "الورقة الثامنة", "الورقة التاسعة", "الورقة العاشرة"];

  return (
    <div className="space-y-6 font-cairo">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900">شاشة كشف أمان الجماهيري (#)</h2>
          <p className="text-sm text-slate-500 mt-1">تصدير وطباعة كشوف الحركة الموثقة لخدمات الجوازات المستعجلة</p>
        </div>
      </div>

      {/* Date Filter Bar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
            <Filter className="w-5 h-5" />
          </div>
          <div className="grid grid-cols-2 gap-3 w-full sm:w-auto">
            <div className="space-y-1">
              <label className="text-[10px] text-slate-500 block">البحث من تاريخ:</label>
              <input 
                type="date" 
                value={dateFrom} 
                onChange={(e) => setDateFrom(e.target.value)} 
                className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-mono"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] text-slate-500 block">البحث إلى تاريخ:</label>
              <input 
                type="date" 
                value={dateTo} 
                onChange={(e) => setDateTo(e.target.value)} 
                className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-mono"
              />
            </div>
          </div>
        </div>

        <div className="flex gap-2 w-full sm:w-auto">
          <button
            onClick={handleExportToExcel}
            className="flex-1 sm:flex-initial px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors shadow-xs"
          >
            <FileSpreadsheet className="w-4 h-4" />
            تصدير للإكسيل (CSV)
          </button>
          <button
            onClick={handlePrintA4}
            className="flex-1 sm:flex-initial px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors shadow-xs"
          >
            <Printer className="w-4 h-4" />
            طباعة مباشرة A4
          </button>
        </div>
      </div>

      {/* Screen Preview */}
      <div className="bg-slate-50 rounded-2xl border border-slate-200 p-6 overflow-x-auto">
        <div className="text-xs text-slate-500 mb-4 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          <span>معاينة المستند المجهز للطباعة (A4) - عدد المسجلين: <strong>{amanCustomers.length} عميل</strong></span>
        </div>

        {amanCustomers.length === 0 ? (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl p-5 flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-amber-500 shrink-0" />
            <div className="text-xs">
              لا توجد أي معاملات لخدمات تبدأ بـ (#) فقط في التاريخ المختار. تأكد من إدراج خدمات صحيحة تبدأ برمز الهاش الواحد.
            </div>
          </div>
        ) : (
          /* Report Print Canvas for Iframe */
          <div ref={reportPrintRef} className="mx-auto bg-white border border-slate-300 shadow-xl max-w-[210mm] text-black">
            {Array.from({ length: totalPages }).map((_, pageIdx) => {
              const startIdx = pageIdx * ROWS_PER_PAGE;
              const pageCustomers = amanCustomers.slice(startIdx, startIdx + ROWS_PER_PAGE);
              const pageName = arabicPageNames[pageIdx] || `الورقة رقم ${pageIdx + 1}`;

              return (
                <div 
                  key={pageIdx} 
                  className="p-10 border-b border-dashed border-slate-200 last:border-0 relative min-h-[297mm] flex flex-col justify-between"
                  style={{ width: "210mm", height: "297mm", boxSizing: "border-box" }}
                >
                  <div>
                    {/* Header Banner */}
                    <div className="flex justify-between items-center border-b-2 border-black pb-4 mb-6">
                      <div className="text-right space-y-1 font-bold" style={{ fontSize: "20px" }}>
                        <div>قسم جوازات طنطا</div>
                        <div style={{ fontSize: "14px", fontWeight: "normal", color: "#666" }}>حركة المعاملات الرسمية</div>
                      </div>
                      <div className="text-center font-bold" style={{ fontSize: "24px" }}>
                        كشف حركة للخدمات الجماهيرية
                      </div>
                      <div className="text-left font-bold" style={{ fontSize: "16px" }}>
                        التاريخ: {new Date().toLocaleDateString("ar-EG")}
                      </div>
                    </div>

                    {/* Styled Table */}
                    <table className="w-full border-2 border-black text-right" style={{ borderCollapse: "collapse" }}>
                      <thead>
                        <tr className="bg-slate-100">
                          <th className="border border-black p-3 font-bold text-center" style={{ width: "12mm", fontSize: "18px" }}>م</th>
                          <th className="border border-black p-3 font-bold text-right" style={{ width: "80mm", fontSize: "18px" }}>الاسم الكامل (رباعي)</th>
                          <th className="border border-black p-3 font-bold text-center" style={{ width: "45mm", fontSize: "18px" }}>تاريخ الميلاد</th>
                          <th className="border border-black p-3 font-bold text-right" style={{ width: "65mm", fontSize: "18px" }}>ملاحظات ومراجعات أمان</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pageCustomers.map((cust, itemIdx) => {
                          const absoluteIdx = startIdx + itemIdx + 1;
                          return (
                            <tr key={itemIdx} className="h-20 hover:bg-slate-50/50">
                              <td className="border-2 border-black p-3 font-bold text-center" style={{ fontSize: "18px" }}>{absoluteIdx}</td>
                              <td className="border-2 border-black p-3 font-bold" style={{ fontSize: "18px" }}>{cust.arabicName}</td>
                              <td className="border-2 border-black p-3 font-bold text-center" style={{ fontSize: "18px" }}>{cust.birthDate}</td>
                              <td className="border-2 border-black p-3 font-medium text-slate-500" style={{ fontSize: "18px" }}></td>
                            </tr>
                          );
                        })}
                        {/* Filler empty rows to maintain A4 aesthetic if last page has fewer rows */}
                        {pageCustomers.length < ROWS_PER_PAGE && 
                          Array.from({ length: ROWS_PER_PAGE - pageCustomers.length }).map((_, fillerIdx) => (
                            <tr key={`filler-${fillerIdx}`} className="h-20">
                              <td className="border border-slate-300 p-3 text-center text-slate-300"></td>
                              <td className="border border-slate-300 p-3"></td>
                              <td className="border border-slate-300 p-3"></td>
                              <td className="border border-slate-300 p-3"></td>
                            </tr>
                          ))
                        }
                      </tbody>
                    </table>
                  </div>

                  {/* Signoff details */}
                  <div className="flex justify-between items-end mt-12 mb-8 px-4 font-bold" style={{ fontSize: "18px" }}>
                    <div className="text-right">
                      <div>المسؤول عن الحركة:</div>
                      <div className="text-slate-500 text-sm mt-1">{activeEmployee.name}</div>
                    </div>
                    <div className="text-left font-bold text-lg border-t border-black pt-4 px-10">
                      رئيس قسم جوازات طنطا والتوقيع
                    </div>
                  </div>

                  {/* Page Footer */}
                  <div className="text-center font-bold text-sm border-t border-slate-200 pt-2 text-slate-500">
                    {pageName} - كشف أمان خدمات مزايا
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
