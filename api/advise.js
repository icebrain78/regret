// 분석 결과 → 한 줄 판단 + 판매자에게 물어볼 질문
import { claude, parseJSON, handler, MODEL_FAST } from './_lib.js';

const SYSTEM = `너는 신중한 쇼핑 조언자다. 사용자의 후회 요인별로 리뷰에서 찾은 불만 비율과 근거 문장을 받는다.
- verdict: 이 사람 기준으로 사도 될지 2문장 이내. 단정하지 말고 근거 비율을 언급. 최종 결정은 사용자 몫임을 존중.
- questions: 구매 전 판매자에게 물어볼 질문 2~4개. 수치·조건으로 답할 수 있게 구체적으로(예: "취침 모드 소음이 몇 dB인가요?", "단순 변심 반품 시 왕복 배송비는 얼마인가요?").
- tips: 사기 전에 직접 확인할 것 1~2개(상세페이지 어디를 볼지 등).
근거에 없는 사실(인증, 수치)을 지어내지 않는다.
출력: JSON 하나만. {"verdict":"...","questions":["..."],"tips":["..."]}`;

export default handler(async (body) => {
  const { product, findings } = body;
  if (!findings) throw new Error('분석 결과가 없습니다');
  const { text, usage } = await claude({
    model: MODEL_FAST, tag: 'advise', maxTokens: 800,
    system: [{ text: SYSTEM }],
    messages: [{ role: 'user', content: `상품: ${product || '(이름 없음)'}\n${JSON.stringify(findings)}` }],
  });
  return { ...parseJSON(text), usage };
});
