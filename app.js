// 살까말까 — 화면 로직 (프로필·기록은 브라우저 localStorage에만 저장)
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const CARDS = ['얇음·비침', '냄새', '소음·진동', '털 빠짐·이염', '사이즈·핏', '사진과 색상 차이', '성능 부족', '반품비 부담', '숨은 추가 비용', '조립·설치 어려움', '금방 고장·내구성', '배터리'];
const BATCH = 40;
const DAY = 86400000;

const store = {
  get(k, d) { try { const v = localStorage.getItem('salkka.' + k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem('salkka.' + k, JSON.stringify(v)); } catch { } },
};

const S = {
  demo: null, demoCache: {},
  userProfiles: store.get('userProfiles', []),
  activeId: store.get('active', 'demo-a'),
  purchases: store.get('purchases', []),
  learn: store.get('learn', []),
  analyses: store.get('analyses', {}),
  product: null, result: null, resultProfileId: null,
  usage: { calls: 0, input: 0, output: 0, cache_read: 0, cache_write: 0 },
  shotReviews: [], returnImgs: [], pickedCards: new Set(),
};

// ---------- 공통 ----------
function toast(msg, ms = 2200) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => t.hidden = true, ms); }
function progress(on, pct = 0, text = '') { $('#progress').hidden = !on; $('#progBar').style.width = pct + '%'; if (text) $('#progText').textContent = text; }
function go(view) {
  $$('.view').forEach(v => v.classList.toggle('on', v.id === 'v-' + view));
  $$('#steps button').forEach(b => b.classList.toggle('on', b.dataset.go === view));
  window.scrollTo({ top: 0, behavior: 'smooth' });
  if (view === 'history') renderHistory();
}
function addUsage(u) {
  if (!u) return; S.usage.calls++; for (const k of ['input', 'output', 'cache_read', 'cache_write']) S.usage[k] += u[k] || 0;
  const x = S.usage;
  $('#usage').textContent = `이번 사용: AI 호출 ${x.calls}회 · 입력 ${x.input.toLocaleString()} 토큰 · 캐시에서 읽음 ${x.cache_read.toLocaleString()} · 캐시 저장 ${x.cache_write.toLocaleString()} · 출력 ${x.output.toLocaleString()}`;
}
async function api(path, body) {
  const r = await fetch('/api/' + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({ error: '서버 응답을 읽지 못했습니다' }));
  if (!r.ok) throw new Error(j.error || '오류');
  addUsage(j.usage);
  return j;
}
function hash(obj) { const s = JSON.stringify(obj); let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }
function profileKey(p) { return hash(p.factors.map(f => [f.id, f.name, f.weight, f.desc, f.keywords])); }
function allProfiles() { return [...(S.demo?.profiles || []), ...S.userProfiles]; }
function getProfile(id) { return allProfiles().find(p => p.id === id); }
function saveUser() { store.set('userProfiles', S.userProfiles); }

function compressImage(file, max = 1400) {
  return new Promise((ok, bad) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src); ok(c.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = bad; img.src = URL.createObjectURL(file);
  });
}

// ---------- 1. 후회 기준 ----------
function renderPick() {
  const box = $('#profilePick');
  const items = allProfiles().map(p => `<button data-id="${esc(p.id)}" class="${p.id === S.activeId ? 'on' : ''}">
      <b>${esc(p.name)}${p.demo ? '<span class="badge">데모</span>' : ''}</b><span>${esc(p.summary || '')}</span></button>`);
  items.push(`<button data-id="__new"><b>＋ 내 기준 만들기</b><span>후회했던 이유를 고르고 경험을 적으면 AI가 정리해요</span></button>`);
  box.innerHTML = items.join('');
  $$('button', box).forEach(b => b.onclick = () => {
    if (b.dataset.id === '__new') { $('#builder').hidden = false; $('#profileCard').hidden = true; $('#builder').scrollIntoView({ behavior: 'smooth' }); return; }
    S.activeId = b.dataset.id; store.set('active', S.activeId); $('#builder').hidden = true; renderPick(); renderProfileCard();
  });
}

function renderProfileCard() {
  const p = getProfile(S.activeId); const el = $('#profileCard');
  if (!p) { el.hidden = true; return; }
  el.hidden = false;
  el.innerHTML = `<h2>${esc(p.name)}${p.demo ? '<span class="badge">데모 프로필</span>' : ''}</h2>
    <p class="hint">${esc(p.summary || '')}</p>
    ${p.stories?.length ? `<p class="mini">후회 경험(데모용 예시, 실제 후기 아님)</p><ul class="tips">${p.stories.map(s => `<li>${esc(s)}</li>`).join('')}</ul>` : ''}
    <div style="margin-top:12px">${p.factors.map(f => `<div class="factor">
      <div class="nm"><b>${esc(f.name)}</b><small>${esc(f.desc)}</small><div class="kw">${(f.keywords || []).slice(0, 8).map(k => `<span>${esc(k)}</span>`).join('')}</div></div>
      <div class="w">${p.demo ? '' : `<button data-f="${f.id}" data-d="-1" aria-label="중요도 낮추기">−</button>`}
        <span class="dots" title="중요도">${'●'.repeat(f.weight)}${'○'.repeat(3 - f.weight)}</span>
        ${p.demo ? '' : `<button data-f="${f.id}" data-d="1" aria-label="중요도 높이기">＋</button>`}</div></div>`).join('')}</div>
    ${p.demo ? '<p class="mini">데모 프로필은 고칠 수 없어요. 구매 후 피드백을 주면 내 프로필로 복사돼 학습합니다.</p>' : ''}
    <button class="primary" id="toReviews">이 기준으로 리뷰 보러 가기</button>
    ${p.demo ? '' : '<button class="ghost" id="delProfile">이 프로필 삭제</button>'}`;
  $$('.w button', el).forEach(b => b.onclick = () => {
    const f = p.factors.find(x => x.id === b.dataset.f); f.weight = Math.max(1, Math.min(3, f.weight + Number(b.dataset.d)));
    saveUser(); renderProfileCard();
  });
  $('#toReviews').onclick = () => go('reviews');
  const del = $('#delProfile'); if (del) del.onclick = () => {
    if (!confirm('이 프로필을 삭제할까요?')) return;
    S.userProfiles = S.userProfiles.filter(x => x.id !== p.id); saveUser(); S.activeId = 'demo-a'; store.set('active', S.activeId); renderPick(); renderProfileCard();
  };
}

function renderBuilder() {
  $('#cards').innerHTML = CARDS.map(c => `<button class="chip" data-c="${esc(c)}">${esc(c)}</button>`).join('');
  $$('#cards .chip').forEach(b => b.onclick = () => { b.classList.toggle('on'); b.classList.contains('on') ? S.pickedCards.add(b.dataset.c) : S.pickedCards.delete(b.dataset.c); });
  $('#returnImgs').onchange = async e => {
    for (const f of [...e.target.files].slice(0, 3)) S.returnImgs.push(await compressImage(f));
    S.returnImgs = S.returnImgs.slice(-3);
    $('#returnThumbs').innerHTML = S.returnImgs.map(s => `<img src="${s}" alt="반품 내역">`).join('');
  };
  $('#makeProfile').onclick = async () => {
    const stories = $('#stories').value.split('\n').map(s => s.trim()).filter(Boolean);
    if (!S.pickedCards.size && !stories.length && !S.returnImgs.length) { toast('후회 이유를 하나 이상 골라 주세요'); return; }
    const btn = $('#makeProfile'); btn.disabled = true; progress(true, 40, 'AI가 내 후회 기준을 정리하는 중…');
    try {
      const { profile } = await api('profile', { cards: [...S.pickedCards], stories, images: S.returnImgs });
      const p = { id: 'u-' + Date.now().toString(36), name: '내 후회 기준', summary: profile.summary, stories, factors: profile.factors, created: Date.now() };
      S.userProfiles.push(p); saveUser(); S.activeId = p.id; store.set('active', p.id);
      $('#builder').hidden = true; renderPick(); renderProfileCard(); toast('내 기준을 만들었어요');
      $('#profileCard').scrollIntoView({ behavior: 'smooth' });
    } catch (e) { toast('만들지 못했어요: ' + e.message, 4000); }
    finally { btn.disabled = false; progress(false); }
  };
}

// ---------- 2. 리뷰 넣기 ----------
function renderSources() {
  $$('#srcTabs button').forEach(b => b.onclick = () => {
    $$('#srcTabs button').forEach(x => x.classList.toggle('on', x === b));
    $$('.src').forEach(s => s.classList.toggle('on', s.id === 'src-' + b.dataset.src));
  });
  $('#demoProducts').innerHTML = S.demo.products.map(p => `<button class="prod" data-id="${p.id}">
      <span><b>${esc(p.name)}</b><small>${esc(p.price)} · 리뷰 ${p.count}개 <span class="badge">가상 리뷰</span></small></span>
      <span class="star">★ ${p.avg}</span></button>`).join('');
  $$('#demoProducts .prod').forEach(b => b.onclick = () => {
    const p = S.demo.products.find(x => x.id === b.dataset.id);
    startAnalysis({ key: 'demo:' + p.id, name: p.name, avg: p.avg, reviews: p.reviews, demo: true });
  });
  $('#shotImgs').onchange = async e => {
    const files = [...e.target.files]; if (!files.length) return;
    const imgs = []; for (const f of files) imgs.push(await compressImage(f));
    $('#shotThumbs').insertAdjacentHTML('beforeend', imgs.map(s => `<img src="${s}" alt="캡처">`).join(''));
    for (let i = 0; i < imgs.length; i += 4) {
      progress(true, 30 + (i / imgs.length) * 60, `캡처 ${i + 1}~${Math.min(i + 4, imgs.length)}장에서 리뷰를 읽는 중…`);
      try {
        const out = await api('extract', { images: imgs.slice(i, i + 4) });
        if (out.product && !$('#shotName').value) $('#shotName').value = out.product;
        S.shotReviews.push(...out.reviews);
      } catch (err) { toast('캡처를 읽지 못했어요: ' + err.message, 4000); }
    }
    progress(false); e.target.value = '';
    $('#shotCount').innerHTML = `읽어 온 리뷰 ${S.shotReviews.length}개 <button class="ghost" id="useShot">이 리뷰로 분석하기</button>`;
    $('#useShot').onclick = () => {
      if (!S.shotReviews.length) return;
      const name = $('#shotName').value.trim() || '캡처한 상품';
      startAnalysis({ key: 'shot:' + hash(S.shotReviews), name, reviews: S.shotReviews.map((r, i) => ({ id: 'c' + (i + 1), rating: r.rating, text: r.text })) });
    };
  };
  $('#usePaste').onclick = () => {
    const parts = $('#pasteText').value.split(/\n\s*\n/).map(s => s.trim()).filter(Boolean);
    if (!parts.length) { toast('리뷰를 붙여넣어 주세요'); return; }
    const name = $('#pasteName').value.trim() || '붙여넣은 상품';
    startAnalysis({ key: 'paste:' + hash(parts), name, reviews: parts.map((t, i) => ({ id: 'p' + (i + 1), rating: null, text: t })) });
  };
}

// ---------- 분석 ----------
async function startAnalysis(product, profileId = S.activeId) {
  const p = getProfile(profileId); if (!p) { toast('먼저 후회 기준을 골라 주세요'); go('profile'); return; }
  S.product = product;
  const ck = profileKey(p) + '|' + product.key;
  let res = S.analyses[ck];
  if (!res && product.demo && p.demo && S.demoCache[p.id + '|' + product.key]) res = { ...S.demoCache[p.id + '|' + product.key], mode: 'cached' };
  if (!res) {
    try { res = await runAI(p, product); }
    catch (e) { toast('AI 분석에 실패해 간이 분석(단어 찾기)으로 보여드려요', 4000); res = runKeyword(p, product); }
    res.at = Date.now();
    if (res.mode === 'ai') { S.analyses[ck] = res; trimCache(); store.set('analyses', S.analyses); }
  }
  S.result = res; S.resultProfileId = p.id;
  renderResult(); go('result');
  if (!res.advise && res.mode !== 'keyword') loadAdvise(p, product, res, ck);
}
function trimCache() { const ks = Object.keys(S.analyses); if (ks.length > 12) ks.sort((a, b) => S.analyses[a].at - S.analyses[b].at).slice(0, ks.length - 12).forEach(k => delete S.analyses[k]); }

async function runAI(p, product) {
  const reviews = product.reviews; const batches = [];
  for (let i = 0; i < reviews.length; i += BATCH) batches.push(reviews.slice(i, i + BATCH));
  const matched = {}; let done = 0;
  const step = () => progress(true, 10 + 85 * done / batches.length, `내 기준으로 리뷰 ${reviews.length}개를 읽는 중… (${done}/${batches.length})`);
  step();
  const send = async b => { const out = await api('analyze', { profile: p, reviews: b }); for (const r of out.results) matched[r.id] = r.m; done++; step(); };
  try {
    await send(batches[0]); // 첫 요청으로 캐시를 만든 뒤
    const rest = batches.slice(1); let idx = 0;
    await Promise.all(Array.from({ length: Math.min(3, rest.length) }, async () => { while (idx < rest.length) await send(rest[idx++]); }));
  } finally { progress(false); }
  return summarize(p, product, matched, 'ai');
}

function runKeyword(p, product) {
  const matched = {};
  for (const r of product.reviews) {
    const m = [];
    for (const f of p.factors) {
      const k = (f.keywords || []).find(k => k && r.text.includes(k));
      if (k) m.push({ f: f.id, q: k, s: 1 });
    }
    if (m.length) matched[r.id] = m;
  }
  return summarize(p, product, matched, 'keyword');
}

function summarize(p, product, matched, mode) {
  const total = product.reviews.length; const per = {};
  for (const f of p.factors) per[f.id] = { count: 0, strong: 0, items: [] };
  for (const [id, ms] of Object.entries(matched)) for (const m of ms) {
    const x = per[m.f]; if (!x) continue; x.count++; if (m.s >= 3) x.strong++; x.items.push({ id, q: m.q, s: m.s });
  }
  return { mode, total, per, matched, productKey: product.key, productName: product.name };
}

function levelOf(w, ratio, count) {
  if (count === 0) return 'g';
  if ((w === 3 && ratio >= 0.06) || (w === 2 && ratio >= 0.10)) return 'r';
  if ((w === 3 && ratio >= 0.02) || (w === 2 && ratio >= 0.03) || (w === 1 && ratio >= 0.10)) return 'y';
  return 'g';
}
function judge(p, res) {
  let worst = 'g'; const rank = { g: 0, y: 1, r: 2 };
  const rows = p.factors.map(f => { const x = res.per[f.id] || { count: 0, strong: 0 }; const ratio = res.total ? x.count / res.total : 0; const lv = levelOf(f.weight, ratio, x.count); if (rank[lv] > rank[worst]) worst = lv; return { f, x, ratio, lv }; });
  return { worst, rows };
}

function renderResult() {
  const p = getProfile(S.resultProfileId); const res = S.result; if (!p || !res) return;
  $('#resultEmpty').hidden = true; $('#resultBox').hidden = false;
  const { worst, rows } = judge(p, res);
  const label = { r: ['후회 주의', 'red'], y: ['확인 필요', 'yellow'], g: ['괜찮아 보임', 'green'] }[worst];
  const top = rows.filter(r => r.x.count).sort((a, b) => b.f.weight * b.ratio - a.f.weight * a.ratio)[0];
  const modeNote = res.mode === 'keyword' ? '<div class="banner">AI 연결이 안 돼 <b>간이 분석(단어 찾기)</b> 결과입니다. "소리가 조용해요"처럼 칭찬도 불만으로 셀 수 있어요.</div>'
    : res.mode === 'cached' ? '<p class="mini">미리 분석해 둔 결과입니다 · <button class="more" id="reRun">지금 다시 분석</button></p>' : '';
  $('#verdictCard').className = 'card verdict ' + label[1];
  $('#verdictCard').innerHTML = `${modeNote}<div class="light"><div class="lamp"></div><div><h3>${label[0]}</h3>
    <p>${esc(res.productName)} · 리뷰 ${res.total}개${S.product?.avg ? ` · 평균 ★${S.product.avg}` : ''}</p></div></div>
    <p class="vtext">${top ? `<b>${esc(top.f.name)}</b> 불만이 리뷰 ${top.x.count}개(${(top.ratio * 100).toFixed(1)}%)에서 나왔어요.` : '내 후회 요인에 해당하는 불만을 거의 찾지 못했어요.'}</p>
    <p class="who">기준: <b>${esc(p.name)}</b>${p.demo ? ' (데모)' : ''}</p>`;
  const rr = $('#reRun'); if (rr) rr.onclick = () => { delete S.analyses[profileKey(p) + '|' + res.productKey]; S.demoCache[p.id + '|' + res.productKey] = null; startAnalysis(S.product, p.id); };

  $('#factorBars').innerHTML = rows.map(({ f, x, ratio, lv }) => `<div class="bar-row"><div class="bar-top"><span><b>${esc(f.name)}</b> <span class="dots">${'●'.repeat(f.weight)}${'○'.repeat(3 - f.weight)}</span></span>
      <span>${x.count}/${res.total}개 · ${(ratio * 100).toFixed(1)}%${x.strong ? ` · 강한 불만 ${x.strong}` : ''}</span></div>
      <div class="track"><span class="${lv === 'r' ? 'r' : lv === 'y' ? 'y' : ''}" style="width:${Math.min(100, ratio * 100 * 4)}%"></span></div></div>`).join('');
  $('#ruleNote').textContent = '판정 기준: 중요도 ●●● 요인이 6% 이상(●● 10% 이상)이면 후회 주의, ●●● 2% 이상·●● 3% 이상이면 확인 필요. 막대는 4배 확대해 표시.';

  renderEvidence(p, res, rows.find(r => r.x.count)?.f.id);
  renderAdvise(res.advise);
  $('#otherProfiles').innerHTML = allProfiles().filter(x => x.id !== p.id).map(x => `<button data-id="${esc(x.id)}"><b>${esc(x.name)}${x.demo ? '<span class="badge">데모</span>' : ''}</b><span>이 기준으로 같은 리뷰 보기</span></button>`).join('');
  $$('#otherProfiles button').forEach(b => b.onclick = () => startAnalysis(S.product, b.dataset.id));
  $('#bought').onclick = () => addPurchase(p, res);
}

function renderEvidence(p, res, fid) {
  const box = $('#evidence'); const text = Object.fromEntries((S.product?.reviews || []).map(r => [r.id, r]));
  const tabs = p.factors.filter(f => res.per[f.id]?.count);
  if (!tabs.length) { box.innerHTML = '<p class="hint">해당하는 리뷰가 없어요.</p>'; return; }
  let limit = 5;
  const draw = () => {
    const items = [...res.per[fid].items].sort((a, b) => b.s - a.s);
    box.innerHTML = `<div class="evtabs">${tabs.map(f => `<button data-f="${f.id}" class="${f.id === fid ? 'on' : ''}">${esc(f.name)} ${res.per[f.id].count}</button>`).join('')}</div>` +
      items.slice(0, limit).map(it => { const r = text[it.id]; const body = r ? highlight(r.text, it.q) : `<mark>${esc(it.q)}</mark>`;
        return `<div class="ev"><div class="meta">${r?.rating ? '★'.repeat(r.rating) : ''} ${it.s >= 3 ? '· 강한 불만' : ''}</div><p>${body}</p></div>`; }).join('') +
      (items.length > limit ? `<button class="more" id="evMore">${items.length - limit}개 더 보기</button>` : '');
    $$('.evtabs button', box).forEach(b => b.onclick = () => { fid = b.dataset.f; limit = 5; draw(); });
    const m = $('#evMore'); if (m) m.onclick = () => { limit += 10; draw(); };
  };
  draw();
}
function highlight(t, q) { const i = q ? t.indexOf(q) : -1; if (i < 0) return esc(t) + (q ? ` <mark>${esc(q)}</mark>` : ''); return esc(t.slice(0, i)) + '<mark>' + esc(q) + '</mark>' + esc(t.slice(i + q.length)); }

async function loadAdvise(p, product, res, ck) {
  const { rows } = judge(p, res);
  const findings = rows.map(({ f, x, ratio }) => ({ 요인: f.name, 중요도: f.weight, 불만리뷰: x.count, 전체: res.total, 비율: (ratio * 100).toFixed(1) + '%', 근거: x.items.slice(0, 4).map(i => i.q) }));
  try {
    const out = await api('advise', { product: product.name, findings });
    res.advise = { verdict: out.verdict, questions: out.questions || [], tips: out.tips || [] };
    if (S.analyses[ck]) store.set('analyses', S.analyses);
    if (S.result === res) renderAdvise(res.advise);
  } catch (e) { $('#advise').innerHTML = `<p class="hint">질문을 만들지 못했어요 (${esc(e.message)})</p>`; }
}
function renderAdvise(a) {
  const box = $('#advise');
  if (!a) { box.innerHTML = S.result?.mode === 'keyword' ? '<p class="hint">간이 분석에서는 질문을 만들지 않아요.</p>' : '<p class="hint">AI가 질문을 정리하는 중…</p>'; return; }
  box.innerHTML = `<p class="vtext" style="margin-top:0">${esc(a.verdict)}</p>` +
    a.questions.map(q => `<div class="q"><p>${esc(q)}</p><button data-q="${esc(q)}">복사</button></div>`).join('') +
    (a.tips.length ? `<ul class="tips">${a.tips.map(t => `<li>${esc(t)}</li>`).join('')}</ul>` : '');
  $$('.q button', box).forEach(b => b.onclick = async () => { try { await navigator.clipboard.writeText(b.dataset.q); toast('복사했어요'); } catch { toast('복사하지 못했어요'); } });
}

// ---------- 4. 구매 기록·학습 ----------
function addPurchase(p, res) {
  const { rows } = judge(p, res);
  S.purchases.unshift({ id: Date.now().toString(36), name: res.productName, profileId: p.id, at: Date.now(), due: Date.now() + 7 * DAY,
    flagged: rows.filter(r => r.lv !== 'g').map(r => r.f.name), fb: null });
  store.set('purchases', S.purchases); updateBadge(); toast('7일 뒤에 만족했는지 물어볼게요'); go('history');
}
function updateBadge() { const n = S.purchases.filter(x => !x.fb && x.due <= Date.now()).length; const b = $('#dueBadge'); b.hidden = !n; b.textContent = n; }

function ensureOwnProfile(pid) {
  const p = getProfile(pid); if (!p) return null; if (!p.demo) return p;
  const copy = JSON.parse(JSON.stringify(p)); copy.id = 'u-' + Date.now().toString(36); copy.demo = false; copy.name = `내 기준 (${p.name}에서 시작)`;
  S.userProfiles.push(copy); saveUser(); S.activeId = copy.id; store.set('active', copy.id); return copy;
}

function renderHistory() {
  const box = $('#historyList');
  if (!S.purchases.length) { box.innerHTML = '<p class="hint">결과 화면에서 "이 상품 샀어요"를 누르면 여기에 쌓여요.</p>'; }
  else box.innerHTML = S.purchases.map(x => {
    const due = x.due <= Date.now(); const p = getProfile(x.profileId);
    const head = `<div class="row"><b>${esc(x.name)}</b>${x.fb ? `<span class="badge">${x.fb.ok ? '만족' : '후회'}</span>` : due ? '<span class="due">피드백 차례</span>' : `<span class="mini">D-${Math.ceil((x.due - Date.now()) / DAY)}</span>`}</div>
      <p class="mini">${new Date(x.at).toLocaleDateString('ko-KR')} 구매 · 기준: ${esc(p?.name || '삭제됨')}${x.flagged.length ? ` · 주의했던 점: ${esc(x.flagged.join(', '))}` : ''}</p>`;
    if (x.fb) return `<div class="hist">${head}</div>`;
    return `<div class="hist" data-id="${x.id}">${head}
      <div class="fb"><button data-ok="1">만족해요</button><button data-ok="0">후회해요</button>${due ? '' : '<span class="mini">(시연용: 7일 전이라도 지금 답할 수 있어요)</span>'}</div>
      <div class="why" hidden><p class="mini">무엇 때문에 후회했나요? (여러 개 가능)</p><div class="fb reasons">${(p?.factors || []).map(f => `<button data-f="${f.id}">${esc(f.name)}</button>`).join('')}</div>
      <input class="txt" placeholder="다른 이유가 있으면 적어 주세요 (예: 색이 사진과 달랐어요)" style="margin-top:8px"><button class="ghost save">저장</button></div></div>`;
  }).join('');
  $$('.hist[data-id]', box).forEach(el => {
    const x = S.purchases.find(y => y.id === el.dataset.id);
    $$('.fb:not(.reasons) button', el).forEach(b => b.onclick = () => {
      if (b.dataset.ok === '1') applyFeedback(x, true, [], '');
      else { $('.why', el).hidden = false; }
    });
    $$('.reasons button', el).forEach(b => b.onclick = () => b.classList.toggle('sel'));
    const save = $('.save', el); if (save) save.onclick = () => applyFeedback(x, false, $$('.reasons .sel', el).map(b => b.dataset.f), $('.why input', el).value.trim());
  });
  $('#learnLog').innerHTML = S.learn.length ? S.learn.slice().reverse().map(l => `<div class="hist"><p style="margin:0">${esc(l.text)}</p><p class="mini">${new Date(l.at).toLocaleString('ko-KR')}</p></div>`).join('') : '<p class="hint">아직 없어요.</p>';
  updateBadge();
}

function applyFeedback(x, ok, fids, other) {
  const src = getProfile(x.profileId); const p = ensureOwnProfile(x.profileId); if (!p) return;
  const map = Object.fromEntries((src?.factors || []).map(f => [f.id, f.name]));
  const notes = [];
  if (ok) {
    for (const name of x.flagged) { const f = p.factors.find(f => f.name === name); if (f && f.weight > 1) { f.weight--; notes.push(`'${f.name}' 중요도 ${f.weight + 1}→${f.weight} (주의 표시가 있었지만 만족)`); } }
    if (!notes.length) notes.push('만족 기록 — 기준은 그대로 둡니다');
  } else {
    for (const id of fids) { const f = p.factors.find(f => f.name === map[id]); if (f && f.weight < 3) { f.weight++; notes.push(`'${f.name}' 중요도 ${f.weight - 1}→${f.weight}`); } else if (f) notes.push(`'${f.name}' 이미 최고 중요도`); }
    if (other) { const id = 'F' + (p.factors.length + 1); p.factors.push({ id, name: other.slice(0, 20), weight: 2, desc: other, keywords: other.split(/\s+/).filter(w => w.length > 1).slice(0, 4) }); notes.push(`새 후회 요인 추가: '${other.slice(0, 20)}'`); }
    if (!notes.length) notes.push('후회 기록 — 이유를 고르면 기준이 더 정확해져요');
  }
  x.fb = { ok, at: Date.now(), reasons: fids, other }; store.set('purchases', S.purchases); saveUser();
  S.learn.push({ at: Date.now(), text: `${x.name}: ${notes.join(' / ')}` }); store.set('learn', S.learn);
  toast(ok ? '만족으로 기록했어요' : '후회 이유를 기준에 반영했어요'); renderHistory(); renderPick(); renderProfileCard();
}

// ---------- 시작 ----------
async function init() {
  $$('#steps button').forEach(b => b.onclick = () => go(b.dataset.go));
  S.demo = await fetch('/data/demo.json').then(r => r.json());
  try { const c = await fetch('/data/demo-cache.json'); if (c.ok) S.demoCache = await c.json(); } catch { }
  if (!getProfile(S.activeId)) S.activeId = 'demo-a';
  renderPick(); renderProfileCard(); renderBuilder(); renderSources(); updateBadge();
}
init();
