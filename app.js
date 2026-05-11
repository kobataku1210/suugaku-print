// ============================================================
// app.js
// ============================================================

// ===== 定数 =====
const STORAGE_KEY = 'mathPrint_v2';

// ===== パスワード認証（クロージャで隠蔽・コンソールからアクセス不可） =====
(function() {
  const H = 'c81b8146c567dfe6cc166ffc1963130bd559c77a987b6e0196e17b71ee48194c';
  const S = 'mathprint_';
  async function _h(p) {
    const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(S + p));
    return Array.from(new Uint8Array(b)).map(x => x.toString(16).padStart(2,'0')).join('');
  }
  function _ih(v) { return typeof v === 'string' && /^[0-9a-f]{64}$/.test(v); }

  window.submitTeacherPeas = async function() {
    const pw    = document.getElementById('teacher-pw').value;
    const count = parseInt(document.getElementById('teacher-pea-count').value);
    const errEl = document.getElementById('teacher-modal-error');
    if (await _h(pw) !== H) {
      errEl.textContent = 'パスワードが違います';
      errEl.style.display = 'block';
      return;
    }
    if (!count || count < 1 || count > 99) {
      errEl.textContent = '1〜99の数を入力してください';
      errEl.style.display = 'block';
      return;
    }
    addPeas(count);
    const p = getProgress();
    const cups = p.peaCupCount || 0;
    const cur  = p.peaCount    || 0;
    const cupLabel = `${cups + 1}杯目`;
    const card = document.getElementById('teacher-modal-card');
    card.classList.add('modal-success');
    card.innerHTML = `
      <div class="modal-success-icon">🌱</div>
      <div class="modal-success-text">+${count}個 追加！</div>
      <div class="modal-success-stars">${cupLabel}：${cur} / 45個</div>
    `;
    for (let i = 0; i < count; i++) {
      setTimeout(() => bounceAndAddPea(), i * 200);
    }
    if (count >= 3) showConfetti();
    setTimeout(() => closeTeacherModal(), 2000);
  };

  window.submitMiniTestPassword = async function() {
    const pw    = document.getElementById('minitest-pw').value;
    const errEl = document.getElementById('minitest-modal-error');
    const sec    = mathData.chapters[state.chapterIdx].sections[state.sectionIdx];
    const stored = String(sec.miniTestPassword || '');
    const entered = _ih(stored) ? await _h(pw) : pw;
    const correct = stored || H;
    if (entered !== correct) {
      errEl.textContent = 'パスワードが違います';
      errEl.style.display = 'block';
      const card = document.getElementById('minitest-modal-card');
      card.classList.add('shake');
      card.addEventListener('animationend', () => card.classList.remove('shake'), { once: true });
      return;
    }
    closeMiniTestModal();
    state.miniTestQuestions    = generate5Questions(sec);
    state.miniTestPhase        = 'quiz';
    state.miniTestAnswers      = [];
    state.miniTestWrongIndices = [];
    state.miniTestPeaIsNew     = false;
    navigate('minitest');
  };
})();

// レベル設定
const LEVELS = [
  { key: 'basic',    label: '基礎レベル', stars: '★',   color: '#4ecdc4', peas: 1, desc: '基本的な問題で<br>しっかり理解しよう！' },
  { key: 'standard', label: '標準レベル', stars: '★★',  color: '#f7971e', peas: 2, desc: '少し難しい問題に<br>チャレンジしよう！' },
  { key: 'advanced', label: '応用レベル', stars: '★★★', color: '#f5576c', peas: 3, desc: '難問で実力を<br>グンと伸ばそう！' },
];

// グリンピースの位置（山の形・底から積み上がる順、px）
// お椀エリア 220×170px、45個対応
const PEA_POSITIONS = [
  // 段1（底・9個）
  {x:14,y:160},{x:36,y:160},{x:58,y:160},{x:80,y:160},{x:102,y:160},{x:124,y:160},{x:146,y:160},{x:168,y:160},{x:190,y:160},
  // 段2（8個）
  {x:25,y:142},{x:47,y:142},{x:69,y:142},{x:91,y:142},{x:113,y:142},{x:135,y:142},{x:157,y:142},{x:179,y:142},
  // 段3（7個）
  {x:36,y:124},{x:58,y:124},{x:80,y:124},{x:102,y:124},{x:124,y:124},{x:146,y:124},{x:168,y:124},
  // 段4（6個）
  {x:47,y:106},{x:69,y:106},{x:91,y:106},{x:113,y:106},{x:135,y:106},{x:157,y:106},
  // 段5（5個）
  {x:58,y:88},{x:80,y:88},{x:102,y:88},{x:124,y:88},{x:146,y:88},
  // 段6（4個）
  {x:69,y:70},{x:91,y:70},{x:113,y:70},{x:135,y:70},
  // 段7（3個）
  {x:80,y:52},{x:102,y:52},{x:124,y:52},
  // 段8（2個）
  {x:91,y:34},{x:113,y:34},
  // 段9（頂上・1個）
  {x:102,y:16},
];

// ===== 状態 =====
const state = {
  view: 'home',
  chapterIdx: null,
  sectionIdx: null,
  quizLevelIdx: null,      // 0=basic, 1=standard, 2=advanced
  quizQIdx: null,          // 0〜9

  // 小テスト
  miniTestPhase: 'quiz',   // 'quiz' | 'result'
  miniTestQuestions: [],   // 現在出題中の問題（初回5問・再テスト時は間違い問題のみ）
  miniTestAnswers: [],     // 入力された解答
  miniTestWrongIndices: [],// 不正解だった問題のインデックス
  miniTestPeaIsNew: false, // 今回初クリアでグリンピースを獲得したか

  // 練習
  practicePhase: 'quiz',   // 'quiz' | 'result'
  practiceQuestions: [],
  practiceAnswers: [],
  practiceWrongIndices: [],
  practicePeaIsNew: false,

  // タイムアタック
  timeAttackPhase: 'quiz',
  timeAttackQuestions: [],
  timeAttackAnswers: [],
  timeAttackWrongIndices: [],
  timeAttackStartTime: null,
  timeAttackElapsed: null,
  timeAttackPrevBest: null,        // 今回の挑戦前のベストタイム
  timeAttackTeacherBeaten: false,  // 今回初めて先生を倒したか
  timeAttackStudentBeaten: false,  // 今回初めて生徒ベストを倒したか
};

// ===== 背景アニメーション =====
const SYMBOLS = ['∑','∫','π','√','∞','≠','≥','≤','θ','Δ','α','β','±','×','÷','²','³','sin','cos','tan'];

function initMathBackground() {
  const bg = document.createElement('div');
  bg.className = 'math-bg';
  for (let i = 0; i < 22; i++) {
    const el = document.createElement('span');
    el.className = 'math-symbol';
    el.textContent = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
    el.style.left = (Math.random() * 100) + 'vw';
    el.style.animationDuration = (12 + Math.random() * 18) + 's';
    el.style.animationDelay = (Math.random() * 20) + 's';
    el.style.fontSize = (1.2 + Math.random() * 2.5) + 'rem';
    bg.appendChild(el);
  }
  document.body.prepend(bg);
}

// ============================================================
// ===== 生徒ベストランキング（上位3名） =====
// ============================================================
// データ形式：list = [{ name, time }, ...]（最大3件、time昇順）
// 同名は1エントリのみ（自己ベストで上書き）。新記録は速さに関わらず挿入し、
// はみ出した記録は削除（=結果として最遅が落ちる）。
function mergeRanking(list, entry) {
  const arr = Array.isArray(list) ? list.slice() : [];
  if (!entry || !entry.name || entry.time == null) return arr;
  const name = String(entry.name).trim();
  const time = Math.round(parseFloat(entry.time) * 10) / 10;
  if (!name || isNaN(time)) return arr;
  // 同名を除去（自己ベストで上書きするため）
  const filtered = arr.filter(e => e && e.name && String(e.name).trim() !== name);
  filtered.push({ name, time });
  filtered.sort((a, b) => a.time - b.time);
  return filtered.slice(0, 3);
}

// 3枠の入力（空欄含む）から正規化済みリストを作る
// （管理画面で直接編集された3スロットを保存する時に使用）
function normalizeRanking(slots) {
  const arr = (Array.isArray(slots) ? slots : [])
    .map(e => {
      if (!e || !e.name || e.time == null) return null;
      const name = String(e.name).trim();
      const time = Math.round(parseFloat(e.time) * 10) / 10;
      if (!name || isNaN(time)) return null;
      return { name, time };
    })
    .filter(Boolean);
  // 同名重複は速い方のみ残す
  const byName = new Map();
  for (const e of arr) {
    if (!byName.has(e.name) || byName.get(e.name).time > e.time) byName.set(e.name, e);
  }
  const dedup = Array.from(byName.values());
  dedup.sort((a, b) => a.time - b.time);
  return dedup.slice(0, 3);
}

// 旧形式（studentBestName/studentBestTime 単数）を新形式（studentBestList 配列）に
// 変換する。新形式が既にある場合はそのまま。
// 同時に、旧形式のフィールドも 1位 と同期させて互換性を保つ
// （既存の表示・🌱×50判定ロジックは1位＝旧フィールドを参照するため）
function migrateRankings(data) {
  if (!data || !Array.isArray(data.chapters)) return data;
  // カードマッチ
  if (!Array.isArray(data.cardMatchStudentBestList)) {
    if (data.cardMatchStudentBestName && data.cardMatchStudentBestTime != null) {
      data.cardMatchStudentBestList = [{
        name: String(data.cardMatchStudentBestName),
        time: Math.round(parseFloat(data.cardMatchStudentBestTime) * 10) / 10
      }];
    } else {
      data.cardMatchStudentBestList = [];
    }
  }
  syncTopFromList(data, 'cardMatchStudentBestName', 'cardMatchStudentBestTime', 'cardMatchStudentBestList');
  // 各単元
  data.chapters.forEach(ch => {
    (ch.sections || []).forEach(sec => {
      if (!Array.isArray(sec.studentBestList)) {
        if (sec.studentBestName && sec.studentBestTime != null) {
          sec.studentBestList = [{
            name: String(sec.studentBestName),
            time: Math.round(parseFloat(sec.studentBestTime) * 10) / 10
          }];
        } else {
          sec.studentBestList = [];
        }
      }
      syncTopFromList(sec, 'studentBestName', 'studentBestTime', 'studentBestList');
    });
  });
  return data;
}

// list[0] を 旧フィールド（name/time）に同期する
function syncTopFromList(obj, nameKey, timeKey, listKey) {
  const list = obj[listKey];
  if (Array.isArray(list) && list.length > 0) {
    obj[nameKey] = list[0].name;
    obj[timeKey] = list[0].time;
  } else {
    obj[nameKey] = null;
    obj[timeKey] = null;
  }
}

// ===== 進捗管理（localStorage） =====
function getProgress() {
  try {
    const p = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!p || typeof p !== 'object') return { done: {}, peaCount: 0 };
    // 古いデータで done フィールドが欠落していてもクラッシュしないよう保証
    if (!p.done || typeof p.done !== 'object') p.done = {};
    return p;
  } catch {
    return { done: {}, peaCount: 0 };
  }
}

function saveProgress(p) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
}

function doneKey(chIdx, secIdx, levelIdx) {
  return `ch${chIdx}_sec${secIdx}_lv${levelIdx}`;
}

function isLevelDone(chIdx, secIdx, levelIdx) {
  return !!getProgress().done[doneKey(chIdx, secIdx, levelIdx)];
}

function isLevelUnlocked(chIdx, secIdx, levelIdx) {
  if (levelIdx === 0) return true;
  return isLevelDone(chIdx, secIdx, levelIdx - 1);
}

function completeLevel(chIdx, secIdx, levelIdx) {
  const p = getProgress();
  const key = doneKey(chIdx, secIdx, levelIdx);
  if (!p.done[key]) {
    p.done[key] = true;
    saveProgress(p);
    addPeas(LEVELS[levelIdx].peas);
    return true; // 初クリア
  }
  return false;
}

// ===== 小テスト進捗 =====
function miniTestDoneKey(chIdx, secIdx) {
  return `ch${chIdx}_sec${secIdx}_minitest`;
}

function isMiniTestDone(chIdx, secIdx) {
  return !!getProgress().done[miniTestDoneKey(chIdx, secIdx)];
}

function completeMiniTest(chIdx, secIdx) {
  const p = getProgress();
  const key = miniTestDoneKey(chIdx, secIdx);
  if (!p.done[key]) {
    p.done[key] = true;
    saveProgress(p);
    addPeas(1);
    return true; // 初クリア
  }
  return false;
}

// ===== 練習グリンピース（上限3個） =====
function getPracticePeaEarned() {
  return getProgress().practicePeaEarned || 0;
}

function addPracticePea() {
  const p = getProgress();
  const earned = p.practicePeaEarned || 0;
  if (earned >= 3) return false; // 上限達成
  p.practicePeaEarned = earned + 1;
  saveProgress(p);
  addPeas(1);
  return true;
}

function getPeaCount() {
  return getProgress().peaCount || 0;
}

function getPeaCupCount() {
  return getProgress().peaCupCount || 0;
}

// グリンピースを n 個追加。45個で1杯完成 → 0にリセットして杯数+1
function addPeas(n) {
  const p = getProgress();
  let cur  = p.peaCount    || 0;
  let cups = p.peaCupCount || 0;
  cur += n;
  let newCups = 0;
  while (cur >= 45) {
    cur -= 45;
    cups += 1;
    newCups += 1;
  }
  p.peaCount    = cur;
  p.peaCupCount = cups;
  saveProgress(p);
  // すごろく用グリンピースにも反映
  if (typeof addSgPeas === 'function') addSgPeas(n);
  // 1杯以上完成した場合は祝いアニメーション
  if (newCups > 0) {
    for (let i = 0; i < newCups; i++) {
      setTimeout(() => {
        showBowlCompleteAnimation();
        addCompletedBowlToPanel(cups - newCups + i + 1);
      }, i * 800);
    }
  }
}

// ===== ランダムに n 問選ぶ =====
function pickRandom(arr, n) {
  return [...arr]
    .map(item => ({ item, sort: Math.random() }))
    .sort((a, b) => a.sort - b.sort)
    .slice(0, n)
    .map(o => o.item);
}

// ===== 小テスト・練習用5問を生成 =====
function generate5Questions(sec) {
  const basicQs    = pickRandom(sec.basic,    3).map(q => ({ ...q, fromLevel: 0 }));
  const standardQs = pickRandom(sec.standard, 1).map(q => ({ ...q, fromLevel: 1 }));
  const advancedQs = pickRandom(sec.advanced, 1).map(q => ({ ...q, fromLevel: 2 }));
  return [...basicQs, ...standardQs, ...advancedQs];
}

// ===== お椀ウィジェット =====
function createBowlWidget() {
  const w = document.createElement('div');
  w.id = 'bowl-widget';
  w.className = 'bowl-widget-fixed';
  w.title = 'グリンピースコレクション';
  w.onclick = () => {
    w.classList.add('bowl-bounce');
    w.addEventListener('animationend', () => w.classList.remove('bowl-bounce'), { once: true });
  };
  document.body.appendChild(w);
  updateBowlWidget(false);
  createCompletedBowlsPanel();
}

function updateBowlWidget(animate) {
  const w = document.getElementById('bowl-widget');
  if (!w) return;
  const count    = getPeaCount();             // 現在の杯の中の個数（0〜44）
  const cups     = getPeaCupCount();          // 完成した杯の数（0〜）
  const cupLabel = `${cups + 1}杯目`;         // 1杯目、2杯目…

  const visible = Math.min(count, PEA_POSITIONS.length);
  let peasHtml = '';
  for (let i = 0; i < visible; i++) {
    const p = PEA_POSITIONS[i];
    const isNew = animate && i === visible - 1;
    peasHtml += `<div class="mountain-pea${isNew ? ' pea-new' : ''}" style="left:${p.x}px;top:${p.y}px"></div>`;
  }
  w.innerHTML = `
    <div class="bowl-cup-label">${cupLabel}</div>
    <div class="bowl-mountain-area">${peasHtml}</div>
    <div class="bowl-wrap-lg">
      <div class="bowl-rim-lg"></div>
      <div class="bowl-body-lg"></div>
    </div>
    <div class="bowl-count-label">
      🌱 ${count} / 45個
      <button class="teacher-add-btn" onclick="showTeacherPeaModal()" title="先生：グリンピースを追加">＋</button>
    </div>
  `;
}

// ===== 先生グリンピース追加モーダル =====
function showTeacherPeaModal() {
  const overlay = document.createElement('div');
  overlay.id = 'teacher-modal-overlay';
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-card" id="teacher-modal-card">
      <div class="modal-lock">🎓</div>
      <div class="modal-level">グリンピースを追加</div>
      <p class="modal-desc">先生用パスワードと追加する個数を入力してください</p>
      <input type="password" id="teacher-pw" class="modal-input"
             placeholder="パスワード" autocomplete="off" style="margin-bottom:0.7rem">
      <input type="number" id="teacher-pea-count" class="modal-input"
             placeholder="追加する個数（例：3）" min="1" max="99" style="margin-bottom:0.3rem">
      <div id="teacher-modal-error" class="modal-error"></div>
      <div class="modal-btns">
        <button class="modal-btn-cancel" onclick="closeTeacherModal()">キャンセル</button>
        <button class="modal-btn-submit" onclick="submitTeacherPeas()">追加する！</button>
      </div>
      <button class="modal-pw-list-btn" onclick="showMiniTestPasswords()">📋 小テストPW一覧</button>
    </div>
  `;
  overlay.addEventListener('click', e => { if (e.target === overlay) closeTeacherModal(); });
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('show'));
  document.getElementById('teacher-pw').focus();
}

function showMiniTestPasswords() {
  const rows = [];
  for (const ch of mathData.chapters) {
    for (const sec of ch.sections) {
      if (sec.miniTestPassword) {
        rows.push(`<tr><td>${ch.title}</td><td>${sec.title}</td><td class="pw-cell">${sec.miniTestPassword}</td></tr>`);
      }
    }
  }
  const overlay = document.createElement('div');
  overlay.id = 'pw-list-overlay';
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-card" style="max-width:480px;max-height:80vh;overflow-y:auto;">
      <div class="modal-lock">📋</div>
      <div class="modal-level">小テスト パスワード一覧</div>
      <table class="pw-list-table">
        <thead><tr><th>章</th><th>節</th><th>PW</th></tr></thead>
        <tbody>${rows.join('')}</tbody>
      </table>
      <div class="modal-btns" style="margin-top:1rem;">
        <button class="modal-btn-cancel" onclick="document.getElementById('pw-list-overlay').remove()">閉じる</button>
      </div>
    </div>
  `;
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('show'));
}

function closeTeacherModal() {
  const overlay = document.getElementById('teacher-modal-overlay');
  if (!overlay) return;
  overlay.classList.remove('show');
  setTimeout(() => overlay.remove(), 300);
}


function bounceAndAddPea() {
  updateBowlWidget(true);
  const w = document.getElementById('bowl-widget');
  if (!w) return;
  w.classList.add('bowl-bounce');
  w.addEventListener('animationend', () => w.classList.remove('bowl-bounce'), { once: true });
}

// ===== お椀満杯祝いアニメーション =====
function showBowlCompleteAnimation() {
  updateBowlWidget(false);
  updateCompletedBowlsPanel();

  // オーバーレイ用スケール 0.6（132px幅、10pxのpea）
  const BC_SCALE = 0.6;
  const BC_PS    = 10; // pea size px
  const bcMW = Math.round(220 * BC_SCALE); // 132
  const bcMH = Math.round(170 * BC_SCALE); // 102
  const bcPeasHtml = PEA_POSITIONS.map(pos =>
    `<div class="bc-pea" style="left:${Math.round(pos.x*BC_SCALE)}px;top:${Math.round(pos.y*BC_SCALE)}px"></div>`
  ).join('');

  // 大きな祝いオーバーレイ
  const overlay = document.createElement('div');
  overlay.className = 'bowl-complete-overlay';
  overlay.innerHTML = `
    <div class="bowl-complete-card">
      <div class="bowl-complete-emoji">🎉</div>
      <div class="bowl-complete-title">お椀いっぱい！</div>
      <div class="bowl-complete-sub">グリンピース45個達成！</div>
      <div class="bowl-complete-bowl">
        <div class="bowl-complete-mountain" style="width:${bcMW}px;height:${bcMH}px">${bcPeasHtml}</div>
        <div class="bc-bowl-wrap">
          <div class="bc-bowl-rim"></div>
          <div class="bc-bowl-body"></div>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('show'));

  // 大量紙吹雪
  showBigConfetti();

  // 3秒後に消える
  setTimeout(() => {
    overlay.classList.remove('show');
    setTimeout(() => overlay.remove(), 500);
  }, 3000);
}

// ===== 左側パネル：完成お椀を蓄積表示 =====
function createCompletedBowlsPanel() {
  if (document.getElementById('completed-bowls-panel')) return;
  const panel = document.createElement('div');
  panel.id = 'completed-bowls-panel';
  panel.className = 'completed-bowls-panel';
  panel.title = '完成したお椀のコレクション';
  document.body.appendChild(panel);
  updateCompletedBowlsPanel();
}

function updateCompletedBowlsPanel() {
  const panel = document.getElementById('completed-bowls-panel');
  if (!panel) return;
  const cups = getPeaCupCount();
  if (cups === 0) {
    panel.innerHTML = '';
    panel.style.display = 'none';
    return;
  }
  panel.style.display = 'flex';

  const p = getProgress();
  const totalPeas = (p.peaCupCount || 0) * 45 + (p.peaCount || 0);

  // 左パネル用スケール 0.28（62px幅、5pxのpea）
  const CBP_SCALE = 0.28;
  const cbpMW = Math.round(220 * CBP_SCALE); // 62
  const cbpMH = Math.round(170 * CBP_SCALE); // 48
  const cbpPeasHtml = PEA_POSITIONS.map(pos =>
    `<div class="cbp-pea" style="left:${Math.round(pos.x*CBP_SCALE)}px;top:${Math.round(pos.y*CBP_SCALE)}px"></div>`
  ).join('');

  let html = `
    <div class="cbp-total">🌱 累計 ${totalPeas.toLocaleString()} 個</div>
    <div class="cbp-title">完成したお椀</div>`;
  for (let i = 0; i < cups; i++) {
    html += `
      <div class="cbp-bowl" title="${i+1}杯目">
        <div class="cbp-mountain" style="width:${cbpMW}px;height:${cbpMH}px">${cbpPeasHtml}</div>
        <div class="cbp-wrap">
          <div class="cbp-rim"></div>
          <div class="cbp-body"></div>
        </div>
        <div class="cbp-label">${i+1}杯目</div>
      </div>
    `;
  }
  panel.innerHTML = html;
}

function addCompletedBowlToPanel(cupNum) {
  updateCompletedBowlsPanel();
  // 最後に追加されたお椀をアニメーション
  const panel = document.getElementById('completed-bowls-panel');
  if (!panel) return;
  const bowls = panel.querySelectorAll('.cbp-bowl');
  const last = bowls[bowls.length - 1];
  if (last) {
    last.classList.add('cbp-bowl-new');
  }
}

// ===== 大量紙吹雪（お椀完成時） =====
function showBigConfetti() {
  const cel = document.createElement('div');
  cel.className = 'confetti-wrap';
  const colors = ['#f5576c','#4ecdc4','#ffd200','#667eea','#56ab2f','#f093fb','#ff9800','#00bcd4'];
  for (let i = 0; i < 80; i++) {
    const p = document.createElement('div');
    p.className = 'confetti-piece';
    p.style.left = (Math.random() * 100) + 'vw';
    p.style.animationDelay = (Math.random() * 1.5) + 's';
    p.style.animationDuration = (1.5 + Math.random() * 1.5) + 's';
    p.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
    p.style.width  = (6 + Math.random() * 8) + 'px';
    p.style.height = (6 + Math.random() * 8) + 'px';
    cel.appendChild(p);
  }
  document.body.appendChild(cel);
  setTimeout(() => cel.remove(), 4000);
}

// ===== 紙吹雪 =====
function showConfetti() {
  const cel = document.createElement('div');
  cel.className = 'confetti-wrap';
  const colors = ['#f5576c','#4ecdc4','#ffd200','#667eea','#56ab2f','#f093fb'];
  for (let i = 0; i < 40; i++) {
    const p = document.createElement('div');
    p.className = 'confetti-piece';
    p.style.left = (Math.random() * 100) + 'vw';
    p.style.animationDelay = (Math.random() * 1.2) + 's';
    p.style.animationDuration = (2 + Math.random()) + 's';
    p.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
    p.style.transform = `rotate(${Math.random() * 360}deg)`;
    cel.appendChild(p);
  }
  document.body.appendChild(cel);
  setTimeout(() => cel.remove(), 4000);
}

// ===== 対戦報酬の受け取り（battle.html → GitHub Pages） =====
(function checkBattleReward() {
  const params = new URLSearchParams(window.location.search);
  const reward = parseInt(params.get('btreward') || '0');
  const token  = params.get('t') || '';
  if (!reward || reward < 1 || reward > 10 || !token) return;

  // URLをすぐクリーン（リロードしても再実行されない）
  const url = new URL(window.location.href);
  url.searchParams.delete('btreward');
  url.searchParams.delete('t');
  history.replaceState({}, '', url.toString());

  // トークン重複チェック（同じ報酬を2回受け取り防止）
  const usedKey = 'btUsedTokens';
  const used = JSON.parse(localStorage.getItem(usedKey) || '[]');
  if (used.includes(token)) return;
  used.push(token);
  if (used.length > 100) used.splice(0, used.length - 100);
  localStorage.setItem(usedKey, JSON.stringify(used));

  // DOM描画後にグリンピースを追加
  function applyReward() {
    addPeas(reward);
    setTimeout(() => showBattleRewardNotif(reward), 500);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyReward);
  } else {
    setTimeout(applyReward, 100);
  }
})();

function showBattleRewardNotif(n) {
  const el = document.createElement('div');
  el.className = 'bt-reward-notif';
  el.innerHTML = `🏆 対戦勝利！&nbsp;&nbsp;🌱 ×${n} もらった！`;
  document.body.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 600);
  }, 3000);
}

// ===== 起動時：URLパラメータ ?ip= を処理 =====
(function checkUrlIp() {
  const params = new URLSearchParams(window.location.search);
  const ip = params.get('ip');
  if (ip && ip.trim()) {
    localStorage.setItem('battleServerIP', ip.trim());
    // ?ip= 付きURLで開いたら即対戦画面へ
    if (window.location.hostname !== 'kobataku1210.github.io') return;
    location.replace(`http://${ip.trim()}:3000/battle.html`);
  }
})();

// ===== 対戦モード起動 =====
function openBattleMode() {
  const isLocal = window.location.hostname !== 'kobataku1210.github.io';
  if (isLocal) {
    location.href = 'battle.html';
    return;
  }
  // 保存済みIPがあれば即ジャンプ
  const saved = localStorage.getItem('battleServerIP') || '';
  if (saved) {
    location.href = `http://${saved}:3000/battle.html`;
    return;
  }
  // 初回のみモーダル表示
  const overlay = document.createElement('div');
  overlay.id = 'bt-ip-overlay';
  overlay.innerHTML = `
    <div class="bt-ip-modal">
      <div class="bt-ip-title">⚔️ 学校で対戦</div>
      <div class="bt-ip-desc">先生の画面に表示されている<br><strong>IPアドレス</strong>を入力してね</div>
      <div class="bt-ip-hint-box" id="bt-url-ip-hint"></div>
      <input id="bt-ip-input" class="bt-ip-input" type="text"
             placeholder="例: 100.64.1.26"
             value=""
             onkeydown="if(event.key==='Enter') btIpGo()">
      <div class="bt-ip-note">次回からは自動でジャンプします</div>
      <div class="bt-ip-btns">
        <button class="bt-ip-btn bt-ip-go" onclick="btIpGo()">対戦する！</button>
        <button class="bt-ip-btn bt-ip-cancel" onclick="btIpClose()">キャンセル</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  setTimeout(() => {
    const inp = document.getElementById('bt-ip-input');
    if (inp) { inp.focus(); }
    // ?ip= がURLにあれば入力欄にセットしてヒントも表示
    const urlIp = new URLSearchParams(window.location.search).get('ip');
    if (urlIp && urlIp.trim()) {
      if (inp) inp.value = urlIp.trim();
      const hint = document.getElementById('bt-url-ip-hint');
      if (hint) {
        hint.innerHTML = `💡 URLからIPを読み込みました：<strong>${urlIp.trim()}</strong>`;
      }
    }
  }, 80);
}

function btIpGo() {
  const inp = document.getElementById('bt-ip-input');
  if (!inp) return;
  const ip = inp.value.trim();
  if (!ip) { inp.focus(); return; }
  localStorage.setItem('battleServerIP', ip);
  btIpClose();
  location.href = `http://${ip}:3000/battle.html`;
}

function btIpClose() {
  const el = document.getElementById('bt-ip-overlay');
  if (el) el.remove();
}

// バナーのサブテキストを更新（renderHome() の後に呼ぶ）
function initBattleBanner() {
  const sub = document.getElementById('bt-banner-sub');
  if (!sub) return;
  const isLocal = window.location.hostname !== 'kobataku1210.github.io';
  if (isLocal) {
    // ローカルサーバー：IPアドレスボードに表示
    fetch('/api/server-ip')
      .then(r => r.json())
      .then(d => {
        const addr = document.getElementById('bt-ip-board-addr');
        if (addr && d.ip) {
          addr.textContent = `http://${d.ip}:${d.port}`;
        }
        const share = document.getElementById('bt-ip-board-share');
        if (share && d.ip) {
          share.textContent = `https://kobataku1210.github.io/suugaku-print/?ip=${d.ip}`;
        }
      })
      .catch(() => {});
  } else {
    // GitHub Pages：保存済みIPを表示
    const saved = localStorage.getItem('battleServerIP') || '';
    if (saved) {
      sub.innerHTML = `保存済み：${saved}&nbsp;
        <span class="bt-banner-change" onclick="event.stopPropagation();btIpChange()">変更</span>`;
    }
  }
}

// IPアドレスを変更する（GitHub Pages用）
function btIpChange() {
  localStorage.removeItem('battleServerIP');
  const sub = document.getElementById('bt-banner-sub');
  if (sub) sub.innerHTML = '友達と1対1で勝負しよう！勝ったら🌱×3';
}

// ===== ナビゲーション =====
function navigate(view, opts = {}) {
  // cardmatch へ外部から遷移する場合はメニュー表示に戻す
  if (view === 'cardmatch' && state.view !== 'cardmatch') cmMode = 'menu';
  state.view = view;
  if (opts.chapterIdx   !== undefined) state.chapterIdx   = opts.chapterIdx;
  if (opts.sectionIdx   !== undefined) state.sectionIdx   = opts.sectionIdx;
  if (opts.quizLevelIdx !== undefined) state.quizLevelIdx = opts.quizLevelIdx;
  if (opts.quizQIdx     !== undefined) state.quizQIdx     = opts.quizQIdx;
  render();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ===== リップル =====
function addRipple(e, el) {
  const rect = el.getBoundingClientRect();
  const size = Math.max(rect.width, rect.height);
  const r = document.createElement('span');
  r.className = 'ripple';
  r.style.width = r.style.height = size + 'px';
  r.style.left = (e.clientX - rect.left - size / 2) + 'px';
  r.style.top  = (e.clientY - rect.top  - size / 2) + 'px';
  el.appendChild(r);
  r.addEventListener('animationend', () => r.remove());
}

// ===== ホーム =====
// URL に ?preview=draft が付いていればプレビューモード（draft 章も見られる）
const PREVIEW_MODE = new URLSearchParams(window.location.search).get('preview') === 'draft';

function renderHome() {
  const cards = mathData.chapters.map((ch, i) => {
    // draft: true の章は生徒画面では「準備中」扱い（プレビューモードでは見せる）
    const isDraft = !!ch.draft && !PREVIEW_MODE;
    const has = !isDraft && ch.sections.length > 0;
    return `
      <div class="chapter-card" style="--gradient:${ch.gradient}"
           onclick="handleChapterClick(event,this,${i})">
        <div class="card-label">第 ${ch.id} 章</div>
        <span class="card-icon">${ch.icon}</span>
        <div class="card-title">${ch.title}</div>
        ${has
          ? `<div class="card-meta">
               <div class="card-bar"><div class="card-bar-fill" style="width:100%"></div></div>
               <span>${ch.sections.length} 節</span>
             </div>`
          : `<span class="coming-badge">準備中</span>`}
      </div>`;
  }).join('');
  // すごろくバナー（ステージ1・2対応）
  const sgSave1 = (typeof getSgSave === 'function') ? getSgSave() : null;
  const s1Cleared = !!(sgSave1 && sgSave1.cleared);
  let sgSave2 = null;
  try { const r = localStorage.getItem('sgSave_v2'); if (r) sgSave2 = JSON.parse(r); } catch(e) {}
  const s2Cleared = !!(sgSave2 && sgSave2.cleared);

  // 表示対象セーブ：ステージ2が始まっていればS2、そうでなければS1
  const sgShowS2 = s1Cleared && sgSave2 !== null;
  const sgActiveSave = sgShowS2 ? sgSave2 : sgSave1;
  const sgStageLabel = sgShowS2 ? 'ステージ２' : 'ステージ１';
  const sgMaxPos = sgShowS2 ? 150 : 100;
  const sgPeas = sgActiveSave ? (sgActiveSave.peas || 0) : 0;
  const sgDice = Math.floor(sgPeas / 10);
  const sgPos  = sgActiveSave ? (sgActiveSave.pos || 0) : 0;
  const sgBalls = sgActiveSave ? (sgActiveSave.balls || {}) : {};
  const sgBallIcons = ['🔴','🔵','🟡','🟢','🟣'].map((em, i) => {
    const c = ['red','blue','yellow','green','purple'][i];
    return `<span style="opacity:${(sgBalls[c]||0)>0?1:0.25}">${em}</span>`;
  }).join('');

  // タイトル・アイコン決定
  let sgBannerIcon, sgBannerTitle, sgBannerSub;
  if (s2Cleared) {
    sgBannerIcon  = '👑';
    sgBannerTitle = '🏆 ステージ２クリア！';
    sgBannerSub   = `🌱${sgPeas}　🎲${sgDice}回　${sgBallIcons}`;
  } else if (sgShowS2) {
    sgBannerIcon  = '⚔️';
    sgBannerTitle = `ステージ２ 挑戦中！`;
    sgBannerSub   = `マス ${sgPos}/${sgMaxPos}　🌱${sgPeas}　🎲${sgDice}回　${sgBallIcons}`;
  } else if (s1Cleared) {
    sgBannerIcon  = '👑';
    sgBannerTitle = '🏆 ステージ１クリア！';
    sgBannerSub   = `ステージ２に挑戦しよう！　🌱${sgPeas}`;
  } else {
    sgBannerIcon  = '🎲';
    sgBannerTitle = 'すごろく冒険';
    sgBannerSub   = `マス ${sgPos}/${sgMaxPos}　🌱${sgPeas}　🎲${sgDice}回　${sgBallIcons}`;
  }

  const sgBanner = `
    <div class="sg-home-banner" onclick="navigate('sugoroku')">
      <div class="sg-home-banner-left">
        <span class="sg-home-banner-icon">${sgBannerIcon}</span>
        <div class="sg-home-banner-text">
          <div class="sg-home-banner-title">${sgBannerTitle}</div>
          <div class="sg-home-banner-sub">${sgBannerSub}</div>
        </div>
      </div>
      <div class="sg-home-banner-arrow">›</div>
    </div>`;

  // カードマッチバナー（ホーム画面では非表示・数学ゲーム画面でのみ表示）

  // ===== 数学ゲームバナー =====
  const gamesBanner = `
    <div class="gm-home-banner" onclick="navigate('games')">
      <span class="gm-home-icon">🎮</span>
      <div class="gm-home-text">
        <div class="gm-home-title">数学ゲーム <span class="game-new-badge">NEW!</span></div>
        <div class="gm-home-sub">気分転換に遊んで、学習しよう！</div>
      </div>
      <div class="gm-home-arrow">›</div>
    </div>`;

  // ===== 数学便利グッズバナー =====
  const toolsBanner = `
    <div class="tl-home-banner" onclick="navigate('tools')">
      <span class="tl-home-icon">🧰</span>
      <div class="tl-home-text">
        <div class="tl-home-title">数学便利グッズ <span class="game-new-badge">NEW!</span></div>
        <div class="tl-home-sub">学習を助けるツールを使ってみよう！</div>
      </div>
      <div class="tl-home-arrow">›</div>
    </div>`;

  // ===== ランキングバナー =====
  const rankingBanner = `
    <div class="rk-home-banner" onclick="navigate('ranking')">
      <span class="rk-home-icon">🏆</span>
      <div class="rk-home-text">
        <div class="rk-home-title">ランキング <span class="game-new-badge">NEW!</span></div>
        <div class="rk-home-sub">各タイムアタック・カードマッチの上位3名をチェック！</div>
      </div>
      <div class="rk-home-arrow">›</div>
    </div>`;

  // ===== NEWS セクション =====
  const newsItems = (mathData.news || []).slice(0, 10);
  const newsHTML = newsItems.length > 0 ? `
    <div class="news-section">
      <div class="news-header">
        <h3>📰 NEWS</h3>
        <span class="news-count">${newsItems.length}件</span>
      </div>
      <ul class="news-list">
        ${newsItems.map(n => `
          <li class="news-item">
            <span class="news-icon">${n.icon || '📌'}</span>
            <span class="news-text">${escHtml(n.title || '')}</span>
            <span class="news-date">${formatNewsDate(n.date)}</span>
          </li>
        `).join('')}
      </ul>
    </div>
  ` : '';

  return `
    <div class="section-title">
      <h2>章を選ぼう！</h2>
      <p>学習したい単元をタップしてね</p>
    </div>
    ${sgBanner}
    ${gamesBanner}
    ${toolsBanner}
    ${rankingBanner}
    <div class="chapters-grid">${cards}</div>
    ${newsHTML}`;
}

// NEWS の日付を整形（カレンダー日で「今日/昨日/N日前/月/日」）
function formatNewsDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const now = new Date();
  // 時刻を 0時に揃えてカレンダー日で比較
  const dDay   = new Date(d.getFullYear(),   d.getMonth(),   d.getDate());
  const nowDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffDays = Math.round((nowDay - dDay) / 86400000);
  if (diffDays < 0) return '';
  if (diffDays === 0) return '今日';
  if (diffDays === 1) return '昨日';
  if (diffDays < 7) return `${diffDays}日前`;
  return `${d.getMonth() + 1}/${d.getDate()}`;
}


// ===== ゲーム選択画面 =====
// 今後ゲームを追加する場合は GAME_ITEMS に1要素加えるだけ。
// onclick: 外部HTML → "window.open(...)" / 内部遷移 → "navigate('xxx')"
const GAME_ITEMS = [
  {
    title: '因数分解シューティング',
    desc: '和と積を満たす数字の風船を撃ち落とそう！ 班リレー対応',
    icon: '🎈',
    onclick: "navigate('shooting')",
    gradient: 'linear-gradient(135deg, #ff6b6b, #fdcb6e)',
    isNew: true,
  },
  {
    title: 'カードマッチ',
    desc: '展開・因数分解の式と答えをカードでマッチング！自己ベストを目指せ',
    icon: '🃏',
    onclick: "navigate('cardmatch')",
    gradient: 'linear-gradient(135deg, #a29bfe, #6c5ce7)',
    isNew: false,
  },
  {
    title: '共通因数ウォール',
    desc: '共通因数をくくり出してウォールを崩せ！',
    icon: '🧱',
    onclick: "window.location.href='games/共通因数ウォール.html'",
    gradient: 'linear-gradient(135deg, #ff8a2a, #e05a00)',
    isNew: true,
  },
];
// ===== ランキング画面 =====
// 各単元のタイムアタック上位3名 ＋ カードマッチ上位3名を一覧表示
function renderRanking() {
  const medals = ['🥇','🥈','🥉'];
  const renderRow = (e, i) => {
    const name = escHtml(e.name);
    return `<div class="rk-row">
      <span class="rk-row-medal">${medals[i]}</span>
      <span class="rk-row-name">${name}</span>
      <span class="rk-row-time">${e.time.toFixed(1)}<span class="rk-row-unit">秒</span></span>
    </div>`;
  };
  const renderListBlock = (list) => {
    if (!list || list.length === 0) {
      return `<div class="rk-row rk-row-empty">まだ記録なし</div>`;
    }
    return list.slice(0, 3).map(renderRow).join('');
  };

  // ===== カードマッチ =====
  const cmList = mathData.cardMatchStudentBestList || [];
  const cmCard = `
    <div class="rk-card rk-card-cm">
      <div class="rk-card-header">
        <span class="rk-card-icon">🃏</span>
        <span class="rk-card-title">カードマッチ</span>
      </div>
      <div class="rk-card-body">${renderListBlock(cmList)}</div>
    </div>`;

  // ===== 各章 → 各単元 =====
  const chapterBlocks = mathData.chapters.map(ch => {
    const sections = (ch.sections || []).filter(sec => Array.isArray(sec.studentBestList) && sec.studentBestList.length > 0);
    if (!sections.length) return '';
    const cards = (ch.sections || []).map(sec => {
      const list = Array.isArray(sec.studentBestList) ? sec.studentBestList : [];
      if (list.length === 0) return ''; // 記録なしの単元は省略
      return `
        <div class="rk-card">
          <div class="rk-card-header">
            <span class="rk-card-title">${escHtml(sec.title)}</span>
          </div>
          <div class="rk-card-body">${renderListBlock(list)}</div>
        </div>`;
    }).join('');
    if (!cards.trim()) return '';
    return `
      <div class="rk-chapter">
        <h3 class="rk-chapter-title">
          <span class="rk-chapter-icon">${ch.icon || ''}</span>
          第${ch.id}章 ${escHtml(ch.title)}
        </h3>
        <div class="rk-card-grid">${cards}</div>
      </div>`;
  }).join('');

  const noTaRecords = !chapterBlocks.trim();

  return `
    <button class="back-btn" onclick="navigate('home')">← ホームに戻る</button>
    <div class="section-title">
      <h2>🏆 ランキング</h2>
      <p>各タイムアタック・カードマッチの上位3名！</p>
    </div>
    <div class="rk-section">
      <h3 class="rk-section-title">🃏 カードマッチ</h3>
      <div class="rk-card-grid">${cmCard}</div>
    </div>
    <div class="rk-section">
      <h3 class="rk-section-title">⏱ タイムアタック</h3>
      ${noTaRecords
        ? `<div class="rk-empty">まだ記録がありません</div>`
        : chapterBlocks}
    </div>`;
}

function renderGamesPage() {
  // カードマッチの自己ベストを取得
  const cmData    = cmLoad();
  const cmBestStr = cmData.best != null ? cmFmtTime(cmData.best) : null;

  const cards = GAME_ITEMS.map(g => {
    // カードマッチのみ自己ベスト・生徒ベストをサブテキストに表示
    let subText = '';
    if (g.onclick === "navigate('cardmatch')") {
      const parts = [];
      if (cmBestStr) parts.push(`🏅 自己ベスト：${cmBestStr}`);
      if (cmStudentBestTime != null && cmStudentBestName) {
        parts.push(`🏆 ${cmStudentBestName}：${cmFmtTime(cmStudentBestTime)} 🌱×50`);
      }
      if (parts.length) subText = `<div class="game-card-best">${parts.join('　')}</div>`;
    }
    return `
    <div class="game-card" style="--gradient:${g.gradient}"
         onclick="${g.onclick}">
      <span class="game-card-icon">${g.icon}</span>
      <div class="game-card-title">${g.title}${g.isNew ? '<span class="game-new-badge">NEW!</span>' : ''}</div>
      <div class="game-card-desc">${g.desc}</div>
      ${subText}
      <div class="game-card-cta">遊ぶ ›</div>
    </div>`;
  }).join('');
  return `
    <button class="back-btn" onclick="navigate('home')">← ホームに戻る</button>
    <div class="section-title">
      <h2>🎮 数学ゲーム</h2>
      <p>遊びたいゲームを選んでね</p>
    </div>
    <div class="games-grid">${cards}</div>`;
}

// ===== 数学便利グッズ画面 =====
// 今後ツールを追加する場合は TOOL_ITEMS に1要素加えるだけ。
const TOOL_ITEMS = [
  {
    title: '因数分解アシスタント',
    desc: '係数をスライドさせて因数分解を体験！手順を一緒に確認できる',
    icon: '🧩',
    onclick: "window.location.href='tools/因数分解アシスタント/index.html'",
    gradient: 'linear-gradient(135deg, #56ab2f, #a8e063)',
    isNew: true,
  },
];
function renderToolsPage() {
  const cards = TOOL_ITEMS.map(t => `
    <div class="game-card" style="--gradient:${t.gradient}"
         onclick="${t.onclick}">
      <span class="game-card-icon">${t.icon}</span>
      <div class="game-card-title">${t.title}${t.isNew ? '<span class="game-new-badge">NEW!</span>' : ''}</div>
      <div class="game-card-desc">${t.desc}</div>
      <div class="game-card-cta">使う ›</div>
    </div>`).join('');
  return `
    <button class="back-btn" onclick="navigate('home')">← ホームに戻る</button>
    <div class="section-title">
      <h2>🧰 数学便利グッズ</h2>
      <p>学習を助けるツールを選んでね</p>
    </div>
    <div class="games-grid">${cards}</div>`;
}

function handleChapterClick(e, el, idx) {
  addRipple(e, el);
  const ch = mathData.chapters[idx];
  if (!ch.sections.length) return;
  if (ch.draft && !PREVIEW_MODE) return; // draft の章は通常モードでは開けない（プレビュー時は可）
  setTimeout(() => navigate('sections', { chapterIdx: idx }), 180);
}

// ===== 節一覧 =====
function renderSections() {
  const ch = mathData.chapters[state.chapterIdx];
  const cards = ch.sections.length > 0
    ? ch.sections.map((sec, i) => {
        const doneCount = LEVELS.filter((_, li) => isLevelDone(state.chapterIdx, i, li)).length;
        const badge = doneCount === 3
          ? `<span class="sec-done-badge">全クリア 🌱×6</span>`
          : doneCount > 0
          ? `<span class="sec-progress-badge">${doneCount}/3 クリア</span>`
          : '';
        return `
          <div class="section-card" style="--gradient:${ch.gradient}"
               onclick="handleSectionClick(event,this,${i})">
            <div class="sec-badge">${String(i+1).padStart(2,'0')}</div>
            <div class="sec-title">${sec.title}<br>${badge}</div>
            <div class="sec-arrow">›</div>
          </div>`;
      }).join('')
    : `<div class="empty-state">
         <div class="empty-icon">🚧</div>
         <p>このチャプターは準備中です</p>
       </div>`;
  return `
    <button class="back-btn" onclick="navigate('home')">← 章一覧に戻る</button>
    <div class="section-title">
      <h2>${ch.icon} ${ch.title}</h2>
      <p>学習する節を選んでね</p>
    </div>
    <div class="sections-grid">${cards}</div>`;
}

function handleSectionClick(e, el, idx) {
  addRipple(e, el);
  setTimeout(() => navigate('difficulty', { sectionIdx: idx }), 180);
}

// ===== 難易度選択 =====
function renderDifficulty() {
  const ch  = mathData.chapters[state.chapterIdx];
  const sec = ch.sections[state.sectionIdx];

  const cards = LEVELS.map((lv, li) => {
    const done     = isLevelDone(state.chapterIdx, state.sectionIdx, li);
    const unlocked = isLevelUnlocked(state.chapterIdx, state.sectionIdx, li);
    const delay    = `animation-delay:${li * 0.08}s`;
    const peasStr  = '🌱'.repeat(lv.peas);

    if (!unlocked) {
      return `
        <div class="diff-card diff-locked fade-in" style="${delay}">
          <span class="diff-stars diff-stars-locked">${lv.stars}</span>
          <div class="lock-icon">🔒</div>
          <div class="diff-label diff-label-locked">${lv.label}</div>
          <div class="diff-desc diff-desc-locked">前のレベルをクリアしてね！</div>
          <div class="diff-pea-hint">${peasStr} クリアで${lv.peas}個</div>
        </div>`;
    }
    if (done) {
      return `
        <div class="diff-card diff-done fade-in" style="--diff-color:${lv.color};${delay}"
             onclick="startQuiz(${li})">
          <span class="diff-stars">${lv.stars}</span>
          <div class="diff-clear-badge">✓ クリア済み</div>
          <div class="diff-label">${lv.label}</div>
          <div class="diff-desc">${lv.desc}</div>
          <div class="diff-pea-earned">${peasStr} 獲得済み！</div>
          <button class="diff-btn diff-btn-retry">もう一度チャレンジ</button>
        </div>`;
    }
    return `
      <div class="diff-card diff-lv${li} fade-in" style="--diff-color:${lv.color};${delay}"
           onclick="startQuiz(${li})">
        <span class="diff-stars">${lv.stars}</span>
        <div class="diff-label">${lv.label}</div>
        <div class="diff-desc">${lv.desc}</div>
        <div class="diff-pea-hint">${peasStr} クリアで${lv.peas}個</div>
        <button class="diff-btn diff-btn-lv${li}">10問に挑戦！</button>
      </div>`;
  }).join('');

  // ===== 小テストカード（パスワード必要） =====
  const mtDone = isMiniTestDone(state.chapterIdx, state.sectionIdx);
  const minitestCard = `
    <div class="mt-extra-card mt-extra-test fade-in" style="animation-delay:0.28s"
         onclick="startMiniTestFlow()">
      <div class="mt-extra-left">
        <div class="mt-extra-icon">📝</div>
        <div>
          <div class="mt-extra-title">小テスト <span class="mt-lock-badge">🔒 パスワード必要</span></div>
          <div class="mt-extra-desc">基礎3問・標準1問・応用1問 ／ 全問正解で再テストなし</div>
        </div>
      </div>
      <div class="mt-extra-right">
        ${mtDone
          ? `<span class="mt-pea-done">🌱 獲得済み</span>`
          : `<span class="mt-pea-hint">満点 or 再テスト全問正解で 🌱×1</span>`}
        <button class="mt-extra-btn mt-btn-test">${mtDone ? '再挑戦！' : '受ける！'}</button>
      </div>
    </div>`;

  // ===== 練習カード（パスワード不要・上限3個） =====
  const practiceEarned = getPracticePeaEarned();
  const practiceMaxed  = practiceEarned >= 3;
  const practiceCard = `
    <div class="mt-extra-card mt-extra-practice fade-in" style="animation-delay:0.36s"
         onclick="startPractice()">
      <div class="mt-extra-left">
        <div class="mt-extra-icon">✏️</div>
        <div>
          <div class="mt-extra-title">練習</div>
          <div class="mt-extra-desc">基礎3問・標準1問・応用1問をランダム抽出（パスワード不要）</div>
        </div>
      </div>
      <div class="mt-extra-right">
        ${practiceMaxed
          ? `<span class="mt-pea-done">🌱×3 上限達成！</span>`
          : `<span class="mt-pea-hint">全問正解で 🌱×1（累計上限3個）<br>現在 ${practiceEarned}/3 獲得</span>`}
        <button class="mt-extra-btn mt-btn-practice">練習する！</button>
      </div>
    </div>`;

  // ===== タイムアタックカード =====
  const taData = getTimeAttackData(state.chapterIdx, state.sectionIdx);
  const taSecData = mathData.chapters[state.chapterIdx].sections[state.sectionIdx];
  const taTeacherTime = taSecData.teacherTime || null;
  const taTierBadgesHtml = TA_TIERS.map(t => {
    const earned = taData.earnedTiers.includes(t.sec);
    return `<span class="ta-tier-badge-sm${earned ? ' ta-tier-badge-earned' : ''}">${t.medal} ${t.label} 🌱×${t.peas}</span>`;
  }).join('');
  const taTeacherBadge = taTeacherTime !== null
    ? isTeacherBeaten(taData, taTeacherTime)
      ? `<span class="ta-tier-badge-sm ta-tier-badge-earned">👑 小林T撃破済み！</span>`
      : `<span class="ta-tier-badge-sm ta-teacher-badge">👑 小林T ${taTeacherTime.toFixed(1)}秒 🌱×10</span>`
    : '';
  const taStudentBestTime = taSecData.studentBestTime || null;
  const taStudentBestName = taSecData.studentBestName || '生徒';
  const taStudentBestBadge = taStudentBestTime !== null
    ? isStudentBestBeaten(taData, taStudentBestTime)
      ? `<span class="ta-tier-badge-sm ta-tier-badge-earned">🏅 ${taStudentBestName}撃破済み！</span>`
      : `<span class="ta-tier-badge-sm ta-student-badge">🏅 ${taStudentBestName} ${taStudentBestTime.toFixed(1)}秒 🌱×50</span>`
    : '';
  // 上位3名（2位・3位がいれば）を追加バッジで表示
  const taTop3List = Array.isArray(taSecData.studentBestList) ? taSecData.studentBestList : [];
  const taExtraBadgesHtml = taTop3List.slice(1, 3).map((e, i) => {
    const medal = i === 0 ? '🥈' : '🥉';
    return `<span class="ta-tier-badge-sm ta-student-rank-badge">${medal} ${escHtml(e.name)} ${e.time.toFixed(1)}秒</span>`;
  }).join('');
  const timeattackCard = `
    <div class="mt-extra-card mt-extra-timeattack fade-in" style="animation-delay:0.44s"
         onclick="startTimeAttack()">
      <div class="mt-extra-left">
        <div class="mt-extra-icon">⏱</div>
        <div>
          <div class="mt-extra-title">タイムアタック</div>
          <div class="mt-extra-desc">基礎3問・標準1問・応用1問 ／ 全問正解＋タイムで🌱ゲット</div>
          <div class="ta-tier-badges-sm">
            ${taTeacherBadge}
            ${taStudentBestBadge}
            ${taExtraBadgesHtml}
            ${taTierBadgesHtml}
          </div>
        </div>
      </div>
      <div class="mt-extra-right">
        ${taData.bestTime !== null
          ? `<span class="ta-best-time-sm">🏆 ${taData.bestTime.toFixed(1)}秒</span>`
          : `<span class="mt-pea-hint">まだ記録なし</span>`}
        <button class="mt-extra-btn mt-btn-timeattack">チャレンジ！</button>
      </div>
    </div>`;

  return `
    <button class="back-btn" onclick="navigate('sections')">← 節一覧に戻る</button>
    <div class="section-title">
      <h2>${sec.title}</h2>
      <p>難易度を選んでね</p>
    </div>
    <div class="difficulty-grid">${cards}</div>
    ${minitestCard}
    ${practiceCard}
    ${timeattackCard}
    <p class="ta-kobayashi-note">※小林Tの記録を抜いたら小林Tに報告すること。大人げなくまた抜き返します。</p>`;
}

function startQuiz(levelIdx) {
  navigate('quiz', { quizLevelIdx: levelIdx, quizQIdx: 0 });
}

// ===== クイズ画面（1問ずつ） =====
function renderQuiz() {
  const ch        = mathData.chapters[state.chapterIdx];
  const sec       = ch.sections[state.sectionIdx];
  const lv        = LEVELS[state.quizLevelIdx];
  const questions = sec[lv.key];
  const qIdx      = state.quizQIdx;
  const q         = questions[qIdx];
  const totalQ    = questions.length;
  const progress  = totalQ > 0 ? Math.round((qIdx / totalQ) * 100) : 0;

  return `
    <button class="back-btn" onclick="navigate('difficulty')">← 難易度選択に戻る</button>
    <div class="quiz-header">
      <h2>${sec.title}</h2>
      <span class="quiz-level-badge" style="--lv-color:${lv.color}">${lv.stars} ${lv.label}</span>
    </div>
    <div class="quiz-progress-wrap">
      <div class="quiz-progress-text">問 ${qIdx + 1} / ${totalQ}</div>
      <div class="quiz-progress-bar">
        <div class="quiz-progress-fill" style="width:${progress}%;background:${lv.color}"></div>
      </div>
    </div>
    <div class="quiz-card" id="quiz-card">
      <div class="quiz-question">${formatQuestion(q.q)}</div>
      ${getBlankHint(q) ? `<div class="quiz-blank-hint"><span class="quiz-blank-hint-label">答えの形</span>${formatQuestion(getBlankHint(q))}</div>` : ''}
      <input type="text" id="quiz-input" class="quiz-input"
             placeholder="${q.b && q.b.trim() ? '＿＿ に入る答えを入力' : '答えを入力'}"
             autocomplete="off"
             onkeydown="if(event.key==='Enter'){event.preventDefault();submitQuizAnswer();}">
      <div id="quiz-msg" class="quiz-msg"></div>
      <div class="quiz-btns">
        <button class="quiz-submit-btn" style="--lv-color:${lv.color}"
                onclick="submitQuizAnswer()">答え合わせ！</button>
      </div>
    </div>`;
}

// ===== 全角・半角を統一して正誤判定 =====
function normalizeAnswer(str) {
  return str
    .trim()
    .replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
    .replace(/[ａ-ｚ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
    .replace(/[Ａ-Ｚ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
    .replace(/－/g, '-')
    .replace(/＋/g, '+')
    .replace(/　/g, ' ');
}

// ===== 穴埋めヘルパー =====
// 正解を返す：穴埋め(b)フィールドがあればそちら、なければ答え全体(a)
function getCorrectAnswer(q) {
  return (q.b && q.b.trim()) ? q.b : q.a;
}
// ヒント文字列を返す：答え(a)の中の穴埋め(b)を ＿＿ に置換
// 穴埋めがなければ null を返す
function getBlankHint(q) {
  if (!q.b || !q.b.trim()) return null;
  return q.a.replace(q.b, '＿＿');
}

// ===== 問題文のフォーマット =====
// ・{分子/分母} → HTMLの縦分数に変換
// ・+ / - → 全角に変換（分数の外側のみ）
function formatQuestion(q) {
  // {a/b} パターンを分割しながら処理
  const parts = q.split(/(\{[^{}]+\/[^{}]+\})/g);
  return parts.map(part => {
    const m = part.match(/^\{([^/{}]+)\/([^/{}]+)\}$/);
    if (m) {
      // 分子・分母それぞれにも全角変換を適用
      const num = m[1].replace(/\+/g, '＋').replace(/-/g, '－');
      const den = m[2].replace(/\+/g, '＋').replace(/-/g, '－');
      return `<span class="quiz-frac"><span class="quiz-frac-num">${num}</span><span class="quiz-frac-den">${den}</span></span>`;
    }
    // 通常テキストは全角変換のみ
    return part.replace(/\+/g, '＋').replace(/-/g, '－');
  }).join('');
}

// ===== HTML エスケープ =====
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

let quizLocked = false;  // 正解後のアニメーション中に連打されないようにするフラグ
let taTimerInterval = null;    // タイムアタックのライブタイマー

function submitQuizAnswer() {
  if (quizLocked) return;                          // 処理中は無視
  const input = document.getElementById('quiz-input');
  if (!input) return;
  const entered = normalizeAnswer(input.value);
  if (!entered) return;

  const ch        = mathData.chapters[state.chapterIdx];
  const sec       = ch.sections[state.sectionIdx];
  const lv        = LEVELS[state.quizLevelIdx];
  const questions = sec[lv.key];
  const correct   = normalizeAnswer(getCorrectAnswer(questions[state.quizQIdx]));

  if (entered === correct) {
    quizLocked = true;                             // 正解→次の問題が表示されるまでロック
    const card = document.getElementById('quiz-card');
    card.classList.add('quiz-correct-flash');
    card.addEventListener('animationend', () => card.classList.remove('quiz-correct-flash'), { once: true });

    const isLast = state.quizQIdx === questions.length - 1;
    if (isLast) {
      showLevelComplete();
    } else {
      setTimeout(() => {
        state.quizQIdx++;
        render();                                  // render() 内でロック解除
        const newInput = document.getElementById('quiz-input');
        if (newInput) newInput.focus();
      }, 400);
    }
  } else {
    const card = document.getElementById('quiz-card');
    card.classList.add('shake');
    card.addEventListener('animationend', () => card.classList.remove('shake'), { once: true });
    showQuizMsg('ざんねん！もう一度考えてみよう', true);
    input.value = '';
    input.focus();
  }
}

function showQuizMsg(msg, isError) {
  const el = document.getElementById('quiz-msg');
  if (!el) return;
  el.textContent = msg;
  el.className = 'quiz-msg ' + (isError ? 'quiz-msg-error' : 'quiz-msg-ok');
  el.style.display = 'block';
}

function showLevelComplete() {
  const lv      = LEVELS[state.quizLevelIdx];
  const isNew   = completeLevel(state.chapterIdx, state.sectionIdx, state.quizLevelIdx);
  const peasStr = '🌱'.repeat(lv.peas);

  const card = document.getElementById('quiz-card');
  card.classList.add('quiz-success');
  card.innerHTML = `
    <div class="quiz-success-icon">🎉</div>
    <div class="quiz-success-text">レベルクリア！！</div>
    <div class="quiz-success-level">${lv.stars} ${lv.label}</div>
    <div class="quiz-success-peas">${isNew ? peasStr + ' ×' + lv.peas + '個ゲット！' : 'クリア済みです！'}</div>
  `;
  if (isNew) {
    setTimeout(() => {
      for (let i = 0; i < lv.peas; i++) {
        setTimeout(() => bounceAndAddPea(), i * 300);
      }
      showConfetti();
    }, 500);
  }
  setTimeout(() => navigate('difficulty'), 3000);
}

// ============================================================
// ===== 小テスト（パスワード制・5問一括・再テストあり） =====
// ============================================================

// ----- パスワードモーダル -----
function startMiniTestFlow() {
  const existing = document.getElementById('minitest-modal-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'minitest-modal-overlay';
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-card" id="minitest-modal-card">
      <div class="modal-lock">📝</div>
      <div class="modal-level">小テスト</div>
      <p class="modal-desc">先生から教えてもらったパスワードを<br>入力してください</p>
      <input type="password" id="minitest-pw" class="modal-input"
             placeholder="パスワード" autocomplete="off" style="margin-bottom:0.3rem">
      <div id="minitest-modal-error" class="modal-error"></div>
      <div class="modal-btns">
        <button class="modal-btn-cancel" onclick="closeMiniTestModal()">キャンセル</button>
        <button class="modal-btn-submit" onclick="submitMiniTestPassword()">スタート！</button>
      </div>
    </div>
  `;
  overlay.addEventListener('click', e => { if (e.target === overlay) closeMiniTestModal(); });
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('show'));
  const pwInput = document.getElementById('minitest-pw');
  if (pwInput) {
    pwInput.focus();
    pwInput.addEventListener('keydown', e => { if (e.key === 'Enter') submitMiniTestPassword(); });
  }
}

function closeMiniTestModal() {
  const overlay = document.getElementById('minitest-modal-overlay');
  if (!overlay) return;
  overlay.classList.remove('show');
  setTimeout(() => overlay.remove(), 300);
}


// ----- 小テスト画面レンダリング -----
function renderMiniTest() {
  const sec = mathData.chapters[state.chapterIdx].sections[state.sectionIdx];

  if (state.miniTestPhase === 'quiz') {
    return renderMiniTestQuizPhase(sec, '小テスト', 'submitMiniTestAnswers()');
  } else {
    return renderMiniTestResultPhase(sec);
  }
}

// 5問一括フォームHTML（小テスト・練習共通）
function renderBulkQuizForm(sec, questions, title, badgeColor, submitFn, inputPrefix) {
  const qRows = questions.map((q, i) => {
    const lv = LEVELS[q.fromLevel];
    return `
      <div class="bulk-q-row">
        <div class="bulk-q-header">
          <span class="bulk-q-num">問 ${i + 1}</span>
          <span class="bulk-q-level" style="color:${lv.color}">${lv.stars} ${lv.label}</span>
        </div>
        <div class="bulk-q-text">${formatQuestion(q.q)}</div>
        ${getBlankHint(q) ? `<div class="bulk-q-hint"><span class="bulk-q-hint-label">答えの形</span>${formatQuestion(getBlankHint(q))}</div>` : ''}
        <div class="bulk-q-input-wrap">
          <input class="bulk-q-input" id="${inputPrefix}-${i}"
                 type="text" placeholder="${q.b && q.b.trim() ? '＿＿ に入る答えを入力' : '答えを入力'}"
                 autocomplete="off"
                 onkeydown="bulkInputKeydown(event,${i},'${inputPrefix}')">
        </div>
      </div>`;
  }).join('');

  return `
    <button class="back-btn" onclick="navigate('difficulty')">← 難易度選択に戻る</button>
    <div class="quiz-header">
      <h2>${sec.title}</h2>
      <span class="quiz-level-badge" style="--lv-color:${badgeColor}">${title}</span>
    </div>
    <div class="bulk-form-wrap">
      <div class="bulk-questions-list">${qRows}</div>
      <div class="bulk-submit-area">
        <button class="bulk-submit-btn" onclick="${submitFn}">採点する！</button>
      </div>
    </div>`;
}

// 一括クイズフォーム共通の Enter キー処理：次の入力欄 or 採点ボタンへ
function bulkInputKeydown(e, i, prefix) {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  const next = document.getElementById(`${prefix}-${i + 1}`);
  if (next) {
    next.focus();
    const row = next.closest('.bulk-q-row') || next;
    // 問題カードの上端が画面中央より少し上（35%）に来るようスクロール
    const rowTop = row.getBoundingClientRect().top + window.scrollY;
    const targetScroll = rowTop - window.innerHeight * 0.35;
    window.scrollTo({ top: Math.max(0, targetScroll), behavior: 'smooth' });
  } else {
    // 最終問題 → 採点ボタンへ
    const btn = document.querySelector('.bulk-submit-btn');
    if (btn) {
      btn.focus();
      btn.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }
}

function renderMiniTestQuizPhase(sec) {
  const isRetry = state.miniTestWrongIndices.length > 0 && state.miniTestPhase === 'quiz';
  const title = isRetry ? '📝 再テスト' : '📝 小テスト';
  return renderBulkQuizForm(sec, state.miniTestQuestions, title, '#ffd200', 'submitMiniTestAnswers()', 'mt');
}

function renderMiniTestResultPhase(sec) {
  const questions  = state.miniTestQuestions;
  const wrong      = state.miniTestWrongIndices;
  const allCorrect = wrong.length === 0;

  const qRows = questions.map((q, i) => {
    const isWrong = wrong.includes(i);
    const lv      = LEVELS[q.fromLevel];
    const entered = state.miniTestAnswers[i] || '';
    return `
      <div class="bulk-q-row ${isWrong ? 'bulk-q-wrong' : 'bulk-q-correct'}">
        <div class="bulk-q-header">
          <span class="bulk-q-num">問 ${i + 1}
            <span class="bulk-q-mark">${isWrong ? '✗' : '✓'}</span>
          </span>
          <span class="bulk-q-level" style="color:${lv.color}">${lv.stars} ${lv.label}</span>
        </div>
        <div class="bulk-q-text">${formatQuestion(q.q)}</div>
        ${getBlankHint(q) ? `<div class="bulk-q-hint"><span class="bulk-q-hint-label">答えの形</span>${formatQuestion(getBlankHint(q))}</div>` : ''}
        ${isWrong
          ? `<div class="bulk-result-wrong">
               あなたの答え：<span class="bulk-ans-entered">${escHtml(entered) || '（未入力）'}</span>
               &nbsp;✗ 不正解
             </div>`
          : `<div class="bulk-result-correct">✓ 正解</div>`
        }
      </div>`;
  }).join('');

  const score = questions.length - wrong.length;
  const total = questions.length;

  let bannerHtml = '';
  if (allCorrect) {
    bannerHtml = `
      <div class="bulk-banner bulk-banner-perfect">
        🎉 全問正解！
        ${state.miniTestPeaIsNew
          ? '&nbsp; 🌱 ×1個ゲット！'
          : '<span style="font-size:0.85em;opacity:0.75">（グリンピースは獲得済みです）</span>'}
      </div>`;
  } else {
    bannerHtml = `
      <div class="bulk-banner bulk-banner-partial">
        ${score} / ${total} 正解　― 間違えた ${wrong.length} 問を再テストしよう！
      </div>`;
  }

  return `
    <button class="back-btn" onclick="navigate('difficulty')">← 難易度選択に戻る</button>
    <div class="quiz-header">
      <h2>${sec.title}</h2>
      <span class="quiz-level-badge" style="--lv-color:#ffd200">📝 小テスト 結果</span>
    </div>
    <div class="bulk-form-wrap">
      ${bannerHtml}
      <div class="bulk-questions-list">${qRows}</div>
      <div class="bulk-submit-area">
        ${!allCorrect
          ? `<button class="bulk-retry-btn" onclick="startMiniTestRetry()">
               間違えた ${wrong.length} 問を再テスト
             </button>`
          : ''}
        <button class="bulk-back-btn" onclick="navigate('difficulty')">
          難易度選択に戻る
        </button>
      </div>
    </div>`;
}

// ----- 採点 -----
function submitMiniTestAnswers() {
  const questions = state.miniTestQuestions;
  const answers   = questions.map((_, i) => {
    const el = document.getElementById(`mt-${i}`);
    return el ? el.value : '';
  });
  state.miniTestAnswers = answers;

  const wrongIndices = questions.reduce((acc, q, i) => {
    if (normalizeAnswer(answers[i]) !== normalizeAnswer(getCorrectAnswer(q))) acc.push(i);
    return acc;
  }, []);
  state.miniTestWrongIndices = wrongIndices;

  const allCorrect = wrongIndices.length === 0;
  if (allCorrect) {
    const isNew = completeMiniTest(state.chapterIdx, state.sectionIdx);
    state.miniTestPeaIsNew = isNew;
    if (isNew) {
      setTimeout(() => { bounceAndAddPea(); showConfetti(); }, 400);
    }
  } else {
    state.miniTestPeaIsNew = false;
  }

  state.miniTestPhase = 'result';
  render();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ----- 再テスト（間違えた問題のみ） -----
function startMiniTestRetry() {
  const wrongQs = state.miniTestWrongIndices.map(i => state.miniTestQuestions[i]);
  state.miniTestQuestions    = wrongQs;
  state.miniTestPhase        = 'quiz';
  state.miniTestAnswers      = [];
  state.miniTestWrongIndices = [];
  render();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ============================================================
// ===== 練習（パスワード不要・上限3個） =====
// ============================================================

function startPractice() {
  const sec = mathData.chapters[state.chapterIdx].sections[state.sectionIdx];
  state.practiceQuestions    = generate5Questions(sec);
  state.practicePhase        = 'quiz';
  state.practiceAnswers      = [];
  state.practiceWrongIndices = [];
  state.practicePeaIsNew     = false;
  navigate('practice');
}

function renderPractice() {
  const sec = mathData.chapters[state.chapterIdx].sections[state.sectionIdx];

  if (state.practicePhase === 'quiz') {
    return renderBulkQuizForm(sec, state.practiceQuestions, '✏️ 練習', '#56ab2f', 'submitPracticeAnswers()', 'prac');
  }

  // 結果フェーズ
  const questions  = state.practiceQuestions;
  const wrong      = state.practiceWrongIndices;
  const allCorrect = wrong.length === 0;

  const qRows = questions.map((q, i) => {
    const isWrong = wrong.includes(i);
    const lv      = LEVELS[q.fromLevel];
    const entered = state.practiceAnswers[i] || '';
    return `
      <div class="bulk-q-row ${isWrong ? 'bulk-q-wrong' : 'bulk-q-correct'}">
        <div class="bulk-q-header">
          <span class="bulk-q-num">問 ${i + 1}
            <span class="bulk-q-mark">${isWrong ? '✗' : '✓'}</span>
          </span>
          <span class="bulk-q-level" style="color:${lv.color}">${lv.stars} ${lv.label}</span>
        </div>
        <div class="bulk-q-text">${formatQuestion(q.q)}</div>
        ${getBlankHint(q) ? `<div class="bulk-q-hint"><span class="bulk-q-hint-label">答えの形</span>${formatQuestion(getBlankHint(q))}</div>` : ''}
        ${isWrong
          ? `<div class="bulk-result-wrong">
               あなたの答え：<span class="bulk-ans-entered">${escHtml(entered) || '（未入力）'}</span>
               <span class="bulk-arrow">→</span>
               正解：<span class="bulk-ans-correct">${escHtml(getCorrectAnswer(q))}</span>
             </div>`
          : `<div class="bulk-result-correct">✓ 正解：<span class="bulk-ans-correct">${escHtml(getCorrectAnswer(q))}</span></div>`
        }
      </div>`;
  }).join('');

  const score          = questions.length - wrong.length;
  const total          = questions.length;
  const practiceEarned = getPracticePeaEarned();
  const practiceMaxed  = practiceEarned >= 3;

  let bannerHtml = '';
  if (allCorrect) {
    bannerHtml = `
      <div class="bulk-banner bulk-banner-perfect">
        🎉 全問正解！
        ${state.practicePeaIsNew
          ? '&nbsp; 🌱 ×1個ゲット！'
          : practiceMaxed
          ? '（練習グリンピース上限3個達成済み）'
          : ''}
      </div>`;
  } else {
    bannerHtml = `
      <div class="bulk-banner bulk-banner-partial">
        ${score} / ${total} 正解　― 全問正解で 🌱×1個（累計上限3個）
      </div>`;
  }

  return `
    <button class="back-btn" onclick="navigate('difficulty')">← 難易度選択に戻る</button>
    <div class="quiz-header">
      <h2>${sec.title}</h2>
      <span class="quiz-level-badge" style="--lv-color:#56ab2f">✏️ 練習 結果</span>
    </div>
    <div class="bulk-form-wrap">
      ${bannerHtml}
      <div class="bulk-questions-list">${qRows}</div>
      <div class="bulk-submit-area">
        <button class="bulk-practice-again-btn" onclick="startPractice()">
          もう一度練習する（別の問題）
        </button>
        <button class="bulk-back-btn" onclick="navigate('difficulty')">
          難易度選択に戻る
        </button>
      </div>
    </div>`;
}

function submitPracticeAnswers() {
  const questions = state.practiceQuestions;
  const answers   = questions.map((_, i) => {
    const el = document.getElementById(`prac-${i}`);
    return el ? el.value : '';
  });
  state.practiceAnswers = answers;

  const wrongIndices = questions.reduce((acc, q, i) => {
    if (normalizeAnswer(answers[i]) !== normalizeAnswer(getCorrectAnswer(q))) acc.push(i);
    return acc;
  }, []);
  state.practiceWrongIndices = wrongIndices;

  const allCorrect = wrongIndices.length === 0;
  if (allCorrect) {
    const isNew = addPracticePea();
    state.practicePeaIsNew = isNew;
    if (isNew) {
      setTimeout(() => { bounceAndAddPea(); showConfetti(); }, 400);
    }
  } else {
    state.practicePeaIsNew = false;
  }

  state.practicePhase = 'result';
  render();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ============================================================
// ===== タイムアタック =====
// ============================================================

// ティア定義（30秒/40秒/50秒）
const TA_TIERS = [
  { sec: 30, peas: 3, label: '30秒以内', color: '#00d2ff', medal: '🥇' },
  { sec: 40, peas: 2, label: '40秒以内', color: '#9ded62', medal: '🥈' },
  { sec: 50, peas: 1, label: '50秒以内', color: '#f7971e', medal: '🥉' },
];

// ----- localStorage -----
function getTimeAttackData(chIdx, secIdx) {
  const p = getProgress();
  const def = { bestTime: null, earnedTiers: [], teacherBeaten: false, teacherTimeWhenBeaten: null, studentBestBeaten: false, studentBestTimeWhenBeaten: null };
  if (!p.timeAttack) return def;
  return Object.assign({}, def, p.timeAttack[`${chIdx}_${secIdx}`] || {});
}

// 先生を撃破済みかどうか（先生がタイム更新した場合はリセット）
function isTeacherBeaten(taData, currentTeacherTime) {
  return taData.teacherBeaten && taData.teacherTimeWhenBeaten === currentTeacherTime;
}
// 生徒ベストを撃破済みかどうか（先生が更新した場合はリセット）
function isStudentBestBeaten(taData, currentStudentTime) {
  return taData.studentBestBeaten && taData.studentBestTimeWhenBeaten === currentStudentTime;
}

function saveTimeAttackData(chIdx, secIdx, data) {
  const p = getProgress();
  if (!p.timeAttack) p.timeAttack = {};
  p.timeAttack[`${chIdx}_${secIdx}`] = data;
  saveProgress(p);
}

// ----- スタート -----
function startTimeAttack() {
  const sec = mathData.chapters[state.chapterIdx].sections[state.sectionIdx];
  state.timeAttackQuestions    = generate5Questions(sec);
  state.timeAttackPhase        = 'quiz';
  state.timeAttackAnswers      = [];
  state.timeAttackWrongIndices = [];
  state.timeAttackElapsed      = null;
  state.timeAttackPrevBest     = null;
  state.timeAttackStartTime    = Date.now();
  navigate('timeattack');
}

// ----- レンダリング -----
function renderTimeAttack() {
  const sec = mathData.chapters[state.chapterIdx].sections[state.sectionIdx];
  if (state.timeAttackPhase === 'quiz') {
    const qRows = state.timeAttackQuestions.map((q, i) => {
      const lv = LEVELS[q.fromLevel];
      return `
        <div class="bulk-q-row">
          <div class="bulk-q-header">
            <span class="bulk-q-num">問 ${i + 1}</span>
            <span class="bulk-q-level" style="color:${lv.color}">${lv.stars} ${lv.label}</span>
          </div>
          <div class="bulk-q-text">${formatQuestion(q.q)}</div>
          ${getBlankHint(q) ? `<div class="bulk-q-hint"><span class="bulk-q-hint-label">答えの形</span>${formatQuestion(getBlankHint(q))}</div>` : ''}
          <div class="bulk-q-input-wrap">
            <input class="bulk-q-input" id="ta-${i}"
                   type="text" placeholder="${q.b && q.b.trim() ? '＿＿ に入る答えを入力' : '答えを入力'}" autocomplete="off"
                   onkeydown="taInputKeydown(event,${i})">
          </div>
        </div>`;
    }).join('');

    const teacherTime = sec.teacherTime || null;
    const studentBestTime = sec.studentBestTime || null;
    const studentBestName = sec.studentBestName || '生徒';
    const taCurrentData = getTimeAttackData(state.chapterIdx, state.sectionIdx);
    const targetHtml = teacherTime !== null && !isTeacherBeaten(taCurrentData, teacherTime)
      ? `<div class="ta-teacher-target">👑 小林T のタイム：<span>${teacherTime.toFixed(1)}秒</span>を超えれば 🌱×10個！</div>`
      : teacherTime !== null && isTeacherBeaten(taCurrentData, teacherTime)
      ? `<div class="ta-teacher-target ta-teacher-beaten-msg">👑 小林T 撃破済み！（${teacherTime.toFixed(1)}秒）</div>`
      : '';
    const studentTargetHtml = studentBestTime !== null && !isStudentBestBeaten(taCurrentData, studentBestTime)
      ? `<div class="ta-teacher-target ta-student-target">🏅 ${studentBestName} のタイム：<span>${studentBestTime.toFixed(1)}秒</span>を超えれば 🌱×50個！</div>`
      : studentBestTime !== null && isStudentBestBeaten(taCurrentData, studentBestTime)
      ? `<div class="ta-teacher-target ta-teacher-beaten-msg">🏅 ${studentBestName} 撃破済み！（${studentBestTime.toFixed(1)}秒）</div>`
      : '';
    // 2位・3位（参考表示）
    const studentRankList = Array.isArray(sec.studentBestList) ? sec.studentBestList : [];
    const studentExtraTargetHtml = studentRankList.slice(1, 3).map((e, i) => {
      const medal = i === 0 ? '🥈' : '🥉';
      return `<div class="ta-teacher-target ta-student-target-extra">${medal} ${escHtml(e.name)}：<span>${e.time.toFixed(1)}秒</span></div>`;
    }).join('');
    return `
      <button class="back-btn" onclick="navigate('difficulty')">← 難易度選択に戻る</button>
      <div class="quiz-header">
        <h2>${sec.title}</h2>
        <span class="quiz-level-badge" style="--lv-color:#00d2ff">⏱ タイムアタック</span>
      </div>
      <div class="ta-timer-wrap" id="ta-timer-wrap">
        <div class="ta-live-timer" id="ta-live-timer">0.0秒</div>
        <div class="ta-timer-label">タイマー計測中…</div>
        ${targetHtml}
        ${studentTargetHtml}
        ${studentExtraTargetHtml}
      </div>
      <div class="bulk-form-wrap">
        <div class="bulk-questions-list">${qRows}</div>
        <div class="bulk-submit-area">
          <button class="bulk-submit-btn ta-submit-btn" onclick="submitTimeAttackAnswers()">採点する！</button>
        </div>
      </div>`;
  }
  return renderTimeAttackResult(sec);
}

function renderTimeAttackResult(sec) {
  const questions  = state.timeAttackQuestions;
  const wrong      = state.timeAttackWrongIndices;
  const allCorrect = wrong.length === 0;
  const elapsed    = state.timeAttackElapsed;
  const taData     = getTimeAttackData(state.chapterIdx, state.sectionIdx);

  // 問題結果行
  const qRows = questions.map((q, i) => {
    const isWrong = wrong.includes(i);
    const lv      = LEVELS[q.fromLevel];
    const entered = state.timeAttackAnswers[i] || '';
    return `
      <div class="bulk-q-row ${isWrong ? 'bulk-q-wrong' : 'bulk-q-correct'}">
        <div class="bulk-q-header">
          <span class="bulk-q-num">問 ${i + 1} <span class="bulk-q-mark">${isWrong ? '✗' : '✓'}</span></span>
          <span class="bulk-q-level" style="color:${lv.color}">${lv.stars} ${lv.label}</span>
        </div>
        <div class="bulk-q-text">${formatQuestion(q.q)}</div>
        ${getBlankHint(q) ? `<div class="bulk-q-hint"><span class="bulk-q-hint-label">答えの形</span>${formatQuestion(getBlankHint(q))}</div>` : ''}
        ${isWrong
          ? `<div class="bulk-result-wrong">
               あなたの答え：<span class="bulk-ans-entered">${escHtml(entered) || '（未入力）'}</span>
               <span class="bulk-arrow">→</span>
               正解：<span class="bulk-ans-correct">${escHtml(getCorrectAnswer(q))}</span>
             </div>`
          : `<div class="bulk-result-correct">✓ 正解：<span class="bulk-ans-correct">${escHtml(getCorrectAnswer(q))}</span></div>`
        }
      </div>`;
  }).join('');

  // 不正解ありの場合
  if (!allCorrect) {
    return `
      <button class="back-btn" onclick="navigate('difficulty')">← 難易度選択に戻る</button>
      <div class="quiz-header">
        <h2>${sec.title}</h2>
        <span class="quiz-level-badge" style="--lv-color:#f5576c">⏱ タイムアタック 結果</span>
      </div>
      <div class="bulk-form-wrap">
        <div class="ta-result-time-wrap ta-result-wrong-wrap">
          <div class="ta-result-time" style="color:#f5576c">${elapsed.toFixed(1)}秒</div>
          <div class="ta-result-msg">全問正解が必要です！正解してからタイムを競おう 💪</div>
          ${taData.bestTime !== null ? `<div class="ta-best-display">🏆 最速記録：${taData.bestTime.toFixed(1)}秒</div>` : ''}
        </div>
        <div class="bulk-questions-list">${qRows}</div>
        <div class="bulk-submit-area">
          <button class="ta-retry-btn" onclick="startTimeAttack()">もう一度チャレンジ！</button>
          <button class="bulk-back-btn" onclick="navigate('difficulty')">難易度選択に戻る</button>
        </div>
      </div>`;
  }

  // 全問正解の場合
  const prevBest    = state.timeAttackPrevBest;
  const isFirstClear = prevBest === null;
  const isNewBest   = !isFirstClear && elapsed < prevBest;

  // タイム表示の色
  let timeColor = 'rgba(255,255,255,0.75)';
  if      (elapsed <= 30) timeColor = '#00d2ff';
  else if (elapsed <= 40) timeColor = '#9ded62';
  else if (elapsed <= 50) timeColor = '#f7971e';

  // ティアカード
  const tierCards = TA_TIERS.map(t => {
    const achieved  = elapsed <= t.sec;
    const wasEarned = taData.earnedTiers.includes(t.sec);
    const newlyEarned = achieved && prevBest !== undefined &&
      !( prevBest !== null && [30,40,50].some(s => s === t.sec && prevBest <= t.sec) );
    // より正確な判定：今回新たに追加されたか（submitで記録済み）
    // → earnedTiersを見て achieved かつ wasEarned なら新規か既存かを
    //   timeAttackPrevBest から判断
    const newlyEarnedActual = achieved && wasEarned && (prevBest === null || prevBest > t.sec);

    if (newlyEarnedActual) {
      return `<div class="ta-tier-card ta-tier-new" style="--tier-color:${t.color}">
        <span class="ta-tier-medal">${t.medal}</span>
        <span class="ta-tier-label">${t.label}</span>
        <span class="ta-tier-peas">🌱×${t.peas} NEW！</span>
      </div>`;
    } else if (wasEarned || achieved) {
      return `<div class="ta-tier-card ta-tier-done">
        <span class="ta-tier-medal">${t.medal}</span>
        <span class="ta-tier-label">${t.label}</span>
        <span class="ta-tier-peas">✓ 獲得済み</span>
      </div>`;
    } else {
      return `<div class="ta-tier-card ta-tier-miss">
        <span class="ta-tier-medal">${t.medal}</span>
        <span class="ta-tier-label">${t.label}</span>
        <span class="ta-tier-peas">🌱×${t.peas}</span>
      </div>`;
    }
  }).join('');

  // 今回獲得グリンピース数
  const newPeasThisTime = TA_TIERS.filter(t => {
    const achieved  = elapsed <= t.sec;
    const wasEarned = prevBest !== null && prevBest <= t.sec;
    return achieved && !wasEarned;
  }).reduce((s, t) => s + t.peas, 0);

  return `
    <button class="back-btn" onclick="navigate('difficulty')">← 難易度選択に戻る</button>
    <div class="quiz-header">
      <h2>${sec.title}</h2>
      <span class="quiz-level-badge" style="--lv-color:#00d2ff">⏱ タイムアタック 結果</span>
    </div>
    <div class="bulk-form-wrap">
      <div class="ta-result-time-wrap">
        <div class="ta-result-time" style="color:${timeColor}">${elapsed.toFixed(1)}秒</div>
        ${isFirstClear ? '<div class="ta-new-record">🎉 初クリア！</div>' : ''}
        ${isNewBest    ? '<div class="ta-new-record">🏆 新記録！</div>' : ''}
        ${state.timeAttackTeacherBeaten ? '<div class="ta-teacher-beaten">👑 小林T を倒した！ 🌱×10個ゲット！</div>' : ''}
        ${state.timeAttackStudentBeaten ? `<div class="ta-teacher-beaten ta-student-beaten">🏅 ${sec.studentBestName || '生徒'}のベストを破った！ 🌱×50個ゲット！</div>` : ''}
        ${newPeasThisTime > 0 ? `<div class="ta-peas-earned">🌱 ×${newPeasThisTime}個 ゲット！</div>` : ''}
        ${!isFirstClear && !isNewBest && taData.bestTime !== null
          ? `<div class="ta-best-display">🏆 最速記録：${taData.bestTime.toFixed(1)}秒</div>` : ''}
      </div>
      <div class="ta-tier-cards">${tierCards}</div>
      <div class="bulk-questions-list" style="margin-top:1.2rem">${qRows}</div>
      <div class="bulk-submit-area">
        <button class="ta-retry-btn" onclick="startTimeAttack()">もう一度チャレンジ！</button>
        <button class="bulk-back-btn" onclick="navigate('difficulty')">難易度選択に戻る</button>
      </div>
    </div>`;
}

// ----- Enter キーで次の解答欄へ移動 -----
function taInputKeydown(e, i) {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  const next = document.getElementById(`ta-${i + 1}`);
  if (next) {
    next.focus();
    const row = next.closest('.bulk-q-row') || next;
    // 問題カードの上端が画面中央より少し上（画面の35%）に来るようスクロール
    const rowTop = row.getBoundingClientRect().top + window.scrollY;
    const targetScroll = rowTop - window.innerHeight * 0.35;
    window.scrollTo({ top: Math.max(0, targetScroll), behavior: 'smooth' });
  } else {
    // 最終問題 → 採点ボタンへ
    const btn = document.querySelector('.ta-submit-btn');
    if (btn) {
      btn.focus();
      btn.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }
}

// ----- 採点 -----
function submitTimeAttackAnswers() {
  // タイマー停止
  clearInterval(taTimerInterval);
  const elapsed = (Date.now() - state.timeAttackStartTime) / 1000;
  state.timeAttackElapsed = elapsed;

  const questions = state.timeAttackQuestions;
  const answers   = questions.map((_, i) => {
    const el = document.getElementById(`ta-${i}`);
    return el ? el.value : '';
  });
  state.timeAttackAnswers = answers;

  const wrongIndices = questions.reduce((acc, q, i) => {
    if (normalizeAnswer(answers[i]) !== normalizeAnswer(getCorrectAnswer(q))) acc.push(i);
    return acc;
  }, []);
  state.timeAttackWrongIndices = wrongIndices;

  const allCorrect = wrongIndices.length === 0;

  if (allCorrect) {
    const taData = getTimeAttackData(state.chapterIdx, state.sectionIdx);
    state.timeAttackPrevBest = taData.bestTime;  // 今回前のベストを保存

    let newPeas = 0;

    // ティア判定
    TA_TIERS.forEach(tier => {
      if (elapsed <= tier.sec && !taData.earnedTiers.includes(tier.sec)) {
        taData.earnedTiers.push(tier.sec);
        newPeas += tier.peas;
      }
    });

    // 小林T チャレンジ判定
    const sec = mathData.chapters[state.chapterIdx].sections[state.sectionIdx];
    const teacherTime = sec.teacherTime || null;
    state.timeAttackTeacherBeaten = false;
    if (teacherTime !== null && elapsed < teacherTime && !isTeacherBeaten(taData, teacherTime)) {
      taData.teacherBeaten = true;
      taData.teacherTimeWhenBeaten = teacherTime;  // 倒したときの先生タイムを記録
      newPeas += 10;
      state.timeAttackTeacherBeaten = true;  // 今回初めて先生を倒した
    }

    // 生徒自己ベスト チャレンジ判定
    const studentBestTime = sec.studentBestTime || null;
    state.timeAttackStudentBeaten = false;
    if (studentBestTime !== null && elapsed < studentBestTime && !isStudentBestBeaten(taData, studentBestTime)) {
      taData.studentBestBeaten = true;
      taData.studentBestTimeWhenBeaten = studentBestTime;
      newPeas += 50;
      state.timeAttackStudentBeaten = true;
    }

    if (taData.bestTime === null || elapsed < taData.bestTime) {
      taData.bestTime = elapsed;
    }
    saveTimeAttackData(state.chapterIdx, state.sectionIdx, taData);

    if (newPeas > 0) {
      addPeas(newPeas);
      setTimeout(() => {
        for (let i = 0; i < newPeas; i++) {
          setTimeout(() => bounceAndAddPea(), i * 200);
        }
        if (newPeas >= 3) showConfetti();
      }, 400);
    }
  }

  state.timeAttackPhase = 'result';
  render();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ============================================================
// ============================================================
// ===== カードマッチ =====
// ============================================================
const CM_PAIRS    = 10;
const CM_MAX_MISS = 3;
const CM_KEY      = 'cardMatch_v1';

let cmCards    = [];
let cmSelected = [];
let cmMistakes = 0;
let cmSeconds  = 0;
let cmTimerIv  = null;
let cmLocked   = false;
let cmPhase    = 'idle';

function cmLoad() { return JSON.parse(localStorage.getItem(CM_KEY) || '{}'); }
function cmSave(d) { localStorage.setItem(CM_KEY, JSON.stringify(d)); }

function cmFmt(s) {
  return String(s)
    .replace(/\+/g, '＋')
    .replace(/-/g, '－')
    .replace(/\{([^/}]+)\/([^}]+)\}/g,
      '<span class="cm-frac"><span>$1</span><span>$2</span></span>')
    .replace(/²/g, '<sup>2</sup>')
    .replace(/³/g, '<sup>3</sup>');
}

function cmFmtTime(s) {
  const m   = Math.floor(s / 60);
  const sec = String(s % 60).padStart(2, '0');
  return `${m}:${sec}`;
}

function cmPickProblems() {
  const ch = mathData.chapters[0]; // 式の展開と因数分解
  const USE_SECTIONS = ['乗法の公式', '式の乗法', '式の展開'];
  let pool = [];
  for (const sec of ch.sections) {
    if (!USE_SECTIONS.includes(sec.title)) continue;
    for (const q of (sec.basic || [])) {
      // 「係数」を問う問題・答えが数字のみの問題を除外
      if (q.q && q.a && !q.q.includes('係数') && /[a-zA-Zａ-ｚ]/.test(q.a)) {
        pool.push({ q: q.q, a: q.a });
      }
    }
  }
  pool.sort(() => Math.random() - 0.5);
  return pool.slice(0, CM_PAIRS);
}

function cmGenPositions(gridW, gridH) {
  // 画面幅に応じて列数を決定（狭い端末は4列×5行）
  const cols = gridW < 420 ? 4 : 5;
  const rows = 20 / cols;  // 4cols→5rows, 5cols→4rows
  const GAP  = 6;   // ゾーン間のすき間(px)
  const zW   = gridW / cols;
  const zH   = gridH / rows;

  // カードサイズ = ゾーンからGAPを引いたサイズ（回転余白を考慮）
  const CARD_W = Math.max(60, Math.floor(zW - GAP));
  const CARD_H = Math.max(52, Math.min(90, Math.floor(zH - GAP)));

  // 回転しても隣のゾーンにはみ出さない最大角度(°)を計算
  // 条件: CARD_W*cos(a) + CARD_H*sin(a) <= zW
  // 近似: sin(a) ≈ (zW - CARD_W) / CARD_H
  const sinMax  = Math.max(0, (zW - CARD_W - 2) / Math.max(1, CARD_H));
  const MAX_ROT = Math.min(12, Math.floor(Math.asin(Math.min(sinMax, 1)) * 180 / Math.PI));

  const positions = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      // ゾーン中央に配置（位置オフセットなし）
      const left = c * zW + (zW - CARD_W) / 2;
      const top  = r * zH + (zH - CARD_H) / 2;
      const rot  = (Math.random() - 0.5) * 2 * MAX_ROT;
      positions.push({
        left:  left.toFixed(0) + 'px',
        top:   top.toFixed(0)  + 'px',
        rot:   rot.toFixed(1)  + 'deg',
        cardW: CARD_W,
        cardH: CARD_H,
      });
    }
  }
  positions.sort(() => Math.random() - 0.5);
  return positions;
}

function cmInit() {
  const probs = cmPickProblems();
  cmCards = [];
  probs.forEach((p, i) => {
    cmCards.push({ idx: 0, content: p.q, pairId: i, matched: false, selected: false, wrong: false, left: '0px', top: '0px', rot: '0deg', cardW: 110, cardH: 72 });
    cmCards.push({ idx: 0, content: p.a, pairId: i, matched: false, selected: false, wrong: false, left: '0px', top: '0px', rot: '0deg', cardW: 110, cardH: 72 });
  });
  cmCards.sort(() => Math.random() - 0.5);
  cmCards.forEach((c, i) => { c.idx = i; });
  cmSelected = [];
  cmMistakes = 0;
  cmSeconds  = 0;
  cmLocked   = false;
  cmPhase    = 'playing';
}

// DOM描画後に実ピクセルでカード位置を計算して配置（共通ヘルパー）
function cmApplyPositions(renderFn) {
  const grid = document.getElementById('cm-grid');
  if (!grid) return;
  const w = grid.clientWidth;
  const h = grid.clientHeight;
  // h が小さすぎる場合はレイアウト未確定 → 再試行
  // （カード4行×最低52px = 208px を下回る場合は待つ）
  if (w === 0 || h < 150) {
    requestAnimationFrame(() => cmApplyPositions(renderFn));
    return;
  }
  const positions = cmGenPositions(w, h);
  cmCards.forEach((c, i) => {
    const p = positions[i % positions.length];
    c.left = p.left; c.top = p.top; c.rot = p.rot; c.cardW = p.cardW; c.cardH = p.cardH;
  });
  renderFn();
}

// ソロ用
function cmLayoutCards() {
  const grid = document.getElementById('cm-grid');
  if (!grid) return;
  const w = grid.clientWidth;
  const h = grid.clientHeight;
  if (w === 0 || h < 150) {
    requestAnimationFrame(cmLayoutCards);
    return;
  }
  const positions = cmGenPositions(w, h);
  cmCards.forEach((c, i) => {
    const p = positions[i % positions.length];
    c.left  = p.left;
    c.top   = p.top;
    c.rot   = p.rot;
    c.cardW = p.cardW;
    c.cardH = p.cardH;
  });
  cmRenderGrid();
}

function cmStartTimer() {
  cmStopTimer();
  cmTimerIv = setInterval(() => {
    cmSeconds++;
    const el = document.getElementById('cm-timer');
    if (el) el.textContent = cmFmtTime(cmSeconds);
  }, 1000);
}

function cmStopTimer() {
  if (cmTimerIv) { clearInterval(cmTimerIv); cmTimerIv = null; }
}

function cmFlipCard(idx) {
  if (cmLocked || cmPhase !== 'playing') return;
  const c = cmCards[idx];
  if (c.matched || c.selected) return;
  c.selected = true;
  cmSelected.push(idx);
  cmRenderGrid();
  if (cmSelected.length === 2) {
    cmLocked = true;
    setTimeout(cmCheckMatch, 500);
  }
}

function cmCheckMatch() {
  const [i1, i2] = cmSelected;
  const c1 = cmCards[i1], c2 = cmCards[i2];
  if (c1.pairId === c2.pairId) {
    // 正解
    c1.matched = c2.matched = true;
    c1.selected = c2.selected = false;
    cmSelected = [];
    cmLocked   = false;
    cmRenderGrid();
    if (cmCards.every(c => c.matched)) cmComplete();
  } else {
    // 不正解
    c1.wrong = c2.wrong = true;
    cmMistakes++;
    cmRenderGrid();
    cmRenderHearts();
    setTimeout(() => {
      c1.selected = c2.selected = false;
      c1.wrong    = c2.wrong    = false;
      cmSelected  = [];
      cmLocked    = false;
      if (cmMistakes >= CM_MAX_MISS) {
        cmGameOver();
      } else {
        cmRenderGrid();
      }
    }, 700);
  }
}

function cmRenderHearts() {
  const el = document.getElementById('cm-hearts');
  if (!el) return;
  const left = CM_MAX_MISS - cmMistakes;
  el.innerHTML = Array.from({ length: CM_MAX_MISS }, (_, i) =>
    `<span class="cm-heart${i >= left ? ' cm-heart-lost' : ''}">♥</span>`
  ).join('');
}

function cmCardFontSize(raw, cardWpx) {
  // 文字種ごとの幅比率（cmFmt後の全角変換を考慮）
  let units = 0;
  for (const ch of String(raw || '')) {
    if (ch === '+' || ch === '-') units += 1.05; // → 全角 ＋ ／ － (1em相当)
    else if (ch === '²' || ch === '³')  units += 0.42; // → <sup> で小さい
    else if (ch === '(' || ch === ')')  units += 0.52;
    else if (ch === '×' || ch === '÷') units += 0.90;
    else                                units += 0.60;
  }
  units = Math.max(units, 0.5);
  const availW = (cardWpx || 100) - 14; // パディング分
  const px = Math.min(availW / units, 26) * 0.90; // 0.90 安全マージン
  return Math.max(10, Math.floor(px)) + 'px';
}

function cmRenderGrid() {
  const el = document.getElementById('cm-grid');
  if (!el) return;
  el.innerHTML = cmCards.map(c => {
    const z = c.selected ? 20 : c.wrong ? 15 : 1;
    const tf = c.selected
      ? `rotate(${c.rot}) scale(1.1) translateY(-6px)`
      : `rotate(${c.rot})`;
    return `
      <div class="cm-card${c.matched ? ' cm-matched' : ''}${c.selected ? ' cm-selected' : ''}${c.wrong ? ' cm-wrong' : ''}"
           style="left:${c.left};top:${c.top};width:${c.cardW}px;height:${c.cardH}px;transform:${tf};z-index:${z};--rot:${c.rot}"
           onclick="cmFlipCard(${c.idx})">
        <div class="cm-card-inner" style="font-size:${cmCardFontSize(c.content, c.cardW)}">${cmFmt(c.content)}</div>
      </div>`;
  }).join('');
}

function cmTimePeas(sec) {
  if (sec <= 20) return 5;
  if (sec <= 30) return 4;
  if (sec <= 40) return 3;
  if (sec <= 50) return 2;
  if (sec <= 60) return 1;
  return 0;
}

function cmComplete() {
  cmStopTimer();
  cmPhase = 'complete';
  const d         = cmLoad();
  const prevBest  = d.best != null ? d.best : Infinity;
  const isNewBest = cmSeconds < prevBest;
  if (isNewBest) d.best = cmSeconds;
  cmSave(d);

  const peas = cmTimePeas(cmSeconds);
  if (peas > 0) addPeas(peas);

  // 小林Tタイム超えボーナス（別途+10）
  const beatTeacher = cmTeacherTime != null && cmSeconds < cmTeacherTime;
  if (beatTeacher) addPeas(10);

  // 生徒ベストタイム超えボーナス（+50）
  const beatStudentBest = cmStudentBestTime != null && cmSeconds < cmStudentBestTime;
  if (beatStudentBest) addPeas(50);

  const overlay = document.getElementById('cm-overlay');
  if (!overlay) return;
  overlay.innerHTML = `
    <div class="cm-result">
      <div class="cm-result-icon">${beatTeacher ? '👑' : beatStudentBest ? '🏅' : '🎉'}</div>
      <div class="cm-result-title">${beatTeacher ? '小林T超え！' : beatStudentBest ? `${cmStudentBestName}超え！` : 'クリア！'}</div>
      <div class="cm-result-time">${cmFmtTime(cmSeconds)}</div>
      ${isNewBest ? '<div class="cm-result-badge">🏅 自己ベスト更新！</div>' : ''}
      ${beatTeacher ? `<div class="cm-result-teacher-beat">👑 小林T(${cmFmtTime(cmTeacherTime)})を超えた！<br>🌱 ×10 ボーナス！</div>` : ''}
      ${beatStudentBest ? `<div class="cm-result-teacher-beat" style="color:#9ded62;border-color:rgba(157,237,98,0.3);">🏅 ${cmStudentBestName}(${cmFmtTime(cmStudentBestTime)})を超えた！<br>🌱 ×50 ボーナス！</div>` : ''}
      ${peas > 0 ? `<div class="cm-result-pea">🌱 ×${peas} もらった！</div>` : '<div class="cm-result-nopea">60秒超 → 報酬なし</div>'}
      <div class="cm-result-btns">
        <button class="cm-btn cm-btn-primary" onclick="cmStartSolo()">もう一度</button>
        <button class="cm-btn cm-btn-ghost"   onclick="cmBackToMenu()">メニューへ</button>
      </div>
    </div>`;
  overlay.classList.add('active');
  if (peas > 0) showConfetti();
}

function cmGameOver() {
  cmStopTimer();
  cmPhase = 'gameover';
  const overlay = document.getElementById('cm-overlay');
  if (!overlay) return;
  overlay.innerHTML = `
    <div class="cm-result">
      <div class="cm-result-icon">💔</div>
      <div class="cm-result-title">ゲームオーバー</div>
      <div class="cm-result-time">${cmFmtTime(cmSeconds)}</div>
      <div class="cm-result-btns">
        <button class="cm-btn cm-btn-primary" onclick="cmStartSolo()">もう一度</button>
        <button class="cm-btn cm-btn-ghost"   onclick="cmBackToMenu()">メニューへ</button>
      </div>
    </div>`;
  overlay.classList.add('active');
}

// ============================================================
// ===== カードマッチ グループモード =====
// ============================================================
let cmTeacherTime      = null;  // 小林Tのカードマッチ最速タイム（秒）
let cmStudentBestTime  = null;  // 生徒ベストタイム（秒）
let cmStudentBestName  = null;  // 生徒ベスト名前
let cmMode         = 'menu';   // 'menu' | 'solo' | 'group_setup' | 'group_play'
let cmGroupPlayers = [];       // [{name, score}]
let cmGroupTurn    = 0;
let cmGroupFirst   = null;     // 1枚目にめくったカードのidx
let cmGroupLocked  = false;

const CM_GROUP_COLORS = ['#ef4444','#3b82f6','#22c55e','#f59e0b','#a855f7','#ec4899'];

// ---- グループ：カードフリップ ----
function cmGroupFlip(idx) {
  if (cmGroupLocked || cmPhase !== 'playing') return;
  const c = cmCards[idx];
  if (c.matched || c.faceUp) return;

  c.faceUp = true;
  cmGroupRenderGrid();
  cmGroupRenderTurn();

  if (cmGroupFirst === null) {
    // 1枚目
    cmGroupFirst = idx;
  } else {
    // 2枚目：判定
    cmGroupLocked = true;
    const i1 = cmGroupFirst, i2 = idx;
    cmGroupFirst = null;
    setTimeout(() => {
      const c1 = cmCards[i1], c2 = cmCards[i2];
      if (c1.pairId === c2.pairId) {
        // ✅ マッチ！
        c1.matched = c2.matched = true;
        c1.faceUp  = c2.faceUp  = true;
        c1.matchedBy = c2.matchedBy = cmGroupTurn;
        cmGroupPlayers[cmGroupTurn].score++;
        cmGroupLocked = false;
        cmGroupRenderGrid();
        cmGroupRenderTurn();
        cmGroupRenderScores();
        if (cmCards.every(c => c.matched)) cmGroupComplete();
        // 同じプレイヤーが続けてめくれる（ターン変わらず）
      } else {
        // ❌ ミス → 裏返してターン交代
        c1.faceUp = c2.faceUp = false;
        cmGroupTurn = (cmGroupTurn + 1) % cmGroupPlayers.length;
        cmGroupLocked = false;
        cmGroupRenderGrid();
        cmGroupRenderTurn();
      }
    }, 950);
  }
}

// ---- ターン表示更新 ----
function cmGroupRenderTurn() {
  const el = document.getElementById('cmg-turn');
  if (!el) return;
  const p = cmGroupPlayers[cmGroupTurn];
  const col = CM_GROUP_COLORS[cmGroupTurn % CM_GROUP_COLORS.length];
  el.innerHTML = `<span style="color:${col};font-weight:900">${escHtml(p.name)}</span> の番`;
}

// ---- スコア表示更新 ----
function cmGroupRenderScores() {
  const el = document.getElementById('cmg-scores');
  if (!el) return;
  el.innerHTML = cmGroupPlayers.map((p, i) => {
    const col = CM_GROUP_COLORS[i % CM_GROUP_COLORS.length];
    const countLabel = p.count ? `<span class="cmg-chip-count">${p.count}人</span>` : '';
    return `<div class="cmg-score-chip${i === cmGroupTurn ? ' cmg-score-active' : ''}"
                 style="--pc:${col}">
      <span class="cmg-chip-name">${escHtml(p.name)}</span>
      ${countLabel}
      <span class="cmg-chip-score">${p.score}</span>
    </div>`;
  }).join('');
}

// ---- グループグリッド描画 ----
function cmGroupRenderGrid() {
  const el = document.getElementById('cm-grid');
  if (!el) return;
  el.innerHTML = cmCards.map(c => {
    const rot = c.rot || '0deg';
    const z   = c.faceUp ? 10 : 1;
    const tf  = `rotate(${rot})`;
    const col = CM_GROUP_COLORS[(c.matchedBy ?? cmGroupTurn) % CM_GROUP_COLORS.length];

    if (c.matched) {
      return `<div class="cm-card cm-matched"
           style="left:${c.left};top:${c.top};width:${c.cardW}px;height:${c.cardH}px;transform:${tf};z-index:${z};border-color:${col}40;background:${col}18">
        <div class="cm-card-inner" style="font-size:${cmCardFontSize(c.content,c.cardW)};opacity:0.55">${cmFmt(c.content)}</div>
      </div>`;
    }
    if (c.faceUp) {
      return `<div class="cm-card cmg-faceup"
           style="left:${c.left};top:${c.top};width:${c.cardW}px;height:${c.cardH}px;transform:${tf} scale(1.08);z-index:${z};--rot:${rot}"
           onclick="cmGroupFlip(${c.idx})">
        <div class="cm-card-inner" style="font-size:${cmCardFontSize(c.content,c.cardW)}">${cmFmt(c.content)}</div>
      </div>`;
    }
    // 裏向き
    return `<div class="cm-card cmg-back"
         style="left:${c.left};top:${c.top};width:${c.cardW}px;height:${c.cardH}px;transform:${tf};z-index:${z};--rot:${rot}"
         onclick="cmGroupFlip(${c.idx})">
      <div class="cmg-back-suit">♠</div>
    </div>`;
  }).join('');
}

// ---- グループゲーム完了 ----
function cmGroupComplete() {
  cmPhase = 'complete';
  const ranked = cmGroupPlayers
    .map((p, i) => ({...p, color: CM_GROUP_COLORS[i % CM_GROUP_COLORS.length]}))
    .sort((a, b) => b.score - a.score);
  const medals = ['🥇','🥈','🥉','4位','5位','6位'];
  const rows = ranked.map((p, ri) => `
    <div class="cmg-rank-row">
      <span class="cmg-rank-medal">${medals[ri]}</span>
      <span class="cmg-rank-name" style="color:${p.color}">${escHtml(p.name)}</span>
      ${p.count ? `<span class="cmg-rank-count">👤${p.count}人</span>` : ''}
      <span class="cmg-rank-score">${p.score}ペア</span>
    </div>`).join('');
  const overlay = document.getElementById('cm-overlay');
  if (!overlay) return;
  overlay.innerHTML = `
    <div class="cm-result">
      <div class="cm-result-icon">🏆</div>
      <div class="cm-result-title">ゲーム終了！</div>
      <div class="cmg-ranking">${rows}</div>
      <div class="cm-result-btns">
        <button class="cm-btn cm-btn-primary" onclick="cmGroupReplay()">もう一度</button>
        <button class="cm-btn cm-btn-ghost"   onclick="cmBackToMenu()">メニューへ</button>
      </div>
    </div>`;
  overlay.classList.add('active');
}

// ---- グループリプレイ ----
function cmGroupReplay() {
  const savedPlayers = cmGroupPlayers.map(p => ({name: p.name, score: 0, count: p.count || 4}));
  cmGroupPlayers = savedPlayers;
  cmGroupTurn    = 0;
  cmGroupFirst   = null;
  cmGroupLocked  = false;
  cmPhase        = 'playing';
  cmInit();
  cmCards.forEach(c => { c.faceUp = false; });
  const overlay = document.getElementById('cm-overlay');
  if (overlay) overlay.classList.remove('active');
  cmApplyPositions(() => {
    cmGroupRenderGrid();
    cmGroupRenderTurn();
    cmGroupRenderScores();
  });
}

// ---- メニューへ戻る ----
function cmBackToMenu() {
  cmMode = 'menu';
  navigate('cardmatch');
}

// ---- ソロスタート ----
function cmStartSolo() {
  cmMode = 'solo';
  navigate('cardmatch');
}

// ---- グループセットアップ表示 ----
function cmShowGroupSetup() {
  if (cmGroupPlayers.length === 0) {
    cmGroupPlayers = [{name:'グループ1', score:0, count:4}];
  }
  cmMode = 'group_setup';
  navigate('cardmatch');
}


// ---- グループゲーム開始 ----
function cmStartGroup() {
  cmGroupPlayers.forEach((p, i) => {
    const countEl = document.getElementById(`cmg-count-${i}`);
    if (countEl) p.count = Math.max(1, Math.min(40, parseInt(countEl.value) || 4));
    p.score = 0;
  });
  cmGroupTurn   = 0;
  cmGroupFirst  = null;
  cmGroupLocked = false;
  cmPhase       = 'playing';
  cmMode        = 'group_play';
  cmInit();
  cmCards.forEach(c => { c.faceUp = false; });
  navigate('cardmatch');
}

// ---- 報酬一覧HTML生成 ----
function cmRewardTableHtml() {
  const tiers = [
    { sec: 20, peas: 5 },
    { sec: 30, peas: 4 },
    { sec: 40, peas: 3 },
    { sec: 50, peas: 2 },
    { sec: 60, peas: 1 },
  ];
  const rows = tiers.map(t => `
    <div class="cmr-row">
      <span class="cmr-time">${cmFmtTime(t.sec)}以内</span>
      <span class="cmr-peas">🌱×${t.peas}</span>
    </div>`).join('');
  const teacherRow = cmTeacherTime != null ? `
    <div class="cmr-row cmr-teacher">
      <span class="cmr-time">👑小林T(${cmFmtTime(cmTeacherTime)})超え</span>
      <span class="cmr-peas">🌱×10</span>
    </div>` : '';
  const studentRow = cmStudentBestTime != null && cmStudentBestName ? `
    <div class="cmr-row" style="background:rgba(157,237,98,0.08);border-color:rgba(157,237,98,0.25);">
      <span class="cmr-time" style="color:#9ded62;">🏅${cmStudentBestName}(${cmFmtTime(cmStudentBestTime)})超え</span>
      <span class="cmr-peas">🌱×50</span>
    </div>` : '';
  return `<div class="cmr-table">${teacherRow}${studentRow}${rows}</div>`;
}

// ---- 画面描画：メニュー ----
function renderCmMenu() {
  const d = cmLoad();
  const bestStr = d.best != null ? `自己ベスト ${cmFmtTime(d.best)}` : null;
  return `
    <div class="cm-menu-screen">
      <div class="cm-menu-logo">🃏</div>
      <div class="cm-menu-title">カードマッチ</div>
      <div class="cm-menu-cards">
        <button class="cm-menu-card cm-solo-card" onclick="cmStartSolo()">
          <div class="cm-mc-icon">⚡</div>
          <div class="cm-mc-label">ひとりでプレイ</div>
          ${bestStr ? `<div class="cm-mc-best">${bestStr}</div>` : ''}
          ${cmRewardTableHtml()}
        </button>
        <button class="cm-menu-card cm-group-card" onclick="cmShowGroupSetup()">
          <div class="cm-mc-icon">👥</div>
          <div class="cm-mc-label">グループで遊ぶ</div>
          <div class="cm-mc-desc">神経衰弱スタイル<br>チーム対抗戦</div>
        </button>
      </div>
      <button class="cm-back-btn" style="margin-top:2.5rem" onclick="navigate('home')">← ホームへ戻る</button>
    </div>`;
}

// ---- 画面描画：グループ設定 ----
function renderCmGroupSetup() {
  const p = cmGroupPlayers[0] || {name:'グループ1', score:0, count:4};
  return `
    <div class="cm-menu-screen">
      <div class="cm-menu-title" style="margin-bottom:1.8rem">👥 グループ設定</div>
      <div class="cmg-names">
        <div class="cmg-setup-row">
          <label class="cmg-count-label-txt">グループの人数</label>
          <div class="cmg-count-wrap">
            <span class="cmg-count-unit">👤</span>
            <input class="cmg-count-num" id="cmg-count-0" type="number"
                   value="${p.count || 4}" min="1" max="40">
            <span class="cmg-count-unit">人</span>
          </div>
        </div>
      </div>
      <button class="cm-btn cm-btn-primary cmg-start-btn" onclick="cmStartGroup()">
        ゲームスタート 🎮
      </button>
      <button class="cm-back-btn" style="margin-top:0.8rem" onclick="cmBackToMenu()">← 戻る</button>
    </div>`;
}

// ---- 画面描画：グループゲーム ----
function renderCmGroupPlay() {
  return `
    <div class="cm-screen">
      <div class="cmg-game-header">
        <div id="cmg-scores" class="cmg-scores"></div>
        <div id="cmg-turn"   class="cmg-turn-disp"></div>
      </div>
      <div id="cm-grid" class="cm-grid"></div>
      <div id="cm-overlay" class="cm-overlay"></div>
    </div>`;
}

// ---- 画面描画：ソロ（旧renderCardMatch） ----
function renderCmSolo() {
  cmInit();
  const d       = cmLoad();
  const bestStr = d.best != null ? cmFmtTime(d.best) : '--:--';
  return `
    <div class="cm-screen">
      <div class="cm-header">
        <button class="cm-back-btn" onclick="cmBackToMenu()">← 戻る</button>
        <div class="cm-header-mid">
          <div class="cm-timer-display">⏱ <span id="cm-timer">0:00</span></div>
          <div class="cm-best-display">自己ベスト&nbsp;${bestStr}${cmTeacherTime != null ? `　👑${cmFmtTime(cmTeacherTime)}` : ''}${cmStudentBestTime != null && cmStudentBestName ? `　🏅${cmFmtTime(cmStudentBestTime)}` : ''}</div>
        </div>
        <div id="cm-hearts" class="cm-hearts">
          ${'<span class="cm-heart">♥</span>'.repeat(CM_MAX_MISS)}
        </div>
      </div>
      <div class="cm-reward-bar">
        <span class="cmrb-item">🌱×5&nbsp;<span class="cmrb-t">0:20</span></span>
        <span class="cmrb-sep">|</span>
        <span class="cmrb-item">×4&nbsp;<span class="cmrb-t">0:30</span></span>
        <span class="cmrb-sep">|</span>
        <span class="cmrb-item">×3&nbsp;<span class="cmrb-t">0:40</span></span>
        <span class="cmrb-sep">|</span>
        <span class="cmrb-item">×2&nbsp;<span class="cmrb-t">0:50</span></span>
        <span class="cmrb-sep">|</span>
        <span class="cmrb-item">×1&nbsp;<span class="cmrb-t">1:00</span></span>
        ${cmTeacherTime != null ? `<span class="cmrb-sep">|</span><span class="cmrb-item cmrb-teacher">👑×10&nbsp;<span class="cmrb-t">${cmFmtTime(cmTeacherTime)}超</span></span>` : ''}
        ${cmStudentBestTime != null && cmStudentBestName ? `<span class="cmrb-sep">|</span><span class="cmrb-item" style="color:#9ded62;">🏅×50&nbsp;<span class="cmrb-t">${cmFmtTime(cmStudentBestTime)}超</span></span>` : ''}
      </div>
      <div id="cm-grid" class="cm-grid"></div>
      <div id="cm-overlay" class="cm-overlay"></div>
    </div>`;
}

// ---- ディスパッチャー ----
function renderCardMatch() {
  if (cmMode === 'solo')        return renderCmSolo();
  if (cmMode === 'group_setup') return renderCmGroupSetup();
  if (cmMode === 'group_play')  return renderCmGroupPlay();
  return renderCmMenu();
}

// ===== メインレンダリング =====
// ============================================================
function render() {
  quizLocked = false;   // 画面が切り替わるたびにロック解除
  clearInterval(taTimerInterval);  // タイムアタックタイマーをクリア
  cmStopTimer();        // カードマッチタイマーをクリア

  let content = '';
  if      (state.view === 'home')       content = renderHome();
  else if (state.view === 'sections')   content = renderSections();
  else if (state.view === 'difficulty') content = renderDifficulty();
  else if (state.view === 'quiz')       content = renderQuiz();
  else if (state.view === 'minitest')   content = renderMiniTest();
  else if (state.view === 'practice')   content = renderPractice();
  else if (state.view === 'timeattack') content = renderTimeAttack();
  else if (state.view === 'cardmatch')  content = renderCardMatch();
  else if (state.view === 'games')      content = renderGamesPage();
  else if (state.view === 'ranking')    content = renderRanking();
  else if (state.view === 'tools')      content = renderToolsPage();
  else if (state.view === 'sugoroku')   content = ''; // sugoroku.js が直接 main-content を書き換える
  else if (state.view === 'shooting')   content = ''; // iframeで描画

  if (state.view === 'sugoroku') {
    document.body.classList.add('sg-mode');
    document.body.classList.remove('shooting-mode');
    renderSugoroku();
    return;
  }
  if (state.view === 'shooting') {
    document.body.classList.add('shooting-mode');
    document.body.classList.remove('sg-mode');
    document.getElementById('main-content').innerHTML = `
      <div class="shooting-wrap">
        <button class="shooting-back-btn" onclick="navigate('games')">← ゲーム一覧</button>
        <iframe class="shooting-iframe"
                src="games/因数分解シューティング.html"
                title="因数分解シューティング"
                allow="autoplay"></iframe>
      </div>`;
    updateBowlWidget(false);
    return;
  }
  document.body.classList.remove('sg-mode', 'shooting-mode');   // ① お椀を戻す
  document.getElementById('main-content').innerHTML = content;
  updateBowlWidget(false);
  if (state.view === 'home')      initBattleBanner();
  if (state.view === 'cardmatch') {
    document.body.classList.add('cm-mode');
    if (cmMode === 'solo') {
      requestAnimationFrame(() => requestAnimationFrame(cmLayoutCards));
      cmStartTimer();
    } else if (cmMode === 'group_play') {
      // ダブルRAFでレイアウト確定を確実に待つ
      requestAnimationFrame(() => requestAnimationFrame(() => cmApplyPositions(() => {
        cmGroupRenderGrid();
        cmGroupRenderTurn();
        cmGroupRenderScores();
      })));
    }
    // menu / group_setup は cm-mode だが cm-grid なし
  } else {
    document.body.classList.remove('cm-mode');
  }

  // クイズ画面のキーボードイベント設定
  if (state.view === 'quiz') {
    const input = document.getElementById('quiz-input');
    if (input) {
      input.focus();
      input.addEventListener('keydown', e => {
        if (e.key === 'Enter') submitQuizAnswer();
      });
    }
  }

  // タイムアタック：ライブタイマー開始 ＋ Enter キーで次の問題へ
  if (state.view === 'timeattack' && state.timeAttackPhase === 'quiz') {
    const startTime = state.timeAttackStartTime;
    taTimerInterval = setInterval(() => {
      const el = document.getElementById('ta-live-timer');
      if (!el) { clearInterval(taTimerInterval); return; }
      const elapsed = (Date.now() - startTime) / 1000;
      el.textContent = elapsed.toFixed(1) + '秒';
      if      (elapsed > 50) el.style.color = '#f5576c';
      else if (elapsed > 40) el.style.color = '#f7971e';
      else if (elapsed > 30) el.style.color = '#ffd200';
      else                   el.style.color = '#00d2ff';
    }, 100);

    // 最初の入力欄にフォーカス
    const firstInput = document.getElementById('ta-0');
    if (firstInput) firstInput.focus();
  }
}

// ===== 初期化 =====
initMathBackground();
createBowlWidget();

// プレビューモードバナーを表示
if (PREVIEW_MODE) {
  const banner = document.createElement('div');
  banner.id = 'preview-banner';
  banner.innerHTML = '👁 プレビューモード（下書き章も表示中）<button onclick="window.location.search=\'\'">通常モードに戻る</button>';
  banner.style.cssText = `
    position: fixed; top: 0; left: 0; right: 0; z-index: 9999;
    background: linear-gradient(135deg, #f7971e, #ffd200);
    color: #2a1a00; font-weight: 800; padding: 8px 16px;
    text-align: center; font-size: 0.95rem;
    box-shadow: 0 3px 12px rgba(0,0,0,0.3); letter-spacing: 1px;
  `;
  banner.querySelector('button').style.cssText = `
    margin-left: 12px; padding: 3px 12px;
    background: rgba(0,0,0,0.2); color: white;
    border: 1px solid rgba(0,0,0,0.4); border-radius: 5px;
    font-size: 0.82rem; font-weight: 700; cursor: pointer; font-family: inherit;
  `;
  document.body.appendChild(banner);
  document.body.style.paddingTop = '46px';
}

// 問題データを読み込む
// ローカルサーバー・GitHub Pages どちらでも questions.json を直接参照
fetch('./questions.json')
  .then(r => r.json())
  .then(data => {
    migrateRankings(data);
    mathData.chapters = data.chapters;
    mathData.news = Array.isArray(data.news) ? data.news : [];
    mathData.cardMatchStudentBestList = data.cardMatchStudentBestList || [];
    if (data.cardMatchTeacherTime != null) cmTeacherTime = data.cardMatchTeacherTime;
    if (data.cardMatchStudentBestTime != null) cmStudentBestTime = data.cardMatchStudentBestTime;
    if (data.cardMatchStudentBestName) cmStudentBestName = data.cardMatchStudentBestName;
    render();
  })
  .catch(() => {
    // questions.json が読めない場合は data.js のデータをそのまま使う
    render();
  });
