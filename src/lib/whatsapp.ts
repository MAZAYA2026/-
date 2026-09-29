import { Invoice, Service, AppSettings } from "../types";
import { getArabicDayName, recalculateCustomerServicesDeliveryDates } from "./businessDays";

export const WHATSAPP_DIVIDER = "────────────────────────────";
export const WHATSAPP_SUB_DIVIDER = "┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈";

/**
 * Builds the customers and services block matching the exact format of the thermal receipt.
 * Includes customer info, per-unit government price, office fee, quantity, service total,
 * government fine if applicable, unit multiplier note, delivery instructions, and service delivery date.
 */
export function buildCustomersAndServicesWhatsAppBlock(
  inv: Invoice,
  services: Service[],
  settings: AppSettings
): string {
  if (!inv || !inv.customers || inv.customers.length === 0) return "";

  const customHolidays = settings.customHolidays || [];
  const includeSaturday = settings.includeSaturdayAsWeekend !== false;
  const invoiceBaseDate = inv.date || new Date().toISOString().split("T")[0];

  const resolvedCustomers = inv.customers.map((cust) => {
    const seqServices = recalculateCustomerServicesDeliveryDates(
      cust.services,
      invoiceBaseDate,
      services,
      customHolidays,
      includeSaturday
    );
    return {
      ...cust,
      services: seqServices
    };
  });

  const customerBlocks: string[] = [];

  resolvedCustomers.forEach((cust, cIdx) => {
    const custLines: string[] = [];
    const custNumbering = resolvedCustomers.length > 1 ? `${cIdx + 1}. ` : "";
    custLines.push(`👤 *${custNumbering}${cust.arabicName}*`);

    if (cust.englishName && cust.englishName.trim() && cust.englishName !== "N/A" && cust.englishName !== "نفس ترجمة الجواز السابق") {
      custLines.push(`🔤 EN: ${cust.englishName.trim().toUpperCase()}`);
    }
    if (cust.nationalId) {
      const bDate = cust.birthDate ? ` | مواليد: ${cust.birthDate}` : "";
      custLines.push(`🆔 الرقم القومي: ${cust.nationalId}${bDate}`);
    }
    if (cust.profession && cust.profession.trim() && cust.profession !== "N/A") {
      custLines.push(`💼 المهنة: ${cust.profession.trim()}`);
    }
    if (cust.phone) {
      custLines.push(`📱 الهاتف: ${cust.phone.trim()}`);
    }

    custLines.push(``); // Spacing before services

    // Services breakdown for this customer matching ThermalReceipt
    const serviceLines: string[] = [];
    cust.services.forEach((s, sIdx) => {
      const matched = services.find((srv) => srv.name === s.serviceId || srv.id === s.serviceId);
      const srvName = matched?.name || s.serviceId;
      const govPrice = matched ? matched.govPrice : 0;
      const officeFee = matched ? matched.officeFee : 0;
      const fineAmount = s.fineAmount || 0;
      const unitPrice = govPrice + fineAmount + officeFee;
      const serviceTotal = s.price || (unitPrice * s.quantity);
      const srvDeliveryDate = s.deliveryDate && s.deliveryDate.trim() ? s.deliveryDate.trim() : "";
      const srvDayName = srvDeliveryDate ? getArabicDayName(srvDeliveryDate) : "";

      const sBlock: string[] = [
        `▫️ *${srvName}* [العدد: ${s.quantity}]`,
        `  • السعر الحكومي (مفرد): ${govPrice.toFixed(2)} ج.م`,
        `  • أجر الخدمة (مفرد): ${officeFee.toFixed(2)} ج.م`,
        `  • العدد: ${s.quantity}`,
        `  • إجمالي الخدمة: *${serviceTotal.toFixed(2)} ج.م*`
      ];

      // Government fine row if applicable
      if (fineAmount > 0) {
        sBlock.push(`  ⚠️ *تشمل غرامة حكومية (${s.fineName || "غرامة"}):* +${fineAmount.toFixed(2)} ج.م (للوحدة)`);
      }

      // Single unit multiplication note when quantity > 1 or fine exists
      if (s.quantity > 1 || fineAmount > 0) {
        sBlock.push(`  🔢 [سعر المفرد ${unitPrice.toFixed(2)} ج.م × ${s.quantity} = ${serviceTotal.toFixed(2)} ج.م]`);
      }

      // Delivery instructions shown individually for this service
      const instructions = matched?.instructions?.trim() || s.notes?.trim();
      if (instructions) {
        sBlock.push(`  📋 *تعليمات تسليم الخدمة:*\n  ${instructions}`);
      }

      // Expected delivery date for this service
      const delivText = srvDeliveryDate 
        ? `${srvDayName ? srvDayName + " " : ""}${srvDeliveryDate}` 
        : (matched?.duration || "حسب جهة الإصدار");
      const delivLabel = (cust.services.length > 1 && sIdx > 0) 
        ? "موعد الاستلام (يبدأ بعد السابقة):" 
        : "موعد تسليم الخدمة:";
      sBlock.push(`  📅 *${delivLabel}* ${delivText}`);

      serviceLines.push(sBlock.join("\n"));
    });

    custLines.push(serviceLines.join(`\n\n${WHATSAPP_SUB_DIVIDER}\n\n`));
    customerBlocks.push(custLines.join("\n"));
  });

  return customerBlocks.join(`\n\n${WHATSAPP_DIVIDER}\n\n`);
}

/**
 * Builds a WhatsApp message containing the exact structure and content
 * of the printed thermal receipt (ThermalReceipt).
 */
export function buildReceiptFormattedWhatsAppMessage(
  inv: Invoice,
  services: Service[],
  settings: AppSettings
): string {
  if (!inv || !inv.customers || inv.customers.length === 0) return "";

  const customHolidays = settings.customHolidays || [];
  const includeSaturday = settings.includeSaturdayAsWeekend !== false;
  const invoiceBaseDate = inv.date || new Date().toISOString().split("T")[0];

  // Calculate sequential delivery dates across all customers and services
  const allDeliveryDates: string[] = [];
  let hasMultipleServicesForAnyCust = false;

  inv.customers.forEach((cust) => {
    if (cust.services.length > 1) {
      hasMultipleServicesForAnyCust = true;
    }
    const seqServices = recalculateCustomerServicesDeliveryDates(
      cust.services,
      invoiceBaseDate,
      services,
      customHolidays,
      includeSaturday
    );
    seqServices.forEach((s) => {
      const d = s.deliveryDate && s.deliveryDate.trim() ? s.deliveryDate.trim() : "";
      if (d && !allDeliveryDates.includes(d)) {
        allDeliveryDates.push(d);
      }
    });
  });

  const maxDeliveryDate = allDeliveryDates.length > 0 ? [...allDeliveryDates].sort().reverse()[0] : "";
  const maxDeliveryDayName = maxDeliveryDate ? getArabicDayName(maxDeliveryDate) : "";

  const headerTitle = (settings.headerText || "مكتب مزايا للجوازات").trim();
  const headerSub = (settings.subHeaderText !== undefined ? settings.subHeaderText : "جوازات طنطا والمعاملات الحكومية").trim();

  let invDate = inv.date || new Date().toISOString().split("T")[0];
  if (invDate.includes("GMT") || invDate.length > 10) {
    try {
      const d = new Date(invDate);
      if (!isNaN(d.getTime())) {
        invDate = d.toISOString().split("T")[0];
      }
    } catch {}
  }

  const statusText = inv.status === "NEW" 
    ? "جديدة" 
    : inv.status === "READY" 
      ? `جاهزة للتسليم (درج: ${inv.archiveDrawer || 'N/A'})` 
      : "تم التسليم";

  const sections: string[] = [];

  // 1. Header Text (matches ThermalReceipt)
  const headerLines: string[] = [`🧾 *${headerTitle}*`];
  if (headerSub) {
    headerLines.push(`_${headerSub}_`);
  }
  sections.push(headerLines.join("\n"));

  // 2. Invoice Meta (matches ThermalReceipt)
  const metaLines: string[] = [
    `📄 *رقم الفاتورة:* #${inv.invoiceId}`,
    `📅 *تاريخ الفاتورة:* ${invDate}`,
    `👤 *الموظف المسؤول:* ${inv.employeeName || "شريف"}`,
    `📌 *حالة الفاتورة:* ${statusText}`
  ];

  if (maxDeliveryDate) {
    metaLines.push(`🕒 *موعد استلام المعاملة النهائي الفعلي (أيام عمل رسمية):*\n📅 *${maxDeliveryDayName ? maxDeliveryDayName + " " : ""}${maxDeliveryDate}*`);
    if (hasMultipleServicesForAnyCust) {
      metaLines.push(`*(يبدأ احتساب مدة الخدمة التالية بعد انتهاء الخدمة السابقة بالتتابع)*`);
    }
  }
  sections.push(metaLines.join("\n"));

  // 3. Customers & Services (matches ThermalReceipt)
  const customersAndServicesBlock = buildCustomersAndServicesWhatsAppBlock(inv, services, settings);
  if (customersAndServicesBlock) {
    sections.push(customersAndServicesBlock);
  }

  // 4. Total Amount (matches ThermalReceipt)
  sections.push(`💰 *المبلغ الإجمالي الكلي للفاتورة:*\n*${inv.totalAmount.toFixed(2)} ج.م*`);

  // 5. Footer Text (matches ThermalReceipt)
  const footerLines: string[] = [];
  if (settings.footerText && settings.footerText.trim()) {
    footerLines.push(settings.footerText.trim());
  } else {
    footerLines.push("شكراً لكم على ثقتكم الغالية بـ مكتب مزايا للجوازات.");
  }
  if (settings.contactPhone && settings.contactPhone.trim()) {
    footerLines.push(`📞 للاستفسار والمتابعة: ${settings.contactPhone.trim()}`);
  }
  sections.push(footerLines.join("\n"));

  return sections.join(`\n\n${WHATSAPP_DIVIDER}\n\n`);
}

/**
 * Generates the first WhatsApp welcome message sent to the customer.
 * Directly formats the message to match the contents and layout of the printed thermal invoice.
 */
export function generateWhatsAppWelcomeMessage(
  inv: Invoice, 
  services: Service[], 
  settings: AppSettings
): string {
  if (!inv || !inv.customers || inv.customers.length === 0) return "";

  const userTemplate = settings.welcomeMessage?.trim();

  // If user has not modified the template or uses the default/standard format,
  // return the exact full thermal receipt format.
  const isDefaultOrEmpty = !userTemplate || 
    userTemplate === "{محتوى_الفاتورة}" ||
    userTemplate.includes("عزيزنا {اسم_العميل}، تم استلام طلباتك بمكتب مزايا") ||
    userTemplate.includes("━━━━━");

  // Always compute the pristine receipt formatted layout
  const receiptMessage = buildReceiptFormattedWhatsAppMessage(inv, services, settings);

  if (isDefaultOrEmpty) {
    return receiptMessage;
  }

  // Compute customers and services block for modular replacement
  const detailsBlock = buildCustomersAndServicesWhatsAppBlock(inv, services, settings);

  let arabicNameOnly = inv.customers[0]?.arabicName || "";
  let englishNameOnly = inv.customers[0]?.englishName || "";
  let professionOnly = inv.customers[0]?.profession || "";

  let invDate = inv.date || new Date().toISOString().split("T")[0];
  if (invDate.includes("GMT") || invDate.length > 10) {
    try {
      const d = new Date(invDate);
      if (!isNaN(d.getTime())) {
        invDate = d.toISOString().split("T")[0];
      }
    } catch {}
  }

  const customHolidays = settings.customHolidays || [];
  const includeSaturday = settings.includeSaturdayAsWeekend !== false;
  const allDeliveryDates: string[] = [];
  inv.customers.forEach((c) => {
    const seq = recalculateCustomerServicesDeliveryDates(
      c.services,
      invDate,
      services,
      customHolidays,
      includeSaturday
    );
    seq.forEach((s) => {
      if (s.deliveryDate && !allDeliveryDates.includes(s.deliveryDate)) {
        allDeliveryDates.push(s.deliveryDate);
      }
    });
  });
  const maxDeliveryDate = allDeliveryDates.length > 0 ? [...allDeliveryDates].sort().reverse()[0] : "";
  const maxDeliveryDayName = maxDeliveryDate ? getArabicDayName(maxDeliveryDate) : "";
  const deliveryDisplay = maxDeliveryDate 
    ? `${maxDeliveryDayName ? maxDeliveryDayName + " " : ""}${maxDeliveryDate} (أيام عمل رسمية)` 
    : "حسب المواعيد الرسمية";

  // Individual instructions for services
  const instructionsList: string[] = [];
  inv.customers.forEach(c => {
    c.services.forEach(s => {
      const matched = services.find(srv => srv.name === s.serviceId || srv.id === s.serviceId);
      const inst = matched?.instructions?.trim() || s.notes?.trim();
      if (inst && !instructionsList.includes(inst)) {
        instructionsList.push(inst);
      }
    });
  });
  const serviceInstructionsBody = instructionsList.length > 0 
    ? instructionsList.join("\n") 
    : "يرجى إحضار أصل بطاقة الرقم القومي سارية للمطابقة عند الاستلام.";

  // Extract customer services block
  const custServicesList: string[] = [];
  inv.customers.forEach(c => {
    c.services.forEach(s => {
      const matched = services.find(srv => srv.name === s.serviceId || srv.id === s.serviceId);
      const srvName = matched?.name || s.serviceId;
      const fineStr = (s.fineAmount && s.fineAmount > 0) ? ` (تشمل ${s.fineName || 'غرامة'}: ${s.fineAmount * s.quantity} ج.م)` : "";
      custServicesList.push(`• ${srvName} (العدد: ${s.quantity}) - ${s.price} ج.م${fineStr}`);
    });
  });

  const statusText = inv.status === "NEW" 
    ? "جديدة" 
    : inv.status === "READY" 
      ? `جاهزة للتسليم (درج: ${inv.archiveDrawer || 'N/A'})` 
      : "تم التسليم";

  const footerTextDisplay = settings.footerText && settings.footerText.trim()
    ? settings.footerText.trim()
    : "شكراً لكم على ثقتكم الغالية بـ مكتب مزايا للجوازات.";

  let formatted = userTemplate
    .replace(/{محتوى_الفاتورة}/g, receiptMessage)
    .replace(/{تفاصيل_الفاتورة}/g, detailsBlock)
    .replace(/{اسم_المكتب}/g, settings.headerText || "مكتب مزايا للجوازات")
    .replace(/{الترويسة_الفرعية}/g, settings.subHeaderText !== undefined ? settings.subHeaderText : "جوازات طنطا والمعاملات الحكومية")
    .replace(/{الموظف}/g, inv.employeeName || "شريف")
    .replace(/{حالة_الفاتورة}/g, statusText)
    .replace(/{فاصل}/g, WHATSAPP_DIVIDER)
    .replace(/{اسم_العميل}/g, arabicNameOnly)
    .replace(/{الاسم}/g, arabicNameOnly)
    .replace(/{الاسم_الانجليزي}/g, englishNameOnly ? `🔤 *بالإنجليزي:* ${englishNameOnly}` : "")
    .replace(/{المهنة}/g, professionOnly)
    .replace(/{الخدمات}/g, custServicesList.join("\n"))
    .replace(/{الخدمة_المختارة}/g, custServicesList.join("\n"))
    .replace(/{تعليمات_الاستلام}/g, serviceInstructionsBody)
    .replace(/{تعليمات_الخدمة}/g, serviceInstructionsBody)
    .replace(/{السعر}/g, inv.totalAmount.toFixed(2))
    .replace(/{التكلفة}/g, `• إجمالي الفاتورة: ${inv.totalAmount.toFixed(2)} ج.م`)
    .replace(/{تاريخ_اليوم}/g, invDate)
    .replace(/{تاريخ_الفاتورة}/g, invDate)
    .replace(/{موعد_التسليم}/g, deliveryDisplay)
    .replace(/{الميعاد_النهائي}/g, deliveryDisplay)
    .replace(/{الخاتمة}/g, footerTextDisplay)
    .replace(/{رقم_الفاتورة}/g, inv.invoiceId.toString());

  formatted = formatted.replace(/\n{3,}/g, "\n\n");
  return formatted;
}

/**
 * Normalizes phone number to standard international WhatsApp link format.
 */
export function getWhatsAppUrl(phone: string, text: string): string {
  let cleanPhone = phone.replace(/\D/g, "");
  if (cleanPhone.startsWith("0")) {
    cleanPhone = "2" + cleanPhone;
  } else if (!cleanPhone.startsWith("20") && cleanPhone.length === 10) {
    cleanPhone = "20" + cleanPhone;
  }
  return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}`;
}
