import { db, isConfigured } from "./firebase-config.js";
import { isMapConfigured, COMPANY } from "./map-config.js";
import * as map from "./map.js";
import {
  collection, onSnapshot, query, orderBy,
  addDoc, deleteDoc, updateDoc, doc, serverTimestamp, arrayUnion,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const CATEGORY_EMOJI = {
  "한식": "🍚", "중식": "🍜", "일식": "🍣", "양식": "🍝",
  "분식": "🥟", "카페": "☕", "단체예약": "🍻", "기타": "🍴",
};
const DEFAULT_CATEGORIES = ["한식", "중식", "일식", "양식", "분식", "카페", "단체예약", "기타"];

// 기본 카테고리 + 등록된 맛집들이 쓰는 커스텀 카테고리(중복 제거)
function allCategories() {
  const cats = [...DEFAULT_CATEGORIES];
  allRestaurants.forEach((r) => {
    if (r.category && !cats.includes(r.category)) cats.push(r.category);
  });
  return cats;
}

const listEl = document.getElementById("list");
const resultCountEl = document.getElementById("resultCount");
const filterCategory = document.getElementById("filterCategory");
const resetFilterBtn = document.getElementById("resetFilterBtn");
const fCategory = document.getElementById("fCategory");
const fCategoryNew = document.getElementById("fCategoryNew");

// 카테고리 select(필터 + 등록폼)을 현재 카테고리 목록으로 다시 채움
function renderCategoryOptions() {
  const cats = allCategories();
  const opt = (c) => `<option value="${escapeHtml(c)}">${CATEGORY_EMOJI[c] || "🍴"} ${escapeHtml(c)}</option>`;

  const curFilter = filterCategory.value;
  filterCategory.innerHTML = `<option value="">🍽️ 카테고리 전체</option>` + cats.map(opt).join("");
  filterCategory.value = curFilter;

  // 등록/수정 모달이 열려있는 동안엔 사용자의 선택을 건드리지 않음
  if (addModal.classList.contains("hidden")) {
    fCategory.innerHTML = cats.map(opt).join("") + `<option value="__new__">➕ 직접 입력…</option>`;
  }
}

let allRestaurants = [];  // 메모리 캐시 (Firestore 최신 스냅샷)
let mapReady = false;
let selectedLocation = null;  // 등록 모달에서 선택한 위치

function applyFilters(items) {
  const category = filterCategory.value;
  return items.filter((r) => !category || r.category === category);
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

// 회사(그랜드센트럴) 기준 도보 거리/시간 추정 (직선거리 × 우회보정, 도보 약 4km/h)
function walkInfo(lat, lng) {
  if (typeof lat !== "number" || typeof lng !== "number") return null;
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat - COMPANY.lat);
  const dLng = toRad(lng - COMPANY.lng);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(COMPANY.lat)) * Math.cos(toRad(lat)) * Math.sin(dLng / 2) ** 2;
  const straight = 2 * R * Math.asin(Math.sqrt(a));
  const walkM = straight * 1.3;                       // 도로 우회 보정
  const min = Math.max(1, Math.round(walkM / 67));    // 도보 약 4km/h
  const meters = Math.round(walkM / 10) * 10;
  return { min, meters };
}

function render() {
  renderCategoryOptions();
  const filtered = applyFilters(allRestaurants);
  resultCountEl.textContent = `${filtered.length}곳`;
  if (filtered.length === 0) {
    listEl.innerHTML = `<div class="empty">조건에 맞는 맛집이 없어요 🥲<br/>필터를 바꾸거나 새로 등록해보세요.</div>`;
  } else {
    listEl.innerHTML = filtered.map((r) => {
      const w = walkInfo(r.lat, r.lng);
      return `
      <article class="card" data-id="${r.id}">
        <span class="emoji">${CATEGORY_EMOJI[r.category] || "🍴"}</span>
        <h3>${escapeHtml(r.name)}</h3>
        <div class="tags">
          <span class="tag tag-cat">${escapeHtml(r.category)}</span>
        </div>
        ${w ? `<p class="walk">🚶 도보 약 ${w.min}분 · ${w.meters}m</p>` : ""}
        ${r.recommendedMenu ? `<p class="rec">👍 ${escapeHtml(r.recommendedMenu)}</p>` : ""}
        ${r.memo ? `<p class="memo">📝 ${escapeHtml(r.memo)}</p>` : ""}
      </article>
    `;
    }).join("");
  }
  if (mapReady) map.renderPins(filtered);
}

filterCategory.addEventListener("change", render);
resetFilterBtn.addEventListener("click", () => {
  filterCategory.value = "";
  render();
});

function subscribe() {
  const q = query(collection(db, "restaurants"), orderBy("createdAt", "desc"));
  onSnapshot(q, (snap) => {
    allRestaurants = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    render();
    // 상세 모달이 열려 있으면 후기 등 최신 내용 반영 (후기 입력 중이면 건너뜀)
    if (openDetailId && !detailModal.classList.contains("hidden")) {
      const active = document.activeElement;
      if (!active || active.id !== "reviewInput") openDetail(openDetailId);
    }
  }, (err) => {
    console.error("Firestore 구독 실패:", err);
    alert("데이터를 불러오지 못했습니다. 콘솔을 확인해주세요.");
  });
}

// --- 등록/수정 모달 ---
const addModal = document.getElementById("addModal");
const openAddBtn = document.getElementById("openAddBtn");
const cancelAddBtn = document.getElementById("cancelAddBtn");
const addForm = document.getElementById("addForm");
const modalTitle = document.getElementById("modalTitle");
const submitBtn = document.getElementById("submitBtn");

let editingId = null;  // null이면 신규 등록, 값이 있으면 수정

// 신규 등록 모달 열기
function openModal() {
  if (!isConfigured) {
    alert("Firebase 설정이 필요합니다. README.md를 참고해주세요.");
    return;
  }
  editingId = null;
  modalTitle.textContent = "맛집 등록 🍳";
  submitBtn.textContent = "저장";
  fCategoryNew.classList.add("hidden");
  addModal.classList.remove("hidden");
  document.getElementById("fName").focus();
  if (mapReady) map.openPicker();
}

// 수정 모달 열기 (기존 값으로 채움)
function openEditModal(r) {
  closeDetail();
  editingId = r.id;
  modalTitle.textContent = "맛집 수정 ✏️";
  submitBtn.textContent = "수정 저장";
  document.getElementById("fName").value = r.name || "";
  fCategory.value = r.category || "기타";
  fCategoryNew.classList.add("hidden");
  document.getElementById("fRecommend").value = r.recommendedMenu || "";
  document.getElementById("fMemo").value = r.memo || "";
  const hasCoords = typeof r.lat === "number" && typeof r.lng === "number";
  if (hasCoords) {
    selectedLocation = { lat: r.lat, lng: r.lng, address: r.address || "", placeUrl: r.placeUrl || "", phone: r.phone || "" };
    document.getElementById("selectedAddr").textContent = r.address ? "📍 " + r.address : "";
  } else {
    selectedLocation = null;
  }
  addModal.classList.remove("hidden");
  if (mapReady) {
    map.openPicker();
    if (hasCoords) map.showPickerLocation(r.lat, r.lng);
  }
}

function closeModal() {
  addModal.classList.add("hidden");
  addForm.reset();
  fCategoryNew.classList.add("hidden");
  editingId = null;
  selectedLocation = null;
  if (mapReady) map.resetPicker();
}

// 카테고리에서 '직접 입력' 선택 시 입력칸 표시
fCategory.addEventListener("change", () => {
  if (fCategory.value === "__new__") {
    fCategoryNew.classList.remove("hidden");
    fCategoryNew.focus();
  } else {
    fCategoryNew.classList.add("hidden");
  }
});

openAddBtn.addEventListener("click", openModal);
cancelAddBtn.addEventListener("click", closeModal);
addModal.addEventListener("click", (e) => {
  if (e.target === addModal) closeModal();
});

addForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = document.getElementById("fName").value.trim();
  if (!name) return;
  let category = fCategory.value;
  if (category === "__new__") category = fCategoryNew.value.trim() || "기타";
  const data = {
    name,
    category,
    recommendedMenu: document.getElementById("fRecommend").value.trim(),
    memo: document.getElementById("fMemo").value.trim(),
  };
  if (selectedLocation) {
    data.lat = selectedLocation.lat;
    data.lng = selectedLocation.lng;
    data.address = selectedLocation.address;
    data.placeUrl = selectedLocation.placeUrl || "";
    data.phone = selectedLocation.phone || "";  // 카카오 검색 결과의 전화번호 자동 저장
  }
  try {
    if (editingId) {
      await updateDoc(doc(db, "restaurants", editingId), data);
    } else {
      await addDoc(collection(db, "restaurants"), { ...data, createdAt: serverTimestamp() });
    }
    closeModal();
  } catch (err) {
    console.error("저장 실패:", err);
    alert("저장에 실패했습니다. 콘솔을 확인해주세요.");
  }
});

// --- 상세 모달 ---
const detailModal = document.getElementById("detailModal");
const detailBody = document.getElementById("detailBody");
const detailClose = document.getElementById("detailClose");

let openDetailId = null;  // 현재 열려있는 상세 맛집 id

function closeDetail() {
  detailModal.classList.add("hidden");
  detailBody.innerHTML = "";
  openDetailId = null;
}

function telHref(phone) {
  return "tel:" + phone.replace(/[^0-9+]/g, "");
}

function formatReviewDate(at) {
  if (!at) return "";
  const d = new Date(at);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function openDetail(id) {
  const r = allRestaurants.find((x) => x.id === id);
  if (!r) return;
  const hasCoords = typeof r.lat === "number" && typeof r.lng === "number";
  const w = walkInfo(r.lat, r.lng);
  const kakaoUrl = r.placeUrl
    ? r.placeUrl
    : `https://map.kakao.com/link/search/${encodeURIComponent(r.name)}`;
  const naverUrl = `https://map.naver.com/p/search/${encodeURIComponent(r.name)}`;
  const reviews = Array.isArray(r.reviews) ? r.reviews : [];
  const reviewsHtml = reviews.length
    ? reviews.slice().reverse().map((rv) =>
        `<li><span class="rv-text">${escapeHtml(rv.text)}</span><span class="rv-date">${formatReviewDate(rv.at)}</span></li>`
      ).join("")
    : `<li class="rv-empty">아직 후기가 없어요. 첫 후기를 남겨보세요! 🙌</li>`;
  openDetailId = id;
  detailBody.innerHTML = `
    <span class="emoji">${CATEGORY_EMOJI[r.category] || "🍴"}</span>
    <h2>${escapeHtml(r.name)}</h2>
    <div class="tags">
      <span class="tag tag-cat">${escapeHtml(r.category)}</span>
    </div>
    ${w ? `<p class="detail-row">🚶 <b>회사에서 도보</b> 약 ${w.min}분 · ${w.meters}m <span class="est">(직선거리 기준 추정)</span></p>` : ""}
    ${r.recommendedMenu ? `<p class="detail-row">👍 <b>추천메뉴</b> · ${escapeHtml(r.recommendedMenu)}</p>` : ""}
    ${r.memo ? `<p class="detail-row">📝 ${escapeHtml(r.memo)}</p>` : ""}
    ${r.address ? `<p class="detail-row">📍 ${escapeHtml(r.address)}</p>` : ""}
    ${r.phone ? `<p class="detail-row">📞 <a href="${escapeHtml(telHref(r.phone))}">${escapeHtml(r.phone)}</a></p>` : ""}
    <div class="map-links">
      <a href="${escapeHtml(kakaoUrl)}" target="_blank" rel="noopener">🗺️ 카카오맵</a>
      <a href="${escapeHtml(naverUrl)}" target="_blank" rel="noopener">🟢 네이버지도</a>
    </div>
    ${(mapReady && hasCoords) ? `<div id="detailMap" class="detail-map"></div>` : ""}
    <div class="reviews">
      <h3 class="reviews-title">💬 다녀온 후기 (${reviews.length})</h3>
      <ul class="review-list">${reviewsHtml}</ul>
      <div class="review-add">
        <input type="text" id="reviewInput" maxlength="100" placeholder="예: 마라탕 강추! 1시 이후 웨이팅 없어요" />
        <button type="button" id="reviewAddBtn" class="btn-primary">남기기</button>
      </div>
    </div>
    <div class="modal-actions">
      <button type="button" class="btn-danger" id="detailDeleteBtn">삭제</button>
      <button type="button" class="btn-primary" id="detailEditBtn">수정</button>
    </div>
  `;
  detailModal.classList.remove("hidden");

  document.getElementById("detailEditBtn").addEventListener("click", () => openEditModal(r));

  const reviewInput = document.getElementById("reviewInput");
  const submitReview = async () => {
    const text = reviewInput.value.trim();
    if (!text) return;
    try {
      await updateDoc(doc(db, "restaurants", id), {
        reviews: arrayUnion({ text, at: Date.now() }),
      });
      reviewInput.value = "";
    } catch (err) {
      console.error("후기 저장 실패:", err);
      alert("후기 저장에 실패했습니다. 콘솔을 확인해주세요.");
    }
  };
  document.getElementById("reviewAddBtn").addEventListener("click", submitReview);
  reviewInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); submitReview(); }
  });

  document.getElementById("detailDeleteBtn").addEventListener("click", async () => {
    if (!confirm("이 맛집을 삭제할까요?")) return;
    try {
      await deleteDoc(doc(db, "restaurants", id));
      closeDetail();
    } catch (err) {
      console.error("삭제 실패:", err);
      alert("삭제에 실패했습니다. 콘솔을 확인해주세요.");
    }
  });

  if (mapReady && hasCoords) {
    map.showDetailMap("detailMap", r.lat, r.lng, r.name);
  }
}

listEl.addEventListener("click", (e) => {
  const card = e.target.closest(".card");
  if (!card) return;
  openDetail(card.dataset.id);
});
detailClose.addEventListener("click", closeDetail);
detailModal.addEventListener("click", (e) => {
  if (e.target === detailModal) closeDetail();
});

// --- 지도 설정 ---
async function setupMap() {
  const notice = document.getElementById("mapNotice");
  if (!isMapConfigured) {
    notice.textContent = "🗺️ 카카오맵 키가 필요해요. README의 '지도 설정'을 참고해 map-config.js를 채워주세요.";
    notice.classList.remove("hidden");
    return;
  }
  try {
    await map.init({ mainMapId: "mainMap" });
    map.setupPicker({
      inputId: "placeSearch",
      btnId: "placeSearchBtn",
      resultsId: "placeResults",
      miniMapId: "pickerMap",
      addressOutId: "selectedAddr",
      onSelect: (loc) => { selectedLocation = loc; },
    });
    document.getElementById("locationField").classList.remove("hidden");
    mapReady = true;
    render();  // 이미 로드된 데이터가 있으면 핀 표시
  } catch (err) {
    console.error("지도 로드 실패:", err);
    notice.textContent = "🗺️ 지도를 불러오지 못했어요. 카카오 키와 도메인 등록을 확인해주세요.";
    notice.classList.remove("hidden");
  }
}

function init() {
  if (!isConfigured) {
    document.getElementById("configWarning").classList.remove("hidden");
    resultCountEl.textContent = "";
  } else {
    subscribe();
  }
  setupMap();
}

init();
