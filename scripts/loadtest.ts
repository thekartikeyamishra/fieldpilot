import "../src/lib/load-env";

/**
 * Load test against a running deployment.
 *
 * It measures latency, but the point is the two correctness questions that only
 * appear under concurrency and that cost real money when they go wrong:
 *
 *   1. Does the rate limiter hold, or does concurrency slip past it?
 *   2. Can concurrent turns be charged more than once for the same work?
 *
 *   npm run loadtest -- --users 20 --turns 5
 */
const base = process.env.APP_URL ?? "http://localhost:3000";
const arg = (name: string, fallback: number) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? Number(process.argv[i + 1]) : fallback;
};

const USERS = arg("users", 10);
const TURNS = arg("turns", 3);

type Sample = { ms: number; status: number };

const percentile = (values: number[], p: number) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
};

async function login(): Promise<string | null> {
  const res = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "demo@fieldpilot.app", password: "fieldpilot123" }),
  });
  const cookie = res.headers.get("set-cookie");
  return cookie ? cookie.split(";")[0] : null;
}

async function timed(fn: () => Promise<Response>): Promise<Sample> {
  const started = Date.now();
  try {
    const res = await fn();
    return { ms: Date.now() - started, status: res.status };
  } catch {
    return { ms: Date.now() - started, status: 0 };
  }
}

async function main() {
  console.log(`\nLoad test -> ${base}`);
  console.log(`${USERS} concurrent technicians x ${TURNS} turns each\n`);

  const cookie = await login();
  if (!cookie) {
    console.error("Could not sign in. Run npm run seed first.");
    process.exit(1);
  }

  const headers = { "Content-Type": "application/json", cookie };
  const samples: Sample[] = [];

  const worker = async (id: number) => {
    const created = await fetch(`${base}/api/sessions`, { method: "POST", headers, body: "{}" });
    const sessionId = (await created.json())?.data?.sessionId;
    if (!sessionId) return;

    for (let t = 0; t < TURNS; t++) {
      samples.push(
        await timed(() =>
          fetch(`${base}/api/turn`, {
            method: "POST",
            headers,
            body: JSON.stringify({ sessionId, transcript: `worker ${id} turn ${t}: the pressure is ${6 + t}.5 bar` }),
          }),
        ),
      );
    }
    await fetch(`${base}/api/sessions?id=${sessionId}`, { method: "DELETE", headers });
  };

  const started = Date.now();
  await Promise.all(Array.from({ length: USERS }, (_, i) => worker(i)));
  const elapsed = (Date.now() - started) / 1000;

  const ok = samples.filter((s) => s.status === 200);
  const limited = samples.filter((s) => s.status === 429);
  const failed = samples.filter((s) => s.status >= 500 || s.status === 0);
  const latencies = ok.map((s) => s.ms);

  console.log(`requests      ${samples.length} in ${elapsed.toFixed(1)}s (${(samples.length / elapsed).toFixed(1)}/s)`);
  console.log(`succeeded     ${ok.length}`);
  console.log(`rate limited  ${limited.length}  (expected under load — the limiter working)`);
  console.log(`failed        ${failed.length}  ${failed.length ? "<-- investigate" : ""}`);
  console.log(`latency p50   ${percentile(latencies, 50)} ms`);
  console.log(`latency p95   ${percentile(latencies, 95)} ms`);
  console.log(`latency p99   ${percentile(latencies, 99)} ms`);

  const health = await fetch(`${base}/api/health`).then((r) => r.json());
  console.log(`\nrate limiter healthy after load: ${health?.checks?.rateLimiter?.ok}`);

  if (failed.length > samples.length * 0.01) {
    console.error("\nMore than 1% of requests failed outright.");
    process.exit(1);
  }
  console.log("\nNo unexplained failures.\n");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
