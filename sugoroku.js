// ============================================================
// sugoroku.js  —  すごろく Phase 1 & 2
// ============================================================

// ===== ステージ管理 =====
let sgStage = parseInt(localStorage.getItem('sgCurrentStage') || '1');
function setSgStage(n) { sgStage = n; localStorage.setItem('sgCurrentStage', String(n)); }
function sgCurrentMax()    { return sgStage === 1 ? 100 : 150; }
function sgCurrentSpaces() { return sgStage === 1 ? SUGOROKU_SPACES : SUGOROKU_SPACES_V2; }
function sgIsStage1Cleared() {
  try { return !!(JSON.parse(localStorage.getItem('sgSave_v1') || '{}').cleared); }
  catch(e) { return false; }
}
function sgEnterStage2() {
  if (!sgIsStage1Cleared()) return;
  setSgStage(2); _sgClearPhase(); renderSugoroku();
}
function sgGoToStage1() { setSgStage(1); _sgClearPhase(); renderSugoroku(); }
function _sgClearPhase() {
  sgPhase = 'idle'; sgMsg = ''; sgMsgType = 'info';
  sgStarActive = false; sgStarExchangeGive = null;
  sgGateV2Pos = null;
  sgBossSquare = null; sgBossQList = []; sgBossQIndex = 0;
  if (sgBossTimer) { clearInterval(sgBossTimer); sgBossTimer = null; }
  document.getElementById('sg-boss-overlay')?.remove();
  document.getElementById('sg-dice-overlay')?.remove();
  document.getElementById('sg-dig-overlay')?.remove();
}

// ===== 定数 =====
const BALL_COLORS = ['red','blue','yellow','green','purple'];
const BALL_EMOJI  = {red:'🔴',blue:'🔵',yellow:'🟡',green:'🟢',purple:'🟣'};
const BALL_NAME   = {red:'赤',blue:'青',yellow:'黄',green:'緑',purple:'紫'};
const DICE_FACES  = ['⚀','⚁','⚂','⚃','⚄','⚅'];

// ===== マス定義（①左上スタート・100マス）=====
const SUGOROKU_SPACES = (() => {
  const sp = [null];
  for (let i = 1; i <= 100; i++) sp.push({ num: i, type: 'normal' });
  const set = (n, type, param) => { sp[n].type = type; if (param !== undefined) sp[n].param = param; };

  // ③ 進む
  set(3,  'forward', 2);  set(5,  'forward', 1);
  set(14, 'forward', 3);  set(17, 'forward', 1);
  set(23, 'forward', 4);  set(27, 'forward', 2);
  set(32, 'forward', 5);  // レア
  set(35, 'forward', 3);  set(43, 'forward', 1);
  set(48, 'forward', 2);  set(53, 'forward', 4);
  set(63, 'forward', 1);  set(86, 'forward', 2);
  set(94, 'forward', 3);

  // ③ サイコロを振ってその分進む
  set(19, 'rollAndForward');
  set(59, 'rollAndForward');

  // ③ 戻る
  set(6,  'back', 1);  set(12, 'back', 2);
  set(22, 'back', 3);  set(33, 'back', 1);
  set(57, 'back', 2);  set(65, 'back', 1);
  set(72, 'back', 3);  set(89, 'back', 2);

  // ③ サイコロを振ってその分戻る
  set(38, 'rollAndBack');
  set(82, 'rollAndBack');

  // 既存マス（残す）
  set(16, 'again');  set(44, 'again');  set(68, 'again');
  set(25, 'rest');   set(51, 'rest');   set(75, 'rest');
  set(29, 'warp', 45); set(78, 'warp', 65);
  // ① お宝→モンスターに変更、モンスター増設（計6マス）
  set(9,  'monster'); set(18, 'monster'); set(37, 'monster');
  set(47, 'monster'); set(55, 'monster'); set(73, 'monster');
  // ⑤ 球落としマス（5マス）
  [10, 21, 41, 64, 87].forEach(n => set(n, 'dropBall'));

  // ② 門出現マス
  set(85, 'gate_spawn'); set(90, 'gate_spawn');

  // ⑦ 掘れるマス（29個：元30 から80を☆に変更）
  [2,4,7,8,11,13,20,24,26,31,34,39,40,46,49,52,56,61,62,66,69,70,76,79,84,88,92,95,98]
    .forEach(n => set(n, 'dig'));

  // ⭐ ラッキースターマス
  set(80, 'star');

  // ⑧ 交換所（8個）
  [15,30,42,50,60,71,83,91].forEach(n => set(n, 'exchange'));

  // ゴール
  set(100, 'goal');
  return sp;
})();

// ===== ステージ2 マス定義（150マス）=====
const SUGOROKU_SPACES_V2 = (() => {
  const sp = [null];
  for (let i = 1; i <= 150; i++) sp.push({ num: i, type: 'normal' });
  const set = (n, t, p) => { sp[n].type = t; if (p !== undefined) sp[n].param = p; };

  // ⚔️ ボスマス（関門）
  set(50,  'boss');
  set(100, 'boss');
  set(150, 'boss'); // ボス兼ゴール

  // ⬆ 進む
  set(3,'forward',2); set(8,'forward',1);  set(17,'forward',3); set(24,'forward',2);
  set(33,'forward',1);set(38,'forward',4); set(53,'forward',2); set(58,'forward',1);
  set(63,'forward',3);set(74,'forward',2); set(78,'forward',1); set(87,'forward',3);
  set(93,'forward',2);set(107,'forward',2);set(112,'forward',3);set(122,'forward',1);
  set(133,'forward',2);set(138,'forward',4);

  // 🎲⬆ ロールして進む
  set(20,'rollAndForward'); set(75,'rollAndForward'); set(125,'rollAndForward');

  // ⬇ 戻る
  set(6,'back',1); set(12,'back',2); set(28,'back',3);
  set(42,'back',2);set(48,'back',1); set(67,'back',3);
  set(72,'back',2);set(82,'back',1); set(95,'back',3);
  set(110,'back',2);set(118,'back',1);set(127,'back',3);
  set(142,'back',2);set(145,'back',1);

  // 🎲⬇ ロールして戻る
  set(45,'rollAndBack'); set(97,'rollAndBack'); set(135,'rollAndBack');

  // 🎲 もう一度
  set(16,'again'); set(55,'again'); set(90,'again'); set(128,'again');

  // 💤 1回休み
  set(30,'rest'); set(70,'rest'); set(105,'rest'); set(140,'rest');

  // 🌀 ワープ
  set(35,'warp',57); set(88,'warp',116); set(126,'warp',148);

  // 👾 モンスター
  [9,22,36,46,62,77,85,96,108,119,131,143].forEach(n => set(n,'monster'));

  // 💀 球落とし
  [14,29,43,66,81,102,117,129,144].forEach(n => set(n,'dropBall'));

  // ⭐ ラッキースター
  set(65,'star'); set(132,'star');

  // 🚪 関門（どこでも掘る解放 & 球1個ずつ消費で通過）
  set(49,  'gate_v2', 1);
  set(99,  'gate_v2', 2);
  set(149, 'gate_v2', 3);

  // 🔄 交換所（99 は gate_v2 に変更したので除外）
  [15,40,60,79,113,130,147].forEach(n => set(n,'exchange'));

  // ⛏ 掘れるマス（49・149 は gate_v2 に変更したので除外）
  [2,4,7,11,13,18,21,25,27,31,34,39,41,47,51,54,
   61,64,69,71,76,83,86,89,91,94,98,103,106,109,111,
   114,121,124,134,136,139,141,146].forEach(n => set(n,'dig'));

  return sp;
})();

// ===== ウォーム配色 =====
const SG_WARM = {
  normal:         { bg:'#ffffff', bd:'#c8a060' },
  forward:        { bg:'#d8f2d0', bd:'#40a040' },
  rollAndForward: { bg:'#b0eeaa', bd:'#208020' },
  back:           { bg:'#ffd8d8', bd:'#d04040' },
  rollAndBack:    { bg:'#ffb8b8', bd:'#a02020' },
  again:          { bg:'#eadaff', bd:'#8040d0' },
  rest:           { bg:'#e2e0f2', bd:'#8080c0' },
  warp:           { bg:'#c8eeff', bd:'#0088c0' },
  monster:        { bg:'#ffdaaa', bd:'#d06020' },
  dropBall:       { bg:'#ffd0e0', bd:'#c02060' },
  dig:            { bg:'#f0e0c0', bd:'#806030' },
  exchange:       { bg:'#ffe0f8', bd:'#c040a0' },
  star:           { bg:'#fffacd', bd:'#e6b800' },
  gate_v2:        { bg:'#fff0b3', bd:'#e6a817' },
  boss:           { bg:'#2d0a4a', bd:'#9b30ff' },
  goal:           { bg:'#ffe860', bd:'#d0a000' },
  gate_spawn:     { bg:'#ffe080', bd:'#c07800' },
};

// ===== セーブ =====
const SG_SAVE_KEY    = 'sgSave_v1';
const SG_SAVE_KEY_V2 = 'sgSave_v2';

function getSgSave() {
  try { const r = localStorage.getItem(SG_SAVE_KEY); if (r) return JSON.parse(r); }
  catch(e) {}
  return null;
}
// setSgSave: ステージ対応（全既存コードがそのまま使える）
function setSgSave(data) {
  if (sgStage === 2) { localStorage.setItem(SG_SAVE_KEY_V2, JSON.stringify(data)); return; }
  localStorage.setItem(SG_SAVE_KEY, JSON.stringify(data));
}

function _ensureSgInitV2() {
  // ステージ1のグリンピース数を取得（持ち越し用）
  let s1Peas = 0;
  try { const s1 = JSON.parse(localStorage.getItem(SG_SAVE_KEY)||'{}'); s1Peas = s1.peas || 0; }
  catch(e) {}

  let raw = localStorage.getItem(SG_SAVE_KEY_V2);
  if (!raw) {
    // 初回作成：グリンピースはステージ1から引き継ぐ
    const save = {
      peas: s1Peas, pos: 0, maxPos: 0,
      skipNext: false, cleared: false,
      balls: { red:0, blue:0, yellow:0, green:0, purple:0 },
      boss50Cleared: false, boss100Cleared: false, boss150Cleared: false,
      gate49Opened: false, gate99Opened: false, gate149Opened: false,
      digAnyActive: false,
    };
    localStorage.setItem(SG_SAVE_KEY_V2, JSON.stringify(save));
    return save;
  }
  const save = JSON.parse(raw);
  // 移行
  let dirty = false;
  ['boss50Cleared','boss100Cleared','boss150Cleared'].forEach(k => {
    if (save[k] === undefined) { save[k] = false; dirty = true; }
  });
  ['gate49Opened','gate99Opened','gate149Opened'].forEach(k => {
    if (save[k] === undefined) { save[k] = false; dirty = true; }
  });
  if (save.digAnyActive  === undefined) { save.digAnyActive  = false; dirty = true; }
  if (save.stage2BonusPaid === undefined) { save.stage2BonusPaid = false; dirty = true; }
  // 旧バージョンで peas:0 のまま作られていた場合、ステージ1の値で補正
  if ((save.peas || 0) < s1Peas) { save.peas = s1Peas; dirty = true; }
  if (dirty) localStorage.setItem(SG_SAVE_KEY_V2, JSON.stringify(save));
  return save;
}

// ensureSgInit: ステージ対応（全既存コードがそのまま使える）
function ensureSgInit() {
  if (sgStage === 2) return _ensureSgInitV2();
  let save = getSgSave();
  if (!save) {
    let init = 0;
    try {
      const raw = localStorage.getItem('mathPrint_v2');
      if (raw) { const p = JSON.parse(raw); init = (p.peaCupCount||0)*45+(p.peaCount||0); }
    } catch(e) {}
    save = {
      peas: init, pos: 0, maxPos: 0,
      skipNext: false, cleared: false, touchedGoal: false,
      balls: { red:0, blue:0, yellow:0, green:0, purple:0 },
    };
    localStorage.setItem(SG_SAVE_KEY, JSON.stringify(save));
    return save;
  }
  // 旧データ移行
  if (!save.balls)       { save.balls = { red:0, blue:0, yellow:0, green:0, purple:0 }; localStorage.setItem(SG_SAVE_KEY, JSON.stringify(save)); }
  if (save.touchedGoal  === undefined) { save.touchedGoal  = false; localStorage.setItem(SG_SAVE_KEY, JSON.stringify(save)); }
  if (save.gate85Active === undefined) { save.gate85Active = false; localStorage.setItem(SG_SAVE_KEY, JSON.stringify(save)); }
  if (save.gate90Active === undefined) { save.gate90Active = false; localStorage.setItem(SG_SAVE_KEY, JSON.stringify(save)); }
  if (save.passedGate1  === undefined) {
    save.passedGate1 = (save.pos >= 81) || (save.touchedGoal || false);
    localStorage.setItem(SG_SAVE_KEY, JSON.stringify(save));
  }
  return save;
}

// ===== ヘルパー =====
function getSgPeas()      { return ensureSgInit().peas; }
function getSgDiceCount() { return Math.floor(getSgPeas() / 10); }
function getSgPos()       { return ensureSgInit().pos; }

function addSgPeas(n) {
  const save = ensureSgInit(); save.peas += n; setSgSave(save);
}
function spendSgPeas(n) {
  const save = ensureSgInit();
  if (save.peas < n) return false;
  save.peas -= n; setSgSave(save); return true;
}
function moveSgTo(rawPos) {
  const save = ensureSgInit();
  save.pos = Math.max(0, Math.min(sgCurrentMax(), rawPos));
  if (save.pos > save.maxPos) save.maxPos = save.pos;
  setSgSave(save);
}
function hasAllBalls() {
  const b = ensureSgInit().balls;
  return BALL_COLORS.every(c => (b[c]||0) > 0);
}
function addBall(color) {
  const save = ensureSgInit(); save.balls[color] = (save.balls[color]||0)+1; setSgSave(save);
}
function removeBallRandom() {
  const save = ensureSgInit();
  const have = BALL_COLORS.filter(c => (save.balls[c]||0) > 0);
  if (!have.length) return null;
  const c = have[Math.floor(Math.random()*have.length)];
  save.balls[c]--; setSgSave(save); return c;
}
function getRandomBallColor() { return BALL_COLORS[Math.floor(Math.random()*5)]; }

function getSgCharIcon() {
  const save = ensureSgInit();
  if (save.cleared) return '👑🧑';
  const total = BALL_COLORS.reduce((a,c) => a+(save.balls[c]||0), 0);
  if (total >= 5) return '🧙‍♂️';
  if (total >= 3) return '🤺';
  if (total >= 1) return '🗡️🧒';
  return '🧒';
}

// ===== ⚔️ ボス問題バンク（中3 展開と因数分解）=====
const SG_BOSS_QUESTIONS = {
  // ボス1（マス50）：展開
  1: [
    { q:'(x+3)(x+2) を展開すると？',   choices:['x²+5x+6','x²+6x+6','x²+5x+5','x²+6x+5'],    ans:0 },
    { q:'(x+5)² を展開すると？',        choices:['x²+5x+25','x²+25x+10','x²+10x+25','x²+10x+5'], ans:2 },
    { q:'(x−3)² を展開すると？',        choices:['x²+6x+9','x²−6x−9','x²−3x+9','x²−6x+9'],   ans:3 },
    { q:'(x+4)(x−4) を展開すると？',   choices:['x²−8','x²+16','x²−4','x²−16'],             ans:3 },
    { q:'(x−4)(x+1) を展開すると？',   choices:['x²+3x−4','x²−3x−4','x²−3x+4','x²−5x−4'],  ans:1 },
    { q:'(x+6)(x−2) を展開すると？',   choices:['x²+4x−12','x²−4x−12','x²+4x+12','x²−4x+12'], ans:0 },
    { q:'(x+7)(x+1) を展開すると？',   choices:['x²+7x+7','x²+8x+8','x²+8x+7','x²+7x+8'],   ans:2 },
    { q:'(x−2)(x−5) を展開すると？',   choices:['x²+7x+10','x²−7x−10','x²+7x−10','x²−7x+10'], ans:3 },
  ],
  // ボス2（マス100）：因数分解
  2: [
    { q:'x²+7x+12 を因数分解すると？', choices:['(x+2)(x+6)','(x+3)(x+4)','(x+1)(x+12)','(x+3)(x+5)'], ans:1 },
    { q:'x²−9 を因数分解すると？',     choices:['(x−3)²','(x+3)²','(x+3)(x−3)','(x−9)(x+1)'],        ans:2 },
    { q:'x²+6x+9 を因数分解すると？', choices:['(x+3)²','(x+3)(x−3)','(x−3)²','(x+9)(x+1)'],          ans:0 },
    { q:'x²−5x+6 を因数分解すると？', choices:['(x+2)(x−3)','(x−1)(x−6)','(x−2)(x+3)','(x−2)(x−3)'],  ans:3 },
    { q:'x²+4x−12 を因数分解すると？',choices:['(x+6)(x−2)','(x−6)(x+2)','(x+4)(x−3)','(x−4)(x+3)'],  ans:0 },
    { q:'x²−4x+4 を因数分解すると？', choices:['(x+2)²','(x−2)(x+2)','(x−2)²','(x−4)(x+1)'],          ans:2 },
    { q:'x²+3x−10 を因数分解すると？',choices:['(x+5)(x−2)','(x−5)(x+2)','(x+3)(x−4)','(x+2)(x+5)'],  ans:0 },
    { q:'x²−16 を因数分解すると？',   choices:['(x−4)²','(x+4)²','(x−16)(x+1)','(x+4)(x−4)'],          ans:3 },
  ],
  // ボス3（マス150）：展開・因数分解 混合
  3: [
    { q:'x²−8x+15 を因数分解すると？',  choices:['(x−3)(x+5)','(x+3)(x−5)','(x−3)(x−5)','(x−1)(x−15)'], ans:2 },
    { q:'(2x+3)(2x−3) を展開すると？', choices:['4x²+9','4x²−9','2x²−9','4x²−12x−9'],                    ans:1 },
    { q:'x²−2x−15 を因数分解すると？', choices:['(x+3)(x−5)','(x−3)(x+5)','(x−3)(x−5)','(x+5)(x+3)'],   ans:0 },
    { q:'x²+4x+4 を因数分解すると？',  choices:['(x+4)²','(x+2)(x−2)','(x+2)²','(x+4)(x+1)'],            ans:2 },
    { q:'x²−x−6 を因数分解すると？',   choices:['(x+2)(x−3)','(x−2)(x+3)','(x+3)(x−2)','(x−1)(x+6)'],   ans:1 },
    { q:'(x+3)² を展開すると？',        choices:['x²+3x+9','x²+9x+6','x²+6x+9','x²+6x+6'],                ans:2 },
    { q:'x²+5x−14 を因数分解すると？', choices:['(x+7)(x−2)','(x−7)(x+2)','(x+5)(x−3)','(x+2)(x+7)'],   ans:0 },
    { q:'(x−5)(x+5) を展開すると？',   choices:['x²+25','x²−5x−25','x²+5x−25','x²−25'],                  ans:3 },
  ],
};

// ===== 🚪 関門 状態変数 =====
let sgGateV2Pos = null;  // 49 | 99 | 149

// ===== ⚔️ ボスバトル 状態変数 =====
let sgBossSquare    = null;  // 50 | 100 | 150
let sgBossQList     = [];    // 今回の5問
let sgBossQIndex    = 0;     // 現在の問題番号（0-4）
let sgBossAllPassed = true;  // 全問正解フラグ
let sgBossTimer     = null;  // setInterval ID
let sgBossTimeLeft  = 5;     // 残り秒数
let sgBossAnswered  = false; // 現問題を回答済みか

// ===== ⚔️ ボスバトル 関数 =====
function sgStartBoss(pos) {
  sgBossSquare = pos;
  const tier = pos === 50 ? 1 : pos === 100 ? 2 : 3;
  const pool  = [...SG_BOSS_QUESTIONS[tier]].sort(() => Math.random() - 0.5);
  sgBossQList = pool.slice(0, 5);
  sgBossQIndex = 0; sgBossAllPassed = true;
  sgPhase = 'boss';
  renderSugoroku();
  sgBossShowQuestion();
}
function sgBossShowQuestion() {
  if (sgBossTimer) { clearInterval(sgBossTimer); sgBossTimer = null; }
  sgBossTimeLeft = 5; sgBossAnswered = false;
  document.getElementById('sg-boss-overlay')?.remove();
  const q   = sgBossQList[sgBossQIndex];
  const cur = sgBossQIndex + 1;
  const tot = sgBossQList.length;
  const ov  = document.createElement('div');
  ov.id = 'sg-boss-overlay'; ov.className = 'sg-boss-overlay';
  ov.innerHTML = _sgBossQHtml(q, cur, tot, sgBossTimeLeft);
  document.body.appendChild(ov);
  sgBossTimer = setInterval(() => {
    sgBossTimeLeft--;
    const te = document.getElementById('sg-boss-timer');     if (te) te.textContent = sgBossTimeLeft;
    const be = document.getElementById('sg-boss-tbar');
    if (be) be.style.width = `${(sgBossTimeLeft / 5) * 100}%`;
    if (sgBossTimeLeft <= 0 && !sgBossAnswered) {
      clearInterval(sgBossTimer); sgBossTimer = null;
      sgBossOnAnswer(false, null);
    }
  }, 1000);
}
function _sgBossQHtml(q, cur, tot, t) {
  const choices = q.choices.map((c, i) =>
    `<button class="sg-boss-choice" onclick="sgBossAnswer(${i})">${['Ａ','Ｂ','Ｃ','Ｄ'][i]}. ${c}</button>`
  ).join('');
  return `
    <div class="sg-boss-hd">
      <span class="sg-boss-tag">⚔️ ボス${sgBossSquare}</span>
      <span class="sg-boss-prog">${cur} / ${tot} 問</span>
      <span class="sg-boss-tc">⏱ <span id="sg-boss-timer">${t}</span>秒</span>
    </div>
    <div class="sg-boss-tbar-wrap"><div id="sg-boss-tbar" class="sg-boss-tbar" style="width:100%"></div></div>
    <div class="sg-boss-q">${q.q}</div>
    <div class="sg-boss-choices">${choices}</div>
  `;
}
function sgBossAnswer(idx) {
  if (sgBossAnswered) return;
  sgBossAnswered = true;
  if (sgBossTimer) { clearInterval(sgBossTimer); sgBossTimer = null; }
  sgBossOnAnswer(idx === sgBossQList[sgBossQIndex].ans, idx);
}
function sgBossOnAnswer(correct, selectedIdx) {
  const q  = sgBossQList[sgBossQIndex];
  const ov = document.getElementById('sg-boss-overlay');
  if (!ov) return;
  const btns = ov.querySelectorAll('.sg-boss-choice');
  btns.forEach((b, i) => {
    b.disabled = true;
    if (i === q.ans) b.classList.add('sg-boss-correct');
    else if (selectedIdx !== null && i === selectedIdx) b.classList.add('sg-boss-wrong');
  });
  if (correct) {
    setTimeout(() => {
      sgBossQIndex++;
      if (sgBossQIndex >= sgBossQList.length) sgBossSuccess();
      else sgBossShowQuestion();
    }, 700);
  } else {
    const msg = document.createElement('div');
    msg.className = 'sg-boss-fail-msg';
    msg.textContent = selectedIdx === null ? '⏰ 時間切れ！' : '❌ 不正解…';
    ov.appendChild(msg);
    setTimeout(sgBossFail, 1500);
  }
}
function sgBossSuccess() {
  if (sgBossTimer) { clearInterval(sgBossTimer); sgBossTimer = null; }
  document.getElementById('sg-boss-overlay')?.remove();
  const save = ensureSgInit();
  save[`boss${sgBossSquare}Cleared`] = true;
  save.digAnyActive = false; // ボスクリアでどこでも掘るを無効化
  setSgSave(save);
  if (sgBossSquare === 150) {
    if (hasAllBalls()) {
      save.cleared = true;
      if (!save.stage2BonusPaid) { save.peas += 50; save.stage2BonusPaid = true; }
      setSgSave(save);
      showSpaceOv('🏆','ステージ2クリア！','5色球コンプリート！\n🌱×50プレゼント！', 3500, () => {
        sgMsg='🏆 ステージ2クリア！完全制覇！おめでとう！🌱×50ゲット！'; sgMsgType='good';
        sgBossSquare=null; sgPhase='idle'; renderSugoroku();
      });
    } else {
      showSpaceOv('⚔️','ボスクリア！','ゴール地点到達！\nでも球がまだ揃っていない…\n球を5色集めて戻ってきて！', 2500, () => {
        sgMsg='⚔️ ボス150クリア！球を5色集めれば自動クリア！'; sgMsgType='info';
        sgBossSquare=null; sgPhase='idle'; renderSugoroku();
      });
    }
  } else {
    showSpaceOv('⚔️','ボスクリア！！','先へ進め！', 2000, () => {
      sgMsg=`⚔️ ボス${sgBossSquare}クリア！先へ進もう！`; sgMsgType='good';
      sgBossSquare=null; sgPhase='idle'; renderSugoroku();
    });
  }
}
function sgBossFail() {
  if (sgBossTimer) { clearInterval(sgBossTimer); sgBossTimer = null; }
  document.getElementById('sg-boss-overlay')?.remove();
  sgBossSquare = sgBossSquare; // keep position
  sgPhase = 'bossWait';
  sgMsg = `⚔️ ボス失敗…🌱×10で再挑戦できます`; sgMsgType = 'bad';
  renderSugoroku();
}
// ===== 🚪 関門を開ける =====
function sgOpenGateV2() {
  if (sgPhase !== 'gateV2' || !sgGateV2Pos) return;
  if (!hasAllBalls()) {
    sgMsg='球が5色揃っていません！'; sgMsgType='bad'; renderSugoroku(); return;
  }
  const sv = ensureSgInit();
  // 各色から1個ずつ消費（複数持っていたら残りは保持）
  BALL_COLORS.forEach(c => { if ((sv.balls[c]||0) > 0) sv.balls[c]--; });
  sv[`gate${sgGateV2Pos}Opened`] = true;
  setSgSave(sv);
  showSpaceOv('🚪✨','関門が開いた！','球を1個ずつ消費しました！\n先へ進もう！', 2000, () => {
    sgMsg=`🚪 マス${sgGateV2Pos}の関門を突破！先へ進もう！`; sgMsgType='good';
    sgGateV2Pos=null; sgPhase='idle'; renderSugoroku();
  });
}

function sgBossRetry() {
  const sv = ensureSgInit();
  if (sv.peas < 10) return;
  spendSgPeas(10);
  sgStartBoss(sgBossSquare);
}

// ===== モンスター問題バンク（式の乗法・除法）=====
const MONSTER_QUESTIONS = [
  { q: '(x+3)(x+5) を展開すると？',   choices: ['x²+8x+15', 'x²+15x+8', 'x²+8x+8',  'x²+15'],      ans: 0 },
  { q: '(x+4)² を展開すると？',        choices: ['x²+16',    'x²+4x+16', 'x²+8x+16', 'x²+8x+8'],    ans: 2 },
  { q: '(x+6)(x−6) を展開すると？',   choices: ['x²+36',    'x²−36',    'x²−12x−36','x²+12x+36'], ans: 1 },
  { q: '(x−3)² を展開すると？',        choices: ['x²+6x+9',  'x²−9',     'x²−6x−9',  'x²−6x+9'],   ans: 3 },
  { q: '(x+2)(x−7) を展開すると？',   choices: ['x²−5x+14', 'x²+5x−14', 'x²−5x−14', 'x²+5x+14'],  ans: 2 },
  { q: '(2x+3)(x+1) を展開すると？',  choices: ['2x²+5x+3', '2x²+4x+3', '2x²+3x+3', '2x²+5x+1'],  ans: 0 },
  { q: '(a+b)² を展開すると？',        choices: ['a²+b²',    'a²+2ab+b²','a²−2ab+b²','a²+ab+b²'],  ans: 1 },
  { q: '(a+b)(a−b) を展開すると？',   choices: ['a²+b²',    'a²+2ab−b²','a²−2ab−b²','a²−b²'],     ans: 3 },
  { q: '6x²y ÷ 3x を計算すると？',    choices: ['2xy',       '3xy',       '2x²y',     '2y'],          ans: 0 },
  { q: '(3a)² を計算すると？',          choices: ['6a²',       '3a²',       '9a',        '9a²'],         ans: 3 },
  { q: '4ab ÷ 2b を計算すると？',      choices: ['2b',        '2a',        '4a',        '2ab'],         ans: 1 },
  { q: '(x−2)(x+9) を展開すると？',   choices: ['x²+7x−18', 'x²−7x−18', 'x²+7x+18', 'x²−7x+18'],  ans: 0 },
  { q: '2a(3a−b) を展開すると？',      choices: ['6a²−2ab',  '6a²+2ab',  '6a−2ab',   '6a²−2b'],    ans: 0 },
  { q: '(x−5)² を展開すると？',        choices: ['x²+25',    'x²−25',    'x²−10x+25','x²+10x+25'], ans: 2 },
  { q: '12x³y ÷ 4xy を計算すると？',  choices: ['3x²',       '3xy',       '4x²',       '3x²y'],        ans: 0 },
];

let sgMonsterQ   = null;
let _sgMonsterDone = null;
let _sgDropDone    = null;

// ===== ④ 特殊マス効果オーバーレイ（自動消去） =====
function showSpaceOv(icon, title, sub, ms, onComplete) {
  document.querySelector('.sg-space-ov')?.remove();
  const ov = document.createElement('div');
  ov.className = 'sg-space-ov';
  ov.innerHTML = `
    <div class="sg-sp-ov-icon">${icon}</div>
    <div class="sg-sp-ov-title">${title}</div>
    ${sub ? `<div class="sg-sp-ov-sub">${sub}</div>` : ''}
  `;
  document.body.appendChild(ov);
  setTimeout(() => { ov.remove(); onComplete(); }, ms || 1200);
}

// ===== ③ モンスターオーバーレイ =====
function showMonsterOverlay(onDone) {
  _sgMonsterDone = onDone;
  sgMonsterQ = MONSTER_QUESTIONS[Math.floor(Math.random() * MONSTER_QUESTIONS.length)];
  document.getElementById('sg-monster-overlay')?.remove();
  const ov = document.createElement('div');
  ov.id = 'sg-monster-overlay';
  ov.className = 'sg-monster-overlay';
  ov.innerHTML = _monsterQuestionHtml(sgMonsterQ);
  document.body.appendChild(ov);
}
function _monsterQuestionHtml(q) {
  const choices = q.choices.map((c, i) =>
    `<button class="sg-mq-choice" onclick="sgMonsterAnswer(${i})">${c}</button>`
  ).join('');
  return `
    <div class="sg-monster-ov-icon">👾</div>
    <div class="sg-monster-ov-title">モンスター出現！</div>
    <div class="sg-monster-ov-q">${q.q}</div>
    <div class="sg-monster-ov-choices">${choices}</div>
  `;
}
function sgMonsterAnswer(idx) {
  const q  = sgMonsterQ;
  const ov = document.getElementById('sg-monster-overlay');
  if (!ov) return;
  if (idx === q.ans) {
    // 正解 → 好きな球を1つ選ぶ
    const ballBtns = BALL_COLORS.map(c =>
      `<button class="sg-ball-pick-btn" onclick="sgMonsterPickBall('${c}')">${BALL_EMOJI[c]}<span>${BALL_NAME[c]}</span></button>`
    ).join('');
    ov.innerHTML = `
      <div class="sg-monster-ov-icon">✨</div>
      <div class="sg-monster-ov-title sg-mq-correct">正解！</div>
      <div class="sg-monster-ov-sub">好きな球を1つ選べ！</div>
      <div class="sg-ball-pick-row">${ballBtns}</div>
    `;
  } else {
    // ① 不正解 → 球を1つ失う
    const lost = removeBallRandom();
    let lostMsg;
    if (lost) {
      lostMsg = `${BALL_EMOJI[lost]} ${BALL_NAME[lost]}の球を取られた…`;
      sgMsg = `👾 不正解！${BALL_EMOJI[lost]}${BALL_NAME[lost]}の球を取られた！`; sgMsgType = 'bad';
    } else {
      lostMsg = '…球を持っていないので助かった！';
      sgMsg = '👾 不正解！（球を持っていないので失わずに済んだ）'; sgMsgType = 'info';
    }
    ov.innerHTML = `
      <div class="sg-monster-ov-icon">💀</div>
      <div class="sg-monster-ov-title sg-mq-wrong">不正解…</div>
      <div class="sg-monster-ov-sub">正解は「${q.choices[q.ans]}」<br>${lostMsg}</div>
      <button class="sg-dig-ov-continue" onclick="sgMonsterClose()">続ける</button>
    `;
  }
}
function sgMonsterPickBall(color) {
  addBall(color);
  sgMsg = `✨ 正解！${BALL_EMOJI[color]}${BALL_NAME[color]}の球をゲット！`; sgMsgType = 'good';
  sgMonsterClose();
}
function sgMonsterClose() {
  document.getElementById('sg-monster-overlay')?.remove();
  sgMonsterQ = null;
  const done = _sgMonsterDone; _sgMonsterDone = null;
  if (done) done();
}

// ===== ⑤ 球落としオーバーレイ =====
function showDropBallOverlay(onDone) {
  _sgDropDone = onDone;
  const lost = removeBallRandom();
  let icon, title, sub;
  if (lost) {
    icon  = BALL_EMOJI[lost];
    title = '球を落とした！';
    sub   = `${BALL_NAME[lost]}の球を失った…`;
    sgMsg = `💀 ${BALL_EMOJI[lost]}${BALL_NAME[lost]}の球を落としてしまった…`; sgMsgType = 'bad';
  } else {
    icon  = '🕳';
    title = '球を落とした！';
    sub   = '…でも球を持っていなかった！';
    sgMsg = '💀 球落としマス！（持っていないので助かった）'; sgMsgType = 'info';
  }
  document.getElementById('sg-drop-overlay')?.remove();
  const ov = document.createElement('div');
  ov.id = 'sg-drop-overlay';
  ov.className = 'sg-drop-overlay';
  ov.innerHTML = `
    <div class="sg-drop-ov-icon">${icon}</div>
    <div class="sg-drop-ov-title">${title}</div>
    <div class="sg-drop-ov-sub">${sub}</div>
    <button class="sg-dig-ov-continue" onclick="sgDropBallClose()">続ける</button>
  `;
  document.body.appendChild(ov);
}
function sgDropBallClose() {
  document.getElementById('sg-drop-overlay')?.remove();
  const done = _sgDropDone; _sgDropDone = null;
  if (done) done();
}

// ===== リセット =====
function sgReset() {
  const label = sgStage === 2 ? 'ステージ2のデータ' : 'データ';
  if (!confirm(`${label}をリセットして最初からやり直しますか？\n（グリンピース・球・進捗がすべて消えます）`)) return;
  document.getElementById('sg-dice-overlay')?.remove();
  document.getElementById('sg-dig-overlay')?.remove();
  document.getElementById('sg-boss-overlay')?.remove();
  if (sgStage === 2) {
    localStorage.removeItem(SG_SAVE_KEY_V2);
  } else {
    localStorage.removeItem(SG_SAVE_KEY);
  }
  sgPhase = 'idle'; sgMsg = ''; sgMsgType = 'info';
  sgDiceVal = null; sgPendingRoll = null;
  sgFreeRoll = false; sgBonusDir = null;
  sgDigSpaceNum = null; sgDigResult = null; sgDigBallColor = null;
  sgExchangeGive = null;
  sgStarActive = false; sgStarExchangeGive = null;
  sgBossSquare = null; sgBossQList = []; sgBossQIndex = 0;
  if (sgBossTimer) { clearInterval(sgBossTimer); sgBossTimer = null; }
  sgDisplayPos = null; sgIsAnimating = false;
  renderSugoroku();
}

// ===== ゲーム状態 =====
// idle | rolling | digChoice | digAnySelect | digging | digResult | exchange | bonusRoll | starExchange | gateV2
let sgPhase        = 'idle';
let sgMsg          = '';
let sgMsgType      = 'info';
let sgDiceVal      = null;
let sgPendingRoll  = null;
let sgFreeRoll     = false;
let sgBonusDir     = null;   // 'forward' | 'back'
let sgDigSpaceNum  = null;
let sgDigResult    = null;   // 'ball' | 'nothing' | 'lost'
let sgDigBallColor = null;
let sgExchangeGive     = null;
let sgStarActive       = false;  // ⭐マス滞在中フラグ
let sgStarExchangeGive = null;   // ⭐交換所で渡す球の色
let sgDiceAnimInterval = null;

// ③ 一歩ずつアニメーション
let sgDisplayPos  = null;
let sgIsAnimating = false;

// ===== サイコロを振る =====
function sgRoll() {
  const save = ensureSgInit();
  if (save.cleared || sgPhase !== 'idle' || sgPhase === 'bossWait' || sgIsAnimating) return;
  sgStarActive = false; sgStarExchangeGive = null;  // ⭐メニューを閉じる

  // 1回休み中：🌱×10で解除＋そのままロール（合計10個）
  if (save.skipNext) {
    if (!sgFreeRoll) {
      if (save.peas < 10) {
        sgMsg = '💤 1回休み中。解除するには🌱×10必要です。'; sgMsgType = 'bad';
        renderSugoroku(); return;
      }
      spendSgPeas(10);
    }
    const s = ensureSgInit();
    s.skipNext = false; setSgSave(s);
    sgFreeRoll = true; // 解除費用でロールも兼ねる
  }

  // グリンピースチェック（通常ロール）
  if (!sgFreeRoll) {
    if (save.peas < 10) {
      sgMsg = '🌱 グリンピースが足りません（10個必要）'; sgMsgType = 'bad';
      renderSugoroku(); return;
    }
    spendSgPeas(10);
  }
  sgFreeRoll = false;

  // アニメーション開始
  sgPendingRoll = Math.floor(Math.random()*6)+1;
  sgPhase = 'rolling';
  renderSugoroku(); // → startSgDiceAnimation() が呼ばれる
}

// ===== ④ 3Dサイコロ =====
const DICE_DOT_POS = {
  1: [5],
  2: [3, 7],
  3: [3, 5, 7],
  4: [1, 3, 7, 9],
  5: [1, 3, 5, 7, 9],
  6: [1, 3, 4, 6, 7, 9],
};
// cube を各面が見えるように回すための [rotateX, rotateY]
const DICE_3D_ROT = { 1:[0,0], 2:[0,-90], 3:[90,0], 4:[-90,0], 5:[0,90], 6:[0,180] };

function sgDiceFaceHtml(n) {
  const on = DICE_DOT_POS[n];
  let grid = '';
  for (let i = 1; i <= 9; i++) {
    grid += `<div class="sg-dot${on.includes(i) ? ' sg-dot-on' : ''}"></div>`;
  }
  return `<div class="sg-die-face sg-df-${n}"><div class="sg-dot-grid">${grid}</div></div>`;
}

// label: オーバーレイに表示するテキスト, onComplete(roll): アニメーション後に呼ばれるコールバック
function startSgDiceAnimation(label, onComplete) {
  label      = label      || '🎲 サイコロを振っています…';
  onComplete = onComplete || (roll => { sgDiceVal=roll; sgPhase='idle'; sgExecuteRoll(roll); });

  // 全画面オーバーレイを作成
  const overlay = document.createElement('div');
  overlay.id = 'sg-dice-overlay';
  overlay.className = 'sg-dice-overlay';
  const faces = [1,2,3,4,5,6].map(sgDiceFaceHtml).join('');
  overlay.innerHTML = `
    <div class="sg-dice-3d-wrap-lg">
      <div class="sg-die-3d sg-die-3d-lg" id="sg-3d-die">${faces}</div>
    </div>
    <div class="sg-rolling-label-lg">${label}</div>
  `;
  document.body.appendChild(overlay);

  const el = document.getElementById('sg-3d-die');
  if (!el) {
    overlay.remove();
    onComplete(sgPendingRoll); return;
  }
  const [rx, ry] = DICE_3D_ROT[sgPendingRoll];

  // ランダムな初期向きを設定（transition なし）
  el.style.transition = 'none';
  el.style.transform  = `rotateX(${30+Math.random()*40}deg) rotateY(${Math.random()*60}deg)`;
  // reflow を強制
  void el.offsetWidth;

  // 2回転 + 目標面へアニメーション
  const finalX = 720 + rx;
  const finalY = 720 + ry;
  el.style.transition = 'transform 1.1s cubic-bezier(0.25,0.46,0.45,0.94)';
  el.style.transform  = `rotateX(${finalX}deg) rotateY(${finalY}deg)`;

  setTimeout(() => {
    document.getElementById('sg-dice-overlay')?.remove();
    onComplete(sgPendingRoll);
  }, 1300);
}

// ===== ③ 一歩ずつ移動パス =====
function sgBuildMovePath(fromPos, roll) {
  const maxPos = sgCurrentMax();
  const target = fromPos + roll;
  const path = [];
  if (target <= maxPos) {
    for (let p = fromPos + 1; p <= target; p++) path.push(p);
  } else {
    for (let p = fromPos + 1; p <= maxPos; p++) path.push(p);
    const over = target - maxPos;
    for (let p = maxPos - 1; p >= maxPos - over; p--) path.push(p);
  }
  return path;
}

function sgAnimateAlongPath(path, onComplete) {
  if (!path.length) { onComplete(); return; }
  sgIsAnimating = true;
  let i = 0;
  function tick() {
    if (i >= path.length) {
      sgDisplayPos = null; sgIsAnimating = false; onComplete(); return;
    }
    sgDisplayPos = path[i++];
    const boardEl = document.querySelector('.sg-path-area');
    if (boardEl) boardEl.innerHTML = renderSgBoardGrid(sgDisplayPos);
    setTimeout(tick, 380);
  }
  tick();
}

// ===== ② 門チェック =====
// path を進む際に門があれば手前で止める
function sgTrimPathAtGate(fromPos, path) {
  if (hasAllBalls()) return { path, blocked: false }; // 5色揃い → 通過OK

  const save = ensureSgInit();
  // 常時アクティブな門（80→81）＋ 動的な門
  const gates = [
    { crossAt: 81, stopAt: 80 },
    ...(save.gate85Active ? [{ crossAt: 86, stopAt: 85 }] : []),
    ...(save.gate90Active ? [{ crossAt: 91, stopAt: 90 }] : []),
  ];

  for (const gate of gates) {
    for (let i = 0; i < path.length; i++) {
      if (path[i] === gate.crossAt) {
        const prev = i === 0 ? fromPos : path[i - 1];
        if (prev < gate.crossAt) {
          // 前進で門に到達 → 手前で停止
          let trimmed = path.slice(0, i);
          if (!trimmed.length || trimmed[trimmed.length - 1] !== gate.stopAt) {
            trimmed.push(gate.stopAt);
          }
          return {
            path: trimmed, blocked: true, stopAt: gate.stopAt,
            msg: `🚪 門！5色の球が揃っていないとマス${gate.stopAt + 1}へは進めない！（マス${gate.stopAt}で止まった）`,
          };
        }
      }
    }
  }
  return { path, blocked: false };
}

function sgExecuteRoll(roll) {
  const save   = ensureSgInit();
  const oldPos = save.pos;
  const maxPos = sgCurrentMax();
  let   newPos = oldPos + roll;
  let   bounced = false;
  let   willTouchGoal = false;

  // ゴールはピッタリ：オーバーしたら折り返し
  if (newPos > maxPos) {
    bounced = true;
    newPos  = maxPos - (newPos - maxPos);
    willTouchGoal = true;
  } else if (newPos === maxPos) {
    willTouchGoal = true;
  }

  const rawPath = sgBuildMovePath(oldPos, roll);

  // ★ ステージ2：関門＋ボスの統合ブロック処理
  if (sgStage === 2) {
    const sv2 = ensureSgInit();
    const originalDest = oldPos + roll; // バウンス前の到達予定マス
    // ブロック候補をマス順に並べる（関門は未開放のみ・ボスは常時）
    const blocks = [
      { pos: 49,  active: !sv2.gate49Opened  },
      { pos: 50,  active: true },
      { pos: 99,  active: !sv2.gate99Opened  },
      { pos: 100, active: true },
      { pos: 149, active: !sv2.gate149Opened },
      { pos: 150, active: true },
    ].filter(b => b.active && b.pos > oldPos);

    for (const block of blocks) {
      const bp = block.pos;
      if (originalDest >= bp) {
        // ちょうどピッタリ着地（バウンスなし）→ 通常 applySpaceEffect に任せる
        if (originalDest === bp && !bounced) break;
        // 通り過ぎ or バウンス → bp で強制停止
        const bPath = [];
        for (let p = oldPos + 1; p <= bp; p++) bPath.push(p);
        sgAnimateAlongPath(bPath, () => {
          moveSgTo(bp);
          applySpaceEffect(bp, () => renderSugoroku());
        });
        return;
      }
      break; // このブロックより先には届かない
    }
  }

  // ステージ1：門チェック
  if (sgStage === 1) {
    const gateResult = sgTrimPathAtGate(oldPos, rawPath);
    if (gateResult.blocked) {
      sgAnimateAlongPath(gateResult.path, () => {
        moveSgTo(gateResult.stopAt);
        sgMsg = gateResult.msg; sgMsgType = 'bad'; sgPhase = 'idle';
        renderSugoroku();
      });
      return;
    }
  }

  // touchedGoal を保存
  if (willTouchGoal) {
    const s = ensureSgInit(); s.touchedGoal = true; setSgSave(s);
  }

  // passedGate1 チェック（ステージ1のみ）
  const crossingGate1 = sgStage === 1 && oldPos <= 80 && newPos >= 81;

  sgAnimateAlongPath(rawPath, () => {
    moveSgTo(newPos);

    if (crossingGate1) {
      const s = ensureSgInit();
      if (!s.passedGate1) { s.passedGate1 = true; setSgSave(s); }
    }

    // ステージ1ゴール（ステージ2は applySpaceEffect の 'boss' ケースで処理）
    if (sgStage === 1 && newPos === maxPos && !bounced) {
      if (hasAllBalls()) {
        const s = ensureSgInit(); s.cleared = true;
        if (!s.stage1BonusPaid) { s.peas += 30; s.stage1BonusPaid = true; }
        setSgSave(s);
        sgMsg = `🎲 ${roll} が出た！ 🏆 ゴール！おめでとう！🌱×30ゲット！`;
        sgMsgType = 'good'; sgPhase = 'idle';
      } else {
        sgMsg = `🎲 ${roll} が出た！ ゴール到着！でも球が揃っていない…まず球を集めよう！`;
        sgMsgType = 'info'; sgPhase = 'idle';
      }
      renderSugoroku(); return;
    }
    if (bounced) {
      sgMsg = `🎲 ${roll} が出た！ ゴールを超えてマス${newPos}に折り返し！`;
      sgMsgType = 'info'; sgPhase = 'idle';
      renderSugoroku(); return;
    }
    applySpaceEffect(newPos, () => renderSugoroku());
  });
}

// ボーナスロール（rollAndForward / rollAndBack）
function sgBonusRoll() {
  if (sgPhase !== 'bonusRoll') return;
  sgPendingRoll = Math.floor(Math.random()*6)+1;
  const label = sgBonusDir === 'forward' ? '🎲 ボーナス！振って進む！' : '🎲 ボーナス！振って戻る…';
  startSgDiceAnimation(label, roll => {
    sgDiceVal = roll;
    const save = ensureSgInit();
    const old  = save.pos;
    const maxPos = sgCurrentMax();
    let dest, path;
    if (sgBonusDir === 'forward') {
      const target = old + roll;
      if (target > maxPos) {
        dest = maxPos - (target - maxPos);
        const s = ensureSgInit(); s.touchedGoal = true; setSgSave(s);
      } else {
        dest = target;
      }
      path = sgBuildMovePath(old, roll);
      sgMsg = `🎲 ボーナス：${roll} が出た！ マス${old}→マス${dest}へ進む！`;
      sgMsgType = 'good';
    } else {
      dest = Math.max(old - roll, 0);
      path = [];
      for (let p = old - 1; p >= dest; p--) path.push(p);
      sgMsg = `🎲 ボーナス：${roll} が出た！ マス${old}→マス${dest}へ戻る…`;
      sgMsgType = 'bad';
    }
    sgBonusDir = null;
    sgPhase    = 'idle';
    sgAnimateAlongPath(path, () => { moveSgTo(dest); applySpaceEffect(dest, () => renderSugoroku()); });
  });
}

// ===== マス効果（② 進む・戻る・ワープも一歩ずつアニメーション）=====
function applySpaceEffect(pos, onDone) {
  onDone = onDone || (() => {});
  const save  = ensureSgInit();
  const space = sgCurrentSpaces()[pos];
  if (!space) { onDone(); return; }

  switch (space.type) {
    case 'normal':
      sgMsg = `マス${pos}に到着。`; sgMsgType = 'info'; onDone(); break;

    case 'forward': {
      const n = space.param||1;
      let dest = pos + n;
      const maxP = sgCurrentMax();
      const s = ensureSgInit();
      if (dest > maxP) { s.touchedGoal=true; setSgSave(s); dest = maxP-(dest-maxP); }
      const fwdPath = sgBuildMovePath(pos, n);
      // ① 全画面表示してからアニメーション → ② 着地先の効果も発動
      showSpaceOv('⬆', `さらに${n}マス進む！`, `マス${pos} → マス${dest}`, 1200, () => {
        sgMsg = `⬆ ${n}マス進む！ マス${pos}→マス${dest}`; sgMsgType='good';
        renderSugoroku();
        sgAnimateAlongPath(fwdPath, () => { moveSgTo(dest); onDone(); });
      });
      break;
    }
    case 'rollAndForward':
      showSpaceOv('🎲⬆', '振って進む！', 'サイコロを振ってその分進む！', 1000, () => {
        sgBonusDir='forward'; sgPhase='bonusRoll'; onDone();
      }); break;

    case 'back': {
      const n = space.param||1;
      const dest = Math.max(pos-n, 0);
      const bkPath = [];
      for (let p = pos-1; p >= dest; p--) bkPath.push(p);
      // ① 全画面表示してからアニメーション → ② 着地先の効果も発動
      showSpaceOv('⬇', `${n}マス戻る…`, `マス${pos} → マス${dest}`, 1200, () => {
        sgMsg=`⬇ ${n}マス戻る… マス${pos}→マス${dest}`; sgMsgType='bad';
        renderSugoroku();
        sgAnimateAlongPath(bkPath, () => { moveSgTo(dest); onDone(); });
      });
      break;
    }
    case 'rollAndBack':
      showSpaceOv('🎲⬇', '振って戻る…', 'サイコロを振ってその分戻る…', 1000, () => {
        sgBonusDir='back'; sgPhase='bonusRoll'; onDone();
      }); break;

    case 'again':
      showSpaceOv('🎲', 'もう一度！', 'もう一回サイコロを振れる！', 1200, () => {
        sgMsg='🎲 もう一度サイコロを振ろう！'; sgMsgType='good'; sgFreeRoll=true; onDone();
      }); break;

    case 'rest':
      showSpaceOv('💤', '1回休み…', '次のターンはお休みです', 1400, () => {
        save.skipNext=true; setSgSave(save);
        sgMsg='💤 次のターンは1回休み…'; sgMsgType='bad'; onDone();
      }); break;

    case 'warp': {
      const dest = space.param;
      const wDir = dest > pos;
      showSpaceOv('🌀', wDir?'ワープ！':'落とし穴…', `マス${dest}へ${wDir?'飛ぶ！':'戻る…'}`, 1200, () => {
        sgMsg = wDir ? `🌀 ワープ！マス${dest}へ！` : `🌀 落とし穴…マス${dest}に戻った`;
        sgMsgType = wDir ? 'good' : 'bad';
        const wpPath = [];
        if (wDir) { for (let p=pos+1; p<=dest; p++) wpPath.push(p); }
        else       { for (let p=pos-1; p>=dest; p--) wpPath.push(p); }
        sgAnimateAlongPath(wpPath, () => { moveSgTo(dest); onDone(); });
      }); break;
    }
    case 'gate_spawn': {
      const key = pos === 85 ? 'gate85Active' : 'gate90Active';
      const s = ensureSgInit();
      if (!s[key]) {
        s[key] = true; setSgSave(s);
        showSpaceOv('🚪', '門が出現！', '5色の球が揃わないと先へ進めない！', 2000, () => {
          sgMsg = `🚪 門が出現！もう一度5色の球を集めよう！`; sgMsgType = 'bad'; onDone();
        });
      } else {
        sgMsg = `マス${pos}に到着。（門はすでに出現中）`; sgMsgType = 'info'; onDone();
      }
      break;
    }

    case 'monster':
      showSpaceOv('👾', 'モンスター出現！', '問題に正解すれば球をもらえる！', 1400, () => {
        showMonsterOverlay(onDone);
      }); break;

    case 'dropBall':
      showSpaceOv('💀', '球を落とした！', 'ここは危険なマス…', 1200, () => {
        showDropBallOverlay(onDone);
      }); break;

    case 'dig':
      sgMsg='⛏ 穴を掘れそう！'; sgMsgType='info';
      sgPhase='digChoice'; sgDigSpaceNum=pos; onDone(); break;

    case 'exchange':
      sgMsg='🔄 球の交換所！'; sgMsgType='info';
      sgExchangeGive=null; sgPhase='exchange'; onDone(); break;

    case 'star':
      showSpaceOv('⭐', 'ラッキースター！', '🌱×10で掘る or 交換所が使えます！', 2000, () => {
        sgStarActive = true;
        sgMsg='⭐ ラッキースター！何回でも使えるよ！'; sgMsgType='good';
        onDone();
      });
      break;

    case 'goal':
      if (hasAllBalls()) {
        const s=ensureSgInit(); s.cleared=true;
        if (!s.stage1BonusPaid) { s.peas+=30; s.stage1BonusPaid=true; }
        setSgSave(s);
        showSpaceOv('🏆','ゴール！おめでとう！','5色球コンプリート！🌱×30ゲット！', 3000, () => {
          sgMsg='🏆 ゴール！おめでとう！🌱×30もらった！'; sgMsgType='good'; onDone();
        });
      } else {
        showSpaceOv('🏆','ゴールに到着！','でも球が揃っていない…\nまず球を5色集めよう！', 2000, () => {
          sgMsg='ゴール！でも球が揃っていない…'; sgMsgType='info'; onDone();
        });
      }
      break;

    case 'gate_v2': {
      const sv = ensureSgInit();
      const gateKey = `gate${pos}Opened`;
      if (sv[gateKey]) {
        // 通過済み
        sgMsg = `マス${pos}に到着。（関門は通過済み）`; sgMsgType = 'info'; onDone();
        break;
      }
      // 初回：どこでも掘るを解放
      if (!sv.digAnyActive) { sv.digAnyActive = true; setSgSave(sv); }
      const hasBalls = hasAllBalls();
      if (hasBalls) {
        showSpaceOv('🚪', `関門 マス${pos}！`, '5色の球が揃っている！\n球を1個ずつ消費して門を開けよう！', 2500, () => {
          sgGateV2Pos = pos; sgPhase = 'gateV2'; onDone();
        });
      } else {
        showSpaceOv('🚪', `関門 マス${pos}！`, '5色の球を揃えないと通れない！\n「どこでも掘る」で球を集めよう！\n🌱×10で好きなマスを掘れます', 2800, () => {
          sgGateV2Pos = pos; sgPhase = 'gateV2'; onDone();
        });
      }
      break;
    }

    case 'boss': {
      const sv = ensureSgInit();
      if (!sv[`boss${pos}Cleared`]) {
        showSpaceOv('⚔️', `ボス${pos}登場！`, '5問全問正解で突破！\n1問でも間違えたら失敗…', 2000, () => {
          sgStartBoss(pos);
          onDone();
        });
      } else {
        // 既クリアのボスは素通り
        sgMsg = `マス${pos}に到着。（ボスはクリア済み）`; sgMsgType='info'; onDone();
      }
      break;
    }

    default:
      sgMsg=`マス${pos}に到着。`; sgMsgType='info'; onDone(); break;
  }
}

// ===== 掘る =====
function sgTryDig() {
  if (sgPhase!=='digChoice' && sgPhase!=='digAnySelect') return;
  // ③ どこでも掘るモードは🌱×10消費
  if (sgPhase==='digAnySelect') {
    const sv = ensureSgInit();
    if (sv.peas < 10) {
      sgMsg='🌱 グリンピースが足りません（掘るには🌱×10必要）'; sgMsgType='bad';
      sgPhase='idle'; renderSugoroku(); return;
    }
    spendSgPeas(10);
  }
  sgPhase='digging';
  renderSugoroku();

  // 全画面オーバーレイを作成
  const overlay = document.createElement('div');
  overlay.id = 'sg-dig-overlay';
  overlay.className = 'sg-dig-overlay';
  overlay.innerHTML = `
    <div class="sg-dig-ov-shovel">⛏</div>
    <div class="sg-dig-ov-ground">
      <span class="sg-dirt sg-dirt1">💨</span>
      <span class="sg-dirt sg-dirt2">💨</span>
      <span class="sg-dirt sg-dirt3">💨</span>
    </div>
    <div class="sg-dig-ov-msg">掘っています…</div>
  `;
  document.body.appendChild(overlay);

  setTimeout(() => {
    const r = Math.random();
    if (r < 0.70) {
      sgDigResult='ball';
      sgDigBallColor=getRandomBallColor();
      addBall(sgDigBallColor);
    } else if (r < 0.90) {
      sgDigResult='nothing'; sgDigBallColor=null;
    } else {
      const lost=removeBallRandom();
      sgDigResult='lost'; sgDigBallColor=lost;
    }
    sgPhase='digResult';

    // オーバーレイを結果表示に切り替え
    const ov = document.getElementById('sg-dig-overlay');
    if (ov) {
      let resultHtml, cls;
      if (sgDigResult==='ball') {
        resultHtml = `${BALL_EMOJI[sgDigBallColor]}<br><span>${BALL_NAME[sgDigBallColor]}の球を発見！</span>`;
        cls = 'sg-dig-ov-good';
      } else if (sgDigResult==='nothing') {
        resultHtml = `🕳<br><span>何もなかった…</span>`;
        cls = 'sg-dig-ov-nothing';
      } else {
        resultHtml = sgDigBallColor
          ? `${BALL_EMOJI[sgDigBallColor]}<br><span>${BALL_NAME[sgDigBallColor]}の球を落としてしまった…</span>`
          : `🕳<br><span>何もなかった…</span>`;
        cls = 'sg-dig-ov-bad';
      }
      ov.innerHTML = `
        <div class="sg-dig-ov-result ${cls}">${resultHtml}</div>
        <button class="sg-dig-ov-continue" onclick="sgFinishDig()">続ける</button>
      `;
    }
    renderSugoroku();
  }, 1500);
}

function sgFinishDig() {
  document.getElementById('sg-dig-overlay')?.remove();
  sgDigResult=null; sgDigBallColor=null; sgDigSpaceNum=null;
  // 関門マスにいる場合は gateV2 フェーズに戻す
  if (sgStage === 2) {
    const sv = ensureSgInit();
    const gp = [49,99,149].find(p => p === sv.pos && !sv[`gate${p}Opened`]);
    if (gp) { sgPhase='gateV2'; sgGateV2Pos=gp; renderSugoroku(); return; }
  }
  sgPhase='idle';
  renderSugoroku();
}

function sgDigAnyMode() {
  if (sgPhase !== 'idle' && sgPhase !== 'gateV2') return;
  const sv = ensureSgInit();
  if (sv.peas < 10) {
    sgMsg='🌱 グリンピースが足りません（掘るには🌱×10必要）'; sgMsgType='bad';
    renderSugoroku(); return;
  }
  sgPhase='digAnySelect';
  sgMsg='掘るマスをタップしてください（🌱×10消費）'; sgMsgType='info';
  renderSugoroku();
}
function sgSelectDigSpace(spaceNum) {
  if (sgPhase!=='digAnySelect') return;
  sgDigSpaceNum=spaceNum; sgTryDig();
}

// ===== 交換 =====
function sgSelectGive(color) {
  if ((ensureSgInit().balls[color]||0)<1) return;
  sgExchangeGive=color; renderSugoroku();
}
function sgDoExchange(toColor) {
  if (!sgExchangeGive||toColor===sgExchangeGive) return;
  const save=ensureSgInit();
  if ((save.balls[sgExchangeGive]||0)<1) return;
  save.balls[sgExchangeGive]--;
  save.balls[toColor]=(save.balls[toColor]||0)+1;
  setSgSave(save);
  sgMsg=`🔄 ${BALL_EMOJI[sgExchangeGive]}→${BALL_EMOJI[toColor]} 交換完了！`;
  sgMsgType='good'; sgExchangeGive=null; sgPhase='idle';
  renderSugoroku();
}
function sgSkipExchange() { sgExchangeGive=null; sgPhase='idle'; renderSugoroku(); }

// ===== ⭐ ラッキースター操作 =====
function sgStarEnterDig() {
  const sv = ensureSgInit();
  if (sv.peas < 10) {
    sgMsg='🌱 グリンピースが足りません（🌱×10必要）'; sgMsgType='bad';
    renderSugoroku(); return;
  }
  // peas消費はsgTryDig()内で行われる
  sgPhase='digAnySelect';
  sgMsg='⭐ 掘りたいマスをタップ！（🌱×10消費）'; sgMsgType='info';
  renderSugoroku();
}
function sgStarEnterExchange() {
  const sv = ensureSgInit();
  if (sv.peas < 10) {
    sgMsg='🌱 グリンピースが足りません（🌱×10必要）'; sgMsgType='bad';
    renderSugoroku(); return;
  }
  spendSgPeas(10);
  sgStarExchangeGive = null;
  sgPhase = 'starExchange';
  sgMsg='⭐ 交換所：渡す球を選んでね'; sgMsgType='info';
  renderSugoroku();
}
function sgStarSelectGive(color) {
  if ((ensureSgInit().balls[color]||0)<1) return;
  sgStarExchangeGive=color; renderSugoroku();
}
function sgStarDoExchange(toColor) {
  if (!sgStarExchangeGive||toColor===sgStarExchangeGive) return;
  const save=ensureSgInit();
  if ((save.balls[sgStarExchangeGive]||0)<1) return;
  save.balls[sgStarExchangeGive]--;
  save.balls[toColor]=(save.balls[toColor]||0)+1;
  setSgSave(save);
  sgMsg=`⭐🔄 ${BALL_EMOJI[sgStarExchangeGive]}→${BALL_EMOJI[toColor]} 交換完了！`;
  sgMsgType='good'; sgStarExchangeGive=null; sgPhase='idle';
  renderSugoroku();
}
function sgStarSkipExchange() {
  sgStarExchangeGive=null; sgPhase='idle'; renderSugoroku();
}

// ===== レンダー =====
function renderSugoroku() {
  // ステージ1クリア遡及ボーナス（更新後初回のみ）
  if (sgStage === 1) {
    const _sv = ensureSgInit();
    if (_sv.cleared && _sv.stage1BonusPaid === undefined) {
      _sv.peas += 30; _sv.stage1BonusPaid = true; setSgSave(_sv);
      setTimeout(() => showSpaceOv('🌱','クリアボーナス！','ステージ1クリアおめでとう！\n🌱×30プレゼント！', 2500, ()=>{}), 400);
    }
  }

  const save      = ensureSgInit();
  const peas      = save.peas;
  const diceCount = Math.floor(peas/10);
  const pos       = save.pos;
  const balls     = save.balls;
  const allBalls  = hasAllBalls();
  const charIcon  = getSgCharIcon();
  const maxPos    = sgCurrentMax();

  // ステージ切替バー
  const s1cleared = sgIsStage1Cleared();
  const stageBar  = s1cleared ? `
    <div class="sg-stage-bar">
      <button class="sg-stage-btn${sgStage===1?' sg-stage-active':''}" onclick="sgGoToStage1()">📌 ステージ1</button>
      <button class="sg-stage-btn${sgStage===2?' sg-stage-active':''}" onclick="sgEnterStage2()">⚔️ ステージ2</button>
    </div>` : '';

  // 球バー
  const ballsHtml = BALL_COLORS.map(c => {
    const n = balls[c]||0;
    return `<div class="sg-ball-slot ${n>0?'sg-ball-have':'sg-ball-miss'}">
      <span class="sg-ball-em">${BALL_EMOJI[c]}</span>
      <span class="sg-ball-cnt">${n>0?`×${n}`:'―'}</span>
    </div>`;
  }).join('');

  // ステージ2：ボス150クリア済み＋5色揃い → 自動クリア
  if (sgStage === 2 && allBalls && save.boss150Cleared && !save.cleared) {
    save.cleared = true;
    if (!save.stage2BonusPaid) { save.peas += 50; save.stage2BonusPaid = true; }
    setSgSave(save);
    setTimeout(() => showSpaceOv('🏆','ステージ2クリア！','5色球コンプリート！\n🌱×50プレゼント！', 3500, () => {
      sgMsg='🏆 ステージ2クリア！完全制覇！おめでとう！🌱×50ゲット！'; sgMsgType='good';
      renderSugoroku();
    }), 400);
  }

  // 球コンプリートメッセージ（ステージ別）
  let completeTag = '';
  if (allBalls && !save.cleared) {
    if (sgStage === 2) {
      const b150 = save.boss150Cleared;
      completeTag = b150
        ? `<div class="sg-ball-complete">✨ 5色揃った！ボス150クリア済み → 自動クリア！</div>`
        : `<div class="sg-ball-complete">✨ 5色揃った！⚔️ ボスマス150へ急げ！</div>`;
    } else {
      completeTag = `<div class="sg-ball-complete">✨ 5色揃った！ゴールへ急げ！</div>`;
    }
  }

  const msgHtml  = sgMsg ? `<div class="sg-message sg-message-${sgMsgType}">${sgMsg}</div>` : '';
  const skipHtml = save.skipNext ? `<div class="sg-skip-notice">💤 次は1回休み</div>` : '';

  const html = `
    <button class="back-btn" onclick="navigate('home')">← 章一覧に戻る</button>
    <div class="sg-wrap">
      ${stageBar}
      <div class="sg-sticky-top">
        <div class="sg-status-bar">
          <div class="sg-status-item"><span>🌱</span><strong>${peas}</strong><small>個</small></div>
          <div class="sg-status-item"><span>🎲</span><strong>${diceCount}</strong><small>回</small></div>
          <div class="sg-status-item"><span>📍</span><strong>${pos}</strong><small>/ ${maxPos}</small></div>
          <div class="sg-status-item sg-status-char"><span>${charIcon}</span></div>
        </div>
        <div class="sg-ball-bar">
          <div class="sg-ball-title">集めた球</div>
          <div class="sg-ball-slots">${ballsHtml}</div>
          ${completeTag}
        </div>
        <div class="sg-action-area">${renderSgActionArea(save)}</div>
      </div>

      ${msgHtml}${skipHtml}

      <div class="sg-board-scroll"><div class="sg-board-frame">
        <div class="sg-board-inner-title">すごろく</div>
        <div class="sg-path-area">${renderSgBoardGrid(pos)}</div>
        <div class="sg-legend">
          ${[
            {t:'forward',        i:'⬆',   l:'進む'},
            {t:'rollAndForward', i:'🎲⬆', l:'振って進む'},
            {t:'back',           i:'⬇',   l:'戻る'},
            {t:'rollAndBack',    i:'🎲⬇', l:'振って戻る'},
            {t:'again',          i:'🎲',  l:'もう一度'},
            {t:'rest',           i:'💤',  l:'1回休み'},
            {t:'warp',           i:'🌀',  l:'ワープ'},
            {t:'monster',        i:'👾',  l:'モンスター'},
            {t:'dropBall',       i:'💀',  l:'球落とし'},
            {t:'dig',            i:'⛏',  l:'穴掘り'},
            {t:'exchange',       i:'🔄',  l:'交換所'},
            {t:'gate_v2',        i:'🚪',  l:'関門（球消費）'},
            {t:'boss',           i:'⚔️',  l:'ボス関門'},
            {t:'gate_spawn',     i:'🚪',  l:'門出現'},
            {t:'goal',           i:'🏆',  l:'ゴール'},
          ].map(({t,i,l})=>`
            <div class="sg-legend-item">
              <span class="sg-legend-dot sg-ld-${t}">${i}</span>
              <span class="sg-legend-label">${l}</span>
            </div>`).join('')}
        </div>
      </div></div>
    </div>`;

  const el = document.getElementById('main-content');
  if (el) el.innerHTML = html;

  if (sgPhase==='rolling') startSgDiceAnimation('🎲 サイコロを振っています…', roll => {
    sgDiceVal = roll; sgPhase = 'idle'; sgExecuteRoll(roll);
  });
}

// ===== アクションエリア =====
function renderSgActionArea(save) {
  if (save.cleared)
    return sgStage === 2
      ? `<div class="sg-cleared-msg">🏆 ステージ2クリア！完全制覇！おめでとう！</div>`
      : `<div class="sg-cleared-msg">🏆 ゴール達成！5色コンプリート！おめでとう！<br><small>ステージ2も挑戦しよう！⚔️</small></div>`;

  switch (sgPhase) {
    case 'idle': {
      // ⭐ ページリロード後もスターマスにいる場合は復元
      if (sgCurrentSpaces()[save.pos] && sgCurrentSpaces()[save.pos].type === 'star') {
        sgStarActive = true;
      }
      // 🚪 ページリロード後も関門マスにいる場合は gateV2 フェーズに復元
      if (sgStage === 2) {
        const gp = [49,99,149].find(p => p === save.pos && !save[`gate${p}Opened`]);
        if (gp) {
          sgPhase = 'gateV2'; sgGateV2Pos = gp;
          return renderSgActionArea(save); // gateV2 ケースで再描画
        }
      }
      const free = sgFreeRoll;
      const skip = save.skipNext;
      const can  = !skip && (free || save.peas>=10);
      const btn  = free  ? `<button class="sg-roll-btn sg-roll-free" onclick="sgRoll()">🎲 もう一度！（無料）</button>`
                 : skip  ? `<button class="sg-roll-btn sg-roll-skip" onclick="sgRoll()">💤 1回休みを解除（🌱×10）</button>`
                 : can   ? `<button class="sg-roll-btn" onclick="sgRoll()">🎲 サイコロを振る（🌱×10）</button>`
                         : `<button class="sg-roll-btn sg-roll-disabled" disabled>🌱 グリンピースが足りない（10個必要）</button>`;
      // どこでも掘る：ステージ2は digAnyActive フラグで管理、ステージ1は門通過後
      const digAnyUnlocked = sgStage === 2 ? !!save.digAnyActive : !!save.passedGate1;
      const digAny = digAnyUnlocked
        ? `<button class="sg-dig-any-btn" onclick="sgDigAnyMode()">⛏ どこでも掘る（🌱×10）</button>` : '';
      const starMenu = sgStarActive ? `
        <div class="sg-star-menu">
          <div class="sg-star-menu-title">⭐ ラッキースター特典（🌱×10でどちらでも使えます）</div>
          <div class="sg-star-menu-btns">
            <button class="sg-star-btn sg-star-dig" onclick="sgStarEnterDig()">⛏ 好きなマスを掘る</button>
            <button class="sg-star-btn sg-star-ex"  onclick="sgStarEnterExchange()">🔄 交換所へ行く</button>
          </div>
        </div>` : '';
      return btn + digAny + starMenu;
    }

    case 'gateV2': {
      const sv = ensureSgInit();
      const hasBalls = hasAllBalls();
      const ballsDisplay = BALL_COLORS.map((c, i) => {
        const n = sv.balls[c]||0;
        return `<span class="sg-gate-ball ${n>0?'sg-gate-ball-have':'sg-gate-ball-miss'}">${BALL_EMOJI[c]}${n>0?`×${n}`:'✗'}</span>`;
      }).join('');
      const digBtn = `<button class="sg-dig-any-btn" onclick="sgDigAnyMode()">⛏ どこでも掘る（🌱×10）</button>`;
      if (hasBalls) {
        return `<div class="sg-sub-panel sg-gate-panel">
          <div class="sg-sub-title">🚪 関門 マス${sgGateV2Pos}</div>
          <div class="sg-gate-balls">${ballsDisplay}</div>
          <div class="sg-gate-msg">5色の球を1個ずつ消費して門を開けます</div>
          <button class="sg-gate-open-btn" onclick="sgOpenGateV2()">🚪 門を開ける！（球×各1消費）</button>
          ${digBtn}
        </div>`;
      } else {
        return `<div class="sg-sub-panel sg-gate-panel">
          <div class="sg-sub-title">🚪 関門 マス${sgGateV2Pos}</div>
          <div class="sg-gate-balls">${ballsDisplay}</div>
          <div class="sg-gate-msg sg-gate-insufficient">まだ球が揃っていない…5色全部集めよう！</div>
          ${digBtn}
        </div>`;
      }
    }

    case 'rolling': {
      return `<div class="sg-rolling-inline">🎲 振っています…</div>`;
    }

    case 'digChoice':
      return `<div class="sg-sub-panel">
        <div class="sg-sub-title">⛏ 穴を掘りますか？</div>
        <div class="sg-sub-btns">
          <button class="sg-dig-btn" onclick="sgTryDig()">⛏ 掘る！</button>
          <button class="sg-skip-btn" onclick="sgFinishDig()">スキップ</button>
        </div>
      </div>`;

    case 'digAnySelect':
      return `<div class="sg-sub-panel sg-sub-select">
        <div class="sg-sub-title">⛏ 掘りたいマスをタップ！</div>
        <button class="sg-skip-btn" onclick="sgFinishDig()">キャンセル</button>
      </div>`;

    case 'digging':
      return `<div class="sg-digging-area">
        <span class="sg-dig-anim">⛏</span>
        <div class="sg-digging-msg">掘っています…</div>
      </div>`;

    case 'digResult': {
      let res = '';
      if (sgDigResult==='ball')
        res = `<div class="sg-dig-result sg-dig-good">${BALL_EMOJI[sgDigBallColor]} ${BALL_NAME[sgDigBallColor]}の球を発見！</div>`;
      else if (sgDigResult==='nothing')
        res = `<div class="sg-dig-result sg-dig-nothing">…何もなかった。</div>`;
      else
        res = sgDigBallColor
          ? `<div class="sg-dig-result sg-dig-bad">${BALL_EMOJI[sgDigBallColor]} ${BALL_NAME[sgDigBallColor]}の球を落としてしまった…</div>`
          : `<div class="sg-dig-result sg-dig-nothing">…何もなかった。</div>`;
      return res + `<button class="sg-continue-btn" onclick="sgFinishDig()">続ける</button>`;
    }

    case 'exchange': {
      const balls = ensureSgInit().balls;
      const hasSome = BALL_COLORS.some(c=>(balls[c]||0)>0);
      if (!hasSome)
        return `<div class="sg-sub-panel">
          <div class="sg-sub-title">🔄 球の交換所</div>
          <div class="sg-exchange-msg">球を持っていません。</div>
          <button class="sg-skip-btn" onclick="sgSkipExchange()">閉じる</button>
        </div>`;

      const giveHtml = BALL_COLORS.map(c => {
        const n=balls[c]||0; if (!n) return '';
        const act = sgExchangeGive===c ? ' sg-ex-active':'';
        return `<button class="sg-ex-btn${act}" onclick="sgSelectGive('${c}')">${BALL_EMOJI[c]}×${n}</button>`;
      }).join('');

      const getHtml = sgExchangeGive
        ? BALL_COLORS.filter(c=>c!==sgExchangeGive).map(c=>
            `<button class="sg-ex-btn sg-ex-get" onclick="sgDoExchange('${c}')">${BALL_EMOJI[c]} ${BALL_NAME[c]}</button>`
          ).join('')
        : '';

      return `<div class="sg-sub-panel">
        <div class="sg-sub-title">🔄 球の交換所（1個↔1個）</div>
        <div class="sg-exchange-row">
          <span class="sg-ex-label">渡す球：</span>${giveHtml}
        </div>
        ${sgExchangeGive?`<div class="sg-exchange-row"><span class="sg-ex-label">もらう球：</span>${getHtml}</div>`:''}
        <button class="sg-skip-btn" onclick="sgSkipExchange()">スキップ</button>
      </div>`;
    }

    case 'starExchange': {
      const balls = ensureSgInit().balls;
      const hasSome = BALL_COLORS.some(c=>(balls[c]||0)>0);
      if (!hasSome)
        return `<div class="sg-sub-panel">
          <div class="sg-sub-title">⭐🔄 球の交換所</div>
          <div class="sg-exchange-msg">球を持っていません。</div>
          <button class="sg-skip-btn" onclick="sgStarSkipExchange()">閉じる</button>
        </div>`;
      const giveHtml = BALL_COLORS.map(c => {
        const n=balls[c]||0; if (!n) return '';
        const act = sgStarExchangeGive===c ? ' sg-ex-active':'';
        return `<button class="sg-ex-btn${act}" onclick="sgStarSelectGive('${c}')">${BALL_EMOJI[c]}×${n}</button>`;
      }).join('');
      const getHtml = sgStarExchangeGive
        ? BALL_COLORS.filter(c=>c!==sgStarExchangeGive).map(c=>
            `<button class="sg-ex-btn sg-ex-get" onclick="sgStarDoExchange('${c}')">${BALL_EMOJI[c]} ${BALL_NAME[c]}</button>`
          ).join('')
        : '';
      return `<div class="sg-sub-panel">
        <div class="sg-sub-title">⭐🔄 球の交換所（1個↔1個）</div>
        <div class="sg-exchange-row"><span class="sg-ex-label">渡す球：</span>${giveHtml}</div>
        ${sgStarExchangeGive?`<div class="sg-exchange-row"><span class="sg-ex-label">もらう球：</span>${getHtml}</div>`:''}
        <button class="sg-skip-btn" onclick="sgStarSkipExchange()">キャンセル</button>
      </div>`;
    }

    case 'bonusRoll':
      return `<div class="sg-sub-panel">
        <div class="sg-sub-title">🎲 もう一度振って${sgBonusDir==='forward'?'進む！':'戻る…'}</div>
        <button class="sg-roll-btn ${sgBonusDir==='forward'?'sg-roll-free':'sg-roll-back'}"
                onclick="sgBonusRoll()">🎲 振る！</button>
      </div>`;

    case 'boss':
      return `<div class="sg-sub-panel">
        <div class="sg-sub-title">⚔️ ボス挑戦中…</div>
        <div style="text-align:center;color:#888;font-size:13px;">画面上の問題に答えてください</div>
      </div>`;

    case 'bossWait': {
      const sv = ensureSgInit();
      const canR = sv.peas >= 10;
      return `<div class="sg-sub-panel">
        <div class="sg-sub-title">⚔️ ボス失敗…</div>
        <div class="sg-boss-wait-info">🌱×10で再挑戦できます（現在: 🌱×${sv.peas}）</div>
        ${canR
          ? `<button class="sg-boss-retry-btn" onclick="sgBossRetry()">🌱×10 再挑戦する</button>`
          : `<button class="sg-boss-retry-btn sg-roll-disabled" disabled>🌱が足りない（10個必要）</button>`}
      </div>`;
    }

    default: return '';
  }
}

// ===== ボードグリッド（①左上スタート）=====
function renderSgBoardGrid(currentPos) {
  let html = '';
  const digMode   = (sgPhase==='digAnySelect');
  const sgSv      = ensureSgInit();
  const allOK     = hasAllBalls();
  const spaces    = sgCurrentSpaces();
  const maxPos    = sgCurrentMax();
  const totalRows = maxPos / 10;

  // アクティブな門の「通行不可セル番号」（ステージ1のみ）
  const gateCells = new Set();
  if (sgStage === 1) {
    gateCells.add(81);
    if (sgSv.gate85Active) gateCells.add(86);
    if (sgSv.gate90Active) gateCells.add(91);
  }

  for (let r=0; r<totalRows; r++) {
    const isOdd = (r%2!==0);
    html += `<div class="sg-path-row">`;

    for (let c=0; c<10; c++) {
      const posInRow = isOdd?(9-c):c;
      const spaceNum = r*10+posInRow+1;
      const space    = spaces[spaceNum];
      const isHere   = (currentPos===spaceNum);
      const w        = SG_WARM[space.type]||SG_WARM.normal;

      // ② 門ビジュアル
      const isGateBlocked = !isHere && gateCells.has(spaceNum) && !allOK;

      let icon='', label='', numStr='';
      if (!isHere) {
        if      (isGateBlocked)         { icon='🚪'; label='門'; }
        else if (spaceNum===1)          { icon='🚩'; label='S'; }
        else if (spaceNum===maxPos)     { icon= sgStage===2?'⚔️':'🏆'; label='GOAL'; }
        else {
          numStr = String(spaceNum);
          switch(space.type){
            case 'forward':        icon='⬆'; label=`+${space.param}`; break;
            case 'rollAndForward': icon='🎲'; label='⬆'; break;
            case 'back':           icon='⬇'; label=`-${space.param}`; break;
            case 'rollAndBack':    icon='🎲'; label='⬇'; break;
            case 'again':          icon='🎲'; break;
            case 'rest':           icon='💤'; break;
            case 'warp':           icon='🌀'; label=`→${space.param}`; break;
            case 'monster':        icon='👾'; break;
            case 'dropBall':       icon='💀'; break;
            case 'dig':            icon='⛏'; break;
            case 'exchange':       icon='🔄'; break;
            case 'gate_spawn':     icon='🚪'; break;
            case 'star':           icon='⭐'; break;
            case 'boss':           icon='⚔️'; label='BOSS'; break;
            default: break;
          }
        }
      }

      const bg  = isGateBlocked ? '#7a1010' : w.bg;
      const bd  = isHere ? '#2a7a1a' : (isGateBlocked ? '#ff3030' : w.bd);
      const isDigTarget = digMode && space.type==='dig';
      const cls = `sg-cell${isHere?' sg-cell-here':''}${space.type!=='normal'?' sg-cell-sp':''}${digMode?' sg-cell-dig-mode':''}${isDigTarget?' sg-cell-dig-selectable':''}${isGateBlocked?' sg-gate-blocked':''}`;
      const click = isDigTarget ? `onclick="sgSelectDigSpace(${spaceNum})"` : '';

      html += `<div class="${cls}" style="background:${bg};border-color:${bd}" ${click}
                    title="マス${spaceNum}：${sgTypeName(space.type)}">
        ${isHere
          ? `<img src="グリン.png" class="sg-char-img" alt="●">`
          : icon
            ? `${numStr ? `<span class="sg-num">${numStr}</span>` : ''}<span class="sg-ci">${icon}</span>${label ? `<span class="sg-cn">${label}</span>` : ''}`
            : `<span class="sg-cn">${numStr}</span>`
        }
      </div>`;
    }

    html += `</div>`;
    if (r < totalRows - 1) {
      const side=(r%2===0)?'right':'left';
      html += `<div class="sg-conn-wrap sg-conn-${side}"><div class="sg-conn-seg"></div></div>`;
    }
  }
  return html;
}

// ===== ユーティリティ =====
function sgTypeName(type) {
  return {
    normal:'普通', forward:'進む', rollAndForward:'振って進む',
    back:'戻る', rollAndBack:'振って戻る', again:'もう一度',
    rest:'1回休み', treasure:'お宝', warp:'ワープ',
    monster:'モンスター', dig:'穴掘り', exchange:'交換所', star:'ラッキースター',
    boss:'ボス関門', goal:'ゴール', gate_spawn:'門出現マス',
  }[type] || type;
}
