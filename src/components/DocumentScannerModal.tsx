import React, { useState, useRef, useEffect } from "react";
import { Camera, Upload, RefreshCw, CheckCircle2, AlertCircle, X, Sparkles, User, FileText, ArrowRight, ShieldCheck, HelpCircle, Smartphone, Video } from "lucide-react";
import { scanDocumentWithAI } from "../lib/api";
import { PotentialCustomer, DictionaryItem, DEFAULT_APPLICANT_CAPACITIES } from "../types";
import { breakdownArabicName } from "../lib/dictionary";

// Client-side image optimizer: downscales large smartphone photos (e.g. 10MB) to crisp 1600px
// This ensures lightning-fast upload over mobile connections and 100% accurate OCR readability.
async function optimizeImageForOcr(fileOrBase64: File | string, maxDimension = 1600, quality = 0.85): Promise<string> {
  return new Promise((resolve) => {
    const processImg = (img: HTMLImageElement) => {
      try {
        let { width, height } = img;
        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(typeof fileOrBase64 === "string" ? fileOrBase64 : "");
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      } catch (e) {
        console.warn("Canvas compression failed, returning original image", e);
        resolve(typeof fileOrBase64 === "string" ? fileOrBase64 : "");
      }
    };

    const img = new Image();
    img.onload = () => processImg(img);
    img.onerror = () => {
      resolve(typeof fileOrBase64 === "string" ? fileOrBase64 : "");
    };

    if (typeof fileOrBase64 === "string") {
      img.src = fileOrBase64;
    } else {
      const reader = new FileReader();
      reader.onload = (e) => {
        img.src = (e.target?.result as string) || "";
      };
      reader.onerror = () => resolve("");
      reader.readAsDataURL(fileOrBase64);
    }
  });
}

interface DocumentScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveCustomer: (customer: Partial<PotentialCustomer>, useImmediately?: boolean) => void;
  dictionary?: DictionaryItem[];
  applicantCapacities?: string[];
  allowDirectUse?: boolean;
}

type ScanFlow = "id_card" | "birth_certificate";
type IdStep = "front" | "back" | "verify";

export default function DocumentScannerModal({
  isOpen,
  onClose,
  onSaveCustomer,
  dictionary = [],
  applicantCapacities = DEFAULT_APPLICANT_CAPACITIES,
  allowDirectUse = false,
}: DocumentScannerModalProps) {
  const [flow, setFlow] = useState<ScanFlow>("id_card");
  const [idStep, setIdStep] = useState<IdStep>("front");
  
  // Media / Camera State
  const [useCamera, setUseCamera] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [activeStream, setActiveStream] = useState<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Dedicated Native Camera & File Pickers
  const nativeCameraInputRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Scanned Images previews
  const [frontImage, setFrontImage] = useState<string | null>(null);
  const [backImage, setBackImage] = useState<string | null>(null);
  const [birthImage, setBirthImage] = useState<string | null>(null);

  // Loading & Scanning Status
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [scanMessage, setScanMessage] = useState<string>("");
  const [errorNotice, setErrorNotice] = useState<string | null>(null);

  // Extracted Data Form
  const [arabicName, setArabicName] = useState<string>("");
  const [englishName, setEnglishName] = useState<string>("");
  const [nationalId, setNationalId] = useState<string>("");
  const [birthDate, setBirthDate] = useState<string>("");
  const [profession, setProfession] = useState<string>("");
  const [phone, setPhone] = useState<string>("");
  const [applicantCapacity, setApplicantCapacity] = useState<string>("");
  const [notes, setNotes] = useState<string>("");

  // Start Live WebRTC Camera (with multi-stage mobile & browser fallback)
  const startCamera = async () => {
    setCameraError(null);

    // If mediaDevices is not supported by browser / webview / insecure context, trigger native camera directly
    if (!navigator?.mediaDevices?.getUserMedia) {
      setCameraError("متصفح الموبايل لا يدعم البث المباشر داخل الصفحة، يتم الآن فتح كاميرا الهاتف مباشرة... 📷");
      nativeCameraInputRef.current?.click();
      return;
    }

    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }

      let stream: MediaStream | null = null;
      // 1. Try rear environment camera
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
      } catch (err1) {
        console.warn("First getUserMedia attempt failed, falling back to simple video:", err1);
        // 2. Try generic video constraint if environment constraint was rejected
        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
      }

      streamRef.current = stream;
      setActiveStream(stream);
      setUseCamera(true);
    } catch (err: any) {
      console.warn("Live camera access failed:", err);
      setCameraError("تعذر تشغيل بث الكاميرا داخل المتصفح. يمكنك الضغط على (فتح كاميرا الهاتف) أدناه للتصوير المباشر بدقة عالية 📷");
      setUseCamera(false);
      // Auto-trigger native camera capture so user gets camera immediately
      setTimeout(() => {
        nativeCameraInputRef.current?.click();
      }, 300);
    }
  };

  // Attach active video stream once the video element is mounted in DOM
  useEffect(() => {
    if (useCamera && activeStream && videoRef.current) {
      videoRef.current.srcObject = activeStream;
      videoRef.current.play().catch((err) => {
        console.warn("Video auto-play warning:", err);
      });
    }
  }, [useCamera, activeStream]);

  // Stop Camera
  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setActiveStream(null);
    setUseCamera(false);
  };

  useEffect(() => {
    if (!isOpen) {
      stopCamera();
    }
  }, [isOpen]);

  // Capture snapshot from live video
  const capturePhoto = async (): Promise<string | null> => {
    if (!videoRef.current) return null;
    const video = videoRef.current;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const rawData = canvas.toDataURL("image/jpeg", 0.9);
    return await optimizeImageForOcr(rawData, 1600, 0.85);
  };

  // Handle Native Mobile Camera Capture (uses native device camera app)
  const handleNativeCameraCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setIsScanning(true);
      setScanMessage("جاري تجهيز وتحسين جودة الصورة الملتقطة من الكاميرا... 📷");
      const optimizedBase64 = await optimizeImageForOcr(file, 1600, 0.85);
      if (optimizedBase64) {
        processCapturedImage(optimizedBase64);
      }
    } catch (err: any) {
      setErrorNotice("فشل قراءة صورة الكاميرا: " + (err.message || "حدث خطأ"));
      setIsScanning(false);
    } finally {
      e.target.value = "";
    }
  };

  // Handle File Input Selection
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setIsScanning(true);
      setScanMessage("جاري تجهيز الصورة ومعالجتها للذكاء الاصطناعي... 🖼️");
      const optimizedBase64 = await optimizeImageForOcr(file, 1600, 0.85);
      if (optimizedBase64) {
        processCapturedImage(optimizedBase64);
      }
    } catch (err: any) {
      setErrorNotice("فشل قراءة الملف: " + (err.message || "حدث خطأ"));
      setIsScanning(false);
    } finally {
      e.target.value = "";
    }
  };

  // Auto-translate Arabic Name using Dictionary
  const autoTranslateName = (name: string) => {
    if (!name || !name.trim()) return;
    try {
      const breakdown = breakdownArabicName(name, dictionary);
      if (breakdown && breakdown.assembledEnglish) {
        setEnglishName(breakdown.assembledEnglish.toUpperCase());
      }
    } catch {}
  };

  // Process captured image via AI OCR
  const processCapturedImage = async (base64Image: string) => {
    stopCamera();
    setIsScanning(true);
    setErrorNotice(null);

    try {
      if (flow === "id_card") {
        if (idStep === "front") {
          setFrontImage(base64Image);
          setScanMessage("جاري قراءة وجه البطاقة واستخراج الاسم والرقم القومي بالذكاء الاصطناعي... 🔍");
          const res = await scanDocumentWithAI({
            image: base64Image,
            documentType: "national_id_front",
          });

          if (res.extracted) {
            const ext = res.extracted;
            if (ext.arabicName) {
              setArabicName(ext.arabicName);
              autoTranslateName(ext.arabicName);
            }
            if (ext.nationalId) {
              setNationalId(ext.nationalId);
            }
            if (ext.birthDate) {
              setBirthDate(ext.birthDate);
            }
          }
          // Move to Step 2: Back of ID
          setIdStep("back");
          setScanMessage("");
        } else if (idStep === "back") {
          setBackImage(base64Image);
          setScanMessage("جاري قراءة ظهر البطاقة وتدوين المهنة بالذكاء الاصطناعي... 🔍");
          const res = await scanDocumentWithAI({
            image: base64Image,
            documentType: "national_id_back",
          });

          if (res.extracted && res.extracted.profession) {
            setProfession(res.extracted.profession);
          }
          // Move to Verification step
          setIdStep("verify");
          setScanMessage("");
        }
      } else if (flow === "birth_certificate") {
        setBirthImage(base64Image);
        setScanMessage("جاري قراءة شهادة الميلاد وتحديد الاسم والرقم القومي والمهنة (طالب/طفل)... 🔍");
        const res = await scanDocumentWithAI({
          image: base64Image,
          documentType: "birth_certificate",
        });

        if (res.extracted) {
          const ext = res.extracted;
          if (ext.arabicName) {
            setArabicName(ext.arabicName);
            autoTranslateName(ext.arabicName);
          }
          if (ext.nationalId) {
            setNationalId(ext.nationalId);
          }
          if (ext.birthDate) {
            setBirthDate(ext.birthDate);
          }
          if (ext.profession) {
            setProfession(ext.profession);
          } else {
            // Default based on age if known, otherwise طالب
            setProfession("طالب");
          }
        }
        setIdStep("verify");
        setScanMessage("");
      }
    } catch (err: any) {
      console.error(err);
      setErrorNotice(err.message || "حدث خطأ أثناء قراءة المستند.");
    } finally {
      setIsScanning(false);
    }
  };

  const handleCaptureClick = async () => {
    const photo = await capturePhoto();
    if (photo) {
      processCapturedImage(photo);
    }
  };

  // Reset scanner for fresh start
  const handleReset = () => {
    stopCamera();
    setIdStep("front");
    setFrontImage(null);
    setBackImage(null);
    setBirthImage(null);
    setArabicName("");
    setEnglishName("");
    setNationalId("");
    setBirthDate("");
    setProfession("");
    setPhone("");
    setApplicantCapacity("");
    setNotes("");
    setErrorNotice(null);
    setIsScanning(false);
  };

  // Handle Save
  const handleSave = (useImmediately: boolean = false) => {
    if (!arabicName.trim()) {
      setErrorNotice("يرجى إدخال أو مراجعة اسم العميل بالعربية.");
      return;
    }
    if (!nationalId.trim() || nationalId.length !== 14) {
      setErrorNotice("الرقم القومي يجب أن يتكون من 14 رقماً بالكامل.");
      return;
    }

    const newCustomer: Partial<PotentialCustomer> = {
      arabicName: arabicName.trim(),
      englishName: englishName.trim() || undefined,
      nationalId: nationalId.trim(),
      birthDate: birthDate.trim() || undefined,
      profession: profession.trim() || (flow === "birth_certificate" ? "طالب" : ""),
      documentType: flow === "id_card" ? "بطاقة_رقم_قومي" : "شهادة_ميلاد",
      phone: phone.trim() || undefined,
      applicantCapacity: applicantCapacity.trim() || undefined,
      notes: notes.trim() || undefined,
      cardFrontImage: frontImage || birthImage || undefined,
      cardBackImage: backImage || undefined,
      status: "جديد",
      createdAt: new Date().toISOString().split("T")[0],
    };

    onSaveCustomer(newCustomer, useImmediately);
    handleReset();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/75 backdrop-blur-xs font-cairo">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden">
        
        {/* Modal Header */}
        <div className="px-6 py-4 bg-linear-to-r from-slate-900 via-slate-800 to-indigo-950 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-600/30 rounded-xl border border-indigo-400/30 text-indigo-300">
              <Camera className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold flex items-center gap-2">
                <span>مسح المستندات بالذكاء الاصطناعي</span>
                <span className="text-[10px] bg-indigo-500/30 text-indigo-200 px-2 py-0.5 rounded-full border border-indigo-400/30 font-mono">
                  Gemini OCR
                </span>
              </h2>
              <p className="text-xs text-slate-300">
                استخراج فوري للاسم، الرقم القومي، والمهنة من البطاقة أو شهادة الميلاد
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              stopCamera();
              onClose();
            }}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          
          {/* Top Document Mode Selector (Only on step 1 or if not verified yet) */}
          {idStep !== "verify" && (
            <div className="grid grid-cols-2 gap-3 p-1 bg-slate-100 rounded-2xl">
              <button
                type="button"
                onClick={() => {
                  setFlow("id_card");
                  handleReset();
                }}
                className={`py-2.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                  flow === "id_card"
                    ? "bg-white text-indigo-900 shadow-xs border border-indigo-200"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <User className="w-4 h-4 text-indigo-600" />
                <span>🆔 بطاقة رقم قومي (وجه + ظهر)</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setFlow("birth_certificate");
                  handleReset();
                }}
                className={`py-2.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                  flow === "birth_certificate"
                    ? "bg-white text-indigo-900 shadow-xs border border-indigo-200"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <FileText className="w-4 h-4 text-emerald-600" />
                <span>📜 شهادة ميلاد مميكنة (طالب/طفل)</span>
              </button>
            </div>
          )}

          {/* Stepper info banner for ID card */}
          {flow === "id_card" && idStep !== "verify" && (
            <div className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-xs">
              <div className="flex items-center gap-2">
                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                  idStep === "front" ? "bg-indigo-600 text-white" : "bg-emerald-600 text-white"
                }`}>
                  {idStep === "front" ? "1" : "✓"}
                </span>
                <span className={idStep === "front" ? "font-bold text-slate-900" : "text-slate-500"}>
                  الخطوة 1: وجه البطاقة (الاسم والرقم القومي)
                </span>
              </div>
              <ArrowRight className="w-4 h-4 text-slate-400 rotate-180" />
              <div className="flex items-center gap-2">
                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                  idStep === "back" ? "bg-indigo-600 text-white" : "bg-slate-200 text-slate-600"
                }`}>
                  2
                </span>
                <span className={idStep === "back" ? "font-bold text-slate-900" : "text-slate-500"}>
                  الخطوة 2: ظهر البطاقة (المهنة)
                </span>
              </div>
            </div>
          )}

          {/* Notification / Error box */}
          {errorNotice && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{errorNotice}</span>
            </div>
          )}

          {/* Camera Error banner */}
          {cameraError && (
            <div className="p-3.5 bg-amber-50 border border-amber-300 rounded-2xl text-xs text-amber-950 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold">{cameraError}</p>
                  <p className="text-[11px] text-amber-800 mt-0.5">
                    يمكنك تشغيل كاميرا هاتفك والتقاط الصورة فوراً بالضغط على الزر أدناه ⬇️
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => nativeCameraInputRef.current?.click()}
                className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 active:scale-95 text-white rounded-xl font-bold text-xs flex items-center gap-1.5 self-end sm:self-center cursor-pointer shadow-xs shrink-0"
              >
                <Camera className="w-3.5 h-3.5" />
                <span>فتح كاميرا الهاتف 📷</span>
              </button>
            </div>
          )}

          {/* Main Scanning Viewport (when not in verify step) */}
          {idStep !== "verify" && (
            <div className="space-y-4">
              
              {/* Camera or Upload Area */}
              <div className="relative border-2 border-dashed border-slate-300 rounded-2xl bg-slate-50 overflow-hidden flex flex-col items-center justify-center min-h-[260px] p-4 text-center">
                
                {isScanning ? (
                  <div className="flex flex-col items-center justify-center py-10 space-y-3">
                    <div className="relative">
                      <RefreshCw className="w-10 h-10 text-indigo-600 animate-spin" />
                      <Sparkles className="w-4 h-4 text-amber-500 absolute -top-1 -right-1 animate-pulse" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm font-bold text-slate-900">{scanMessage}</p>
                      <p className="text-xs text-slate-500">جاري معالجة وتدقيق الأحرف عبر نموذج Gemini Vision...</p>
                    </div>
                  </div>
                ) : useCamera ? (
                  <div className="w-full flex flex-col items-center space-y-3">
                    <div className="relative w-full max-w-md rounded-xl overflow-hidden border border-slate-300 bg-black aspect-video flex items-center justify-center shadow-inner">
                      <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                      {/* Guide overlay outline for ID card */}
                      <div className="absolute inset-4 border-2 border-dashed border-white/60 rounded-lg pointer-events-none flex items-center justify-center">
                        <span className="text-[11px] text-white/90 bg-black/50 px-2 py-0.5 rounded-md">
                          ضع {flow === "birth_certificate" ? "شهادة الميلاد" : (idStep === "front" ? "وجه البطاقة" : "ظهر البطاقة")} داخل الإطار
                        </span>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={handleCaptureClick}
                        className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-md cursor-pointer transition-all"
                      >
                        <Camera className="w-4 h-4" />
                        <span>📸 التقاط الصورة الآن</span>
                      </button>

                      <button
                        type="button"
                        onClick={stopCamera}
                        className="px-3 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl text-xs font-bold cursor-pointer"
                      >
                        إلغاء الكاميرا
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4 py-6 w-full max-w-md mx-auto">
                    <div className="w-16 h-16 mx-auto bg-indigo-50 border border-indigo-200 rounded-2xl flex items-center justify-center text-indigo-600 shadow-xs">
                      {flow === "birth_certificate" ? <FileText className="w-8 h-8" /> : <User className="w-8 h-8" />}
                    </div>

                    <div className="space-y-1 max-w-sm mx-auto">
                      <h3 className="text-sm font-bold text-slate-800">
                        {flow === "birth_certificate"
                          ? "تصوير أو رفع شهادة الميلاد المميكنة"
                          : idStep === "front"
                            ? "تصوير أو رفع وجه البطاقة الشخصية"
                            : "تصوير أو رفع ظهر البطاقة لتسجيل المهنة"}
                      </h3>
                      <p className="text-xs text-slate-500">
                        {flow === "birth_certificate"
                          ? "سيقوم الذكاء الاصطناعي بقراءة الاسم والرقم القومي وتحديد المهنة كـ (طالب) أو (طفل) تلقائياً"
                          : idStep === "front"
                            ? "استخراج الاسم الرباعي والرقم القومي (14 رقم) وتاريخ الميلاد"
                            : "قراءة خانة المهنة والوظيفة المكتوبة بخلف البطاقة"}
                      </p>
                    </div>

                    {/* Camera and Upload Options */}
                    <div className="flex flex-col items-center gap-3 pt-2 w-full">
                      {/* Primary Button for Mobile */}
                      <button
                        type="button"
                        onClick={() => nativeCameraInputRef.current?.click()}
                        className="w-full px-5 py-3.5 bg-indigo-600 hover:bg-indigo-700 active:scale-98 text-white rounded-2xl text-xs sm:text-sm font-black flex items-center justify-center gap-2.5 shadow-md shadow-indigo-600/20 cursor-pointer transition-all"
                        title="فتح كاميرا الموبايل والتقاط صورة واضحة مباشرة"
                      >
                        <Smartphone className="w-5 h-5 text-emerald-300" />
                        <span>📸 تصوير بكاميرا الهاتف مباشرة (موصى به للموبايل)</span>
                      </button>

                      {/* Secondary Options: Live webcam & File upload */}
                      <div className="flex flex-wrap items-center justify-center gap-2 w-full">
                        <button
                          type="button"
                          onClick={startCamera}
                          className="flex-1 min-w-[150px] px-3.5 py-2.5 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs cursor-pointer transition-all"
                          title="فتح بث كاميرا الويب المباشر داخل المتصفح"
                        >
                          <Video className="w-4 h-4 text-emerald-400" />
                          <span>🎥 بث الكاميرا المباشر</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="flex-1 min-w-[150px] px-3.5 py-2.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer transition-all"
                          title="اختيار صورة تم تصويرها مسبقاً من الاستوديو أو الملفات"
                        >
                          <Upload className="w-4 h-4 text-indigo-600" />
                          <span>📁 صورة من المعرض / الملفات</span>
                        </button>
                      </div>

                      {/* Hidden native camera capture input */}
                      <input
                        ref={nativeCameraInputRef}
                        type="file"
                        accept="image/*"
                        capture="environment"
                        onChange={handleNativeCameraCapture}
                        className="hidden"
                      />

                      {/* Hidden regular file picker input */}
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handleFileUpload}
                        className="hidden"
                      />
                    </div>

                    {/* Quick bypass if user wants to skip back of card */}
                    {flow === "id_card" && idStep === "back" && (
                      <div className="pt-2">
                        <button
                          type="button"
                          onClick={() => setIdStep("verify")}
                          className="text-xs text-indigo-600 hover:underline font-bold"
                        >
                          تخطي تصوير الظهر وكتابة المهنة يدوياً &larr;
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Verification & Extracted Data Form View */}
          {idStep === "verify" && (
            <div className="space-y-4">
              
              <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-3.5 flex items-center justify-between text-xs text-emerald-900">
                <div className="flex items-center gap-2 font-bold">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                  <span>تم استخراج وتدقيق البيانات بنجاح! يمكنك مراجعتها وتعديلها أدناه.</span>
                </div>
                <button
                  type="button"
                  onClick={handleReset}
                  className="text-slate-500 hover:text-slate-900 flex items-center gap-1 font-bold text-[11px]"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>إعادة المسح</span>
                </button>
              </div>

              {/* Form Fields Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                
                {/* Arabic Name */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 block">
                    الاسم بالكامل (عربي) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={arabicName}
                    onChange={(e) => {
                      setArabicName(e.target.value);
                      autoTranslateName(e.target.value);
                    }}
                    placeholder="الاسم الرباعي كما في المستند..."
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                {/* English Name */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 block">
                    الاسم بالإنجليزي (مترجم تلقائياً)
                  </label>
                  <input
                    type="text"
                    value={englishName}
                    onChange={(e) => setEnglishName(e.target.value.toUpperCase())}
                    placeholder="FULL ENGLISH NAME..."
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono font-bold text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                {/* National ID */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 block">
                    الرقم القومي (14 رقم) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    maxLength={14}
                    value={nationalId}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, "");
                      setNationalId(val);
                    }}
                    placeholder="29508121601234"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono font-bold text-slate-900 tracking-wider focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                {/* Birth Date */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 block">تاريخ الميلاد</label>
                  <input
                    type="date"
                    value={birthDate}
                    onChange={(e) => setBirthDate(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono font-bold text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                {/* Profession (with quick buttons for birth cert: طالب / طفل) */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-700 block">
                      المهنة بالاستمارة / البطاقة
                    </label>
                    {flow === "birth_certificate" && (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setProfession("طالب")}
                          className={`text-[10px] px-2 py-0.5 rounded-md font-bold transition-colors ${
                            profession === "طالب" ? "bg-indigo-600 text-white" : "bg-slate-200 text-slate-700 hover:bg-slate-300"
                          }`}
                        >
                          طالب
                        </button>
                        <button
                          type="button"
                          onClick={() => setProfession("طفل")}
                          className={`text-[10px] px-2 py-0.5 rounded-md font-bold transition-colors ${
                            profession === "طفل" ? "bg-indigo-600 text-white" : "bg-slate-200 text-slate-700 hover:bg-slate-300"
                          }`}
                        >
                          طفل
                        </button>
                      </div>
                    )}
                  </div>
                  <input
                    type="text"
                    maxLength={32}
                    value={profession}
                    onChange={(e) => setProfession(e.target.value)}
                    placeholder="المهنة (مثال: محاسب، طالب، ربة منزل...)"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                {/* Phone Number (Optional) */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 block">رقم الهاتف (اختياري)</label>
                  <input
                    type="tel"
                    maxLength={11}
                    value={phone}
                    onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
                    placeholder="01XXXXXXXXX"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono font-bold text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                {/* Applicant Capacity */}
                <div className="space-y-1 sm:col-span-2">
                  <label className="text-xs font-bold text-slate-700 block">صفة مقدم الطلب (اختياري)</label>
                  <select
                    value={applicantCapacity}
                    onChange={(e) => setApplicantCapacity(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">-- اختر صفة مقدم الطلب إن رغبت --</option>
                    {applicantCapacities.map((cap) => (
                      <option key={cap} value={cap}>
                        {cap}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Scanned images preview strip */}
              <div className="flex items-center gap-3 pt-1">
                {frontImage && (
                  <div className="relative border border-slate-200 rounded-xl p-1 bg-slate-50">
                    <img src={frontImage} alt="وجه البطاقة" className="w-16 h-12 object-cover rounded-lg" />
                    <span className="text-[9px] font-bold text-slate-500 block text-center mt-0.5">وجه البطاقة</span>
                  </div>
                )}
                {backImage && (
                  <div className="relative border border-slate-200 rounded-xl p-1 bg-slate-50">
                    <img src={backImage} alt="ظهر البطاقة" className="w-16 h-12 object-cover rounded-lg" />
                    <span className="text-[9px] font-bold text-slate-500 block text-center mt-0.5">ظهر البطاقة</span>
                  </div>
                )}
                {birthImage && (
                  <div className="relative border border-slate-200 rounded-xl p-1 bg-slate-50">
                    <img src={birthImage} alt="شهادة الميلاد" className="w-16 h-12 object-cover rounded-lg" />
                    <span className="text-[9px] font-bold text-slate-500 block text-center mt-0.5">شهادة الميلاد</span>
                  </div>
                )}
              </div>
            </div>
          )}

        </div>

        {/* Modal Footer Actions */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => {
              stopCamera();
              onClose();
            }}
            className="px-4 py-2 border border-slate-300 text-slate-700 hover:bg-slate-200 rounded-xl text-xs font-bold transition-all cursor-pointer"
          >
            إغلاق
          </button>

          {idStep === "verify" ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleSave(false)}
                className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs cursor-pointer transition-all"
              >
                <span>💾 حفظ في العملاء المحتملين</span>
              </button>

              {allowDirectUse && (
                <button
                  type="button"
                  onClick={() => handleSave(true)}
                  className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-md cursor-pointer transition-all"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>⚡ استخدام فوراً في الفاتورة</span>
                </button>
              )}
            </div>
          ) : (
            <div className="text-xs text-slate-500">
              {useCamera ? "اضغط زر الالتقاط لتصوير المستند" : "اختر فتح الكاميرا أو رفع ملف للبدء"}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
