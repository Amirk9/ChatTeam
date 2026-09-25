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
  return <div className="markdown text-[15px] leading-relaxed break-words text-[#1d1c1d] dark:text-white/90 [&_a]:text-[#1264A3] [&_a]:dark:text-sky-300 [&_a]:hover:underline [&_code]:bg-gray-100 [&_code]:dark:bg-white/10 [&_code]:rounded [&_code]:px-1 [&_pre]:bg-gray-100 [&_pre]:dark:bg-black/40 [&_pre]:rounded-lg [&_pre]:p-2 [&_pre]:overflow-x-auto [&_blockquote]:border-l-4 [&_blockquote]:pl-2 [&_blockquote]:text-gray-600 [&_blockquote]:dark:text-white/60" dangerouslySetInnerHTML={{ __html: html }} />;
}
