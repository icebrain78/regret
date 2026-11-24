// 배포된 API로 데모 프로필×데모 상품을 미리 분석해 data/demo-cache.json 생성 + 정답(tools/demo_truth.json) 대비 정확도 측정
import fs from 'fs';
const BASE = process.env.BASE || 'https://salkka-seven.vercel.app';
const demo = JSON.parse(fs.readFileSync('data/demo.json'));
const truth = JSON.parse(fs.readFileSync('tools/demo_truth.json'));
const post = async (path, body) => { const r = await fetch(BASE + '/api/' + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); const j = await r.json(); if (!r.ok) throw new Error(j.error); return j; };
const cache = {}; const usage = { input: 0, output: 0, cache_read: 0, cache_write: 0, calls: 0 };
const report = [];
for (const p of demo.profiles) for (const prod of demo.products) {
  const batches = []; for (let i = 0; i < prod.reviews.length; i += 40) batches.push(prod.reviews.slice(i, i + 40));
  const matched = {};
  const send = async b => { const o = await post('analyze', { profile: p, reviews: b }); for (const r of o.results) matched[r.id] = r.m; usage.calls++; for (const k of ['input','output','cache_read','cache_write']) usage[k] += o.usage?.[k] || 0; };
  await send(batches[0]); await Promise.all(batches.slice(1).map(send));
  const per = {}; for (const f of p.factors) per[f.id] = { count: 0, strong: 0, items: [] };
  for (const [id, ms] of Object.entries(matched)) for (const m of ms) { const x = per[m.f]; if (!x) continue; x.count++; if (m.s >= 3) x.strong++; x.items.push({ id, q: m.q, s: m.s }); }
  cache[p.id + '|demo:' + prod.id] = { mode: 'ai', total: prod.reviews.length, per, matched, productKey: 'demo:' + prod.id, productName: prod.name, at: Date.now() };
  // 정확도: 요인 이름 == 정답 태그 기준
  for (const f of p.factors) {
    let tp = 0, fp = 0, fn = 0;
    for (const r of prod.reviews) {
      const gold = (truth[prod.id][r.id] || []).includes(f.name);
      const pred = (matched[r.id] || []).some(m => m.f === f.id);
      if (gold && pred) tp++; else if (pred) fp++; else if (gold) fn++;
    }
    if (tp + fp + fn) report.push({ profile: p.id, product: prod.id, factor: f.name, tp, fp, fn });
  }
}
fs.writeFileSync('data/demo-cache.json', JSON.stringify(cache));
const T = report.reduce((a, r) => ({ tp: a.tp + r.tp, fp: a.fp + r.fp, fn: a.fn + r.fn }), { tp: 0, fp: 0, fn: 0 });
console.table(report);
console.log('전체 정밀도', (T.tp / (T.tp + T.fp)).toFixed(3), '재현율', (T.tp / (T.tp + T.fn)).toFixed(3), T);
console.log('사용량', usage);
