import { Invoice, Service, AppSettings } from "../types";
import { calculateWorkingDaysDeliveryDate, getArabicDayName } from "./businessDays";

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

  // 1. Calculate the final delivery date across all services
  const allDeliveryDates: string[] = [];
  inv.customers.forEach((cust) => {
    cust.services.forEach((s) => {
      let srvDeliveryDate = s.deliveryDate && s.deliveryDate.trim() ? s.deliveryDate.trim() : "";
      if (!srvDeliveryDate && inv.date) {
        const matched = services.find((srv) => srv.name === s.serviceId || srv.id === s.serviceId);
        if (matched && typeof matched.deliveryDaysOffset === "number") {
          const calc = calculateWorkingDaysDeliveryDate(
            inv.date,
            matched.deliveryDaysOffset || 0,
            settings.customHolidays || [],
            matched.name,
            settings.includeSaturdayAsWeekend !== false
          );
          srvDeliveryDate = calc.deliveryDate;
        }
      }
      if (srvDeliveryDate && !allDeliveryDates.includes(srvDeliveryDate)) {
        allDeliveryDates.push(srvDeliveryDate);
      }
    });
  });

  const maxDeliveryDate = allDeliveryDates.length > 0 ? [...allDeliveryDates].sort().reverse()[0] : "";
  const maxDeliveryDayName = maxDeliveryDate ? getArabicDayName(maxDeliveryDate) : "";
  const deliveryDisplay = maxDeliveryDate 
    ? `${maxDeliveryDayName ? maxDeliveryDayName + " " : ""}${maxDeliveryDate} (أيام عمل رسمية)` 
    : "حسب المواعيد الرسمية المقررة بكل خدمة";

  const isSingleCustomer = inv.customers.length === 1;

  // ── Section 1: الترويسة ورقم الفاتورة ──────────────────────
  const headerTitle = (settings.headerText || "مكتب مزايا للخدمات الحكومية والجوازات").trim();
  const headerSub = (settings.subHeaderText || "جوازات طنطا والمعاملات الحكومية").trim();
  const invDate = inv.date || new Date().toISOString().split("T")[0];

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
    const cust = inv.customers[0];
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
    cust.services.forEach((s) => {
      const matched = services.find((srv) => srv.name === s.serviceId || srv.id === s.serviceId);
      const srvName = matched?.name || s.serviceId;
      const qtyStr = s.quantity > 1 ? ` (العدد: ${s.quantity})` : "";
      const priceStr = s.price > 0 ? ` - ${s.price} ج.م` : "";
      srvItems.push(`• ${srvName}${qtyStr}${priceStr}`);
    });
    servicesOnly = srvItems.join("\n");
    srvSectionLines.push(cust.services.length > 1 ? `📋 *الخدمات المطلوبة:*` : `📋 *الخدمة المطلوبة:*`);
    srvSectionLines.push(servicesOnly);
  } else {
    // Multi-customer: Group each person's details together cleanly!
    multiCustomerLines.push(`👥 *بيانات الأفراد والخدمات (${inv.customers.length} أفراد):*`);
    const arNames: string[] = [];
    const enNames: string[] = [];
    const profs: string[] = [];
    const allSrvs: string[] = [];

    inv.customers.forEach((cust, idx) => {
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
      cust.services.forEach((s) => {
        const matched = services.find((srv) => srv.name === s.serviceId || srv.id === s.serviceId);
        const srvName = matched?.name || s.serviceId;
        const qtyStr = s.quantity > 1 ? ` (${s.quantity})` : "";
        const priceStr = s.price > 0 ? ` [${s.price} ج.م]` : "";
        const fullSrv = `${srvName}${qtyStr}${priceStr}`;
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

  // ── Section 3: تعليمات هذه الخدمة ────────────────────────────
  // Keep it concise and avoid repeating anything present in the closing
  const instLines: string[] = [];
  instLines.push(`📌 *تعليمات الاستلام:*`);
  const collectedInstructions: string[] = [];

  inv.customers.forEach((cust) => {
    cust.services.forEach((s) => {
      const matched = services.find((srv) => srv.name === s.serviceId || srv.id === s.serviceId);
      if (matched?.instructions && matched.instructions.trim()) {
        const trimmed = matched.instructions.trim();
        if (!collectedInstructions.includes(trimmed)) {
          collectedInstructions.push(trimmed);
        }
      }
      if (s.notes && s.notes.trim() && !collectedInstructions.includes(s.notes.trim())) {
        collectedInstructions.push(s.notes.trim());
      }
    });
  });

  if (collectedInstructions.length > 0) {
    collectedInstructions.forEach((inst) => {
      instLines.push(`• ${inst}`);
    });
    instLines.push(`• يرجى إحضار أصل بطاقة الرقم القومي سارية أو المستندات الأصلية للمطابقة.`);
  } else {
    // Official concise instructions
    instLines.push(`• يرجى إحضار أصل بطاقة الرقم القومي سارية أو المستندات الأصلية للمطابقة عند الاستلام.`);
    instLines.push(`• تسليم المعاملات يتم لصاحب الشأن شخصياً أو بموجب توكيل رسمي ساري.`);
  }

  // ── Section 4: التكلفة المالية ──────────────────────────────
  const costLines: string[] = [];
  costLines.push(`💰 *التكلفة المالية:*`);
  costLines.push(`• إجمالي الفاتورة: ${inv.totalAmount} ج.م`);
  if (typeof inv.totalGov === "number" && inv.totalGov > 0 && typeof inv.totalOffice === "number" && inv.totalOffice > 0) {
    costLines.push(`• تفصيل المبلغ: رسوم حكومية (${inv.totalGov} ج.م) + أتعاب المكتب (${inv.totalOffice} ج.م)`);
  }

  // ── Section 5: الميعاد النهائي للتسليم ───────────────────────
  const deliveryLines: string[] = [
    `🕒 *الميعاد النهائي للتسليم:*`,
    `📅 ${deliveryDisplay}`
  ];

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

  // If user provided a customized template, replace placeholders accurately WITHOUT adding extra headings:
  let formatted = userTemplate
    .replace(/{فاصل}/g, WHATSAPP_DIVIDER)
    .replace(/{اسم_العميل}/g, arabicNameOnly)
    .replace(/{الاسم}/g, arabicNameOnly)
    .replace(/{الاسم_الانجليزي}/g, englishNameOnly ? `🔤 *بالإنجليزي:* ${englishNameOnly}` : "")
    .replace(/{المهنة}/g, professionOnly)
    .replace(/{الخدمات}/g, servicesOnly)
    .replace(/{الخدمة_المختارة}/g, servicesOnly)
    .replace(/{تعليمات_الخدمة}/g, instLines.slice(1).join("\n"))
    .replace(/{السعر}/g, inv.totalAmount.toString())
    .replace(/{التكلفة}/g, costLines.slice(1).join("\n"))
    .replace(/{تاريخ_اليوم}/g, invDate)
    .replace(/{موعد_التسليم}/g, deliveryDisplay)
    .replace(/{الميعاد_النهائي}/g, deliveryDisplay)
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
