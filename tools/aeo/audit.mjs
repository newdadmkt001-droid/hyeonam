import fs from 'fs';

const files = {
  'hyeonam.com': 'hyeonam.com.html',
  'simwon.kr': 'simwon.kr.html',
  'simwoncenter.kr': 'simwoncenter.kr.html',
  'hyeonamclaim.com (루트)': 'hyeonamclaim.com.html',
  'hyeonamclaim.com/dispute': 'hyeonamclaim-dispute.html',
};

const strip = h => h.replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&[a-z#0-9]+;/gi,' ').replace(/\s+/g,' ').trim();
const meta = (h, re) => { const m = h.match(re); return m ? m[1].trim() : null; };
const all = (h, re) => [...h.matchAll(re)].map(m => m[1].trim());

for (const [name, f] of Object.entries(files)) {
  const h = fs.readFileSync(f, 'utf8');
  const text = strip(h);
  const ld = all(h, /<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi);
  const types = [];
  for (const blob of ld) {
    try { const j = JSON.parse(blob);
      const walk = o => { if (Array.isArray(o)) return o.forEach(walk);
        if (o && typeof o === 'object') { if (o['@type']) types.push([].concat(o['@type']).join('/')); Object.values(o).forEach(walk); } };
      walk(j);
    } catch(e) { types.push('PARSE_ERROR'); }
  }
  const h1 = all(h, /<h1[^>]*>([\s\S]*?)<\/h1>/gi).map(strip);
  const h2 = all(h, /<h2[^>]*>([\s\S]*?)<\/h2>/gi).map(strip);
  const h3 = all(h, /<h3[^>]*>([\s\S]*?)<\/h3>/gi).map(strip);
  const heads = [...h1, ...h2, ...h3];
  const q = heads.filter(t => /[?？]|무엇|어떻게|왜 |얼마|언제|어디|가능한가|되나요|할까|인가요|있나요/.test(t));
  const imgs = all(h, /<img\b([^>]*)>/gi);
  const withAlt = imgs.filter(a => /alt\s*=\s*["'][^"']+["']/i.test(a));
  const desc = meta(h, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i)
            || meta(h, /<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i);

  console.log('\n######', name);
  console.log('lang      :', meta(h, /<html[^>]*lang=["']([^"']+)["']/i) || '없음');
  console.log('title     :', (meta(h, /<title[^>]*>([\s\S]*?)<\/title>/i) || '없음'));
  console.log('desc      :', desc ? `${desc.length}자 | ${desc.slice(0,70)}...` : '❌ 없음');
  console.log('canonical :', meta(h, /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i) || '❌ 없음');
  console.log('og:title  :', meta(h, /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']*)["']/i) || '❌ 없음');
  console.log('og:image  :', meta(h, /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']*)["']/i) || '❌ 없음');
  console.log('JSON-LD   :', types.length ? `${ld.length}블록 → ${[...new Set(types)].join(', ')}` : '❌ 없음');
  console.log('본문 글자  :', text.length.toLocaleString() + '자');
  console.log('h1/h2/h3  :', `${h1.length} / ${h2.length} / ${h3.length}`);
  console.log('질문형 제목:', q.length ? `${q.length}개 → ${q.slice(0,4).join(' | ')}` : '❌ 0개');
  console.log('img alt   :', imgs.length ? `${withAlt.length}/${imgs.length}` : 'img 태그 0개');
  if (h1.length) console.log('h1 내용   :', h1.join(' | ').slice(0,120));
  if (h2.length) console.log('h2 샘플   :', h2.slice(0,6).join(' | ').slice(0,200));
}
