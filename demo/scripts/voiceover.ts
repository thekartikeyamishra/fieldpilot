import { mkdirSync, writeFileSync } from "node:fs";
import { config } from "dotenv";

config({ path: "../.env.local" });
config({ path: ".env.local" });

/**
 * Generates the voiceover with Sarvam Bulbul, reusing the key already in the
 * main project. Split per scene, because TTS quality degrades on long inputs
 * and one bad line should not mean re-recording the whole track.
 */
const LINES: Array<{ scene: string; text: string }> = [
  { scene: "02-problem", text: "A machine breaks. The technician knows what's wrong in seconds. But recording it means stopping work, walking to a terminal, finding the asset, reading its history, and typing. So it gets written later, from memory. Or not at all." },
  { scene: "04-speak", text: "With FieldPilot, they just say it. AssemblyAI streams the speech, and pump three resolves to asset P dash zero zero three by deterministic match. No model call, no cost, and nothing to hallucinate." },
  { scene: "05-evidence", text: "Then it pulls that machine's actual history. Two prior vibration incidents. A pressure reading above range. The procedure that matches. Every reference is issued by the server, so the model can cite evidence. It cannot invent it." },
  { scene: "06-approve", text: "It proposes an urgent work order. It does not create one. The tool gateway checks the allowlist, the schema, the tenant, the role and the risk, then stops and waits for a human. One word. Approved. Work order created, audit trail written." },
  { scene: "07-architecture", text: "Underneath is not a voice wrapper. Identity, policy, a context graph, a model router and a tool gateway. Seven tools exist. There is no execute S Q L, no fetch U R L, no arbitrary code." },
  { scene: "08-economics", text: "And every turn is priced before it's spent. Rules and cache handle most of them for nothing. A full English turn costs twenty six paise, at seventy eight percent margin. Ten Indian languages, including code mixed speech." },
  { scene: "09-close", text: "FieldPilot. Talk through the job. It becomes completed work." },
];

async function main() {
  const key = process.env.SARVAM_API_KEY;
  if (!key) {
    console.error("SARVAM_API_KEY not set. Add it to ../.env.local, or use ElevenLabs — see VOICEOVER.md.");
    process.exit(1);
  }

  mkdirSync("public/vo", { recursive: true });

  for (const line of LINES) {
    const res = await fetch("https://api.sarvam.ai/text-to-speech", {
      method: "POST",
      headers: { "api-subscription-key": key, "Content-Type": "application/json" },
      body: JSON.stringify({
        text: line.text,
        target_language_code: process.env.VO_LANGUAGE ?? "en-IN",
        model: process.env.SARVAM_TTS_MODEL ?? "bulbul:v3",
        speaker: process.env.SARVAM_TTS_SPEAKER ?? "anushka",
      }),
    });

    if (!res.ok) {
      console.error(`${line.scene}: ${res.status} ${(await res.text()).slice(0, 160)}`);
      continue;
    }

    const data = (await res.json()) as { audios?: string[] };
    if (!data.audios?.[0]) {
      console.error(`${line.scene}: no audio returned`);
      continue;
    }

    const file = `public/vo/${line.scene}.wav`;
    writeFileSync(file, Buffer.from(data.audios[0], "base64"));
    console.log(`  wrote ${file}`);
  }

  console.log("\nPer-scene files written to public/vo/.");
  console.log("Concatenate into public/vo/voiceover.mp3, or line them up in any editor.");
  console.log("Then adjust SCENES in src/theme.ts so the picture matches your read.\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
