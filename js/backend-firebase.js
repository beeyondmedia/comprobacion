// Backend real: Firebase Auth (correo y contraseña) + Cloud Firestore.
const V = "10.14.1";
const base = `https://www.gstatic.com/firebasejs/${V}`;

export async function createFirebaseBackend(config) {
  const { initializeApp, deleteApp } = await import(`${base}/firebase-app.js`);
  const A = await import(`${base}/firebase-auth.js`);
  const F = await import(`${base}/firebase-firestore.js`);

  const app = initializeApp(config);
  const auth = A.getAuth(app);
  auth.languageCode = "es";
  const fs = F.getFirestore(app);
  const DEL = F.deleteField();

  const ref = (path) => F.doc(fs, path);
  const flat = (fields) => {
    const out = [];
    for (const [segs, value] of fields) out.push(new F.FieldPath(...segs), value);
    return out;
  };

  return {
    mode: "firebase",
    DEL,
    onAuth(cb) {
      return A.onAuthStateChanged(auth, (u) => cb(u ? { uid: u.uid, email: u.email } : null));
    },
    signIn: (email, pw) => A.signInWithEmailAndPassword(auth, email, pw),
    signOut: () => A.signOut(auth),
    resetPassword: (email) => A.sendPasswordResetEmail(auth, email),
    // Crea un usuario sin cerrar la sesión del administrador (instancia secundaria).
    async createUser(email, pw) {
      const sec = initializeApp(config, "alta-" + Date.now());
      try {
        const sa = A.getAuth(sec);
        const cred = await A.createUserWithEmailAndPassword(sa, email, pw);
        await A.signOut(sa);
        return cred.user.uid;
      } finally {
        await deleteApp(sec);
      }
    },
    watchDoc(path, cb, err) {
      return F.onSnapshot(ref(path), (s) => cb(s.exists() ? s.data() : null), err);
    },
    watchCol(path, cb, err) {
      return F.onSnapshot(F.collection(fs, path), (s) => cb(s.docs.map((d) => ({ id: d.id, ...d.data() }))), err);
    },
    async getDoc(path) {
      const s = await F.getDoc(ref(path));
      return s.exists() ? s.data() : null;
    },
    // ops: {op:'set', path, data} | {op:'update', path, fields:[[segs], value]} | {op:'delete', path}
    async batch(ops) {
      for (let i = 0; i < ops.length; i += 450) {
        const b = F.writeBatch(fs);
        for (const o of ops.slice(i, i + 450)) {
          if (o.op === "set") b.set(ref(o.path), o.data);
          else if (o.op === "update") {
            const [f0, v0, ...rest] = flat(o.fields);
            b.update(ref(o.path), f0, v0, ...rest);
          } else if (o.op === "delete") b.delete(ref(o.path));
        }
        await b.commit();
      }
    },
  };
}
