"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/api";

function LoginForm() {
  const params = useSearchParams();
  const next = params.get("next") || "/";
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await auth.request(email, next);
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
    setBusy(false);
  }

  if (sent) {
    return (
      <div className="max-w-sm mx-auto px-6 py-24 text-center">
        <h1 className="text-2xl font-bold tracking-tight mb-3">Check your email</h1>
        <p className="text-zinc-600 leading-relaxed">
          We sent a sign-in link to <span className="text-zinc-900">{email}</span>. It works once and expires in 15
          minutes. You can close this tab.
        </p>
        <button onClick={() => setSent(false)} className="text-sm text-zinc-500 underline mt-8">
          Use a different address
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-sm mx-auto px-6 py-24">
      <h1 className="text-2xl font-bold tracking-tight mb-2">Sign in</h1>
      <p className="text-zinc-500 text-sm mb-8 leading-relaxed">
        No password. Enter your email and we send you a link that signs you in.
      </p>
      <form onSubmit={submit} className="space-y-4">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          required
          autoFocus
          className="w-full border border-zinc-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-zinc-400"
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={busy || !email}
          className="w-full bg-zinc-900 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-zinc-800 disabled:opacity-40 transition-colors"
        >
          {busy ? "Sending…" : "Email me a sign-in link"}
        </button>
      </form>
      <p className="text-xs text-zinc-400 mt-8 leading-relaxed">
        Were you invited to a book? Sign in with the address the invitation was sent to and it will be waiting.{" "}
        <Link href="/" className="underline">
          What is this?
        </Link>
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
