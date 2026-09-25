import React, { useEffect, useMemo, useRef } from 'react';
import { useMessages } from '../../stores/message.store.jsx';
import { usePresence } from '../../stores/presence.store.jsx';
import { messageApi } from '../../services/messages.js';
import MessageItem, { dayOf } from './MessageItem.jsx';

// Slack-style feed: date separators, unread divider, load-more, read marking.
export default function MessageFeed({ channel, onReply, unreadFrom }) {
  const { byChannel, load } = useMessages();
  const { typing } = usePresence();
  const feed = byChannel[channel.id] || { messages: [], nextCursor: null };
  const bottomRef = useRef(null);
  const loadedRef = useRef(null);

  useEffect(() => {
    if (loadedRef.current !== channel.id) {
      loadedRef.current = channel.id;
      load(channel.id);
    }
  }, [channel.id, load]);

  const messages = feed.messages;

  // Mark read at the newest message whenever the feed grows (Slack behavior).
  useEffect(() => {
    if (!messages.length) return;
    const last = messages[messages.length - 1];
    bottomRef.current?.scrollIntoView({ block: 'end' });
    const t = setTimeout(() => messageApi.markRead(channel.id, last.id).catch(() => {}), 800);
    return () => clearTimeout(t);
  }, [channel.id, messages.length]);

  const groups = useMemo(() => {
    const out = [];
    let lastDay = '';
    for (const m of messages) {
      const day = dayOf(m.createdAt);
      if (day !== lastDay) {
        out.push({ type: 'day', key: `day-${day}`, day });
        lastDay = day;
      }
      out.push({ type: 'msg', key: m.id, message: m });
    }
    return out;
  }, [messages]);

  const unreadIdx = useMemo(() => {
    if (!unreadFrom) return -1;
    return groups.findIndex((g) => g.type === 'msg' && new Date(g.message.createdAt) > new Date(unreadFrom));
  }, [groups, unreadFrom]);

  async function more() {
    if (feed.nextCursor) await load(channel.id, feed.nextCursor);
  }

  const typists = Object.values(typing[channel.id] || {}).map((t) => t.displayName).filter(Boolean);

  return (
    <div className="flex-1 overflow-y-auto py-2">
      {feed.nextCursor ? (
        <button onClick={more} className="mx-auto block text-xs text-[#1264A3] hover:underline mb-2">Load older messages</button>
      ) : null}
      {groups.map((g, i) => {
        if (g.type === 'day') {
          return (
            <div key={g.key} className="flex items-center gap-3 px-5 my-3">
              <div className="flex-1 border-t border-gray-200" />
              <span className="text-xs font-semibold text-gray-500 border border-gray-200 rounded-full px-3 py-0.5">{g.day}</span>
              <div className="flex-1 border-t border-gray-200" />
            </div>
          );
        }
        const prev = i > 0 && groups[i - 1].type === 'msg' ? groups[i - 1].message : null;
        const compact = Boolean(
          prev && !prev.deleted && !g.message.deleted &&
          prev.sender.id === g.message.sender.id &&
          new Date(g.message.createdAt) - new Date(prev.createdAt) < 5 * 60 * 1000 &&
          !g.message.parentMessageId
        );
        return (
          <React.Fragment key={g.key}>
            {i === unreadIdx ? (
              <div className="flex items-center gap-3 px-5 my-2">
                <div className="flex-1 border-t border-red-400" />
                <span className="text-xs font-semibold text-red-500">New</span>
                <div className="flex-1 border-t border-red-400" />
              </div>
            ) : null}
            <MessageItem message={g.message} channelId={channel.id} onReply={onReply} compact={compact} />
          </React.Fragment>
        );
      })}
      {messages.length === 0 ? (
        <div className="px-5 py-6 max-w-2xl">
          <div className="w-14 h-14 rounded-lg bg-[#4A154B] text-white flex items-center justify-center text-2xl font-bold mb-3">
            {channel.isPrivate ? '🔒' : '#'}
          </div>
          <h3 className="text-xl font-bold mb-1">Welcome to #{channel.name}</h3>
          <p className="text-sm text-gray-500">{channel.description || 'This is the very beginning of the channel.'}</p>
        </div>
      ) : null}
      <div ref={bottomRef} />
      {typists.length > 0 ? (
        <p className="px-5 py-1 text-xs text-gray-500 italic">
          {typists.slice(0, 3).join(', ')}{typists.length > 3 ? ` and ${typists.length - 3} others` : ''} {typists.length === 1 ? 'is' : 'are'} typing...
        </p>
      ) : null}
    </div>
  );
}
