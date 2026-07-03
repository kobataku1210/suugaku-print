// ============================================================
// app.js
// ============================================================

// ===== 定数 =====
const STORAGE_KEY = 'mathPrint_v2';

// 公開バージョン（設定を変えたら version.json と一緒にこの値を更新する）
// 生徒のブラウザが古いキャッシュのままにならないよう、起動時に最新版か確認する
const APP_VERSION = '2026-06-22w';

// プレビューモードは先生パスワードで保護。
// URL に ?preview=draft があり、かつ この端末で先生認証済み(localStorage)のときだけ有効。
// 生徒が URL を打っても認証できないため通常モードのまま。
const _wantsPreview = new URLSearchParams(window.location.search).get('preview') === 'draft';
// プレビュー解除は「有効期限つき」。先生が使っても数時間で自動解除され、
// 共用端末に残り続けて生徒が入れてしまうのを防ぐ。
const PREVIEW_TTL_MS = 3 * 60 * 60 * 1000; // 3時間
try { localStorage.removeItem('mathPreviewUnlocked'); } catch (e) {} // 旧・無期限フラグは廃止
function _previewUnlocked() {
  try { return Date.now() < parseInt(localStorage.getItem('mathPreviewUntil') || '0', 10); }
  catch (e) { return false; }
}
const PREVIEW_MODE = _wantsPreview && _previewUnlocked();

// ===== パスワード認証（クロージャで隠蔽・コンソールからアクセス不可） =====
(function() {
  const H = '76ad0a76d1f92881cea44787d5d4501aba0d145faccf9ce1aaa6ff9daf0060d8';
  const S = 'mathprint_';
  async function _h(p) {
    const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(S + p));
    return Array.from(new Uint8Array(b)).map(x => x.toString(16).padStart(2,'0')).join('');
  }
  function _ih(v) { return typeof v === 'string' && /^[0-9a-f]{64}$/.test(v); }

  // 先生パスワード照合（ハッシュ比較）。正しければ true
  window.verifyTeacherPw = async function(pw) {
    try { return (await _h(pw)) === H; } catch (e) { return false; }
  };

  // プレビュー解除：先生パスワードが正しければこの端末で有効化
  window.submitPreviewUnlock = async function() {
    const pw  = document.getElementById('preview-unlock-pw').value;
    const err = document.getElementById('preview-unlock-error');
    if (await _h(pw) !== H) {
      err.textContent = 'パスワードが違います';
      err.style.display = 'block';
      return;
    }
    localStorage.setItem('mathPreviewUntil', String(Date.now() + PREVIEW_TTL_MS));
    window.location.reload();
  };

  window.submitTeacherPeas = async function() {
    const pw    = document.getElementById('teacher-pw').value;
    const count = parseInt(document.getElementById('teacher-pea-count').value);
    const errEl = document.getElementById('teacher-modal-error');
    if (await _h(pw) !== H) {
      errEl.textContent = 'パスワードが違います';
      errEl.style.display = 'block';
      return;
    }
    if (!count || count < 1 || count > 1000) {
      errEl.textContent = '1〜1000の数を入力してください';
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
  { key: 'basic',    label: '基礎レベル', stars: '★',   color: '#4ecdc4', peas: 10, desc: '基本的な問題で<br>しっかり理解しよう！' },
  { key: 'standard', label: '標準レベル', stars: '★★',  color: '#f7971e', peas: 15, desc: '少し難しい問題に<br>チャレンジしよう！' },
  { key: 'advanced', label: '応用レベル', stars: '★★★', color: '#f5576c', peas: 20, desc: '難問で実力を<br>グンと伸ばそう！' },
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
  quizShuffled: null,      // クイズ開始時にシャッフルされた問題リスト
  gameCategory: null,      // ゲーム一覧画面で選択中のカテゴリID (null=カテゴリ選択画面)

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
  if (PREVIEW_MODE) return true; // プレビューモードは全レベル開放
  if (levelIdx === 0) return true;
  return isLevelDone(chIdx, secIdx, levelIdx - 1);
}

function completeLevel(chIdx, secIdx, levelIdx) {
  const p = getProgress();
  const key = doneKey(chIdx, secIdx, levelIdx);
  // 難易度分けなしの節（singleLevel）はクリアするたびに 10 個もらえる
  const sec = mathData.chapters[chIdx]?.sections?.[secIdx];
  const isSingleLevel = sec && (sec.singleLevel === true
    || (Array.isArray(sec.basic) && sec.basic.length > 0
        && (!sec.standard || sec.standard.length === 0)
        && (!sec.advanced || sec.advanced.length === 0)));
  if (isSingleLevel) {
    const wasFirst = !p.done[key];
    p.done[key] = true;
    saveProgress(p);
    addPeas(10);
    return wasFirst;
  }
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
    addPeas(15);
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
  // 先生用：お椀を長押し(約3秒)で「こっそり追加」窓を開く（生徒には見えない隠し操作）
  let _bowlHoldTimer = null;
  const startHold = (e) => {
    clearTimeout(_bowlHoldTimer);
    _bowlHoldTimer = setTimeout(() => { showHiddenPeaAdd(); }, 3000);
  };
  const cancelHold = () => { clearTimeout(_bowlHoldTimer); _bowlHoldTimer = null; };
  w.addEventListener('pointerdown', startHold);
  w.addEventListener('pointerup', cancelHold);
  w.addEventListener('pointerleave', cancelHold);
  w.addEventListener('pointercancel', cancelHold);
  document.body.appendChild(w);
  updateBowlWidget(false);
  createCompletedBowlsPanel();
}

// ===== 先生用：こっそりグリンピース追加（お椀長押しで出現・パスワードなし） =====
function showHiddenPeaAdd() {
  if (document.getElementById('hidden-pea-overlay')) return;
  const overlay = document.createElement('div');
  overlay.id = 'hidden-pea-overlay';
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-card" id="hidden-pea-card">
      <div class="modal-lock">🌱</div>
      <div class="modal-level">グリンピースを追加</div>
      <p class="modal-desc">先生用パスワードと追加する個数を入力してください</p>
      <input type="password" id="hidden-pea-pw" class="modal-input"
             placeholder="パスワード" autocomplete="off" style="margin-bottom:0.6rem">
      <input type="number" id="hidden-pea-count" class="modal-input"
             placeholder="個数（例：10）" min="1" max="1000" autocomplete="off">
      <div id="hidden-pea-error" class="modal-error"></div>
      <div class="modal-btns">
        <button class="modal-btn-cancel" onclick="closeHiddenPeaAdd()">とじる</button>
        <button class="modal-btn-submit" onclick="submitHiddenPeaAdd()">追加する！</button>
      </div>
    </div>`;
  overlay.addEventListener('click', e => { if (e.target === overlay) closeHiddenPeaAdd(); });
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('show'));
  const pwInp = document.getElementById('hidden-pea-pw');
  if (pwInp) {
    pwInp.focus();
    pwInp.addEventListener('keydown', e => { if (e.key === 'Enter') submitHiddenPeaAdd(); });
  }
  const inp = document.getElementById('hidden-pea-count');
  if (inp) inp.addEventListener('keydown', e => { if (e.key === 'Enter') submitHiddenPeaAdd(); });
}
function closeHiddenPeaAdd() {
  const o = document.getElementById('hidden-pea-overlay');
  if (o) { o.classList.remove('show'); setTimeout(() => o.remove(), 250); }
}
async function submitHiddenPeaAdd() {
  const pw    = (document.getElementById('hidden-pea-pw') || {}).value || '';
  const count = parseInt((document.getElementById('hidden-pea-count') || {}).value, 10);
  const errEl = document.getElementById('hidden-pea-error');
  const showErr = (m) => { if (errEl) { errEl.textContent = m; errEl.style.display = 'block'; } };
  // パスワード照合
  if (typeof verifyTeacherPw !== 'function' || !(await verifyTeacherPw(pw))) {
    showErr('パスワードが違います');
    return;
  }
  if (!count || count < 1 || count > 1000) {
    showErr('1〜1000の数を入力してください');
    return;
  }
  addPeas(count);
  const card = document.getElementById('hidden-pea-card');
  if (card) {
    card.classList.add('modal-success');
    card.innerHTML = `
      <div class="modal-success-icon">🌱</div>
      <div class="modal-success-text">+${count}個 追加！</div>`;
  }
  for (let i = 0; i < Math.min(count, 10); i++) setTimeout(() => bounceAndAddPea(), i * 150);
  if (count >= 3) showConfetti();
  setTimeout(() => closeHiddenPeaAdd(), 1500);
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
             placeholder="追加する個数（例：1000）" min="1" max="1000" style="margin-bottom:0.3rem">
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
  // games 画面に他から戻ってきた時はカテゴリ選択画面に戻す
  if (view === 'games' && state.view !== 'games' && opts.gameCategory === undefined) {
    state.gameCategory = null;
  }
  state.view = view;
  if (opts.chapterIdx   !== undefined) state.chapterIdx   = opts.chapterIdx;
  if (opts.sectionIdx   !== undefined) state.sectionIdx   = opts.sectionIdx;
  if (opts.quizLevelIdx !== undefined) state.quizLevelIdx = opts.quizLevelIdx;
  if (opts.quizQIdx     !== undefined) state.quizQIdx     = opts.quizQIdx;
  if (opts.gameCategory !== undefined) state.gameCategory = opts.gameCategory;
  render();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ゲーム一覧でカテゴリを切替
function selectGameCategory(catId) {
  state.gameCategory = catId;
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
function renderHome() {
  const cards = mathData.chapters.map((ch, i) => {
    // draft: true の章は生徒画面では「準備中」扱い（プレビューモードでは見せる）
    const isDraft = !!ch.draft && !PREVIEW_MODE;
    // 節レベルの draft も除外して「公開節数」をカウント
    const publishedSecCount = ch.sections.filter(s => !s.draft || PREVIEW_MODE).length;
    const has = !isDraft && publishedSecCount > 0;
    return `
      <div class="chapter-card" style="--gradient:${ch.gradient}"
           onclick="handleChapterClick(event,this,${i})">
        <div class="card-label">第 ${ch.id} 章</div>
        <span class="card-icon">${ch.icon}</span>
        <div class="card-title">${ch.title}</div>
        ${has
          ? `<div class="card-meta">
               <div class="card-bar"><div class="card-bar-fill" style="width:100%"></div></div>
               <span>${publishedSecCount} 節</span>
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

  // ===== 水族館バナー（生徒用画面に公開） =====
  let aquariumBanner = '';
  if (typeof aqHomeBannerSub === 'function') {
    aquariumBanner = `
      <div class="aq-home-banner" onclick="navigate('aquarium')">
        <div class="aq-home-banner-left">
          <span class="aq-home-banner-icon">🐠</span>
          <div class="aq-home-banner-text">
            <div class="aq-home-banner-title">グリンピース水族館 <span class="game-new-badge">NEW!</span></div>
            <div class="aq-home-banner-sub">${aqHomeBannerSub()}</div>
          </div>
        </div>
        <div class="aq-home-banner-arrow">›</div>
      </div>`;
  }

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

  // ===== 数学パズルバナー（公開中のパズルがあるときだけ表示）=====
  const hasVisiblePuzzle = (typeof PUZZLE_ITEMS !== 'undefined') && PUZZLE_ITEMS.some(p => !p.draft || PREVIEW_MODE);
  const puzzlesBanner = hasVisiblePuzzle ? `
    <div class="pz-home-banner" onclick="navigate('puzzles')">
      <span class="pz-home-icon">🧩</span>
      <div class="pz-home-text">
        <div class="pz-home-title">数学パズル <span class="game-new-badge">NEW!</span></div>
        <div class="pz-home-sub">頭をつかうパズルに挑戦しよう！</div>
      </div>
      <div class="pz-home-arrow">›</div>
    </div>` : '';

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
    ${aquariumBanner}
    ${gamesBanner}
    ${puzzlesBanner}
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
// ===== ゲームカテゴリ =====
const GAME_CATEGORIES = [
  { id: 'factor', label: '式の展開と因数分解', icon: '✖️',
    gradient: 'linear-gradient(90deg, #ff8a2a, #e05a00)' },
  { id: 'sqrt',   label: '平方根',           icon: '√',
    gradient: 'linear-gradient(90deg, #2196f3, #0d47a1)' },
];

const GAME_ITEMS = [
  {
    title: '因数分解シューティング',
    desc: '和と積を満たす数字の風船を撃ち落とそう！ 班リレー対応',
    icon: '🎈',
    onclick: "navigate('shooting')",
    gradient: 'linear-gradient(135deg, #ff6b6b, #fdcb6e)',
    isNew: true,
    category: 'factor',
  },
  {
    title: 'カードマッチ',
    desc: '展開・因数分解の式と答えをカードでマッチング！自己ベストを目指せ',
    icon: '🃏',
    onclick: "cmVariant='factor';navigate('cardmatch')",
    gradient: 'linear-gradient(135deg, #a29bfe, #6c5ce7)',
    isNew: false,
    category: 'factor',
  },
  {
    title: 'カードマッチ 平方根',
    desc: '「Nの平方根」と「±√N」をカードでマッチング！平方根バージョン',
    icon: '√',
    onclick: "cmVariant='sqrt';navigate('cardmatch')",
    gradient: 'linear-gradient(135deg, #4ECDC4, #45B7D1)',
    isNew: true,
    draftKey: 'cardMatchSqrt', // questions.json の gameDrafts で公開制御
    category: 'sqrt',
  },
  {
    title: '共通因数ウォール',
    desc: '共通因数をくくり出してウォールを崩せ！',
    icon: '🧱',
    onclick: "window.location.href='games/共通因数ウォール.html?_v=' + APP_VERSION",
    gradient: 'linear-gradient(135deg, #ff8a2a, #e05a00)',
    isNew: true,
    category: 'factor',
  },
  {
    title: 'ルート大小ウォール',
    desc: '√や整数の大小で大きい方の壁をタップ！',
    icon: '📏',
    onclick: "window.location.href='games/ルート大小ウォール.html?_v=' + APP_VERSION",
    gradient: 'linear-gradient(135deg, #4a90e2, #6c5ce7)',
    isNew: true,
    draftKey: 'rootBreak',
    category: 'sqrt',
  },
  {
    title: '数の分類ウォール',
    desc: '有理数/無理数 → 整数/非整数 → 自然数/非自然数 を仕分けよう',
    icon: '📦',
    onclick: "window.location.href='games/数の分類ウォール.html?_v=' + APP_VERSION",
    gradient: 'linear-gradient(135deg, #8b5cf6, #6d28d9)',
    isNew: true,
    draftKey: 'numSort',
    category: 'sqrt',
  },
  {
    title: '計算バトル',
    desc: '1台で2人対戦！因数分解で計算を一気に終わらせて相手のHPを削れ',
    icon: '⚔️',
    onclick: "window.location.href='games/計算バトル.html?_v=' + APP_VERSION",
    gradient: 'linear-gradient(135deg, #3a8aff, #ff3a6a)',
    isNew: true,
    category: 'factor',
  },
  {
    title: '平方根神経衰弱',
    desc: '√4 と 2、√9 と 3…ルートを外した数をペアで揃えるメモリーゲーム!',
    icon: '🃏',
    onclick: "window.location.href='games/平方根神経衰弱.html?_v=' + APP_VERSION",
    gradient: 'linear-gradient(135deg, #2196f3, #0d47a1)',
    isNew: true,
    category: 'sqrt',
  },
  {
    title: 'ルートの宝石',
    desc: '√n の中に隠れた平方数を見つけて宝石を発見！簡約のしくみを体感',
    icon: '💎',
    onclick: "window.location.href='games/ルートの宝石.html?_v=' + APP_VERSION",
    gradient: 'linear-gradient(135deg, #cc66ff, #4477ff)',
    isNew: true,
    category: 'sqrt',
  },
  {
    title: 'ルート計算バトル',
    desc: '簡約・乗除・加減・有理化・三乗根を解いてモンスターを倒せ！平方根の総復習',
    icon: '⚔️',
    onclick: "window.location.href='games/ルート計算バトル.html?_v=' + APP_VERSION",
    gradient: 'linear-gradient(135deg, #ff5577, #c8265a)',
    isNew: true,
    category: 'sqrt',
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

  // ===== 共通因数ウォール (レベル別) =====
  const wallData = mathData.kyotsuingenWallRankings || {};
  const wallLevels = [
    { key: 'lv1', label: 'Lv.1', emoji: '🟢' },
    { key: 'lv2', label: 'Lv.2', emoji: '🟡' },
    { key: 'lv3', label: 'Lv.3', emoji: '🔴' },
  ];
  const wallCards = wallLevels.map(lv => {
    const list = Array.isArray(wallData[lv.key]) ? wallData[lv.key] : [];
    return `
      <div class="rk-card rk-card-wall">
        <div class="rk-card-header">
          <span class="rk-card-icon">${lv.emoji}</span>
          <span class="rk-card-title">共通因数ウォール ${lv.label}</span>
        </div>
        <div class="rk-card-body">${renderListBlock(list)}</div>
      </div>`;
  }).join('');

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
      <h3 class="rk-section-title">🧱 共通因数ウォール</h3>
      <div class="rk-card-grid">${wallCards}</div>
    </div>
    <div class="rk-section">
      <h3 class="rk-section-title">⏱ タイムアタック</h3>
      ${noTaRecords
        ? `<div class="rk-empty">まだ記録がありません</div>`
        : chapterBlocks}
    </div>`;
}

function renderGamesPage() {
  // 各バリアントの自己ベストを取得
  const _prevVariant = cmVariant;
  cmVariant = 'factor';
  const factorBest = cmLoad().best;
  cmVariant = 'sqrt';
  const sqrtBest = cmLoad().best;
  cmVariant = _prevVariant;
  const factorBestStr = factorBest != null ? cmFmtTime(factorBest) : null;
  const sqrtBestStr   = sqrtBest   != null ? cmFmtTime(sqrtBest)   : null;

  // draft ゲームはプレビュー以外では非表示
  // draftKey が指定されていれば questions.json の gameDrafts を見て判定
  function isGameDraft(g) {
    if (g.draft) return true;
    if (g.draftKey) {
      const drafts = (mathData && mathData.gameDrafts) || {};
      return drafts[g.draftKey] !== false; // 明示的に false でなければ draft 扱い
    }
    return false;
  }
  const visibleGames = GAME_ITEMS.filter(g => !isGameDraft(g) || PREVIEW_MODE);

  // 1ゲームのカードを HTML 化
  function renderGameCard(g) {
    let subText = '';
    if (g.onclick && g.onclick.includes("cmVariant='factor'")) {
      const parts = [];
      if (factorBestStr) parts.push(`🏅 自己ベスト：${factorBestStr}`);
      if (cmStudentBestTime != null && cmStudentBestName) {
        parts.push(`🏆 ${cmStudentBestName}：${cmFmtTime(cmStudentBestTime)} 🌱×30`);
      }
      if (parts.length) subText = `<div class="game-card-best">${parts.join('　')}</div>`;
    } else if (g.onclick && g.onclick.includes("cmVariant='sqrt'")) {
      if (sqrtBestStr) subText = `<div class="game-card-best">🏅 自己ベスト：${sqrtBestStr}</div>`;
    }
    const draft = isGameDraft(g);
    const draftMark = draft ? '<span class="game-new-badge" style="background:#f7971e;color:#2a1a00">🚧下書き</span>' : '';
    return `
    <div class="game-card${draft ? ' draft' : ''}" style="--gradient:${g.gradient}"
         onclick="${g.onclick}">
      <span class="game-card-icon">${g.icon}</span>
      <div class="game-card-title">${g.title}${g.isNew ? '<span class="game-new-badge">NEW!</span>' : ''}${draftMark}</div>
      <div class="game-card-desc">${g.desc}</div>
      ${subText}
      <div class="game-card-cta">遊ぶ ›</div>
    </div>`;
  }

  // ===== カテゴリ別の表示 =====
  const selectedCat = state.gameCategory;
  // 「その他」(カテゴリ未指定) も含めた全カテゴリ
  const allCats = [
    ...GAME_CATEGORIES,
    ...(visibleGames.some(g => !g.category)
        ? [{ id: '__other__', label: 'その他', icon: '📋',
             gradient: 'linear-gradient(90deg,#666,#444)' }]
        : [])
  ];

  // ===== 1) カテゴリ選択画面 =====
  if (!selectedCat) {
    const catCards = allCats.map(cat => {
      const games = visibleGames.filter(g =>
        cat.id === '__other__' ? !g.category : g.category === cat.id
      );
      if (games.length === 0) return '';
      return `
        <div class="game-cat-card" style="background:${cat.gradient}"
             onclick="selectGameCategory('${cat.id}')">
          <span class="game-cat-card-icon">${cat.icon}</span>
          <div class="game-cat-card-title">${cat.label}</div>
          <div class="game-cat-card-count">ゲーム ${games.length}つ</div>
          <div class="game-cat-card-cta">選ぶ ›</div>
        </div>
      `;
    }).join('');
    return `
      <button class="back-btn" onclick="navigate('home')">← ホームに戻る</button>
      <div class="section-title">
        <h2>🎮 数学ゲーム</h2>
        <p>カテゴリを選んでね</p>
      </div>
      <div class="game-cat-grid">${catCards}</div>`;
  }

  // ===== 2) 選択されたカテゴリのゲーム一覧 =====
  const cat = allCats.find(c => c.id === selectedCat);
  if (!cat) {
    // カテゴリが見つからない → カテゴリ選択に戻す
    state.gameCategory = null;
    return renderGamesPage();
  }
  const games = visibleGames.filter(g =>
    cat.id === '__other__' ? !g.category : g.category === cat.id
  );
  const cards = games.map(renderGameCard).join('');
  return `
    <button class="back-btn" onclick="selectGameCategory(null)">← カテゴリ一覧へ</button>
    <div class="section-title">
      <h2 style="display:inline-flex;align-items:center;gap:0.5rem;">
        <span style="background:${cat.gradient};padding:4px 14px;border-radius:10px;color:#fff;font-size:0.85em;">
          ${cat.icon} ${cat.label}
        </span>
      </h2>
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
  {
    title: '素因数分解ヘルパー',
    desc: '12 ÷ 2 = 6 → 6 ÷ 2 = 3 → ... 小さい素数から順に割って、12 = 2² × 3 を完成!',
    icon: '🔢',
    onclick: "window.location.href='tools/素因数分解ヘルパー.html'",
    gradient: 'linear-gradient(135deg, #00bcd4, #006978)',
    isNew: true,
    draftKey: 'primeFactor', // questions.json の gameDrafts で公開制御
  },
  {
    title: '丸太から大きな四角形',
    desc: '直径20cmの丸太から、できるだけ大きな正方形を切り出そう! 平方根の利用',
    icon: '🪵',
    onclick: "window.location.href='tools/丸太から大きな四角形を切り出そう/index.html?_v=' + APP_VERSION",
    gradient: 'linear-gradient(135deg, #b08a5a, #6e4a2a)',
    isNew: true,
    draftKey: 'logCarpenter',
  },
];
function renderToolsPage() {
  // draftKey が指定されたツールは gameDrafts で非公開なら隠す(プレビュー時は表示)
  function isToolDraft(t) {
    if (t.draft) return true;
    if (t.draftKey) {
      const drafts = (mathData && mathData.gameDrafts) || {};
      return drafts[t.draftKey] !== false;
    }
    return false;
  }
  const visibleTools = TOOL_ITEMS.filter(t => !isToolDraft(t) || PREVIEW_MODE);
  const cards = visibleTools.map(t => {
    const draft = isToolDraft(t);
    const draftMark = draft ? '<span class="game-new-badge" style="background:#f7971e;color:#2a1a00">🚧下書き</span>' : '';
    return `
    <div class="game-card${draft ? ' draft' : ''}" style="--gradient:${t.gradient}"
         onclick="${t.onclick}">
      <span class="game-card-icon">${t.icon}</span>
      <div class="game-card-title">${t.title}${t.isNew ? '<span class="game-new-badge">NEW!</span>' : ''}${draftMark}</div>
      <div class="game-card-desc">${t.desc}</div>
      <div class="game-card-cta">使う ›</div>
    </div>`;
  }).join('');
  return `
    <button class="back-btn" onclick="navigate('home')">← ホームに戻る</button>
    <div class="section-title">
      <h2>🧰 数学便利グッズ</h2>
      <p>学習を助けるツールを選んでね</p>
    </div>
    <div class="games-grid">${cards}</div>`;
}

// ===== 数学パズル画面 =====
// パズルを追加する場合は PUZZLE_ITEMS に1要素加えるだけ。
const PUZZLE_ITEMS = [
  {
    title: 'FUTOSHIKI',
    desc: '',
    icon: '🔢',
    onclick: "window.location.href='games/不等号ナンプレ.html?_v=' + APP_VERSION",
    gradient: 'linear-gradient(135deg, #34d399, #059669)',
    isNew: true,
  },
];
function renderPuzzlesPage() {
  const isDraft = p => !!p.draft;
  const visible = PUZZLE_ITEMS.filter(p => !isDraft(p) || PREVIEW_MODE);
  const cards = visible.map(p => {
    const draft = isDraft(p);
    const draftMark = draft ? '<span class="game-new-badge" style="background:#f7971e;color:#2a1a00">🚧下書き</span>' : '';
    return `
    <div class="game-card${draft ? ' draft' : ''}" style="--gradient:${p.gradient}"
         onclick="${p.onclick}">
      <span class="game-card-icon">${p.icon}</span>
      <div class="game-card-title">${p.title}${p.isNew ? '<span class="game-new-badge">NEW!</span>' : ''}${draftMark}</div>
      ${p.desc ? `<div class="game-card-desc">${p.desc}</div>` : ''}
      <div class="game-card-cta">挑戦する ›</div>
    </div>`;
  }).join('');
  const empty = visible.length === 0 ? '<p style="text-align:center;color:#9ab;margin-top:20px;">準備中だよ。お楽しみに！</p>' : '';
  return `
    <button class="back-btn" onclick="navigate('home')">← ホームに戻る</button>
    <div class="section-title">
      <h2>🧩 数学パズル</h2>
      <p>頭をつかうパズルに挑戦しよう！</p>
    </div>
    <div class="games-grid">${cards}</div>${empty}`;
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

  // 連続する同じ group.id をまとめる
  const items = [];
  {
    let i = 0;
    while (i < ch.sections.length) {
      const sec = ch.sections[i];
      if (sec.group && sec.group.id) {
        const gid = sec.group.id;
        const members = [];
        let j = i;
        while (j < ch.sections.length && ch.sections[j].group && ch.sections[j].group.id === gid) {
          members.push({ sec: ch.sections[j], idx: j });
          j++;
        }
        items.push({ type: 'group', groupTitle: sec.group.title, members });
        i = j;
      } else {
        items.push({ type: 'single', sec, idx: i });
        i++;
      }
    }
  }

  const cards = items.length > 0
    ? items.map((it, n) => {
        const num = String(n+1).padStart(2,'0');
        if (it.type === 'single') {
          const sec = it.sec;
          const i   = it.idx;
          const isSecDraft = !!sec.draft && !PREVIEW_MODE;
          // 中身のあるレベルだけを対象に進捗を計算
          const availableLevels = LEVELS.filter(lv => Array.isArray(sec[lv.key]) && sec[lv.key].length > 0);
          const availableCount  = availableLevels.length;
          const doneCount = availableLevels.filter(lv => {
            const li = LEVELS.indexOf(lv);
            return isLevelDone(state.chapterIdx, i, li);
          }).length;
          const totalPeas = availableLevels.reduce((s, lv) => s + (lv.peas || 0), 0);
          let badge = '';
          if (isSecDraft) badge = `<span class="sec-coming-badge">準備中</span>`;
          else if (availableCount > 0 && doneCount === availableCount) badge = `<span class="sec-done-badge">全クリア 🌱×${totalPeas}</span>`;
          else if (doneCount > 0)  badge = `<span class="sec-progress-badge">${doneCount}/${availableCount} クリア</span>`;
          return `
            <div class="section-card${isSecDraft ? ' draft' : ''}" style="--gradient:${ch.gradient}"
                 onclick="handleSectionClick(event,this,${i})">
              <div class="sec-badge">${num}</div>
              <div class="sec-title">${sec.title}<br>${badge}</div>
              <div class="sec-arrow">›</div>
            </div>`;
        } else {
          // group card
          const allDraft = it.members.every(m => !!m.sec.draft);
          const isGroupDraft = allDraft && !PREVIEW_MODE;
          // メンバーごとの基礎レベルクリアを数える（singleLevel 前提で 0 or 1）
          let doneSubs = 0;
          for (const m of it.members) {
            if (isLevelDone(state.chapterIdx, m.idx, 0)) doneSubs++;
          }
          let badge = '';
          if (isGroupDraft) badge = `<span class="sec-coming-badge">準備中</span>`;
          else if (doneSubs === it.members.length) badge = `<span class="sec-done-badge">全クリア</span>`;
          else if (doneSubs > 0) badge = `<span class="sec-progress-badge">${doneSubs}/${it.members.length} クリア</span>`;
          const idxsAttr = it.members.map(m => m.idx).join(',');
          const titleAttr = encodeURIComponent(it.groupTitle);
          return `
            <div class="section-card${isGroupDraft ? ' draft' : ''}" style="--gradient:${ch.gradient}"
                 onclick="handleGroupClick(event,this,'${idxsAttr}','${titleAttr}')">
              <div class="sec-badge">${num}</div>
              <div class="sec-title">${it.groupTitle}<br>${badge}</div>
              <div class="sec-arrow">›</div>
            </div>`;
        }
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
  const ch = mathData.chapters[state.chapterIdx];
  const sec = ch.sections[idx];
  if (sec.draft && !PREVIEW_MODE) return; // draft の節は開けない
  setTimeout(() => navigate('difficulty', { sectionIdx: idx }), 180);
}

// ===== グループ節クリック =====
function handleGroupClick(e, el, idxsStr, encodedTitle) {
  addRipple(e, el);
  const idxs = idxsStr.split(',').map(Number);
  const ch = mathData.chapters[state.chapterIdx];
  const allDraft = idxs.every(i => !!ch.sections[i].draft);
  if (allDraft && !PREVIEW_MODE) return;
  const title = decodeURIComponent(encodedTitle);
  setTimeout(() => showGroupPicker(idxs, title), 180);
}

function showGroupPicker(idxs, title) {
  // 既存のオーバーレイを除去
  const existing = document.getElementById('group-picker-overlay');
  if (existing) existing.remove();

  const ch = mathData.chapters[state.chapterIdx];
  const buttons = idxs.map(i => {
    const sec = ch.sections[i];
    const label = (sec.group && sec.group.label) || sec.title;
    const isDraft = !!sec.draft && !PREVIEW_MODE;
    const done = isLevelDone(state.chapterIdx, i, 0);
    const stateText = isDraft ? '<span class="gp-coming">準備中</span>'
                     : done    ? '<span class="gp-done">✓ クリア済み</span>'
                     :           '<span class="gp-go">10問チャレンジ</span>';
    return `<button class="gp-btn${isDraft ? ' gp-disabled' : ''}"
             ${isDraft ? '' : `onclick="pickGroupSection(${i})"`}>
              <span class="gp-label">${label}</span>
              ${stateText}
            </button>`;
  }).join('');

  const overlay = document.createElement('div');
  overlay.id = 'group-picker-overlay';
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-card" id="group-picker-card">
      <div class="modal-level" style="margin-bottom:0.3rem">${title}</div>
      <p class="modal-desc">どちらに挑戦しますか？</p>
      <div class="gp-list">${buttons}</div>
      <div class="modal-btns" style="margin-top:0.8rem">
        <button class="modal-btn-cancel" onclick="closeGroupPicker()">閉じる</button>
      </div>
    </div>
  `;
  overlay.addEventListener('click', e => { if (e.target === overlay) closeGroupPicker(); });
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('show'));
}

function pickGroupSection(idx) {
  closeGroupPicker();
  setTimeout(() => navigate('difficulty', { sectionIdx: idx }), 120);
}

function closeGroupPicker() {
  const o = document.getElementById('group-picker-overlay');
  if (o) o.remove();
}

// ===== 難易度選択 =====
function renderDifficulty() {
  const ch  = mathData.chapters[state.chapterIdx];
  const sec = ch.sections[state.sectionIdx];

  // 難易度分けなしの節（singleLevel）は basic 1枚だけ表示
  const isSingleLevel = sec.singleLevel === true
    || (Array.isArray(sec.basic) && sec.basic.length > 0
        && (!sec.standard || sec.standard.length === 0)
        && (!sec.advanced || sec.advanced.length === 0));

  let cards;
  if (isSingleLevel) {
    const done = isLevelDone(state.chapterIdx, state.sectionIdx, 0);
    cards = done ? `
      <div class="diff-card diff-done fade-in" style="--diff-color:#8b5cf6;animation-delay:0.05s"
           onclick="startQuiz(0)">
        <span class="diff-stars">★</span>
        <div class="diff-clear-badge">✓ クリア済み</div>
        <div class="diff-label">10問にチャレンジ</div>
        <div class="diff-desc">クリアするたびに<br>🌱×10 もらえる！</div>
        <div class="diff-pea-earned">🌱×10 毎回ゲット</div>
        <button class="diff-btn diff-btn-retry">もう一度チャレンジ</button>
      </div>` : `
      <div class="diff-card diff-lv0 fade-in" style="--diff-color:#8b5cf6;animation-delay:0.05s"
           onclick="startQuiz(0)">
        <span class="diff-stars">★</span>
        <div class="diff-label">10問にチャレンジ</div>
        <div class="diff-desc">難易度分けなし<br>全${sec.basic.length}問！</div>
        <div class="diff-pea-hint">🌱×10 クリアで毎回</div>
        <button class="diff-btn diff-btn-lv0">挑戦する！</button>
      </div>`;
  } else {
  // 中身のあるレベルだけ表示（例: advanced を作らない節）
  const visibleLevels = LEVELS.map((lv, li) => ({ lv, li }))
    .filter(({ lv }) => Array.isArray(sec[lv.key]) && sec[lv.key].length > 0);
  cards = visibleLevels.map(({ lv, li }, displayIdx) => {
    const done     = isLevelDone(state.chapterIdx, state.sectionIdx, li);
    const unlocked = isLevelUnlocked(state.chapterIdx, state.sectionIdx, li);
    const delay    = `animation-delay:${displayIdx * 0.08}s`;
    const peasStr  = `🌱×${lv.peas}`;

    if (!unlocked) {
      return `
        <div class="diff-card diff-locked fade-in" style="${delay}">
          <span class="diff-stars diff-stars-locked">${lv.stars}</span>
          <div class="lock-icon">🔒</div>
          <div class="diff-label diff-label-locked">${lv.label}</div>
          <div class="diff-desc diff-desc-locked">前のレベルをクリアしてね！</div>
          <div class="diff-pea-hint">クリアで ${peasStr} 個</div>
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
        <div class="diff-pea-hint">クリアで ${peasStr} 個</div>
        <button class="diff-btn diff-btn-lv${li}">10問に挑戦！</button>
      </div>`;
  }).join('');
  }

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
      : `<span class="ta-tier-badge-sm ta-teacher-badge">👑 小林T ${taTeacherTime.toFixed(1)}秒 🌱×15</span>`
    : '';
  const taStudentBestTime = taSecData.studentBestTime || null;
  const taStudentBestName = taSecData.studentBestName || '生徒';
  const taStudentBestBadge = taStudentBestTime !== null
    ? isStudentBestBeaten(taData, taStudentBestTime)
      ? `<span class="ta-tier-badge-sm ta-tier-badge-earned">🏅 ${taStudentBestName}撃破済み！</span>`
      : `<span class="ta-tier-badge-sm ta-student-badge">🏅 ${taStudentBestName} ${taStudentBestTime.toFixed(1)}秒 🌱×30</span>`
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
  // この難易度の問題をセッションに保存
  const ch = mathData.chapters[state.chapterIdx];
  const sec = ch.sections[state.sectionIdx];
  const lv = LEVELS[levelIdx];
  const src = (sec[lv.key] || []).slice();
  // inOrder=true の節は JSON の順番のまま、それ以外は Fisher-Yates シャッフル
  if (!sec.inOrder) {
    for (let i = src.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [src[i], src[j]] = [src[j], src[i]];
    }
  }
  state.quizShuffled = src;
  navigate('quiz', { quizLevelIdx: levelIdx, quizQIdx: 0 });
}

// ===== クイズ画面（1問ずつ） =====
// 4択モードの現在の選択肢順（シャッフル後）を保持
let currentShuffledChoices = [];
// 4択モードのライフ（その節を開始したときに3にリセット）
let quizLives = 3;
const QUIZ_MAX_LIVES = 3;

function renderQuiz() {
  const ch        = mathData.chapters[state.chapterIdx];
  const sec       = ch.sections[state.sectionIdx];
  const lv        = LEVELS[state.quizLevelIdx];
  // シャッフル済みがあればそれを使用、なければ生データ
  const questions = (Array.isArray(state.quizShuffled) && state.quizShuffled.length > 0)
    ? state.quizShuffled
    : sec[lv.key];
  const qIdx      = state.quizQIdx;
  const q         = questions[qIdx];
  const totalQ    = questions.length;
  const progress  = totalQ > 0 ? Math.round((qIdx / totalQ) * 100) : 0;
  const hasChoices = Array.isArray(q.choices) && q.choices.length >= 2 && q.choices.length <= 4;

  // 4択モード：選択肢をシャッフル + ライフ表示
  let answerArea;
  let livesArea = '';
  if (hasChoices) {
    // 最初の問題に来たときライフを満タンにリセット
    if (qIdx === 0) quizLives = QUIZ_MAX_LIVES;
    currentShuffledChoices = [...q.choices].sort(() => Math.random() - 0.5);
    livesArea = `<div class="quiz-lives" id="quiz-lives">${renderLivesHearts(quizLives)}</div>`;
    answerArea = `
      <div class="quiz-choices" data-count="${currentShuffledChoices.length}">
        ${currentShuffledChoices.map((c, i) => `
          <button class="quiz-choice-btn" id="quiz-choice-${i}"
                  onclick="submitQuizChoice(${i})">${formatQuestion(c)}</button>
        `).join('')}
      </div>`;
  } else {
    answerArea = `
      <input type="text" id="quiz-input" class="quiz-input"
             placeholder="${q.b && q.b.trim() ? '＿＿ に入る答えを入力' : '答えを入力'}"
             autocomplete="off"
             onkeydown="if(event.key==='Enter'){event.preventDefault();submitQuizAnswer();}">
      <div class="quiz-btns">
        <button class="quiz-submit-btn" style="--lv-color:${lv.color}"
                onclick="submitQuizAnswer()">答え合わせ！</button>
      </div>`;
  }

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
      ${livesArea}
      <div class="quiz-question">${formatQuestion(q.q)}</div>
      ${getBlankHint(q) ? `<div class="quiz-blank-hint"><span class="quiz-blank-hint-label">答えの形</span>${formatQuestion(getBlankHint(q))}</div>` : ''}
      ${answerArea}
      <div id="quiz-msg" class="quiz-msg"></div>
    </div>
    ${sec.showCalculator ? renderCalcWidget() : ''}`;
}

// ===== 電卓ウィジェット =====
function renderCalcWidget() {
  const keys = [
    ['C','⌫','(',')'],
    ['7','8','9','÷'],
    ['4','5','6','×'],
    ['1','2','3','−'],
    ['0','.','=','＋'],
  ];
  return `
    <div class="calc-widget" id="calc-widget">
      <div class="calc-title">🔢 電卓</div>
      <div class="calc-display" id="calc-display">0</div>
      <div class="calc-keys">
        ${keys.flat().map(k => {
          const isOp = ['÷','×','−','＋'].includes(k);
          const isEq = k === '=';
          const isClr = k === 'C' || k === '⌫';
          const cls = isEq ? 'calc-key calc-eq'
                    : isOp ? 'calc-key calc-op'
                    : isClr ? 'calc-key calc-clr'
                    : 'calc-key';
          return `<button type="button" class="${cls}" onclick="calcPress('${k}')">${k}</button>`;
        }).join('')}
      </div>
    </div>`;
}

// 電卓の内部状態（文字列式を保持）
const _calc = { expr: '', justEvaluated: false };

function calcPress(k) {
  const disp = document.getElementById('calc-display');
  if (!disp) return;
  if (k === 'C') {
    _calc.expr = '';
    _calc.justEvaluated = false;
  } else if (k === '⌫') {
    if (_calc.justEvaluated) {
      _calc.expr = '';
      _calc.justEvaluated = false;
    } else {
      _calc.expr = _calc.expr.slice(0, -1);
    }
  } else if (k === '=') {
    try {
      let e = _calc.expr
        .replace(/÷/g, '/')
        .replace(/×/g, '*')
        .replace(/−/g, '-')
        .replace(/＋/g, '+');
      // 数字・演算子・括弧・小数点のみ許可
      if (!/^[0-9+\-*/().\s]*$/.test(e)) throw new Error('bad');
      // eslint-disable-next-line no-new-func
      const r = Function('"use strict";return (' + e + ')')();
      if (typeof r !== 'number' || !isFinite(r)) throw new Error('nan');
      // 表示は最大8桁
      let s = (Math.round(r * 1e8) / 1e8).toString();
      _calc.expr = s;
      _calc.justEvaluated = true;
    } catch (err) {
      _calc.expr = 'Error';
      _calc.justEvaluated = true;
    }
  } else {
    if (_calc.justEvaluated && /[0-9.]/.test(k)) {
      _calc.expr = '';
    }
    _calc.justEvaluated = false;
    _calc.expr += k;
  }
  disp.textContent = _calc.expr === '' ? '0' : _calc.expr;
}

// ライフ表示 ♥♥♥
function renderLivesHearts(lives) {
  let s = '';
  for (let i = 0; i < QUIZ_MAX_LIVES; i++) {
    s += i < lives ? '<span class="quiz-heart">♥</span>' : '<span class="quiz-heart empty">♡</span>';
  }
  return s;
}

// 4択モード用：選択肢をクリックしたとき
function submitQuizChoice(idx) {
  if (quizLocked) return;
  const choice = currentShuffledChoices[idx];
  if (choice === undefined) return;
  const ch = mathData.chapters[state.chapterIdx];
  const sec = ch.sections[state.sectionIdx];
  const lv = LEVELS[state.quizLevelIdx];
  const questions = (Array.isArray(state.quizShuffled) && state.quizShuffled.length > 0)
    ? state.quizShuffled
    : sec[lv.key];
  const q = questions[state.quizQIdx];
  // 正解は q.a と比較（穴埋め b があってもMC問題では a 全体と比較）
  const isCorrect = normalizeAnswer(choice) === normalizeAnswer(q.a);
  const btn = document.getElementById(`quiz-choice-${idx}`);

  if (isCorrect) {
    quizLocked = true;
    if (btn) btn.classList.add('correct');
    const card = document.getElementById('quiz-card');
    card.classList.add('quiz-correct-flash');
    card.addEventListener('animationend', () => card.classList.remove('quiz-correct-flash'), { once: true });

    const isLast = state.quizQIdx === questions.length - 1;
    if (isLast) {
      setTimeout(() => showLevelComplete(), 500);
    } else {
      setTimeout(() => {
        state.quizQIdx++;
        render();
      }, 500);
    }
  } else {
    // 不正解 → ライフ -1
    quizLives = Math.max(0, quizLives - 1);
    const livesEl = document.getElementById('quiz-lives');
    if (livesEl) {
      livesEl.innerHTML = renderLivesHearts(quizLives);
      livesEl.classList.remove('lost');
      void livesEl.offsetWidth;
      livesEl.classList.add('lost');
    }
    if (btn) {
      btn.classList.add('wrong');
      btn.disabled = true;
    }
    const card = document.getElementById('quiz-card');
    card.classList.add('shake');
    card.addEventListener('animationend', () => card.classList.remove('shake'), { once: true });

    if (quizLives === 0) {
      // ゲームオーバー → 最初の問題からやり直し
      quizLocked = true;
      showQuizMsg('💀 ライフが尽きました... 最初からやり直しです！', true);
      setTimeout(() => {
        state.quizQIdx = 0;
        quizLives = QUIZ_MAX_LIVES;
        render();
      }, 1800);
    } else {
      showQuizMsg(`ざんねん！残りライフ ${quizLives}/${QUIZ_MAX_LIVES}`, true);
      // 1秒後にボタン再有効化
      setTimeout(() => {
        if (btn) { btn.classList.remove('wrong'); btn.disabled = false; }
      }, 800);
    }
  }
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
  const questions = (Array.isArray(state.quizShuffled) && state.quizShuffled.length > 0)
    ? state.quizShuffled
    : sec[lv.key];
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
  const sec     = mathData.chapters[state.chapterIdx]?.sections?.[state.sectionIdx];
  const isSingleLevel = sec && (sec.singleLevel === true
    || (Array.isArray(sec.basic) && sec.basic.length > 0
        && (!sec.standard || sec.standard.length === 0)
        && (!sec.advanced || sec.advanced.length === 0)));
  const isNew   = completeLevel(state.chapterIdx, state.sectionIdx, state.quizLevelIdx);

  const peasToShow = isSingleLevel ? 10 : lv.peas;
  // 報酬を表示するか（singleLevel は毎回、それ以外は初回のみ）
  const showReward = isSingleLevel || isNew;
  const peasStr = '🌱×' + peasToShow;

  const card = document.getElementById('quiz-card');
  card.classList.add('quiz-success');
  card.innerHTML = `
    <div class="quiz-success-icon">🎉</div>
    <div class="quiz-success-text">レベルクリア！！</div>
    <div class="quiz-success-level">${isSingleLevel ? '★ 10問チャレンジ' : lv.stars + ' ' + lv.label}</div>
    <div class="quiz-success-peas">${showReward ? peasStr + ' 個ゲット！' : 'クリア済みです！'}</div>
  `;
  if (showReward) {
    setTimeout(() => {
      // 演出回数は最大10回まで（10個一気にバウンスさせる）
      const bounceCount = Math.min(peasToShow, 10);
      for (let i = 0; i < bounceCount; i++) {
        setTimeout(() => bounceAndAddPea(), i * 200);
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
// bulk フォームの4択選択状態を保持
const bulkChoiceSelections = {}; // { prefix: { i: selectedChoice } }
const bulkShuffledChoices  = {}; // { prefix: { i: [choices...] } }

function renderBulkQuizForm(sec, questions, title, badgeColor, submitFn, inputPrefix) {
  // この prefix の選択状態をリセット
  bulkChoiceSelections[inputPrefix] = {};
  bulkShuffledChoices[inputPrefix]  = {};

  const qRows = questions.map((q, i) => {
    const lv = LEVELS[q.fromLevel];
    const hasChoices = Array.isArray(q.choices) && q.choices.length >= 2 && q.choices.length <= 4;
    let answerArea;
    if (hasChoices) {
      // 選択肢をシャッフルして保存
      const shuffled = [...q.choices].sort(() => Math.random() - 0.5);
      bulkShuffledChoices[inputPrefix][i] = shuffled;
      answerArea = `
        <div class="bulk-q-choices" data-count="${shuffled.length}" id="${inputPrefix}-choices-${i}">
          ${shuffled.map((c, ci) => `
            <button type="button" class="bulk-q-choice-btn"
                    data-prefix="${inputPrefix}" data-qi="${i}" data-ci="${ci}"
                    onclick="selectBulkChoice('${inputPrefix}',${i},${ci})">${formatQuestion(c)}</button>
          `).join('')}
        </div>`;
    } else {
      answerArea = `
        <div class="bulk-q-input-wrap">
          <input class="bulk-q-input" id="${inputPrefix}-${i}"
                 type="text" placeholder="${q.b && q.b.trim() ? '＿＿ に入る答えを入力' : '答えを入力'}"
                 autocomplete="off"
                 onkeydown="bulkInputKeydown(event,${i},'${inputPrefix}')">
        </div>`;
    }
    return `
      <div class="bulk-q-row">
        <div class="bulk-q-header">
          <span class="bulk-q-num">問 ${i + 1}</span>
          <span class="bulk-q-level" style="color:${lv.color}">${lv.stars} ${lv.label}</span>
        </div>
        <div class="bulk-q-text">${formatQuestion(q.q)}</div>
        ${getBlankHint(q) ? `<div class="bulk-q-hint"><span class="bulk-q-hint-label">答えの形</span>${formatQuestion(getBlankHint(q))}</div>` : ''}
        ${answerArea}
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

// bulk 4択：選択肢クリック時の処理
function selectBulkChoice(prefix, i, ci) {
  const choices = (bulkShuffledChoices[prefix] || {})[i];
  if (!choices) return;
  bulkChoiceSelections[prefix] = bulkChoiceSelections[prefix] || {};
  bulkChoiceSelections[prefix][i] = choices[ci];
  // 視覚的にハイライト：同じ問題の他のボタンは normal、選択したものを active
  const container = document.getElementById(`${prefix}-choices-${i}`);
  if (container) {
    container.querySelectorAll('.bulk-q-choice-btn').forEach(btn => btn.classList.remove('selected'));
    const target = container.querySelector(`[data-ci="${ci}"]`);
    if (target) target.classList.add('selected');
  }
}

// bulk 採点時に回答を取得（4択 / 自由入力どちらも対応）
function getBulkAnswer(prefix, i) {
  const sel = (bulkChoiceSelections[prefix] || {})[i];
  if (sel !== undefined) return sel;
  const input = document.getElementById(`${prefix}-${i}`);
  return input ? input.value : '';
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
  const answers   = questions.map((_, i) => getBulkAnswer('mt', i));
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
  const answers   = questions.map((_, i) => getBulkAnswer('prac', i));
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
  { sec: 30, peas: 5, label: '30秒以内', color: '#00d2ff', medal: '🥇' },
  { sec: 40, peas: 3, label: '40秒以内', color: '#9ded62', medal: '🥈' },
  { sec: 50, peas: 2, label: '50秒以内', color: '#f7971e', medal: '🥉' },
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
  // タイムアタックの bulk 選択状態を初期化
  bulkChoiceSelections['ta'] = {};
  bulkShuffledChoices['ta']  = {};
  navigate('timeattack');
}

// ----- レンダリング -----
function renderTimeAttack() {
  const sec = mathData.chapters[state.chapterIdx].sections[state.sectionIdx];
  if (state.timeAttackPhase === 'quiz') {
    const qRows = state.timeAttackQuestions.map((q, i) => {
      const lv = LEVELS[q.fromLevel];
      const hasChoices = Array.isArray(q.choices) && q.choices.length >= 2 && q.choices.length <= 4;
      let answerArea;
      if (hasChoices) {
        // すでにシャッフル済みなら再利用、なければ新規シャッフル
        if (!bulkShuffledChoices['ta']) bulkShuffledChoices['ta'] = {};
        if (!bulkShuffledChoices['ta'][i]) {
          bulkShuffledChoices['ta'][i] = [...q.choices].sort(() => Math.random() - 0.5);
        }
        const shuffled = bulkShuffledChoices['ta'][i];
        const sel = (bulkChoiceSelections['ta'] || {})[i];
        answerArea = `
          <div class="bulk-q-choices" data-count="${shuffled.length}" id="ta-choices-${i}">
            ${shuffled.map((c, ci) => `
              <button type="button" class="bulk-q-choice-btn${sel === c ? ' selected' : ''}"
                      onclick="selectBulkChoice('ta',${i},${ci})">${formatQuestion(c)}</button>
            `).join('')}
          </div>`;
      } else {
        answerArea = `
          <div class="bulk-q-input-wrap">
            <input class="bulk-q-input" id="ta-${i}"
                   type="text" placeholder="${q.b && q.b.trim() ? '＿＿ に入る答えを入力' : '答えを入力'}" autocomplete="off"
                   onkeydown="taInputKeydown(event,${i})">
          </div>`;
      }
      return `
        <div class="bulk-q-row">
          <div class="bulk-q-header">
            <span class="bulk-q-num">問 ${i + 1}</span>
            <span class="bulk-q-level" style="color:${lv.color}">${lv.stars} ${lv.label}</span>
          </div>
          <div class="bulk-q-text">${formatQuestion(q.q)}</div>
          ${getBlankHint(q) ? `<div class="bulk-q-hint"><span class="bulk-q-hint-label">答えの形</span>${formatQuestion(getBlankHint(q))}</div>` : ''}
          ${answerArea}
        </div>`;
    }).join('');

    const teacherTime = sec.teacherTime || null;
    const studentBestTime = sec.studentBestTime || null;
    const studentBestName = sec.studentBestName || '生徒';
    const taCurrentData = getTimeAttackData(state.chapterIdx, state.sectionIdx);
    const targetHtml = teacherTime !== null && !isTeacherBeaten(taCurrentData, teacherTime)
      ? `<div class="ta-teacher-target">👑 小林T のタイム：<span>${teacherTime.toFixed(1)}秒</span>を超えれば 🌱×15個！</div>`
      : teacherTime !== null && isTeacherBeaten(taCurrentData, teacherTime)
      ? `<div class="ta-teacher-target ta-teacher-beaten-msg">👑 小林T 撃破済み！（${teacherTime.toFixed(1)}秒）</div>`
      : '';
    const studentTargetHtml = studentBestTime !== null && !isStudentBestBeaten(taCurrentData, studentBestTime)
      ? `<div class="ta-teacher-target ta-student-target">🏅 ${studentBestName} のタイム：<span>${studentBestTime.toFixed(1)}秒</span>を超えれば 🌱×30個！</div>`
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
        ${state.timeAttackTeacherBeaten ? '<div class="ta-teacher-beaten">👑 小林T を倒した！ 🌱×15個ゲット！</div>' : ''}
        ${state.timeAttackStudentBeaten ? `<div class="ta-teacher-beaten ta-student-beaten">🏅 ${sec.studentBestName || '生徒'}のベストを破った！ 🌱×30個ゲット！</div>` : ''}
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
  const answers   = questions.map((_, i) => getBulkAnswer('ta', i));
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
      newPeas += 15;
      state.timeAttackTeacherBeaten = true;  // 今回初めて先生を倒した
    }

    // 生徒自己ベスト チャレンジ判定
    const studentBestTime = sec.studentBestTime || null;
    state.timeAttackStudentBeaten = false;
    if (studentBestTime !== null && elapsed < studentBestTime && !isStudentBestBeaten(taData, studentBestTime)) {
      taData.studentBestBeaten = true;
      taData.studentBestTimeWhenBeaten = studentBestTime;
      newPeas += 30;
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

// variant + level 別に自己ベストを保存
function cmStorageKey() {
  if (cmVariant === 'sqrt') return `cardMatch_sqrt_${cmSqrtLevel}_v1`;
  return CM_KEY;
}
function cmLoad() { return JSON.parse(localStorage.getItem(cmStorageKey()) || '{}'); }
function cmSave(d) { localStorage.setItem(cmStorageKey(), JSON.stringify(d)); }

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

// 現在のバリアント（'factor': 既存の展開・因数分解 / 'sqrt': 平方根）
let cmVariant = 'factor';
// 平方根版のレベル（'beginner' / 'intermediate' / 'advanced'）
let cmSqrtLevel = localStorage.getItem('cmSqrtLevel') || 'beginner';

function cmSetSqrtLevel(level) {
  cmSqrtLevel = level;
  localStorage.setItem('cmSqrtLevel', level);
  render();
}

function cmSqrtLevelDesc() {
  if (cmSqrtLevel === 'beginner')    return '初級：N が平方数（例: 25 の平方根 ↔ ±5）';
  if (cmSqrtLevel === 'intermediate') return '中級：N が平方数でない（例: 5 の平方根 ↔ ±√5）';
  return '上級：初級と中級を混ぜる';
}

// === 初級: Nの平方根（Nが平方数 → 答えが有理数）===
const CM_SQRT_POOL_PERFECT = [
  { q: '4 の平方根',        a: '±2'    },
  { q: '9 の平方根',        a: '±3'    },
  { q: '16 の平方根',       a: '±4'    },
  { q: '25 の平方根',       a: '±5'    },
  { q: '36 の平方根',       a: '±6'    },
  { q: '49 の平方根',       a: '±7'    },
  { q: '64 の平方根',       a: '±8'    },
  { q: '81 の平方根',       a: '±9'    },
  { q: '100 の平方根',      a: '±10'   },
  { q: '121 の平方根',      a: '±11'   },
  { q: '144 の平方根',      a: '±12'   },
  { q: '169 の平方根',      a: '±13'   },
  { q: '225 の平方根',      a: '±15'   },
  { q: '{1/4} の平方根',    a: '±{1/2}' },
  { q: '{1/9} の平方根',    a: '±{1/3}' },
  { q: '{9/16} の平方根',   a: '±{3/4}' },
  { q: '{4/25} の平方根',   a: '±{2/5}' },
  { q: '{25/49} の平方根',  a: '±{5/7}' },
  { q: '0.25 の平方根',     a: '±0.5'  },
  { q: '0.36 の平方根',     a: '±0.6'  },
  { q: '0.09 の平方根',     a: '±0.3'  },
  { q: '0.64 の平方根',     a: '±0.8'  },
  { q: '0.04 の平方根',     a: '±0.2'  },
  { q: '0.81 の平方根',     a: '±0.9'  },
];

// === 中級: Nの平方根（Nが平方数でない → 答えが無理数 ±√N）===
const CM_SQRT_POOL_IRRATIONAL = [
  { q: '2 の平方根',        a: '±√2'  },
  { q: '3 の平方根',        a: '±√3'  },
  { q: '5 の平方根',        a: '±√5'  },
  { q: '6 の平方根',        a: '±√6'  },
  { q: '7 の平方根',        a: '±√7'  },
  { q: '10 の平方根',       a: '±√10' },
  { q: '11 の平方根',       a: '±√11' },
  { q: '13 の平方根',       a: '±√13' },
  { q: '14 の平方根',       a: '±√14' },
  { q: '15 の平方根',       a: '±√15' },
  { q: '17 の平方根',       a: '±√17' },
  { q: '19 の平方根',       a: '±√19' },
  { q: '21 の平方根',       a: '±√21' },
  { q: '23 の平方根',       a: '±√23' },
  { q: '{1/3} の平方根',    a: '±√{1/3}' },
  { q: '{2/3} の平方根',    a: '±√{2/3}' },
  { q: '{3/5} の平方根',    a: '±√{3/5}' },
  { q: '{5/7} の平方根',    a: '±√{5/7}' },
  { q: '0.3 の平方根',      a: '±√0.3' },
  { q: '0.5 の平方根',      a: '±√0.5' },
  { q: '0.7 の平方根',      a: '±√0.7' },
];

function cmPickProblems() {
  if (cmVariant === 'sqrt') return cmPickSqrtProblems();
  // 既存：式の展開・因数分解
  const ch = mathData.chapters[0];
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

function cmPickSqrtProblems() {
  let pool;
  if (cmSqrtLevel === 'beginner') pool = [...CM_SQRT_POOL_PERFECT];
  else if (cmSqrtLevel === 'intermediate') pool = [...CM_SQRT_POOL_IRRATIONAL];
  else pool = [...CM_SQRT_POOL_PERFECT, ...CM_SQRT_POOL_IRRATIONAL]; // advanced
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
  if (sec <= 20) return 25;
  if (sec <= 30) return 20;
  if (sec <= 40) return 15;
  if (sec <= 50) return 10;
  if (sec <= 60) return 5;
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

  const tt = cmGetTeacherTime();
  const sbt = cmGetStudentBestTime();
  const sbn = cmGetStudentBestName();
  const beatTeacher = tt != null && cmSeconds < tt;
  const beatStudentBest = sbt != null && cmSeconds < sbt;

  // 1日の報酬回数上限チェック（カードマッチは variant ごとに5回まで）
  // 付与がある場合だけ1回分を消費する
  const cmPotential = cmTimePeas(cmSeconds) + (beatTeacher ? 15 : 0) + (beatStudentBest ? 30 : 0);
  let cmRewardOK = true;
  if (cmPotential > 0 && typeof rewardAllowed === 'function') {
    cmRewardOK = rewardAllowed('cardmatch_' + cmVariant);
  }
  const cmCapped = !cmRewardOK;

  const peas = cmRewardOK ? cmTimePeas(cmSeconds) : 0;
  if (peas > 0) addPeas(peas);
  if (beatTeacher && cmRewardOK) addPeas(15);       // 小林T超えボーナス +15
  if (beatStudentBest && cmRewardOK) addPeas(30);   // 生徒ベスト超えボーナス +30

  const overlay = document.getElementById('cm-overlay');
  if (!overlay) return;
  overlay.innerHTML = `
    <div class="cm-result">
      <div class="cm-result-icon">${beatTeacher ? '👑' : beatStudentBest ? '🏅' : '🎉'}</div>
      <div class="cm-result-title">${beatTeacher ? '小林T超え！' : beatStudentBest ? `${sbn}超え！` : 'クリア！'}</div>
      <div class="cm-result-time">${cmFmtTime(cmSeconds)}</div>
      ${isNewBest ? '<div class="cm-result-badge">🏅 自己ベスト更新！</div>' : ''}
      ${(beatTeacher && cmRewardOK) ? `<div class="cm-result-teacher-beat">👑 小林T(${cmFmtTime(tt)})を超えた！<br>🌱 ×15 ボーナス！</div>` : ''}
      ${(beatStudentBest && cmRewardOK) ? `<div class="cm-result-teacher-beat" style="color:#9ded62;border-color:rgba(157,237,98,0.3);">🏅 ${sbn}(${cmFmtTime(sbt)})を超えた！<br>🌱 ×30 ボーナス！</div>` : ''}
      ${cmCapped ? `<div class="cm-result-nopea">本日の🌱はここまで（1日${(window.REWARD_MAX_PER_GAME||5)}回まで）また明日！</div>` : (peas > 0 ? `<div class="cm-result-pea">🌱 ×${peas} もらった！</div>` : '<div class="cm-result-nopea">60秒超 → 報酬なし</div>')}
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
// カードマッチ平方根版 用
let cmSqrtTeacherTime      = null;
let cmSqrtStudentBestTime  = null;
let cmSqrtStudentBestName  = null;

// 現在のバリアントに応じた値を返すヘルパー
function cmGetTeacherTime()     { return cmVariant === 'sqrt' ? cmSqrtTeacherTime     : cmTeacherTime; }
function cmGetStudentBestTime() { return cmVariant === 'sqrt' ? cmSqrtStudentBestTime : cmStudentBestTime; }
function cmGetStudentBestName() { return cmVariant === 'sqrt' ? cmSqrtStudentBestName : cmStudentBestName; }
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
    { sec: 20, peas: 25 },
    { sec: 30, peas: 20 },
    { sec: 40, peas: 15 },
    { sec: 50, peas: 10 },
    { sec: 60, peas: 5 },
  ];
  const rows = tiers.map(t => `
    <div class="cmr-row">
      <span class="cmr-time">${cmFmtTime(t.sec)}以内</span>
      <span class="cmr-peas">🌱×${t.peas}</span>
    </div>`).join('');
  const tt = cmGetTeacherTime();
  const sbt = cmGetStudentBestTime();
  const sbn = cmGetStudentBestName();
  const teacherRow = tt != null ? `
    <div class="cmr-row cmr-teacher">
      <span class="cmr-time">👑小林T(${cmFmtTime(tt)})超え</span>
      <span class="cmr-peas">🌱×15</span>
    </div>` : '';
  const studentRow = sbt != null && sbn ? `
    <div class="cmr-row" style="background:rgba(157,237,98,0.08);border-color:rgba(157,237,98,0.25);">
      <span class="cmr-time" style="color:#9ded62;">🏅${sbn}(${cmFmtTime(sbt)})超え</span>
      <span class="cmr-peas">🌱×30</span>
    </div>` : '';
  return `<div class="cmr-table">${teacherRow}${studentRow}${rows}</div>`;
}

// ---- 画面描画：メニュー ----
function renderCmMenu() {
  const d = cmLoad();
  const bestStr = d.best != null ? `自己ベスト ${cmFmtTime(d.best)}` : null;
  const subTitle = cmVariant === 'sqrt' ? '〜 平方根 〜' : '〜 展開・因数分解 〜';
  const logo = cmVariant === 'sqrt' ? '√' : '🃏';
  // 平方根モードのみレベル選択を表示
  const levelSelector = cmVariant === 'sqrt' ? `
    <div class="cm-level-selector">
      <button class="cm-level-btn ${cmSqrtLevel === 'beginner' ? 'active' : ''}" onclick="cmSetSqrtLevel('beginner')">初級</button>
      <button class="cm-level-btn ${cmSqrtLevel === 'intermediate' ? 'active' : ''}" onclick="cmSetSqrtLevel('intermediate')">中級</button>
      <button class="cm-level-btn ${cmSqrtLevel === 'advanced' ? 'active' : ''}" onclick="cmSetSqrtLevel('advanced')">上級</button>
    </div>
    <div class="cm-level-desc">${cmSqrtLevelDesc()}</div>
  ` : '';
  return `
    <div class="cm-menu-screen">
      <div class="cm-menu-logo">${logo}</div>
      <div class="cm-menu-title">カードマッチ</div>
      <div class="cm-menu-subtitle">${subTitle}</div>
      ${levelSelector}
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
        <span class="cmrb-item">🌱×25&nbsp;<span class="cmrb-t">0:20</span></span>
        <span class="cmrb-sep">|</span>
        <span class="cmrb-item">×20&nbsp;<span class="cmrb-t">0:30</span></span>
        <span class="cmrb-sep">|</span>
        <span class="cmrb-item">×15&nbsp;<span class="cmrb-t">0:40</span></span>
        <span class="cmrb-sep">|</span>
        <span class="cmrb-item">×10&nbsp;<span class="cmrb-t">0:50</span></span>
        <span class="cmrb-sep">|</span>
        <span class="cmrb-item">×5&nbsp;<span class="cmrb-t">1:00</span></span>
        ${cmTeacherTime != null ? `<span class="cmrb-sep">|</span><span class="cmrb-item cmrb-teacher">👑×15&nbsp;<span class="cmrb-t">${cmFmtTime(cmTeacherTime)}超</span></span>` : ''}
        ${cmStudentBestTime != null && cmStudentBestName ? `<span class="cmrb-sep">|</span><span class="cmrb-item" style="color:#9ded62;">🏅×30&nbsp;<span class="cmrb-t">${cmFmtTime(cmStudentBestTime)}超</span></span>` : ''}
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
  else if (state.view === 'puzzles')    content = renderPuzzlesPage();
  else if (state.view === 'sugoroku')   content = ''; // sugoroku.js が直接 main-content を書き換える
  else if (state.view === 'aquarium')   content = ''; // aquarium.js が直接 main-content を書き換える
  else if (state.view === 'shooting')   content = ''; // iframeで描画

  if (state.view === 'sugoroku') {
    document.body.classList.add('sg-mode');
    document.body.classList.remove('shooting-mode');
    renderSugoroku();
    return;
  }
  if (state.view === 'aquarium') {
    document.body.classList.add('aq-mode');
    document.body.classList.remove('sg-mode', 'shooting-mode');
    if (typeof renderAquarium === 'function') renderAquarium();
    return;
  }
  if (state.view === 'shooting') {
    document.body.classList.add('shooting-mode');
    document.body.classList.remove('sg-mode');
    document.getElementById('main-content').innerHTML = `
      <div class="shooting-wrap">
        <button class="shooting-back-btn" onclick="navigate('games')">← ゲーム一覧</button>
        <iframe class="shooting-iframe"
                src="games/因数分解シューティング.html?_v=${APP_VERSION}"
                title="因数分解シューティング"
                allow="autoplay"></iframe>
      </div>`;
    updateBowlWidget(false);
    return;
  }
  document.body.classList.remove('sg-mode', 'shooting-mode', 'aq-mode');   // ① お椀を戻す
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

// プレビュー解除モーダル（先生パスワード入力）
function showPreviewUnlockModal() {
  if (document.getElementById('preview-unlock-overlay')) return;
  const ov = document.createElement('div');
  ov.id = 'preview-unlock-overlay';
  ov.className = 'modal-overlay';
  ov.innerHTML = `
    <div class="modal-card">
      <div class="modal-lock">🔒</div>
      <div class="modal-level">プレビューモード</div>
      <p class="modal-desc">先生用パスワードを入力してください<br><small>（このモードは先生専用です）</small></p>
      <input type="password" id="preview-unlock-pw" class="modal-input" placeholder="パスワード" autocomplete="off">
      <div id="preview-unlock-error" class="modal-error"></div>
      <div class="modal-btns">
        <button class="modal-btn-cancel" onclick="window.location.search=''">通常モードへ</button>
        <button class="modal-btn-submit" onclick="submitPreviewUnlock()">開く</button>
      </div>
    </div>`;
  document.body.appendChild(ov);
  requestAnimationFrame(() => ov.classList.add('show'));
  const inp = document.getElementById('preview-unlock-pw');
  if (inp) {
    inp.focus();
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') submitPreviewUnlock(); });
  }
}

// ===== 最新版チェック（古いキャッシュで遊び続けるのを防ぐ） =====
// version.json を常に最新で取得し、公開バージョンが変わっていたら
// キャッシュを回避するURL(?_v=...)で読み込み直す。
(function checkAppVersion() {
  fetch('version.json?_t=' + Date.now(), { cache: 'no-store' })
    .then(r => r.ok ? r.json() : null)
    .then(j => {
      if (!j || !j.version) return;
      const params = new URLSearchParams(window.location.search);
      if (j.version !== APP_VERSION && params.get('_v') !== j.version) {
        params.set('_v', j.version);
        window.location.replace(window.location.pathname + '?' + params.toString());
      }
    })
    .catch(() => {});
})();

// ===== 初期化 =====
initMathBackground();
createBowlWidget();

// ?preview=draft だが未認証 → 先生パスワードを要求（生徒はここで止まる）
if (_wantsPreview && !PREVIEW_MODE) {
  showPreviewUnlockModal();
}

// プレビューモードバナーを表示
if (PREVIEW_MODE) {
  const banner = document.createElement('div');
  banner.id = 'preview-banner';
  banner.innerHTML = '👁 プレビューモード（下書き章も表示中・数時間で自動解除）<button onclick="localStorage.removeItem(\'mathPreviewUntil\'); window.location.search=\'\'">通常モードに戻る</button>';
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

// 問題データを読み込む（キャッシュを使わず常に最新を取得）
// ローカルサーバー・GitHub Pages どちらでも questions.json を直接参照
fetch('./questions.json?_t=' + Date.now(), { cache: 'no-store' })
  .then(r => r.json())
  .then(data => {
    migrateRankings(data);
    mathData.chapters = data.chapters;
    mathData.news = Array.isArray(data.news) ? data.news : [];
    mathData.gameDrafts = data.gameDrafts || {};
    mathData.cardMatchStudentBestList = data.cardMatchStudentBestList || [];
    mathData.kyotsuingenWallRankings = data.kyotsuingenWallRankings || { lv1: [], lv2: [], lv3: [], all: [] };
    if (data.cardMatchTeacherTime != null) cmTeacherTime = data.cardMatchTeacherTime;
    if (data.cardMatchStudentBestTime != null) cmStudentBestTime = data.cardMatchStudentBestTime;
    if (data.cardMatchStudentBestName) cmStudentBestName = data.cardMatchStudentBestName;
    // 平方根版
    if (data.cardMatchSqrtTeacherTime != null) cmSqrtTeacherTime = data.cardMatchSqrtTeacherTime;
    if (data.cardMatchSqrtStudentBestTime != null) cmSqrtStudentBestTime = data.cardMatchSqrtStudentBestTime;
    if (data.cardMatchSqrtStudentBestName) cmSqrtStudentBestName = data.cardMatchSqrtStudentBestName;
    render();
  })
  .catch(() => {
    // questions.json が読めない場合は data.js のデータをそのまま使う
    render();
  });
