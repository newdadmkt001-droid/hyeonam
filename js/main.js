/**
 * HYEONAM LAW — main.js
 * 각 기능을 독립 모듈(init 함수)로 분리해 유지보수가 쉽도록 구성했습니다.
 * 외부 라이브러리 의존성 없음 (IntersectionObserver 기반 자체 리빌 시스템)
 */
'use strict';

const $  = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* =========================================================
   상담 접수 → 구글 시트 연동 + 유입경로 수집
   ========================================================= */
// Google Apps Script 웹앱 URL (배포 후 아래에 붙여넣기)
const SHEET_ENDPOINT = 'https://script.google.com/macros/s/AKfycbzAHRYh8v5zY3_oDVPVPkOY-p4ihum0z57jl9gcVcH0shl5wb_BlB5QWcQ-yQcGhmj1zg/exec';

// 유입경로 판별 (UTM 우선, 없으면 referrer 도메인)
function trafficSource() {
  try {
    const p = new URLSearchParams(location.search);
    const utm = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term']
      .map((k) => p.get(k)).filter(Boolean).join(' / ');
    if (utm) return utm;
    const ref = document.referrer;
    if (!ref) return '직접 유입';
    const h = new URL(ref).hostname.replace(/^www\./, '');
    if (h.includes('google')) return '구글';
    if (h.includes('naver')) return '네이버';
    if (h.includes('daum') || h.includes('kakao')) return '다음/카카오';
    if (h.includes('instagram')) return '인스타그램';
    if (h.includes('facebook') || h.includes('fb.')) return '페이스북';
    if (h.includes('youtube')) return '유튜브';
    if (h.includes('bing')) return '빙';
    if (h.includes('hyeonam.com')) return '사이트 내부';
    return h;
  } catch (e) {
    return '알 수 없음';
  }
}

// 최초 진입 시점의 유입경로를 세션에 저장(이후 페이지 이동해도 유지)
function captureSource() {
  try {
    if (!sessionStorage.getItem('hy_src')) sessionStorage.setItem('hy_src', trafficSource());
  } catch (e) {}
}
function storedSource() {
  try { return sessionStorage.getItem('hy_src') || trafficSource(); } catch (e) { return trafficSource(); }
}

// 구글 시트로 전송 (미설정 시 스킵 → 데모 동작)
async function sendToSheet(data) {
  if (!SHEET_ENDPOINT) return;
  try {
    await fetch(SHEET_ENDPOINT, { method: 'POST', mode: 'no-cors', body: new URLSearchParams(data) });
  } catch (e) { /* no-cors: 응답 못 읽어도 접수는 처리됨 */ }
}

/* =========================================================
   1. Reveal — 스크롤 진입 시 Fade Up
   ========================================================= */
function initReveal() {
  const items = $$('.reveal');
  if (!items.length) return;

  if (prefersReduced || !('IntersectionObserver' in window)) {
    items.forEach((el) => el.classList.add('is-in'));
    return;
  }

  const io = new IntersectionObserver(
    (entries, obs) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const el = entry.target;
        el.style.setProperty('--rd', `${el.dataset.delay || 0}ms`);
        el.classList.add('is-in');
        obs.unobserve(el);
      });
    },
    { threshold: 0.14, rootMargin: '0px 0px -8% 0px' }
  );

  items.forEach((el) => io.observe(el));
}

/* =========================================================
   2. Hero — 문구 슬라이더 (자동 전환)
   컨트롤 UI는 없으므로, 읽는 중 넘어가지 않도록 hover/focus 시 멈춤.
   ========================================================= */
const HERO_DURATION = 6000;

function initHeroSlider() {
  const slider = $('#hero-slider');
  if (!slider) return;

  const slides = $$('.hero__slide', slider);
  if (slides.length < 2) return;

  // 모션 최소화 설정이면 첫 문구만 고정 노출
  if (prefersReduced) return;

  let index = 0;
  let timer = null;

  const render = () => {
    slides.forEach((el, i) => {
      const active = i === index;
      el.classList.toggle('is-active', active);
      if (active) el.removeAttribute('aria-hidden');
      else el.setAttribute('aria-hidden', 'true');
    });
  };

  const stop = () => clearTimeout(timer);
  const play = () => {
    stop();
    timer = setTimeout(() => {
      index = (index + 1) % slides.length;
      render();
      play();
    }, HERO_DURATION);
  };

  // 마우스를 올리거나 포커스가 들어오면 멈춤 (읽는 동안 안 넘어가게)
  const frame = $('.hero__frame') || slider;
  frame.addEventListener('mouseenter', stop);
  frame.addEventListener('mouseleave', play);
  frame.addEventListener('focusin', stop);
  frame.addEventListener('focusout', play);

  // 백그라운드 탭에서 타이머 낭비 방지
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop();
    else play();
  });

  render();
  play();
}

/* =========================================================
   3. Header — 스크롤 상태 / 모바일 메뉴 / 하단 CTA / 맨위로
   ========================================================= */
function initHeader() {
  const header  = $('#header');
  const toggle  = $('.nav-toggle');
  const mNav    = $('#mobile-nav');
  const fab     = $('#fab');
  const toTop   = $('#to-top');
  const hero    = $('#hero');

  /* 스크롤 상태 */
  let ticking = false;
  const onScroll = () => {
    const y = window.scrollY;
    header?.classList.toggle('is-stuck', y > 20);
    toTop?.classList.toggle('is-show', y > 600);

    // FAB: 처음부터 노출, 상담폼 안에서만 숨김
    const contact = $('#contact');
    const inContact = contact
      ? contact.getBoundingClientRect().top < window.innerHeight * 0.6 &&
        contact.getBoundingClientRect().bottom > window.innerHeight * 0.4
      : false;
    fab?.classList.toggle('is-show', !inContact);

    ticking = false;
  };
  window.addEventListener(
    'scroll',
    () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(onScroll);
    },
    { passive: true }
  );
  onScroll();

  /* 모바일 메뉴 */
  const closeNav = () => {
    if (!mNav || mNav.hidden) return;
    mNav.classList.remove('is-open');
    toggle?.setAttribute('aria-expanded', 'false');
    toggle?.setAttribute('aria-label', '메뉴 열기');
    document.body.classList.remove('is-locked');
    setTimeout(() => { mNav.hidden = true; }, 400);
  };
  const openNav = () => {
    if (!mNav) return;
    mNav.hidden = false;
    requestAnimationFrame(() => mNav.classList.add('is-open'));
    toggle?.setAttribute('aria-expanded', 'true');
    toggle?.setAttribute('aria-label', '메뉴 닫기');
    document.body.classList.add('is-locked');
  };

  toggle?.addEventListener('click', () => {
    const open = toggle.getAttribute('aria-expanded') === 'true';
    open ? closeNav() : openNav();
  });
  $$('#mobile-nav a').forEach((a) => a.addEventListener('click', closeNav));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeNav(); });
  window.addEventListener('resize', () => { if (window.innerWidth > 960) closeNav(); });

  /* 맨 위로 — 브라우저의 smooth 구현에 의존하지 않고 직접 애니메이션.
     (html에 scroll-behavior:smooth 가 걸려 있어 매 프레임 auto 로 명시해야 함) */
  const scrollToTop = () => {
    const start = window.scrollY;
    if (start <= 0) return;
    if (prefersReduced) {
      window.scrollTo({ top: 0, behavior: 'auto' });
      return;
    }
    const dur = Math.min(900, Math.max(350, start * 0.35));
    const t0 = performance.now();
    const tick = (now) => {
      const p = Math.min((now - t0) / dur, 1);
      const eased = 1 - Math.pow(1 - p, 3); // easeOutCubic
      window.scrollTo({ top: Math.round(start * (1 - eased)), behavior: 'auto' });
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };
  toTop?.addEventListener('click', scrollToTop);
  $('[data-rail="top"]')?.addEventListener('click', scrollToTop);
}

/* =========================================================
   4. Count Up — About 통계 숫자 카운팅
   ========================================================= */
function initCounters() {
  const counters = $$('.count');
  if (!counters.length) return;

  const run = (el) => {
    const target = Number(el.dataset.count) || 0;
    const suffix = el.dataset.suffix || '';
    if (prefersReduced) {
      el.textContent = target.toLocaleString('ko-KR') + suffix;
      return;
    }
    const dur = 1600;
    const start = performance.now();
    const tick = (now) => {
      const p = Math.min((now - start) / dur, 1);
      const eased = 1 - Math.pow(1 - p, 3); // easeOutCubic
      el.textContent = Math.round(target * eased).toLocaleString('ko-KR') + suffix;
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };

  if (!('IntersectionObserver' in window)) {
    counters.forEach(run);
    return;
  }
  const io = new IntersectionObserver(
    (entries, obs) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        run(e.target);
        obs.unobserve(e.target);
      });
    },
    { threshold: 0.6 }
  );
  counters.forEach((el) => io.observe(el));
}

/* =========================================================
   5. LIVE 상담사례 — 데이터 렌더 + 주기적 갱신
   실제 운영 시 아래 SEED 배열을 API 응답으로 교체하면 됩니다.
   ========================================================= */
const LIVE_SEED = [
  { h: 5,  region: '경기', age: '40대', sex: '여성', job: '주부',     type: '배우자 모르게' },
  { h: 6,  region: '인천', age: '30대', sex: '남성', job: '프리랜서', type: '주택경매없이' },
  { h: 7,  region: '부산', age: '50대', sex: '남성', job: '자영업자', type: '주택경매없이' },
  { h: 9,  region: '대구', age: '40대', sex: '여성', job: '회사원',   type: '최근대출 다수' },
  { h: 11, region: '서울', age: '30대', sex: '남성', job: '회사원',   type: '코인 손실' },
  { h: 13, region: '광주', age: '20대', sex: '여성', job: '사회초년생', type: '청년회생' },
  { h: 15, region: '울산', age: '50대', sex: '남성', job: '자영업자', type: '사업 실패' },
  { h: 18, region: '경기', age: '40대', sex: '남성', job: '회사원',   type: '급여압류 직전' },
  { h: 21, region: '대전', age: '30대', sex: '여성', job: '프리랜서', type: '카드론 다수' },
  { h: 23, region: '서울', age: '60대', sex: '남성', job: '무직',     type: '개인파산 검토' },
];

function initLiveFeed() {
  const list = $('#live-feed');
  const viewport = $('#live-viewport');
  if (!list || !viewport) return;

  const ROWS = 3;          // 노출할 줄 수
  const INTERVAL = 2800;   // 한 줄씩 올라가는 주기(ms)
  const SLIDE = 600;       // 올라가는 애니메이션 길이(ms)

  const itemHTML = (d) => `
    <li class="feed__item">
      <span class="feed__badge">상담신청</span>
      <p class="feed__text">
        <strong>${d.region} · ${d.age} ${d.sex}</strong> ${d.job}님의
        <em>‘${d.type}’</em> 상담 신청입니다.
      </p>
      <time class="feed__time">${d.h}시간 전</time>
    </li>`;

  list.innerHTML = LIVE_SEED.map(itemHTML).join('');

  // 앞 3개 항목의 실제 높이를 재서 뷰포트 높이 확정 (줄바꿈되면 항목마다 높이가 다름)
  const sizeViewport = () => {
    const items = $$('.feed__item', list).slice(0, ROWS);
    if (!items.length) return;
    const h = items.reduce((sum, el) => sum + el.getBoundingClientRect().height, 0);
    viewport.style.setProperty('--feed-h', `${Math.round(h)}px`);
  };
  sizeViewport();
  window.addEventListener('resize', sizeViewport);

  if (prefersReduced) return;   // 모션 최소화 시 티커 없이 직접 스크롤

  // 한 줄씩 위로 올린 뒤, 맨 위 항목을 맨 뒤로 보내 무한 순환
  let timer = null;
  let sliding = false;

  // transitionend 는 요소가 숨겨지면 발화하지 않아 티커가 멈춰버릴 수 있으므로
  // 애니메이션 길이만큼의 타이머로 마무리한다.
  const step = () => {
    const first = list.firstElementChild;
    if (!first || sliding) return;
    sliding = true;

    const h = first.getBoundingClientRect().height;
    list.style.transition = `transform ${SLIDE}ms cubic-bezier(.16, 1, .3, 1)`;
    list.style.transform = `translateY(-${h}px)`;

    setTimeout(() => {
      list.style.transition = 'none';
      list.style.transform = 'none';
      list.appendChild(first);          // 맨 위 항목을 맨 뒤로 → 무한 순환
      void list.offsetHeight;           // reflow — 다음 트랜지션이 즉시 반영되도록
      sliding = false;
    }, SLIDE + 40);
  };

  const play = () => { clearInterval(timer); timer = setInterval(step, INTERVAL); };
  const stop = () => clearInterval(timer);

  // 읽는 동안 멈춤
  viewport.addEventListener('mouseenter', stop);
  viewport.addEventListener('mouseleave', play);
  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : play()));

  play();
}

/* =========================================================
   6. FAQ — 아코디언 (한 번에 하나만 열림)
   ========================================================= */
function initFaq() {
  const items = $$('.faq-item');
  items.forEach((item) => {
    item.addEventListener('toggle', () => {
      if (!item.open) return;
      items.forEach((other) => { if (other !== item) other.open = false; });
    });
  });
}

/* =========================================================
   공통 — 전화번호 자동 하이픈 / 휴대폰 형식 검사
   ========================================================= */
function bindPhoneHyphen(input) {
  input?.addEventListener('input', (e) => {
    const v = e.target.value.replace(/\D/g, '').slice(0, 11);
    let out = v;
    if (v.length > 3 && v.length <= 7) out = `${v.slice(0, 3)}-${v.slice(3)}`;
    else if (v.length > 7) out = `${v.slice(0, 3)}-${v.slice(3, 7)}-${v.slice(7)}`;
    e.target.value = out;
  });
}
const isMobileNumber = (val) => /^01[016789]\d{7,8}$/.test(String(val).replace(/\D/g, ''));

/* =========================================================
   7. 히어로 빠른상담 바
   ========================================================= */
function initQuickBar() {
  const form = $('#quick-form');
  if (!form) return;

  const result = $('#quick-result');
  const phone = $('#q-phone');
  bindPhoneHyphen(phone);

  const mark = (el, bad) => el.closest('.quickbar__field')?.classList.toggle('is-error', bad);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const topic = $('#q-topic');
    const name = $('#q-name');

    const checks = [
      [topic, !topic.value],
      [name, !name.value.trim()],
      [phone, !isMobileNumber(phone.value)],
    ];
    checks.forEach(([el, isBad]) => mark(el, isBad));

    const first = checks.find(([, isBad]) => isBad);
    if (first) {
      first[0].focus();
      if (result) result.textContent = '상담내용·성함·연락처를 확인해주세요.';
      return;
    }

    const data = Object.fromEntries(new FormData(form).entries());
    const btn = $('.quickbar__submit', form);
    btn.disabled = true;
    btn.style.opacity = '.6';
    if (result) result.textContent = '접수 중입니다...';

    try {
      /* TODO: 실제 접수 엔드포인트 연동 (상담폼과 동일한 곳으로) */
      console.log('[현암] 빠른상담 데이터', data);
      await new Promise((r) => setTimeout(r, 600));
      if (result) result.textContent = '접수되었습니다. 담당 변호사가 곧 연락드립니다.';
      form.reset();
    } catch (err) {
      console.error(err);
      if (result) result.textContent = '오류가 발생했습니다. 대표번호로 연락 부탁드립니다.';
    } finally {
      btn.disabled = false;
      btn.style.opacity = '';
    }
  });
}

/* =========================================================
   8. Contact Form — 검증 + 전화번호 자동 하이픈
   실제 전송은 handleSubmit 내부의 TODO 지점에 연동하세요.
   ========================================================= */
function initForm() {
  const form = $('#consult-form');
  if (!form) return;

  const result = $('#form-result');
  const phone = $('#f-phone');

  bindPhoneHyphen(phone);

  const setError = (field, msg) => {
    const wrap = field.closest('.field');
    const err = $(`[data-err-for="${field.id}"]`, wrap);
    wrap?.classList.toggle('is-error', Boolean(msg));
    if (err) err.textContent = msg || '';
  };

  const validate = () => {
    let ok = true;
    const name = $('#f-name');
    const agree = $('#f-agree');

    if (!name.value.trim()) { setError(name, '이름을 입력해주세요.'); ok = false; }
    else setError(name, '');

    if (!isMobileNumber(phone.value)) {
      setError(phone, '올바른 휴대폰 번호를 입력해주세요.');
      ok = false;
    } else setError(phone, '');

    if (!agree.checked) { setError(agree, '개인정보 수집·이용 동의가 필요합니다.'); ok = false; }
    else setError(agree, '');

    return ok;
  };

  // 입력 중 에러 해제
  ['#f-name', '#f-phone', '#f-agree'].forEach((sel) => {
    const el = $(sel);
    el?.addEventListener('input', () => setError(el, ''));
    el?.addEventListener('change', () => setError(el, ''));
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (result) result.textContent = '';

    if (!validate()) {
      $('.field.is-error input, .field.is-error select')?.focus();
      return;
    }

    const btn = $('button[type="submit"]', form);
    const data = Object.fromEntries(new FormData(form).entries());

    btn.disabled = true;
    btn.style.opacity = '.6';
    if (result) result.textContent = '접수 중입니다...';

    try {
      /* TODO: 실제 접수 엔드포인트 연동
         await fetch('/api/consult', {
           method: 'POST',
           headers: { 'Content-Type': 'application/json' },
           body: JSON.stringify(data),
         });
      */
      const payload = { ...data, source: storedSource(), page: '메인 상담폼' };
      console.log('[현암] 상담신청', payload);
      await sendToSheet(payload);
      if (!SHEET_ENDPOINT) await new Promise((r) => setTimeout(r, 500)); // 미설정 시 데모 지연

      if (result) result.textContent = '상담 신청이 접수되었습니다. 담당 변호사가 곧 연락드리겠습니다.';
      form.reset();
    } catch (err) {
      console.error(err);
      if (result) {
        result.style.color = '#E2796A';
        result.textContent = '접수 중 오류가 발생했습니다. 대표번호로 연락 부탁드립니다.';
      }
    } finally {
      btn.disabled = false;
      btn.style.opacity = '';
    }
  });
}

/* =========================================================
   8.5 빠른 상담신청 팝업(모달)
   ========================================================= */
function initModal() {
  const modal = $('#consult-modal');
  if (!modal) return;

  const form = $('#consult-modal-form');
  const result = $('#m-result');
  const phone = $('#m-phone');
  bindPhoneHyphen(phone);

  let lastFocus = null;

  const open = (e) => {
    if (e) e.preventDefault();
    lastFocus = document.activeElement;
    modal.hidden = false;
    document.body.classList.add('cmodal-open');
    setTimeout(() => $('#m-name')?.focus(), 60);
  };
  const close = () => {
    modal.hidden = true;
    document.body.classList.remove('cmodal-open');
    if (result) result.textContent = '';
    lastFocus?.focus?.();
  };

  $$('[data-open-consult]').forEach((el) => el.addEventListener('click', open));
  $$('[data-cmodal-close]', modal).forEach((el) => el.addEventListener('click', close));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modal.hidden) close();
  });

  const setError = (field, msg) => {
    const wrap = field.closest('.field');
    const err = $(`[data-err-for="${field.id}"]`, wrap);
    wrap?.classList.toggle('is-error', Boolean(msg));
    if (err) err.textContent = msg || '';
  };
  ['#m-name', '#m-phone', '#m-agree'].forEach((sel) => {
    const el = $(sel);
    el?.addEventListener('input', () => setError(el, ''));
    el?.addEventListener('change', () => setError(el, ''));
  });

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (result) { result.style.color = ''; result.textContent = ''; }

    const name = $('#m-name');
    const agree = $('#m-agree');
    let ok = true;
    if (!name.value.trim()) { setError(name, '이름을 입력해주세요.'); ok = false; } else setError(name, '');
    if (!isMobileNumber(phone.value)) { setError(phone, '올바른 휴대폰 번호를 입력해주세요.'); ok = false; } else setError(phone, '');
    if (!agree.checked) { setError(agree, '개인정보 수집·이용 동의가 필요합니다.'); ok = false; } else setError(agree, '');
    if (!ok) { $('.field.is-error input, .field.is-error select', form)?.focus(); return; }

    const btn = $('button[type="submit"]', form);
    btn.disabled = true; btn.style.opacity = '.6';
    if (result) result.textContent = '접수 중입니다...';
    try {
      const payload = { ...Object.fromEntries(new FormData(form).entries()), source: storedSource(), page: '빠른 상담 팝업' };
      console.log('[현암] 팝업 상담신청', payload);
      await sendToSheet(payload);
      if (!SHEET_ENDPOINT) await new Promise((r) => setTimeout(r, 500));
      if (result) result.textContent = '상담 신청이 접수되었습니다. 담당 변호사가 곧 연락드리겠습니다.';
      form.reset();
    } catch (err) {
      if (result) { result.style.color = '#E2796A'; result.textContent = '접수 중 오류가 발생했습니다. 대표번호로 연락 부탁드립니다.'; }
    } finally {
      btn.disabled = false; btn.style.opacity = '';
    }
  });
}

/* =========================================================
   8.6 히어로 배경 영상 — 모바일 자동재생 보강
   ========================================================= */
function initHeroVideo() {
  const v = $('.hero__img');
  if (!v || v.tagName !== 'VIDEO') return;

  // iOS/모바일 자동재생 조건 강제
  v.muted = true;
  v.defaultMuted = true;
  v.setAttribute('muted', '');
  v.playsInline = true;

  const tryPlay = () => {
    const p = v.play();
    if (p && typeof p.catch === 'function') p.catch(() => {});
  };

  tryPlay();
  // 로드 완료 시점에도 재시도
  v.addEventListener('loadeddata', tryPlay, { once: true });
  v.addEventListener('canplay', tryPlay, { once: true });

  // 자동재생이 차단된 경우: 첫 사용자 상호작용에 재생
  const onFirst = () => {
    tryPlay();
    document.removeEventListener('touchstart', onFirst);
    document.removeEventListener('click', onFirst);
  };
  document.addEventListener('touchstart', onFirst, { passive: true });
  document.addEventListener('click', onFirst);
}

/* =========================================================
   8.7 모바일 스크롤 중 오클릭 방지 (신청현황·성공사례)
   ========================================================= */
function initScrollGuard() {
  let sx = 0, sy = 0, moved = false;
  const TH = 10; // 이동 임계값(px) — 이보다 크게 움직이면 스크롤로 간주

  document.addEventListener('touchstart', (e) => {
    const t = e.touches[0];
    sx = t.clientX; sy = t.clientY; moved = false;
  }, { passive: true });

  document.addEventListener('touchmove', (e) => {
    const t = e.touches[0];
    if (Math.abs(t.clientX - sx) > TH || Math.abs(t.clientY - sy) > TH) moved = true;
  }, { passive: true });

  // 스크롤 제스처(손가락 이동)였다면 클릭을 취소 — 실제 탭(이동 없음)만 동작
  document.addEventListener('click', (e) => {
    if (moved) {
      e.preventDefault();
      e.stopPropagation();
    }
  }, true);
}

/* =========================================================
   9. Misc — 연도 자동 갱신
   ========================================================= */
function initMisc() {
  const y = $('#year');
  if (y) y.textContent = String(new Date().getFullYear());
}

/* =========================================================
   Boot
   ========================================================= */
function boot() {
  captureSource();
  initHeroSlider();
  initHeader();
  initReveal();
  initCounters();
  initLiveFeed();
  initFaq();
  initQuickBar();
  initForm();
  initModal();
  initHeroVideo();
  initScrollGuard();
  initMisc();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
