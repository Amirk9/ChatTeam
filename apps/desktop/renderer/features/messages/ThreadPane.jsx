import React from 'react';
import { useMessages } from '../../stores/message.store.jsx';
import MessageItem from './MessageItem.jsx';
import Composer from './Composer.jsx';

// Slack-style thread pane: root + replies + reply box (channels + DMs).
export default function ThreadPane({ channel, dm, workspaceId }) {
  const { thread, threadRootId, closeThread, openThread } = useMessages();

  if (!threadRootId || !thread) return null;
  const [root, ...replies] = thread.messages.length ? thread.messages : [];
  if (!root) return null;
  const target = dm || channel;

  return (
    <div className="w-96 shrink-0 border-l border-gray-200 bg-white flex flex-col min-h-0">
      <div className="px-4 py-3 border-b border-gray-200 flex items-center">
        <div className="flex-1">
          <h3 className="font-bold text-sm">Thread</h3>
          <p className="text-xs text-gray-500">#{channel.name}</p>
        </div>
        <button onClick={closeThread} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
      </div>
      <div className="flex-1 overflow-y-auto py-2">
        <MessageItem message={root} channelId={channel.id} onReply={() => {}} />
        <div className="flex items-center gap-2 px-5 my-2">
          <p className="text-xs text-gray-500">{replies.length} {replies.length === 1 ? 'reply' : 'replies'}</p>
          <div className="flex-1 border-t border-gray-200" />
        </div>
        {replies.map((m) => (
          <MessageItem key={m.id} message={m} channelId={channel.id} onReply={() => {}} compact={false} />
        ))}
      </div>
      <Composer channel={dm ? undefined : channel} dm={dm} workspaceId={workspaceId} replyTo={root.id} mini
        onSent={() => openThread(target.id, root.id)} />
    </div>
  );
}
