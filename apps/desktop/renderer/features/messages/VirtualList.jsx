import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';

// Lightweight variable-height virtual list (Phase 10 perf): measures rows
// with ResizeObserver, renders viewport + overscan only. Under THRESHOLD it
// renders plainly so small feeds behave exactly like before.
const THRESHOLD = 60;
const OVERSCAN = 8;
const ESTIMATE = 72;

const VirtualList = forwardRef(function VirtualList({ items, renderRow, onNearTop, nearTop, bottomAnchor }, ref) {
  const outerRef = useRef(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewport, setViewport] = useState(600);
  const [heights, setHeights] = useState(() => new Map());
  const stickBottom = useRef(true);

  const plain = items.length < THRESHOLD;

  const offsets = useMemo(() => {
    const out = new Array(items.length + 1);
    out[0] = 0;
    for (let i = 0; i < items.length; i++) {
      out[i + 1] = out[i] + (heights.get(items[i].key) || ESTIMATE);
    }
    return out;
  }, [items, heights]);
  const total = offsets[items.length] || 0;

  const onScroll = useCallback(() => {
    const el = outerRef.current;
    if (!el) return;
    setScrollTop(el.scrollTop);
    stickBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    if (el.scrollTop < 400) onNearTop?.();
  }, [onNearTop]);

  useEffect(() => {
    const el = outerRef.current;
    if (!el) return;
    setViewport(el.clientHeight || 600);
    const ro = new ResizeObserver(() => setViewport(el.clientHeight || 600));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Keep pinned to bottom for live chat when the user was already there.
  useEffect(() => {
    if (plain || !stickBottom.current) return;
    const el = outerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [items.length, plain]);

  useImperativeHandle(ref, () => ({
    scrollToIndex(idx) {
      const el = outerRef.current;
      if (!el) return;
      if (plain) {
        document.getElementById(items[idx]?.domId)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
        return;
      }
      stickBottom.current = false;
      el.scrollTop = Math.max(0, (offsets[idx] || 0) - viewport / 2);
    },
    scrollToBottom() {
      const el = outerRef.current;
      if (el) {
        stickBottom.current = true;
        el.scrollTop = el.scrollHeight;
      }
    },
  }), [items, offsets, viewport, plain]);

  const ros = useRef(new Map());
  useEffect(() => () => {
    ros.current.forEach((ro) => ro.disconnect());
    ros.current.clear();
  }, []);

  const measure = useCallback((node) => {
    if (!node) return;
    const key = node.dataset.vkey;
    if (!key) return;
    const apply = (h) => {
      if (!h) return;
      setHeights((prev) => {
        if (prev.get(key) === h) return prev;
        const next = new Map(prev);
        next.set(key, h);
        return next;
      });
    };
    apply(node.getBoundingClientRect().height);
    ros.current.get(key)?.disconnect();
    const ro = new ResizeObserver((entries) => apply(entries[0]?.contentRect.height));
    ro.observe(node);
    ros.current.set(key, ro);
  }, []);

  if (plain) {
    return (
      <div ref={outerRef} onScroll={onScroll} className="flex-1 overflow-y-auto py-2">
        {nearTop}
        {items.map((item, i) => (
          <div key={item.key} id={item.domId}>{renderRow(item, i)}</div>
        ))}
        {bottomAnchor}
      </div>
    );
  }

  let start = 0;
  let end = items.length;
  // Binary search first offset > scrollTop - overscan.
  {
    const lo = Math.max(0, scrollTop - OVERSCAN * ESTIMATE);
    let a = 0, b = items.length;
    while (a < b) {
      const m = (a + b) >> 1;
      if (offsets[m + 1] < lo) a = m + 1;
      else b = m;
    }
    start = Math.max(0, a - OVERSCAN);
    const hi = scrollTop + viewport + OVERSCAN * ESTIMATE;
    let c = start, d = items.length;
    while (c < d) {
      const m = (c + d) >> 1;
      if (offsets[m] < hi) c = m + 1;
      else d = m;
    }
    end = Math.min(items.length, c + OVERSCAN);
  }

  const rows = [];
  for (let i = start; i < end; i++) {
    const item = items[i];
    rows.push(
      <div key={item.key} id={item.domId} data-vkey={item.key} ref={measure} style={{ position: 'absolute', top: offsets[i], left: 0, right: 0 }}>
        {renderRow(item, i)}
      </div>
    );
  }

  return (
    <div ref={outerRef} onScroll={onScroll} className="flex-1 overflow-y-auto py-2">
      {nearTop}
      <div style={{ position: 'relative', height: total }}>{rows}</div>
      {bottomAnchor}
    </div>
  );
});

export default VirtualList;
