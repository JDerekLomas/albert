"use client";

/** Who can see this book. Owner only: invite by email with a role, remove
 *  people, and switch a share link on or off. */
import { useState } from "react";
import { books, Member, Role, BookDetail } from "@/lib/api";

export default function SharePanel({
  book,
  members,
  me,
  onChange,
}: {
  book: BookDetail["book"];
  members: Member[];
  me: string;
  onChange: () => void;
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("editor");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const shareUrl = book.share_token && typeof window !== "undefined" ? `${window.location.origin}/join/${book.share_token}` : null;

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      onChange();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setBusy(false);
  }

  return (
    <div className="border border-zinc-200 rounded-xl p-5 mb-8 bg-white">
      <h2 className="font-semibold mb-1">Sharing</h2>
      <p className="text-sm text-zinc-500 mb-5 leading-relaxed">
        Editors can change text, comment and run the AI. Readers can only read. People sign in with a link sent to
        their email, so invite the address they will use.
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!email.trim()) return;
          run(async () => {
            await books.invite(book.id, email, role);
            setEmail("");
          });
        }}
        className="flex gap-2 mb-5"
      >
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="name@example.com"
          className="flex-1 border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-zinc-400"
        />
        <select value={role} onChange={(e) => setRole(e.target.value as Role)} className="border border-zinc-200 rounded-lg px-2 py-2 text-sm">
          <option value="editor">Editor</option>
          <option value="viewer">Reader</option>
        </select>
        <button type="submit" disabled={busy || !email.trim()} className="bg-zinc-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-zinc-800 disabled:opacity-40">
          Invite
        </button>
      </form>

      <ul className="divide-y divide-zinc-100 mb-6">
        {members.map((m) => (
          <li key={m.email} className="flex items-center justify-between py-2 text-sm">
            <span className="min-w-0 truncate">
              {m.email}
              {m.email === me && <span className="text-zinc-400"> (you)</span>}
              {!m.accepted_at && m.role !== "owner" && <span className="text-amber-600 text-xs ml-2">invited, not yet signed in</span>}
            </span>
            <span className="flex items-center gap-3 shrink-0 ml-4">
              {m.role === "owner" ? (
                <span className="text-zinc-400">Owner</span>
              ) : (
                <select
                  value={m.role}
                  onChange={(e) => run(() => books.invite(book.id, m.email, e.target.value as Role))}
                  className="text-sm border border-zinc-200 rounded px-1.5 py-0.5"
                >
                  <option value="editor">Editor</option>
                  <option value="viewer">Reader</option>
                  <option value="owner">Owner</option>
                </select>
              )}
              {m.email !== me && (
                <button
                  onClick={() => {
                    if (confirm(`Remove ${m.email} from this book?`)) run(() => books.removeMember(book.id, m.email));
                  }}
                  className="text-zinc-400 hover:text-red-600"
                  aria-label={`Remove ${m.email}`}
                >
                  Remove
                </button>
              )}
            </span>
          </li>
        ))}
      </ul>

      <div className="border-t border-zinc-100 pt-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium">Share link</span>
          <label className="flex items-center gap-2 text-sm text-zinc-600">
            <input
              type="checkbox"
              checked={!!book.share_token}
              onChange={(e) => run(() => books.update(book.id, { share_enabled: e.target.checked }))}
              disabled={busy}
            />
            {book.share_token ? "On" : "Off"}
          </label>
        </div>
        {shareUrl ? (
          <div className="space-y-2">
            <div className="flex gap-2">
              <input readOnly value={shareUrl} className="flex-1 border border-zinc-200 rounded-lg px-3 py-1.5 text-xs text-zinc-600 bg-zinc-50" onFocus={(e) => e.target.select()} />
              <button
                onClick={() => {
                  navigator.clipboard?.writeText(shareUrl);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }}
                className="text-sm px-3 py-1.5 border border-zinc-200 rounded-lg hover:bg-zinc-50"
              >
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <div className="flex items-center gap-3 text-xs text-zinc-500">
              Anyone with the link joins as
              <select
                value={book.share_role || "editor"}
                onChange={(e) => run(() => books.update(book.id, { share_role: e.target.value as Role }))}
                className="border border-zinc-200 rounded px-1.5 py-0.5"
              >
                <option value="editor">an editor</option>
                <option value="viewer">a reader</option>
              </select>
              <button onClick={() => run(() => books.update(book.id, { share_enabled: true, rotate: true }))} className="underline hover:text-zinc-800">
                Make a new link
              </button>
            </div>
          </div>
        ) : (
          <p className="text-xs text-zinc-400">Off. Turn it on to get a link anyone can use to join.</p>
        )}
      </div>
      {error && <p className="text-sm text-red-600 mt-3">{error}</p>}
    </div>
  );
}
