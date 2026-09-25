import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../../stores/auth.store.jsx';
import { useWorkspace } from '../../stores/workspace.store.jsx';
import { useTheme } from '../../stores/theme.store.jsx';

// Far-left icon rail (real Slack column 1): workspace avatars, Home,
// Agents & tools, More, add-workspace, theme toggle, own avatar.
function RailButton({ to, title, active, children, label }) {
  return (
    <NavLink
      to={to}
      title={title}
      className={() => `flex flex-col items-center gap-0.5 w-full py-1.5 rounded-lg ${active ? 'bg-white/15 text-white' : 'text-white/60 hover:bg-white/10 hover:text-white'}`}
    >
      <span className="text-xl leading-none">{children}</span>
      {label ? <span className="text-[10px] leading-tight">{label}</span> : null}
    </NavLink>
  );
}

export default function Rail({ onAddWorkspace }) {
  const { user } = useAuth();
  const { workspaces, current, switchTo } = useWorkspace();
  const { dark, toggle } = useTheme();

  return (
    <div className="w-[68px] shrink-0 bg-[#2B0A2E] text-white flex flex-col items-center py-2 gap-1 min-h-0">
      <div className="flex flex-col items-center gap-1 w-full px-1.5 max-h-40 overflow-y-auto">
        {workspaces.map((w) => (
          <button
            key={w.id}
            title={w.name}
            onClick={() => switchTo(w.id)}
            className={`w-10 h-10 rounded-xl font-bold text-lg flex items-center justify-center shrink-0 border-2 ${
              w.id === current?.id ? 'bg-white/20 border-white/60' : 'bg-white/10 border-transparent hover:border-white/30'
            }`}
          >
            {(w.name || '?').slice(0, 1).toUpperCase()}
          </button>
        ))}
      </div>
      <div className="w-8 border-t border-white/15 my-1" />
      <div className="flex-1 flex flex-col items-center gap-1 w-full px-1.5 overflow-y-auto">
        <RailButton to="/" title="Home" label="Home">🏠</RailButton>
        <RailButton to="/apps" title="Agents & tools" label="Agents">✨</RailButton>
        <RailButton to="/workflows" title="More" label="More">⋯</RailButton>
      </div>
      <div className="flex flex-col items-center gap-1 w-full px-1.5">
        <button onClick={onAddWorkspace} title="Add workspace"
          className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-xl flex items-center justify-center">+</button>
        <button onClick={toggle} title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
          className="w-10 h-10 rounded-full hover:bg-white/10 text-lg flex items-center justify-center">
          {dark ? '☾' : '☀'}
        </button>
        <div title={user.displayName}
          className="w-10 h-10 rounded-xl bg-[#4A154B] border border-white/20 flex items-center justify-center font-bold">
          {(user.displayName || '?').slice(0, 1).toUpperCase()}
        </div>
      </div>
    </div>
  );
}
