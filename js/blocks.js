// 블록 6종: 메모, 체크리스트, 카드, 타임라인, 표, 가계부
import { useEffect, useRef } from 'preact/hooks';
import Sortable from 'sortablejs';
import {
  html, Field, patch, list, newId, nextOrder, moveOrder, archiveUpdates,
  requestFocus, openSheet, setDragging, fmt, CUR,
} from './core.js';

const itemPath = (b, id) => `blocks/${b.id}/items/${id}`;

/* ---------- 순서 바꾸기 가능한 항목 목록 ---------- */
function SortList({ items, cls = '', onMove, children }) {
  const el = useRef();
  const latest = useRef({ items, onMove });
  latest.current = { items, onMove };
  useEffect(() => {
    const s = Sortable.create(el.current, {
      handle: '.handle',
      animation: 150,
      delay: 120,
      delayOnTouchOnly: true,
      forceFallback: true,
      fallbackTolerance: 3,
      ghostClass: 'drag-ghost',
      onStart: () => setDragging(true),
      onEnd: e => {
        const { item, from, oldIndex, newIndex } = e;
        // DOM은 Preact가 관리하므로 원위치시키고 데이터만 바꾼다.
        from.removeChild(item);
        from.insertBefore(item, from.children[oldIndex] || null);
        setDragging(false);
        if (oldIndex !== newIndex) latest.current.onMove(oldIndex, newIndex);
      },
    });
    return () => s.destroy();
  }, []);
  return html`<div class=${`sortlist ${cls}`} ref=${el}>${children}</div>`;
}

const Handle = () => html`<span class="handle" aria-label="끌어서 순서 바꾸기">⋮⋮</span>`;
const More = ({ onClick }) => html`<button class="more" onClick=${onClick} aria-label="메뉴">⋯</button>`;

function moveItem(b, arr, from, to) {
  const { id, order } = moveOrder(arr, from, to);
  patch({ [`${itemPath(b, id)}/order`]: order });
}

function addItem(b, fields, focusField) {
  const id = newId();
  const arr = list(b.items);
  patch({ [itemPath(b, id)]: { ...fields, order: nextOrder(arr) } });
  if (focusField) requestFocus(`${itemPath(b, id)}/${focusField}`);
}

// 항목 ⋯ 메뉴 공통 동작
function itemMenu(b, it, arr, extra = []) {
  const i = arr.findIndex(x => x.id === it.id);
  openSheet({
    actions: [
      ...extra,
      i > 0 && { icon: '↑', label: '위로', onClick: () => moveItem(b, arr, i, i - 1) },
      i < arr.length - 1 && { icon: '↓', label: '아래로', onClick: () => moveItem(b, arr, i, i + 1) },
      {
        icon: '⧉', label: '복제', onClick: () => {
          const next = arr[i + 1];
          const { id: _id, ...rest } = it;
          const order = next ? ((it.order ?? 0) + (next.order ?? 0)) / 2 : (it.order ?? 0) + 1;
          patch({ [itemPath(b, newId())]: { ...rest, order } });
        },
      },
      { icon: '🗃️', label: '보관함으로', danger: true, onClick: () => patch(archiveUpdates(itemPath(b, it.id))) },
    ],
  });
}

const AddBtn = ({ label = '추가', onClick }) => html`<button class="add" onClick=${onClick}>+ ${label}</button>`;

/* ---------- 메모 ---------- */
function MemoView({ b }) {
  return html`<${Field} path=${`blocks/${b.id}/text`} value=${b.text} multiline keys placeholder="내용 입력" cls="memo" />`;
}

/* ---------- 체크리스트 ---------- */
function checklistItems(b) {
  const all = list(b.items);
  return [...all.filter(x => !x.done), ...all.filter(x => x.done)];
}
function ChecklistView({ b }) {
  const arr = checklistItems(b);
  return html`
    <${SortList} items=${arr} onMove=${(f, t) => moveItem(b, arr, f, t)}>
      ${arr.map(it => html`
        <div class=${`row check ${it.done ? 'done' : ''}`} key=${it.id} data-id=${it.id}>
          <${Handle} />
          <button class=${`box ${it.done ? 'on' : ''}`} aria-label="체크"
            onClick=${() => patch({ [`${itemPath(b, it.id)}/done`]: !it.done || null })}>${it.done ? '✓' : ''}</button>
          <${Field} path=${`${itemPath(b, it.id)}/text`} value=${it.text} placeholder="할 일" cls="grow" />
          <${More} onClick=${() => itemMenu(b, it, arr)} />
        </div>`)}
    <//>
    <${AddBtn} label="항목" onClick=${() => addItem(b, { text: '' }, 'text')} />`;
}

/* ---------- 카드 ---------- */
export const STATUSES = [
  { v: '확정', c: 'green' }, { v: '예약 완료', c: 'green' }, { v: '예약 전', c: 'orange' },
  { v: '조사 중', c: 'blue' }, { v: '진행 중', c: 'blue' }, { v: '미정', c: 'gray' },
];
const statusColor = v => STATUSES.find(s => s.v === v)?.c || 'gray';
function pickStatus(path, cur) {
  openSheet({
    title: '상태',
    actions: [
      ...STATUSES.map(s => ({ label: html`<span class=${`badge ${s.c}`}>${s.v}</span>`, active: s.v === cur, onClick: () => patch({ [path]: s.v }) })),
      { label: '상태 없음', onClick: () => patch({ [path]: null }) },
    ],
  });
}
function CardsView({ b }) {
  const arr = list(b.items);
  return html`
    <${SortList} items=${arr} cls="cards" onMove=${(f, t) => moveItem(b, arr, f, t)}>
      ${arr.map(it => html`
        <div class="card" key=${it.id} data-id=${it.id}>
          <div class="card-top">
            <${Handle} />
            <${Field} path=${`${itemPath(b, it.id)}/title`} value=${it.title} placeholder="제목" cls="card-title grow" />
            <button class=${`badge ${it.status ? statusColor(it.status) : 'ghost'}`}
              onClick=${() => pickStatus(`${itemPath(b, it.id)}/status`, it.status)}>${it.status || '상태'}</button>
            <${More} onClick=${() => itemMenu(b, it, arr)} />
          </div>
          <${Field} path=${`${itemPath(b, it.id)}/body`} value=${it.body} multiline keys placeholder="내용" cls="card-body" />
        </div>`)}
    <//>
    <${AddBtn} label="카드" onClick=${() => addItem(b, { title: '' }, 'title')} />`;
}

/* ---------- 타임라인 ---------- */
function TimelineView({ b }) {
  const arr = list(b.items);
  return html`
    <${SortList} items=${arr} cls="timeline" onMove=${(f, t) => moveItem(b, arr, f, t)}>
      ${arr.map(it => html`
        <div class="tl" key=${it.id} data-id=${it.id}>
          <${Handle} />
          <${Field} path=${`${itemPath(b, it.id)}/time`} value=${it.time} placeholder="시각" cls="tl-time" />
          <div class="tl-dot"></div>
          <div class="tl-main">
            <${Field} path=${`${itemPath(b, it.id)}/title`} value=${it.title} placeholder="일정" cls="tl-title" />
            <${Field} path=${`${itemPath(b, it.id)}/desc`} value=${it.desc} multiline keys placeholder="설명" cls="tl-desc" />
          </div>
          <${More} onClick=${() => itemMenu(b, it, arr)} />
        </div>`)}
    <//>
    <${AddBtn} label="일정" onClick=${() => addItem(b, { time: '' }, 'time')} />`;
}

/* ---------- 표 ---------- */
const tableCols = b => (Array.isArray(b.cols) ? b.cols : Object.values(b.cols || {}));
function TableView({ b }) {
  const cols = tableCols(b);
  const arr = list(b.items);
  return html`
    <div class="table-wrap"><table class="tbl">
      <thead><tr>
        ${cols.map((c, ci) => html`<th key=${ci}><${Field} path=${`blocks/${b.id}/cols/${ci}`} value=${c} placeholder="열" /></th>`)}
        <th class="act"></th>
      </tr></thead>
      <tbody>
        ${arr.map(it => html`<tr key=${it.id}>
          ${cols.map((_, ci) => html`<td key=${ci}><${Field} path=${`${itemPath(b, it.id)}/cells/${ci}`} value=${it.cells?.[ci]} placeholder="" /></td>`)}
          <td class="act"><${More} onClick=${() => itemMenu(b, it, arr)} /></td>
        </tr>`)}
      </tbody>
    </table></div>
    <${AddBtn} label="행" onClick=${() => addItem(b, { cells: { 0: '' } }, 'cells/0')} />`;
}
const tableExtra = b => {
  const cols = tableCols(b);
  return [
    { icon: '➕', label: '열 추가', onClick: () => patch({ [`blocks/${b.id}/cols/${cols.length}`]: '열' }) },
    cols.length > 1 && { icon: '➖', label: `마지막 열(${cols[cols.length - 1] || '열'}) 삭제`, danger: true, onClick: () => {
      const u = { [`blocks/${b.id}/cols/${cols.length - 1}`]: null };
      for (const it of list(b.items)) u[`${itemPath(b, it.id)}/cells/${cols.length - 1}`] = null;
      patch(u);
    } },
  ];
};

/* ---------- 가계부 ---------- */
function sums(items) {
  const s = { KRW: 0, JPY: 0, approx: { KRW: false, JPY: false } };
  for (const it of items) {
    if (typeof it.amount !== 'number') continue;
    const c = it.cur || 'KRW';
    s[c] += it.amount;
    if (it.approx) s.approx[c] = true;
  }
  return s;
}
const money = (s, c) => (s[c] ? `${s.approx[c] ? '약 ' : ''}${CUR[c]}${fmt(s[c])}` : `${CUR[c]}0`);

function LedgerRow({ b, it, arr }) {
  const p = itemPath(b, it.id);
  const c = it.cur || 'KRW';
  const extra = [
    { icon: it.kind === 'planned' ? '💳' : '⏳', label: it.kind === 'planned' ? '쓴 돈으로 옮기기' : '낼 예정으로 옮기기',
      onClick: () => patch({ [`${p}/kind`]: it.kind === 'planned' ? 'spent' : 'planned' }) },
    { icon: '≈', label: it.approx ? '"약" 빼기' : '"약" 붙이기', onClick: () => patch({ [`${p}/approx`]: !it.approx || null }) },
  ];
  return html`<div class="row ledger" key=${it.id} data-id=${it.id}>
    <${Handle} />
    <div class="lg-main">
      <div class="lg-line">
        <${Field} path=${`${p}/cat`} value=${it.cat} placeholder="분류" cls="lg-cat" />
        <${Field} path=${`${p}/label`} value=${it.label} placeholder="항목" cls="grow" />
      </div>
      <div class="lg-sub">
        <${Field} path=${`${p}/date`} value=${it.date} placeholder="날짜" cls="lg-date" />
        <${Field} path=${`${p}/note`} value=${it.note} placeholder="메모" cls="grow" />
      </div>
    </div>
    <div class="lg-amt">
      <button class="cur" onClick=${() => patch({ [`${p}/cur`]: c === 'KRW' ? 'JPY' : 'KRW' })}>${CUR[c]}</button>
      <${Field} path=${`${p}/amount`} value=${it.amount} numeric placeholder="미정" cls="amt"
        display=${v => `${it.approx ? '약 ' : ''}${fmt(v)}`} />
    </div>
    <${More} onClick=${() => itemMenu(b, it, arr, extra)} />
  </div>`;
}

function LedgerView({ b }) {
  const all = list(b.items);
  const spent = all.filter(x => x.kind !== 'planned');
  const planned = all.filter(x => x.kind === 'planned');
  const ss = sums(spent), ps = sums(planned), ts = sums(all);
  const people = b.people || 2;
  const cats = {};
  for (const it of spent) {
    if (typeof it.amount !== 'number') continue;
    const k = it.cat || '기타';
    cats[k] ??= { KRW: 0, JPY: 0 };
    cats[k][it.cur || 'KRW'] += it.amount;
  }
  const catLine = v => [v.KRW && `₩${fmt(v.KRW)}`, v.JPY && `¥${fmt(v.JPY)}`].filter(Boolean).join(' + ');
  const add = kind => addItem(b, { kind, cur: kind === 'planned' ? 'JPY' : 'KRW', date: kind === 'spent' ? today() : '' }, 'label');
  return html`
    <div class="lg-sum">
      <table class="tbl sum">
        <thead><tr><th></th><th>원화</th><th>엔화</th></tr></thead>
        <tbody>
          <tr><td>💳 쓴 돈</td><td>${money(ss, 'KRW')}</td><td>${money(ss, 'JPY')}</td></tr>
          <tr><td>⏳ 낼 예정</td><td>${money(ps, 'KRW')}</td><td>${money(ps, 'JPY')}</td></tr>
          <tr class="total"><td>합계</td><td>${money(ts, 'KRW')}</td><td>${money(ts, 'JPY')}</td></tr>
        </tbody>
      </table>
      <div class="lg-per">쓴 돈 1인 (${people}명 기준): ₩${fmt(Math.round(ss.KRW / people))}${ss.JPY ? ` + ¥${fmt(Math.round(ss.JPY / people))}` : ''}</div>
      ${Object.keys(cats).length > 0 && html`<div class="lg-cats">
        ${Object.entries(cats).map(([k, v]) => html`<span class="chip">${k} ${catLine(v)}</span>`)}
      </div>`}
    </div>
    <div class="lg-head">💳 쓴 돈</div>
    <${SortList} items=${spent} onMove=${(f, t) => moveItem(b, spent, f, t)}>
      ${spent.map(it => html`<${LedgerRow} key=${it.id} b=${b} it=${it} arr=${spent} />`)}
    <//>
    <${AddBtn} label="쓴 돈" onClick=${() => add('spent')} />
    <div class="lg-head">⏳ 낼 예정</div>
    <${SortList} items=${planned} onMove=${(f, t) => moveItem(b, planned, f, t)}>
      ${planned.map(it => html`<${LedgerRow} key=${it.id} b=${b} it=${it} arr=${planned} />`)}
    <//>
    <${AddBtn} label="낼 예정" onClick=${() => add('planned')} />`;
}
function today() {
  const d = new Date();
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

/* ---------- 등록 ---------- */
export const TYPES = {
  memo: { label: '메모', icon: '📝', View: MemoView, init: () => ({ text: '' }) },
  checklist: {
    label: '체크리스트', icon: '☑️', View: ChecklistView, init: () => ({}),
    badge: b => { const a = list(b.items); return a.length ? `${a.filter(x => x.done).length}/${a.length}` : ''; },
  },
  cards: { label: '카드', icon: '🗂️', View: CardsView, init: () => ({}) },
  timeline: { label: '타임라인', icon: '🕒', View: TimelineView, init: () => ({}) },
  table: { label: '표', icon: '📊', View: TableView, init: () => ({ cols: ['항목', '내용'] }), extra: tableExtra },
  ledger: { label: '가계부', icon: '💰', View: LedgerView, init: () => ({ people: 2 }) },
};
