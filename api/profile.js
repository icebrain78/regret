// 후회 프로필 만들기: 카드 선택 + 후회 경험 문장 (+ 반품 내역 캡처) → 후회 요인·가중치·리뷰 표현 사전
import { claude, parseJSON, handler, MODEL_SMART } from './_lib.js';

const SYSTEM = `너는 온라인 쇼핑 '구매 후회' 분석가다. 사용자가 과거에 후회한 구매 경험을 보고,
앞으로 상품 리뷰를 읽을 때 걸러내야 할 "후회 요인"을 정리한다.

규칙
- 후회 요인은 3~7개. 서로 겹치지 않게 묶는다(예: '흡입력 약함'과 '배터리 짧음'은 '성능 부족'으로 묶어도 됨).
- weight: 3=가장 싫어함(경험에서 반복되거나 강하게 표현), 2=싫어함, 1=조금 신경 씀.
- desc: 리뷰를 분류하는 사람이 판단 기준으로 쓸 수 있게 한 문장으로 구체적으로.
- keywords: 실제 한국어 상품 리뷰에서 그 불만이 나올 때 쓰이는 표현 6~12개(구어체 포함, 예: '돌돌이 필수', '보글보글').
- 사용자가 고른 카드는 반드시 반영하되, 경험 문장에 근거가 있으면 가중치를 올린다.
- 캡처 이미지가 있으면 반품·교환 사유를 읽어 반영한다. 읽을 수 없으면 무시한다.
- 개인정보(이름, 주소, 주문번호)는 결과에 쓰지 않는다.

출력: JSON 하나만. 설명 문장 금지.
{"summary":"이 사람이 무엇을 가장 후회하는지 한 문장","factors":[{"id":"F1","name":"짧은 이름","weight":3,"desc":"판단 기준","keywords":["..."]}]}`;

export default handler(async (body) => {
  const cards = (body.cards || []).slice(0, 12);
  const stories = (body.stories || []).filter(Boolean).slice(0, 8);
  const images = (body.images || []).slice(0, 3);
  if (!cards.length && !stories.length && !images.length) throw new Error('카드나 후회 경험을 하나 이상 넣어 주세요');

  const content = [];
  for (const img of images) {
    const m = /^data:(image\/[a-z]+);base64,(.+)$/.exec(img);
    if (m) content.push({ type: 'image', source: { type: 'base64', media_type: m[1], data: m[2] } });
  }
  content.push({ type: 'text', text:
    `고른 카드: ${cards.join(', ') || '(없음)'}\n후회 경험:\n${stories.map((s, i) => `${i + 1}. ${s}`).join('\n') || '(없음)'}` });

  const { text, usage } = await claude({
    model: MODEL_SMART, tag: 'profile', maxTokens: 1500,
    system: [{ text: SYSTEM }],
    messages: [{ role: 'user', content }],
  });
  const out = parseJSON(text);
  out.factors = (out.factors || []).slice(0, 7).map((f, i) => ({
    id: `F${i + 1}`, name: String(f.name || '').slice(0, 20), weight: Math.min(3, Math.max(1, Number(f.weight) || 1)),
    desc: String(f.desc || ''), keywords: (f.keywords || []).map(String).slice(0, 12),
  }));
  return { profile: out, usage };
});
