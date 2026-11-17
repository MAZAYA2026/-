import React, { useState } from "react";
import { Employee } from "../types";
import { 
  Users, 
  ShieldCheck, 
  Shield, 
  Key, 
  Lock, 
  Unlock, 
  Plus, 
  Edit3, 
  Trash2, 
  Check, 
  X, 
  AlertCircle, 
  CheckCircle, 
  UserPlus, 
  Eye, 
  EyeOff,
  Cloud,
  Download,
  RefreshCw,
  FileSpreadsheet
} from "lucide-react";
import { syncEmployeesToGoogleSheets, pullEmployeesFromGoogleSheets, EmployeesSaveResponse } from "../lib/api";

interface EmployeeManagerProps {
  employees: Employee[];
  activeEmployee: Employee;
  onEmployeesUpdated: (employees: Employee[], previousUsername?: string) => Promise<EmployeesSaveResponse | void> | void;
  googleSheetWebhookUrl?: string;
}

export default function EmployeeManager({
  employees,
  activeEmployee,
  onEmployeesUpdated,
  googleSheetWebhookUrl,
}: EmployeeManagerProps) {
  // Sync to Google Sheets states
  const [syncLoading, setSyncLoading] = useState(false);
  const [syncFeedback, setSyncFeedback] = useState("");
  const [syncFeedbackType, setSyncFeedbackType] = useState<"info" | "success" | "warning" | "error">("info");
  // Passcode change for active employee
  const [myCurrentPassword, setMyCurrentPassword] = useState("");
  const [myNewPassword, setMyNewPassword] = useState("");
  const [myConfirmPassword, setMyConfirmPassword] = useState("");
  const [myPassFeedback, setMyPassFeedback] = useState("");
  const [myPassLoading, setMyPassLoading] = useState(false);

  // Edit employee modal state
  const [editingEmp, setEditingEmp] = useState<Employee | null>(null);
  const [editName, setEditName] = useState("");
  const [editUsername, setEditUsername] = useState("");
  const [editRole, setEditRole] = useState<"admin" | "employee">("employee");
  const [editPassword, setEditPassword] = useState("");
  const [showEditPassword, setShowEditPassword] = useState(false);
  const [editPermissions, setEditPermissions] = useState<Employee["permissions"]>({
    canCreateInvoices: true,
    canEditInvoices: true,
    canViewCollection: true,
    canManageServices: false,
    canViewAmanReport: true,
  });

  // Add employee modal state
  const [isAddingEmp, setIsAddingEmp] = useState(false);
  const [newName, setNewName] = useState("");
  const [newUsername, setNewUsername] = useState("");
  const [newRole, setNewRole] = useState<"admin" | "employee">("employee");
  const [newPassword, setNewPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [newPermissions, setNewPermissions] = useState<Employee["permissions"]>({
    canCreateInvoices: true,
    canEditInvoices: true,
    canViewCollection: true,
    canManageServices: false,
    canViewAmanReport: true,
  });

  const [feedback, setFeedback] = useState("");
  const [feedbackType, setFeedbackType] = useState<"success" | "warning" | "error">("success");
  const [loading, setLoading] = useState(false);

  const applySaveFeedback = (res: EmployeesSaveResponse | void, successMessage: string) => {
    if (res && res.sheetSynced === true) {
      setFeedbackType("success");
      setFeedback(`${successMessage} وتم الحفظ في شيت جوجل درايف بنجاح ☁️✅`);
      setSyncFeedbackType("success");
      setSyncFeedback("تم تحديث ورقة Employees_الموظفين_والصلاحيات في جوجل شيت تلقائياً ✅");
    } else if (res && res.needsScriptUpdate) {
      setFeedbackType("warning");
      setFeedback(
        `${successMessage} محلياً، ولكن كود Apps Script في جوجل شيت قديم ولا يحتوي على مزامنة الموظفين. يرجى نسخ الكود الجديد ونشر إصدار جديد (New version) في جوجل شيت.`
      );
      setSyncFeedbackType("warning");
      setSyncFeedback("يتطلب تحديث كود Apps Script في جوجل شيت (New version) لحفظ الموظفين ⚠️");
    } else if (res && res.sheetSynced === false) {
      setFeedbackType("warning");
      setFeedback(res.message || `${successMessage} محلياً، وتعذر الحفظ في جوجل شيت حالياً.`);
      setSyncFeedbackType("warning");
      setSyncFeedback(res.sheetError || "لم يكتمل الحفظ التلقائي في جوجل شيت ⚠️");
    } else {
      setFeedbackType("success");
      setFeedback(successMessage);
    }
    setTimeout(() => setFeedback(""), 8000);
    setTimeout(() => setSyncFeedback(""), 8000);
  };

  const isAdmin = activeEmployee.role === "admin";

  // Change active employee's own passcode
  const handleChangeMyPassword = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
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

    setMyPassLoading(true);
    try {
      const updatedEmployees = employees.map((emp) =>
        emp.username === activeEmployee.username
          ? { ...emp, password: myNewPassword.trim() }
          : emp
      );

      const res = await onEmployeesUpdated(updatedEmployees, activeEmployee.username);
      if (res && res.sheetSynced === false) {
        setMyPassFeedback("تم تحديث رقمك السري محلياً ⚠️ " + (res.sheetError || "تعذر المزامنة مع جوجل شيت"));
      } else {
        setMyPassFeedback("تم تحديث وحفظ رقمك السري محلياً وفي جوجل شيت بنجاح 🔐✅");
      }
      setMyCurrentPassword("");
      setMyNewPassword("");
      setMyConfirmPassword("");
      setTimeout(() => setMyPassFeedback(""), 5000);
    } catch (err) {
      console.error(err);
      alert("حدث خطأ أثناء حفظ الرقم السري.");
    } finally {
      setMyPassLoading(false);
    }
  };

  // Open edit modal for an employee
  const handleOpenEdit = (emp: Employee) => {
    setEditingEmp(emp);
    setEditName(emp.name);
    setEditUsername(emp.username);
    setEditRole(emp.role);
    setEditPassword(emp.password || "");
    setShowEditPassword(false);
    setEditPermissions({
      canCreateInvoices: emp.permissions?.canCreateInvoices ?? true,
      canEditInvoices: emp.permissions?.canEditInvoices ?? true,
      canViewCollection: emp.permissions?.canViewCollection ?? true,
      canManageServices: emp.permissions?.canManageServices ?? false,
      canViewAmanReport: emp.permissions?.canViewAmanReport ?? true,
    });
  };

  // Save edited employee
  const handleSaveEdit = async () => {
    if (!editingEmp) return;
    const trimmedName = editName.trim();
    const trimmedUsername = editUsername.trim().toLowerCase();

    if (!trimmedName) {
      alert("يرجى إدخال اسم الموظف.");
      return;
    }
    if (!trimmedUsername) {
      alert("يرجى إدخال اسم المستخدم.");
      return;
    }

    // Check if new username conflicts with another existing employee
    const usernameConflict = employees.some(
      (e) => e.username.toLowerCase() === trimmedUsername && e.username !== editingEmp.username
    );
    if (usernameConflict) {
      alert("اسم المستخدم هذا مستخدم بالفعل من قبل موظف آخر. يرجى اختيار اسم مستخدم مميز.");
      return;
    }

    // If changing role from admin to employee, ensure at least one admin remains
    if (editingEmp.role === "admin" && editRole !== "admin") {
      const otherAdmins = employees.filter((e) => e.role === "admin" && e.username !== editingEmp.username);
      if (otherAdmins.length === 0) {
        alert("لا يمكن إلغاء صلاحية المدير لهذا الحساب لأنه لا يوجد مدير آخر للنظام.");
        return;
      }
    }

    setLoading(true);
    try {
      const updatedEmployees = employees.map((emp) => {
        if (emp.username === editingEmp.username) {
          return {
            ...emp,
            name: trimmedName,
            username: trimmedUsername,
            role: editRole,
            password: editPassword.trim() ? editPassword.trim() : undefined,
            permissions: {
              ...editPermissions,
              // If role is admin, ensure manageServices is true
              canManageServices: editRole === "admin" ? true : editPermissions.canManageServices,
            },
          };
        }
        return emp;
      });

      const res = await onEmployeesUpdated(updatedEmployees, editingEmp.username);
      setEditingEmp(null);
      applySaveFeedback(res, `تم تحديث وحفظ بيانات وصلاحيات الموظف (${trimmedName})!`);
    } catch (err: any) {
      console.error(err);
      setFeedbackType("error");
      setFeedback("حدث خطأ أثناء حفظ التعديلات: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Add new employee
  const handleAddNewEmployee = async () => {
    const trimmedName = newName.trim();
    const trimmedUsername = newUsername.trim().toLowerCase();

    if (!trimmedName) {
      alert("يرجى كتابة اسم الموظف.");
      return;
    }
    if (!trimmedUsername) {
      alert("يرجى كتابة اسم المستخدم بالإنجليزية.");
      return;
    }

    const usernameExists = employees.some(
      (e) => e.username.toLowerCase() === trimmedUsername
    );
    if (usernameExists) {
      alert("اسم المستخدم هذا مستخدم بالفعل. يرجى اختيار اسم مستخدم آخر.");
      return;
    }

    setLoading(true);
    try {
      const newEmp: Employee = {
        name: trimmedName,
        username: trimmedUsername,
        role: newRole,
        password: newPassword.trim() ? newPassword.trim() : undefined,
        permissions: {
          ...newPermissions,
          canManageServices: newRole === "admin" ? true : newPermissions.canManageServices,
        },
      };

      const updated = [...employees, newEmp];
      const res = await onEmployeesUpdated(updated);
      setIsAddingEmp(false);
      setNewName("");
      setNewUsername("");
      setNewRole("employee");
      setNewPassword("");
      setNewPermissions({
        canCreateInvoices: true,
        canEditInvoices: true,
        canViewCollection: true,
        canManageServices: false,
        canViewAmanReport: true,
      });
      applySaveFeedback(res, `تم إضافة الموظف الجديد (${trimmedName})!`);
    } catch (err: any) {
      console.error(err);
      setFeedbackType("error");
      setFeedback("حدث خطأ أثناء إضافة الموظف: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Delete employee
  const handleDeleteEmployee = async (emp: Employee) => {
    if (emp.username === activeEmployee.username) {
      alert("لا يمكنك حذف الحساب الخاص بك وأنت مسجل الدخول به حالياً.");
      return;
    }

    if (emp.role === "admin") {
      const adminCount = employees.filter((e) => e.role === "admin").length;
      if (adminCount <= 1) {
        alert("لا يمكن حذف هذا الحساب لأنه المدير الوحيد المتبقي للنظام.");
        return;
      }
    }

    const confirmed = window.confirm(
      `⚠️ تأكيد الحذف:\nهل أنت متأكد من حذف حساب الموظف (${emp.name}) نهائياً من النظام وقاعدة البيانات؟`
    );
    if (!confirmed) return;

    setLoading(true);
    try {
      const updated = employees.filter((e) => e.username !== emp.username);
      const res = await onEmployeesUpdated(updated);
      applySaveFeedback(res, `تم حذف حساب الموظف (${emp.name})`);
    } catch (err: any) {
      console.error(err);
      setFeedbackType("error");
      setFeedback("حدث خطأ أثناء حذف الموظف: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Sync employees and access permissions to Google Sheets
  const handleSyncToSheets = async () => {
    setSyncLoading(true);
    setSyncFeedbackType("info");
    setSyncFeedback("جاري مزامنة بيانات الموظفين والصلاحيات مع شيت جوجل درايف...");
    try {
      const res = await syncEmployeesToGoogleSheets(googleSheetWebhookUrl);
      if (res.savedInSheet === false || res.needsScriptUpdate) {
        setSyncFeedbackType("warning");
        setSyncFeedback(res.message || "تعذر التأكد من الحفظ في جوجل شيت — يرجى تحديث كود Apps Script (New version)");
      } else {
        setSyncFeedbackType("success");
        setSyncFeedback(res.message || "تم تسجيل وتحديث بيانات الموظفين وصلاحيات الدخول في شيت جوجل درايف بنجاح! 👥☁️✅");
      }
      setTimeout(() => setSyncFeedback(""), 8000);
    } catch (err: any) {
      setSyncFeedbackType("error");
      setSyncFeedback(`فشل الحفظ في جوجل درايف: ${err.message}`);
      setTimeout(() => setSyncFeedback(""), 8000);
    } finally {
      setSyncLoading(false);
    }
  };

  // Pull employees from Google Sheets
  const handlePullFromSheets = async () => {
    const confirmPull = window.confirm("هل أنت متأكد من استيراد بيانات الموظفين وصلاحياتهم من شيت جوجل درايف؟\nسيتم تحديث قائمة الموظفين بناءً على المسجل في الشيت.");
    if (!confirmPull) return;

    setSyncLoading(true);
    setSyncFeedbackType("info");
    setSyncFeedback("جاري استيراد الموظفين من شيت جوجل درايف...");
    try {
      const res = await pullEmployeesFromGoogleSheets(googleSheetWebhookUrl);
      if (res.employees && res.employees.length > 0) {
        await onEmployeesUpdated(res.employees);
        setSyncFeedbackType("success");
        setSyncFeedback(res.message || "تم استيراد بيانات الموظفين وصلاحياتهم بنجاح! 📥✅");
      } else {
        setSyncFeedbackType("warning");
        setSyncFeedback(res.message || "لم يتم العثور على موظفين في الشيت.");
      }
      setTimeout(() => setSyncFeedback(""), 8000);
    } catch (err: any) {
      setSyncFeedbackType("error");
      setSyncFeedback(`فشل الاستيراد من جوجل درايف: ${err.message}`);
      setTimeout(() => setSyncFeedback(""), 8000);
    } finally {
      setSyncLoading(false);
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-6 font-cairo">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
        <div>
          <h3 className="font-bold text-sm text-slate-800 flex items-center gap-2">
            <Users className="w-5 h-5 text-blue-600" />
            <span>إدارة حسابات الموظفين والأسماء وتعديل الصلاحيات والأرقام السرية:</span>
          </h3>
          <p className="text-xs text-slate-500 mt-1">
            إمكانية تغيير أسماء الموظفين، ضبط صلاحيات إنشاء وتعديل الفواتير، التحصيل والخزينة، وكشف أمان
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Direct Google Sheets Sync Button */}
          <button
            type="button"
            disabled={syncLoading}
            onClick={handleSyncToSheets}
            className="px-3.5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer disabled:opacity-50"
            title="حفظ ومزامنة بيانات وصلاحيات الموظفين في ورقة Employees_الموظفين_والصلاحيات بملف جوجل شيت"
          >
            {syncLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Cloud className="w-4 h-4 text-emerald-200" />}
            <span>مزامنة مع جوجل درايف ☁️</span>
          </button>

          {/* Direct Google Sheets Pull Button */}
          <button
            type="button"
            disabled={syncLoading}
            onClick={handlePullFromSheets}
            className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer disabled:opacity-50"
            title="استيراد وتحديث بيانات الموظفين من ورقة جوجل شيت"
          >
            <Download className="w-4 h-4 text-blue-600" />
            <span>استيراد من الشيت 📥</span>
          </button>

          {isAdmin && (
            <button
              type="button"
              onClick={() => setIsAddingEmp(true)}
              className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer shrink-0"
            >
              <UserPlus className="w-4 h-4" />
              <span>إضافة موظف جديد ➕</span>
            </button>
          )}
        </div>
      </div>

      {/* Google Sheets Sync Status Bar */}
      <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs">
        <div className="flex items-center gap-2">
          <FileSpreadsheet className="w-4.5 h-4.5 text-emerald-600 shrink-0" />
          <div className="text-[11.5px] text-emerald-950 font-bold leading-relaxed">
            <span>ملف جوجل درايف مرتبط: يتم تسجيل وتحديث بيانات الموظفين وصلاحيات الدخول في ورقة </span>
            <code className="font-mono bg-white px-1.5 py-0.5 rounded border border-emerald-300 text-emerald-800 text-[11px]">Employees_الموظفين_والصلاحيات</code>
            <span> لتبقى مرجعاً دائماً وموثقاً لأي تحديثات مستقبلية.</span>
          </div>
        </div>
        {syncFeedback && (
          <span
            className={`text-[11px] font-bold px-2.5 py-1 rounded-lg shrink-0 animate-fade-in shadow-2xs border ${
              syncFeedbackType === "error"
                ? "text-rose-900 bg-rose-50 border-rose-300"
                : syncFeedbackType === "warning"
                ? "text-amber-950 bg-amber-50 border-amber-300"
                : syncFeedbackType === "info"
                ? "text-blue-900 bg-blue-50 border-blue-300"
                : "text-emerald-900 bg-white border-emerald-300"
            }`}
          >
            {syncFeedback}
          </span>
        )}
      </div>

      {/* Global Feedback Alert */}
      {feedback && (
        <div
          className={`p-3.5 border rounded-xl text-xs font-bold flex items-center gap-2 animate-fade-in ${
            feedbackType === "error"
              ? "bg-rose-50 border-rose-200 text-rose-800"
              : feedbackType === "warning"
              ? "bg-amber-50 border-amber-300 text-amber-950"
              : "bg-emerald-50 border-emerald-200 text-emerald-800"
          }`}
        >
          {feedbackType === "success" ? (
            <CheckCircle className="w-4.5 h-4.5 text-emerald-600 shrink-0" />
          ) : (
            <AlertCircle
              className={`w-4.5 h-4.5 shrink-0 ${
                feedbackType === "error" ? "text-rose-600" : "text-amber-600"
              }`}
            />
          )}
          <span>{feedback}</span>
        </div>
      )}

      {/* Section 1: Change my own passcode */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
        <h4 className="text-xs font-bold text-slate-800 flex items-center gap-2">
          <Key className="w-4 h-4 text-amber-600" />
          <span>تغيير الرقم السري لحسابك الحالي ({activeEmployee.name}):</span>
        </h4>

        {myPassFeedback && (
          <div className="p-2.5 bg-emerald-100 text-emerald-900 rounded-lg text-xs font-bold flex items-center gap-1.5">
            <Check className="w-4 h-4 text-emerald-700" />
            <span>{myPassFeedback}</span>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {activeEmployee.password && activeEmployee.password.trim() !== "" && (
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-600 block">الرقم السري الحالي:</label>
              <input
                type="password"
                value={myCurrentPassword}
                onChange={(e) => setMyCurrentPassword(e.target.value)}
                placeholder="أدخل رقمك السري الحالي"
                className="w-full bg-white border border-slate-300 rounded-xl px-3 py-1.5 text-xs font-mono"
              />
            </div>
          )}
          <div className="space-y-1">
            <label className="text-[11px] font-bold text-slate-600 block">الرقم السري الجديد:</label>
            <input
              type="password"
              value={myNewPassword}
              onChange={(e) => setMyNewPassword(e.target.value)}
              placeholder="أدخل الرقم السري الجديد"
              className="w-full bg-white border border-slate-300 rounded-xl px-3 py-1.5 text-xs font-mono"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[11px] font-bold text-slate-600 block">تأكيد الرقم السري الجديد:</label>
            <input
              type="password"
              value={myConfirmPassword}
              onChange={(e) => setMyConfirmPassword(e.target.value)}
              placeholder="أدخل الرقم السري مرة أخرى"
              className="w-full bg-white border border-slate-300 rounded-xl px-3 py-1.5 text-xs font-mono"
            />
          </div>
        </div>

        <div className="flex justify-end pt-1">
          <button
            type="button"
            onClick={handleChangeMyPassword}
            disabled={myPassLoading || !myNewPassword.trim()}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer disabled:opacity-50"
          >
            {myPassLoading ? "جاري التحديث..." : "تحديث رقمي السري 🔐"}
          </button>
        </div>
      </div>

      {/* Section 2: Employees List & Permissions */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-extrabold text-slate-800 flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>قائمة الموظفين والصلاحيات الممنوحة لكل حساب ({employees.length} موظف):</span>
          </h4>
        </div>

        <div className="grid grid-cols-1 gap-3.5">
          {employees.map((emp) => {
            const isMe = emp.username === activeEmployee.username;
            const empIsAdmin = emp.role === "admin";
            const perms = emp.permissions || {
              canCreateInvoices: true,
              canEditInvoices: true,
              canViewCollection: true,
              canManageServices: empIsAdmin,
              canViewAmanReport: true,
            };

            return (
              <div
                key={emp.username}
                className={`border rounded-xl p-4 transition-all ${
                  isMe
                    ? "bg-blue-50/40 border-blue-200 shadow-2xs"
                    : "bg-white border-slate-200 hover:border-slate-300"
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  {/* Employee identity */}
                  <div className="flex items-start gap-3">
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm shrink-0 shadow-2xs ${
                        empIsAdmin
                          ? "bg-amber-100 text-amber-800 border border-amber-300"
                          : "bg-slate-100 text-slate-700 border border-slate-200"
                      }`}
                    >
                      {emp.name.charAt(0)}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-sm text-slate-900">{emp.name}</span>
                        {isMe && (
                          <span className="text-[10px] bg-blue-100 text-blue-800 border border-blue-200 font-bold px-2 py-0.5 rounded-full">
                            أنت (الحساب الحالي)
                          </span>
                        )}
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                            empIsAdmin
                              ? "bg-amber-50 text-amber-900 border-amber-200"
                              : "bg-slate-100 text-slate-700 border-slate-200"
                          }`}
                        >
                          {empIsAdmin ? "مدير النظام (كامل الصلاحيات)" : "موظف كاونتر"}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-slate-500 mt-1 flex-wrap">
                        <span className="font-mono text-[11px] bg-slate-100 px-2 py-0.5 rounded">
                          @{emp.username}
                        </span>
                        <span className="text-[11px] flex items-center gap-1 font-mono">
                          {emp.password ? (
                            <span className="text-emerald-700 flex items-center gap-1">
                              <Lock className="w-3 h-3" />
                              <span>رقم سري: {isAdmin ? emp.password : "••••••"}</span>
                            </span>
                          ) : (
                            <span className="text-slate-400 flex items-center gap-1">
                              <Unlock className="w-3 h-3" />
                              <span>بدون رقم سري</span>
                            </span>
                          )}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  {isAdmin && (
                    <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                      <button
                        type="button"
                        onClick={() => handleOpenEdit(emp)}
                        className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer"
                        title="تعديل اسم الموظف والصلاحيات"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>تعديل الاسم والصلاحيات ✏️</span>
                      </button>

                      {!isMe && (
                        <button
                          type="button"
                          onClick={() => handleDeleteEmployee(emp)}
                          className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                          title="حذف الموظف نهائياً"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Permissions Badges */}
                <div className="mt-3.5 pt-3 border-t border-slate-100 flex flex-wrap items-center gap-2">
                  <span className="text-[11px] font-bold text-slate-400 ml-1">الصلاحيات:</span>

                  <span
                    className={`text-[10px] font-bold px-2.5 py-1 rounded-lg border flex items-center gap-1 ${
                      perms.canCreateInvoices
                        ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                        : "bg-slate-100 text-slate-400 border-slate-200 line-through opacity-60"
                    }`}
                  >
                    {perms.canCreateInvoices ? <Check className="w-3 h-3 text-emerald-600" /> : <X className="w-3 h-3" />}
                    <span>إنشاء الفواتير</span>
                  </span>

                  <span
                    className={`text-[10px] font-bold px-2.5 py-1 rounded-lg border flex items-center gap-1 ${
                      perms.canEditInvoices
                        ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                        : "bg-slate-100 text-slate-400 border-slate-200 line-through opacity-60"
                    }`}
                  >
                    {perms.canEditInvoices ? <Check className="w-3 h-3 text-emerald-600" /> : <X className="w-3 h-3" />}
                    <span>تعديل وحذف الفواتير</span>
                  </span>

                  <span
                    className={`text-[10px] font-bold px-2.5 py-1 rounded-lg border flex items-center gap-1 ${
                      perms.canViewCollection
                        ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                        : "bg-slate-100 text-slate-400 border-slate-200 line-through opacity-60"
                    }`}
                  >
                    {perms.canViewCollection ? <Check className="w-3 h-3 text-emerald-600" /> : <X className="w-3 h-3" />}
                    <span>عرض التحصيل والخزينة</span>
                  </span>

                  <span
                    className={`text-[10px] font-bold px-2.5 py-1 rounded-lg border flex items-center gap-1 ${
                      perms.canManageServices
                        ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                        : "bg-slate-100 text-slate-400 border-slate-200 line-through opacity-60"
                    }`}
                  >
                    {perms.canManageServices ? <Check className="w-3 h-3 text-emerald-600" /> : <X className="w-3 h-3" />}
                    <span>إدارة الخدمات والأسعار</span>
                  </span>

                  <span
                    className={`text-[10px] font-bold px-2.5 py-1 rounded-lg border flex items-center gap-1 ${
                      perms.canViewAmanReport
                        ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                        : "bg-slate-100 text-slate-400 border-slate-200 line-through opacity-60"
                    }`}
                  >
                    {perms.canViewAmanReport ? <Check className="w-3 h-3 text-emerald-600" /> : <X className="w-3 h-3" />}
                    <span>عرض كشف أمان والاستمارات</span>
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Edit Employee Modal */}
      {editingEmp && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4 animate-scale-up max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                <Edit3 className="w-5 h-5 text-blue-600" />
                <span>تعديل بيانات وصلاحيات الموظف: {editingEmp.name}</span>
              </h3>
              <button
                type="button"
                onClick={() => setEditingEmp(null)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3.5">
              {/* Name */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 block">
                  اسم الموظف الكامل (يظهر في الفواتير والتوقيع):
                </label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="مثال: أحمد محمد علي"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Username & Role */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 block">
                    اسم المستخدم (بالإنجليزي):
                  </label>
                  <input
                    type="text"
                    value={editUsername}
                    onChange={(e) => setEditUsername(e.target.value.toLowerCase().replace(/\s+/g, ""))}
                    placeholder="ahmed"
                    dir="ltr"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-xs font-mono font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 block">نوع الحساب:</label>
                  <select
                    value={editRole}
                    onChange={(e) => {
                      const newR = e.target.value as "admin" | "employee";
                      setEditRole(newR);
                      if (newR === "admin") {
                        setEditPermissions({
                          canCreateInvoices: true,
                          canEditInvoices: true,
                          canViewCollection: true,
                          canManageServices: true,
                          canViewAmanReport: true,
                        });
                      }
                    }}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                  >
                    <option value="employee">موظف كاونتر (صلاحيات مخصصة)</option>
                    <option value="admin">مدير النظام (كامل الصلاحيات)</option>
                  </select>
                </div>
              </div>

              {/* Password */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 block">
                  الرقم السري للموظف (اتركه فارغاً إذا أردت إلغاء الرقم السري):
                </label>
                <div className="relative">
                  <input
                    type={showEditPassword ? "text" : "password"}
                    value={editPassword}
                    onChange={(e) => setEditPassword(e.target.value)}
                    placeholder="أدخل الرقم السري الجديد"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-xs font-mono font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowEditPassword(!showEditPassword)}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {showEditPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Permissions Checkboxes */}
              <div className="space-y-2 pt-2 border-t border-slate-100">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-extrabold text-slate-800 block">
                    الصلاحيات المتاحة للموظف:
                  </label>
                  <div className="flex gap-1.5 text-[10px]">
                    <button
                      type="button"
                      onClick={() =>
                        setEditPermissions({
                          canCreateInvoices: true,
                          canEditInvoices: true,
                          canViewCollection: true,
                          canManageServices: true,
                          canViewAmanReport: true,
                        })
                      }
                      className="text-blue-600 hover:underline font-bold"
                    >
                      تحديد الكل
                    </button>
                    <span>|</span>
                    <button
                      type="button"
                      onClick={() =>
                        setEditPermissions({
                          canCreateInvoices: true,
                          canEditInvoices: true,
                          canViewCollection: true,
                          canManageServices: false,
                          canViewAmanReport: true,
                        })
                      }
                      className="text-slate-600 hover:underline font-bold"
                    >
                      كاونتر عادي
                    </button>
                  </div>
                </div>

                <div className="space-y-2 bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs">
                  <label className="flex items-center gap-2 cursor-pointer font-bold text-slate-800">
                    <input
                      type="checkbox"
                      checked={editPermissions.canCreateInvoices}
                      onChange={(e) =>
                        setEditPermissions({ ...editPermissions, canCreateInvoices: e.target.checked })
                      }
                      className="rounded text-blue-600 w-4 h-4"
                    />
                    <span>إنشاء وإصدار الفواتير وتسجيل العملاء الجدد</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer font-bold text-slate-800">
                    <input
                      type="checkbox"
                      checked={editPermissions.canEditInvoices}
                      onChange={(e) =>
                        setEditPermissions({ ...editPermissions, canEditInvoices: e.target.checked })
                      }
                      className="rounded text-blue-600 w-4 h-4"
                    />
                    <span>تعديل الفواتير الصادرة أو حذفها</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer font-bold text-slate-800">
                    <input
                      type="checkbox"
                      checked={editPermissions.canViewCollection}
                      onChange={(e) =>
                        setEditPermissions({ ...editPermissions, canViewCollection: e.target.checked })
                      }
                      className="rounded text-blue-600 w-4 h-4"
                    />
                    <span>عرض شاشة التحصيل والخزينة والتقارير المالية وتقفيل اليوم</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer font-bold text-slate-800">
                    <input
                      type="checkbox"
                      checked={editPermissions.canManageServices}
                      onChange={(e) =>
                        setEditPermissions({ ...editPermissions, canManageServices: e.target.checked })
                      }
                      className="rounded text-blue-600 w-4 h-4"
                    />
                    <span>إدارة الخدمات والأسعار وبنود الغرامات الحكومية</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer font-bold text-slate-800">
                    <input
                      type="checkbox"
                      checked={editPermissions.canViewAmanReport}
                      onChange={(e) =>
                        setEditPermissions({ ...editPermissions, canViewAmanReport: e.target.checked })
                      }
                      className="rounded text-blue-600 w-4 h-4"
                    />
                    <span>عرض وطباعة كشف أمان وتفصيلته ومتابعة الاستمارات</span>
                  </label>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setEditingEmp(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={handleSaveEdit}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors shadow-xs cursor-pointer disabled:opacity-50"
              >
                <Check className="w-4 h-4" />
                <span>{loading ? "جاري الحفظ..." : "حفظ التعديلات 💾"}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Employee Modal */}
      {isAddingEmp && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4 animate-scale-up max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-emerald-600" />
                <span>إضافة موظف جديد وتحديد صلاحياته</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsAddingEmp(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3.5">
              {/* Name */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 block">
                  اسم الموظف الكامل (يظهر في الفواتير والتوقيع):
                </label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="مثال: سارة إبراهيم"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              {/* Username & Role */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 block">
                    اسم المستخدم (بالإنجليزي للدخول):
                  </label>
                  <input
                    type="text"
                    value={newUsername}
                    onChange={(e) => setNewUsername(e.target.value.toLowerCase().replace(/\s+/g, ""))}
                    placeholder="sara"
                    dir="ltr"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-xs font-mono font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 block">نوع الحساب:</label>
                  <select
                    value={newRole}
                    onChange={(e) => {
                      const newR = e.target.value as "admin" | "employee";
                      setNewRole(newR);
                      if (newR === "admin") {
                        setNewPermissions({
                          canCreateInvoices: true,
                          canEditInvoices: true,
                          canViewCollection: true,
                          canManageServices: true,
                          canViewAmanReport: true,
                        });
                      }
                    }}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
                  >
                    <option value="employee">موظف كاونتر (صلاحيات مخصصة)</option>
                    <option value="admin">مدير النظام (كامل الصلاحيات)</option>
                  </select>
                </div>
              </div>

              {/* Password */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 block">
                  الرقم السري للموظف (اختياري للدخول الآمن):
                </label>
                <div className="relative">
                  <input
                    type={showNewPassword ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="أدخل رقماً سرياً"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-xs font-mono font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Permissions Checkboxes */}
              <div className="space-y-2 pt-2 border-t border-slate-100">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-extrabold text-slate-800 block">
                    الصلاحيات الممنوحة للموظف:
                  </label>
                  <div className="flex gap-1.5 text-[10px]">
                    <button
                      type="button"
                      onClick={() =>
                        setNewPermissions({
                          canCreateInvoices: true,
                          canEditInvoices: true,
                          canViewCollection: true,
                          canManageServices: true,
                          canViewAmanReport: true,
                        })
                      }
                      className="text-emerald-600 hover:underline font-bold"
                    >
                      تحديد الكل
                    </button>
                    <span>|</span>
                    <button
                      type="button"
                      onClick={() =>
                        setNewPermissions({
                          canCreateInvoices: true,
                          canEditInvoices: true,
                          canViewCollection: true,
                          canManageServices: false,
                          canViewAmanReport: true,
                        })
                      }
                      className="text-slate-600 hover:underline font-bold"
                    >
                      كاونتر عادي
                    </button>
                  </div>
                </div>

                <div className="space-y-2 bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs">
                  <label className="flex items-center gap-2 cursor-pointer font-bold text-slate-800">
                    <input
                      type="checkbox"
                      checked={newPermissions.canCreateInvoices}
                      onChange={(e) =>
                        setNewPermissions({ ...newPermissions, canCreateInvoices: e.target.checked })
                      }
                      className="rounded text-emerald-600 w-4 h-4"
                    />
                    <span>إنشاء وإصدار الفواتير وتسجيل العملاء الجدد</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer font-bold text-slate-800">
                    <input
                      type="checkbox"
                      checked={newPermissions.canEditInvoices}
                      onChange={(e) =>
                        setNewPermissions({ ...newPermissions, canEditInvoices: e.target.checked })
                      }
                      className="rounded text-emerald-600 w-4 h-4"
                    />
                    <span>تعديل الفواتير الصادرة أو حذفها</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer font-bold text-slate-800">
                    <input
                      type="checkbox"
                      checked={newPermissions.canViewCollection}
                      onChange={(e) =>
                        setNewPermissions({ ...newPermissions, canViewCollection: e.target.checked })
                      }
                      className="rounded text-emerald-600 w-4 h-4"
                    />
                    <span>عرض شاشة التحصيل والخزينة والتقارير المالية وتقفيل اليوم</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer font-bold text-slate-800">
                    <input
                      type="checkbox"
                      checked={newPermissions.canManageServices}
                      onChange={(e) =>
                        setNewPermissions({ ...newPermissions, canManageServices: e.target.checked })
                      }
                      className="rounded text-emerald-600 w-4 h-4"
                    />
                    <span>إدارة الخدمات والأسعار وبنود الغرامات الحكومية</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer font-bold text-slate-800">
                    <input
                      type="checkbox"
                      checked={newPermissions.canViewAmanReport}
                      onChange={(e) =>
                        setNewPermissions({ ...newPermissions, canViewAmanReport: e.target.checked })
                      }
                      className="rounded text-emerald-600 w-4 h-4"
                    />
                    <span>عرض وطباعة كشف أمان وتفصيلته ومتابعة الاستمارات</span>
                  </label>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsAddingEmp(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={handleAddNewEmployee}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors shadow-xs cursor-pointer disabled:opacity-50"
              >
                <Plus className="w-4 h-4" />
                <span>{loading ? "جاري الإضافة..." : "إضافة وتأكيد الموظف ➕"}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
