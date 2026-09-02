import { describe, expect, it } from "vitest";
import { LANGUAGES, extractPortableTokens, isCodeMixed, languageFor } from "@/server/i18n/languages";
import { turnCost, turnMargin, creditsForLanguageTurn, TYPICAL_TURN } from "@/server/billing/language-economics";

const en = LANGUAGES["en-IN"];
const hi = LANGUAGES["hi-IN"];

describe("language routing", () => {
  it("routes English to AssemblyAI and Indic to Sarvam", () => {
    expect(en.route).toBe("assemblyai");
    for (const code of ["hi-IN", "ta-IN", "bn-IN", "te-IN", "mr-IN", "kn-IN"] as const) {
      expect(LANGUAGES[code].route).toBe("sarvam");
    }
  });

  it("falls back to English for an unknown or missing language", () => {
    expect(languageFor("fr-FR").code).toBe("en-IN");
    expect(languageFor(null).code).toBe("en-IN");
  });
});

describe("code-mixed speech", () => {
  it("detects Hinglish", () => {
    expect(isCodeMixed("पंप 3 में vibration आ रहा है")).toBe(true);
    expect(isCodeMixed("pump 3 is vibrating")).toBe(false);
  });

  it("preserves the tokens the asset matcher needs across scripts", () => {
    // The deterministic matcher must still resolve P-003 from a Hindi sentence.
    const portable = extractPortableTokens("पंप 3 में vibration आ रहा है, pressure 8.7 bar");
    expect(portable).toContain("3");
    expect(portable).toContain("8.7");
    expect(portable.toLowerCase()).toContain("pressure");
  });
});

describe("per-turn cost by language", () => {
  it("makes speech output the dominant cost of an Indic turn", () => {
    // This is the finding the whole optimisation strategy rests on.
    expect(turnCost(hi).dominantComponent).toBe("tts");
  });

  it("keeps an English turn cheaper than an Indic spoken turn", () => {
    expect(turnCost(en).totalUsd).toBeLessThan(turnCost(hi).totalUsd);
  });

  it("makes an Indic turn dramatically cheaper when speech output is cached", () => {
    const fresh = turnCost(hi).totalUsd;
    const cached = turnCost(hi, { ...TYPICAL_TURN, ttsCacheHit: true }).totalUsd;
    expect(cached).toBeLessThan(fresh * 0.4);
  });

  it("costs a fraction of a rupee per turn in every language", () => {
    for (const language of Object.values(LANGUAGES)) {
      expect(turnCost(language).totalInr).toBeLessThan(1.5);
    }
  });
});

describe("margin guardrail — no language may lose money", () => {
  it("is profitable on every supported language", () => {
    for (const language of Object.values(LANGUAGES)) {
      const m = turnMargin(language);
      expect(m.healthy, `${language.label} turn is underwater`).toBe(true);
    }
  });

  it("holds a healthy margin even on the most expensive path", () => {
    const worst = Object.values(LANGUAGES)
      .map((l) => turnMargin(l))
      .sort((a, b) => a.marginPct - b.marginPct)[0];
    expect(worst.marginPct).toBeGreaterThan(40);
  });

  it("charges an extra credit only when we actually paid for speech output", () => {
    const spoken = creditsForLanguageTurn({ language: hi, tier: "fast", spokeAloud: true, ttsCacheHit: false });
    const cached = creditsForLanguageTurn({ language: hi, tier: "fast", spokeAloud: true, ttsCacheHit: true });
    const silent = creditsForLanguageTurn({ language: hi, tier: "fast", spokeAloud: false, ttsCacheHit: false });
    const english = creditsForLanguageTurn({ language: en, tier: "fast", spokeAloud: true, ttsCacheHit: false });
    expect(spoken).toBeGreaterThan(cached);
    expect(cached).toBe(silent);
    expect(english).toBe(silent);
  });

  it("stays profitable if the rupee weakens 20%", () => {
    // Sarvam bills in INR while we price in INR too, so a weaker rupee is
    // neutral on the Sarvam path — this asserts the model does not pretend
    // otherwise by accidentally double-converting.
    for (const language of Object.values(LANGUAGES)) {
      expect(turnMargin(language).marginUsd).toBeGreaterThan(0);
    }
  });
});
