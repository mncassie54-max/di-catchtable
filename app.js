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

// 기본 카테고리 색상 (배경, 글자)
const CATEGORY_COLORS = {
  "한식": ["#fde8e8", "#d9534a"],
  "중식": ["#fff0e0", "#e07b39"],
  "일식": ["#e4f0ff", "#3b7dd8"],
  "양식": ["#fbeaf3", "#c2569a"],
  "분식": ["#fff6da", "#bf921a"],
  "카페": ["#ece4dd", "#8a6d56"],
  "단체예약": ["#e6f3ea", "#2f9e76"],
  "기타": ["#ececf3", "#6b6f8a"],
};

// 카테고리 → {bg, fg}. 커스텀 카테고리는 이름 해시로 일관된 파스텔 색 배정.
function categoryColor(cat) {
  const fixed = CATEGORY_COLORS[cat];
  if (fixed) return { bg: fixed[0], fg: fixed[1] };
  let hash = 0;
  for (let i = 0; i < String(cat).length; i++) hash = (hash * 31 + cat.charCodeAt(i)) % 360;
  const h = (hash + 360) % 360;
  return { bg: `hsl(${h}, 70%, 92%)`, fg: `hsl(${h}, 55%, 38%)` };
}

// 맛집의 카테고리 목록 (신규: categories 배열 / 기존: category 문자열 호환)
function getCategories(r) {
  if (Array.isArray(r.categories) && r.categories.length) return r.categories;
  if (r.category) return [r.category];
  return ["기타"];
}

// 기본 카테고리 + 등록된 맛집들이 쓰는 커스텀 카테고리(중복 제거)
function allCategories() {
  const cats = [...DEFAULT_CATEGORIES];
  allRestaurants.forEach((r) => {
    getCategories(r).forEach((cat) => {
      if (cat && !cats.includes(cat)) cats.push(cat);
    });
  });
  return cats;
}

const listEl = document.getElementById("list");
const resultCountEl = document.getElementById("resultCount");
const filterCategory = document.getElementById("filterCategory");
const resetFilterBtn = document.getElementById("resetFilterBtn");
const catChips = document.getElementById("catChips");
const fCategoryNew = document.getElementById("fCategoryNew");
let selectedCategories = [];  // 등록/수정 모달에서 선택된 카테고리들

// 필터 카테고리 select를 현재 카테고리 목록으로 다시 채움
function renderCategoryOptions() {
  const cats = allCategories();
  const curFilter = filterCategory.value;
  filterCategory.innerHTML = `<option value="">🍽️ 카테고리 전체</option>` +
    cats.map((c) => `<option value="${escapeHtml(c)}">${CATEGORY_EMOJI[c] || "🍴"} ${escapeHtml(c)}</option>`).join("");
  filterCategory.value = curFilter;
}

// 등록/수정 모달의 카테고리 칩(복수 선택) 렌더
function renderCatChips() {
  const cats = [...new Set([...allCategories(), ...selectedCategories])];
  catChips.innerHTML = cats.map((cat) => {
    const on = selectedCategories.includes(cat);
    const c = categoryColor(cat);
    const style = on ? ` style="background:${c.bg};color:${c.fg};border-color:transparent"` : "";
    return `<button type="button" class="cat-chip${on ? " selected" : ""}" data-cat="${escapeHtml(cat)}"${style}>${CATEGORY_EMOJI[cat] || "🍴"} ${escapeHtml(cat)}</button>`;
  }).join("") + `<button type="button" class="cat-chip add-chip" id="catAddChip">➕ 직접 입력</button>`;
}

catChips.addEventListener("click", (e) => {
  const chip = e.target.closest(".cat-chip");
  if (!chip) return;
  if (chip.id === "catAddChip") {
    fCategoryNew.classList.toggle("hidden");
    if (!fCategoryNew.classList.contains("hidden")) fCategoryNew.focus();
    return;
  }
  const cat = chip.dataset.cat;
  if (selectedCategories.includes(cat)) {
    selectedCategories = selectedCategories.filter((x) => x !== cat);
  } else {
    selectedCategories.push(cat);
  }
  renderCatChips();
});

fCategoryNew.addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  e.preventDefault();
  const v = fCategoryNew.value.trim();
  if (v && !selectedCategories.includes(v)) selectedCategories.push(v);
  fCategoryNew.value = "";
  fCategoryNew.classList.add("hidden");
  renderCatChips();
});

let allRestaurants = [];  // 메모리 캐시 (Firestore 최신 스냅샷)
let mapReady = false;
let selectedLocation = null;  // 등록 모달에서 선택한 위치

function applyFilters(items) {
  const category = filterCategory.value;
  return items.filter((r) => !category || getCategories(r).includes(category));
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
      const cats = getCategories(r);
      return `
      <article class="card" data-id="${r.id}">
        <span class="emoji">${CATEGORY_EMOJI[cats[0]] || "🍴"}</span>
        <h3>${escapeHtml(r.name)}</h3>
        <div class="tags">
          ${cats.map((cat) => { const c = categoryColor(cat); return `<span class="tag tag-cat" style="background:${c.bg};color:${c.fg}">${escapeHtml(cat)}</span>`; }).join("")}
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
  selectedCategories = [];
  renderCatChips();
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
  selectedCategories = getCategories(r).slice();
  renderCatChips();
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
  selectedCategories = [];
  editingId = null;
  selectedLocation = null;
  if (mapReady) map.resetPicker();
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
  const categories = [...selectedCategories];
  if (!categories.length) {
    alert("카테고리를 1개 이상 선택해주세요.");
    return;
  }
  const data = {
    name,
    categories,
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
  const cats = getCategories(r);
  detailBody.innerHTML = `
    <span class="emoji">${CATEGORY_EMOJI[cats[0]] || "🍴"}</span>
    <h2>${escapeHtml(r.name)}</h2>
    <div class="tags">
      ${cats.map((cat) => { const c = categoryColor(cat); return `<span class="tag tag-cat" style="background:${c.bg};color:${c.fg}">${escapeHtml(cat)}</span>`; }).join("")}
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
