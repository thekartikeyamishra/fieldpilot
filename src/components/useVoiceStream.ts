"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Microphone -> AssemblyAI streaming WebSocket -> finalised turns.
 *
 * The browser never sees an API key. It asks our server for a single-use token
 * that expires in a minute; a reconnect mints a fresh one.
 */

export type VoiceState =
  | "idle"
  | "requesting-mic"
  | "connecting"
  | "listening"
  | "reconnecting"
  | "stopped"
  | "error";

type Options = {
  onFinalTurn: (transcript: string) => void;
  onPartial?: (transcript: string) => void;
  onError?: (message: string) => void;
};

const MAX_RECONNECTS = 3;

export function useVoiceStream({ onFinalTurn, onPartial, onError }: Options) {
  const [state, setState] = useState<VoiceState>("idle");
  const [partial, setPartial] = useState("");
  const [micLevel, setMicLevel] = useState(0);

  const wsRef = useRef<WebSocket | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const nodeRef = useRef<AudioWorkletNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const attemptsRef = useRef(0);
  const intentionalStopRef = useRef(false);

  const cleanupAudio = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    nodeRef.current?.disconnect();
    nodeRef.current = null;
    analyserRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    void audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
  }, []);

  const stop = useCallback(() => {
    intentionalStopRef.current = true;
    // Always terminate explicitly: an abandoned session bills for its full window.
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      try {
        wsRef.current.send(JSON.stringify({ type: "Terminate" }));
      } catch {
        /* socket already gone */
      }
    }
    wsRef.current?.close();
    wsRef.current = null;
    cleanupAudio();
    setPartial("");
    setMicLevel(0);
    setState("stopped");
  }, [cleanupAudio]);

  const start = useCallback(async () => {
    intentionalStopRef.current = false;
    setState("requesting-mic");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      streamRef.current = stream;

      setState("connecting");
      const res = await fetch("/api/voice/token", { method: "POST" });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json?.error?.message ?? "Voice is temporarily unavailable. Your work is safe.");
      }

      const { token, websocketUrl } = json.data as { token: string; websocketUrl: string };

      // 16 kHz mono is what the model expects; the context resamples for us.
      const ctx = new AudioContext({ sampleRate: 16000 });
      audioCtxRef.current = ctx;
      await ctx.audioWorklet.addModule("/pcm-worklet.js");

      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      analyserRef.current = analyser;
      source.connect(analyser);

      const node = new AudioWorkletNode(ctx, "pcm-worklet");
      nodeRef.current = node;
      source.connect(node);

      const ws = new WebSocket(`${websocketUrl}&token=${encodeURIComponent(token)}`);
      ws.binaryType = "arraybuffer";
      wsRef.current = ws;

      ws.onopen = () => {
        attemptsRef.current = 0;
        setState("listening");
        node.port.onmessage = (event) => {
          if (ws.readyState === WebSocket.OPEN) ws.send(event.data as ArrayBuffer);
        };
        meter(analyser);
      };

      ws.onmessage = (event) => {
        if (typeof event.data !== "string") return;
        let msg: Record<string, unknown>;
        try {
          msg = JSON.parse(event.data);
        } catch {
          return;
        }

        if (msg.type === "Turn") {
          const transcript = String(msg.transcript ?? "").trim();
          const endOfTurn = Boolean(msg.end_of_turn);
          const formatted = Boolean(msg.turn_is_formatted);

          if (!transcript) return;

          if (endOfTurn && formatted) {
            setPartial("");
            onFinalTurn(transcript);
          } else {
            setPartial(transcript);
            onPartial?.(transcript);
          }
        }

        if (msg.type === "Termination") {
          setState((s) => (s === "listening" ? "stopped" : s));
        }

        if (msg.type === "Error") {
          onError?.(String(msg.error ?? "The voice service reported a problem."));
        }
      };

      ws.onerror = () => {
        /* onclose carries the actionable signal; avoid duplicate messaging */
      };

      ws.onclose = () => {
        cleanupAudio();
        if (intentionalStopRef.current) return;

        if (attemptsRef.current < MAX_RECONNECTS) {
          attemptsRef.current += 1;
          setState("reconnecting");
          const backoff = 400 * 2 ** (attemptsRef.current - 1);
          setTimeout(() => void start(), backoff);
        } else {
          setState("error");
          onError?.("Voice connection dropped. Everything you've done so far is saved — try again, or type instead.");
        }
      };
    } catch (error) {
      cleanupAudio();
      setState("error");
      const message =
        (error as Error).name === "NotAllowedError"
          ? "Microphone access is blocked. Allow it in your browser, or type instead — nothing is lost."
          : ((error as Error).message ?? "Voice is temporarily unavailable.");
      onError?.(message);
    }
  }, [cleanupAudio, onError, onFinalTurn, onPartial]);

  const meter = (analyser: AnalyserNode) => {
    const data = new Uint8Array(analyser.frequencyBinCount);
    const tick = () => {
      analyser.getByteTimeDomainData(data);
      let peak = 0;
      for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i] - 128) / 128);
      setMicLevel(peak);
      rafRef.current = requestAnimationFrame(tick);
    };
    tick();
  };

  useEffect(() => {
    return () => {
      intentionalStopRef.current = true;
      wsRef.current?.close();
      cleanupAudio();
    };
  }, [cleanupAudio]);

  return { state, partial, micLevel, start, stop };
}

/** Speech out. Browser-native, so it costs nothing and adds no latency;
 *  swap this one function for a hosted TTS provider without touching the UI. */
export function speak(text: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 1.05;
  utterance.pitch = 1;
  window.speechSynthesis.speak(utterance);
}

export function stopSpeaking() {
  if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
}
