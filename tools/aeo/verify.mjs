import fs from 'fs';
const REPO='C:/Users/OAJ/Desktop/hyeonam';
let fail=0;
for (const f of ['index.html','1.html','2.html','3.html','4.html','blog.html','cafe.html']) {
  const h=fs.readFileSync(`${REPO}/${f}`,'utf8');
  const blocks=[...h.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  if(blocks.length!==1){console.log(`❌ ${f}: ld+json 블록 ${blocks.length}개`);fail++;continue;}
  try{
    const o=JSON.parse(blocks[0][1]);
    const types=o['@graph'].map(n=>n['@type']);
    const faq=o['@graph'].find(n=>n['@type']==='FAQPage').mainEntity.length;
    const robots=(h.match(/<meta name="robots" content="([^"]*)"/)||[])[1];
    console.log(`✔ ${f}  [${types.join(', ')}]  FAQ ${faq}문항  robots="${robots}"`);
  }catch(e){console.log(`❌ ${f}: JSON 파싱 실패 — ${e.message}`);fail++;}
}
// 표준 준수 체크
const o=JSON.parse(fs.readFileSync(`${REPO}/index.html`,'utf8').match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
const org=o['@graph'].find(n=>n['@type']==='LegalService');
const need=['@id','name','url','telephone','address','logo','image','openingHoursSpecification','areaServed','sameAs'];
const miss=need.filter(k=>!org[k]);
console.log('\nLegalService 필수/권장 필드 누락:', miss.length?miss.join(', '):'없음');
console.log('@id 참조 무결성:', o['@graph'].every(n=>!n.isPartOf||o['@graph'].some(m=>m['@id']===n.isPartOf['@id']))?'OK':'❌ 끊긴 참조');
process.exit(fail?1:0);
