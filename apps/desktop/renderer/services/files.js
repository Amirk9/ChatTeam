const BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';

function token() {
  return localStorage.getItem('tc_access');
}

// Upload with progress (XHR — fetch has no upload progress).
export function uploadFiles(workspaceId, files, onProgress) {
  const fd = new FormData();
  for (const f of files) fd.append('files', f, f.name);
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${BASE}/workspaces/${workspaceId}/files`);
    xhr.setRequestHeader('Authorization', `Bearer ${token()}`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      const data = JSON.parse(xhr.responseText || '{}');
      if (xhr.status >= 200 && xhr.status < 300) resolve(data.files);
      else reject(Object.assign(new Error(data?.error?.message || 'Upload failed'), { status: xhr.status }));
    };
    xhr.onerror = () => reject(new Error('Upload failed'));
    xhr.send(fd);
  });
}

export async function downloadFile(fileId, filename) {
  const res = await fetch(`${BASE}/files/${fileId}`, { headers: { Authorization: `Bearer ${token()}` } });
  if (!res.ok) throw new Error('Download failed');
  const blob = await res.blob();
  // Electron: native Save As. Browser: anchor download.
  if (window.teamchat?.files?.save) {
    const path = await window.teamchat.files.save(filename);
    if (path) {
      const buf = await blob.arrayBuffer();
      if (buf.byteLength <= 32 * 1024 * 1024) {
        const bytes = new Uint8Array(buf);
        let bin = '';
        for (let i = 0; i < bytes.length; i += 0x8000) {
          bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
        }
        await window.teamchat.files.write(path, btoa(bin));
        return;
      }
    } else {
      return;
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function fileUrl(fileId) {
  return `${BASE}/files/${fileId}`;
}

// Native open dialog when running in Electron, else null (caller uses <input>).
export async function pickFiles() {
  if (window.teamchat?.files?.open) {
    const picked = await window.teamchat.files.open({ multi: true });
    return picked.map((p) => {
      const bin = atob(p.base64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return new File([bytes], p.name, { type: '' });
    });
  }
  return null;
}

export function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
