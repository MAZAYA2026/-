import React, { useState, useEffect } from "react";
import { Invoice, Service, AppSettings, Employee, CollectionClosing } from "./types";
import { fetchDB, saveDB } from "./lib/api";
import EmployeeLogin from "./components/EmployeeLogin";
import InvoiceCreator from "./components/InvoiceCreator";
import InvoiceQuery from "./components/InvoiceQuery";
import AmanReport from "./components/AmanReport";
import NotificationsPanel from "./components/NotificationsPanel";
import CollectionPanel from "./components/CollectionPanel";
import ServicesConfig from "./components/ServicesConfig";
import SettingsConfig from "./components/SettingsConfig";
import { 
  PlusCircle, 
  Search, 
  ShieldAlert, 
  Bell, 
  LineChart, 
  FolderLock, 
  Settings, 
  User, 
  LogOut, 
  RefreshCw, 
  Activity, 
  Flame,
  HelpCircle
} from "lucide-react";

export default function App() {
  const [activeEmployee, setActiveEmployee] = useState<Employee | null>(null);
  
  // App DB data states
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [closings, setClosings] = useState<CollectionClosing[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  
  const [activeTab, setActiveTab] = useState<"create" | "query" | "aman" | "reminders" | "collection" | "services" | "settings">("create");
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  // Load the full database on login / mount
  const syncDatabase = async () => {
    setSyncing(true);
    try {
      const data = await fetchDB();
      setInvoices(data.invoices || []);
      setServices(data.services || []);
      setSettings(data.settings || null);
      setClosings(data.collectionClosings || []);
      setEmployees(data.employees || []);
    } catch (err) {
      console.error("Error syncing database:", err);
    } finally {
      setSyncing(false);
      setLoading(false);
    }
  };

  useEffect(() => {
    syncDatabase();
  }, [activeEmployee]);

  // Handle successful logins
  const handleLoginSuccess = (employee: Employee) => {
    setActiveEmployee(employee);
  };

  const handleLogout = () => {
    setActiveEmployee(null);
    setActiveTab("create");
  };

  const handleAddEmployee = async (newEmp: Employee) => {
    try {
      const updatedEmployees = [...employees, newEmp];
      setEmployees(updatedEmployees);
      const dbPayload = await fetchDB();
      dbPayload.employees = updatedEmployees;
      await saveDB(dbPayload);
    } catch (err) {
      console.error("Failed to add employee:", err);
    }
  };

  const handleUpdateEmployees = async (updatedEmployees: Employee[]) => {
    try {
      setEmployees(updatedEmployees);
      const dbPayload = await fetchDB();
      dbPayload.employees = updatedEmployees;
      await saveDB(dbPayload);
    } catch (err) {
      console.error("Failed to update employees:", err);
    }
  };

  // State handlers for downstream modifications
  const handleInvoiceCreated = (newInv: Invoice) => {
    setInvoices((prev) => [...prev, newInv]);
  };

  const handleInvoiceUpdated = (updatedInv: Invoice) => {
    setInvoices((prev) => prev.map((inv) => inv.invoiceId === updatedInv.invoiceId ? updatedInv : inv));
  };

  const handleInvoiceDeleted = (deletedId: number) => {
    setInvoices((prev) => prev.filter((inv) => inv.invoiceId !== deletedId));
  };

  const handleServiceCreated = (newSrv: Service) => {
    setServices((prev) => [...prev, newSrv]);
  };

  const handleServiceUpdated = (updatedSrv: Service) => {
    setServices((prev) => prev.map((srv) => srv.id === updatedSrv.id ? updatedSrv : srv));
  };

  const handleServiceDeleted = (id: string) => {
    setServices((prev) => prev.filter((srv) => srv.id !== id));
  };

  const handleServicesReordered = (newServices: Service[]) => {
    setServices(newServices);
  };

  const handleSettingsUpdated = (newSettings: AppSettings) => {
    setSettings(newSettings);
  };

  const handleClosingCreated = (newClosing: CollectionClosing) => {
    setClosings((prev) => [...prev, newClosing]);
  };

  // Safe reset trigger upon finishing collection drawer closing
  const handleDBResetAfterClosing = () => {
    syncDatabase();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-white space-y-4 font-cairo">
        <RefreshCw className="w-8 h-8 text-blue-500 animate-spin" />
        <div className="text-sm font-bold tracking-wide">جاري الاتصال والتحقق من قاعدة بيانات مزايا...</div>
      </div>
    );
  }

  // Not authenticated? Show the Egyptian Login Gate
  if (!activeEmployee) {
    return (
      <EmployeeLogin 
        employees={employees}
        activeEmployee={activeEmployee}
        onLogin={handleLoginSuccess}
        onAddEmployee={handleAddEmployee}
        onUpdateEmployees={handleUpdateEmployees}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col text-slate-900 font-sans selection:bg-slate-950 selection:text-amber-400">
      
      {/* Upper Navigation Navbar Banner */}
      <header className="bg-slate-950 text-white shadow-lg border-b border-slate-900 no-print">
        <div className="max-w-7xl mx-auto px-4 lg:px-6 h-16 flex items-center justify-between">
          
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 bg-amber-500 text-slate-950 rounded-xl flex items-center justify-center font-black text-lg shadow-md font-cairo">م</div>
            <div className="text-right">
              <h1 className="font-extrabold text-sm tracking-tight font-cairo leading-none">{settings?.headerText || "مكتب مزايا للجوازات"}</h1>
              <p className="text-[10px] text-slate-400 font-cairo mt-1">نظام فوترة العائلات والأسر المتكامل</p>
            </div>
          </div>

          {/* Sync indicator */}
          <div className="hidden sm:flex items-center gap-1.5 text-xs text-slate-400 font-cairo bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-full">
            <span className={`w-2 h-2 rounded-full ${syncing ? "bg-amber-500 animate-pulse" : "bg-emerald-500"}`} />
            <span>قاعدة البيانات: متصلة ونشطة</span>
            <button onClick={syncDatabase} disabled={syncing} className="p-0.5 hover:text-white" title="تحديث يدوي">
              <RefreshCw className={`w-3.5 h-3.5 ${syncing ? "animate-spin" : ""}`} />
            </button>
          </div>

          {/* Logged Employee Actions */}
          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="text-xs font-bold font-cairo text-slate-300 flex items-center gap-1">
                <User className="w-3.5 h-3.5 text-amber-500" />
                <span>الوردية: {activeEmployee.name}</span>
              </div>
              <div className="text-[9px] text-slate-500 font-cairo">{activeEmployee.role === "admin" ? "مدير النظام" : "موظف الاستقبال"}</div>
            </div>

            <button 
              onClick={handleLogout}
              className="p-2 bg-slate-900 border border-slate-800 text-slate-400 hover:text-white rounded-lg transition-colors flex items-center gap-1 text-xs font-bold font-cairo"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden md:inline">الخروج</span>
            </button>
          </div>

        </div>
      </header>

      {/* Primary Workspace Layout (Sidebar on Desktop, Top buttons on Mobile) */}
      <div className="max-w-7xl mx-auto w-full flex-1 flex flex-col md:flex-row p-4 lg:p-6 gap-6">
        
        {/* Sidebar Nav Panels */}
        <aside className="w-full md:w-64 shrink-0 flex flex-col gap-2.5 no-print font-cairo">
          
          <button
            onClick={() => setActiveTab("create")}
            className={`w-full text-right px-4 py-3 rounded-xl flex items-center justify-between text-xs font-bold transition-all ${
              activeTab === "create" 
                ? "bg-slate-950 text-white shadow-md shadow-slate-950/10" 
                : "bg-white text-slate-600 hover:bg-slate-200 border border-slate-200/60"
            }`}
          >
            <span className="flex items-center gap-2">
              <PlusCircle className="w-4.5 h-4.5" />
              إنشاء فاتورة جديدة
            </span>
            <span className="bg-slate-800 text-slate-300 text-[9px] px-1.5 py-0.5 rounded-sm font-mono">F1</span>
          </button>

          <button
            onClick={() => setActiveTab("query")}
            className={`w-full text-right px-4 py-3 rounded-xl flex items-center justify-between text-xs font-bold transition-all ${
              activeTab === "query" 
                ? "bg-slate-950 text-white shadow-md shadow-slate-950/10" 
                : "bg-white text-slate-600 hover:bg-slate-200 border border-slate-200/60"
            }`}
          >
            <span className="flex items-center gap-2">
              <Search className="w-4.5 h-4.5" />
              الاستعلام والمحفوظات
            </span>
          </button>

          <button
            onClick={() => setActiveTab("aman")}
            className={`w-full text-right px-4 py-3 rounded-xl flex items-center justify-between text-xs font-bold transition-all ${
              activeTab === "aman" 
                ? "bg-slate-950 text-white shadow-md shadow-slate-950/10" 
                : "bg-white text-slate-600 hover:bg-slate-200 border border-slate-200/60"
            }`}
          >
            <span className="flex items-center gap-2">
              <ShieldAlert className="w-4.5 h-4.5" />
              كشف أمان للجوازات (#)
            </span>
          </button>

          <button
            onClick={() => setActiveTab("reminders")}
            className={`w-full text-right px-4 py-3 rounded-xl flex items-center justify-between text-xs font-bold transition-all ${
              activeTab === "reminders" 
                ? "bg-slate-950 text-white shadow-md shadow-slate-950/10" 
                : "bg-white text-slate-600 hover:bg-slate-200 border border-slate-200/60"
            }`}
          >
            <span className="flex items-center gap-2">
              <Bell className="w-4.5 h-4.5" />
              التذكيرات والإشعارات
            </span>
            {invoices.filter(inv => !inv.notificationSent).length > 0 && (
              <span className="bg-rose-500 text-white text-[9px] px-1.5 py-0.5 rounded-full font-mono font-bold">
                {invoices.filter(inv => !inv.notificationSent).length}
              </span>
            )}
          </button>

          {activeEmployee.permissions.canViewCollection && (
            <button
              onClick={() => setActiveTab("collection")}
              className={`w-full text-right px-4 py-3 rounded-xl flex items-center justify-between text-xs font-bold transition-all ${
                activeTab === "collection" 
                  ? "bg-slate-950 text-white shadow-md shadow-slate-950/10" 
                  : "bg-white text-slate-600 hover:bg-slate-200 border border-slate-200/60"
              }`}
            >
              <span className="flex items-center gap-2">
                <LineChart className="w-4.5 h-4.5" />
                التحصيل واليومية
              </span>
            </button>
          )}

          <button
            onClick={() => setActiveTab("services")}
            className={`w-full text-right px-4 py-3 rounded-xl flex items-center justify-between text-xs font-bold transition-all ${
              activeTab === "services" 
                ? "bg-slate-950 text-white shadow-md shadow-slate-950/10" 
                : "bg-white text-slate-600 hover:bg-slate-200 border border-slate-200/60"
            }`}
          >
            <span className="flex items-center gap-2">
              <FolderLock className="w-4.5 h-4.5" />
              كتالوج الخدمات
            </span>
          </button>

          <button
            onClick={() => setActiveTab("settings")}
            className={`w-full text-right px-4 py-3 rounded-xl flex items-center justify-between text-xs font-bold transition-all ${
              activeTab === "settings" 
                ? "bg-slate-950 text-white shadow-md shadow-slate-950/10" 
                : "bg-white text-slate-600 hover:bg-slate-200 border border-slate-200/60"
            }`}
          >
            <span className="flex items-center gap-2">
              <Settings className="w-4.5 h-4.5" />
              إعدادات النظام
            </span>
          </button>

        </aside>

        {/* Primary Workspace View Area */}
        <main className="flex-1 bg-white border border-slate-200/60 shadow-xs rounded-3xl p-5 lg:p-7 min-h-[600px] overflow-hidden">
          {activeTab === "create" && (
            <InvoiceCreator 
              services={services} 
              settings={settings || { officeName: "مكتب مزايا للجوازات", phone: "", deliveryTerms: "" }} 
              activeEmployee={activeEmployee} 
              onInvoiceCreated={handleInvoiceCreated} 
            />
          )}

          {activeTab === "query" && (
            <InvoiceQuery 
              invoices={invoices} 
              services={services}
              settings={settings || { officeName: "مكتب مزايا للجوازات", phone: "", deliveryTerms: "" }} 
              activeEmployee={activeEmployee} 
              onInvoiceUpdated={handleInvoiceUpdated} 
              onInvoiceDeleted={handleInvoiceDeleted} 
            />
          )}

          {activeTab === "aman" && (
            <AmanReport 
              invoices={invoices} 
              services={services} 
              activeEmployee={activeEmployee}
            />
          )}

          {activeTab === "reminders" && (
            <NotificationsPanel 
              invoices={invoices} 
              settings={settings || { officeName: "مكتب مزايا للجوازات", phone: "", deliveryTerms: "" }} 
              onInvoiceUpdated={handleInvoiceUpdated} 
            />
          )}

          {activeTab === "collection" && (
            <CollectionPanel 
              invoices={invoices} 
              closings={closings} 
              activeEmployee={activeEmployee} 
              onClosingCreated={handleClosingCreated} 
              onDBResetAfterClosing={handleDBResetAfterClosing} 
            />
          )}

          {activeTab === "services" && (
            <ServicesConfig 
              services={services} 
              activeEmployee={activeEmployee} 
              onServiceCreated={handleServiceCreated} 
              onServiceUpdated={handleServiceUpdated} 
              onServiceDeleted={handleServiceDeleted} 
              onServicesReordered={handleServicesReordered}
            />
          )}

          {activeTab === "settings" && (
            <SettingsConfig 
              settings={settings || { officeName: "مكتب مزايا للجوازات", phone: "", deliveryTerms: "" }} 
              activeEmployee={activeEmployee} 
              onSettingsUpdated={handleSettingsUpdated} 
              employees={employees}
              onEmployeesUpdated={handleUpdateEmployees}
            />
          )}
        </main>

      </div>

    </div>
  );
}
