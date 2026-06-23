import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAEwHLR1ebzFOilYrdZSK1KqOiIXyvQXU4",
  authDomain: "di-catchtable.firebaseapp.com",
  databaseURL: "https://di-catchtable-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "di-catchtable",
  storageBucket: "di-catchtable.firebasestorage.app",
  messagingSenderId: "372674251247",
  appId: "1:372674251247:web:7dc61e33fbe07a58668e1a",
};

export const isConfigured = firebaseConfig.apiKey !== "YOUR_API_KEY";

let db = null;
if (isConfigured) {
  const app = initializeApp(firebaseConfig);
  db = getFirestore(app);
}
export { db };
