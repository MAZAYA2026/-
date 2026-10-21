import { Invoice, Service, DictionaryItem, CollectionClosing, Employee, AppSettings, GovernmentFine, AmanPostponedItem, PotentialCustomer } from "../types";

export interface DBPayload {
  services: Service[];
  dictionary: DictionaryItem[];
  invoices: Invoice[];
  collectionClosings: CollectionClosing[];
  employees: Employee[];
  settings: AppSettings;
  governmentFines?: GovernmentFine[];
  potentialCustomers?: PotentialCustomer[];
}

export async function fetchDB(): Promise<DBPayload> {
  const response = await fetch("/api/db");
  if (!response.ok) {
    throw new Error("Failed to fetch database from server");
  }
  return response.json();
}

export async function saveDB(data: DBPayload): Promise<void> {
  const response = await fetch("/api/db/save", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    throw new Error("Failed to save database to server");
  }
}

export async function translateWithGemini(text: string): Promise<{ arabic: string; english: string; dictionary?: DictionaryItem[]; fromDictionary?: boolean }> {
  const response = await fetch("/api/gemini/translate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!response.ok) {
    throw new Error("Failed to translate using Gemini");
  }
  return response.json();
}

export async function createInvoiceOnServer(invoiceData: Partial<Invoice>): Promise<Invoice> {
  const response = await fetch("/api/db/invoices", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(invoiceData),
  });
  if (!response.ok) {
    throw new Error("Failed to create invoice on server");
  }
  const result = await response.json();
  return result.invoice;
}

export async function updateInvoiceOnServer(id: number, invoiceData: Partial<Invoice>): Promise<Invoice> {
  const response = await fetch(`/api/db/invoices/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(invoiceData),
  });
  if (!response.ok) {
    throw new Error("Failed to update invoice on server");
  }
  const result = await response.json();
  return result.invoice;
}

export async function deleteInvoiceOnServer(id: number): Promise<void> {
  const response = await fetch(`/api/db/invoices/${id}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    throw new Error("Failed to delete invoice");
  }
}

export async function createServiceOnServer(service: Partial<Service>): Promise<Service> {
  const response = await fetch("/api/db/services", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(service),
  });
  if (!response.ok) {
    throw new Error("Failed to create service");
  }
  const result = await response.json();
  return result.service;
}

export async function updateServiceOnServer(id: string, service: Partial<Service>): Promise<Service> {
  const response = await fetch(`/api/db/services/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(service),
  });
  if (!response.ok) {
    throw new Error("Failed to update service");
  }
  const result = await response.json();
  return result.service;
}

export async function deleteServiceOnServer(id: string): Promise<void> {
  const response = await fetch(`/api/db/services/${id}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    throw new Error("Failed to delete service");
  }
}

export async function reorderServicesOnServer(services: Service[]): Promise<Service[]> {
  const response = await fetch("/api/db/services/reorder", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ services }),
  });
  if (!response.ok) {
    throw new Error("Failed to reorder services");
  }
  const result = await response.json();
  return result.services;
}

export async function createClosingOnServer(closing: Partial<CollectionClosing>): Promise<CollectionClosing> {
  const response = await fetch("/api/db/closings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(closing),
  });
  if (!response.ok) {
    throw new Error("Failed to create closing record");
  }
  const result = await response.json();
  return result.closing;
}

export async function saveDictionaryWord(arabic: string, english: string): Promise<DictionaryItem[]> {
  const response = await fetch("/api/db/dictionary", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ arabic, english: english.toUpperCase() }),
  });
  if (!response.ok) {
    throw new Error("Failed to save dictionary word");
  }
  const result = await response.json();
  return result.dictionary;
}

export async function updateDictionaryWord(originalArabic: string, newArabic: string, newEnglish: string): Promise<DictionaryItem[]> {
  const response = await fetch("/api/db/dictionary", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ 
      originalArabic, 
      arabic: newArabic.trim(), 
      english: newEnglish.trim().toUpperCase() 
    }),
  });
  if (!response.ok) {
    throw new Error("Failed to update dictionary word");
  }
  const result = await response.json();
  return result.dictionary;
}

export async function saveDictionaryBatch(items: { arabic: string; english: string }[]): Promise<DictionaryItem[]> {
  const response = await fetch("/api/db/dictionary", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items }),
  });
  if (!response.ok) {
    throw new Error("Failed to save dictionary batch");
  }
  const result = await response.json();
  return result.dictionary;
}

export async function deleteDictionaryWord(arabic: string): Promise<DictionaryItem[]> {
  const response = await fetch("/api/db/dictionary", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ arabic }),
  });
  if (!response.ok) {
    throw new Error("Failed to delete dictionary word");
  }
  const result = await response.json();
  return result.dictionary;
}

export async function updateSettingsOnServer(settings: AppSettings): Promise<AppSettings> {
  const response = await fetch("/api/db/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(settings),
  });
  if (!response.ok) {
    throw new Error("Failed to update settings");
  }
  const result = await response.json();
  return result.settings;
}

export async function updateGoogleSheetsConfig(sheetUrl: string, sheetId: string): Promise<any> {
  const response = await fetch("/api/sheets/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sheetUrl, sheetId }),
  });
  if (!response.ok) {
    throw new Error("Failed to sync Google Sheets");
  }
  return response.json();
}

export async function connectGoogleSheetsOnServer(accessToken: string): Promise<any> {
  const response = await fetch("/api/sheets/connect", {
    method: "POST",
    headers: { 
      "Content-Type": "application/json",
      "Authorization": `Bearer ${accessToken}`
    }
  });
  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error || "Failed to connect Google Sheets");
  }
  return response.json();
}

export async function pushDataToGoogleSheets(accessToken: string): Promise<any> {
  const response = await fetch("/api/sheets/push", {
    method: "POST",
    headers: { 
      "Content-Type": "application/json",
      "Authorization": `Bearer ${accessToken}`
    }
  });
  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error || "Failed to push to Google Sheets");
  }
  return response.json();
}

export async function pullDataFromGoogleSheets(accessToken: string): Promise<any> {
  const response = await fetch("/api/sheets/pull", {
    method: "POST",
    headers: { 
      "Content-Type": "application/json",
      "Authorization": `Bearer ${accessToken}`
    }
  });
  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error || "Failed to pull from Google Sheets");
  }
  return response.json();
}

// Direct Webhook (Google Apps Script Web App URL) API Helpers
export async function testGoogleWebhook(webhookUrl: string): Promise<any> {
  const response = await fetch("/api/sheets/webhook/test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ webhookUrl }),
  });
  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error || "فشل اختبار الاتصال بالرابط");
  }
  return response.json();
}

export async function pushDataToGoogleWebhook(webhookUrl?: string): Promise<any> {
  const response = await fetch("/api/sheets/webhook/push", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ webhookUrl }),
  });
  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error || "فشل تصدير البيانات إلى رابط السكربت");
  }
  return response.json();
}

export async function pullDataFromGoogleWebhook(webhookUrl?: string): Promise<any> {
  const response = await fetch("/api/sheets/webhook/pull", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ webhookUrl }),
  });
  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error || "فشل استيراد البيانات من رابط السكربت");
  }
  return response.json();
}

export async function syncDictionaryToGoogleWebhook(webhookUrl?: string): Promise<any> {
  const response = await fetch("/api/sheets/webhook/sync-dictionary", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ webhookUrl }),
  });
  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error || "فشل تسجيل ومزامنة القاموس إلى جوجل شيت");
  }
  return response.json();
}

export async function syncSettingsToGoogleWebhook(webhookUrl?: string): Promise<any> {
  const response = await fetch("/api/sheets/webhook/sync-settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ webhookUrl }),
  });
  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error || "فشل تسجيل وحفظ الإعدادات في جوجل شيت");
  }
  return response.json();
}

export async function importInvoicesFromGoogleSheet(webhookUrl?: string): Promise<{
  status: string;
  message: string;
  count: number;
  newCount: number;
  updatedCount: number;
  totalInvoices: number;
  invoices: Invoice[];
}> {
  const response = await fetch("/api/sheets/webhook/import-invoices", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ webhookUrl }),
  });
  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error || "فشل استيراد الفواتير من جوجل شيت");
  }
  return response.json();
}

export async function fetchGovernmentFines(): Promise<GovernmentFine[]> {
  const response = await fetch("/api/db/government-fines");
  if (!response.ok) {
    throw new Error("فشل استرجاع بنود الغرامات الحكومية من الخادم");
  }
  return response.json();
}

export async function saveGovernmentFines(fines: GovernmentFine[]): Promise<GovernmentFine[]> {
  const response = await fetch("/api/db/government-fines", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(fines),
  });
  if (!response.ok) {
    throw new Error("فشل حفظ بنود الغرامات الحكومية بالخادم");
  }
  const result = await response.json();
  return result.governmentFines;
}

export async function syncGovernmentFinesWithSheets(webhookUrl?: string): Promise<{
  status: string;
  savedInSheet: boolean;
  count: number;
  message: string;
}> {
  const response = await fetch("/api/sheets/webhook/sync-fines", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ webhookUrl }),
  });
  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error || "فشل مزامنة بنود الغرامات الحكومية مع جوجل شيت");
  }
  return response.json();
}

export async function syncAmanReportToGoogleSheets(payload: {
  dateFrom: string;
  dateTo: string;
  amanRows: Array<{
    id?: string;
    index?: number;
    arabicName: string;
    birthDate: string;
    notes: string;
    invoiceId?: number;
    date?: string;
  }>;
  webhookUrl?: string;
}): Promise<{
  status: string;
  message: string;
}> {
  const response = await fetch("/api/sheets/webhook/sync-aman", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error || "فشل تسجيل كشف أمان في جوجل شيت");
  }
  return response.json();
}

export async function fetchAmanReportFromGoogleSheets(params?: {
  dateFrom?: string;
  dateTo?: string;
  webhookUrl?: string;
}): Promise<{
  status: string;
  rows: Array<{
    id?: string;
    arabicName: string;
    birthDate: string;
    notes: string;
    invoiceId?: number;
    date?: string;
  }>;
  totalRows: number;
  message: string;
}> {
  const response = await fetch("/api/sheets/webhook/pull-aman", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params || {}),
  });
  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error || "فشل جلب بيانات كشف أمان من جوجل شيت");
  }
  return response.json();
}

export async function fetchLocalAmanReport(): Promise<any[]> {
  const response = await fetch("/api/db/aman");
  if (!response.ok) {
    throw new Error("فشل جلب بيانات كشف أمان من الخادم");
  }
  const result = await response.json();
  return result.rows || [];
}

export async function saveLocalAmanReport(
  rows: any[], 
  syncWithSheets: boolean = true
): Promise<{ status: string; message: string }> {
  const response = await fetch("/api/db/aman", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rows, syncWithSheets }),
  });
  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error || "فشل حفظ بيانات كشف أمان");
  }
  return response.json();
}

export async function fetchPostponedAmanNames(): Promise<AmanPostponedItem[]> {
  const response = await fetch("/api/db/aman-postponed");
  if (!response.ok) {
    throw new Error("فشل جلب قائمة الأسماء المرحلة من الخادم");
  }
  const result = await response.json();
  return result.postponedRows || [];
}

export async function savePostponedAmanNames(
  postponedRows: AmanPostponedItem[], 
  syncWithSheets: boolean = true
): Promise<AmanPostponedItem[]> {
  const response = await fetch("/api/db/aman-postponed", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ postponedRows, syncWithSheets }),
  });
  if (!response.ok) {
    throw new Error("فشل حفظ الأسماء المرحلة");
  }
  const result = await response.json();
  return result.postponedRows || [];
}

export async function deletePostponedAmanName(id: string): Promise<AmanPostponedItem[]> {
  const response = await fetch(`/api/db/aman-postponed/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    throw new Error("فشل حذف الاسم المرحل");
  }
  const result = await response.json();
  return result.postponedRows || [];
}

export async function syncPostponedAmanToGoogleSheets(
  postponedRows: AmanPostponedItem[], 
  webhookUrl?: string
): Promise<{ status: string; message: string }> {
  const response = await fetch("/api/sheets/webhook/sync-postponed-aman", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ postponedRows, webhookUrl }),
  });
  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error || "فشل تسجيل الأسماء المرحلة في جوجل شيت");
  }
  return response.json();
}

export async function pullPostponedAmanFromGoogleSheets(webhookUrl?: string): Promise<{
  status: string;
  postponedRows: AmanPostponedItem[];
  totalRows: number;
  message: string;
}> {
  const response = await fetch("/api/sheets/webhook/pull-postponed-aman", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ webhookUrl }),
  });
  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error || "فشل جلب الأسماء المرحلة من جوجل شيت");
  }
  return response.json();
}





export async function cutAndPostponeAmanRow(params: {
  activeRows: any[];
  postponedRows: any[];
}): Promise<{ status: string; sheetSynced: boolean; message: string; activeRows: any[]; postponedRows: any[] }> {
  const response = await fetch("/api/db/aman-cut-and-postpone", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error || "فشل ترحيل الاسم في قاعدة البيانات");
  }
  return response.json();
}

export async function insertPostponedAmanRow(params: {
  activeRows: any[];
  postponedRows: any[];
}): Promise<{ status: string; sheetSynced: boolean; message: string; activeRows: any[]; postponedRows: any[] }> {
  const response = await fetch("/api/db/aman-insert-postponed", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error || "فشل إدراج الاسم في كشف أمان");
  }
  return response.json();
}

// ========================================================
// 🎯 Potential Customers & AI OCR Client Methods
// ========================================================

export async function fetchPotentialCustomers(): Promise<PotentialCustomer[]> {
  const response = await fetch("/api/db/potential-customers");
  if (!response.ok) {
    throw new Error("فشل جلب قائمة العملاء المحتملين");
  }
  const result = await response.json();
  return result.potentialCustomers || [];
}

export async function savePotentialCustomers(customers: Partial<PotentialCustomer>[]): Promise<PotentialCustomer[]> {
  const response = await fetch("/api/db/potential-customers", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ customers, syncWithSheets: true }),
  });
  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error || "فشل حفظ بيانات العملاء المحتملين");
  }
  const result = await response.json();
  return result.potentialCustomers || [];
}

export async function updatePotentialCustomerOnServer(id: string, updateData: Partial<PotentialCustomer>): Promise<PotentialCustomer> {
  const response = await fetch(`/api/db/potential-customers/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updateData),
  });
  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error || "فشل تحديث بيانات العميل المحتمل");
  }
  const result = await response.json();
  return result.potentialCustomer;
}

export async function deletePotentialCustomerOnServer(id: string): Promise<void> {
  const response = await fetch(`/api/db/potential-customers/${id}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error || "فشل حذف العميل المحتمل");
  }
}

export async function scanDocumentWithAI(params: {
  image: string; // base64 or data URL
  documentType: "national_id_front" | "national_id_back" | "birth_certificate";
}): Promise<{
  status: string;
  extracted: {
    arabicName?: string;
    nationalId?: string;
    birthDate?: string;
    profession?: string;
    gender?: string;
    calculatedAge?: number;
  };
  documentType: string;
  message?: string;
}> {
  const response = await fetch("/api/ocr/scan-document", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error || "فشل مسح وقراءة بيانات المستند بالذكاء الاصطناعي");
  }
  return response.json();
}

export async function syncPotentialCustomersToGoogleSheets(webhookUrl?: string): Promise<{ status: string; message: string }> {
  const response = await fetch("/api/sheets/webhook/sync-potential-customers", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ webhookUrl }),
  });
  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error || "فشل مزامنة العملاء المحتملين مع جوجل شيت");
  }
  return response.json();
}

// Export Potential Customers to Excel-compatible CSV with UTF-8 BOM
export function exportPotentialCustomersToExcel(customers: PotentialCustomer[]) {
  const headers = [
    "م",
    "الاسم بالكامل (عربي)",
    "الاسم بالإنجليزي",
    "الرقم القومي (14 رقم)",
    "تاريخ الميلاد",
    "المهنة / الوظيفة",
    "نوع المستند",
    "رقم الهاتف",
    "صفة مقدم الطلب",
    "تاريخ التسجيل",
    "الحالة",
    "رقم الفاتورة إن وجد",
    "ملاحظات"
  ];

  const rows = customers.map((c, idx) => [
    idx + 1,
    `"${(c.arabicName || "").replace(/"/g, '""')}"`,
    `"${(c.englishName || "").replace(/"/g, '""')}"`,
    `'${c.nationalId || ""}`, // Prefix with single quote so Excel preserves full 14 digits
    `"${c.birthDate || ""}"`,
    `"${(c.profession || "").replace(/"/g, '""')}"`,
    `"${c.documentType === "بطاقة_رقم_قومي" ? "بطاقة رقم قومي" : c.documentType === "شهادة_ميلاد" ? "شهادة ميلاد" : (c.documentType || "يدوي")}"`,
    `"${c.phone || ""}"`,
    `"${c.applicantCapacity || ""}"`,
    `"${c.createdAt || ""}"`,
    `"${c.status || "جديد"}"`,
    `"${c.invoiceId || ""}"`,
    `"${(c.notes || "").replace(/"/g, '""')}"`
  ]);

  const csvContent = "\uFEFF" + [headers.join(","), ...rows.map(r => r.join(","))].join("\r\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const dateStr = new Date().toISOString().split("T")[0];
  link.setAttribute("href", url);
  link.setAttribute("download", `العملاء_المحتملين_مكتب_مزايا_${dateStr}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
