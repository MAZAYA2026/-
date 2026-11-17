import React, { useState, useRef, useEffect } from "react";
import {
  Zap,
  X,
  ClipboardPaste,
  Table2,
  FileSpreadsheet,
  Plus,
  Trash2,
  Download,
  Upload,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Image as ImageIcon,
  Wand2,
} from "lucide-react";
import {
  DictionaryItem,
  PotentialCustomer,
  DEFAULT_APPLICANT_CAPACITIES,
} from "../types";
import {
  ParsedFastCustomer,
  QUICK_PROFESSIONS,
  createEmptyFastCustomer,
  normalizeDigits,
  extractBirthDateFromNationalId,
  inferDocAndProfessionFromBirthDate,
  translateNameWithDictionary,
  parsePastedCustomerText,
  parseCsvCustomers,
  toPotentialCustomerPayload,
  downloadFastImportCsvTemplate,
} from "../lib/fastCustomerParser";

export type FastEntryTab = "paste" | "grid" | "csv";

interface FastPotentialCustomerModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: FastEntryTab;
  dictionary?: DictionaryItem[];
  applicantCapacities?: string[];
  onSaveBatch: (
    customers: Partial<PotentialCustomer>[],
    useFirstImmediately?: boolean
  ) => Promise<void>;
  allowDirectUse?: boolean;
}

const SAMPLE_WHATSAPP_TEXT = `1- أحمد محمد علي حسن
الرقم القومي: 29508121601234
المهنة: محاسب
الهاتف: 01012345678

2- يوسف أحمد محمد علي
31504101605678
طالب - 01012345678`;

export default function FastPotentialCustomerModal({
  isOpen,
  onClose,
  initialTab = "paste",
  dictionary = [],
  applicantCapacities = DEFAULT_APPLICANT_CAPACITIES,
  onSaveBatch,
  allowDirectUse = true,
}: FastPotentialCustomerModalProps) {
  const [activeTab, setActiveTab] = useState<FastEntryTab>(initialTab);

  // Paste tab state
  const [pasteText, setPasteText] = useState("");
  const [pasteRows, setPasteRows] = useState<ParsedFastCustomer[]>([]);

  // Multi-row grid tab state
  const [gridRows, setGridRows] = useState<ParsedFastCustomer[]>([
    createEmptyFastCustomer(0),
    createEmptyFastCustomer(1),
    createEmptyFastCustomer(2),
  ]);

  // CSV tab state
  const [csvFileName, setCsvFileName] = useState<string>("");
  const [csvRows, setCsvRows] = useState<ParsedFastCustomer[]>([]);
  const csvInputRef = useRef<HTMLInputElement | null>(null);

  // Save & feedback state
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
      setErrorMsg(null);
    }
  }, [isOpen, initialTab]);

  // Auto-parse WhatsApp / text paste instantaneously on input change (0ms client-side)
  const handlePasteTextChange = (val: string) => {
    setPasteText(val);
    setErrorMsg(null);
    if (!val.trim()) {
      setPasteRows([]);
      return;
    }
    const parsed = parsePastedCustomerText(val, dictionary);
    setPasteRows(parsed);
  };

  // Generic smart field updater for any tab's row list
  const updateRowField = (
    setter: React.Dispatch<React.SetStateAction<ParsedFastCustomer[]>>,
    tempId: string,
    field: keyof ParsedFastCustomer,
    rawValue: string
  ) => {
    setErrorMsg(null);
    setter((prev) =>
      prev.map((row) => {
        if (row.tempId !== tempId) return row;
        const next = { ...row };

        if (field === "arabicName") {
          next.arabicName = rawValue;
          next.englishName = translateNameWithDictionary(rawValue, dictionary);
        } else if (field === "englishName") {
          next.englishName = rawValue.toUpperCase();
        } else if (field === "nationalId") {
          const cleanNid = normalizeDigits(rawValue).replace(/\D/g, "").slice(0, 14);
          next.nationalId = cleanNid;
          if (cleanNid.length === 14) {
            const derivedBirth = extractBirthDateFromNationalId(cleanNid);
            if (derivedBirth) {
              next.birthDate = derivedBirth;
              const inferred = inferDocAndProfessionFromBirthDate(derivedBirth);
              next.documentType = inferred.documentType;
              if (!next.profession.trim() && inferred.suggestedProfession) {
                next.profession = inferred.suggestedProfession;
              }
            }
          }
        } else if (field === "birthDate") {
          next.birthDate = rawValue;
          const inferred = inferDocAndProfessionFromBirthDate(rawValue);
          if (rawValue) {
            next.documentType = inferred.documentType;
            if (!next.profession.trim() && inferred.suggestedProfession) {
              next.profession = inferred.suggestedProfession;
            }
          }
        } else if (field === "phone") {
          next.phone = normalizeDigits(rawValue).replace(/\D/g, "").slice(0, 11);
        } else if (field === "documentType") {
          next.documentType = rawValue as ParsedFastCustomer["documentType"];
        } else {
          (next as any)[field] = rawValue;
        }

        return next;
      })
    );
  };

  const removeRow = (
    setter: React.Dispatch<React.SetStateAction<ParsedFastCustomer[]>>,
    tempId: string
  ) => {
    setter((prev) => prev.filter((r) => r.tempId !== tempId));
  };

  // Optional fast local image attachment (without triggering slow AI OCR)
  const handleAttachLocalImage = (tempId: string, file?: File) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = (e.target?.result as string) || "";
      if (!dataUrl) return;
      setGridRows((prev) =>
        prev.map((r) => (r.tempId === tempId ? { ...r, cardFrontImage: dataUrl } : r))
      );
    };
    reader.readAsDataURL(file);
  };

  // CSV file reader (0ms local parse)
  const handleCsvUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvFileName(file.name);
    setErrorMsg(null);

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = (ev.target?.result as string) || "";
      const parsed = parseCsvCustomers(text, dictionary);
      if (parsed.length === 0) {
        setErrorMsg("لم يتم العثور على صفوف صالحة داخل الملف. تأكد من تنسيق الأعمدة أو حمّل النموذج الجاهز.");
      }
      setCsvRows(parsed);
    };
    reader.onerror = () => {
      setErrorMsg("تعذر قراءة الملف المحدد.");
    };
    reader.readAsText(file, "UTF-8");
    e.target.value = "";
  };

  const currentRows =
    activeTab === "paste" ? pasteRows : activeTab === "grid" ? gridRows : csvRows;

  const nonEmptyRows = currentRows.filter(
    (r) => r.arabicName.trim().length > 0 || r.nationalId.trim().length > 0
  );

  const validRows = nonEmptyRows.filter(
    (r) => r.arabicName.trim().length > 0 && r.nationalId.trim().length === 14
  );

  const invalidRowsCount = nonEmptyRows.length - validRows.length;

  const handleSaveAll = async (useFirstImmediately = false) => {
    setErrorMsg(null);
    if (nonEmptyRows.length === 0) {
      setErrorMsg("أدخل بيانات عميل واحد على الأقل قبل الحفظ.");
      return;
    }
    if (invalidRowsCount > 0) {
      setErrorMsg(
        `يوجد ${invalidRowsCount} صف ينقصه الاسم بالعربي أو الرقم القومي المكون من 14 رقم. يرجى استكماله أو حذفه.`
      );
      return;
    }

    setIsSaving(true);
    try {
      const payloads = validRows.map(toPotentialCustomerPayload);
      await onSaveBatch(payloads, useFirstImmediately);
      // Reset states after successful save
      setPasteText("");
      setPasteRows([]);
      setGridRows([
        createEmptyFastCustomer(0),
        createEmptyFastCustomer(1),
        createEmptyFastCustomer(2),
      ]);
      setCsvFileName("");
      setCsvRows([]);
      onClose();
    } catch (err: any) {
      setErrorMsg(err?.message || "حدث خطأ أثناء الحفظ.");
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  const renderEditableTable = (
    rows: ParsedFastCustomer[],
    setter: React.Dispatch<React.SetStateAction<ParsedFastCustomer[]>>,
    showImageColumn = false
  ) => (
    <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white">
      <div className="overflow-x-auto">
        <table className="w-full text-right border-collapse text-xs">
          <thead>
            <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
              <th className="p-2.5 w-8 text-center">#</th>
              <th className="p-2.5 min-w-[180px]">الاسم بالكامل (عربي) *</th>
              <th className="p-2.5 min-w-[160px]">الاسم بالإنجليزي (قاموس تلقائي)</th>
              <th className="p-2.5 min-w-[145px]">الرقم القومي (14 رقم) *</th>
              <th className="p-2.5 min-w-[130px]">تاريخ الميلاد (تلقائي)</th>
              <th className="p-2.5 min-w-[155px]">المهنة</th>
              <th className="p-2.5 min-w-[120px]">الهاتف</th>
              <th className="p-2.5 min-w-[125px]">نوع المستند</th>
              {showImageColumn && <th className="p-2.5 w-20 text-center">صورة (اختياري)</th>}
              <th className="p-2.5 w-10 text-center">حذف</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row, idx) => {
              const nidValid = row.nationalId.length === 14;
              const nidHasPartial = row.nationalId.length > 0 && row.nationalId.length !== 14;
              return (
                <tr key={row.tempId} className="hover:bg-slate-50/70 align-top">
                  <td className="p-2 text-center font-mono font-bold text-slate-500 pt-3">
                    {idx + 1}
                  </td>

                  <td className="p-2">
                    <input
                      type="text"
                      value={row.arabicName}
                      onChange={(e) => updateRowField(setter, row.tempId, "arabicName", e.target.value)}
                      placeholder="الاسم الرباعي..."
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                    />
                  </td>

                  <td className="p-2">
                    <input
                      type="text"
                      value={row.englishName}
                      onChange={(e) => updateRowField(setter, row.tempId, "englishName", e.target.value)}
                      placeholder="AUTO ENGLISH..."
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-[11px] font-mono font-bold text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                    />
                  </td>

                  <td className="p-2">
                    <input
                      type="text"
                      maxLength={14}
                      value={row.nationalId}
                      onChange={(e) => updateRowField(setter, row.tempId, "nationalId", e.target.value)}
                      placeholder="29508121601234"
                      className={`w-full border rounded-lg px-2.5 py-1.5 text-xs font-mono font-bold focus:outline-hidden focus:ring-2 ${
                        nidHasPartial
                          ? "bg-rose-50 border-rose-300 text-rose-800 focus:ring-rose-400"
                          : nidValid
                            ? "bg-emerald-50/50 border-emerald-300 text-emerald-900 focus:ring-emerald-500"
                            : "bg-slate-50 border-slate-200 text-slate-900 focus:ring-emerald-500"
                      }`}
                    />
                    {nidHasPartial && (
                      <span className="text-[10px] text-rose-600 font-bold block mt-0.5">
                        {row.nationalId.length}/14 رقم
                      </span>
                    )}
                  </td>

                  <td className="p-2">
                    <input
                      type="date"
                      value={row.birthDate}
                      onChange={(e) => updateRowField(setter, row.tempId, "birthDate", e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-mono font-bold text-slate-800"
                    />
                  </td>

                  <td className="p-2 space-y-1">
                    <input
                      type="text"
                      maxLength={32}
                      value={row.profession}
                      onChange={(e) => updateRowField(setter, row.tempId, "profession", e.target.value)}
                      placeholder="المهنة..."
                      list={`fast-prof-list-${row.tempId}`}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-800"
                    />
                    <datalist id={`fast-prof-list-${row.tempId}`}>
                      {QUICK_PROFESSIONS.map((p) => (
                        <option key={p} value={p} />
                      ))}
                    </datalist>
                    <div className="flex flex-wrap gap-1">
                      {["طالب", "طفل", "ربة منزل", "موظف"].map((chip) => (
                        <button
                          key={chip}
                          type="button"
                          onClick={() => updateRowField(setter, row.tempId, "profession", chip)}
                          className={`text-[10px] px-1.5 py-0.5 rounded font-bold cursor-pointer transition-colors ${
                            row.profession === chip
                              ? "bg-emerald-600 text-white"
                              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                          }`}
                        >
                          {chip}
                        </button>
                      ))}
                    </div>
                  </td>

                  <td className="p-2">
                    <input
                      type="tel"
                      maxLength={11}
                      value={row.phone}
                      onChange={(e) => updateRowField(setter, row.tempId, "phone", e.target.value)}
                      placeholder="01XXXXXXXXX"
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-mono font-bold text-slate-800"
                    />
                  </td>

                  <td className="p-2">
                    <select
                      value={row.documentType}
                      onChange={(e) => updateRowField(setter, row.tempId, "documentType", e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-bold text-slate-800"
                    >
                      <option value="بطاقة_رقم_قومي">بطاقة رقم قومي</option>
                      <option value="شهادة_ميلاد">شهادة ميلاد</option>
                      <option value="يدوي">إدخال يدوي</option>
                    </select>
                  </td>

                  {showImageColumn && (
                    <td className="p-2 text-center pt-2.5">
                      <label className="inline-flex items-center justify-center p-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 cursor-pointer text-slate-600" title="إرفاق صورة حفظاً فقط بدون ذكاء اصطناعي">
                        {row.cardFrontImage ? (
                          <img src={row.cardFrontImage} alt="مرفق" className="w-6 h-6 object-cover rounded" />
                        ) : (
                          <ImageIcon className="w-4 h-4" />
                        )}
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => handleAttachLocalImage(row.tempId, e.target.files?.[0])}
                        />
                      </label>
                    </td>
                  )}

                  <td className="p-2 text-center pt-2.5">
                    <button
                      type="button"
                      onClick={() => removeRow(setter, row.tempId)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                      title="حذف الصف"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/75 backdrop-blur-xs font-cairo">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-6xl max-h-[92vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 bg-linear-to-r from-emerald-900 via-teal-900 to-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-500/20 rounded-xl border border-emerald-400/30 text-emerald-300">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold flex items-center gap-2">
                <span>إدخال سريع للعملاء المحتملين (بدون ذكاء اصطناعي)</span>
                <span className="text-[10px] bg-emerald-500/25 text-emerald-200 px-2.5 py-0.5 rounded-full border border-emerald-400/30 font-bold">
                  استجابة فورية 0 ثانية
                </span>
              </h2>
              <p className="text-xs text-slate-200/90">
                يستخرج تاريخ الميلاد والنوع تلقائياً من الـ 14 رقم ويترجم الاسم فوراً من القاموس المحلي بدون انتظار الذكاء الاصطناعي
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-300 hover:text-white hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mode Switcher Tabs */}
        <div className="px-6 pt-4 pb-2 bg-slate-50 border-b border-slate-200 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              setActiveTab("paste");
              setErrorMsg(null);
            }}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === "paste"
                ? "bg-emerald-600 text-white shadow-sm"
                : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-100"
            }`}
          >
            <ClipboardPaste className="w-4 h-4" />
            <span>1. لصق نص / رسالة واتساب</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab("grid");
              setErrorMsg(null);
            }}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === "grid"
                ? "bg-emerald-600 text-white shadow-sm"
                : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-100"
            }`}
          >
            <Table2 className="w-4 h-4" />
            <span>2. جدول الإدخال السريع (عائلة / مجموعة)</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab("csv");
              setErrorMsg(null);
            }}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === "csv"
                ? "bg-emerald-600 text-white shadow-sm"
                : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-100"
            }`}
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>3. استيراد ملف إكسيل (CSV)</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {errorMsg && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs font-bold text-rose-800 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* TAB 1: Paste WhatsApp / Text */}
          {activeTab === "paste" && (
            <div className="space-y-4">
              <div className="bg-emerald-50/70 border border-emerald-200 rounded-2xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-emerald-950">
                <div className="flex items-start gap-2">
                  <Wand2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold">الصق رسالة العميل من الواتساب أو أي نص (عميل واحد أو أكثر دفعة واحدة)</p>
                    <p className="text-[11px] text-emerald-800">
                      يتم تفكيك الاسم والرقم القومي (حتى بالأرقام العربية ٠-٩) والهاتف والمهنة وتاريخ الميلاد والاسم الإنجليزي لحظياً.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handlePasteTextChange(SAMPLE_WHATSAPP_TEXT)}
                  className="px-3 py-1.5 bg-white border border-emerald-300 hover:bg-emerald-100 text-emerald-900 rounded-xl text-[11px] font-bold shrink-0 cursor-pointer"
                >
                  تجربة مثال جاهز ✨
                </button>
              </div>

              <textarea
                rows={5}
                value={pasteText}
                onChange={(e) => handlePasteTextChange(e.target.value)}
                placeholder={`الصق هنا بيانات عميل أو عدة عملاء بأي تنسيق، مثال:\nأحمد محمد علي حسن - 29508121601234 - محاسب - 01012345678\nأو على سطور منفصلة لكل عميل...`}
                className="w-full bg-slate-50 border border-slate-300 rounded-2xl p-3.5 text-xs font-bold text-slate-900 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
              />

              {pasteRows.length > 0 ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-800 flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      <span>تم استخراج ({pasteRows.length}) عميل تلقائياً — يمكنك المراجعة والتعديل قبل الحفظ:</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setPasteRows((prev) => [...prev, createEmptyFastCustomer(prev.length)])}
                      className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-bold flex items-center gap-1 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>إضافة صف</span>
                    </button>
                  </div>
                  {renderEditableTable(pasteRows, setPasteRows, false)}
                </div>
              ) : (
                <div className="text-center py-6 border border-dashed border-slate-200 rounded-2xl text-xs text-slate-400">
                  قم بلصق النص في المربع أعلاه لتظهر النتائج فوراً هنا
                </div>
              )}
            </div>
          )}

          {/* TAB 2: Rapid Multi-Row Table */}
          {activeTab === "grid" && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 border border-slate-200 rounded-2xl p-3 text-xs">
                <span className="font-bold text-slate-700">
                  اكتب الاسم والـ 14 رقم مباشرة لكل فرد وسيتم حساب تاريخ الميلاد والترجمة الإنجليزية تلقائياً في نفس اللحظة:
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setGridRows((prev) => [...prev, createEmptyFastCustomer(prev.length)])
                    }
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>+ صف</span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setGridRows((prev) => [
                        ...prev,
                        ...Array.from({ length: 5 }, (_, i) => createEmptyFastCustomer(prev.length + i)),
                      ])
                    }
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>+ 5 صفوف</span>
                  </button>
                </div>
              </div>

              {renderEditableTable(gridRows, setGridRows, true)}
            </div>
          )}

          {/* TAB 3: CSV / Excel Import */}
          {activeTab === "csv" && (
            <div className="space-y-4">
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="space-y-1 text-center sm:text-right">
                  <h3 className="text-sm font-bold text-slate-900">
                    استيراد قائمة عملاء من ملف إكسيل (CSV / TSV)
                  </h3>
                  <p className="text-xs text-slate-600">
                    قراءة فورية للملف داخل المتصفح مع حساب تاريخ الميلاد وترجمة الأسماء تلقائياً من القاموس.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={downloadFastImportCsvTemplate}
                    className="px-3.5 py-2.5 bg-white border border-slate-300 hover:bg-slate-100 text-slate-800 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                  >
                    <Download className="w-4 h-4 text-emerald-600" />
                    <span>تحميل نموذج إكسيل جاهز</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => csvInputRef.current?.click()}
                    className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm cursor-pointer"
                  >
                    <Upload className="w-4 h-4" />
                    <span>{csvFileName ? `تغيير الملف (${csvFileName})` : "اختيار ملف CSV للاستيراد"}</span>
                  </button>
                  <input
                    ref={csvInputRef}
                    type="file"
                    accept=".csv,.tsv,.txt"
                    onChange={handleCsvUpload}
                    className="hidden"
                  />
                </div>
              </div>

              {csvRows.length > 0 ? (
                <div className="space-y-2">
                  <div className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>تم تحميل ({csvRows.length}) صف من الملف — راجع البيانات ثم اضغط حفظ:</span>
                  </div>
                  {renderEditableTable(csvRows, setCsvRows, false)}
                </div>
              ) : (
                <div className="text-center py-8 border border-dashed border-slate-200 rounded-2xl text-xs text-slate-400">
                  اختر ملف CSV أو قم بتحميل النموذج الجاهز وتعبئته في الإكسيل ثم رفعه هنا
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 text-xs">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-slate-300 text-slate-700 hover:bg-slate-200 rounded-xl font-bold cursor-pointer"
            >
              إغلاق
            </button>
            <span className="font-bold text-slate-600">
              جاهز للحفظ:{" "}
              <span className="text-emerald-700 font-mono">{validRows.length}</span>
              {invalidRowsCount > 0 && (
                <span className="text-rose-600 mr-2">
                  (ناقص بيانات: {invalidRowsCount})
                </span>
              )}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={isSaving || validRows.length === 0}
              onClick={() => handleSaveAll(false)}
              className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all"
            >
              <span>
                {isSaving
                  ? "جاري الحفظ..."
                  : `💾 حفظ (${validRows.length}) في العملاء المحتملين`}
              </span>
            </button>

            {allowDirectUse && validRows.length > 0 && (
              <button
                type="button"
                disabled={isSaving}
                onClick={() => handleSaveAll(true)}
                className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-md cursor-pointer transition-all"
              >
                <Sparkles className="w-4 h-4" />
                <span>
                  {validRows.length === 1
                    ? "⚡ حفظ وإنشاء فاتورة الآن"
                    : "⚡ حفظ الكل وإنشاء فاتورة للأول"}
                </span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
