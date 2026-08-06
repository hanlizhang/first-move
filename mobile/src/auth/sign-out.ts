export interface SignOutAuth {
  signOut(): Promise<{ error: unknown | null }>;
}

export async function signOutWithoutDeletingLocalData(
  auth: SignOutAuth,
): Promise<{ ok: boolean; message: string }> {
  try {
    const { error } = await auth.signOut();
    return error
      ? { ok: false, message: "We could not sign you out. Please try again." }
      : {
          ok: true,
          message: "Signed out. Guest and cached local data are still on this device.",
        };
  } catch {
    return { ok: false, message: "We could not sign you out. Please try again." };
  }
}
