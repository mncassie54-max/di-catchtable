import { db, isConfigured } from "./firebase-config.js";
import { isMapConfigured } from "./map-config.js";
import * as map from "./map.js";
import {
  collection, onSnapshot, query, orderBy,
  addDoc, deleteDoc, doc, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const CATEGORY_EMOJI = {
  "한식": "🍚", "중식": "🍜", "일식": "🍣", "양식": "🍝",
  "분식": "🥟", "카페": "☕", "단체예약": "🍻", "기타": "🍴",
};

const listEl = document.getElementById("list");
const resultCountEl = document.getElementById("resultCount");
const filterCategory = document.getElementById("filterCategory");
const filterDistance = document.getElementById("filterDistance");
const filterPrice = document.getElementById("filterPrice");
const resetFilterBtn = document.getElementById("resetFilterBtn");

let allRestaurants = [];  // 메모리 캐시 (Firestore 최신 스냅샷)
let mapReady = false;
let selectedLocation = null;  // 등록 모달에서 선택한 위치

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
    listEl.innerHTML = `<div class="empty">조건에 맞는 맛집이 없어요 🥲<br/>필터를 바꾸거나 새로 등록해보세요.</div>`;
  } else {
    listEl.innerHTML = filtered.map((r) => `
      <article class="card" data-id="${r.id}">
        <span class="emoji">${CATEGORY_EMOJI[r.category] || "🍴"}</span>
        <h3>${escapeHtml(r.name)}</h3>
        <div class="tags">
          <span class="tag tag-cat">${escapeHtml(r.category)}</span>
          <span class="tag tag-dist">${escapeHtml(r.distance)}</span>
          <span class="tag tag-price">${escapeHtml(r.price)}</span>
        </div>
        ${r.recommendedMenu ? `<p class="rec">👍 ${escapeHtml(r.recommendedMenu)}</p>` : ""}
        ${r.memo ? `<p class="memo">📝 ${escapeHtml(r.memo)}</p>` : ""}
      </article>
    `).join("");
  }
  if (mapReady) map.renderPins(filtered);
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
  if (mapReady) map.openPicker();
}
function closeModal() {
  addModal.classList.add("hidden");
  addForm.reset();
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
  const payload = {
    name,
    category: document.getElementById("fCategory").value,
    distance: document.getElementById("fDistance").value,
    price: document.getElementById("fPrice").value,
    recommendedMenu: document.getElementById("fRecommend").value.trim(),
    phone: document.getElementById("fPhone").value.trim(),
    memo: document.getElementById("fMemo").value.trim(),
    createdAt: serverTimestamp(),
  };
  if (selectedLocation) {
    payload.lat = selectedLocation.lat;
    payload.lng = selectedLocation.lng;
    payload.address = selectedLocation.address;
  }
  try {
    await addDoc(collection(db, "restaurants"), payload);
    closeModal();
  } catch (err) {
    console.error("등록 실패:", err);
    alert("등록에 실패했습니다. 콘솔을 확인해주세요.");
  }
});

// --- 상세 모달 ---
const detailModal = document.getElementById("detailModal");
const detailBody = document.getElementById("detailBody");
const detailClose = document.getElementById("detailClose");

function closeDetail() {
  detailModal.classList.add("hidden");
  detailBody.innerHTML = "";
}

function telHref(phone) {
  return "tel:" + phone.replace(/[^0-9+]/g, "");
}

function openDetail(id) {
  const r = allRestaurants.find((x) => x.id === id);
  if (!r) return;
  const hasCoords = typeof r.lat === "number" && typeof r.lng === "number";
  detailBody.innerHTML = `
    <span class="emoji">${CATEGORY_EMOJI[r.category] || "🍴"}</span>
    <h2>${escapeHtml(r.name)}</h2>
    <div class="tags">
      <span class="tag tag-cat">${escapeHtml(r.category)}</span>
      <span class="tag tag-dist">${escapeHtml(r.distance)}</span>
      <span class="tag tag-price">${escapeHtml(r.price)}</span>
    </div>
    ${r.recommendedMenu ? `<p class="detail-row">👍 <b>추천메뉴</b> · ${escapeHtml(r.recommendedMenu)}</p>` : ""}
    ${r.memo ? `<p class="detail-row">📝 ${escapeHtml(r.memo)}</p>` : ""}
    ${r.address ? `<p class="detail-row">📍 ${escapeHtml(r.address)}</p>` : ""}
    ${r.phone ? `<p class="detail-row">📞 <a href="${escapeHtml(telHref(r.phone))}">${escapeHtml(r.phone)}</a></p>` : ""}
    ${hasCoords ? `<div id="detailMap" class="detail-map"></div>` : ""}
    <div class="modal-actions">
      <button type="button" class="btn-danger" id="detailDeleteBtn">삭제</button>
    </div>
  `;
  detailModal.classList.remove("hidden");

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
