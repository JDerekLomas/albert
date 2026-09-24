"use client";

/** The sign-in link lands here. The token is consumed by a button press, not
 *  by the page load, so an email client that prefetches links can't burn it. */
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/api";
import { setIdentityFromUser } from "@/lib/presence";

function Verify() {
  const params = useSearchParams();
  const token = params.get("t") || "";
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function go() {
    setBusy(true);
    setError(null);
    try {
      const r = await auth.verify(token);
      setIdentityFromUser({ uid: r.user.uid, name: r.user.name, color: r.user.color });
      window.location.href = r.redirect || "/";
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <div className="max-w-sm mx-auto px-6 py-24 text-center">
      <h1 className="text-2xl font-bold tracking-tight mb-3">Almost there</h1>
      <p className="text-zinc-600 mb-8">Press the button to finish signing in.</p>
      {error ? (
        <>
          <p className="text-sm text-red-600 mb-6">{error}</p>
          <Link href="/login" className="text-sm underline">
            Request a new link
          </Link>
        </>
      ) : (
        <button
          onClick={go}
          disabled={busy || !token}
          className="bg-zinc-900 text-white px-6 py-2.5 rounded-lg text-sm font-medium hover:bg-zinc-800 disabled:opacity-40"
        >
          {busy ? "Signing in…" : "Continue"}
        </button>
      )}
    </div>
  );
}

export default function VerifyPage() {
  return (
    <Suspense>
      <Verify />
    </Suspense>
  );
}
