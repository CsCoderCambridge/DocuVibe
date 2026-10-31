"use client";

import { useCallback, useEffect, useState } from "react";
import type { Language } from "@/lib/types";

function stripMarkdown(text: string) {
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[*_#>`|]/g, " ")
    .replace(/\[(.*?)\]\(.*?\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

export function useSpeech() {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [muted, setMuted] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [isSupported, setIsSupported] = useState(false);

  useEffect(() => {
    setIsSupported("speechSynthesis" in window);
  }, []);

  useEffect(() => {
    if (!isSupported) return;
    const load = () => setVoices(window.speechSynthesis.getVoices());
    load();
    window.speechSynthesis.addEventListener("voiceschanged", load);
    return () => {
      window.speechSynthesis.removeEventListener("voiceschanged", load);
      window.speechSynthesis.cancel();
    };
  }, [isSupported]);

  const urduVoice = voices.find((v) => v.lang.toLowerCase().startsWith("ur")) ?? null;

  const pickVoice = useCallback(
    (lang: Language) => {
      if (lang === "ur") return urduVoice;
      return (
        voices.find((v) => v.lang === "en-PK") ??
        voices.find((v) => v.lang === "en-IN") ??
        voices.find((v) => v.lang.startsWith("en") && v.localService) ??
        voices.find((v) => v.lang.startsWith("en")) ??
        null
      );
    },
    [voices, urduVoice],
  );

  const stop = useCallback(() => {
    if (!isSupported) return;
    window.speechSynthesis.cancel();
    setSpeaking(false);
  }, [isSupported]);

  /** Speaks text. `force` plays even when muted (used by per-message replay buttons). */
  const speak = useCallback(
    (text: string, lang: Language, force = false) => {
      if (!isSupported || (muted && !force)) return false;
      const clean = stripMarkdown(text);
      if (!clean) return false;
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(clean);
      const voice = pickVoice(lang);
      if (voice) utterance.voice = voice;
      utterance.lang = voice?.lang ?? (lang === "ur" ? "ur-PK" : "en-US");
      utterance.rate = lang === "ur" ? 0.95 : 1;
      utterance.onstart = () => setSpeaking(true);
      utterance.onend = () => setSpeaking(false);
      utterance.onerror = () => setSpeaking(false);
      window.speechSynthesis.speak(utterance);
      return true;
    },
    [isSupported, muted, pickVoice],
  );

  return { isSupported, speak, stop, speaking, muted, setMuted, hasUrduVoice: !!urduVoice };
}
