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

const ADJECTIVES = [
    "Swift",
    "Bright",
    "Calm",
    "Bold",
    "Kind",
    "Warm",
    "Quick",
    "Keen",
];
const NOUNS = [
    "Fox",
    "Owl",
    "Bear",
    "Deer",
    "Hawk",
    "Wolf",
    "Lynx",
    "Crow",
];

function randomName() {
  return `${ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)]} ${NOUNS[Math.floor(Math.random() * NOUNS.length)]}`;
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

/** Give this browser's identity a real name. Presence and comments use it;
 *  peers already in the room see the new name on the next presence sync. */
export function setIdentityName(name: string): Peer {
  const identity = getIdentity();
  const trimmed = name.trim().slice(0, 60);
  if (!trimmed) return identity;
  identity.name = trimmed;
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem("albert-identity", JSON.stringify(identity));
    } catch {
      /* ignore */
    }
  }
  return identity;
}

/** Adopt the signed-in account as this browser's identity: the id is the
 *  account id, so the same person on two devices is one presence. */
export function setIdentityFromUser(user: { uid: string; name: string; color: string }): Peer {
  const identity: Peer = { id: user.uid, name: user.name || "Someone", color: user.color || randomColor() };
  storedIdentity = identity;
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem("albert-identity", JSON.stringify(identity));
    } catch {
      /* ignore */
    }
  }
  return identity;
}

/** True while the name is still one of the random "Swift Fox" placeholders. */
export function hasPlaceholderName(): boolean {
  const { name } = getIdentity();
  const [a, b, ...rest] = name.split(" ");
  return rest.length === 0 && ADJECTIVES.includes(a) && NOUNS.includes(b);
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
