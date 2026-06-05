import { en } from "./en";
import { fr } from "./fr";

export const translations = {
  fr,
  en,
} as const;

export type Language = keyof typeof translations;
export type TranslationKey = keyof typeof fr;

export const DEFAULT_LANGUAGE: Language = "fr";
export const LANGUAGE_STORAGE_KEY = "fablab-language";

