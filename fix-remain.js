import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const __dirname = fileURLToPath(new URL(".", import.meta.url));
const root = __dirname;

function read(p) { return fs.readFileSync(p, "utf8"); }
function write(p, s) { fs.writeFileSync(p, s, "utf8"); }
function lf(s) { return s.replace(/\r\n/g, "\n"); }

let u = lf(read(path.join(root, "app", "login", "page.tsx")));

// 1a) setLoading("google") -> setLoading(true)
const a1 = '    setLoading("google");';
const b1 = '    setLoading(true);';
if (!u.includes(a1)) throw new Error("a1 not found");
u = u.replace(a1, b1);
console.log("1a) setLoading fixed");

// 1b) google popup call -> signInWithGoogle
const a2 = [
  "    try {",
  "      const provider = new GoogleAuthProvider();",
  "// Force the account chooser so users can pick which Google account to use.",
  '      provider.setCustomParameters({ prompt: "select_account" });',
  '      const result = await signInWithPopup(auth, provider);',
  '      completeLogin(result.user, "google");',
].join("\n");
const b2 = [
  "    try {",
  "      const result = await signInWithGoogle();",
  "      completeLogin(result);",
].join("\n");
if (!u.includes(a2)) throw new Error("a2 not found");
u = u.replace(a2, b2);
console.log("1b) google signInWithPopup -> signInWithGoogle");

// 1c) remove handleFacebook block (to 'return (')
const fbStart = u.indexOf("  async function handleFacebook() {");
const retIdx = u.indexOf("    return (", fbStart);
if (fbStart === -1 || retIdx === -1) throw new Error("fb block bounds not found");
u = u.slice(0, fbStart) + u.slice(retIdx);
console.log("1c) handleFacebook removed");

// 2) remove Facebook button block
const fbBtnStart = u.indexOf("          {/* Facebook button */}");
if (fbBtnStart === -1) throw new Error("fbBtnStart not found");
const btnClose = u.indexOf("          </button>", fbBtnStart);
if (btnClose === -1) throw new Error("btnClose not found");
u = u.slice(0, fbBtnStart) + u.slice(btnClose + "          </button>".length);
console.log("2) Facebook button removed");

// 3) remove Secure note
const snStart = u.indexOf("          {/* Secure note */}");
if (snStart === -1) throw new Error("snStart not found");
const snClose = u.indexOf("          </p>", snStart) + "          </p>".length;
u = u.slice(0, snStart) + u.slice(snClose);
console.log("3) Secure note removed");

write(path.join(root, "app", "login", "page.tsx"), u);
console.log("login/page.tsx written:", u.split("\n").length, "lines");
console.log("DONE");
