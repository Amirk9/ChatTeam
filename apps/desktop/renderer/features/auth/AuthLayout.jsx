import React from 'react';

// Slack-style auth shell: centered card on light background, aubergine accents.
// Tailwind utilities only — no custom CSS.
export function AuthLayout({ title, subtitle, children, error }) {
  return (
    <div className="min-h-screen bg-[#f8f8f8] flex flex-col items-center px-4 py-10 font-sans">
      <div className="flex items-center gap-2 mb-8">
        <div className="w-9 h-9 rounded-lg bg-[#4A154B] text-white flex items-center justify-center font-bold text-lg">T</div>
        <span className="text-2xl font-bold text-[#1d1c1d]">TeamChat</span>
      </div>
      <div className="w-full max-w-md bg-white rounded-xl shadow-lg border border-gray-200 p-8">
        <h1 className="text-2xl font-bold text-[#1d1c1d] mb-1">{title}</h1>
        {subtitle ? <p className="text-sm text-gray-500 mb-6">{subtitle}</p> : <div className="mb-6" />}
        {error ? (
          <div className="mb-4 rounded-md bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2">{error}</div>
        ) : null}
        {children}
      </div>
      <p className="mt-6 text-xs text-gray-400">TeamChat — Slack-like collaboration · Phase 2 auth</p>
    </div>
  );
}

export function Field({ ...props }) {
  return (
    <input
      {...props}
      className="block w-full my-2 px-3 py-2.5 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#611f69] focus:border-[#611f69]"
    />
  );
}

export function PrimaryButton({ children, ...props }) {
  return (
    <button
      {...props}
      className="w-full mt-2 py-2.5 rounded-lg bg-[#611f69] hover:bg-[#4A154B] text-white font-semibold text-sm transition-colors disabled:opacity-50"
    >
      {children}
    </button>
  );
}

export function AuthLink({ to, children }) {
  // plain anchor styled like Slack links (kept router-free for reuse)
  return (
    <a href={to} className="text-[#1264A3] hover:underline text-sm">
      {children}
    </a>
  );
}
