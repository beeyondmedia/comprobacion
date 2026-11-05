// Lectura de la presentación de comprobación (.pptx) en el navegador.
// Una diapositiva = una ubicación. El nombre viene en un cuadro de texto a la izquierda
// y las fotos de la campaña son las imágenes grandes del lado derecho; fondos, logos,
// íconos y encabezados (chicos, repetidos o del lado izquierdo) no cuentan.
const attr = (s, n) => (s.match(new RegExp(`\\b${n}="([^"]*)"`)) || [])[1];
const unxml = (s) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/&amp;/g, "&");
function xfrm(block) {
  const off = block.match(/<a:off\b[^>]*>/), ext = block.match(/<a:ext\b[^>]*>/);
  if (!off || !ext) return null;
  return { x: +attr(off[0], "x"), y: +attr(off[0], "y"), cx: +attr(ext[0], "cx"), cy: +attr(ext[0], "cy") };
}
const IGNORAR_TXT = /^(CAMPA[NÑ]A|COMPROBACI[OÓ]N|REPORTE|MERCADO LIBRE|PREVIA|DURANTE)\b/i;

export async function readPptx(file) {
  if (!window.JSZip) throw new Error("No se cargó el lector de PowerPoint. Recarga la página.");
  const zip = await window.JSZip.loadAsync(file);
  return parsePptx(zip);
}

export async function parsePptx(zip) {
  const txt = async (p) => { const f = zip.file(p); return f ? f.async("string") : ""; };
  const pres = await txt("ppt/presentation.xml");
  if (!pres) throw new Error("El archivo no parece una presentación de PowerPoint (.pptx).");
  const size = pres.match(/<p:sldSz\b[^>]*>/);
  const W = size ? +attr(size[0], "cx") : 9144000, H = size ? +attr(size[0], "cy") : 5143500;
  const presRels = await txt("ppt/_rels/presentation.xml.rels");
  const relMap = new Map([...presRels.matchAll(/<Relationship\b[^>]*>/g)].map((m) => [attr(m[0], "Id"), attr(m[0], "Target")]));
  const order = [...pres.matchAll(/<p:sldId\b[^>]*>/g)].map((m) => relMap.get(attr(m[0], "r:id"))).filter(Boolean)
    .map((t) => "ppt/" + t.replace(/^\/?ppt\//, "").replace(/^\.\//, ""));
  const slides = [];
  for (const [i, path] of order.entries()) {
    const xml = await txt(path);
    if (/<p:sld\b[^>]*\bshow="0"/.test(xml)) continue; // diapositiva oculta
    const relsXml = await txt(path.replace(/slides\/(slide\d+\.xml)$/, "slides/_rels/$1.rels"));
    const rels = new Map([...relsXml.matchAll(/<Relationship\b[^>]*>/g)].map((m) => [attr(m[0], "Id"), attr(m[0], "Target") || ""]));
    const pics = [], textos = [];
    for (const m of xml.matchAll(/<p:pic>[\s\S]*?<\/p:pic>/g)) {
      const b = m[0], g = xfrm(b), rid = attr(b.match(/<a:blip\b[^>]*>/)?.[0] || "", "r:embed");
      if (g) pics.push({ ...g, media: rels.get(rid) || "" });
    }
    for (const m of xml.matchAll(/<p:sp>[\s\S]*?<\/p:sp>/g)) {
      const b = m[0], g = xfrm(b);
      const t = [...b.matchAll(/<a:p>([\s\S]*?)<\/a:p>/g)].map((p) => [...p[1].matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((x) => unxml(x[1])).join(""))
        .map((s) => s.trim()).filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
      if (t && g) textos.push({ ...g, t });
    }
    slides.push({ n: i + 1, pics, textos });
  }
  // Imágenes que se repiten en el mismo lugar en la mayoría de las diapositivas = plantilla (logos, fondos)
  const sig = (p) => [Math.round(p.x / 2e4), Math.round(p.y / 2e4), Math.round(p.cx / 2e4), Math.round(p.cy / 2e4), /\.jpe?g$/i.test(p.media) ? "j" : "o"].join(",");
  const freq = new Map();
  for (const s of slides) for (const k of new Set(s.pics.map(sig))) freq.set(k, (freq.get(k) || 0) + 1);
  const area = W * H;
  return slides.map((s) => {
    const fotos = s.pics.filter((p) => {
      const a = p.cx * p.cy, cxm = p.x + p.cx / 2;
      if (a < area * 0.03) return false;              // íconos, logos
      if (a > area * 0.6) return false;               // fondo a toda la diapositiva
      if (cxm < W * 0.4) return false;                // lado izquierdo: encabezado, mapa, fondo del texto
      const foto = /\.(jpe?g|jfif|heic|webp)$/i.test(p.media);
      const plantilla = slides.length >= 4 && (freq.get(sig(p)) || 0) >= slides.length * 0.8 && !foto;
      return !plantilla;
    });
    // Nombre de la ubicación: el texto numerado ("12. …") de la izquierda; si no hay, el más largo
    // de la izquierda fuera del encabezado (el título de la campaña) y que no sea solo la ciudad.
    const NUM = /^\s*\d+\s*[.)-]/, CIUDAD = /^(CDMX|GDL|MTY|EDOMEX|MONTERREY|GUADALAJARA|CIUDAD DE MEXICO|ESTADO DE MEXICO|[A-Z]{2,5})$/i;
    const cand = s.textos.filter((t) => !IGNORAR_TXT.test(t.t) && !CIUDAD.test(t.t.trim()));
    const izq = cand.filter((t) => t.x + t.cx / 2 < W * 0.45);
    const byLen = (a, b) => b.t.length - a.t.length;
    const pick = izq.filter((t) => NUM.test(t.t)).sort(byLen)[0] || cand.filter((t) => NUM.test(t.t)).sort(byLen)[0]
      || izq.filter((t) => t.y + t.cy / 2 > H * 0.3).sort(byLen)[0] || izq.sort(byLen)[0] || cand.sort(byLen)[0];
    const texto = pick ? pick.t : "";
    return { n: s.n, texto, fotos: fotos.length };
  });
}

// ---------- búsqueda de la diapositiva dentro de los soportes del periodo
const fold = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();
const STOP = new Set(["AV", "AVE", "AVENIDA", "BLVD", "BOULEVARD", "CALLE", "DE", "DEL", "LA", "EL", "LOS", "LAS", "Y", "E", "NO", "NUM", "CP", "COL", "COLONIA",
  "A", "EN", "ESQ", "ESQUINA", "S", "N", "SN", "CDMX", "GDL", "MTY", "EDOMEX", "JALISCO", "NUEVO", "LEON", "MEXICO", "CIUDAD", "ESTADO"]);
const tok = (s) => new Set(fold(s).split(" ").filter((t) => t && !STOP.has(t)));
function lev1(a, b) {
  if (a === b) return true; if (Math.abs(a.length - b.length) > 1 || Math.min(a.length, b.length) < 5) return false;
  let i = 0, j = 0, d = 0;
  while (i < a.length && j < b.length) { if (a[i] === b[j]) { i++; j++; continue; } if (++d > 1) return false; if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; } }
  return d + (a.length - i) + (b.length - j) <= 1;
}
const inSet = (set, t) => { if (set.has(t)) return true; if (/^\d+$/.test(t)) return false; for (const x of set) if (lev1(x, t)) return true; return false; };
// ¿Qué tanto del nombre del soporte aparece en el texto de la diapositiva? (0 a 1)
const VENUE = new Set(["CARTELERA", "DIGITAL", "MEGA", "VALLA", "LANDMARK", "ARCO", "PANTALLA", "PARABUS", "TOTEM", "MUPI", "PUENTE", "ESPECTACULAR", "MURO", "INDOOR"]);
function cover(slideT, name) {
  const st = tok(name); if (!st.size) return 0;
  let hit = 0, numMiss = 0;
  for (const t of st) { if (inSet(slideT, t)) hit++; else if (/\d/.test(t)) numMiss++; }
  const c = Math.max(0, hit / st.size - numMiss * 0.25);
  // desempate: cuánto del texto de la diapositiva explica este nombre
  const sl = [...slideT].filter((t) => !VENUE.has(t)); let back = 0;
  for (const t of sl) if (inSet(st, t)) back++;
  return c + 0.3 * (sl.length ? back / sl.length : 0);
}
export function textoUbicacion(t) { return String(t || "").replace(/^\s*\d+\s*[.)-]\s*/, "").trim(); }
export function scoreSite(texto, s) {
  const T = tok(textoUbicacion(texto));
  const nombres = [s.ub, (s.ub || "") + " " + (s.det || ""), ...(s.alias || [])].filter(Boolean);
  let best = 0; for (const n of nombres) best = Math.max(best, cover(T, n));
  if (best && s.sop && [...tok(s.sop)].every((t) => T.has(t))) best += 0.1;   // mismo venue type
  if (s.idprov && T.has(fold(s.idprov).replace(/ /g, ""))) best += 0.3;       // ID del proveedor (CDM024…)
  return best;
}
// Asigna cada diapositiva a un soporte distinto del periodo, primero las coincidencias más claras.
export function matchSlides(slides, sitios /* [[id, s]] */) {
  const pairs = [];
  slides.forEach((sl, i) => sitios.forEach(([id, s]) => { const sc = scoreSite(sl.texto, s); if (sc >= 0.34) pairs.push({ i, id, sc }); }));
  pairs.sort((a, b) => b.sc - a.sc);
  const bySlide = new Map(), usado = new Set();
  for (const p of pairs) if (!bySlide.has(p.i) && !usado.has(p.id)) { bySlide.set(p.i, p); usado.add(p.id); }
  return slides.map((sl, i) => {
    const mine = pairs.filter((p) => p.i === i);
    const m = bySlide.get(i);
    const otro = mine.find((p) => p.id !== m?.id);
    const seguro = !!m && m.sc >= 0.85 && (!otro || m.sc - otro.sc >= 0.12);
    return { ...sl, id: m?.id || "", score: m?.sc || 0, seguro, opciones: mine.slice(0, 5).map((p) => p.id), scores: mine.slice(0, 5).map((p) => p.sc) };
  });
}

// ¿Dos soportes son caras de la misma ubicación? (mismo nombre quitando I/II, NORTE-SUR, IZQ/DER…)
const CARA = new Set(["I", "II", "III", "IV", "V", "NORTE", "SUR", "ORIENTE", "PONIENTE", "NS", "SN", "OP", "PO", "IZQ", "DER", "IZQUIERDA", "DERECHA",
  "A", "B", "C", "1", "2", "3", "VISTA", "NATURAL", "CRUZADA", "FRONTAL", "CARA", "LADO", "SENTIDO"]);
const base = (s) => new Set(fold(s).split(" ").filter((t) => t && !STOP.has(t) && !CARA.has(t)));
export function mismaUbicacion(a, b) {
  if (!a || !b) return false;
  const A = base(a.ub + " " + (a.det || "")), B = base(b.ub + " " + (b.det || ""));
  if (!A.size || !B.size) return false;
  let i = 0; for (const t of A) if (B.has(t)) i++;
  return i / (A.size + B.size - i) >= 0.6;
}
