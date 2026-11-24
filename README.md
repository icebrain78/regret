# 살까말까

내가 예전에 후회한 이유를 기억해 두었다가, 살까 고민하는 상품의 리뷰에서 같은 불만을 찾아 근거 문장과 함께 보여주는 AI 쇼핑 도우미입니다.

- 화면: `index.html`, `app.js`, `style.css` (프로필·기록은 브라우저 localStorage에만 저장)
- API (Vercel 함수): `api/profile.js` 후회 기준 만들기, `api/extract.js` 리뷰 캡처 읽기, `api/analyze.js` 내 기준으로 리뷰 분류, `api/advise.js` 판매자 질문
- AI: Claude API, 지시문과 후회 프로필에 프롬프트 캐싱 적용, 사용량(캐시 읽기/쓰기 토큰) 로그
- 데모 리뷰(`data/demo.json`)는 모두 시연용 가상 리뷰입니다. 생성기: `tools/make_demo.py`

환경변수: `ANTHROPIC_API_KEY` (필수), `MODEL_FAST`, `MODEL_SMART`, `DAILY_LIMIT` (선택)
