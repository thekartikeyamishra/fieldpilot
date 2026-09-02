import "../src/lib/load-env";
import { createHash } from "node:crypto";

/**
 * Portability round-trip check. Fetches the export for a signed-in session and
 * verifies every entity checksum against a recomputation. An export that cannot
 * be verified is not an export.
 *
 * Usage: npm run dev, sign in, copy the fp_session cookie, then:
 *   FP_COOKIE="fp_session=..." npm run export:test
 */
const base = process.env.APP_URL ?? "http://localhost:3000";
const cookie = process.env.FP_COOKIE;

async function main() {
  if (!cookie) throw new Error("Set FP_COOKIE to a signed-in session cookie.");

  const res = await fetch(`${base}/api/export`, { headers: { cookie } });
  if (!res.ok) throw new Error(`export failed: ${res.status}`);

  const payload = (await res.json()) as {
    manifest: { checksums: Record<string, string>; entityCounts: Record<string, number> };
    entities: Record<string, unknown[]>;
  };

  let failures = 0;
  for (const [name, rows] of Object.entries(payload.entities)) {
    // Must mirror exportStream exactly: sha256 over each row's JSON,
    // concatenated in id order — not over the serialised array.
    const hash = createHash("sha256");
    for (const row of rows) hash.update(JSON.stringify(row));
    const actual = hash.digest("hex");
    const expected = payload.manifest.checksums[name];
    const counted = payload.manifest.entityCounts[name] === rows.length;
    const ok = actual === expected && counted;
    if (!ok) failures++;
    console.log(`${ok ? "PASS" : "FAIL"}  ${name.padEnd(22)} ${rows.length} rows`);
  }

  if (failures) {
    console.error(`\n${failures} entity checksum mismatches.`);
    process.exit(1);
  }
  console.log("\nPortability round-trip verified.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
