// 공통: Claude API 호출(프롬프트 캐싱), 사용량 로그, 간단한 사용량 제한
const API_URL = 'https://api.anthropic.com/v1/messages';
export const MODEL_FAST = process.env.MODEL_FAST || 'claude-haiku-5-5';
export const MODEL_SMART = process.env.MODEL_SMART || 'claude-sonnet-5-5';

const DAILY_LIMIT = Number(process.env.DAILY_LIMIT || 300); // IP당 하루 요청 수 (인스턴스 단위)
const hits = new Map();

export function limited(req) {
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  const day = new Date().toISOString().slice(0, 10);
  const rec = hits.get(ip);
  if (!rec || rec.day !== day) { hits.set(ip, { day, n: 1 }); return false; }
  rec.n += 1;
  return rec.n > DAILY_LIMIT;
}

/**
 * system: [{text, cache:true|false}] — cache:true 블록 끝에 cache_control을 붙인다
 * (반복되는 지시문·후회 프로필을 캐시해서 배치 분석 비용을 줄임)
 */
export async function claude({ model, system, messages, maxTokens = 2000, tag = 'call' }) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY가 설정되지 않았습니다');
  const sys = system.map(b => b.cache
    ? { type: 'text', text: b.text, cache_control: { type: 'ephemeral' } }
    : { type: 'text', text: b.text });
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model, max_tokens: maxTokens, system: sys, messages }),
  });
  const data = await res.json();
  if (!res.ok) {
    console.error(JSON.stringify({ tag, status: res.status, error: data?.error }));
    throw new Error(data?.error?.message || `Claude API 오류 ${res.status}`);
  }
  const u = data.usage || {};
  const usage = {
    input: u.input_tokens || 0, output: u.output_tokens || 0,
    cache_read: u.cache_read_input_tokens || 0, cache_write: u.cache_creation_input_tokens || 0,
  };
  console.log(JSON.stringify({ tag, model, ...usage }));
  const text = (data.content || []).filter(c => c.type === 'text').map(c => c.text).join('');
  return { text, usage };
}

export function parseJSON(text) {
  const s = text.indexOf('{');
  const e = text.lastIndexOf('}');
  if (s < 0 || e < 0) throw new Error('AI 응답에서 JSON을 찾지 못했습니다');
  return JSON.parse(text.slice(s, e + 1));
}

export async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return JSON.parse(req.body || '{}');
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

export function handler(fn) {
  return async (req, res) => {
    if (req.method !== 'POST') { res.status(405).json({ error: 'POST만 가능합니다' }); return; }
    if (limited(req)) { res.status(429).json({ error: '오늘 사용량을 넘었습니다. 내일 다시 시도해 주세요.' }); return; }
    try {
      const body = await readBody(req);
      const out = await fn(body);
      res.status(200).json(out);
    } catch (err) {
      res.status(500).json({ error: String(err.message || err) });
    }
  };
}
