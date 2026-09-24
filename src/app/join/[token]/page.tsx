"use client";

/** A share link. Signed out: show what it is and send them to sign in, then
 *  back here. Signed in: join and go to the book. */
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { auth, books } from "@/lib/api";

export default function JoinPage() {
  const { token } = useParams<{ token: string }>();
  const [title, setTitle] = useState<string | null>(null);
  const [role, setRole] = useState<string>("editor");
  const [state, setState] = useState<"loading" | "signed-out" | "joining" | "error">("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const peek = await books.peekJoin(token);
        setTitle(peek.title);
        setRole(peek.role);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setState("error");
        return;
      }
      const me = await auth.me();
      if (!me) {
        setState("signed-out");
        return;
      }
      setState("joining");
      try {
        const r = await books.join(token);
        window.location.href = `/b/${r.bookId}`;
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setState("error");
      }
    })();
  }, [token]);

  const next = encodeURIComponent(`/join/${token}`);
  return (
    <div className="max-w-sm mx-auto px-6 py-24 text-center">
      {state === "error" ? (
        <>
          <h1 className="text-2xl font-bold tracking-tight mb-3">This link doesn&rsquo;t work</h1>
          <p className="text-zinc-600">{error}</p>
        </>
      ) : (
        <>
          <p className="text-sm text-zinc-400 mb-2">You&rsquo;ve been invited to</p>
          <h1 className="text-2xl font-bold tracking-tight mb-3">{title ?? "…"}</h1>
          <p className="text-zinc-600 mb-8">
            as {role === "viewer" ? "a reader" : "an editor"}.
            {state === "signed-out" && " Sign in to open it — the book will be added to your projects."}
            {state === "joining" && " Opening…"}
          </p>
          {state === "signed-out" && (
            <Link href={`/login?next=${next}`} className="inline-block bg-zinc-900 text-white px-6 py-2.5 rounded-lg text-sm font-medium hover:bg-zinc-800">
              Sign in to continue
            </Link>
          )}
        </>
      )}
    </div>
  );
}
