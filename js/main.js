// Punto de entrada: inicio de sesión, menú, rutas y suscripciones a la base.
import { FIREBASE_CONFIG, DOMINIO, EMPRESA } from "./config.js";
import { S, $, esc, can, ROLES, nowIso, toast } from "./core.js";
import { viewControl, viewAvance, viewCampanas, viewInventario, viewUsuarios, closeDrawer, drawerOpenWithFocus } from "./views.js";
import { viewCargaCampana, viewCargaInventario, viewHistorial, pendingCount } from "./cargas.js";

const app = $("#app");
// Logo Beeyond (palabra con esquinas), toma el color del texto donde se coloca
const LOGO = `<svg class="logo" viewBox="0 0 210 58" role="img" aria-label="Beeyond"><path d="M3 38v15h14" fill="none" stroke="currentColor" stroke-width="5"/><text x="20" y="44" font-family="Rubik,Arial,sans-serif" font-weight="600" font-size="44" textLength="166" lengthAdjust="spacingAndGlyphs" fill="currentColor">Beeyond</text><path d="M193 5h14v15" fill="none" stroke="currentColor" stroke-width="5"/></svg>`;
const tema = () => (document.documentElement.dataset.theme === "dark" ? "dark" : "light");
function toggleTema() {
  const t = tema() === "dark" ? "light" : "dark";
  if (t === "dark") document.documentElement.dataset.theme = "dark"; else delete document.documentElement.dataset.theme;
  try { localStorage.setItem("bym-tema", t); } catch (e) {}
  document.querySelectorAll("[data-tema]").forEach((b) => (b.textContent = temaLabel()));
}
const temaLabel = () => (tema() === "dark" ? "☀ Modo claro" : "☾ Modo oscuro");
const ROUTES = {
  control: { t: "Control", v: viewControl, live: true }, avance: { t: "Avance", v: viewAvance, live: true },
  campanas: { t: "Campañas", v: viewCampanas, live: true }, inventario: { t: "Inventario", v: viewInventario, live: true },
  "carga-campana": { t: "Nueva campaña", v: viewCargaCampana, min: "verificador" },
  "carga-inventario": { t: "Carga de inventario", v: viewCargaInventario, min: "verificador" },
  cargas: { t: "Historial de cargas", v: viewHistorial, live: true }, usuarios: { t: "Usuarios", v: viewUsuarios, min: "admin", live: true },
};
let route = "", redraw = null, unsubs = [];

async function boot() {
  const demo = new URLSearchParams(location.search).has("demo") || !FIREBASE_CONFIG.apiKey;
  if (demo) { const m = await import("./backend-demo.js"); S.be = await m.createDemoBackend(); }
  else { const m = await import("./backend-firebase.js"); S.be = await m.createFirebaseBackend(FIREBASE_CONFIG); }
  S.be.onAuth(onAuth);
}

function onAuth(u) {
  unsubs.forEach((f) => f && f()); unsubs = [];
  S.auth = u; S.perfil = null; S.loaded.clear();
  if (!u) return showLogin();
  app.innerHTML = `<div class="empty">Cargando…</div>`;
  unsubs.push(S.be.watchDoc("users/" + u.uid, (p) => {
    const first = !S.perfil;
    S.perfil = p;
    if (!p || !p.activo) return showNoAccess(p);
    if (first) startData(); else shell();
  }, () => showNoAccess(null)));
}

function startData() {
  const sub = (col, fn) => unsubs.push(S.be.watchCol(col, (docs) => { fn(docs); S.loaded.add(col); refresh(); }, (e) => { console.error(col, e); toast("Se perdió la conexión con la base. Recarga la página."); }));
  sub("users", (d) => { S.users = new Map(d.map((x) => [x.id, x])); });
  sub("catalogo", (d) => {
    S.catalogo = new Map(); S.ciudadesDoc = new Set();
    for (const doc of d) { S.ciudadesDoc.add(doc.id); for (const [id, s] of Object.entries(doc.sitios || {})) S.catalogo.set(id, { ...s, ciudad: s.ciudad || doc.id }); }
  });
  sub("campanas", (d) => { S.campanas = d; });
  sub("periodos", (d) => { S.periodos = d; });
  sub("cargas", (d) => { S.cargas = d; });
  shell();
}

function refresh() {
  if (!S.perfil || !$("#main")) return;
  const b = $("#navBadge"); if (b) { const n = pendingCount(); b.textContent = n; b.hidden = !n; }
  if (S.loaded.size < 5) return;
  if ($("#mainLoading")) return go();
  const ae = document.activeElement, typing = $("#main").contains(ae) && /INPUT|TEXTAREA|SELECT/.test(ae?.tagName || "");
  const soft = route === "control" || route === "avance" || route === "inventario";
  if (ROUTES[route]?.live && redraw && !drawerOpenWithFocus() && (soft || !typing)) redraw(true);
}

function shell() {
  const nav = (id, label, extra = "") => `<a href="#${id}" data-r="${id}">${label}${extra}</a>`;
  app.innerHTML = `${S.be.mode === "demo" ? `<div class="demo"><b>Modo demostración:</b> los datos viven solo en este navegador. <button class="btn small" type="button" id="resetDemo">Reiniciar demo</button></div>` : ""}
  <div class="shell"><aside class="side">
    <div class="brand">${LOGO}<b>Comprobación fotográfica</b></div>
    <nav class="navgroup" aria-label="Operación"><span>Operación</span>${nav("avance", "Avance")}${nav("control", "Control")}${nav("campanas", "Campañas")}</nav>
    <nav class="navgroup" aria-label="Cargas"><span>Cargas</span>${can("verificador") ? nav("carga-campana", "Nueva campaña") + nav("carga-inventario", "Carga de inventario") : ""}${nav("cargas", "Historial", ` <span class="badge" id="navBadge" hidden></span>`)}</nav>
    <nav class="navgroup" aria-label="Catálogo"><span>Catálogo</span>${nav("inventario", "Inventario")}${can("admin") ? nav("usuarios", "Usuarios") : ""}</nav>
    <div class="me"><div><b>${esc(S.perfil.nombre || S.auth.email)}</b><div class="note">${esc(ROLES[S.perfil.rol] || S.perfil.rol)} · ${esc(S.auth.email)}</div></div><div class="row2"><button class="btn small themebtn" type="button" data-tema>${temaLabel()}</button><button class="btn small" type="button" id="logout">Salir</button></div></div>
  </aside><main class="main" id="main"><div class="empty" id="mainLoading">Cargando datos…</div></main></div>`;
  $("#logout").onclick = () => S.be.signOut();
  document.querySelectorAll("[data-tema]").forEach((b) => (b.onclick = toggleTema));
  if ($("#resetDemo")) $("#resetDemo").onclick = () => S.be.resetDemo();
  route = "";
  refresh();
}

function go() {
  if (!S.perfil || !$("#main")) return;
  let r = location.hash.slice(1) || "avance";
  if (!ROUTES[r] || (ROUTES[r].min && !can(ROUTES[r].min))) r = "avance";
  route = r; closeDrawer();
  document.querySelectorAll("[data-r]").forEach((a) => { if (a.dataset.r === r) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
  document.title = ROUTES[r].t + " · Comprobación Beeyond";
  const main = $("#main"); main.onclick = null; main.onchange = null; main.scrollTop = 0;
  redraw = ROUTES[r].v(main) || null;
  refresh();
}
window.addEventListener("hashchange", go);

function showLogin(msg) {
  app.innerHTML = `<div class="login">${LOGO}<form id="lf" autocomplete="on">
    <h1>Comprobación fotográfica</h1><p>Entra con tu correo @${esc(DOMINIO)}</p>
    ${S.be.mode === "demo" ? `<div class="msg warn">Modo demostración. Usuarios: admin@, aprobador@, verificador@ o consulta@${esc(DOMINIO)} · contraseña demo1234</div>` : ""}
    <label class="field"><span>Correo</span><input type="email" id="le" required autocomplete="username"></label>
    <label class="field"><span>Contraseña</span><input type="password" id="lp" required autocomplete="current-password"></label>
    <button class="btn primary" type="submit" id="lb">Entrar</button>
    <button class="btn" type="button" id="lr">Olvidé mi contraseña</button>
    <div id="lm" ${msg ? "" : "hidden"} class="msg err">${esc(msg || "")}</div>
    <button class="btn small" type="button" data-tema style="align-self:center">${temaLabel()}</button></form></div>`;
  document.querySelectorAll("[data-tema]").forEach((b) => (b.onclick = toggleTema));
  const m = $("#lm");
  $("#lf").onsubmit = async (e) => {
    e.preventDefault(); $("#lb").disabled = true; m.hidden = true;
    try { await S.be.signIn($("#le").value.trim(), $("#lp").value); }
    catch (err) { m.hidden = false; m.className = "msg err"; m.textContent = /invalid|wrong|user-not-found|credential/.test(err.code || "") ? "Correo o contraseña incorrectos." : err.code === "auth/too-many-requests" ? "Demasiados intentos. Espera unos minutos." : "No se pudo entrar. Revisa tu conexión."; $("#lb").disabled = false; }
  };
  $("#lr").onclick = async () => {
    const e = $("#le").value.trim(); m.hidden = false;
    if (!e) { m.className = "msg err"; m.textContent = "Escribe tu correo y vuelve a presionar."; return; }
    try { await S.be.resetPassword(e); m.className = "msg ok"; m.textContent = "Si el correo tiene cuenta, te llegará un enlace para crear una contraseña nueva."; }
    catch (err) { m.className = "msg err"; m.textContent = "No se pudo enviar el correo."; }
  };
}

async function showNoAccess(p) {
  // Configuración inicial: la primera persona del dominio se convierte en administradora.
  let setup = null;
  try { setup = await S.be.getDoc("config/setup"); } catch (e) { setup = { listo: true }; }
  const email = S.auth?.email || "";
  const okDomain = email.endsWith("@" + DOMINIO);
  app.innerHTML = `<div class="login"><form id="na"><h1>${!setup && !p ? "Configuración inicial" : "Sin acceso"}</h1>
    ${!setup && !p && okDomain ? `<p>Todavía no hay administradores. Como primera persona en entrar, puedes convertirte en administradora de la app.</p>
      <label class="field"><span>Tu nombre</span><input type="text" id="nn" required></label><button class="btn primary" type="submit">Ser administradora</button>`
      : `<p>${p && !p.activo ? "Tu usuario está desactivado." : "Tu cuenta todavía no tiene permisos en la app."} Pide a un administrador que te dé de alta.</p>`}
    <button class="btn" type="button" id="out">Salir</button></form></div>`;
  $("#out").onclick = () => S.be.signOut();
  $("#na").onsubmit = async (e) => {
    e.preventDefault();
    try {
      await S.be.batch([{ op: "set", path: "users/" + S.auth.uid, data: { email, nombre: $("#nn").value.trim(), rol: "admin", activo: true, creado: nowIso() } },
        { op: "set", path: "config/setup", data: { listo: true, creado: nowIso(), por: S.auth.uid } }]);
    } catch (err) { toast("No se pudo completar la configuración inicial."); }
  };
}

boot().catch((e) => { console.error(e); app.innerHTML = `<div class="empty">No se pudo iniciar la app. Revisa tu conexión.</div>`; });
