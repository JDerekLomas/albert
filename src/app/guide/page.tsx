import Link from "next/link";
import AppHeader from "@/components/AppHeader";

export const metadata = { title: "Guide — Manuscript Editor" };

const sections: { title: string; body: string }[] = [
  {
    title: "Chapters",
    body: "A book is a list of chapters, each its own page. Bring a manuscript in and it is split at your top-level headings; add chapters or notes by hand from the book page. Everything you type saves as you go.",
  },
  {
    title: "Suggestions, not silent edits",
    body: "When the AI proposes a change, or a collaborator runs an editing pass, it arrives as a suggestion: the old text struck through, the new text marked, side by side in the chapter. Nothing is applied until you accept it. The Suggestions panel lists every pending change so you can go through them in order.",
  },
  {
    title: "Comments",
    body: "Select a passage and leave a comment; it stays attached to that passage. Resolve it when it is dealt with. Open comments show up on the book map, so nothing waits unnoticed.",
  },
  {
    title: "Versions",
    body: "Press Save version before and after anything you might want to undo. History shows every snapshot and the exact differences between any two, and can restore one.",
  },
  {
    title: "The book map",
    body: "The book page shows the whole manuscript from above: every chapter in order, sized by length, with its open questions, pending suggestions and comments. Assess all chapters asks the model for a verdict on each; Check the book reads everything at once looking for contradictions.",
  },
  {
    title: "Sharing",
    body: "From the book page, the owner can invite people by email as editors (who can change text, comment and run the AI) or readers (who can only read). A share link does the same for anyone who has it; turn it off any time. There are no passwords: people sign in with a link sent to their email.",
  },
  {
    title: "Who sees what",
    body: "Your projects page lists only books you own or were invited to. A book is visible to its members and no one else.",
  },
];

export default function GuidePage() {
  return (
    <>
      <AppHeader crumbs={[{ label: "Guide" }]} />
      <div className="max-w-2xl mx-auto px-6 py-14">
        <h1 className="text-3xl font-bold tracking-tight mb-3">How this works</h1>
        <p className="text-zinc-600 leading-relaxed mb-12">
          An editor for working on a book with other people, built around one rule: changes are proposed, then
          accepted. The text is always yours.
        </p>
        <div className="space-y-10">
          {sections.map((s) => (
            <section key={s.title}>
              <h2 className="text-lg font-semibold mb-1.5">{s.title}</h2>
              <p className="text-zinc-600 leading-relaxed">{s.body}</p>
            </section>
          ))}
        </div>
        <p className="mt-14 text-sm text-zinc-500">
          Ready?{" "}
          <Link href="/new" className="underline">
            Bring your book in
          </Link>
          .
        </p>
      </div>
    </>
  );
}
