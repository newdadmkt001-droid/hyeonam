/**
 * 상담 접수 중계 (Vercel Serverless Function)
 *
 * 브라우저 → /api/consult → Apps Script(구글시트 기록 + 텔레그램 발송)
 *
 * 이 함수를 둔 이유: 예전에는 브라우저가 Apps Script URL로 직접 POST 했다.
 * 그 URL이 js/main.js 에 평문으로 박혀 있어 누구나 폼을 거치지 않고 가짜 접수를
 * 꽂아 넣을 수 있었다(2026-09-30 13:18~13:24 실제 발생, 12건 유입).
 * 이제 URL은 서버 환경변수로만 존재하고, 브라우저는 같은 출처의 이 경로만 안다.
 *
 * env
 *   SHEET_ENDPOINT  Apps Script 웹앱 URL. 미설정 시 기존 URL로 폴백한다
 *                   (환경변수를 넣기 전에 배포해도 접수가 끊기지 않게 하기 위함).
 *   SHEET_KEY       Apps Script 와 나눠 갖는 공유 시크릿. 설정하면 k 파라미터로 함께 보낸다.
 *                   Apps Script 쪽에도 같은 값을 넣고 doPost 첫 줄에서 대조해야 효력이 생긴다.
 */

// 환경변수 이전 폴백. Apps Script 를 재배포해 새 URL 을 SHEET_ENDPOINT 에 넣으면 이 값은 죽는다.
const FALLBACK_ENDPOINT =
  'https://script.google.com/macros/s/AKfycbzAHRYh8v5zY3_oDVPVPkOY-p4ihum0z57jl9gcVcH0shl5wb_BlB5QWcQ-yQcGhmj1zg/exec';

const PHONE = /^01[016789]\d{7,8}$/;

// 셀렉트 박스의 값은 index.html 과 1:1 로 맞춘다. 목록에 있으면 그대로 통과시키고,
// 없으면 버리지 않고 세정해서 넘긴다 — 옵션 문구가 바뀌었을 때 리드를 잃는 쪽이 더 큰 손해다.
const DEBT = ['3천만원 미만', '3천만원~5천만원', '5천만원~1억원', '1억원~3억원', '3억원 이상'];
const TIME = ['언제든 가능', '오전 (09~12시)', '오후 (12~18시)', '저녁 (18시 이후)'];

// 레이트리밋. 거절된 요청과 정상 접수를 따로 센다.
//
// 한 통에 몰아 세면 안 되는 이유: 국내 이동통신사는 CGNAT 라 수많은 고객이 같은 공인 IP 를
// 쓴다. 스캐너 하나가 한도를 태우면 그 IP 를 공유하는 실고객까지 막힌다.
// 그래서 스캐너 신호(거절)에는 빡빡하게, 실제 접수에는 넉넉하게 준다.
const WINDOW = 10 * 60 * 1000;
const MAX_BAD = 5;   // 거절 5회 — 훑어보는 놈은 여기서 끊긴다
const MAX_OK = 10;   // 정상 접수 10건 — 같은 IP 를 공유하는 실고객들의 여유분
const hits = new Map(); // ip → [{ t, ok }]

function recent(ip) {
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter((h) => now - h.t < WINDOW);
  if (arr.length) hits.set(ip, arr);
  else hits.delete(ip);
  if (hits.size > 5000) hits.clear(); // 메모리 폭주 방지
  return arr;
}
function rateLimited(ip) {
  const arr = recent(ip);
  return arr.filter((h) => !h.ok).length >= MAX_BAD || arr.filter((h) => h.ok).length >= MAX_OK;
}
function record(ip, ok) {
  const arr = recent(ip);
  arr.push({ t: Date.now(), ok });
  hits.set(ip, arr);
}

// 구글시트는 = + - @ 로 시작하는 값을 수식으로 해석한다. 앞에 작은따옴표를 붙여 글자로 고정한다.
// 제어문자도 털어낸다(줄바꿈으로 텔레그램 메시지 형식을 무너뜨리는 것을 막는다).
function cell(v, max) {
  let s = String(v ?? '')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .trim()
    .slice(0, max);
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  return s;
}

function pick(v, list, max) {
  const s = String(v ?? '').trim();
  if (!s) return '';
  if (list.includes(s)) return s;
  console.warn('목록에 없는 값 — 세정 후 통과', JSON.stringify(s));
  return cell(s, max);
}

function readBody(req) {
  return new Promise((resolve) => {
    if (req.body && typeof req.body === 'object') return resolve(req.body);
    let s = '';
    req.on('data', (c) => {
      s += c;
      if (s.length > 20000) req.destroy();
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(s || '{}'));
      } catch {
        resolve({});
      }
    });
  });
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || '';
  const reject = (status, error) => {
    record(ip, false);
    res.statusCode = status;
    return res.end(JSON.stringify({ ok: false, error }));
  };

  if (req.method !== 'POST') return reject(405, 'method');

  // 폼이 아닌 곳에서 온 호출을 거른다. 브라우저는 same-origin 이라 Origin 이 자기 도메인이거나,
  // 구형 브라우저에선 아예 비어 있다. 값이 있는데 남의 도메인인 경우만 막는다.
  const origin = req.headers.origin || '';
  if (origin && !/^https?:\/\/([a-z0-9-]+\.)*hyeonam\.com$/i.test(origin) && !origin.includes('localhost')) {
    console.warn('외부 Origin 차단', origin);
    return reject(403, 'origin');
  }

  if (rateLimited(ip)) {
    console.warn('레이트리밋', ip);
    res.statusCode = 429;
    return res.end(JSON.stringify({ ok: false, error: 'too_many' }));
  }

  const b = await readBody(req);

  const phone = String(b.phone || '').replace(/\D/g, '');
  if (!PHONE.test(phone)) return reject(400, 'phone');
  const name = cell(b.name, 40);
  if (!name) return reject(400, 'name');

  // 봇 판별은 폼이 그려진 뒤 제출까지 걸린 시간으로 한다.
  // 숨은 입력칸(허니팟)은 쓰지 않는다 — 크롬·엣지가 자동완성으로 채워 실고객을 봇으로
  // 오판한 전례가 있다(2026-09-22 현암손사). 오판 비용이 스팸 비용보다 크다.
  const elapsed = Number(b.elapsed);
  if (Number.isFinite(elapsed) && elapsed < 1500) {
    console.warn('봇으로 판단해 저장하지 않음', { elapsed, ip });
    record(ip, false);
    return res.end(JSON.stringify({ ok: true })); // 봇에게는 성공으로 보이게 한다
  }

  const form = new URLSearchParams({
    name,
    phone: phone.replace(/(\d{3})(\d{3,4})(\d{4})/, '$1-$2-$3'),
    debt: pick(b.debt, DEBT, 40),
    time: pick(b.time, TIME, 40),
    landing: cell(b.landing, 40),
    agree: b.agree ? 'on' : '',
  });
  if (process.env.SHEET_KEY) form.set('k', process.env.SHEET_KEY);

  const endpoint = process.env.SHEET_ENDPOINT || FALLBACK_ENDPOINT;
  try {
    // URLSearchParams 가 UTF-8 로 퍼센트 인코딩하고, charset 까지 명시해 못을 박는다.
    // 2026-09-30 시트에 '3õ���� �̸�' 로 들어온 건 공격자가 CLI 로 생바이트를 보냈기 때문이다.
    // 이제 Apps Script 와 대화하는 것은 이 함수뿐이라 그 경로 자체가 없어졌다.
    const r = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
      body: form.toString(),
      redirect: 'follow',
    });
    if (!r.ok) throw new Error('apps script ' + r.status);
  } catch (err) {
    // 접수를 조용히 삼키지 않는다. 화면에 오류를 띄워 고객이 전화로라도 닿게 한다.
    // 한도에는 세지 않는다 — 우리 쪽 장애인데 고객의 재시도를 막으면 안 된다.
    console.error('접수 중계 실패', { ip, name, phone, message: err?.message });
    res.statusCode = 502;
    return res.end(JSON.stringify({ ok: false, error: 'delivery' }));
  }

  record(ip, true);
  res.end(JSON.stringify({ ok: true }));
};
