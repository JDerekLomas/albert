"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase, Document } from "@/lib/supabase";
import dynamic from "next/dynamic";

const Editor = dynamic(() => import("@/components/Editor"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-screen text-zinc-400">
      Loading editor...
    </div>
  ),
});

export default function DocumentPage() {
  const params = useParams();
  const id = params.id as string;
  const [document, setDocument] = useState<Document | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    async function load() {
      const { data, error } = await supabase
        .from("albert_documents")
        .select("*")
        .eq("id", id)
        .single();

      if (error || !data) {
        setNotFound(true);
        return;
      }

      setDocument(data);
    }

    load();
  }, [id]);

  if (notFound) {
    return (
      <div className="flex flex-col items-center justify-center h-screen text-zinc-400">
        <h1 className="text-2xl font-bold mb-2">Document not found</h1>
        <a href="/" className="text-zinc-600 underline text-sm">
          Go home
        </a>
      </div>
    );
  }

  if (!document) {
    return (
      <div className="flex items-center justify-center h-screen text-zinc-400">
        Loading...
      </div>
    );
  }

  return <Editor document={document} />;
}
