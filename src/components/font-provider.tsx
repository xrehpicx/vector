'use client';

import * as React from 'react';

export const FONT_FAMILIES = ['urbanist', 'geist', 'poppins'] as const;

export type FontFamily = (typeof FONT_FAMILIES)[number];

const FONT_STORAGE_KEY = 'vector-font-family';
const DEFAULT_FONT_FAMILY: FontFamily = 'urbanist';

interface FontOption {
  value: FontFamily;
  label: string;
  preview: string;
}

export const FONT_OPTIONS: FontOption[] = [
  { value: 'urbanist', label: 'Urbanist', preview: 'Dense and modern' },
  { value: 'geist', label: 'Geist', preview: 'Neutral and crisp' },
  { value: 'poppins', label: 'Poppins', preview: 'Round and soft' },
];

interface FontContextValue {
  fontFamily: FontFamily;
  setFontFamily: (fontFamily: FontFamily) => void;
}

const FontContext = React.createContext<FontContextValue | null>(null);

function isFontFamily(value: string | null): value is FontFamily {
  return value !== null && FONT_FAMILIES.includes(value as FontFamily);
}

function applyFontFamily(fontFamily: FontFamily) {
  document.documentElement.dataset.font = fontFamily;
}

export function FontProvider({ children }: { children: React.ReactNode }) {
  const [fontFamily, setFontFamilyState] =
    React.useState<FontFamily>(DEFAULT_FONT_FAMILY);

  React.useEffect(() => {
    const storedFontFamily = window.localStorage.getItem(FONT_STORAGE_KEY);
    const nextFontFamily = isFontFamily(storedFontFamily)
      ? storedFontFamily
      : DEFAULT_FONT_FAMILY;

    applyFontFamily(nextFontFamily);
    setFontFamilyState(nextFontFamily);
  }, []);

  const setFontFamily = (nextFontFamily: FontFamily) => {
    applyFontFamily(nextFontFamily);
    window.localStorage.setItem(FONT_STORAGE_KEY, nextFontFamily);
    setFontFamilyState(nextFontFamily);
  };

  return (
    <FontContext.Provider value={{ fontFamily, setFontFamily }}>
      {children}
    </FontContext.Provider>
  );
}

export function useFontFamily() {
  const context = React.useContext(FontContext);

  if (!context) {
    throw new Error('useFontFamily must be used within a FontProvider');
  }

  return context;
}
