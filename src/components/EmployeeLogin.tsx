import React, { useState } from "react";
import { Employee } from "../types";
import { ShieldCheck, User, Plus, Key, LogIn, ChevronRight, Check, Lock, Unlock, Eye, EyeOff, AlertTriangle } from "lucide-react";

interface EmployeeLoginProps {
  employees: Employee[];
  activeEmployee: Employee | null;
  onLogin: (employee: Employee) => void;
  onAddEmployee: (employee: Employee) => void;
  onUpdateEmployees?: (employees: Employee[]) => void;
}

export default function EmployeeLogin({ employees, activeEmployee, onLogin, onAddEmployee, onUpdateEmployees }: EmployeeLoginProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState<"admin" | "employee">("employee");
  const [newPassword, setNewPassword] = useState("");
  
  // Custom permissions for newly added employees
  const [canCreate, setCanCreate] = useState(true);
  const [canEdit, setCanEdit] = useState(true);
  const [canViewCollection, setCanViewCollection] = useState(false);
  const [canManageServices, setCanManageServices] = useState(false);
  const [canViewAmanReport, setCanViewAmanReport] = useState(true);

  // Authentication State
  const [selectedEmpForAuth, setSelectedEmpForAuth] = useState<Employee | null>(null);
  const [authPasswordInput, setAuthPasswordInput] = useState("");
  const [authError, setAuthError] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Password Setup on Login State
  const [newPasscode, setNewPasscode] = useState("");
  const [confirmNewPasscode, setConfirmNewPasscode] = useState("");

  const handleEmployeeClick = (emp: Employee) => {
    setSelectedEmpForAuth(emp);
    setAuthPasswordInput("");
    setAuthError("");
    setNewPasscode("");
    setConfirmNewPasscode("");
    setShowAddForm(false);
    setShowPassword(false);
  };

  const handleVerifyAuth = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmpForAuth) return;

    const hasPassword = selectedEmpForAuth.password && selectedEmpForAuth.password.trim() !== "";
    if (hasPassword) {
      if (authPasswordInput === selectedEmpForAuth.password) {
        onLogin(selectedEmpForAuth);
      } else {
        setAuthError("الرقم السري الذي أدخلته غير صحيح. يرجى المحاولة مرة أخرى.");
      }
    } else {
      onLogin(selectedEmpForAuth);
    }
  };

  const handleSetPasswordOnLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmpForAuth) return;

    if (!newPasscode.trim()) {
      setAuthError("يرجى إدخال رقم سري صالح.");
      return;
    }
    if (newPasscode !== confirmNewPasscode) {
      setAuthError("الرقمان السريان غير متطابقين.");
      return;
    }

    // Save and update
    const updatedEmployees = employees.map((emp) => 
      emp.username === selectedEmpForAuth.username ? { ...emp, password: newPasscode.trim() } : emp
    );

    if (onUpdateEmployees) {
      onUpdateEmployees(updatedEmployees);
    }

    onLogin({ ...selectedEmpForAuth, password: newPasscode.trim() });
  };

  const handleLoginWithoutPassword = () => {
    if (!selectedEmpForAuth) return;
    onLogin(selectedEmpForAuth);
  };

  const handleCreateEmployee = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUsername.trim() || !newName.trim()) return;

    const newEmp: Employee = {
      username: newUsername.trim().toLowerCase(),
      name: newName.trim(),
      role: newRole,
      password: newPassword.trim() || undefined,
      permissions: {
        canCreateInvoices: canCreate,
        canEditInvoices: canEdit,
        canViewCollection: newRole === "admin" ? true : canViewCollection,
        canManageServices: newRole === "admin" ? true : canManageServices,
        canViewAmanReport: canViewAmanReport
      }
    };

    onAddEmployee(newEmp);
    setNewUsername("");
    setNewName("");
    setNewPassword("");
    setNewRole("employee");
    setShowAddForm(false);
  };

  return (
    <div className="bg-slate-900 text-white min-h-screen flex flex-col items-center justify-center p-6 font-cairo select-none relative overflow-hidden">
      {/* Background decoration elements */}
      <div className="absolute top-0 left-0 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2"></div>
      <div className="absolute bottom-0 right-0 w-96 h-96 bg-emerald-600/10 rounded-full blur-3xl translate-x-1/2 translate-y-1/2"></div>

      <div className="w-full max-w-4xl z-10 space-y-8">
        
        {/* Brand / Logo */}
        <div className="text-center space-y-3">
          <div className="inline-flex p-4 bg-slate-800 rounded-2xl border border-slate-700/50 shadow-inner text-blue-400">
            <ShieldCheck className="w-12 h-12" />
          </div>
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-blue-400 via-emerald-400 to-teal-400">
              نظام إدارة فواتير مكتب مزايا للجوازات
            </h1>
            <p className="text-slate-400 text-sm mt-1">تسهيل المعاملات الجماهيرية وتصريح كشوف حركة الجوازات</p>
          </div>
        </div>

        <div className="grid md:grid-cols-5 gap-8">
          
          {/* Main Select Profile */}
          <div className="md:col-span-3 bg-slate-800/60 backdrop-blur-md rounded-2xl border border-slate-700/65 p-6 shadow-xl flex flex-col justify-between">
            <div>
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-lg font-bold text-slate-200">اختر حساب الموظف للبدء:</h2>
                {!showAddForm && (
                  <button 
                    onClick={() => {
                      setShowAddForm(true);
                      setSelectedEmpForAuth(null);
                    }}
                    className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 font-bold transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    إضافة موظف جديد
                  </button>
                )}
              </div>

              {/* Profiles Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {employees.map((emp) => {
                  const isActive = activeEmployee?.username === emp.username;
                  const isSelectedForAuth = selectedEmpForAuth?.username === emp.username;
                  const hasPassword = emp.password && emp.password.trim() !== "";
                  
                  return (
                    <button
                      key={emp.username}
                      onClick={() => handleEmployeeClick(emp)}
                      className={`relative p-4 rounded-xl flex flex-col items-center justify-center text-center gap-2 border transition-all duration-200 group ${
                        isActive
                          ? "bg-blue-600/20 border-blue-500 text-white shadow-lg shadow-blue-500/15 scale-102"
                          : isSelectedForAuth
                          ? "bg-amber-600/20 border-amber-500 text-white shadow-lg shadow-amber-500/15 scale-102"
                          : "bg-slate-700/40 hover:bg-slate-700/70 border-slate-700 hover:border-slate-600 text-slate-300 hover:text-white"
                      }`}
                    >
                      <div className={`p-3 rounded-full transition-colors ${
                        isActive 
                          ? "bg-blue-500 text-white" 
                          : isSelectedForAuth 
                          ? "bg-amber-500 text-white" 
                          : "bg-slate-800 group-hover:bg-slate-900 text-slate-400 group-hover:text-slate-200"
                      }`}>
                        <User className="w-5 h-5" />
                      </div>
                      <span className="font-bold text-xs flex items-center gap-1.5 justify-center line-clamp-1 w-full">
                        {emp.name}
                        {hasPassword && (
                          <Lock className="w-3.5 h-3.5 text-amber-400 shrink-0" title="محمي برقم سري" />
                        )}
                      </span>
                      <span className="text-[10px] text-slate-400 uppercase tracking-wider font-mono">
                        {emp.role === "admin" ? "مدير النظام" : "موظف كاونتر"}
                      </span>
                      {isActive && (
                        <span className="absolute top-1.5 right-1.5 p-0.5 bg-blue-500 rounded-full text-white">
                          <Check className="w-3 h-3" />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Hint */}
            <div className="mt-6 pt-4 border-t border-slate-700 text-center text-xs text-slate-500 flex items-center justify-center gap-1.5">
              <Key className="w-3.5 h-3.5" />
              <span>قم باختيار اسمك وتأكيد الرقم السري للخصوصية للبدء في تشغيل فواتيرك.</span>
            </div>
          </div>

          {/* Form Add / Auth / Guide */}
          <div className="md:col-span-2 animate-fadeIn">
            {selectedEmpForAuth ? (
              <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 shadow-xl space-y-4">
                <div className="flex items-center justify-between border-b border-slate-700 pb-3">
                  <div className="flex items-center gap-2">
                    <User className="w-5 h-5 text-blue-400" />
                    <div>
                      <h3 className="font-bold text-sm text-slate-200">{selectedEmpForAuth.name}</h3>
                      <p className="text-[10px] text-slate-400 uppercase tracking-wider font-mono">
                        {selectedEmpForAuth.role === "admin" ? "مدير النظام" : "موظف كاونتر"}
                      </p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setSelectedEmpForAuth(null)}
                    className="text-slate-400 hover:text-slate-200 text-xs font-bold"
                  >
                    إغلاق
                  </button>
                </div>

                {selectedEmpForAuth.password && selectedEmpForAuth.password.trim() !== "" ? (
                  /* Verify Existing Password */
                  <form onSubmit={handleVerifyAuth} className="space-y-4">
                    <div className="space-y-1.5">
                      <label className="text-xs text-slate-400 flex items-center gap-1 font-bold">
                        <Lock className="w-3.5 h-3.5 text-amber-400" />
                        <span>يرجى إدخال الرقم السري لتأكيد هويتك:</span>
                      </label>
                      <div className="relative">
                        <input 
                          type={showPassword ? "text" : "password"} 
                          value={authPasswordInput} 
                          onChange={(e) => setAuthPasswordInput(e.target.value)} 
                          placeholder="الرقم السري الخاص بك" 
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500 font-mono text-center tracking-widest text-lg"
                          required
                          autoFocus
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute inset-y-0 left-3 flex items-center text-slate-400 hover:text-slate-200"
                        >
                          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    {authError && (
                      <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-xs px-3 py-2 rounded-lg flex items-center gap-1.5 font-semibold">
                        <AlertTriangle className="w-4 h-4 shrink-0" />
                        <span>{authError}</span>
                      </div>
                    )}

                    <div className="flex gap-2">
                      <button 
                        type="submit"
                        className="flex-1 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold py-2 px-3 rounded-lg transition-colors flex items-center justify-center gap-1.5"
                      >
                        <LogIn className="w-4 h-4" />
                        تأكيد الدخول
                      </button>
                      <button 
                        type="button"
                        onClick={() => setSelectedEmpForAuth(null)}
                        className="bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs font-bold py-2 px-3 rounded-lg transition-colors"
                      >
                        إلغاء
                      </button>
                    </div>
                  </form>
                ) : (
                  /* Set Password for the First Time */
                  <form onSubmit={handleSetPasswordOnLogin} className="space-y-4">
                    <div className="bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs p-3 rounded-lg space-y-1">
                      <div className="flex items-center gap-1.5 font-bold">
                        <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
                        <span>تنبيه الخصوصية والأمان</span>
                      </div>
                      <p className="leading-relaxed text-[11px]">
                        هذا الحساب غير محمي برقم سري حالياً. لتأمين معاملاتك ومنع الآخرين من تسجيل فواتير باسمك، ننصحك بإنشاء رقم سري الآن.
                      </p>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs text-slate-400 block font-bold">الرقم السري الجديد للخصوصية:</label>
                      <div className="relative">
                        <input 
                          type={showPassword ? "text" : "password"} 
                          value={newPasscode} 
                          onChange={(e) => setNewPasscode(e.target.value)} 
                          placeholder="مثال: 1234" 
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500 font-mono text-center tracking-widest text-lg"
                          required
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute inset-y-0 left-3 flex items-center text-slate-400 hover:text-slate-200"
                        >
                          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs text-slate-400 block font-bold">تأكيد الرقم السري الجديد:</label>
                      <input 
                        type="password" 
                        value={confirmNewPasscode} 
                        onChange={(e) => setConfirmNewPasscode(e.target.value)} 
                        placeholder="أدخل نفس الرقم مرة أخرى" 
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500 font-mono text-center tracking-widest text-lg"
                        required
                      />
                    </div>

                    {authError && (
                      <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-xs px-3 py-2 rounded-lg flex items-center gap-1.5 font-semibold">
                        <AlertTriangle className="w-4 h-4 shrink-0" />
                        <span>{authError}</span>
                      </div>
                    )}

                    <div className="space-y-2 pt-2">
                      <button 
                        type="submit"
                        className="w-full bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold py-2.5 px-3 rounded-lg transition-colors flex items-center justify-center gap-1.5"
                      >
                        <Lock className="w-4 h-4" />
                        حفظ الرقم السري وتأمين الدخول
                      </button>
                      <div className="flex gap-2">
                        <button 
                          type="button"
                          onClick={handleLoginWithoutPassword}
                          className="flex-1 bg-slate-750 hover:bg-slate-700 text-slate-300 text-[11px] font-bold py-2 px-2 rounded-lg transition-colors flex items-center justify-center gap-1"
                        >
                          <Unlock className="w-3.5 h-3.5 text-slate-400" />
                          الدخول بدون رقم سري
                        </button>
                        <button 
                          type="button"
                          onClick={() => setSelectedEmpForAuth(null)}
                          className="bg-slate-700 hover:bg-slate-650 text-slate-400 text-[11px] font-bold py-2 px-3 rounded-lg transition-colors"
                        >
                          إلغاء
                        </button>
                      </div>
                    </div>
                  </form>
                )}
              </div>
            ) : showAddForm ? (
              <form onSubmit={handleCreateEmployee} className="bg-slate-800/80 border border-slate-700 rounded-2xl p-6 shadow-xl space-y-4 animate-fadeIn">
                <h3 className="font-bold text-md text-slate-200 border-b border-slate-700 pb-2">موظف جديد وصلاحياته</h3>
                
                <div className="space-y-1.5">
                  <label className="text-xs text-slate-400 block">كود المستخدم (بالأحرف الإنجليزية):</label>
                  <input 
                    type="text" 
                    value={newUsername} 
                    onChange={(e) => setNewUsername(e.target.value)} 
                    placeholder="e.g. mona" 
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500 font-mono"
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs text-slate-400 block">اسم الموظف الثنائي:</label>
                  <input 
                    type="text" 
                    value={newName} 
                    onChange={(e) => setNewName(e.target.value)} 
                    placeholder="مثال: منى أحمد" 
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500"
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs text-slate-400 block">الرقم السري للخصوصية (اختياري):</label>
                  <input 
                    type="password" 
                    value={newPassword} 
                    onChange={(e) => setNewPassword(e.target.value)} 
                    placeholder="رقم سري لحماية الحساب" 
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500 font-mono"
                  />
                  <p className="text-[10px] text-slate-500">يمكن تركه فارغاً ليقوم الموظف بتعيينه بنفسه لاحقاً.</p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs text-slate-400 block">المسمى الوظيفي / الدور:</label>
                  <select 
                    value={newRole} 
                    onChange={(e) => setNewRole(e.target.value as any)} 
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-blue-500"
                  >
                    <option value="employee">موظف كاونتر (صلاحيات مخصصة)</option>
                    <option value="admin">مدير النظام (كامل الصلاحيات)</option>
                  </select>
                </div>

                {newRole === "employee" && (
                  <div className="space-y-2 pt-2 border-t border-slate-700/60">
                    <span className="text-xs font-bold text-slate-300 block mb-1">التحكم في الصلاحيات:</span>
                    
                    <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer">
                      <input type="checkbox" checked={canCreate} onChange={(e) => setCanCreate(e.target.checked)} className="rounded text-blue-500 focus:ring-0 bg-slate-900 border-slate-700 w-4 h-4" />
                      <span>إضافة وإنشاء فواتير جديدة</span>
                    </label>

                    <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer">
                      <input type="checkbox" checked={canEdit} onChange={(e) => setCanEdit(e.target.checked)} className="rounded text-blue-500 focus:ring-0 bg-slate-900 border-slate-700 w-4 h-4" />
                      <span>تعديل وحذف فواتير</span>
                    </label>

                    <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer">
                      <input type="checkbox" checked={canViewCollection} onChange={(e) => setCanViewCollection(e.target.checked)} className="rounded text-blue-500 focus:ring-0 bg-slate-900 border-slate-700 w-4 h-4" />
                      <span>عرض خزنة التحصيل اليومي وإغلاقها</span>
                    </label>

                    <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer">
                      <input type="checkbox" checked={canManageServices} onChange={(e) => setCanManageServices(e.target.checked)} className="rounded text-blue-500 focus:ring-0 bg-slate-900 border-slate-700 w-4 h-4" />
                      <span>إدارة وتعديل أسعار الخدمات</span>
                    </label>

                    <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer">
                      <input type="checkbox" checked={canViewAmanReport} onChange={(e) => setCanViewAmanReport(e.target.checked)} className="rounded text-blue-500 focus:ring-0 bg-slate-900 border-slate-700 w-4 h-4" />
                      <span>عرض وطباعة كشف أمان للخدمات الجماهيرية (#)</span>
                    </label>
                  </div>
                )}

                <div className="flex gap-2 pt-2">
                  <button 
                    type="submit"
                    className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold py-2 px-3 rounded-lg transition-colors flex items-center justify-center gap-1.5"
                  >
                    حفظ الموظف
                  </button>
                  <button 
                    type="button"
                    onClick={() => setShowAddForm(false)}
                    className="flex-1 bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs font-bold py-2 px-3 rounded-lg transition-colors"
                  >
                    إلغاء
                  </button>
                </div>
              </form>
            ) : (
              <div className="bg-slate-800/40 border border-slate-700/60 rounded-2xl p-6 shadow-md space-y-4">
                <div className="flex items-center gap-2 text-amber-400 border-b border-slate-700 pb-2">
                  <ShieldCheck className="w-5 h-5" />
                  <span className="font-bold text-sm">نظام صلاحيات مزايا الجوازات</span>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  يضمن هذا النظام الفصل والتحقق من صلاحية مدخلات كل موظف. يمتلك المدير <span className="text-amber-300">SHERIF</span> صلاحيات كاملة لمتابعة الخزائن وتصدير كشوفات أمان لشرطة الجوازات والتحكم في إعدادات الخدمات العامة.
                </p>
                <div className="space-y-2 pt-1 text-[11px] text-slate-500 leading-tight">
                  <div className="flex justify-between border-b border-slate-700/40 pb-1.5">
                    <span>المدير SHERIF:</span>
                    <span className="text-emerald-400 font-bold">كامل الصلاحيات</span>
                  </div>
                  <div className="flex justify-between border-b border-slate-700/40 pb-1.5">
                    <span>موظف الكاونتر randa / manar / omnia:</span>
                    <span className="text-blue-400 font-bold">الفواتير والإشعارات</span>
                  </div>
                  <div className="flex justify-between">
                    <span>تخزين البيانات:</span>
                    <span className="text-slate-300">جوجل شيت + نسخ احتياطي محلي</span>
                  </div>
                </div>
              </div>
            )}
          </div>

        </div>

      </div>
    </div>
  );
}
