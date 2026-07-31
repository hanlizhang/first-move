export function cloudSetupEnabled(value: string | undefined): boolean {
  return value === "true";
}

export function getCloudSetupEnabled(): boolean {
  return cloudSetupEnabled(process.env.NEXT_PUBLIC_CLOUD_SETUP_ENABLED);
}
