// Matjari متجري - Shared Utilities and Constants
import { CategoryType, Category } from "./types";

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export function formatDZD(amount: number): string {
  return new Intl.NumberFormat("fr-DZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount) + " DZD";
}

export const DEFAULT_CATEGORIES: Category[] = [
  { id: "cat-salon", key: "salon", label: "Salon", labelAr: "الصالون", color: "#9DC6D8", hoverColor: "#8AB6C8", icon: "Sofa", hasVentePersonnalisee: false, hasTailles: false, hasPointure: false, sortOrder: 0 },
  { id: "cat-les-tables", key: "les_tables", label: "Les Tables", labelAr: "طاولات", color: "#6B909B", hoverColor: "#5A7F8A", icon: "Table", hasVentePersonnalisee: false, hasTailles: false, hasPointure: false, sortOrder: 1 },
  { id: "cat-decoration", key: "decoration", label: "Décoration", labelAr: "الديكور", color: "#A58AB7", hoverColor: "#9479A6", icon: "Sparkles", hasVentePersonnalisee: false, hasTailles: false, hasPointure: false, sortOrder: 2 },
];

// Backward-compatible simple list for components that just need key/label/labelAr
export const CATEGORIES: { key: CategoryType; label: string; labelAr: string }[] = DEFAULT_CATEGORIES.map(c => ({
  key: c.key,
  label: c.label,
  labelAr: c.labelAr,
}));

