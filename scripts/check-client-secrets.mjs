// Fails the build if a server-only secret — its value, or even its name — appears in anything
// the browser can download: client JS/CSS chunks and prerendered HTML/RSC payloads.
// Runs after `next build` (npm run build), locally and on Vercel.
import fs from "node:fs";
import path from "node:path";

const SECRETS = ["LLM_API_KEY", "GEMINI_API_KEY", "GOOGLE_API_KEY", "ANTHROPIC_API_KEY", "SUPABASE_SERVICE_ROLE_KEY", "COOKIE_SECRET", "INTERNAL_PASSWORD"];
const distDir = process.env.NEXT_DIST_DIR || ".next";

// Values from the environment and .env.local (the latter never deployed, but present on dev machines).
const values = new Map();
const fromFile = fs.existsSync(".env.local") ? fs.readFileSync(".env.local", "utf8") : "";
for (const name of SECRETS) {
  const fileValue = fromFile.match(new RegExp(`^${name}=(.*)$`, "m"))?.[1];
  for (const raw of [process.env[name], fileValue]) {
    const v = raw?.trim().replace(/^(["'])(.*)\1$/, "$2");
    if (v && v.length >= 8) values.set(v, name);
  }
}

function* files(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* files(p);
    else yield p;
  }
}

const clientFiles = [...files(path.join(distDir, "static")), ...[...files(path.join(distDir, "server", "app"))].filter((f) => /\.(html|rsc|body)$/.test(f))];
if (!clientFiles.length) {
  console.error(`check-client-secrets: no build output in ${distDir}/ — run next build first.`);
  process.exit(1);
}

const problems = [];
for (const file of clientFiles) {
  const text = fs.readFileSync(file, "utf8");
  for (const name of SECRETS) if (text.includes(name)) problems.push(`${file}: mentions ${name}`);
  for (const [value, name] of values) if (text.includes(value)) problems.push(`${file}: contains the value of ${name}`);
}

if (problems.length) {
  console.error("Server-only secrets found in client build output:\n  " + problems.join("\n  "));
  process.exit(1);
}
console.log(`check-client-secrets: ${clientFiles.length} client files clean (${values.size} secret values and ${SECRETS.length} names checked).`);
