import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useWorkspace } from '../../stores/workspace.store.jsx';
import { canvasApi } from '../../services/canvas.js';
import { onRealtime, emitRealtime } from '../../services/socket.js';

const KINDS = ['paragraph', 'heading', 'checklist', 'code', 'image', 'table'];

function newBlock(kind = 'paragraph') {
  return { kind, content: '', data: {}, position: Date.now() + Math.random(), version: 1 };
}

export function CanvasList() {
  const { current: workspace } = useWorkspace();
  const [docs, setDocs] = useState([]);
  const nav = useNavigate();

  useEffect(() => {
    if (workspace?.id) canvasApi.list(workspace.id).then(setDocs).catch(() => setDocs([]));
  }, [workspace?.id]);

  async function create() {
    if (!workspace) return;
    const cv = await canvasApi.create(workspace.id, { title: 'Untitled canvas' });
    nav(`/canvas/${cv.id}`);
  }

  return (
    <div className="p-6 max-w-3xl w-full mx-auto overflow-y-auto">
      <div className="flex items-center mb-4">
        <h2 className="text-xl font-bold flex-1">Canvas</h2>
        <button onClick={create} className="text-sm px-4 py-1.5 rounded bg-[#611f69] text-white">+ New canvas</button>
      </div>
      {docs.length === 0 ? <p className="text-sm text-gray-500">No canvases yet — Slack-style docs with checklists, tables, images and comments.</p> : null}
      <ul className="space-y-2">
        {docs.map((d) => (
          <li key={d.id}>
            <Link to={`/canvas/${d.id}`} className="block border border-gray-200 rounded-lg p-3 hover:border-[#611f69]">
              <p className="font-semibold text-sm">📄 {d.title}</p>
              <p className="text-xs text-gray-400">Updated {new Date(d.updatedAt).toLocaleString()}</p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function CanvasPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const [canvas, setCanvas] = useState(null);
  const [blocks, setBlocks] = useState([]);
  const [comments, setComments] = useState([]);
  const [title, setTitle] = useState('');
  const [comment, setComment] = useState('');
  const [error, setError] = useState('');
  const saveTimer = useRef(null);

  async function load() {
    try {
      const data = await canvasApi.get(id);
      setCanvas(data.canvas);
      setTitle(data.canvas.title);
      setBlocks(data.blocks);
      setComments(data.comments || []);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => { load(); }, [id]);
  useEffect(() => {
    emitRealtime('canvas.join', { canvasId: id });
    const offs = [
      onRealtime('canvas.blocks', ({ canvasId, blocks: remote, by }) => {
        if (canvasId === id) setBlocks(remote);
      }),
      onRealtime('canvas.comment', ({ canvasId, comment: c }) => {
        if (canvasId === id) setComments((prev) => [...prev, c]);
      }),
      onRealtime('canvas.updated', ({ canvas: cv }) => {
        if (cv?.id === id) {
          setCanvas(cv);
          setTitle(cv.title);
        }
      }),
    ];
    return () => {
      emitRealtime('canvas.leave', { canvasId: id });
      offs.forEach((off) => off());
    };
  }, [id]);

  function editBlock(i, patch) {
    setBlocks((prev) => prev.map((b, j) => (j === i ? { ...b, ...patch } : b)));
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(persist, 800);
  }

  async function persist() {
    try {
      const res = await canvasApi.saveBlocks(id, blocks.map((b, i) => ({ ...b, position: i })));
      setBlocks(res.blocks);
    } catch (err) {
      setError(err.message);
    }
  }

  function addBlock(kind) {
    setBlocks((prev) => [...prev, newBlock(kind)]);
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(persist, 300);
  }

  function removeBlock(i) {
    const target = blocks[i];
    if (!target.id) {
      setBlocks((prev) => prev.filter((_, j) => j !== i));
      return;
    }
    setBlocks((prev) => prev.map((b, j) => (j === i ? { ...b, delete: true } : b)));
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      const res = await canvasApi.saveBlocks(id, [{ id: target.id, delete: true }]);
      setBlocks(res.blocks);
    }, 300);
  }

  async function saveTitle(e) {
    e.preventDefault();
    const cv = await canvasApi.rename(id, title.trim() || 'Untitled canvas');
    setCanvas(cv);
  }

  async function postComment(e) {
    e.preventDefault();
    if (!comment.trim()) return;
    const c = await canvasApi.comment(id, { content: comment.trim() });
    setComments((prev) => [...prev, c]);
    setComment('');
  }

  async function destroy() {
    if (!window.confirm('Delete this canvas?')) return;
    await canvasApi.remove(id);
    nav('/canvases');
  }

  if (error && !canvas) return <p className="p-6 text-sm text-red-600">{error}</p>;
  if (!canvas) return <p className="p-6 text-sm text-gray-500">Loading canvas…</p>;

  return (
    <div className="flex-1 flex min-h-0">
      <div className="flex-1 overflow-y-auto p-6 max-w-3xl w-full mx-auto">
        <form onSubmit={saveTitle} className="flex gap-2 mb-4">
          <input value={title} onChange={(e) => setTitle(e.target.value)} className="flex-1 text-2xl font-bold outline-none border-b border-transparent focus:border-gray-300" />
          <button className="text-xs px-2 py-1 rounded border border-gray-300">Rename</button>
          <button type="button" onClick={destroy} className="text-xs px-2 py-1 rounded border border-red-300 text-red-600">Delete</button>
        </form>
        {error ? <p className="text-xs text-red-600 mb-2">{error}</p> : null}
        <div className="space-y-2">
          {blocks.map((b, i) => (
            <BlockEditor key={b.id || `new-${i}`} block={b} onChange={(patch) => editBlock(i, patch)} onRemove={() => removeBlock(i)} />
          ))}
        </div>
        <div className="flex flex-wrap gap-1 mt-3">
          {KINDS.map((k) => (
            <button key={k} onClick={() => addBlock(k)} className="text-xs px-2 py-1 rounded border border-gray-300 hover:bg-gray-50 capitalize">+ {k}</button>
          ))}
        </div>
        <p className="text-[11px] text-gray-400 mt-3">Co-edited live — concurrent edits converge (last-write-wins per block).</p>
      </div>
      <aside className="w-72 shrink-0 border-l border-gray-200 p-4 overflow-y-auto hidden md:block">
        <h4 className="font-bold text-sm mb-2">Comments ({comments.length})</h4>
        <ul className="space-y-2 mb-3">
          {comments.map((c) => (
            <li key={c.id} className="text-sm border border-gray-200 rounded-md p-2">
              <p className="text-xs text-gray-500 mb-1">{c.author || 'Someone'} · {new Date(c.created_at).toLocaleString()}</p>
              <p>{c.content}</p>
            </li>
          ))}
        </ul>
        <form onSubmit={postComment} className="flex gap-1">
          <input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Comment…" className="flex-1 border border-gray-300 rounded-md px-2 py-1 text-sm" />
          <button className="text-xs px-2 py-1 rounded bg-[#611f69] text-white">Post</button>
        </form>
      </aside>
    </div>
  );
}

function BlockEditor({ block, onChange, onRemove }) {
  if (block.delete) return null;
  const common = 'w-full outline-none border border-transparent focus:border-gray-300 rounded px-2 py-1';
  return (
    <div className="group flex gap-1 items-start">
      <div className="flex-1">
        {block.kind === 'heading' ? (
          <input value={block.content} onChange={(e) => onChange({ content: e.target.value })} placeholder="Heading" className={`${common} text-xl font-bold`} />
        ) : block.kind === 'checklist' ? (
          <label className="flex gap-2 items-start px-2 py-1">
            <input type="checkbox" checked={Boolean(block.data?.checked)} onChange={(e) => onChange({ data: { ...block.data, checked: e.target.checked } })} className="mt-1" />
            <input value={block.content} onChange={(e) => onChange({ content: e.target.value })} placeholder="Checklist item" className={`flex-1 outline-none ${block.data?.checked ? 'line-through text-gray-400' : ''}`} />
          </label>
        ) : block.kind === 'code' ? (
          <textarea value={block.content} onChange={(e) => onChange({ content: e.target.value })} placeholder="code…" rows={3} className={`${common} font-mono text-sm bg-gray-900 text-gray-100`} />
        ) : block.kind === 'image' ? (
          <input value={block.content} onChange={(e) => onChange({ content: e.target.value })} placeholder="Image URL…" className={common} />
        ) : block.kind === 'table' ? (
          <textarea value={block.content} onChange={(e) => onChange({ content: e.target.value })} placeholder="One row per line, cells separated by |" rows={3} className={`${common} font-mono text-sm`} />
        ) : (
          <textarea value={block.content} onChange={(e) => onChange({ content: e.target.value })} placeholder="Type something…" rows={2} className={common} />
        )}
        {block.kind === 'image' && block.content ? <img src={block.content} alt="" className="max-h-48 rounded mt-1" /> : null}
        {block.kind === 'table' && block.content ? (
          <table className="text-sm border-collapse mt-1">
            <tbody>
              {block.content.split('\n').map((row, ri) => (
                <tr key={ri}>{row.split('|').map((cell, ci) => <td key={ci} className="border border-gray-300 px-2 py-0.5">{cell.trim()}</td>)}</tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </div>
      <button onClick={onRemove} className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-600 text-sm px-1" title="Delete block">×</button>
    </div>
  );
}
