# AEO 검증 스크립트

세션 임시폴더는 ~7일 뒤 사라지므로 여기에 둔다.

- `audit.mjs` — HTML 파일의 AEO 신호 전수 출력(스키마·canonical·OG·질문형 제목·본문량·alt)
- `verify.mjs` — 7개 페이지의 JSON-LD 파싱·@id 참조 무결성·필수 필드 누락 검사

```bash
node tools/aeo/verify.mjs    # 배포 전 필수
```

FAQPage 를 손댈 때는 **화면에 보이는 문답과 글자 단위로 대조**해 통과한 것만 내보낼 것.
보이지 않는 FAQ 마크업은 구글 수동조치 대상이다.
