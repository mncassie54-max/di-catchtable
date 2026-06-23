import { KAKAO_APP_KEY, COMPANY } from "./map-config.js";

let mainMap = null;
let pinMarkers = [];
let openInfo = null;

let pickerMap = null;
let pickerMarker = null;
let pickerPlaces = null;
let pickerCfg = null;

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

function companyCenter() {
  return new kakao.maps.LatLng(COMPANY.lat, COMPANY.lng);
}

// Kakao SDK를 동적으로 로드 (services 라이브러리 포함)
function loadSdk() {
  return new Promise((resolve, reject) => {
    if (window.kakao && window.kakao.maps) {
      resolve();
      return;
    }
    const s = document.createElement("script");
    s.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${KAKAO_APP_KEY}&libraries=services&autoload=false`;
    s.onload = () => window.kakao.maps.load(resolve);
    s.onerror = () => reject(new Error("Kakao SDK 로드 실패"));
    document.head.appendChild(s);
  });
}

// 메인 지도 생성 + 회사 마커 표시
export async function init({ mainMapId }) {
  await loadSdk();
  const el = document.getElementById(mainMapId);
  mainMap = new kakao.maps.Map(el, { center: companyCenter(), level: 4 });

  const companyMarker = new kakao.maps.Marker({
    position: companyCenter(),
    map: mainMap,
  });
  const info = new kakao.maps.InfoWindow({
    content: `<div class="map-info map-info-company">${esc(COMPANY.name)}</div>`,
  });
  info.open(mainMap, companyMarker);
}

// 필터된 맛집 목록을 핀으로 표시 (lat/lng 있는 것만)
export function renderPins(restaurants) {
  if (!mainMap) return;
  pinMarkers.forEach((m) => m.setMap(null));
  pinMarkers = [];
  restaurants.forEach((r) => {
    if (typeof r.lat !== "number" || typeof r.lng !== "number") return;
    const pos = new kakao.maps.LatLng(r.lat, r.lng);
    const marker = new kakao.maps.Marker({ position: pos, map: mainMap });
    kakao.maps.event.addListener(marker, "click", () => {
      if (openInfo) openInfo.close();
      openInfo = new kakao.maps.InfoWindow({
        content: `<div class="map-info">${esc(r.name)}</div>`,
      });
      openInfo.open(mainMap, marker);
    });
    pinMarkers.push(marker);
  });
}

// 등록 모달의 장소 검색 + 미니 지도 picker 연결
export function setupPicker(cfg) {
  pickerCfg = cfg;
  pickerPlaces = new kakao.maps.services.Places();

  const input = document.getElementById(cfg.inputId);
  const btn = document.getElementById(cfg.btnId);
  const results = document.getElementById(cfg.resultsId);

  const doSearch = () => {
    const kw = input.value.trim();
    if (!kw) return;
    pickerPlaces.keywordSearch(kw, (data, status) => {
      results.innerHTML = "";
      if (status !== kakao.maps.services.Status.OK) {
        results.innerHTML = `<li class="place-empty">검색 결과가 없어요</li>`;
        return;
      }
      data.slice(0, 8).forEach((p) => {
        const li = document.createElement("li");
        li.className = "place-item";
        li.innerHTML = `<strong>${esc(p.place_name)}</strong><span>${esc(p.road_address_name || p.address_name)}</span>`;
        li.addEventListener("click", () => selectPlace(p));
        results.appendChild(li);
      });
    });
  };

  btn.addEventListener("click", doSearch);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      doSearch();
    }
  });
}

function ensurePickerMap() {
  if (pickerMap) return;
  const el = document.getElementById(pickerCfg.miniMapId);
  pickerMap = new kakao.maps.Map(el, { center: companyCenter(), level: 4 });
  pickerMarker = new kakao.maps.Marker({});
}

function selectPlace(p) {
  const lat = parseFloat(p.y);
  const lng = parseFloat(p.x);
  const pos = new kakao.maps.LatLng(lat, lng);
  ensurePickerMap();
  pickerMap.relayout();
  pickerMap.setCenter(pos);
  pickerMap.setLevel(3);
  pickerMarker.setPosition(pos);
  pickerMarker.setMap(pickerMap);

  document.getElementById(pickerCfg.resultsId).innerHTML = "";
  document.getElementById(pickerCfg.inputId).value = p.place_name;
  const addr = p.road_address_name || p.address_name;
  document.getElementById(pickerCfg.addressOutId).textContent = "📍 " + addr;

  pickerCfg.onSelect({ lat, lng, address: addr, placeName: p.place_name });
}

// 모달이 열릴 때 미니 지도 크기 보정
export function openPicker() {
  ensurePickerMap();
  setTimeout(() => pickerMap && pickerMap.relayout(), 0);
}

// 모달을 닫거나 저장한 뒤 picker 초기화
export function resetPicker() {
  if (!pickerCfg) return;
  if (pickerMarker) pickerMarker.setMap(null);
  document.getElementById(pickerCfg.addressOutId).textContent = "";
  document.getElementById(pickerCfg.resultsId).innerHTML = "";
}
