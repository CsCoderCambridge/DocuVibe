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
  const [activeId, setActiveId] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
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
    setActiveId(null);
    setPaused(false);
  }, [isSupported]);

  /** Starts reading a message aloud from the beginning. Only called from an explicit Play click. */
  const play = useCallback(
    (id: string, text: string, lang: Language) => {
      if (!canSpeak(lang)) return;
      const clean = stripMarkdown(text);
      if (!clean) return;
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(clean);
      if (englishVoice) utterance.voice = englishVoice;
      utterance.lang = englishVoice?.lang ?? "en-US";
      const finish = () => {
        setActiveId((current) => (current === id ? null : current));
        setPaused(false);
      };
      utterance.onend = finish;
      utterance.onerror = finish;
      setActiveId(id);
      setPaused(false);
      window.speechSynthesis.speak(utterance);
    },
    [canSpeak, englishVoice],
  );

  const pause = useCallback(() => {
    if (!isSupported || !activeId) return;
    window.speechSynthesis.pause();
    setPaused(true);
  }, [activeId, isSupported]);

  const resume = useCallback(() => {
    if (!isSupported || !activeId) return;
    window.speechSynthesis.resume();
    setPaused(false);
  }, [activeId, isSupported]);

  return { isSupported, canSpeak, play, pause, resume, stop, activeId, paused };
}
