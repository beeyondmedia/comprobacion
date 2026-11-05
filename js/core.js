// Estado compartido de la app y utilidades de interfaz.
export const ROLES = { consulta: "Consulta", verificador: "Verificador", aprobador: "Aprobador", admin: "Administrador" };
const RANK = { consulta: 1, verificador: 2, aprobador: 3, admin: 4 };
export const ESTATUS = ["Pendiente", "En revisión", "Con observaciones", "Comprobado"];
export const PER_CODE = { "Única": "U", "Previa": "P", "Durante": "D" };

export const S = {
  be: null, auth: null, perfil: null,
  users: new Map(), catalogo: new Map(), ciudadesDoc: new Set(),
  campanas: [], periodos: [], cargas: [],
  F: { camp: "", per: "", city: "", owner: "", esp: "", st: "", q: "" },
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
// Búsqueda: sin importar acentos, mayúsculas, signos ni el orden de las palabras.
export const fold = (s) => String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();
export function matchQuery(q, ...fields) {
  const t = fold(q).split(" ").filter(Boolean); if (!t.length) return true;
  const h = " " + fold(fields.flat().join(" ")) + " ";
  return t.every((x) => h.includes(x));
}
export function filtered(rows, { noStatus = false } = {}) {
  const F = S.F;
  return rows.filter((r) => (!F.camp || r.p.campana === F.camp) && (!F.per || r.p.periodo === F.per) &&
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
