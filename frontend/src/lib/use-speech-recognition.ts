"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Live, word-by-word speech-to-text via the browser Web Speech API.
 *
 * Reality check (why the fallback matters): this works great on **Android Chrome**
 * and desktop Chrome/Edge, but on **iOS every browser is WebKit** and Apple only
 * grants speech recognition to Safari itself — so Chrome/Edge/Firefox on iPhone
 * report `supported === false`. Callers must always keep a typed-notes fallback
 * (and on iOS the user can still tap the keyboard's own dictation mic). We never
 * let the feature depend on this being available.
 *
 * `onFinal` fires with each finalized chunk (append it to your text). `interim`
 * holds the in-progress words so the UI can show them streaming live before they
 * commit. Continuous: we restart on the engine's auto-`end` so a natural pause
 * doesn't silently stop dictation.
 */

// The Web Speech API isn't in the standard TS DOM lib, so we type the slice we use.
interface SpeechRecognitionAlternativeLike {
  transcript: string;
}
interface SpeechRecognitionResultLike {
  0: SpeechRecognitionAlternativeLike;
  isFinal: boolean;
  length: number;
}
interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: { length: number; [index: number]: SpeechRecognitionResultLike };
}
interface SpeechRecognitionErrorEventLike {
  error: string;
}
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export interface UseSpeechRecognition {
  supported: boolean;
  listening: boolean;
  interim: string;
  error: string | null;
  start: () => void;
  stop: () => void;
}

export function useSpeechRecognition({
  onFinal,
  lang = "en-US",
}: {
  onFinal: (chunk: string) => void;
  lang?: string;
}): UseSpeechRecognition {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const wantListeningRef = useRef(false);
  // Keep the latest onFinal without re-subscribing the recognition handlers.
  const onFinalRef = useRef(onFinal);
  useEffect(() => {
    onFinalRef.current = onFinal;
  }, [onFinal]);

  useEffect(() => {
    const Ctor = getRecognitionCtor();
    if (!Ctor) return;
    setSupported(true);

    const recognition = new Ctor();
    recognition.lang = lang;
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event) => {
      let finalChunk = "";
      let interimChunk = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        const text = result[0]?.transcript ?? "";
        if (result.isFinal) finalChunk += text;
        else interimChunk += text;
      }
      if (finalChunk.trim()) onFinalRef.current(finalChunk.trim());
      setInterim(interimChunk);
    };

    recognition.onerror = (event) => {
      // Permission problems are terminal; transient ones (no-speech/aborted) just
      // let onend fire and — if the user still wants to listen — we restart.
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        wantListeningRef.current = false;
        setError("Microphone access was blocked. You can still type the note.");
        setListening(false);
      }
    };

    recognition.onend = () => {
      setInterim("");
      // The engine stops on its own after a pause — restart to stay continuous
      // until the user explicitly stops.
      if (wantListeningRef.current) {
        try {
          recognition.start();
        } catch {
          setListening(false);
        }
      } else {
        setListening(false);
      }
    };

    recognitionRef.current = recognition;
    return () => {
      wantListeningRef.current = false;
      try {
        recognition.abort();
      } catch {
        // already stopped
      }
      recognitionRef.current = null;
    };
  }, [lang]);

  const start = useCallback(() => {
    const recognition = recognitionRef.current;
    if (!recognition || wantListeningRef.current) return;
    setError(null);
    wantListeningRef.current = true;
    try {
      recognition.start();
      setListening(true);
    } catch {
      // start() throws if called while already running — treat as already-on.
      setListening(true);
    }
  }, []);

  const stop = useCallback(() => {
    const recognition = recognitionRef.current;
    wantListeningRef.current = false;
    setInterim("");
    setListening(false);
    if (recognition) {
      try {
        recognition.stop();
      } catch {
        // already stopped
      }
    }
  }, []);

  return { supported, listening, interim, error, start, stop };
}
