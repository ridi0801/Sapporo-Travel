// Claude·스크립트용 Firebase REST 도우미 (익명 로그인 토큰 사용).
// node tools/fb.mjs get [경로]          → sapporo/<경로> 읽기
// node tools/fb.mjs backup <파일>        → sapporo/ 전체를 파일로 저장
// node tools/fb.mjs patch <경로> <JSON>  → sapporo/<경로> 에 부분 갱신
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const API_KEY = 'AIzaSyCt3XYh0ot3J2oncUSUjiz8Uo2RLcsmciE';
const DB = 'https://miyakojima-travel-default-rtdb.asia-southeast1.firebasedatabase.app';
const ROOT = 'sapporo';

export async function getToken() {
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${API_KEY}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ returnSecureToken: true }),
  });
  const j = await r.json();
  if (!j.idToken) throw new Error('익명 로그인 실패: ' + JSON.stringify(j.error || j));
  return j.idToken;
}
const url = (path, token, extra = '') => `${DB}/${[ROOT, path].filter(Boolean).join('/')}.json?auth=${token}${extra}`;
async function req(method, path, token, body, extra) {
  const r = await fetch(url(path, token, extra), { method, body: body === undefined ? undefined : JSON.stringify(body) });
  const j = await r.json();
  if (!r.ok) throw new Error(`${method} ${path} → ${r.status} ${JSON.stringify(j)}`);
  return j;
}
export const get = (path, token, shallow) => req('GET', path, token, undefined, shallow ? '&shallow=true' : '');
export const put = (path, body, token) => req('PUT', path, token, body);
export const patchPath = (path, body, token) => req('PATCH', path, token, body);

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [cmd, a, b] = process.argv.slice(2);
  const token = await getToken();
  if (cmd === 'get') console.log(JSON.stringify(await get(a || '', token), null, 2));
  else if (cmd === 'backup') { writeFileSync(a, JSON.stringify(await get('', token), null, 2)); console.log('저장: ' + a); }
  else if (cmd === 'patch') console.log(JSON.stringify(await patchPath(a, JSON.parse(b), token)));
  else console.log('사용법: get [경로] | backup <파일> | patch <경로> <JSON>');
}
