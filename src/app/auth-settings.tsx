"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { AUTH_UNAVAILABLE_MESSAGE, requestMagicLink, signOut } from "@/lib/auth-flow";
import { createClient } from "@/lib/supabase/client";

export default function AuthSettings({ initialEmail }: { initialEmail: string | null }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [authenticatedEmail, setAuthenticatedEmail] = useState(initialEmail);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

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
        saving on this device whether you sign in or not. Cloud data sync comes in a later phase.
      </div>
    </section>
  );
}
