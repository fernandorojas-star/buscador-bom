// Buscador BOM (GitHub Pages) - Carga automática desde data/bom.csv + edición avanzada (agregar/ocultar)

// Buscador BOM (GitHub Pages)
// - Carga automática desde data/bom.csv
// - Edición local: editar/agregar/quitar, borrar y renombrar bombas (todo localStorage)
// - Export/Import: bom_local_changes.json

const els = {
  status: document.getElementById("status"),
  themeBtn: document.getElementById("themeBtn"),

  dataHint: document.getElementById("dataHint"),
  fileBOM: document.getElementById("fileBOM"), // opcional si aún existe en tu HTML

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

  // NUEVOS botones (si existen en HTML)
  btnAddPart: document.getElementById("btnAddPart"),
  btnAddPump: document.getElementById("btnAddPump"),
  btnDelPump: document.getElementById("btnDelPump"),
  btnRenamePump: document.getElementById("btnRenamePump"),

  // modal
  editDlg: document.getElementById("editDlg"),
  eDesc: document.getElementById("eDesc"),
  eQty: document.getElementById("eQty"),
  eSap: document.getElementById("eSap"),
  eNp: document.getElementById("eNp"),
  eBrand: document.getElementById("eBrand"),
  eNote: document.getElementById("eNote"),
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
  return firstLine.includes(";") ? ";" : ",";
}
function splitCSVLine(line, sep) {
  const out = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
      else inQuotes = !inQuotes;
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

// ===== Estado base =====
let rowsBase = [];    // desde CSV
let rows = [];        // base + agregados - eliminados
let modelList = [];
let selectedModel = null;
let dataLoaded = false;

// ===== Persistencia local =====
const PATCH_KEY   = "bom_patches_v2";     // edits por rowId
const ADDED_KEY   = "bom_added_v1";       // filas nuevas
const DELETED_KEY = "bom_deleted_v1";     // ids ocultos
const UNDO_KEY    = "bom_undo_v3";        // undo stack

let editEnabled = false;
let patches = loadJson(PATCH_KEY, {});
let addedRows = loadJson(ADDED_KEY, []);
let deletedIds = new Set(loadJson(DELETED_KEY, []));
let undoStack = loadJson(UNDO_KEY, []);

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

// ===== UI enable/disable =====
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

// ===== Undo helpers =====
function pushUndo(entry){
  undoStack.push({ ...entry, at: new Date().toISOString() });
  if (undoStack.length > 120) undoStack.shift();
  saveJson(UNDO_KEY, undoStack);
}
function pushSnapshotUndo(label){
  pushUndo({
    kind: "snapshot",
    label,
    prev: {
      patches: { ...patches },
      addedRows: Array.isArray(addedRows) ? [...addedRows] : [],
      deletedIds: Array.from(deletedIds),
      selectedModel,
    }
  });
}
function restoreSnapshot(prev){
  patches = prev.patches || {};
  addedRows = prev.addedRows || [];
  deletedIds = new Set(prev.deletedIds || []);

  saveJson(PATCH_KEY, patches);
  saveJson(ADDED_KEY, addedRows);
  saveJson(DELETED_KEY, Array.from(deletedIds));
}

// ===== Rebuild rows/model list =====
function rebuildRowsFromBase() {
  rows = [...rowsBase, ...(Array.isArray(addedRows) ? addedRows : [])];
  rows = rows.filter(r => !deletedIds.has(rowId(r)));
  buildModelList();
}

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

function updateEditUI(){
  const hasPatches = Object.keys(patches).length > 0;
  const hasAdded = Array.isArray(addedRows) && addedRows.length > 0;
  const hasDeleted = deletedIds.size > 0;
  const canUndo = undoStack.length > 0;

  if (els.btnUndo)   els.btnUndo.disabled   = !(dataLoaded && editEnabled && canUndo);
  if (els.btnReset)  els.btnReset.disabled  = !(dataLoaded && editEnabled && (hasPatches || hasAdded || hasDeleted));
  if (els.btnExport) els.btnExport.disabled = !(dataLoaded && (hasPatches || hasAdded || hasDeleted));

  if (els.btnAddPump)     els.btnAddPump.disabled     = !(dataLoaded && editEnabled);
  if (els.btnAddPart)     els.btnAddPart.disabled     = !(dataLoaded && editEnabled && !!selectedModel);
  if (els.btnDelPump)     els.btnDelPump.disabled     = !(dataLoaded && editEnabled && !!selectedModel);
  if (els.btnRenamePump)  els.btnRenamePump.disabled  = !(dataLoaded && editEnabled && !!selectedModel);
}

// ===== Patches (editar fila existente) =====
function setPatch(rawRow, nextFields){
  const id = rowId(rawRow);
  const prev = patches[id] ? { ...patches[id] } : null;

  patches[id] = { ...(patches[id] || {}), ...nextFields };
  if (Object.keys(patches[id]).length === 0) delete patches[id];

  pushUndo({ kind: "patch", id, prev, next: patches[id] ? { ...patches[id] } : null });
  saveJson(PATCH_KEY, patches);
  updateEditUI();
}

// ===== Add row / Delete row =====
function addRow(newRow){
  const row = { ...newRow };
  const id = rowId(row);
  const exists = rows.some(r => rowId(r) === id);
  if (exists) { alert("Ya existe una fila igual (mismo modelo/tipo/sap/np/descripcion)."); return; }

  pushUndo({ kind: "add", prevLen: Array.isArray(addedRows) ? addedRows.length : 0 });

  addedRows = [...(Array.isArray(addedRows) ? addedRows : []), row];
  saveJson(ADDED_KEY, addedRows);

  rebuildRowsFromBase();
  renderModelList(modelList);
  renderBOM();
  updateEditUI();
}

function softDeleteRow(rawRow){
  const id = rowId(rawRow);
  if (deletedIds.has(id)) return;

  pushUndo({ kind: "delete", id });

  deletedIds.add(id);
  saveJson(DELETED_KEY, Array.from(deletedIds));

  rebuildRowsFromBase();
  renderModelList(modelList);
  renderBOM();
  updateEditUI();
}

// ===== Export/Import =====
function exportAllLocal(){
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

  // formato nuevo
  if (obj && obj.__patches) {
    pushSnapshotUndo("import");

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

  // formato antiguo (solo patches)
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
    alert("Formato inválido.");
    return;
  }

  pushSnapshotUndo("import_old");
  patches = { ...patches, ...obj };
  saveJson(PATCH_KEY, patches);

  rebuildRowsFromBase();
  renderModelList(modelList);
  renderBOM();
  updateEditUI();
}

// ===== Undo / Reset =====
function undoLast(){
  const last = undoStack.pop();
  if (!last) return;
  saveJson(UNDO_KEY, undoStack);

  if (last.kind === "snapshot") {
    restoreSnapshot(last.prev || {});
    rebuildRowsFromBase();
    renderModelList(modelList);
    selectedModel = last.prev?.selectedModel || null;
    if (els.models) els.models.value = selectedModel || "";
    renderBOM();
    updateEditUI();
    return;
  }

  if (last.kind === "patch") {
    if (last.prev == null) delete patches[last.id];
    else patches[last.id] = last.prev;
    saveJson(PATCH_KEY, patches);
  }

  if (last.kind === "add") {
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
  if (!confirm("¿Restaurar BOM base? Se borrarán cambios locales (ediciones/agregados/eliminados) en este dispositivo.")) return;

  patches = {};
  addedRows = [];
  deletedIds = new Set();
  undoStack = [];

  localStorage.removeItem(PATCH_KEY);
  localStorage.removeItem(ADDED_KEY);
  localStorage.removeItem(DELETED_KEY);
  localStorage.removeItem(UNDO_KEY);

  rebuildRowsFromBase();
  renderModelList(modelList);
  selectedModel = null;
  if (els.models) els.models.value = "";
  renderBOM();
  updateEditUI();
}

// ===== Modal editar/agregar repuesto =====
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
  if (!selectedModel) { alert("Primero selecciona una bomba/modelo."); return; }

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

      // Agregar repuesto (fila nueva)
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

        if (!norm(newRow["Descripción"])) { alert("Falta la Descripción."); return; }
        addRow(newRow);

        els.editDlg.close();
        addingMode = null;
        return;
      }

      // Editar fila existente
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

// ===== Marca => bombas por marca =====
function getPumpModelsByBrand(brand) {
  const set = new Set();

  for (const r of rows) {
    const tipo = toLower(r["Tipo"]);
    if (!tipo.includes("repuesto")) continue;

    const rr = applyPatch(r);
    if (getBrand(rr) !== brand) continue;

    const model = norm(rr["Nombre_modelo"]);
    if (model) set.add(model);
  }

  return Array.from(set).sort((a, b) => a.localeCompare(b, "es"));
}

// ===== Render marcas (según repuestos del modelo seleccionado) =====
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

  let filtered = repuestos.filter((r) => {
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

// ===== Acciones bomba (borrar / renombrar) =====
function deleteSelectedPump() {
  if (!editEnabled) return;
  if (!selectedModel) { alert("Primero selecciona una bomba/modelo."); return; }

  const model = selectedModel;
  if (!confirm(`¿Borrar (ocultar) la bomba "${model}" y TODOS sus repuestos en este dispositivo?`)) return;

  // esto hará varios undo (uno por fila) -> OK
  const toDelete = rows.filter(r => norm(r["Nombre_modelo"]) === model);
  for (const r of toDelete) softDeleteRow(r);

  selectedModel = null;
  if (els.models) els.models.value = "";
  renderBOM();
  updateEditUI();
}

function renameSelectedPump() {
  if (!editEnabled) return;
  if (!selectedModel) { alert("Primero selecciona una bomba/modelo."); return; }

  const oldName = selectedModel;
  const newName = norm(prompt(`Nuevo nombre para la bomba:\n\nActual: ${oldName}`, oldName));
  if (!newName || newName === oldName) return;

  if (modelList.some(m => norm(m) === newName)) {
    alert("Ya existe una bomba con ese nombre.");
    return;
  }

  // Undo de todo como snapshot (más seguro)
  pushSnapshotUndo("rename_pump");

  // 1) ocultar filas base del modelo antiguo
  const baseToMove = rowsBase.filter(r => norm(r["Nombre_modelo"]) === oldName);
  for (const r of baseToMove) deletedIds.add(rowId(r));

  // 2) crear copias del base con nombre nuevo como agregados
  const movedCopies = baseToMove.map(r => ({ ...r, "Nombre_modelo": newName }));

  // 3) renombrar agregados existentes del modelo
  addedRows = (Array.isArray(addedRows) ? addedRows : []).map(r => {
    if (norm(r["Nombre_modelo"]) !== oldName) return r;
    return { ...r, "Nombre_modelo": newName };
  });

  // 4) sumar copias
  addedRows = [...addedRows, ...movedCopies];

  // guardar
  saveJson(ADDED_KEY, addedRows);
  saveJson(DELETED_KEY, Array.from(deletedIds));

  rebuildRowsFromBase();
  renderModelList(modelList);

  selectedModel = newName;
  if (els.models) els.models.value = newName;

  renderBOM();
  updateEditUI();
}

// ===== Cargar desde repo CSV =====
async function loadBOMFromRepoCSV() {
  if (els.status) els.status.textContent = "Cargando BOM…";
  if (els.dataHint) els.dataHint.textContent = "Cargando CSV…";

  try {
    const CSV_VER = "31"; // <-- cambia este número cada vez que actualices la base
const CSV_VER = "31"; // <-- cambia este número cada vez que actualices la base
const res = await fetch(`data/bom.csv?v=${CSV_VER}`, { cache: "no-store" });


    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const text = await res.text();
    const parsed = parseCSV(text);
    if (!Array.isArray(parsed) || parsed.length === 0) throw new Error("CSV vacío o inválido.");

    rowsBase = parsed;

    rebuildRowsFromBase();
    renderModelList(modelList);

    selectedModel = null;
    if (els.qModel) els.qModel.value = "";
    if (els.qPart) els.qPart.value = "";
    if (els.qSAP) els.qSAP.value = "";
    if (els.qNP) els.qNP.value = "";
    if (els.brand) els.brand.value = "";

    setDataLoadedUI(true);

    if (els.status) els.status.textContent = `Listo (${modelList.length} modelos)`;
    if (els.dataHint) els.dataHint.textContent = "BOM cargado automáticamente (CSV)";

    // si existe caja de carga manual vieja, la escondemos
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

    alert("No se pudo cargar el BOM desde data/bom.csv. Revisa que exista en /data y que tenga encabezados.");
  }
}

// ===== Eventos UI =====
if (els.qModel) {
  els.qModel.addEventListener("input", () => {
    const q = toLower(els.qModel.value);
    const filtered = !q ? modelList : modelList.filter(m => toLower(m).includes(q));
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
if (els.qSAP)  els.qSAP.addEventListener("input", renderBOM);
if (els.qNP)   els.qNP.addEventListener("input", renderBOM);

// ✅ Marca: si seleccionas marca, la lista de bombas cambia a “bombas con esa marca”
if (els.brand) {
  els.brand.addEventListener("change", () => {
    const brandSelected = norm(els.brand.value);

    if (brandSelected) {
      const modelsByBrand = getPumpModelsByBrand(brandSelected);
      renderModelList(modelsByBrand);

      selectedModel = null;
      if (els.models) els.models.value = "";
      renderBOM();
      updateEditUI();
      return;
    }

    // volver a todas
    renderModelList(modelList);
    renderBOM();
    updateEditUI();
  });
}

if (els.editMode) {
  els.editMode.addEventListener("change", () => {
    editEnabled = !!els.editMode.checked;
    updateEditUI();
    renderBOM();
  });
}

if (els.btnUndo)   els.btnUndo.addEventListener("click", undoLast);
if (els.btnReset)  els.btnReset.addEventListener("click", resetAll);
if (els.btnExport) els.btnExport.addEventListener("click", exportAllLocal);

if (els.fileImport) {
  els.fileImport.addEventListener("change", (e) => {
    const f = e.target.files?.[0];
    if (f) importAllLocal(f);
    e.target.value = "";
  });
}

if (els.btnAddPart) els.btnAddPart.addEventListener("click", openAddPartModal);

if (els.btnAddPump) {
  els.btnAddPump.addEventListener("click", () => {
    if (!editEnabled) return;

    const name = prompt("Nombre de la nueva bomba/modelo:");
    const model = norm(name);
    if (!model) return;

    if (modelList.some(m => norm(m) === model)) {
      alert("Esa bomba ya existe.");
      return;
    }

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

    selectedModel = model;
    if (els.models) els.models.value = model;
    renderBOM();
    updateEditUI();
  });
}

if (els.btnDelPump) els.btnDelPump.addEventListener("click", deleteSelectedPump);
if (els.btnRenamePump) els.btnRenamePump.addEventListener("click", renameSelectedPump);

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










