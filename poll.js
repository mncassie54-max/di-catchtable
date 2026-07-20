import { db } from "./firebase-config.js";
import {
  collection, onSnapshot, query, orderBy, limit,
  addDoc, updateDoc, doc, serverTimestamp, increment, arrayUnion,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// app.js에서 주입: { getRestaurants, escapeHtml, categoryColor, CATEGORY_EMOJI, getCategories, walkInfo }
let deps = null;

let activePoll = null;   // { id, title, candidateIds, votes, status } | null
let uiMode = "view";     // "view" | "create" | "add"
let autoOpenPending = false;  // #vote 링크로 진입 → 폴 로드되면 자동으로 열기
let lastPollId = null;        // 폴이 바뀌면 펼침 상태 초기화용
const expandedIds = new Set(); // 카드 내 상세가 펼쳐진 후보 id

let voteModal, voteBody, openVoteBtn, voteClose;

// --- 기기별 내 선택 (localStorage, 무기명이라 서버엔 신원 없음) ---
function voteKey(pollId) { return "omud_vote_" + pollId; }
function myVote(pollId) {
  try { return localStorage.getItem(voteKey(pollId)); } catch { return null; }
}
function setMyVote(pollId, rid) {
  try {
    if (rid) localStorage.setItem(voteKey(pollId), rid);
    else localStorage.removeItem(voteKey(pollId));
  } catch { /* localStorage 불가 환경 무시 */ }
}

export function setupVoting(dependencies) {
  deps = dependencies;
  voteModal = document.getElementById("voteModal");
  voteBody = document.getElementById("voteBody");
  openVoteBtn = document.getElementById("openVoteBtn");
  voteClose = document.getElementById("voteClose");

  openVoteBtn.addEventListener("click", openVote);
  voteClose.addEventListener("click", closeVote);
  voteModal.addEventListener("click", (e) => { if (e.target === voteModal) closeVote(); });
  voteBody.addEventListener("click", onBodyClick);
  voteBody.addEventListener("input", onBodySearch);

  // #vote 링크로 들어온 경우, 폴이 로드되면 자동으로 모달을 연다
  if (location.hash === "#vote") autoOpenPending = true;

  subscribe();
}

// 최근 폴 1개 = 활성 폴 ("한 번에 하나")
function subscribe() {
  const q = query(collection(db, "polls"), orderBy("createdAt", "desc"), limit(1));
  onSnapshot(q, (snap) => {
    activePoll = snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() };
    // 폴이 바뀌면 펼침 상태 초기화
    if (activePoll?.id !== lastPollId) { expandedIds.clear(); lastPollId = activePoll?.id ?? null; }
    // 공유 링크로 진입 → 첫 스냅샷에서 자동으로 열기
    if (autoOpenPending) {
      autoOpenPending = false;
      uiMode = "view";
      voteModal.classList.remove("hidden");
      render();
      return;
    }
    // 후보 선택/생성 폼 입력 중에는 화면을 덮어쓰지 않음
    if (!voteModal.classList.contains("hidden") && uiMode === "view") render();
  }, (err) => {
    console.error("투표 구독 실패:", err);
  });
}

function openVote() {
  uiMode = activePoll ? "view" : "create";
  voteModal.classList.remove("hidden");
  render();
}
function closeVote() {
  voteModal.classList.add("hidden");
  voteBody.innerHTML = "";
  uiMode = "view";
}

function render() {
  if (uiMode === "create") return renderCreate();
  if (uiMode === "add") return renderAddCandidates();
  if (!activePoll) return renderCreate();
  return renderPoll(activePoll);
}

// --- 활성 폴 보기/투표 ---
function renderPoll(poll) {
  const { escapeHtml, categoryColor, CATEGORY_EMOJI, getCategories, getRestaurants } = deps;
  const closed = poll.status === "closed";
  const restaurants = getRestaurants();
  const votes = poll.votes || {};
  const ids = Array.isArray(poll.candidateIds) ? poll.candidateIds : [];
  const total = ids.reduce((sum, id) => sum + (votes[id] || 0), 0);
  const maxCount = ids.reduce((m, id) => Math.max(m, votes[id] || 0), 0);
  const mine = myVote(poll.id);

  const cards = ids.map((id) => {
    const r = restaurants.find((x) => x.id === id);
    const count = votes[id] || 0;
    const pct = total ? Math.round((count / total) * 100) : 0;
    const isLeader = maxCount > 0 && count === maxCount;
    const isMine = mine === id;
    const expanded = expandedIds.has(id);
    const name = r ? r.name : "(삭제된 맛집)";
    const cats = r ? getCategories(r) : [];
    const emoji = CATEGORY_EMOJI[cats[0]] || "🍴";
    const tags = cats.map((cat) => {
      const c = categoryColor(cat);
      return `<span class="tag tag-cat" style="background:${c.bg};color:${c.fg}">${escapeHtml(cat)}</span>`;
    }).join("");
    const cls = ["vote-cand"];
    if (isMine) cls.push("mine");
    if (closed && isLeader) cls.push("winner");
    return `
      <div class="${cls.join(" ")}" data-id="${escapeHtml(id)}">
        <div class="vote-cand-main">
          <div class="vote-bar" style="width:${pct}%"></div>
          <button type="button" class="vote-hit" data-act="vote" data-id="${escapeHtml(id)}" ${closed ? "disabled" : ""}>
            <span class="vote-emoji">${(closed && isLeader) ? "🏆" : emoji}</span>
            <span class="vote-cand-text">
              <span class="vote-name">${escapeHtml(name)}${isMine ? ' <span class="vote-mine-badge">내 표</span>' : ""}</span>
              <span class="vote-tags">${tags}</span>
            </span>
            <span class="vote-count">${count}표<span class="vote-pct">${pct}%</span></span>
          </button>
          <button type="button" class="vote-info-btn${expanded ? " on" : ""}" data-act="info" data-id="${escapeHtml(id)}" aria-label="식당 정보" aria-expanded="${expanded}">ℹ️</button>
        </div>
        <div class="vote-detail${expanded ? "" : " hidden"}">${r ? candidateDetailHtml(r) : '<p class="vote-d-row">삭제된 맛집이에요.</p>'}</div>
      </div>`;
  }).join("");

  const actions = closed
    ? `<button type="button" class="btn-ghost" data-act="copy">🔗 링크 복사</button>
       <button type="button" class="btn-primary" data-act="new">🗳️ 새 투표 만들기</button>`
    : `<button type="button" class="btn-ghost" data-act="copy">🔗 링크 복사</button>
       <button type="button" class="btn-ghost" data-act="add-open">➕ 후보 추가</button>
       <button type="button" class="btn-ghost" data-act="new">🗳️ 새 투표</button>
       <button type="button" class="btn-danger" data-act="end">투표 종료</button>`;

  voteBody.innerHTML = `
    <h2 class="vote-title">${escapeHtml(poll.title || "투표")} ${closed ? '<span class="vote-status">종료됨</span>' : ""}</h2>
    <p class="vote-sub">${closed ? "종료된 투표예요." : "원하는 곳을 눌러 투표하세요. 다시 누르면 취소, 다른 곳을 누르면 표가 이동해요."} · 총 <b>${total}</b>표</p>
    <div class="vote-cands">${cards || '<p class="vote-empty">후보가 없어요.</p>'}</div>
    <div class="modal-actions vote-actions">${actions}</div>
  `;
}

// 후보 카드 안에서 펼쳐지는 식당 정보
function candidateDetailHtml(r) {
  const { escapeHtml, walkInfo } = deps;
  const w = walkInfo ? walkInfo(r.lat, r.lng) : null;
  const kakaoUrl = r.placeUrl
    ? r.placeUrl
    : `https://map.kakao.com/link/search/${encodeURIComponent(r.name)}`;
  const naverUrl = `https://map.naver.com/p/search/${encodeURIComponent(r.name)}`;
  const reviews = Array.isArray(r.reviews) ? r.reviews : [];
  return `
    ${w ? `<p class="vote-d-row">🚶 회사에서 도보 약 ${w.min}분 · ${w.meters}m</p>` : ""}
    ${r.recommendedMenu ? `<p class="vote-d-row">👍 ${escapeHtml(r.recommendedMenu)}</p>` : ""}
    ${r.memo ? `<p class="vote-d-row">📝 ${escapeHtml(r.memo)}</p>` : ""}
    ${r.address ? `<p class="vote-d-row">📍 ${escapeHtml(r.address)}</p>` : ""}
    ${reviews.length ? `<p class="vote-d-row">💬 후기 ${reviews.length}개</p>` : ""}
    <div class="vote-d-links">
      <a href="${escapeHtml(kakaoUrl)}" target="_blank" rel="noopener">🗺️ 카카오맵</a>
      <a href="${escapeHtml(naverUrl)}" target="_blank" rel="noopener">🟢 네이버지도</a>
    </div>`;
}

// 공유 링크 복사 (현재 활성 폴을 여는 #vote 링크)
function copyShareLink(btn) {
  const url = location.origin + location.pathname + "#vote";
  const done = () => {
    const old = btn.textContent;
    btn.textContent = "복사됨! ✅";
    setTimeout(() => { btn.textContent = old; }, 1500);
  };
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(url).then(done).catch(() => prompt("링크를 복사하세요:", url));
  } else {
    prompt("링크를 복사하세요:", url);
  }
}

async function castVote(rid) {
  if (!activePoll || activePoll.status === "closed") return;
  const pollId = activePoll.id;
  const prev = myVote(pollId);
  const ref = doc(db, "polls", pollId);
  try {
    if (prev === rid) {
      await updateDoc(ref, { ["votes." + rid]: increment(-1) });
      setMyVote(pollId, null);
    } else if (prev) {
      await updateDoc(ref, {
        ["votes." + prev]: increment(-1),
        ["votes." + rid]: increment(1),
      });
      setMyVote(pollId, rid);
    } else {
      await updateDoc(ref, { ["votes." + rid]: increment(1) });
      setMyVote(pollId, rid);
    }
  } catch (err) {
    console.error("투표 실패:", err);
    alert("투표에 실패했습니다. 콘솔을 확인해주세요.");
  }
}

// --- 후보 체크리스트 (생성/추가 공용) ---
function candidateChecklist(excludeIds) {
  const { escapeHtml, categoryColor, CATEGORY_EMOJI, getCategories, getRestaurants } = deps;
  const list = getRestaurants().filter((r) => !excludeIds.includes(r.id));
  if (!list.length) {
    return `<p class="vote-empty">추가할 수 있는 맛집이 없어요. 먼저 맛집을 등록해주세요.</p>`;
  }
  const rows = list.map((r) => {
    const cats = getCategories(r);
    const emoji = CATEGORY_EMOJI[cats[0]] || "🍴";
    const tags = cats.map((cat) => {
      const c = categoryColor(cat);
      return `<span class="tag tag-cat" style="background:${c.bg};color:${c.fg}">${escapeHtml(cat)}</span>`;
    }).join("");
    const nameLower = escapeHtml(String(r.name || "").toLowerCase());
    return `
      <label class="vote-pick-row" data-name="${nameLower}">
        <input type="checkbox" class="vote-pick" value="${escapeHtml(r.id)}" />
        <span class="vote-emoji">${emoji}</span>
        <span class="vote-pick-text">
          <span class="vote-name">${escapeHtml(r.name)}</span>
          <span class="vote-tags">${tags}</span>
        </span>
      </label>`;
  }).join("");
  return `
    <input type="text" class="vote-cand-search" placeholder="🔍 맛집 이름 검색" />
    <div class="vote-picklist">${rows}<p class="vote-pick-empty" hidden>검색 결과가 없어요 🥲</p></div>`;
}

// 후보 체크리스트에서 이름으로 필터 (다시 그리지 않고 숨김/표시 → 체크·포커스 유지)
function onBodySearch(e) {
  if (!e.target.classList.contains("vote-cand-search")) return;
  const term = e.target.value.trim().toLowerCase();
  let shown = 0;
  voteBody.querySelectorAll(".vote-pick-row").forEach((row) => {
    const match = !term || (row.dataset.name || "").includes(term);
    row.hidden = !match;
    if (match) shown++;
  });
  const empty = voteBody.querySelector(".vote-pick-empty");
  if (empty) empty.hidden = shown > 0;
}

function pickedIds() {
  return [...voteBody.querySelectorAll(".vote-pick:checked")].map((el) => el.value);
}

// --- 새 투표 만들기 ---
function renderCreate() {
  voteBody.innerHTML = `
    <h2 class="vote-title">🗳️ 새 투표 만들기</h2>
    <label class="vote-field">투표 제목
      <input type="text" id="voteTitleInput" maxlength="50" placeholder="예: 오늘 점심 뭐 먹지?" />
    </label>
    <p class="vote-sub">후보로 올릴 맛집을 골라주세요. (2곳 이상)</p>
    ${candidateChecklist([])}
    <div class="modal-actions vote-actions">
      ${activePoll ? '<button type="button" class="btn-ghost" data-act="back">취소</button>' : ""}
      <button type="button" class="btn-primary" data-act="create-submit">투표 시작</button>
    </div>
  `;
  const t = document.getElementById("voteTitleInput");
  if (t) t.focus();
}

async function createPoll() {
  const titleEl = document.getElementById("voteTitleInput");
  const title = (titleEl?.value || "").trim() || "오늘 뭐 먹지? 🗳️";
  const candidateIds = pickedIds();
  if (candidateIds.length < 2) {
    alert("후보를 2곳 이상 선택해주세요.");
    return;
  }
  try {
    // 이전 활성 폴 종료 처리 (최신 폴만 노출되지만 상태도 정리)
    if (activePoll && activePoll.status !== "closed") {
      await updateDoc(doc(db, "polls", activePoll.id), { status: "closed" });
    }
    await addDoc(collection(db, "polls"), {
      title,
      candidateIds,
      votes: {},
      status: "open",
      createdAt: serverTimestamp(),
    });
    uiMode = "view";
    // 구독 스냅샷이 새 폴을 렌더링. 즉시 반응을 위해 로딩 표시.
    voteBody.innerHTML = `<p class="vote-empty">투표를 만드는 중… ⏳</p>`;
  } catch (err) {
    console.error("투표 생성 실패:", err);
    alert("투표 생성에 실패했습니다. 콘솔을 확인해주세요.");
  }
}

// --- 후보 추가 ---
function renderAddCandidates() {
  const exclude = Array.isArray(activePoll?.candidateIds) ? activePoll.candidateIds : [];
  voteBody.innerHTML = `
    <h2 class="vote-title">➕ 후보 추가</h2>
    <p class="vote-sub">추가할 맛집을 골라주세요.</p>
    ${candidateChecklist(exclude)}
    <div class="modal-actions vote-actions">
      <button type="button" class="btn-ghost" data-act="back">취소</button>
      <button type="button" class="btn-primary" data-act="add-submit">추가</button>
    </div>
  `;
}

async function addCandidates() {
  if (!activePoll) return;
  const ids = pickedIds();
  if (!ids.length) { alert("추가할 맛집을 선택해주세요."); return; }
  try {
    await updateDoc(doc(db, "polls", activePoll.id), {
      candidateIds: arrayUnion(...ids),
    });
    uiMode = "view";
    render();
  } catch (err) {
    console.error("후보 추가 실패:", err);
    alert("후보 추가에 실패했습니다. 콘솔을 확인해주세요.");
  }
}

async function endPoll() {
  if (!activePoll || activePoll.status === "closed") return;
  if (!confirm("투표를 종료할까요? 종료 후에는 결과만 볼 수 있어요.")) return;
  try {
    await updateDoc(doc(db, "polls", activePoll.id), { status: "closed" });
  } catch (err) {
    console.error("투표 종료 실패:", err);
    alert("투표 종료에 실패했습니다. 콘솔을 확인해주세요.");
  }
}

// --- 이벤트 위임 ---
function onBodyClick(e) {
  const el = e.target.closest("[data-act]");
  if (!el) return;
  const act = el.dataset.act;
  switch (act) {
    case "vote": castVote(el.dataset.id); break;
    case "info": {
      const id = el.dataset.id;
      if (expandedIds.has(id)) expandedIds.delete(id); else expandedIds.add(id);
      render();
      break;
    }
    case "copy": copyShareLink(el); break;
    case "create-submit": createPoll(); break;
    case "add-open": uiMode = "add"; render(); break;
    case "add-submit": addCandidates(); break;
    case "end": endPoll(); break;
    case "new": uiMode = "create"; render(); break;
    case "back": uiMode = "view"; render(); break;
  }
}
