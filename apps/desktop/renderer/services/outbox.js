import { isOfflineError } from './api.js';

// Offline outbox (Phase 10): failed sends queue in localStorage and flush
// when connectivity returns — Slack-style "queued sends".
const KEY = 'tc_outbox';

export function readOutbox() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '[]');
  } catch {
    return [];
  }
}

function writeOutbox(items) {
  try {
    localStorage.setItem(KEY, JSON.stringify(items.slice(0, 50)));
  } catch {}
  window.dispatchEvent(new CustomEvent('teamchat:outbox'));
}

export function enqueue(entry) {
  writeOutbox([...readOutbox(), { ...entry, at: new Date().toISOString(), id: `${Date.now()}-${Math.random().toString(36).slice(2)}` }]);
}

export function drop(id) {
  writeOutbox(readOutbox().filter((e) => e.id !== id));
}

// Flush via caller-supplied senders (avoids store import cycles).
export async function flushOutbox({ sendChannel, sendDm } = {}) {
  const items = readOutbox();
  for (const item of items) {
    try {
      if (item.kind === 'channel' && sendChannel) await sendChannel(item.targetId, item.input);
      else if (item.kind === 'dm' && sendDm) await sendDm(item.targetId, item.input);
      else continue;
      drop(item.id);
    } catch (e) {
      if (isOfflineError(e)) return; // still offline — keep the rest queued
      drop(item.id); // rejection (validation/perm) — drop, don't wedge the queue
    }
  }
}

// Wrap a store send: network failures queue instead of throwing away text.
export async function sendWithOutbox(kind, targetId, input, sender) {
  try {
    return await sender(targetId, input);
  } catch (e) {
    if (isOfflineError(e)) {
      enqueue({ kind, targetId, input });
      return { queued: true };
    }
    throw e;
  }
}
