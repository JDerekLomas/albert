"use client";

import { useState, useEffect, useRef } from "react";
import { supabase, Comment } from "@/lib/supabase";
import { getIdentity } from "@/lib/presence";

export default function CommentsPanel({
  documentId,
  selectedText,
  onClose,
}: {
  documentId: string;
  selectedText: string;
  onClose: () => void;
}) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [showResolved, setShowResolved] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const identity = getIdentity();

  useEffect(() => {
    loadComments();
  }, [documentId]);

  async function loadComments() {
    const { data } = await supabase
      .from("albert_comments")
      .select("*")
      .eq("document_id", documentId)
      .order("created_at", { ascending: false });
    setComments(data || []);
  }

  async function addComment() {
    if (!newComment.trim()) return;

    const { error } = await supabase.from("albert_comments").insert({
      document_id: documentId,
      content: newComment.trim(),
      author: identity.name,
      from_pos: 0,
      to_pos: 0,
      quote: selectedText || null,
      resolved: false,
    });

    if (!error) {
      setPostError(null);
      setNewComment("");
      loadComments();
    } else {
      setPostError(error.message);
    }
  }

  async function toggleResolved(comment: Comment) {
    await supabase
      .from("albert_comments")
      .update({ resolved: !comment.resolved })
      .eq("id", comment.id);
    loadComments();
  }

  async function deleteComment(id: string) {
    await supabase.from("albert_comments").delete().eq("id", id);
    loadComments();
  }

  function timeAgo(date: string) {
    const seconds = Math.floor(
      (Date.now() - new Date(date).getTime()) / 1000
    );
    if (seconds < 60) return "just now";
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  }

  const visible = showResolved
    ? comments
    : comments.filter((c) => !c.resolved);
  const resolvedCount = comments.filter((c) => c.resolved).length;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="h-11 border-b border-zinc-100 px-3 flex items-center justify-between shrink-0">
        <span className="text-sm font-medium">
          Comments
          {comments.length > 0 && (
            <span className="text-zinc-400 ml-1">({visible.length})</span>
          )}
        </span>
        <button
          onClick={onClose}
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

      {/* New comment */}
      <div className="p-3 border-b border-zinc-100">
        {selectedText && (
          <div className="text-[11px] text-zinc-400 mb-2 bg-zinc-50 rounded p-2 italic line-clamp-3">
            &ldquo;{selectedText.slice(0, 200)}
            {selectedText.length > 200 ? "..." : ""}&rdquo;
          </div>
        )}
        <textarea
          ref={inputRef}
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              addComment();
            }
          }}
          placeholder={
            selectedText
              ? "Comment on selection..."
              : "Add a comment..."
          }
          className="w-full text-sm border border-zinc-200 rounded-lg p-2 resize-none focus:outline-none focus:border-zinc-400 min-h-[60px]"
          rows={2}
        />
        <div className="flex items-center justify-between mt-2">
          <span className="text-[10px] text-zinc-300">
            {identity.name} &middot; Cmd+Enter to post
          </span>
          <button
            onClick={addComment}
            disabled={!newComment.trim()}
            className="text-xs bg-zinc-900 text-white px-3 py-1 rounded font-medium disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Post
          </button>
        </div>
        {postError && (
          <p className="text-[11px] text-red-500 mt-2">{postError}</p>
        )}
      </div>

      {/* Comments list */}
      <div className="flex-1 overflow-y-auto">
        {visible.length === 0 ? (
          <div className="text-center text-zinc-300 text-sm py-8">
            No comments yet
          </div>
        ) : (
          <div className="p-2">
            {visible.map((c) => (
              <div
                key={c.id}
                className={`p-2.5 rounded-lg mb-1.5 text-sm transition-colors ${
                  c.resolved
                    ? "bg-zinc-50 opacity-60"
                    : "bg-white border border-zinc-100"
                }`}
              >
                {c.quote && (
                  <div className="text-[11px] text-zinc-400 italic mb-1.5 border-l-2 border-zinc-200 pl-2 line-clamp-2">
                    {c.quote.slice(0, 150)}
                    {c.quote.length > 150 ? "..." : ""}
                  </div>
                )}
                <p className="text-zinc-700 text-[13px] leading-snug">
                  {c.content}
                </p>
                <div className="flex items-center justify-between mt-2">
                  <span className="text-[10px] text-zinc-400">
                    {c.author} &middot; {timeAgo(c.created_at)}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => toggleResolved(c)}
                      className={`text-[10px] ${
                        c.resolved
                          ? "text-zinc-400 hover:text-zinc-600"
                          : "text-green-500 hover:text-green-700"
                      }`}
                    >
                      {c.resolved ? "Reopen" : "Resolve"}
                    </button>
                    <button
                      onClick={() => deleteComment(c.id)}
                      className="text-[10px] text-zinc-300 hover:text-red-500"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      {resolvedCount > 0 && (
        <div className="border-t border-zinc-100 px-3 py-2">
          <button
            onClick={() => setShowResolved(!showResolved)}
            className="text-[11px] text-zinc-400 hover:text-zinc-600"
          >
            {showResolved
              ? "Hide resolved"
              : `Show ${resolvedCount} resolved`}
          </button>
        </div>
      )}
    </div>
  );
}
