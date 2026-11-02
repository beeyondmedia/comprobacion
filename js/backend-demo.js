// Backend de demostración: todo vive en este navegador (localStorage).
// Sirve para probar la app sin configurar Firebase: abre la app con ?demo
// Usuarios de prueba (contraseña demo1234):
//   admin@beeyondmedia.com, aprobador@beeyondmedia.com,
//   verificador@beeyondmedia.com, consulta@beeyondmedia.com
const KEY = "bym-demo-db-v1";
const DEL = { __del: true };

function load() {
  try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && s.docs) return s; } catch (e) {}
  const now = new Date().toISOString();
  const mk = (uid, email, nombre, rol) => ({ email, nombre, rol, activo: true, creado: now });
  return {
    auth: {
      "admin@beeyondmedia.com": { uid: "u-admin", pw: "demo1234" },
      "aprobador@beeyondmedia.com": { uid: "u-aprob", pw: "demo1234" },
      "verificador@beeyondmedia.com": { uid: "u-verif", pw: "demo1234" },
      "consulta@beeyondmedia.com": { uid: "u-cons", pw: "demo1234" },
    },
    docs: {
      "users/u-admin": mk("u-admin", "admin@beeyondmedia.com", "Admin Demo", "admin"),
      "users/u-aprob": mk("u-aprob", "aprobador@beeyondmedia.com", "Aprobador Demo", "aprobador"),
      "users/u-verif": mk("u-verif", "verificador@beeyondmedia.com", "Verificador Demo", "verificador"),
      "users/u-cons": mk("u-cons", "consulta@beeyondmedia.com", "Consulta Demo", "consulta"),
      "config/setup": { listo: true, creado: now },
    },
    session: null,
  };
}

export async function createDemoBackend() {
  let S = load();
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} };
  const authL = new Set();
  const docL = new Map(); // path -> Set(cb)
  const colL = new Map(); // colPath -> Set(cb)
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const colOf = (path) => path.split("/").slice(0, -1).join("/");
  const listCol = (col) => Object.keys(S.docs).filter((p) => colOf(p) === col).sort()
    .map((p) => ({ id: p.split("/").pop(), ...clone(S.docs[p]) }));
  function emit(paths) {
    const cols = new Set();
    for (const p of paths) {
      (docL.get(p) || []).forEach((cb) => cb(S.docs[p] ? clone(S.docs[p]) : null));
      cols.add(colOf(p));
    }
    for (const c of cols) (colL.get(c) || []).forEach((cb) => cb(listCol(c)));
  }
  const user = () => (S.session ? { uid: S.session.uid, email: S.session.email } : null);
  const wait = () => new Promise((r) => setTimeout(r, 30));

  return {
    mode: "demo",
    DEL,
    onAuth(cb) { authL.add(cb); setTimeout(() => cb(user()), 0); return () => authL.delete(cb); },
    async signIn(email, pw) {
      await wait();
      const a = S.auth[String(email).toLowerCase()];
      if (!a || a.pw !== pw) { const e = new Error("bad"); e.code = "auth/invalid-credential"; throw e; }
      S.session = { uid: a.uid, email: String(email).toLowerCase() }; save();
      authL.forEach((cb) => cb(user()));
    },
    async signOut() { S.session = null; save(); authL.forEach((cb) => cb(null)); },
    async resetPassword() { await wait(); },
    async createUser(email, pw) {
      await wait();
      email = email.toLowerCase();
      if (S.auth[email]) { const e = new Error("exists"); e.code = "auth/email-already-in-use"; throw e; }
      const uid = "u-" + Math.random().toString(36).slice(2, 10);
      S.auth[email] = { uid, pw }; save(); return uid;
    },
    watchDoc(path, cb) {
      if (!docL.has(path)) docL.set(path, new Set());
      docL.get(path).add(cb);
      setTimeout(() => cb(S.docs[path] ? clone(S.docs[path]) : null), 0);
      return () => docL.get(path).delete(cb);
    },
    watchCol(path, cb) {
      if (!colL.has(path)) colL.set(path, new Set());
      colL.get(path).add(cb);
      setTimeout(() => cb(listCol(path)), 0);
      return () => colL.get(path).delete(cb);
    },
    async getDoc(path) { return S.docs[path] ? clone(S.docs[path]) : null; },
    async batch(ops) {
      await wait();
      const next = clone(S.docs);
      for (const o of ops) {
        if (o.op === "set") next[o.path] = clone(o.data);
        else if (o.op === "delete") delete next[o.path];
        else if (o.op === "update") {
          if (!next[o.path]) { const e = new Error("not-found"); e.code = "not-found"; throw e; }
          for (const [segs, value] of o.fields) {
            let cur = next[o.path];
            for (const s of segs.slice(0, -1)) { if (typeof cur[s] !== "object" || cur[s] === null) cur[s] = {}; cur = cur[s]; }
            const last = segs[segs.length - 1];
            if (value && value.__del) delete cur[last]; else cur[last] = clone(value);
          }
        }
      }
      S.docs = next; save();
      emit(ops.map((o) => o.path));
    },
    resetDemo() { localStorage.removeItem(KEY); location.reload(); },
  };
}
