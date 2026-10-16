import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const __dirname = fileURLToPath(new URL(".", import.meta.url));
const root = __dirname;
const files = {
  userAuth: path.join(root, "src/lib/userAuth.ts"),
  firebase: path.join(root, "src/lib/firebase.ts"),
};

function read(p) { return fs.readFileSync(p, "utf8"); }
function write(p, s) { fs.writeFileSync(p, s, "utf8"); }

// ---------- userAuth.ts ----------
let u = read(files.userAuth);
u = u.replace(/\r\n/g, "\n");

const impOld = 'import { auth, signInWithGoogle, signInWithFacebook, signOut as firebaseSignOut } from "@/src/lib/firebase";';
const impNew = 'import { auth, signOut } from "@/src/lib/firebase";';
if (u.includes(impOld)) { u = u.replace(impOld, impNew); console.log("userAuth: import fixed"); }

const appUserOld = '  provider?: "google" | "facebook" | "local";';
const appUserNew = '  provider?: "google" | "local";';
if (u.includes(appUserOld)) { u = u.replace(appUserOld, appUserNew); console.log("userAuth: AppUser union fixed"); }

const marker = "export async function facebookSignIn(): Promise<AppUser> {";
const m = u.indexOf(marker);
if (m === -1) throw new Error("facebookSignIn marker not found in userAuth");
const end = u.indexOf("\n/**\n * Signs out.", m);
if (end === -1) throw new Error("signOutFlow marker not found in userAuth");
u = u.slice(0, m) + u.slice(end);
console.log("userAuth: facebookSignIn removed");

write(files.userAuth, u);
console.log("userAuth written:", u.split("\n").length, "lines");

// ---------- firebase.ts ----------
let f = read(files.firebase);
f = f.replace(/\r\n/g, "\n");
const fb = {
  imp: 'import {\n  getAuth,\n  GoogleAuthProvider,\n  FacebookAuthProvider,\n  signInWithPopup,\n  signOut as firebaseSignOut,\n  onAuthStateChanged,\n  type Auth,\n  type User,\n} from "firebase/auth";',
  fb2: 'import {\n  getAuth,\n  GoogleAuthProvider,\n  signInWithPopup,\n  signOut as firebaseSignOut,\n  onAuthStateChanged,\n  type Auth,\n  type User,\n} from "firebase/auth";',
  exportFb: "export const facebookProvider = new FacebookAuthProvider();\n",
  signInWf: "\n/**\n * Popup-based Facebook sign-in. Throws so callers can surface the error.\n * A fresh provider per call with `auth_type: 'reauthenticate'` forces the\n * Facebook login page every time (MASLA 9), even if a session already exists.\n */\nexport async function signInWithFacebook(): Promise<User> {\n  if (!auth) throw new Error(NOT_CONFIGURED);\n  const provider = new FacebookAuthProvider();\n  provider.addScope(\"email\");\n  provider.addScope(\"public_profile\");\n  provider.setCustomParameters({ auth_type: \"reauthenticate\" });\n  const result = await signInWithPopup(auth, provider);\n  return result.user;\n}\n",
};
if (f.includes(fb.imp)) { f = f.replace(fb.imp, fb.fb2); console.log("firebase: import fixed"); }
if (f.includes(fb.exportFb)) { f = f.replace(fb.exportFb, ""); console.log("firebase: facebookProvider export removed"); }
if (f.includes(fb.signInWf)) { f = f.replace(fb.signInWf, ""); console.log("firebase: signInWithFacebook function removed"); }
write(files.firebase, f);
console.log("firebase written:", f.split("\n").length, "lines");

// ---------- check remaining Facebook references ----------
const all = [path.join(root, "app/login/page.tsx"), path.join(root, "app/privacy/page.tsx"), path.join(root, "app/terms/page.tsx")];
for (const p of all) {
  const c = read(p);
  const hits = c.split("\n").filter(l => l.includes("Facebook") || l.includes("facebook"));
  if (hits.length) console.log("REMAINING Facebook in", p, ":", hits.map(l=>l.trim()).join(" | "));
}
console.log("DONE");