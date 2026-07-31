import type { ReflectionInput } from "./reflections.ts";

export const DEFAULT_REFLECTION_PROMPTS = [
  { field: "whatHelped", label: "What helped today?" },
  { field: "difficult", label: "What drained me or got in the way?" },
  { field: "nextStep", label: "What is one small thing that could support tomorrow?" },
] as const satisfies ReadonlyArray<{ field: keyof ReflectionInput; label: string }>;

export const ADDITIONAL_NOTE_LABEL = "Body, feelings, or anything else you want to remember";
export const REFLECTION_PRIVACY_TEXT = "Saved only on this device. Not sent to AI.";
export const CLOUD_REFLECTION_PRIVACY_TEXT = "Saved privately to your account when online. Not sent to AI.";

export function reflectionPrivacyText(cloudModeActive: boolean): string {
  return cloudModeActive ? CLOUD_REFLECTION_PRIVACY_TEXT : REFLECTION_PRIVACY_TEXT;
}

export function shouldOpenAdditionalNote(freeText: string | undefined): boolean {
  return Boolean(freeText?.trim());
}
