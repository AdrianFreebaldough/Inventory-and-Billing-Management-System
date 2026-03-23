const REPORT_PRINT_STYLE_ID = "ibms-standard-report-print-style";
const REPORT_PAGE_STYLE_ID = "ibms-standard-report-page-style";

const REPORT_PRINT_STYLES = `
.ibms-report-print-root {
  display: none;
  visibility: hidden;
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: -1;
  pointer-events: none;
}

.ibms-report-print-root.ibms-report-print-active {
  display: block;
  visibility: visible;
  position: fixed;
  top: 0;
  left: 0;
  z-index: 9999;
  pointer-events: auto;
  width: 100vw;
  height: 100vh;
}

.ibms-report-page {
  background: #ffffff;
  color: #000000;
  font-family: "Segoe UI", Tahoma, Geneva, Verdana, sans-serif;
  font-size: 10.5px;
  line-height: 1.28;
  width: 100%;
  max-width: none;
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

.ibms-report-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  border-bottom: 1px solid #1f2937;
  padding-bottom: 5px;
  margin-bottom: 5px;
  flex-shrink: 0;
}

.ibms-report-brand {
  display: flex;
  align-items: center;
  gap: 8px;
}

.ibms-report-logo {
  width: 34px;
  height: 34px;
  object-fit: contain;
}

.ibms-report-clinic {
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.2px;
}

.ibms-report-system {
  font-size: 10px;
  color: #000000;
}

.ibms-report-title {
  margin-top: 2px;
  margin-bottom: 4px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  flex-shrink: 0;
}

.ibms-report-meta {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 3px 12px;
  border-bottom: 1px solid #d1d5db;
  padding-bottom: 5px;
  margin-bottom: 5px;
  flex-shrink: 0;
}

.ibms-report-meta-item {
  display: flex;
  gap: 4px;
}

.ibms-report-meta-label {
  font-weight: 700;
  color: #000000;
  white-space: nowrap;
}

.ibms-report-filters {
  margin-bottom: 5px;
  border-bottom: 1px solid #e5e7eb;
  padding-bottom: 5px;
  flex-shrink: 0;
}

.ibms-report-filters-label {
  font-weight: 700;
  margin-bottom: 2px;
}

.ibms-report-filters-text {
  color: #000000;
  white-space: normal;
  word-break: break-word;
}

.ibms-report-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
  margin-bottom: 4px;
  flex: 1 1 auto;
  min-height: 0;
}

.ibms-report-table thead {
  display: table-header-group;
}

.ibms-report-table th,
.ibms-report-table td {
  border: 1px solid #9ca3af;
  padding: 2px 4px;
  line-height: 1.3;
  vertical-align: top;
  text-align: left;
  overflow: visible;
  text-overflow: clip;
  word-break: break-word;
}

.ibms-report-table th {
  font-size: 9px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.15px;
  background: #f3f4f6;
  color: #000000;
}

.ibms-report-table td {
  font-size: 9px;
  line-height: 1.2;
  color: #000000;
}

.ibms-report-col-reference {
  width: 9%;
}

.ibms-report-col-date,
.ibms-report-col-expiration {
  width: 8%;
}

.ibms-report-col-item {
  width: 17%;
}

.ibms-report-col-batch {
  width: 12%;
}

.ibms-report-col-quantity {
  width: 6%;
}

.ibms-report-col-reason {
  width: 10%;
}

.ibms-report-col-requested,
.ibms-report-col-approved {
  width: 11%;
}

.ibms-report-col-status {
  width: 8%;
}

.ibms-report-col-reference,
.ibms-report-col-date,
.ibms-report-col-expiration,
.ibms-report-col-quantity,
.ibms-report-col-status {
  white-space: nowrap;
}

.ibms-report-footer {
  margin-top: auto;
  border-top: 1px solid #1f2937;
  padding-top: 3px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  font-size: 9px;
  color: #000000;
  flex-shrink: 0;
}

.ibms-report-page-number .ibms-page-current::after {
  content: "1";
}

.ibms-report-page-number .ibms-page-total::after {
  content: "1";
}

@media print {
  html,
  body {
    margin: 0;
    padding: 0;
    width: 100% !important;
    max-width: none !important;
    min-width: 0 !important;
    overflow: visible !important;
    background: #ffffff !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
    height: 100vh !important;
    zoom: 100% !important;
    -webkit-zoom: 100% !important;
    transform: scale(1) !important;
  }

  body.ibms-report-printing,
  body.ibms-report-printing .ibms-report-print-root,
  body.ibms-report-printing .ibms-report-print-root * {
    color: #000000 !important;
  }

  body.ibms-report-printing {
    background: #ffffff !important;
  }

  body.ibms-report-printing > * {
    display: none !important;
    visibility: hidden !important;
  }

  body.ibms-report-printing > .ibms-report-print-root.ibms-report-print-active {
    display: block !important;
    visibility: visible !important;
    margin: 0 !important;
    padding: 0 !important;
    width: 100% !important;
    height: auto !important;
    max-width: none !important;
    position: static !important;
    background: #ffffff !important;
  }

  body.ibms-report-printing > .ibms-report-print-root.ibms-report-print-active,
  body.ibms-report-printing > .ibms-report-print-root.ibms-report-print-active * {
    visibility: visible !important;
  }

  .ibms-report-page {
    width: 100% !important;
    max-width: 100% !important;
    max-height: none !important;
    height: auto !important;
    min-height: 100vh !important;
    margin: 0 !important;
    padding: 0 !important;
    border: 0 !important;
    border-radius: 0 !important;
    box-shadow: none !important;
    background: #ffffff !important;
    display: flex !important;
    flex-direction: column !important;
    page-break-before: auto !important;
    page-break-after: auto !important;
    page-break-inside: avoid !important;
    overflow: visible !important;
  }

  .ibms-report-header,
  .ibms-report-title,
  .ibms-report-meta,
  .ibms-report-filters,
  .ibms-report-footer {
    page-break-inside: avoid !important;
    break-inside: avoid !important;
  }

  .ibms-report-table {
    flex: 1 1 auto !important;
    min-height: 0;
    max-height: none !important;
    width: 100% !important;
    table-layout: fixed !important;
    page-break-inside: auto !important;
    border-collapse: collapse !important;
  }

  .ibms-report-table thead {
    display: table-header-group !important;
    page-break-inside: avoid !important;
  }

  .ibms-report-table tbody {
    display: table-row-group !important;
  }

  .ibms-report-col-item,
  .ibms-report-col-batch,
  .ibms-report-col-reason,
  .ibms-report-col-requested,
  .ibms-report-col-approved {
    white-space: normal !important;
  }

  .ibms-report-table tr {
    display: table-row !important;
    page-break-inside: avoid !important;
    break-inside: avoid !important;
  }

  .ibms-report-table td,
  .ibms-report-table th {
    display: table-cell !important;
    visibility: visible !important;
  }

  .ibms-report-footer {
    position: static !important;
    padding-bottom: 2px;
    background: #ffffff;
    flex-shrink: 0;
  }

  .ibms-report-page-number .ibms-page-current::after {
    content: counter(page);
  }

  .ibms-report-page-number .ibms-page-total::after {
    content: counter(pages);
  }
}
`;

function ensureReportPrintStyles() {
  if (document.getElementById(REPORT_PRINT_STYLE_ID)) {
    return;
  }

  const style = document.createElement("style");
  style.id = REPORT_PRINT_STYLE_ID;
  style.textContent = REPORT_PRINT_STYLES;
  document.head.appendChild(style);
}

function ensurePageSizeStyle(orientation = "landscape") {
  let style = document.getElementById(REPORT_PAGE_STYLE_ID);
  if (!style) {
    style = document.createElement("style");
    style.id = REPORT_PAGE_STYLE_ID;
    document.head.appendChild(style);
  }

  const pageSize = orientation === "portrait" ? "8.5in 13in" : "13in 8.5in";
  style.textContent = `@page { size: ${pageSize}; margin: 0.2in; }`;
}

function formatDateTime(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "long",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function resolveGeneratedBy(explicitValue) {
  if (explicitValue && String(explicitValue).trim()) {
    return String(explicitValue).trim();
  }

  const storedName = localStorage.getItem("userName");
  if (storedName && storedName.trim()) {
    return storedName.trim();
  }

  const storedEmail = localStorage.getItem("userEmail");
  if (storedEmail && storedEmail.trim()) {
    return storedEmail.trim();
  }

  return "Unknown User";
}

function resolveOrientation({ orientation = "auto", columnCount = 0 } = {}) {
  if (orientation === "landscape" || orientation === "portrait") {
    return orientation;
  }

  // Standard report mode defaults to landscape for audit tables.
  return "landscape";
}

function toFilterSummary(filters = {}) {
  const parts = Object.entries(filters)
    .filter(([, value]) => value !== null && value !== undefined && String(value).trim() !== "")
    .map(([label, value]) => `${label}: ${String(value).trim()}`);

  return parts.length ? parts.join(" | ") : "Filters: None";
}

function setText(root, selector, value) {
  const element = root.querySelector(selector);
  if (element) {
    element.textContent = value;
  }
}

export function printStandardClinicReport(options = {}) {
  const {
    printRootId,
    reportTitle = "Clinic Report",
    moduleName = "Report Module",
    clinicName = "ZCMMF Clinic",
    systemName = "Inventory and Billing Management System",
    logoUrl = "../../assets/zealLogo.png",
    generatedAt = new Date(),
    generatedBy,
    filters = {},
    recordCount = 0,
    columnCount = 0,
    orientation = "auto",
    onBeforePrint,
  } = options;

  const root = document.getElementById(printRootId);
  if (!root) {
    throw new Error(`Print container not found: ${printRootId}`);
  }

  ensureReportPrintStyles();

  if (typeof onBeforePrint === "function") {
    onBeforePrint(root);
  }

  const timestamp = formatDateTime(generatedAt);
  const finalOrientation = resolveOrientation({ orientation, columnCount });
  ensurePageSizeStyle(finalOrientation);

  setText(root, "[data-report-clinic-name]", clinicName);
  setText(root, "[data-report-system-name]", systemName);
  setText(root, "[data-report-module-name]", moduleName);
  setText(root, "[data-report-title]", reportTitle);
  setText(root, "[data-report-generated-at]", timestamp);
  setText(root, "[data-report-generated-by]", resolveGeneratedBy(generatedBy));
  setText(root, "[data-report-filters]", toFilterSummary(filters));
  setText(root, "[data-report-record-count]", String(recordCount));
  setText(root, "[data-report-footer-system]", `Generated by ${systemName}`);
  setText(root, "[data-report-footer-clinic]", clinicName);
  setText(root, "[data-report-footer-timestamp]", timestamp);

  const logo = root.querySelector("[data-report-logo]");
  if (logo) {
    logo.src = logoUrl;
    logo.alt = `${clinicName} logo`;
  }

  const originalParent = root.parentNode;
  const originalNextSibling = root.nextSibling;

  root.classList.remove("hidden");
  root.setAttribute("aria-hidden", "false");
  root.classList.add("ibms-report-print-active");
  document.body.appendChild(root);
  document.body.classList.add("ibms-report-printing");

  const cleanup = () => {
    root.classList.remove("ibms-report-print-active");
    root.classList.add("hidden");
    root.setAttribute("aria-hidden", "true");
    document.body.classList.remove("ibms-report-printing");

    if (originalParent) {
      if (originalNextSibling && originalNextSibling.parentNode === originalParent) {
        originalParent.insertBefore(root, originalNextSibling);
      } else {
        originalParent.appendChild(root);
      }
    }
  };

  const cleanupOnAfterPrint = () => {
    cleanup();
    window.removeEventListener("afterprint", cleanupOnAfterPrint);
  };

  window.addEventListener("afterprint", cleanupOnAfterPrint, { once: true });

  // Allow layout updates before invoking browser print dialog.
  setTimeout(() => {
    window.print();
    setTimeout(cleanup, 1500);
  }, 60);
}
