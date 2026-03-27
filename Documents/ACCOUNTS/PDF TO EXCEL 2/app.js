// ─── Preset Templates ────────────────────────────────────────
const PRESETS = [
  {
    id: "xero-sales-invoice",
    name: "Xero Sales Invoice",
    headers:
      "*ContactName,EmailAddress,POAddressLine1,POAddressLine2,POAddressLine3,POAddressLine4,POCity,PORegion,POPostalCode,POCountry,*InvoiceNumber,Reference,*InvoiceDate,*DueDate,Total,InventoryItemCode,*Description,*Quantity,*UnitAmount,Discount,*AccountCode,*TaxType,TaxAmount,TrackingName1,TrackingOption1,TrackingName2,TrackingOption2,Currency,BrandingTheme",
    promptHints: `Xero Sales Invoice template for Flightworx (FWX) aviation company.

## InventoryItemCode — MANDATORY EXTRACTION
Each line item in the PDF starts with a numeric code prefix (e.g. "01", "03", "05", "09", "10B", "13", "15", "17", "19", "20") followed by a space and the description.

You MUST split this into two columns:
- InventoryItemCode: the numeric prefix ONLY (e.g. "01", "03", "10B")
- Description: the remaining text ONLY, WITHOUT the prefix

Example: "01 CFP (Computer Flight Plan) + File and Co-ord"
→ InventoryItemCode = 01
→ Description = CFP (Computer Flight Plan) + File and Co-ord

Example: "05 Flight Following"
→ InventoryItemCode = 05
→ Description = Flight Following

Example: "Fuel Load from Crew"
→ InventoryItemCode = (empty, no prefix)
→ Description = Fuel Load from Crew

If Description text begins with a number followed by a space, that number IS the InventoryItemCode. Never leave InventoryItemCode empty when a numeric prefix exists.

## Other fields
- ContactName: supplier/client name on the invoice
- InvoiceNumber: the invoice/reference number
- InvoiceDate, DueDate: format as YYYY-MM-DD
- Quantity: default to 1 if not shown
- UnitAmount, Total, TaxAmount: numeric only, no currency symbols
- Currency: 3-letter code (USD, GBP, EUR) if visible
- AccountCode, TaxType: leave empty unless explicitly on the invoice
- Address fields: extract from billing/postal address if present
- Multiple line items = one CSV row per item, repeating header fields on each row`,
  },
];

// ─── Constants ───────────────────────────────────────────────
const CUSTOM_TEMPLATES_KEY = "fwx_custom_templates";
const LAST_TEMPLATE_KEY = "fwx_last_template";
const MAX_PDF_MB = 5;

// ─── DOM refs ────────────────────────────────────────────────
const templateSelect = document.getElementById("templateSelect");
const deleteTemplateBtn = document.getElementById("deleteTemplateBtn");
const templateInfoEl = document.getElementById("templateInfo");
const customUploadZone = document.getElementById("customUploadZone");
const templateInput = document.getElementById("templateInput");
const templateFileName = document.getElementById("templateFileName");

const pdfZone = document.getElementById("pdfZone");
const pdfInput = document.getElementById("pdfInput");
const pdfFileName = document.getElementById("pdfFileName");

const extractBtn = document.getElementById("extractBtn");
const btnText = extractBtn.querySelector(".btn-text");
const btnLoader = extractBtn.querySelector(".btn-loader");
const statusEl = document.getElementById("status");
const downloadBtn = document.getElementById("downloadBtn");
const resetBtn = document.getElementById("resetBtn");

const nameModal = document.getElementById("nameModal");
const templateNameInput = document.getElementById("templateNameInput");
const saveNameBtn = document.getElementById("saveNameBtn");
const cancelNameBtn = document.getElementById("cancelNameBtn");

// ─── State ───────────────────────────────────────────────────
let templateHeaders = null;
let promptHints = null;
let pdfBase64 = null;
let pdfMediaType = "application/pdf";
let csvResult = null;
let pendingHeaders = null; // headers waiting for a name

// ─── Custom template persistence ─────────────────────────────
function getCustomTemplates() {
  try {
    return JSON.parse(localStorage.getItem(CUSTOM_TEMPLATES_KEY)) || [];
  } catch {
    return [];
  }
}

function saveCustomTemplates(templates) {
  localStorage.setItem(CUSTOM_TEMPLATES_KEY, JSON.stringify(templates));
}

function addCustomTemplate(name, headers) {
  const templates = getCustomTemplates();
  const id = "custom-" + Date.now();
  templates.push({ id, name, headers, promptHints: null });
  saveCustomTemplates(templates);
  return id;
}

function deleteCustomTemplate(id) {
  const templates = getCustomTemplates().filter((t) => t.id !== id);
  saveCustomTemplates(templates);
}

function saveLastTemplate(id) {
  localStorage.setItem(LAST_TEMPLATE_KEY, id);
}

function getLastTemplate() {
  return localStorage.getItem(LAST_TEMPLATE_KEY);
}

// ─── Populate dropdown ───────────────────────────────────────
function populateDropdown(selectId) {
  const customs = getCustomTemplates();

  // Clear existing options (keep the disabled placeholder)
  while (templateSelect.options.length > 1) {
    templateSelect.remove(1);
  }

  // Add preset group
  if (PRESETS.length > 0) {
    const presetGroup = document.createElement("optgroup");
    presetGroup.label = "Preset Templates";
    PRESETS.forEach((p) => {
      const opt = document.createElement("option");
      opt.value = p.id;
      opt.textContent = p.name;
      presetGroup.appendChild(opt);
    });
    templateSelect.appendChild(presetGroup);
  }

  // Add custom group
  if (customs.length > 0) {
    const customGroup = document.createElement("optgroup");
    customGroup.label = "Your Templates";
    customs.forEach((c) => {
      const opt = document.createElement("option");
      opt.value = c.id;
      opt.textContent = c.name;
      customGroup.appendChild(opt);
    });
    templateSelect.appendChild(customGroup);
  }

  // Add "Add Custom" option
  const sep = document.createElement("optgroup");
  sep.label = "─────────";
  const addOpt = document.createElement("option");
  addOpt.value = "__add_custom__";
  addOpt.textContent = "+ Add custom template...";
  templateSelect.appendChild(sep);
  templateSelect.appendChild(addOpt);

  // Restore last selection
  if (selectId) {
    templateSelect.value = selectId;
  } else {
    const last = getLastTemplate();
    if (last && findTemplate(last)) {
      templateSelect.value = last;
    }
  }

  // Trigger change to load the template
  if (templateSelect.value && templateSelect.value !== "") {
    handleTemplateChange();
  }
}

// ─── Find template by ID ────────────────────────────────────
function findTemplate(id) {
  const preset = PRESETS.find((p) => p.id === id);
  if (preset) return preset;
  return getCustomTemplates().find((c) => c.id === id) || null;
}

// ─── Parse template file ─────────────────────────────────────
function parseCSVHeaders(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  return lines.length > 0 ? lines[0] : null;
}

async function parseExcelHeaders(file) {
  if (!window.XLSX) {
    await loadSheetJS();
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(new Uint8Array(e.target.result), { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils
          .sheet_to_csv(ws)
          .split(/\r?\n/)
          .filter((l) => l.trim());
        resolve(rows.length > 0 ? rows[0] : null);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

function loadSheetJS() {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js";
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

// ─── File helpers ────────────────────────────────────────────
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ─── UI helpers ──────────────────────────────────────────────
function setStatus(msg, type) {
  statusEl.className = "status " + type;
  if (type === "info" && msg) {
    statusEl.innerHTML = '<span class="spinner"></span> ' + msg;
  } else {
    statusEl.textContent = msg || "";
  }
}

function updateExtractButton() {
  const ready = !!(templateHeaders && pdfBase64);
  extractBtn.disabled = !ready;
  extractBtn.classList.toggle("ready", ready);
}

function showTemplateInfo(msg) {
  templateInfoEl.textContent = msg;
  templateInfoEl.classList.remove("hidden");
}

function hideTemplateInfo() {
  templateInfoEl.classList.add("hidden");
}

// ─── Template dropdown handler ───────────────────────────────
function handleTemplateChange() {
  const val = templateSelect.value;

  // Reset
  hideTemplateInfo();
  customUploadZone.classList.add("hidden");
  deleteTemplateBtn.classList.add("hidden");

  if (val === "__add_custom__") {
    // Show upload zone
    templateHeaders = null;
    promptHints = null;
    customUploadZone.classList.remove("hidden");
    templateFileName.classList.add("hidden");
    templateInput.value = "";
    updateExtractButton();
    return;
  }

  const tmpl = findTemplate(val);
  if (!tmpl) {
    templateHeaders = null;
    promptHints = null;
    updateExtractButton();
    return;
  }

  templateHeaders = tmpl.headers;
  promptHints = tmpl.promptHints || null;
  saveLastTemplate(val);

  // Count columns
  const colCount = tmpl.headers.split(",").length;
  showTemplateInfo(tmpl.name + " — " + colCount + " columns");

  // Show delete button only for custom templates
  if (val.startsWith("custom-")) {
    deleteTemplateBtn.classList.remove("hidden");
  }

  updateExtractButton();
}

templateSelect.addEventListener("change", handleTemplateChange);

// ─── Delete custom template ──────────────────────────────────
deleteTemplateBtn.addEventListener("click", () => {
  const val = templateSelect.value;
  if (!val.startsWith("custom-")) return;

  const tmpl = findTemplate(val);
  if (!tmpl) return;

  if (!confirm('Delete template "' + tmpl.name + '"?')) return;

  deleteCustomTemplate(val);
  templateHeaders = null;
  promptHints = null;
  hideTemplateInfo();
  deleteTemplateBtn.classList.add("hidden");
  localStorage.removeItem(LAST_TEMPLATE_KEY);
  populateDropdown();
  templateSelect.value = "";
  updateExtractButton();
});

// ─── Drag and drop setup ─────────────────────────────────────
function setupDrop(zone, input) {
  zone.addEventListener("click", (e) => {
    if (e.target === input) return;
    input.click();
  });

  zone.addEventListener("dragover", (e) => {
    e.preventDefault();
    zone.classList.add("drag-over");
  });

  zone.addEventListener("dragleave", () => {
    zone.classList.remove("drag-over");
  });

  zone.addEventListener("drop", (e) => {
    e.preventDefault();
    zone.classList.remove("drag-over");
    if (e.dataTransfer.files.length) {
      input.files = e.dataTransfer.files;
      input.dispatchEvent(new Event("change"));
    }
  });
}

setupDrop(customUploadZone, templateInput);
setupDrop(pdfZone, pdfInput);

// ─── Custom template upload handler ──────────────────────────
templateInput.addEventListener("change", async () => {
  const file = templateInput.files[0];
  if (!file) return;

  try {
    let headers = null;
    const ext = file.name.split(".").pop().toLowerCase();

    if (ext === "csv") {
      const text = await file.text();
      headers = parseCSVHeaders(text);
    } else if (ext === "xlsx" || ext === "xls") {
      headers = await parseExcelHeaders(file);
    } else {
      setStatus("Unsupported format. Use .csv or .xlsx", "error");
      return;
    }

    if (!headers) {
      setStatus("Could not read headers from template.", "error");
      return;
    }

    // Show file name
    templateFileName.textContent = file.name;
    templateFileName.classList.remove("hidden");
    customUploadZone.classList.add("has-file");

    // Store headers and open naming modal
    pendingHeaders = headers;
    templateNameInput.value = file.name.replace(/\.[^.]+$/, "");
    nameModal.classList.remove("hidden");
    templateNameInput.focus();
    setStatus("", "");
  } catch (err) {
    setStatus("Error reading template: " + err.message, "error");
  }
});

// ─── Name modal handlers ─────────────────────────────────────
saveNameBtn.addEventListener("click", () => {
  const name = templateNameInput.value.trim();
  if (!name || !pendingHeaders) return;

  const id = addCustomTemplate(name, pendingHeaders);
  pendingHeaders = null;
  nameModal.classList.add("hidden");
  customUploadZone.classList.add("hidden");
  customUploadZone.classList.remove("has-file");

  populateDropdown(id);
  setStatus("Template saved!", "success");
  setTimeout(() => setStatus("", ""), 2000);
});

cancelNameBtn.addEventListener("click", () => {
  pendingHeaders = null;
  nameModal.classList.add("hidden");
  templateInput.value = "";
  templateFileName.classList.add("hidden");
  customUploadZone.classList.remove("has-file");
});

// Close modal on overlay click
nameModal.addEventListener("click", (e) => {
  if (e.target === nameModal) cancelNameBtn.click();
});

// Enter key in modal saves
templateNameInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") saveNameBtn.click();
});

// ─── PDF input handler ──────────────────────────────────────
pdfInput.addEventListener("change", async () => {
  const file = pdfInput.files[0];
  if (!file) return;

  if (file.size > MAX_PDF_MB * 1024 * 1024) {
    setStatus("PDF exceeds 5 MB limit. Please use a smaller file.", "error");
    pdfInput.value = "";
    return;
  }

  try {
    pdfBase64 = await fileToBase64(file);
    pdfMediaType = file.type || "application/pdf";
    pdfFileName.textContent = file.name;
    pdfFileName.classList.remove("hidden");
    pdfZone.classList.add("has-file");
    setStatus("", "");
    updateExtractButton();
  } catch (err) {
    setStatus("Error reading PDF: " + err.message, "error");
  }
});

// ─── Extract action ──────────────────────────────────────────
extractBtn.addEventListener("click", async () => {
  if (!templateHeaders || !pdfBase64) return;

  extractBtn.disabled = true;
  extractBtn.classList.remove("ready");
  btnText.classList.add("hidden");
  btnLoader.classList.remove("hidden");
  downloadBtn.style.display = "none";
  csvResult = null;
  setStatus("Sending to Claude for extraction...", "info");

  try {
    const payload = {
      pdfBase64,
      pdfMediaType,
      templateHeaders,
    };
    if (promptHints) {
      payload.promptHints = promptHints;
    }

    const res = await fetch("/.netlify/functions/process-pdf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || "Server error");
    }

    csvResult = data.csv;
    setStatus("Extraction complete!", "success");
    downloadBtn.style.display = "block";
    resetBtn.classList.remove("hidden");
  } catch (err) {
    setStatus("Error: " + err.message, "error");
  } finally {
    btnText.classList.remove("hidden");
    btnLoader.classList.add("hidden");
    updateExtractButton();
  }
});

// ─── Download CSV ────────────────────────────────────────────
downloadBtn.addEventListener("click", () => {
  if (!csvResult) return;

  const blob = new Blob([csvResult], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "extracted_data.csv";
  a.click();
  URL.revokeObjectURL(url);
});

// ─── Reset / Extract Another ─────────────────────────────────
resetBtn.addEventListener("click", () => {
  // Clear PDF state
  pdfBase64 = null;
  pdfMediaType = "application/pdf";
  csvResult = null;
  pdfInput.value = "";
  pdfFileName.classList.add("hidden");
  pdfZone.classList.remove("has-file");

  // Hide result buttons
  downloadBtn.style.display = "none";
  resetBtn.classList.add("hidden");

  // Clear status
  setStatus("", "");

  // Re-enable extract button state
  updateExtractButton();

  // Scroll to top
  window.scrollTo({ top: 0, behavior: "smooth" });
});

// ─── Init ────────────────────────────────────────────────────
populateDropdown();
updateExtractButton();
