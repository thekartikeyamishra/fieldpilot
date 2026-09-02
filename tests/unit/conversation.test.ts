import { describe, expect, it } from "vitest";
import { detectVoiceIntent, forSpeech, isBargeIn, isSelfEcho, similarity } from "@/components/conversation";

describe("self-echo suppression", () => {
  const spoken = "Pump 3 has two previous vibration incidents. Inspect the rear bearing.";

  it("discards the agent hearing its own speech", () => {
    expect(isSelfEcho("pump 3 has two previous vibration incidents", spoken, true)).toBe(true);
  });

  it("does not discard a genuine reply that shares a few words", () => {
    expect(isSelfEcho("the bearing is making a knocking noise", spoken, true)).toBe(false);
  });

  it("never suppresses anything while the agent is silent", () => {
    expect(isSelfEcho(spoken, spoken, false)).toBe(false);
  });

  it("handles empty input without dividing by zero", () => {
    expect(similarity("", "anything")).toBe(0);
  });
});

describe("spoken commands", () => {
  it("recognises approval in English and mixed Indian speech", () => {
    for (const t of ["yes", "Yeah", "do it", "go ahead", "haan", "theek hai", "ठीक है", "sari"]) {
      expect(detectVoiceIntent(t).kind, t).toBe("approve");
    }
  });

  it("recognises rejection", () => {
    for (const t of ["no", "cancel", "nahi", "नहीं", "reject"]) {
      expect(detectVoiceIntent(t).kind, t).toBe("reject");
    }
  });

  it("does NOT swallow a sentence that merely starts with yes", () => {
    // The dangerous case: treating this as a bare approval would execute the
    // wrong draft and discard what the technician actually said.
    expect(detectVoiceIntent("yes but create it for pump 9 instead").kind).toBe("none");
  });

  it("treats an ordinary report as content, not a command", () => {
    expect(detectVoiceIntent("the pressure is 8.7 bar").kind).toBe("none");
  });

  it("recognises stop and repeat", () => {
    expect(detectVoiceIntent("wait").kind).toBe("stop");
    expect(detectVoiceIntent("say again").kind).toBe("repeat");
  });
});

describe("barge-in", () => {
  it("ignores a single stray syllable", () => {
    expect(isBargeIn("uh")).toBe(false);
  });

  it("stops the agent on a real attempt to speak", () => {
    expect(isBargeIn("no wait")).toBe(true);
    expect(isBargeIn("actually")).toBe(true);
  });
});

describe("speech formatting", () => {
  it("spells out an asset tag instead of mumbling it", () => {
    expect(forSpeech("Check P-003 now")).toContain("P 0 0 3");
  });

  it("never reads a UUID aloud", () => {
    const spoken = forSpeech("Created 3f2a1b4c-5d6e-7f80-9a1b-2c3d4e5f6071 successfully");
    expect(spoken).not.toMatch(/[0-9a-f]{8}-/);
    expect(spoken).toContain("that record");
  });
});
