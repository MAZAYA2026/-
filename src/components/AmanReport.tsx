import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { Invoice, Service, Employee, AppSettings, InvoiceStatus, CustomerInput } from "../types";
import { updateInvoiceOnServer, createInvoiceOnServer, syncAmanReportToGoogleSheets, fetchAmanReportFromGoogleSheets } from "../lib/api";
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
  CloudDownload
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
  serviceType?: "عادي" | "مستعجل" | string;
  hasFine?: boolean;
  fineName?: string;
  fineAmount?: number;
}

interface AmanReportProps {
  invoices: Invoice[];
  services: Service[];
  activeEmployee: Employee;
  settings?: AppSettings;
  onInvoiceUpdated?: (updated: Invoice) => void;
  onInvoiceCreated?: (newInv: Invoice) => void;
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
export function resolveAmanDetails(
  row: Partial<AmanRowItem>,
  invoices: Invoice[],
  services: Service[]
): {
  serviceType: "عادي" | "مستعجل";
  hasFine: boolean;
  fineName: string;
  fineAmount: number;
  statusText: string;
} {
  let serviceType: "عادي" | "مستعجل" = (row.serviceType as any) === "مستعجل" ? "مستعجل" : "عادي";
  let hasFine = row.hasFine;
  let fineName = row.fineName || "";
  let fineAmount = row.fineAmount || 0;
  const rowNotes = row.notes || "";

  // Find linked customer from invoices if possible
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
        serviceType = isUrgent ? "مستعجل" : "عادي";

        if (amanSrv.fineName && amanSrv.fineName.trim().length > 0) {
          hasFine = true;
          fineName = amanSrv.fineName.trim();
          fineAmount = amanSrv.fineAmount || 0;
        } else if (amanSrv.fineAmount && amanSrv.fineAmount > 0) {
          hasFine = true;
          fineName = "غرامة حكومية";
          fineAmount = amanSrv.fineAmount;
        } else if (hasFine === undefined) {
          hasFine = false;
        }
      }
    }
  }

  // Fallback checks from notes text if not resolved
  if (hasFine === undefined) {
    if (rowNotes.includes("يوجد غرامة") || rowNotes.includes("غرامة")) {
      hasFine = true;
      const m = rowNotes.match(/غرامة(?:\s*\(([^)]+)\))?/);
      fineName = m && m[1] ? m[1].trim() : "غرامة حكومية";
    } else {
      hasFine = false;
    }
  }

  if (!row.serviceType && (rowNotes.includes("مستعجل") || rowNotes.includes("عاجل"))) {
    serviceType = "مستعجل";
  }

  const fineLabel = hasFine 
    ? (fineName ? `يوجد غرامة (${fineName})` : "يوجد غرامة") 
    : "لا توجد غرامة";
  const statusText = `${serviceType} - ${fineLabel}`;

  return {
    serviceType,
    hasFine: !!hasFine,
    fineName,
    fineAmount,
    statusText,
  };
}

export default function AmanReport({ 
  invoices, 
  services, 
  activeEmployee, 
  settings, 
  onInvoiceUpdated, 
  onInvoiceCreated 
}: AmanReportProps) {
  // Date filters: from and to
  const todayStr = new Date().toISOString().split("T")[0];
  const [dateFrom, setDateFrom] = useState(todayStr);
  const [dateTo, setDateTo] = useState(todayStr);

  // Auto-save feedback message
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingSheets, setIsLoadingSheets] = useState(false);
  const [sheetFetchError, setSheetFetchError] = useState<string | null>(null);

  const reportPrintRef = useRef<HTMLDivElement>(null);

  const extractBirthDate = (birthDate?: string, nationalId?: string): string => {
    if (birthDate && birthDate.trim() && birthDate !== "N/A") return birthDate.trim();
    if (nationalId && nationalId.length >= 7) {
      const cleanId = nationalId.replace(/\D/g, "");
      if (cleanId.length >= 7) {
        const centuryDigit = parseInt(cleanId[0]);
        const yy = cleanId.substring(1, 3);
        const mm = cleanId.substring(3, 5);
        const dd = cleanId.substring(5, 7);
        const year = (centuryDigit === 3 ? 2000 : 1900) + parseInt(yy);
        return `${year}/${mm}/${dd}`;
      }
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

  // Function to load data directly from Google Sheets
  const loadDataFromGoogleSheet = useCallback(async (isSilent = false) => {
    const webhookUrl = settings?.googleSheetWebhookUrl;
    if (!webhookUrl || !webhookUrl.startsWith("http")) {
      // If webhook is not configured yet, fallback to baseCustomers
      setTableRows(baseCustomers);
      baseCustomers.forEach((b) => {
        originalValuesRef.current.set(b.id, {
          arabicName: b.arabicName,
          birthDate: b.birthDate,
          notes: b.notes,
        });
      });
      return;
    }

    if (!isSilent) setIsLoadingSheets(true);
    setSheetFetchError(null);

    try {
      const res = await fetchAmanReportFromGoogleSheets({
        dateFrom,
        dateTo,
        webhookUrl,
      });

      if (res && Array.isArray(res.rows) && res.rows.length > 0) {
        const loaded: AmanRowItem[] = res.rows.map((row, idx) => {
          const details = resolveAmanDetails(row, invoices, services);
          return {
            id: row.id || `sheet-${idx}`,
            arabicName: row.arabicName || "",
            birthDate: row.birthDate || "",
            notes: row.notes || "",
            date: row.date || dateFrom,
            invoiceId: row.invoiceId,
            isCustomManual: !row.invoiceId,
            serviceType: details.serviceType,
            hasFine: details.hasFine,
            fineName: details.fineName,
            fineAmount: details.fineAmount,
          };
        });

        setTableRows(loaded);
        originalValuesRef.current.clear();
        loaded.forEach((r) => {
          originalValuesRef.current.set(r.id, {
            arabicName: r.arabicName,
            birthDate: r.birthDate,
            notes: r.notes,
          });
        });
        setSaveStatus(`تم جلب وتحميل بيانات كشف أمان من جوجل شيت مباشرة (${loaded.length} عميل) 📊📥`);
        setTimeout(() => setSaveStatus(null), 3500);
      } else {
        // Sheet has no rows yet for this range, fallback to invoice base customers if any
        setTableRows(baseCustomers);
        baseCustomers.forEach((b) => {
          originalValuesRef.current.set(b.id, {
            arabicName: b.arabicName,
            birthDate: b.birthDate,
            notes: b.notes,
          });
        });
      }
    } catch (err: any) {
      console.warn("Direct Google Sheet fetch for Aman Report:", err.message);
      setSheetFetchError(err.message || "تعذر جلب البيانات من جوجل شيت");
      // Fallback to baseCustomers on network failure
      setTableRows(baseCustomers);
    } finally {
      setIsLoadingSheets(false);
    }
  }, [dateFrom, dateTo, settings?.googleSheetWebhookUrl, baseCustomers, invoices, services]);

  // Load from Google Sheet directly upon component opening or whenever the date range changes
  useEffect(() => {
    loadDataFromGoogleSheet();
  }, [dateFrom, dateTo, loadDataFromGoogleSheet]);

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
  const handleCellChange = (rowIndex: number, field: "arabicName" | "birthDate" | "notes", value: string) => {
    if (field === "arabicName" && /[a-zA-Z]/.test(value)) {
      playLanguageWarningSound();
    }

    setTableRows((prev) => {
      const copy = [...prev];
      // Expand if typing in an empty padded slot
      while (copy.length <= rowIndex) {
        copy.push({
          id: `manual-${Date.now()}-${copy.length}`,
          arabicName: "",
          birthDate: "",
          notes: "",
          date: dateFrom,
          isCustomManual: true,
        });
      }
      copy[rowIndex] = {
        ...copy[rowIndex],
        [field]: value,
      };
      return copy;
    });
  };

  // Trigger auto-save on blur
  const handleCellBlur = async (rowIndex: number) => {
    const row = displayRows[rowIndex];
    if (!row) return;

    const trimmedName = row.arabicName.trim();
    const trimmedBirthDate = row.birthDate.trim();
    const trimmedNotes = row.notes.trim();

    // Check if row had cached original value
    const orig = originalValuesRef.current.get(row.id);
    if (orig) {
      if (
        orig.arabicName === trimmedName &&
        orig.birthDate === trimmedBirthDate &&
        orig.notes === trimmedNotes
      ) {
        return; // No change made
      }
    } else {
      // For empty row, if nothing was entered, ignore
      if (!trimmedName && !trimmedBirthDate && !trimmedNotes) {
        return;
      }
    }

    setIsSaving(true);
    try {
      // 1. Prepare updated active rows for direct registration on Google Sheets
      const updatedDisplayRows = displayRows.map((r, i) => 
        i === rowIndex 
          ? { ...r, arabicName: trimmedName, birthDate: trimmedBirthDate, notes: trimmedNotes } 
          : r
      );
      const activeRowsToRecord = updatedDisplayRows.filter((r) => r.arabicName.trim().length > 0);

      // 2. Also keep linked invoice in sync if invoiceId exists
      if (row.invoiceId !== undefined && row.customerIndex !== undefined) {
        const targetInvoice = invoices.find((inv) => inv.invoiceId === row.invoiceId);
        if (targetInvoice && targetInvoice.customers[row.customerIndex]) {
          const updatedCustomers = targetInvoice.customers.map((c, cIdx) => {
            if (cIdx !== row.customerIndex) return c;
            return {
              ...c,
              arabicName: trimmedName || c.arabicName,
              birthDate: trimmedBirthDate || c.birthDate,
              services: c.services.map((s) => {
                if (s.serviceId.startsWith("#") && !s.serviceId.startsWith("##")) {
                  return { ...s, notes: trimmedNotes };
                }
                return s;
              }),
            };
          });

          const updatedInvoice = {
            ...targetInvoice,
            customers: updatedCustomers,
          };

          try {
            const savedInv = await updateInvoiceOnServer(targetInvoice.invoiceId, updatedInvoice);
            onInvoiceUpdated?.(savedInv);
          } catch (e) {
            console.warn("Notice: invoice server update:", e);
          }
        }
      } 
      // Case 2: New entry in an empty row
      else if (trimmedName.length > 0 && !row.invoiceId) {
        const defaultAmanService = services.find(
          (s) => s.name.startsWith("#") && !s.name.startsWith("##")
        ) || {
          id: "# استخراج جواز سفر",
          name: "# استخراج جواز سفر",
          govPrice: 0,
          officeFee: 0,
        };

        const newCustomer: CustomerInput = {
          arabicName: trimmedName,
          englishName: "",
          englishNameOption: "gemini",
          nationalId: "",
          birthDate: trimmedBirthDate,
          phone: "",
          profession: "",
          services: [
            {
              serviceId: defaultAmanService.name || defaultAmanService.id,
              quantity: 1,
              price: (defaultAmanService.govPrice || 0) + (defaultAmanService.officeFee || 0),
              deliveryDate: dateFrom,
              notes: trimmedNotes,
            },
          ],
        };

        const newInvoiceData: Partial<Invoice> = {
          date: row.date || dateFrom || todayStr,
          status: InvoiceStatus.NEW,
          employeeName: activeEmployee?.name || "الموظف",
          customers: [newCustomer],
          totalGov: defaultAmanService.govPrice || 0,
          totalOffice: defaultAmanService.officeFee || 0,
          totalAmount: (defaultAmanService.govPrice || 0) + (defaultAmanService.officeFee || 0),
        };

        try {
          const createdInv = await createInvoiceOnServer(newInvoiceData);
          onInvoiceCreated?.(createdInv);
          const newRowId = `inv-${createdInv.invoiceId}-c-0`;
          setTableRows((prev) => {
            const copy = [...prev];
            if (copy[rowIndex]) {
              copy[rowIndex] = {
                ...copy[rowIndex],
                id: newRowId,
                invoiceId: createdInv.invoiceId,
                customerIndex: 0,
                isCustomManual: false,
              };
            }
            return copy;
          });
        } catch (e) {
          console.warn("Notice: invoice create:", e);
        }
      }

      // Update cached values
      originalValuesRef.current.set(row.id, {
        arabicName: trimmedName,
        birthDate: trimmedBirthDate,
        notes: trimmedNotes,
      });

      // 3. User explicit requirement: "بيانات كشف امان تسجل على الداتا شيت مباشرة وليس تخزين محلى"
      // Record directly to Google Sheets database sheet
      try {
        await syncAmanReportToGoogleSheets({
          dateFrom,
          dateTo,
          amanRows: activeRowsToRecord,
          webhookUrl: settings?.googleSheetWebhookUrl,
        });
        showSaveNotice(`تم تسجيل (${trimmedName}) على الداتا شيت بجوجل شيت مباشرة بنجاح 📑📊✓`);
      } catch (syncErr: any) {
        console.warn("Aman Sheet direct push error:", syncErr);
        showSaveNotice(`تم الحفظ (يرجى التحقق من اتصال جوجل شيت: ${syncErr.message}) ⚠️`);
      }
    } catch (err: any) {
      console.error("Direct sheet recording failed on blur:", err);
      showSaveNotice(`خطأ أثناء التسجيل: ${err.message}`);
    } finally {
      setIsSaving(false);
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
    showSaveNotice("تمت إضافة سطر جديد للكشف، اكتب الاسم وسيسجل على جوجل شيت مباشرة بمجرد الخروج من الخلية ✍️");
  };

  // Excel Export to CSV with exact requested format
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
    csvContent += "م,الاسم,تاريخ الميلاد,الملاحظات\r\n";

    activeRows.forEach((cust, idx) => {
      const cleanName = cust.arabicName.replace(/,/g, " ");
      csvContent += `${idx + 1},${cleanName},${cust.birthDate || ""},\r\n`;
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
  // User explicit requirement: "لا تقم تصغير حجم الخط للأسم المكتوب الا بعد تخطى طوله 8سم بعدها ابدأ فى التقليل"
  // Keep font size at default official 20px up to 8cm; start reducing only after exceeding 8cm
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

          // Do NOT reduce font size until length strictly exceeds 8.0 cm
          if (widthInCm <= 8.0) {
            return "20px";
          }
          if (widthInCm <= 8.6) {
            return "18px";
          }
          if (widthInCm <= 9.2) {
            return "16.5px";
          }
          if (widthInCm <= 9.8) {
            return "15px";
          }
          return "14px";
        }
      } catch (e) {
        // Fallback below
      }
    }

    // 2. Character length fallback: at 20px Cairo bold, ~28 characters correspond to 8cm
    const len = clean.length;
    if (len <= 28) return "20px";
    if (len <= 32) return "18px";
    if (len <= 36) return "16.5px";
    if (len <= 40) return "15px";
    return "14px";
  };

  // Direct print of the styled A4 pages
  const handlePrintA4 = () => {
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

  // Breakdown statistics for each printed page
  const pageStats = useMemo(() => {
    return Array.from({ length: totalPages }).map((_, pageIdx) => {
      const startIdx = pageIdx * ROWS_PER_PAGE;
      const pageCustomers = displayRows.slice(startIdx, startIdx + ROWS_PER_PAGE);
      const activeRows = pageCustomers.filter((r) => r.arabicName.trim().length > 0);

      let normalCount = 0;
      let urgentCount = 0;
      let finesCount = 0;
      const finesByType: Record<string, number> = {};

      activeRows.forEach((row) => {
        const details = resolveAmanDetails(row, invoices, services);
        if (details.serviceType === "مستعجل") {
          urgentCount++;
        } else {
          normalCount++;
        }

        if (details.hasFine) {
          finesCount++;
          const fName = details.fineName || "غرامة حكومية";
          finesByType[fName] = (finesByType[fName] || 0) + 1;
        }
      });

      const finesBreakdown = Object.entries(finesByType)
        .map(([name, count]) => `${name}: ${count}`)
        .join("، ");

      return {
        totalActive: activeRows.length,
        normalCount,
        urgentCount,
        finesCount,
        finesBreakdown,
        finesByType,
      };
    });
  }, [totalPages, displayRows, invoices, services]);

  // Overall report statistics across all pages
  const overallStats = useMemo(() => {
    const activeRows = displayRows.filter((r) => r.arabicName.trim().length > 0);
    let normalCount = 0;
    let urgentCount = 0;
    let finesCount = 0;
    const finesByType: Record<string, number> = {};

    activeRows.forEach((row) => {
      const details = resolveAmanDetails(row, invoices, services);
      if (details.serviceType === "مستعجل") {
        urgentCount++;
      } else {
        normalCount++;
      }

      if (details.hasFine) {
        finesCount++;
        const fName = details.fineName || "غرامة حكومية";
        finesByType[fName] = (finesByType[fName] || 0) + 1;
      }
    });

    const finesBreakdown = Object.entries(finesByType)
      .map(([name, count]) => `${name}: ${count}`)
      .join("، ");

    return {
      totalActive: activeRows.length,
      normalCount,
      urgentCount,
      finesCount,
      finesBreakdown,
      finesByType,
    };
  }, [displayRows, invoices, services]);

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
            <button
              type="button"
              onClick={handleAddNewRow}
              className="px-3.5 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-xs"
              title="إضافة سطر جديد للكتابة والتسجيل المباشر"
            >
              <Plus className="w-4 h-4" />
              إضافة سطر جديد ➕
            </button>

            <button
              type="button"
              disabled={isLoadingSheets}
              onClick={() => loadDataFromGoogleSheet(false)}
              className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
              title="إعادة تحميل البيانات مباشرة من جوجل شيت"
            >
              <RefreshCw className={`w-4 h-4 ${isLoadingSheets ? "animate-spin text-blue-600" : ""}`} />
              {isLoadingSheets ? "جاري الجلب من شيت..." : "تحديث من جوجل شيت 🔄"}
            </button>

            <button
              type="button"
              onClick={handleExportToExcel}
              className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors shadow-xs cursor-pointer"
            >
              <FileSpreadsheet className="w-4 h-4" />
              تصدير إكسيل (CSV)
            </button>

            <button
              type="button"
              onClick={handlePrintA4}
              className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors shadow-xs cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              طباعة الكشف A4 (35 صف)
            </button>
          </div>

        </div>

        {/* Tip & hint note */}
        <div className="bg-blue-50/70 border border-blue-100 rounded-xl px-3.5 py-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-blue-900">
          <div className="flex items-center gap-2">
            <span className="font-bold">💡 التسجيل المباشر على جوجل شيت:</span>
            <span>
              يتم جلب البيانات وتحميلها من ورقة الداتا شيت بجوجل شيت مباشرة، وعند كتابة أو تعديل أي اسم يتم تسجيله لحظياً ومباشرة على جوجل شيت دون تخزين محلي.
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

          {/* Statistics Badges */}
          <div className="flex flex-wrap items-center gap-2.5 pt-3">
            <div className="flex items-center gap-1.5 bg-slate-100 text-slate-800 px-3 py-1.5 rounded-xl text-xs font-bold border border-slate-200">
              <span>إجمالي المسجلين:</span>
              <span className="font-mono text-sm text-slate-950 font-black">{overallStats.totalActive}</span>
            </div>

            <div className="flex items-center gap-1.5 bg-emerald-50 text-emerald-800 px-3 py-1.5 rounded-xl text-xs font-bold border border-emerald-200">
              <span>جواز عادي:</span>
              <span className="font-mono text-sm text-emerald-950 font-black">{overallStats.normalCount}</span>
            </div>

            <div className="flex items-center gap-1.5 bg-amber-50 text-amber-800 px-3 py-1.5 rounded-xl text-xs font-bold border border-amber-200">
              <span>جواز عاجل / مستعجل:</span>
              <span className="font-mono text-sm text-amber-950 font-black">{overallStats.urgentCount}</span>
            </div>

            <div className="flex items-center gap-1.5 bg-purple-50 text-purple-800 px-3 py-1.5 rounded-xl text-xs font-bold border border-purple-200">
              <span>الغرامات الحكومية:</span>
              <span className="font-mono text-sm text-purple-950 font-black">{overallStats.finesCount}</span>
              {overallStats.finesBreakdown && (
                <span className="text-[11px] text-purple-700 font-normal mr-1">
                  ({overallStats.finesBreakdown})
                </span>
              )}
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
        <div ref={reportPrintRef} className="mx-auto text-black">
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
                  {/* Header Banner - Cairo 20 Bold */}
                  <div className="flex justify-between items-center border-b-2 border-black pb-1 mb-1 text-black font-cairo">
                    <div className="text-right" style={{ fontFamily: "'Cairo', sans-serif", fontSize: "20px", fontWeight: "bold" }}>
                      قسم جوازات طنطا
                    </div>
                    <div className="text-center" style={{ fontFamily: "'Cairo', sans-serif", fontSize: "20px", fontWeight: "bold" }}>
                      كشف حركة التابع للخدمات الجماهيرية
                    </div>
                    <div className="text-left" style={{ fontFamily: "'Cairo', sans-serif", fontSize: "20px", fontWeight: "bold" }}>
                      التاريخ: {headerDateDisplay}
                    </div>
                  </div>

                  {/* Table - 4 Columns: م (1cm), الاسم (9.5cm), تاريخ الميلاد (3.5cm), الملاحظات (باقي المساحة) */}
                  <table 
                    className="w-full border-2 border-black text-right" 
                    style={{ 
                      borderCollapse: "collapse", 
                      width: "100%", 
                      tableLayout: "fixed",
                      fontFamily: "'Cairo', sans-serif", 
                      direction: "rtl" 
                    }}
                  >
                    <colgroup>
                      <col style={{ width: "1cm" }} />
                      <col style={{ width: "9.5cm" }} />
                      <col style={{ width: "3.5cm" }} />
                      <col />
                    </colgroup>
                    <tbody>
                      {Array.from({ length: ROWS_PER_PAGE }).map((_, rIdx) => {
                        const globalIndex = startIdx + rIdx;
                        const row = pageCustomers[rIdx];
                        const absoluteNumber = globalIndex + 1;

                        const rowName = row ? row.arabicName : "";
                        const rowBirthDate = row ? row.birthDate : "";
                        const rowNotes = row ? row.notes : "";

                        return (
                          <tr 
                            key={rIdx} 
                            className="border border-black group hover:bg-blue-50/20 transition-colors" 
                            style={{ height: "7.1mm", maxHeight: "7.1mm" }}
                          >
                            {/* 1. Sequence Number */}
                            <td 
                              className="border border-black text-center font-bold p-0 bg-slate-50/30" 
                              style={{ width: "1cm", fontFamily: "'Cairo', sans-serif", fontSize: "20px", fontWeight: "bold", lineHeight: 1.1 }}
                            >
                              {absoluteNumber}
                            </td>

                            {/* 2. Customer Name (Editable In-Place) */}
                            {(() => {
                              const isEnglishDetected = /[a-zA-Z]/.test(rowName);
                              return (
                                <td 
                                  className={`border border-black text-right font-bold p-0 relative transition-all ${
                                    isEnglishDetected ? "bg-amber-100 ring-2 ring-amber-500 z-10" : ""
                                  }`} 
                                  style={{ 
                                    width: "9.5cm", 
                                    fontFamily: "'Cairo', sans-serif", 
                                    lineHeight: 1.1, 
                                    whiteSpace: "nowrap" 
                                  }}
                                >
                                  <div className="relative w-full h-full flex items-center">
                                    {/* Screen input: Interactive typing & auto-save on blur */}
                                    <input
                                      type="text"
                                      value={rowName}
                                      placeholder="اضغط لكتابة الاسم..."
                                      onChange={(e) => handleCellChange(globalIndex, "arabicName", e.target.value)}
                                      onBlur={() => handleCellBlur(globalIndex)}
                                      className={`w-full h-full border-0 px-1 text-right font-bold transition-colors print:hidden ${
                                        isEnglishDetected
                                          ? "bg-amber-100 text-amber-950 ring-2 ring-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-600"
                                          : "bg-transparent text-black focus:outline-none focus:ring-1 focus:ring-blue-500 focus:bg-blue-50/70"
                                      } rounded-xs`}
                                      style={{ 
                                        fontFamily: "'Cairo', sans-serif", 
                                        fontSize: getNameFontSize(rowName), 
                                        fontWeight: "bold", 
                                        lineHeight: 1.1 
                                      }}
                                    />
                                    {/* Print text: crisp, unclipped text with exact calculated font size */}
                                    <span
                                      className="hidden print:inline-block w-full text-right font-bold text-black px-1"
                                      style={{ 
                                        fontFamily: "'Cairo', sans-serif", 
                                        fontSize: getNameFontSize(rowName), 
                                        fontWeight: "bold", 
                                        lineHeight: 1.1,
                                        whiteSpace: "nowrap"
                                      }}
                                    >
                                      {rowName}
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

                            {/* 4. Notes - Light gray status: normal/urgent & fine status, readable and handwritten over */}
                            <td 
                              className="border border-black text-right p-0 relative" 
                              style={{ 
                                fontFamily: "'Cairo', sans-serif", 
                                lineHeight: 1.1 
                              }}
                            >
                              {rowName.trim().length > 0 && (() => {
                                const noteInfo = resolveAmanDetails(row, invoices, services);
                                return (
                                  <div className="w-full h-full flex items-center justify-between px-1.5 overflow-hidden">
                                    <span
                                      className="notes-light-gray select-all font-semibold"
                                      style={{
                                        color: "#9ca3af",
                                        fontFamily: "'Cairo', sans-serif",
                                        fontSize: "12.5px",
                                        fontWeight: "600",
                                        lineHeight: 1.1,
                                        WebkitPrintColorAdjust: "exact",
                                        printColorAdjust: "exact",
                                      }}
                                    >
                                      {noteInfo.statusText}
                                      {rowNotes && rowNotes !== noteInfo.statusText && (
                                        <span style={{ color: "#64748b", marginRight: "4px" }}> ({rowNotes})</span>
                                      )}
                                    </span>
                                  </div>
                                );
                              })()}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Signoff Section & Small Reference Breakdown requested by user */}
                <div 
                  className="flex justify-between items-center px-2 pt-1 mt-1 border-t-2 border-black text-black font-cairo"
                  style={{ height: "14mm", maxHeight: "15mm", boxSizing: "border-box" }}
                >
                  {/* Right: Signature */}
                  <div className="flex items-center gap-2" style={{ fontFamily: "'Cairo', sans-serif", fontSize: "16px", fontWeight: "bold" }}>
                    <span>رئيس القسم :</span>
                    <span className="inline-block border-b-2 border-dotted border-black w-36 sm:w-48 h-3 mb-1"></span>
                  </div>

                  {/* Left: Small font reference breakdown requested by user */}
                  <div 
                    className="flex items-center gap-2 border border-black/50 px-2.5 py-0.5 rounded-sm bg-slate-50/90 print:bg-transparent print:border-black/60"
                    style={{ 
                      fontFamily: "'Cairo', sans-serif", 
                      fontSize: "10.5px", 
                      fontWeight: "bold",
                      lineHeight: 1.2 
                    }}
                  >
                    <span className="font-extrabold text-slate-900">📌 تفصيلة الكشف:</span>
                    <span>عادي: <strong className="text-black">{pageStats[pageIdx]?.normalCount || 0}</strong></span>
                    <span>|</span>
                    <span>عاجل: <strong className="text-black">{pageStats[pageIdx]?.urgentCount || 0}</strong></span>
                    <span>|</span>
                    <span>
                      الغرامات: <strong className="text-black">{pageStats[pageIdx]?.finesCount || 0}</strong>
                      {pageStats[pageIdx]?.finesBreakdown ? ` (${pageStats[pageIdx].finesBreakdown})` : " (لا توجد)"}
                    </span>
                    {totalPages > 1 && (
                      <span className="text-[9.5px] text-slate-500 font-normal mr-1">
                        [ص {pageIdx + 1}/{totalPages}]
                      </span>
                    )}
                  </div>
                </div>

              </div>
            );
          })}
        </div>
      </div>

    </div>
  );
}
