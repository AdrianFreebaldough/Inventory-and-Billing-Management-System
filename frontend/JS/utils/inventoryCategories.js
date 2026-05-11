export let INVENTORY_CATEGORY_LIST = [
  "Antibiotic",
  "Medicine",
  "Analgesic",
  "Antipyretic",
  "Antihistamine",
  "Antacid",
  "Vitamin",
  "Vaccine",
  "First Aid",
  "Personal Care",
];

/**
 * Updates the global category list from backend settings.
 * Called during app initialization.
 */
export function setInventoryCategories(newCategories) {
  if (Array.isArray(newCategories) && newCategories.length > 0) {
    INVENTORY_CATEGORY_LIST = [...newCategories];
  }
}

export const ALL_CATEGORIES_LABEL = "All Categories";
export const FILTER_PLACEHOLDER_LABEL = "Filter by category";

const CATEGORY_ALIAS_MAP = {
  service: "Services",
  services: "Services",
  consultation: "Services",
  consultations: "Services",
  laboratory: "Services",
  "lab test": "Services",
  antibiotic: "Antibiotic",
  antibiotics: "Antibiotic",
  medicine: "Medicine",
  medicines: "Medicine",
  analgesic: "Analgesic",
  analgesics: "Analgesic",
  antipyretic: "Antipyretic",
  antipyretics: "Antipyretic",
  antihistamine: "Antihistamine",
  antihistamines: "Antihistamine",
  antacid: "Antacid",
  antacids: "Antacid",
  vitamin: "Vitamin",
  vitamins: "Vitamin",
  vaccine: "Vaccine",
  vaccines: "Vaccine",
  "first aid": "First Aid",
  "first aid medical supplies": "First Aid",
  "first aid and medical supplies": "First Aid",
  "personal care": "Personal Care",
};

export function normalizeInventoryCategoryKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function toCanonicalInventoryCategory(value) {
  const key = normalizeInventoryCategoryKey(value);
  if (!key) return "";
  return CATEGORY_ALIAS_MAP[key] || key
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function isAllCategories(value) {
  return String(value || "").trim() === ALL_CATEGORIES_LABEL;
}

export function buildFilterCategoryOptionsMarkup(selectedValue = ALL_CATEGORIES_LABEL) {
  const selected = String(selectedValue || ALL_CATEGORIES_LABEL).trim();
  const allSelected = isAllCategories(selected);

  const categoryOptions = INVENTORY_CATEGORY_LIST
    .map((category) => `<option value="${category}"${selected === category ? " selected" : ""}>${category}</option>`)
    .join("\n");

  return `
    <option value="" disabled>${FILTER_PLACEHOLDER_LABEL}</option>
    <option value="${ALL_CATEGORIES_LABEL}"${allSelected ? " selected" : ""}>${ALL_CATEGORIES_LABEL}</option>
    ${categoryOptions}
  `;
}

export function buildAddItemCategoryOptionsMarkup(selectedValue = "") {
  const selected = String(selectedValue || "").trim();
  const categoryOptions = INVENTORY_CATEGORY_LIST
    .map((category) => `<option value="${category}"${selected === category ? " selected" : ""}>${category}</option>`)
    .join("\n");

  return `
    <option value="">Select category</option>
    ${categoryOptions}
  `;
}
