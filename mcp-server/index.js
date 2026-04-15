#!/usr/bin/env node

/**
 * Albert MCP Server
 *
 * Gives Claude Code read/write access to Albert documents
 * via the Supabase API. Add to your Claude Code MCP config:
 *
 * {
 *   "mcpServers": {
 *     "albert": {
 *       "command": "node",
 *       "args": ["/Users/dereklomas/albert/mcp-server/index.js"]
 *     }
 *   }
 * }
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  "https://ykhxaecbbxaaqlujuzde.supabase.co",
  // Use anon key — RLS allows all access
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlraHhhZWNiYnhhYXFsdWp1emRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUwNjExMDEsImV4cCI6MjA4MDYzNzEwMX0.O2chfnHGQWLOaVSFQ-F6UJMlya9EzPbsUh848SEOPj4"
);

const server = new Server(
  { name: "albert", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

// --- Tool definitions ---

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "list_documents",
      description:
        "List all Albert documents. Returns id, title, chapter_number, word count, and last updated time.",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
    {
      name: "read_document",
      description:
        "Read an Albert document's full content. Returns HTML content and metadata. Use list_documents first to find the id.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Document ID" },
        },
        required: ["id"],
      },
    },
    {
      name: "update_document",
      description:
        "Update an Albert document's content and/or title. Content should be HTML. Other collaborators will see changes in real time.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Document ID" },
          content: {
            type: "string",
            description: "New HTML content (optional)",
          },
          title: { type: "string", description: "New title (optional)" },
        },
        required: ["id"],
      },
    },
    {
      name: "create_document",
      description:
        "Create a new Albert document. Returns the new document's id and URL.",
      inputSchema: {
        type: "object",
        properties: {
          title: { type: "string", description: "Document title" },
          content: {
            type: "string",
            description: "Initial HTML content (optional)",
          },
          chapter_number: {
            type: "number",
            description: "Chapter number if this is a book chapter (optional)",
          },
        },
        required: ["title"],
      },
    },
    {
      name: "search_documents",
      description:
        "Search Albert documents by title or content. Returns matching documents.",
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
      const { data, error } = await supabase
        .from("albert_documents")
        .select("id, title, chapter_number, content, updated_at")
        .order("chapter_number", { ascending: true, nullsFirst: false });

      if (error) return errorResult(error.message);

      const docs = (data || []).map((d) => ({
        id: d.id,
        title: d.title,
        chapter_number: d.chapter_number,
        words: d.content
          ? d.content.replace(/<[^>]+>/g, "").trim().split(/\s+/).length
          : 0,
        updated_at: d.updated_at,
      }));

      return textResult(JSON.stringify(docs, null, 2));
    }

    case "read_document": {
      const { data, error } = await supabase
        .from("albert_documents")
        .select("*")
        .eq("id", args.id)
        .single();

      if (error) return errorResult(error.message);

      // Strip HTML for a cleaner text representation alongside the raw HTML
      const plainText = data.content
        ? data.content
            .replace(/<[^>]+>/g, "\n")
            .replace(/&amp;/g, "&")
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">")
            .replace(/&nbsp;/g, " ")
            .replace(/\n{3,}/g, "\n\n")
            .trim()
        : "";

      return textResult(
        JSON.stringify(
          {
            id: data.id,
            title: data.title,
            chapter_number: data.chapter_number,
            updated_at: data.updated_at,
            content_html: data.content,
            content_text: plainText,
            url: `https://albert-n0b635mw6-dereklomas-projects.vercel.app/d/${data.id}`,
          },
          null,
          2
        )
      );
    }

    case "update_document": {
      const updates = { updated_at: new Date().toISOString() };
      if (args.content !== undefined) updates.content = args.content;
      if (args.title !== undefined) updates.title = args.title;

      const { error } = await supabase
        .from("albert_documents")
        .update(updates)
        .eq("id", args.id);

      if (error) return errorResult(error.message);

      return textResult(
        `Updated document ${args.id}. View at: https://albert-n0b635mw6-dereklomas-projects.vercel.app/d/${args.id}`
      );
    }

    case "create_document": {
      const id = randomId();
      const doc = {
        id,
        title: args.title || "Untitled",
        content: args.content || "",
        chapter_number: args.chapter_number || null,
      };

      const { error } = await supabase
        .from("albert_documents")
        .insert(doc);

      if (error) return errorResult(error.message);

      return textResult(
        JSON.stringify(
          {
            id,
            title: doc.title,
            url: `https://albert-n0b635mw6-dereklomas-projects.vercel.app/d/${id}`,
          },
          null,
          2
        )
      );
    }

    case "search_documents": {
      const { data, error } = await supabase
        .from("albert_documents")
        .select("id, title, chapter_number, content, updated_at")
        .or(
          `title.ilike.%${args.query}%,content.ilike.%${args.query}%`
        );

      if (error) return errorResult(error.message);

      const results = (data || []).map((d) => ({
        id: d.id,
        title: d.title,
        chapter_number: d.chapter_number,
        preview: d.content
          ? d.content.replace(/<[^>]+>/g, "").slice(0, 200)
          : "",
        url: `https://albert-n0b635mw6-dereklomas-projects.vercel.app/d/${d.id}`,
      }));

      return textResult(JSON.stringify(results, null, 2));
    }

    default:
      return errorResult(`Unknown tool: ${name}`);
  }
});

function textResult(text) {
  return { content: [{ type: "text", text }] };
}

function errorResult(message) {
  return { content: [{ type: "text", text: `Error: ${message}` }], isError: true };
}

function randomId() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let id = "";
  for (let i = 0; i < 10; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

// --- Start ---

const transport = new StdioServerTransport();
await server.connect(transport);
