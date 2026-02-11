const fs = require("fs");

if (!fs.existsSync("bom.csv")) {
  console.log("ERROR: No encuentro bom.csv en esta carpeta.");
  console.log("Asegúrate de guardar bom.csv dentro de BOM-WEB-OFFLINE.");
  process.exit(1);
}

const text = fs.readFileSync("bom.csv", "utf8");

// Detecta separador (; o ,)
const firstLine = text.split(/\r?\n/)[0] || "";
const sep = firstLine.includes(";") ? ";" : ",";

const lines = text.split(/\r?\n/).filter(l => l.trim() !== "");
const headers = lines[0].split(sep).map(h => h.trim());

const data = lines.slice(1).map(line => {
  const values = line.split(sep);
  const obj = {};
  headers.forEach((h, i) => obj[h] = (values[i] ?? "").trim());
  return obj;
});

fs.mkdirSync("data", { recursive: true });
fs.writeFileSync("data/bom.json", JSON.stringify(data, null, 2), "utf8");

console.log(`OK: Generé data/bom.json con ${data.length} filas (separador: "${sep}")`);
