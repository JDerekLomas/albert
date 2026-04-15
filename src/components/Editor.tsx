"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Highlight from "@tiptap/extension-highlight";
import Typography from "@tiptap/extension-typography";
import { useEffect, useRef, useCallback, useState } from "react";
import { supabase, Document } from "@/lib/supabase";
import { joinDocument, getIdentity, Peer } from "@/lib/presence";
import { RealtimeChannel } from "@supabase/supabase-js";
import Toolbar from "./Toolbar";

export default function Editor({ document }: { document: Document }) {
  const [title, setTitle] = useState(document.title);
  const [peers, setPeers] = useState<Peer[]>([]);
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isRemoteUpdate = useRef(false);
  const identity = getIdentity();

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({
        placeholder: "Start writing...",
      }),
      Highlight,
      Typography,
    ],
    content: document.content || "",
    editorProps: {
      attributes: {
        class: "tiptap prose prose-zinc max-w-none focus:outline-none",
      },
    },
    onUpdate: ({ editor }) => {
      if (isRemoteUpdate.current) return;

      const html = editor.getHTML();
      debouncedSave(html);

      // Broadcast change to peers
      if (channelRef.current) {
        channelRef.current.send({
          type: "broadcast",
          event: "content-change",
          payload: {
            content: html,
            sender: identity.id,
          },
        });
      }
    },
  });

  const debouncedSave = useCallback(
    (content: string) => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(async () => {
        setSaving(true);
        await supabase
          .from("albert_documents")
          .update({ content, updated_at: new Date().toISOString() })
          .eq("id", document.id);
        setSaving(false);
        setLastSaved(new Date());
      }, 500);
    },
    [document.id]
  );

  // Save title
  const saveTitle = useCallback(
    async (newTitle: string) => {
      await supabase
        .from("albert_documents")
        .update({ title: newTitle, updated_at: new Date().toISOString() })
        .eq("id", document.id);

      if (channelRef.current) {
        channelRef.current.send({
          type: "broadcast",
          event: "title-change",
          payload: { title: newTitle, sender: identity.id },
        });
      }
    },
    [document.id, identity.id]
  );

  // Set up realtime channel
  useEffect(() => {
    const channel = joinDocument(document.id);
    channelRef.current = channel;

    // Listen for presence changes
    channel.on("presence", { event: "sync" }, () => {
      const state = channel.presenceState();
      const peerList: Peer[] = [];
      for (const [id, presences] of Object.entries(state)) {
        if (id !== identity.id && presences.length > 0) {
          const p = presences[0] as unknown as { name: string; color: string };
          peerList.push({ id, name: p.name, color: p.color });
        }
      }
      setPeers(peerList);
    });

    // Listen for content changes
    channel.on(
      "broadcast",
      { event: "content-change" },
      ({ payload }) => {
        if (payload.sender === identity.id) return;
        if (!editor) return;

        isRemoteUpdate.current = true;
        const { from, to } = editor.state.selection;
        editor.commands.setContent(payload.content, { emitUpdate: false });
        // Try to restore cursor position
        try {
          const maxPos = editor.state.doc.content.size;
          editor.commands.setTextSelection({
            from: Math.min(from, maxPos),
            to: Math.min(to, maxPos),
          });
        } catch {
          // ignore cursor restore errors
        }
        isRemoteUpdate.current = false;
      }
    );

    // Listen for title changes
    channel.on(
      "broadcast",
      { event: "title-change" },
      ({ payload }) => {
        if (payload.sender === identity.id) return;
        setTitle(payload.title);
      }
    );

    return () => {
      channel.unsubscribe();
      channelRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [document.id, identity.id]);

  // Keyboard shortcut: Cmd+S to save immediately
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        if (editor) {
          const html = editor.getHTML();
          setSaving(true);
          supabase
            .from("albert_documents")
            .update({
              content: html,
              title,
              updated_at: new Date().toISOString(),
            })
            .eq("id", document.id)
            .then(() => {
              setSaving(false);
              setLastSaved(new Date());
            });
        }
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [editor, document.id, title]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <header className="border-b border-zinc-100 px-4 py-2 flex items-center justify-between sticky top-0 bg-white/80 backdrop-blur-sm z-10">
        <div className="flex items-center gap-3">
          <a
            href="/"
            className="text-zinc-400 hover:text-zinc-600 transition-colors text-sm font-medium"
          >
            Albert
          </a>
          <span className="text-zinc-200">/</span>
          <input
            type="text"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              saveTitle(e.target.value);
            }}
            className="text-sm font-medium bg-transparent border-none outline-none focus:ring-0 p-0 w-64"
            placeholder="Untitled"
          />
        </div>
        <div className="flex items-center gap-3">
          {/* Presence avatars */}
          <div className="flex items-center -space-x-1">
            {peers.map((peer) => (
              <div
                key={peer.id}
                title={peer.name}
                className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-medium ring-2 ring-white"
                style={{ backgroundColor: peer.color }}
              >
                {peer.name[0]}
              </div>
            ))}
            <div
              title={`${identity.name} (you)`}
              className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-medium ring-2 ring-white"
              style={{ backgroundColor: identity.color }}
            >
              {identity.name[0]}
            </div>
          </div>

          {/* Save status */}
          <span className="text-xs text-zinc-400">
            {saving
              ? "Saving..."
              : lastSaved
                ? `Saved ${lastSaved.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                : ""}
          </span>

          {/* Share button */}
          <button
            onClick={() => {
              navigator.clipboard.writeText(window.location.href);
              alert("Link copied to clipboard!");
            }}
            className="text-xs text-zinc-500 hover:text-zinc-800 border border-zinc-200 rounded px-2 py-1 transition-colors"
          >
            Share
          </button>
        </div>
      </header>

      {/* Toolbar */}
      {editor && <Toolbar editor={editor} />}

      {/* Editor */}
      <div className="flex-1 max-w-3xl w-full mx-auto px-6 py-8">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
