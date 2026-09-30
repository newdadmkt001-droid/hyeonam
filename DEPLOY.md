# 배포 · 운영 메모

| 항목 | 위치 |
|---|---|
| 도메인 | hyeonam.com |
| GitHub | newdadmkt001-droid/hyeonam |
| Vercel | 팀 `newdadmkt001-droids-projects` · **git push 하면 자동 배포** |
| 접수 DB | 구글시트 「현암 db」 · 시트명 `상담신청` |
| 알림 | 텔레그램 (Apps Script 가 발송) |

> 이 PC 의 Vercel CLI 는 다른 계정(tjgnl0113)으로 로그인돼 있어 프로젝트가 안 보인다.
> **배포는 `git push` 로 한다.**

## 접수 경로

```
브라우저 폼 → POST /api/consult (Vercel 함수) → Apps Script → 구글시트 + 텔레그램
```

`api/consult.js` 가 하는 일

- POST 만 허용, `Origin` 이 hyeonam.com 이 아니면 403
- 성함 필수 · 연락처는 휴대폰 정규식(`01[016789]…`) 통과해야 함
- 같은 IP 에서 거절 5회(스캐너 신호) 또는 정상 접수 10건 초과 시 429 — 둘을 따로 센다
- 폼 표시 후 1.5초 안에 제출되면 봇으로 보고 저장하지 않음(성공처럼 응답)
- `= + - @` 로 시작하는 값 앞에 `'` 를 붙여 **구글시트 수식 실행을 차단**
- 제어문자·줄바꿈 제거(텔레그램 메시지 형식 위조 차단)
- 셀렉트 값이 목록에 없어도 **버리지 않고** 세정해서 통과시킨다(리드 유실 방지)
- Apps Script 가 실패하면 502 를 돌려주고, 화면에 오류를 띄운다(조용히 성공시키지 않는다)

## 왜 이렇게 바꿨나 (2026-09-30 사고)

`js/main.js` 에 Apps Script 웹앱 URL 이 평문으로 박혀 있었고, 브라우저가 거기로 직접
POST 했다. 누구나 소스를 열면 그 주소를 읽을 수 있어서, 폼을 거치지 않고 가짜 접수를
꽂아 넣을 수 있었다.

2026-09-30 13:18~13:24 에 실제로 12건이 들어왔다 (`test_security_audit`, `id_enum_test`,
`formula_test`/`INJECTION_TEST`, `ratetest1`~`5`). 연속 5건이 전부 통과해 레이트리밋이
없다는 것까지 확인당했다. 한글이 깨져 들어온 것은 CLI 로 생바이트를 보냈기 때문이다.

이제 수집 주소는 서버 환경변수에만 있고, 브라우저는 `/api/consult` 만 안다.

## 환경변수 (Vercel → Settings → Environment Variables)

| 이름 | 값 | 필수 |
|---|---|---|
| `SHEET_ENDPOINT` | Apps Script 웹앱 URL | 권장 |
| `SHEET_KEY` | Apps Script 와 나눠 갖는 공유 시크릿(아무 긴 문자열) | 권장 |

**둘 다 없어도 접수는 동작한다.** `api/consult.js` 의 `FALLBACK_ENDPOINT` 로 폴백하기
때문이다. 환경변수 설정 전에 배포해도 리드가 끊기지 않게 하려고 일부러 그렇게 두었다.

## 남은 마무리 (Apps Script 쪽 — 브라우저에서 직접)

옛 URL 은 여전히 살아 있다. 아래를 해야 완전히 닫힌다.

1. 구글시트 「현암 db」 → 확장 프로그램 → Apps Script
2. `doPost` **첫 줄**에 시크릿 대조를 넣는다

   ```js
   function doPost(e) {
     if (e.parameter.k !== '여기에_SHEET_KEY와_같은_값') {
       return ContentService.createTextOutput('denied');
     }
     // ... 기존 코드
   }
   ```

3. 배포 → **새 배포** 로 올리고 새 URL 을 받는다
4. 기존 배포는 **보관 처리**한다 → 옛 URL 이 죽는다
5. 새 URL 을 Vercel `SHEET_ENDPOINT` 에, 같은 시크릿을 `SHEET_KEY` 에 넣고 재배포

## 주의

- `js/main.js` 에 수집 주소·토큰을 다시 적지 말 것. 브라우저로 나가는 파일이다.
- 폼에 허니팟(숨은 입력칸)을 넣지 말 것. 크롬·엣지 자동완성이 채워서 실고객을 봇으로
  오판한 전례가 있다(2026-09-22 현암손사). 경과시간 방식을 쓴다.
- 레이트리밋은 함수 인스턴스 메모리 기준이라 완벽하지 않다. 거절과 정상 접수를 따로 세는
  이유는 국내 이동통신사 CGNAT 때문이다 — 한 공인 IP 를 수많은 고객이 공유하므로,
  한 통에 몰아 세면 스캐너 하나가 실고객까지 막는다. 한 곳에서 몰아치는 것은
  잡지만, 분산 공격까지 막으려면 Upstash 같은 외부 저장소가 필요하다.

## 테스트

```bash
npm test          # node test/consult.test.mjs
```

`/api/consult` 를 24가지로 검증한다(정상 접수 · 오늘 들어온 공격 재연 · 수식 인젝션 ·
레이트리밋 · Apps Script 장애). **실제 Apps Script 로는 한 건도 보내지 않는다** —
`fetch` 를 가로채서 나갈 내용만 확인하므로 시트·텔레그램이 더러워지지 않는다.
