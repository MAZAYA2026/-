import { Invoice, Service, AppSettings } from "../types";
import { calculateWorkingDaysDeliveryDate, getArabicDayName, recalculateCustomerServicesDeliveryDates } from "./businessDays";

export const WHATSAPP_DIVIDER = "───────";

/**
 * Builds a beautifully formatted WhatsApp welcome / order receipt message.
 * Places clear, compact aesthetic dividers (WHATSAPP_DIVIDER) between sections:
 * 1. Intro & Invoice Header
 * 2. Name & English Name
 * 3. Profession
 * 4. Selected Service(s)
 * 5. Service Instructions (without repeating closing text)
 * 6. Financial Cost
 * 7. Delivery Deadline (Official Business Days)
 * 8. Office Location & Contact
 *
 * Ensures ZERO duplication of section headings, customer names, instructions, or closing phrases.
 */
export function generateWhatsAppWelcomeMessage(
  inv: Invoice, 
  services: Service[], 
  settings: AppSettings
): string {
  if (!inv || !inv.customers || inv.customers.length === 0) return "";

  const customHolidays = settings.customHolidays || [];
  const includeSaturday = settings.includeSaturdayAsWeekend !== false;
  const invoiceBaseDate = inv.date || new Date().toISOString().split("T")[0];

  // 1. Calculate sequential delivery dates across all customers and services
  // If customer has multiple services, service 2 starts after service 1 finishes (تراكمي)
  const allDeliveryDates: string[] = [];
  let hasMultipleServicesForAnyCust = false;

  const resolvedCustomers = inv.customers.map((cust) => {
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
    return {
      ...cust,
      services: seqServices
    };
  });

  const maxDeliveryDate = allDeliveryDates.length > 0 ? [...allDeliveryDates].sort().reverse()[0] : "";
  const maxDeliveryDayName = maxDeliveryDate ? getArabicDayName(maxDeliveryDate) : "";
  const deliveryDisplay = maxDeliveryDate 
    ? `${maxDeliveryDayName ? maxDeliveryDayName + " " : ""}${maxDeliveryDate} (أيام عمل رسمية)` 
    : "حسب المواعيد الرسمية المقررة بكل خدمة";

  const isSingleCustomer = resolvedCustomers.length === 1;

  // ── Section 1: الترويسة ورقم الفاتورة ──────────────────────
  const headerTitle = (settings.headerText || "مكتب مزايا للخدمات الحكومية والجوازات").trim();
  const headerSub = (settings.subHeaderText || "جوازات طنطا والمعاملات الحكومية").trim();
  let invDate = inv.date || new Date().toISOString().split("T")[0];
  if (invDate.includes("GMT") || invDate.length > 10) {
    try {
      const d = new Date(invDate);
      if (!isNaN(d.getTime())) {
        invDate = d.toISOString().split("T")[0];
      }
    } catch {}
  }

  const headerLines: string[] = [
    `*${headerTitle}*`,
  ];
  if (headerSub) {
    headerLines.push(`_${headerSub}_`);
  }
  headerLines.push(`📄 *فاتورة استلام طلب رقم:* #${inv.invoiceId}`);
  headerLines.push(`📅 *تاريخ المعاملة:* ${invDate}`);

  // ── Section 2: بيانات العميل / الأفراد ──────────────────────
  // For single customer, we provide separate clean fields.
  // For multi-customer, each individual is listed ONCE with all their info to prevent repeating their name 3 times!
  let arabicNameOnly = "";
  let englishNameOnly = "";
  let professionOnly = "";
  let servicesOnly = "";

  const nameSectionLines: string[] = [];
  const profSectionLines: string[] = [];
  const srvSectionLines: string[] = [];
  const multiCustomerLines: string[] = [];

  if (isSingleCustomer) {
    const cust = resolvedCustomers[0];
    arabicNameOnly = cust.arabicName?.trim() || "عميلنا العزيز";
    const hasEnglish = cust.englishName && cust.englishName.trim() && cust.englishName !== "N/A" && cust.englishName !== "نفس ترجمة الجواز السابق";
    englishNameOnly = hasEnglish ? cust.englishName.trim().toUpperCase() : "";

    nameSectionLines.push(`👤 *الاسم:* ${arabicNameOnly}`);
    if (englishNameOnly) {
      nameSectionLines.push(`🔤 *بالإنجليزي:* ${englishNameOnly}`);
    }

    const p = cust.profession?.trim();
    professionOnly = p && p !== "N/A" ? p : "حسب بطاقة الرقم القومي والمستندات الرسمية";
    profSectionLines.push(`💼 *المهنة:* ${professionOnly}`);

    const srvItems: string[] = [];
    cust.services.forEach((s, sIdx) => {
      const matched = services.find((srv) => srv.name === s.serviceId || srv.id === s.serviceId);
      const srvName = matched?.name || s.serviceId;
      const qtyStr = s.quantity > 1 ? ` (العدد: ${s.quantity})` : "";
      const priceStr = s.price > 0 ? ` - ${s.price} ج.م` : "";
      const fineStr = (s.fineAmount && s.fineAmount > 0)
        ? ` (تشمل ${s.fineName || "غرامة حكومية"}: ${s.fineAmount * s.quantity} ج.م)`
        : "";
      const srvDeliveryStr = s.deliveryDate 
        ? ` [تسليم: ${getArabicDayName(s.deliveryDate) ? getArabicDayName(s.deliveryDate) + " " : ""}${s.deliveryDate}${sIdx > 0 ? " - يبدأ احتسابها بعد انتهاء الخدمة السابقة" : ""}]` 
        : "";
      srvItems.push(`• ${srvName}${qtyStr}${priceStr}${fineStr}${srvDeliveryStr}`);
    });
    servicesOnly = srvItems.join("\n");
    srvSectionLines.push(cust.services.length > 1 ? `📋 *الخدمات المطلوبة:*` : `📋 *الخدمة المطلوبة:*`);
    srvSectionLines.push(servicesOnly);
  } else {
    // Multi-customer: Group each person's details together cleanly!
    multiCustomerLines.push(`👥 *بيانات الأفراد والخدمات (${resolvedCustomers.length} أفراد):*`);
    const arNames: string[] = [];
    const enNames: string[] = [];
    const profs: string[] = [];
    const allSrvs: string[] = [];

    resolvedCustomers.forEach((cust, idx) => {
      const arName = cust.arabicName?.trim() || `فرد ${idx + 1}`;
      arNames.push(`${idx + 1}️⃣ ${arName}`);

      const hasEnglish = cust.englishName && cust.englishName.trim() && cust.englishName !== "N/A" && cust.englishName !== "نفس ترجمة الجواز السابق";
      const enName = hasEnglish ? cust.englishName.trim().toUpperCase() : "";
      if (enName) enNames.push(`${idx + 1}️⃣ ${enName}`);

      const p = cust.profession?.trim();
      const pText = p && p !== "N/A" ? p : "حسب الرقم القومي";
      profs.push(`• ${arName}: ${pText}`);

      multiCustomerLines.push(`${idx + 1}️⃣ *${arName}*`);
      if (enName) {
        multiCustomerLines.push(`   🔤 ${enName}`);
      }
      multiCustomerLines.push(`   💼 المهنة: ${pText}`);

      const custSrvNames: string[] = [];
      cust.services.forEach((s, sIdx) => {
        const matched = services.find((srv) => srv.name === s.serviceId || srv.id === s.serviceId);
        const srvName = matched?.name || s.serviceId;
        const qtyStr = s.quantity > 1 ? ` (${s.quantity})` : "";
        const priceStr = s.price > 0 ? ` [${s.price} ج.م]` : "";
        const fineStr = (s.fineAmount && s.fineAmount > 0)
          ? ` (تشمل ${s.fineName || "غرامة"}: ${s.fineAmount * s.quantity} ج.م)`
          : "";
        const delivStr = s.deliveryDate ? ` [تسليم: ${s.deliveryDate}${sIdx > 0 ? " - يبدأ بعد السابقة" : ""}]` : "";
        const fullSrv = `${srvName}${qtyStr}${priceStr}${fineStr}${delivStr}`;
        custSrvNames.push(fullSrv);
        allSrvs.push(`• (${arName}): ${fullSrv}`);
      });
      multiCustomerLines.push(`   📋 الخدمة: ${custSrvNames.join(" + ")}`);
    });

    arabicNameOnly = arNames.join("\n");
    englishNameOnly = enNames.join("\n");
    professionOnly = profs.join("\n");
    servicesOnly = allSrvs.join("\n");
  }

  // ── Section 3: تعليمات الاستلام المأخوذة مباشرة من الخدمات المختارة ────────────────────────────
  // Takes instructions directly from the chosen service(s) as requested by user
  const serviceInstructionsList: { name: string; instructions: string }[] = [];
  inv.customers.forEach((cust) => {
    cust.services.forEach((s) => {
      const matched = services.find((srv) => srv.name === s.serviceId || srv.id === s.serviceId);
      const srvName = matched?.name || s.serviceId;
      const inst = matched?.instructions?.trim() || s.notes?.trim();
      if (inst) {
        if (!serviceInstructionsList.some(item => item.instructions === inst)) {
          serviceInstructionsList.push({ name: srvName, instructions: inst });
        }
      }
    });
  });

  let serviceInstructionsBody = "";
  if (serviceInstructionsList.length === 1) {
    serviceInstructionsBody = serviceInstructionsList[0].instructions;
  } else if (serviceInstructionsList.length > 1) {
    serviceInstructionsBody = serviceInstructionsList
      .map(item => `• *${item.name}:*\n${item.instructions}`)
      .join("\n\n");
  } else {
    serviceInstructionsBody = "يرجى إحضار أصل بطاقة الرقم القومي سارية أو المستندات الرسمية الأصلية للمطابقة عند الاستلام الشخصي.";
  }

  const instLines: string[] = [
    `📌 *تعليمات الاستلام:*`,
    serviceInstructionsBody
  ];

  // ── Section 4: التكلفة المالية مع تفصيل الغرامات الحكومية إن وجدت ──────────────────────────────
  let totalFines = 0;
  inv.customers.forEach((cust) => {
    cust.services.forEach((s) => {
      if (s.fineAmount && s.fineAmount > 0) {
        totalFines += s.fineAmount * s.quantity;
      }
    });
  });

  const costLines: string[] = [];
  costLines.push(`💰 *التكلفة المالية:*`);
  costLines.push(`• إجمالي الفاتورة: ${inv.totalAmount} ج.م`);

  // ── Section 5: الميعاد النهائي للتسليم ───────────────────────
  const deliveryLines: string[] = [
    `🕒 *الميعاد النهائي للتسليم:*`,
    `📅 ${deliveryDisplay}`
  ];
  if (hasMultipleServicesForAnyCust) {
    deliveryLines.push(`_(يبدأ احتساب مدة كل خدمة بعد الانتهاء من الخدمة السابقة بالتتابع لحساب الوقت الفعلي للاستلام)_`);
  }

  // ── Section 6: الخاتمة والتواصل (بدون تكرار شروط الاستلام) ─────
  const closingLines: string[] = [
    `✨ *نسعد دائماً بخدمتكم وتسهيل معاملاتكم*`,
    `📍 العنوان: طنطا - شارع الجلاء - بجوار الجوازات`
  ];
  if (settings.contactPhone && settings.contactPhone.trim()) {
    closingLines.push(`📞 للاستفسار والمتابعة: ${settings.contactPhone.trim()}`);
  }

  // Build the clean sections array with no duplication
  let sections: string[] = [];
  if (isSingleCustomer) {
    sections = [
      headerLines.join("\n"),
      nameSectionLines.join("\n"),
      profSectionLines.join("\n"),
      srvSectionLines.join("\n"),
      instLines.join("\n"),
      costLines.join("\n"),
      deliveryLines.join("\n"),
      closingLines.join("\n"),
    ];
  } else {
    sections = [
      headerLines.join("\n"),
      multiCustomerLines.join("\n"),
      instLines.join("\n"),
      costLines.join("\n"),
      deliveryLines.join("\n"),
      closingLines.join("\n"),
    ];
  }

  // If multiple customers, always format cleanly grouped by individual to completely prevent repeating names across 3 sections!
  if (!isSingleCustomer) {
    return sections.join(`\n\n${WHATSAPP_DIVIDER}\n\n`);
  }

  // Check if user has a custom template in settings
  const userTemplate = settings.welcomeMessage?.trim();
  const isOldSquashedTemplate = !userTemplate || 
    userTemplate.includes("عزيزنا {اسم_العميل}، تم استلام طلباتك بمكتب مزايا") ||
    userTemplate.includes("━━━━━");

  if (isOldSquashedTemplate) {
    return sections.join(`\n\n${WHATSAPP_DIVIDER}\n\n`);
  }

  const deliveryDisplayFull = (maxDeliveryDate && hasMultipleServicesForAnyCust)
    ? `${deliveryDisplay}\n_(يبدأ احتساب مدة كل خدمة بعد الانتهاء من الخدمة السابقة بالتتابع لحساب الوقت الفعلي للاستلام)_`
    : deliveryDisplay;

  // If user provided a customized template, replace placeholders accurately WITHOUT adding extra headings:
  let formatted = userTemplate
    .replace(/{فاصل}/g, WHATSAPP_DIVIDER)
    .replace(/{اسم_العميل}/g, arabicNameOnly)
    .replace(/{الاسم}/g, arabicNameOnly)
    .replace(/{الاسم_الانجليزي}/g, englishNameOnly ? `🔤 *بالإنجليزي:* ${englishNameOnly}` : "")
    .replace(/{المهنة}/g, professionOnly)
    .replace(/{الخدمات}/g, servicesOnly)
    .replace(/{الخدمة_المختارة}/g, servicesOnly)
    .replace(/{تعليمات_الاستلام}/g, serviceInstructionsBody)
    .replace(/{تعليمات_الخدمة}/g, serviceInstructionsBody)
    .replace(/{السعر}/g, inv.totalAmount.toString())
    .replace(/{التكلفة}/g, costLines.slice(1).join("\n"))
    .replace(/{تاريخ_اليوم}/g, invDate)
    .replace(/{موعد_التسليم}/g, deliveryDisplayFull)
    .replace(/{الميعاد_النهائي}/g, deliveryDisplayFull)
    .replace(/{الخاتمة}/g, closingLines.slice(1).join("\n"))
    .replace(/{رقم_الفاتورة}/g, inv.invoiceId.toString());

  // Clean redundant whitespace/empty lines
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
