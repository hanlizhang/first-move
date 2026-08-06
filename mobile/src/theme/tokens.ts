export const colors = {
  background: "#F7F4EE",
  surface: "#FFFFFF",
  surfaceMuted: "#EEE9E0",
  text: "#292524",
  textMuted: "#625B55",
  primary: "#5B3CC4",
  primaryPressed: "#452B9C",
  primarySoft: "#EAE4FF",
  success: "#166534",
  successSoft: "#DCFCE7",
  warning: "#92400E",
  warningSoft: "#FEF3C7",
  danger: "#9F1239",
  dangerSoft: "#FFE4E6",
  border: "#D6D0C7",
  focus: "#7C3AED",
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const radii = {
  sm: 10,
  md: 16,
  lg: 24,
  pill: 999,
} as const;

export const typography = {
  title: 32,
  heading: 22,
  body: 16,
  small: 14,
  label: 12,
} as const;

export const touchTarget = 48;
