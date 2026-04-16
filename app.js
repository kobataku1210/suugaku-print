// ============================================================
// app.js
// ============================================================

// ===== 定数 =====
const STORAGE_KEY = 'mathPrint_v2';
const TEACHER_PASSWORD = 'sensei2024'; // 先生用グリンピース追加パスワード

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

// ===== 進捗管理（localStorage） =====
function getProgress() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || { done: {}, peaCount: 0 };
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
    </div>
  `;
  overlay.addEventListener('click', e => { if (e.target === overlay) closeTeacherModal(); });
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('show'));
  document.getElementById('teacher-pw').focus();
}

function closeTeacherModal() {
  const overlay = document.getElementById('teacher-modal-overlay');
  if (!overlay) return;
  overlay.classList.remove('show');
  setTimeout(() => overlay.remove(), 300);
}

function submitTeacherPeas() {
  const pw    = document.getElementById('teacher-pw').value;
  const count = parseInt(document.getElementById('teacher-pea-count').value);
  const errEl = document.getElementById('teacher-modal-error');

  if (pw !== TEACHER_PASSWORD) {
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

  // 左パネル用スケール 0.28（62px幅、5pxのpea）
  const CBP_SCALE = 0.28;
  const cbpMW = Math.round(220 * CBP_SCALE); // 62
  const cbpMH = Math.round(170 * CBP_SCALE); // 48
  const cbpPeasHtml = PEA_POSITIONS.map(pos =>
    `<div class="cbp-pea" style="left:${Math.round(pos.x*CBP_SCALE)}px;top:${Math.round(pos.y*CBP_SCALE)}px"></div>`
  ).join('');

  let html = `<div class="cbp-title">完成したお椀</div>`;
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

// ===== ナビゲーション =====
function navigate(view, opts = {}) {
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
function renderHome() {
  const cards = mathData.chapters.map((ch, i) => {
    const has = ch.sections.length > 0;
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
  return `
    <div class="section-title">
      <h2>章を選ぼう！</h2>
      <p>学習したい単元をタップしてね</p>
    </div>
    <div class="chapters-grid">${cards}</div>`;
}

function handleChapterClick(e, el, idx) {
  addRipple(e, el);
  if (!mathData.chapters[idx].sections.length) return;
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

  return `
    <button class="back-btn" onclick="navigate('sections')">← 節一覧に戻る</button>
    <div class="section-title">
      <h2>${sec.title}</h2>
      <p>難易度を選んでね</p>
    </div>
    <div class="difficulty-grid">${cards}</div>
    ${minitestCard}
    ${practiceCard}`;
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
             placeholder="${q.b && q.b.trim() ? '＿＿ に入る答えを入力' : '答えを入力'}" autocomplete="off">
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

function submitMiniTestPassword() {
  const pw    = document.getElementById('minitest-pw').value;
  const errEl = document.getElementById('minitest-modal-error');
  // 節ごとのパスワードを使用（未設定の場合は共通パスワードにフォールバック）
  const sec = mathData.chapters[state.chapterIdx].sections[state.sectionIdx];
  const correctPw = String(sec.miniTestPassword || TEACHER_PASSWORD);
  if (pw !== correctPw) {
    errEl.textContent = 'パスワードが違います';
    errEl.style.display = 'block';
    const card = document.getElementById('minitest-modal-card');
    card.classList.add('shake');
    card.addEventListener('animationend', () => card.classList.remove('shake'), { once: true });
    return;
  }
  closeMiniTestModal();
  const sec = mathData.chapters[state.chapterIdx].sections[state.sectionIdx];
  state.miniTestQuestions    = generate5Questions(sec);
  state.miniTestPhase        = 'quiz';
  state.miniTestAnswers      = [];
  state.miniTestWrongIndices = [];
  state.miniTestPeaIsNew     = false;
  navigate('minitest');
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
                 type="text" placeholder="${q.b && q.b.trim() ? '＿＿ に入る答えを入力' : '答えを入力'}" autocomplete="off">
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
// ===== メインレンダリング =====
// ============================================================
function render() {
  quizLocked = false;   // 画面が切り替わるたびにロック解除
  let content = '';
  if      (state.view === 'home')       content = renderHome();
  else if (state.view === 'sections')   content = renderSections();
  else if (state.view === 'difficulty') content = renderDifficulty();
  else if (state.view === 'quiz')       content = renderQuiz();
  else if (state.view === 'minitest')   content = renderMiniTest();
  else if (state.view === 'practice')   content = renderPractice();
  document.getElementById('main-content').innerHTML = content;
  updateBowlWidget(false);

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
}

// ===== 初期化 =====
initMathBackground();
createBowlWidget();

// 問題データを読み込む
// ローカルサーバー・GitHub Pages どちらでも questions.json を直接参照
fetch('./questions.json')
  .then(r => r.json())
  .then(data => {
    mathData.chapters = data.chapters;
    render();
  })
  .catch(() => {
    // questions.json が読めない場合は data.js のデータをそのまま使う
    render();
  });
