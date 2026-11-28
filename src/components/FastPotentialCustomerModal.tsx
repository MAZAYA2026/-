import React, { useState, useRef, useEffect } from "react";
import {
  Zap,
  X,
  ClipboardPaste,
  Plus,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Wand2,
  Mic,
  Square,
  Loader2,
  Check,
} from "lucide-react";
import {
  DictionaryItem,
  PotentialCustomer,
  DEFAULT_APPLICANT_CAPACITIES,
} from "../types";
import { parseVoiceCustomerWithAI } from "../lib/api";
import {
  ParsedFastCustomer,
  QUICK_PROFESSIONS,
  createEmptyFastCustomer,
  normalizeDigits,
  extractBirthDateFromNationalId,
  inferDocAndProfessionFromBirthDate,
  translateNameWithDictionary,
  parsePastedCustomerText,
  toPotentialCustomerPayload,
} from "../lib/fastCustomerParser";

interface FastPotentialCustomerModalProps {
  isOpen: boolean;
  onClose: () => void;
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
  dictionary = [],
  applicantCapacities = DEFAULT_APPLICANT_CAPACITIES,
  onSaveBatch,
  allowDirectUse = true,
}: FastPotentialCustomerModalProps) {
  // Paste & Voice workspace state
  const [pasteText, setPasteText] = useState("");
  const [pasteRows, setPasteRows] = useState<ParsedFastCustomer[]>([]);

  // Voice dictation state
  const [voiceStatus, setVoiceStatus] = useState<"idle" | "recording" | "processing">("idle");
  const [voiceElapsedSec, setVoiceElapsedSec] = useState<number>(0);
  const [voiceFeedback, setVoiceFeedback] = useState<{
    type: "success" | "error";
    text: string;
    transcript?: string;
  } | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const voiceTimerRef = useRef<number | null>(null);
  const voiceCancelledRef = useRef<boolean>(false);
  const rowsTableRef = useRef<HTMLDivElement | null>(null);

  // Save & feedback state
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const cleanupVoiceResources = () => {
    if (voiceTimerRef.current !== null) {
      window.clearInterval(voiceTimerRef.current);
      voiceTimerRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {}
      });
      mediaStreamRef.current = null;
    }
    mediaRecorderRef.current = null;
  };

  const cancelVoiceDictation = () => {
    voiceCancelledRef.current = true;
    try {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
      }
    } catch {}
    cleanupVoiceResources();
    setVoiceStatus("idle");
    setVoiceElapsedSec(0);
  };

  const stopVoiceDictation = () => {
    voiceCancelledRef.current = false;
    try {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
      } else {
        cleanupVoiceResources();
        setVoiceStatus("idle");
        setVoiceElapsedSec(0);
      }
    } catch {
      cleanupVoiceResources();
      setVoiceStatus("idle");
      setVoiceElapsedSec(0);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setErrorMsg(null);
    } else {
      cancelVoiceDictation();
    }
  }, [isOpen]);

  useEffect(() => {
    return () => {
      voiceCancelledRef.current = true;
      try {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
          mediaRecorderRef.current.stop();
        }
      } catch {}
      cleanupVoiceResources();
    };
  }, []);

  const formatVoiceTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  };

  const startVoiceDictation = async () => {
    if (voiceStatus !== "idle") return;

    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === "undefined"
    ) {
      setVoiceFeedback({
        type: "error",
        text: "المتصفح الحالي لا يدعم تسجيل الصوت بالميكروفون. يرجى استخدام متصفح حديث مثل Chrome أو Edge.",
      });
      return;
    }

    setVoiceFeedback(null);
    setErrorMsg(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      const preferredTypes = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/mp4",
        "audio/ogg;codecs=opus",
        "audio/ogg",
      ];
      const chosenType = preferredTypes.find((t) => {
        try {
          return MediaRecorder.isTypeSupported(t);
        } catch {
          return false;
        }
      });

      const recorder = chosenType
        ? new MediaRecorder(stream, { mimeType: chosenType })
        : new MediaRecorder(stream);

      mediaStreamRef.current = stream;
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];
      voiceCancelledRef.current = false;

      recorder.ondataavailable = (event: BlobEvent) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onerror = () => {
        cleanupVoiceResources();
        setVoiceStatus("idle");
        setVoiceElapsedSec(0);
        setVoiceFeedback({
          type: "error",
          text: "حدث خطأ غير متوقع أثناء التسجيل الصوتي. يرجى المحاولة مرة أخرى.",
        });
      };

      recorder.onstop = async () => {
        const wasCancelled = voiceCancelledRef.current;
        const rawMime = recorder.mimeType || chosenType || "audio/webm";
        const baseMime = rawMime.split(";")[0].trim() || "audio/webm";
        const chunks = [...audioChunksRef.current];
        audioChunksRef.current = [];
        cleanupVoiceResources();

        if (wasCancelled) {
          setVoiceStatus("idle");
          setVoiceElapsedSec(0);
          return;
        }

        const audioBlob = new Blob(chunks, { type: baseMime });
        if (audioBlob.size < 400) {
          setVoiceStatus("idle");
          setVoiceElapsedSec(0);
          setVoiceFeedback({
            type: "error",
            text: "التسجيل قصير جداً أو لم يُلتقط صوت واضح. اضغط على الميكروفون وتحدث بجملة واضحة ثم اضغط إيقاف.",
          });
          return;
        }

        setVoiceStatus("processing");
        try {
          const dataUrl: string = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
              if (typeof reader.result === "string") {
                resolve(reader.result);
              } else {
                reject(new Error("تعذر قراءة الملف الصوتي."));
              }
            };
            reader.onerror = () => reject(new Error("تعذر قراءة الملف الصوتي."));
            reader.readAsDataURL(audioBlob);
          });

          const response = await parseVoiceCustomerWithAI({
            audio: dataUrl,
            mimeType: baseMime,
            applicantCapacities,
            allowMultiple: true,
          });

          const rawList =
            Array.isArray(response.customers) && response.customers.length > 0
              ? response.customers
              : response.extracted
                ? [response.extracted]
                : [];

          const newRows: ParsedFastCustomer[] = [];
          const formattedBlocks: string[] = [];
          const seedBase = Date.now();

          rawList.forEach((ex, idx) => {
            const cleanNid = normalizeDigits(ex?.nationalId || "").replace(/\D/g, "").slice(0, 14);
            const cleanPhone = normalizeDigits(ex?.phone || "").replace(/\D/g, "").slice(0, 11);
            const cleanName = (ex?.arabicName || "").trim();
            const cleanProf = (ex?.profession || "").trim().slice(0, 32);
            const cleanCapacity = (ex?.applicantCapacity || "").trim();

            if (!cleanName && !cleanNid && !cleanProf && !cleanPhone) return;

            const derivedBirth =
              extractBirthDateFromNationalId(cleanNid) ||
              (ex?.birthDate ? ex.birthDate.replace(/\//g, "-") : "");
            const inferred = inferDocAndProfessionFromBirthDate(derivedBirth);
            const finalProf = cleanProf || inferred.suggestedProfession || "";

            const blockLines: string[] = [];
            if (cleanName) blockLines.push(cleanName);
            if (cleanNid) blockLines.push(`الرقم القومي: ${cleanNid}`);
            if (finalProf) blockLines.push(`المهنة: ${finalProf}`);
            if (cleanPhone) blockLines.push(`الهاتف: ${cleanPhone}`);
            if (blockLines.length > 0) {
              formattedBlocks.push(blockLines.join("\n"));
            }

            newRows.push({
              tempId: `voice-${seedBase}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
              arabicName: cleanName,
              englishName: cleanName ? translateNameWithDictionary(cleanName, dictionary) : "",
              nationalId: cleanNid,
              birthDate: derivedBirth,
              profession: finalProf,
              phone: cleanPhone,
              applicantCapacity: cleanCapacity,
              documentType: derivedBirth
                ? inferred.documentType
                : cleanNid
                  ? "بطاقة_رقم_قومي"
                  : "يدوي",
              notes: "",
            });
          });

          if (newRows.length === 0) {
            setVoiceFeedback({
              type: "error",
              text: "لم يتم التعرف على بيانات عملاء من التسجيل الصوتي. يرجى ذكر الأسماء والأرقام القومية والمهن بوضوح.",
              transcript: response.transcript || undefined,
            });
          } else {
            const joinedBlocks = formattedBlocks.join("\n\n");
            if (joinedBlocks) {
              setPasteText((prev) =>
                prev.trim() ? `${prev.trim()}\n\n${joinedBlocks}` : joinedBlocks
              );
            }

            setPasteRows((prev) => [...prev, ...newRows]);

            setTimeout(() => {
              rowsTableRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
            }, 60);

            setVoiceFeedback({
              type: "success",
              text:
                newRows.length === 1
                  ? "تم إنشاء صف جديد وإدراج بيانات العميل بالصوت تلقائياً — يمكنك الإملاء لفرد آخر أو الحفظ الآن."
                  : `تم إنشاء (${newRows.length}) صفوف جديدة تلقائياً لكافة الأفراد من التسجيل الصوتي — يمكنك المراجعة أو إضافة المزيد أو الحفظ الآن.`,
              transcript: response.transcript || undefined,
            });
          }
        } catch (err: any) {
          setVoiceFeedback({
            type: "error",
            text: err?.message || "تعذر تحليل التسجيل الصوتي، يرجى المحاولة مرة أخرى.",
          });
        } finally {
          setVoiceStatus("idle");
          setVoiceElapsedSec(0);
        }
      };

      setVoiceElapsedSec(0);
      setVoiceStatus("recording");
      recorder.start(250);

      voiceTimerRef.current = window.setInterval(() => {
        setVoiceElapsedSec((prev) => {
          const next = prev + 1;
          if (next >= 120) {
            stopVoiceDictation();
          }
          return next;
        });
      }, 1000);
    } catch (err: any) {
      cleanupVoiceResources();
      let msg = "تعذر الوصول إلى الميكروفون. يرجى التأكد من توصيله والسماح به من إعدادات المتصفح.";
      if (err?.name === "NotAllowedError" || err?.name === "PermissionDeniedError") {
        msg = "تم رفض إذن الميكروفون. يرجى السماح للموقع باستخدام الميكروفون من شريط العنوان ثم المحاولة مجدداً.";
      } else if (err?.name === "NotFoundError" || err?.name === "DevicesNotFoundError") {
        msg = "لم يتم العثور على ميكروفون متصل بهذا الجهاز.";
      }
      setVoiceFeedback({
        type: "error",
        text: msg,
      });
    }
  };

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

  // Generic smart field updater for preview table rows
  const updateRowField = (
    tempId: string,
    field: keyof ParsedFastCustomer,
    rawValue: string
  ) => {
    setErrorMsg(null);
    setPasteRows((prev) =>
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

  const removeRow = (tempId: string) => {
    setPasteRows((prev) => prev.filter((r) => r.tempId !== tempId));
  };

  const nonEmptyRows = pasteRows.filter(
    (r) => r.arabicName.trim().length > 0 || r.nationalId.trim().length > 0
  );

  const validRows = nonEmptyRows.filter(
    (r) =>
      r.arabicName.trim().length > 0 &&
      (r.nationalId.trim().length === 0 || r.nationalId.trim().length === 14)
  );

  const invalidRowsCount = nonEmptyRows.length - validRows.length;

  const handleSaveAll = async (useFirstImmediately = false) => {
    setErrorMsg(null);
    if (nonEmptyRows.length === 0) {
      setErrorMsg("أدخل بيانات عميل واحد على الأقل عبر اللصق أو الإملاء الصوتي قبل الحفظ.");
      return;
    }
    if (invalidRowsCount > 0) {
      setErrorMsg(
        `يوجد ${invalidRowsCount} صف ينقصه الاسم بالعربي أو يحتوي على رقم قومي غير مكتمل (اتركه فارغاً أو أدخل 14 رقماً). يرجى استكماله أو حذفه.`
      );
      return;
    }

    if (voiceStatus !== "idle") {
      cancelVoiceDictation();
    }

    setIsSaving(true);
    try {
      const familyGroupId = `fam-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const headName = validRows[0].arabicName
        .trim()
        .split(/\s+/)
        .slice(0, 3)
        .join(" ");
      const familyGroupLabel =
        validRows.length > 1 ? `أسرة ${headName}` : headName;

      const payloads = validRows.map((row) => ({
        ...toPotentialCustomerPayload(row),
        familyGroupId,
        familyGroupLabel,
      }));
      await onSaveBatch(payloads, useFirstImmediately);
      setPasteText("");
      setPasteRows([]);
      setVoiceFeedback(null);
      onClose();
    } catch (err: any) {
      setErrorMsg(err?.message || "حدث خطأ أثناء الحفظ.");
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div dir="rtl" className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/75 backdrop-blur-xs font-cairo">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-6xl max-h-[92vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 bg-linear-to-r from-emerald-900 via-teal-900 to-slate-900 text-white flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2.5 bg-emerald-500/20 rounded-xl border border-emerald-400/30 text-emerald-300 shrink-0">
              <ClipboardPaste className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-bold flex flex-wrap items-center gap-2">
                <span>العملاء المحتملين</span>
              </h2>
              <p className="text-xs text-slate-200/90">
                أدخل بيانات العميل أو الأسرة بالكتابة أو اللصق أو الإملاء الصوتي ليتم استخراج البيانات والترجمة تلقائياً
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              cancelVoiceDictation();
              onClose();
            }}
            className="p-1.5 text-slate-300 hover:text-white hover:bg-white/10 rounded-lg transition-colors cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
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

          {/* Top Instruction + Voice Dictation Bar */}
          <div className="bg-emerald-50/70 border border-emerald-200 rounded-2xl p-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs text-emerald-950">
            <div className="flex items-start gap-2 min-w-0">
              <Wand2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="font-bold">الصق رسالة العميل من الواتساب أو أملِ البيانات بالصوت (عميل واحد أو أفراد أسرة كاملة)</p>
                <p className="text-[11px] text-emerald-800">
                  كل الأسماء المسجلة طالما هذه النافذة مفتوحة تُحفظ معاً كمجموعة أسرة واحدة متتابعة لتظهر مجمّعة في فاتورة واحدة عند الإنشاء.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {/* Smart One-Sentence Voice Dictation Control */}
              {voiceStatus === "recording" ? (
                <>
                  <button
                    type="button"
                    onClick={stopVoiceDictation}
                    className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-extrabold flex items-center gap-1.5 cursor-pointer whitespace-nowrap shadow-xs transition-colors"
                    title="إيقاف التسجيل وإدراج بيانات العميل تلقائياً"
                  >
                    <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
                    <Square className="w-3 h-3 fill-current" />
                    <span>إيقاف وإدراج</span>
                    <span className="font-mono tabular-nums text-[10px] bg-red-800/70 px-1.5 py-0.5 rounded">
                      {formatVoiceTimer(voiceElapsedSec)}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={cancelVoiceDictation}
                    className="px-2.5 py-1.5 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 rounded-xl text-xs font-bold cursor-pointer whitespace-nowrap transition-colors"
                  >
                    إلغاء
                  </button>
                </>
              ) : voiceStatus === "processing" ? (
                <span className="px-3 py-1.5 bg-amber-50 border border-amber-200 text-amber-900 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 whitespace-nowrap">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-600" />
                  <span>جاري تفريغ الصوت...</span>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={startVoiceDictation}
                  className="px-3.5 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-extrabold flex items-center gap-1.5 shadow-xs cursor-pointer whitespace-nowrap transition-colors"
                  title="إملاء بيانات العميل (الاسم والرقم القومي والمهنة والهاتف) بجملة واحدة عبر الميكروفون"
                >
                  <Mic className="w-3.5 h-3.5 shrink-0" />
                  <span>إملاء بالصوت</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => handlePasteTextChange(SAMPLE_WHATSAPP_TEXT)}
                className="px-3 py-1.5 bg-white border border-emerald-300 hover:bg-emerald-100 text-emerald-900 rounded-xl text-[11px] font-bold shrink-0 cursor-pointer whitespace-nowrap"
              >
                تجربة مثال جاهز ✨
              </button>

              {pasteText.trim() && (
                <button
                  type="button"
                  onClick={() => {
                    setPasteText("");
                    setPasteRows([]);
                    setVoiceFeedback(null);
                    setErrorMsg(null);
                  }}
                  className="px-2.5 py-1.5 bg-white border border-slate-300 hover:bg-rose-50 hover:text-rose-700 hover:border-rose-200 text-slate-600 rounded-xl text-[11px] font-bold shrink-0 cursor-pointer whitespace-nowrap transition-colors"
                >
                  مسح الكل
                </button>
              )}
            </div>
          </div>

          {/* Live Recording Guidance Strip */}
          {voiceStatus === "recording" && (
            <div className="bg-red-50 border border-red-200 text-red-900 rounded-xl px-3.5 py-2.5 text-xs flex items-start gap-2">
              <Mic className="w-4 h-4 text-red-600 shrink-0 mt-0.5 animate-pulse" />
              <div className="min-w-0 leading-relaxed">
                <span className="font-extrabold">جاري الاستماع... </span>
                <span className="text-red-800">
                  يمكنك إملاء فرد واحد أو <strong>عدة أفراد من الأسرة معاً في تسجيل واحد</strong> (مثل 6 أفراد) — مثال: «الأول أحمد محمد علي 2950812... محاسب 010...، الثاني سارة محمود 298... ربة منزل، الثالث يوسف أحمد 315... طالب...» وسيتم إنشاء صف مستقل لكل فرد تلقائياً فور الضغط على <strong>إيقاف وإدراج</strong>.
                </span>
              </div>
            </div>
          )}

          {/* Voice Result / Error Feedback */}
          {voiceFeedback && (
            <div
              className={`rounded-xl px-3.5 py-2 text-xs flex items-start justify-between gap-2 border ${
                voiceFeedback.type === "success"
                  ? "bg-emerald-50 border-emerald-200 text-emerald-900"
                  : "bg-rose-50 border-rose-200 text-rose-900"
              }`}
            >
              <div className="min-w-0 space-y-0.5">
                <div className="font-bold flex items-center gap-1.5">
                  {voiceFeedback.type === "success" ? (
                    <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  )}
                  <span>{voiceFeedback.text}</span>
                </div>
                {voiceFeedback.transcript && (
                  <p className="text-[11px] opacity-85 truncate" title={voiceFeedback.transcript}>
                    النص المسموع: «{voiceFeedback.transcript}»
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setVoiceFeedback(null)}
                className="p-0.5 opacity-60 hover:opacity-100 cursor-pointer shrink-0"
                title="إغلاق التنبيه"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          <textarea
            rows={5}
            value={pasteText}
            onChange={(e) => handlePasteTextChange(e.target.value)}
            placeholder={`الصق هنا بيانات عميل أو عدة عملاء من واتساب بأي تنسيق، أو اضغط زر «إملاء بالصوت» أعلاه، مثال:\nأحمد محمد علي حسن - 29508121601234 - محاسب - 01012345678\nأو على سطور منفصلة لكل عميل...`}
            className="w-full bg-slate-50 border border-slate-300 rounded-2xl p-3.5 text-xs font-bold text-slate-900 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
          />

          {pasteRows.length > 0 ? (
            <div ref={rowsTableRef} className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold text-slate-800 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>تم إنشاء ({pasteRows.length}) {pasteRows.length === 1 ? "صف" : "صفوف"} تلقائياً — يمكنك المراجعة والتعديل قبل الحفظ:</span>
                  </span>
                  {pasteRows.length > 1 && (
                    <span className="text-[11px] font-bold bg-indigo-50 text-indigo-800 border border-indigo-200 px-2.5 py-0.5 rounded-lg">
                      مجموعة أسرة واحدة ({pasteRows.length} أفراد معاً في فاتورة واحدة)
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setPasteRows((prev) => [...prev, createEmptyFastCustomer(prev.length)])}
                  className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-bold flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>إضافة صف</span>
                </button>
              </div>

              <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white">
                <div className="overflow-x-auto">
                  <table className="w-full text-right border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                        <th className="p-2.5 w-8 text-center">#</th>
                        <th className="p-2.5 min-w-[180px]">الاسم بالكامل (عربي) *</th>
                        <th className="p-2.5 min-w-[160px]">الاسم بالإنجليزي (قاموس تلقائي)</th>
                        <th className="p-2.5 min-w-[145px]">الرقم القومي (اختياري)</th>
                        <th className="p-2.5 min-w-[130px]">تاريخ الميلاد (تلقائي)</th>
                        <th className="p-2.5 min-w-[155px]">المهنة</th>
                        <th className="p-2.5 min-w-[120px]">الهاتف</th>
                        <th className="p-2.5 min-w-[125px]">نوع المستند</th>
                        <th className="p-2.5 w-10 text-center">حذف</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {pasteRows.map((row, idx) => {
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
                                onChange={(e) => updateRowField(row.tempId, "arabicName", e.target.value)}
                                placeholder="الاسم الرباعي..."
                                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                              />
                            </td>

                            <td className="p-2">
                              <input
                                type="text"
                                value={row.englishName}
                                onChange={(e) => updateRowField(row.tempId, "englishName", e.target.value)}
                                placeholder="AUTO ENGLISH..."
                                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-[11px] font-mono font-bold text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                              />
                            </td>

                            <td className="p-2">
                              <input
                                type="text"
                                maxLength={14}
                                value={row.nationalId}
                                onChange={(e) => updateRowField(row.tempId, "nationalId", e.target.value)}
                                placeholder="اختياري (14 رقماً)"
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
                                onChange={(e) => updateRowField(row.tempId, "birthDate", e.target.value)}
                                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-mono font-bold text-slate-800"
                              />
                            </td>

                            <td className="p-2 space-y-1">
                              <input
                                type="text"
                                maxLength={32}
                                value={row.profession}
                                onChange={(e) => updateRowField(row.tempId, "profession", e.target.value)}
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
                                    onClick={() => updateRowField(row.tempId, "profession", chip)}
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
                                onChange={(e) => updateRowField(row.tempId, "phone", e.target.value)}
                                placeholder="01XXXXXXXXX"
                                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-mono font-bold text-slate-800"
                              />
                            </td>

                            <td className="p-2">
                              <select
                                value={row.documentType}
                                onChange={(e) => updateRowField(row.tempId, "documentType", e.target.value)}
                                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-bold text-slate-800"
                              >
                                <option value="بطاقة_رقم_قومي">بطاقة رقم قومي</option>
                                <option value="شهادة_ميلاد">شهادة ميلاد</option>
                                <option value="يدوي">إدخال يدوي</option>
                              </select>
                            </td>

                            <td className="p-2 text-center pt-2.5">
                              <button
                                type="button"
                                onClick={() => removeRow(row.tempId)}
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
            </div>
          ) : (
            <div className="text-center py-6 border border-dashed border-slate-200 rounded-2xl text-xs text-slate-400">
              قم بلصق نص رسالة واتساب في المربع أعلاه أو اضغط «إملاء بالصوت» لتظهر النتائج فوراً هنا
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 text-xs">
            <button
              type="button"
              onClick={() => {
                cancelVoiceDictation();
                onClose();
              }}
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
                  : validRows.length > 1
                    ? `💾 حفظ الأسرة معاً (${validRows.length} أفراد)`
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
                    : `⚡ حفظ وإنشاء فاتورة للأسرة (${validRows.length})`}
                </span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
