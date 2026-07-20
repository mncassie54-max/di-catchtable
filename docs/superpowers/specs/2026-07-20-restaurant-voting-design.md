# 무기명 맛집 투표 기능 — 설계

**날짜:** 2026-07-20
**상태:** 승인됨

## 목적
팀원들이 등록된 맛집 중 후보를 골라, "한 번에 하나"의 투표를 실시간·무기명으로 진행해 오늘의 점심 등을 정한다.

## 데이터 모델 (Firestore, 새 컬렉션 `polls`)
```
polls/{pollId} = {
  title: string,                    // 예: "오늘 점심 뭐 먹지?"
  candidateIds: string[],           // 후보 맛집 id (restaurants 문서 참조)
  votes: { [restaurantId]: number },// 후보별 득표수
  status: "open" | "closed",
  createdAt: serverTimestamp,
}
```
- **한 번에 하나:** `orderBy(createdAt, "desc"), limit(1)` 로 최근 폴을 활성 폴로 취급.
- 새 투표 생성 시 이전 활성 폴을 `status: "closed"` 로 갱신.

## 투표 방식 (무기명 + 기기당 1표, 변경 가능)
- 브라우저 `localStorage` 키 `omud_vote_{pollId}` 에 이 기기가 찍은 후보 id 저장. 서버엔 신원 없음.
- 후보 탭 동작:
  - 이전 선택 없음 → 해당 후보 `+1`, localStorage 저장
  - 다른 후보였음 → 이전 `-1`, 새 후보 `+1`, localStorage 갱신 (표 이동)
  - 같은 후보 재탭 → 해당 후보 `-1`, localStorage 삭제 (취소)
- Firestore `increment()` 로 원자적 카운트. 동시 투표 안전.
- 무기명이므로 강제 아님 — 실수(더블클릭) 방지 수준.

## UI
- 상단바에 `🗳️ 투표` 버튼 추가 → 투표 모달.
- **활성 폴 없음:** "새 투표 만들기" — 제목 입력 + 등록 맛집 체크리스트에서 후보 선택 → 생성.
- **활성 폴 있음(open):** 제목 / 후보별 카드(이름·카테고리 태그 + 득표수 + 막대바 + %) / 내 선택 강조 / 총 투표수. onSnapshot 실시간 갱신.
  - `➕ 후보 추가`: 아직 후보 아닌 맛집을 골라 추가 (`arrayUnion`).
  - `투표 종료`(status→closed), `새 투표 만들기` 액션.
- **종료된 폴(closed):** 결과 표시, 최다 득표 🏆, 투표 비활성.

## 코드 구조
- 새 파일 `poll.js` 모듈로 분리 (app.js 비대화 방지).
  - 인터페이스: `setupVoting({ getRestaurants, helpers })` — app.js에서 `escapeHtml`, `categoryColor`, `CATEGORY_EMOJI`, `getCategories` 와 현재 맛집 목록 접근 함수를 주입.
  - poll.js가 자체적으로 `polls` 컬렉션 구독, 모달 렌더/이벤트 관리.
- `index.html`: 상단바 버튼 + 투표 모달 마크업.
- `style.css`: 투표 모달·후보 카드·막대바 스타일.

## 추가 기능 (2026-07-20 보완)
### 링크 공유
- 투표 화면에 `🔗 링크 복사` 버튼. 복사 URL = `현재주소#vote`.
- 앱 로드시 `location.hash === "#vote"` 이면 투표 모달을 자동으로 열고 현재 활성 폴을 보여줌.
- "현재 투표" 방식: 새 폴을 만들면 같은 링크가 새 폴을 가리킴.

### 카드 내 식당 정보 펼쳐보기
- 각 후보 카드에 `ℹ️` 정보 버튼. 누르면 카드 안에서 상세가 펼쳐짐(도보거리·추천메뉴·메모·주소·후기수·카카오/네이버 지도 링크).
- 펼침 상태는 `expandedIds` Set으로 유지 → 실시간 득표 갱신에도 펼침 유지.
- 카드 구조를 `<div>` 래퍼 + 투표 버튼 + 정보 버튼 + 상세 영역으로 변경(버튼 중첩 방지).
- app.js에서 `walkInfo` 도 주입.

## 범위 제외 (YAGNI)
- 후보 삭제/재정렬
- 여러 폴 동시 운영
- 로그인/신원 강제
- 투표 마감 시간
