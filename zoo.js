// ============================================================
// zoo.js — グリンピース動物園（水族館の動物園版）
//   ・🌱は水族館と共通（学習累計 ＋ 両方のボーナス − 両方の使用分）
//   ・動物ガチャ / 装飾ガチャ（レアほど低確率）
//   ・動物は小さく生まれ、餌を食べるたびに成長（餌10回で最大）
//   ・草原を左右に歩き、ときどき立ち止まる。餌をやると止まって食べる
//   ・いらない動物は「野生に帰す」→ 思い出コレクションへ → ★の数だけ🌱と交換
//   ・装飾はタップで回転・ドラッグで移動・削除モードで消す
// ============================================================
(function () {
  'use strict';

  const ZOO_KEY = 'zoo_v1';
  const AQ_KEY = 'aquarium_v1';     // 🌱残高を水族館と共通にするため参照
  const ZOO_MAX_ANIMALS = 50;      // 基本の園の容量
  const EXPAND_COST = 500;         // 拡張1回の価格
  const EXPAND_AMOUNT = 50;        // 拡張1回で増える容量
  const ANIMAL_COST = 100;
  const DECO_COST = 50;
  const TEN_PULL_COST = 1000;                     // 動物10連ガチャの価格
  const DECO_TEN_PULL_COST = 500;                 // 装飾10連ガチャの価格
  const TEN_PULL_COUNT = 11;                      // 10連で獲得できる数（10+おまけ1）
  const FEED_COST = 3;                            // 餌やり1回で🌱3個消費
  const GROW_MAX = 10;                            // 餌10回で最大サイズ（以降は餌やり不可）
  const SKY_RATIO = 0.32;                         // 園の上から何割が空か
  // 最大サイズ到達後に選べる「理想の大きさ」（最大サイズに対する倍率）
  const ZOO_SIZE_PRESETS = [
    { label: '小',   scale: 0.55 },
    { label: '中',   scale: 0.75 },
    { label: '大',   scale: 1.0 },
    { label: '特大', scale: 1.3 },
  ];

  // ===== ガチャ排出テーブル =====
  // max: 最大サイズ(px) / star: レア表示 / w: 重み / food: 餌の絵文字
  const ANIMAL_POOL = [
    { type:'rabbit',   em:'🐇', nm:'ウサギ',     star:'★',        w:15,   max:30, food:'🥕' },
    { type:'chicken',  em:'🐓', nm:'ニワトリ',   star:'★',        w:15,   max:30, food:'🌽' },
    { type:'sheep',    em:'🐑', nm:'ヒツジ',     star:'★',        w:15,   max:34, food:'🌿' },
    { type:'goat',     em:'🐐', nm:'ヤギ',       star:'★',        w:15,   max:34, food:'🌿' },
    { type:'monkey',   em:'🐒', nm:'サル',       star:'★★',       w:6.25, max:34, food:'🍌' },
    { type:'kangaroo', em:'🦘', nm:'カンガルー', star:'★★',       w:6.25, max:38, food:'🌿' },
    { type:'flamingo', em:'🦩', nm:'フラミンゴ', star:'★★',       w:6.25, max:38, food:'🦐' },
    { type:'penguin',  em:'🐧', nm:'ペンギン',   star:'★★',       w:6.25, max:32, food:'🐟' },
    { type:'giraffe',  em:'🦒', nm:'キリン',     star:'★★★',      w:2.5,  max:50, food:'🍃' },
    { type:'zebra',    em:'🦓', nm:'シマウマ',   star:'★★★',      w:2.5,  max:44, food:'🌿' },
    { type:'elephant', em:'🐘', nm:'ゾウ',       star:'★★★',      w:2.5,  max:52, food:'🍎' },
    { type:'hippo',    em:'🦛', nm:'カバ',       star:'★★★',      w:2.5,  max:46, food:'🍉' },
    { type:'lion',     em:'🦁', nm:'ライオン',   star:'★★★★',     w:1,    max:46, food:'🍖' },
    { type:'tiger',    em:'🐅', nm:'トラ',       star:'★★★★',     w:1,    max:46, food:'🍖' },
    { type:'polar',    em:'🐻‍❄️', nm:'シロクマ', star:'★★★★',     w:1,    max:46, food:'🐟' },
    { type:'gorilla',  em:'🦍', nm:'ゴリラ',     star:'★★★★',     w:1,    max:46, food:'🍌' },
    { type:'panda',    em:'🐼', nm:'パンダ',     star:'★★★★★ 伝説', w:1,  max:48, food:'🎋' },
    { type:'unicorn',  em:'🦄', nm:'ユニコーン', star:'★★★★★★ 最高レア', w:0.1, max:54, food:'🍎' },
    { type:'trex',     em:'🦖', nm:'ティラノサウルス', star:'★★★★★★★ 超激レア', w:0.02, max:62, food:'🍖' },
  ];
  // 引いたとき虹色＆紙吹雪の特別演出をする動物
  const ZOO_LEGENDARY = ['unicorn', 'trex'];
  const DECO_POOL = [
    { type:'tree',    em:'🌳', nm:'木',       star:'★',    w:15, size:40 },
    { type:'flower',  em:'🌻', nm:'花',       star:'★',    w:15, size:26 },
    { type:'rock',    em:'🪨', nm:'岩',       star:'★',    w:15, size:30 },
    { type:'cactus',  em:'🌵', nm:'サボテン', star:'★',    w:15, size:32 },
    { type:'hut',     em:'🏠', nm:'小屋',     star:'★★',   w:14, size:38 },
    { type:'log',     em:'🪵', nm:'丸太',     star:'★★',   w:14, size:30 },
    { type:'fountain',em:'⛲', nm:'噴水',     star:'★★★',  w:5,  size:40 },
    { type:'tent',    em:'🎪', nm:'テント',   star:'★★★',  w:5,  size:42 },
    { type:'wheel',   em:'🎡', nm:'観覧車',   star:'★★★★', w:2,  size:56 },
  ];
  function animalDef(t){ return ANIMAL_POOL.find(a => a.type === t) || ANIMAL_POOL[0]; }
  function decoDef(t){ return DECO_POOL.find(d => d.type === t) || DECO_POOL[0]; }

  // プレビューモードか（?preview=...）
  function zooPreview() { return (typeof PREVIEW_MODE !== 'undefined' && PREVIEW_MODE); }

  // ===== 🌱の残高（水族館と共通） =====
  // 学習で貯めた🌱の累計（お椀＝mathPrint_v2）。お椀は減らさない。
  function zooEarnedTotal() {
    try {
      const p = JSON.parse(localStorage.getItem('mathPrint_v2') || '{}') || {};
      return (p.peaCupCount || 0) * 45 + (p.peaCount || 0);
    } catch (e) { return 0; }
  }
  function zooReadNum(key, field) {
    try { return JSON.parse(localStorage.getItem(key) || '{}')[field] || 0; } catch (e) { return 0; }
  }
  // 使える残高 ＝ 学習累計 ＋ (水族館＋動物園)のボーナス − (水族館＋動物園)の使用分
  function zooGetPeas() {
    if (zooPreview()) return Infinity; // プレビューは無限
    const bonus = zooReadNum(AQ_KEY, 'bonus') + zooReadNum(ZOO_KEY, 'bonus');
    const spent = zooReadNum(AQ_KEY, 'spent') + zooReadNum(ZOO_KEY, 'spent');
    return Math.max(0, zooEarnedTotal() + bonus - spent);
  }
  function zooPeasLabel() { return zooPreview() ? '∞' : String(zooGetPeas()); }
  function zooRefreshPeaDisplay() {
    const el = document.getElementById('zoo-pea-count');
    if (el) el.textContent = zooPeasLabel();
  }
  // 🌱を消費（お椀の累計は減らさず、動物園の使用分カウンターを増やすだけ）
  function zooSpendPeas(n) {
    if (zooPreview()) return true; // プレビューは消費しない（無限）
    if (zooGetPeas() < n) return false;
    const s = zooLoad();
    s.spent = (s.spent || 0) + n;
    zooSave(s);
    return true;
  }
  // レア度（★の数）
  function zooStarCount(type) { return (animalDef(type).star.match(/★/g) || []).length; }

  // ===== セーブ =====
  function zooLoad() {
    let s;
    try { s = JSON.parse(localStorage.getItem(ZOO_KEY) || '{}'); } catch (e) { s = {}; }
    if (!s || typeof s !== 'object') s = {};
    if (!Array.isArray(s.animals)) s.animals = [];
    if (!Array.isArray(s.decos))   s.decos   = [];
    if (!Array.isArray(s.memories)) s.memories = [];            // 野生に帰した動物 [{type}]
    if (!Array.isArray(s.discovered)) s.discovered = [];        // 図鑑：獲得済みの動物type
    if (!Array.isArray(s.discoveredDeco)) s.discoveredDeco = []; // 図鑑：獲得済みの装飾type
    if (typeof s.spent !== 'number') s.spent = 0;               // 動物園で使った🌱の累計
    if (typeof s.bonus !== 'number') s.bonus = 0;               // 思い出交換で得た🌱
    if (typeof s.capBonus !== 'number') s.capBonus = 0;         // 園の拡張分（+50ずつ）
    if (typeof s.nextId !== 'number') s.nextId = 1;
    // 既存の所持（園・思い出・装飾）からも図鑑を補完
    const aset = new Set(s.discovered);
    s.animals.forEach(a => aset.add(a.type));
    s.memories.forEach(a => aset.add(a.type));
    s.discovered = Array.from(aset);
    const dset = new Set(s.discoveredDeco);
    s.decos.forEach(d => dset.add(d.type));
    s.discoveredDeco = Array.from(dset);
    return s;
  }
  function zooSave(s) { localStorage.setItem(ZOO_KEY, JSON.stringify(s)); }

  // 現在の園の容量（基本 + 拡張分）
  function zooMaxAnimals(s) { return ZOO_MAX_ANIMALS + ((s || zooLoad()).capBonus || 0); }

  // 🌱を払って園を拡大
  function zooExpand() {
    if (zooGetPeas() < EXPAND_COST) {
      zooShowToast('🌱が足りません（拡大に' + EXPAND_COST + '個 必要）');
      return;
    }
    if (!zooSpendPeas(EXPAND_COST)) { zooShowToast('🌱が足りません'); return; }
    const s = zooLoad();
    s.capBonus = (s.capBonus || 0) + EXPAND_AMOUNT;
    zooSave(s);
    renderZoo();
    zooShowToast('動物園を' + EXPAND_AMOUNT + '拡大しました！（最大' + zooMaxAnimals(s) + '匹）');
  }

  // ===== 成長 =====
  function zooIsMaxed(a) { return (a.fed || 0) >= GROW_MAX; }
  function zooSizeFactor(a) {
    const fed = Math.min(a.fed || 0, GROW_MAX);
    return 0.45 + 0.55 * (fed / GROW_MAX); // 45%→100%
  }
  const ZOO_SIZE_MULT = 1.5; // 園は広いので、表の max より少し大きめに描く
  function zooAnimalSize(a) {
    const def = animalDef(a.type);
    if (zooIsMaxed(a) && typeof a.prefScale === 'number') return Math.round(def.max * ZOO_SIZE_MULT * a.prefScale);
    return Math.round(def.max * ZOO_SIZE_MULT * zooSizeFactor(a));
  }

  // ===== 重み付き抽選 =====
  function zooPick(pool) {
    let total = 0;
    for (const p of pool) total += p.w;
    let x = Math.random() * total;
    for (const p of pool) { x -= p.w; if (x <= 0) return p; }
    return pool[0];
  }
  function zooNewAnimal(s, type) {
    return { id: s.nextId++, type, fed: 0, x: Math.random(), y: Math.random() };
  }

  // ===== ガチャ =====
  let zooGachaBusy = false;
  function zooRollGacha(kind) {
    if (zooGachaBusy) return;
    const cost = kind === 'animal' ? ANIMAL_COST : DECO_COST;
    const s = zooLoad();
    if (kind === 'animal' && s.animals.length >= zooMaxAnimals(s)) {
      zooShowToast('動物園がいっぱいです（最大' + zooMaxAnimals(s) + '匹）');
      return;
    }
    if (zooGetPeas() < cost) {
      zooShowToast('🌱が足りません（' + cost + '個 必要）');
      return;
    }
    if (!zooSpendPeas(cost)) { zooShowToast('🌱が足りません'); return; }
    zooGachaBusy = true;
    const result = zooPick(kind === 'animal' ? ANIMAL_POOL : DECO_POOL);
    zooShowGachaAnim(kind, result, (choice) => {
      const s2 = zooLoad();
      if (kind === 'animal') {
        if (choice === 'wild') s2.memories.push({ type: result.type });   // 思い出コレクションへ
        else s2.animals.push(zooNewAnimal(s2, result.type));
        if (!s2.discovered.includes(result.type)) s2.discovered.push(result.type);
      } else {
        s2.decos.push({ id: s2.nextId++, type: result.type, x: 0.15 + Math.random() * 0.7, y: 0.45 + Math.random() * 0.45 });
      }
      zooSave(s2);
      zooGachaBusy = false;
      renderZoo();
    });
  }

  // ===== 10連ガチャ（動物🌱1000で11匹 / 装飾🌱500で11個） =====
  function zooRollGacha10(kind) {
    if (zooGachaBusy) return;
    const isAnimal = (kind !== 'deco');
    const cost = isAnimal ? TEN_PULL_COST : DECO_TEN_PULL_COST;
    const s = zooLoad();
    if (isAnimal) {
      const room = zooMaxAnimals(s) - s.animals.length;
      if (room < TEN_PULL_COUNT) {
        zooShowToast('動物園に' + TEN_PULL_COUNT + '匹分の空きが必要（野生に帰して空けよう）');
        return;
      }
    }
    if (zooGetPeas() < cost) {
      zooShowToast('🌱が足りません（' + cost + '個 必要）');
      return;
    }
    if (!zooSpendPeas(cost)) { zooShowToast('🌱が足りません'); return; }
    zooGachaBusy = true;
    const pool = isAnimal ? ANIMAL_POOL : DECO_POOL;
    const results = [];
    for (let i = 0; i < TEN_PULL_COUNT; i++) results.push(zooPick(pool));
    // 10連にレジェンドが含まれていたら紙吹雪
    if (isAnimal && results.some(r => ZOO_LEGENDARY.includes(r.type)) && typeof showConfetti === 'function') {
      try { showConfetti(); } catch (e) {}
    }
    zooShow10PullResult(results, isAnimal, (wildSet) => {
      const s2 = zooLoad();
      if (isAnimal) {
        results.forEach((r, i) => {
          if (wildSet && wildSet.has(i)) s2.memories.push({ type: r.type });   // 野生へ
          else s2.animals.push(zooNewAnimal(s2, r.type));
          if (!s2.discovered.includes(r.type)) s2.discovered.push(r.type);
        });
      } else {
        for (const r of results) s2.decos.push({ id: s2.nextId++, type: r.type, x: 0.08 + Math.random() * 0.84, y: 0.45 + Math.random() * 0.45 });
      }
      zooSave(s2);
      zooGachaBusy = false;
      renderZoo();
    });
  }

  function zooShow10PullResult(results, isAnimal, done) {
    document.getElementById('aq-gacha-overlay')?.remove();
    const wildSet = new Set(); // 野生に帰す動物のindex（動物のみ）
    const ov = document.createElement('div');
    ov.id = 'aq-gacha-overlay';
    ov.className = 'aq-gacha-overlay';
    const unit = isAnimal ? '匹' : '個';
    const cells = results.map((r, i) =>
      `<div class="aq-pull-cell zoo-pull-cell" data-idx="${i}" style="animation-delay:${i * 0.05}s">
         <div class="aq-pull-fossil-mark">🌳</div>
         <div class="aq-pull-em">${r.em}</div>
         <div class="aq-pull-star">${r.star.split(' ')[0]}</div>
       </div>`).join('');
    ov.innerHTML = `
      <div class="aq-gacha-box" style="max-width:360px;">
        <div class="aq-gacha-label" style="margin:0 0 0.4rem;">🎉 10連ガチャ！${TEN_PULL_COUNT}${unit}ゲット！</div>
        ${isAnimal ? '<p style="font-size:0.78rem;color:#445;margin:0 0 0.5rem;">野生に帰したい動物をタップ（🌳印）。残りは動物園へ。</p>' : ''}
        <div class="aq-pull-grid">${cells}</div>
        <button class="aq-size-close" id="zoo-pull-ok">${isAnimal ? '動物園に入れる' : '動物園に飾る'}</button>
      </div>`;
    document.body.appendChild(ov);
    requestAnimationFrame(() => ov.classList.add('show'));
    const okBtn = ov.querySelector('#zoo-pull-ok');
    if (isAnimal) {
      ov.querySelectorAll('.aq-pull-cell').forEach(c => {
        c.addEventListener('click', () => {
          const idx = parseInt(c.dataset.idx);
          if (wildSet.has(idx)) { wildSet.delete(idx); c.classList.remove('aq-pull-fossil'); }
          else { wildSet.add(idx); c.classList.add('aq-pull-fossil'); }
          const n = wildSet.size;
          okBtn.textContent = n > 0 ? `決定（🌳${n} / 動物園${TEN_PULL_COUNT - n}）` : '動物園に入れる';
        });
      });
    }
    okBtn.addEventListener('click', () => { ov.remove(); done && done(wildSet); });
  }

  // ===== ガチャ演出 =====
  function zooShowGachaAnim(kind, result, done) {
    document.getElementById('aq-gacha-overlay')?.remove();
    const ov = document.createElement('div');
    ov.id = 'aq-gacha-overlay';
    ov.className = 'aq-gacha-overlay';
    ov.innerHTML = `
      <div class="aq-gacha-box">
        <div class="aq-capsule" id="zoo-capsule">🎁</div>
        <div class="aq-gacha-label" id="zoo-gacha-label">${kind === 'animal' ? '動物ガチャ' : '装飾ガチャ'}…</div>
      </div>`;
    document.body.appendChild(ov);
    requestAnimationFrame(() => ov.classList.add('show'));
    const cap = ov.querySelector('#zoo-capsule');
    cap.style.animation = 'aqShake 0.4s 3';
    setTimeout(() => {
      cap.style.animation = '';
      cap.textContent = result.em;
      cap.style.animation = 'aqPop 0.5s';
      ov.querySelector('#zoo-gacha-label').innerHTML = `${result.star} <b>${result.nm}</b> をゲット！`;
      if (ZOO_LEGENDARY.includes(result.type)) {
        cap.classList.add('aq-legendary');
        ov.querySelector('.aq-gacha-box').classList.add('aq-legendary-box');
        if (typeof showConfetti === 'function') { try { showConfetti(); } catch (e) {} }
      }
      if (kind === 'animal') {
        // 動物は「動物園に入れる／野生に帰す」を選択
        const box = ov.querySelector('.aq-gacha-box');
        const btns = document.createElement('div');
        btns.className = 'aq-size-btns';
        btns.innerHTML = `
          <button class="aq-size-btn zoo-size-btn" id="zoo-g-in">🏞 動物園に入れる</button>
          <button class="aq-size-btn zoo-size-btn" id="zoo-g-wild">🌳 野生に帰す</button>`;
        box.appendChild(btns);
        box.querySelector('#zoo-g-in').addEventListener('click', () => { ov.remove(); done && done('zoo'); });
        box.querySelector('#zoo-g-wild').addEventListener('click', () => { ov.remove(); done && done('wild'); });
      } else {
        setTimeout(() => { ov.remove(); done && done('zoo'); }, 1400);
      }
    }, 1300);
  }

  function zooShowToast(msg) {
    document.getElementById('aq-toast')?.remove();
    const t = document.createElement('div');
    t.id = 'aq-toast';
    t.className = 'aq-toast';
    t.textContent = msg;
    document.body.appendChild(t);
    requestAnimationFrame(() => t.classList.add('show'));
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 2200);
  }

  // ===== 思い出コレクション（野生に帰した動物）→ 🌱に交換 =====
  function zooExchangeMemory(type) {
    const s = zooLoad();
    const matching = s.memories.filter(m => m.type === type);
    if (matching.length === 0) return;
    const gain = zooStarCount(type) * matching.length;
    s.memories = s.memories.filter(m => m.type !== type);
    s.bonus = (s.bonus || 0) + gain;
    zooSave(s);
    zooRefreshPeaDisplay();
    zooShowToast('🌳 ' + animalDef(type).nm + ' ×' + matching.length + ' の思い出を 🌱×' + gain + ' に交換！');
    zooOpenDex();
  }
  function zooExchangeAllMemories() {
    const s = zooLoad();
    if (s.memories.length === 0) return;
    const cnt = s.memories.length;
    let gain = 0;
    s.memories.forEach(m => { gain += zooStarCount(m.type); });
    s.memories = [];
    s.bonus = (s.bonus || 0) + gain;
    zooSave(s);
    zooRefreshPeaDisplay();
    zooShowToast('🌳 思い出' + cnt + '匹分を 🌱×' + gain + ' に交換！');
    zooOpenDex();
  }

  // ===== 図鑑 =====
  function zooOpenDex() {
    document.getElementById('aq-dex-overlay')?.remove();
    const s = zooLoad();
    const aSet = new Set(s.discovered);
    const dSet = new Set(s.discoveredDeco);
    const aGot = ANIMAL_POOL.filter(a => aSet.has(a.type)).length;
    const dGot = DECO_POOL.filter(d => dSet.has(d.type)).length;

    const cell = (item, got) => got
      ? `<div class="aq-dex-cell zoo-dex-got">
           <div class="aq-dex-em">${item.em}</div>
           <div class="aq-dex-nm">${item.nm}</div>
           <div class="aq-dex-star">${item.star.split(' ')[0]}</div>
         </div>`
      : `<div class="aq-dex-cell aq-dex-locked">
           <div class="aq-dex-em">❓</div>
           <div class="aq-dex-nm">？？？</div>
           <div class="aq-dex-star">${item.star.split(' ')[0]}</div>
         </div>`;
    const animalCells = ANIMAL_POOL.map(a => cell(a, aSet.has(a.type))).join('');
    const decoCells = DECO_POOL.map(d => cell(d, dSet.has(d.type))).join('');

    // 思い出コレクション（種類ごとに数を集計）
    const memCount = {};
    s.memories.forEach(m => { memCount[m.type] = (memCount[m.type] || 0) + 1; });
    const memTypes = Object.keys(memCount);
    let memGainTotal = 0;
    s.memories.forEach(m => { memGainTotal += zooStarCount(m.type); });
    const memCells = memTypes.length === 0
      ? `<div class="aq-dex-empty">まだ思い出はありません</div>`
      : memTypes.map(t => {
          const def = animalDef(t);
          const cnt = memCount[t];
          return `<div class="aq-dex-cell zoo-dex-got">
            <div class="aq-dex-em">${def.em}</div>
            <div class="aq-dex-nm">${def.nm}</div>
            <div class="aq-dex-star">×${cnt}</div>
            <button class="aq-fossil-ex-btn" onclick="zooExchangeMemory('${t}')">🌱×${zooStarCount(t) * cnt}に交換</button>
          </div>`;
        }).join('');
    const exchangeAllBtn = memTypes.length === 0 ? ''
      : `<button class="aq-fossil-exall-btn" onclick="zooExchangeAllMemories()">🌳 思い出をぜんぶ交換（🌱×${memGainTotal}）</button>`;

    const ov = document.createElement('div');
    ov.id = 'aq-dex-overlay';
    ov.className = 'aq-gacha-overlay';
    ov.innerHTML = `
      <div class="aq-dex-box">
        <div class="aq-dex-title zoo-dex-title">📖 動物園ずかん</div>
        <div class="aq-dex-section zoo-dex-section">🦁 動物（${aGot} / ${ANIMAL_POOL.length} 種）</div>
        <div class="aq-dex-grid">${animalCells}</div>
        <div class="aq-dex-section zoo-dex-section">🌳 装飾（${dGot} / ${DECO_POOL.length} 種）</div>
        <div class="aq-dex-grid">${decoCells}</div>
        <div class="aq-dex-section zoo-dex-section">🌳 野生に帰した思い出（${s.memories.length} 匹）<small style="font-weight:400;color:#445;">　レア度の数だけ🌱と交換</small></div>
        <div class="aq-dex-grid">${memCells}</div>
        ${exchangeAllBtn}
        <button class="aq-size-close" id="zoo-dex-close">とじる</button>
      </div>`;
    document.body.appendChild(ov);
    requestAnimationFrame(() => ov.classList.add('show'));
    ov.querySelector('#zoo-dex-close').addEventListener('click', () => ov.remove());
    ov.addEventListener('click', e => { if (e.target === ov) ov.remove(); });
  }

  // ===== 動物一覧（複数選択で野生に帰す） =====
  function zooOpenAnimalList() {
    document.getElementById('aq-fishlist-overlay')?.remove();
    const selected = new Set();
    const s = zooLoad();
    const ov = document.createElement('div');
    ov.id = 'aq-fishlist-overlay';
    ov.className = 'aq-gacha-overlay';
    const cells = s.animals.length === 0
      ? `<div class="aq-dex-empty">動物園に動物がいません</div>`
      : s.animals.map(a => {
          const def = animalDef(a.type);
          const fed = Math.min(a.fed || 0, GROW_MAX);
          const grow = zooIsMaxed(a) ? '最大' : `餌${fed}/${GROW_MAX}`;
          return `<div class="aq-fl-cell zoo-fl-cell" data-aid="${a.id}">
              <div class="aq-fl-check">✓</div>
              <div class="aq-dex-em">${def.em}</div>
              <div class="aq-dex-nm">${def.nm}</div>
              <div class="aq-fl-grow zoo-fl-grow">${grow}</div>
            </div>`;
        }).join('');
    ov.innerHTML = `
      <div class="aq-dex-box">
        <div class="aq-dex-title zoo-dex-title">🦁 動物園の動物（${s.animals.length}匹）</div>
        <p style="font-size:0.8rem;color:#445;margin:0 0 0.6rem;text-align:center;">野生に帰したい動物をタップで選んでね</p>
        <div class="aq-fl-grid">${cells}</div>
        <button class="aq-fl-fossil-btn zoo-wild-btn" id="zoo-fl-wild" disabled>🌳 選んだ 0 匹を野生に帰す</button>
        <button class="aq-size-close" id="zoo-fl-close">とじる</button>
      </div>`;
    document.body.appendChild(ov);
    requestAnimationFrame(() => ov.classList.add('show'));
    const wb = ov.querySelector('#zoo-fl-wild');
    ov.querySelectorAll('.aq-fl-cell').forEach(c => {
      c.addEventListener('click', () => {
        const aid = parseInt(c.dataset.aid);
        if (selected.has(aid)) { selected.delete(aid); c.classList.remove('aq-fl-selected'); }
        else { selected.add(aid); c.classList.add('aq-fl-selected'); }
        wb.disabled = (selected.size === 0);
        wb.textContent = `🌳 選んだ ${selected.size} 匹を野生に帰す`;
      });
    });
    wb.addEventListener('click', () => {
      if (selected.size === 0) return;
      const cnt = selected.size;
      const s2 = zooLoad();
      s2.animals = s2.animals.filter(a => {
        if (selected.has(a.id)) { s2.memories.push({ type: a.type }); return false; }
        return true;
      });
      zooSave(s2);
      ov.remove();
      renderZoo();
      zooShowToast(cnt + '匹を野生に帰しました（思い出は図鑑へ）');
    });
    ov.querySelector('#zoo-fl-close').addEventListener('click', () => ov.remove());
    ov.addEventListener('click', e => { if (e.target === ov) ov.remove(); });
  }

  // ===== 理想の大きさ選択（最大まで育った動物のみ） =====
  function zooOpenSizePicker(animalId) {
    document.getElementById('aq-size-overlay')?.remove();
    const s = zooLoad();
    const a = s.animals.find(x => x.id === animalId);
    if (!a) return;
    const def = animalDef(a.type);
    const cur = (typeof a.prefScale === 'number') ? a.prefScale : 1.0;
    const ov = document.createElement('div');
    ov.id = 'aq-size-overlay';
    ov.className = 'aq-gacha-overlay';
    ov.innerHTML = `
      <div class="aq-gacha-box">
        <div style="font-size:46px;line-height:1;">${def.em}</div>
        <div class="aq-gacha-label">${def.nm} の大きさを選ぶ</div>
        <div class="aq-size-btns"></div>
        <button class="aq-size-close">とじる</button>
      </div>`;
    document.body.appendChild(ov);
    requestAnimationFrame(() => ov.classList.add('show'));
    const wrap = ov.querySelector('.aq-size-btns');
    ZOO_SIZE_PRESETS.forEach(p => {
      const b = document.createElement('button');
      b.className = 'aq-size-btn zoo-size-btn' + (Math.abs(cur - p.scale) < 0.001 ? ' active' : '');
      b.textContent = p.label;
      b.addEventListener('click', () => {
        const s2 = zooLoad();
        const a2 = s2.animals.find(x => x.id === animalId);
        if (a2) { a2.prefScale = p.scale; zooSave(s2); }
        const rt = zooRT.find(r => r.id === animalId);
        if (rt && a2) { rt.size = zooAnimalSize(a2); rt.el.style.fontSize = rt.size + 'px'; }
        ov.remove();
      });
      wrap.appendChild(b);
    });
    ov.querySelector('.aq-size-close').addEventListener('click', () => ov.remove());
    ov.addEventListener('click', e => { if (e.target === ov) ov.remove(); });
  }

  // ===== 餌やり =====
  // タップした動物の頭上から餌を3つ落とす → 立ち止まって食べる → 成長（🌱を FEED_COST 個消費）
  function zooFeed(animalId) {
    const rt = zooRT.find(r => r.id === animalId);
    if (!rt || rt.feeding) return;
    const sa = zooLoad().animals.find(x => x.id === animalId);
    if (sa && zooIsMaxed(sa)) { zooShowToast('もう最大まで育ったよ！'); return; }
    if (zooGetPeas() < FEED_COST) {
      zooShowToast('🌱が足りません（餌やりに' + FEED_COST + '個 必要）');
      return;
    }
    if (!zooSpendPeas(FEED_COST)) { zooShowToast('🌱が足りません'); return; }
    zooRefreshPeaDisplay();
    rt.feeding = true;
    rt.pause = 0;
    rt.glow = 20;
    rt.ateAny = false;
    const cx = rt.x + rt.size / 2;
    const topY = Math.max(0, rt.y - 40);
    for (let n = 0; n < 3; n++) {
      zooFoodRT.push({ x: cx + (n - 1) * 8, y: topY - n * 18, vy: 1.6, owner: rt, eaten: false, el: null, em: animalDef(rt.type).food });
    }
  }

  // ===== 装飾ドラッグ・回転・削除 =====
  let zooDrag = null;
  let zooDecoDeleteMode = false;
  function zooDecoPointerDown(e) {
    const el = e.currentTarget;
    e.preventDefault();
    const field = document.getElementById('zoo-field');
    zooDrag = { id: parseInt(el.dataset.decoId), el, rect: field.getBoundingClientRect(),
                startX: e.clientX, startY: e.clientY, moved: false, rot: parseFloat(el.dataset.rot || '0') };
    el.classList.add('aq-deco-dragging');
    try { el.setPointerCapture(e.pointerId); } catch (ex) {}
    el.addEventListener('pointermove', zooDecoPointerMove);
    el.addEventListener('pointerup', zooDecoPointerUp);
    el.addEventListener('pointercancel', zooDecoPointerUp);
  }
  function zooDecoPointerMove(e) {
    if (!zooDrag) return;
    if (Math.abs(e.clientX - zooDrag.startX) + Math.abs(e.clientY - zooDrag.startY) > 6) zooDrag.moved = true;
    if (!zooDrag.moved) return;
    const r = zooDrag.rect;
    const fx = Math.max(0.03, Math.min(0.97, (e.clientX - r.left) / r.width));
    const fy = Math.max(0.05, Math.min(0.95, (e.clientY - r.top) / r.height));
    zooDrag.el.style.left = (fx * 100) + '%';
    zooDrag.el.style.top  = (fy * 100) + '%';
    zooDrag.el.style.zIndex = String(zooDepthZ(fy));
    zooDrag.fx = fx; zooDrag.fy = fy;
  }
  function zooDecoPointerUp() {
    if (!zooDrag) return;
    const el = zooDrag.el;
    el.classList.remove('aq-deco-dragging');
    el.removeEventListener('pointermove', zooDecoPointerMove);
    el.removeEventListener('pointerup', zooDecoPointerUp);
    el.removeEventListener('pointercancel', zooDecoPointerUp);
    const s = zooLoad();
    const d = s.decos.find(x => x.id === zooDrag.id);
    if (zooDrag.moved && zooDrag.fx != null) {
      if (d) { d.x = zooDrag.fx; d.y = zooDrag.fy; zooSave(s); }
    } else if (zooDecoDeleteMode) {
      const idx = s.decos.findIndex(x => x.id === zooDrag.id);
      if (idx >= 0) { s.decos.splice(idx, 1); zooSave(s); }
      el.remove();
    } else {
      const newRot = (zooDrag.rot + 45) % 360;
      if (d) { d.rot = newRot; zooSave(s); }
      el.dataset.rot = String(newRot);
      el.style.setProperty('--aq-rot', newRot + 'deg');
      el.style.transform = 'translate(-50%,-50%) rotate(' + newRot + 'deg)';
    }
    zooDrag = null;
  }
  function zooToggleDecoDelete(btn) {
    zooDecoDeleteMode = !zooDecoDeleteMode;
    const field = document.getElementById('zoo-field');
    if (field) field.classList.toggle('aq-deco-delete-mode', zooDecoDeleteMode);
    if (btn) {
      btn.classList.toggle('aq-active', zooDecoDeleteMode);
      btn.textContent = zooDecoDeleteMode ? '✅ 消すのをやめる' : '🗑 装飾を消す';
    }
  }

  // ===== 動物ドラッグ（移動）＆タップ（餌やり）判別 =====
  let zooAnimalDrag = null;
  function zooAnimalPointerDown(e) {
    const el = e.currentTarget;
    const id = parseInt(el.dataset.animalId);
    const rt = zooRT.find(r => r.id === id);
    if (!rt) return;
    e.preventDefault();
    e.stopPropagation();
    const field = document.getElementById('zoo-field');
    zooAnimalDrag = { id, rt, el, rect: field.getBoundingClientRect(), startX: e.clientX, startY: e.clientY, moved: false, pointerId: e.pointerId };
    try { el.setPointerCapture(e.pointerId); } catch (ex) {}
    el.addEventListener('pointermove', zooAnimalPointerMove);
    el.addEventListener('pointerup', zooAnimalPointerUp);
    el.addEventListener('pointercancel', zooAnimalPointerUp);
  }
  function zooAnimalPointerMove(e) {
    if (!zooAnimalDrag) return;
    const d = zooAnimalDrag;
    if (!d.moved && Math.abs(e.clientX - d.startX) + Math.abs(e.clientY - d.startY) > 6) {
      d.moved = true;
      d.rt.dragging = true;
      d.el.classList.add('aq-fish-dragging');
    }
    if (d.moved) {
      const r = d.rect;
      const lim = zooGroundLimits(r.height, d.rt.size);
      d.rt.x = Math.max(0, Math.min(r.width - d.rt.size, e.clientX - r.left - d.rt.size / 2));
      d.rt.y = Math.max(lim.min, Math.min(lim.max, e.clientY - r.top - d.rt.size / 2));
      zooApplyAnimal(d.rt, 0);
    }
  }
  function zooAnimalPointerUp() {
    if (!zooAnimalDrag) return;
    const d = zooAnimalDrag;
    d.el.classList.remove('aq-fish-dragging');
    d.el.removeEventListener('pointermove', zooAnimalPointerMove);
    d.el.removeEventListener('pointerup', zooAnimalPointerUp);
    d.el.removeEventListener('pointercancel', zooAnimalPointerUp);
    try { d.el.releasePointerCapture(d.pointerId); } catch (ex) {}
    if (d.moved) {
      d.rt.dragging = false;
      zooSavePosition(d.rt);
    } else {
      const sa = zooLoad().animals.find(x => x.id === d.id);
      if (sa && zooIsMaxed(sa)) zooOpenSizePicker(d.id);
      else zooFeed(d.id);
    }
    zooAnimalDrag = null;
  }
  // ドラッグで置いた場所を保存（次に開いたときもその辺りから歩き出す）
  function zooSavePosition(rt) {
    const field = document.getElementById('zoo-field');
    if (!field) return;
    const s = zooLoad();
    const a = s.animals.find(x => x.id === rt.id);
    if (!a) return;
    const lim = zooGroundLimits(field.clientHeight, rt.size);
    a.x = rt.x / Math.max(1, field.clientWidth - rt.size);
    a.y = (rt.y - lim.min) / Math.max(1, lim.max - lim.min);
    zooSave(s);
  }

  // ===== 描画 =====
  let zooRT = [];      // ランタイム動物
  let zooFoodRT = [];  // 落下中の餌
  let zooRaf = null;

  // 動物が歩ける縦の範囲（空の少し下〜地面の下端）
  function zooGroundLimits(H, size) {
    const min = H * SKY_RATIO - size * 0.6;
    const max = H - size - 6;
    return { min, max: Math.max(min, max) };
  }
  // 手前（下）にいるものほど前に描く
  function zooDepthZ(fy) { return 10 + Math.round(fy * 100); }

  function renderZoo() {
    zooDecoDeleteMode = false;
    const s = zooLoad();
    const peas = zooPeasLabel();

    const animalProb = `
      <div class="aq-prob">
        <div class="aq-prob-title">🦁 動物ガチャ 確率</div>
        <div class="aq-prob-row"><span>★ コモン</span><span>60%</span></div>
        <div class="aq-prob-row"><span>★★ アンコモン</span><span>25%</span></div>
        <div class="aq-prob-row"><span>★★★ レア</span><span>10%</span></div>
        <div class="aq-prob-row"><span>★★★★ 超レア</span><span>4%</span></div>
        <div class="aq-prob-row"><span>★★★★★ 伝説</span><span>1%</span></div>
        <div class="aq-prob-row"><span>★★★★★★ ？？？（最高レア）</span><span>0.1%</span></div>
        <div class="aq-prob-row"><span>★★★★★★★ ？？？（超激レア）</span><span>0.02%</span></div>
      </div>`;
    const decoProb = `
      <div class="aq-prob">
        <div class="aq-prob-title">🌳 装飾ガチャ 確率</div>
        <div class="aq-prob-row"><span>★ コモン</span><span>60%</span></div>
        <div class="aq-prob-row"><span>★★ アンコモン</span><span>28%</span></div>
        <div class="aq-prob-row"><span>★★★ レア</span><span>10%</span></div>
        <div class="aq-prob-row"><span>★★★★ 目玉</span><span>2%</span></div>
      </div>`;

    const html = `
      <button class="back-btn" onclick="navigate('home')">← 章一覧に戻る</button>
      <div class="aq-wrap">
        <div class="aq-header">
          <div class="aq-title zoo-title">🦁 グリンピース動物園</div>
          <div class="aq-stats">
            <span class="aq-stat">🌱 <strong id="zoo-pea-count">${peas}</strong></span>
            <span class="aq-stat">🐾 <strong>${s.animals.length}</strong>/${zooMaxAnimals(s)}</span>
            <span class="aq-stat">🌳 <strong>${s.memories.length}</strong></span>
          </div>
        </div>
        <p class="zoo-shared-note">🌱は水族館と共通です（どちらで使っても同じ残高から減ります）</p>

        <div class="zoo-field" id="zoo-field">
          <div class="zoo-sun">☀️</div>
          <div class="zoo-cloud" style="top:8%;animation-duration:70s;">☁️</div>
          <div class="zoo-cloud" style="top:18%;animation-duration:95s;animation-delay:-40s;font-size:28px;">☁️</div>
          <div class="zoo-grass"></div>
        </div>

        <div class="aq-hint">👆 動物をタップで餌やり ／ ドラッグで移動 ／ 装飾はタップで回転・ドラッグで移動<br>🗑「装飾を消す」をONにして装飾をタップすると消せます</div>

        <div class="aq-gacha-area">
          <button class="aq-gacha-btn zoo-gacha-animal" onclick="zooRollGacha('animal')">
            <span class="aq-gacha-em">🎰</span>
            <span class="aq-gacha-name">動物ガチャ</span>
            <span class="aq-gacha-cost">🌱${ANIMAL_COST}</span>
          </button>
          <button class="aq-gacha-btn aq-gacha-deco" onclick="zooRollGacha('deco')">
            <span class="aq-gacha-em">🎰</span>
            <span class="aq-gacha-name">装飾ガチャ</span>
            <span class="aq-gacha-cost">🌱${DECO_COST}</span>
          </button>
        </div>

        <div class="aq-gacha-area">
          <button class="aq-gacha-btn zoo-gacha-ten" onclick="zooRollGacha10('animal')">
            <span class="aq-gacha-em">🎰✨</span>
            <span class="aq-gacha-name">動物10連（${TEN_PULL_COUNT}匹）</span>
            <span class="aq-gacha-cost">🌱${TEN_PULL_COST}</span>
          </button>
          <button class="aq-gacha-btn aq-gacha-ten-deco" onclick="zooRollGacha10('deco')">
            <span class="aq-gacha-em">🎰✨</span>
            <span class="aq-gacha-name">装飾10連（${TEN_PULL_COUNT}個）</span>
            <span class="aq-gacha-cost">🌱${DECO_TEN_PULL_COST}</span>
          </button>
        </div>

        <div class="aq-tool-row">
          <button class="aq-tool-btn zoo-dex-btn" onclick="zooOpenDex()">📖 ずかん</button>
          <button class="aq-tool-btn zoo-list-btn" onclick="zooOpenAnimalList()">🦁 動物一覧・野生に帰す</button>
        </div>
        <button class="aq-tool-btn aq-deco-del-btn" onclick="zooToggleDecoDelete(this)" style="width:100%;margin-bottom:1rem;">🗑 装飾を消す</button>

        <button class="aq-expand-btn zoo-expand-btn" onclick="zooExpand()">
          🔧 動物園を拡大（+${EXPAND_AMOUNT}匹）　🌱${EXPAND_COST}
        </button>

        <div class="aq-prob-area">${animalProb}${decoProb}</div>

        <div class="aq-note">
          動物は小さく生まれ、餌（🌱×${FEED_COST}）をあげるたびに成長（餌${GROW_MAX}回で最大）。<br>
          最大まで育った動物はタップで「好きな大きさ」を選べます。<br>
          いっぱいになったら、動物を🌳<b>野生に帰そう</b>。思い出は図鑑で🌱と交換できます。
        </div>
      </div>`;

    const el = document.getElementById('main-content');
    if (el) el.innerHTML = html;

    zooBuildField(s);
    zooStartAnim();
  }

  // 園の中の動物・装飾DOMを構築
  function zooBuildField(s) {
    const field = document.getElementById('zoo-field');
    if (!field) return;
    const W = field.clientWidth || 320;
    const H = field.clientHeight || 380;

    for (const d of s.decos) {
      const def = decoDef(d.type);
      const el = document.createElement('div');
      el.className = 'aq-deco zoo-deco';
      el.dataset.decoId = d.id;
      el.textContent = def.em;
      el.style.fontSize = Math.round(def.size * 1.3) + 'px';
      el.style.left = (d.x * 100) + '%';
      el.style.top  = (d.y * 100) + '%';
      el.style.zIndex = String(zooDepthZ(d.y));
      const rot = d.rot || 0;
      el.dataset.rot = String(rot);
      el.style.setProperty('--aq-rot', rot + 'deg');
      el.style.transform = 'translate(-50%,-50%) rotate(' + rot + 'deg)';
      el.addEventListener('pointerdown', zooDecoPointerDown);
      field.appendChild(el);
    }

    zooRT = [];
    zooFoodRT = [];
    s.animals.forEach((a, i) => {
      const def = animalDef(a.type);
      const size = zooAnimalSize(a);
      const el = document.createElement('div');
      el.className = 'zoo-animal';
      el.textContent = def.em;
      el.style.fontSize = size + 'px';
      el.dataset.animalId = a.id;
      el.addEventListener('pointerdown', zooAnimalPointerDown);
      field.appendChild(el);

      const lim = zooGroundLimits(H, size);
      const px = (typeof a.x === 'number') ? a.x : Math.random();
      const py = (typeof a.y === 'number') ? a.y : Math.random();
      const dir = (i % 2 === 0) ? 1 : -1;
      const speed = 0.3 + Math.random() * 0.45;
      zooRT.push({
        id: a.id, type: a.type, size,
        x: px * Math.max(1, W - size),
        y: lim.min + py * (lim.max - lim.min),
        vx: speed * dir, baseSpeed: speed,
        face: dir > 0 ? -1 : 1, target: dir > 0 ? -1 : 1,
        phase: Math.random() * 6.28,
        pause: Math.floor(Math.random() * 120),
        eating: 0, glow: 0, feeding: false, dragging: false, ateAny: false,
        el,
      });
    });
    zooFieldW = W; zooFieldH = H;
    zooRT.forEach(rt => zooApplyAnimal(rt, 0));
  }

  // 園の大きさが変わったら（表示直後・画面回転など）動物の位置を割合で合わせ直す
  let zooFieldW = 0, zooFieldH = 0;
  function zooFitToField(W, H) {
    if (W <= 0 || H <= 0 || (W === zooFieldW && H === zooFieldH)) return;
    for (const a of zooRT) {
      const oldLim = zooGroundLimits(zooFieldH, a.size);
      const fx = a.x / Math.max(1, zooFieldW - a.size);
      const fy = (a.y - oldLim.min) / Math.max(1, oldLim.max - oldLim.min);
      const lim = zooGroundLimits(H, a.size);
      a.x = Math.max(0, Math.min(1, fx)) * Math.max(1, W - a.size);
      a.y = lim.min + Math.max(0, Math.min(1, fy)) * (lim.max - lim.min);
    }
    zooFieldW = W; zooFieldH = H;
  }

  function zooApplyAnimal(rt, hop) {
    const field = document.getElementById('zoo-field');
    const H = field ? field.clientHeight : 380;
    rt.el.style.transform = 'translate(' + rt.x.toFixed(1) + 'px,' + (rt.y - hop).toFixed(1) + 'px) scaleX(' + rt.face.toFixed(3) + ')';
    rt.el.style.zIndex = String(zooDepthZ((rt.y + rt.size) / H));
  }

  // ===== アニメーションループ =====
  function zooStartAnim() {
    zooStopAnim();
    const loop = () => {
      if (typeof state !== 'undefined' && state.view !== 'zoo') { zooStopAnim(); return; }
      zooTick();
      zooRaf = requestAnimationFrame(loop);
    };
    zooRaf = requestAnimationFrame(loop);
  }
  function zooStopAnim() {
    if (zooRaf) { cancelAnimationFrame(zooRaf); zooRaf = null; }
  }

  function zooTick() {
    const field = document.getElementById('zoo-field');
    if (!field) { zooStopAnim(); return; }
    const W = field.clientWidth;
    zooFitToField(W, field.clientHeight);

    for (const a of zooRT) {
      if (a.dragging) continue;
      let hop = 0;
      if (a.eating > 0) {
        a.eating--;
        hop = (a.eating % 12 < 6) ? 2 : 0;          // もぐもぐ
      } else if (a.feeding) {
        // 餌が落ちてくるのを待つ（立ち止まる）
      } else if (a.pause > 0) {
        a.pause--;                                    // ひと休み
      } else {
        a.x += a.vx;
        const maxX = W - a.size;
        if (a.x <= 0) { a.x = 0; a.vx = Math.abs(a.vx); a.target = -1; }
        else if (a.x >= maxX) { a.x = maxX; a.vx = -Math.abs(a.vx); a.target = 1; }
        a.phase += 0.18;
        hop = Math.abs(Math.sin(a.phase)) * 3;        // てくてく歩く
        // ときどき立ち止まる／向きを変える
        if (Math.random() < 0.004) {
          a.pause = 60 + Math.floor(Math.random() * 150);
          if (Math.random() < 0.5) { a.vx = -a.vx; a.target = a.vx > 0 ? -1 : 1; }
        }
      }
      a.face += (a.target - a.face) * 0.12;
      zooApplyAnimal(a, hop);
      if (a.glow > 0) { a.glow--; a.el.style.filter = 'drop-shadow(0 0 6px #ffe27a)'; }
      else a.el.style.filter = '';
    }

    // 餌の落下
    for (let i = zooFoodRT.length - 1; i >= 0; i--) {
      const f = zooFoodRT[i];
      if (f.eaten) {
        if (f.el) f.el.remove();
        zooFoodRT.splice(i, 1);
        continue;
      }
      f.y += f.vy;
      const o = f.owner;
      if (f.y >= o.y + o.size * 0.35) {               // 口元まで届いたら食べる
        f.eaten = true;
        o.eating = 24;
        o.ateAny = true;
      }
      if (!f.el) {
        f.el = document.createElement('div');
        f.el.className = 'zoo-food';
        f.el.textContent = f.em;
        field.appendChild(f.el);
      }
      if (!f.eaten) f.el.style.transform = 'translate(' + (f.x - 9).toFixed(1) + 'px,' + f.y.toFixed(1) + 'px)';
    }

    // 自分の餌がなくなった動物 → 食事終了・成長
    for (const a of zooRT) {
      if (a.feeding && a.eating === 0 && !zooFoodRT.some(f => f.owner === a)) {
        a.feeding = false;
        if (a.ateAny) zooOnAnimalEat(a);
      }
    }
  }

  // 動物が食事を終えた → 餌回数+1・成長
  function zooOnAnimalEat(rt) {
    const s = zooLoad();
    const a = s.animals.find(x => x.id === rt.id);
    if (!a) return;
    a.fed = (a.fed || 0) + 1;
    zooSave(s);
    const newSize = zooAnimalSize(a);
    if (newSize !== rt.size) {
      rt.y -= (newSize - rt.size);   // 足もとの高さを保ったまま大きくする
      rt.size = newSize;
      rt.el.style.fontSize = newSize + 'px';
    }
    if (zooIsMaxed(a)) zooShowToast(animalDef(a.type).nm + ' が最大まで育った！タップで大きさを選べるよ');
  }

  // ===== ホームバナー用テキスト（app.js から参照） =====
  window.zooHomeBannerSub = function () {
    const s = zooLoad();
    return `🐾 ${s.animals.length}/${zooMaxAnimals(s)}匹　🌱${zooPeasLabel()}`;
  };

  // グローバル公開
  window.renderZoo = renderZoo;
  window.zooRollGacha = zooRollGacha;
  window.zooRollGacha10 = zooRollGacha10;
  window.zooOpenDex = zooOpenDex;
  window.zooExchangeMemory = zooExchangeMemory;
  window.zooExchangeAllMemories = zooExchangeAllMemories;
  window.zooOpenAnimalList = zooOpenAnimalList;
  window.zooExpand = zooExpand;
  window.zooToggleDecoDelete = zooToggleDecoDelete;
  window.zooStopAnim = zooStopAnim;
})();
