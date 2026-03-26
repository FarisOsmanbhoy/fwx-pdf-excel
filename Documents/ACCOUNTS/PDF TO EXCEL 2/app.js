// ─── Constants ───────────────────────────────────────────────
const TEMPLATE_KEY = "csv_template";
const TEMPLATE_TS_KEY = "csv_template_saved_at";
const TTL_DAYS = 7;
const MAX_PDF_MB = 5;

// ─── DOM refs ────────────────────────────────────────────────
const templateZone = document.getElementById("templateZone");
const templateInput = document.getElementById("templateInput");
const templateFileName = document.getElementById("templateFileName");
const templateStatus = document.getElementById("templateStatus");
const templateInfo = document.getElementById("templateInfo");
const forgetBtn = document.getElementById("forgetBtn");

const pdfZone = document.getElementById("pdfZone");
const pdfInput = document.getElementById("pdfInput");
const pdfFileName = document.getElementById("pdfFileName");

const extractBtn = document.getElementById("extractBtn");
const statusEl = document.getElementById("status");
const downloadBtn = document.getElementById("downloadBtn");

// ─── State ───────────────────────────────────────────────────
let templateHeaders = null; // CSV header string
let pdfBase64 = null;
let pdfMediaType = "application/pdf";
let csvResult = null;

// ─── Template persistence ────────────────────────────────────
function saveTemplate(headers) {
  localStorage.setItem(TEMPLATE_KEY, headers);
  localStorage.setItem(TEMPLATE_TS_KEY, Date.now().toString());
}

function loadTemplate() {
  const saved = localStorage.getItem(TEMPLATE_KEY);
  const ts = localStorage.getItem(TEMPLATE_TS_KEY);
  if (!saved || !ts) return null;

  const age = Date.now() - parseInt(ts, 10);
  const maxAge = TTL_DAYS * 24 * 60 * 60 * 1000;
  if (age > maxAge) {
    forgetTemplate();
    return null;
  }
  return { headers: saved, daysLeft: Math.ceil((maxAge - age) / (24 * 60 * 60 * 1000)) };
}

function refreshTemplateTTL() {
  localStorage.setItem(TEMPLATE_TS_KEY, Date.now().toString());
}

function forgetTemplate() {
  localStorage.removeItem(TEMPLATE_KEY);
  localStorage.removeItem(TEMPLATE_TS_KEY);
}

// ─── Parse template file ─────────────────────────────────────
function parseCSVHeaders(text) {
  // Take the first non-empty line as headers
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  return lines.length > 0 ? lines[0] : null;
}

async function parseExcelHeaders(file) {
  // Minimal xlsx parse: read first row using SheetJS loaded from CDN
  if (!window.XLSX) {
    await loadSheetJS();
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(new Uint8Array(e.target.result), { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_csv(ws).split(/\r?\n/).filter((l) => l.trim());
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
  extractBtn.disabled = !(templateHeaders && pdfBase64);
}

function showTemplateLoaded(daysLeft) {
  templateStatus.classList.remove("hidden");
  templateInfo.textContent = "Template loaded from memory (" + daysLeft + " day" + (daysLeft !== 1 ? "s" : "") + " left)";
  templateZone.querySelector("p").textContent = "Drop a new template to replace, or click to browse";
}

function showTemplateSaved() {
  templateStatus.classList.remove("hidden");
  templateInfo.textContent = "Template saved — will be remembered for 7 days";
}

// ─── Drag and drop setup ─────────────────────────────────────
function setupDrop(zone, input) {
  zone.addEventListener("click", () => input.click());

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

setupDrop(templateZone, templateInput);
setupDrop(pdfZone, pdfInput);

// ─── Template input handler ──────────────────────────────────
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
      setStatus("Unsupported template format. Use .csv or .xlsx", "error");
      return;
    }

    if (!headers) {
      setStatus("Could not read headers from template.", "error");
      return;
    }

    templateHeaders = headers;
    templateFileName.textContent = file.name;
    templateFileName.classList.remove("hidden");
    saveTemplate(headers);
    showTemplateSaved();
    setStatus("", "");
    updateExtractButton();
  } catch (err) {
    setStatus("Error reading template: " + err.message, "error");
  }
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
    setStatus("", "");
    updateExtractButton();
  } catch (err) {
    setStatus("Error reading PDF: " + err.message, "error");
  }
});

// ─── Forget template ─────────────────────────────────────────
forgetBtn.addEventListener("click", () => {
  forgetTemplate();
  templateHeaders = null;
  templateFileName.classList.add("hidden");
  templateStatus.classList.add("hidden");
  templateInput.value = "";
  templateZone.querySelector("p").textContent = "Drop your CSV or Excel template here, or click to browse";
  updateExtractButton();
  setStatus("Template forgotten.", "info");
  setTimeout(() => setStatus("", ""), 2000);
});

// ─── Extract action ──────────────────────────────────────────
extractBtn.addEventListener("click", async () => {
  if (!templateHeaders || !pdfBase64) return;

  extractBtn.disabled = true;
  downloadBtn.style.display = "none";
  csvResult = null;
  setStatus("Sending to Claude for extraction...", "info");

  try {
    const res = await fetch("/.netlify/functions/process-pdf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pdfBase64,
        pdfMediaType,
        templateHeaders,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || "Server error");
    }

    csvResult = data.csv;
    refreshTemplateTTL();
    setStatus("Extraction complete!", "success");
    downloadBtn.style.display = "block";
  } catch (err) {
    setStatus("Error: " + err.message, "error");
  } finally {
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

// ─── Init: check for saved template ─────────────────────────
(function init() {
  const saved = loadTemplate();
  if (saved) {
    templateHeaders = saved.headers;
    showTemplateLoaded(saved.daysLeft);
  }
  updateExtractButton();
})();
