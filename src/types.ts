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
}

export interface CustomerInput {
  arabicName: string; // الاسم العربي (Mandatory)
  englishName: string; // الاسم الإنجليزي (Optional, mandatory if service starts with # or ##)
  englishNameOption: "gemini" | "previous"; // Translation choice
  nationalId: string; // الرقم القومى (Visible/mandatory if service starts with # or ##)
  birthDate: string; // تاريخ الميلاد (Automatically calculated from National ID)
  phone: string; // رقم الهاتف (Mandatory, validates as Egyptian (11 digits starting with 01) or general)
  profession: string; // المهنة (Mandatory if service starts with # or ##, max 32 chars)
  services: {
    serviceId: string;
    quantity: number;
    price: number; // Total price = (govPrice + officeFee) * qty
    deliveryDate: string; // Calculated delivery date
  }[];
}

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

export interface AppSettings {
  headerText: string; // نص مقدمة الفاتورة
  subHeaderText?: string; // السطر الفرعي أسفل ترويسة الفاتورة المطبوعة (مثل: جوازات طنطا والمعاملات الحكومية)
  footerText: string; // خاتمة الفاتورة
  welcomeMessage: string; // رسالة ترحيب
  readyMessage: string; // رسالة جاهز للتسليم
  deliveryMessage: string; // رسالة تم التسليم
  whatsappTemplate: string; // General template
  googleSheetWebhookUrl?: string; // Web App Webhook URL (https://script.google.com/macros/s/.../exec)
  autoSyncWebhook?: boolean; // Automatic background sync on invoice create/edit
  googleSheetId?: string; // Spreadsheet ID for database integration
  googleSheetUrl?: string; // URL for direct access
  googleSheetsConnected?: boolean; // Integration toggle
}
