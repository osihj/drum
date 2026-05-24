// ═══════════════════════════════════════════════════
//  notification-manager.js  ─  drum（自律打卡）站
//  依賴：window.firebaseDB 已由 Firebase module 初始化
//  ✅ 不需要 sw.js，直接用 Notification API 顯示通知
// ═══════════════════════════════════════════════════

import {
  doc, getDoc, setDoc, onSnapshot, collection, addDoc, deleteDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const NOTIF_DOC = () => doc(window.firebaseDB, 'adminData', 'notifications');
const SCHEDULED_COL = () => collection(window.firebaseDB, 'adminData', 'notifications', 'scheduled');

// ── 1. 初始化：申請通知權限，監聽 Firestore ──────────
export async function initNotifications() {
  if (!('Notification' in window)) {
    console.warn('[Notif] 此裝置不支援推播通知');
    return false;
  }

  if (Notification.permission === 'default') {
    const result = await Notification.requestPermission();
    if (result !== 'granted') {
      console.warn('[Notif] 使用者拒絕通知授權');
      return false;
    }
  }

  listenAndSync();
  return true;
}

// ── 2. 監聽 Firestore ────────────────────────────────
// 當 rollcall 寫入 instant 欄位時，這裡收到並顯示通知
let _lastInstantSentAt = null;

function listenAndSync() {
  onSnapshot(NOTIF_DOC(), async snap => {
    if (!snap.exists()) return;
    const data = snap.data();

    // 處理臨時通知
    if (data.instant) {
      const { message, sentAt } = data.instant;
      // 用 sentAt 避免重複顯示（頁面重新整理時不再跳同一則）
      if (sentAt && sentAt !== _lastInstantSentAt) {
        _lastInstantSentAt = sentAt;
        showNotif('自律動起來', message);
      }
    }

    // 同步排程設定給 SW（如果有需要的話）
    const scheduled = await loadScheduled();
    // drum 目前不需要 SW，排程通知留待未來擴充
  });
}

function showNotif(title, body) {
  if (Notification.permission !== 'granted') return;
  new Notification(title, {
    body,
    icon: '/drum/icon-96x96.png',
  });
}

async function loadScheduled() {
  const { getDocs } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js");
  const snap = await getDocs(SCHEDULED_COL());
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// ── 3. 管理員操作 API ─────────────────────────────────
export async function saveDailySettings({ enabled, time, message }) {
  await setDoc(NOTIF_DOC(), { dailyEnabled: enabled, dailyTime: time, dailyMessage: message }, { merge: true });
}

export async function addScheduled(item) {
  await addDoc(SCHEDULED_COL(), { ...item, createdAt: Date.now() });
}

export async function deleteScheduled(id) {
  await deleteDoc(doc(window.firebaseDB, 'adminData', 'notifications', 'scheduled', id));
}

// ── 4. 讀取設定（供 UI 顯示用）──────────────────────
export async function loadSettings() {
  const snap = await getDoc(NOTIF_DOC());
  const base = snap.exists() ? snap.data() : {};
  const scheduled = await loadScheduled();
  return { ...base, scheduled };
}
