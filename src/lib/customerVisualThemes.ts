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
    colorName: "أحمر",
    cardBorder: "border-2 border-red-400 border-r-8 border-r-red-600 ring-4 ring-red-100/70",
    headerBg: "bg-linear-to-l from-red-50 via-red-100/70 to-white border-b-2 border-red-200",
    badgeBg: "bg-red-600 text-white",
    titleText: "text-red-950",
    pillBg: "bg-red-100 text-red-900 border border-red-300",
    servicesBoxBg: "bg-red-50/35 border-red-200",
    addServiceBtn: "bg-red-600 hover:bg-red-700 text-white shadow-xs",
    dividerLine: "border-red-300",
    dividerBadge: "bg-red-600 text-white",
    navChipActive: "bg-red-50 border-red-400 text-red-900 hover:bg-red-100",
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
    colorName: "أزرق سماوي",
    cardBorder: "border-2 border-sky-400 border-r-8 border-r-sky-600 ring-4 ring-sky-100/70",
    headerBg: "bg-linear-to-l from-sky-50 via-sky-100/70 to-white border-b-2 border-sky-200",
    badgeBg: "bg-sky-600 text-white",
    titleText: "text-sky-950",
    pillBg: "bg-sky-100 text-sky-900 border border-sky-300",
    servicesBoxBg: "bg-sky-50/35 border-sky-200",
    addServiceBtn: "bg-sky-600 hover:bg-sky-700 text-white shadow-xs",
    dividerLine: "border-sky-300",
    dividerBadge: "bg-sky-600 text-white",
    navChipActive: "bg-sky-50 border-sky-400 text-sky-900 hover:bg-sky-100",
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
    wrapper: "bg-white border-2 border-red-300 border-r-4 border-r-red-600 shadow-xs",
    headerBg: "bg-red-50/80 border-b border-red-200",
    badge: "bg-red-600 text-white",
    title: "text-red-950",
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
