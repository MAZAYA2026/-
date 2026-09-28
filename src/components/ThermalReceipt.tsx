import React, { useRef } from "react";
import { Invoice, AppSettings, Service } from "../types";
import { calculateWorkingDaysDeliveryDate, getArabicDayName, recalculateCustomerServicesDeliveryDates } from "../lib/businessDays";
import { Printer, X, Send } from "lucide-react";

interface ThermalReceiptProps {
  invoice: Invoice;
  settings: AppSettings;
  services: Service[];
  onClose: () => void;
  onSendWhatsApp?: () => void;
}

export default function ThermalReceipt({ invoice, settings, services, onClose, onSendWhatsApp }: ThermalReceiptProps) {
  const receiptRef = useRef<HTMLDivElement>(null);

  const handlePrint = () => {
    const printContent = receiptRef.current?.innerHTML;
    if (!printContent) return;

    // Create a temporary print container
    const printDiv = document.createElement("div");
    printDiv.id = "print-container-dynamic";
    printDiv.innerHTML = `
      <div style="direction: rtl; text-align: right; width: 74mm; margin: 0 auto; font-family: 'Cairo', sans-serif !important; color: #000000 !important; background: #ffffff !important;">
        ${printContent}
      </div>
    `;

    // Add custom stylesheet specifically for dynamic thermal printing
    const style = document.createElement("style");
    style.id = "print-stylesheet-dynamic";
    style.innerHTML = `
      @media print {
        @page {
          size: 80mm auto;
          margin: 0;
        }
        body {
          margin: 0 !important;
          padding: 0 !important;
          background: #ffffff !important;
        }
        body > *:not(#print-container-dynamic) {
          display: none !important;
        }
        #print-container-dynamic {
          display: block !important;
          width: 76mm !important;
          margin: 0 auto !important;
          padding: 2mm 1mm !important;
          background: #ffffff !important;
          color: #000000 !important;
          direction: rtl !important;
          text-align: right !important;
        }
        #print-container-dynamic * {
          color: #000000 !important;
          border-color: #000000 !important;
          font-family: 'Cairo', sans-serif !important;
          background-color: transparent !important;
          box-shadow: none !important;
          text-shadow: none !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        #print-container-dynamic table,
        #print-container-dynamic th,
        #print-container-dynamic td {
          border-color: #000000 !important;
          color: #000000 !important;
        }
        #print-container-dynamic .border-dashed {
          border-style: dashed !important;
          border-color: #000000 !important;
        }
        #print-container-dynamic .border-dotted {
          border-style: dotted !important;
          border-color: #000000 !important;
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
            className="w-[80mm] bg-white p-4 shadow-md rounded-xs text-black font-cairo text-[12px] leading-relaxed direction-rtl text-right"
            style={{ direction: 'rtl', textAlign: 'right' }}
          >
            {/* Header Text */}
            <div className="text-center mb-2">
              <div className="font-bold text-base leading-tight whitespace-pre-line mb-1 text-black">
                {settings.headerText || "مكتب مزايا للجوازات"}
              </div>
              {(settings.subHeaderText !== undefined ? settings.subHeaderText : "جوازات طنطا والمعاملات الحكومية") && (
                <div className="text-[11px] text-black font-bold">
                  {settings.subHeaderText !== undefined ? settings.subHeaderText : "جوازات طنطا والمعاملات الحكومية"}
                </div>
              )}
            </div>

            <div className="border-t-2 border-dashed border-black my-2"></div>

            {/* Invoice Meta */}
            <div className="text-[11.5px] space-y-1 text-black font-semibold">
              <div className="flex justify-between">
                <span>رقم الفاتورة:</span>
                <span className="font-bold font-mono text-black text-xs">#{invoice.invoiceId}</span>
              </div>
              <div className="flex justify-between">
                <span>تاريخ الفاتورة:</span>
                <span className="font-mono text-black">{invoice.date}</span>
              </div>
              <div className="flex justify-between">
                <span>الموظف المسؤول:</span>
                <span className="font-bold text-black">{invoice.employeeName}</span>
              </div>
              <div className="flex justify-between">
                <span>حالة الفاتورة:</span>
                <span className="font-bold text-black">
                  {invoice.status === "NEW" ? "جديدة" :
                   invoice.status === "READY" ? `جاهزة للتسليم (درج: ${invoice.archiveDrawer || 'N/A'})` : "تم التسليم"}
                </span>
              </div>

              {/* Overall Latest Delivery Date */}
              {(() => {
                const allDeliveryDates: string[] = [];
                const customHolidays = settings.customHolidays || [];
                const includeSaturday = settings.includeSaturdayAsWeekend !== false;
                let hasMultipleServices = false;

                invoice.customers.forEach((c) => {
                  if (c.services.length > 1) {
                    hasMultipleServices = true;
                  }
                  const seqServices = recalculateCustomerServicesDeliveryDates(
                    c.services,
                    invoice.date || new Date(),
                    services,
                    customHolidays,
                    includeSaturday
                  );
                  seqServices.forEach((s) => {
                    const finalD = s.deliveryDate || "";
                    if (finalD && !allDeliveryDates.includes(finalD)) {
                      allDeliveryDates.push(finalD);
                    }
                  });
                });
                const maxDeliveryDate = allDeliveryDates.length > 0 ? allDeliveryDates.sort().reverse()[0] : "";
                if (!maxDeliveryDate) return null;
                const dayName = getArabicDayName(maxDeliveryDate);
                return (
                  <div className="bg-white border-2 border-black p-2 rounded-xs mt-1.5 text-center text-black">
                    <div className="text-[11px] font-bold text-black">موعد استلام المعاملة النهائي الفعلي (أيام عمل رسمية):</div>
                    <div className="text-sm font-black font-mono mt-0.5 text-black tracking-wider">
                      {dayName ? `${dayName} ` : ""}{maxDeliveryDate}
                    </div>
                    {hasMultipleServices && (
                      <div className="text-[9px] font-bold text-black mt-1 border-t border-dashed border-black pt-1">
                        * يبدأ احتساب مدة الخدمة التالية بعد انتهاء الخدمة السابقة بالتتابع
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>

            <div className="border-t-2 border-dashed border-black my-2"></div>

            {/* Customers & Services */}
            <div className="space-y-4">
              {invoice.customers.map((customer, cIdx) => {
                // Determine if this customer has passport services (# or ##)
                // We'll examine the actual names of the services inside invoice customers
                const hasPassportService = customer.services.some(s => {
                  return s.serviceId.startsWith('#') || s.serviceId.includes('#'); // we'll pass names or lookups
                });

                return (
                  <div key={cIdx} className="bg-white p-2.5 rounded-xs border-2 border-black">
                    {/* Customer Info */}
                    <div className="font-bold text-[13px] text-black">
                      {cIdx + 1}. {customer.arabicName}
                    </div>
                    {customer.englishName && (
                      <div className="text-[11px] text-black font-mono font-bold mt-0.5">
                        EN: {customer.englishName}
                      </div>
                    )}
                    {customer.nationalId && (
                      <div className="text-[11px] text-black font-bold mt-0.5 flex justify-between font-mono">
                        <span>الرقم القومي: {customer.nationalId}</span>
                        <span>مواليد: {customer.birthDate}</span>
                      </div>
                    )}
                    {customer.profession && (
                      <div className="text-[11px] text-black font-bold mt-0.5">
                        المهنة: <span className="font-bold">{customer.profession}</span>
                      </div>
                    )}
                    <div className="text-[11px] text-black font-bold font-mono">
                      الهاتف: {customer.phone}
                    </div>

                    <div className="border-t-2 border-dashed border-black my-2"></div>

                    {/* Services selected */}
                    {(() => {
                      const customHolidays = settings.customHolidays || [];
                      const includeSaturday = settings.includeSaturdayAsWeekend !== false;
                      const seqCustomerServices = recalculateCustomerServicesDeliveryDates(
                        customer.services,
                        invoice.date || new Date(),
                        services,
                        customHolidays,
                        includeSaturday
                      );

                      return (
                        <div className="space-y-3 mt-2">
                          {seqCustomerServices.map((item, sIdx) => {
                            const matchedSrv = services.find(s => s.id === item.serviceId || s.name === item.serviceId);
                            const govPrice = matchedSrv ? matchedSrv.govPrice : 0;
                            const officeFee = matchedSrv ? matchedSrv.officeFee : 0;
                            const fineAmount = item.fineAmount || 0;
                            const unitPrice = govPrice + fineAmount + officeFee; // سعر الخدمة الواحدة شامل الغرامة إن وجدت
                            const serviceTotal = item.price || (unitPrice * item.quantity); // إجمالي الخدمة = سعر المفرد × العدد
                            const srvDeliveryDate = item.deliveryDate && item.deliveryDate.trim() ? item.deliveryDate.trim() : "";
                            const srvDayName = srvDeliveryDate ? getArabicDayName(srvDeliveryDate) : "";

                            return (
                              <div key={sIdx} className="space-y-1.5">
                                {/* Service header with name on right and quantity badge on left */}
                                <div className="flex justify-between items-center text-[12px] font-bold text-black px-0.5">
                                  <span className="font-mono text-black font-black text-sm bg-black text-white px-1.5 py-0.2 rounded-xs">
                                    العدد: {item.quantity}
                                  </span>
                                  <span className="text-right text-black font-bold text-[12.5px]">{matchedSrv?.name || item.serviceId}</span>
                                </div>

                                {/* Detailed financial breakdown table */}
                                <div className="border-2 border-black rounded-xs overflow-hidden bg-white">
                                  <table className="w-full text-center text-[10.5px] border-collapse text-black">
                                    <thead>
                                      <tr className="bg-white text-black font-bold border-b-2 border-black">
                                        <th className="py-1 border-l-2 border-black w-[28%] text-center text-black font-bold">إجمالي الخدمة</th>
                                        <th className="py-1 border-l-2 border-black w-[18%] text-center text-black font-bold">العدد</th>
                                        <th className="py-1 border-l-2 border-black w-[27%] text-center text-black font-bold">أجر الخدمة (مفرد)</th>
                                        <th className="py-1 w-[27%] text-center text-black font-bold">السعر الحكومي (مفرد)</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      <tr className="text-black font-bold bg-white">
                                        <td className="py-1.5 border-l-2 border-black font-mono font-black text-center text-black text-[11.5px]">
                                          {serviceTotal.toFixed(2)} <span className="text-[8.5px] text-black font-cairo">ج.م</span>
                                        </td>
                                        <td className="py-1.5 border-l-2 border-black font-mono font-black text-center text-black text-xs">
                                          {item.quantity}
                                        </td>
                                        <td className="py-1.5 border-l-2 border-black font-mono font-bold text-center text-black">
                                          {officeFee.toFixed(2)} <span className="text-[8.5px] text-black font-cairo">ج.م</span>
                                        </td>
                                        <td className="py-1.5 font-mono font-bold text-center text-black">
                                          {govPrice.toFixed(2)} <span className="text-[8.5px] text-black font-cairo">ج.م</span>
                                        </td>
                                      </tr>
                                    </tbody>
                                  </table>

                                  {/* Government fine row if applicable */}
                                  {fineAmount > 0 && (
                                    <div className="border-t-2 border-black px-2 py-1 bg-white text-[10px] text-black flex justify-between items-center font-bold">
                                      <span>⚠️ تشمل غرامة حكومية ({item.fineName || "غرامة"}):</span>
                                      <span className="font-mono font-black">+{fineAmount.toFixed(2)} ج.م (للوحدة)</span>
                                    </div>
                                  )}

                                  {/* Subtotal calculation note for clarity when quantity > 1 or fine exists */}
                                  {(item.quantity > 1 || fineAmount > 0) && (
                                    <div className="border-t border-black px-2 py-0.5 bg-white text-[9.5px] text-black text-center font-mono font-bold">
                                      [سعر المفرد {unitPrice.toFixed(2)} ج.م × {item.quantity} = {serviceTotal.toFixed(2)} ج.م]
                                    </div>
                                  )}
                                  
                                  {/* Delivery instructions shown individually for each service */}
                                  {matchedSrv?.instructions && (
                                    <div className="border-t-2 border-black px-2 py-1 text-right text-black bg-white">
                                      <span className="font-bold text-[10px] block">📋 تعليمات تسليم الخدمة:</span>
                                      <span className="text-[9.5px] leading-tight block mt-0.5 text-black font-normal">
                                        {matchedSrv.instructions}
                                      </span>
                                    </div>
                                  )}

                                  {/* Expected delivery date bar - prominent */}
                                  <div className="border-t-2 border-black px-2 py-1.5 text-center text-[11px] text-black font-bold bg-white flex items-center justify-between">
                                    <span>
                                      {customer.services.length > 1 && sIdx > 0 ? "موعد الاستلام (يبدأ بعد السابقة):" : "موعد تسليم الخدمة:"}
                                    </span>
                                    <span className="font-mono font-black text-xs text-black border border-black px-1.5 py-0.5 rounded-xs">
                                      {srvDeliveryDate ? `${srvDayName ? srvDayName + " " : ""}${srvDeliveryDate}` : (matchedSrv?.duration ? matchedSrv.duration : "حسب جهة الإصدار")}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()}
                  </div>
                );
              })}
            </div>

            <div className="border-t-2 border-dashed border-black my-2"></div>

            {/* Total Summary */}
            <div className="space-y-1">
              <div className="flex justify-between items-center text-[13px] font-bold text-black pt-1">
                <span>المبلغ الإجمالي الكلي للفاتورة:</span>
                <span className="font-mono text-black text-lg font-black">{invoice.totalAmount.toFixed(2)} ج.م</span>
              </div>
            </div>

            <div className="border-t-2 border-dashed border-black my-2"></div>

            {/* Footer Text */}
            <div className="text-center text-[10.5px] text-black font-bold whitespace-pre-line leading-tight">
              {settings.footerText || "شكراً لكم على ثقتكم الغالية بـ مكتب مزايا للجوازات."}
            </div>

            {/* Print Date */}
            <div className="text-center text-[9px] text-black mt-2 font-mono font-bold">
              طباعة: {new Date().toLocaleString('ar-EG')}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 bg-slate-50 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100">
          <button 
            type="button"
            onClick={onClose} 
            className="px-4 py-2 border border-slate-200 text-slate-600 hover:bg-slate-100 rounded-lg text-sm font-medium font-cairo transition-colors cursor-pointer"
          >
            إغلاق
          </button>
          
          <div className="flex items-center gap-2">
            {onSendWhatsApp && (
              <button 
                type="button"
                onClick={onSendWhatsApp} 
                className="px-4 py-2 bg-emerald-600 text-white hover:bg-emerald-500 rounded-lg text-sm font-bold font-cairo flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                title="إرسال رسالة ترحيبية وتفاصيل الفاتورة عبر واتساب"
              >
                <Send className="w-4 h-4" />
                رسالة واتساب
              </button>
            )}
            <button 
              type="button"
              onClick={handlePrint} 
              className="px-5 py-2 bg-slate-900 text-white hover:bg-slate-800 rounded-lg text-sm font-bold font-cairo flex items-center gap-2 transition-colors cursor-pointer shadow-xs"
            >
              <Printer className="w-4 h-4" />
              اطبع الآن
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
