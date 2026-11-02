// Lectura de Excel, normalización y búsqueda de coincidencias contra el catálogo.
// Requiere la librería global XLSX (SheetJS), cargada en index.html.

// ---------------------------------------------------------------- texto
export const norm = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/­/g, "").toUpperCase().replace(/\s+/g, " ").trim();
export const key = (s) => norm(s).replace(/&/g, " Y ").replace(/[^A-Z0-9]/g, "");

const OWNER_MAP = {
  "GPO POL": "GRUPO POL", "GRUPO POL DEVICES": "GRUPO POL", "G8MEDIA DEVICES": "G8 MEDIA",
  "EMEPE DEVICES": "EMEPE", "WEST MEDIA DEVICES": "WEST MEDIA", "JC DECAUX DEVICES": "JC DECAUX",
  "JC DACUX": "JC DECAUX", "GPO VALLAS": "GRUPO VALLAS", "GPO EXPANSION": "GRUPO EXPANSION",
};
export const normOwner = (o) => { const n = norm(o); return OWNER_MAP[n] || n; };
const VENUE_MAP = { "PARABUS": "PARABUS", "METROBUS": "METROBUS", "CENTRO COMERCIA": "CENTRO COMERCIAL" };
export const normVenue = (v) => { const n = norm(v); return VENUE_MAP[n] || n; };

// Códigos de proveedor que llegan pegados al nombre (GDL012_, MB01_MO0701N //, 29SNF-, DE-0053-, -42)
const CODE_PATTERNS = [/^((?:CDM|EMX|GDL|MTY)\d{3})_/, /^(MB0?1_M[OP]\d{4}[NS])\s*\/\/\s*/, /^(\d{1,2}[A-Z]{3,4})-/, /^(DE-0*\d+)\s*-\s*/];
export function stripCodes(u) {
  u = norm(u); const codes = [];
  for (const p of CODE_PATTERNS) { const m = u.match(p); if (m) { codes.push(m[1]); u = u.slice(m[0].length); } }
  const m = u.match(/(?<=[A-Z])\s*-\s?(\d{1,2})$/);
  if (m) { codes.push("-" + m[1]); u = u.slice(0, m.index); }
  return { name: u.trim(), codes };
}
export function cityFromCoords(lat) {
  if (!isFinite(lat)) return "";
  return lat > 24 ? "MTY" : lat > 20.3 ? "GDL" : "CDMX";
}
export function haversine(a, b) {
  const R = 6371000, r = Math.PI / 180;
  const dLa = (b[0] - a[0]) * r, dLo = (b[1] - a[1]) * r;
  const h = Math.sin(dLa / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
const num = (v) => { if (typeof v === "number") return v; const n = parseFloat(String(v ?? "").replace(/,\s*$/, "").trim()); return isFinite(n) ? n : NaN; };

// ---------------------------------------------------------------- hojas
export async function readWorkbook(file) {
  const buf = await file.arrayBuffer();
  return XLSX.read(buf, { type: "array" });
}
function sheetRows(ws) { return XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, blankrows: false }); }

// Busca la fila de encabezados y mapea columnas por nombre.
const COLS = {
  ID: ["ID SOPORTE", "ID", "ID NUEVO", "ID BYM"], ID_ANT: ["ID ANTERIOR"],
  UBIC: ["UBICACION", "DIRECCION"], VENUE: ["VENUE TYPE", "FORMATO", "TIPO DE SOPORTE"],
  ESP: ["TIPO DE ESPACIO"], DET: ["DETALLE / POSICION", "DETALLE", "POSICION"],
  CIUDAD: ["CIUDAD", "PLAZA"], NETWORK: ["NETWORK"], OWNER: ["MEDIA OWNER", "PROVEEDOR"],
  IDPROV: ["ID PROVEEDOR", "CODIGO DEL SITIO"], MEDIDAS: ["MEDIDAS", "SPECS"], LAT: ["LAT", "LATITUD"], LON: ["LONG", "LONGITUD", "LON"],
  ALIAS: ["NOMBRE(S) ORIGINAL(ES)", "NOMBRES ORIGINALES"], ACTIVO: ["ACTIVO"],
  TEMP: ["TEMPORALIDAD", "FECHAS"], STATUS: ["STATUS", "ESTATUS"], COMENT: ["COMENTARIO", "COMENTARIOS"],
  PERIODO: ["PERIODO"], SLIDE: ["SLIDE", "# SLIDE"],
};
const FECHA_RX = /\b\d{1,2}\s*(DE\s+[A-Z]+\s+)?AL?\s+\d{1,2}|ENERO|FEBRERO|MARZO|ABRIL|MAYO|JUNIO|JULIO|AGOSTO|SEPTIEMBRE|OCTUBRE|NOVIEMBRE|DICIEMBRE/;
export function findTable(rows) {
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const r = (rows[i] || []).map((v) => norm(v));
    if (r.some((v) => COLS.UBIC.includes(v) || v === "ID SOPORTE")) {
      const map = {};
      for (const [k, names] of Object.entries(COLS)) {
        for (const n of names) { const j = r.indexOf(n); if (j >= 0 && map[k] === undefined) { map[k] = j; } }
      }
      // Columna de fechas sin encabezado (p. ej. "12 de octubre al 01 de noviembre")
      if (map.TEMP === undefined) {
        const sample = rows.slice(i + 1, i + 15);
        for (let j = 0; j < r.length; j++) {
          if (r[j] && !/^\s*$/.test(r[j])) continue;
          const vals = sample.map((x) => norm(x && x[j])).filter(Boolean);
          if (vals.length >= 2 && vals.filter((v) => FECHA_RX.test(v)).length / vals.length > 0.6) { map.TEMP = j; break; }
        }
      }
      const pre = rows.slice(0, i).flat().filter((v) => typeof v === "string" && v.trim().length > 3);
      return { header: i, map, title: pre.find((v) => /ZETABE|\|/i.test(v)) || pre[0] || "" };
    }
  }
  return null;
}
function tableRows(rows, t) {
  const out = [];
  for (let i = t.header + 1; i < rows.length; i++) {
    const r = rows[i] || [];
    const g = (k) => (t.map[k] === undefined ? null : r[t.map[k]]);
    const ubic = g("UBIC"), idv = g("ID"), idAnt = g("ID_ANT");
    const blank = (v) => v === null || String(v).trim() === "";
    if (blank(ubic) && blank(idv) && blank(idAnt)) continue;
    out.push({
      fila: i + 1, ubic: blank(ubic) ? "" : String(ubic).replace(/\n/g, " ").trim(), venue: g("VENUE"), esp: g("ESP"), det: g("DET"),
      ciudad: g("CIUDAD"), network: g("NETWORK"), owner: g("OWNER"), idprov: g("IDPROV"), medidas: g("MEDIDAS"),
      lat: num(g("LAT")), lon: num(g("LON")), id: g("ID"), idAnt: g("ID_ANT"), alias: g("ALIAS"), activo: g("ACTIVO"),
      temp: g("TEMP"), status: g("STATUS"), coment: g("COMENT"), periodo: g("PERIODO"), slide: g("SLIDE"),
    });
  }
  return out;
}
function mode(vals) {
  const c = new Map(); for (const v of vals) if (v) c.set(v, (c.get(v) || 0) + 1);
  let best = "", n = 0; for (const [k, v] of c) if (v > n) { best = k; n = v; } return best;
}
export function guessPeriod(name) {
  const n = norm(name);
  if (n.includes("SUSTITU")) return "Sustituciones";
  if (n.includes("PREVIA")) return "Previa";
  if (n.includes("DURANTE")) return "Durante";
  if (/PIVOT|ODC|RESUMEN|BACK|DETAIL/.test(n)) return "Ignorar";
  return "Única";
}
// Analiza un libro de campaña: devuelve sus hojas con filas.
export function parseCampaignWorkbook(wb, fileName) {
  const sheets = [];
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name]; if (!ws) continue;
    const rows = sheetRows(ws); const t = findTable(rows); if (!t) continue;
    const data = tableRows(rows, t); if (!data.length) continue;
    const hidden = (wb.Workbook && wb.Workbook.Sheets || []).find((s) => s.name === name)?.Hidden;
    const sust = t.map.STATUS !== undefined || norm(name).includes("SUSTITU");
    let periodo = guessPeriod(name);
    if (sust && periodo !== "Ignorar") periodo = "Sustituciones";
    if (hidden && periodo !== "Sustituciones") periodo = "Ignorar";
    const perCol = mode(data.map((r) => r.periodo && String(r.periodo).trim()));
    if (perCol && periodo === "Única") periodo = ["Previa", "Durante", "Única"].find((p) => norm(p) === norm(perCol)) || periodo;
    const fechas = String(mode(data.map((r) => r.temp && String(r.temp).trim())) || "");
    if (periodo !== "Sustituciones" && periodo !== "Ignorar") {
      // Sustituciones escritas dentro del plan: filas marcadas "SUSTITUCIÓN" o sitios "afectada, se sustituye por…"
      const inline = [], keep = [];
      for (const r of data) {
        if (/SUSTITU/.test(norm(r.slide))) { inline.push({ ...r, status: "Sustitución (en el plan)", coment: "", hojaOrigen: name }); continue; }
        if (AFECTADA_RX.test(norm(r.ubic))) inline.push({ ...r, status: "", coment: "Marcado en el plan: " + String(r.ubic).trim(), hojaOrigen: name });
        keep.push(r);
      }
      if (inline.length) { sheets.push({ name, rows: keep, periodo, fechas, title: String(t.title || "") }); sheets.push({ name: name + " · sustituciones", rows: inline, periodo: "Sustituciones", fechas: "", title: "", inline: true }); continue; }
    }
    sheets.push({ name, rows: data, periodo, fechas, title: String(t.title || "") });
  }
  const title = (sheets.find((s) => s.title) || {}).title || "";
  let nombre = title.replace(/^.*?\|\s*/, "").replace(/^\s*ZETABE[\s_|-]*/i, "").replace(/_/g, " ").replace(/\s+/g, " ").trim();
  if (!nombre) nombre = fileName.replace(/\.[^.]+$/, "").replace(/[_]+/g, " ");
  return { sheets, nombre };
}

// ---------------------------------------------------------------- catálogo y matching
// sitios: Map(id -> {esp, sop, ub, det, ciudad, owner, lat, lon, alias:[]})
export function buildIndex(sitios) {
  const byKey = new Map();
  const add = (k, id) => { if (!k) return; if (!byKey.has(k)) byKey.set(k, new Set()); byKey.get(k).add(id); };
  for (const [id, s] of sitios) {
    add(key(id), id);
    add(key(s.ub), id);
    add(key(s.sop + " " + s.ub), id);
    add(key(s.sop + " " + s.ub + " " + (s.det || "")), id);
    add(key(s.sop + "-" + (s.det ? s.det + "-" : "") + s.ub), id);
    for (const a of s.alias || []) { add(key(a), id); add(key(stripCodes(a).name), id); }
  }
  return { byKey, sitios };
}
export const AFECTADA_RX = /\bAFECTAD[AO]S?\b|SE SUSTITUYE|SUSTITUID[AO]/;
const cutNotes = (s) => norm(s).split(AFECTADA_RX)[0].replace(/[,;\s]+$/, "");
const STOP = new Set(["AV", "AVE", "AVENIDA", "BLVD", "CALLE", "DE", "DEL", "LA", "EL", "LOS", "LAS", "Y", "E", "NO", "NUM", "CP", "COL", "COLONIA", "A", "EN", "JUNTO", "FTE", "FRENTE",
  "ZAPOPAN", "JALISCO", "JAL", "GUADALAJARA", "CDMX", "CIUDAD", "MEXICO", "MONTERREY", "NL", "NUEVO", "LEON", "EDOMEX"]);
const FACE = new Set(["I", "II", "III", "IV", "NORTE", "SUR", "ORIENTE", "PONIENTE", "VISTA", "CRUZADA", "NATURAL", "FRONTAL", "B"]);
function tokens(s) {
  return new Set(norm(stripCodes(cutNotes(s)).name).split(/[^A-Z0-9]+/).filter((t) => t && !STOP.has(t) && !/^\d{5}$/.test(t)));
}
function lev1(a, b) { // ¿difieren a lo más en una letra?
  if (a === b) return true; if (Math.abs(a.length - b.length) > 1 || Math.min(a.length, b.length) < 5) return false;
  let i = 0, j = 0, e = 0;
  while (i < a.length && j < b.length) { if (a[i] === b[j]) { i++; j++; continue; } if (++e > 1) return false; if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; } }
  return e + (a.length - i) + (b.length - j) <= 1;
}
const has = (set, t) => { if (set.has(t)) return true; for (const x of set) if (lev1(x, t)) return true; return false; };
// Qué tan contenido está el nombre más corto dentro del más largo (0 a 1) y si solo difieren en la cara.
function compare(a, b) {
  const [small, big] = a.size <= b.size ? [a, b] : [b, a];
  if (!small.size) return { c: 0, face: false, n: 0 };
  let hit = 0; for (const t of small) if (has(big, t)) hit++;
  const c = hit / small.size;
  const diff = [...a].filter((t) => !has(b, t)).concat([...b].filter((t) => !has(a, t)));
  return { c, n: small.size, face: diff.length > 0 && diff.every((t) => FACE.has(t)) };
}
function jaccard(a, b) { let i = 0; for (const t of a) if (has(b, t)) i++; return i / (a.size + b.size - i || 1); }

// Propone datos de un soporte nuevo a partir de una fila del Excel.
export function proposeSite(r) {
  const venue = normVenue(r.venue);
  let esp = norm(r.esp) || (venue === "CENTRO COMERCIAL" ? "CENTRO COMERCIAL" : venue === "AEROPUERTO" ? "AEROPUERTO" : "CALLE");
  let sop = venue, ub = norm(r.ubic), det = norm(r.det);
  const codes = [];
  if (esp === "CENTRO COMERCIAL" || esp === "AEROPUERTO") {
    if (venue === "CENTRO COMERCIAL" || venue === "AEROPUERTO" || !venue) {
      const parts = ub.split(/\s*-\s*/).filter(Boolean);
      if (parts.length >= 2) { sop = parts[0]; ub = parts[parts.length - 1]; det = det || parts.slice(1, -1).join(" - "); }
      else sop = "PANTALLA DIGITAL";
    }
  } else {
    const s = stripCodes(ub); ub = s.name; codes.push(...s.codes);
  }
  const lat = isFinite(r.lat) ? r.lat : null, lon = isFinite(r.lon) ? r.lon : null;
  let ciudad = norm(r.ciudad); if (ciudad === "EDOMEX") ciudad = "CDMX"; if (!ciudad) ciudad = cityFromCoords(lat);
  return { esp, sop: sop || "CARTELERA DIGITAL", ub, det, ciudad, owner: normOwner(r.owner), network: norm(r.network) || (esp === "CALLE" ? "OUTDOOR" : ""),
    idprov: [norm(r.idprov), ...codes].filter(Boolean).join(", "), medidas: r.medidas ? String(r.medidas).trim() : "", lat, lon, alias: [String(r.ubic).trim()] };
}

// Clasifica una fila: {tipo:'encontrado'|'dudoso'|'nuevo', id?, opciones:[{id, motivo}]}
export function matchRow(r, idx) {
  const { byKey, sitios } = idx;
  const own = normOwner(r.owner);
  if (r.id && sitios.has(norm(r.id))) return { tipo: "encontrado", id: norm(r.id), motivo: "ID" };
  const keys = [key(r.ubic), key(stripCodes(r.ubic).name), key(cutNotes(r.ubic)), key(stripCodes(cutNotes(r.ubic)).name)];
  if (r.venue && !["CENTRO COMERCIAL", "AEROPUERTO"].includes(normVenue(r.venue))) keys.push(key(r.venue + " " + r.ubic));
  let cands = new Set();
  for (const k of keys) for (const id of byKey.get(k) || []) cands.add(id);
  cands = [...cands];
  if (cands.length > 1 && own) { const f = cands.filter((id) => sitios.get(id).owner === own); if (f.length) cands = f; }
  if (cands.length > 1 && isFinite(r.lat)) {
    cands.sort((a, b) => dist(r, sitios.get(a)) - dist(r, sitios.get(b)));
  }
  if (cands.length === 1) {
    const s = sitios.get(cands[0]);
    if (!own || !s.owner || s.owner === own) return { tipo: "encontrado", id: cands[0], motivo: "Nombre" };
    return { tipo: "dudoso", id: cands[0], opciones: [{ id: cands[0], motivo: "Mismo nombre, otro owner (" + s.owner + ")" }] };
  }
  if (cands.length > 1) return { tipo: "dudoso", id: cands[0], opciones: cands.slice(0, 6).map((id) => ({ id, motivo: "Mismo nombre" })) };
  // sin coincidencia exacta: nombre parecido (sin acentos, comas, códigos postales ni "Zapopan, Jalisco"…),
  // tolerando una letra de diferencia (Contitucion/Constitucion), más cercanía y mismo owner
  const tk = tokens(r.ubic), ops = [];
  const city = norm(r.ciudad) === "EDOMEX" ? "CDMX" : norm(r.ciudad) || cityFromCoords(r.lat);
  for (const [id, s] of sitios) {
    if (city && s.ciudad && s.ciudad !== city) continue;
    const d = isFinite(r.lat) && s.lat != null ? haversine([r.lat, r.lon], [s.lat, s.lon]) : Infinity;
    let best = compare(tk, tokens(s.ub));
    for (const a of s.alias || []) { const x = compare(tk, tokens(a)); if (x.c > best.c || (x.c === best.c && x.n > best.n)) best = x; }
    const sim = Math.max(jaccard(tk, tokens(s.ub)), ...(s.alias || []).map((a) => jaccard(tk, tokens(a))));
    const sameOwner = !!own && s.owner === own;
    let score = 0; const why = [];
    if (best.c === 1 && (best.n >= 2 || d < 500)) { score += 3; why.push(best.face ? "posible otra cara" : "mismo nombre (escrito distinto)"); }
    else if (sim >= 0.5) { score += sim * 2; why.push(`nombre parecido (${Math.round(sim * 100)}%)`); }
    if (d < 80) { score += 2; why.push(`a ${Math.round(d)} m`); } else if (d < 400 && score) { score += 1; why.push(`a ${Math.round(d)} m`); }
    if (score && sameOwner) { score += 1; why.push("mismo owner"); }
    if (score >= 1.5) ops.push({ id, motivo: why.join(" · "), score, fuerte: best.c === 1 && !best.face && sameOwner, cara: best.face });
  }
  ops.sort((a, b) => b.score - a.score);
  if (ops.length) {
    const top = ops[0];
    // Muy parecido, mismo owner y sin otro candidato igual de bueno: se da por encontrado
    if (top.fuerte && (ops.length === 1 || ops[1].score < top.score)) return { tipo: "encontrado", id: top.id, motivo: "Parecido", opciones: ops.slice(0, 6) };
    const sugerido = !top.cara && top.score >= 4 && (!own || sitios.get(top.id).owner === own) ? top.id : null;
    return { tipo: "dudoso", id: sugerido, opciones: ops.slice(0, 6).map(({ id, motivo }) => ({ id, motivo })) };
  }
  return { tipo: "nuevo" };
}
function dist(r, s) { return s.lat != null ? haversine([r.lat, r.lon], [s.lat, s.lon]) : 1e9; }

// ---------------------------------------------------------------- inventario
const INV_FIELDS = { esp: "ESP", sop: "VENUE", ub: "UBIC", det: "DET", ciudad: "CIUDAD", network: "NETWORK", owner: "OWNER", idprov: "IDPROV", medidas: "MEDIDAS", lat: "LAT", lon: "LON" };
export const FIELD_LABEL = { esp: "Tipo de espacio", sop: "Venue type", ub: "Ubicación", det: "Detalle", ciudad: "Ciudad", network: "Network", owner: "Media owner", idprov: "ID proveedor", medidas: "Medidas", lat: "Lat", lon: "Long", alias: "Nombres originales", activo: "Activo" };
export function parseInventoryWorkbook(wb) {
  for (const name of wb.SheetNames) {
    const rows = sheetRows(wb.Sheets[name]); const t = findTable(rows);
    if (!t || (t.map.ID === undefined && t.map.ID_ANT === undefined)) continue;
    return { sheet: name, map: t.map, rows: tableRows(rows, t) };
  }
  return null;
}
// Compara el archivo contra el catálogo y propone acciones.
export function diffInventory(parsed, sitios) {
  const m = parsed.map, out = [], seen = new Map();
  for (const r of parsed.rows) {
    const id = norm(r.id), idAnt = norm(r.idAnt);
    const datos = {};
    for (const [f, col] of Object.entries(INV_FIELDS)) {
      if (m[col] === undefined) continue;
      let v = f === "lat" ? r.lat : f === "lon" ? r.lon : r[f === "sop" ? "venue" : f === "ub" ? "ubic" : f];
      if (f === "lat" || f === "lon") { if (!isFinite(v)) continue; v = Math.round(v * 1e6) / 1e6; }
      else { if (v === null || String(v).trim() === "") continue; v = f === "owner" ? normOwner(v) : f === "medidas" || f === "idprov" ? String(v).trim() : norm(v); }
      if (f === "ciudad" && v === "EDOMEX") v = "CDMX";
      datos[f] = v;
    }
    if (m.ALIAS !== undefined && r.alias) datos.alias = String(r.alias).split("||").map((a) => a.replace(/\(paquete de caras\)/i, "").trim()).filter(Boolean);
    if (m.ACTIVO !== undefined && r.activo !== null && String(r.activo).trim() !== "") datos.activo = !/^(NO|N|FALSE|0|INACTIVO)$/.test(norm(r.activo));
    const row = { fila: r.fila, id, idAnt, datos, cambios: {}, accion: "", error: "" };
    const target = id || idAnt;
    if (!target) {
      if (datos.ub && datos.ciudad) { row.accion = "nuevo"; row.id = ""; }
      else { row.accion = "error"; row.error = "Fila sin ID y sin ubicación o ciudad"; }
      out.push(row); continue;
    }
    if (seen.has(target)) { row.accion = "error"; row.error = `ID repetido (fila ${seen.get(target)})`; out.push(row); continue; }
    seen.set(target, r.fila);
    if (idAnt && id && idAnt !== id) {
      if (!sitios.has(idAnt)) { row.accion = "error"; row.error = `El ID anterior ${idAnt} no existe`; }
      else if (sitios.has(id)) { row.accion = "error"; row.error = `El ID nuevo ${id} ya existe`; }
      else { row.accion = "renombrar"; row.cambios = changes(sitios.get(idAnt), datos); }
    } else if (sitios.has(target)) {
      row.id = target; row.cambios = changes(sitios.get(target), datos);
      row.accion = Object.keys(row.cambios).length ? "actualizar" : "sin cambios";
    } else {
      row.id = target;
      const req = ["ub", "ciudad"].filter((f) => !datos[f]);
      if (req.length) { row.accion = "error"; row.error = "Soporte nuevo sin " + req.map((f) => FIELD_LABEL[f]).join(" ni "); }
      else row.accion = "nuevo";
    }
    out.push(row);
  }
  return out;
}
function changes(cur, datos) {
  const c = {};
  for (const [f, v] of Object.entries(datos)) {
    const a = cur[f];
    const same = f === "alias" ? JSON.stringify([...(a || [])].sort()) === JSON.stringify([...v].sort())
      : (f === "lat" || f === "lon") ? (a != null && Math.abs(a - v) < 1e-6) : String(a ?? "") === String(v ?? "");
    if (f === "alias") { const merged = [...new Set([...(a || []), ...v])]; if (merged.length !== (a || []).length) c.alias = [a || [], merged]; continue; }
    if (!same) c[f] = [a ?? "", v];
  }
  return c;
}

// ---------------------------------------------------------------- exportar
export function downloadXlsx(filename, sheets) {
  const wb = XLSX.utils.book_new();
  for (const [name, rows] of sheets) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), name.slice(0, 31));
  XLSX.writeFile(wb, filename);
}
