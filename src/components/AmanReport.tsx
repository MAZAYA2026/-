import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { Invoice, Service, Employee, AppSettings, InvoiceStatus, CustomerInput, AmanPostponedItem, GovernmentFine } from "../types";
import { 
  updateInvoiceOnServer, 
  createInvoiceOnServer, 
  syncAmanReportToGoogleSheets, 
  fetchAmanReportFromGoogleSheets,
  fetchLocalAmanReport,
  saveLocalAmanReport,
  fetchPostponedAmanNames,
  savePostponedAmanNames,
  deletePostponedAmanName,
  syncPostponedAmanToGoogleSheets,
  pullPostponedAmanFromGoogleSheets,
  cutAndPostponeAmanRow,
  insertPostponedAmanRow,
  fetchDB,
  updateSettingsOnServer
} from "../lib/api";
import { playLanguageWarningSound } from "../lib/audio";
import { 
  Calendar, 
  Printer, 
  FileSpreadsheet, 
  Filter, 
  CheckCircle2, 
  AlertCircle, 
  AlertTriangle,
  Database, 
  Plus, 
  RefreshCw, 
  Check, 
  Save,
  Volume2,
  CloudDownload,
  Scissors,
  FolderInput,
  X,
  Trash2,
  Search,
  Download,
  Clock,
  ArrowRight,
  UserCheck,
  Package
} from "lucide-react";

export interface AmanRowItem {
  id: string;
  invoiceId?: number;
  customerIndex?: number;
  arabicName: string;
  birthDate: string;
  notes: string;
  date: string;
  isCustomManual?: boolean;
  serviceType?: "عادي" | "عاجل" | "مستعجل" | string;
  hasFine?: boolean;
  fineName?: string;
  fineAmount?: number;
  fines?: { name: string; amount: number }[];
  passportSerial?: string; // رقم مسلسل الجواز (8 أرقام)
}

interface AmanReportProps {
  invoices: Invoice[];
  services: Service[];
  activeEmployee: Employee;
  settings?: AppSettings;
  onInvoiceUpdated?: (updated: Invoice) => void;
  onInvoiceCreated?: (newInv: Invoice) => void;
  governmentFines?: GovernmentFine[];
  onSettingsUpdated?: (settings: AppSettings) => void;
}

// Helper function to normalize any date format into comparable YYYY-MM-DD
export function normalizeDateToYMD(dStr: string | undefined): string {
  if (!dStr) return "";
  const cleanStr = String(dStr).trim();
  const isoMatch = cleanStr.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2].padStart(2, "0")}-${isoMatch[3].padStart(2, "0")}`;
  }
  const dmyMatch = cleanStr.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (dmyMatch) {
    return `${dmyMatch[3]}-${dmyMatch[2].padStart(2, "0")}-${dmyMatch[1].padStart(2, "0")}`;
  }
  const parsed = new Date(cleanStr);
  if (!isNaN(parsed.getTime())) {
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, "0");
    const d = String(parsed.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  return cleanStr.slice(0, 10);
}

// Helper function to resolve Aman customer details: serviceType (عادي / مستعجل), fine status and display label
// User explicit requirement:
// "عمود الملاحظات لا تضع به المهنة وفى حالة عدم وجود غرامات لا تكتب لا توجد غرامة حيث الطبيعى طالما مفيش غرامة لا يذكر لها اسم وتكتب فقط الغرامة فى حالة تواجدها"
export function resolveAmanDetails(
  row: Partial<AmanRowItem>,
  invoices: Invoice[],
  services: Service[],
  governmentFines?: GovernmentFine[]
): {
  serviceType: "عادي" | "عاجل";
  hasFine: boolean;
  fineName: string;
  fineAmount: number;
  fines?: { name: string; amount: number }[];
  statusText: string;
} {
  // User explicit requirement: "في كشف امان غير مسمى كلمة مستعجل الى كلمة عاجل"
  let serviceType: "عادي" | "عاجل" = (row.serviceType as any) === "مستعجل" || (row.serviceType as any) === "عاجل" ? "عاجل" : "عادي";
  let hasFine = row.hasFine;
  let fineName = (row.fineName || "").trim();
  let fineAmount = Number(row.fineAmount) || 0;
  let rowFines: { name: string; amount: number }[] = Array.isArray(row.fines) && row.fines.length > 0 ? [...row.fines] : [];
  const rowNotes = (row.notes || "").trim();

  // Find linked customer from fresh invoices list if needed
  let targetInv = row.invoiceId ? invoices.find((i) => i.invoiceId === row.invoiceId) : undefined;
  if (!targetInv && row.arabicName) {
    targetInv = invoices.find((i) => i.customers?.some((c) => c.arabicName?.trim() === row.arabicName?.trim()));
  }

  if (targetInv && Array.isArray(targetInv.customers)) {
    const targetCust = row.customerIndex !== undefined 
      ? targetInv.customers[row.customerIndex] 
      : targetInv.customers.find((c) => c.arabicName?.trim() === row.arabicName?.trim());

    if (targetCust && Array.isArray(targetCust.services)) {
      const amanSrv = targetCust.services.find((s) => {
        const srvId = String(s.serviceId || "").trim();
        const matched = services.find((srv) => srv.id === srvId || srv.name === srvId);
        const fullName = matched?.name || srvId;
        return fullName.startsWith("#") && !fullName.startsWith("##");
      });

      if (amanSrv) {
        const srvId = String(amanSrv.serviceId || "").trim();
        const matched = services.find((srv) => srv.id === srvId || srv.name === srvId);
        const fullName = matched?.name || srvId;

        const isUrgent = fullName.includes("مستعجل") || fullName.includes("عاجل") || fullName.includes("فورى");
        serviceType = isUrgent ? "عاجل" : "عادي";

        // Multi-fine support from invoice
        if (Array.isArray(amanSrv.fines) && amanSrv.fines.length > 0) {
          rowFines = amanSrv.fines.map((f) => ({
            name: f.name.trim(),
            amount: Number(f.amount) || 0,
          }));
          fineAmount = rowFines.reduce((sum, f) => sum + f.amount, 0);
          fineName = rowFines.map((f) => f.name).join(" + ");
          hasFine = true;
        } else {
          if (!fineName && amanSrv.fineName && amanSrv.fineName.trim().length > 0) {
            fineName = amanSrv.fineName.trim();
          }
          if (!fineAmount && amanSrv.fineAmount && amanSrv.fineAmount > 0) {
            fineAmount = amanSrv.fineAmount;
          }
          if (hasFine === undefined) {
            hasFine = !!(fineName || fineAmount > 0);
          }
        }
      }
    }
  }

  // Fallback checks from notes text if not resolved
  if (hasFine === undefined) {
    if ((rowNotes.includes("غرامة") || rowNotes.includes("غ ")) && !rowNotes.includes("لا توجد غرامة")) {
      hasFine = true;
      const m = rowNotes.match(/(?:غرامة|غ)\s*(?:\(?([^)]+)\)?)?/);
      if (!fineName && m && m[1]) fineName = m[1].replace(/[()]/g, "").trim();
      if (!fineName) fineName = "حكومية";
    } else {
      hasFine = false;
    }
  }

  if (!row.serviceType && (rowNotes.includes("مستعجل") || rowNotes.includes("عاجل"))) {
    serviceType = "عاجل";
  }

  // Exact matching against configured governmentFines ONLY (never substring match, to prevent reverting custom/renamed fines to old names)
  if (rowFines.length === 0 && governmentFines && Array.isArray(governmentFines) && fineName) {
    // If fineName contains multiple fines e.g. "المؤهل + بدل فاقد" or "غرامة المؤهل + غرامة بدل فاقد"
    if (fineName.includes("+") || fineName.includes("،")) {
      const parts = fineName.split(/\s*[\+\،]\s*/).filter(Boolean);
      rowFines = parts.map((p) => {
        const cleanP = p.trim().replace(/^(?:غرامة|غ)\s*/, "").trim();
        const match = governmentFines.find((f) => {
          const fClean = (f.name || "").replace(/^(?:غرامة|غ)\s*/, "").trim();
          return fClean === cleanP || f.name.trim() === p.trim();
        });
        return {
          name: cleanP,
          amount: match ? match.amount : getFineAmount({ fineName: cleanP }, governmentFines),
        };
      });
      fineAmount = rowFines.reduce((sum, f) => sum + f.amount, 0);
    } else {
      const cleanSingle = fineName.replace(/^(?:غرامة|غ)\s*/, "").trim();
      const matchedFine = governmentFines.find((f) => {
        const fClean = (f.name || "").replace(/^(?:غرامة|غ)\s*/, "").trim();
        return fClean === cleanSingle || f.name.trim() === fineName;
      });
      if (matchedFine) {
        fineName = matchedFine.name.trim();
        if (!fineAmount) fineAmount = matchedFine.amount;
      }
    }
  }

  // User explicit requirement: "اختصر كلمة غرامة الى حرف غ فقط توفيرا فى المساحة"
  // Format each fine name with "غ " instead of "غرامة "
  const formatShortFine = (fName: string): string => {
    const raw = (fName || "حكومية").trim();
    const clean = raw.replace(/^(?:غرامة|غ)\s*/, "").trim();
    return `غ ${clean}`;
  };

  let fineLabel = "";
  if (rowFines.length > 0) {
    fineLabel = rowFines.map((f) => formatShortFine(f.name)).join(" + ");
  } else if (hasFine && (fineName || fineAmount > 0)) {
    fineLabel = formatShortFine(fineName);
  }

  const statusText = fineLabel ? `${serviceType} - ${fineLabel}` : serviceType;

  return {
    serviceType,
    hasFine: !!hasFine || rowFines.length > 0,
    fineName: fineName || (rowFines.length > 0 ? rowFines.map((f) => f.name).join(" + ") : ""),
    fineAmount: fineAmount || (rowFines.length > 0 ? rowFines.reduce((s, f) => s + f.amount, 0) : 0),
    fines: rowFines.length > 0 ? rowFines : undefined,
    statusText,
  };
}

// Helper to resolve unit amount of a fine from GovernmentFine definitions or row details
export function getFineAmount(
  details: { fineName?: string; fineAmount?: number },
  finesList?: GovernmentFine[]
): number {
  if (details.fineAmount && details.fineAmount > 0) {
    return details.fineAmount;
  }
  if (!details.fineName) return 0;
  const raw = details.fineName.trim();
  const clean = raw.replace(/^غرامة\s+/, "").trim().toLowerCase();
  const match = finesList?.find((f) => {
    const fClean = (f.name || "").replace(/^غرامة\s+/, "").trim().toLowerCase();
    return fClean === clean || f.name.trim().toLowerCase() === raw.toLowerCase();
  });
  return match?.amount || 0;
}

// User explicit requirement:
// "عايز فى نهاية تفصيلة الكشف تحط الاجمالى حيث ياخد قيمة العادى وقيمة العاجل من الاعدادات نخصص لها قيمة وباقى الغرامات الموجودة تضرب فى قيمتها المسجلة من قبل فى بند الغرامات علشان يكون واضح فى نهاية الكشف"
export function computeAmanDetailedStats(
  rows: AmanRowItem[],
  invoices: Invoice[],
  services: Service[],
  governmentFines: GovernmentFine[] | undefined,
  normalPrice: number,
  urgentPrice: number
) {
  const activeRows = rows.filter((r) => r.arabicName && r.arabicName.trim().length > 0);
  let normalCount = 0;
  let urgentCount = 0;
  let finesCount = 0;
  let totalFinesAmount = 0;

  // Track fines grouped by name: count, unitPrice, totalAmount
  const fineGroups: Record<string, { name: string; count: number; unitPrice: number; totalAmount: number }> = {};

  activeRows.forEach((row) => {
    const details = resolveAmanDetails(row, invoices, services, governmentFines);
    if (details.serviceType === "عاجل" || (details.serviceType as any) === "مستعجل") {
      urgentCount++;
    } else {
      normalCount++;
    }

    if (details.hasFine) {
      // Multiple fines for the same person support
      if (details.fines && details.fines.length > 0) {
        details.fines.forEach((f) => {
          finesCount++;
          const cleanName = f.name.replace(/^(?:غرامة|غ)\s*/, "").trim();
          const displayName = `غ ${cleanName}`;
          const unitPrice = f.amount > 0 ? f.amount : getFineAmount({ fineName: cleanName }, governmentFines);

          if (!fineGroups[displayName]) {
            fineGroups[displayName] = { name: displayName, count: 0, unitPrice, totalAmount: 0 };
          }
          fineGroups[displayName].count++;
          fineGroups[displayName].totalAmount += unitPrice;
          totalFinesAmount += unitPrice;
        });
      } else {
        finesCount++;
        const rawName = (details.fineName || "حكومية").trim();
        const cleanName = rawName.replace(/^(?:غرامة|غ)\s*/, "").trim();
        const displayName = `غ ${cleanName}`;
        const unitPrice = getFineAmount(details, governmentFines);

        if (!fineGroups[displayName]) {
          fineGroups[displayName] = { name: displayName, count: 0, unitPrice, totalAmount: 0 };
        }
        fineGroups[displayName].count++;
        fineGroups[displayName].totalAmount += unitPrice;
        totalFinesAmount += unitPrice;
      }
    }
  });

  const normalTotal = normalCount * normalPrice;
  const urgentTotal = urgentCount * urgentPrice;
  const grandTotal = normalTotal + urgentTotal + totalFinesAmount;

  // Grouped fines array
  const fineGroupsList = Object.values(fineGroups);

  // User explicit requirement:
  // "مش لازم توضح تكلفة كل غرامة الواحدة بكام انما اذكر نوع الغرامة ثم العدد ثم بين قوسين مبلغها الاجمالى زى بالظبط كما هو الحال فى الجواز العادى والعاجل"
  // Format: "غرامة المؤهل: 1 (450ج) | غرامة بدل فاقد: 1 (550ج)"
  const finesDetailedList = fineGroupsList
    .map((g) => `${g.name}: ${g.count} (${g.totalAmount.toLocaleString()}ج)`)
    .join(" | ");

  const finesPrintSummary = fineGroupsList
    .map((g) => `${g.name}: ${g.count} (${g.totalAmount.toLocaleString()}ج)`)
    .join(" | ");

  const finesShortText = fineGroupsList
    .map((g) => `${g.name}: ${g.count}`)
    .join("، ");

  return {
    totalActive: activeRows.length,
    normalCount,
    normalPrice,
    normalTotal,
    urgentCount,
    urgentPrice,
    urgentTotal,
    finesCount,
    totalFinesAmount,
    fineGroups,
    fineGroupsList,
    finesDetailedList,
    finesPrintSummary,
    finesShortText,
    grandTotal,
  };
}

export default function AmanReport({ 
  invoices, 
  services, 
  activeEmployee, 
  settings, 
  onInvoiceUpdated, 
  onInvoiceCreated,
  governmentFines,
  onSettingsUpdated
}: AmanReportProps) {
  // Date filters: from and to
  const todayStr = new Date().toISOString().split("T")[0];
  const [dateFrom, setDateFrom] = useState(todayStr);
  const [dateTo, setDateTo] = useState(todayStr);

  // Quick Stock Management Modal state in Aman Report
  const [isStockModalOpen, setIsStockModalOpen] = useState(false);
  const [stockAddNormalInput, setStockAddNormalInput] = useState<number | "">("");
  const [stockAddUrgentInput, setStockAddUrgentInput] = useState<number | "">("");
  const [stockAddNotesInput, setStockAddNotesInput] = useState("");
  const [stockModalFeedback, setStockModalFeedback] = useState("");
  const [stockModalLoading, setStockModalLoading] = useState(false);

  // Auto-save feedback message
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingSheets, setIsLoadingSheets] = useState(false);
  const [isRefreshingFromInvoices, setIsRefreshingFromInvoices] = useState(false);
  const [sheetFetchError, setSheetFetchError] = useState<string | null>(null);

  // Postponed names state (User requirement: قص وحفظ في ورقة خاصة وإدراج لاحقاً)
  const [postponedList, setPostponedList] = useState<AmanPostponedItem[]>([]);
  const [isPostponedModalOpen, setIsPostponedModalOpen] = useState(false);
  const [targetInsertRowIndex, setTargetInsertRowIndex] = useState<number | null>(null);
  const [postponedSearchQuery, setPostponedSearchQuery] = useState("");
  const [isLoadingPostponed, setIsLoadingPostponed] = useState(false);
  const [deleteAfterInsert, setDeleteAfterInsert] = useState(true);

  // Manual save tracking (User requirement: الحفظ بزر مخصص بعد الانتهاء وليس لحظياً بمجرد الخروج من الخلية)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Print Date Dialog states (User requirement: قبل الطباعة يسأل عن تاريخ اليوم أو تاريخ مخصص يحدده يدوياً)
  const [isPrintDateModalOpen, setIsPrintDateModalOpen] = useState(false);
  const [printDateMode, setPrintDateMode] = useState<"today" | "custom">("today");
  const [customPrintDate, setCustomPrintDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split("T")[0];
  });
  const [selectedPrintDateHeader, setSelectedPrintDateHeader] = useState<string>(() => {
    return new Date().toISOString().split("T")[0].replace(/-/g, "/");
  });

  // Load postponed names on mount
  useEffect(() => {
    fetchPostponedAmanNames()
      .then((items) => {
        if (Array.isArray(items)) setPostponedList(items);
      })
      .catch((err) => console.warn("Failed to load postponed list:", err));
  }, []);

  const reportPrintRef = useRef<HTMLDivElement>(null);

  // Universal clean birth date formatter
  const formatCleanBirthDate = (val: any): string => {
    if (!val) return "";
    let s = String(val).trim();
    if (!s || s === "N/A" || s === "null" || s === "undefined") return "";

    // If GMT timestamp string e.g. "Tue Aug 15 1995 00:00:00 GMT+0300..."
    if (s.includes("GMT") || /^[A-Za-z]{3}\s+[A-Za-z]{3}/.test(s)) {
      const d = new Date(s);
      if (!isNaN(d.getTime())) {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        return `${y}/${m}/${day}`;
      }
    }

    // If ISO string like "1995-08-15T..."
    const isoMatch = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if (isoMatch) {
      return `${isoMatch[1]}/${isoMatch[2].padStart(2, "0")}/${isoMatch[3].padStart(2, "0")}`;
    }

    // If DD-MM-YYYY or DD/MM/YYYY
    const dmyMatch = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
    if (dmyMatch) {
      return `${dmyMatch[3]}/${dmyMatch[2].padStart(2, "0")}/${dmyMatch[1].padStart(2, "0")}`;
    }

    // If 14 digit National ID
    const cleanDigits = s.replace(/\D/g, "");
    if (cleanDigits.length === 14) {
      const century = parseInt(cleanDigits[0]);
      const yy = cleanDigits.substring(1, 3);
      const mm = cleanDigits.substring(3, 5);
      const dd = cleanDigits.substring(5, 7);
      const year = (century === 3 ? 2000 : 1900) + parseInt(yy);
      return `${year}/${mm}/${dd}`;
    }

    return s;
  };

  const extractBirthDate = (birthDate?: string, nationalId?: string): string => {
    if (birthDate && birthDate.trim() && birthDate !== "N/A") {
      return formatCleanBirthDate(birthDate);
    }
    if (nationalId && nationalId.length >= 7) {
      return formatCleanBirthDate(nationalId);
    }
    return "";
  };

  // Extract base customers from invoices as fallback if Google Sheets is not yet connected
  const baseCustomers = useMemo(() => {
    const list: AmanRowItem[] = [];
    const fromYMD = normalizeDateToYMD(dateFrom);
    const toYMD = normalizeDateToYMD(dateTo);

    invoices.forEach((inv) => {
      // Filter by date range (from and to) using normalized date
      const invYMD = normalizeDateToYMD(inv.date);
      if (fromYMD && toYMD && invYMD) {
        if (invYMD < fromYMD || invYMD > toYMD) return;
      }

      inv.customers.forEach((cust, cIdx) => {
        const amanService = cust.services.find((s) => {
          const srvId = String(s.serviceId || "").trim();
          const matched = services.find((srv) => srv.id === srvId || srv.name === srvId);
          const fullName = matched?.name || srvId;
          return fullName.startsWith("#") && !fullName.startsWith("##");
        });

        if (amanService) {
          const srvId = String(amanService.serviceId || "").trim();
          const matched = services.find((srv) => srv.id === srvId || srv.name === srvId);
          const fullName = matched?.name || srvId;
          const isUrgent = fullName.includes("مستعجل") || fullName.includes("عاجل") || fullName.includes("فورى");
          const hasFine = !!(amanService.fineName && amanService.fineName.trim().length > 0) || !!(amanService.fineAmount && amanService.fineAmount > 0);

          list.push({
            id: `inv-${inv.invoiceId}-c-${cIdx}`,
            arabicName: cust.arabicName || "",
            birthDate: extractBirthDate(cust.birthDate, cust.nationalId),
            notes: amanService.notes || "",
            date: inv.date,
            invoiceId: inv.invoiceId,
            customerIndex: cIdx,
            serviceType: isUrgent ? "مستعجل" : "عادي",
            hasFine,
            fineName: amanService.fineName || "",
            fineAmount: amanService.fineAmount || 0,
          });
        }
      });
    });

    return list;
  }, [invoices, dateFrom, dateTo, services]);

  // Table rows loaded and maintained directly from Google Sheets
  const [tableRows, setTableRows] = useState<AmanRowItem[]>([]);

  // Track original values to detect real changes onBlur
  const originalValuesRef = useRef<Map<string, { arabicName: string; birthDate: string; notes: string }>>(new Map());

  // Function to load data directly from the dedicated Aman Sheet / Database
  // User explicit requirement:
  // "عايز بيانات ومحتوى كشف امان تجيبة من ورقة الشيت الخاصة والمسجل بها الكشف وليس من بيانات الفاتورة نفسها"
  const loadDataFromDedicatedSheet = useCallback(async (isSilent = false) => {
    if (!isSilent) setIsLoadingSheets(true);
    setSheetFetchError(null);

    try {
      const webhookUrl = settings?.googleSheetWebhookUrl;
      let loadedRows: any[] = [];

      // 1. Try fetching from Google Sheet dedicated tab if webhook is configured
      if (webhookUrl && webhookUrl.startsWith("http")) {
        try {
          const res = await fetchAmanReportFromGoogleSheets({
            dateFrom,
            dateTo,
            webhookUrl,
          });
          if (res && Array.isArray(res.rows) && res.rows.length > 0) {
            loadedRows = res.rows;
          }
        } catch (sheetErr: any) {
          console.warn("Google Sheet pull notice:", sheetErr.message);
        }
      }

      // 2. If Google Sheet tab was empty or webhook not configured, load from dedicated server database
      if (loadedRows.length === 0) {
        const localRows = await fetchLocalAmanReport().catch(() => []);
        if (Array.isArray(localRows) && localRows.length > 0) {
          const fromYMD = normalizeDateToYMD(dateFrom);
          const toYMD = normalizeDateToYMD(dateTo);
          loadedRows = localRows.filter((r: any) => {
            if (!r.date) return true;
            const rYMD = normalizeDateToYMD(r.date);
            if (!rYMD) return true;
            return rYMD >= fromYMD && rYMD <= toYMD;
          });
        }
      }

      // 3. Only if both dedicated sheet and database are empty (first time run), fallback to base customers
      if (loadedRows.length === 0 && baseCustomers.length > 0) {
        loadedRows = baseCustomers;
      }

      const processed: AmanRowItem[] = loadedRows.map((row, idx) => {
        const details = resolveAmanDetails(row, invoices, services, governmentFines);
        return {
          id: row.id || `sheet-${idx}`,
          arabicName: row.arabicName || "",
          birthDate: formatCleanBirthDate(row.birthDate),
          notes: details.statusText,
          date: row.date || dateFrom,
          invoiceId: row.invoiceId,
          customerIndex: row.customerIndex,
          isCustomManual: !row.invoiceId,
          serviceType: details.serviceType,
          hasFine: details.hasFine,
          fineName: details.fineName,
          fineAmount: details.fineAmount,
          passportSerial: row.passportSerial || "",
        };
      });

      setTableRows(processed);
      setHasUnsavedChanges(false);

      if (!isSilent && processed.length > 0) {
        setSaveStatus(`تم تحميل ${processed.length} عميل من ورقة كشف أمان المخصصة بنجاح 📊📥`);
        setTimeout(() => setSaveStatus(null), 3500);
      }
    } catch (err: any) {
      console.warn("Load dedicated Aman sheet error:", err.message);
      setSheetFetchError(err.message || "تعذر جلب بيانات كشف أمان");
    } finally {
      setIsLoadingSheets(false);
    }
  }, [dateFrom, dateTo, settings?.googleSheetWebhookUrl, baseCustomers, invoices, services, governmentFines]);

  // Load from dedicated sheet upon opening or date change
  useEffect(() => {
    loadDataFromDedicatedSheet();
  }, [dateFrom, dateTo, loadDataFromDedicatedSheet]);

  // Rows per official A4 print page
  const ROWS_PER_PAGE = 35;
  const totalPages = Math.max(1, Math.ceil(tableRows.length / ROWS_PER_PAGE));
  const totalAllocatedRows = totalPages * ROWS_PER_PAGE;

  // Complete rows array padded with empty editable rows up to totalAllocatedRows
  const displayRows: AmanRowItem[] = useMemo(() => {
    const list = [...tableRows];
    while (list.length < totalAllocatedRows) {
      const idx = list.length;
      list.push({
        id: `empty-row-${idx}`,
        arabicName: "",
        birthDate: "",
        notes: "",
        passportSerial: "",
        date: dateFrom,
        isCustomManual: true,
      });
    }
    return list;
  }, [tableRows, totalAllocatedRows, dateFrom]);

  // Detect English characters typed into the Arabic Name cell
  const englishRowsIndices = useMemo(() => {
    const list: number[] = [];
    displayRows.forEach((r, idx) => {
      if (/[a-zA-Z]/.test(r.arabicName)) {
        list.push(idx + 1);
      }
    });
    return list;
  }, [displayRows]);

  const hasEnglishInRows = englishRowsIndices.length > 0;

  // Play audible alert chime whenever English characters are detected in Arabic fields
  useEffect(() => {
    if (hasEnglishInRows) {
      playLanguageWarningSound();
    }
  }, [hasEnglishInRows, englishRowsIndices.length]);

  const showSaveNotice = (msg: string) => {
    setSaveStatus(msg);
    setTimeout(() => {
      setSaveStatus((current) => (current === msg ? null : current));
    }, 4000);
  };

  // Handle cell edit
  const handleCellChange = (rowIndex: number, field: "arabicName" | "birthDate" | "notes" | "passportSerial", value: string) => {
    if (field === "arabicName" && /[a-zA-Z]/.test(value)) {
      playLanguageWarningSound();
    }

    // Limit passport serial to 8 numeric digits
    let sanitizedValue = value;
    if (field === "passportSerial") {
      sanitizedValue = value.replace(/\D/g, "").slice(0, 8);
    }

    setHasUnsavedChanges(true);

    setTableRows((prev) => {
      const copy = [...prev];
      // Expand if typing in an empty padded slot beyond tableRows
      while (copy.length <= rowIndex) {
        copy.push({
          id: `manual-${Date.now()}-${copy.length}`,
          arabicName: "",
          birthDate: "",
          notes: "",
          passportSerial: "",
          date: dateFrom,
          isCustomManual: true,
        });
      }
      copy[rowIndex] = {
        ...copy[rowIndex],
        [field]: sanitizedValue,
      };
      return copy;
    });
  };

  // User explicit requirement:
  // "عايز طريقة الحفظ فى شيت امان متكونش لحظية ومتكونش مجرد الخروج من الخلية انما الحفظ يكون بتخصيص زرار للحفظ بعد ما اخلص كل المطلوب اضغط حفظ"
  // "اى تعديل فى ورقة امان سواء حذف او ترحيل او استدعاء بيتم من الورقة المخصصة لشيت امان وليس من الفاتورة نفسها فى كل مرة"
  const handleCellBlur = (_rowIndex: number) => {
    // No auto-save on blur. Edits remain in state until user clicks the dedicated Save button.
  };

  // Dedicated Save Aman Sheet Handler:
  const handleSaveAmanSheet = async () => {
    setIsSaving(true);
    try {
      const activeRowsToRecord = tableRows
        .filter((r) => r.arabicName && r.arabicName.trim().length > 0)
        .map((r, idx) => {
          const det = resolveAmanDetails(r, invoices, services, governmentFines);
          return {
            ...r,
            birthDate: formatCleanBirthDate(r.birthDate),
            notes: det.statusText,
            passportSerial: r.passportSerial || "",
            serviceType: det.serviceType,
            hasFine: det.hasFine,
            fineName: det.fineName,
            fineAmount: det.fineAmount,
            index: idx + 1,
          };
        });

      // 1. Save both active rows and postponed list in server database
      await saveLocalAmanReport(activeRowsToRecord, true, postponedList);

      // 2. Sync to Google Sheets dedicated tab if webhook configured
      if (settings?.googleSheetWebhookUrl) {
        try {
          await syncAmanReportToGoogleSheets({
            dateFrom,
            dateTo,
            amanRows: activeRowsToRecord,
            webhookUrl: settings.googleSheetWebhookUrl,
          });
        } catch (syncErr: any) {
          console.warn("Aman Sheet direct push notice:", syncErr);
        }
      }

      setHasUnsavedChanges(false);
      showSaveNotice(`تم حفظ وتحديث كشف أمان وقائمة الأسماء المرحلة في ورقة الشيت بنجاح (${activeRowsToRecord.length} عميل) 💾✅`);
    } catch (err: any) {
      console.error("Save aman sheet failed:", err);
      showSaveNotice(`خطأ أثناء حفظ كشف أمان: ${err.message} ⚠️`);
    } finally {
      setIsSaving(false);
    }
  };

  // User explicit requirement:
  // "بالنسبة لشيت امان عايز زرار تحديث من شيت امان يجلب بياناتة من الفواتير نفسها علشان يعمل تحديث لو حصل تغيير بالفاتورة"
  const handleRefreshFromInvoices = async () => {
    setIsRefreshingFromInvoices(true);
    try {
      // 1. Fetch fresh invoices from the server to guarantee we have latest edits across all sessions
      let freshInvoices = invoices;
      try {
        const dbPayload = await fetchDB();
        if (dbPayload && Array.isArray(dbPayload.invoices) && dbPayload.invoices.length > 0) {
          freshInvoices = dbPayload.invoices;
        }
      } catch (err) {
        console.warn("Could not fetch fresh DB, falling back to props invoices:", err);
      }

      const fromYMD = normalizeDateToYMD(dateFrom);
      const toYMD = normalizeDateToYMD(dateTo);

      // 2. Extract customers with # passport services matching the date filter
      const invoiceAmanItems: AmanRowItem[] = [];
      const invoiceAmanMap = new Map<string, AmanRowItem>();

      freshInvoices.forEach((inv) => {
        const invYMD = normalizeDateToYMD(inv.date);
        if (fromYMD && toYMD && invYMD) {
          if (invYMD < fromYMD || invYMD > toYMD) return;
        }

        if (!Array.isArray(inv.customers)) return;

        inv.customers.forEach((cust, cIdx) => {
          if (!cust.services || !Array.isArray(cust.services)) return;

          const amanService = cust.services.find((s) => {
            const srvId = String(s.serviceId || "").trim();
            const matched = services.find((srv) => srv.id === srvId || srv.name === srvId);
            const fullName = matched?.name || srvId;
            return fullName.startsWith("#") && !fullName.startsWith("##");
          });

          if (amanService) {
            const srvId = String(amanService.serviceId || "").trim();
            const matched = services.find((srv) => srv.id === srvId || srv.name === srvId);
            const fullName = matched?.name || srvId;
            const isUrgent = fullName.includes("مستعجل") || fullName.includes("عاجل") || fullName.includes("فورى");
            const hasFine = !!(amanService.fineName && amanService.fineName.trim().length > 0) || !!(amanService.fineAmount && amanService.fineAmount > 0);

            let finePart = "";
            if (hasFine) {
              const cleanName = (amanService.fineName || "").trim() || "غرامة حكومية";
              finePart = cleanName.startsWith("غرامة") ? cleanName : `غرامة ${cleanName}`;
            }
            const noteText = finePart ? `${isUrgent ? "مستعجل" : "عادي"} - ${finePart}` : (isUrgent ? "مستعجل" : "عادي");

            const item: AmanRowItem = {
              id: `inv-${inv.invoiceId}-c-${cIdx}`,
              arabicName: cust.arabicName || "",
              birthDate: extractBirthDate(cust.birthDate, cust.nationalId),
              notes: noteText,
              date: inv.date,
              invoiceId: inv.invoiceId,
              customerIndex: cIdx,
              serviceType: isUrgent ? "مستعجل" : "عادي",
              hasFine,
              fineName: amanService.fineName || "",
              fineAmount: amanService.fineAmount || 0,
            };

            const key = `${inv.invoiceId}-${cIdx}`;
            invoiceAmanMap.set(key, item);
            invoiceAmanItems.push(item);
          }
        });
      });

      // 3. Merge: Update existing rows in tableRows that match invoices, keep manual rows, add any new invoices
      let updatedCount = 0;
      let newCount = 0;
      const matchedKeys = new Set<string>();

      const mergedRows: AmanRowItem[] = tableRows.map((row) => {
        if (row.invoiceId) {
          const key = `${row.invoiceId}-${row.customerIndex ?? 0}`;
          let fresh = invoiceAmanMap.get(key);

          // Fallback matching by invoiceId and trimmed arabicName if index shifted
          if (!fresh && row.arabicName) {
            fresh = invoiceAmanItems.find(
              (item) => item.invoiceId === row.invoiceId && item.arabicName.trim() === row.arabicName.trim()
            );
          }

          if (fresh) {
            matchedKeys.add(`${fresh.invoiceId}-${fresh.customerIndex ?? 0}`);
            updatedCount++;
            return {
              ...row,
              arabicName: fresh.arabicName,
              birthDate: fresh.birthDate,
              notes: fresh.notes,
              date: fresh.date,
              serviceType: fresh.serviceType,
              hasFine: fresh.hasFine,
              fineName: fresh.fineName,
              fineAmount: fresh.fineAmount,
            };
          }
        }
        return row;
      });

      // Append any invoice customers from the date range that aren't in tableRows yet
      invoiceAmanItems.forEach((item) => {
        const key = `${item.invoiceId}-${item.customerIndex ?? 0}`;
        if (!matchedKeys.has(key)) {
          const exists = mergedRows.some(
            (r) => r.invoiceId === item.invoiceId && (r.customerIndex === item.customerIndex || r.arabicName.trim() === item.arabicName.trim())
          );
          if (!exists) {
            mergedRows.push(item);
            newCount++;
          }
        }
      });

      // If tableRows was completely empty, populate with all items from invoices
      const finalRows = mergedRows.length > 0 ? mergedRows : invoiceAmanItems;
      const cleanedFinalRows = finalRows.map((r) => ({
        ...r,
        birthDate: formatCleanBirthDate(r.birthDate),
      }));

      setTableRows(cleanedFinalRows);

      // Save to local database
      await saveLocalAmanReport(cleanedFinalRows, true);

      // Sync to Google Sheets if connected
      if (settings?.googleSheetWebhookUrl) {
        try {
          await syncAmanReportToGoogleSheets({
            dateFrom,
            dateTo,
            amanRows: cleanedFinalRows,
            webhookUrl: settings.googleSheetWebhookUrl,
          });
        } catch (syncErr: any) {
          console.warn("Google Sheet sync notice during refresh from invoices:", syncErr);
        }
      }

      setHasUnsavedChanges(false);
      showSaveNotice(
        `تم تحديث كشف أمان مباشرة من بيانات الفواتير بنجاح! 🔄 (${updatedCount} اسم تم تحديث بياناتهم${newCount > 0 ? `، و ${newCount} اسم جديد أُضيف للكشف` : ""})`
      );
    } catch (err: any) {
      console.error("Refresh Aman from invoices failed:", err);
      showSaveNotice(`خطأ أثناء التحديث من الفواتير: ${err.message} ⚠️`);
    } finally {
      setIsRefreshingFromInvoices(false);
    }
  };

  // Add an empty row for quick entry
  const handleAddNewRow = () => {
    setTableRows((prev) => [
      ...prev,
      {
        id: `manual-new-${Date.now()}`,
        arabicName: "",
        birthDate: "",
        notes: "",
        date: dateFrom,
        isCustomManual: true,
      },
    ]);
    setHasUnsavedChanges(true);
    showSaveNotice("تمت إضافة سطر جديد للكشف. اكتب البيانات ثم اضغط 'حفظ التغييرات في كشف أمان' 💾");
  };

  // User explicit requirement:
  // "فى كشف امان عند ترحيل اسم لا يتم نقلة فعليا من ورقة الشيت وترحيلة الى ورقة الاسماء المرحلة"
  // "عمود الملاحظات لا تضع به المهنة وفى حالة عدم وجود غرامات لا تكتب لا توجد غرامة حيث الطبيعى طالما مفيش غرامة لا يذكر لها اسم وتكتب فقط الغرامة فى حالة تواجدها"
  const handleCutRow = async (rowIndex: number) => {
    const row = displayRows[rowIndex];
    if (!row || !row.arabicName.trim()) {
      return;
    }

    const cutName = row.arabicName.trim();
    const cutBirthDate = formatCleanBirthDate(row.birthDate);
    const details = resolveAmanDetails(row, invoices, services, governmentFines);
    // Exact note text: NO profession, NO "لا توجد غرامة"
    const cutNotes = details.statusText;

    const newPostponedItem: AmanPostponedItem = {
      id: `postponed-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      arabicName: cutName,
      birthDate: cutBirthDate,
      notes: cutNotes,
      passportSerial: row.passportSerial || "",
      originalDate: row.date || dateFrom || todayStr,
      postponedAt: new Date().toLocaleString("ar-EG"),
      invoiceId: row.invoiceId,
      serviceType: details.serviceType,
      fineName: details.fineName,
      fineAmount: details.fineAmount,
      status: "مؤجل",
    };

    const updatedPostponed = [newPostponedItem, ...postponedList];
    setPostponedList(updatedPostponed);

    // Remove this row completely from tableRows so all subsequent rows are shifted up!
    const newTableRows = [...tableRows];
    const matchIdx = newTableRows.findIndex(r => r.id === row.id || (r.arabicName?.trim() === cutName && r.birthDate === cutBirthDate));
    if (matchIdx !== -1) {
      newTableRows.splice(matchIdx, 1);
    } else if (rowIndex < newTableRows.length) {
      newTableRows.splice(rowIndex, 1);
    }
    setTableRows(newTableRows);

    // User explicit requirement:
    // "فى كشف امان عايز لما اعمل قص وترحيل او استرجاع لاتقم بالتحديث اللحظى انما اظهر زرار حفظ التغيرات فى كشف زى بالظبط لما بضيف اسم او امسح اسم فى نهاية التعديلات اضغط باليد على زرار حفظ التغيرات فى كشف امان"
    setHasUnsavedChanges(true);
    showSaveNotice(`تم قص (${cutName}) ونقله للمؤجلين مؤقتاً ✂️. اضغط "حفظ التغييرات في كشف أمان 💾" بعد الانتهاء لتثبيت الكشف والشيت.`);
  };

  // User explicit requirement:
  // "والزرار الثانى لادراج اسم من الاسماء المرحلة دى يقوم باظهار بيانات الاسماء وتاريخ الميلاد المحفوظين بورقة الاكسيل وانا اختار منهم اللى احتاجه يتحط بالكشف"
  const handleOpenInsertModal = (rowIndex: number | null) => {
    setTargetInsertRowIndex(rowIndex);
    setIsPostponedModalOpen(true);
  };

  const handleInsertPostponedItem = async (item: AmanPostponedItem) => {
    const details = {
      serviceType: item.serviceType || "عادي",
      fineName: item.fineName || "",
      fineAmount: item.fineAmount || 0,
      hasFine: !!(item.fineName || (item.fineAmount && item.fineAmount > 0)),
    };
    const cleanFineName = details.fineName;
    const fineLabel = details.hasFine
      ? (cleanFineName ? (cleanFineName.startsWith("غ") ? cleanFineName : `غ ${cleanFineName.replace(/^غرامة\s*/, "")}`) : "غ حكومية")
      : "";
    const noteText = fineLabel ? `${details.serviceType} - ${fineLabel}` : details.serviceType;

    const newRow: AmanRowItem = {
      id: `manual-${Date.now()}`,
      arabicName: item.arabicName,
      birthDate: formatCleanBirthDate(item.birthDate),
      notes: noteText,
      passportSerial: item.passportSerial || "",
      date: dateFrom,
      invoiceId: item.invoiceId,
      serviceType: details.serviceType as any,
      fineName: details.fineName,
      fineAmount: details.fineAmount,
      hasFine: details.hasFine,
      isCustomManual: true,
    };

    let updatedRows = [...tableRows];
    if (targetInsertRowIndex !== null && targetInsertRowIndex < updatedRows.length) {
      if (!updatedRows[targetInsertRowIndex].arabicName.trim()) {
        updatedRows[targetInsertRowIndex] = newRow;
      } else {
        updatedRows.splice(targetInsertRowIndex, 0, newRow);
      }
    } else {
      updatedRows.push(newRow);
    }
    setTableRows(updatedRows);

    let updatedPostponed = postponedList;
    if (deleteAfterInsert) {
      updatedPostponed = postponedList.filter((p) => p.id !== item.id);
      setPostponedList(updatedPostponed);
    }

    setIsPostponedModalOpen(false);
    setTargetInsertRowIndex(null);

    // User explicit requirement:
    // "فى كشف امان عايز لما اعمل قص وترحيل او استرجاع لاتقم بالتحديث اللحظى انما اظهر زرار حفظ التغيرات فى كشف زى بالظبط لما بضيف اسم او امسح اسم فى نهاية التعديلات اضغط باليد على زرار حفظ التغيرات فى كشف امان"
    setHasUnsavedChanges(true);
    showSaveNotice(`تم استرجاع وإدراج (${item.arabicName}) في كشف أمان مؤقتاً 📥. اضغط "حفظ التغييرات في كشف أمان 💾" بعد الانتهاء لتثبيت الكشف والشيت.`);
  };

  const handleDeletePostponedItem = async (id: string, name: string) => {
    if (!window.confirm(`هل أنت متأكد من حذف (${name}) نهائياً من ورقة الأسماء المرحلة؟`)) return;
    const updated = postponedList.filter((p) => p.id !== id);
    setPostponedList(updated);
    try {
      await deletePostponedAmanName(id);
      if (settings?.googleSheetWebhookUrl) {
        syncPostponedAmanToGoogleSheets(updated, settings.googleSheetWebhookUrl).catch(() => {});
      }
      showSaveNotice(`تم حذف (${name}) من ورقة الأسماء المرحلة وتحديث الشيت`);
    } catch (err) {
      console.warn("Error deleting postponed item:", err);
    }
  };

  const handleRefreshPostponedFromSheets = async () => {
    setIsLoadingPostponed(true);
    try {
      const res = await pullPostponedAmanFromGoogleSheets(settings?.googleSheetWebhookUrl);
      if (res && Array.isArray(res.postponedRows)) {
        setPostponedList(res.postponedRows);
        showSaveNotice(`تم جلب وتحديث ${res.postponedRows.length} اسماً مرحلاً من جوجل شيت 📑📥`);
      }
    } catch (err: any) {
      console.warn("Error pulling postponed items:", err);
      showSaveNotice(`تعذر جلب البيانات من جوجل شيت: ${err.message}`);
    } finally {
      setIsLoadingPostponed(false);
    }
  };

  const handleExportPostponedToExcel = () => {
    if (postponedList.length === 0) {
      alert("لا توجد أسماء مرحلة لتصديرها.");
      return;
    }
    let csvContent = "\ufeff";
    csvContent += "قسم جوازات طنطا - قائمة الأسماء المرحلة مؤقتاً من كشف أمان\r\n";
    csvContent += `تاريخ التصدير: ${new Date().toLocaleDateString("ar-EG")}\r\n\r\n`;
    csvContent += "م,الاسم,تاريخ الميلاد,الملاحظات,تاريخ الكشف الأصلي,وقت الترحيل,رقم الفاتورة,الحالة,مسلسل الاستمارة\r\n";

    postponedList.forEach((item, idx) => {
      csvContent += `"${idx + 1}","${(item.arabicName || "").replace(/"/g, '""')}","${item.birthDate || ""}","${(item.notes || "").replace(/"/g, '""')}","${item.originalDate || ""}","${item.postponedAt || ""}","${item.invoiceId || ""}","${item.status || "مؤجل"}","${item.passportSerial || ""}"\r\n`;
    });

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `الأسماء_المرحلة_أمان_${todayStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Helper to format name with sequence number directly prefixed: e.g. "1- محمد شريف"
  // User explicit requirement: "بالنسبة لعامود مسلسل لا داعى منه ممكن الاستغناء عنة بكتابة العدد قبل الاسم مباشرة كمثال 1- محمد شريف ، توفيرا فى عرض الخلايا لاعطاء المساحة كافية"
  const formatNameWithNumber = (name: string, num: number): string => {
    const trimmed = (name || "").trim();
    if (!trimmed) return `${num}- `;
    const prefixRegex = new RegExp(`^${num}\\s*[\\-\\.]\\s*`, "i");
    if (prefixRegex.test(trimmed)) {
      return trimmed;
    }
    return `${num}- ${trimmed}`;
  };

  // Excel Export to CSV with columns (الاسم, تاريخ الميلاد, الملاحظات, مسلسل الاستمارة)
  const handleExportToExcel = () => {
    const activeRows = displayRows.filter((c) => c.arabicName.trim().length > 0);
    if (activeRows.length === 0) {
      alert("لا توجد بيانات لتصديرها للفترة المحددة.");
      return;
    }

    const todayDisplay = dateFrom === dateTo ? dateFrom : `من ${dateFrom} إلى ${dateTo}`;

    // Prepare CSV content with Arabic UTF-8 BOM
    let csvContent = "\ufeff";
    csvContent += "قسم جوازات طنطا - كشف حركة التابع للخدمات الجماهيرية\r\n";
    csvContent += `التاريخ: ${todayDisplay}\r\n\r\n`;
    csvContent += "الاسم,تاريخ الميلاد,الملاحظات,مسلسل الاستمارة\r\n";

    activeRows.forEach((cust, idx) => {
      const cleanName = cust.arabicName.replace(/,/g, " ");
      const formattedName = formatNameWithNumber(cleanName, idx + 1);
      const noteInfo = resolveAmanDetails(cust, invoices, services, governmentFines);
      const fullNote = noteInfo.statusText;
      const serial = cust.passportSerial || "";
      csvContent += `"${formattedName}","${cust.birthDate || ""}","${(fullNote || "").replace(/"/g, '""')}","${serial}"\r\n`;
    });

    csvContent += "\r\n,,,توقيع رئيس القسم\r\n";

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `كشف_حركة_الخدمات_الجماهيرية_${dateFrom}_${dateTo}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Canvas ref for exact measurement of text length in centimeters
  const measurementCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Dynamic font sizing for customer name:
  // User explicit requirement: "في حال تجاوز طول الاسم مقاس 10 سم، يبدأ التقليل التدريجي التلقائي بحيث يتضمن المقاس 10 سم الاسم بالكامل دون أي اقتطاع أو خروج عن الخلية"
  // Keep font size at default official 20px up to 10.0cm; start reducing only after strictly exceeding 10.0cm so the entire name fits within 10.0cm
  const getNameFontSize = (name: string): string => {
    if (!name || !name.trim()) return "20px";
    const clean = name.trim();

    // 1. Precise measurement via HTML Canvas (1cm = 37.79527559px at 96 DPI)
    if (typeof document !== "undefined") {
      try {
        if (!measurementCanvasRef.current) {
          measurementCanvasRef.current = document.createElement("canvas");
        }
        const ctx = measurementCanvasRef.current.getContext("2d");
        if (ctx) {
          ctx.font = "bold 20px 'Cairo', 'Segoe UI', Tahoma, Arial, sans-serif";
          const metrics = ctx.measureText(clean);
          const widthInCm = metrics.width / 37.79527559;

          // Do NOT reduce font size until length strictly exceeds 10.0 cm
          if (widthInCm <= 10.0) {
            return "20px";
          }
          // Proportionally scale down font size so the entire text fits within 10.0 cm
          const scaledSize = Math.max(11, Math.floor((10.0 / widthInCm) * 20 * 10) / 10);
          return `${scaledSize}px`;
        }
      } catch (e) {
        // Fallback below
      }
    }

    // 2. Character length fallback: at 20px Cairo bold, ~36 characters correspond to 10.0cm
    const len = clean.length;
    if (len <= 36) return "20px";
    const scaledSize = Math.max(11, Math.floor((36 / len) * 20 * 10) / 10);
    return `${scaledSize}px`;
  };

  // User explicit requirement:
  // "عايز قبل الضغط على زرار طباعه يسألنى عايز تظهر فى الورقة تاريخ اليوم فى الطباعه ام بتاريخ اخر لان اوقات بنحتاج طباعه الكشف وسنستخدمة بعد يوم او يومين"
  const handleOpenPrintModal = () => {
    setIsPrintDateModalOpen(true);
  };

  const handleConfirmPrint = (mode: "today" | "custom", customDateValue?: string) => {
    let headerValue = todayStr.replace(/-/g, "/");
    if (mode === "custom") {
      const selected = customDateValue || customPrintDate || todayStr;
      headerValue = selected.replace(/-/g, "/");
    } else {
      headerValue = todayStr.replace(/-/g, "/");
    }

    setSelectedPrintDateHeader(headerValue);
    setIsPrintDateModalOpen(false);

    // Give React a tick to update DOM with selectedPrintDateHeader
    setTimeout(() => {
      executePrint();
    }, 150);
  };

  // Direct print of the styled A4 pages
  const executePrint = () => {
    const printContent = reportPrintRef.current?.innerHTML;
    if (!printContent) return;

    // Create a temporary print container
    const printDiv = document.createElement("div");
    printDiv.id = "print-container-dynamic";
    printDiv.innerHTML = `
      <div style="direction: rtl; text-align: right; width: 100%; font-family: 'Cairo', sans-serif !important; background: white !important;">
        ${printContent}
      </div>
    `;

    // Add custom stylesheet specifically for dynamic A4 printing
    const style = document.createElement("style");
    style.id = "print-stylesheet-dynamic";
    style.innerHTML = `
      @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@700;800&display=swap');
      @page {
        size: A4 portrait;
        margin: 5mm 8mm;
      }
      @media print {
        html, body {
          margin: 0 !important;
          padding: 0 !important;
          background: white !important;
          font-family: 'Cairo', sans-serif !important;
        }
        body > *:not(#print-container-dynamic) {
          display: none !important;
        }
        #print-container-dynamic {
          display: block !important;
          width: 100% !important;
          margin: 0 !important;
          padding: 0 !important;
          background: white !important;
          color: black !important;
          direction: rtl !important;
          text-align: right !important;
          font-family: 'Cairo', sans-serif !important;
        }
        .a4-print-page {
          page-break-after: always !important;
          break-after: page !important;
          box-shadow: none !important;
          border: none !important;
          background: white !important;
          width: 100% !important;
          max-height: 285mm !important;
          height: 285mm !important;
          display: flex !important;
          flex-direction: column !important;
          justify-content: space-between !important;
          box-sizing: border-box !important;
          margin: 0 !important;
          padding: 2mm 0 !important;
          overflow: hidden !important;
          font-family: 'Cairo', sans-serif !important;
        }
        .a4-print-page:last-child {
          page-break-after: avoid !important;
          break-after: avoid !important;
        }
        table {
          border-collapse: collapse !important;
          width: 100% !important;
          border: 2px solid black !important;
          font-family: 'Cairo', sans-serif !important;
        }
        tr {
          height: 7.1mm !important;
          max-height: 7.1mm !important;
          box-sizing: border-box !important;
        }
        th, td {
          border: 1px solid black !important;
          padding: 0 4px !important;
          font-family: 'Cairo', sans-serif !important;
          font-weight: 700 !important;
          line-height: 1.1 !important;
          vertical-align: middle !important;
        }
        .notes-light-gray {
          color: #9ca3af !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
          font-weight: 600 !important;
          font-size: 12.5px !important;
        }
        .print\\:hidden {
          display: none !important;
        }
        .print\\:inline-block {
          display: inline-block !important;
        }
        input {
          border: none !important;
          outline: none !important;
          background: transparent !important;
          box-shadow: none !important;
          padding: 0 !important;
          font-family: 'Cairo', sans-serif !important;
          font-weight: 700 !important;
          color: black !important;
          width: 100% !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        input::placeholder {
          color: transparent !important;
        }
        * {
          font-family: 'Cairo', sans-serif !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
      }
    `;

    document.head.appendChild(style);
    document.body.appendChild(printDiv);

    // Call native window print directly on the current window
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

  // Header display string based on chosen dates
  const headerDateDisplay = dateFrom === dateTo ? dateFrom : `من ${dateFrom} إلى ${dateTo}`;

  // Count active non-empty names
  const activeCount = displayRows.filter((r) => r.arabicName.trim().length > 0).length;

  // Aman pricing from Settings (User requirement: يأخذ قيمة العادي وقيمة العاجل من الإعدادات وباقي الغرامات تضرب في قيمتها المسجلة في بند الغرامات)
  const normalPrice = typeof settings?.amanNormalPrice === "number" && settings.amanNormalPrice > 0 
    ? settings.amanNormalPrice 
    : 1200;
  const urgentPrice = typeof settings?.amanUrgentPrice === "number" && settings.amanUrgentPrice > 0 
    ? settings.amanUrgentPrice 
    : 1400;

  // Breakdown statistics for each printed page
  const pageStats = useMemo(() => {
    return Array.from({ length: totalPages }).map((_, pageIdx) => {
      const startIdx = pageIdx * ROWS_PER_PAGE;
      const pageCustomers = displayRows.slice(startIdx, startIdx + ROWS_PER_PAGE);
      return computeAmanDetailedStats(pageCustomers, invoices, services, governmentFines, normalPrice, urgentPrice);
    });
  }, [totalPages, displayRows, invoices, services, governmentFines, normalPrice, urgentPrice]);

  // Overall report statistics across all pages
  const overallStats = useMemo(() => {
    return computeAmanDetailedStats(displayRows, invoices, services, governmentFines, normalPrice, urgentPrice);
  }, [displayRows, invoices, services, governmentFines, normalPrice, urgentPrice]);

  // User explicit requirement:
  // "عايز اعمل مخزون للاستمارت يعنى مكان اسجل فية عدد الاستمارات المخزنة استمارات العاجل عددها واستمارات العادى عددها وامكانية اضافة استمارات اضافية يوميا علشان كل يوم بنستلم استمارات جديدة
  // وسطر تفصيلة الكشف اللى فى نهاية الكشف عايز يضاف سطر تحتة يوضح المخزون الحالى المتبقى لدينا استمارات عاجل كذا عادى كذا لان فواتير الجوازات التى تبتدى بعلامة # الموجودة بكشف امان سيتم خصم عدد المستخدم من مخزون الاستمارات كلا على حسب العادى والعاجل"
  const formsStockStats = useMemo(() => {
    const stockConfig = settings?.passportFormsStock || { normalTotalReceived: 0, urgentTotalReceived: 0 };
    const normalReceived = Number(stockConfig.normalTotalReceived) || 0;
    const urgentReceived = Number(stockConfig.urgentTotalReceived) || 0;

    // 1. Used count in the CURRENT displayed Aman report sheet (date filter)
    const reportNormalUsed = overallStats.normalCount;
    const reportUrgentUsed = overallStats.urgentCount;

    // 2. Cumulative ALL passport operations executed across all invoices in the system (#)
    let allNormalUsed = 0;
    let allUrgentUsed = 0;
    const countedInvoicesSet = new Set<number>();

    if (Array.isArray(invoices)) {
      invoices.forEach((inv) => {
        if (!inv || !Array.isArray(inv.customers)) return;
        countedInvoicesSet.add(inv.invoiceId);
        inv.customers.forEach((cust) => {
          if (!cust || !Array.isArray(cust.services)) return;
          cust.services.forEach((s) => {
            const srvId = String(s.serviceId || "").trim();
            const matched = services.find((srv) => srv.id === srvId || srv.name === srvId);
            const fullName = matched?.name || srvId;
            if (fullName.startsWith("#") && !fullName.startsWith("##")) {
              const isUrgent = fullName.includes("مستعجل") || fullName.includes("عاجل") || fullName.includes("فورى");
              const qty = Number(s.quantity) || 1;
              if (isUrgent) {
                allUrgentUsed += qty;
              } else {
                allNormalUsed += qty;
              }
            }
          });
        });
      });
    }

    // 3. Plus any custom/manual rows in tableRows that were added directly or loaded from sheet without an invoiceId
    if (Array.isArray(tableRows)) {
      tableRows.forEach((r) => {
        if (!r.arabicName || !r.arabicName.trim()) return;
        if (r.invoiceId && countedInvoicesSet.has(r.invoiceId)) return; // Avoid double counting
        const details = resolveAmanDetails(r, invoices, services, governmentFines);
        if (details.serviceType === "عاجل" || (details.serviceType as any) === "مستعجل") {
          allUrgentUsed += 1;
        } else {
          allNormalUsed += 1;
        }
      });
    }

    // Cumulative remaining stock:
    const normalRemaining = normalReceived > 0 ? normalReceived - allNormalUsed : (allNormalUsed > 0 ? -allNormalUsed : 0);
    const urgentRemaining = urgentReceived > 0 ? urgentReceived - allUrgentUsed : (allUrgentUsed > 0 ? -allUrgentUsed : 0);

    return {
      normalReceived,
      urgentReceived,
      reportNormalUsed,
      reportUrgentUsed,
      allNormalUsed,
      allUrgentUsed,
      normalUsed: allNormalUsed,
      urgentUsed: allUrgentUsed,
      normalRemaining,
      urgentRemaining,
      isConfigured: normalReceived > 0 || urgentReceived > 0,
    };
  }, [settings?.passportFormsStock, overallStats.normalCount, overallStats.urgentCount, invoices, services, tableRows, governmentFines]);

  // Handler to add or save forms stock directly from Aman Report
  const handleSaveStockFromAman = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const addN = Number(stockAddNormalInput) || 0;
    const addU = Number(stockAddUrgentInput) || 0;
    if (addN === 0 && addU === 0) return;

    setStockModalLoading(true);
    setStockModalFeedback("");
    try {
      const currentStock = settings?.passportFormsStock || {
        normalTotalReceived: 0,
        urgentTotalReceived: 0,
        logs: [],
      };
      const today = new Date().toISOString().split("T")[0];
      const newLog = {
        id: `stock-log-${Date.now()}`,
        date: today,
        normalAdded: addN,
        urgentAdded: addU,
        notes: stockAddNotesInput.trim() || undefined,
      };
      const updatedStock = {
        normalTotalReceived: (currentStock.normalTotalReceived || 0) + addN,
        urgentTotalReceived: (currentStock.urgentTotalReceived || 0) + addU,
        logs: [newLog, ...(currentStock.logs || [])],
      };

      const payload: AppSettings = {
        ...settings,
        headerText: settings?.headerText || "",
        footerText: settings?.footerText || "",
        welcomeMessage: settings?.welcomeMessage || "",
        readyMessage: settings?.readyMessage || "",
        passportFormsStock: updatedStock,
      };

      const result = await updateSettingsOnServer(payload);
      if (onSettingsUpdated) {
        onSettingsUpdated(result);
      }
      setStockModalFeedback("تم تسجيل استلام الاستمارات بنجاح وتحديث رصيد المخزون! 📦✅");
      setStockAddNormalInput("");
      setStockAddUrgentInput("");
      setStockAddNotesInput("");
      setTimeout(() => {
        setStockModalFeedback("");
        setIsStockModalOpen(false);
      }, 2500);
    } catch (err: any) {
      alert("حدث خطأ أثناء حفظ رصيد الاستمارات: " + err.message);
    } finally {
      setStockModalLoading(false);
    }
  };

  return (
    <div className="space-y-6 font-cairo">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900">كشف حركة التابع للخدمات الجماهيرية (قسم جوازات طنطا)</h2>
          <p className="text-xs text-slate-500 mt-1">
            كشف رسمي يستوعب 35 صفاً لكل ورقة A4. يتم جلب وتحميل البيانات مباشرة من جوجل شيت، والتسجيل المباشر على الداتا شيت دون تخزين محلي.
          </p>
        </div>

        {/* Real-time Save & Sheet Status badge */}
        {(saveStatus || isSaving || isLoadingSheets || sheetFetchError) && (
          <div className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold shadow-xs animate-fade-in self-start md:self-auto border ${
            sheetFetchError 
              ? "bg-amber-50 border-amber-200 text-amber-800" 
              : "bg-emerald-50 border-emerald-200 text-emerald-800"
          }`}>
            {isSaving || isLoadingSheets ? (
              <RefreshCw className="w-4 h-4 text-emerald-600 animate-spin" />
            ) : sheetFetchError ? (
              <AlertCircle className="w-4 h-4 text-amber-600" />
            ) : (
              <Check className="w-4 h-4 text-emerald-600" />
            )}
            <span>
              {saveStatus || 
               (isLoadingSheets 
                 ? "جاري تحميل البيانات من جوجل شيت..." 
                 : isSaving 
                   ? "جاري التسجيل على الداتا شيت مباشرة..." 
                   : sheetFetchError)}
            </span>
          </div>
        )}
      </div>

      {/* LARGE Attention-Grabbing Language Mismatch Alert Banner */}
      {hasEnglishInRows && (
        <>
          {/* Top Page Banner */}
          <div className="bg-amber-500 border-4 border-amber-700 text-slate-950 p-5 rounded-3xl shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-pulse font-cairo">
            <div className="flex items-center gap-3.5">
              <div className="p-3 bg-amber-700 text-white rounded-2xl shrink-0 shadow-md">
                <AlertTriangle className="w-8 h-8 animate-bounce" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="text-lg sm:text-xl font-black text-slate-950">
                    ⚠️ تنبيه لفت نظر: تم إدخال حروف إنجليزية في خانة الاسم المخصصة للعربية!
                  </h4>
                  <span className="flex items-center gap-1 bg-amber-950 text-amber-200 text-xs font-black px-2.5 py-1 rounded-xl shrink-0">
                    <Volume2 className="w-3.5 h-3.5 text-amber-400" />
                    <span>صوت تنبيه</span>
                  </span>
                </div>
                <p className="text-xs sm:text-sm text-amber-950 font-bold mt-1">
                  يرجى تحويل لغة لوحة المفاتيح إلى العربية بالضغط على (Alt + Shift) وإعادة تصحيح الاسم.
                </p>
              </div>
            </div>
            <span className="font-mono font-black text-xs sm:text-sm bg-amber-950 text-white px-3.5 py-2 rounded-2xl shadow-md shrink-0 self-start sm:self-auto">
              الأسطر المتأثرة: {englishRowsIndices.join("، ")}
            </span>
          </div>

          {/* Fixed LARGE Floating Alert Banner always in viewport when scrolled */}
          <div className="fixed top-5 left-1/2 -translate-x-1/2 z-50 w-[95%] max-w-2xl bg-amber-500 border-4 border-amber-700 text-slate-950 rounded-3xl p-5 sm:p-6 shadow-2xl animate-bounce font-cairo">
            <div className="flex items-start gap-4">
              <div className="p-3.5 bg-amber-700 text-white rounded-2xl shrink-0 shadow-lg">
                <AlertTriangle className="w-9 h-9 sm:w-11 sm:h-11 animate-pulse" />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-xl sm:text-2xl font-black text-slate-950">
                    ⚠️ تنبيه لفت نظر: لغة لوحة المفاتيح غير صحيحة!
                  </h3>
                  <span className="flex items-center gap-1.5 bg-amber-950 text-amber-200 text-xs font-black px-3 py-1.5 rounded-xl shadow-xs shrink-0">
                    <Volume2 className="w-4 h-4 text-amber-400 animate-pulse" />
                    <span>صوت تنبيه</span>
                  </span>
                </div>
                <p className="text-sm sm:text-base font-extrabold text-amber-950 mt-2 leading-relaxed">
                  تم إدخال حروف باللغة <span className="underline decoration-2 decoration-red-700 font-black">الإنجليزية</span> في خانة الاسم العربي (الأسطر: {englishRowsIndices.join("، ")}) بكشف أمان!
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2.5 bg-amber-600/35 p-3 rounded-2xl border border-amber-600/50">
                  <span className="text-xs sm:text-sm font-black text-slate-950">
                    اضغط الآن على اختصار لوحة المفاتيح للتحويل:
                  </span>
                  <div className="flex items-center gap-1.5 font-mono font-black text-xs sm:text-sm">
                    <kbd className="px-3 py-1 bg-white text-slate-900 rounded-xl shadow-md border border-slate-300 text-sm font-bold">Alt</kbd>
                    <span className="text-slate-900 font-black">+</span>
                    <kbd className="px-3 py-1 bg-white text-slate-900 rounded-xl shadow-md border border-slate-300 text-sm font-bold">Shift</kbd>
                  </div>
                  <span className="text-xs sm:text-sm font-black text-amber-950 bg-amber-400/90 px-3 py-1 rounded-xl">
                    ⬅️ التحويل إلى العربية
                  </span>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Date Filter & Action Bar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          
          {/* Date range pickers (From - To) */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl shrink-0">
              <Filter className="w-5 h-5" />
            </div>

            {/* From Date */}
            <div className="space-y-0.5">
              <label className="text-[11px] font-bold text-slate-700 block">من تاريخ:</label>
              <input 
                type="date" 
                value={dateFrom} 
                onChange={(e) => setDateFrom(e.target.value)} 
                className="bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs font-mono font-bold focus:bg-white focus:ring-1 focus:ring-blue-500"
              />
            </div>

            {/* To Date */}
            <div className="space-y-0.5">
              <label className="text-[11px] font-bold text-slate-700 block">إلى تاريخ:</label>
              <input 
                type="date" 
                value={dateTo} 
                onChange={(e) => setDateTo(e.target.value)} 
                className="bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs font-mono font-bold focus:bg-white focus:ring-1 focus:ring-blue-500"
              />
            </div>

            {/* Quick Presets */}
            <div className="flex items-center gap-1.5 pt-4 flex-wrap">
              <button
                type="button"
                onClick={() => {
                  setDateFrom(todayStr);
                  setDateTo(todayStr);
                }}
                className={`px-2.5 py-1.5 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                  dateFrom === todayStr && dateTo === todayStr
                    ? "bg-blue-600 text-white"
                    : "bg-slate-100 hover:bg-slate-200 text-slate-700"
                }`}
              >
                اليوم
              </button>

              <button
                type="button"
                onClick={() => {
                  const d = new Date();
                  d.setDate(d.getDate() - 1);
                  const yStr = d.toISOString().split("T")[0];
                  setDateFrom(yStr);
                  setDateTo(yStr);
                }}
                className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg transition-colors cursor-pointer"
              >
                أمس
              </button>

              <button
                type="button"
                onClick={() => {
                  const d = new Date();
                  d.setDate(d.getDate() - 6);
                  setDateFrom(d.toISOString().split("T")[0]);
                  setDateTo(todayStr);
                }}
                className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg transition-colors cursor-pointer"
              >
                آخر 7 أيام
              </button>

              <button
                type="button"
                onClick={() => {
                  const d = new Date();
                  const firstDay = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
                  setDateFrom(firstDay);
                  setDateTo(todayStr);
                }}
                className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg transition-colors cursor-pointer"
              >
                هذا الشهر
              </button>

              <button
                type="button"
                onClick={() => {
                  setDateFrom("2025-01-01");
                  setDateTo(todayStr);
                }}
                className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg transition-colors cursor-pointer"
              >
                الكل
              </button>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Dedicated Save Aman Sheet Button (User requirement: الحفظ بزر مخصص بعد الانتهاء وليس بمجرد الخروج من الخلية) */}
            <button
              type="button"
              disabled={isSaving}
              onClick={handleSaveAmanSheet}
              className={`px-4 py-2 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-xs ${
                hasUnsavedChanges
                  ? "bg-emerald-600 hover:bg-emerald-700 text-white ring-2 ring-emerald-400 shadow-md animate-pulse"
                  : "bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-300"
              }`}
              title="حفظ وتثبيت كافة التعديلات في ورقة كشف أمان وشيت الإكسيل"
            >
              <Save className={`w-4 h-4 ${isSaving ? "animate-spin text-emerald-300" : ""}`} />
              <span>{isSaving ? "جاري الحفظ..." : "حفظ التغييرات في كشف أمان 💾"}</span>
              {hasUnsavedChanges && (
                <span className="bg-amber-300 text-amber-950 px-1.5 py-0.5 rounded-full text-[10px] font-black">
                  تعديلات غير محفوظة
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={handleAddNewRow}
              className="px-3.5 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-xs"
              title="إضافة سطر جديد للكتابة في الكشف"
            >
              <Plus className="w-4 h-4" />
              إضافة سطر جديد ➕
            </button>

            <button
              type="button"
              onClick={() => {
                setTargetInsertRowIndex(null);
                setIsPostponedModalOpen(true);
              }}
              className="px-3.5 py-2 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-xs"
              title="عرض وإدارة قائمة الأسماء المرحلة مؤقتاً والمحفوظة في ورقة الإكسيل"
            >
              <Scissors className="w-4 h-4 text-amber-700" />
              <span>الأسماء المرحلة مؤقتاً</span>
              {postponedList.length > 0 && (
                <span className="bg-amber-600 text-white font-mono px-1.5 py-0.5 rounded-full text-[10px] font-bold">
                  {postponedList.length}
                </span>
              )}
            </button>

            <button
              type="button"
              disabled={isLoadingSheets}
              onClick={() => loadDataFromDedicatedSheet(false)}
              className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
              title="إعادة تحميل البيانات مباشرة من ورقة كشف أمان"
            >
              <RefreshCw className={`w-4 h-4 ${isLoadingSheets ? "animate-spin text-blue-600" : ""}`} />
              {isLoadingSheets ? "جاري الجلب من شيت..." : "تحديث من شيت أمان 🔄"}
            </button>

            {/* User requirement: زر تحديث من الفواتير نفسها علشان يعمل تحديث لو حصل تغيير بالفاتورة */}
            <button
              type="button"
              disabled={isRefreshingFromInvoices}
              onClick={handleRefreshFromInvoices}
              className="px-3.5 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-300 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-xs disabled:opacity-50"
              title="تحديث كشف أمان مباشرة من أحدث بيانات الفواتير المسجلة ليعكس أي تعديل في الاسم أو تاريخ الميلاد أو الخدمة أو الغرامات"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshingFromInvoices ? "animate-spin text-indigo-600" : "text-indigo-600"}`} />
              <span>{isRefreshingFromInvoices ? "جاري التحديث من الفواتير..." : "تحديث من الفواتير 🔄"}</span>
            </button>

            <button
              type="button"
              onClick={handleExportToExcel}
              className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors shadow-xs cursor-pointer"
            >
              <FileSpreadsheet className="w-4 h-4" />
              تصدير إكسيل (CSV)
            </button>

            {/* User requirement: اختيار تاريخ الطباعة يدوياً ليظهر مباشرة أعلى الكشف بدون مكان فاضي للكتابة باليد */}
            <div className="flex items-center gap-1.5 bg-white border border-slate-300 rounded-xl px-2.5 py-1.5 text-xs shadow-xs">
              <span className="font-bold text-slate-700 whitespace-nowrap">📅 تاريخ الطباعة:</span>
              <input 
                type="date"
                value={customPrintDate}
                onChange={(e) => {
                  setCustomPrintDate(e.target.value);
                  setSelectedPrintDateHeader(e.target.value.replace(/-/g, "/"));
                }}
                className="bg-transparent border-0 p-0 text-xs font-mono font-bold text-blue-900 focus:outline-none cursor-pointer"
                title="تحديد التاريخ المراد ظهوره في أعلى كشف أمان المطبوع"
              />
            </div>

            <button
              type="button"
              onClick={handleOpenPrintModal}
              className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors shadow-xs cursor-pointer"
              title="طباعة الكشف مع التاريخ المحدد أعلى الورقة"
            >
              <Printer className="w-4 h-4" />
              طباعة الكشف A4 (35 صف)
            </button>
          </div>

        </div>

        {/* Tip & hint note */}
        <div className="bg-blue-50/70 border border-blue-100 rounded-xl px-3.5 py-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-blue-900">
          <div className="flex items-center gap-2">
            <span className="font-bold">💡 الحفظ والتعديل في كشف أمان:</span>
            <span>
              يتم استدعاء وحفظ بيانات كشف أمان من الورقة المخصصة لشيت أمان، ويمكنك التعديل والقص والإدراج بحرية ثم الضغط على زر &quot;حفظ التغييرات في كشف أمان&quot; 💾 لحفظ التعديلات في الإكسيل.
            </span>
          </div>
          <span className="font-mono font-bold shrink-0 bg-blue-100 text-blue-800 px-2 py-0.5 rounded-md text-[11px]">
            المسجلين حالياً: {activeCount} عميل
          </span>
        </div>
      </div>

      {/* Screen Preview & Printable Canvas */}
      <div className="bg-slate-100/70 rounded-2xl border border-slate-200 p-4 sm:p-6 overflow-x-auto">
        
        {/* On-screen Detailed Breakdown Reference Card */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 mb-4 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <span className="p-1.5 bg-blue-50 text-blue-600 rounded-lg">
                <CheckCircle2 className="w-4 h-4" />
              </span>
              <div>
                <h4 className="text-sm font-black text-slate-900 font-cairo">
                  تفصيلة كشف أمان للطباعة والحركة ({headerDateDisplay})
                </h4>
                <p className="text-[11px] text-slate-500">
                  تظهر الملاحظات بخط رمادي فاتح لتسهيل قراءتها وإمكانية الكتابة باليد عليها بعد الطباعة
                </p>
              </div>
            </div>

            {totalPages > 1 && (
              <span className="text-xs font-bold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-200 self-start sm:self-auto">
                إجمالي الصفحات: {totalPages} صفحات (35 صف لكل ورقة)
              </span>
            )}
          </div>

          {/* Statistics & Financial Totals Strip */}
          <div className="flex flex-wrap items-center gap-2.5 pt-3">
            <div className="flex items-center gap-1.5 bg-slate-100 text-slate-800 px-3 py-1.5 rounded-xl text-xs font-bold border border-slate-200">
              <span>إجمالي المسجلين:</span>
              <span className="font-mono text-sm text-slate-950 font-black">{overallStats.totalActive}</span>
            </div>

            <div className="flex items-center gap-1.5 bg-emerald-50 text-emerald-900 px-3 py-1.5 rounded-xl text-xs font-bold border border-emerald-200">
              <span>عادي:</span>
              <span className="font-mono text-sm text-emerald-950 font-black">{overallStats.normalCount}</span>
              <span className="text-[11px] text-emerald-800 font-bold">
                ({overallStats.normalTotal.toLocaleString()}ج)
              </span>
            </div>

            <div className="flex items-center gap-1.5 bg-amber-50 text-amber-900 px-3 py-1.5 rounded-xl text-xs font-bold border border-amber-200">
              <span>عاجل:</span>
              <span className="font-mono text-sm text-amber-950 font-black">{overallStats.urgentCount}</span>
              <span className="text-[11px] text-amber-800 font-bold">
                ({overallStats.urgentTotal.toLocaleString()}ج)
              </span>
            </div>

            <div className="flex items-center gap-1.5 bg-purple-50 text-purple-900 px-3 py-1.5 rounded-xl text-xs font-bold border border-purple-200">
              <span>الغرامات:</span>
              {overallStats.fineGroupsList.length > 0 ? (
                <div className="flex items-center gap-1.5 flex-wrap">
                  {overallStats.fineGroupsList.map((fg) => (
                    <span key={fg.name} className="text-[11px] bg-purple-100/90 text-purple-950 px-2 py-0.5 rounded-md font-bold">
                      {fg.name}: {fg.count} ({fg.totalAmount.toLocaleString()}ج)
                    </span>
                  ))}
                </div>
              ) : (
                <span className="text-[11px] text-purple-600 font-normal mr-1">(لا توجد)</span>
              )}
            </div>

            {/* Prominent Grand Total Badge */}
            <div className="flex items-center gap-2 bg-linear-to-r from-emerald-600 via-teal-700 to-emerald-800 text-white px-4 py-2 rounded-xl text-xs font-black shadow-xs mr-auto border border-emerald-500/30">
              <span>المبلغ الإجمالي الكلي:</span>
              <span className="font-mono text-base font-black tracking-tight">{overallStats.grandTotal.toLocaleString()} ج.م</span>
            </div>
          </div>

          {/* Dedicated Forms Stock Status Row (User requirement: رصيد استمارات الجوازات المتبقي وخصم كافة العمليات المنفذة) */}
          <div className="mt-3 pt-3 border-t border-slate-100 space-y-2 text-xs">
            {!formsStockStats.isConfigured ? (
              <div className="p-3 bg-amber-50 border border-amber-300 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-amber-950">
                <div className="flex items-center gap-2">
                  <span className="p-1.5 bg-amber-200/80 text-amber-900 rounded-lg">📦</span>
                  <div>
                    <span className="font-bold block">
                      ⚠️ لم يتم تسجيل الرصيد التراكمي للاستمارات المستلمة بالمكتب بعد!
                    </span>
                    <span className="text-[11px] text-amber-800">
                      إجمالي العمليات المنفذة المحفوظة بالنظام حتى الآن: <strong>{formsStockStats.allNormalUsed} عادي</strong> و <strong>{formsStockStats.allUrgentUsed} عاجل</strong>. سجل رصيد الاستمارات المستلمة لخصم العمليات تلقائياً فورياً.
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsStockModalOpen(true)}
                  className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-bold text-xs flex items-center gap-1 shadow-xs transition-colors cursor-pointer shrink-0"
                >
                  <Plus className="w-4 h-4" />
                  <span>تسجيل رصيد الاستمارات المستلمة 📦</span>
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-2.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-black text-slate-800 flex items-center gap-1.5">
                    <span className="p-1 bg-amber-100 text-amber-800 rounded-md">📦</span>
                    <span>المخزون الفعلي المتبقي بالمكتب:</span>
                  </span>
                  
                  {/* Normal Forms Remaining */}
                  <span className={`px-2.5 py-1 rounded-lg font-bold border ${
                    formsStockStats.normalRemaining <= 5 
                      ? "bg-red-50 text-red-800 border-red-200" 
                      : "bg-emerald-50 text-emerald-800 border-emerald-200"
                  }`}>
                    استمارات عادي متبقية: <strong className="font-mono text-sm font-black">{formsStockStats.normalRemaining}</strong>
                    <span className="text-[10px] text-slate-500 font-normal mr-1">
                      (مستلم: {formsStockStats.normalReceived} - إجمالي المنفذ بالنظام: {formsStockStats.allNormalUsed})
                    </span>
                  </span>

                  {/* Urgent Forms Remaining */}
                  <span className={`px-2.5 py-1 rounded-lg font-bold border ${
                    formsStockStats.urgentRemaining <= 5 
                      ? "bg-red-50 text-red-800 border-red-200" 
                      : "bg-amber-50 text-amber-900 border-amber-200"
                  }`}>
                    استمارات عاجل متبقية: <strong className="font-mono text-sm font-black">{formsStockStats.urgentRemaining}</strong>
                    <span className="text-[10px] text-slate-500 font-normal mr-1">
                      (مستلم: {formsStockStats.urgentReceived} - إجمالي المنفذ بالنظام: {formsStockStats.allUrgentUsed})
                    </span>
                  </span>

                  {/* This Report Used Count */}
                  <span className="px-2.5 py-1 rounded-lg font-bold border bg-blue-50 text-blue-900 border-blue-200 text-[11px]">
                    المنفذ بهذا الكشف ({headerDateDisplay}): <strong className="font-mono">{formsStockStats.reportNormalUsed}</strong> عادي | <strong className="font-mono">{formsStockStats.reportUrgentUsed}</strong> عاجل
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => setIsStockModalOpen(true)}
                  className="px-3 py-1 bg-slate-900 hover:bg-slate-800 text-white rounded-lg font-bold text-xs flex items-center gap-1 shadow-xs transition-colors cursor-pointer shrink-0"
                  title="تسجيل استلام استمارات عادية أو عاجلة جديدة واردة اليوم"
                >
                  <Plus className="w-3.5 h-3.5 text-amber-400" />
                  <span>إضافة استمارات واردة 📦</span>
                </button>
              </div>
            )}

            <div className="flex items-center justify-between text-[10.5px] text-slate-400">
              <span>
                💡 يتم خصم الاستمارات تلقائياً وتراكمياً من كافة فواتير ومعاملات الجوازات (#) المنفذة، ويظهر الرصيد المتبقي بدقة في نهاية الكشف المطبوع.
              </span>
            </div>
          </div>
        </div>

        {/* Informative helper when 0 transactions found for the currently selected date */}
        {activeCount === 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-amber-950 animate-fade-in font-cairo">
            <div className="flex items-center gap-2.5">
              <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
              <div>
                <p className="font-bold">
                  لا توجد معاملات مسجلة في التاريخ المختار ({headerDateDisplay}).
                </p>
                <p className="text-amber-800 text-[11px] mt-0.5">
                  يمكنك النقر أدناه لعرض معاملات هذا الشهر أو كافة المعاملات السابقة المسجلة دفعة واحدة:
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => {
                  const d = new Date();
                  const firstDay = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
                  setDateFrom(firstDay);
                  setDateTo(todayStr);
                }}
                className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-bold text-xs cursor-pointer shadow-xs transition-colors"
              >
                معاملات هذا الشهر 📅
              </button>
              <button
                type="button"
                onClick={() => {
                  setDateFrom("2025-01-01");
                  setDateTo(todayStr);
                }}
                className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold text-xs cursor-pointer shadow-xs transition-colors"
              >
                عرض الكل 📁
              </button>
            </div>
          </div>
        )}

        {/* Report Print Canvas for Iframe / Native Print */}
        <div ref={reportPrintRef} className="mx-auto text-black overflow-x-auto pb-4">
          {Array.from({ length: totalPages }).map((_, pageIdx) => {
            const startIdx = pageIdx * ROWS_PER_PAGE;
            const pageCustomers = displayRows.slice(startIdx, startIdx + ROWS_PER_PAGE);

            return (
              <div 
                key={pageIdx} 
                className="a4-print-page bg-white border border-slate-300 shadow-md mx-auto mb-8 last:mb-0 text-black flex flex-col justify-between"
                style={{ 
                  width: "210mm", 
                  height: "297mm", 
                  maxHeight: "297mm",
                  padding: "5mm 8mm",
                  boxSizing: "border-box",
                  fontFamily: "'Cairo', sans-serif" 
                }}
              >
                <div>
                  {/* Header Banner - Single Line Layout (بداية الصف: قسم جوازات طنطا | وسط الصف: كشف حركة التابع للخدمات الجماهيرية | نهاية الصف: التاريخ :     /    / 2026) */}
                  <div 
                    className="flex justify-between items-center border-b-2 border-black pb-1 mb-1 text-black font-cairo flex-nowrap whitespace-nowrap overflow-hidden"
                    style={{ width: "100%", whiteSpace: "nowrap", direction: "rtl" }}
                  >
                    {/* بداية الصف من اليمين: قسم جوازات طنطا */}
                    <div 
                      className="text-right shrink-0" 
                      style={{ fontFamily: "'Cairo', sans-serif", fontSize: "17.5px", fontWeight: "bold" }}
                    >
                      قسم جوازات طنطا
                    </div>

                    {/* وسط الصف: كشف حركة التابع للخدمات الجماهيرية */}
                    <div 
                      className="text-center shrink-0 px-2" 
                      style={{ fontFamily: "'Cairo', sans-serif", fontSize: "17.5px", fontWeight: "bold" }}
                    >
                      كشف حركة التابع للخدمات الجماهيرية
                    </div>

                    {/* نهاية الصف: التاريخ المختار قبل الطباعة */}
                    <div 
                      className="text-left shrink-0 select-none" 
                      style={{ fontFamily: "'Cairo', sans-serif", fontSize: "17.5px", fontWeight: "bold", whiteSpace: "nowrap", direction: "rtl" }}
                    >
                      <span>التاريخ : {selectedPrintDateHeader || todayStr.replace(/-/g, "/")}</span>
                    </div>
                  </div>

                  {/* Table - 3 Official Columns: الاسم مع المسلسل (10.5cm), تاريخ الميلاد (3.5cm), الملاحظات + مسلسل الجواز (5.4cm) */}
                  {/* Action buttons (قص وترحيل + إدراج) are detached and spaced cleanly to the left of the table grid */}
                  <table 
                    className="w-full print:w-full border-t-2 border-r-2 border-b-2 print:border-l-2 border-black border-l-0 text-right" 
                    style={{ 
                      borderCollapse: "collapse", 
                      width: "calc(100% + 88px)", 
                      tableLayout: "fixed",
                      fontFamily: "'Cairo', sans-serif", 
                      direction: "rtl" 
                    }}
                  >
                    <colgroup>
                      <col style={{ width: "10.5cm" }} />
                      <col style={{ width: "3.5cm" }} />
                      <col />
                      <col className="print:hidden" style={{ width: "88px" }} />
                    </colgroup>
                    <tbody>
                      {Array.from({ length: ROWS_PER_PAGE }).map((_, rIdx) => {
                        const globalIndex = startIdx + rIdx;
                        const row = pageCustomers[rIdx];
                        const absoluteNumber = globalIndex + 1;

                        const rowName = row ? row.arabicName : "";
                        const rowBirthDate = row ? formatCleanBirthDate(row.birthDate) : "";
                        const rowNotes = row ? row.notes : "";

                        return (
                          <tr 
                            key={rIdx} 
                            className="border border-black group hover:bg-blue-50/20 transition-colors" 
                            style={{ height: "7.1mm", maxHeight: "7.1mm" }}
                          >
                            {/* 1. Customer Name with Sequence Number directly prefixed (e.g. "1- محمد شريف") */}
                            {(() => {
                              const isEnglishDetected = /[a-zA-Z]/.test(rowName);
                              const printDisplayName = formatNameWithNumber(rowName, absoluteNumber);
                              const calculatedFontSize = getNameFontSize(printDisplayName);
                              const hasPrefixedNumberInInput = new RegExp(`^${absoluteNumber}\\s*[\\-\\.]\\s*`).test(rowName.trim());

                              return (
                                <td 
                                  className={`border border-black text-right font-bold p-0 relative transition-all ${
                                    isEnglishDetected ? "bg-amber-100 ring-2 ring-amber-500 z-10" : ""
                                  }`} 
                                  style={{ 
                                    width: "10.5cm", 
                                    fontFamily: "'Cairo', sans-serif", 
                                    lineHeight: 1.1, 
                                    whiteSpace: "nowrap" 
                                  }}
                                >
                                  <div className="relative w-full h-full flex items-center px-1">
                                    {/* Screen input: sequence number indicator + typing input */}
                                    {!hasPrefixedNumberInInput && (
                                      <span 
                                        className="shrink-0 font-bold font-mono text-slate-800 ml-1 select-none print:hidden"
                                        style={{ fontFamily: "'Cairo', sans-serif", fontSize: calculatedFontSize }}
                                      >
                                        {absoluteNumber}-
                                      </span>
                                    )}
                                    <input
                                      type="text"
                                      value={rowName}
                                      placeholder="اضغط لكتابة الاسم..."
                                      onChange={(e) => handleCellChange(globalIndex, "arabicName", e.target.value)}
                                      onBlur={() => handleCellBlur(globalIndex)}
                                      className={`w-full flex-1 h-full border-0 px-1 text-right font-bold transition-colors print:hidden ${
                                        isEnglishDetected
                                          ? "bg-amber-100 text-amber-950 ring-2 ring-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-600"
                                          : "bg-transparent text-black focus:outline-none focus:ring-1 focus:ring-blue-500 focus:bg-blue-50/70"
                                      } rounded-xs`}
                                      style={{ 
                                        fontFamily: "'Cairo', sans-serif", 
                                        fontSize: calculatedFontSize, 
                                        fontWeight: "bold", 
                                        lineHeight: 1.1 
                                      }}
                                    />
                                    {/* Print text: crisp, unclipped text with exact calculated font size prefixed with number */}
                                    <span
                                      className="hidden print:inline-block w-full text-right font-bold text-black px-1"
                                      style={{ 
                                        fontFamily: "'Cairo', sans-serif", 
                                        fontSize: calculatedFontSize, 
                                        fontWeight: "bold", 
                                        lineHeight: 1.1,
                                        whiteSpace: "nowrap"
                                      }}
                                    >
                                      {printDisplayName}
                                    </span>
                                    {isEnglishDetected && (
                                      <span className="print:hidden absolute left-1 top-1/2 -translate-y-1/2 text-[9px] bg-red-600 text-white font-bold px-1.5 py-0.5 rounded shadow-xs pointer-events-none z-20 flex items-center gap-0.5">
                                        <span>⚠️ حروف إنجليزية!</span>
                                      </span>
                                    )}
                                  </div>
                                </td>
                              );
                            })()}

                            {/* 3. Birth Date (Editable In-Place) */}
                            <td 
                              className="border border-black text-center font-bold p-0" 
                              style={{ 
                                width: "3.5cm", 
                                fontFamily: "'Cairo', sans-serif", 
                                fontSize: "20px", 
                                fontWeight: "bold", 
                                lineHeight: 1.1, 
                                whiteSpace: "nowrap" 
                              }}
                            >
                              {/* Screen input: Interactive typing & auto-save on blur */}
                              <input
                                type="text"
                                value={rowBirthDate}
                                placeholder="مواليد..."
                                onChange={(e) => handleCellChange(globalIndex, "birthDate", e.target.value)}
                                onBlur={() => handleCellBlur(globalIndex)}
                                className="w-full h-full bg-transparent border-0 px-1 text-center font-bold text-black focus:outline-none focus:ring-1 focus:ring-blue-500 focus:bg-blue-50/70 rounded-xs transition-colors print:hidden"
                                style={{ 
                                  fontFamily: "'Cairo', sans-serif", 
                                  fontSize: "20px", 
                                  fontWeight: "bold", 
                                  lineHeight: 1.1 
                                }}
                              />
                              {/* Print text */}
                              <span
                                className="hidden print:inline-block w-full text-center font-bold text-black px-1"
                                style={{ 
                                  fontFamily: "'Cairo', sans-serif", 
                                  fontSize: "20px", 
                                  fontWeight: "bold", 
                                  lineHeight: 1.1,
                                  whiteSpace: "nowrap"
                                }}
                              >
                                {rowBirthDate}
                              </span>
                            </td>

                            {/* 4. Notes - Light gray status: normal/urgent & fine status + 8-digit passport serial number */}
                            {/* Column 3 has solid border-l-2 to cleanly terminate the official printed table */}
                            <td 
                              className="border-t border-b border-r border-black border-l-2 border-l-black text-right p-0 relative" 
                              style={{ 
                                fontFamily: "'Cairo', sans-serif", 
                                lineHeight: 1.1 
                              }}
                            >
                              {(() => {
                                const hasContent = rowName.trim().length > 0 || Boolean(row?.passportSerial);
                                if (!hasContent) return null;

                                const noteInfo = resolveAmanDetails(row, invoices, services, governmentFines);
                                const serialVal = row?.passportSerial || "";

                                return (
                                  <div className="w-full h-full flex items-center justify-between px-1.5 overflow-hidden gap-1">
                                    {/* Service & Fine status (e.g. "عاجل - غ المؤهل") - flex-1 with truncate to never squeeze serial input */}
                                    <span
                                      className="notes-light-gray select-all font-semibold flex-1 min-w-0 truncate text-right"
                                      title={noteInfo.statusText}
                                      style={{
                                        color: "#9ca3af",
                                        fontFamily: "'Cairo', sans-serif",
                                        fontSize: "12px",
                                        fontWeight: "600",
                                        lineHeight: 1.1,
                                        WebkitPrintColorAdjust: "exact",
                                        printColorAdjust: "exact",
                                      }}
                                    >
                                      {noteInfo.statusText}
                                    </span>

                                    {/* Separator between status and passport serial */}
                                    {noteInfo.statusText ? (
                                      <span 
                                        className="font-bold select-none text-[11px] shrink-0 text-slate-300 px-0.5"
                                        style={{
                                          WebkitPrintColorAdjust: "exact",
                                          printColorAdjust: "exact",
                                        }}
                                      >
                                        |
                                      </span>
                                    ) : null}

                                    {/* 8-Digit Passport Serial Number (مساحة مخصصة وثابتة وغير مضغوطة للكتابة بوضوح تام) */}
                                    <div className="shrink-0 flex items-center justify-center">
                                      {/* Screen input: typing 8 digits with guaranteed fixed width and clear border */}
                                      <input
                                        type="text"
                                        maxLength={8}
                                        value={serialVal}
                                        placeholder="مسلسل 8 أرقام"
                                        onChange={(e) => handleCellChange(globalIndex, "passportSerial", e.target.value)}
                                        onBlur={() => handleCellBlur(globalIndex)}
                                        className="w-[84px] h-[21px] bg-slate-50 hover:bg-white focus:bg-white border border-slate-300 focus:border-blue-500 rounded text-center font-mono font-bold text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-colors print:hidden shadow-2xs"
                                        style={{
                                          direction: "ltr",
                                        }}
                                        title="رقم مسلسل استمارة الجواز مكون من 8 أرقام"
                                      />
                                      {/* Print text: Light gray for handwriting over */}
                                      <span
                                        className="hidden print:inline-block font-mono font-bold text-center px-1 tracking-wider"
                                        style={{
                                          color: "#9ca3af",
                                          fontFamily: "'Cairo', sans-serif",
                                          fontSize: "12px",
                                          fontWeight: "700",
                                          lineHeight: 1.1,
                                          direction: "ltr",
                                          WebkitPrintColorAdjust: "exact",
                                          printColorAdjust: "exact",
                                        }}
                                      >
                                        {serialVal || ""}
                                      </span>
                                    </div>
                                  </div>
                                );
                              })()}
                            </td>

                            {/* 5. Row Action Buttons (Screen Only - Hidden in Print) */}
                            {/* User explicit requirement: إبعاد علامات القص والترحيل وإدراج الاسم قليلاً عن الجدول لترك مساحة كافية لكتابة سريال الاستمارة بوضوح */}
                            <td 
                              className="print:hidden border-0 bg-transparent p-0 align-middle select-none"
                              style={{ width: "88px" }}
                            >
                              <div className="mr-3 flex items-center justify-center">
                                <div className="flex items-center gap-1.5 px-1.5 py-0.5 bg-slate-100 hover:bg-slate-200/90 border border-slate-300/80 rounded-lg shadow-2xs transition-all">
                                  {/* الزرار الأول: قص وترحيل بيانات هذا الصف الاسم وتاريخ الميلاد */}
                                  <button
                                    type="button"
                                    onClick={() => handleCutRow(globalIndex)}
                                    disabled={!rowName.trim()}
                                    title={rowName.trim() ? `قص وترحيل (${rowName}) وحفظه في ورقة المؤجلين بالإكسيل` : "الصف فارغ"}
                                    className={`p-1 rounded-md text-xs font-bold transition-all flex items-center justify-center cursor-pointer ${
                                      rowName.trim()
                                        ? "bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 shadow-xs hover:scale-110 active:scale-95"
                                        : "bg-slate-100 text-slate-300 border border-slate-200 cursor-not-allowed opacity-40"
                                    }`}
                                  >
                                    <Scissors className="w-3.5 h-3.5" />
                                  </button>

                                  {/* الزرار الثاني: إدراج اسم من الأسماء المرحلة المحفوظة بورقة الإكسيل */}
                                  <button
                                    type="button"
                                    onClick={() => handleOpenInsertModal(globalIndex)}
                                    title={`إدراج اسم من الأسماء المرحلة في هذا الصف (${absoluteNumber})`}
                                    className="p-1 rounded-md text-xs font-bold bg-blue-100 hover:bg-blue-200 text-blue-900 border border-blue-300 shadow-xs hover:scale-110 active:scale-95 transition-all flex items-center justify-center cursor-pointer"
                                  >
                                    <FolderInput className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Signoff Section & Small Reference Breakdown requested by user */}
                <div 
                  className="w-full flex justify-between items-center px-1 pt-1 mt-1 border-t-2 border-black text-black font-cairo"
                  style={{ 
                    width: "100%", 
                    direction: "rtl",
                    height: "14mm", 
                    maxHeight: "15mm", 
                    boxSizing: "border-box" 
                  }}
                >
                  {/* Right: Signature (رئيس القسم في أقصى اليمين) */}
                  <div 
                    className="flex items-center gap-1.5 shrink-0" 
                    style={{ fontFamily: "'Cairo', sans-serif", fontSize: "15px", fontWeight: "bold" }}
                  >
                    <span>رئيس القسم :</span>
                    <span className="inline-block border-b-2 border-dotted border-black w-24 sm:w-28 h-2 mb-0.5"></span>
                  </div>

                  {/* Left: Financial breakdown statement in far left (أقصى اليسار - بعيداً تماماً عن توقيع رئيس القسم) */}
                  <div 
                    className="shrink-0 flex items-center"
                    style={{ direction: "rtl" }}
                  >
                    {(() => {
                      const stats = pageStats[pageIdx];
                      const fines = stats?.fineGroupsList || [];
                      const isMultiLine = fines.length >= 2;

                      if (!isMultiLine) {
                        return (
                          <div 
                            className="inline-flex flex-col gap-0.5 border border-black/60 px-2 py-0.5 rounded-xs bg-slate-50/90 print:bg-transparent print:border-black/70 text-right"
                            style={{ 
                              fontFamily: "'Cairo', sans-serif", 
                              fontSize: "9px", 
                              fontWeight: "bold",
                              lineHeight: 1.2 
                            }}
                          >
                            <div className="flex items-center gap-1.5 flex-nowrap whitespace-nowrap">
                              <span className="font-extrabold text-slate-950">📌 تفصيلة الكشف:</span>
                              <span>عادي: {stats?.normalCount || 0} ({(stats?.normalTotal || 0).toLocaleString()}ج)</span>
                              <span className="text-black/50 font-normal">|</span>
                              <span>عاجل: {stats?.urgentCount || 0} ({(stats?.urgentTotal || 0).toLocaleString()}ج)</span>
                              
                              {fines.map((fg) => (
                                <React.Fragment key={fg.name}>
                                  <span className="text-black/50 font-normal">|</span>
                                  <span>{fg.name}: {fg.count} ({fg.totalAmount.toLocaleString()}ج)</span>
                                </React.Fragment>
                              ))}

                              <span className="text-black/50 font-normal">|</span>
                              <span className="font-black text-black">
                                الإجمالي: {(stats?.grandTotal || 0).toLocaleString()} ج.م
                              </span>
                            </div>

                            {/* سطر مخزون الاستمارات المتبقي تحت سطر تفصيلة الكشف */}
                            <div className="flex items-center gap-1.5 flex-nowrap whitespace-nowrap text-[8px] font-bold text-slate-800 pt-0.5 border-t border-black/30 mt-0.5">
                              <span className="font-extrabold text-black">📦 المخزون المتبقي:</span>
                              <span>استمارات عاجل: {formsStockStats.urgentRemaining}</span>
                              <span className="text-black/50 font-normal">|</span>
                              <span>عادي: {formsStockStats.normalRemaining}</span>
                            </div>
                          </div>
                        );
                      }

                      // تقسيم على سطرين عندما تكون بنود الغرامات كثيرة (بندان فأكثر)
                      const splitIdx = Math.ceil(fines.length / 2);
                      const line1Fines = fines.slice(0, splitIdx);
                      const line2Fines = fines.slice(splitIdx);

                      return (
                        <div 
                          className="inline-flex flex-col gap-0.5 border border-black/60 px-2 py-0.5 rounded-xs bg-slate-50/90 print:bg-transparent print:border-black/70 text-right"
                          style={{ 
                            fontFamily: "'Cairo', sans-serif", 
                            fontSize: "8px", 
                            fontWeight: "bold",
                            lineHeight: 1.2 
                          }}
                        >
                          {/* السطر الأول: عادي وعاجل ونصف الغرامات */}
                          <div className="flex items-center gap-1.5 flex-nowrap whitespace-nowrap">
                            <span className="font-extrabold text-slate-950">📌 تفصيلة الكشف:</span>
                            <span>عادي: {stats?.normalCount || 0} ({(stats?.normalTotal || 0).toLocaleString()}ج)</span>
                            <span className="text-black/50 font-normal">|</span>
                            <span>عاجل: {stats?.urgentCount || 0} ({(stats?.urgentTotal || 0).toLocaleString()}ج)</span>
                            {line1Fines.map((fg) => (
                              <React.Fragment key={fg.name}>
                                <span className="text-black/50 font-normal">|</span>
                                <span>{fg.name}: {fg.count} ({fg.totalAmount.toLocaleString()}ج)</span>
                              </React.Fragment>
                            ))}
                          </div>

                          {/* السطر الثاني: باقي الغرامات والمبلغ الإجمالي */}
                          <div className="flex items-center gap-1.5 flex-nowrap whitespace-nowrap">
                            {line2Fines.map((fg, idx) => (
                              <React.Fragment key={fg.name}>
                                {idx > 0 && <span className="text-black/50 font-normal">|</span>}
                                <span>{fg.name}: {fg.count} ({fg.totalAmount.toLocaleString()}ج)</span>
                                <span className="text-black/50 font-normal mr-1">|</span>
                              </React.Fragment>
                            ))}
                            <span className="font-black text-black">
                              الإجمالي: {(stats?.grandTotal || 0).toLocaleString()} ج.م
                            </span>
                          </div>

                          {/* سطر مخزون الاستمارات المتبقي تحت سطر تفصيلة الكشف */}
                          <div className="flex items-center gap-1.5 flex-nowrap whitespace-nowrap text-[7.5px] font-bold text-slate-800 pt-0.5 border-t border-black/30 mt-0.5">
                            <span className="font-extrabold text-black">📦 المخزون المتبقي:</span>
                            <span>استمارات عاجل: {formsStockStats.urgentRemaining}</span>
                            <span className="text-black/50 font-normal">|</span>
                            <span>عادي: {formsStockStats.normalRemaining}</span>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </div>

              </div>
            );
          })}
        </div>
      </div>

      {/* Postponed Names Modal (قائمة الأسماء المرحلة مؤقتاً) */}
      {/* User explicit requirement:
          "والزرار الثانى لادراج اسم من الاسماء المرحلة دى يقوم باظهار بيانات الاسماء وتاريخ الميلاد المحفوظين بورقة الاكسيل وانا اختار منهم اللى احتاجه يتحط بالكشف"
      */}
      {isPostponedModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-fade-in font-cairo">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh]">
            
            {/* Modal Header */}
            <div className="px-5 py-4 bg-gradient-to-r from-amber-500 to-amber-600 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="p-2 bg-white/20 rounded-xl">
                  <Scissors className="w-5 h-5 text-white" />
                </span>
                <div>
                  <h3 className="font-black text-base sm:text-lg">
                    قائمة الأسماء المرحلة مؤقتاً من كشف أمان
                  </h3>
                  <p className="text-xs text-amber-100 font-normal">
                    {targetInsertRowIndex !== null 
                      ? `اختر الاسم المراد إدراجه في الصف رقم (${targetInsertRowIndex + 1})`
                      : "إدارة واستعراض الأسماء المرحلة المحفوظة في ورقة الإكسيل المخصصة"}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsPostponedModalOpen(false);
                  setTargetInsertRowIndex(null);
                }}
                className="p-1.5 bg-white/10 hover:bg-white/20 rounded-xl text-white transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Sub-toolbar: Search & Actions */}
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={postponedSearchQuery}
                  onChange={(e) => setPostponedSearchQuery(e.target.value)}
                  placeholder="بحث في الأسماء وتواريخ الميلاد المرحلة..."
                  className="w-full pl-3 pr-9 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  disabled={isLoadingPostponed}
                  onClick={handleRefreshPostponedFromSheets}
                  className="px-3 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs disabled:opacity-50"
                  title="تحديث الأسماء من ورقة الإكسيل بجوجل شيت"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isLoadingPostponed ? "animate-spin text-amber-600" : ""}`} />
                  {isLoadingPostponed ? "جاري التحديث..." : "تحديث من شيت 🔄"}
                </button>

                <button
                  type="button"
                  onClick={handleExportPostponedToExcel}
                  className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                  title="تصدير ورقة الأسماء المرحلة إلى ملف CSV"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  تصدير إكسيل
                </button>
              </div>
            </div>

            {/* Option toggle: remove from postponed upon insertion */}
            <div className="px-5 py-2.5 bg-amber-50/70 border-b border-amber-200/60 flex items-center justify-between text-xs text-amber-950 font-bold">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={deleteAfterInsert}
                  onChange={(e) => setDeleteAfterInsert(e.target.checked)}
                  className="w-4 h-4 rounded text-amber-600 focus:ring-amber-500 accent-amber-600 cursor-pointer"
                />
                <span>حذف الاسم من قائمة المؤجلين تلقائياً بعد إدراجه في الكشف</span>
              </label>
              <span className="text-[11px] text-amber-800 font-normal">
                المحفوظين حالياً: {postponedList.length} عميل
              </span>
            </div>

            {/* Content List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {(() => {
                const filtered = postponedList.filter((item) => {
                  if (!postponedSearchQuery.trim()) return true;
                  const q = postponedSearchQuery.trim().toLowerCase();
                  return (
                    item.arabicName.toLowerCase().includes(q) ||
                    item.birthDate.includes(q) ||
                    (item.notes && item.notes.toLowerCase().includes(q))
                  );
                });

                if (filtered.length === 0) {
                  return (
                    <div className="py-12 text-center text-slate-500 font-cairo">
                      <div className="w-12 h-12 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center mx-auto mb-3">
                        <Scissors className="w-6 h-6" />
                      </div>
                      <p className="font-bold text-sm text-slate-700">لا توجد أسماء مرحلة حالياً</p>
                      <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                        عند الضغط على زر القص ✂️ بجانب أي اسم في الكشف، سيتم نقله وحفظه هنا وفي ورقة الإكسيل المخصصة لتتمكن من إدراجه في أي وقت آخر.
                      </p>
                    </div>
                  );
                }

                return filtered.map((item, idx) => (
                  <div
                    key={item.id || idx}
                    className="p-3 bg-white hover:bg-amber-50/40 border border-slate-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors shadow-2xs"
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-7 h-7 rounded-lg bg-slate-100 text-slate-700 font-mono font-bold text-xs flex items-center justify-center shrink-0">
                        {idx + 1}
                      </span>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="font-black text-slate-900 text-sm font-cairo">
                            {item.arabicName}
                          </h4>
                          {item.serviceType && (
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                              item.serviceType === "مستعجل" 
                                ? "bg-amber-100 text-amber-800" 
                                : "bg-emerald-100 text-emerald-800"
                            }`}>
                              {item.serviceType}
                            </span>
                          )}
                          {item.fineName && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-purple-100 text-purple-800">
                              غ: {item.fineName}
                            </span>
                          )}
                          {item.passportSerial && (
                            <span className="text-[10px] font-bold font-mono px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-300">
                              استمارة: {item.passportSerial}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-[11px] text-slate-500 mt-1">
                          <span>📅 مواليد: <strong className="text-slate-800 font-mono">{item.birthDate || "غير محدد"}</strong></span>
                          <span>|</span>
                          <span>📌 تاريخ الترحيل: {item.postponedAt || item.originalDate || "—"}</span>
                          {item.notes && item.notes !== item.serviceType && (
                            <>
                              <span>|</span>
                              <span className="text-slate-600">📝 {item.notes}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
                      <button
                        type="button"
                        onClick={() => handleInsertPostponedItem(item)}
                        className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                      >
                        <FolderInput className="w-3.5 h-3.5" />
                        <span>
                          {targetInsertRowIndex !== null 
                            ? `إدراج في الصف (${targetInsertRowIndex + 1})`
                            : "إدراج بالكشف"}
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDeletePostponedItem(item.id, item.arabicName)}
                        title="حذف من قائمة المؤجلين"
                        className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ));
              })()}
            </div>

            {/* Modal Footer */}
            <div className="px-5 py-3 bg-slate-100 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-600">
              <span className="font-semibold text-center sm:text-right">
                💾 يتم الحفظ والتخزين بورقة (Aman_Postponed_الأسماء_المرحلة) في ملف الإكسيل بجوجل شيت مباشرة
              </span>
              <button
                type="button"
                onClick={() => {
                  setIsPostponedModalOpen(false);
                  setTargetInsertRowIndex(null);
                }}
                className="px-4 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold rounded-xl transition-colors cursor-pointer"
              >
                إغلاق
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Print Date Dialog Modal (User requirement: قبل الطباعة يسأل عن تاريخ اليوم أو تاريخ مخصص آخر أو تركه فارغاً للكتابة باليد) */}
      {isPrintDateModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-fade-in font-cairo">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden flex flex-col">
            
            {/* Modal Header */}
            <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="p-2 bg-white/10 rounded-xl">
                  <Printer className="w-5 h-5 text-white" />
                </span>
                <div>
                  <h3 className="font-black text-base sm:text-lg">تاريخ الطباعة لكشف أمان</h3>
                  <p className="text-xs text-slate-300">حدد التاريخ المراد ظهوره أعلى كشف أمان المطبوع</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsPrintDateModalOpen(false)}
                className="p-1.5 bg-white/10 hover:bg-white/20 rounded-xl text-white transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-4">
              <p className="text-xs font-bold text-slate-700">
                حدد التاريخ الذي ترغب في ظهوره أعلى كشف أمان قبل إتمام الطباعة:
              </p>

              <div className="space-y-2.5">
                {/* Option 1: Today's date */}
                <label 
                  onClick={() => setPrintDateMode("today")}
                  className={`flex items-start gap-3 p-3.5 rounded-xl border-2 cursor-pointer transition-all ${
                    printDateMode === "today" 
                      ? "border-blue-600 bg-blue-50/70 shadow-xs" 
                      : "border-slate-200 hover:border-slate-300 bg-white"
                  }`}
                >
                  <input 
                    type="radio" 
                    name="printDateOpt" 
                    checked={printDateMode === "today"} 
                    onChange={() => setPrintDateMode("today")}
                    className="mt-0.5 text-blue-600 focus:ring-blue-500 accent-blue-600 cursor-pointer"
                  />
                  <div className="flex-1">
                    <span className="block font-black text-xs sm:text-sm text-slate-900">
                      1. طباعة بتاريخ اليوم الحالي
                    </span>
                    <span className="block text-xs font-mono font-bold text-blue-700 mt-0.5">
                      {todayStr.replace(/-/g, "/")}
                    </span>
                  </div>
                </label>

                {/* Option 2: Custom date (chosen manually) */}
                <label 
                  onClick={() => setPrintDateMode("custom")}
                  className={`flex items-start gap-3 p-3.5 rounded-xl border-2 cursor-pointer transition-all ${
                    printDateMode === "custom" 
                      ? "border-blue-600 bg-blue-50/70 shadow-xs" 
                      : "border-slate-200 hover:border-slate-300 bg-white"
                  }`}
                >
                  <input 
                    type="radio" 
                    name="printDateOpt" 
                    checked={printDateMode === "custom"} 
                    onChange={() => setPrintDateMode("custom")}
                    className="mt-0.5 text-blue-600 focus:ring-blue-500 accent-blue-600 cursor-pointer"
                  />
                  <div className="flex-1 space-y-2">
                    <span className="block font-black text-xs sm:text-sm text-slate-900">
                      2. تحديد تاريخ يدوي للطباعة
                    </span>
                    <p className="text-[11px] text-slate-500">
                      حدد التاريخ المراد ظهوره في الترويسة في حال استخدام الكشف بعد يوم أو يومين
                    </p>
                    <input 
                      type="date"
                      value={customPrintDate}
                      onChange={(e) => {
                        setCustomPrintDate(e.target.value);
                        setPrintDateMode("custom");
                      }}
                      className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </label>
              </div>

              {/* Header preview */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs space-y-1">
                <span className="font-bold text-slate-500 block text-[11px]">معاينة شكل الترويسة أعلى الورقة المطبوعة:</span>
                <div className="bg-white border border-black/40 px-3 py-1.5 rounded text-[11.5px] font-bold flex justify-between items-center text-slate-900 font-cairo">
                  <span>قسم جوازات طنطا</span>
                  <span>كشف حركة التابع للخدمات الجماهيرية</span>
                  <span className="text-black font-bold">
                    التاريخ : {printDateMode === "today" 
                      ? todayStr.replace(/-/g, "/") 
                      : (customPrintDate || todayStr).replace(/-/g, "/")}
                  </span>
                </div>
              </div>
            </div>

            {/* Footer Actions */}
            <div className="px-5 py-3.5 bg-slate-100 border-t border-slate-200 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setIsPrintDateModalOpen(false)}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded-xl text-xs transition-colors cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={() => handleConfirmPrint(printDateMode, customPrintDate)}
                className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
              >
                <Printer className="w-4 h-4" />
                <span>متابعة للطباعة الآن</span>
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Quick Stock Management Modal in Aman Report */}
      {isStockModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-fade-in font-cairo">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden flex flex-col animate-scale-up">
            <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Package className="w-5 h-5 text-amber-400" />
                <h3 className="font-extrabold text-sm">
                  تسجيل وإضافة استمارات الجوازات المستلمة بالمخزون 📦
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsStockModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveStockFromAman} className="p-5 space-y-4">
              {/* Current Overview */}
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3">
                  <span className="text-[11px] font-bold text-emerald-800 block">استمارات العادي المستلمة حالياً:</span>
                  <div className="flex items-baseline justify-between mt-1">
                    <span className="text-xl font-black font-mono text-emerald-950">
                      {formsStockStats.normalReceived}
                    </span>
                    <span className="text-[10px] text-emerald-700">
                      المنفذ: {formsStockStats.allNormalUsed} | المتبقي: {formsStockStats.normalRemaining}
                    </span>
                  </div>
                </div>

                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                  <span className="text-[11px] font-bold text-amber-800 block">استمارات العاجل المستلمة حالياً:</span>
                  <div className="flex items-baseline justify-between mt-1">
                    <span className="text-xl font-black font-mono text-amber-950">
                      {formsStockStats.urgentReceived}
                    </span>
                    <span className="text-[10px] text-amber-700">
                      المنفذ: {formsStockStats.allUrgentUsed} | المتبقي: {formsStockStats.urgentRemaining}
                    </span>
                  </div>
                </div>
              </div>

              {stockModalFeedback && (
                <div className="p-3 bg-emerald-100 text-emerald-900 rounded-xl text-xs font-bold flex items-center gap-1.5 animate-fade-in">
                  <Check className="w-4 h-4 text-emerald-700" />
                  <span>{stockModalFeedback}</span>
                </div>
              )}

              {/* Add form */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-3">
                <h4 className="text-xs font-bold text-slate-800">إضافة كمية استمارات جديدة مستلمة:</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-700 block">
                      عدد استمارات العادي الواردة:
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={stockAddNormalInput}
                      onChange={(e) => setStockAddNormalInput(e.target.value === "" ? "" : Math.max(0, parseInt(e.target.value) || 0))}
                      placeholder="0"
                      className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono font-bold text-emerald-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-700 block">
                      عدد استمارات العاجل الواردة:
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={stockAddUrgentInput}
                      onChange={(e) => setStockAddUrgentInput(e.target.value === "" ? "" : Math.max(0, parseInt(e.target.value) || 0))}
                      placeholder="0"
                      className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono font-bold text-amber-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-700 block">
                    ملاحظات الدفعة (اختياري):
                  </label>
                  <input
                    type="text"
                    value={stockAddNotesInput}
                    onChange={(e) => setStockAddNotesInput(e.target.value)}
                    placeholder="مثال: دفعة جديدة من قسم الجوازات..."
                    className="w-full bg-white border border-slate-300 rounded-xl px-3 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 font-cairo"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsStockModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-colors cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={stockModalLoading || (!stockAddNormalInput && !stockAddUrgentInput)}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />
                  <span>{stockModalLoading ? "جاري الحفظ..." : "حفظ وتأكيد الإضافة للمخزون 💾"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}

