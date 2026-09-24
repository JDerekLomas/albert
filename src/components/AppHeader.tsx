"use client";

/** The thin header on every page outside the editor: where you are, who you
 *  are, and the way out. The editor keeps its own denser header. */
import { useEffect, useState } from "react";
import Link from "next/link";
import { auth, User } from "@/lib/api";
import { setIdentityFromUser } from "@/lib/presence";

export function useMe() {
  const [me, setMe] = useState<User | null | undefined>(undefined);
  useEffect(() => {
    auth.me().then((u) => {
      if (u) setIdentityFromUser(u);
      setMe(u);
    });
  }, []);
  return [me, setMe] as const;
}

export default function AppHeader({ crumbs = [] }: { crumbs?: { label: string; href?: string }[] }) {
  const [me, setMe] = useMe();
  const [open, setOpen] = useState(false);

  async function rename() {
    if (!me) return;
    const next = prompt("Your name, as collaborators will see it:", me.name);
    if (!next || !next.trim()) return;
    const user = await auth.update({ name: next }).catch(() => null);
    if (user) {
      setIdentityFromUser(user);
      setMe(user);
    }
  }

  async function signOut() {
    await auth.signout().catch(() => undefined);
    window.location.href = "/";
  }

  return (
    <header className="flex items-center justify-between h-12 px-6 text-sm border-b border-zinc-100">
      <nav className="flex items-center gap-2 text-zinc-400 min-w-0">
        <Link href="/" className="font-semibold text-zinc-900 hover:text-zinc-600 shrink-0">
          Manuscript Editor
        </Link>
        {crumbs.map((c, i) => (
          <span key={i} className="flex items-center gap-2 min-w-0">
            <span>/</span>
            {c.href ? (
              <Link href={c.href} className="hover:text-zinc-600 truncate">
                {c.label}
              </Link>
            ) : (
              <span className="truncate text-zinc-600">{c.label}</span>
            )}
          </span>
        ))}
      </nav>
      <div className="flex items-center gap-4 shrink-0">
        <Link href="/guide" className="text-zinc-400 hover:text-zinc-700">
          Guide
        </Link>
        {me === undefined ? null : me ? (
          <div className="relative">
            <button onClick={() => setOpen(!open)} className="flex items-center gap-2 hover:text-zinc-700" aria-haspopup="menu">
              <span
                className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-semibold"
                style={{ backgroundColor: me.color }}
              >
                {(me.name || me.email)[0].toUpperCase()}
              </span>
              <span className="text-zinc-600">{me.name}</span>
            </button>
            {open && (
              <div className="absolute right-0 mt-2 w-56 bg-white border border-zinc-200 rounded-lg shadow-lg py-1 z-20" role="menu">
                <div className="px-3 py-2 text-xs text-zinc-400 truncate">{me.email}</div>
                <button onClick={rename} className="w-full text-left px-3 py-2 hover:bg-zinc-50" role="menuitem">
                  Change my name
                </button>
                <button onClick={signOut} className="w-full text-left px-3 py-2 hover:bg-zinc-50" role="menuitem">
                  Sign out
                </button>
              </div>
            )}
          </div>
        ) : (
          <Link href="/login" className="text-zinc-900 font-medium hover:text-zinc-600">
            Sign in
          </Link>
        )}
      </div>
    </header>
  );
}
