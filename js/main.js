import { render } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import { start } from './firebase.js';
import {
  html, Field, Sheet, Toast, patch, list, newId, nextOrder, moveOrder, archiveUpdates,
  useLocal, openSheet, requestFocus, registerData, pushData, toast, getData,
} from './core.js';
import { TYPES } from './blocks.js';

const ARCHIVE = '__archive';

/* ---------- D-Day ---------- */
function dday(meta) {
  if (!meta?.start) return '';
  const day = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const s = day(meta.start), e = meta.end ? day(meta.end) : s;
  const diff = Math.round((s - now) / 86400000);
  if (diff > 0) return `D-${diff}`;
  if (now <= e) return `${Math.round((now - s) / 86400000) + 1}일차`;
  return '다녀옴';
}

function Header({ meta, conn, data }) {
  return html`<header class="top">
    <div class="top-txt">
      <div class="top-title">${meta?.title || '여행'}</div>
      ${meta?.subtitle && html`<div class="top-sub">${meta.subtitle}</div>`}
    </div>
    <div class="dday">${dday(meta)}</div>
    <button class="top-more" onClick=${() => settings(data, conn)} aria-label="설정">
      <span class=${`conn ${conn ? 'on' : ''}`}></span>⋯
    </button>
  </header>`;
}

function settings(data, conn) {
  openSheet({
    title: '여행 정보',
    content: () => { const m = getData().meta || {}; return html`<div class="sheet-form">
      <label>제목</label><${Field} path="meta/title" value=${m.title} placeholder="제목" />
      <label>부제</label><${Field} path="meta/subtitle" value=${m.subtitle} placeholder="예: 2027.1.27(수) ~ 1.31(일)" />
      <label>출발일 (D-Day 기준)</label><${Field} path="meta/start" value=${m.start} placeholder="YYYY-MM-DD" />
      <label>마지막 날</label><${Field} path="meta/end" value=${m.end} placeholder="YYYY-MM-DD" />
      <div class="conn-line"><span class=${`conn ${conn ? 'on' : ''}`}></span>${conn ? '실시간 연결됨' : '연결 끊김 (다시 연결되면 자동 저장)'}</div>
    </div>`; },
    actions: [
      { icon: '💾', label: '백업 받기 (JSON 파일)', onClick: () => backup(getData()) },
    ],
  });
}

function backup(data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  const d = new Date();
  a.href = URL.createObjectURL(blob);
  a.download = `sapporo-backup-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/* ---------- 페이지 탭 ---------- */
function Tabs({ pages, cur, setCur }) {
  const addPage = () => {
    const id = newId();
    patch({ [`pages/${id}`]: { title: '', icon: '📄', order: nextOrder(pages) } });
    setCur(id);
    requestFocus(`pages/${id}/title`);
  };
  return html`<nav class="tabs">
    ${pages.map(p => html`<button key=${p.id} class=${`tab ${cur === p.id ? 'on' : ''}`} onClick=${() => setCur(p.id)}>
      <span class="tab-ico">${p.icon || '📄'}</span>${p.title || '새 페이지'}
    </button>`)}
    <button class=${`tab ${cur === ARCHIVE ? 'on' : ''}`} onClick=${() => setCur(ARCHIVE)}><span class="tab-ico">🗃️</span>보관함</button>
    <button class="tab add-tab" onClick=${addPage} aria-label="페이지 추가">+</button>
  </nav>`;
}

/* ---------- 페이지 ---------- */
function pageMenu(page, pages) {
  const i = pages.findIndex(p => p.id === page.id);
  const mv = to => { const { id, order } = moveOrder(pages, i, to); patch({ [`pages/${id}/order`]: order }); };
  openSheet({
    title: page.title || '페이지',
    actions: [
      { icon: '🗂', label: page.tabs ? '블록 탭 보기 끄기' : '블록을 탭으로 보기', onClick: () => patch({ [`pages/${page.id}/tabs`]: !page.tabs || null }) },
      i > 0 && { icon: '←', label: '왼쪽으로', onClick: () => mv(i - 1) },
      i < pages.length - 1 && { icon: '→', label: '오른쪽으로', onClick: () => mv(i + 1) },
      { icon: '🗃️', label: '페이지 보관함으로', danger: true, onClick: () => patch(archiveUpdates(`pages/${page.id}`)) },
    ],
  });
}

function addBlock(page, blocks) {
  openSheet({
    title: '블록 추가',
    actions: Object.entries(TYPES).map(([type, T]) => ({
      icon: T.icon, label: T.label, onClick: () => {
        const id = newId();
        patch({ [`blocks/${id}`]: { page: page.id, type, title: '', order: nextOrder(blocks), ...T.init() } });
        requestFocus(`blocks/${id}/title`);
      },
    })),
  });
}

function blockMenu(b, blocks, pages) {
  const i = blocks.findIndex(x => x.id === b.id);
  const T = TYPES[b.type] || TYPES.memo;
  const mv = to => { const { id, order } = moveOrder(blocks, i, to); patch({ [`blocks/${id}/order`]: order }); };
  openSheet({
    title: b.title || T.label,
    actions: [
      ...(T.extra ? T.extra(b) : []),
      i > 0 && { icon: '↑', label: '위로', onClick: () => mv(i - 1) },
      i < blocks.length - 1 && { icon: '↓', label: '아래로', onClick: () => mv(i + 1) },
      { icon: '⧉', label: '복제', onClick: () => duplicateBlock(b, blocks, i) },
      pages.length > 1 && { icon: '↪', label: '다른 페이지로 옮기기', onClick: () => setTimeout(() => moveToPage(b, pages), 0) },
      { icon: '🗃️', label: '보관함으로', danger: true, onClick: () => patch(archiveUpdates(`blocks/${b.id}`)) },
    ],
  });
}

function duplicateBlock(b, blocks, i) {
  const { id: _id, items, ...rest } = b;
  const next = blocks[i + 1];
  const copyItems = {};
  for (const [, v] of Object.entries(items || {})) copyItems[newId() + Math.random().toString(36).slice(2, 4)] = v;
  patch({
    [`blocks/${newId()}`]: {
      ...rest,
      title: (b.title || '') + ' (복사)',
      order: next ? ((b.order ?? 0) + (next.order ?? 0)) / 2 : (b.order ?? 0) + 1,
      ...(items ? { items: copyItems } : {}),
    },
  });
}

function moveToPage(b, pages) {
  openSheet({
    title: '어느 페이지로?',
    actions: pages.filter(p => p.id !== b.page).map(p => ({
      icon: p.icon, label: p.title || '새 페이지', onClick: () => {
        patch({ [`blocks/${b.id}/page`]: p.id, [`blocks/${b.id}/order`]: Date.now() });
        toast(`「${p.title}」로 옮겼어요`);
      },
    })),
  });
}

function Block({ b, blocks, pages }) {
  const T = TYPES[b.type] || TYPES.memo;
  const [collapsed, setCollapsed] = useLocal('c:' + b.id, false);
  const badge = T.badge?.(b);
  return html`<section class=${`block block-${b.type}`}>
    <div class="block-head">
      <button class="chev" onClick=${() => setCollapsed(!collapsed)} aria-label="접기">${collapsed ? '▸' : '▾'}</button>
      <${Field} path=${`blocks/${b.id}/title`} value=${b.title} placeholder=${T.label} cls="block-title grow" />
      ${badge && html`<span class="count">${badge}</span>`}
      <button class="more" onClick=${() => blockMenu(b, blocks, pages)} aria-label="블록 메뉴">⋯</button>
    </div>
    ${!collapsed && html`<div class="block-body"><${T.View} b=${b} /></div>`}
  </section>`;
}

function PageView({ data, page, pages }) {
  const blocks = list(data.blocks, b => b.page === page.id);
  const [sel, setSel] = useLocal('t:' + page.id, null);
  const shown = page.tabs ? [blocks.find(b => b.id === sel) || blocks[0]].filter(Boolean) : blocks;
  return html`<main class="page">
    <div class="page-head">
      <${Field} path=${`pages/${page.id}/icon`} value=${page.icon} placeholder="📄" cls="page-icon" />
      <${Field} path=${`pages/${page.id}/title`} value=${page.title} placeholder="페이지 제목" cls="page-title grow" />
      <button class="more" onClick=${() => pageMenu(page, pages)} aria-label="페이지 메뉴">⋯</button>
    </div>
    ${page.tabs && blocks.length > 0 && html`<div class="chips">
      ${blocks.map(b => html`<button key=${b.id} class=${`chip-btn ${shown[0]?.id === b.id ? 'on' : ''}`} onClick=${() => setSel(b.id)}>
        ${b.title || TYPES[b.type]?.label}
      </button>`)}
    </div>`}
    ${shown.map(b => html`<${Block} key=${b.id} b=${b} blocks=${blocks} pages=${pages} />`)}
    <button class="add add-block" onClick=${() => addBlock(page, blocks)}>+ 블록 추가</button>
  </main>`;
}

/* ---------- 보관함 ---------- */
function ArchiveView({ data }) {
  const rows = [];
  const pageTitle = id => data.pages?.[id]?.title || '페이지';
  for (const [id, p] of Object.entries(data.pages || {})) {
    if (p?.archived) rows.push({ path: `pages/${id}`, at: p.archivedAt, kind: '페이지', text: `${p.icon || ''} ${p.title || '새 페이지'}`, where: '' });
  }
  for (const [id, b] of Object.entries(data.blocks || {})) {
    if (!b) continue;
    const T = TYPES[b.type] || TYPES.memo;
    if (b.archived) rows.push({ path: `blocks/${id}`, at: b.archivedAt, kind: T.label, text: b.title || b.text?.slice(0, 40) || '(제목 없음)', where: pageTitle(b.page) });
    else {
      for (const [iid, it] of Object.entries(b.items || {})) {
        if (it?.archived) {
          const text = it.text || it.title || it.label || (it.cells && Object.values(it.cells).join(' · ')) || it.time || '(빈 항목)';
          rows.push({ path: `blocks/${id}/items/${iid}`, at: it.archivedAt, kind: '항목', text, where: `${pageTitle(b.page)} › ${b.title || T.label}` });
        }
      }
    }
  }
  rows.sort((a, b) => (b.at || 0) - (a.at || 0));
  const restore = r => patch({ [`${r.path}/archived`]: null, [`${r.path}/archivedAt`]: null });
  const purge = r => { if (confirm(`「${r.text}」을(를) 완전히 지울까요? 되돌릴 수 없어요.`)) patch({ [r.path]: null }); };
  return html`<main class="page">
    <div class="page-head"><div class="page-icon field">🗃️</div><div class="page-title field grow">보관함</div></div>
    ${rows.length === 0 && html`<div class="empty-note">보관한 것이 없어요</div>`}
    ${rows.map(r => html`<div class="arch" key=${r.path}>
      <div class="arch-main">
        <div class="arch-text">${r.text}</div>
        <div class="arch-where">${r.kind}${r.where ? ` · ${r.where}` : ''}${r.at ? ` · ${new Date(r.at).toLocaleDateString('ko-KR')}` : ''}</div>
      </div>
      <button class="mini" onClick=${() => restore(r)}>복구</button>
      <button class="mini danger" onClick=${() => purge(r)}>삭제</button>
    </div>`)}
  </main>`;
}

/* ---------- 앱 ---------- */
function App() {
  const [data, setData] = useState(null);
  const [conn, setConn] = useState(false);
  const [err, setErr] = useState(null);
  const [cur, setCur] = useLocal('page', null);

  useEffect(() => {
    registerData(setData);
    start({ onData: pushData, onStatus: setConn, onError: e => { console.error(e); setErr(e); } });
  }, []);

  if (err && !data) {
    return html`<div class="boot err">연결하지 못했어요<br /><small>${err.code || err.message}</small></div>`;
  }
  if (!data) return html`<div class="boot">불러오는 중…</div>`;

  const pages = list(data.pages);
  const page = pages.find(p => p.id === cur) || (cur === ARCHIVE ? null : pages[0]);
  const current = cur === ARCHIVE ? ARCHIVE : page?.id;

  return html`
    <${Header} meta=${data.meta} conn=${conn} data=${data} />
    <${Tabs} pages=${pages} cur=${current} setCur=${setCur} />
    ${current === ARCHIVE
      ? html`<${ArchiveView} data=${data} />`
      : page
        ? html`<${PageView} key=${page.id} data=${data} page=${page} pages=${pages} />`
        : html`<main class="page"><div class="empty-note">위의 + 를 눌러 첫 페이지를 만들어 주세요</div></main>`}
    <${Sheet} />
    <${Toast} />`;
}

render(html`<${App} />`, document.getElementById('app'));
