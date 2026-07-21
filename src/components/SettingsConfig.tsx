import React, { useState, useEffect } from "react";
import { AppSettings, Employee } from "../types";
import { updateSettingsOnServer, connectGoogleSheetsOnServer, pushDataToGoogleSheets, pullDataFromGoogleSheets } from "../lib/api";
import { googleSignIn, logoutGoogle, getAccessToken } from "../lib/firebaseAuth";
import { Save, ShieldCheck, MessageCircle, FileText, Settings, Globe, HelpCircle, AlertCircle, Lock, Unlock, Users, CloudRain, CheckCircle, RefreshCw, LogIn, LogOut, ExternalLink } from "lucide-react";

interface SettingsConfigProps {
  settings: AppSettings;
  activeEmployee: Employee;
  onSettingsUpdated: (settings: AppSettings) => void;
  employees: Employee[];
  onEmployeesUpdated: (employees: Employee[]) => void;
}

export default function SettingsConfig({ settings, activeEmployee, onSettingsUpdated, employees, onEmployeesUpdated }: SettingsConfigProps) {
  const [headerText, setHeaderText] = useState(settings.headerText || "مكتب مزايا للجوازات والمعاملات");
  const [welcomeMessage, setWelcomeMessage] = useState(settings.welcomeMessage || "");
  const [whatsappTemplate, setWhatsappTemplate] = useState(settings.whatsappTemplate || "");
  const [readyMessage, setReadyMessage] = useState(settings.readyMessage || "");
  const [deliveryMessage, setDeliveryMessage] = useState(settings.deliveryMessage || "");
  const [googleSheetId, setGoogleSheetId] = useState(settings.googleSheetId || "");
  const [footerText, setFooterText] = useState(settings.footerText || "يسعدنا دائماً خدمتكم وثقتكم بنا");

  const [saving, setSaving] = useState(false);

  // Google Sheets Integration States
  const [googleToken, setGoogleToken] = useState<string | null>(getAccessToken());
  const [isGoogleConnected, setIsGoogleConnected] = useState<boolean>(!!getAccessToken());
  const [syncLoading, setSyncLoading] = useState(false);
  const [syncMessage, setSyncMessage] = useState("");

  useEffect(() => {
    const tok = getAccessToken();
    if (tok) {
      setGoogleToken(tok);
      setIsGoogleConnected(true);
    }
  }, []);

  const handleGoogleLogin = async () => {
    setSyncLoading(true);
    setSyncMessage("جاري الاتصال بحساب Google...");
    try {
      const res = await googleSignIn();
      if (res) {
        setGoogleToken(res.accessToken);
        setIsGoogleConnected(true);
        setSyncMessage(`تم تسجيل الدخول بنجاح باسم: ${res.user.displayName || "مستخدم Google"}`);
      }
    } catch (err: any) {
      console.error(err);
      setSyncMessage(`فشل الاتصال بـ Google: ${err.message}`);
    } finally {
      setSyncLoading(false);
    }
  };

  const handleGoogleLogout = async () => {
    try {
      await logoutGoogle();
      setGoogleToken(null);
      setIsGoogleConnected(false);
      setSyncMessage("تم تسجيل الخروج من حساب Google.");
    } catch (err: any) {
      console.error(err);
    }
  };

  const handleConnectSheets = async () => {
    if (!googleToken) {
      alert("الرجاء تسجيل الدخول باستخدام Google أولاً.");
      return;
    }
    setSyncLoading(true);
    setSyncMessage("جاري فحص وإنشاء قاعدة بيانات Google Sheets...");
    try {
      const response = await connectGoogleSheetsOnServer(googleToken);
      if (response.status === "success") {
        setGoogleSheetId(response.settings.googleSheetId);
        onSettingsUpdated(response.settings);
        setSyncMessage(response.message || "تم ربط ملف Google Sheets بنجاح!");
        alert("تم ربط وتجهيز ملف جوجل شيت بنجاح! 📊");
      }
    } catch (err: any) {
      console.error(err);
      setSyncMessage(`فشل ربط ملف جوجل شيت: ${err.message}`);
      alert(`فشل الربط: ${err.message}`);
    } finally {
      setSyncLoading(false);
    }
  };

  const handlePushData = async () => {
    if (!googleToken) {
      alert("الرجاء تسجيل الدخول باستخدام Google أولاً.");
      return;
    }
    const confirmPush = window.confirm("هل أنت متأكد من رغبتك في رفع وتصدير كامل قاعدة البيانات المحلية الحالية إلى جوجل شيت؟ سيقوم هذا الإجراء بتحديث كافة الأوراق في الملف.");
    if (!confirmPush) return;

    setSyncLoading(true);
    setSyncMessage("جاري تصدير ونقل البيانات إلى جوجل شيت...");
    try {
      const response = await pushDataToGoogleSheets(googleToken);
      setSyncMessage(response.message || "تم تصدير البيانات بنجاح!");
      alert("تم تصدير ونسخ كافة الإعدادات والعمليات والبيانات إلى جوجل شيت بنجاح! 🚀");
    } catch (err: any) {
      console.error(err);
      setSyncMessage(`فشل التصدير: ${err.message}`);
      alert(`فشل التصدير: ${err.message}`);
    } finally {
      setSyncLoading(false);
    }
  };

  const handlePullData = async () => {
    if (!googleToken) {
      alert("الرجاء تسجيل الدخول باستخدام Google أولاً.");
      return;
    }
    const confirmPull = window.confirm("تحذير: هل أنت متأكد من رغبتك في استيراد ومزامنة البيانات بالكامل من جوجل شيت واعتمادها كقاعدة البيانات النشطة؟ سيؤدي هذا إلى استبدال البيانات المحلية الحالية بالكامل ببيانات شيت.");
    if (!confirmPull) return;

    setSyncLoading(true);
    setSyncMessage("جاري استيراد البيانات من جوجل شيت...");
    try {
      const response = await pullDataFromGoogleSheets(googleToken);
      onSettingsUpdated(response.db.settings);
      setSyncMessage(response.message || "تم استيراد البيانات بنجاح!");
      alert("تم استيراد ومزامنة البيانات بالكامل من جوجل شيت واعتمادها كقاعدة البيانات النشطة! 📥 يرجى إعادة تحميل الصفحة لتحديث العرض بالكامل.");
      window.location.reload();
    } catch (err: any) {
      console.error(err);
      setSyncMessage(`فشل الاستيراد: ${err.message}`);
      alert(`فشل الاستيراد: ${err.message}`);
    } finally {
      setSyncLoading(false);
    }
  };

  // Passcode States
  const [myCurrentPassword, setMyCurrentPassword] = useState("");
  const [myNewPassword, setMyNewPassword] = useState("");
  const [myConfirmPassword, setMyConfirmPassword] = useState("");

  const handleChangeMyPassword = async () => {
    if (activeEmployee.password && activeEmployee.password.trim() !== "") {
      if (myCurrentPassword !== activeEmployee.password) {
        alert("الرقم السري الحالي غير صحيح.");
        return;
      }
    }
    
    if (!myNewPassword.trim()) {
      alert("الرجاء إدخال رقم سري جديد صالح.");
      return;
    }
    
    if (myNewPassword !== myConfirmPassword) {
      alert("الرقم السري الجديد وتأكيده غير متطابقين.");
      return;
    }

    const updatedEmployees = employees.map((emp) => 
      emp.username === activeEmployee.username ? { ...emp, password: myNewPassword.trim() } : emp
    );

    try {
      await onEmployeesUpdated(updatedEmployees);
      alert("تم تحديث وتلقيم رقمك السري بنجاح في قاعدة البيانات الآمنة للخصوصية 🔐");
      setMyCurrentPassword("");
      setMyNewPassword("");
      setMyConfirmPassword("");
      // Update local reference to reflect immediately
      activeEmployee.password = myNewPassword.trim();
    } catch (err) {
      console.error(err);
      alert("حدث خطأ أثناء حفظ الرقم السري.");
    }
  };

  const handleAdminResetPassword = async (emp: Employee) => {
    const newPass = prompt(`أدخل الرقم السري الجديد للموظف (${emp.name}):`, emp.password || "");
    if (newPass === null) return; // user cancelled

    const updatedEmployees = employees.map((e) => 
      e.username === emp.username ? { ...e, password: newPass.trim() || undefined } : e
    );

    try {
      await onEmployeesUpdated(updatedEmployees);
      alert(`تم تحديث الرقم السري للموظف (${emp.name}) بنجاح في الخادم.`);
    } catch (err) {
      console.error(err);
      alert("حدث خطأ أثناء تعديل رقم الموظف.");
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeEmployee.permissions.canManageServices) {
      alert("عذراً، تحتاج إلى صلاحيات إدارة كاملة لتغيير معلمات النظام الأساسية.");
      return;
    }

    setSaving(true);
    try {
      const payload: AppSettings = {
        headerText: headerText.trim(),
        welcomeMessage: welcomeMessage.trim(),
        whatsappTemplate: whatsappTemplate.trim(),
        readyMessage: readyMessage.trim(),
        deliveryMessage: deliveryMessage.trim(),
        googleSheetId: googleSheetId.trim(),
        footerText: footerText.trim(),
        googleSheetUrl: settings.googleSheetUrl || "",
        googleSheetsConnected: settings.googleSheetsConnected || false
      };

      const result = await updateSettingsOnServer(payload);
      onSettingsUpdated(result);
      alert("تم حفظ إعدادات النظام وتحديث القوالب الرسمية بالخادم.");
    } catch (err) {
      console.error(err);
      alert("حدث خطأ أثناء حفظ الإعدادات بالخادم.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 font-cairo">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900">شاشة تهيئة النظام والمعلمات</h2>
          <p className="text-sm text-slate-500 mt-1">تعديل معلومات المكتب المطبوعة، قوالب إرسال الواتساب والربط الرقمي</p>
        </div>
      </div>

      <form onSubmit={handleSaveSettings} className="space-y-6 max-w-3xl">
        
        {/* Core Office Profile Card */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-4">
          <h3 className="font-bold text-sm text-slate-800 flex items-center gap-1.5 border-b border-slate-100 pb-2">
            <Settings className="w-4.5 h-4.5 text-slate-500" />
            الملف التعريفي للمكتب:
          </h3>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 block">اسم المكتب المعتمد بالترويسة:</label>
              <input 
                type="text" 
                value={headerText}
                onChange={(e) => setHeaderText(e.target.value)}
                placeholder="e.g. مكتب مزايا للخدمات الحكومية والجوازات"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs"
                required
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 block">رقم هاتف التواصل والشكاوى:</label>
              <input 
                type="text" 
                value={welcomeMessage}
                onChange={(e) => setWelcomeMessage(e.target.value)}
                placeholder="e.g. 01020304050"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono"
                required
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-700 block">تذييل إيصال الطباعة الحرارية (8 سم):</label>
            <input 
              type="text" 
              value={footerText}
              onChange={(e) => setFooterText(e.target.value)}
              placeholder="يسعدنا خدمتكم - طنطا شارع الجلاء بجوار الجوازات"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-700 block">شروط وأحكام تسليم المعاملات الافتراضية:</label>
            <textarea 
              value={whatsappTemplate}
              onChange={(e) => setWhatsappTemplate(e.target.value)}
              placeholder="مثال: يرجى إحضار أصل البطاقة الشخصية لمطابقتها عند التسليم..."
              rows={3}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs"
              required
            />
          </div>
        </div>

        {/* WhatsApp Notification Message Templates Card */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-4">
          <h3 className="font-bold text-sm text-slate-800 flex items-center gap-1.5 border-b border-slate-100 pb-2">
            <MessageCircle className="w-4.5 h-4.5 text-blue-500" />
            قوالب رسائل تذكير الواتساب التلقائية:
          </h3>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 block">قالب الإخطار بجاهزية الأوراق (مرحلة Ready):</label>
              <textarea 
                value={readyMessage}
                onChange={(e) => setReadyMessage(e.target.value)}
                placeholder="أهلاً {اسم_العميل}، طلبك {الخدمات} جاهز للتسليم في مكتب مزايا بالدرج {رقم_الارشيف}."
                rows={3}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs"
              />
              <div className="flex flex-wrap gap-1.5 text-[9px] text-slate-400 font-mono">
                <span>متغيرات صالحة:</span>
                <span className="bg-slate-100 px-1 py-0.5 rounded text-slate-700 font-bold">{"{اسم_العميل}"}</span>
                <span className="bg-slate-100 px-1 py-0.5 rounded text-slate-700 font-bold">{"{رقم_الفاتورة}"}</span>
                <span className="bg-slate-100 px-1 py-0.5 rounded text-slate-700 font-bold">{"{رقم_الارشيف}"}</span>
                <span className="bg-slate-100 px-1 py-0.5 rounded text-slate-700 font-bold">{"{الخدمات}"}</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 block">قالب رسالة تأكيد التسليم الناجح (مرحلة Delivered):</label>
              <textarea 
                value={deliveryMessage}
                onChange={(e) => setDeliveryMessage(e.target.value)}
                placeholder="عزيزنا {اسم_العميل}، تم تسليم كامل مستندات الفاتورة {رقم_الفاتورة} بنجاح وسرور."
                rows={2}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs"
              />
              <div className="flex flex-wrap gap-1.5 text-[9px] text-slate-400 font-mono">
                <span>متغيرات صالحة:</span>
                <span className="bg-slate-100 px-1 py-0.5 rounded text-slate-700 font-bold">{"{اسم_العميل}"}</span>
                <span className="bg-slate-100 px-1 py-0.5 rounded text-slate-700 font-bold">{"{رقم_الفاتورة}"}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Google Sheets Synchronization Card */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-5">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h3 className="font-extrabold text-sm text-slate-800 flex items-center gap-1.5">
              <Globe className="w-5 h-5 text-emerald-500" />
              ربط ومزامنة قاعدة البيانات بجوجل شيت (Google Sheets API):
            </h3>
            {isGoogleConnected ? (
              <span className="bg-emerald-50 text-emerald-700 text-[10px] px-2.5 py-1 rounded-full font-bold flex items-center gap-1 animate-pulse">
                <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></span>
                حساب Google متصل
              </span>
            ) : (
              <span className="bg-amber-50 text-amber-700 text-[10px] px-2.5 py-1 rounded-full font-bold">
                غير متصل بجوجل شيت
              </span>
            )}
          </div>

          <div className="space-y-4 text-xs">
            <p className="text-slate-500 text-[11px] leading-relaxed">
              يمكنك ربط تطبيق مزايا بشكل كامل بملف <strong>Google Sheets</strong> خاص بك على Google Drive ليقوم بدور قاعدة البيانات الحية. سيتم حفظ وتخزين كافة المعلمات والعمليات (الفواتير)، الخدمات، وقائمة الكلمات المترجمة والتحصيلات في تبويبات مخصصة بالملف.
            </p>

            {/* Auth State Panel */}
            {!isGoogleConnected ? (
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 text-center space-y-3">
                <p className="text-slate-600 font-medium text-[11px]">
                  للبدء في الاعتماد على جوجل شيت، يرجى تسجيل الدخول بحساب Google الخاص بك لتفويض التطبيق:
                </p>
                <div className="flex justify-center">
                  <button
                    type="button"
                    onClick={handleGoogleLogin}
                    disabled={syncLoading}
                    className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-250 hover:bg-slate-50 text-slate-700 font-bold rounded-lg shadow-sm transition-all cursor-pointer text-xs"
                  >
                    <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" className="w-4.5 h-4.5">
                      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
                      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
                      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
                      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
                    </svg>
                    ربط التطبيق بحساب Google 🔗
                  </button>
                </div>
              </div>
            ) : (
              <div className="bg-emerald-50/50 border border-emerald-100 rounded-xl p-4 space-y-4">
                <div className="flex items-center justify-between text-xs text-emerald-800">
                  <span className="font-bold flex items-center gap-1">
                    <CheckCircle className="w-4 h-4 text-emerald-600" />
                    تم تسجيل الدخول بنجاح!
                  </span>
                  <button
                    type="button"
                    onClick={handleGoogleLogout}
                    className="text-[10px] text-red-600 hover:text-red-800 font-bold flex items-center gap-0.5 cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    قطع الاتصال 🔴
                  </button>
                </div>

                {/* Google Spreadsheet Sync Actions */}
                <div className="grid md:grid-cols-2 gap-4 pt-1">
                  {/* Column A: Setup/Create */}
                  <div className="bg-white p-3 border border-slate-200 rounded-lg space-y-2.5">
                    <span className="font-extrabold text-[11px] text-slate-700 block">1. إعداد وتوصيل الملف:</span>
                    <p className="text-[10px] text-slate-400">
                      سيقوم التطبيق بالبحث عن ملفك الخاص أو إنشاء ملف آمن جديد بالكامل في Google Drive مهيأ بالكامل.
                    </p>
                    <button
                      type="button"
                      disabled={syncLoading}
                      onClick={handleConnectSheets}
                      className="w-full py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg text-[10px] flex items-center justify-center gap-1 transition-colors cursor-pointer"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${syncLoading ? "animate-spin" : ""}`} />
                      تجهيز وربط ملف جوجل شيت التلقائي 📊
                    </button>
                  </div>

                  {/* Column B: Manual Sync */}
                  <div className="bg-white p-3 border border-slate-200 rounded-lg space-y-2.5">
                    <span className="font-extrabold text-[11px] text-slate-700 block">2. مزامنة ونقل البيانات:</span>
                    <p className="text-[10px] text-slate-400">
                      التحكم في دفع (تصدير) أو سحب (استيراد) كافة العمليات بين مخزن الموبايل/الخادم والملف.
                    </p>
                    <div className="grid grid-cols-2 gap-1.5">
                      <button
                        type="button"
                        disabled={syncLoading || !googleSheetId}
                        onClick={handlePushData}
                        className="py-1.5 bg-slate-950 hover:bg-slate-850 text-white font-bold rounded-lg text-[10px] flex items-center justify-center gap-1 transition-colors cursor-pointer disabled:opacity-40"
                        title={!googleSheetId ? "يرجى ربط جوجل شيت أولاً" : "تصدير البيانات"}
                      >
                        تصدير للشيت 📤
                      </button>
                      <button
                        type="button"
                        disabled={syncLoading || !googleSheetId}
                        onClick={handlePullData}
                        className="py-1.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg text-[10px] flex items-center justify-center gap-1 transition-colors cursor-pointer disabled:opacity-40"
                        title={!googleSheetId ? "يرجى ربط جوجل شيت أولاً" : "استيراد البيانات"}
                      >
                        استيراد من الشيت 📥
                      </button>
                    </div>
                  </div>
                </div>

                {/* Spreadsheet Details */}
                {googleSheetId && (
                  <div className="p-3 bg-white border border-slate-150 rounded-lg space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-700 text-[10px]">ملف قاعدة البيانات النشط:</span>
                      <a
                        href={settings.googleSheetUrl || `https://docs.google.com/spreadsheets/d/${googleSheetId}/edit`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[10px] text-emerald-600 hover:text-emerald-800 font-bold flex items-center gap-0.5"
                      >
                        فتح الملف في علامة تبويب جديدة 🌐
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                    <div className="font-mono text-[9px] text-slate-400 break-all select-all p-1 bg-slate-50 border border-slate-100 rounded">
                      ID: {googleSheetId}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Status Feedback Message */}
            {syncMessage && (
              <div className="p-2.5 bg-slate-100 border border-slate-200 rounded-lg flex items-center gap-2 text-slate-700 text-[10px] font-medium font-mono">
                <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-ping"></span>
                <span>حالة النظام: {syncMessage}</span>
              </div>
            )}
          </div>
        </div>

        {/* Passcode / Privacy Management Card */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-4">
          <h3 className="font-bold text-sm text-slate-800 flex items-center gap-1.5 border-b border-slate-100 pb-2">
            <ShieldCheck className="w-4.5 h-4.5 text-blue-500" />
            إدارة الخصوصية والأرقام السرية (للموظفين):
          </h3>

          <div className="grid md:grid-cols-2 gap-6 text-xs">
            {/* Section A: Change my own passcode */}
            <div className="bg-slate-50 p-4 rounded-xl space-y-3.5 border border-slate-150">
              <h4 className="font-bold text-slate-700 flex items-center gap-1.5 border-b border-slate-200 pb-1.5">
                <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                تغيير الرقم السري الخاص بك ({activeEmployee.name})
              </h4>
              <div className="space-y-2">
                {activeEmployee.password && activeEmployee.password.trim() !== "" && (
                  <div className="space-y-1">
                    <label className="text-[11px] text-slate-500 font-medium block">الرقم السري الحالي للتحقق:</label>
                    <input 
                      type="password" 
                      value={myCurrentPassword}
                      onChange={(e) => setMyCurrentPassword(e.target.value)}
                      placeholder="أدخل رقمك السري الحالي"
                      className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-mono"
                    />
                  </div>
                )}
                <div className="space-y-1">
                  <label className="text-[11px] text-slate-500 font-medium block">الرقم السري الجديد:</label>
                  <input 
                    type="password" 
                    value={myNewPassword}
                    onChange={(e) => setMyNewPassword(e.target.value)}
                    placeholder="أدخل الرقم السري الجديد"
                    className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] text-slate-500 font-medium block">تأكيد الرقم السري الجديد:</label>
                  <input 
                    type="password" 
                    value={myConfirmPassword}
                    onChange={(e) => setMyConfirmPassword(e.target.value)}
                    placeholder="أدخل الرقم السري الجديد مرة أخرى"
                    className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-mono"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleChangeMyPassword}
                  className="w-full py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg transition-colors cursor-pointer"
                >
                  تحديث الرقم السري الخاص بي 🔐
                </button>
              </div>
            </div>

            {/* Section B: Admin Password Reset (Only visible to admin) */}
            <div className="bg-slate-50 p-4 rounded-xl space-y-3.5 border border-slate-150 flex flex-col justify-between">
              <div>
                <h4 className="font-bold text-slate-700 flex items-center gap-1.5 border-b border-slate-200 pb-1.5">
                  <span className="w-2 h-2 bg-amber-500 rounded-full"></span>
                  لوحة تحكم المدير لإدارة حسابات الموظفين
                </h4>
                {activeEmployee.role === "admin" ? (
                  <div className="space-y-3 pt-1">
                    <p className="text-[11px] text-slate-500">
                      بصفتك مديراً للنظام، يمكنك تصفير أو تعديل الرقم السري لأي موظف كاونتر في حال فقدانه أو لتحديثه:
                    </p>
                    <div className="space-y-2 max-h-[150px] overflow-y-auto pr-1">
                      {employees && employees.map((emp) => (
                        <div key={emp.username} className="flex items-center justify-between p-2 bg-white rounded-lg border border-slate-150 text-[11px]">
                          <div className="flex flex-col">
                            <span className="font-bold text-slate-700">{emp.name} ({emp.username})</span>
                            <span className="text-[9px] text-slate-400">
                              {emp.password ? `🔒 محمي برقم سري: ${emp.password}` : "🔓 غير محمي برقم سري"}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleAdminResetPassword(emp)}
                            className="px-2.5 py-1 bg-amber-600 hover:bg-amber-500 text-white text-[10px] font-bold rounded-md transition-colors cursor-pointer"
                          >
                            تعديل الرقم السري ✏️
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="p-4 text-center text-slate-400 bg-white/50 rounded-xl border border-dashed border-slate-200 flex flex-col items-center justify-center gap-1.5 mt-4">
                    <AlertCircle className="w-5 h-5 text-slate-400" />
                    <span>هذه اللوحة مخصصة لمدير النظام فقط لإعادة ضبط أرقام الموظفين عند فقدانها.</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Submit Actions */}
        <div className="flex justify-end gap-2">
          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2.5 bg-slate-900 text-white hover:bg-slate-800 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-colors shadow-md disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {saving ? "جاري الحفظ والتهيئة..." : "حفظ جميع الإعدادات بالتكامل 💾"}
          </button>
        </div>

      </form>

    </div>
  );
}
