"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import { Document } from "@/lib/supabase";
import { auth, documents, Role } from "@/lib/api";
import { setIdentityFromUser } from "@/lib/presence";

const Editor = dynamic(() => import("@/components/Editor"), {
  ssr: false,
  loading: () => <div className="flex items-center justify-center h-screen text-zinc-400">Loading editor...</div>,
});

export default function DocumentPage() {
  const params = useParams();
  const id = params.id as string;
  const [document, setDocument] = useState<Document | null>(null);
  const [role, setRole] = useState<Role>("viewer");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      // Identity first, so presence and comments carry the account's name.
      const me = await auth.me();
      if (me) setIdentityFromUser(me);
      try {
        const r = await documents.get(id);
        setRole(r.role);
        setDocument(r.document);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
  }, [id]);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-screen text-zinc-400">
        <h1 className="text-2xl font-bold mb-2">Document not found</h1>
        <p className="text-sm mb-4">{error}</p>
        <Link href="/" className="text-zinc-600 underline text-sm">
          Go home
        </Link>
      </div>
    );
  }

  if (!document) return <div className="flex items-center justify-center h-screen text-zinc-400">Loading...</div>;

  return <Editor document={document} role={role} />;
}
