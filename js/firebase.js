// 데이터 연결: Firebase Realtime DB (sapporo/ 아래).
// 로컬 개발 때 localhost?mock 으로 열면 메모리 저장소로 동작한다.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { getDatabase, ref, onValue, update } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js';

const config = {
  apiKey: 'AIzaSyCt3XYh0ot3J2oncUSUjiz8Uo2RLcsmciE',
  authDomain: 'miyakojima-travel.firebaseapp.com',
  databaseURL: 'https://miyakojima-travel-default-rtdb.asia-southeast1.firebasedatabase.app',
  projectId: 'miyakojima-travel',
  storageBucket: 'miyakojima-travel.firebasestorage.app',
  messagingSenderId: '931624323855',
  appId: '1:931624323855:web:6a035c3da794a1c3f04c7a',
};
export const ROOT = 'sapporo';

const MOCK = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) && new URLSearchParams(location.search).has('mock');

let db = null;
let mockData = {};
let mockListener = null;

export function start({ onData, onStatus, onError }) {
  if (MOCK) {
    mockListener = onData;
    fetch('mock.json').then(r => (r.ok ? r.json() : {})).catch(() => ({})).then(d => {
      mockData = d || {};
      onStatus(true);
      onData(structuredClone(mockData));
    });
    return;
  }
  const app = initializeApp(config);
  const auth = getAuth(app);
  db = getDatabase(app);
  let subscribed = false;
  onAuthStateChanged(auth, user => {
    if (!user || subscribed) return;
    subscribed = true;
    onValue(ref(db, ROOT), snap => onData(snap.val() || {}), onError);
    onValue(ref(db, '.info/connected'), s => onStatus(!!s.val()));
  });
  signInAnonymously(auth).catch(onError);
}

// updates: { 'blocks/b1/title': '값', ... } (ROOT 기준 경로). undefined/null 은 삭제.
export function patch(updates) {
  if (MOCK) {
    for (const [k, v] of Object.entries(updates)) setPath(mockData, k.split('/'), v ?? null);
    mockListener?.(structuredClone(mockData));
    return Promise.resolve();
  }
  const u = {};
  for (const [k, v] of Object.entries(updates)) u[`${ROOT}/${k}`] = v === undefined ? null : v;
  return update(ref(db), u);
}

function setPath(obj, parts, v) {
  const last = parts.pop();
  let o = obj;
  for (const p of parts) {
    if (o[p] == null || typeof o[p] !== 'object') {
      if (v === null) return;
      o[p] = {};
    }
    o = o[p];
  }
  if (v === null) delete o[last];
  else o[last] = structuredClone(v);
}
