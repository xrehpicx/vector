export interface Branding {
  name: string;
  description: string;
  logoUrl: string | null;
  logoStorageId: string | null;
  themeColor: string;
  accentColor: string;
}

export const DEFAULT_BRANDING: Branding = {
  name: 'Vector',
  description: 'Project management platform',
  logoUrl: null,
  logoStorageId: null,
  themeColor: '#111827',
  accentColor: '#2563eb',
};

const HEX_COLOR_PATTERN = /^#(?:[0-9a-fA-F]{3}){1,2}$/;

export function resolveBrandColor(
  color: string | null | undefined,
  fallback: string,
) {
  return color && HEX_COLOR_PATTERN.test(color) ? color : fallback;
}

function expandHexColor(hex: string) {
  const value = hex.slice(1);
  if (value.length === 3) {
    return value
      .split('')
      .map(channel => channel + channel)
      .join('');
  }
  return value;
}

export function getContrastingTextColor(backgroundColor: string) {
  const safeColor = resolveBrandColor(
    backgroundColor,
    DEFAULT_BRANDING.accentColor,
  );
  const expanded = expandHexColor(safeColor);
  const red = Number.parseInt(expanded.slice(0, 2), 16);
  const green = Number.parseInt(expanded.slice(2, 4), 16);
  const blue = Number.parseInt(expanded.slice(4, 6), 16);
  const luminance = (0.299 * red + 0.587 * green + 0.114 * blue) / 255;

  return luminance > 0.6 ? '#0f172a' : '#ffffff';
}
