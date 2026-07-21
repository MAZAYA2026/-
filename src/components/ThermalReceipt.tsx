import React, { useRef } from "react";
import { Invoice, AppSettings, Service } from "../types";
import { Printer, X } from "lucide-react";

interface ThermalReceiptProps {
  invoice: Invoice;
  settings: AppSettings;
  services: Service[];
  onClose: () => void;
}

export default function ThermalReceipt({ invoice, settings, services, onClose }: ThermalReceiptProps) {
  const receiptRef = useRef<HTMLDivElement>(null);

  const handlePrint = () => {
    const printContent = receiptRef.current?.innerHTML;
    if (!printContent) return;

    // Create a temporary print container
    const printDiv = document.createElement("div");
    printDiv.id = "print-container-dynamic";
    printDiv.innerHTML = `
      <div style="direction: rtl; text-align: right; width: 72mm; margin: 0 auto; font-family: 'Cairo', sans-serif !important;">
        ${printContent}
      </div>
    `;

    // Add custom stylesheet specifically for dynamic thermal printing
    const style = document.createElement("style");
    style.id = "print-stylesheet-dynamic";
    style.innerHTML = `
      @media print {
        body > *:not(#print-container-dynamic) {
          display: none !important;
        }
        #print-container-dynamic {
          display: block !important;
          width: 80mm !important;
          margin: 0 !important;
          padding: 4mm !important;
          background: white !important;
          color: black !important;
          direction: rtl !important;
          text-align: right !important;
        }
        * {
          font-family: 'Cairo', sans-serif !important;
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

  const containsSpecialServices = (cust: any) => {
    return cust.services.some((s: any) => {
      const match = invoice.customers.find(c => c === cust);
      // We look up full service details to check if its name starts with #
      // But in customer input, we have serviceId.
      return false; // we will calculate it inside render safely
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 no-print">
      <div className="relative w-full max-w-md bg-white rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-900 text-white">
          <h3 className="font-cairo font-bold text-lg">طباعة الفاتورة الحرارية (8سم)</h3>
          <button onClick={onClose} className="p-1 hover:bg-slate-800 rounded-lg transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Receipt Container */}
        <div className="flex-1 overflow-y-auto p-6 bg-slate-100 flex justify-center">
          <div 
            ref={receiptRef} 
            className="w-[80mm] bg-white p-4 shadow-md rounded-xs text-slate-900 font-cairo text-[12px] leading-relaxed direction-rtl text-right"
            style={{ direction: 'rtl', textAlign: 'right' }}
          >
            {/* Header Text */}
            <div className="text-center mb-2">
              <div className="font-bold text-sm leading-tight whitespace-pre-line mb-1">
                {settings.headerText || "مكتب مزايا للجوازات"}
              </div>
              <div className="text-[10px] text-slate-500">جوازات طنطا والمعاملات الحكومية</div>
            </div>

            <div className="border-t border-dashed border-slate-400 my-2"></div>

            {/* Invoice Meta */}
            <div className="text-[11px] space-y-1 text-slate-700">
              <div className="flex justify-between">
                <span>رقم الفاتورة:</span>
                <span className="font-bold font-mono">#{invoice.invoiceId}</span>
              </div>
              <div className="flex justify-between">
                <span>تاريخ الفاتورة:</span>
                <span className="font-mono">{invoice.date}</span>
              </div>
              <div className="flex justify-between">
                <span>الموظف المسؤول:</span>
                <span className="font-medium">{invoice.employeeName}</span>
              </div>
              <div className="flex justify-between">
                <span>حالة الفاتورة:</span>
                <span className={`font-bold ${
                  invoice.status === "NEW" ? "text-blue-600" :
                  invoice.status === "READY" ? "text-emerald-600" : "text-rose-600"
                }`}>
                  {invoice.status === "NEW" ? "جديدة" :
                   invoice.status === "READY" ? `جاهزة للتسليم (درج: ${invoice.archiveDrawer || 'N/A'})` : "تم التسليم"}
                </span>
              </div>
            </div>

            <div className="border-t border-dashed border-slate-400 my-2"></div>

            {/* Customers & Services */}
            <div className="space-y-4">
              {invoice.customers.map((customer, cIdx) => {
                // Determine if this customer has passport services (# or ##)
                // We'll examine the actual names of the services inside invoice customers
                const hasPassportService = customer.services.some(s => {
                  return s.serviceId.startsWith('#') || s.serviceId.includes('#'); // we'll pass names or lookups
                });

                return (
                  <div key={cIdx} className="bg-slate-50 p-2 rounded-xs border border-slate-200">
                    {/* Customer Info */}
                    <div className="font-bold text-[13px] text-slate-900">
                      {cIdx + 1}. {customer.arabicName}
                    </div>
                    {customer.englishName && (
                      <div className="text-[11px] text-slate-600 font-mono font-medium mt-0.5">
                        EN: {customer.englishName}
                      </div>
                    )}
                    {customer.nationalId && (
                      <div className="text-[10px] text-slate-500 mt-0.5 flex justify-between font-mono">
                        <span>الرقم القومي: {customer.nationalId}</span>
                        <span>مواليد: {customer.birthDate}</span>
                      </div>
                    )}
                    {customer.profession && (
                      <div className="text-[10px] text-slate-600 mt-0.5">
                        المهنة: <span className="font-medium">{customer.profession}</span>
                      </div>
                    )}
                    <div className="text-[10px] text-slate-500 font-mono">
                      الهاتف: {customer.phone}
                    </div>

                    <div className="border-t border-dotted border-slate-300 my-1.5"></div>

                    {/* Services selected */}
                    <div className="space-y-3 mt-2">
                      {customer.services.map((item, sIdx) => {
                        const matchedSrv = services.find(s => s.id === item.serviceId || s.name === item.serviceId);
                        const govPrice = matchedSrv ? matchedSrv.govPrice : 0;
                        const officeFee = matchedSrv ? matchedSrv.officeFee : 0;
                        const singleGovTotal = govPrice * item.quantity;
                        const singleOfficeTotal = officeFee * item.quantity;

                        return (
                          <div key={sIdx} className="space-y-1.5">
                            {/* Service header with name on right and quantity on left */}
                            <div className="flex justify-between items-center text-[12px] font-bold text-slate-900 px-0.5">
                              <span className="font-mono text-slate-600 font-extrabold">x{item.quantity}</span>
                              <span className="text-right">{matchedSrv?.name || item.serviceId}</span>
                            </div>

                            {/* Detailed financial breakdown table */}
                            <div className="border border-slate-200 rounded-lg overflow-hidden bg-white">
                              <table className="w-full text-center text-[10px] border-collapse">
                                <thead>
                                  <tr className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                                    <th className="py-1.5 border-l border-slate-200 w-1/3 text-center">المجموع</th>
                                    <th className="py-1.5 border-l border-slate-200 w-1/3 text-center">رسوم المكتب</th>
                                    <th className="py-1.5 w-1/3 text-center">السعر الحكومي</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  <tr className="text-slate-700 font-semibold bg-white">
                                    <td className="py-1.5 border-l border-slate-200 font-mono text-center">
                                      {item.price.toFixed(2)} <span className="text-[8px] text-slate-500 font-cairo">ج.م</span>
                                    </td>
                                    <td className="py-1.5 border-l border-slate-200 font-mono text-center">
                                      {singleOfficeTotal.toFixed(2)} <span className="text-[8px] text-slate-500 font-cairo">ج.م</span>
                                    </td>
                                    <td className="py-1.5 font-mono text-center">
                                      {singleGovTotal.toFixed(2)} <span className="text-[8px] text-slate-500 font-cairo">ج.م</span>
                                    </td>
                                  </tr>
                                </tbody>
                              </table>
                              
                              {/* Expected delivery date bar */}
                              {item.deliveryDate && (
                                <div className="bg-amber-50/70 border-t border-amber-100 px-2 py-1 text-center text-[9px] text-amber-800 font-bold">
                                  تاريخ الاستلام المتوقع: <span className="font-mono">{item.deliveryDate}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="border-t border-dashed border-slate-400 my-2"></div>

            {/* Total Summary */}
            <div className="space-y-1">
              <div className="flex justify-between items-center text-sm font-bold text-slate-900 pt-1">
                <span>المبلغ الإجمالي الكلي:</span>
                <span className="font-mono text-emerald-700 text-base font-extrabold">{invoice.totalAmount.toFixed(2)} ج.م</span>
              </div>
            </div>

            <div className="border-t border-dashed border-slate-400 my-2"></div>

            {/* Footer Text */}
            <div className="text-center text-[10px] text-slate-600 whitespace-pre-line leading-tight">
              {settings.footerText || "شكراً لكم على ثقتكم الغالية بـ مكتب مزايا للجوازات."}
            </div>

            {/* Print Date */}
            <div className="text-center text-[8px] text-slate-400 mt-2 font-mono">
              طباعة: {new Date().toLocaleString('ar-EG')}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 bg-slate-50 flex justify-end gap-3 border-t border-slate-100">
          <button 
            onClick={onClose} 
            className="px-4 py-2 border border-slate-200 text-slate-600 hover:bg-slate-100 rounded-lg text-sm font-medium font-cairo transition-colors"
          >
            إغلاق
          </button>
          <button 
            onClick={handlePrint} 
            className="px-5 py-2 bg-slate-900 text-white hover:bg-slate-800 rounded-lg text-sm font-bold font-cairo flex items-center gap-2 transition-colors"
          >
            <Printer className="w-4 h-4" />
            اطبع الآن
          </button>
        </div>

      </div>
    </div>
  );
}
