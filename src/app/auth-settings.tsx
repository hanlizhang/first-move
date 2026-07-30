"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { AUTH_UNAVAILABLE_MESSAGE, requestMagicLink, signOut } from "@/lib/auth-flow";
import type { CloudSyncStatus } from "@/lib/account-sync-status";
import { getCloudSetupEnabled } from "@/lib/cloud-setup-feature";
import {
  browserCloudSetupDependencies,
  detectAccountCloudState,
  importThisDevice,
  startFresh,
  hydrateCloudProgress,
  type AccountCloudState,
  type CloudSetupPhase,
} from "@/lib/cloud-setup";
import { createClient } from "@/lib/supabase/client";

export default function AuthSettings({ initialEmail, onCloudStatusChange }: { initialEmail: string | null; onCloudStatusChange?: (status: CloudSyncStatus) => void }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [authenticatedEmail, setAuthenticatedEmail] = useState(initialEmail);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [accountCloudState, setAccountCloudState] = useState<AccountCloudState>();
  const [phase, setPhase] = useState<CloudSetupPhase>("set-up");
  const [confirmCloudHydration, setConfirmCloudHydration] = useState(false);
  const setupClient = useRef<ReturnType<typeof createClient> | undefined>(undefined);
  const setupEnabled = getCloudSetupEnabled();

  useEffect(() => {
    if (!setupEnabled || !authenticatedEmail) return;
    const client = createClient();
    setupClient.current = client;
    let active = true;
    detectAccountCloudState(client).then((state) => {
      if (active) setAccountCloudState(state);
    }).catch(() => {
      if (active) {
        setPhase("failed");
        onCloudStatusChange?.("error");
      }
    });
    return () => { active = false; };
  }, [authenticatedEmail, onCloudStatusChange, setupEnabled]);

  function updatePhase(next: CloudSetupPhase) {
    setPhase(next);
    const status: CloudSyncStatus =
      next === "preparing-backup" ? "preparing-backup" :
      next === "importing" ? "importing" :
      next === "verifying" ? "verifying" :
      next === "cloud-copy-ready" ? "cloud-copy-ready" :
      next === "failed" ? "error" : "not-initialized";
    onCloudStatusChange?.(status);
  }

  async function runSetup(action: "import" | "fresh" | "cloud") {
    const client = setupClient.current ?? createClient();
    setupClient.current = client;
    setPending(true);
    setMessage("");
    try {
      const dependencies = browserCloudSetupDependencies(client);
      if (action === "import") {
        await importThisDevice(dependencies, updatePhase);
        setMessage("Cloud copy ready. Ongoing edits still stay on this device until the next sync phase.");
      } else if (action === "fresh") {
        await startFresh(dependencies, updatePhase);
        setMessage("Empty cloud workspace ready. Your current device progress remains local and backed up.");
      } else {
        await hydrateCloudProgress(dependencies, updatePhase);
        window.location.reload();
      }
      setAccountCloudState("existing");
    } catch (error) {
      updatePhase("failed");
      setMessage(error instanceof Error ? error.message : "Cloud setup failed. Your local progress and backup are unchanged.");
    } finally {
      setPending(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    try {
      const result = await requestMagicLink(
        createClient().auth,
        email,
        window.location.origin,
      );
      setMessage(result.message);
    } catch {
      setMessage(AUTH_UNAVAILABLE_MESSAGE);
    } finally {
      setPending(false);
    }
  }

  async function logout() {
    setPending(true);
    const result = await signOut(createClient().auth);
    setMessage(result.message);
    if (result.ok) {
      setAuthenticatedEmail(null);
      router.refresh();
    }
    setPending(false);
  }

  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm sm:p-6" aria-labelledby="sync-heading">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-violet-700">Optional account</p>
      <h1 id="sync-heading" className="mt-2 text-3xl font-bold tracking-tight">Sync across devices</h1>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-stone-600">
        Sign in with a secure email link. Guest Mode stays available, and this phase does not upload,
        merge, or delete any tasks, journal entries, rewards, or other local progress.
      </p>

      {authenticatedEmail ? (
        <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-sm font-semibold text-emerald-950">Signed in as</p>
          <p className="mt-1 break-all text-sm text-emerald-900">{authenticatedEmail}</p>
          <button
            type="button"
            disabled={pending}
            onClick={logout}
            className="mt-4 min-h-11 rounded-lg border border-emerald-300 bg-white px-4 py-2 text-sm font-bold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 disabled:opacity-60"
          >
            {pending ? "Signing out…" : "Sign out"}
          </button>
          {setupEnabled && (
            <div className="mt-5 border-t border-emerald-200 pt-5">
              <p className="text-sm font-bold text-stone-900">{phase === "set-up" ? "Set up your cloud copy" : phaseLabel(phase)}</p>
              {!accountCloudState && phase !== "failed" && <p className="mt-2 text-sm text-stone-600">Checking this account…</p>}
              {accountCloudState === "empty" && phase !== "cloud-copy-ready" && (
                <div className="mt-3 grid gap-3">
                  <div className="rounded-xl bg-white p-4">
                    <p className="text-sm text-stone-600">Import this device uses the progress stored on this device as the starting cloud copy. Other devices can then load that copy.</p>
                    <button type="button" disabled={pending} onClick={() => runSetup("import")} className="mt-3 min-h-11 rounded-lg bg-violet-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-60">Import this device</button>
                  </div>
                  <div className="rounded-xl bg-white p-4">
                    <p className="text-sm text-stone-600">Start fresh creates an empty cloud workspace and keeps this device’s current progress as a local backup.</p>
                    <button type="button" disabled={pending} onClick={() => runSetup("fresh")} className="mt-3 min-h-11 rounded-lg border border-violet-300 px-4 py-2 text-sm font-bold text-violet-900 disabled:opacity-60">Start fresh</button>
                  </div>
                </div>
              )}
              {accountCloudState === "existing" && phase !== "cloud-copy-ready" && (
                <div className="mt-3 rounded-xl bg-white p-4">
                  <p className="text-sm text-stone-600">This account already has a cloud copy. Your current device progress will be backed up and will not be uploaded or merged.</p>
                  {!confirmCloudHydration ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button type="button" disabled={pending} onClick={() => setConfirmCloudHydration(true)} className="min-h-11 rounded-lg bg-violet-700 px-4 py-2 text-sm font-bold text-white">Use cloud progress</button>
                      <button type="button" onClick={() => setMessage("Keeping local guest progress. Nothing was uploaded or replaced.")} className="min-h-11 rounded-lg border border-stone-300 px-4 py-2 text-sm font-bold">Keep using local guest progress</button>
                    </div>
                  ) : (
                    <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3">
                      <p className="text-sm font-semibold">Replace the active local workspace with the complete cloud copy after creating a backup?</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button type="button" disabled={pending} onClick={() => runSetup("cloud")} className="min-h-11 rounded-lg bg-violet-700 px-4 py-2 text-sm font-bold text-white">Confirm use cloud progress</button>
                        <button type="button" disabled={pending} onClick={() => setConfirmCloudHydration(false)} className="min-h-11 rounded-lg border border-stone-300 px-4 py-2 text-sm font-bold">Cancel</button>
                      </div>
                    </div>
                  )}
                </div>
              )}
              <p className="mt-3 text-xs text-stone-500">This prepares or loads one cloud copy. Ongoing edits are not synchronized yet.</p>
            </div>
          )}
        </div>
      ) : (
        <form className="mt-6 max-w-md" onSubmit={submit}>
          <label className="block text-sm font-bold" htmlFor="sync-email">Email</label>
          <input
            id="sync-email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="mt-2 min-h-11 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-base focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-700"
            placeholder="you@example.com"
          />
          <button
            type="submit"
            disabled={pending}
            className="mt-3 min-h-11 rounded-lg bg-violet-700 px-4 py-2 text-sm font-bold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-700 disabled:opacity-60"
          >
            {pending ? "Sending link…" : "Email me a sign-in link"}
          </button>
        </form>
      )}

      <p className="mt-4 text-sm text-stone-600" aria-live="polite">{message}</p>
      <div className="mt-6 rounded-xl bg-stone-50 p-4 text-sm leading-6 text-stone-600">
        <strong className="text-stone-900">Guest Mode remains active.</strong> Local changes continue
        saving on this device whether you sign in or not. Ongoing cloud writes come in a later phase.
      </div>
    </section>
  );
}

function phaseLabel(phase: CloudSetupPhase): string {
  if (phase === "preparing-backup") return "Preparing backup";
  if (phase === "importing") return "Importing";
  if (phase === "verifying") return "Verifying";
  if (phase === "cloud-copy-ready") return "Cloud copy ready";
  if (phase === "failed") return "Setup failed";
  return "Set up sync";
}
