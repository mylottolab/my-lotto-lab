// ── Firebase 설정 ──
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, deleteDoc, doc, query, orderBy } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAA-cobF-TFDvFu7qclg0tzjotCjcGJmdI",
  authDomain: "my-lotto-lab.firebaseapp.com",
  projectId: "my-lotto-lab",
  storageBucket: "my-lotto-lab.firebasestorage.app",
  messagingSenderId: "410492520664",
  appId: "1:410492520664:web:3a7f8ba515d80b64536fad"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const COL = "lotto_numbers";

// ── 번호 저장 ──
export async function saveNumbers(items) {
  const results = [];
  for (const item of items) {
    const docRef = await addDoc(collection(db, COL), {
      ...item,
      createdAt: Date.now()
    });
    results.push(docRef.id);
  }
  return results;
}

// ── 전체 번호 불러오기 ──
export async function loadNumbers() {
  const q = query(collection(db, COL), orderBy("createdAt", "desc"));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
}

// ── 번호 삭제 ──
export async function deleteNumber(id) {
  await deleteDoc(doc(db, COL, id));
}

// ── 회차 계산 공통 함수 ──
export function calcCurrentRound() {
  const ROUND1 = new Date('2002-12-07T20:45:00+09:00').getTime();
  const WEEK = 7 * 24 * 60 * 60 * 1000;
  const elapsed = Date.now() - ROUND1;
  return elapsed < 0 ? 0 : Math.floor(elapsed / WEEK) + 1;
}

// ── 볼 색상 ──
export const BC = n => n <= 10 ? '#f5c518' : n <= 20 ? '#1a7ad4' : n <= 30 ? '#e03131' : n <= 40 ? '#888' : '#2f9e44';
export const TC = n => n <= 10 ? '#7a5e00' : '#fff';

// ── 동행복권 QR URL 파싱 ──
export function parseLottoQrUrl(url) {
  try {
    const match = url.match(/[?&]v=([^&]+)/);
    if (!match) return null;
    const v = match[1];
    const roundMatch = v.match(/^(\d+)/);
    if (!roundMatch) return null;
    const round = parseInt(roundMatch[1]);
    const comboPattern = /([mqs])(\d{12})/g;
    const combos = [];
    const labels = ['A','B','C','D','E','F','G','H','I','J'];
    let m;
    while ((m = comboPattern.exec(v)) !== null) {
      const type = m[1] === 'm' ? '수동' : m[1] === 'q' ? '자동' : '반자동';
      const nums = [];
      for (let i = 0; i < 12; i += 2) nums.push(parseInt(m[2].slice(i, i + 2)));
      if (nums.length === 6 && nums.every(n => n >= 1 && n <= 45) && new Set(nums).size === 6) {
        combos.push({ label: labels[combos.length], type, nums });
      }
    }
    if (!round || !combos.length) return null;
    return { round, combos };
  } catch(e) { return null; }
}
