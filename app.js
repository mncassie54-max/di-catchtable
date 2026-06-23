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

function init() {
  if (!isConfigured) {
    document.getElementById("configWarning").classList.remove("hidden");
    resultCountEl.textContent = "";
    return;
  }
  subscribe();
}

init();
