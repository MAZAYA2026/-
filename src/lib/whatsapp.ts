import { Invoice, Service, AppSettings } from "../types";
import { calculateWorkingDaysDeliveryDate, getArabicDayName } from "./businessDays";

/**
 * Builds a clean, deduplicated WhatsApp welcome / payment details message.
 * Handles single customer, multiple services per customer, and multiple individuals per invoice
 * without repeating names, service details, or delivery dates.
 */
export function generateWhatsAppWelcomeMessage(
  inv: Invoice, 
  services: Service[], 
  settings: AppSettings
): string {
  if (!inv || !inv.customers || inv.customers.length === 0) return "";

  // 1. Collect all non-empty delivery dates for services in this invoice
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
    : "حسب المواعيد المقررة لكل خدمة";

  // 2. Greeting customer name(s)
  const validCustomers = inv.customers.filter((c) => c.arabicName && c.arabicName.trim());
  let greetingName = "عميلنا العزيز";
  if (validCustomers.length === 1) {
    greetingName = validCustomers[0].arabicName.trim();
  } else if (validCustomers.length === 2) {
    greetingName = `${validCustomers[0].arabicName.trim()} و ${validCustomers[1].arabicName.trim()}`;
  } else if (validCustomers.length > 2) {
    greetingName = `${validCustomers[0].arabicName.trim()} والأسرة الكريمة (${validCustomers.length} أفراد)`;
  }

  // 3. Build deduplicated services and individuals list
  const isSingleCustomer = inv.customers.length === 1;
  const sections: string[] = [];

  inv.customers.forEach((cust, idx) => {
    const lines: string[] = [];

    // If multiple individuals, identify each individual cleanly
    if (!isSingleCustomer) {
      lines.push(`👤 الفرد (${idx + 1}): ${cust.arabicName?.trim() || "بدون اسم"}`);
    }

    // Passport details if available (show once per individual, not repeated per service)
    const extraParts: string[] = [];
    if (cust.englishName && cust.englishName.trim() && cust.englishName !== "N/A") {
      extraParts.push(`EN: ${cust.englishName.trim()}`);
    }
    if (cust.profession && cust.profession.trim() && cust.profession !== "N/A") {
      extraParts.push(`المهنة: ${cust.profession.trim()}`);
    }
    if (extraParts.length > 0) {
      lines.push(isSingleCustomer ? `📝 ${extraParts.join(" | ")}` : `   📝 ${extraParts.join(" | ")}`);
    }

    // List each service for this individual cleanly without duplicate durations or duplicate titles
    const seenServices = new Set<string>();
    cust.services.forEach((s) => {
      const matched = services.find((srv) => srv.name === s.serviceId || srv.id === s.serviceId);
      const srvName = matched?.name || s.serviceId;
      const srvKey = `${srvName}_${s.quantity}_${s.price}`;
      
      // Avoid duplicate lines if identical
      if (seenServices.has(srvKey)) return;
      seenServices.add(srvKey);

      const qtyStr = s.quantity > 1 ? ` (عدد: ${s.quantity})` : "";
      const priceStr = s.price > 0 ? ` - ${s.price} ج.م` : "";
      
      const prefix = isSingleCustomer ? "• " : "   • ";
      lines.push(`${prefix}${srvName}${qtyStr}${priceStr}`);
    });

    if (lines.length > 0) {
      sections.push(lines.join("\n"));
    }
  });

  const servicesDetailsText = sections.join("\n------------------------------------\n");

  // 4. Base template from settings or standard clean template
  let template = settings.welcomeMessage?.trim();
  
  // If template is the default or contains redundant headers, clean it up:
  if (!template) {
    template = `مرحباً بك {اسم_العميل}، تم استلام طلبك برقم #{رقم_الفاتورة} بنجاح.
الخدمات المطلوبة:
{الخدمات}
💰 إجمالي الحساب: {السعر} ج.م
📅 موعد الاستلام المتوقع: {موعد_التسليم}`;
  }

  // Replace placeholders
  let formatted = template
    .replace(/{اسم_العميل}/g, greetingName)
    .replace(/{رقم_الفاتورة}/g, inv.invoiceId.toString())
    .replace(/{الخدمات}/g, servicesDetailsText)
    .replace(/{السعر}/g, inv.totalAmount.toString())
    .replace(/{تاريخ_اليوم}/g, inv.date || "")
    .replace(/{موعد_التسليم}/g, deliveryDisplay)
    .replace(/{تاريخ_الاستلام}/g, deliveryDisplay);

  // If user template did NOT have delivery date placeholder and delivery date is known, append it once
  if (maxDeliveryDate && !template.includes("{موعد_التسليم}") && !template.includes("{تاريخ_الاستلام}") && !formatted.includes(maxDeliveryDate)) {
    formatted += `\n📅 موعد استلام المعاملة: ${deliveryDisplay}`;
  }

  // Footer text if defined and not already included
  if (settings.footerText && settings.footerText.trim() && !formatted.includes(settings.footerText.trim())) {
    formatted += `\n\n${settings.footerText.trim()}`;
  }

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
