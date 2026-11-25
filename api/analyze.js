// 리뷰 배치 분류: 이 사람의 후회 요인에 해당하는 불만이 리뷰에 있는지 판정하고 근거 문구를 뽑는다.
// 지시문+후회 프로필을 캐시 → 같은 프로필로 여러 배치를 보낼 때 캐시 읽기로 처리.
import { claude, parseJSON, handler, MODEL_FAST } from './_lib.js';

const RUBRIC = `너는 상품 리뷰를 "특정 사용자의 후회 기준"으로 읽어 주는 분류기다.
아래 [후회 프로필]의 각 요인(F1, F2 …)에 대해, 각 리뷰가 그 요인에 해당하는 "불만·문제"를 말하는지 판정한다.

판정 원칙
1. 해당(매칭)으로 보는 경우: 리뷰 작성자가 그 요인의 문제를 직접 겪었거나 분명히 지적함.
   - 예) 요인 '소음·진동': "밤에 보글보글 소리가 커요", "모터 소리 때문에 밤엔 못 돌려요" → 해당
   - 예) 요인 '반품비 부담': "반품하려니 왕복 배송비를 내래요" → 해당
   - 예) 요인 '숨은 추가 비용': "거치대가 별매라 따로 샀어요" → 해당
2. 해당 아님:
   - 그 요인에 대해 긍정적으로 말함: "소리가 조용해요", "무료 반품이라 부담 없었어요", "반품 응대가 친절했어요"
   - 단어만 같고 문제가 아님: "냄새 제거 기능이 좋아요", "털 빠짐 없어요", "반품할 일 없을 듯"
   - 다른 요인의 불만(그 요인에만 매칭)
   - 막연한 불만("별로예요")은 어느 요인에도 넣지 않는다.
3. 한 리뷰가 여러 요인에 해당할 수 있다.
4. 근거 q: 리뷰 원문에서 그 판단의 근거가 되는 부분을 "글자 그대로" 짧게 복사한다(최대 40자). 바꿔 쓰지 않는다.
5. 강도 s: 1=가볍게 언급, 2=분명한 불만, 3=반품·사용 포기 수준.
6. 확실하지 않으면 매칭하지 않는다(과탐보다 놓침이 낫다는 뜻은 아니며, 문맥상 분명한 것만).
7. 대가성 의심 ad: 리뷰가 체험단·협찬·업체 제공·원고료·서포터즈·직원 작성 등 대가를 받고 썼다고 밝히거나 강하게 드러내면 "ad":true.
   - 예) "업체로부터 제품을 무상으로 제공받아 작성한 후기입니다", "체험단으로 써 봤어요" → ad
   - 단순히 칭찬이 많거나 짧다는 이유만으로는 표시하지 않는다.

입력 형식: 한 줄에 하나씩 "리뷰ID | 별점 | 본문".
출력: JSON 하나만. 해당 요인이 하나라도 있거나 ad인 리뷰만 넣는다(없으면 빈 배열). ad가 아니면 ad는 생략.
{"results":[{"id":"리뷰ID","m":[{"f":"F1","q":"근거 원문","s":2}],"ad":true}]}`;

export default handler(async (body) => {
  const p = body.profile;
  const reviews = (body.reviews || []).slice(0, 60);
  if (!p || !p.factors?.length) throw new Error('후회 프로필이 없습니다');
  if (!reviews.length) return { results: [], usage: null };

  const profileText = `[후회 프로필]\n요약: ${p.summary || ''}\n` + p.factors.map(f =>
    `${f.id}. ${f.name} (중요도 ${f.weight}/3)\n  기준: ${f.desc}\n  자주 쓰이는 표현: ${(f.keywords || []).join(', ')}`).join('\n');

  const lines = reviews.map(r => `${r.id} | ${r.rating ?? '-'} | ${String(r.text).replace(/\s+/g, ' ').slice(0, 600)}`).join('\n');
  const { text, usage } = await claude({
    model: MODEL_FAST, tag: 'analyze', maxTokens: 4000,
    system: [{ text: RUBRIC }, { text: profileText, cache: true }],
    messages: [{ role: 'user', content: `다음 리뷰 ${reviews.length}개를 판정하세요.\n${lines}` }],
  });
  const out = parseJSON(text);
  const ids = new Set(reviews.map(r => r.id));
  const fids = new Set(p.factors.map(f => f.id));
  const results = (out.results || []).filter(r => ids.has(r.id)).map(r => ({
    id: r.id, ad: r.ad === true, m: (r.m || []).filter(x => fids.has(x.f)).map(x => ({ f: x.f, q: String(x.q || '').slice(0, 60), s: Number(x.s) || 1 })),
  })).filter(r => r.m.length || r.ad);
  return { results, usage };
});
