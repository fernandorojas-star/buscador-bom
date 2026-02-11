// Buscador BOM (GitHub Pages) - Carga automática desde data/bom.csv + edición avanzada (agregar/ocultar)

const els = {
  status: document.getElementById("status"),
  themeBtn: document.getElementById("themeBtn"),

  // (pueden existir en tu HTML; si no existen no rompe)
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

  // NUEVOS botones (los agregaremos luego al HTML; si no existen, no rompe)
  btnAddPart: document.getElementById("btnAddPart"),
  btnAddPump: document.getElementById("btnAddPump"),

  // modal edición (reutilizado para editar y para agregar repuesto)
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
  return norm(r["Codigo SAP"] ?? r["Código SAP"]);
}
function getBrand(r) {
  return norm(
    r["Marca"] ??
    r["MARCA"] ??
    r["marca"] ??
    r["Brand"] ??
    r["brand"] ??
    r["Marca "]
  );
}

// ===== CSV parser (soporta comillas) =====
function detectSeparator(firstLine) {
  if (firstLine.includes(";")) return ";";
  return ",";
}
function splitCSVLine(line, sep) {
  const out = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
      else { inQuotes = !inQuotes; }
      continue;
    }
    if (!inQuotes && ch === sep) { out.push(cur); cur = ""; continue; }
    cur += ch;
  }
  out.push(cur);
  return out;
}
function parseCSV(text) {
  const clean = String(text ?? "").replace(/\r/g, "").trim();
  if (!clean) return [];
  const lines = clean.split("\n").filter(l => l.trim().length);
  if (lines.length < 2) return [];
  const sep = detectSeparator(lines[0]);
  const headers = splitCSVLine(lines[0], sep).map(h => norm(h));
  const rowsOut = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCSVLine(lines[i], sep);
    const obj = {};
    for (let c = 0; c < headers.length; c++) obj[headers[c]] = norm(cols[c] ?? "");
    rowsOut.push(obj);
  }
  return rowsOut;
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
let rowsBase = [];   // desde CSV
let rows = [];       // base + agregados (y luego filtrado por deleted)
let modelList = [];
let selectedModel = null;
let dataLoaded = false;

// ===== Habilitar/Deshabilitar UI hasta cargar BOM =====
function setDataLoadedUI(ok) {
  dataLoaded = ok;

  if (els.models) els.models.disabled = !ok;
  if (els.qModel) els.qModel.disabled = !ok;
  if (els.brand) els.brand.disabled = !ok;
  if (els.qSAP) els.qSAP.disabled = !ok;
  if (els.qNP) els.qNP.disabled = !ok;
  if (els.qPart) els.qPart.disabled = !ok;

  if (els.editMode) els.editMode.disabled = !ok;
  if (els.fileImport) els.fileImport.disabled = !ok;

  if (!ok) {
    selectedModel = null;
    if (els.selected) els.selected.textContent = "Ninguna bomba seleccionada";
    if (els.count) els.count.textContent = "0 ítems";
    if (els.models) els.models.innerHTML = "";
    if (els.tbody) els.tbody.innerHTML = "";
    if (els.brand) els.brand.innerHTML = `<option value="">Marca: Todas</option>`;
  }
}

// ===== Edición local =====
// patches: cambios a filas existentes (por rowId)
const PATCH_KEY = "bom_patches_v2";
const UNDO_KEY  = "bom_undo_v2";
// added: filas nuevas
const ADDED_KEY = "bom_added_v1";
// deleted: ids ocultos
const DELETED_KEY = "bom_deleted_v1";

let editEnabled = false;
let patches = loadJson(PATCH_KEY, {});
let undoStack = loadJson(UNDO_KEY, []);
let addedRows = loadJson(ADDED_KEY, []);            // array de objetos fila
let deletedIds = new Set(loadJson(DELETED_KEY, [])); // array de strings

function loadJson(key, fallback){
  try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); }
  catch { return fallback; }
}
function saveJson(key, value){
  localStorage.setItem(key, JSON.stringify(value));
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

function rebuildRowsFromBase() {
  // 1) base + agregados
  rows = [...rowsBase, ...(Array.isArray(addedRows) ? addedRows : [])];

  // 2) filtra eliminados
  rows = rows.filter(r => !deletedIds.has(rowId(r)));

  // 3) modelos
  buildModelList();
}

function updateEditUI(){
  const hasPatches = Object.keys(patches).length > 0;
  const hasAdded = Array.isArray(addedRows) && addedRows.length > 0;
  const hasDeleted = deletedIds.size > 0;
  const canUndo = undoStack.length > 0;

  if (els.btnUndo)   els.btnUndo.disabled   = !(dataLoaded && editEnabled && canUndo);
  if (els.btnReset)  els.btnReset.disabled  = !(dataLoaded && editEnabled && (hasPatches || hasAdded || hasDeleted));
  if (els.btnExport) els.btnExport.disabled = !(dataLoaded && (hasPatches || hasAdded || hasDeleted));

  // botones nuevos
  if (els.btnAddPart) els.btnAddPart.disabled = !(dataLoaded && editEnabled && !!selectedModel);
  if (els.btnAddPump) els.btnAddPump.disabled = !(dataLoaded && editEnabled);
}

function pushUndo(entry){
  undoStack.push({ ...entry, at: new Date().toISOString() });
  if (undoStack.length > 200) undoStack.shift();
  saveJson(UNDO_KEY, undoStack);
}

function setPatch(rawRow, nextFields){
  const id = rowId(rawRow);
  const prev = patches[id] ? { ...patches[id] } : null;

  patches[id] = { ...(patches[id] || {}), ...nextFields };
  if (Object.keys(patches[id]).length === 0) delete patches[id];

  pushUndo({ kind: "patch", id, prev, next: patches[id] ? { ...patches[id] } : null });

  saveJson(PATCH_KEY, patches);
  updateEditUI();
}

function addRow(newRow){
  // newRow: objeto fila completo
  const row = { ...newRow };
  // evita duplicar exacto por id
  const id = rowId(row);
  const exists = rows.some(r => rowId(r) === id);
  if (exists) {
    alert("Esa pieza ya existe (mismo modelo/tipo/sap/np/descripcion).");
    return;
  }

  const prevLen = addedRows.length;
  addedRows = [...addedRows, row];
  saveJson(ADDED_KEY, addedRows);

  pushUndo({ kind: "add", id, prevLen });

  rebuildRowsFromBase();
  renderModelList(modelList);
  renderBOM();
  updateEditUI();
}

function softDeleteRow(rawRow){
  const id = rowId(rawRow);
  if (deletedIds.has(id)) return;

  deletedIds.add(id);
  saveJson(DELETED_KEY, Array.from(deletedIds));

  pushUndo({ kind: "delete", id });

  rebuildRowsFromBase();
  renderModelList(modelList);
  renderBOM();
  updateEditUI();
}

function undoLast(){
  const last = undoStack.pop();
  if (!last) return;
  saveJson(UNDO_KEY, undoStack);

  if (last.kind === "patch") {
    if (last.prev == null) delete patches[last.id];
    else patches[last.id] = last.prev;
    saveJson(PATCH_KEY, patches);
  }

  if (last.kind === "add") {
    // quita el último agregado (por longitud previa)
    const prevLen = last.prevLen ?? 0;
    if (Array.isArray(addedRows) && addedRows.length > prevLen) {
      addedRows = addedRows.slice(0, prevLen);
      saveJson(ADDED_KEY, addedRows);
    }
  }

  if (last.kind === "delete") {
    deletedIds.delete(last.id);
    saveJson(DELETED_KEY, Array.from(deletedIds));
  }

  rebuildRowsFromBase();
  renderModelList(modelList);
  renderBOM();
  updateEditUI();
}

function resetAll(){
  if (!confirm("¿Restaurar BOM base? Se borrarán cambios locales (ediciones, agregados y eliminados) en este dispositivo.")) return;

  patches = {};
  undoStack = [];
  addedRows = [];
  deletedIds = new Set();

  localStorage.removeItem(PATCH_KEY);
  localStorage.removeItem(UNDO_KEY);
  localStorage.removeItem(ADDED_KEY);
  localStorage.removeItem(DELETED_KEY);

  rebuildRowsFromBase();
  renderModelList(modelList);
  renderBOM();
  updateEditUI();
}

function exportAllLocal(){
  // exporta patches + agregados + eliminados en un solo json
  const payload = {
    __version: 1,
    __added: Array.isArray(addedRows) ? addedRows : [],
    __deleted: Array.from(deletedIds),
    __patches: patches,
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "bom_local_changes.json";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function importAllLocal(file){
  const text = await file.text();
  let obj;
  try { obj = JSON.parse(text); }
  catch { alert("Archivo JSON inválido."); return; }

  // Acepta el formato nuevo o el antiguo (solo patches)
  if (obj && obj.__patches) {
    patches = { ...patches, ...(obj.__patches || {}) };
    const add = Array.isArray(obj.__added) ? obj.__added : [];
    const del = Array.isArray(obj.__deleted) ? obj.__deleted : [];

    addedRows = [...(Array.isArray(addedRows) ? addedRows : []), ...add];
    del.forEach(id => deletedIds.add(id));

    saveJson(PATCH_KEY, patches);
    saveJson(ADDED_KEY, addedRows);
    saveJson(DELETED_KEY, Array.from(deletedIds));

    rebuildRowsFromBase();
    renderModelList(modelList);
    renderBOM();
    updateEditUI();
    return;
  }

  // formato antiguo (parches directos)
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
    alert("Formato inválido: se espera un objeto JSON.");
    return;
  }

  patches = { ...patches, ...obj };
  saveJson(PATCH_KEY, patches);

  rebuildRowsFromBase();
  renderModelList(modelList);
  renderBOM();
  updateEditUI();
}

// ===== Modal edición (reutilizado) =====
let editingRaw = null;
let addingMode = null; // null | "part"

function openEditModal(raw){
  addingMode = null;
  editingRaw = raw;
  const r = applyPatch(raw);

  if (els.eDesc)  els.eDesc.value  = norm(r["Descripción"]);
  if (els.eQty)   els.eQty.value   = norm(r["Cantidad"]);
  if (els.eSap)   els.eSap.value   = norm(getSap(r));
  if (els.eNp)    els.eNp.value    = norm(r["N/P"]);
  if (els.eBrand) els.eBrand.value = norm(getBrand(r));
  if (els.eNote)  els.eNote.value  = norm(r["Nota"]);

  if (els.editDlg) els.editDlg.showModal();
}

function openAddPartModal(){
  if (!selectedModel) {
    alert("Primero selecciona una bomba/modelo.");
    return;
  }
  addingMode = "part";
  editingRaw = null;

  if (els.eDesc)  els.eDesc.value  = "";
  if (els.eQty)   els.eQty.value   = "1";
  if (els.eSap)   els.eSap.value   = "";
  if (els.eNp)    els.eNp.value    = "";
  if (els.eBrand) els.eBrand.value = "";
  if (els.eNote)  els.eNote.value  = "";

  if (els.editDlg) els.editDlg.showModal();
}

if (els.btnCancelEdit && els.editDlg) {
  els.btnCancelEdit.addEventListener("click", () => {
    editingRaw = null;
    addingMode = null;
    els.editDlg.close();
  });
}

if (els.editDlg) {
  const form = els.editDlg.querySelector("form");
  if (form) {
    form.addEventListener("submit", (e) => {
      e.preventDefault();

      // 1) Agregar repuesto (fila nueva)
      if (addingMode === "part") {
        const newRow = {
          "Tipo": "repuesto",
          "Nombre_modelo": selectedModel,
          "Descripción": els.eDesc?.value ?? "",
          "Cantidad": els.eQty?.value ?? "",
          "Codigo SAP": els.eSap?.value ?? "",
          "N/P": els.eNp?.value ?? "",
          "Marca": els.eBrand?.value ?? "",
          "Nota": els.eNote?.value ?? "",
        };

        if (!norm(newRow["Descripción"])) {
          alert("Falta la Descripción.");
          return;
        }
        addRow(newRow);

        els.editDlg.close();
        addingMode = null;
        return;
      }

      // 2) Editar fila existente (patch)
      if (!editingRaw) return;

      setPatch(editingRaw, {
        "Descripción": els.eDesc?.value ?? "",
        "Cantidad": els.eQty?.value ?? "",
        "Codigo SAP": els.eSap?.value ?? "",
        "N/P": els.eNp?.value ?? "",
        "Marca": els.eBrand?.value ?? "",
        "Nota": els.eNote?.value ?? "",
      });

      els.editDlg.close();
      editingRaw = null;
      renderBOM();
    });
  }
}

// ===== Render lista modelos =====
function renderModelList(list) {
  if (!els.models) return;
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
  if (!els.brand) return;

  const set = new Set();
  for (const raw of repuestos) {
    const rr = applyPatch(raw);
    const m = getBrand(rr);
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
  if (els.tbody) els.tbody.innerHTML = "";

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

  if (els.selected) els.selected.textContent = selectedModel;

  const repuestos = rows.filter((r) =>
    norm(r["Nombre_modelo"]) === selectedModel &&
    toLower(r["Tipo"]).includes("repuesto")
  );

  renderBrandOptions(repuestos);

  const qText = toLower(els.qPart?.value);
  const qSap = toLower(els.qSAP?.value);
  const qNp = toLower(els.qNP?.value);
  const brandSelected = norm(els.brand?.value);

  const filtered = repuestos.filter((r) => {
    const rr = applyPatch(r);

    if (brandSelected && getBrand(rr) !== brandSelected) return false;
    if (qSap && !toLower(getSap(rr)).includes(qSap)) return false;
    if (qNp && !toLower(rr["N/P"]).includes(qNp)) return false;

    if (qText) {
      const hay = [
        rr["Descripción"],
        getSap(rr),
        rr["N/P"],
        getBrand(rr),
        rr["Nota"],
      ].map(toLower).join(" ");
      if (!hay.includes(qText)) return false;
    }
    return true;
  });

  for (const raw of filtered) {
    const r = applyPatch(raw);
    const tr = document.createElement("tr");
    const canEdit = editEnabled;

    tr.innerHTML = `
      <td>${escapeHtml(r["Descripción"])}</td>
      <td>${escapeHtml(r["Cantidad"])}</td>
      <td>${escapeHtml(getSap(r))}</td>
      <td>${escapeHtml(r["N/P"])}</td>
      <td>${escapeHtml(getBrand(r))}</td>
      <td>${escapeHtml(r["Nota"] || "")}</td>
      <td>
        ${canEdit ? `<button class="btn" type="button" data-edit="1">Editar</button>` : ""}
        ${canEdit ? `<button class="btn danger" type="button" data-del="1">Quitar</button>` : ""}
      </td>
    `;

    els.tbody.appendChild(tr);

    if (canEdit) {
      const btnE = tr.querySelector('button[data-edit="1"]');
      if (btnE) btnE.addEventListener("click", () => openEditModal(raw));

      const btnD = tr.querySelector('button[data-del="1"]');
      if (btnD) btnD.addEventListener("click", () => {
        if (!confirm("¿Quitar esta pieza? (solo se ocultará en este dispositivo)")) return;
        softDeleteRow(raw);
      });
    }
  }

  if (els.count) els.count.textContent = `${filtered.length} ítems`;
  updateEditUI();
}

// ===== Carga automática desde data/bom.csv =====
async function loadBOMFromRepoCSV() {
  if (els.status) els.status.textContent = "Cargando BOM…";
  if (els.dataHint) els.dataHint.textContent = "Cargando CSV…";

  try {
    const res = await fetch("data/bom.csv", { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const text = await res.text();
    const parsed = parseCSV(text);

    if (!Array.isArray(parsed) || parsed.length === 0) {
      throw new Error("CSV vacío o inválido.");
    }

    rowsBase = parsed;

    rebuildRowsFromBase();
    renderModelList(modelList);

    // reset selección y filtros
    selectedModel = null;
    if (els.qModel) els.qModel.value = "";
    if (els.qPart) els.qPart.value = "";
    if (els.qSAP) els.qSAP.value = "";
    if (els.qNP) els.qNP.value = "";
    if (els.brand) els.brand.value = "";

    setDataLoadedUI(true);

    if (els.status) els.status.textContent = `Listo (${modelList.length} modelos)`;
    if (els.dataHint) els.dataHint.textContent = "BOM cargado automáticamente (CSV)";

    // oculta caja de carga manual si existe
    const loadBox = document.getElementById("loadBox");
    if (loadBox) loadBox.style.display = "none";
    if (els.fileBOM) els.fileBOM.style.display = "none";

    renderBOM();
    updateEditUI();

  } catch (e) {
    console.error(e);

    setDataLoadedUI(false);
    if (els.status) els.status.textContent = "Error cargando BOM";
    if (els.dataHint) els.dataHint.textContent = "No se pudo cargar data/bom.csv";

    const loadBox = document.getElementById("loadBox");
    if (loadBox) loadBox.style.display = "";
    if (els.fileBOM) els.fileBOM.style.display = "";

    alert("No se pudo cargar el BOM desde data/bom.csv. Revisa que exista en /data y que tenga encabezados.");
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
    updateEditUI();
  });
}

if (els.qPart) els.qPart.addEventListener("input", renderBOM);
if (els.brand) els.brand.addEventListener("change", renderBOM);
if (els.qSAP) els.qSAP.addEventListener("input", renderBOM);
if (els.qNP) els.qNP.addEventListener("input", renderBOM);

if (els.editMode) {
  els.editMode.addEventListener("change", () => {
    editEnabled = !!els.editMode.checked;
    updateEditUI();
    renderBOM();
  });
}

if (els.btnUndo) els.btnUndo.addEventListener("click", undoLast);
if (els.btnReset) els.btnReset.addEventListener("click", resetAll);
if (els.btnExport) els.btnExport.addEventListener("click", exportAllLocal);

if (els.fileImport) {
  els.fileImport.addEventListener("change", (e) => {
    const f = e.target.files?.[0];
    if (f) importAllLocal(f);
    e.target.value = "";
  });
}

// Botones nuevos (si existen)
if (els.btnAddPart) els.btnAddPart.addEventListener("click", openAddPartModal);

if (els.btnAddPump) {
  els.btnAddPump.addEventListener("click", () => {
    const name = prompt("Nombre de la nueva bomba/modelo:");
    const model = norm(name);
    if (!model) return;

    // crear una fila tipo bomba
    const newPump = {
      "Tipo": "bomba",
      "Nombre_modelo": model,
      "Descripción": "",
      "Cantidad": "",
      "Codigo SAP": "",
      "N/P": "",
      "Marca": "",
      "Nota": "Agregado localmente",
    };

    addRow(newPump);

    // selecciona esa bomba
    selectedModel = model;
    if (els.models) els.models.value = model;
    renderBOM();
    updateEditUI();
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

if (els.status) els.status.textContent = "Cargando BOM…";
if (els.dataHint) els.dataHint.textContent = "Cargando automáticamente…";

loadBOMFromRepoCSV();






