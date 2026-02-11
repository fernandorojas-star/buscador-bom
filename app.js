// Buscador BOM (GitHub Pages: carga data/bom.json automáticamente)
const els = {
  status: document.getElementById("status"),
  themeBtn: document.getElementById("themeBtn"),

  // carga BOM (manual opcional)
  fileBOM: document.getElementById("fileBOM"),
  dataHint: document.getElementById("dataHint"),

  // buscador modelos
  qModel: document.getElementById("qModel"),
  models: document.getElementById("models"),
  selected: document.getElementById("selected"),

  // filtros repuestos
  qPart: document.getElementById("qPart"),
  count: document.getElementById("count"),
  brand: document.getElementById("brand"),
  qSAP: document.getElementById("qSAP"),
  qNP: document.getElementById("qNP"),

  // tabla
  tbody: document.getElementById("tbody"),

  // edición
  editMode: document.getElementById("editMode"),
  btnUndo: document.getElementById("btnUndo"),
  btnReset: document.getElementById("btnReset"),
  btnExport: document.getElementById("btnExport"),
  fileImport: document.getElementById("fileImport"),

  // modal
  editDlg: document.getElementById("editDlg"),
  eDesc: document.getElementById("eDesc"),
  eQty: document.getElementById("eQty"),
  eSap: document.getElementById("eSap"),
  eNp: document.getElementById("eNp"),
  eBrand: document.getElementById("eBrand"),
  eNote: document.getElementById("eNote"),
  btnSaveEdit: document.getElementById("btnSaveEdit"),
  btnCancelEdit: document.getElementById("btnCancelEdit"),
};

// ===== Helpers =====
function norm(s) { return String(s ?? "").trim(); }
function toLower(s) { return norm(s).toLowerCase(); }
function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}
function getSap(r) {
  // soporta "Codigo SAP" y "Código SAP"
  return norm(r["Codigo SAP"] ?? r["Código SAP"]);
}
function getSap(r) {
  return norm(r["Codigo SAP"] ?? r["Código SAP"]);
}

/* ===== PEGAR AQUÍ ===== */

function parseCSV(text) {
  const clean = text.replace(/\r/g, "").trim();
  if (!clean) return [];

  const firstLine = clean.split("\n")[0];
  const sep = firstLine.includes(";") ? ";" : ",";

  const lines = clean.split("\n").filter(l => l.trim().length);
  const headers = lines[0].split(sep).map(h => h.trim());

  const out = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(sep);
    const obj = {};
    headers.forEach((h, idx) => obj[h] = (cols[idx] ?? "").trim());
    out.push(obj);
  }
  return out;
}

async function loadBOMFromRepoCSV() {
  els.status.textContent = "Cargando BOM…";
  if (els.dataHint) els.dataHint.textContent = "Cargando CSV…";

  try {
    const res = await fetch("data/bom.csv", { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();

    const parsed = parseCSV(text);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      throw new Error("CSV vacío o inválido.");
    }

    rows = parsed;
    buildModelList();
    renderModelList(modelList);

    selectedModel = null;
    setDataLoadedUI(true);

    els.status.textContent = `Listo (${modelList.length} modelos)`;
    if (els.dataHint) els.dataHint.textContent = "BOM cargado (CSV)";

    renderBOM();
    updateEditUI();

  } catch (e) {
    console.error(e);
    els.status.textContent = "Error cargando BOM (CSV)";
    setDataLoadedUI(false);
  }
}

// ===== Tema claro/oscuro (persistente) =====
const THEME_KEY = "bom_theme";
function setTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  const isLight = theme === "light";
  if (els.themeBtn) els.themeBtn.textContent = isLight ? "🌞 Claro" : "🌙 Oscuro";
  localStorage.setItem(THEME_KEY, theme);
}
function initTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  setTheme(saved || "dark");
  if (els.themeBtn) {
    els.themeBtn.addEventListener("click", () => {
      const current = document.documentElement.getAttribute("data-theme") || "dark";
      setTheme(current === "dark" ? "light" : "dark");
    });
  }
}

// ===== Estado =====
let rows = [];
let modelList = [];
let selectedModel = null;
let dataLoaded = false;

// ===== Habilitar/Deshabilitar UI hasta cargar BOM =====
function setDataLoadedUI(ok) {
  dataLoaded = ok;

  // habilita buscador modelos
  if (els.models) els.models.disabled = !ok;

  // habilita filtros
  if (els.qModel) els.qModel.disabled = !ok;
  if (els.brand) els.brand.disabled = !ok;
  if (els.qSAP) els.qSAP.disabled = !ok;
  if (els.qNP) els.qNP.disabled = !ok;
  if (els.qPart) els.qPart.disabled = !ok;

  // habilita edición (checkbox) e import
  if (els.editMode) els.editMode.disabled = !ok;
  if (els.fileImport) els.fileImport.disabled = !ok;

  // si no hay datos, limpiar UI
  if (!ok) {
    selectedModel = null;
    if (els.selected) els.selected.textContent = "Ninguna bomba seleccionada";
    if (els.count) els.count.textContent = "0 ítems";
    if (els.models) els.models.innerHTML = "";
    if (els.tbody) els.tbody.innerHTML = "";
    if (els.brand) els.brand.innerHTML = `<option value="">Marca: Todas</option>`;
  }
}

// ===== Edición local (solo este dispositivo) =====
const PATCH_KEY = "bom_patches_v1";
const UNDO_KEY  = "bom_undo_v1";

let editEnabled = false;
let patches = loadPatches();     // { id: {field:value,...}, ... }
let undoStack = loadUndoStack(); // [{id, prev, next, at}, ...]

function loadPatches(){
  try { return JSON.parse(localStorage.getItem(PATCH_KEY) || "{}"); }
  catch { return {}; }
}
function savePatches(){
  localStorage.setItem(PATCH_KEY, JSON.stringify(patches));
}
function loadUndoStack(){
  try { return JSON.parse(localStorage.getItem(UNDO_KEY) || "[]"); }
  catch { return []; }
}
function saveUndoStack(){
  localStorage.setItem(UNDO_KEY, JSON.stringify(undoStack));
}

function rowId(r){
  return [
    norm(r["Nombre_modelo"]),
    norm(r["Tipo"]),
    norm(getSap(r)),
    norm(r["N/P"]),
    norm(r["Descripción"]),
  ].join("|");
}
function applyPatch(raw){
  const id = rowId(raw);
  const p = patches[id];
  return p ? { ...raw, ...p } : raw;
}

function updateEditUI(){
  const hasPatches = Object.keys(patches).length > 0;
  const canUndo = undoStack.length > 0;

  if (els.btnUndo)   els.btnUndo.disabled   = !(dataLoaded && editEnabled && canUndo);
  if (els.btnReset)  els.btnReset.disabled  = !(dataLoaded && editEnabled && hasPatches);
  if (els.btnExport) els.btnExport.disabled = !(dataLoaded && hasPatches);
}

function setPatch(rawRow, nextFields){
  const id = rowId(rawRow);
  const prev = patches[id] ? { ...patches[id] } : null;

  patches[id] = { ...(patches[id] || {}), ...nextFields };

  if (Object.keys(patches[id]).length === 0) delete patches[id];

  undoStack.push({ id, prev, next: patches[id] ? { ...patches[id] } : null, at: new Date().toISOString() });
  if (undoStack.length > 200) undoStack.shift();

  savePatches();
  saveUndoStack();
  updateEditUI();
}

function undoLast(){
  const last = undoStack.pop();
  if (!last) return;

  if (last.prev == null) delete patches[last.id];
  else patches[last.id] = last.prev;

  savePatches();
  saveUndoStack();
  updateEditUI();
  renderBOM();
}

function resetAll(){
  if (!confirm("¿Restaurar BOM base? Se borrarán todos los cambios locales de este dispositivo.")) return;
  patches = {};
  undoStack = [];
  localStorage.removeItem(PATCH_KEY);
  localStorage.removeItem(UNDO_KEY);
  updateEditUI();
  renderBOM();
}

function exportPatches(){
  const blob = new Blob([JSON.stringify(patches, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "bom_patches.json";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function importPatches(file){
  const text = await file.text();
  let obj;
  try { obj = JSON.parse(text); }
  catch { alert("Archivo JSON inválido."); return; }

  if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
    alert("Formato inválido: se espera un objeto de patches.");
    return;
  }

  patches = { ...patches, ...obj };
  savePatches();
  updateEditUI();
  renderBOM();
}

// ===== Modal edición =====
let editingRaw = null;

function openEditModal(raw){
  editingRaw = raw;
  const r = applyPatch(raw);

  els.eDesc.value  = norm(r["Descripción"]);
  els.eQty.value   = norm(r["Cantidad"]);
  els.eSap.value   = norm(getSap(r));
  els.eNp.value    = norm(r["N/P"]);
  els.eBrand.value = norm(r["Marca"]);
  els.eNote.value  = norm(r["Nota"]);

  els.editDlg.showModal();
}

if (els.btnCancelEdit && els.editDlg) {
  els.btnCancelEdit.addEventListener("click", () => {
    editingRaw = null;
    els.editDlg.close();
  });
}

if (els.editDlg) {
  const form = els.editDlg.querySelector("form");
  if (form) {
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      if (!editingRaw) return;

      setPatch(editingRaw, {
        "Descripción": els.eDesc.value,
        "Cantidad": els.eQty.value,
        "Codigo SAP": els.eSap.value, // sin tilde para consistencia
        "N/P": els.eNp.value,
        "Marca": els.eBrand.value,
        "Nota": els.eNote.value,
      });

      els.editDlg.close();
      renderBOM();
    });
  }
}

// ===== Render lista modelos =====
function renderModelList(list) {
  els.models.innerHTML = "";
  for (const m of list) {
    const opt = document.createElement("option");
    opt.value = m;
    opt.textContent = m;
    els.models.appendChild(opt);
  }
}

// ===== Render marcas =====
function renderBrandOptions(repuestos) {
  const set = new Set();
  for (const r of repuestos) {
    const m = norm(r["Marca"]);
    if (m) set.add(m);
  }
  const brands = Array.from(set).sort((a, b) => a.localeCompare(b, "es"));

  els.brand.innerHTML =
    `<option value="">Marca: Todas</option>` +
    brands.map((b) => `<option value="${escapeHtml(b)}">${escapeHtml(b)}</option>`).join("");
}

// ===== Construir modelos desde rows =====
function buildModelList() {
  const set = new Set();
  for (const r of rows) {
    const tipo = toLower(r["Tipo"]);
    const model = norm(r["Nombre_modelo"]);
    if (!model) continue;
    if (tipo === "bomba") set.add(model);
  }
  modelList = Array.from(set).sort((a, b) => a.localeCompare(b, "es"));
}

// ===== Render BOM =====
function renderBOM() {
  els.tbody.innerHTML = "";

  if (!dataLoaded) {
    if (els.selected) els.selected.textContent = "Ninguna bomba seleccionada";
    if (els.count) els.count.textContent = "0 ítems";
    if (els.brand) els.brand.innerHTML = `<option value="">Marca: Todas</option>`;
    updateEditUI();
    return;
  }

  if (!selectedModel) {
    if (els.selected) els.selected.textContent = "Ninguna bomba seleccionada";
    if (els.count) els.count.textContent = "0 ítems";
    if (els.brand) els.brand.innerHTML = `<option value="">Marca: Todas</option>`;
    updateEditUI();
    return;
  }

  els.selected.textContent = selectedModel;

  const repuestos = rows.filter((r) =>
    norm(r["Nombre_modelo"]) === selectedModel &&
    toLower(r["Tipo"]).includes("repuesto")
  );

  renderBrandOptions(repuestos);

  const qText = toLower(els.qPart.value);
  const qSap = toLower(els.qSAP.value);
  const qNp = toLower(els.qNP.value);
  const brandSelected = norm(els.brand.value);

  const filtered = repuestos.filter((r) => {
    const rr = applyPatch(r);

    if (brandSelected && norm(rr["Marca"]) !== brandSelected) return false;
    if (qSap && !toLower(getSap(rr)).includes(qSap)) return false;
    if (qNp && !toLower(rr["N/P"]).includes(qNp)) return false;

    if (qText) {
      const hay = [
        rr["Descripción"],
        getSap(rr),
        rr["N/P"],
        rr["Marca"],
        rr["Nota"],
      ].map(toLower).join(" ");
      if (!hay.includes(qText)) return false;
    }
    return true;
  });

  for (const raw of filtered) {
    const r = applyPatch(raw);
    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td>${escapeHtml(r["Descripción"])}</td>
      <td>${escapeHtml(r["Cantidad"])}</td>
      <td>${escapeHtml(getSap(r))}</td>
      <td>${escapeHtml(r["N/P"])}</td>
      <td>${escapeHtml(r["Marca"])}</td>
      <td>${escapeHtml(r["Nota"] || "")}</td>
      <td>${editEnabled ? `<button class="btn" type="button" data-edit="1">Editar</button>` : ""}</td>
    `;

    els.tbody.appendChild(tr);

    if (editEnabled) {
      const btn = tr.querySelector('button[data-edit="1"]');
      if (btn) btn.addEventListener("click", () => openEditModal(raw));
    }
  }

  els.count.textContent = `${filtered.length} ítems`;
  updateEditUI();
}

// ===== Cargar BOM desde archivo (manual) =====
function loadBOMFromFile(file) {
  els.status.textContent = "Cargando BOM…";
  if (els.dataHint) els.dataHint.textContent = "Leyendo archivo…";

  const reader = new FileReader();
  reader.onerror = () => {
    console.error(reader.error);
    els.status.textContent = "Error leyendo archivo";
    if (els.dataHint) els.dataHint.textContent = "Error leyendo archivo";
    setDataLoadedUI(false);
  };

  reader.onload = () => {
    try {
      const text = String(reader.result || "");
      const parsed = JSON.parse(text);

      if (!Array.isArray(parsed)) throw new Error("El JSON debe ser un array de filas.");

      rows = parsed;
      buildModelList();
      renderModelList(modelList);

      // reset selección y filtros
      selectedModel = null;
      if (els.qModel) els.qModel.value = "";
      if (els.qPart) els.qPart.value = "";
      if (els.qSAP) els.qSAP.value = "";
      if (els.qNP) els.qNP.value = "";
      if (els.brand) els.brand.value = "";

      setDataLoadedUI(true);
      els.status.textContent = `Listo (${modelList.length} modelos)`;
      if (els.dataHint) els.dataHint.textContent = `BOM cargado: ${file.name}`;

      renderBOM();
      updateEditUI();
    } catch (e) {
      console.error(e);
      els.status.textContent = "Error: bom.json inválido";
      if (els.dataHint) els.dataHint.textContent = "JSON inválido";
      setDataLoadedUI(false);
      alert("No se pudo cargar el archivo. Asegúrate de que sea un bom.json válido (array).");
    }
  };

  reader.readAsText(file, "utf-8");
}

// ===== Cargar BOM desde el repo (AUTO) =====
async function loadBOMFromRepo() {
  els.status.textContent = "Cargando BOM…";
  if (els.dataHint) els.dataHint.textContent = "Cargando desde servidor…";

  try {
    const res = await fetch("data/bom.json", { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const parsed = await res.json();
    if (!Array.isArray(parsed)) throw new Error("El JSON debe ser un array de filas.");

    rows = parsed;
    buildModelList();
    renderModelList(modelList);

    // reset selección y filtros
    selectedModel = null;
    if (els.qModel) els.qModel.value = "";
    if (els.qPart) els.qPart.value = "";
    if (els.qSAP) els.qSAP.value = "";
    if (els.qNP) els.qNP.value = "";
    if (els.brand) els.brand.value = "";

    setDataLoadedUI(true);
    els.status.textContent = `Listo (${modelList.length} modelos)`;
    if (els.dataHint) els.dataHint.textContent = "BOM cargado automáticamente";

    // oculta carga manual si existe (para celular)
    // (si tu HTML lo tiene en un contenedor con id="loadBox", también lo ocultamos)
    if (els.fileBOM) els.fileBOM.style.display = "none";
    const loadBox = document.getElementById("loadBox");
    if (loadBox) loadBox.style.display = "none";

    renderBOM();
    updateEditUI();
  } catch (e) {
    console.error(e);
    els.status.textContent = "Error cargando BOM";
    if (els.dataHint) els.dataHint.textContent = "No se pudo cargar data/bom.json";

    // deja la opción manual disponible si existe
    if (els.fileBOM) els.fileBOM.style.display = "";
    const loadBox = document.getElementById("loadBox");
    if (loadBox) loadBox.style.display = "";

    setDataLoadedUI(false);
    alert("No se pudo cargar el BOM automático. Revisa que exista data/bom.json en GitHub.");
  }
}

// ===== Eventos UI =====
if (els.qModel) {
  els.qModel.addEventListener("input", () => {
    const q = toLower(els.qModel.value);
    const filtered = !q ? modelList : modelList.filter((m) => toLower(m).includes(q));
    renderModelList(filtered);
  });
}

if (els.models) {
  els.models.addEventListener("change", () => {
    selectedModel = els.models.value || null;
    renderBOM();
  });
}

// filtros
if (els.qPart) els.qPart.addEventListener("input", renderBOM);
if (els.brand) els.brand.addEventListener("change", renderBOM);
if (els.qSAP) els.qSAP.addEventListener("input", renderBOM);
if (els.qNP) els.qNP.addEventListener("input", renderBOM);

// edición
if (els.editMode) {
  els.editMode.addEventListener("change", () => {
    editEnabled = !!els.editMode.checked;
    updateEditUI();
    renderBOM();
  });
}

if (els.btnUndo) els.btnUndo.addEventListener("click", undoLast);
if (els.btnReset) els.btnReset.addEventListener("click", resetAll);
if (els.btnExport) els.btnExport.addEventListener("click", exportPatches);

if (els.fileImport) {
  els.fileImport.addEventListener("change", (e) => {
    const f = e.target.files?.[0];
    if (f) importPatches(f);
    e.target.value = "";
  });
}

// manual: cargar BOM desde el input file (queda por si falla el automático)
if (els.fileBOM) {
  els.fileBOM.addEventListener("change", (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    loadBOMFromFile(f);
    e.target.value = "";
  });
}

// ===== Service Worker (opcional) =====
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch(() => {});
  });
}

// ===== Init =====
initTheme();
setDataLoadedUI(false);
updateEditUI();
renderBOM();

// Arranque: auto-carga desde repo
loadBOMFromRepoCSV();



