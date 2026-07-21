import { Invoice, Service, DictionaryItem, CollectionClosing, Employee, AppSettings } from "../types";

export interface DBPayload {
  services: Service[];
  dictionary: DictionaryItem[];
  invoices: Invoice[];
  collectionClosings: CollectionClosing[];
  employees: Employee[];
  settings: AppSettings;
}

export async function fetchDB(): Promise<DBPayload> {
  const response = await fetch("/api/db");
  if (!response.ok) {
    throw new Error("Failed to fetch database from server");
  }
  return response.json();
}

export async function saveDB(data: DBPayload): Promise<void> {
  const response = await fetch("/api/db/save", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    throw new Error("Failed to save database to server");
  }
}

export async function translateWithGemini(text: string): Promise<{ arabic: string; english: string }> {
  const response = await fetch("/api/gemini/translate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!response.ok) {
    throw new Error("Failed to translate using Gemini");
  }
  return response.json();
}

export async function createInvoiceOnServer(invoiceData: Partial<Invoice>): Promise<Invoice> {
  const response = await fetch("/api/db/invoices", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(invoiceData),
  });
  if (!response.ok) {
    throw new Error("Failed to create invoice on server");
  }
  const result = await response.json();
  return result.invoice;
}

export async function updateInvoiceOnServer(id: number, invoiceData: Partial<Invoice>): Promise<Invoice> {
  const response = await fetch(`/api/db/invoices/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(invoiceData),
  });
  if (!response.ok) {
    throw new Error("Failed to update invoice on server");
  }
  const result = await response.json();
  return result.invoice;
}

export async function deleteInvoiceOnServer(id: number): Promise<void> {
  const response = await fetch(`/api/db/invoices/${id}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    throw new Error("Failed to delete invoice");
  }
}

export async function createServiceOnServer(service: Partial<Service>): Promise<Service> {
  const response = await fetch("/api/db/services", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(service),
  });
  if (!response.ok) {
    throw new Error("Failed to create service");
  }
  const result = await response.json();
  return result.service;
}

export async function updateServiceOnServer(id: string, service: Partial<Service>): Promise<Service> {
  const response = await fetch(`/api/db/services/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(service),
  });
  if (!response.ok) {
    throw new Error("Failed to update service");
  }
  const result = await response.json();
  return result.service;
}

export async function deleteServiceOnServer(id: string): Promise<void> {
  const response = await fetch(`/api/db/services/${id}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    throw new Error("Failed to delete service");
  }
}

export async function createClosingOnServer(closing: Partial<CollectionClosing>): Promise<CollectionClosing> {
  const response = await fetch("/api/db/closings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(closing),
  });
  if (!response.ok) {
    throw new Error("Failed to create closing record");
  }
  const result = await response.json();
  return result.closing;
}

export async function saveDictionaryWord(arabic: string, english: string): Promise<void> {
  const response = await fetch("/api/db/dictionary", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ arabic, english: english.toUpperCase() }),
  });
  if (!response.ok) {
    throw new Error("Failed to save dictionary word");
  }
}

export async function updateSettingsOnServer(settings: AppSettings): Promise<AppSettings> {
  const response = await fetch("/api/db/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(settings),
  });
  if (!response.ok) {
    throw new Error("Failed to update settings");
  }
  const result = await response.json();
  return result.settings;
}

export async function updateGoogleSheetsConfig(sheetUrl: string, sheetId: string): Promise<any> {
  const response = await fetch("/api/sheets/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sheetUrl, sheetId }),
  });
  if (!response.ok) {
    throw new Error("Failed to sync Google Sheets");
  }
  return response.json();
}

export async function connectGoogleSheetsOnServer(accessToken: string): Promise<any> {
  const response = await fetch("/api/sheets/connect", {
    method: "POST",
    headers: { 
      "Content-Type": "application/json",
      "Authorization": `Bearer ${accessToken}`
    }
  });
  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error || "Failed to connect Google Sheets");
  }
  return response.json();
}

export async function pushDataToGoogleSheets(accessToken: string): Promise<any> {
  const response = await fetch("/api/sheets/push", {
    method: "POST",
    headers: { 
      "Content-Type": "application/json",
      "Authorization": `Bearer ${accessToken}`
    }
  });
  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error || "Failed to push to Google Sheets");
  }
  return response.json();
}

export async function pullDataFromGoogleSheets(accessToken: string): Promise<any> {
  const response = await fetch("/api/sheets/pull", {
    method: "POST",
    headers: { 
      "Content-Type": "application/json",
      "Authorization": `Bearer ${accessToken}`
    }
  });
  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error || "Failed to pull from Google Sheets");
  }
  return response.json();
}
