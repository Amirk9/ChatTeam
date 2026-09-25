import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useMessages } from '../../stores/message.store.jsx';
import { usePresence } from '../../stores/presence.store.jsx';
import { messageApi } from '../../services/messages.js';
import MessageItem, { dayOf } from './MessageItem.jsx';
import VirtualList from './VirtualList.jsx';
import ChannelWelcome from '../channels/ChannelWelcome.jsx';

// Slack-style feed: welcome header, date pills, unread divider, load-more.
// Rows virtualize past 60 items (Phase 10 perf); smaller feeds render directly.
export default function MessageFeed({ channel, onReply, unreadFrom, onGif, onHuddle, onInvite }) {
  const { byChannel, load } = useMessages();
  const { typing } = usePresence();
  const feed = byChannel[channel.id] || { messages: [], nextCursor: null };
  const listRef = useRef(null);
  const loadedRef = useRef(null);
  const [jumpId, setJumpId] = useState(null);

  useEffect(() => {
    if (loadedRef.current !== channel.id) {
      loadedRef.current = channel.id;
      load(channel.id);
    }
  }, [channel.id, load]);

  const messages = feed.messages;

  const rows = useMemo(() => {
    const out = [];
    // Slack shows the channel welcome at the very top once history is complete.
    if (!feed.nextCursor) {
      out.push({ type: 'welcome', key: `welcome-${channel.id}`, domId: undefined });
    }
    let lastDay = '';
    messages.forEach((m, i) => {
      const day = dayOf(m.createdAt);
      if (day !== lastDay) {
        out.push({ type: 'day', key: `day-${channel.id}-${day}`, domId: undefined, day });
        lastDay = day;
      }
      out.push({ type: 'msg', key: m.id, domId: `msg-${m.id}`, message: m, index: i });
    });
    return out;
  }, [messages, channel.id, feed.nextCursor]);

  // Mark read at the newest message whenever the feed grows (Slack behavior).
  useEffect(() => {
    if (!messages.length) return;
    listRef.current?.scrollToBottom();
    const last = messages[messages.length - 1];
    const t = setTimeout(() => messageApi.markRead(channel.id, last.id).catch(() => {}), 800);
    return () => clearTimeout(t);
  }, [channel.id, messages.length]);

  // Search jump-to-message: scroll the virtual row into view + highlight.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('tc_jump');
      if (!raw) return;
      const j = JSON.parse(raw);
      if (j.channelId !== channel.id) return;
      sessionStorage.removeItem('tc_jump');
      setJumpId(j.messageId);
      const t = setTimeout(() => {
        const idx = rows.findIndex((r) => r.type === 'msg' && r.message.id === j.messageId);
        if (idx >= 0) listRef.current?.scrollToIndex(idx);
      }, 400);
      const c = setTimeout(() => setJumpId(null), 4000);
      return () => { clearTimeout(t); clearTimeout(c); };
    } catch {}
  }, [channel.id, messages.length, rows]);

  const unreadKey = useMemo(() => {
    if (!unreadFrom) return null;
    const hit = rows.find((r) => r.type === 'msg' && new Date(r.message.createdAt) > new Date(unreadFrom));
    return hit ? hit.key : null;
  }, [rows, unreadFrom]);

  async function more() {
    if (feed.nextCursor) await load(channel.id, feed.nextCursor);
  }

  const typists = Object.values(typing[channel.id] || {}).map((t) => t.displayName).filter(Boolean);

  function renderRow(r) {
    if (r.type === 'welcome') {
      return <ChannelWelcome channel={channel} onGif={onGif} onHuddle={onHuddle} onInvite={onInvite} />;
    }
    if (r.type === 'day') {
      return (
        <div className="flex items-center gap-3 px-5 my-3">
          <div className="flex-1 border-t border-gray-300 dark:border-white/15" />
          <button className="text-[13px] font-bold text-[#1d1c1d] dark:text-white border border-gray-300 dark:border-white/20 rounded-full px-3 py-0.5 hover:bg-gray-100 dark:hover:bg-white/10 shadow-sm dark:shadow-none">
            {r.day} ⌄
          </button>
          <div className="flex-1 border-t border-gray-300 dark:border-white/15" />
        </div>
      );
    }
    const m = r.message;
    const prev = r.index > 0 ? messages[r.index - 1] : null;
    const compact = Boolean(
      prev && !prev.deleted && !m.deleted &&
      prev.sender.id === m.sender.id &&
      new Date(m.createdAt) - new Date(prev.createdAt) < 5 * 60 * 1000 &&
      !m.parentMessageId
    );
    return (
      <React.Fragment>
        {r.key === unreadKey ? (
          <div className="flex items-center gap-3 px-5 my-2">
            <div className="flex-1 border-t border-red-400" />
            <span className="text-xs font-semibold text-red-500">New</span>
            <div className="flex-1 border-t border-red-400" />
          </div>
        ) : null}
        <MessageItem message={m} channelId={channel.id} onReply={onReply} compact={compact} highlight={jumpId === m.id} />
      </React.Fragment>
    );
  }

  return (
    <VirtualList
      ref={listRef}
      items={rows}
      renderRow={renderRow}
      onNearTop={more}
      nearTop={feed.nextCursor ? (
        <button onClick={more} className="mx-auto block text-xs text-[#1264A3] hover:underline mb-2">Load older messages</button>
      ) : null}
      bottomAnchor={
        <>
          {messages.length === 0 && feed.nextCursor ? (
            <div className="px-5 py-6 max-w-2xl">
              <div className="w-14 h-14 rounded-lg bg-[#4A154B] text-white flex items-center justify-center text-2xl font-bold mb-3">
                {channel.isPrivate ? '🔒' : '#'}
              </div>
              <h3 className="text-xl font-bold mb-1 text-[#1d1c1d] dark:text-white">Welcome to #{channel.name}</h3>
              <p className="text-sm text-gray-500 dark:text-white/50">{channel.description || 'This is the very beginning of the channel.'}</p>
            </div>
          ) : null}
          {typists.length > 0 ? (
            <p className="px-5 py-1 text-xs text-gray-500 italic">
              {typists.slice(0, 3).join(', ')}{typists.length > 3 ? ` and ${typists.length - 3} others` : ''} {typists.length === 1 ? 'is' : 'are'} typing...
            </p>
          ) : null}
        </>
      }
    />
  );
}
