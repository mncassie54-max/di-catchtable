# DI 팀 점심 맛집 페이지 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** DI 팀이 점심 맛집을 등록·필터·삭제하고 팀원에게 실시간 공유되는 단일 페이지 웹앱을 만든다.

**Architecture:** 빌드 없는 순수 HTML/CSS/JS. Firebase Firestore를 CDN(ES module)으로 불러와 `onSnapshot`으로 실시간 동기화. GitHub Pages로 정적 배포. 데이터는 메모리에 보관하고 필터링은 클라이언트에서 수행.

**Tech Stack:** HTML5, CSS3, Vanilla JavaScript (ES modules), Firebase Firestore (v10 CDN), GitHub Pages

---

## File Structure

```
index.html          # 화면 골격 (필터 바, 목록 컨테이너, 등록 모달)
style.css           # 스타일
firebase-config.js  # Firebase 설정값 + 앱/Firestore 초기화 export (사용자가 값 채움)
app.js              # Firestore 구독/추가/삭제 + 필터 상태 + 렌더링
README.md           # Firebase 프로젝트 생성 & GitHub Pages 배포 가이드
```

**책임 분리:**
- `firebase-config.js` — Firebase 초기화만 담당. 설정값과 SDK 초기화를 한곳에 모음.
- `app.js` — 데이터 흐름(구독/추가/삭제)과 UI(필터/렌더링)를 담당.
- `index.html` / `style.css` — 구조와 스타일.

**테스트 방식:** 이 프로젝트는 빌드/테스트 러너가 없다. 각 태스크는 브라우저에서 직접 확인하는 수동 검증 단계를 포함한다. (테스트 프레임워크 도입은 이 규모에 과함 — YAGNI)

---

## Task 1: 프로젝트 골격 (index.html + style.css)

**Files:**
- Create: `index.html`
- Create: `style.css`

- [ ] **Step 1: index.html 작성**

```html
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>DI 점심 맛집</title>
  <link rel="stylesheet" href="style.css" />
</head>
<body>
  <header class="topbar">
    <h1>🍱 DI 점심 맛집</h1>
    <button id="openAddBtn" class="btn-primary">맛집 등록</button>
  </header>

  <section class="filters">
    <select id="filterCategory" aria-label="카테고리 필터">
      <option value="">카테고리 전체</option>
      <option value="한식">한식</option>
      <option value="중식">중식</option>
      <option value="일식">일식</option>
      <option value="양식">양식</option>
      <option value="분식">분식</option>
      <option value="카페">카페</option>
      <option value="단체예약">단체예약</option>
      <option value="기타">기타</option>
    </select>
    <select id="filterDistance" aria-label="거리 필터">
      <option value="">거리 전체</option>
      <option value="5분이내">5분이내</option>
      <option value="10분이내">10분이내</option>
      <option value="15분이상">15분이상</option>
    </select>
    <select id="filterPrice" aria-label="가격대 필터">
      <option value="">가격 전체</option>
      <option value="~1만원">~1만원</option>
      <option value="1~1.5만원">1~1.5만원</option>
      <option value="1.5만원+">1.5만원+</option>
    </select>
    <button id="resetFilterBtn" class="btn-ghost">전체 보기</button>
    <span id="resultCount" class="result-count"></span>
  </section>

  <main id="list" class="grid" aria-live="polite"></main>

  <!-- 등록 모달 -->
  <div id="addModal" class="modal hidden">
    <div class="modal-content">
      <h2>맛집 등록</h2>
      <form id="addForm">
        <label>이름 *
          <input type="text" id="fName" required />
        </label>
        <label>카테고리
          <select id="fCategory">
            <option value="한식">한식</option>
            <option value="중식">중식</option>
            <option value="일식">일식</option>
            <option value="양식">양식</option>
            <option value="분식">분식</option>
            <option value="카페">카페</option>
            <option value="단체예약">단체예약</option>
            <option value="기타">기타</option>
          </select>
        </label>
        <label>거리
          <select id="fDistance">
            <option value="5분이내">5분이내</option>
            <option value="10분이내">10분이내</option>
            <option value="15분이상">15분이상</option>
          </select>
        </label>
        <label>가격대
          <select id="fPrice">
            <option value="~1만원">~1만원</option>
            <option value="1~1.5만원">1~1.5만원</option>
            <option value="1.5만원+">1.5만원+</option>
          </select>
        </label>
        <label>메모
          <input type="text" id="fMemo" placeholder="대표메뉴·한줄평" />
        </label>
        <div class="modal-actions">
          <button type="button" id="cancelAddBtn" class="btn-ghost">취소</button>
          <button type="submit" class="btn-primary">저장</button>
        </div>
      </form>
    </div>
  </div>

  <div id="configWarning" class="config-warning hidden">
    ⚠️ Firebase 설정이 필요합니다. README.md를 참고해 firebase-config.js를 채워주세요.
  </div>

  <script type="module" src="app.js"></script>
</body>
</html>
```

- [ ] **Step 2: style.css 작성**

```css
:root {
  --bg: #f7f7f8;
  --card: #ffffff;
  --border: #e3e3e6;
  --text: #1f2024;
  --muted: #6b6f76;
  --primary: #ff6b35;
  --primary-dark: #e85a28;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  font-family: -apple-system, "Segoe UI", "Malgun Gothic", sans-serif;
  background: var(--bg);
  color: var(--text);
}
.topbar {
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px 20px; background: var(--card); border-bottom: 1px solid var(--border);
  position: sticky; top: 0; z-index: 5;
}
.topbar h1 { font-size: 20px; margin: 0; }
.filters {
  display: flex; flex-wrap: wrap; gap: 8px; align-items: center;
  padding: 16px 20px;
}
.filters select {
  padding: 8px 10px; border: 1px solid var(--border); border-radius: 8px;
  background: var(--card); font-size: 14px;
}
.result-count { margin-left: auto; color: var(--muted); font-size: 14px; }
.grid {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 12px; padding: 0 20px 40px;
}
.card {
  background: var(--card); border: 1px solid var(--border); border-radius: 12px;
  padding: 14px; position: relative;
}
.card h3 { margin: 0 0 8px; font-size: 16px; }
.card .tags { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px; }
.card .tag {
  font-size: 12px; padding: 3px 8px; border-radius: 999px;
  background: #f0f1f3; color: var(--muted);
}
.card .memo { font-size: 14px; color: var(--text); }
.card .delete {
  position: absolute; top: 10px; right: 10px; border: none; background: none;
  color: var(--muted); cursor: pointer; font-size: 16px; line-height: 1;
}
.card .delete:hover { color: #d33; }
.empty { padding: 40px; text-align: center; color: var(--muted); grid-column: 1 / -1; }
.btn-primary {
  background: var(--primary); color: #fff; border: none; border-radius: 8px;
  padding: 9px 16px; font-size: 14px; cursor: pointer;
}
.btn-primary:hover { background: var(--primary-dark); }
.btn-ghost {
  background: none; border: 1px solid var(--border); border-radius: 8px;
  padding: 8px 14px; font-size: 14px; cursor: pointer;
}
.modal {
  position: fixed; inset: 0; background: rgba(0,0,0,0.4);
  display: flex; align-items: center; justify-content: center; z-index: 10;
}
.modal.hidden { display: none; }
.modal-content {
  background: var(--card); border-radius: 14px; padding: 24px; width: 90%; max-width: 380px;
}
.modal-content h2 { margin: 0 0 16px; font-size: 18px; }
.modal-content label { display: block; font-size: 13px; color: var(--muted); margin-bottom: 12px; }
.modal-content input, .modal-content select {
  display: block; width: 100%; margin-top: 4px; padding: 9px 10px;
  border: 1px solid var(--border); border-radius: 8px; font-size: 14px;
}
.modal-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 8px; }
.config-warning {
  position: fixed; bottom: 16px; left: 16px; right: 16px; max-width: 600px; margin: 0 auto;
  background: #fff3cd; border: 1px solid #ffe69c; color: #664d03;
  padding: 12px 16px; border-radius: 10px; font-size: 14px; text-align: center;
}
.config-warning.hidden { display: none; }
```

- [ ] **Step 3: 브라우저에서 확인**

`index.html`을 브라우저로 연다.
Expected: 상단바("DI 점심 맛집" + 등록 버튼), 필터 드롭다운 3개 + 전체 보기 버튼이 보인다. 목록은 비어 있다. (아직 JS 없음 — 모듈 로드 404는 무시)

- [ ] **Step 4: Commit**

```bash
git add index.html style.css
git commit -m "feat: add page skeleton and styles"
```

---

## Task 2: Firebase 설정 모듈 (firebase-config.js)

**Files:**
- Create: `firebase-config.js`

- [ ] **Step 1: firebase-config.js 작성**

값은 사용자가 Firebase 콘솔에서 발급받아 채운다(README 참고). 플레이스홀더 값이 남아 있으면 `isConfigured`가 `false`가 되어 앱이 경고를 띄운다.

```javascript
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// ↓↓↓ Firebase 콘솔에서 발급받은 값으로 교체하세요 (README.md 참고) ↓↓↓
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID",
};
// ↑↑↑ 여기까지 교체 ↑↑↑

export const isConfigured = firebaseConfig.apiKey !== "YOUR_API_KEY";

let db = null;
if (isConfigured) {
  const app = initializeApp(firebaseConfig);
  db = getFirestore(app);
}
export { db };
```

- [ ] **Step 2: 브라우저 콘솔에서 확인**

`index.html`을 열고 개발자 도구 콘솔을 본다.
Expected: 빨간 에러 없음. (값 미교체 상태라 `isConfigured`는 false — 정상)

- [ ] **Step 3: Commit**

```bash
git add firebase-config.js
git commit -m "feat: add firebase config module"
```

---

## Task 3: 실시간 구독 + 목록 렌더링 (app.js 1차)

**Files:**
- Create: `app.js`

- [ ] **Step 1: app.js 작성 — 구독 + 렌더링 + 필터**

```javascript
import { db, isConfigured } from "./firebase-config.js";
import {
  collection, onSnapshot, query, orderBy,
  addDoc, deleteDoc, doc, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const listEl = document.getElementById("list");
const resultCountEl = document.getElementById("resultCount");
const filterCategory = document.getElementById("filterCategory");
const filterDistance = document.getElementById("filterDistance");
const filterPrice = document.getElementById("filterPrice");
const resetFilterBtn = document.getElementById("resetFilterBtn");

let allRestaurants = []; // 메모리 캐시 (Firestore 최신 스냅샷)

function getFilters() {
  return {
    category: filterCategory.value,
    distance: filterDistance.value,
    price: filterPrice.value,
  };
}

function applyFilters(items) {
  const f = getFilters();
  return items.filter((r) =>
    (!f.category || r.category === f.category) &&
    (!f.distance || r.distance === f.distance) &&
    (!f.price || r.price === f.price)
  );
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

function render() {
  const filtered = applyFilters(allRestaurants);
  resultCountEl.textContent = `${filtered.length}곳`;
  if (filtered.length === 0) {
    listEl.innerHTML = `<div class="empty">조건에 맞는 맛집이 없어요. 필터를 바꾸거나 새로 등록해보세요.</div>`;
    return;
  }
  listEl.innerHTML = filtered.map((r) => `
    <article class="card">
      <button class="delete" data-id="${r.id}" title="삭제">✕</button>
      <h3>${escapeHtml(r.name)}</h3>
      <div class="tags">
        <span class="tag">${escapeHtml(r.category)}</span>
        <span class="tag">${escapeHtml(r.distance)}</span>
        <span class="tag">${escapeHtml(r.price)}</span>
      </div>
      ${r.memo ? `<p class="memo">${escapeHtml(r.memo)}</p>` : ""}
    </article>
  `).join("");
}

[filterCategory, filterDistance, filterPrice].forEach((el) =>
  el.addEventListener("change", render)
);
resetFilterBtn.addEventListener("click", () => {
  filterCategory.value = "";
  filterDistance.value = "";
  filterPrice.value = "";
  render();
});

function subscribe() {
  const q = query(collection(db, "restaurants"), orderBy("createdAt", "desc"));
  onSnapshot(q, (snap) => {
    allRestaurants = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    render();
  }, (err) => {
    console.error("Firestore 구독 실패:", err);
    alert("데이터를 불러오지 못했습니다. 콘솔을 확인해주세요.");
  });
}

function init() {
  if (!isConfigured) {
    document.getElementById("configWarning").classList.remove("hidden");
    resultCountEl.textContent = "";
    return;
  }
  subscribe();
}

init();
```

- [ ] **Step 2: 임시 데이터로 렌더링 확인 (설정 전이라도)**

`firebase-config.js`가 아직 미설정이면 경고 배너만 떠야 한다. 설정 완료 후에는 빈 목록 + "0곳"이 떠야 한다.
설정 전 Expected: 하단에 노란 경고 배너 표시, 콘솔 에러 없음.

- [ ] **Step 3: Commit**

```bash
git add app.js
git commit -m "feat: add firestore subscription, filtering, and list rendering"
```

---

## Task 4: 맛집 등록 (모달 + addDoc)

**Files:**
- Modify: `app.js` (등록 모달 로직 추가)

- [ ] **Step 1: app.js 끝부분에 모달 + 등록 로직 추가**

`init();` 호출 **앞**에 아래 코드를 추가한다 (DOM 참조와 이벤트 바인딩).

```javascript
// --- 등록 모달 ---
const addModal = document.getElementById("addModal");
const openAddBtn = document.getElementById("openAddBtn");
const cancelAddBtn = document.getElementById("cancelAddBtn");
const addForm = document.getElementById("addForm");

function openModal() {
  if (!isConfigured) {
    alert("Firebase 설정이 필요합니다. README.md를 참고해주세요.");
    return;
  }
  addModal.classList.remove("hidden");
  document.getElementById("fName").focus();
}
function closeModal() {
  addModal.classList.add("hidden");
  addForm.reset();
}

openAddBtn.addEventListener("click", openModal);
cancelAddBtn.addEventListener("click", closeModal);
addModal.addEventListener("click", (e) => {
  if (e.target === addModal) closeModal();
});

addForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = document.getElementById("fName").value.trim();
  if (!name) return;
  try {
    await addDoc(collection(db, "restaurants"), {
      name,
      category: document.getElementById("fCategory").value,
      distance: document.getElementById("fDistance").value,
      price: document.getElementById("fPrice").value,
      memo: document.getElementById("fMemo").value.trim(),
      createdAt: serverTimestamp(),
    });
    closeModal();
  } catch (err) {
    console.error("등록 실패:", err);
    alert("등록에 실패했습니다. 콘솔을 확인해주세요.");
  }
});
```

- [ ] **Step 2: 등록 동작 확인 (설정 완료 후)**

Firebase 설정을 채운 뒤 로컬 서버로 연다 (ES module은 `file://`에서 CORS 제한 가능 → `npx serve` 또는 VS Code Live Server 사용).
Run: `npx serve .` 후 표시된 주소 접속.
Expected: "맛집 등록" → 모달 표시 → 입력 후 저장 → 모달 닫히고 카드가 목록에 즉시 나타남(실시간 반영). Firebase 콘솔 Firestore에도 문서 생성 확인.

- [ ] **Step 3: Commit**

```bash
git add app.js
git commit -m "feat: add restaurant registration modal"
```

---

## Task 5: 맛집 삭제 (deleteDoc)

**Files:**
- Modify: `app.js` (삭제 이벤트 위임 추가)

- [ ] **Step 1: app.js의 모달 코드 블록 뒤에 삭제 위임 추가**

```javascript
// --- 삭제 (이벤트 위임) ---
listEl.addEventListener("click", async (e) => {
  const btn = e.target.closest(".delete");
  if (!btn) return;
  const id = btn.dataset.id;
  if (!confirm("이 맛집을 삭제할까요?")) return;
  try {
    await deleteDoc(doc(db, "restaurants", id));
  } catch (err) {
    console.error("삭제 실패:", err);
    alert("삭제에 실패했습니다. 콘솔을 확인해주세요.");
  }
});
```

- [ ] **Step 2: 삭제 동작 확인**

로컬 서버에서 카드의 ✕ 버튼 클릭 → 확인창 → 확인 시 카드가 목록에서 즉시 사라짐. Firestore 콘솔에서도 문서 삭제 확인.
Expected: 삭제 후 결과 개수 갱신, 콘솔 에러 없음.

- [ ] **Step 3: Commit**

```bash
git add app.js
git commit -m "feat: add restaurant delete"
```

---

## Task 6: README (Firebase 생성 + 배포 가이드)

**Files:**
- Create: `README.md`

- [ ] **Step 1: README.md 작성**

````markdown
# DI 점심 맛집

DI 팀이 점심 맛집을 등록·필터·삭제하고 실시간으로 공유하는 단일 페이지 웹앱.

## 1. Firebase 프로젝트 만들기

1. https://console.firebase.google.com 접속 → "프로젝트 추가".
2. 프로젝트 생성 후 좌측 **빌드 > Firestore Database** → "데이터베이스 만들기".
3. 위치 선택, **테스트 모드로 시작** 선택 (read/write 30일 허용).
   - 계속 쓰려면 규칙에서 아래처럼 공개 설정:
     ```
     rules_version = '2';
     service cloud.firestore {
       match /databases/{database}/documents {
         match /restaurants/{doc} {
           allow read, write: if true;
         }
       }
     }
     ```
4. 프로젝트 설정(⚙️) > **일반** 탭 > "내 앱"에서 **웹 앱(</>)** 추가.
5. 표시되는 `firebaseConfig` 값을 복사.

## 2. 설정값 넣기

`firebase-config.js`의 `firebaseConfig` 객체를 위에서 복사한 값으로 교체한다.

## 3. 로컬 실행

ES module은 `file://`에서 제한될 수 있으니 로컬 서버로 연다.

```bash
npx serve .
```

표시된 주소(예: http://localhost:3000)로 접속.

## 4. GitHub Pages 배포

```bash
git init
git add .
git commit -m "init"
git branch -M main
git remote add origin https://github.com/<계정>/<저장소>.git
git push -u origin main
```

GitHub 저장소 > **Settings > Pages** > Source를 `main` 브랜치 `/ (root)`로 설정 → 저장.
잠시 후 `https://<계정>.github.io/<저장소>/` 에서 접속 가능.

## 주의

- 페이지는 인터넷에 공개되며 누구나 등록/삭제할 수 있다(공용 점심 맛집 용도).
- `firebaseConfig`의 apiKey는 공개되어도 되는 클라이언트 식별자다. 접근 통제는 Firestore 보안 규칙으로 한다.
````

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add setup and deployment guide"
```

---

## Task 7: 전체 통합 점검

**Files:** (없음 — 검증만)

- [ ] **Step 1: 전체 시나리오 점검**

로컬 서버(`npx serve .`)에서 실제 Firebase 설정으로:
1. 맛집 3~4개 등록 (서로 다른 카테고리/거리/가격).
2. 카테고리 필터 변경 → 해당 카테고리만 표시 + 개수 갱신.
3. 거리·가격 필터 조합 → 교집합만 표시.
4. "전체 보기" → 필터 초기화, 전체 표시.
5. 다른 브라우저/탭에서 같은 주소 접속 → 한쪽에서 등록/삭제 시 다른 쪽에 자동 반영(실시간).
6. 삭제 동작 확인.

Expected: 모든 단계 정상. 콘솔 에러 없음.

- [ ] **Step 2: 최종 커밋 (필요 시)**

```bash
git add -A
git commit -m "chore: verify integration"
```

---

## Self-Review 결과

- **스펙 커버리지:** 데이터 모델(Task 1 HTML 옵션 + Task 4 addDoc 필드) / 필터(Task 3) / 목록·삭제(Task 3,5) / 등록 모달(Task 4) / 실시간(Task 3 onSnapshot) / 공개·보안(Task 6 README) / 에러 처리(config 경고 Task 3, try/catch Task 4·5) / 카테고리에 단체예약 포함(Task 1) — 모두 태스크 존재.
- **플레이스홀더:** `firebase-config.js`의 `YOUR_*`는 의도된 사용자 입력값(README에서 설명). 그 외 미완성 항목 없음.
- **타입/이름 일관성:** `allRestaurants`, `render()`, `applyFilters()`, `getFilters()`, 필드명(`name/category/distance/price/memo/createdAt`), DOM id(`fName`,`fCategory`,`fDistance`,`fPrice`,`fMemo`, `addModal`,`openAddBtn`,`cancelAddBtn`,`addForm`)이 HTML·JS 간 일치.
