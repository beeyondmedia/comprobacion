// Estado compartido de la app y utilidades de interfaz.
export const ROLES = { consulta: "Consulta", verificador: "Verificador", aprobador: "Aprobador", admin: "Administrador" };
const RANK = { consulta: 1, verificador: 2, aprobador: 3, admin: 4 };
export const ESTATUS = ["Pendiente", "En revisión", "Con observaciones", "Comprobado"];
export const PER_CODE = { "Única": "U", "Previa": "P", "Durante": "D" };

export const S = {
  be: null, auth: null, perfil: null,
  users: new Map(), catalogo: new Map(), ciudadesDoc: new Set(),
  campanas: [], periodos: [], cargas: [],
  F: { camp: "", per: "", city: "", owner: "", esp: "", st: "", q: "", desde: "", hasta: "" },
  loaded: new Set(),
};
try { Object.assign(S.F, JSON.parse(localStorage.getItem("bym-filtros") || "{}")); } catch (e) {}
export const saveF = () => { try { localStorage.setItem("bym-filtros", JSON.stringify(S.F)); } catch (e) {} };

export const can = (r) => !!S.perfil && S.perfil.activo && RANK[S.perfil.rol] >= RANK[r];
export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => [...el.querySelectorAll(s)];
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const opt = (v, l, sel) => `<option value="${esc(v)}"${sel ? " selected" : ""}>${esc(l ?? v)}</option>`;
export const pct = (x) => (x * 100).toFixed(x > 0 && x < 0.1 ? 1 : 0) + "%";
export const fecha = (iso) => iso ? new Date(iso).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" }) : "";
export const fechaHora = (iso) => iso ? new Date(iso).toLocaleString("es-MX", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "";
export const nowIso = () => new Date().toISOString();
export const nombreDe = (uid) => { if (!uid) return ""; const u = S.users.get(uid); return u ? (u.nombre || u.email) : "—"; };
export const pillCls = (s) => "p-" + String(s).replace(/ /g, "-");

let tt;
export function toast(t) { const el = $("#toast"); el.textContent = t; el.hidden = false; clearTimeout(tt); tt = setTimeout(() => (el.hidden = true), 2600); }

// ---------- datos derivados
export function site(id) { return S.catalogo.get(id); }
// Orden alfabético (sin importar acentos ni mayúsculas; "C2" antes que "C10")
export const porNombre = (a, b) => String(a || "").localeCompare(String(b || ""), "es", { sensitivity: "base", numeric: true });
export function periodosActivos() {
  const camp = new Map(S.campanas.map((c) => [c.id, c]));
  return S.periodos.filter((p) => p.activo !== false && (camp.get(p.campanaId)?.activo !== false))
    .sort((a, b) => porNombre(a.campana, b.campana) || (a.orden || "").localeCompare(b.orden || "") || a.id.localeCompare(b.id));
}
export function allRows(periodos = periodosActivos()) {
  const out = [];
  for (const p of periodos) for (const sid of p.sitios || []) {
    const s = site(sid) || { id: sid, ub: sid + " (no está en el catálogo)", sop: "", det: "", ciudad: "", owner: "", esp: "" };
    out.push({ cid: p.id + "-" + sid, p, s: { id: sid, ...s }, st: (p.estado || {})[sid] || {} });
  }
  return out;
}
export const stOf = (r) => r.st.estatus || "Pendiente";

// ---------- fechas de los periodos
// Lee textos como "2 al 12 nov 2026", "17 de septiembre al 31 de octubre", "del 28 oct al 3 nov de 2026",
// "02/11/2026 - 12/11/2026". Sin año: se usa el año en que se creó el periodo. Devuelve {ini, fin} "AAAA-MM-DD" o null.
const MESES = { ENE: 1, FEB: 2, MAR: 3, ABR: 4, MAY: 5, JUN: 6, JUL: 7, AGO: 8, SEP: 9, SET: 9, OCT: 10, NOV: 11, DIC: 12 };
const iso = (y, m, d) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const okDate = (y, m, d) => { const t = new Date(Date.UTC(y, m - 1, d)); return t.getUTCMonth() === m - 1 && t.getUTCDate() === d; };
export function parseFechas(txt, refYear = new Date().getFullYear()) {
  const t = fold(txt).replace(/\bDE\b|\bDEL\b/g, " ").replace(/\s+/g, " ").trim();
  if (!t) return null;
  // numéricas: 02/11/2026 - 12/11/2026, 2/11 al 12/11
  const num = [...t.matchAll(/\b(\d{1,2}) (\d{1,2})(?: (\d{2,4}))?\b/g)].filter((m) => +m[2] >= 1 && +m[2] <= 12);
  const conMes = /[A-Z]{3}/.test(t.replace(/\b(AL|A|Y|HASTA)\b/g, ""));
  let a = null, b = null;
  if (!conMes && num.length >= 2) {
    const y = (m) => (m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : null);
    a = { d: +num[0][1], m: +num[0][2], y: y(num[0]) }; b = { d: +num[1][1], m: +num[1][2], y: y(num[1]) };
  } else {
    // tokens: números (día o año) y meses en orden
    const tk = [];
    for (const w of t.split(" ")) {
      if (/^\d{4}$/.test(w)) tk.push({ y: +w });
      else if (/^\d{1,2}$/.test(w)) tk.push({ d: +w });
      else { const k = w.slice(0, 3); if (MESES[k] && (w.length === 3 || w.startsWith(k))) tk.push({ m: MESES[k] }); }
    }
    const days = [], months = [], years = [];
    tk.forEach((x, i) => { if (x.d) days.push(i); if (x.m) months.push(i); if (x.y) years.push(i); });
    if (!months.length) return null;
    if (!days.length) { // "Noviembre 2026": el mes completo
      const y = years.length ? tk[years[0]].y : refYear, m1 = tk[months[0]].m, m2 = tk[months[months.length - 1]].m, y2 = m2 < m1 ? y + 1 : y;
      return { ini: iso(y, m1, 1), fin: iso(y2, m2, new Date(Date.UTC(y2, m2, 0)).getUTCDate()) };
    }
    const d1 = tk[days[0]].d, d2 = days.length > 1 ? tk[days[1]].d : d1;
    // mes de cada día: el primer mes que aparece después de él (o el último disponible)
    const mesDe = (pos) => { const after = months.find((i) => i > pos); return tk[after ?? months[months.length - 1]].m; };
    const yrDe = (pos) => { const after = years.find((i) => i > pos); return after != null ? tk[after].y : null; };
    a = { d: d1, m: mesDe(days[0]), y: yrDe(days[0]) };
    b = { d: d2, m: mesDe(days.length > 1 ? days[1] : days[0]), y: yrDe(days.length > 1 ? days[1] : days[0]) };
  }
  if (!a.y && !b.y) { a.y = refYear; b.y = b.m < a.m ? refYear + 1 : refYear; }
  b.y = b.y || a.y;
  a.y = a.y || (a.m > b.m ? b.y - 1 : b.y);
  if (!okDate(a.y, a.m, a.d) || !okDate(b.y, b.m, b.d)) return null;
  let ini = iso(a.y, a.m, a.d), fin = iso(b.y, b.m, b.d);
  if (fin < ini) [ini, fin] = [fin, ini];
  return { ini, fin };
}
// Rango del periodo: las fechas capturadas con calendario mandan; si no, se lee el texto.
export function rangoPeriodo(p) {
  if (p.inicio && p.fin) return { ini: p.inicio, fin: p.fin, manual: true };
  const y = p.creado ? new Date(p.creado).getFullYear() : undefined;
  return parseFechas(p.fechas, y);
}
export const enRango = (p, desde, hasta) => {
  if (!desde && !hasta) return true;
  const r = rangoPeriodo(p); if (!r) return null; // sin fechas reconocibles
  return (!hasta || r.ini <= hasta) && (!desde || r.fin >= desde);
};
export const fechaCorta = (isoD) => isoD ? new Date(isoD + "T12:00:00").toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" }) : "";
// Búsqueda: sin importar acentos, mayúsculas, signos ni el orden de las palabras.
export const fold = (s) => String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();
export function matchQuery(q, ...fields) {
  const t = fold(q).split(" ").filter(Boolean); if (!t.length) return true;
  const h = " " + fold(fields.flat().join(" ")) + " ";
  return t.every((x) => h.includes(x));
}
export function filtered(rows, { noStatus = false } = {}) {
  const F = S.F;
  const fechaOk = new Map();
  const okP = (p) => { if (!fechaOk.has(p.id)) fechaOk.set(p.id, enRango(p, F.desde, F.hasta) === true); return fechaOk.get(p.id); };
  return rows.filter((r) => (!F.camp || r.p.campana === F.camp) && (!F.per || r.p.periodo === F.per) && okP(r.p) &&
    (!F.city || r.s.ciudad === F.city) && (!F.owner || r.s.owner === F.owner) && (!F.esp || r.s.esp === F.esp) &&
    (noStatus || !F.st || stOf(r) === F.st) &&
    matchQuery(F.q, r.s.ub, r.s.sop, r.s.det, r.s.id, r.s.owner, r.s.ciudad, r.s.idprov, r.s.alias || [], r.p.campana));
}
export function counts(rows) {
  const k = { total: rows.length, Comprobado: 0, "En revisión": 0, "Con observaciones": 0, Pendiente: 0 };
  for (const r of rows) k[stOf(r)]++;
  k.pct = k.total ? k.Comprobado / k.total : 0; return k;
}
export function stackBar(k) {
  const w = (n) => (k.total ? (n / k.total) * 100 : 0) + "%";
  return `<div class="bar" role="img" aria-label="${pct(k.pct)} comprobado"><span class="s-ok" style="width:${w(k.Comprobado)}"></span><span class="s-rev" style="width:${w(k["En revisión"])}"></span><span class="s-obs" style="width:${w(k["Con observaciones"])}"></span></div>`;
}
// Las tarjetas de resumen son atajos: llevan a Control filtrado por ese estatus.
export function summaryHTML(k, activeSt = null) {
  const card = (st, cls, label, n, main) => `<div class="kpi click${main ? " main" : ""}" role="button" tabindex="0" data-goto-st="${st}" aria-pressed="${activeSt === st}" title="${st ? "Ver solo: " + st : "Ver todos"}">
    <div class="lab ${cls}">${main ? "" : "● "}${label}</div><div class="n">${n}</div>${main ? `${stackBar(k)}<div class="note" style="margin-top:6px">${k.Comprobado} de ${k.total} comprobados</div>` : ""}</div>`;
  return card("", "", "Avance de comprobación", pct(k.pct), true) +
    card("Comprobado", "dot-ok", "Comprobados", k.Comprobado) + card("En revisión", "dot-rev", "En revisión", k["En revisión"]) +
    card("Con observaciones", "dot-obs", "Con observaciones", k["Con observaciones"]) + card("Pendiente", "dot-pen", "Pendientes", k.Pendiente);
}
export function nextSiteIds(ciudad, n, taken = new Set()) {
  let max = 0;
  for (const id of [...S.catalogo.keys(), ...taken]) {
    const m = id.match(new RegExp(`^BYM-${ciudad}-(\\d+)$`)); if (m) max = Math.max(max, +m[1]);
  }
  return Array.from({ length: n }, (_, i) => `BYM-${ciudad}-${String(max + 1 + i).padStart(4, "0")}`);
}
export function cleanSite(d) {
  const o = { esp: d.esp || "CALLE", sop: d.sop || "", ub: d.ub || "", det: d.det || "", ciudad: d.ciudad || "", network: d.network || "",
    owner: d.owner || "", idprov: d.idprov || "", medidas: d.medidas || "", lat: d.lat ?? null, lon: d.lon ?? null,
    alias: d.alias || [], activo: d.activo !== false };
  return o;
}
