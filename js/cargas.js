// Cargas por Excel: campañas e inventario, con revisión, aprobación e historial.
import { S, $, $$, esc, opt, fechaHora, nowIso, nombreDe, pillCls, toast, can, PER_CODE, nextSiteIds, cleanSite } from "./core.js";
import { readWorkbook, parseCampaignWorkbook, buildIndex, matchRow, proposeSite, parseInventoryWorkbook, diffInventory,
  FIELD_LABEL, norm, key, normOwner, downloadXlsx } from "./excel.js";
import { inventarioRows } from "./views.js";

const plain = (o) => JSON.parse(JSON.stringify(o));
const siteLabel = (id) => { const s = S.catalogo.get(id); return s ? `${id} · ${s.ub}${s.det ? " · " + s.det : ""} · ${s.sop} · ${s.owner}` : id + " (no existe)"; };
const NEG = /NO DISPONIBLE|FALLA|NO ACEPT|MINIMO|MÍNIMO|CANCEL|BAJA|NO SE/;
const ESPACIOS = ["CALLE", "CENTRO COMERCIAL", "AEROPUERTO"];

function fileDrop(id, label, onFile) {
  setTimeout(() => {
    const box = $("#" + id), inp = $("#" + id + "-in");
    inp.onchange = () => inp.files[0] && onFile(inp.files[0]);
    box.ondragover = (e) => { e.preventDefault(); box.classList.add("over"); };
    box.ondragleave = () => box.classList.remove("over");
    box.ondrop = (e) => { e.preventDefault(); box.classList.remove("over"); const f = e.dataTransfer.files[0]; if (f) onFile(f); };
  });
  return `<div class="drop" id="${id}"><b>${label}</b><span class="note">Arrastra el archivo aquí o</span><label class="btn primary">Elegir archivo<input type="file" id="${id}-in" accept=".xlsx,.xls,.xlsm,.csv" hidden></label></div>`;
}
const steps = (list, on) => `<div class="steps">${list.map((s, i) => `<span class="${i === on ? "on" : ""}">${i + 1}. ${s}</span>`).join("")}</div>`;

// ================================================================ CAMPAÑA: subir
export function viewCargaCampana(main) {
  if (!can("verificador")) { main.innerHTML = `<div class="pagehead"><h1>Nueva campaña</h1></div><div class="msg warn">Tu rol solo permite consultar.</div>`; return; }
  let parsed = null, fileName = "";
  const STEPS = ["Archivo", "Periodos", "Revisión", "Enviada"];
  const step1 = () => {
    main.innerHTML = `<div class="pagehead"><h1>Nueva campaña</h1><button class="btn" type="button" id="tpl">Descargar plantilla</button></div>${steps(STEPS, 0)}
    <div class="stack">${fileDrop("fdrop", "Sube el Excel de la campaña", onFile)}
    <div class="panel note">Acepta el plan tal como lo arman (pestañas con UBICACIÓN, VENUE TYPE, MEDIA OWNER, LAT y LONG) o la plantilla. Un archivo es una campaña; cada periodo va en su propia pestaña (por ejemplo PREVIA y DURANTE). Si trae una pestaña de SUSTITUCIONES, te preguntaré qué hacer con cada sitio. Nada se carga hasta que un aprobador lo autorice.</div></div>`;
    $("#tpl").onclick = () => downloadXlsx("Plantilla_campana_Beeyond.xlsx", [
      ["Previa", [{ "ID SOPORTE": "BYM-CDMX-0001", "UBICACIÓN": "", "VENUE TYPE": "", "MEDIA OWNER": "", "CIUDAD": "", "LAT": "", "LONG": "", "TEMPORALIDAD": "2 al 12 nov 2026" },
        { "ID SOPORTE": "", "UBICACIÓN": "TOTEM-REFORMA 222", "VENUE TYPE": "CENTRO COMERCIAL", "MEDIA OWNER": "REACHME", "CIUDAD": "CDMX", "LAT": 19.4289, "LONG": -99.1642, "TEMPORALIDAD": "2 al 12 nov 2026" }]],
      ["Durante", [{ "ID SOPORTE": "BYM-CDMX-0001", "UBICACIÓN": "", "VENUE TYPE": "", "MEDIA OWNER": "", "CIUDAD": "", "LAT": "", "LONG": "", "TEMPORALIDAD": "13 al 17 nov 2026" }]],
      ["Sustituciones", [{ "STATUS": "Sustitución 1", "COMENTARIO": "", "ID SOPORTE": "", "UBICACIÓN": "PANTALLA 360-FASHION DRIVE", "MEDIA OWNER": "DIAFI" },
        { "STATUS": "", "COMENTARIO": "No disponible", "ID SOPORTE": "BYM-CDMX-0001", "UBICACIÓN": "", "MEDIA OWNER": "" }]],
      ["Instrucciones", [{ "Cómo llenarla": "Una pestaña por periodo (Previa, Durante o Única). Pon el ID SOPORTE si lo conoces; si no, llena UBICACIÓN, VENUE TYPE, MEDIA OWNER, CIUDAD y coordenadas para que la app lo busque o lo dé de alta." },
        { "Cómo llenarla": "Sustituciones: COMENTARIO con el motivo (No disponible, Fallas técnicas…) para quitar un sitio; STATUS (Sustitución 1, Live…) para agregar el sitio que lo reemplaza." },
        { "Cómo llenarla": "Borra las filas de ejemplo antes de subirla." }]],
    ]);
  };
  async function onFile(f) {
    fileName = f.name;
    try { parsed = parseCampaignWorkbook(await readWorkbook(f), f.name); }
    catch (e) { console.error(e); toast("No pude leer ese archivo. ¿Es un Excel válido?"); return; }
    if (!parsed.sheets.length) { toast("No encontré pestañas con una columna UBICACIÓN o ID SOPORTE."); return; }
    step2();
  }
  const step2 = () => {
    const camps = S.campanas.map((c) => c.nombre);
    main.innerHTML = `<div class="pagehead"><h1>Nueva campaña</h1></div>${steps(STEPS, 1)}
    <div class="stack"><div class="panel stack"><div class="note">Archivo: <b>${esc(fileName)}</b></div>
      <div class="grid2f"><label class="field"><span>Nombre de la campaña</span><input type="text" id="cName" list="cNames" value="${esc(parsed.nombre)}"></label>
      <label class="field"><span>Cliente</span><input type="text" id="cClient" placeholder="Mercado Libre"></label></div><datalist id="cNames">${camps.map((c) => `<option value="${esc(c)}">`).join("")}</datalist>
      <div id="cExists"></div></div>
    <div class="tablebox"><table><thead><tr><th>Pestaña</th><th>Filas</th><th>Usar como</th><th>Fechas</th></tr></thead><tbody>
    ${parsed.sheets.map((s, i) => `<tr><td><b>${esc(s.name)}</b></td><td class="num">${s.rows.length}</td>
      <td><select data-i="${i}" class="sp">${["Previa", "Durante", "Única", "Sustituciones", "Ignorar"].map((p) => opt(p, p === "Ignorar" ? "No usar" : p, s.periodo === p)).join("")}</select></td>
      <td><input type="text" data-f="${i}" value="${esc(s.fechas)}" placeholder="2 al 12 nov 2026"></td></tr>`).join("")}
    </tbody></table></div><p class="note">Si hay varias versiones del mismo plan en el archivo, deja solo la final y marca las demás como "No usar".</p>
    <div class="row"><button class="btn" type="button" id="back">Cambiar archivo</button><button class="btn primary" type="button" id="go">Buscar coincidencias</button></div></div>`;
    const chk = () => { const c = S.campanas.find((x) => key(x.nombre) === key($("#cName").value)); $("#cExists").innerHTML = c ? `<div class="msg warn">Ya existe la campaña "${esc(c.nombre)}". Los periodos que subas se agregarán; si un periodo ya existe, su lista de soportes se reemplazará y se conservan las comprobaciones de los soportes que sigan.</div>` : ""; if (c && !$("#cClient").value) $("#cClient").value = c.cliente || ""; };
    $("#cName").oninput = chk; chk();
    $("#back").onclick = step1;
    $("#go").onclick = () => {
      $$(".sp").forEach((el) => (parsed.sheets[+el.dataset.i].periodo = el.value));
      $$("[data-f]").forEach((el) => (parsed.sheets[+el.dataset.f].fechas = el.value.trim()));
      const per = parsed.sheets.filter((s) => !["Sustituciones", "Ignorar"].includes(s.periodo));
      const names = per.map((s) => s.periodo);
      if (!$("#cName").value.trim()) { toast("Escribe el nombre de la campaña"); return; }
      if (!per.length) { toast("Marca al menos una pestaña como periodo"); return; }
      if (new Set(names).size !== names.length) { toast("Hay dos pestañas con el mismo periodo. Deja solo una."); return; }
      const draft = buildCampaignDraft(parsed, $("#cName").value.trim(), $("#cClient").value.trim(), fileName);
      step3(draft);
    };
  };
  const step3 = (draft) => {
    main.innerHTML = `<div class="pagehead"><h1>Nueva campaña</h1></div>${steps(STEPS, 2)}<div id="rev"></div>
    <div class="row" style="margin-top:14px"><button class="btn" type="button" id="back2">Regresar</button><button class="btn primary" type="button" id="send">Enviar a aprobación</button></div>`;
    renderCampaignReview($("#rev"), draft, true);
    $("#back2").onclick = step2;
    $("#send").onclick = async () => {
      readCampaignReview($("#rev"), draft);
      const id = "K" + Date.now().toString(36).toUpperCase();
      $("#send").disabled = true;
      try {
        await S.be.batch([{ op: "set", path: "cargas/" + id, data: plain({ ...draft, estado: "pendiente", subidoPor: S.auth.uid, subido: nowIso() }) }]);
        main.innerHTML = `<div class="pagehead"><h1>Nueva campaña</h1></div>${steps(STEPS, 3)}<div class="msg ok">Enviada a aprobación. Un aprobador la verá en Historial de cargas.</div>
        <div class="row" style="margin-top:12px"><a class="btn primary" href="#cargas" data-open="${id}">Ver la carga</a><button class="btn" type="button" id="again">Subir otra</button></div>`;
        $("#again").onclick = step1;
        $("[data-open]").onclick = () => { pendingOpen = id; };
      } catch (e) { console.error(e); $("#send").disabled = false; toast("No se pudo enviar. Intenta de nuevo."); }
    };
  };
  step1();
}

function buildCampaignDraft(parsed, nombre, cliente, archivo) {
  const idx = buildIndex(S.catalogo);
  const mkRow = (r) => {
    const m = matchRow(r, idx);
    const row = { fila: r.fila, ubic: r.ubic || norm(r.id), owner: r.owner ? String(r.owner) : "", venue: r.venue ? String(r.venue) : "",
      match: m.tipo, opciones: m.opciones || (m.id ? [{ id: m.id, motivo: m.motivo || "" }] : []), id: m.id || "", dec: "", nuevo: null };
    row.dec = m.tipo === "nuevo" ? "nuevo" : m.id ? "id" : "nuevo";
    if (row.dec === "nuevo" || m.tipo === "dudoso") row.nuevo = proposeSite(r);
    return row;
  };
  const periodos = parsed.sheets.filter((s) => !["Sustituciones", "Ignorar"].includes(s.periodo))
    .map((s) => ({ periodo: s.periodo, fechas: s.fechas, hoja: s.name, filas: s.rows.map(mkRow) }));
  const sustituciones = [];
  for (const s of parsed.sheets.filter((x) => x.periodo === "Sustituciones")) for (const r of s.rows) {
    const row = mkRow(r); row.hoja = s.name;
    row.status = r.status ? String(r.status) : ""; row.coment = r.coment ? String(r.coment) : "";
    const neg = !!row.coment || NEG.test(norm(row.status));
    const pi = r.hojaOrigen ? periodos.findIndex((p) => p.hoja === r.hojaOrigen) : -1;
    if (neg) {
      row.accion = "quitar";
      const where = periodos.findIndex((p) => p.filas.some((f) => f.dec === "id" && f.id === row.id));
      row.perDest = pi >= 0 ? String(pi) : "todos";
      if (where < 0 && row.dec === "id") row.nota = "Este sitio no aparece en los periodos del archivo.";
    } else if (row.status) { row.accion = "agregar"; row.perDest = pi >= 0 ? String(pi) : "0"; }
    else { row.accion = "ignorar"; row.perDest = "todos"; }
    if (row.accion === "quitar" && row.dec === "nuevo") row.dec = "omitir";
    sustituciones.push(row);
  }
  return { tipo: "campana", archivo, campana: { nombre, cliente }, periodos, sustituciones };
}

// ---------- revisión (se usa al subir y al aprobar)
function decisionCell(r, prefix, editable) {
  const opts = [];
  const ids = new Set();
  for (const o of r.opciones || []) { if (!S.catalogo.has(o.id) || ids.has(o.id)) continue; ids.add(o.id); opts.push(opt("id:" + o.id, siteLabel(o.id) + (o.motivo ? ` (${o.motivo})` : ""), r.dec === "id" && r.id === o.id)); }
  if (r.dec === "id" && r.id && !ids.has(r.id)) opts.unshift(opt("id:" + r.id, siteLabel(r.id), true));
  opts.push(opt("otro", "Asignar otro ID…", false), opt("nuevo", "Dar de alta como soporte nuevo", r.dec === "nuevo"), opt("omitir", "Omitir esta fila", r.dec === "omitir"));
  const n = r.nuevo || {};
  if (!editable) {
    if (r.dec === "id") return `<span class="mono">${esc(r.id)}</span><span class="sub">${esc(siteLabel(r.id).split(" · ").slice(1).join(" · "))}</span>`;
    if (r.dec === "omitir") return `<span class="pill p-omitir">Se omite</span>`;
    return `<span class="pill p-nuevo">Alta nueva</span><span class="sub">${esc(n.esp)} · ${esc(n.sop)} · ${esc(n.ub)}${n.det ? " · " + esc(n.det) : ""} · ${esc(n.ciudad)} · ${esc(n.owner)}</span>`;
  }
  return `<select data-dec="${prefix}" style="max-width:100%">${opts.join("")}</select>
    <input type="text" data-otro="${prefix}" placeholder="BYM-CDMX-0000" ${r.dec === "otro" ? "" : "hidden"} style="margin-top:4px">
    <div class="newsite" data-new="${prefix}" ${r.dec === "nuevo" ? "" : "hidden"}>
      <select data-nf="esp">${ESPACIOS.map((e) => opt(e, e, (n.esp || "CALLE") === e)).join("")}</select>
      <input data-nf="sop" value="${esc(n.sop || "")}" placeholder="Venue type" aria-label="Venue type">
      <input data-nf="ub" value="${esc(n.ub || "")}" placeholder="Ubicación" aria-label="Ubicación">
      <input data-nf="det" value="${esc(n.det || "")}" placeholder="Detalle" aria-label="Detalle">
      <input data-nf="ciudad" value="${esc(n.ciudad || "")}" placeholder="Ciudad" aria-label="Ciudad">
      <input data-nf="owner" value="${esc(n.owner || "")}" placeholder="Media owner" aria-label="Media owner">
    </div>`;
}
const matchPill = (r) => `<span class="pill ${pillCls(r.match)}">${{ encontrado: "Encontrado", dudoso: "Dudoso", nuevo: "No existe" }[r.match]}</span>`;
function countDec(filas) {
  const c = { encontrado: 0, dudoso: 0, nuevo: 0, altas: 0, omitidas: 0 };
  for (const f of filas) { c[f.match]++; if (f.dec === "nuevo") c.altas++; if (f.dec === "omitir") c.omitidas++; }
  return c;
}
export function renderCampaignReview(el, d, editable) {
  const pers = d.periodos;
  el.innerHTML = `<div class="stack">
    <div class="panel"><div class="row" style="justify-content:space-between"><div><h3 style="margin:0">${esc(d.campana.nombre)}</h3><span class="note">${esc(d.campana.cliente || "Sin cliente")} · ${esc(d.archivo || "")}</span></div>
    <div class="counts">${pers.map((p) => `<span class="pill p-Pendiente">${esc(p.periodo)}: ${p.filas.filter((f) => f.dec !== "omitir").length} soportes</span>`).join("")}</div></div>
    ${editable ? `<p class="note" style="margin:10px 0 0">Revisa sobre todo los <b>dudosos</b> y los que <b>no existen</b>: elige el soporte correcto, dalo de alta como nuevo u omite la fila.</p>` : ""}</div>
    ${pers.map((p, pi) => { const c = countDec(p.filas); return `<details class="sec" ${c.dudoso || c.nuevo ? "open" : ""}><summary>${esc(p.periodo)}${p.fechas ? " · " + esc(p.fechas) : ""} <span class="note">pestaña ${esc(p.hoja)}</span>
      <span class="pill p-encontrado">${c.encontrado} encontrados</span><span class="pill p-dudoso">${c.dudoso} dudosos</span><span class="pill p-nuevo">${c.nuevo} no existen</span>${c.omitidas ? `<span class="pill p-omitir">${c.omitidas} omitidas</span>` : ""}</summary>
      <div class="in"><div class="tablebox"><table><thead><tr><th>Fila</th><th>En el Excel</th><th>Resultado</th><th style="min-width:320px">Soporte</th></tr></thead><tbody>
      ${p.filas.map((r, ri) => `<tr${r.match === "encontrado" && editable ? ' data-ok="1"' : ""}><td class="mono">${r.fila}</td><td class="ub">${esc(r.ubic)}<small>${esc(r.venue)} · ${esc(r.owner)}</small></td><td>${matchPill(r)}</td><td>${decisionCell(r, `p${pi}r${ri}`, editable)}</td></tr>`).join("")}
      </tbody></table></div></div></details>`; }).join("")}
    ${d.sustituciones.length ? `<details class="sec" open><summary>Sustituciones <span class="pill p-dudoso">${d.sustituciones.length} filas</span></summary><div class="in">
      <p class="note">Los sitios con motivo (No disponible, Fallas técnicas…) se proponen para <b>quitar</b>; los que tienen estatus (Sustitución, Live, Bonificación) se proponen para <b>agregar</b>. Cambia lo que no corresponda.</p>
      <div class="tablebox"><table><thead><tr><th>Fila</th><th>En el Excel</th><th>Estatus / motivo</th><th>Qué hacer</th><th style="min-width:300px">Soporte</th></tr></thead><tbody>
      ${d.sustituciones.map((r, si) => `<tr><td class="mono">${r.fila}</td><td class="ub">${esc(r.ubic)}<small>${esc(r.owner)}</small></td><td>${esc(r.status)}${r.coment ? `<span class="sub">${esc(r.coment)}</span>` : ""}${r.nota ? `<span class="sub dot-rev">${esc(r.nota)}</span>` : ""}</td>
        <td>${editable ? `<select data-acc="${si}">${opt("quitar", "Quitar del periodo", r.accion === "quitar")}${opt("agregar", "Agregar al periodo", r.accion === "agregar")}${opt("ignorar", "Ignorar", r.accion === "ignorar")}</select>
          <select data-pd="${si}" ${r.accion === "ignorar" ? "hidden" : ""}>${r.accion === "quitar" ? opt("todos", "Todos los periodos", r.perDest === "todos") : ""}${pers.map((p, i) => opt(String(i), p.periodo, r.perDest === String(i))).join("")}</select>`
          : `<b>${{ quitar: "Quitar", agregar: "Agregar", ignorar: "Ignorar" }[r.accion]}</b>${r.accion !== "ignorar" ? `<span class="sub">${r.perDest === "todos" ? "Todos los periodos" : esc(pers[+r.perDest]?.periodo || "")}</span>` : ""}`}</td>
        <td>${decisionCell(r, `s${si}`, editable)}</td></tr>`).join("")}
      </tbody></table></div></div></details>` : ""}
  </div>`;
  if (!editable) return;
  el.onchange = (e) => {
    const sel = e.target.closest("[data-dec]");
    if (sel) {
      const p = sel.dataset.dec; $(`[data-otro="${p}"]`, el).hidden = sel.value !== "otro"; $(`[data-new="${p}"]`, el).hidden = sel.value !== "nuevo";
    }
    const acc = e.target.closest("[data-acc]");
    if (acc) {
      const pd = $(`[data-pd="${acc.dataset.acc}"]`, el); pd.hidden = acc.value === "ignorar";
      const hasTodos = [...pd.options].some((o) => o.value === "todos");
      if (acc.value === "quitar" && !hasTodos) pd.insertAdjacentHTML("afterbegin", opt("todos", "Todos los periodos", true));
      if (acc.value === "agregar" && hasTodos) { pd.querySelector('option[value="todos"]').remove(); pd.value = "0"; }
    }
  };
}
// Lee lo que el usuario cambió en la revisión y lo guarda en el borrador.
export function readCampaignReview(el, d) {
  const read = (r, p) => {
    const sel = $(`[data-dec="${p}"]`, el); if (!sel) return;
    const v = sel.value;
    if (v.startsWith("id:")) { r.dec = "id"; r.id = v.slice(3); }
    else if (v === "otro") { const t = norm($(`[data-otro="${p}"]`, el).value); r.dec = t ? "id" : "omitir"; r.id = t; }
    else r.dec = v;
    if (r.dec === "nuevo") {
      const n = r.nuevo || {};
      $$(`[data-new="${p}"] [data-nf]`, el).forEach((i) => { const f = i.dataset.nf; n[f] = f === "owner" ? normOwner(i.value) : norm(i.value); });
      r.nuevo = n;
    }
  };
  d.periodos.forEach((p, pi) => p.filas.forEach((r, ri) => read(r, `p${pi}r${ri}`)));
  d.sustituciones.forEach((r, si) => {
    read(r, `s${si}`);
    const a = $(`[data-acc="${si}"]`, el); if (a) r.accion = a.value;
    const pd = $(`[data-pd="${si}"]`, el); if (pd) r.perDest = pd.value;
  });
}
function validateCampaign(d) {
  const errs = [];
  const check = (r, where) => {
    if (r.dec === "id" && !S.catalogo.has(r.id)) errs.push(`${where} fila ${r.fila}: el ID ${r.id || "(vacío)"} no existe en el inventario`);
    if (r.dec === "nuevo" && (!r.nuevo || !r.nuevo.ub || !r.nuevo.ciudad)) errs.push(`${where} fila ${r.fila}: al soporte nuevo le falta ubicación o ciudad`);
  };
  d.periodos.forEach((p) => p.filas.forEach((r) => check(r, p.periodo)));
  d.sustituciones.forEach((r) => r.accion !== "ignorar" && check(r, "Sustituciones"));
  return errs;
}

// ---------- aplicar una carga de campaña aprobada
function catalogOps(sitesByCity) {
  // sitesByCity: Map(ciudad -> Map(id -> sitio completo)) ; null value = borrar
  const ops = [];
  for (const [city, m] of sitesByCity) {
    if (!m.size) continue;
    if (S.ciudadesDoc.has(city)) ops.push({ op: "update", path: "catalogo/" + city, fields: [...m].map(([id, v]) => [["sitios", id], v === null ? S.be.DEL : v]) });
    else ops.push({ op: "set", path: "catalogo/" + city, data: { sitios: Object.fromEntries([...m].filter(([, v]) => v !== null)) } });
  }
  return ops;
}
function addTo(map, city, id, v) { if (!map.has(city)) map.set(city, new Map()); map.get(city).set(id, v); }

async function applyCampaign(c, cargaId) {
  const d = c; const newKey = (n) => [n.esp, n.sop, n.ub, n.det, n.ciudad, n.owner].map(key).join("|");
  const newIds = new Map(); const taken = new Set(); const catalog = new Map();
  const resolve = (r) => {
    if (r.dec === "id") return r.id;
    if (r.dec !== "nuevo") return null;
    const k = newKey(r.nuevo);
    if (!newIds.has(k)) {
      const city = r.nuevo.ciudad;
      const [id] = nextSiteIds(city, 1, taken); taken.add(id); newIds.set(k, id);
      addTo(catalog, city, id, cleanSite({ ...r.nuevo, alias: [r.ubic] }));
    }
    return newIds.get(k);
  };
  // alias: guarda el nombre del Excel en los soportes encontrados para reconocerlo la próxima vez
  const addAlias = (r, id) => {
    if (r.dec !== "id" || !r.ubic) return; const s = S.catalogo.get(id); if (!s) return;
    const cur = (catalog.get(s.ciudad) && catalog.get(s.ciudad).get(id)) || s;
    if ((cur.alias || []).some((a) => key(a) === key(r.ubic)) || key(r.ubic) === key(id)) return;
    const full = cleanSite({ ...cur, alias: [...(cur.alias || []), r.ubic] });
    addTo(catalog, s.ciudad, id, full);
  };
  const sets = d.periodos.map((p) => { const set = []; for (const r of p.filas) { const id = resolve(r); if (id) { addAlias(r, id); if (!set.includes(id)) set.push(id); } } return set; });
  let quitados = 0, agregados = 0;
  for (const r of d.sustituciones) {
    if (r.accion === "ignorar") continue;
    const id = resolve(r); if (!id) continue;
    const targets = r.perDest === "todos" ? sets.map((_, i) => i) : [+r.perDest];
    for (const t of targets) {
      const set = sets[t]; if (!set) continue;
      if (r.accion === "quitar" && set.includes(id)) { set.splice(set.indexOf(id), 1); quitados++; }
      if (r.accion === "agregar" && !set.includes(id)) { addAlias(r, id); set.push(id); agregados++; }
    }
  }
  // campaña
  let camp = S.campanas.find((x) => key(x.nombre) === key(d.campana.nombre));
  const ops = [];
  let campId;
  if (camp) campId = camp.id;
  else {
    const max = Math.max(0, ...S.campanas.map((x) => parseInt(String(x.id).replace(/\D/g, ""), 10) || 0));
    campId = "C" + String(max + 1).padStart(2, "0");
    ops.push({ op: "set", path: "campanas/" + campId, data: { nombre: d.campana.nombre, cliente: d.campana.cliente || "", activo: true, creado: nowIso(), creadoPor: S.auth.uid, carga: cargaId } });
  }
  const resumen = { periodos: [], altas: newIds.size, quitados, agregados };
  d.periodos.forEach((p, i) => {
    const code = PER_CODE[p.periodo] || key(p.periodo).slice(0, 6) || "X";
    const pid = `${campId}-${code}`;
    const exist = S.periodos.find((x) => x.id === pid);
    const orden = `${campId}-${{ P: 1, D: 2, U: 3 }[code] || 9}`;
    if (exist) ops.push({ op: "update", path: "periodos/" + pid, fields: [[["sitios"], sets[i]], [["fechas"], p.fechas || exist.fechas || ""], [["activo"], true], [["carga"], cargaId]] });
    else ops.push({ op: "set", path: "periodos/" + pid, data: { campanaId: campId, campana: camp ? camp.nombre : d.campana.nombre, periodo: p.periodo, fechas: p.fechas || "", sitios: sets[i], estado: {}, activo: true, orden, creado: nowIso(), carga: cargaId } });
    resumen.periodos.push({ id: pid, periodo: p.periodo, soportes: sets[i].length });
  });
  return { ops: [...catalogOps(catalog), ...ops], resumen };
}

// ================================================================ INVENTARIO: subir
export function viewCargaInventario(main) {
  if (!can("verificador")) { main.innerHTML = `<div class="pagehead"><h1>Carga de inventario</h1></div><div class="msg warn">Tu rol solo permite consultar.</div>`; return; }
  const STEPS = ["Archivo", "Revisión", "Enviada"];
  const step1 = () => {
    main.innerHTML = `<div class="pagehead"><h1>Carga de inventario</h1><button class="btn" type="button" id="tpl">Descargar inventario actual (plantilla)</button></div>${steps(STEPS, 0)}
    <div class="stack">${fileDrop("idrop", "Sube el Excel de inventario", onFile)}
    <div class="panel note">Usa el inventario actual como plantilla. La carga <b>agrega y actualiza</b>; nunca borra. Para cambiar un ID, pon el ID actual en <b>ID ANTERIOR</b> y el nuevo en <b>ID</b>: sus comprobaciones se trasladan al ID nuevo. Las celdas vacías no cambian nada. Para dar de baja un soporte, pon <b>No</b> en ACTIVO. Si un soporte nuevo no trae ID, se le asigna el siguiente de su ciudad.</div></div>`;
    $("#tpl").onclick = () => { const rows = inventarioRows(); downloadXlsx("Inventario_Beeyond_plantilla.xlsx", [["Inventario", rows.length ? rows : [{ "ID ANTERIOR": "", "ID": "", "TIPO DE ESPACIO": "", "VENUE TYPE": "", "UBICACIÓN": "", "DETALLE / POSICIÓN": "", "CIUDAD": "", "NETWORK": "", "MEDIA OWNER": "", "ID PROVEEDOR": "", "MEDIDAS": "", "LAT": "", "LONG": "", "ACTIVO": "", "NOMBRE(S) ORIGINAL(ES)": "" }]]]); };
  };
  async function onFile(f) {
    let p;
    try { p = parseInventoryWorkbook(await readWorkbook(f)); } catch (e) { toast("No pude leer ese archivo."); return; }
    if (!p) { toast("No encontré una pestaña con columnas ID y UBICACIÓN."); return; }
    const filas = diffInventory(p, S.catalogo);
    const draft = { tipo: "inventario", archivo: f.name, hoja: p.sheet, filas: filas.filter((r) => r.accion !== "sin cambios"), sinCambios: filas.filter((r) => r.accion === "sin cambios").length };
    main.innerHTML = `<div class="pagehead"><h1>Carga de inventario</h1></div>${steps(STEPS, 1)}<div id="rev"></div>
      <div class="row" style="margin-top:14px"><button class="btn" type="button" id="back">Cambiar archivo</button><button class="btn primary" type="button" id="send" ${draft.filas.some((r) => r.accion !== "error") ? "" : "disabled"}>Enviar a aprobación</button></div>`;
    renderInventoryReview($("#rev"), draft);
    $("#back").onclick = step1;
    $("#send").onclick = async () => {
      const id = "K" + Date.now().toString(36).toUpperCase(); $("#send").disabled = true;
      try {
        await S.be.batch([{ op: "set", path: "cargas/" + id, data: plain({ ...draft, filas: draft.filas.filter((r) => r.accion !== "error"), errores: draft.filas.filter((r) => r.accion === "error").length, estado: "pendiente", subidoPor: S.auth.uid, subido: nowIso() }) }]);
        main.innerHTML = `<div class="pagehead"><h1>Carga de inventario</h1></div>${steps(STEPS, 2)}<div class="msg ok">Enviada a aprobación${draft.filas.some((r) => r.accion === "error") ? " (las filas con error no se incluyeron)" : ""}.</div><div class="row" style="margin-top:12px"><a class="btn primary" href="#cargas" id="vl">Ver la carga</a></div>`;
        $("#vl").onclick = () => { pendingOpen = id; };
      } catch (e) { console.error(e); $("#send").disabled = false; toast("No se pudo enviar (¿archivo demasiado grande?). Divide el archivo en partes."); }
    };
  }
  step1();
}
export function renderInventoryReview(el, d) {
  const by = (a) => d.filas.filter((r) => r.accion === a);
  const val = (f, v) => f === "alias" ? (v || []).join(" || ") : f === "activo" ? (v === false ? "No" : "Sí") : v;
  const diffs = (r) => Object.entries(r.cambios || {}).map(([f, [a, b]]) => `<div class="diff"><b>${esc(FIELD_LABEL[f] || f)}:</b> <del>${esc(val(f, a)) || "(vacío)"}</del> → <ins>${esc(val(f, b))}</ins></div>`).join("") || `<span class="note">Sin otros cambios</span>`;
  const sec = (title, cls, rows, body) => rows.length ? `<details class="sec" ${cls === "p-error" || rows.length <= 50 ? "open" : ""}><summary>${title} <span class="pill ${cls}">${rows.length}</span></summary><div class="in"><div class="tablebox"><table>${body(rows)}</table></div></div></details>` : "";
  el.innerHTML = `<div class="stack"><div class="panel"><b>${esc(d.archivo)}</b> <span class="note">· pestaña ${esc(d.hoja || "")} · ${d.sinCambios || 0} soportes sin cambios${d.errores ? ` · ${d.errores} filas con error no incluidas` : ""}</span>
    <div class="counts" style="margin-top:8px"><span class="pill p-nuevo">${by("nuevo").length} nuevos</span><span class="pill p-actualizar">${by("actualizar").length} actualizados</span><span class="pill p-renombrar">${by("renombrar").length} cambios de ID</span>${by("error").length ? `<span class="pill p-error">${by("error").length} con error</span>` : ""}</div></div>
    ${sec("Con error (no se cargan)", "p-error", by("error"), (rs) => `<thead><tr><th>Fila</th><th>ID</th><th>Problema</th></tr></thead><tbody>${rs.map((r) => `<tr><td class="mono">${r.fila}</td><td class="mono">${esc(r.id || r.idAnt)}</td><td>${esc(r.error)}</td></tr>`).join("")}</tbody>`)}
    ${sec("Cambios de ID", "p-renombrar", by("renombrar"), (rs) => `<thead><tr><th>Fila</th><th>ID anterior → nuevo</th><th>Soporte</th><th>Otros cambios</th></tr></thead><tbody>${rs.map((r) => `<tr><td class="mono">${r.fila}</td><td class="mono">${esc(r.idAnt)} → <b>${esc(r.id)}</b></td><td class="ub">${esc(S.catalogo.get(r.idAnt)?.ub || "")}</td><td>${diffs(r)}</td></tr>`).join("")}</tbody>`)}
    ${sec("Soportes nuevos", "p-nuevo", by("nuevo"), (rs) => `<thead><tr><th>Fila</th><th>ID</th><th>Datos</th></tr></thead><tbody>${rs.map((r) => `<tr><td class="mono">${r.fila}</td><td class="mono">${esc(r.id || "(se asigna al aprobar)")}</td><td class="ub">${esc(r.datos.ub)}<small>${esc([r.datos.esp, r.datos.sop, r.datos.det, r.datos.ciudad, r.datos.owner].filter(Boolean).join(" · "))}</small></td></tr>`).join("")}</tbody>`)}
    ${sec("Soportes actualizados", "p-actualizar", by("actualizar"), (rs) => `<thead><tr><th>Fila</th><th>ID</th><th>Soporte</th><th>Cambios</th></tr></thead><tbody>${rs.map((r) => `<tr><td class="mono">${r.fila}</td><td class="mono">${esc(r.id)}</td><td class="ub">${esc(S.catalogo.get(r.id)?.ub || "")}</td><td>${diffs(r)}</td></tr>`).join("")}</tbody>`)}
  </div>`;
}
function applyInventory(d) {
  const catalog = new Map(); const ops = []; const taken = new Set();
  const current = (id) => { for (const m of catalog.values()) if (m.has(id) && m.get(id)) return m.get(id); return S.catalogo.get(id); };
  const res = { nuevos: 0, actualizados: 0, renombrados: 0, omitidos: 0 };
  const periodoFields = new Map();
  for (const r of d.filas) {
    if (r.accion === "nuevo") {
      let id = r.id;
      if (!id) { [id] = nextSiteIds(r.datos.ciudad, 1, taken); taken.add(id); }
      if (S.catalogo.has(id)) { res.omitidos++; continue; }
      taken.add(id);
      addTo(catalog, r.datos.ciudad, id, cleanSite(r.datos)); res.nuevos++;
    } else if (r.accion === "actualizar" || r.accion === "renombrar") {
      const oldId = r.accion === "renombrar" ? r.idAnt : r.id;
      const cur = current(oldId); if (!cur) { res.omitidos++; continue; }
      const next = cleanSite({ ...cur });
      for (const [f, [, v]] of Object.entries(r.cambios || {})) next[f] = v;
      if (r.accion === "renombrar") {
        next.alias = [...new Set([...(next.alias || []), oldId])];
        addTo(catalog, cur.ciudad, oldId, null);
        addTo(catalog, next.ciudad, r.id, next);
        for (const p of S.periodos) {
          if (!(p.sitios || []).includes(oldId)) continue;
          const f = periodoFields.get(p.id) || { sitios: [...p.sitios], est: [] };
          f.sitios = f.sitios.map((s) => (s === oldId ? r.id : s));
          if (p.estado && p.estado[oldId]) f.est.push([["estado", r.id], p.estado[oldId]], [["estado", oldId], S.be.DEL]);
          periodoFields.set(p.id, f);
        }
        res.renombrados++;
      } else {
        if (cur.ciudad !== next.ciudad) addTo(catalog, cur.ciudad, oldId, null);
        addTo(catalog, next.ciudad, oldId, next); res.actualizados++;
      }
    }
  }
  for (const [pid, f] of periodoFields) ops.push({ op: "update", path: "periodos/" + pid, fields: [[["sitios"], f.sitios], ...f.est] });
  return { ops: [...catalogOps(catalog), ...ops], resumen: res };
}

// ================================================================ HISTORIAL
let pendingOpen = null;
export function viewHistorial(main) {
  let openId = pendingOpen; pendingOpen = null;
  let draftEdit = null;
  const draw = () => {
    if (openId) return detail(openId);
    const list = [...S.cargas].sort((a, b) => (b.subido || "").localeCompare(a.subido || ""));
    main.innerHTML = `<div class="pagehead"><h1>Historial de cargas</h1>${can("verificador") ? `<a class="btn" href="#carga-inventario">Cargar inventario</a><a class="btn primary" href="#carga-campana">Subir campaña</a>` : ""}</div>
    <div class="tablebox"><table><thead><tr><th>Tipo</th><th>Archivo / campaña</th><th>Subió</th><th>Fecha</th><th>Estatus</th><th class="hide-sm">Revisó</th></tr></thead><tbody>
    ${list.map((c) => `<tr class="click" data-id="${esc(c.id)}"><td>${c.tipo === "campana" ? "Campaña" : "Inventario"}</td><td class="ub">${esc(c.tipo === "campana" ? c.campana?.nombre : c.archivo)}<small>${esc(c.archivo)}</small></td><td>${esc(nombreDe(c.subidoPor))}</td><td>${fechaHora(c.subido)}</td><td><span class="pill ${pillCls(c.estado)}">${esc(c.estado)}</span></td><td class="hide-sm">${esc(nombreDe(c.revisadoPor))}</td></tr>`).join("")}
    </tbody></table>${list.length ? "" : `<div class="empty">Todavía no hay cargas.</div>`}</div>`;
    main.onclick = (e) => { const tr = e.target.closest("tr[data-id]"); if (tr) { openId = tr.dataset.id; draftEdit = null; draw(); } };
  };
  const detail = (id) => {
    const c = S.cargas.find((x) => x.id === id);
    if (!c) { main.innerHTML = `<div class="empty">Cargando…</div>`; return; }
    const mine = c.subidoPor === S.auth.uid;
    const canApprove = c.estado === "pendiente" && can("aprobador") && (!mine || can("admin"));
    const editing = canApprove && c.tipo === "campana";
    if (editing && !draftEdit) draftEdit = plain(c);
    main.onclick = null;
    main.innerHTML = `<div class="pagehead"><h1>${c.tipo === "campana" ? "Carga de campaña" : "Carga de inventario"}</h1><button class="btn" type="button" id="backL">← Historial</button></div>
    <div class="panel stack"><dl class="meta"><dt>Estatus</dt><dd><span class="pill ${pillCls(c.estado)}">${esc(c.estado)}</span></dd><dt>Subió</dt><dd>${esc(nombreDe(c.subidoPor))} · ${fechaHora(c.subido)}</dd>
    ${c.revisadoPor ? `<dt>Revisó</dt><dd>${esc(nombreDe(c.revisadoPor))} · ${fechaHora(c.revisado)}</dd>` : ""}${c.nota ? `<dt>Nota</dt><dd>${esc(c.nota)}</dd>` : ""}
    ${c.resumen ? `<dt>Resultado</dt><dd>${esc(resumenTxt(c))}</dd>` : ""}</dl>
    ${c.estado === "pendiente" && !canApprove ? `<div class="msg warn">${mine && can("aprobador") ? "Esta carga la subiste tú: debe aprobarla otro aprobador o un administrador." : "Pendiente de aprobación."}</div>` : ""}</div>
    <div id="rev" style="margin-top:14px"></div>
    ${c.estado === "pendiente" ? `<div class="panel stack" style="margin-top:14px">${canApprove ? `<label class="field"><span>Nota (opcional, se guarda con la decisión)</span><input type="text" id="nota"></label>` : ""}
      <div class="row">${canApprove ? `<button class="btn ok" type="button" id="apr">Aprobar y cargar</button><button class="btn danger" type="button" id="rej">Rechazar</button>` : ""}${mine ? `<button class="btn" type="button" id="can">Cancelar mi carga</button>` : ""}</div><div id="amsg" hidden></div></div>` : ""}`;
    $("#backL").onclick = () => { openId = null; draftEdit = null; draw(); };
    if (c.tipo === "campana") renderCampaignReview($("#rev"), editing ? draftEdit : c, editing);
    else renderInventoryReview($("#rev"), c);
    const setState = async (estado, extra = {}) => S.be.batch([{ op: "update", path: "cargas/" + id, fields: Object.entries({ estado, revisadoPor: S.auth.uid, revisado: nowIso(), nota: $("#nota")?.value.trim() || "", ...extra }).map(([k, v]) => [[k], v]) }]);
    if ($("#rej")) $("#rej").onclick = async () => {
      if ($("#rej").dataset.c !== "1") { $("#rej").dataset.c = "1"; $("#rej").textContent = "Confirmar rechazo"; return; }
      try { await setState("rechazada"); toast("Carga rechazada"); } catch (e) { toast("No se pudo guardar"); }
    };
    if ($("#can")) $("#can").onclick = async () => {
      try { await S.be.batch([{ op: "update", path: "cargas/" + id, fields: [[["estado"], "cancelada"], [["revisado"], nowIso()], [["revisadoPor"], S.auth.uid]] }]); toast("Carga cancelada"); } catch (e) { toast("No se pudo cancelar"); }
    };
    if ($("#apr")) $("#apr").onclick = async () => {
      const m = $("#amsg"); m.hidden = false;
      let res;
      if (c.tipo === "campana") {
        readCampaignReview($("#rev"), draftEdit);
        const errs = validateCampaign(draftEdit);
        if (errs.length) { m.className = "msg err"; m.innerHTML = "Corrige antes de aprobar:<br>" + errs.slice(0, 10).map(esc).join("<br>"); return; }
        res = await applyCampaign(draftEdit, id);
        res.ops.push({ op: "update", path: "cargas/" + id, fields: [[["periodos"], plain(draftEdit.periodos)], [["sustituciones"], plain(draftEdit.sustituciones)]] });
      } else res = applyInventory(c);
      $("#apr").disabled = true; m.className = "msg warn"; m.textContent = "Cargando…";
      try {
        await S.be.batch(res.ops);
        await setState("aprobada", { resumen: plain(res.resumen) });
        draftEdit = null; toast("Carga aprobada y aplicada");
      } catch (e) { console.error(e); $("#apr").disabled = false; m.className = "msg err"; m.textContent = "No se pudo aplicar la carga: " + (e.message || e.code || "error"); }
    };
  };
  draw();
  return () => { if (openId && draftEdit && $("#rev")) { readCampaignReview($("#rev"), draftEdit); } draw(); };
}
function resumenTxt(c) {
  const r = c.resumen || {};
  if (c.tipo === "campana") return `${(r.periodos || []).map((p) => `${p.periodo}: ${p.soportes} soportes`).join(" · ")} · ${r.altas || 0} soportes nuevos en inventario · ${r.quitados || 0} quitados y ${r.agregados || 0} agregados por sustituciones`;
  return `${r.nuevos || 0} nuevos · ${r.actualizados || 0} actualizados · ${r.renombrados || 0} cambios de ID${r.omitidos ? ` · ${r.omitidos} omitidos` : ""}`;
}
export const pendingCount = () => S.cargas.filter((c) => c.estado === "pendiente").length;
