#!/usr/bin/env node

/**
 * Albert MCP Server — token-efficient collaborative doc access
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { createClient } from "@supabase/supabase-js";

const ALBERT_URL = "https://albert-n0b635mw6-dereklomas-projects.vercel.app";

const supabase = createClient(
  "https://ykhxaecbbxaaqlujuzde.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlraHhhZWNiYnhhYXFsdWp1emRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUwNjExMDEsImV4cCI6MjA4MDYzNzEwMX0.O2chfnHGQWLOaVSFQ-F6UJMlya9EzPbsUh848SEOPj4"
);

const server = new Server(
  { name: "albert", version: "1.1.0" },
  { capabilities: { tools: {} } }
);

// --- HTML to plain text ---

function stripHtml(html) {
  if (!html) return "";
  return html
    .replace(/<h([1-3])[^>]*>(.*?)<\/h[1-3]>/gi, (_, level, text) => "#".repeat(+level) + " " + text + "\n")
    .replace(/<li[^>]*>(.*?)<\/li>/gi, "- $1\n")
    .replace(/<blockquote[^>]*>(.*?)<\/blockquote>/gi, "> $1\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<strong[^>]*>(.*?)<\/strong>/gi, "**$1**")
    .replace(/<em[^>]*>(.*?)<\/em>/gi, "*$1*")
    .replace(/<code[^>]*>(.*?)<\/code>/gi, "`$1`")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function wordCount(html) {
  const text = stripHtml(html);
  return text ? text.split(/\s+/).length : 0;
}

// --- Tool definitions ---

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "list_documents",
      description: "List Albert documents. Returns id, title, chapter_number, word count. Does NOT return content — use read_document for that.",
      inputSchema: {
        type: "object",
        properties: {
          limit: { type: "number", description: "Max docs to return (default 50)" },
        },
      },
    },
    {
      name: "read_document",
      description: "Read an Albert document. Returns plain text (markdown-like) by default. Pass format='html' for raw HTML.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Document ID" },
          format: { type: "string", enum: ["text", "html"], description: "Output format (default: text)" },
        },
        required: ["id"],
      },
    },
    {
      name: "update_document",
      description: "Update an Albert document. Accepts plain text or HTML. Collaborators see changes in real time in the browser.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Document ID" },
          content: { type: "string", description: "New content (HTML)" },
          title: { type: "string", description: "New title" },
        },
        required: ["id"],
      },
    },
    {
      name: "create_document",
      description: "Create a new Albert document.",
      inputSchema: {
        type: "object",
        properties: {
          title: { type: "string", description: "Document title" },
          content: { type: "string", description: "Initial content (HTML)" },
          chapter_number: { type: "number", description: "Chapter number (optional)" },
        },
        required: ["title"],
      },
    },
    {
      name: "search_documents",
      description: "Search Albert documents by title or content.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query" },
        },
        required: ["query"],
      },
    },
  ],
}));

// --- Tool handlers ---

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    case "list_documents": {
      const limit = args?.limit || 50;
      const { data, error } = await supabase
        .from("albert_documents")
        .select("id, title, chapter_number, content, updated_at")
        .order("chapter_number", { ascending: true, nullsFirst: false })
        .limit(limit);

      if (error) return err(error.message);

      // Compact format: one line per doc, no JSON bloat
      const lines = (data || []).map((d) => {
        const ch = d.chapter_number ? `ch${d.chapter_number} ` : "";
        const wc = wordCount(d.content);
        return `${d.id}\t${ch}${d.title || "Untitled"}\t${wc}w\t${d.updated_at.slice(0, 10)}`;
      });

      return ok(`id\ttitle\twords\tupdated\n${lines.join("\n")}`);
    }

    case "read_document": {
      const { data, error } = await supabase
        .from("albert_documents")
        .select("id, title, chapter_number, content, updated_at")
        .eq("id", args.id)
        .single();

      if (error) return err(error.message);

      const format = args?.format || "text";
      const content = format === "html" ? data.content : stripHtml(data.content);

      // Minimal header, then content
      const header = `# ${data.title || "Untitled"}\nid: ${data.id} | ${ALBERT_URL}/d/${data.id}\n---\n`;
      return ok(header + (content || "(empty)"));
    }

    case "update_document": {
      const updates = { updated_at: new Date().toISOString() };
      if (args.content !== undefined) updates.content = args.content;
      if (args.title !== undefined) updates.title = args.title;

      const { error } = await supabase
        .from("albert_documents")
        .update(updates)
        .eq("id", args.id);

      if (error) return err(error.message);
      return ok(`Updated. ${ALBERT_URL}/d/${args.id}`);
    }

    case "create_document": {
      const id = randomId();
      const { error } = await supabase
        .from("albert_documents")
        .insert({
          id,
          title: args.title || "Untitled",
          content: args.content || "",
          chapter_number: args.chapter_number || null,
        });

      if (error) return err(error.message);
      return ok(`Created ${id}. ${ALBERT_URL}/d/${id}`);
    }

    case "search_documents": {
      const { data, error } = await supabase
        .from("albert_documents")
        .select("id, title, chapter_number, content")
        .or(`title.ilike.%${args.query}%,content.ilike.%${args.query}%`)
        .limit(10);

      if (error) return err(error.message);

      const lines = (data || []).map((d) => {
        const ch = d.chapter_number ? `ch${d.chapter_number} ` : "";
        const preview = stripHtml(d.content).slice(0, 100).replace(/\n/g, " ");
        return `${d.id}\t${ch}${d.title}\t${preview}`;
      });

      return ok(lines.length ? lines.join("\n") : "No results.");
    }

    default:
      return err(`Unknown tool: ${name}`);
  }
});

function ok(text) {
  return { content: [{ type: "text", text }] };
}

function err(message) {
  return { content: [{ type: "text", text: `Error: ${message}` }], isError: true };
}

function randomId() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let id = "";
  for (let i = 0; i < 10; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

const transport = new StdioServerTransport();
await server.connect(transport);
