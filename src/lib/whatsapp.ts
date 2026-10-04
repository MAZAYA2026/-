import { Invoice, Service, AppSettings } from "../types";
import { getArabicDayName, recalculateCustomerServicesDeliveryDates } from "./businessDays";

export const WHATSAPP_DIVIDER = "────────────────────────────";
export const WHATSAPP_SUB_DIVIDER = "┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈";

/**
 * Builds the customers and services block matching the exact format of the thermal receipt.
 * Includes all customers in the family, per-unit government price, office fee, quantity, service total,
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
    const custNumbering = resolvedCustomers.length > 1 
      ? `العميل (${cIdx + 1} من ${resolvedCustomers.length}): ` 
      : "1. ";
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
      const qty = Math.max(1, s.quantity || 1);
      const serviceTotal = s.price || 0;
      const fineAmount = s.fineAmount || 0;
      const unitPrice = serviceTotal > 0 ? (serviceTotal / qty) : ((matched?.govPrice || 0) + fineAmount + (matched?.officeFee || 0));
      const govPrice = matched ? matched.govPrice : 0;
      const officeFee = Math.max(0, unitPrice - govPrice - fineAmount);
      const srvDeliveryDate = s.deliveryDate && s.deliveryDate.trim() ? s.deliveryDate.trim() : "";
      const srvDayName = srvDeliveryDate ? getArabicDayName(srvDeliveryDate) : "";

      const sBlock: string[] = [
        `▫️ *${srvName}* [العدد: ${qty}]`,
        `  • السعر الحكومي (مفرد): ${govPrice.toFixed(2)} ج.م`,
        `  • أجر الخدمة (مفرد): ${officeFee.toFixed(2)} ج.م`,
        `  • العدد: ${qty}`,
        `  • إجمالي الخدمة: *${serviceTotal.toFixed(2)} ج.م*`
      ];

      // Government fine row if applicable
      if (fineAmount > 0) {
        sBlock.push(`  ⚠️ *تشمل غرامة حكومية (${s.fineName || "غرامة"}):* +${fineAmount.toFixed(2)} ج.م (للوحدة)`);
      }

      // Single unit multiplication note when quantity > 1 or fine exists
      if (qty > 1 || fineAmount > 0) {
        sBlock.push(`  🔢 [سعر المفرد ${unitPrice.toFixed(2)} ج.م × ${qty} = ${serviceTotal.toFixed(2)} ج.م]`);
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
 * of the printed thermal receipt (ThermalReceipt), including all family members.
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

  // 3. Customers & Services (matches ThermalReceipt, handles 1 or multiple family customers)
  const customersAndServicesBlock = buildCustomersAndServicesWhatsAppBlock(inv, services, settings);
  if (customersAndServicesBlock) {
    if (inv.customers.length > 1) {
      sections.push(`👥 *بيانات أفراد الأسرة / العملاء بالفاتورة (عدد: ${inv.customers.length}):*\n\n${customersAndServicesBlock}`);
    } else {
      sections.push(customersAndServicesBlock);
    }
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

export const DEFAULT_READY_PASSPORT_MESSAGE = `🛂 *{اسم_المكتب}*
_{الترويسة_الفرعية}_

────────────────────────────

عزيزنا {اسم_العميل}،
نفيدكم علماً بأن جواز السفر الخاص بكم بالفاتورة رقم #{رقم_الفاتورة} جاهز للاستلام الآن بالمكتب 📑✨

📋 *الخدمات:* {الخدمات}
🗄️ *مكان الحفظ:* درج رقم ({رقم_الارشيف})

⚠️ *تنبيهات هامة جداً لاستلام جواز السفر:*
• إحضار أصل بطاقة الرقم القومي سارية للمطابقة.
• إحضار جواز السفر السابق (إن وجد) للتخريم والإلغاء.
• إحضار أصل الفاتورة الحرارية للمطابقة.
• استلام الجواز لصاحب الشأن شخصياً أو لمن له الصفة القانونية المباشرة (الأب للأبناء القصر / الزوج بموجب وثيقة الزواج).

────────────────────────────

📍 {اسم_المكتب}
📞 للاستفسار والمتابعة: {هاتف_التواصل}`;

export const DEFAULT_READY_GENERAL_MESSAGE = `📑 *{اسم_المكتب}*
_{الترويسة_الفرعية}_

────────────────────────────

عزيزنا {اسم_العميل}،
نفيدكم علماً بأن أوراقكم ومعاملاتكم الخاصة بالفاتورة رقم #{رقم_الفاتورة} جاهزة للتسليم الآن بالمكتب ✨

📋 *الخدمات:* {الخدمات}
🗄️ *مكان الحفظ:* درج رقم ({رقم_الارشيف})

برجاء التوجه للمكتب للاستلام مع إحضار أصل الفاتورة الحرارية والبطاقة الشخصية سارية.

────────────────────────────

📍 {اسم_المكتب}
📞 للاستفسار والمتابعة: {هاتف_التواصل}`;

/**
 * Checks if a service name represents a passport service (starts with #).
 */
export function isPassportServiceName(serviceName: string): boolean {
  if (!serviceName) return false;
  return serviceName.trim().startsWith("#");
}

/**
 * Checks if any service in the invoice is a passport service (starts with #).
 */
export function invoiceHasPassportService(inv: Invoice, services: Service[]): boolean {
  if (!inv || !inv.customers) return false;
  return inv.customers.some((c) =>
    c.services.some((s) => {
      const matched = services.find((srv) => srv.id === s.serviceId || srv.name === s.serviceId);
      const name = matched?.name || s.serviceId || "";
      return isPassportServiceName(name);
    })
  );
}

/**
 * Generates the appropriate WhatsApp Ready Notification (جاهز للتسليم):
 * Automatically detects whether the invoice includes passport services (starting with #)
 * and uses the dedicated passport ready template with its specific requirements,
 * or uses the general services template for all other government services.
 */
export function generateWhatsAppReadyMessage(
  inv: Invoice,
  services: Service[],
  settings: AppSettings
): { message: string; isPassport: boolean } {
  const isPassport = invoiceHasPassportService(inv, services);
  
  // Pick the configured template or fallback to dedicated default
  const template = isPassport 
    ? (settings.readyPassportMessage?.trim() || DEFAULT_READY_PASSPORT_MESSAGE)
    : (settings.readyMessage?.trim() || DEFAULT_READY_GENERAL_MESSAGE);

  const customerNames = inv.customers.length > 1
    ? inv.customers.map(c => c.arabicName).join(" و ")
    : (inv.customers[0]?.arabicName || "");

  const servicesText = inv.customers.map(c => {
    const sList = c.services.map(s => {
      const matched = services.find(srv => srv.name === s.serviceId || srv.id === s.serviceId);
      return matched?.name || s.serviceId;
    }).join(", ");
    return inv.customers.length > 1 ? `${c.arabicName}: (${sList})` : sList;
  }).join(" | ");

  const contact = (settings.contactPhone || "").trim();
  const header = (settings.headerText || "مكتب مزايا للجوازات").trim();
  const subHeader = (settings.subHeaderText !== undefined ? settings.subHeaderText : "جوازات طنطا والمعاملات الحكومية").trim();

  let msg = template
    .replace(/{اسم_المكتب}/g, header)
    .replace(/{الترويسة_الفرعية}/g, subHeader)
    .replace(/{اسم_العميل}/g, customerNames)
    .replace(/{رقم_الفاتورة}/g, inv.invoiceId.toString())
    .replace(/{رقم_الارشيف}/g, inv.archiveDrawer || "درج الحفظ المخصص")
    .replace(/{الخدمات}/g, servicesText)
    .replace(/{هاتف_التواصل}/g, contact)
    .replace(/{رقم_التواصل}/g, contact)
    .replace(/{فاصل}/g, WHATSAPP_DIVIDER);

  msg = msg.replace(/\n{3,}/g, "\n\n");
  return { message: msg, isPassport };
}

/**
 * Generates the first WhatsApp welcome message sent to the customer.
 * Directly formats the message to match the contents and layout of the printed thermal invoice,
 * ensuring all customers in the family and their individual services are completely included.
 * Allows full customization from the system settings page while preserving live data substitution.
 */
export function generateWhatsAppWelcomeMessage(
  inv: Invoice, 
  services: Service[], 
  settings: AppSettings
): string {
  if (!inv || !inv.customers || inv.customers.length === 0) return "";

  // The pristine receipt message contains all printed invoice elements for all customers
  const receiptMessage = buildReceiptFormattedWhatsAppMessage(inv, services, settings);

  const userTemplate = settings.welcomeMessage?.trim();

  // If user has not entered a template or specifically wants the pristine full receipt
  if (!userTemplate || userTemplate === "{محتوى_الفاتورة}") {
    return receiptMessage;
  }

  // The customer & services detailed block matching ThermalReceipt (all family members)
  const detailsBlock = buildCustomersAndServicesWhatsAppBlock(inv, services, settings);

  // When there are multiple customers in the family, represent all of them
  const arabicNames = inv.customers.map((c, i) => `${i + 1}. ${c.arabicName}`).join(" | ");
  const simpleArabicNames = inv.customers.length > 1
    ? inv.customers.map(c => c.arabicName).join(" و ")
    : (inv.customers[0]?.arabicName || "");

  const englishNames = inv.customers
    .filter(c => c.englishName && c.englishName.trim())
    .map((c, i) => `${i + 1}. ${c.englishName.toUpperCase()}`)
    .join(" | ");
  const nationalIds = inv.customers
    .filter(c => c.nationalId && c.nationalId.trim())
    .map((c, i) => `${i + 1}. ${c.nationalId}`)
    .join(" | ");
  const professions = inv.customers
    .filter(c => c.profession && c.profession.trim())
    .map((c, i) => `${i + 1}. ${c.profession}`)
    .join(" | ");

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

  const statusText = inv.status === "NEW" 
    ? "جديدة" 
    : inv.status === "READY" 
      ? `جاهزة للتسليم (درج: ${inv.archiveDrawer || 'N/A'})` 
      : "تم التسليم";

  const footerTextDisplay = settings.footerText && settings.footerText.trim()
    ? settings.footerText.trim()
    : "شكراً لكم على ثقتكم الغالية بـ مكتب مزايا للجوازات.";

  const contact = (settings.contactPhone || "").trim();

  let formatted = userTemplate
    .replace(/{محتوى_الفاتورة}/g, receiptMessage)
    .replace(/{تفاصيل_الفاتورة}/g, detailsBlock)
    .replace(/{اسم_المكتب}/g, settings.headerText || "مكتب مزايا للجوازات")
    .replace(/{الترويسة_الفرعية}/g, settings.subHeaderText !== undefined ? settings.subHeaderText : "جوازات طنطا والمعاملات الحكومية")
    .replace(/{الموظف}/g, inv.employeeName || "الموظف المسؤول")
    .replace(/{حالة_الفاتورة}/g, statusText)
    .replace(/{فاصل}/g, WHATSAPP_DIVIDER)
    .replace(/{اسم_العميل}/g, simpleArabicNames)
    .replace(/{الاسم}/g, simpleArabicNames)
    .replace(/{اسماء_العملاء}/g, arabicNames)
    .replace(/{الاسم_الانجليزي}/g, englishNames ? `🔤 *بالإنجليزي:* ${englishNames}` : "")
    .replace(/{الرقم_القومي}/g, nationalIds)
    .replace(/{رقم_القومي}/g, nationalIds)
    .replace(/{المهنة}/g, professions)
    .replace(/{الخدمات}/g, detailsBlock)
    .replace(/{الخدمة_المختارة}/g, detailsBlock)
    .replace(/{تعليمات_الاستلام}/g, serviceInstructionsBody)
    .replace(/{تعليمات_الخدمة}/g, serviceInstructionsBody)
    .replace(/{السعر}/g, inv.totalAmount.toFixed(2))
    .replace(/{المبلغ_الاجمالي}/g, `${inv.totalAmount.toFixed(2)} ج.م`)
    .replace(/{الاجمالي}/g, `${inv.totalAmount.toFixed(2)} ج.م`)
    .replace(/{التكلفة}/g, `• إجمالي الفاتورة: ${inv.totalAmount.toFixed(2)} ج.م`)
    .replace(/{تاريخ_اليوم}/g, invDate)
    .replace(/{تاريخ_الفاتورة}/g, invDate)
    .replace(/{موعد_التسليم}/g, deliveryDisplay)
    .replace(/{الميعاد_النهائي}/g, deliveryDisplay)
    .replace(/{الخاتمة}/g, footerTextDisplay)
    .replace(/{رقم_الفاتورة}/g, inv.invoiceId.toString())
    .replace(/{هاتف_التواصل}/g, contact)
    .replace(/{رقم_التواصل}/g, contact);

  // If the user's custom template omitted the full details block and receipt block,
  // append it so that customer and pricing breakdown is never completely omitted
  if (
    !userTemplate.includes("{تفاصيل_الفاتورة}") && 
    !userTemplate.includes("{محتوى_الفاتورة}") && 
    !userTemplate.includes("{الخدمات}") && 
    !formatted.includes(detailsBlock)
  ) {
    formatted = `${formatted}\n\n${WHATSAPP_DIVIDER}\n\n${detailsBlock}`;
  }

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
