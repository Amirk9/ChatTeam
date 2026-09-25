import React, { useMemo } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

// Markdown render: marked parses, DOMPurify strips raw HTML (plan: no raw HTML).
marked.setOptions({ breaks: true });

export function Markdown({ text }) {
  const html = useMemo(() => {
    const raw = marked.parse(text || '');
    return DOMPurify.sanitize(raw, { USE_PROFILES: { html: true } });
  }, [text]);
  return <div className="markdown text-[15px] leading-relaxed break-words" dangerouslySetInnerHTML={{ __html: html }} />;
}
