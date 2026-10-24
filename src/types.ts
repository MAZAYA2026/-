export enum InvoiceStatus {
  NEW = "NEW", // Blue
  READY = "READY", // Green
  DELIVERED = "DELIVERED" // Red
}

export interface Service {
  id: string;
  name: string; // اسم الخدمة (e.g., starting with # or ##)
  govPrice: number; // السعر الحكومى
  officeFee: number; // رسوم المكتب
  duration: string; // مدة تنفيذ الخدمة (text)
  instructions: string; // تعليمات التسليم
  deliveryDaysOffset: number; // For automatic delivery date calculation (optional)
  notes: string; // ملاحظات للعميل
  order?: number; // ترتيب ظهور الخدمة (1, 2, 3...)
}

export interface GovernmentFine {
  id: string;
  name: string; // اسم بند الغرامة الحكومية (مثل: غرامة فقد جواز سفر، غرامة تالف، غرامة تأخير...)
  amount: number; // مبلغ الغرامة الافتراضي بالجنيه
  notes?: string; // ملاحظات أو شروط تطبيق الغرامة
}

export interface CustomerInput {
  arabicName: string; // الاسم العربي (Mandatory)
  englishName: string; // الاسم الإنجليزي (Optional, mandatory if service starts with # or ##)
  englishNameOption: "dictionary" | "previous" | "gemini"; // Translation choice (dictionary-based or previous passport)
  nationalId: string; // الرقم القومى (Visible/mandatory if service starts with # or ##)
  birthDate: string; // تاريخ الميلاد (Automatically calculated from National ID)
  phone: string; // رقم الهاتف (Mandatory, validates as Egyptian (11 digits starting with 01) or general)
  profession: string; // المهنة (Mandatory if service starts with # or ##, max 32 chars)
  applicantCapacity?: string; // صفة مقدم الطلب (مثل: بنفسه، الأب، الأم، الزوج...)
  services: {
    serviceId: string;
    quantity: number;
    price: number; // Total price = (govPrice + (fineAmount || 0) + officeFee) * qty
    deliveryDate: string; // Calculated delivery date
    notes?: string; // ملاحظات أو تعليمات خاصة بالخدمة
    fineName?: string; // اسم الغرامة الحكومية إن وجدت (لخدمات #)
    fineAmount?: number; // مبلغ الغرامة الحكومية للوحدة إن وجد
    completed?: boolean; // هل تم الانتهاء من تنفيذ هذه الخدمة
    completedAt?: string; // تاريخ وتوقيت الانتهاء من تنفيذ هذه الخدمة
    executionNote?: string; // ملاحظات تنفيذ الخدمة (مثل: تأخير بسبب كذا أو مع مندوب كذا)
  }[];
}

export const DEFAULT_APPLICANT_CAPACITIES: string[] = [
  "بنفسه",
  "الأب",
  "الأم",
  "الزوج",
  "الزوجة",
  "الابن",
  "الابنة",
  "الأخ",
  "الأخت",
  "وكيل بموجب توكيل"
];

export interface Invoice {
  invoiceId: number; // Sequential starting from 100
  date: string; // Creation date (YYYY-MM-DD)
  status: InvoiceStatus;
  archiveDrawer?: string; // رقم درج حفظ الأرشيف (when status is READY or DELIVERED)
  employeeName: string; // The employee who created/modified this
  customers: CustomerInput[];
  totalGov: number;
  totalOffice: number;
  totalAmount: number; // Total invoice amount
  notificationSent?: boolean; // Reminder notification state
}

export interface DictionaryItem {
  arabic: string;
  english: string;
}

export interface CollectionClosing {
  id: string;
  closeDate: string;
  closedBy: string;
  revenue: number;
  profit: number;
  cashAmount: number;
  deferredAmount: number;
  notes: string;
}

export interface Employee {
  username: string;
  name: string;
  role: "admin" | "employee";
  password?: string;
  permissions: {
    canCreateInvoices: boolean;
    canEditInvoices: boolean;
    canViewCollection: boolean;
    canManageServices: boolean;
    canViewAmanReport: boolean;
  };
}

export interface HolidayItem {
  date: string; // YYYY-MM-DD
  name: string; // اسم العطلة الرسمية
  originalDate?: string; // التاريخ الأصلي قبل الترحيل بقرار رئيس الوزراء
  shifted?: boolean; // تم ترحيلها بقرار حكومي
}

export interface AppSettings {
  headerText: string; // نص مقدمة الفاتورة
  subHeaderText?: string; // السطر الفرعي أسفل ترويسة الفاتورة المطبوعة (مثل: جوازات طنطا والمعاملات الحكومية)
  footerText: string; // خاتمة الفاتورة
  contactPhone?: string; // رقم هاتف التواصل والشكاوى
  welcomeMessage: string; // رسالة ترحيب واستلام الطلب الأولى
  readyMessage: string; // رسالة جاهز للتسليم (للمعاملات العامة)
  readyPassportMessage?: string; // رسالة جاهز للتسليم الخاصة بمعاملات جوازات السفر (التي تبدأ بـ #)
  partialReadyMessage?: string; // قالب رسالة الإنجاز الجزئي للخدمات واستكمال باقي المعاملات تباعاً
  deliveryMessage: string; // رسالة تم التسليم
  whatsappTemplate?: string; // (ملغي - البديل عنه رسالة الترحيب واستلام الطلب منعاً لتكرار البيانات)
  googleSheetWebhookUrl?: string; // Web App Webhook URL (https://script.google.com/macros/s/.../exec)
  autoSyncWebhook?: boolean; // Automatic background sync on invoice create/edit
  googleSheetId?: string; // Spreadsheet ID for database integration
  googleSheetUrl?: string; // URL for direct access
  googleSheetsConnected?: boolean; // Integration toggle
  customHolidays?: HolidayItem[]; // العطلات الرسمية المخصصة والمضافة
  includeSaturdayAsWeekend?: boolean; // اعتبار يوم السبت عطلة أسبوعية للمصالح الحكومية (افتراضياً: نعم)
  applicantCapacities?: string[]; // خيارات صفة مقدم الطلب لمعاملات الجوازات (# و ##)
  amanNormalPrice?: number; // قيمة الجواز العادي في كشف أمان
  amanUrgentPrice?: number; // قيمة الجواز العاجل في كشف أمان
}

export interface AmanPostponedItem {
  id: string;
  arabicName: string;
  birthDate: string;
  notes: string;
  originalDate: string; // تاريخ الكشف الأصلي (YYYY-MM-DD)
  postponedAt: string; // وقت وتاريخ الترحيل
  invoiceId?: number;
  serviceType?: string;
  fineName?: string;
  fineAmount?: number;
  status?: "مؤجل" | "تم_الإدراج";
}

export interface PotentialCustomer {
  id: string;
  arabicName: string;
  englishName?: string;
  nationalId: string;
  birthDate: string;
  profession: string;
  documentType: "بطاقة_رقم_قومي" | "شهادة_ميلاد" | "يدوي";
  createdAt: string;
  status: "جديد" | "تم_التحويل_لفاتورة";
  invoiceId?: number;
  phone?: string;
  applicantCapacity?: string;
  notes?: string;
  cardFrontImage?: string; // base64 preview
  cardBackImage?: string; // base64 preview
}

