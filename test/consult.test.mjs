// /api/consult 동작 검증. 실제 Apps Script 로는 한 건도 보내지 않는다(fetch 를 가로챈다).
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const handler = require('../api/consult.js');

let sent = null;
let nextFetch = () => ({ ok: true, status: 200 });
globalThis.fetch = async (url, opt) => { sent = { url, opt }; return nextFetch(); };

let seq = 0; // 레이트리밋에 걸리지 않도록 테스트마다 다른 IP 를 쓴다
function call(body, { method = 'POST', origin = 'https://hyeonam.com', ip = `10.0.0.${++seq}` } = {}) {
  sent = null;
  const req = {
    method,
    headers: { origin, 'x-forwarded-for': ip, 'user-agent': 'test' },
    body: typeof body === 'string' ? undefined : body,
    socket: { remoteAddress: ip },
    on: () => {},
  };
  return new Promise((resolve) => {
    const res = {
      statusCode: 200,
      setHeader: () => {},
      end: (s) => resolve({ status: res.statusCode, body: JSON.parse(s), sent }),
    };
    handler(req, res);
  });
}

const P = (k) => (sent ? new URLSearchParams(sent.opt.body).get(k) : null);
let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}  ${extra}`); }
};

const GOOD = { name: '홍길동', phone: '010-1234-5678', debt: '3천만원~5천만원', time: '오전 (09~12시)', landing: '메인', agree: 'on', elapsed: 9000 };

console.log('\n[1] 정상 접수');
let r = await call({ ...GOOD });
ok('200 ok', r.status === 200 && r.body.ok === true, JSON.stringify(r.body));
ok('Apps Script 로 전달됨', !!sent);
ok('성함 보존', P('name') === '홍길동', P('name'));
ok('연락처 하이픈 정규화', P('phone') === '010-1234-5678', P('phone'));
ok('채무금액 한글 보존', P('debt') === '3천만원~5천만원', P('debt'));
ok('통화가능시간 보존', P('time') === '오전 (09~12시)', P('time'));
ok('유입페이지 보존', P('landing') === '메인', P('landing'));
ok('charset=UTF-8 명시', /charset=UTF-8/i.test(sent.opt.headers['Content-Type']), sent.opt.headers['Content-Type']);

console.log('\n[2] 거절되어야 하는 것들 (오늘 들어온 공격 재현)');
r = await call({}, { method: 'GET' });                      ok('GET → 405', r.status === 405);
r = await call({ ...GOOD }, { origin: 'https://evil.com' }); ok('외부 Origin → 403', r.status === 403);
r = await call({});                                          ok('빈 바디 → 400', r.status === 400 && !sent);
r = await call({ name: 'test_security_audit', phone: '1000000000', elapsed: 9000 });
ok('1000000000 → 400 (휴대폰 아님)', r.status === 400 && !sent, JSON.stringify(r.body));
r = await call({ name: '', phone: '01012345678', elapsed: 9000 });
ok('이름 공란 → 400', r.status === 400 && !sent);
r = await call({ ...GOOD, elapsed: 300 });
ok('0.3초 제출(봇) → 저장 안 함', r.body.ok === true && !sent);

console.log('\n[3] 수식 인젝션 차단');
r = await call({ ...GOOD, name: '=1+1', landing: '@SUM(A1:A9)', elapsed: 9000 });
ok("이름 = → ' 로 무력화", P('name') === "'=1+1", P('name'));
ok("유입 @ → ' 로 무력화", P('landing') === "'@SUM(A1:A9)", P('landing'));
r = await call({ ...GOOD, name: '홍길동\n가짜: 999', elapsed: 9000 });
ok('줄바꿈 제거(텔레그램 형식 위조 차단)', !P('name').includes('\n'), JSON.stringify(P('name')));

console.log('\n[4] 목록에 없는 값은 버리지 않고 통과 (리드 유실 방지)');
r = await call({ ...GOOD, debt: '2천만원 정도', elapsed: 9000 });
ok('접수는 성공', r.body.ok === true);
ok('값 보존', P('debt') === '2천만원 정도', P('debt'));

console.log('\n[5] 레이트리밋 — 거절과 정상 접수를 따로 센다');
const badIp = '9.9.9.9';
const badCodes = [];
for (let i = 0; i < 7; i++) badCodes.push((await call({ name: 'x', phone: '1000000000' }, { ip: badIp })).status);
ok('거절 5회 후 차단', JSON.stringify(badCodes) === JSON.stringify([400, 400, 400, 400, 400, 429, 429]), JSON.stringify(badCodes));

const okIp = '8.8.8.8';
const okCodes = [];
for (let i = 0; i < 12; i++) okCodes.push((await call({ ...GOOD }, { ip: okIp })).status);
ok('정상 접수는 10건까지 허용(CGNAT 오폭 방지)',
  okCodes.slice(0, 10).every((c) => c === 200) && okCodes[10] === 429, JSON.stringify(okCodes));

const mixIp = '7.7.7.7';
for (let i = 0; i < 4; i++) await call({ name: 'x', phone: '1000000000' }, { ip: mixIp }); // 거절 4회
ok('거절이 한도 미만이면 실고객은 통과', (await call({ ...GOOD }, { ip: mixIp })).status === 200);

console.log('\n[6] Apps Script 장애 시 조용히 성공하지 않음');
nextFetch = () => ({ ok: false, status: 500 });
r = await call({ ...GOOD }, { ip: '2.2.2.2' });
ok('502 반환', r.status === 502 && r.body.ok === false, JSON.stringify(r.body));
nextFetch = () => { throw new Error('network down'); };
r = await call({ ...GOOD }, { ip: '3.3.3.3' });
ok('네트워크 끊김도 502', r.status === 502 && r.body.ok === false);

console.log(`\n=== ${pass} pass / ${fail} fail ===`);
process.exit(fail ? 1 : 0);
