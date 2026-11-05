// Carga de la PPT de comprobación: cuenta las fotos de cada diapositiva y las marca
// en el periodo elegido (Foto 1…N y "En PPT: Sí"). El ✔ y el estatus no cambian.
import { S, $, $$, esc, opt, nowIso, toast, can, periodosActivos } from "./core.js";
import { readPptx, matchSlides, textoUbicacion } from "./ppt.js";
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
const label = (id) => { const s = S.catalogo.get(id); return s ? `${s.ub}${s.det ? " · " + s.det : ""} · ${s.sop} · ${s.owner} (${id})` : id; };
const perLabel = (p) => `${p.campana} · ${p.periodo}${p.fechas ? " · " + p.fechas : ""}`;

export function viewCargaPpt(main) {
  if (!can("verificador")) { main.innerHTML = `<div class="pagehead"><h1>PPT de comprobación</h1></div><div class="msg warn">Tu rol solo permite consultar.</div>`; return; }
  let pid = S.F.camp ? (periodosActivos().find((p) => p.campana === S.F.camp && (!S.F.per || p.periodo === S.F.per))?.id || "") : "";
  let rows = [], fileName = "", busy = false, camp = "";
  loadJsZip().catch(() => {});

  const step1 = () => {
    const pers = periodosActivos();
    const camps = [...new Set(pers.map((p) => p.campana))].sort((a, b) => a.localeCompare(b, "es"));
    camp = pers.find((p) => p.id === pid)?.campana || camp;
    main.innerHTML = `<div class="pagehead"><h1>PPT de comprobación</h1></div>${steps(STEPS, 0)}
    <div class="stack"><div class="panel stack">
      <div class="grid2f"><label class="field"><span>Campaña</span><select id="pCamp"><option value="">Elige la campaña…</option>${camps.map((c) => opt(c, c, c === camp)).join("")}</select></label>
      <label class="field"><span>Periodo</span><select id="pPer"></select></label></div>
      <div class="note" id="pInfo">Solo se buscan las ubicaciones de ese periodo.</div></div>
    <div class="drop" id="pdrop"><b>Sube la presentación de comprobación (.pptx)</b><span class="note">Arrastra el archivo aquí o</span><label class="btn primary">Elegir archivo<input type="file" id="pdrop-in" accept=".pptx" hidden></label><div id="pmsg" class="note" hidden></div></div>
    <div class="panel note">La app lee cada diapositiva: toma el nombre de la ubicación del cuadro de texto de la izquierda y cuenta las fotos de la campaña (las imágenes grandes); fondos, logos, íconos y mapas no cuentan. Antes de guardar te muestra lo que encontró para que lo revises. Se marcan Foto 1…N (máximo 5) y "En PPT: Sí"; el ✔ y el estatus no cambian.</div></div>`;
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
      rows = matchSlides(slides, sitios).map((r) => ({ ...r, n_slide: r.n, sid: r.id, n: Math.min(r.fotos, MAX), dec: "ppt" }));
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
    const estado = !r.sid ? `<span class="pill p-error">Sin coincidencia</span>` : r.seguro && r.sid === r.id ? `<span class="pill p-Comprobado">Coincide</span>` : `<span class="pill p-dudoso">Revisa</span>`;
    const c = r.sid ? cur(r.sid) : null, cn = r.sid ? curN(r.sid) : 0;
    const dif = r.sid && cn > 0 && cn !== r.n;
    return `<tr data-i="${i}">
      <td class="num">${r.n_slide}</td>
      <td><div>${esc(textoUbicacion(r.texto) || "(sin texto)")}</div><div style="margin-top:4px">${estado}</div></td>
      <td><select class="pSite" data-i="${i}" aria-label="Soporte de la diapositiva ${r.n_slide}"><option value="">— No aplicar —</option>
        ${r.opciones.length ? `<optgroup label="Más parecidos">${r.opciones.map((id) => opt(id, label(id), id === r.sid)).join("")}</optgroup>` : ""}
        <optgroup label="Todos los soportes del periodo">${resto.map((id) => opt(id, label(id), id === r.sid)).join("")}</optgroup></select></td>
      <td class="num"><input type="number" class="pN" data-i="${i}" min="0" max="${MAX}" value="${r.n}" style="width:56px" aria-label="Fotos a marcar">
        ${r.fotos > MAX ? `<div style="margin-top:4px"><span class="pill p-dudoso">trae ${r.fotos}, se marcan ${MAX}</span></div>` : r.fotos === 0 ? `<div class="note">sin fotos</div>` : ""}</td>
      <td>${r.sid ? `${cn} foto${cn === 1 ? "" : "s"} · PPT ${c.ppt ? "Sí" : "No"}` : "—"}</td>
      <td>${dif ? `<select class="pDec" data-i="${i}" aria-label="Qué hacer"><option value="ppt"${r.dec === "ppt" ? " selected" : ""}>Usar la PPT (${r.n})</option><option value="keep"${r.dec === "keep" ? " selected" : ""}>Conservar lo marcado (${cn})</option></select>`
        : r.sid && r.n > 0 ? (cn === r.n ? `<span class="note">Igual (${r.n})</span>` : `Marcar ${r.n}`) : `<span class="note">No se aplica</span>`}</td></tr>`;
  }

  const step2 = () => draw2();
  function draw2() {
    const p = per();
    const k = { total: rows.length, ok: rows.filter((r) => r.sid && r.seguro && r.sid === r.id).length, sin: rows.filter((r) => !r.sid).length,
      mas: rows.filter((r) => r.fotos > MAX).length, dif: rows.filter((r) => r.sid && curN(r.sid) > 0 && curN(r.sid) !== r.n).length };
    k.rev = k.total - k.ok - k.sin;
    const usados = new Set(rows.map((r) => r.sid).filter(Boolean));
    const faltan = (p.sitios || []).filter((id) => !(p.bajas || {})[id] && !usados.has(id));
    const dup = [...usados].filter((id) => rows.filter((r) => r.sid === id).length > 1);
    main.innerHTML = `<div class="pagehead"><h1>PPT de comprobación</h1></div>${steps(STEPS, 1)}
    <div class="stack"><div class="panel stack"><div class="note">Archivo: <b>${esc(fileName)}</b> · Periodo: <b>${esc(perLabel(p))}</b></div>
      <div class="counts"><span class="pill p-Pendiente">${k.total} diapositivas</span><span class="pill p-Comprobado">${k.ok} coinciden</span>${k.rev ? `<span class="pill p-dudoso">${k.rev} por revisar</span>` : ""}${k.sin ? `<span class="pill p-error">${k.sin} sin coincidencia</span>` : ""}${k.mas ? `<span class="pill p-dudoso">${k.mas} con más de ${MAX} fotos</span>` : ""}${k.dif ? `<span class="pill p-dudoso">${k.dif} distintas a lo ya marcado</span>` : ""}</div>
      ${k.mas ? `<div class="msg warn">${rows.filter((r) => r.fotos > MAX).map((r) => `Diapositiva ${r.n_slide} trae ${r.fotos} fotos`).join(" · ")}. Se marcan ${MAX}, el máximo de la app.</div>` : ""}
      ${dup.length ? `<div class="msg err">Hay soportes elegidos en más de una diapositiva: ${dup.map((id) => esc(label(id))).join(" · ")}. Corrige antes de guardar.</div>` : ""}</div>
    <div class="tablebox"><table><thead><tr><th>Diap.</th><th>Texto en la PPT</th><th>Soporte del periodo</th><th>Fotos PPT</th><th>Hoy en la app</th><th>Qué hacer</th></tr></thead>
      <tbody id="pRows">${rows.map(rowHTML).join("")}</tbody></table></div>
    ${faltan.length ? `<details class="sec"><summary>Soportes del periodo sin diapositiva <span class="pill p-dudoso">${faltan.length}</span></summary><div class="in"><ul>${faltan.map((id) => `<li>${esc(label(id))}</li>`).join("")}</ul></div></details>` : ""}
    <div class="row2"><button class="btn" type="button" id="pBack">Cambiar archivo o periodo</button><button class="btn primary" type="button" id="pApply"${dup.length ? " disabled" : ""}>Guardar fotos en la app</button></div></div>`;
    main.onchange = (e) => {
      const t = e.target, i = +t.dataset.i; if (!rows[i]) return;
      if (t.classList.contains("pSite")) { rows[i].sid = t.value; rows[i].dec = "ppt"; draw2(); }
      else if (t.classList.contains("pN")) { rows[i].n = Math.max(0, Math.min(MAX, Math.round(+t.value || 0))); draw2(); }
      else if (t.classList.contains("pDec")) rows[i].dec = t.value;
    };
    $("#pBack").onclick = () => { main.onchange = null; step1(); };
    $("#pApply").onclick = apply;
  }

  async function apply() {
    const p = per(), fields = [], now = nowIso();
    let n = 0, keep = 0;
    for (const r of rows) {
      if (!r.sid || r.n <= 0) continue;
      const c = cur(r.sid), cn = curN(r.sid);
      const usarPpt = !(cn > 0 && cn !== r.n && r.dec === "keep");
      const next = { ...c, ppt: true, fotosPpt: r.fotos, fotosOrigen: fileName, actualizadoPor: S.auth.uid, actualizado: now };
      if (usarPpt) { next.fotosSel = [1, 2, 3, 4, 5].map((x) => x <= r.n); next.fotos = r.n; n++; } else keep++;
      fields.push([["estado", r.sid], next]);
    }
    if (!fields.length) { toast("No hay diapositivas para aplicar."); return; }
    $("#pApply").disabled = true;
    try {
      await S.be.batch([{ op: "update", path: "periodos/" + p.id, fields }]);
      main.onchange = null;
      main.innerHTML = `<div class="pagehead"><h1>PPT de comprobación</h1></div>${steps(STEPS, 2)}
      <div class="stack"><div class="msg ok">Listo: se actualizaron ${fields.length} soportes de ${esc(perLabel(p))}. ${n} con las fotos de la PPT${keep ? `, ${keep} conservaron lo que ya estaba marcado` : ""}. Todos quedaron con "En PPT: Sí".</div>
      <div class="row2"><a class="btn primary" href="#control" id="pGo">Ver en Control</a><button class="btn" type="button" id="pOtra">Cargar otra PPT</button></div></div>`;
      $("#pGo").onclick = () => { S.F.camp = p.campana; S.F.per = p.periodo; S.F.st = ""; S.F.q = ""; try { localStorage.setItem("bym-filtros", JSON.stringify(S.F)); } catch (e) {} };
      $("#pOtra").onclick = () => { rows = []; step1(); };
    } catch (e) { console.error(e); $("#pApply").disabled = false; toast("No se pudo guardar. Revisa tu conexión o tus permisos."); }
  }

  step1();
  return null;
}
