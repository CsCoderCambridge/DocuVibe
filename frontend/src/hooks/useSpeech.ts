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

  const englishVoice =
    voices.find((v) => v.lang === "en-PK") ??
    voices.find((v) => v.lang === "en-IN") ??
    voices.find((v) => v.lang.startsWith("en") && v.localService) ??
    voices.find((v) => v.lang.startsWith("en")) ??
    null;

  /** Voice output is English-only; Urdu replies are shown as text. */
  const canSpeak = useCallback((lang: Language) => isSupported && lang === "en", [isSupported]);

  const stop = useCallback(() => {
    if (!isSupported) return;
    window.speechSynthesis.cancel();
    setSpeaking(false);
  }, [isSupported]);

  /** Speaks text. `force` plays even when muted (used by per-message replay buttons). */
  const speak = useCallback(
    (text: string, lang: Language, force = false) => {
      if (!canSpeak(lang) || (muted && !force)) return false;
      const clean = stripMarkdown(text);
      if (!clean) return false;
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(clean);
      if (englishVoice) utterance.voice = englishVoice;
      utterance.lang = englishVoice?.lang ?? "en-US";
      utterance.onstart = () => setSpeaking(true);
      utterance.onend = () => setSpeaking(false);
      utterance.onerror = () => setSpeaking(false);
      window.speechSynthesis.speak(utterance);
      return true;
    },
    [canSpeak, muted, englishVoice],
  );

  return { isSupported, canSpeak, speak, stop, speaking, muted, setMuted };
}
