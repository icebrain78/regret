// 리뷰 캡처 → 리뷰 목록(JSON). 쇼핑몰을 직접 긁지 않고, 사용자가 올린 화면만 읽는다.
import { claude, parseJSON, handler, MODEL_FAST } from './_lib.js';

const SYSTEM = `너는 쇼핑몰 리뷰 화면 캡처에서 리뷰만 정확히 옮겨 적는 도우미다.
- 화면에 보이는 각 리뷰의 별점(1~5, 안 보이면 null)과 본문을 그대로 옮긴다. 요약·교정하지 않는다.
- 작성자 이름·아이디·날짜·구매 옵션·광고·버튼 글자는 빼고, 리뷰 본문만.
- 잘려서 일부만 보이는 리뷰는 보이는 부분만 적고 "cut":true.
- 상품명이 보이면 product에 적는다.
출력: JSON 하나만. {"product":"..."|null,"reviews":[{"rating":5,"text":"...","cut":false}]}`;

export default handler(async (body) => {
  const images = (body.images || []).slice(0, 4);
  if (!images.length) throw new Error('캡처 이미지를 올려 주세요');
  const content = [];
  for (const img of images) {
    const m = /^data:(image\/[a-z]+);base64,(.+)$/.exec(img);
    if (m) content.push({ type: 'image', source: { type: 'base64', media_type: m[1], data: m[2] } });
  }
  content.push({ type: 'text', text: '이 캡처들에 보이는 리뷰를 모두 옮겨 주세요.' });
  const { text, usage } = await claude({
    model: MODEL_FAST, tag: 'extract', maxTokens: 6000,
    system: [{ text: SYSTEM }],
    messages: [{ role: 'user', content }],
  });
  const out = parseJSON(text);
  out.reviews = (out.reviews || []).filter(r => r && r.text).map(r => ({
    rating: r.rating == null ? null : Number(r.rating), text: String(r.text), cut: !!r.cut,
  }));
  return { ...out, usage };
});
