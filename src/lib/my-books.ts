/**
 * The books this browser knows about. The home page lists only these, so a
 * person who arrives with an invite link never sees anyone else's project.
 * A book gets remembered when you create it or open its page.
 */
const KEY = "albert-my-books";

export function rememberBook(id: string) {
  if (typeof window === "undefined") return;
  try {
    const ids = myBookIds().filter((x) => x !== id);
    ids.unshift(id);
    localStorage.setItem(KEY, JSON.stringify(ids.slice(0, 50)));
  } catch {
    /* private mode, blocked storage — the list is a convenience */
  }
}

export function myBookIds(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    const ids = raw ? JSON.parse(raw) : [];
    return Array.isArray(ids) ? ids.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function forgetBook(id: string) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(myBookIds().filter((x) => x !== id)));
  } catch {
    /* ignore */
  }
}
