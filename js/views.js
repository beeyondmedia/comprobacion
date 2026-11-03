// Vistas de operación: Control, Avance, Campañas, Inventario y Usuarios.
import { S, $, $$, esc, opt, pct, fecha, nowIso, nombreDe, pillCls, toast, can, saveF, ESTATUS, ROLES,
  allRows, stOf, filtered, counts, stackBar, summaryHTML, periodosActivos, site, matchQuery, cleanSite } from "./core.js";
import { downloadXlsx } from "./excel.js";
import { DOMINIO } from "./config.js";

// ================================================================ filtros
export function filtersHTML({ status = true, exportBtn = true } = {}) {
  const per = periodosActivos();
  const camps = [...new Set(per.map((p) => p.campana))];
  const sites = [...S.catalogo.values()];
  const F = S.F;
  if (F.camp && !camps.includes(F.camp)) F.camp = "";
  return `<div class="toolbar" id="filters">
    <label>Campaña<select data-f="camp">${opt("", "Todas")}${camps.map((c) => opt(c, c, F.camp === c)).join("")}</select></label>
    <label>Periodo<div class="seg" data-seg="per">${[["", "Todos"], ["Previa", "Previa"], ["Durante", "Durante"], ["Única", "Única"]].map(([v, l]) => `<button type="button" data-v="${v}" aria-pressed="${F.per === v}">${l}</button>`).join("")}</div></label>
    <label class="hide-sm">Ciudad<select data-f="city">${opt("", "Todas")}${[...new Set(sites.map((s) => s.ciudad))].filter(Boolean).sort().map((c) => opt(c, c, F.city === c)).join("")}</select></label>
    <label>Media owner<select data-f="owner">${opt("", "Todos")}${[...new Set(sites.map((s) => s.owner))].filter(Boolean).sort().map((c) => opt(c, c, F.owner === c)).join("")}</select></label>
    <label class="hide-sm">Espacio<select data-f="esp">${opt("", "Todos")}${["CENTRO COMERCIAL", "AEROPUERTO", "CALLE"].map((c) => opt(c, c, F.esp === c)).join("")}</select></label>
    ${status ? `<label>Estatus<select data-f="st">${opt("", "Todos")}${ESTATUS.map((c) => opt(c, c, F.st === c)).join("")}</select></label>` : ""}
    <label class="grow">Buscar<input type="search" data-f="q" value="${esc(F.q)}" placeholder="Ubicación, soporte o ID"></label>
    ${Object.entries(F).some(([k, v]) => v && (status || k !== "st")) ? `<button class="btn" type="button" id="clearF">Quitar filtros</button>` : ""}
    ${exportBtn ? `<button class="btn" type="button" id="exportBtn">Exportar a Excel</button>` : ""}
  </div>`;
}
export function bindFilters(root, rerender) {
  $$("select[data-f]", root).forEach((el) => el.addEventListener("change", () => { S.F[el.dataset.f] = el.value; saveF(); rerender(); }));
  const q = $("input[data-f=q]", root);
  if (q) q.addEventListener("input", () => { S.F.q = q.value; saveF(); rerender(true); });
  $$("[data-seg=per] button", root).forEach((b) => b.addEventListener("click", () => { S.F.per = b.dataset.v; saveF(); rerender(); }));
  const cf = $("#clearF", root); if (cf) cf.addEventListener("click", () => { for (const k of Object.keys(S.F)) S.F[k] = ""; saveF(); rerender(); });
  const ex = $("#exportBtn", root); if (ex) ex.addEventListener("click", () => exportControl(!$("select[data-f=st]", root)));
}
function exportControl(noStatus = false) {
  const rows = filtered(allRows(), { noStatus }).map((r) => ({
    "ID COMPROBACIÓN": r.cid, "CAMPAÑA": r.p.campana, "PERIODO": r.p.periodo, "FECHAS": r.p.fechas || "", "ID SOPORTE": r.s.id,
    "TIPO DE ESPACIO": r.s.esp, "VENUE TYPE": r.s.sop, "UBICACIÓN": r.s.ub, "DETALLE / POSICIÓN": r.s.det, "CIUDAD": r.s.ciudad,
    "MEDIA OWNER": r.s.owner, "FOTOS (0-5)": fotosSel(r.st).filter(Boolean).length, "FOTOS MARCADAS": fotosSel(r.st).map((on, i) => (on ? i + 1 : null)).filter(Boolean).join(", "), "EN DRIVE": r.st.drive ? "Sí" : "No", "EN PPT": r.st.ppt ? "Sí" : "No",
    "ESTATUS": stOf(r), "VERIFICÓ": nombreDe(r.st.verificadoPor), "FECHA VERIFICACIÓN": fecha(r.st.fechaVerif),
    "LINK DRIVE": r.st.link || "", "COMENTARIOS": r.st.comentarios || "", "LAT": r.s.lat, "LONG": r.s.lon }));
  downloadXlsx(`Comprobacion_Beeyond_${new Date().toISOString().slice(0, 10)}.xlsx`, [["Comprobaciones", rows]]);
}

// ================================================================ ATAJOS
// Clic en un porcentaje, tarjeta o fila del resumen → Control con ese filtro.
export function goControl(patch) {
  Object.assign(S.F, { st: "" }, patch); saveF();
  if (location.hash === "#control") window.dispatchEvent(new HashChangeEvent("hashchange")); else location.hash = "control";
}
function bindShortcuts(root, onSame) {
  const act = (el) => {
    if (el.dataset.gotoSt !== undefined) {
      if (onSame) { S.F.st = S.F.st === el.dataset.gotoSt ? "" : el.dataset.gotoSt; saveF(); onSame(); }
      else goControl({ st: el.dataset.gotoSt });
    } else if (el.dataset.gotoCamp !== undefined) goControl({ camp: el.dataset.gotoCamp, per: el.dataset.gotoPer });
    else if (el.dataset.gotoKey) goControl({ [el.dataset.gotoKey]: el.dataset.gotoVal });
  };
  root.addEventListener("click", (e) => { const el = e.target.closest("[data-goto-st],[data-goto-camp],[data-goto-key]"); if (el && root.contains(el)) act(el); });
  root.addEventListener("keydown", (e) => { if (e.key !== "Enter" && e.key !== " ") return; const el = e.target.closest("[data-goto-st],[data-goto-camp],[data-goto-key]"); if (el) { e.preventDefault(); act(el); } });
}

// ================================================================ CONTROL
// Cada una de las 5 fotos se marca por separado (ángulos o vistas distintas).
export const fotosSel = (st) => Array.isArray(st.fotosSel) && st.fotosSel.length === 5 ? st.fotosSel.map(Boolean) : [1, 2, 3, 4, 5].map((n) => n <= (st.fotos || 0));
function toggleFoto(r, i) {
  const sel = fotosSel(r.st); sel[i] = !sel[i];
  const n = sel.filter(Boolean).length;
  writeEstado(r, { fotosSel: sel, fotos: n, ...(r.st.estatus ? {} : { estatus: "En revisión" }) }, `Foto ${i + 1} ${sel[i] ? "marcada" : "desmarcada"} · ${n} de 5`);
}
let shown = 150, openCid = null;
export function viewControl(main) {
  const draw = (keepFocus) => {
    const all = allRows();
    const rows = filtered(all);
    const write = can("verificador");
    if (!keepFocus) main.innerHTML = `<div class="pagehead"><h1>Control de comprobación</h1></div>${filtersHTML()}<div class="summary" id="summary"></div>
      <div class="tablebox"><table><thead><tr><th title="Comprobado">✔</th><th>Ubicación</th><th class="hide-sm">ID</th><th>Owner</th><th class="hide-sm">Ciudad</th><th>Campaña · periodo</th><th>Fotos</th><th class="hide-sm">Drive</th><th class="hide-sm">PPT</th><th>Estatus</th><th class="hide-sm">Verificó</th></tr></thead><tbody id="rows"></tbody></table>
      <div class="empty" id="noRows" hidden></div><div class="more" id="moreBox" hidden><button class="btn" id="moreBtn" type="button"></button></div></div>`;
    if (!keepFocus) { bindFilters(main, draw); bindShortcuts($("#summary"), () => { shown = 150; draw(); }); }
    $("#summary").innerHTML = summaryHTML(counts(filtered(all, { noStatus: true })), S.F.st);
    $("#rows").innerHTML = rows.slice(0, shown).map((r) => {
      const st = stOf(r), sel = fotosSel(r.st), f = sel.filter(Boolean).length;
      return `<tr class="click" data-cid="${esc(r.cid)}">
        <td><button type="button" class="chk" data-act="check" aria-pressed="${st === "Comprobado"}" aria-label="Marcar comprobado" ${write ? "" : "disabled"}>✓</button></td>
        <td class="ub">${esc(r.s.ub)}<small>${esc(r.s.sop)}${r.s.det ? " · " + esc(r.s.det) : ""}</small></td>
        <td class="mono hide-sm">${esc(r.s.id)}</td><td>${esc(r.s.owner)}</td><td class="hide-sm">${esc(r.s.ciudad)}</td>
        <td>${esc(r.p.campana)}<span class="sub">${esc(r.p.periodo)}${r.p.fechas ? " · " + esc(r.p.fechas) : ""}</span></td>
        <td><div class="photos" title="${f} de 5 fotos">${[1, 2, 3, 4, 5].map((n) => `<button type="button" data-act="foto" data-n="${n}" class="${sel[n - 1] ? "on" : ""}" aria-pressed="${sel[n - 1]}" aria-label="Foto ${n}" title="Foto ${n}" ${write ? "" : "disabled"}>${n}</button>`).join("")}</div></td>
        <td class="hide-sm"><span class="yn ${r.st.drive ? "y" : "n"}">${r.st.drive ? "Sí" : "No"}</span></td>
        <td class="hide-sm"><span class="yn ${r.st.ppt ? "y" : "n"}">${r.st.ppt ? "Sí" : "No"}</span></td>
        <td><span class="pill ${pillCls(st)}">${st}</span></td><td class="hide-sm">${esc(nombreDe(r.st.verificadoPor))}</td></tr>`;
    }).join("");
    const nr = $("#noRows"); nr.hidden = rows.length > 0;
    nr.textContent = S.periodos.length ? "No hay soportes con estos filtros." : "Todavía no hay campañas cargadas. Ve a Cargas › Nueva campaña para subir la primera.";
    $("#moreBox").hidden = rows.length <= shown;
    $("#moreBtn").textContent = `Mostrar más (${rows.length - shown} restantes)`;
    $("#moreBtn").onclick = () => { shown += 300; draw(true); };
    $("#rows").onclick = onRowClick;
    if (openCid) openDrawer(openCid);
  };
  shown = 150; draw();
  return draw;
}
function findRow(cid) { return allRows().find((r) => r.cid === cid); }
async function writeEstado(r, patch, msg) {
  const next = { ...r.st, ...patch, actualizadoPor: S.auth.uid, actualizado: nowIso() };
  for (const k of Object.keys(next)) if (next[k] === undefined) delete next[k];
  try {
    await S.be.batch([{ op: "update", path: "periodos/" + r.p.id, fields: [[["estado", r.s.id], next]] }]);
    if (msg) toast(msg);
  } catch (e) { console.error(e); toast("No se pudo guardar. Revisa tu conexión o tus permisos."); }
}
function onRowClick(e) {
  const tr = e.target.closest("tr[data-cid]"); if (!tr) return;
  const r = findRow(tr.dataset.cid); if (!r) return;
  const b = e.target.closest("button[data-act]");
  if (b) {
    e.stopPropagation(); if (!can("verificador")) return;
    if (b.dataset.act === "check") {
      const done = stOf(r) === "Comprobado";
      writeEstado(r, done ? { estatus: "En revisión" } : { estatus: "Comprobado", drive: true, ppt: true, verificadoPor: S.auth.uid, fechaVerif: nowIso() }, done ? "Se quitó el ✔" : "Marcado como comprobado");
    } else {
      toggleFoto(r, +b.dataset.n - 1);
    }
    return;
  }
  openDrawer(r.cid);
}
function openDrawer(cid) {
  const r = findRow(cid); const dr = $("#drawer");
  if (!r) { closeDrawer(); return; }
  const keep = openCid === cid && $("#dLink") ? { l: $("#dLink").value, c: $("#dCom").value, focus: document.activeElement?.id } : null;
  openCid = cid;
  const st = stOf(r), d = r.st, w = can("verificador");
  const maps = r.s.lat != null ? `<a href="https://www.google.com/maps?q=${r.s.lat},${r.s.lon}" target="_blank" rel="noopener">Ver en Google Maps</a>` : "Sin coordenadas";
  dr.innerHTML = `<header><div style="flex:1;min-width:0"><div class="mono">${esc(r.cid)}</div><h2>${esc(r.s.ub)}</h2><div class="note">${esc(r.s.sop)}${r.s.det ? " · " + esc(r.s.det) : ""}</div></div><button class="btn" type="button" id="dClose">Cerrar</button></header>
  <div class="body">
    <dl class="meta"><dt>Campaña</dt><dd>${esc(r.p.campana)} · ${esc(r.p.periodo)}${r.p.fechas ? " (" + esc(r.p.fechas) + ")" : ""}</dd><dt>Owner</dt><dd>${esc(r.s.owner)}</dd><dt>Ciudad</dt><dd>${esc(r.s.ciudad)} · ${esc(r.s.esp)}</dd><dt>Mapa</dt><dd>${maps}</dd>
    ${d.verificadoPor ? `<dt>Verificó</dt><dd>${esc(nombreDe(d.verificadoPor))} · ${fecha(d.fechaVerif)}</dd>` : ""}${d.actualizadoPor ? `<dt>Último cambio</dt><dd>${esc(nombreDe(d.actualizadoPor))} · ${fecha(d.actualizado)}</dd>` : ""}</dl>
    <div class="field"><span>Estatus</span><div class="stsel" id="dSt">${ESTATUS.map((s) => `<button type="button" class="${pillCls(s)}" data-s="${s}" aria-pressed="${s === st}">${s}</button>`).join("")}</div></div>
    <div class="field"><span>Fotos recibidas (${fotosSel(d).filter(Boolean).length} de 5)</span><div class="toggles" id="dFotos">${fotosSel(d).map((on, i) => `<label class="toggle"><input type="checkbox" data-i="${i}" ${on ? "checked" : ""}> Foto ${i + 1}</label>`).join("")}</div></div>
    <div class="toggles"><label class="toggle"><input type="checkbox" id="dDrive" ${d.drive ? "checked" : ""}> Cargadas en Drive</label><label class="toggle"><input type="checkbox" id="dPpt" ${d.ppt ? "checked" : ""}> Cargadas en PPT</label></div>
    <label class="field"><span>Link de la carpeta en Drive</span><input type="url" id="dLink" value="${esc(d.link || "")}" placeholder="https://drive.google.com/…"></label>
    ${d.link ? `<a href="${esc(d.link)}" target="_blank" rel="noopener">Abrir carpeta</a>` : ""}
    <label class="field"><span>Comentarios</span><textarea id="dCom" rows="4">${esc(d.comentarios || "")}</textarea></label>
    <div class="field"><span>Arte de referencia · ${esc(r.p.periodo)}</span>${refsBlock(r.p)}</div>
  </div>
  <footer>${can("aprobador") ? `<button class="btn" type="button" id="dEditSite">Editar soporte</button><button class="btn" type="button" id="dEditPer" style="margin-right:auto">Sustituir o dar de baja</button>` : ""}<button class="btn" type="button" id="dSave">Guardar link y comentarios</button><button class="btn primary" type="button" id="dOk">${st === "Comprobado" ? "Comprobado ✔" : "Marcar comprobado ✔"}</button></footer>`;
  dr.hidden = false; $("#scrim").hidden = false;
  if (keep) { $("#dLink").value = keep.l; $("#dCom").value = keep.c; if (keep.focus) document.getElementById(keep.focus)?.focus(); }
  $("#dClose").onclick = closeDrawer;
  if ($("#dEditSite")) $("#dEditSite").onclick = () => { const id = r.s.id; closeDrawer(); openSiteEditor(id); };
  if ($("#dEditPer")) $("#dEditPer").onclick = () => { const pid = r.p.id, sid = r.s.id; closeDrawer(); openPeriodEditor(pid, sid); };
  if (!w) { $$(".body button,.body input,.body textarea,footer button", dr).forEach((x) => (x.disabled = true)); return; }
  $("#dSt").onclick = (e) => { const b = e.target.closest("button"); if (!b) return; const s = b.dataset.s;
    writeEstado(r, s === "Comprobado" ? { estatus: s, verificadoPor: S.auth.uid, fechaVerif: nowIso() } : { estatus: s }, "Estatus: " + s); };
  $("#dFotos").onchange = (e) => { const i = e.target.dataset.i; if (i !== undefined) toggleFoto(r, +i); };
  $("#dDrive").onchange = (e) => writeEstado(r, { drive: e.target.checked }, "En Drive: " + (e.target.checked ? "Sí" : "No"));
  $("#dPpt").onchange = (e) => writeEstado(r, { ppt: e.target.checked }, "En PPT: " + (e.target.checked ? "Sí" : "No"));
  $("#dSave").onclick = () => writeEstado(r, { link: $("#dLink").value.trim(), comentarios: $("#dCom").value.trim() }, "Guardado");
  $("#dOk").onclick = () => { if (stOf(r) !== "Comprobado") writeEstado(r, { estatus: "Comprobado", drive: true, ppt: true, verificadoPor: S.auth.uid, fechaVerif: nowIso() }, "Marcado como comprobado"); };
}
// ================================================================ EDITAR SOPORTE
export function openSiteEditor(id) {
  const cur = S.catalogo.get(id); const dr = $("#drawer");
  if (!cur) { toast("Ese soporte no está en el inventario"); return; }
  const ed = can("aprobador");
  const f = (k, label, v, type = "text") => `<label class="field"><span>${label}</span><input type="${type}" id="se-${k}" value="${esc(v ?? "")}" ${ed ? "" : "disabled"} ${type === "number" ? 'step="any"' : ""}></label>`;
  dr.innerHTML = `<header><div style="flex:1;min-width:0"><div class="mono">${esc(id)}</div><h2>${ed ? "Editar soporte" : "Datos del soporte"}</h2><div class="note">${esc(cur.ciudad)}</div></div><button class="btn" type="button" id="seClose">Cerrar</button></header>
  <div class="body">
    <label class="field"><span>Tipo de espacio</span><select id="se-esp" ${ed ? "" : "disabled"}>${["CALLE", "CENTRO COMERCIAL", "AEROPUERTO"].map((e) => opt(e, e, cur.esp === e)).join("")}</select></label>
    ${f("sop", "Venue type", cur.sop)}${f("ub", "Ubicación", cur.ub)}${f("det", "Detalle / posición", cur.det)}${f("owner", "Media owner", cur.owner)}
    <div class="grid2f">${f("network", "Network", cur.network)}${f("idprov", "ID proveedor", cur.idprov)}</div>
    ${f("medidas", "Medidas", cur.medidas)}
    <div class="grid2f">${f("lat", "Latitud", cur.lat, "number")}${f("lon", "Longitud", cur.lon, "number")}</div>
    <label class="toggle"><input type="checkbox" id="se-activo" ${cur.activo !== false ? "checked" : ""} ${ed ? "" : "disabled"}> Soporte activo</label>
    ${(cur.alias || []).length ? `<div class="field"><span>Nombres originales con los que se ha recibido</span><div class="note">${(cur.alias || []).map(esc).join("<br>")}</div></div>` : ""}
    ${cur.editadoPor ? `<p class="note">Última edición: ${esc(nombreDe(cur.editadoPor))} · ${fecha(cur.editado)}</p>` : ""}
    <p class="note">${ed ? "El nombre anterior se guarda como nombre original, así los planes que lo traigan escrito igual se siguen reconociendo. El ID y la ciudad no se cambian aquí: usa la Carga de inventario." : "Solo un aprobador o administrador puede editar el inventario."}</p>
  </div>
  <footer>${ed ? `<button class="btn primary" type="button" id="seSave">Guardar cambios</button>` : ""}</footer>`;
  dr.hidden = false; $("#scrim").hidden = false;
  $("#seClose").onclick = closeDrawer;
  if (!ed) return;
  $("#seSave").onclick = async () => {
    const up = (k) => $("#se-" + k).value.trim().toUpperCase();
    const n = (k) => { const v = parseFloat($("#se-" + k).value); return isFinite(v) ? v : null; };
    const next = cleanSite({ ...cur, esp: $("#se-esp").value, sop: up("sop"), ub: up("ub"), det: up("det"), owner: up("owner"), network: up("network"),
      idprov: $("#se-idprov").value.trim(), medidas: $("#se-medidas").value.trim(), lat: n("lat"), lon: n("lon"), activo: $("#se-activo").checked });
    if (!next.ub) { toast("La ubicación no puede quedar vacía"); return; }
    const alias = new Set(cur.alias || []);
    if (next.ub !== cur.ub || next.det !== cur.det) alias.add(cur.ub + (cur.det ? " - " + cur.det : ""));
    next.alias = [...alias];
    const data = { ...next, editadoPor: S.auth.uid, editado: nowIso() };
    $("#seSave").disabled = true;
    try { await S.be.batch([{ op: "update", path: "catalogo/" + cur.ciudad, fields: [[["sitios", id], data]] }]); toast("Soporte actualizado"); closeDrawer(); }
    catch (e) { console.error(e); $("#seSave").disabled = false; toast("No se pudo guardar. Revisa tus permisos."); }
  };
}

export function closeDrawer() { openCid = null; const d = $("#drawer"); d.hidden = true; d.onclick = null; $("#scrim").hidden = true; }
export const drawerOpenWithFocus = () => openCid && $("#drawer").contains(document.activeElement) && /INPUT|TEXTAREA/.test(document.activeElement.tagName) && document.activeElement.type !== "checkbox";

// ================================================================ AVANCE
function groupBy(rows, fn) { const m = new Map(); for (const r of rows) { const k = fn(r) || "—"; if (!m.has(k)) m.set(k, []); m.get(k).push(r); } return m; }
function rowbars(groups, byPending, fkey) {
  const arr = [...groups].map(([name, rows]) => ({ name, k: counts(rows) }));
  arr.sort(byPending ? (a, b) => (b.k.total - b.k.Comprobado) - (a.k.total - a.k.Comprobado) || a.name.localeCompare(b.name) : (a, b) => b.k.total - a.k.total);
  return arr.map(({ name, k }) => `<div class="rowbar click" role="button" tabindex="0" data-goto-key="${fkey}" data-goto-val="${esc(name)}" title="Ver en Control"><span class="name" title="${esc(name)}">${esc(name)}</span>${stackBar(k)}<span class="n">${k.Comprobado}/${k.total}</span><span class="pct">${pct(k.pct)}</span></div>`).join("") || `<div class="note">Sin datos.</div>`;
}
export function viewAvance(main) {
  const draw = (keep) => {
    if (!keep) {
      main.innerHTML = `<div class="pagehead"><h1>Avance</h1><span class="note">Da clic en cualquier porcentaje, campaña o fila para ver esos soportes en Control.</span></div>${filtersHTML({ status: false })}<div class="summary" id="sum"></div>
      <div class="legend"><span><b style="background:var(--ok)"></b>Comprobado</span><span><b style="background:var(--warn)"></b>En revisión</span><span><b style="background:var(--bad)"></b>Con observaciones</span><span><b style="background:var(--idle-soft);border:1px solid var(--line)"></b>Pendiente</span></div>
      <div class="cards" id="cards"></div>
      <div class="grid2"><div class="panel"><h3>Por media owner</h3><p class="note" style="margin:-6px 0 10px">Ordenado por pendientes: a quién pedir fotos primero.</p><div id="byOwner"></div></div>
      <div class="panel"><h3>Por ciudad</h3><div id="byCity"></div><h3 style="margin-top:18px">Por tipo de espacio</h3><div id="byEsp"></div><h3 style="margin-top:18px">Por venue type</h3><div id="byVenue"></div></div></div>`;
      bindFilters(main, draw); bindShortcuts(main);
    }
    const all = allRows(), rows = filtered(all, { noStatus: true });
    $("#sum").innerHTML = summaryHTML(counts(rows));
    $("#cards").innerHTML = periodosActivos().map((p) => {
      const rs = rows.filter((r) => r.p.id === p.id); if (!rs.length) return "";
      const k = counts(rs);
      return `<div class="card click" role="button" tabindex="0" data-goto-camp="${esc(p.campana)}" data-goto-per="${esc(p.periodo)}" title="Ver en Control"><div><div class="t">${esc(p.campana)}</div><div class="note">${esc(p.periodo)}${p.fechas ? " · " + esc(p.fechas) : ""}</div></div><div class="big">${pct(k.pct)}</div>${stackBar(k)}<div class="note">${k.Comprobado} de ${k.total} comprobados · ${k.Pendiente} pendientes</div></div>`;
    }).join("") || `<div class="empty">No hay campañas con estos filtros.</div>`;
    $("#byOwner").innerHTML = rowbars(groupBy(rows, (r) => r.s.owner), true, "owner");
    $("#byCity").innerHTML = rowbars(groupBy(rows, (r) => r.s.ciudad), false, "city");
    $("#byEsp").innerHTML = rowbars(groupBy(rows, (r) => r.s.esp), false, "esp");
    $("#byVenue").innerHTML = rowbars(groupBy(rows, (r) => r.s.sop), false, "q");
  };
  draw(); return draw;
}

// ================================================================ CAMPAÑAS
export function viewCampanas(main) {
  const draw = () => {
    const all = allRows(S.periodos);
    const ap = can("aprobador");
    const camps = [...S.campanas].sort((a, b) => (b.creado || "").localeCompare(a.creado || ""));
    main.innerHTML = `<div class="pagehead"><h1>Campañas</h1>${can("verificador") ? `<a class="btn primary" href="#carga-campana">Subir campaña nueva</a>` : ""}</div>
    ${camps.length ? "" : `<div class="panel empty">Aún no hay campañas. ${can("verificador") ? `<a href="#carga-campana">Sube la primera</a>.` : ""}</div>`}
    <div class="stack">${camps.map((c) => {
      const pers = S.periodos.filter((p) => p.campanaId === c.id).sort((a, b) => (a.orden || "").localeCompare(b.orden || ""));
      return `<div class="panel"><div class="row" style="justify-content:space-between;align-items:center"><div><h3 style="margin:0">${esc(c.nombre)} ${c.activo === false ? `<span class="pill p-cancelada">Archivada</span>` : ""}</h3><span class="note">${esc(c.cliente || "")} · <span class="mono">${esc(c.id)}</span> · creada ${fecha(c.creado)}</span></div>
        ${ap ? `<div class="row"><button class="btn small" type="button" data-camp-edit="${esc(c.id)}">Editar nombre</button><button class="btn small" type="button" data-camp-act="${esc(c.id)}">${c.activo === false ? "Reactivar" : "Archivar"}</button></div>` : ""}</div>
        <div class="tablebox" style="margin-top:10px"><table><thead><tr><th>Periodo</th><th>Fechas</th><th>Soportes</th><th>Comprobados</th><th style="min-width:160px">Avance</th><th>Arte</th>${ap ? "<th></th>" : ""}</tr></thead><tbody>
        ${pers.map((p) => { const k = counts(all.filter((r) => r.p.id === p.id)); return `<tr><td><b>${esc(p.periodo)}</b> <span class="mono">${esc(p.id)}</span> ${p.activo === false ? `<span class="pill p-cancelada">Archivado</span>` : ""}</td><td>${esc(p.fechas || "")}</td><td class="num">${k.total}</td><td class="num">${k.Comprobado}</td><td>${stackBar(k)}<span class="note">${pct(k.pct)}</span></td><td><div class="row" style="flex-wrap:nowrap">${(p.refs || []).length ? `<button class="btn small" type="button" data-ref-view="${esc(p.id)}">Ver (${(p.refs || []).length})</button>` : `<span class="note">Sin arte</span>`}${can("verificador") ? `<button class="btn small" type="button" data-ref-edit="${esc(p.id)}">${(p.refs || []).length ? "Cambiar" : "Agregar"}</button>` : ""}</div></td>${ap ? `<td><div class="row" style="flex-wrap:nowrap"><button class="btn small primary" type="button" data-per-edit="${esc(p.id)}">Editar soportes</button><button class="btn small" type="button" data-per-act="${esc(p.id)}">${p.activo === false ? "Reactivar" : "Archivar"}</button></div></td>` : ""}</tr>`; }).join("")}
        </tbody></table></div></div>`;
    }).join("")}</div>`;
    main.onclick = async (e) => {
      const rf = e.target.closest("[data-ref-edit],[data-ref-view]");
      if (rf) { if (rf.dataset.refEdit) openRefsEditor(rf.dataset.refEdit); else openRefsViewer(rf.dataset.refView); return; }
      const ed = e.target.closest("[data-per-edit],[data-camp-edit]");
      if (ed) { if (ed.dataset.perEdit) openPeriodEditor(ed.dataset.perEdit); else openCampaignEditor(ed.dataset.campEdit); return; }
      const b = e.target.closest("[data-camp-act],[data-per-act]"); if (!b) return;
      const isCamp = !!b.dataset.campAct, id = b.dataset.campAct || b.dataset.perAct;
      const cur = isCamp ? S.campanas.find((c) => c.id === id) : S.periodos.find((p) => p.id === id);
      try { await S.be.batch([{ op: "update", path: (isCamp ? "campanas/" : "periodos/") + id, fields: [[["activo"], cur.activo === false]] }]); toast(cur.activo === false ? "Reactivado" : "Archivado: ya no aparece en Control ni en Avance"); }
      catch (err) { toast("No se pudo cambiar"); }
    };
  };
  draw(); return draw;
}

// ================================================================ ARTE DE REFERENCIA (links de Google Drive)
const driveId = (u) => { const m = String(u || "").match(/\/d\/([\w-]{15,})/) || String(u || "").match(/[?&]id=([\w-]{15,})/); return m ? m[1] : null; };
export function refPreview(ref) {
  const u = String(ref.url || "").trim(); if (!u) return "";
  const id = driveId(u);
  if (id) return `<iframe class="ref-frame" src="https://drive.google.com/file/d/${esc(id)}/preview" allow="autoplay; fullscreen" loading="lazy" title="${esc(ref.titulo || "Arte de referencia")}"></iframe>`;
  if (/\.(png|jpe?g|gif|webp)(\?|#|$)/i.test(u)) return `<img class="ref-frame" src="${esc(u)}" alt="${esc(ref.titulo || "Arte de referencia")}">`;
  if (/\.(mp4|webm|mov)(\?|#|$)/i.test(u)) return `<video class="ref-frame" src="${esc(u)}" controls preload="metadata"></video>`;
  return `<div class="ref-frame ref-none">Vista previa no disponible para este link</div>`;
}
export function refsBlock(p, compact = false) {
  const refs = (p.refs || []).filter((r) => r && r.url);
  if (!refs.length) return compact ? "" : `<div class="note">Este periodo todavía no tiene arte de referencia.${can("verificador") ? " Agrégalo en Campañas, columna Arte." : ""}</div>`;
  return `<div class="refs">${refs.map((r, i) => `<figure class="ref">${refPreview(r)}<figcaption><span>${esc(r.titulo || "Referencia " + (i + 1))}</span><a href="${esc(r.url)}" target="_blank" rel="noopener">Abrir en Drive</a></figcaption></figure>`).join("")}</div>`;
}
function openRefsViewer(pid) {
  const p = S.periodos.find((x) => x.id === pid); if (!p) return;
  const dr = $("#drawer");
  dr.innerHTML = `<header><div style="flex:1;min-width:0"><div class="mono">${esc(p.id)}</div><h2>Arte de referencia</h2><div class="note">${esc(p.campana)} · ${esc(p.periodo)}</div></div><button class="btn" type="button" id="rvClose">Cerrar</button></header><div class="body">${refsBlock(p)}</div>`;
  dr.hidden = false; $("#scrim").hidden = false; $("#rvClose").onclick = closeDrawer;
}
export function openRefsEditor(pid) {
  const p = S.periodos.find((x) => x.id === pid); if (!p) return;
  const dr = $("#drawer");
  const refs = [0, 1].map((i) => ({ url: "", titulo: "", ...((p.refs || [])[i] || {}) }));
  dr.innerHTML = `<header><div style="flex:1;min-width:0"><div class="mono">${esc(p.id)}</div><h2>Arte de referencia</h2><div class="note">${esc(p.campana)} · ${esc(p.periodo)}${p.fechas ? " · " + esc(p.fechas) : ""}</div></div><button class="btn" type="button" id="reClose">Cerrar</button></header>
  <div class="body">
    <p class="note">Pega el link de Google Drive de la imagen o el video (botón Compartir › Copiar vínculo). El archivo debe estar compartido con Beeyond Media o con cualquier persona que tenga el vínculo.</p>
    ${refs.map((r, i) => `<div class="panel stack" style="padding:12px"><b>Referencia ${i + 1}</b>
      <label class="field"><span>Título (opcional)</span><input type="text" id="re-t${i}" value="${esc(r.titulo)}" placeholder="Ej. Arte horizontal 1920x1080"></label>
      <label class="field"><span>Link de Google Drive</span><input type="url" id="re-u${i}" value="${esc(r.url)}" placeholder="https://drive.google.com/file/d/…/view"></label>
      <div id="re-p${i}">${refPreview(r)}</div></div>`).join("")}
  </div><footer><button class="btn primary" type="button" id="reSave">Guardar referencias</button></footer>`;
  dr.hidden = false; $("#scrim").hidden = false;
  $("#reClose").onclick = closeDrawer;
  [0, 1].forEach((i) => { let t; $("#re-u" + i).oninput = (e) => { clearTimeout(t); t = setTimeout(() => ($("#re-p" + i).innerHTML = refPreview({ url: e.target.value })), 500); }; });
  $("#reSave").onclick = async () => {
    const out = [0, 1].map((i) => ({ url: $("#re-u" + i).value.trim(), titulo: $("#re-t" + i).value.trim() })).filter((r) => r.url);
    if (out.some((r) => !/^https?:\/\//i.test(r.url))) { toast("Revisa los links: deben empezar con https://"); return; }
    try { await S.be.batch([{ op: "update", path: "periodos/" + pid, fields: [[["refs"], out]] }]); toast("Arte de referencia guardado"); closeDrawer(); }
    catch (e) { toast("No se pudo guardar. Revisa tus permisos."); }
  };
}

// ================================================================ EDITAR CAMPAÑA Y PERIODOS
export function openCampaignEditor(cid) {
  const c = S.campanas.find((x) => x.id === cid); if (!c) return;
  const dr = $("#drawer");
  dr.innerHTML = `<header><div style="flex:1"><div class="mono">${esc(cid)}</div><h2>Editar campaña</h2></div><button class="btn" type="button" id="ceClose">Cerrar</button></header>
  <div class="body"><label class="field"><span>Nombre</span><input type="text" id="ce-n" value="${esc(c.nombre)}"></label>
  <label class="field"><span>Cliente</span><input type="text" id="ce-c" value="${esc(c.cliente || "")}"></label>
  ${S.periodos.filter((p) => p.campanaId === cid).map((p) => `<label class="field"><span>Fechas · ${esc(p.periodo)}</span><input type="text" data-fp="${esc(p.id)}" value="${esc(p.fechas || "")}"></label>`).join("")}</div>
  <footer><button class="btn primary" type="button" id="ceSave">Guardar</button></footer>`;
  dr.hidden = false; $("#scrim").hidden = false;
  $("#ceClose").onclick = closeDrawer;
  $("#ceSave").onclick = async () => {
    const nombre = $("#ce-n").value.trim(); if (!nombre) { toast("El nombre no puede quedar vacío"); return; }
    const ops = [{ op: "update", path: "campanas/" + cid, fields: [[["nombre"], nombre], [["cliente"], $("#ce-c").value.trim()]] }];
    for (const p of S.periodos.filter((x) => x.campanaId === cid)) {
      ops.push({ op: "update", path: "periodos/" + p.id, fields: [[["campana"], nombre], [["fechas"], $(`[data-fp="${p.id}"]`).value.trim()]] });
    }
    try { await S.be.batch(ops); toast("Campaña actualizada"); closeDrawer(); } catch (e) { toast("No se pudo guardar"); }
  };
}

// Sustituir, dar de baja o agregar soportes en un periodo. Las bajas quedan registradas con su motivo.
export function openPeriodEditor(pid, focusSid = "") {
  const dr = $("#drawer");
  let q = "", addQ = "", accion = null; // accion: {tipo:'baja'|'sust', sid}
  if (focusSid) q = focusSid;
  const render = () => {
    const p = S.periodos.find((x) => x.id === pid); if (!p) { closeDrawer(); return; }
    const est = p.estado || {}, bajas = p.bajas || {};
    const lista = (p.sitios || []).filter((sid) => { const s = site(sid) || {}; return matchQuery(q, sid, s.ub, s.sop, s.det, s.owner, s.alias || []); });
    const resultados = (txt, excluir) => !txt.trim() ? [] : [...S.catalogo.entries()].filter(([id, s]) => !excluir.has(id) && s.activo !== false && matchQuery(txt, id, s.ub, s.sop, s.det, s.owner, s.alias || [])).slice(0, 8);
    const enPeriodo = new Set(p.sitios || []);
    const row = (sid) => { const s = site(sid) || { ub: sid }; const st = (est[sid] || {}).estatus || "Pendiente";
      const open = accion && accion.sid === sid;
      return `<div class="pe-row"><div style="min-width:0;flex:1"><b>${esc(s.ub)}</b><span class="sub">${esc(sid)} · ${esc(s.sop || "")} · ${esc(s.owner || "")}</span></div><span class="pill ${pillCls(st)}">${st}</span>
        <div class="row" style="flex-wrap:nowrap"><button class="btn small" type="button" data-sust="${esc(sid)}">Sustituir</button><button class="btn small danger" type="button" data-baja="${esc(sid)}">Dar de baja</button></div>
        ${open ? `<div class="pe-act"><label class="field"><span>Motivo</span><input type="text" id="pe-mot" placeholder="Ej. sitio no disponible, fallas técnicas" value="${esc(accion.motivo || "")}"></label>
          ${accion.tipo === "sust" ? `<label class="field"><span>Buscar el soporte que lo reemplaza</span><input type="search" id="pe-sq" value="${esc(accion.q || "")}" placeholder="Ubicación, owner o ID"></label>
            <div class="pe-res">${resultados(accion.q || "", enPeriodo).map(([id, x]) => `<button class="btn small" type="button" data-con="${esc(id)}">Sustituir por ${esc(id)} · ${esc(x.ub)} · ${esc(x.owner)}</button>`).join("") || `<span class="note">${accion.q ? "Sin resultados. Si el soporte es nuevo, primero dalo de alta en Carga de inventario." : "Escribe para buscar."}</span>`}</div>`
          : `<div class="row"><button class="btn small danger" type="button" data-confirma-baja="${esc(sid)}">Confirmar baja</button><button class="btn small" type="button" data-cancel>Cancelar</button></div>`}</div>` : ""}</div>`; };
    const keepFocus = document.activeElement && dr.contains(document.activeElement) ? { id: document.activeElement.id, pos: document.activeElement.selectionStart } : null;
    dr.innerHTML = `<header><div style="flex:1;min-width:0"><div class="mono">${esc(p.id)}</div><h2>${esc(p.campana)} · ${esc(p.periodo)}</h2><div class="note">${(p.sitios || []).length} soportes${p.fechas ? " · " + esc(p.fechas) : ""}</div></div><button class="btn" type="button" id="peClose">Cerrar</button></header>
    <div class="body">
      <div class="panel" style="padding:12px"><label class="field"><span>Agregar un soporte a este periodo</span><input type="search" id="pe-add" value="${esc(addQ)}" placeholder="Ubicación, owner o ID"></label>
        <div class="pe-res">${resultados(addQ, enPeriodo).map(([id, x]) => `<button class="btn small" type="button" data-add="${esc(id)}">Agregar ${esc(id)} · ${esc(x.ub)} · ${esc(x.owner)}</button>`).join("")}</div></div>
      <label class="field"><span>Soportes del periodo</span><input type="search" id="pe-q" value="${esc(q)}" placeholder="Filtrar por ubicación, owner o ID"></label>
      <div class="pe-list">${lista.map(row).join("") || `<span class="note">Ningún soporte coincide.</span>`}</div>
      ${Object.keys(bajas).length ? `<details class="sec"><summary>Dados de baja (${Object.keys(bajas).length})</summary><div class="in pe-list">${Object.entries(bajas).map(([sid, b]) => { const s = site(sid) || { ub: sid };
        return `<div class="pe-row"><div style="min-width:0;flex:1"><b>${esc(s.ub)}</b><span class="sub">${esc(sid)} · ${fecha(b.fecha)} · ${esc(nombreDe(b.por))}${b.motivo ? " · " + esc(b.motivo) : ""}${b.sustituidoPor ? " · sustituido por " + esc(b.sustituidoPor) : ""}</span></div>${enPeriodo.has(sid) ? "" : `<button class="btn small" type="button" data-react="${esc(sid)}">Reactivar</button>`}</div>`; }).join("")}</div></details>` : ""}
    </div>`;
    dr.hidden = false; $("#scrim").hidden = false;
    if (keepFocus && keepFocus.id && document.getElementById(keepFocus.id)) { const el = document.getElementById(keepFocus.id); el.focus(); try { el.setSelectionRange(keepFocus.pos, keepFocus.pos); } catch (e) {} }
    $("#peClose").onclick = closeDrawer;
    $("#pe-q").oninput = (e) => { q = e.target.value; render(); };
    $("#pe-add").oninput = (e) => { addQ = e.target.value; render(); };
    if ($("#pe-sq")) $("#pe-sq").oninput = (e) => { accion.q = e.target.value; accion.motivo = $("#pe-mot").value; render(); };
    if ($("#pe-mot")) $("#pe-mot").oninput = (e) => { accion.motivo = e.target.value; };
  };
  const write = async (fields, msg) => {
    try { await S.be.batch([{ op: "update", path: "periodos/" + pid, fields }]); toast(msg); accion = null; render(); }
    catch (e) { console.error(e); toast("No se pudo guardar. Revisa tus permisos."); }
  };
  dr.onclick = (e) => {
    const b = e.target.closest("button"); if (!b) return;
    const p = S.periodos.find((x) => x.id === pid); const sitios = [...(p.sitios || [])];
    const motivo = () => ($("#pe-mot") ? $("#pe-mot").value.trim() : "");
    if (b.dataset.baja) { accion = { tipo: "baja", sid: b.dataset.baja }; render(); }
    else if (b.dataset.sust) { accion = { tipo: "sust", sid: b.dataset.sust, q: "" }; render(); }
    else if (b.dataset.cancel !== undefined) { accion = null; render(); }
    else if (b.dataset.confirmaBaja) {
      const sid = b.dataset.confirmaBaja;
      write([[["sitios"], sitios.filter((x) => x !== sid)], [["bajas", sid], { fecha: nowIso(), por: S.auth.uid, motivo: motivo() }]], "Soporte dado de baja del periodo");
    } else if (b.dataset.con) {
      const old = accion.sid, nu = b.dataset.con;
      const i = sitios.indexOf(old); if (i >= 0) sitios[i] = nu; else sitios.push(nu);
      const f = [[["sitios"], sitios], [["bajas", old], { fecha: nowIso(), por: S.auth.uid, motivo: motivo(), sustituidoPor: nu }]];
      if ((p.bajas || {})[nu]) f.push([["bajas", nu], S.be.DEL]);
      write(f, `Sustituido por ${nu}`);
    } else if (b.dataset.add || b.dataset.react) {
      const sid = b.dataset.add || b.dataset.react;
      if (!sitios.includes(sid)) sitios.push(sid);
      const f = [[["sitios"], sitios]]; if ((p.bajas || {})[sid]) f.push([["bajas", sid], S.be.DEL]);
      addQ = ""; write(f, b.dataset.react ? "Soporte reactivado" : "Soporte agregado al periodo");
    }
  };
  render();
}

// ================================================================ INVENTARIO
let invShown = 200;
export function viewInventario(main) {
  let q = "", city = "", soloActivos = true;
  const nPer = new Map(); for (const p of S.periodos) for (const s of p.sitios || []) nPer.set(s, (nPer.get(s) || 0) + 1);
  const draw = (keep) => {
    const list = [...S.catalogo.entries()].map(([id, s]) => ({ id, ...s }))
      .filter((s) => (!soloActivos || s.activo !== false) && (!city || s.ciudad === city) && matchQuery(q, s.id, s.ub, s.sop, s.det, s.owner, s.idprov, s.alias || []))
      .sort((a, b) => a.id.localeCompare(b.id));
    if (!keep) {
      main.innerHTML = `<div class="pagehead"><h1>Inventario de soportes</h1><button class="btn" type="button" id="invExp">Descargar inventario (Excel)</button>${can("verificador") ? `<a class="btn primary" href="#carga-inventario">Cargar cambios de inventario</a>` : ""}</div>
      <div class="toolbar"><label class="grow">Buscar<input type="search" id="iq" placeholder="ID, ubicación, owner o nombre original"></label><label>Ciudad<select id="ic">${opt("", "Todas")}${[...new Set([...S.catalogo.values()].map((s) => s.ciudad))].filter(Boolean).sort().map((c) => opt(c)).join("")}</select></label>
      <label class="toggle" style="flex:0 0 auto;text-transform:none;letter-spacing:0;font-size:13px;color:var(--fg)"><input type="checkbox" id="ia" checked> Solo activos</label></div>
      <p class="note" id="icount"></p>${can("aprobador") ? `<p class="note">Da clic en un soporte para corregir su nombre u otros datos.</p>` : ""}<div class="tablebox"><table><thead><tr><th>ID</th><th>Espacio</th><th>Venue type</th><th>Ubicación</th><th>Ciudad</th><th>Owner</th><th class="hide-sm">Medidas</th><th class="hide-sm">Campañas</th><th>Mapa</th></tr></thead><tbody id="irows"></tbody></table>
      <div class="empty" id="iempty" hidden></div><div class="more" id="imore" hidden><button class="btn" type="button" id="imoreb">Mostrar más</button></div></div>`;
      $("#iq").oninput = (e) => { q = e.target.value; invShown = 200; draw(true); };
      $("#ic").onchange = (e) => { city = e.target.value; invShown = 200; draw(true); };
      $("#ia").onchange = (e) => { soloActivos = e.target.checked; draw(true); };
      $("#invExp").onclick = exportInventario;
      $("#imoreb").onclick = () => { invShown += 400; draw(true); };
      $("#irows").onclick = (e) => { if (e.target.closest("a")) return; const tr = e.target.closest("tr[data-sid]"); if (tr) openSiteEditor(tr.dataset.sid); };
    }
    $("#icount").textContent = `${list.length} soportes`;
    $("#irows").innerHTML = list.slice(0, invShown).map((s) => `<tr class="click" data-sid="${esc(s.id)}" title="${can("aprobador") ? "Editar soporte" : "Ver soporte"}"><td class="mono">${esc(s.id)}</td><td>${esc(s.esp)}</td><td>${esc(s.sop)}</td><td class="ub">${esc(s.ub)}${s.det ? `<small>${esc(s.det)}</small>` : ""}${s.activo === false ? ` <span class="pill p-cancelada">Inactivo</span>` : ""}</td><td>${esc(s.ciudad)}</td><td>${esc(s.owner)}</td><td class="hide-sm">${esc(s.medidas || "")}</td><td class="hide-sm num">${nPer.get(s.id) || 0}</td><td>${s.lat != null ? `<a href="https://www.google.com/maps?q=${s.lat},${s.lon}" target="_blank" rel="noopener">Maps</a>` : "—"}</td></tr>`).join("");
    $("#iempty").hidden = list.length > 0;
    $("#iempty").textContent = S.catalogo.size ? "Ningún soporte coincide." : "El inventario está vacío. Un aprobador o administrador debe hacer la primera carga de inventario.";
    $("#imore").hidden = list.length <= invShown;
  };
  draw(); return draw;
}
export function inventarioRows() {
  return [...S.catalogo.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([id, s]) => ({
    "ID ANTERIOR": "", "ID": id, "TIPO DE ESPACIO": s.esp, "VENUE TYPE": s.sop, "UBICACIÓN": s.ub, "DETALLE / POSICIÓN": s.det || "",
    "CIUDAD": s.ciudad, "NETWORK": s.network || "", "MEDIA OWNER": s.owner, "ID PROVEEDOR": s.idprov || "", "MEDIDAS": s.medidas || "",
    "LAT": s.lat, "LONG": s.lon, "ACTIVO": s.activo === false ? "No" : "Sí", "NOMBRE(S) ORIGINAL(ES)": (s.alias || []).join(" || ") }));
}
function exportInventario() {
  const rows = inventarioRows();
  if (!rows.length) rows.push({ "ID ANTERIOR": "", "ID": "BYM-CDMX-0001", "TIPO DE ESPACIO": "CALLE", "VENUE TYPE": "CARTELERA DIGITAL", "UBICACIÓN": "EJEMPLO: AV. INSURGENTES SUR 1000", "DETALLE / POSICIÓN": "", "CIUDAD": "CDMX", "NETWORK": "OUTDOOR", "MEDIA OWNER": "EJEMPLO", "ID PROVEEDOR": "", "MEDIDAS": "1920x1080", "LAT": 19.39, "LONG": -99.17, "ACTIVO": "Sí", "NOMBRE(S) ORIGINAL(ES)": "" });
  downloadXlsx(`Inventario_Beeyond_${new Date().toISOString().slice(0, 10)}.xlsx`, [["Inventario", rows]]);
}

// ================================================================ USUARIOS
export function viewUsuarios(main) {
  const table = () => {
    const users = [...S.users.entries()].sort((a, b) => (a[1].nombre || "").localeCompare(b[1].nombre || ""));
    $("#uTable").innerHTML = `<table><thead><tr><th>Nombre</th><th>Correo</th><th>Rol</th><th>Activo</th><th></th></tr></thead><tbody>
    ${users.map(([uid, u]) => { const self = uid === S.auth.uid; return `<tr><td><b>${esc(u.nombre || "")}</b>${self ? ` <span class="note">(tú)</span>` : ""}</td><td>${esc(u.email)}</td>
      <td><select data-rol="${esc(uid)}" ${self ? "disabled" : ""}>${Object.entries(ROLES).map(([k, v]) => opt(k, v, u.rol === k)).join("")}</select></td>
      <td><label class="toggle" style="padding:4px 8px"><input type="checkbox" data-act="${esc(uid)}" ${u.activo ? "checked" : ""} ${self ? "disabled" : ""}> ${u.activo ? "Activo" : "Inactivo"}</label></td>
      <td><button class="btn small" type="button" data-reset="${esc(u.email)}">Enviar correo para cambiar contraseña</button></td></tr>`; }).join("")}
    </tbody></table>`;
  };
  const draw = () => {
    main.innerHTML = `<div class="pagehead"><h1>Usuarios</h1></div>
    <div class="grid2" style="margin-top:0"><form class="panel stack" id="newUser" autocomplete="off">
      <h3>Agregar usuario</h3>
      <div class="grid2f"><label class="field"><span>Nombre</span><input type="text" id="nuName" required></label>
      <label class="field"><span>Correo</span><input type="email" id="nuEmail" required placeholder="nombre@${esc(DOMINIO)}"></label></div>
      <div class="grid2f"><label class="field"><span>Rol</span><select id="nuRol">${Object.entries(ROLES).map(([k, v]) => opt(k, v, k === "verificador")).join("")}</select></label>
      <label class="field"><span>Contraseña temporal</span><input type="text" id="nuPw" required minlength="8"></label></div>
      <p class="note">Comparte la contraseña temporal con la persona. Después puede cambiarla con "Olvidé mi contraseña" en la pantalla de inicio.</p>
      <div><button class="btn primary" type="submit">Crear usuario</button></div><div id="nuMsg" hidden></div></form>
      <div class="panel"><h3>Qué puede hacer cada rol</h3><dl class="meta">
        <dt><b>Consulta</b></dt><dd>Ve el control, el avance, las campañas y el inventario, y exporta a Excel.</dd>
        <dt><b>Verificador</b></dt><dd>Lo anterior, más marcar comprobaciones y subir Excels de campañas o inventario para aprobación.</dd>
        <dt><b>Aprobador</b></dt><dd>Lo anterior, más aprobar o rechazar cargas de otras personas y archivar campañas.</dd>
        <dt><b>Administrador</b></dt><dd>Todo, más dar de alta usuarios y cambiar roles. Puede aprobar sus propias cargas.</dd></dl></div></div>
    <div class="tablebox" style="margin-top:14px" id="uTable"></div>`;
    table();
    $("#nuPw").value = Math.random().toString(36).slice(2, 8) + "Bym" + Math.floor(Math.random() * 90 + 10);
    $("#newUser").onsubmit = async (e) => {
      e.preventDefault(); const m = $("#nuMsg"); m.hidden = false;
      const email = $("#nuEmail").value.trim().toLowerCase(), nombre = $("#nuName").value.trim(), rol = $("#nuRol").value, pw = $("#nuPw").value;
      if (!email.endsWith("@" + DOMINIO)) { m.className = "msg err"; m.textContent = `Solo se pueden dar de alta correos @${DOMINIO}.`; return; }
      m.className = "msg warn"; m.textContent = "Creando…";
      try {
        const uid = await S.be.createUser(email, pw);
        await S.be.batch([{ op: "set", path: "users/" + uid, data: { email, nombre, rol, activo: true, creado: nowIso(), creadoPor: S.auth.uid } }]);
        m.className = "msg ok"; m.textContent = `Listo: ${nombre} puede entrar con ${email} y la contraseña ${pw}`;
      } catch (err) {
        m.className = "msg err";
        m.textContent = err.code === "auth/email-already-in-use" ? "Ese correo ya tiene cuenta. Si no aparece en la lista, pide ayuda al administrador de Firebase." : err.code === "auth/weak-password" ? "La contraseña debe tener al menos 6 caracteres." : "No se pudo crear el usuario.";
      }
    };
    main.onchange = async (e) => {
      const r = e.target.closest("[data-rol]"), a = e.target.closest("[data-act]");
      try {
        if (r) { await S.be.batch([{ op: "update", path: "users/" + r.dataset.rol, fields: [[["rol"], r.value]] }]); toast("Rol actualizado"); }
        if (a) { await S.be.batch([{ op: "update", path: "users/" + a.dataset.act, fields: [[["activo"], a.checked]] }]); toast(a.checked ? "Usuario activado" : "Usuario desactivado: ya no puede entrar"); }
      } catch (err) { toast("No se pudo guardar"); }
    };
    main.onclick = async (e) => {
      const b = e.target.closest("[data-reset]"); if (!b) return;
      try { await S.be.resetPassword(b.dataset.reset); toast("Correo enviado a " + b.dataset.reset); } catch (err) { toast("No se pudo enviar el correo"); }
    };
  };
  draw(); return () => table();
}
