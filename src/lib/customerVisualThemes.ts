export interface CustomerCardTheme {
  label: string;
  colorName: string;
  cardBorder: string;
  headerBg: string;
  badgeBg: string;
  titleText: string;
  pillBg: string;
  servicesBoxBg: string;
  addServiceBtn: string;
  dividerLine: string;
  dividerBadge: string;
  navChipActive: string;
}

export const CUSTOMER_CARD_THEMES: CustomerCardTheme[] = [
  {
    label: "العميل الأول",
    colorName: "أزرق",
    cardBorder: "border-2 border-blue-400 border-r-8 border-r-blue-600 ring-4 ring-blue-100/70",
    headerBg: "bg-linear-to-l from-blue-50 via-blue-100/70 to-white border-b-2 border-blue-200",
    badgeBg: "bg-blue-600 text-white",
    titleText: "text-blue-950",
    pillBg: "bg-blue-100 text-blue-900 border border-blue-300",
    servicesBoxBg: "bg-blue-50/35 border-blue-200",
    addServiceBtn: "bg-blue-600 hover:bg-blue-700 text-white shadow-xs",
    dividerLine: "border-blue-300",
    dividerBadge: "bg-blue-600 text-white",
    navChipActive: "bg-blue-50 border-blue-400 text-blue-900 hover:bg-blue-100",
  },
  {
    label: "العميل الثاني",
    colorName: "أخضر زمردي",
    cardBorder: "border-2 border-emerald-400 border-r-8 border-r-emerald-600 ring-4 ring-emerald-100/70",
    headerBg: "bg-linear-to-l from-emerald-50 via-emerald-100/70 to-white border-b-2 border-emerald-200",
    badgeBg: "bg-emerald-600 text-white",
    titleText: "text-emerald-950",
    pillBg: "bg-emerald-100 text-emerald-900 border border-emerald-300",
    servicesBoxBg: "bg-emerald-50/35 border-emerald-200",
    addServiceBtn: "bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs",
    dividerLine: "border-emerald-300",
    dividerBadge: "bg-emerald-600 text-white",
    navChipActive: "bg-emerald-50 border-emerald-400 text-emerald-900 hover:bg-emerald-100",
  },
  {
    label: "العميل الثالث",
    colorName: "بنفسجي",
    cardBorder: "border-2 border-purple-400 border-r-8 border-r-purple-600 ring-4 ring-purple-100/70",
    headerBg: "bg-linear-to-l from-purple-50 via-purple-100/70 to-white border-b-2 border-purple-200",
    badgeBg: "bg-purple-600 text-white",
    titleText: "text-purple-950",
    pillBg: "bg-purple-100 text-purple-900 border border-purple-300",
    servicesBoxBg: "bg-purple-50/35 border-purple-200",
    addServiceBtn: "bg-purple-600 hover:bg-purple-700 text-white shadow-xs",
    dividerLine: "border-purple-300",
    dividerBadge: "bg-purple-600 text-white",
    navChipActive: "bg-purple-50 border-purple-400 text-purple-900 hover:bg-purple-100",
  },
  {
    label: "العميل الرابع",
    colorName: "برتقالي كهرماني",
    cardBorder: "border-2 border-amber-400 border-r-8 border-r-amber-600 ring-4 ring-amber-100/70",
    headerBg: "bg-linear-to-l from-amber-50 via-amber-100/70 to-white border-b-2 border-amber-200",
    badgeBg: "bg-amber-600 text-white",
    titleText: "text-amber-950",
    pillBg: "bg-amber-100 text-amber-950 border border-amber-300",
    servicesBoxBg: "bg-amber-50/35 border-amber-200",
    addServiceBtn: "bg-amber-600 hover:bg-amber-700 text-white shadow-xs",
    dividerLine: "border-amber-300",
    dividerBadge: "bg-amber-600 text-white",
    navChipActive: "bg-amber-50 border-amber-400 text-amber-950 hover:bg-amber-100",
  },
  {
    label: "العميل الخامس",
    colorName: "وردي",
    cardBorder: "border-2 border-rose-400 border-r-8 border-r-rose-600 ring-4 ring-rose-100/70",
    headerBg: "bg-linear-to-l from-rose-50 via-rose-100/70 to-white border-b-2 border-rose-200",
    badgeBg: "bg-rose-600 text-white",
    titleText: "text-rose-950",
    pillBg: "bg-rose-100 text-rose-900 border border-rose-300",
    servicesBoxBg: "bg-rose-50/35 border-rose-200",
    addServiceBtn: "bg-rose-600 hover:bg-rose-700 text-white shadow-xs",
    dividerLine: "border-rose-300",
    dividerBadge: "bg-rose-600 text-white",
    navChipActive: "bg-rose-50 border-rose-400 text-rose-900 hover:bg-rose-100",
  },
  {
    label: "العميل السادس",
    colorName: "تركوازي",
    cardBorder: "border-2 border-teal-400 border-r-8 border-r-teal-600 ring-4 ring-teal-100/70",
    headerBg: "bg-linear-to-l from-teal-50 via-teal-100/70 to-white border-b-2 border-teal-200",
    badgeBg: "bg-teal-600 text-white",
    titleText: "text-teal-950",
    pillBg: "bg-teal-100 text-teal-900 border border-teal-300",
    servicesBoxBg: "bg-teal-50/35 border-teal-200",
    addServiceBtn: "bg-teal-600 hover:bg-teal-700 text-white shadow-xs",
    dividerLine: "border-teal-300",
    dividerBadge: "bg-teal-600 text-white",
    navChipActive: "bg-teal-50 border-teal-400 text-teal-900 hover:bg-teal-100",
  },
];

export function getCustomerTheme(index: number): CustomerCardTheme {
  return CUSTOMER_CARD_THEMES[index % CUSTOMER_CARD_THEMES.length];
}

export function getArabicOrdinalLabel(index: number): string {
  const labels = [
    "الأول",
    "الثاني",
    "الثالث",
    "الرابع",
    "الخامس",
    "السادس",
    "السابع",
    "الثامن",
    "التاسع",
    "العاشر",
  ];
  return labels[index] || `رقم ${index + 1}`;
}

export interface ServiceItemTheme {
  wrapper: string;
  headerBg: string;
  badge: string;
  title: string;
}

export const SERVICE_ITEM_THEMES: ServiceItemTheme[] = [
  {
    wrapper: "bg-white border-2 border-slate-300 border-r-4 border-r-indigo-500 shadow-xs",
    headerBg: "bg-slate-100/90 border-b border-slate-200",
    badge: "bg-indigo-600 text-white",
    title: "text-slate-900",
  },
  {
    wrapper: "bg-sky-50/40 border-2 border-sky-300 border-r-4 border-r-sky-600 shadow-xs",
    headerBg: "bg-sky-100/80 border-b border-sky-200",
    badge: "bg-sky-600 text-white",
    title: "text-sky-950",
  },
  {
    wrapper: "bg-amber-50/40 border-2 border-amber-300 border-r-4 border-r-amber-600 shadow-xs",
    headerBg: "bg-amber-100/80 border-b border-amber-200",
    badge: "bg-amber-600 text-white",
    title: "text-amber-950",
  },
  {
    wrapper: "bg-violet-50/40 border-2 border-violet-300 border-r-4 border-r-violet-600 shadow-xs",
    headerBg: "bg-violet-100/80 border-b border-violet-200",
    badge: "bg-violet-600 text-white",
    title: "text-violet-950",
  },
];

export function getServiceItemTheme(index: number): ServiceItemTheme {
  return SERVICE_ITEM_THEMES[index % SERVICE_ITEM_THEMES.length];
}
