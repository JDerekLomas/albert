import { supabase } from "./supabase";
import { RealtimeChannel } from "@supabase/supabase-js";

const COLORS = [
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#06b6d4",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
];

function randomColor() {
  return COLORS[Math.floor(Math.random() * COLORS.length)];
}

function randomName() {
  const adjectives = [
    "Swift",
    "Bright",
    "Calm",
    "Bold",
    "Kind",
    "Warm",
    "Quick",
    "Keen",
  ];
  const nouns = [
    "Fox",
    "Owl",
    "Bear",
    "Deer",
    "Hawk",
    "Wolf",
    "Lynx",
    "Crow",
  ];
  return `${adjectives[Math.floor(Math.random() * adjectives.length)]} ${nouns[Math.floor(Math.random() * nouns.length)]}`;
}

export type Peer = {
  id: string;
  name: string;
  color: string;
};

let storedIdentity: Peer | null = null;

export function getIdentity(): Peer {
  if (storedIdentity) return storedIdentity;

  if (typeof window !== "undefined") {
    const stored = localStorage.getItem("albert-identity");
    if (stored) {
      storedIdentity = JSON.parse(stored);
      return storedIdentity!;
    }
  }

  const identity: Peer = {
    id: crypto.randomUUID(),
    name: randomName(),
    color: randomColor(),
  };

  if (typeof window !== "undefined") {
    localStorage.setItem("albert-identity", JSON.stringify(identity));
  }

  storedIdentity = identity;
  return identity;
}

export function createChannel(documentId: string): RealtimeChannel {
  const identity = getIdentity();

  return supabase.channel(`doc:${documentId}`, {
    config: {
      presence: { key: identity.id },
      broadcast: { self: false },
    },
  });
}

export function subscribeChannel(channel: RealtimeChannel) {
  const identity = getIdentity();

  channel.subscribe(async (status) => {
    if (status === "SUBSCRIBED") {
      await channel.track({
        name: identity.name,
        color: identity.color,
        online_at: new Date().toISOString(),
      });
    }
  });
}
