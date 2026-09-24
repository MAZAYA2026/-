import { Invoice, Service, AppSettings } from "../types";
import { calculateWorkingDaysDeliveryDate, getArabicDayName } from "./businessDays";

export const WHATSAPP_DIVIDER = "━━━━━━━━━━━━━━━━━━━━";

/**
 * Builds a beautifully formatted WhatsApp welcome / order receipt message.
 * Places clear aesthetic dividers (WHATSAPP_DIVIDER) between every piece of information:
 * 1. Intro & Invoice Header
 * 2. Name (Arabic & English)
 * 3. Profession
 * 4. Selected Service(s)
 * 5. Service Instructions & Guidelines
 * 6. Financial Cost & Fees
 * 7. Final Delivery Deadline (Official Business Days)
 * 8. Closing & Contact
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

  // ── Section 2: الاسم (العربي والإنجليزي) ────────────────────
  const nameLines: string[] = [];
  let arabicNameOnly = "";
  let englishNameOnly = "";

  if (isSingleCustomer) {
    const cust = inv.customers[0];
    arabicNameOnly = cust.arabicName?.trim() || "عميلنا العزيز";
    nameLines.push(`👤 *الاسم:*`);
    nameLines.push(arabicNameOnly);
    if (cust.englishName && cust.englishName.trim() && cust.englishName !== "N/A" && cust.englishName !== "نفس ترجمة الجواز السابق") {
      englishNameOnly = cust.englishName.trim().toUpperCase();
      nameLines.push(`🔤 *الاسم بالإنجليزي:*`);
      nameLines.push(englishNameOnly);
    }
  } else {
    nameLines.push(`👥 *الأسماء وبيانات الأفراد (${inv.customers.length} أفراد):*`);
    const arNames: string[] = [];
    const enNames: string[] = [];
    inv.customers.forEach((c, idx) => {
      const ar = c.arabicName?.trim() || `فرد ${idx + 1}`;
      arNames.push(`${idx + 1}️⃣ ${ar}`);
      nameLines.push(`${idx + 1}️⃣ *الاسم:* ${ar}`);
      if (c.englishName && c.englishName.trim() && c.englishName !== "N/A" && c.englishName !== "نفس ترجمة الجواز السابق") {
        const en = c.englishName.trim().toUpperCase();
        enNames.push(`${idx + 1}️⃣ ${en}`);
        nameLines.push(`    🔤 *بالإنجليزي:* ${en}`);
      }
    });
    arabicNameOnly = arNames.join("\n");
    englishNameOnly = enNames.join("\n");
  }

  // ── Section 3: المهنة ───────────────────────────────────────
  const profLines: string[] = [];
  profLines.push(`💼 *المهنة:*`);
  if (isSingleCustomer) {
    const p = inv.customers[0]?.profession?.trim();
    profLines.push(p && p !== "N/A" ? p : "حسب بطاقة الرقم القومي / المستندات الرسمية");
  } else {
    inv.customers.forEach((c, idx) => {
      const p = c.profession?.trim();
      const pText = p && p !== "N/A" ? p : "حسب بطاقة الرقم القومي";
      profLines.push(`• ${c.arabicName?.trim() || `فرد ${idx + 1}`}: ${pText}`);
    });
  }

  // ── Section 4: الخدمة المختارة ──────────────────────────────
  const srvLines: string[] = [];
  srvLines.push(isSingleCustomer && inv.customers[0].services.length === 1 ? `📋 *الخدمة المختارة:*` : `📋 *الخدمات المختارة:*`);
  inv.customers.forEach((cust, cIdx) => {
    if (!isSingleCustomer) {
      srvLines.push(`*(${cust.arabicName?.trim() || `فرد ${cIdx + 1}`}):*`);
    }
    const seen = new Set<string>();
    cust.services.forEach((s) => {
      const matched = services.find((srv) => srv.name === s.serviceId || srv.id === s.serviceId);
      const srvName = matched?.name || s.serviceId;
      const srvKey = `${srvName}_${s.quantity}_${s.price}`;
      if (seen.has(srvKey)) return;
      seen.add(srvKey);

      const qtyStr = s.quantity > 1 ? ` (العدد: ${s.quantity})` : "";
      const priceStr = s.price > 0 ? ` - ${s.price} ج.م` : "";
      const prefix = isSingleCustomer ? "• " : "  • ";
      srvLines.push(`${prefix}${srvName}${qtyStr}${priceStr}`);
    });
  });

  // ── Section 5: تعليمات هذه الخدمة ────────────────────────────
  const instLines: string[] = [];
  instLines.push(`📌 *تعليمات هذه الخدمة:*`);
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
    instLines.push(`• يرجى إحضار أصل بطاقة الرقم القومي سارية أو المستندات الأصلية لمطابقتها عند الاستلام.`);
  } else {
    // Official standard instructions for Mazaya Passports & Government Services
    instLines.push(`• يرجى إحضار أصل بطاقة الرقم القومي سارية أو المستندات الأصلية لمطابقتها عند الاستلام.`);
    instLines.push(`• تسليم المعاملات يتم لصاحب الشأن شخصياً أو بموجب توكيل رسمي ساري طبقاً لتعليمات مصلحة الجوازات والأمن العام.`);
    instLines.push(`• يرجى الاحتفاظ بصورة هذه الفاتورة الإلكترونية لتقديمها عند الحضور للاستلام.`);
  }

  // ── Section 6: التكلفة ──────────────────────────────────────
  const costLines: string[] = [];
  costLines.push(`💰 *التكلفة المالية:*`);
  costLines.push(`• إجمالي الفاتورة: ${inv.totalAmount} ج.م`);
  if (typeof inv.totalGov === "number" && inv.totalGov > 0 && typeof inv.totalOffice === "number" && inv.totalOffice > 0) {
    costLines.push(`• تفصيل المبلغ: رسوم حكومية (${inv.totalGov} ج.م) + أتعاب المكتب (${inv.totalOffice} ج.م)`);
  }

  // ── Section 7: الميعاد النهائي للتسليم ───────────────────────
  const deliveryLines: string[] = [];
  deliveryLines.push(`🕒 *الميعاد النهائي للتسليم:*`);
  deliveryLines.push(`📅 ${deliveryDisplay}`);

  // ── Section 8: الخاتمة ──────────────────────────────────────
  const closingLines: string[] = [];
  closingLines.push(`✨ *نسعد دائماً بخدمتكم وتسهيل معاملاتكم*`);
  const customFooter = settings.footerText?.trim();
  if (customFooter) {
    closingLines.push(customFooter.replace(/\n+/g, " - "));
  } else {
    closingLines.push(`شكراً لتعاملكم مع مكتب مزايا للجوازات والمعاملات الحكومية.`);
  }
  closingLines.push(`📍 طنطا - شارع الجلاء - بجوار الجوازات`);
  if (settings.contactPhone && settings.contactPhone.trim()) {
    closingLines.push(`📞 للاستفسار والمتابعة: ${settings.contactPhone.trim()}`);
  }

  // Standard divided sections
  const sections = [
    headerLines.join("\n"),
    nameLines.join("\n"),
    profLines.join("\n"),
    srvLines.join("\n"),
    instLines.join("\n"),
    costLines.join("\n"),
    deliveryLines.join("\n"),
    closingLines.join("\n"),
  ];

  // Check if user has a custom template in settings with explicit divider placeholders
  const userTemplate = settings.welcomeMessage?.trim();
  const isOldSquashedTemplate = !userTemplate || 
    userTemplate.includes("عزيزنا {اسم_العميل}، تم استلام طلباتك بمكتب مزايا") ||
    !userTemplate.includes("━");

  if (isOldSquashedTemplate) {
    return sections.join(`\n\n${WHATSAPP_DIVIDER}\n\n`);
  }

  // If user provided a customized template containing dividers or placeholders
  let formatted = userTemplate
    .replace(/{فاصل}/g, WHATSAPP_DIVIDER)
    .replace(/{اسم_العميل}/g, arabicNameOnly)
    .replace(/{الاسم}/g, arabicNameOnly)
    .replace(/{الاسم_الانجليزي}/g, englishNameOnly ? `🔤 *الاسم بالإنجليزي:*\n${englishNameOnly}` : "")
    .replace(/{المهنة}/g, profLines.slice(1).join("\n"))
    .replace(/{الخدمات}/g, srvLines.slice(1).join("\n"))
    .replace(/{الخدمة_المختارة}/g, srvLines.slice(1).join("\n"))
    .replace(/{تعليمات_الخدمة}/g, instLines.slice(1).join("\n"))
    .replace(/{السعر}/g, inv.totalAmount.toString())
    .replace(/{التكلفة}/g, costLines.slice(1).join("\n"))
    .replace(/{تاريخ_اليوم}/g, invDate)
    .replace(/{موعد_التسليم}/g, deliveryDisplay)
    .replace(/{الميعاد_النهائي}/g, deliveryDisplay)
    .replace(/{الخاتمة}/g, closingLines.slice(1).join("\n"))
    .replace(/{رقم_الفاتورة}/g, inv.invoiceId.toString());

  // Clean empty lines caused by missing optional placeholders
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
