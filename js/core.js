// 공통: 화면 상태, 데이터 헬퍼, 편집 칸(Field), 글 렌더링, 시트 메뉴.
import { h } from 'preact';
import { useState, useEffect, useLayoutEffect, useRef } from 'preact/hooks';
import htm from 'htm';
import { patch as rawPatch } from './firebase.js';

export const html = htm.bind(h);

/* ---------- 화면 상태 (시트·토스트) ---------- */
const ui = { sheet: null, toast: null };
const subs = new Set();
export function setUI(p) { Object.assign(ui, p); subs.forEach(f => f()); }
export function useUI() {
  const [, force] = useState(0);
  useEffect(() => { const s = () => force(x => x + 1); subs.add(s); return () => subs.delete(s); }, []);
  return ui;
}
export const openSheet = s => setUI({ sheet: s });
export const closeSheet = () => setUI({ sheet: null });
let toastTimer;
export function toast(msg) {
  setUI({ toast: msg });
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => setUI({ toast: null }), 3500);
}

export function patch(updates) {
  return rawPatch(updates).catch(e => { console.error(e); toast('저장 실패: ' + (e.code || e.message)); });
}

/* ---------- 드래그 중에는 화면 갱신 보류 ---------- */
let dragging = false;
let pendingData = null;
let applyData = null;
let latest = {};
export const getData = () => latest;
export function registerData(fn) { applyData = d => { latest = d; fn(d); }; }
export function pushData(d) { if (dragging) pendingData = d; else applyData?.(d); }
export function setDragging(v) {
  dragging = v;
  if (!v && pendingData) { const d = pendingData; pendingData = null; applyData?.(d); }
}

/* ---------- 데이터 헬퍼 ---------- */
export function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}
// 객체 → 보관 안 된 항목 배열 (order 순)
export function list(obj, filter) {
  return Object.entries(obj || {})
    .filter(([, v]) => v && typeof v === 'object' && !v.archived)
    .map(([id, v]) => ({ ...v, id }))
    .filter(x => !filter || filter(x))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}
export function nextOrder(arr) {
  return arr.length ? Math.max(...arr.map(x => x.order ?? 0)) + 1 : 0;
}
// arr(화면 순서)에서 from → to 로 옮길 때 옮긴 항목의 새 order
export function moveOrder(arr, from, to) {
  const a = arr.slice();
  const [m] = a.splice(from, 1);
  a.splice(to, 0, m);
  const prev = a[to - 1], next = a[to + 1];
  let o;
  if (!prev && !next) o = 0;
  else if (!prev) o = (next.order ?? 0) - 1;
  else if (!next) o = (prev.order ?? 0) + 1;
  else o = ((prev.order ?? 0) + (next.order ?? 0)) / 2;
  return { id: m.id, order: o };
}
export function archiveUpdates(path) {
  return { [`${path}/archived`]: true, [`${path}/archivedAt`]: Date.now() };
}

/* ---------- 기기별 저장 (탭 선택·접힘 등) ---------- */
export function useLocal(key, init) {
  const [v, setV] = useState(() => {
    try { const s = localStorage.getItem('sp:' + key); return s == null ? init : JSON.parse(s); } catch { return init; }
  });
  const set = nv => { setV(nv); try { localStorage.setItem('sp:' + key, JSON.stringify(nv)); } catch {} };
  return [v, set];
}

/* ---------- 글 렌더링 (굵게·링크·목록·소제목) ---------- */
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function shortUrl(u) {
  try { return new URL(u.replace(/&amp;/g, '&')).hostname.replace(/^www\./, ''); } catch { return u; }
}
function inline(s, keys) {
  let t = esc(s);
  t = t.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_, a, u) => `<a href="${u}" target="_blank" rel="noopener">${a}</a>`);
  t = t.replace(/(^|[\s(])(https?:\/\/[^\s<]+)/g, (_, p, u) => `${p}<a href="${u}" target="_blank" rel="noopener">${shortUrl(u)}</a>`);
  t = t.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
  if (keys) t = t.replace(/^([^:<>]{1,16}):\s/, '<span class="k">$1</span> ');
  return t;
}
export function renderText(src, keys = false) {
  let out = '', inList = false;
  for (const raw of String(src).split('\n')) {
    const li = raw.match(/^\s*[-*]\s+(.*)$/);
    if (li) {
      if (!inList) { out += '<ul>'; inList = true; }
      out += `<li>${inline(li[1], keys)}</li>`;
      continue;
    }
    if (inList) { out += '</ul>'; inList = false; }
    const hd = raw.match(/^#{1,3}\s+(.*)$/);
    if (hd) out += `<div class="h">${inline(hd[1])}</div>`;
    else if (!raw.trim()) out += '<div class="gap"></div>';
    else out += `<div>${inline(raw, keys)}</div>`;
  }
  if (inList) out += '</ul>';
  return out;
}

/* ---------- 편집 칸 ---------- */
// 새로 만든 항목은 이 경로의 칸이 열리자마자 편집 상태로 시작한다.
let pendingFocus = null;
export function proxyFocus() {
  // iOS는 탭 이벤트 안에서 포커스해야 키보드가 뜬다 → 숨은 입력칸에 먼저 포커스해 두고 실제 칸으로 옮긴다.
  document.getElementById('kbd-proxy')?.focus({ preventScroll: true });
}
export function requestFocus(path) { pendingFocus = path; proxyFocus(); }

function autoGrow(el) {
  if (!el || el.tagName !== 'TEXTAREA') return;
  el.style.height = 'auto';
  el.style.height = el.scrollHeight + 'px';
}

export function Field({ path, value, placeholder = '', multiline = false, cls = '', keys = false, numeric = false, display }) {
  const [editing, setEditing] = useState(() => {
    if (pendingFocus === path) { pendingFocus = null; return true; }
    return false;
  });
  const [local, setLocal] = useState(() => (value ?? '') + '');
  const timer = useRef();
  const el = useRef();
  const lastSaved = useRef(value);

  useLayoutEffect(() => {
    if (editing && el.current) {
      el.current.focus({ preventScroll: false });
      const n = el.current.value.length;
      try { el.current.setSelectionRange(n, n); } catch {}
      autoGrow(el.current);
    }
  }, [editing]);
  useEffect(() => () => clearTimeout(timer.current), []);

  const toValue = v => {
    if (!numeric) return v;
    const s = String(v).replace(/[,\s₩¥]/g, '');
    if (s === '') return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  };
  const save = v => {
    clearTimeout(timer.current);
    const out = toValue(v);
    const cur = lastSaved.current ?? (numeric ? null : '');
    if (out === cur || (out === '' && cur == null)) return;
    lastSaved.current = out;
    patch({ [path]: out === '' ? null : out });
  };
  const begin = e => {
    if (e.target.closest('a')) return;
    proxyFocus();
    lastSaved.current = value;
    setLocal((value ?? '') + '');
    setEditing(true);
  };

  if (editing) {
    const common = {
      ref: el,
      class: `field-input ${cls}`,
      value: local,
      placeholder,
      inputmode: numeric ? 'decimal' : undefined,
      onInput: e => {
        const v = e.currentTarget.value;
        setLocal(v);
        autoGrow(e.currentTarget);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => save(v), 600);
      },
      onBlur: () => { save(local); setEditing(false); },
      onKeyDown: e => {
        if (e.key === 'Escape' || (e.key === 'Enter' && !multiline && !e.isComposing)) {
          e.preventDefault();
          e.currentTarget.blur();
        }
      },
    };
    return multiline ? html`<textarea rows="1" ...${common} />` : html`<input type="text" ...${common} />`;
  }

  const empty = value == null || value === '';
  const shown = display ? display(value) : value;
  return html`<div
    class=${`field ${cls} ${empty ? 'empty' : ''}`}
    onClick=${begin}
    dangerouslySetInnerHTML=${{ __html: empty ? `<span class="ph">${esc(placeholder)}</span>` : (display ? esc(shown) : renderText(shown, keys)) }}
  />`;
}

/* ---------- 시트 (아래에서 올라오는 메뉴) ---------- */
export function Sheet() {
  const { sheet } = useUI();
  if (!sheet) return null;
  return html`<div class="sheet-bg" onClick=${closeSheet}>
    <div class="sheet" onClick=${e => e.stopPropagation()}>
      ${sheet.title && html`<div class="sheet-title">${sheet.title}</div>`}
      ${typeof sheet.content === 'function' ? sheet.content() : sheet.content}
      ${(sheet.actions || []).filter(Boolean).map(a => html`
        <button class=${`sheet-act ${a.danger ? 'danger' : ''} ${a.active ? 'active' : ''}`}
          onClick=${() => { if (!a.keepOpen) closeSheet(); a.onClick?.(); }}>
          ${a.icon && html`<span class="ico">${a.icon}</span>`}${a.label}
        </button>`)}
      <button class="sheet-act cancel" onClick=${closeSheet}>닫기</button>
    </div>
  </div>`;
}

export function Toast() {
  const { toast: t } = useUI();
  return t ? html`<div class="toast">${t}</div>` : null;
}

/* ---------- 숫자 ---------- */
export const fmt = n => Number(n).toLocaleString('ko-KR');
export const CUR = { KRW: '₩', JPY: '¥' };
