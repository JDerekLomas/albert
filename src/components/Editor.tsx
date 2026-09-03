"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Highlight from "@tiptap/extension-highlight";
import Typography from "@tiptap/extension-typography";
import { useEffect, useRef, useCallback, useState } from "react";
import { supabase, Document } from "@/lib/supabase";
import { createChannel, subscribeChannel, getIdentity, Peer } from "@/lib/presence";
import { RealtimeChannel } from "@supabase/supabase-js";
import Toolbar from "./Toolbar";
import AIPanel from "./AIPanel";
import CommentsPanel from "./CommentsPanel";
import SuggestionsPanel from "./SuggestionsPanel";
import ChapterSidebar from "./ChapterSidebar";
import { SuggestionInsert, SuggestionDelete, collectSuggestions } from "@/lib/suggestion-marks";

export default function Editor({ document: doc }: { document: Document }) {
  const [title, setTitle] = useState(doc.title);
  const [peers, setPeers] = useState<Peer[]>([]);
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [showAI, setShowAI] = useState(false);
  const [selectedText, setSelectedText] = useState("");
  const [showMarkdown, setShowMarkdown] = useState(false);
  const [markdownSource, setMarkdownSource] = useState("");
  const [wordCount, setWordCount] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const [showComments, setShowComments] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestionCount, setSuggestionCount] = useState(0);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isRemoteUpdate = useRef(false);
  const identity = getIdentity();

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit,
      Placeholder.configure({
        placeholder: 'Start writing... (press "/" for commands)',
      }),
      Highlight,
      Typography,
      SuggestionInsert,
      SuggestionDelete,
    ],
    content: doc.content || "",
    editorProps: {
      attributes: {
        class: "tiptap focus:outline-none",
      },
    },
    onUpdate: ({ editor }) => {
      if (isRemoteUpdate.current) return;

      const html = editor.getHTML();
      const text = editor.state.doc.textContent;
      setWordCount(text.trim() ? text.trim().split(/\s+/).length : 0);
      debouncedSave(html);

      if (channelRef.current) {
        channelRef.current.send({
          type: "broadcast",
          event: "content-change",
          payload: { content: html, sender: identity.id },
        });
      }
    },
    onSelectionUpdate: ({ editor }) => {
      const { from, to } = editor.state.selection;
      if (from !== to) {
        setSelectedText(editor.state.doc.textBetween(from, to));
      } else {
        setSelectedText("");
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
          .eq("id", doc.id);
        setSaving(false);
        setLastSaved(new Date());
      }, 500);
    },
    [doc.id]
  );

  const saveTitle = useCallback(
    async (newTitle: string) => {
      await supabase
        .from("albert_documents")
        .update({ title: newTitle, updated_at: new Date().toISOString() })
        .eq("id", doc.id);

      if (channelRef.current) {
        channelRef.current.send({
          type: "broadcast",
          event: "title-change",
          payload: { title: newTitle, sender: identity.id },
        });
      }
    },
    [doc.id, identity.id]
  );

  function showToast(message: string) {
    setToast(message);
    setTimeout(() => setToast(null), 2000);
  }

  function handleInsert(text: string) {
    if (!editor) return;
    editor.chain().focus().insertContent(text).run();
    showToast("Inserted");
  }

  function handleReplace(text: string) {
    if (!editor) return;
    const { from, to } = editor.state.selection;
    editor
      .chain()
      .focus()
      .deleteRange({ from, to })
      .insertContent(text)
      .run();
    showToast("Replaced");
  }

  // Markdown source view
  function toggleMarkdown() {
    if (!editor) return;
    if (!showMarkdown) {
      // Convert HTML to a simple markdown-like representation
      const html = editor.getHTML();
      setMarkdownSource(htmlToMarkdown(html));
    }
    setShowMarkdown(!showMarkdown);
  }

  function applyMarkdownSource() {
    if (!editor) return;
    // Simple markdown to HTML (basic)
    editor.commands.setContent(markdownToHtml(markdownSource));
    setShowMarkdown(false);
    showToast("Applied markdown changes");
  }

  // Realtime channel — register all listeners BEFORE subscribing
  useEffect(() => {
    const channel = createChannel(doc.id);
    channelRef.current = channel;

    channel.on("presence", { event: "sync" }, () => {
      const state = channel.presenceState();
      const peerList: Peer[] = [];
      for (const [id, presences] of Object.entries(state)) {
        if (id !== identity.id && presences.length > 0) {
          const p = presences[0] as unknown as {
            name: string;
            color: string;
          };
          peerList.push({ id, name: p.name, color: p.color });
        }
      }
      setPeers(peerList);
    });

    channel.on("broadcast", { event: "content-change" }, ({ payload }) => {
      if (payload.sender === identity.id) return;
      if (!editor) return;

      isRemoteUpdate.current = true;
      const { from, to } = editor.state.selection;
      editor.commands.setContent(payload.content, { emitUpdate: false });
      try {
        const maxPos = editor.state.doc.content.size;
        editor.commands.setTextSelection({
          from: Math.min(from, maxPos),
          to: Math.min(to, maxPos),
        });
      } catch {
        // ignore
      }
      isRemoteUpdate.current = false;
    });

    channel.on("broadcast", { event: "title-change" }, ({ payload }) => {
      if (payload.sender === identity.id) return;
      setTitle(payload.title);
    });

    // Subscribe AFTER all listeners are registered
    subscribeChannel(channel);

    return () => {
      channel.unsubscribe();
      channelRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.id, identity.id]);

  // Keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        if (editor) {
          setSaving(true);
          supabase
            .from("albert_documents")
            .update({
              content: editor.getHTML(),
              title,
              updated_at: new Date().toISOString(),
            })
            .eq("id", doc.id)
            .then(() => {
              setSaving(false);
              setLastSaved(new Date());
              showToast("Saved");
            });
        }
      }
      // Toggle AI panel
      if ((e.metaKey || e.ctrlKey) && e.key === "j") {
        e.preventDefault();
        setShowAI((prev) => !prev);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [editor, doc.id, title]);

  // Word count on mount
  useEffect(() => {
    if (editor) {
      const text = editor.state.doc.textContent;
      setWordCount(text.trim() ? text.trim().split(/\s+/).length : 0);
    }
  }, [editor]);

  // Pending suggestion count (drives the header badge)
  useEffect(() => {
    if (!editor) return;
    const refresh = () => setSuggestionCount(collectSuggestions(editor).length);
    refresh();
    editor.on("update", refresh);
    editor.on("transaction", refresh);
    return () => {
      editor.off("update", refresh);
      editor.off("transaction", refresh);
    };
  }, [editor]);

  const readingTime = Math.max(1, Math.ceil(wordCount / 200));

  return (
    <div className="flex h-screen overflow-hidden">
      <ChapterSidebar currentDocId={doc.id} />

      {/* Main editor area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="border-b border-zinc-100 px-4 h-11 flex items-center justify-between shrink-0 bg-white">
          <div className="flex items-center gap-2 min-w-0">
            <a
              href="/"
              className="text-zinc-300 hover:text-zinc-500 transition-colors shrink-0"
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                <polyline points="9 22 9 12 15 12 15 22" />
              </svg>
            </a>
            <span className="text-zinc-200">/</span>
            <input
              type="text"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                saveTitle(e.target.value);
              }}
              className="text-sm font-medium bg-transparent border-none outline-none p-0 min-w-0 flex-1"
              placeholder="Untitled"
            />
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {/* Presence */}
            <div className="flex items-center -space-x-1.5 mr-1">
              {peers.map((peer) => (
                <div
                  key={peer.id}
                  title={peer.name}
                  className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-semibold ring-2 ring-white"
                  style={{ backgroundColor: peer.color }}
                >
                  {peer.name[0]}
                </div>
              ))}
              <div
                title={`${identity.name} (you)`}
                className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-semibold ring-2 ring-white"
                style={{ backgroundColor: identity.color }}
              >
                {identity.name[0]}
              </div>
            </div>

            {/* Save status */}
            <span className="text-[11px] text-zinc-300 tabular-nums">
              {saving
                ? "Saving..."
                : lastSaved
                  ? lastSaved.toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : ""}
            </span>

            {/* Save Version */}
            <button
              onClick={async () => {
                if (!editor) return;
                const msg = prompt("Version label (optional):");
                if (msg === null) return;
                await supabase.from("albert_versions").insert({
                  document_id: doc.id,
                  content: editor.getHTML(),
                  title,
                  message: msg || `Snapshot ${new Date().toLocaleDateString()}`,
                });
                showToast("Version saved");
              }}
              className="text-[11px] text-zinc-400 hover:text-zinc-600 hover:bg-zinc-50 px-2 py-0.5 rounded transition-colors"
              title="Save a named version"
            >
              Save version
            </button>

            {/* History */}
            <a
              href={`/d/${doc.id}/history`}
              className="text-[11px] text-zinc-400 hover:text-zinc-600 hover:bg-zinc-50 px-2 py-0.5 rounded transition-colors"
              title="View version history & diffs"
            >
              History
            </a>

            {/* Markdown toggle */}
            <button
              onClick={toggleMarkdown}
              className={`text-[11px] px-2 py-0.5 rounded transition-colors ${
                showMarkdown
                  ? "bg-zinc-900 text-white"
                  : "text-zinc-400 hover:text-zinc-600 hover:bg-zinc-50"
              }`}
              title="Toggle markdown source"
            >
              MD
            </button>

            {/* Suggestions toggle */}
            <button
              onClick={() => {
                setShowSuggestions(!showSuggestions);
                if (!showSuggestions) {
                  setShowAI(false);
                  setShowComments(false);
                }
              }}
              className={`text-[11px] px-2 py-0.5 rounded transition-colors font-medium flex items-center gap-1 ${
                showSuggestions
                  ? "bg-emerald-600 text-white"
                  : suggestionCount > 0
                    ? "text-emerald-700 bg-emerald-50 hover:bg-emerald-100"
                    : "text-zinc-400 hover:text-zinc-600 hover:bg-zinc-50"
              }`}
              title="Review pending AI suggestions"
            >
              Suggestions
              {suggestionCount > 0 && (
                <span
                  className={`inline-flex items-center justify-center min-w-[14px] h-[14px] px-1 rounded-full text-[9px] font-semibold ${
                    showSuggestions ? "bg-white/20" : "bg-emerald-600 text-white"
                  }`}
                >
                  {suggestionCount}
                </span>
              )}
            </button>

            {/* Comments toggle */}
            <button
              onClick={() => {
                setShowComments(!showComments);
                if (!showComments) {
                  setShowAI(false);
                  setShowSuggestions(false);
                }
              }}
              className={`text-[11px] px-2 py-0.5 rounded transition-colors font-medium ${
                showComments
                  ? "bg-amber-500 text-white"
                  : "text-amber-600 hover:text-amber-700 hover:bg-amber-50"
              }`}
              title="Toggle comments panel"
            >
              Comments
            </button>

            {/* AI toggle */}
            <button
              onClick={() => {
                setShowAI(!showAI);
                if (!showAI) {
                  setShowComments(false);
                  setShowSuggestions(false);
                }
              }}
              className={`text-[11px] px-2 py-0.5 rounded transition-colors font-medium ${
                showAI
                  ? "bg-violet-600 text-white"
                  : "text-violet-500 hover:text-violet-700 hover:bg-violet-50"
              }`}
              title="Toggle AI assistant (Cmd+J)"
            >
              AI
            </button>

            {/* Share */}
            <button
              onClick={() => {
                navigator.clipboard.writeText(window.location.href);
                showToast("Link copied");
              }}
              className="text-[11px] text-zinc-400 hover:text-zinc-600 border border-zinc-200 rounded px-2 py-0.5 transition-colors"
            >
              Share
            </button>
          </div>
        </header>

        {/* Toolbar */}
        {editor && !showMarkdown && <Toolbar editor={editor} />}

        {/* Editor or Markdown source */}
        <div className="flex-1 overflow-y-auto">
          {showMarkdown ? (
            <div className="max-w-3xl w-full mx-auto px-6 py-8">
              <textarea
                value={markdownSource}
                onChange={(e) => setMarkdownSource(e.target.value)}
                className="w-full min-h-[calc(100vh-12rem)] font-mono text-sm leading-relaxed bg-transparent border-none outline-none resize-none text-zinc-800"
                placeholder="Markdown source..."
              />
              <div className="flex gap-2 mt-4">
                <button
                  onClick={applyMarkdownSource}
                  className="text-xs bg-zinc-900 text-white px-3 py-1.5 rounded font-medium"
                >
                  Apply changes
                </button>
                <button
                  onClick={() => setShowMarkdown(false)}
                  className="text-xs text-zinc-500 px-3 py-1.5 rounded border border-zinc-200"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="max-w-3xl w-full mx-auto px-6 py-8">
              <EditorContent editor={editor} />
            </div>
          )}
        </div>

        {/* Footer */}
        <footer className="border-t border-zinc-50 px-4 h-7 flex items-center justify-between text-[11px] text-zinc-300 shrink-0">
          <div className="flex gap-3">
            <span>
              {wordCount} {wordCount === 1 ? "word" : "words"}
            </span>
            <span>{readingTime} min read</span>
          </div>
          <div className="flex gap-3">
            <span>
              <kbd className="font-mono">&#8984;J</kbd> AI
            </span>
            <span>
              <kbd className="font-mono">&#8984;S</kbd> Save
            </span>
          </div>
        </footer>
      </div>

      {/* Suggestions Panel */}
      {showSuggestions && (
        <div className="w-80 border-l border-zinc-100 bg-white flex flex-col shrink-0">
          <SuggestionsPanel
            editor={editor}
            onClose={() => setShowSuggestions(false)}
          />
        </div>
      )}

      {/* Comments Panel */}
      {showComments && (
        <div className="w-80 border-l border-zinc-100 bg-white flex flex-col shrink-0">
          <CommentsPanel
            documentId={doc.id}
            selectedText={selectedText}
            onClose={() => setShowComments(false)}
          />
        </div>
      )}

      {/* AI Panel */}
      {showAI && (
        <div className="w-80 border-l border-zinc-100 bg-white flex flex-col shrink-0">
          <div className="h-11 border-b border-zinc-100 px-3 flex items-center justify-between shrink-0">
            <span className="text-sm font-medium">Claude</span>
            <button
              onClick={() => setShowAI(false)}
              className="text-zinc-300 hover:text-zinc-600 transition-colors"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
          <AIPanel
            documentContent={editor?.getText() || ""}
            selectedText={selectedText}
            onInsert={handleInsert}
            onReplace={handleReplace}
          />
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-zinc-900 text-white text-sm px-4 py-2 rounded-lg shadow-lg animate-pulse z-50">
          {toast}
        </div>
      )}
    </div>
  );
}

// Simple HTML to markdown converter
function htmlToMarkdown(html: string): string {
  let md = html;
  md = md.replace(/<h1[^>]*>(.*?)<\/h1>/gi, "# $1\n");
  md = md.replace(/<h2[^>]*>(.*?)<\/h2>/gi, "## $1\n");
  md = md.replace(/<h3[^>]*>(.*?)<\/h3>/gi, "### $1\n");
  md = md.replace(/<strong[^>]*>(.*?)<\/strong>/gi, "**$1**");
  md = md.replace(/<em[^>]*>(.*?)<\/em>/gi, "*$1*");
  md = md.replace(/<s[^>]*>(.*?)<\/s>/gi, "~~$1~~");
  md = md.replace(/<code[^>]*>(.*?)<\/code>/gi, "`$1`");
  md = md.replace(/<blockquote[^>]*>(.*?)<\/blockquote>/gi, "> $1\n");
  md = md.replace(/<li[^>]*>(.*?)<\/li>/gi, "- $1\n");
  md = md.replace(/<br\s*\/?>/gi, "\n");
  md = md.replace(/<p[^>]*>(.*?)<\/p>/gi, "$1\n\n");
  md = md.replace(/<hr\s*\/?>/gi, "---\n");
  md = md.replace(/<[^>]+>/g, "");
  md = md.replace(/&amp;/g, "&");
  md = md.replace(/&lt;/g, "<");
  md = md.replace(/&gt;/g, ">");
  md = md.replace(/&nbsp;/g, " ");
  md = md.replace(/\n{3,}/g, "\n\n");
  return md.trim();
}

// Simple markdown to HTML converter
function markdownToHtml(md: string): string {
  let html = md;
  html = html.replace(/^### (.+)$/gm, "<h3>$1</h3>");
  html = html.replace(/^## (.+)$/gm, "<h2>$1</h2>");
  html = html.replace(/^# (.+)$/gm, "<h1>$1</h1>");
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");
  html = html.replace(/~~(.+?)~~/g, "<s>$1</s>");
  html = html.replace(/`(.+?)`/g, "<code>$1</code>");
  html = html.replace(/^> (.+)$/gm, "<blockquote><p>$1</p></blockquote>");
  html = html.replace(/^- (.+)$/gm, "<li>$1</li>");
  html = html.replace(/^---$/gm, "<hr>");
  // Wrap remaining lines in paragraphs
  html = html
    .split("\n\n")
    .map((block) => {
      block = block.trim();
      if (!block) return "";
      if (
        block.startsWith("<h") ||
        block.startsWith("<blockquote") ||
        block.startsWith("<li") ||
        block.startsWith("<hr")
      )
        return block;
      return `<p>${block.replace(/\n/g, "<br>")}</p>`;
    })
    .join("");
  return html;
}
