// ↓↓↓ Kakao Developers에서 발급받은 JavaScript 키로 교체하세요 (README.md 참고) ↓↓↓
export const KAKAO_APP_KEY = "320df390f8992c4183604cf0a4b2a0ca";
// ↑↑↑ 여기까지 교체 ↑↑↑

export const isMapConfigured = KAKAO_APP_KEY !== "YOUR_KAKAO_JS_KEY";

// 회사 위치(그랜드센트럴, 서울 중구 세종대로 14) — 지도 기본 중심
export const COMPANY = {
  name: "🏢 그랜드센트럴 (회사)",
  address: "서울특별시 중구 세종대로 14 (그랜드센트럴)",
  lat: 37.5578385,
  lng: 126.9744151,
};
