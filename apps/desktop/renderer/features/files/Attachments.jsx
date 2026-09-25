import React, { useEffect, useState } from 'react';
import { downloadFile, fileUrl, formatSize } from '../../services/files.js';

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';

function useAuthedUrl(fileId) {
  const [url, setUrl] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let alive = true;
    let obj = null;
    fetch(`${BASE}/files/${fileId}`, { headers: { Authorization: `Bearer ${localStorage.getItem('tc_access')}` } })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.blob();
      })
      .then((blob) => {
        if (!alive) return;
        obj = URL.createObjectURL(blob);
        setUrl(obj);
      })
      .catch((e) => alive && setError(e.message));
    return () => {
      alive = false;
      if (obj) URL.revokeObjectURL(obj);
    };
  }, [fileId]);
  return { url, error };
}

// Slack-style attachment cards: image / PDF / video / audio / generic file.
export function Attachment({ att }) {
  const [downloading, setDownloading] = useState(false);
  const { url, error } = useAuthedUrl(att.fileId);
  const kind = (att.mimeType || '').split('/')[0];

  async function save() {
    setDownloading(true);
    try {
      await downloadFile(att.fileId, att.filename);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="mt-2 max-w-md border border-gray-200 rounded-lg overflow-hidden">
      {error ? <p className="px-3 py-2 text-xs text-red-600">Preview unavailable ({error})</p> : null}
      {!url && !error ? <p className="px-3 py-6 text-xs text-gray-400 text-center">Loading preview...</p> : null}
      {url && kind === 'image' ? (
        <a href={url} target="_blank" rel="noreferrer">
          <img src={url} alt={att.filename} className="max-h-64 w-auto object-contain bg-gray-50" loading="lazy" />
        </a>
      ) : null}
      {url && att.mimeType === 'application/pdf' ? (
        <iframe src={url} title={att.filename} className="w-full h-64 bg-gray-50" />
      ) : null}
      {url && kind === 'video' ? <video src={url} controls className="max-h-64 w-full bg-black" /> : null}
      {url && kind === 'audio' ? <audio src={url} controls className="w-full mt-1" /> : null}
      <div className="flex items-center gap-2 px-3 py-2 bg-gray-50">
        <span className="text-lg">📄</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate">{att.filename}</p>
          <p className="text-xs text-gray-500">{formatSize(att.size)} · {att.mimeType}</p>
        </div>
        <button onClick={save} disabled={downloading} className="text-xs px-2 py-1 rounded border border-gray-300 bg-white hover:bg-gray-100">
          {downloading ? '...' : '⬇ Download'}
        </button>
      </div>
    </div>
  );
}

export function AttachmentList({ attachments }) {
  if (!attachments?.length) return null;
  return (
    <div className="space-y-2">
      {attachments.map((a) => <Attachment key={a.fileId} att={a} />)}
    </div>
  );
}

export { fileUrl };
