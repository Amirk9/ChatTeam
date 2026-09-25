import React from 'react';

// Real-Slack channel welcome: 👋 headline + description + onboarding cards.
export default function ChannelWelcome({ channel, onGif, onHuddle, onInvite }) {
  return (
    <div className="px-5 pt-6 pb-2">
      <p className="text-2xl font-black text-[#1d1c1d] dark:text-white mb-1">
        👋 Have a little chit-chat in #{channel.name}
      </p>
      <p className="text-[15px] text-[#1d1c1d] dark:text-white/80 mb-4">
        {channel.description || 'This is the very beginning of the channel. Get to know your teammates and show your lighter side. 🎈'}
      </p>
      <div className="flex gap-3 overflow-x-auto pb-2">
        <button onClick={onGif} className="shrink-0 w-52 rounded-xl overflow-hidden border border-gray-200 dark:border-white/10 bg-[#4A154B] hover:ring-2 hover:ring-[#611f69] text-left">
          <p className="px-3 pt-2 pb-1 font-bold text-white text-[15px]">Send a GIF</p>
          <div className="m-2 rounded-lg bg-white p-2 grid grid-cols-3 gap-1 text-2xl">
            <span>😂</span><span>🎉</span><span>👏</span><span>🔥</span><span>💯</span><span>😮</span>
          </div>
        </button>
        <button onClick={onHuddle} className="shrink-0 w-52 rounded-xl overflow-hidden border border-gray-200 dark:border-white/10 bg-[#1264A3] hover:ring-2 hover:ring-[#1264A3] text-left">
          <p className="px-3 pt-2 pb-1 font-bold text-white text-[15px]">Take a coffee<br />break together</p>
          <div className="m-2 rounded-lg bg-white p-2 flex items-center justify-center text-4xl">🎧☕</div>
        </button>
        <button onClick={onInvite} className="shrink-0 w-52 rounded-xl overflow-hidden border border-gray-200 dark:border-white/10 bg-[#3F0E40] hover:ring-2 hover:ring-[#611f69] text-left">
          <p className="px-3 pt-2 pb-1 font-bold text-white text-[15px]">Invite teammates</p>
          <div className="m-2 rounded-lg p-2 flex items-end justify-center gap-1 text-4xl">🧑‍💻👩‍💻🧑‍🎨</div>
        </button>
      </div>
    </div>
  );
}
