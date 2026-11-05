// Carga de la PPT de comprobación: cuenta las fotos de cada diapositiva y las marca
// en el periodo elegido (Foto 1…N y "En PPT: Sí"). El ✔ y el estatus no cambian.
import { S, $, $$, esc, opt, nowIso, toast, can, periodosActivos, matchQuery, nextSiteIds, cleanSite, fold } from "./core.js";
import { readPptx, matchSlides, textoUbicacion, mismaUbicacion } from "./ppt.js";
import { fotosSel } from "./views.js";

const JSZIP_URL = "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";
let jszipP = null;
const loadJsZip = () => jszipP || (jszipP = new Promise((ok, ko) => {
  if (window.JSZip) return ok();
  const s = document.createElement("script"); s.src = JSZIP_URL; s.onload = () => ok(); s.onerror = () => { jszipP = null; ko(new Error("jszip")); };
  document.head.appendChild(s);
}));
const MAX = 5;
const steps = (list, on) => `<div class="steps">${list.map((s, i) => `<span class="${i === on ? "on" : ""}">${i + 1}. ${s}</span>`).join("")}</div>`;
const STEPS = ["Periodo y archivo", "Revisión", "Listo"];
const ESPACIOS = ["CALLE", "CENTRO COMERCIAL", "AEROPUERTO"];
const VENUES = ["PARABUS", "KIOSCO", "BIOBOX", "MEGA VALLA", "CARTELERA DIGITAL", "LANDMARK", "ARCO DIGITAL", "MUPI", "TOTEM", "PANTALLA", "VIDEO WALL", "PUENTE"];
// "68. Parabus CERVANTES SAAVEDRA" -> { sop: "PARABUS", ub: "CERVANTES SAAVEDRA" }
function partirTexto(t) {
  let u = textoUbicacion(t).replace(/^(CDMX|GDL|MTY)[\s_-]+/i, "");
  const f = fold(u); let sop = "";
  for (const v of VENUES) if (f.startsWith(v + " ") || f.startsWith(v + "_")) { sop = v; u = u.slice(v.length).replace(/^[\s_-]+/, ""); break; }
  return { sop, ub: u.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim() };
}
const label = (id) => { if (String(id).startsWith("NUEVO:")) return "Nuevo soporte"; const s = S.catalogo.get(id); return s ? `${s.ub}${s.det ? " · " + s.det : ""} · ${s.sop} · ${s.owner} (${id})` : id; };
const perLabel = (p) => `${p.campana} · ${p.periodo}${p.fechas ? " · " + p.fechas : ""}`;

export function viewCargaPpt(main) {
  if (!can("verificador")) { main.innerHTML = `<div class="pagehead"><h1>PPT de comprobación</h1></div><div class="msg warn">Tu rol solo permite consultar.</div>`; return; }
  let pid = S.F.camp ? (periodosActivos().find((p) => p.campana === S.F.camp && (!S.F.per || p.periodo === S.F.per))?.id || "") : "";
  let rows = [], fileName = "", busy = false, camp = "", uidN = 0;
  let faltDec = {}; // sid -> { acc: "dejar" | "baja", motivo }
  const MOTIVO = "No sale en la PPT de comprobación";
  // Otra cara de la misma diapositiva: una fila más, ligada a la de la diapositiva. Las fotos se reparten.
  const nuevaCara = (r, sid = "", auto = false) => {
    const tot = Math.min(r.fotos, MAX * 2), caras = rows.filter((x) => x.cara === r.uid).length + 2;
    const each = Math.floor(tot / caras), extra = tot - each * caras;
    r.n = Math.min(MAX, each + extra);
    rows.filter((x) => x.cara === r.uid).forEach((x) => (x.n = Math.min(MAX, each)));
    return { uid: ++uidN, cara: r.uid, n_slide: r.n_slide, texto: r.texto, fotos: 0, id: sid, sid, seguro: false, auto,
      opciones: r.opciones.filter((x) => x !== r.sid), scores: [], n: Math.min(MAX, each), dec: "ppt" };
  };
  loadJsZip().catch(() => {});

  const step1 = () => {
    const pers = periodosActivos();
    const camps = [...new Set(pers.map((p) => p.campana))].sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base", numeric: true }));
    camp = pers.find((p) => p.id === pid)?.campana || camp;
    main.innerHTML = `<div class="pagehead"><h1>PPT de comprobación</h1></div>${steps(STEPS, 0)}
    <div class="stack"><div class="panel stack">
      <div class="grid2f"><label class="field"><span>Campaña</span><select id="pCamp"><option value="">Elige la campaña…</option>${camps.map((c) => opt(c, c, c === camp)).join("")}</select></label>
      <label class="field"><span>Periodo</span><select id="pPer"></select></label></div>
      <div class="note" id="pInfo">Solo se buscan las ubicaciones de ese periodo.</div></div>
    <div class="drop" id="pdrop"><b>Sube la presentación de comprobación (.pptx)</b><span class="note">Arrastra el archivo aquí o</span><label class="btn primary">Elegir archivo<input type="file" id="pdrop-in" accept=".pptx" hidden></label><div id="pmsg" class="note" hidden></div></div>
    <div class="panel note">La app lee cada diapositiva: toma el nombre de la ubicación del cuadro de texto de la izquierda y cuenta las fotos de la campaña (las imágenes grandes); fondos, logos, íconos y mapas no cuentan. Antes de guardar te muestra lo que encontró para que lo revises. Se marcan Foto 1…N (máximo 5), "En PPT: Sí" y "En Drive: Sí", y el soporte queda como Comprobado (✔); los que están "Con observaciones" conservan ese estatus.</div></div>`;
    const fillPer = () => {
      const lst = pers.filter((p) => p.campana === camp);
      if (!lst.some((p) => p.id === pid)) pid = lst.length === 1 ? lst[0].id : "";
      $("#pPer").innerHTML = (camp ? (lst.length > 1 ? `<option value="">Elige el periodo…</option>` : "") : `<option value="">Primero elige la campaña</option>`) + lst.map((p) => opt(p.id, p.periodo, p.id === pid)).join("");
      $("#pPer").disabled = !camp;
      const p = lst.find((x) => x.id === pid);
      $("#pInfo").innerHTML = p ? `${p.fechas ? esc(p.fechas) + " · " : ""}<b>${(p.sitios || []).length} soportes</b>. Solo se buscan las ubicaciones de ese periodo.` : "Solo se buscan las ubicaciones del periodo que elijas.";
    };
    $("#pCamp").onchange = (e) => { camp = e.target.value; fillPer(); };
    $("#pPer").onchange = (e) => { pid = e.target.value; fillPer(); };
    fillPer();
    const box = $("#pdrop"), inp = $("#pdrop-in");
    inp.onchange = () => inp.files[0] && onFile(inp.files[0]);
    box.ondragover = (e) => { e.preventDefault(); box.classList.add("over"); };
    box.ondragleave = () => box.classList.remove("over");
    box.ondrop = (e) => { e.preventDefault(); box.classList.remove("over"); const f = e.dataTransfer.files[0]; if (f) onFile(f); };
  };

  async function onFile(f) {
    if (busy) return;
    if (!pid) { toast("Primero elige la campaña y el periodo."); (camp ? $("#pPer") : $("#pCamp")).focus(); return; }
    if (!/\.pptx$/i.test(f.name)) { toast("Sube el archivo en formato .pptx (PowerPoint)."); return; }
    const m = $("#pmsg"); m.hidden = false; m.textContent = "Leyendo la presentación… (puede tardar unos segundos si es pesada)"; busy = true;
    try {
      await loadJsZip();
      const slides = (await readPptx(f)).filter((s) => s.texto || s.fotos);
      const per = S.periodos.find((p) => p.id === pid);
      const sitios = (per.sitios || []).filter((id) => !(per.bajas || {})[id]).map((id) => [id, S.catalogo.get(id) || { ub: id }]);
      rows = matchSlides(slides, sitios).map((r) => ({ ...r, uid: ++uidN, n_slide: r.n, sid: r.id, n: Math.min(r.fotos, MAX), dec: "ppt" }));
      // diapositivas sin coincidencia en el plan: se buscan en todo el inventario (fuera del plan)
      const enPlan = new Set(per.sitios || []);
      const sinMatch = rows.filter((r) => !r.sid && r.texto);
      if (sinMatch.length) {
        const fuera = [...S.catalogo.entries()].filter(([id, s]) => !enPlan.has(id) && s.activo !== false);
        matchSlides(sinMatch, fuera).forEach((m, j) => {
          const r = sinMatch[j];
          if (m.id && m.seguro && m.score >= 1) { r.sid = m.id; r.extra = m.id; r.fuera = true; r.opcionesFuera = m.opciones.filter((x) => x !== m.id).slice(0, 3); }
        });
      }
      faltDec = {};
      // propone la segunda cara cuando el texto también describe otra cara del mismo sitio (MASARYK I / MASARYK II)
      const usados = new Set(rows.map((r) => r.sid).filter(Boolean));
      for (const r of [...rows]) {
        if (!r.sid) continue;
        const k = r.opciones.findIndex((id, j) => j > 0 && id !== r.sid && !usados.has(id) && r.scores[j] >= 0.85 && r.scores[j] >= r.score - 0.3
          && mismaUbicacion(S.catalogo.get(id), S.catalogo.get(r.sid)));
        if (k < 0) continue;
        const c = nuevaCara(r, r.opciones[k], true); usados.add(c.sid);
        rows.splice(rows.indexOf(r) + 1, 0, c);
      }
      fileName = f.name; busy = false; step2();
    } catch (e) {
      console.error(e); busy = false;
      m.textContent = e.message === "jszip" ? "No se pudo cargar el lector de PowerPoint. Revisa tu conexión y recarga la página." : "No pude leer esa presentación. ¿Es un .pptx válido?";
    }
  }

  const per = () => S.periodos.find((p) => p.id === pid);
  const cur = (sid) => (per()?.estado || {})[sid] || {};
  const curN = (sid) => fotosSel(cur(sid)).filter(Boolean).length;

  function rowHTML(r, i) {
    const p = per(), ids = (p.sitios || []).filter((id) => !(p.bajas || {})[id]);
    const resto = ids.filter((id) => !r.opciones.includes(id)).sort((a, b) => label(a).localeCompare(label(b)));
    const caras = rows.filter((x) => x.cara === r.uid).length;
    const caraPill = !r.cara && caras && r.sid ? `<span class="pill p-Comprobado">${caras + 1} caras</span>` : r.cara ? `<span class="pill p-Pendiente">${r.auto ? "Otra cara (propuesta)" : "Otra cara"}</span> ` : "";
    const estado = caraPill + ((r.cara || caras) && r.sid ? "" : r.fuera && r.sid === r.extra ? `<span class="pill p-dudoso">Fuera del plan: se agregará</span>` : !r.sid ? `<span class="pill p-error">${r.cara ? "Elige la otra cara" : "Sin coincidencia"}</span>` : r.sid !== r.id ? `<span class="pill p-actualizar">Elegido a mano</span>` : r.seguro ? `<span class="pill p-Comprobado">Coincide</span>` : `<span class="pill p-dudoso">Revisa</span>`);
    const c = r.sid ? cur(r.sid) : null, cn = r.sid ? curN(r.sid) : 0;
    const dif = r.sid && cn > 0 && cn !== r.n;
    return `<tr data-i="${i}"${r.cara ? ' class="pcara"' : ""}>
      <td class="num">${r.cara ? "↳" : r.n_slide}</td>
      <td>${r.cara ? `<div class="note">Misma diapositiva ${r.n_slide}</div>` : `<div>${esc(textoUbicacion(r.texto) || "(sin texto)")}</div>`}<div style="margin-top:4px">${estado}</div>
        ${r.cara ? `<button class="btn small" type="button" data-quitar-cara="${i}" style="margin-top:4px">Quitar esta cara</button>`
          : r.sid ? `<button class="btn small" type="button" data-cara="${i}" style="margin-top:4px">+ ${caras ? "Otra cara más" : "Tiene otra cara"}</button>` : ""}</td>
      <td><select class="pSite" data-i="${i}" aria-label="Soporte de la diapositiva ${r.n_slide}"><option value="">— No aplicar —</option>
        ${r.opciones.length ? `<optgroup label="Más parecidos">${r.opciones.map((id) => opt(id, label(id), id === r.sid)).join("")}</optgroup>` : ""}
        <optgroup label="Todos los soportes del periodo">${resto.map((id) => opt(id, label(id), id === r.sid)).join("")}</optgroup>
        ${r.extra || (r.opcionesFuera || []).length ? `<optgroup label="Del inventario, fuera del plan (se agrega al periodo)">${[...new Set([r.extra, ...(r.opcionesFuera || [])].filter(Boolean))].map((x) => opt(x, label(x), r.sid === x)).join("")}</optgroup>` : ""}
        ${r.nuevo ? `<optgroup label="Alta nueva (se agrega al inventario y al periodo)">${opt("NUEVO:" + r.uid, "Nuevo: " + r.nuevo.ub + " · " + r.nuevo.sop + " · " + r.nuevo.owner, r.sid === "NUEVO:" + r.uid)}</optgroup>` : ""}
        <option value="__buscar">🔍 Buscar en todo el inventario…</option></select>
        ${r.sid && !ids.includes(r.sid) ? `<div class="note" style="margin-top:4px">${r.sid.startsWith("NUEVO:") ? "Se dará de alta en el inventario y se agregará al periodo" : "Se agregará a este periodo"}</div>` : ""}
        ${!r.buscar && !(r.sid && r.sid === r.id && r.seguro) ? `<button class="btn small" type="button" data-buscar="${i}" style="margin-top:4px">Buscar en todo el inventario</button>` : ""}</td>
      <td class="num"><input type="number" class="pN" data-i="${i}" min="0" max="${MAX}" value="${r.n}" style="width:56px" aria-label="Fotos a marcar">
        ${r.cara ? "" : caras ? `<div class="note">la diapositiva trae ${r.fotos}</div>` : r.fotos > MAX ? `<div style="margin-top:4px"><span class="pill p-dudoso">trae ${r.fotos}, se marcan ${MAX}</span></div>` : r.fotos === 0 ? `<div class="note">sin fotos</div>` : ""}</td>
      <td>${r.sid ? `${cn} foto${cn === 1 ? "" : "s"} · PPT ${c.ppt ? "Sí" : "No"}` : "—"}</td>
      <td>${dif ? `<select class="pDec" data-i="${i}" aria-label="Qué hacer"><option value="ppt"${r.dec === "ppt" ? " selected" : ""}>Usar la PPT (${r.n})</option><option value="keep"${r.dec === "keep" ? " selected" : ""}>Conservar lo marcado (${cn})</option></select>`
        : r.sid && r.n > 0 ? (cn === r.n ? `<span class="note">Igual (${r.n})</span>` : `Marcar ${r.n}`) : `<span class="note">No se aplica</span>`}</td></tr>
      ${r.buscar ? `<tr class="psub"><td></td><td colspan="5">${buscarHTML(r, i)}</td></tr>` : ""}`;
  }
  function resultados(q) {
    if (!q.trim()) return [];
    return [...S.catalogo.entries()].filter(([id, s]) => matchQuery(q, id, s.ub, s.sop, s.det, s.owner, s.idprov, s.alias || [])).slice(0, 8);
  }
  function resHTML(i) {
    const r = rows[i], p = per(), en = new Set(p.sitios || []), bajas = p.bajas || {};
    const res = resultados(r.q || "");
    if (!(r.q || "").trim()) return `<div class="note">Escribe parte del nombre, el ID o el owner.</div>`;
    return res.length ? `<div class="stack" style="gap:4px">${res.map(([id, s]) => `<div class="row" style="justify-content:space-between;align-items:center;gap:8px;border-bottom:1px solid var(--line);padding:4px 0">
      <div style="min-width:0"><b>${esc(s.ub)}</b>${s.det ? " · " + esc(s.det) : ""} · ${esc(s.sop)} · ${esc(s.owner)} <span class="mono">${esc(id)}</span>
      ${bajas[id] ? ` <span class="pill p-cancelada">dado de baja en el periodo</span>` : en.has(id) ? ` <span class="pill p-Comprobado">ya está en el periodo</span>` : ` <span class="pill p-dudoso">se agrega al periodo</span>`}${s.activo === false ? ` <span class="pill p-cancelada">inactivo</span>` : ""}</div>
      ${bajas[id] ? "" : `<button class="btn small primary" type="button" data-elegir="${i}" data-id="${esc(id)}">Elegir</button>`}</div>`).join("")}</div>`
      : `<div class="note">No encontré soportes con "${esc(r.q)}" en el inventario.</div>`;
  }
  function buscarHTML(r, i) {
    const d = r.form || { esp: "CALLE", ciudad: "CDMX", owner: "", ...partirTexto(r.texto) };
    r.form = d;
    const ciudades = [...new Set(["CDMX", "GDL", "MTY", ...S.ciudadesDoc])];
    return `<div class="panel stack" style="padding:10px">
      <div class="row" style="gap:8px;align-items:center"><input type="search" class="pQ" data-i="${i}" value="${esc(r.q || "")}" placeholder="Buscar en todo el inventario" style="flex:1" aria-label="Buscar soporte">
        <button class="btn small" type="button" data-cerrar="${i}">Cerrar</button></div>
      <div id="pRes${i}">${resHTML(i)}</div>
      ${r.alta ? `<div class="stack" style="gap:8px;border-top:1px solid var(--line);padding-top:8px"><b>Dar de alta un soporte nuevo</b>
        <div class="grid2f"><label class="field"><span>Ubicación</span><input type="text" data-f="ub" data-i="${i}" value="${esc(d.ub)}"></label>
        <label class="field"><span>Venue type</span><input type="text" data-f="sop" data-i="${i}" value="${esc(d.sop)}" list="pVenues"></label>
        <label class="field"><span>Media owner</span><input type="text" data-f="owner" data-i="${i}" value="${esc(d.owner)}"></label>
        <label class="field"><span>Ciudad</span><select data-f="ciudad" data-i="${i}">${ciudades.map((c) => opt(c, c, c === d.ciudad)).join("")}</select></label>
        <label class="field"><span>Tipo de espacio</span><select data-f="esp" data-i="${i}">${ESPACIOS.map((e) => opt(e, e, e === d.esp)).join("")}</select></label>
        <label class="field"><span>Detalle / posición (opcional)</span><input type="text" data-f="det" data-i="${i}" value="${esc(d.det || "")}"></label></div>
        <datalist id="pVenues">${[...new Set([...VENUES, ...[...S.catalogo.values()].map((s) => s.sop).filter(Boolean)])].sort().map((v) => `<option value="${esc(v)}">`).join("")}</datalist>
        <div class="row" style="gap:8px"><button class="btn small primary" type="button" data-alta-ok="${i}">Usar este soporte nuevo</button><button class="btn small" type="button" data-alta-no="${i}">Cancelar alta</button>
        <span class="note">El ID se asigna al guardar (siguiente de su ciudad).</span></div></div>`
      : `<div class="row" style="gap:8px;align-items:center"><span class="note">¿No está en el inventario?</span><button class="btn small" type="button" data-alta="${i}">Dar de alta un soporte nuevo</button></div>`}
    </div>`;
  }

  const step2 = () => draw2();
  // Ubicaciones del plan que no salen en la PPT: dejarlas pendientes o darlas de baja (con motivo)
  function faltanHTML(faltan) {
    const nb = faltan.filter((id) => faltDec[id]?.acc === "baja").length;
    return `<div class="panel stack" id="pFalt"><div class="row" style="justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">
      <div><b>${faltan.length} ubicaci${faltan.length === 1 ? "ón" : "ones"} del plan no ${faltan.length === 1 ? "sale" : "salen"} en la PPT.</b> <span class="note">¿Qué hacemos con ${faltan.length === 1 ? "ella" : "ellas"}? Si no eliges nada, se quedan pendientes.</span></div>
      <div class="row" style="gap:6px"><button class="btn small" type="button" data-falt-todas="dejar">Dejar todas pendientes</button><button class="btn small" type="button" data-falt-todas="baja">Dar de baja todas</button></div></div>
      ${nb ? `<div class="msg warn">Se ${nb === 1 ? "dará" : "darán"} de baja ${nb} del plan: salen de Control y Avance, y quedan registradas con su motivo en Campañas › Editar soportes (se pueden reactivar).</div>` : ""}
      <div class="tablebox"><table><thead><tr><th>Ubicación</th><th>Hoy en la app</th><th>Qué hacer</th><th>Motivo de la baja</th></tr></thead><tbody>
      ${faltan.map((id) => { const d = faltDec[id] || { acc: "dejar", motivo: MOTIVO }, c = cur(id), cn = curN(id);
        return `<tr><td>${esc(label(id))}</td><td>${cn} foto${cn === 1 ? "" : "s"} · ${esc(c.estatus || "Pendiente")}</td>
        <td><select data-falt="${esc(id)}" style="min-width:190px" aria-label="Qué hacer con ${esc(id)}">${opt("dejar", "Dejar pendiente", d.acc !== "baja")}${opt("baja", "Dar de baja del plan", d.acc === "baja")}</select></td>
        <td>${d.acc === "baja" ? `<input type="text" data-falt-mot="${esc(id)}" value="${esc(d.motivo)}" aria-label="Motivo" style="width:100%">` : `<span class="note">—</span>`}</td></tr>`; }).join("")}
      </tbody></table></div></div>`;
  }
  function draw2() {
    const p = per();
    const sl = rows.filter((r) => !r.cara);
    const k = { total: sl.length, ok: sl.filter((r) => r.sid && r.sid === r.id && (r.seguro || rows.some((x) => x.cara === r.uid))).length, sin: sl.filter((r) => !r.sid).length,
      caras: rows.filter((r) => r.cara).length, mas: sl.filter((r) => r.fotos > MAX && !rows.some((x) => x.cara === r.uid)).length, dif: rows.filter((r) => r.sid && curN(r.sid) > 0 && curN(r.sid) !== r.n).length };
    k.fuera = sl.filter((r) => r.sid && !(p.sitios || []).includes(r.sid)).length;
    k.mano = sl.filter((r) => r.sid && r.sid !== r.id && !(r.fuera && r.sid === r.extra)).length; k.rev = k.total - k.ok - k.sin - k.mano - sl.filter((r) => r.fuera && r.sid === r.extra).length;
    const usados = new Set(rows.map((r) => r.sid).filter(Boolean));
    const faltan = (p.sitios || []).filter((id) => !(p.bajas || {})[id] && !usados.has(id));
    const dup = [...usados].filter((id) => rows.filter((r) => r.sid === id).length > 1);
    main.innerHTML = `<div class="pagehead"><h1>PPT de comprobación</h1></div>${steps(STEPS, 1)}
    <div class="stack"><div class="panel stack"><div class="note">Archivo: <b>${esc(fileName)}</b> · Periodo: <b>${esc(perLabel(p))}</b></div>
      <div class="counts"><span class="pill p-Pendiente">${k.total} diapositivas</span><span class="pill p-Comprobado">${k.ok} coinciden</span>${k.mano ? `<span class="pill p-actualizar">${k.mano} elegidos a mano</span>` : ""}${k.fuera ? `<span class="pill p-dudoso">${k.fuera} fuera del plan (se agregan)</span>` : ""}${k.caras ? `<span class="pill p-Pendiente">${k.caras} cara${k.caras === 1 ? "" : "s"} extra</span>` : ""}${k.rev ? `<span class="pill p-dudoso">${k.rev} por revisar</span>` : ""}${k.sin ? `<span class="pill p-error">${k.sin} sin coincidencia</span>` : ""}${k.mas ? `<span class="pill p-dudoso">${k.mas} con más de ${MAX} fotos</span>` : ""}${k.dif ? `<span class="pill p-dudoso">${k.dif} distintas a lo ya marcado</span>` : ""}</div>
      ${k.mas ? `<div class="msg warn">${sl.filter((r) => r.fotos > MAX && !rows.some((x) => x.cara === r.uid)).map((r) => `Diapositiva ${r.n_slide} trae ${r.fotos} fotos`).join(" · ")}. Se marcan ${MAX}, el máximo de la app.</div>` : ""}
      ${dup.length ? `<div class="msg err">Hay soportes elegidos en más de una diapositiva: ${dup.map((id) => esc(label(id))).join(" · ")}. Corrige antes de guardar.</div>` : ""}</div>
    <div class="tablebox"><table><thead><tr><th>Diap.</th><th>Texto en la PPT</th><th>Soporte del periodo</th><th>Fotos PPT</th><th>Hoy en la app</th><th>Qué hacer</th></tr></thead>
      <tbody id="pRows">${rows.map(rowHTML).join("")}</tbody></table></div>
    ${faltan.length ? faltanHTML(faltan) : ""}
    <div class="row2"><button class="btn" type="button" id="pBack">Cambiar archivo o periodo</button><button class="btn primary" type="button" id="pApply"${dup.length ? " disabled" : ""}>Guardar fotos en la app</button></div></div>`;
    main.onchange = (e) => {
      const t = e.target;
      if (t.dataset.falt) { confirmarBajas = false; const d = faltDec[t.dataset.falt] || (faltDec[t.dataset.falt] = { acc: "dejar", motivo: MOTIVO }); d.acc = t.value; draw2(); return; }
      const i = +t.dataset.i; if (!rows[i]) return;
      if (t.classList.contains("pSite")) {
        if (t.value === "__buscar") { abrirBuscar(i); return; }
        rows[i].sid = t.value; rows[i].dec = "ppt";
        if (t.value && !t.value.startsWith("NUEVO:") && !(per().sitios || []).includes(t.value)) rows[i].extra = t.value;
        draw2();
      }
      else if (t.dataset.f) { rows[i].form[t.dataset.f] = t.value; }
      else if (t.classList.contains("pN")) { rows[i].n = Math.max(0, Math.min(MAX, Math.round(+t.value || 0))); draw2(); }
      else if (t.classList.contains("pDec")) rows[i].dec = t.value;
    };
    main.oninput = (e) => {
      const t = e.target;
      if (t.dataset.faltMot) { (faltDec[t.dataset.faltMot] || (faltDec[t.dataset.faltMot] = { acc: "baja", motivo: "" })).motivo = t.value; return; }
      const i = +t.dataset.i; if (!rows[i]) return;
      if (t.classList.contains("pQ")) { rows[i].q = t.value; $("#pRes" + i).innerHTML = resHTML(i); }
      else if (t.dataset.f) rows[i].form[t.dataset.f] = t.value;
    };
    main.onclick = (e) => {
      const b = e.target.closest("button"); if (!b) return;
      const d = b.dataset;
      if (d.faltTodas) { confirmarBajas = false;
        const p = per(), usados = new Set(rows.map((r) => r.sid).filter(Boolean));
        for (const id of (p.sitios || []).filter((x) => !(p.bajas || {})[x] && !usados.has(x))) faltDec[id] = { acc: d.faltTodas, motivo: faltDec[id]?.motivo || MOTIVO };
        draw2(); return;
      }
      if (d.buscar != null) abrirBuscar(+d.buscar);
      else if (d.cara != null) {
        const i = +d.cara, r = rows[i], c = nuevaCara(r);
        const pos = i + 1 + rows.filter((x) => x.cara === r.uid).length; rows.splice(pos, 0, c);
        c.buscar = !c.opciones.length; if (c.buscar) c.q = partirTexto(r.texto).ub; draw2();
      }
      else if (d.quitarCara != null) {
        const i = +d.quitarCara, c = rows[i], r = rows.find((x) => x.uid === c.cara); rows.splice(i, 1);
        const resto = rows.filter((x) => x.cara === r.uid);
        if (!resto.length) r.n = Math.min(MAX, r.fotos); draw2();
      }
      else if (d.cerrar != null) { rows[+d.cerrar].buscar = false; draw2(); }
      else if (d.elegir != null) { const r = rows[+d.elegir], p = per(); r.sid = d.id; if (!(p.sitios || []).includes(d.id)) r.extra = d.id; r.buscar = false; r.dec = "ppt"; draw2(); }
      else if (d.alta != null) { rows[+d.alta].alta = true; draw2(); }
      else if (d.altaNo != null) { const r = rows[+d.altaNo]; r.alta = false; if (r.sid === "NUEVO:" + r.uid) r.sid = ""; r.nuevo = null; draw2(); }
      else if (d.altaOk != null) {
        const i = +d.altaOk, r = rows[i], f = r.form;
        const up = (x) => String(x || "").trim().toUpperCase();
        if (!up(f.ub) || !up(f.sop) || !up(f.owner)) { toast("Llena ubicación, venue type y media owner"); return; }
        r.nuevo = { esp: f.esp, sop: up(f.sop), ub: up(f.ub), det: up(f.det), owner: up(f.owner), ciudad: f.ciudad };
        r.sid = "NUEVO:" + r.uid; r.buscar = false; r.alta = false; r.dec = "ppt"; draw2();
      }
    };
    const abrirBuscar = (i) => { const r = rows[i]; r.buscar = true; if (r.q == null) r.q = partirTexto(r.texto).ub; draw2(); const q = $(`.pQ[data-i="${i}"]`); if (q) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); } };
    $("#pBack").onclick = () => { main.onchange = null; main.oninput = null; main.onclick = null; step1(); };
    $("#pApply").onclick = apply;
  }

  let confirmarBajas = false;
  async function apply() {
    const p = per(), fields = [], now = nowIso(), ops = [];
    let n = 0, keep = 0, nOk = 0, nObs = 0;
    // altas nuevas: siguiente ID de su ciudad
    const porCiudad = new Map(), taken = new Set();
    for (const r of rows) if (r.sid && r.sid.startsWith("NUEVO:")) { const c = r.nuevo.ciudad; if (!porCiudad.has(c)) porCiudad.set(c, []); porCiudad.get(c).push(r); }
    const altas = [];
    for (const [c, lst] of porCiudad) {
      const ids = nextSiteIds(c, lst.length, taken); ids.forEach((x) => taken.add(x));
      const m = lst.map((r, k) => { r.sid = ids[k]; return [ids[k], { ...cleanSite({ ...r.nuevo, alias: [textoUbicacion(r.texto)] }), creado: now, creadoPor: S.auth.uid, origen: "PPT: " + fileName }]; });
      altas.push(...m.map(([id]) => id));
      if (S.ciudadesDoc.has(c)) ops.push({ op: "update", path: "catalogo/" + c, fields: m.map(([id, v]) => [["sitios", id], v]) });
      else ops.push({ op: "set", path: "catalogo/" + c, data: { sitios: Object.fromEntries(m) } });
    }
    // lo elegido a mano fuera del periodo se agrega aunque la diapositiva no traiga fotos todavía
    const agregar = [...new Set(rows.filter((r) => r.sid && !(p.sitios || []).includes(r.sid)).map((r) => r.sid))];
    const usados = new Set(rows.map((r) => r.sid).filter(Boolean));
    const bajas = (p.sitios || []).filter((id) => !(p.bajas || {})[id] && !usados.has(id) && faltDec[id]?.acc === "baja");
    if (agregar.length || bajas.length) fields.push([["sitios"], [...(p.sitios || []).filter((id) => !bajas.includes(id)), ...agregar]]);
    for (const id of bajas) fields.push([["bajas", id], { fecha: now, por: S.auth.uid, motivo: (faltDec[id].motivo || "").trim() || MOTIVO, origen: "PPT: " + fileName }]);
    for (const r of rows) {
      if (!r.sid || r.n <= 0) continue;
      const c = cur(r.sid), cn = curN(r.sid);
      const usarPpt = !(cn > 0 && cn !== r.n && r.dec === "keep");
      const next = { ...c, ppt: true, fotosPpt: r.cara ? r.n : r.fotos, fotosOrigen: fileName, actualizadoPor: S.auth.uid, actualizado: now };
      if (usarPpt) { next.fotosSel = [1, 2, 3, 4, 5].map((x) => x <= r.n); next.fotos = r.n; n++; } else keep++;
      // si está en la PPT también está en Drive: queda comprobado (salvo que tenga observaciones)
      next.drive = true;
      if (next.estatus !== "Con observaciones") { if (next.estatus !== "Comprobado") { next.verificadoPor = S.auth.uid; next.fechaVerif = now; nOk++; } next.estatus = "Comprobado"; } else nObs++;
      fields.push([["estado", r.sid], next]);
    }
    if (!fields.length) { toast("No hay fotos, soportes para agregar ni bajas que guardar."); return; }
    if (bajas.length && !confirmarBajas) { confirmarBajas = true; $("#pApply").textContent = `Confirmar: guardar y dar de baja ${bajas.length}`; toast(`Vas a dar de baja ${bajas.length} ubicaci${bajas.length === 1 ? "ón" : "ones"} del plan. Presiona otra vez para confirmar.`); return; }
    $("#pApply").disabled = true;
    const nEst = fields.filter((f) => f[0][0] === "estado").length;
    try {
      await S.be.batch([...ops, { op: "update", path: "periodos/" + p.id, fields }]);
      main.onchange = null; main.oninput = null; main.onclick = null;
      main.innerHTML = `<div class="pagehead"><h1>PPT de comprobación</h1></div>${steps(STEPS, 2)}
      <div class="stack"><div class="msg ok">Listo: ${esc(perLabel(p))}. Se marcaron fotos en ${n} soportes${keep ? ` y ${keep} conservaron lo que ya estaba marcado` : ""}; ${nEst === 1 ? "quedó" : "quedaron"} con "En PPT: Sí" y "En Drive: Sí". ${nOk === 1 ? "1 soporte quedó" : nOk + " soportes quedaron"} como Comprobado ✔${nObs ? ` (${nObs} con observaciones conservan ese estatus)` : ""}.${agregar.length ? ` ${agregar.length === 1 ? "Se agregó 1 soporte" : `Se agregaron ${agregar.length} soportes`} al periodo` + (altas.length ? `; ${altas.length === 1 ? "1 se dio" : altas.length + " se dieron"} de alta en el inventario (${altas.map(esc).join(", ")})` : "") + "." : ""}${bajas.length ? ` ${bajas.length === 1 ? "Se dio de baja 1 ubicación" : `Se dieron de baja ${bajas.length} ubicaciones`} del plan.` : ""}</div>
      <div class="row2"><a class="btn primary" href="#control" id="pGo">Ver en Control</a><button class="btn" type="button" id="pOtra">Cargar otra PPT</button></div></div>`;
      $("#pGo").onclick = () => { S.F.camp = p.campana; S.F.per = p.periodo; S.F.st = ""; S.F.q = ""; try { localStorage.setItem("bym-filtros", JSON.stringify(S.F)); } catch (e) {} };
      $("#pOtra").onclick = () => { rows = []; step1(); };
    } catch (e) { console.error(e); for (const r of rows) if (r.nuevo && altas.includes(r.sid)) r.sid = "NUEVO:" + r.uid; $("#pApply").disabled = false; toast("No se pudo guardar. Revisa tu conexión o tus permisos."); }
  }

  step1();
  return null;
}
