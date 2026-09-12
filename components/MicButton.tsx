"use client";

import { useEffect, useRef, useState } from "react";

// Minimal wrapper around the browser's built-in Web Speech API
// (SpeechRecognition) — no new dependency, no API key, no backend
// endpoint. `lang` defaults to navigator.language, so "any language"
// just falls out of whatever the reporter's own phone/browser is
// already set to, rather than needing a separate language picker.
// Renders nothing when the browser has no support (Firefox, some older
// Safari) rather than showing a button that would just fail silently.
//
// iOS gotcha (found via real user report — Chrome on iPhone): every
// third-party browser on iOS (Chrome, Firefox, Edge included) is
// required by Apple to run on the WebKit engine, not its own — but
// Apple only grants the actual on-device speech-recognition capability
// to Safari's own app bundle. A non-Safari iOS browser still exposes
// `webkitSpeechRecognition` as a constructor (so the old supported-check
// alone says "yes"), but calling start() fails at runtime, typically
// with error "not-allowed" or "service-not-allowed" — silently, unless
// something surfaces it. Detected explicitly below so the button can
// say why instead of just doing nothing when tapped.
interface SpeechRecognitionResult {
  readonly isFinal: boolean;
  readonly [index: number]: { readonly transcript: string };
}
interface SpeechRecognitionResultList {
  readonly length: number;
  readonly [index: number]: SpeechRecognitionResult;
}
interface SpeechRecognitionEvent extends Event {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultList;
}
interface SpeechRecognitionErrorEvent extends Event {
  readonly error: string;
}
interface SpeechRecognitionLike extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
}

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  }
}

function detectIosNonSafari(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const isIOS =
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  // Chrome/Firefox/Edge/Opera on iOS identify themselves with these
  // suffixes even though they're all really WebKit underneath — actual
  // Safari has none of them.
  const isKnownWrapperBrowser = /CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
  return isIOS && isKnownWrapperBrowser;
}

const ERROR_MESSAGES: Record<string, string> = {
  "not-allowed": "Microphone access was blocked — check your browser's site permissions.",
  "service-not-allowed": "Voice input isn't available in this browser here — try Safari instead.",
  network: "Voice input needs an internet connection.",
  "no-speech": "Didn't catch that — try again.",
  "audio-capture": "No microphone found.",
};

export function MicButton({
  onResult,
  className = "",
}: {
  // Called once per finalized phrase — the caller appends it to
  // whatever field it's wired to (see ReportForm.tsx).
  onResult: (transcript: string) => void;
  className?: string;
}) {
  // Lazy initializers (not effects) so these are known by the first
  // client render — safe here since this file is "use client" and only
  // ever mounts in the browser; typeof-guarded in case a static/SSR
  // pass ever evaluates them.
  const [supported] = useState(
    () => typeof window !== "undefined" && !!(window.SpeechRecognition || window.webkitSpeechRecognition)
  );
  const [iosNonSafari] = useState(detectIosNonSafari);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
    };
  }, []);

  function toggle() {
    const RecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!RecognitionCtor) return;

    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }

    setError(null);
    const recognition = new RecognitionCtor();
    recognition.lang = navigator.language || "en-US";
    recognition.continuous = true;
    recognition.interimResults = false;

    recognition.onresult = (event) => {
      let finalText = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) finalText += result[0].transcript;
      }
      if (finalText.trim()) onResult(finalText.trim());
    };
    recognition.onend = () => setListening(false);
    recognition.onerror = (event) => {
      setListening(false);
      setError(
        ERROR_MESSAGES[event.error] ??
          (iosNonSafari
            ? "Voice input isn't available in this browser here — try Safari instead."
            : "Couldn't start voice input.")
      );
    };

    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  }

  if (!supported) return null;

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={toggle}
        title={
          listening
            ? "Stop recording"
            : iosNonSafari
              ? "Voice input works best in Safari on iOS"
              : "Speak instead of typing"
        }
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border transition-colors ${
          listening
            ? "animate-pulse border-red-300 bg-red-50 text-red-600"
            : "border-slate-300 bg-white text-slate-500 hover:bg-slate-50"
        } ${className}`}
      >
        <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
          <rect x="9" y="3" width="6" height="11" rx="3" stroke="currentColor" strokeWidth="2" />
          <path
            d="M5 11a7 7 0 0014 0M12 18v3"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </button>
      {error && <p className="max-w-[8rem] text-[11px] leading-tight text-red-600">{error}</p>}
    </div>
  );
}
