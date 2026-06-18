// ============================================================
// aquarium.js — グリンピース水族館（プレビューモード限定）
//   ・既存🌱(mathPrint_v2)を消費してガチャ
//   ・魚ガチャ / 装飾ガチャ（レアほど低確率）
//   ・魚は小さく生まれ、餌を食べるたびに成長（餌5回で最大）
//   ・水槽を往復しゆるくターン。餌をやると止まって食べ、食べ終わると再開
//   ・餌は数日でゆっくり減り、空腹0%→ひん死警告(約1日)→放置で消滅
//   ・装飾はドラッグで自由配置（餌不要）
// ============================================================
(function () {
  'use strict';

  const AQ_KEY = 'aquarium_v1';
  const AQ_MAX_FISH = 50;
  const FISH_COST = 100;
  const DECO_COST = 50;
  const GROW_MAX = 5;                            // 餌5回で最大サイズ

  // ===== ガチャ排出テーブル =====
  // max: 最大サイズ(px) / star: レア表示 / w: 重み
  const FISH_POOL = [
    { type:'small',   em:'🐟', nm:'小魚',       star:'★',        w:30, max:30 },
    { type:'shrimp',  em:'🦐', nm:'エビ',       star:'★',        w:30, max:26 },
    { type:'tropical',em:'🐠', nm:'熱帯魚',     star:'★★',       w:10, max:34 },
    { type:'jelly',   em:'🪼', nm:'クラゲ',     star:'★★',       w:8,  max:32 },
    { type:'squid',   em:'🦑', nm:'イカ',       star:'★★',       w:7,  max:34 },
    { type:'puffer',  em:'🐡', nm:'フグ',       star:'★★★',      w:4,  max:34 },
    { type:'octopus', em:'🐙', nm:'タコ',       star:'★★★',      w:3,  max:36 },
    { type:'lobster', em:'🦞', nm:'ロブスター', star:'★★★',      w:3,  max:34 },
    { type:'turtle',  em:'🐢', nm:'カメ',       star:'★★★★',     w:1.5,max:40 },
    { type:'shark',   em:'🦈', nm:'サメ',       star:'★★★★',     w:1.5,max:46 },
    { type:'dolphin', em:'🐬', nm:'イルカ',     star:'★★★★',     w:1,  max:44 },
    { type:'whale',   em:'🐋', nm:'クジラ',     star:'★★★★★ 伝説',w:1,  max:54 },
  ];
  const DECO_POOL = [
    { type:'seaweed', em:'🌿', nm:'水草',     star:'★',    w:22, size:30 },
    { type:'rock',    em:'🪨', nm:'岩',       star:'★',    w:20, size:30 },
    { type:'shell',   em:'🐚', nm:'貝がら',   star:'★',    w:18, size:26 },
    { type:'coral',   em:'🪸', nm:'サンゴ',   star:'★★',   w:16, size:30 },
    { type:'anchor',  em:'⚓', nm:'いかり',   star:'★★',   w:12, size:28 },
    { type:'castle',  em:'🏰', nm:'お城',     star:'★★★',  w:6,  size:36 },
    { type:'gem',     em:'💎', nm:'宝石',     star:'★★★',  w:4,  size:28 },
    { type:'ship',    em:'🚢', nm:'沈没船',   star:'★★★★', w:2,  size:38 },
  ];
  function fishDef(t){ return FISH_POOL.find(f => f.type === t) || FISH_POOL[0]; }
  function decoDef(t){ return DECO_POOL.find(d => d.type === t) || DECO_POOL[0]; }

  // プレビューモードか（?preview=draft）
  function aqPreview() { return (typeof PREVIEW_MODE !== 'undefined' && PREVIEW_MODE); }

  // ===== 🌱残高（mathPrint_v2 と共有：cups×45 + count） =====
  function aqGetPeas() {
    if (aqPreview()) return Infinity; // プレビューは無限
    try {
      const p = JSON.parse(localStorage.getItem('mathPrint_v2') || '{}') || {};
      return (p.peaCupCount || 0) * 45 + (p.peaCount || 0);
    } catch (e) { return 0; }
  }
  // 表示用（無限なら ∞）
  function aqPeasLabel() { return aqPreview() ? '∞' : String(aqGetPeas()); }
  function aqSpendPeas(n) {
    if (aqPreview()) return true; // プレビューは消費しない（無限）
    try {
      const p = JSON.parse(localStorage.getItem('mathPrint_v2') || '{}') || {};
      let total = (p.peaCupCount || 0) * 45 + (p.peaCount || 0);
      if (total < n) return false;
      total -= n;
      p.peaCupCount = Math.floor(total / 45);
      p.peaCount    = total % 45;
      if (!p.done || typeof p.done !== 'object') p.done = {};
      localStorage.setItem('mathPrint_v2', JSON.stringify(p));
      // すごろく用残高にも反映（あれば）
      try {
        const stage = parseInt(localStorage.getItem('sgCurrentStage') || '1');
        const key = stage === 2 ? 'sgSave_v2' : 'sgSave_v1';
        const sv = JSON.parse(localStorage.getItem(key) || '{}') || {};
        if (typeof sv.peas === 'number') {
          sv.peas = Math.max(0, sv.peas - n);
          localStorage.setItem(key, JSON.stringify(sv));
        }
      } catch (e) {}
      return true;
    } catch (e) { return false; }
  }

  // ===== セーブ =====
  function aqLoad() {
    let s;
    try { s = JSON.parse(localStorage.getItem(AQ_KEY) || '{}'); } catch (e) { s = {}; }
    if (!s || typeof s !== 'object') s = {};
    if (!Array.isArray(s.fishes)) s.fishes = [];
    if (!Array.isArray(s.decos))  s.decos  = [];
    if (typeof s.nextId !== 'number') s.nextId = 1;
    return s;
  }
  function aqSave(s) { localStorage.setItem(AQ_KEY, JSON.stringify(s)); }

  // 空腹/弱り要素は廃止：魚は減らさない（そのまま返す）
  function aqProcessTime(s, now) { return s; }
  // ひん死は常になし
  function aqIsDying(f, now) { return false; }
  // 成長係数（小さく生まれ、餌5回で最大）
  function aqSizeFactor(f) {
    const fed = Math.min(f.fed || 0, GROW_MAX);
    return 0.5 + 0.5 * (fed / GROW_MAX); // 50%→100%
  }
  function aqFishSize(f) {
    return Math.round(fishDef(f.type).max * aqSizeFactor(f));
  }

  // ===== 重み付き抽選 =====
  function aqPick(pool) {
    let total = 0;
    for (const p of pool) total += p.w;
    let x = Math.random() * total;
    for (const p of pool) { x -= p.w; if (x <= 0) return p; }
    return pool[0];
  }

  // ===== ガチャ =====
  let aqGachaBusy = false;
  function aqRollGacha(kind) {
    if (aqGachaBusy) return;
    const cost = kind === 'fish' ? FISH_COST : DECO_COST;
    const s = aqLoad();
    if (kind === 'fish' && s.fishes.length >= AQ_MAX_FISH) {
      aqShowToast('水槽がいっぱいです（最大' + AQ_MAX_FISH + '匹）');
      return;
    }
    if (aqGetPeas() < cost) {
      aqShowToast('🌱が足りません（' + cost + '個 必要）');
      return;
    }
    if (!aqSpendPeas(cost)) { aqShowToast('🌱が足りません'); return; }
    aqGachaBusy = true;
    const result = aqPick(kind === 'fish' ? FISH_POOL : DECO_POOL);
    aqShowGachaAnim(kind, result, () => {
      const s2 = aqLoad();
      const now = Date.now();
      if (kind === 'fish') {
        s2.fishes.push({ id: s2.nextId++, type: result.type, fed: 0, lastFed: now });
      } else {
        s2.decos.push({ id: s2.nextId++, type: result.type, x: 0.2 + Math.random() * 0.6, y: 0.78 });
      }
      aqSave(s2);
      aqGachaBusy = false;
      renderAquarium();
    });
  }

  // ===== ガチャ演出 =====
  function aqShowGachaAnim(kind, result, done) {
    document.getElementById('aq-gacha-overlay')?.remove();
    const ov = document.createElement('div');
    ov.id = 'aq-gacha-overlay';
    ov.className = 'aq-gacha-overlay';
    ov.innerHTML = `
      <div class="aq-gacha-box">
        <div class="aq-capsule" id="aq-capsule">🥚</div>
        <div class="aq-gacha-label" id="aq-gacha-label">${kind === 'fish' ? '魚ガチャ' : '装飾ガチャ'}…</div>
      </div>`;
    document.body.appendChild(ov);
    requestAnimationFrame(() => ov.classList.add('show'));
    const cap = ov.querySelector('#aq-capsule');
    cap.style.animation = 'aqShake 0.4s 3';
    setTimeout(() => {
      cap.style.animation = '';
      cap.textContent = result.em;
      cap.style.animation = 'aqPop 0.5s';
      ov.querySelector('#aq-gacha-label').innerHTML = `${result.star} <b>${result.nm}</b> をゲット！`;
      setTimeout(() => { ov.remove(); done && done(); }, 1400);
    }, 1300);
  }

  function aqShowToast(msg) {
    document.getElementById('aq-toast')?.remove();
    const t = document.createElement('div');
    t.id = 'aq-toast';
    t.className = 'aq-toast';
    t.textContent = msg;
    document.body.appendChild(t);
    requestAnimationFrame(() => t.classList.add('show'));
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 2200);
  }

  // ===== 餌やり =====
  // タップした魚に🌱を3粒落とす → 止まって食べる → 成長＆空腹回復 → 再開
  function aqFeed(fishId) {
    const rt = aqFishRT.find(r => r.id === fishId);
    if (!rt || rt.feeding) return;
    rt.feeding = true;
    rt.glow = 20;
    const tank = document.getElementById('aq-tank');
    if (!tank) return;
    const W = tank.clientWidth;
    const fx = Math.max(20, Math.min(W - 20, rt.x + rt.size / 2));
    rt.feedX = fx;
    rt.ateAny = false;
    for (let n = 0; n < 3; n++) {
      aqPeasRT.push({ x: fx + (n - 1) * 6, y: -12 - n * 18, vy: 1.5, owner: rt, eaten: false, el: null });
    }
  }

  // ===== 装飾ドラッグ =====
  let aqDrag = null;
  function aqDecoPointerDown(e) {
    const el = e.currentTarget;
    const id = parseInt(el.dataset.decoId);
    e.preventDefault();
    const tank = document.getElementById('aq-tank');
    const r = tank.getBoundingClientRect();
    aqDrag = { id, el, rect: r };
    el.classList.add('aq-deco-dragging');
    try { el.setPointerCapture(e.pointerId); } catch (e) {}
    el.addEventListener('pointermove', aqDecoPointerMove);
    el.addEventListener('pointerup', aqDecoPointerUp);
    el.addEventListener('pointercancel', aqDecoPointerUp);
  }
  function aqDecoPointerMove(e) {
    if (!aqDrag) return;
    const r = aqDrag.rect;
    let fx = (e.clientX - r.left) / r.width;
    let fy = (e.clientY - r.top) / r.height;
    fx = Math.max(0.03, Math.min(0.97, fx));
    fy = Math.max(0.15, Math.min(0.95, fy));
    aqDrag.el.style.left = (fx * 100) + '%';
    aqDrag.el.style.top  = (fy * 100) + '%';
    aqDrag.fx = fx; aqDrag.fy = fy;
  }
  function aqDecoPointerUp(e) {
    if (!aqDrag) return;
    const el = aqDrag.el;
    el.classList.remove('aq-deco-dragging');
    el.removeEventListener('pointermove', aqDecoPointerMove);
    el.removeEventListener('pointerup', aqDecoPointerUp);
    el.removeEventListener('pointercancel', aqDecoPointerUp);
    if (aqDrag.fx != null) {
      const s = aqLoad();
      const d = s.decos.find(x => x.id === aqDrag.id);
      if (d) { d.x = aqDrag.fx; d.y = aqDrag.fy; aqSave(s); }
    }
    aqDrag = null;
  }

  // ===== 魚ドラッグ（移動）＆タップ（餌やり）判別 =====
  let aqFishDrag = null;
  const AQ_DRAG_THRESHOLD = 6; // この距離を超えたらドラッグ扱い
  function aqFishPointerDown(e) {
    const el = e.currentTarget;
    const id = parseInt(el.dataset.fishId);
    const rt = aqFishRT.find(r => r.id === id);
    if (!rt) return;
    e.preventDefault();
    e.stopPropagation();
    const tank = document.getElementById('aq-tank');
    const rect = tank.getBoundingClientRect();
    aqFishDrag = { id, rt, el, rect, startX: e.clientX, startY: e.clientY, moved: false, pointerId: e.pointerId };
    try { el.setPointerCapture(e.pointerId); } catch (ex) {}
    el.addEventListener('pointermove', aqFishPointerMove);
    el.addEventListener('pointerup', aqFishPointerUp);
    el.addEventListener('pointercancel', aqFishPointerUp);
  }
  function aqFishPointerMove(e) {
    if (!aqFishDrag) return;
    const d = aqFishDrag;
    const dist = Math.abs(e.clientX - d.startX) + Math.abs(e.clientY - d.startY);
    if (!d.moved && dist > AQ_DRAG_THRESHOLD) {
      d.moved = true;
      d.rt.dragging = true;
      d.rt.feedX = null; // 餌やり追従はキャンセル
      d.el.classList.add('aq-fish-dragging');
    }
    if (d.moved) {
      const r = d.rect;
      let x = e.clientX - r.left - d.rt.size / 2;
      let y = e.clientY - r.top  - d.rt.size / 2;
      x = Math.max(0, Math.min(r.width  - d.rt.size, x));
      y = Math.max(0, Math.min(r.height - d.rt.size - 24, y));
      d.rt.x = x; d.rt.y = y;
      d.el.style.transform = 'translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px) scaleX(' + d.rt.face.toFixed(3) + ')';
    }
  }
  function aqFishPointerUp(e) {
    if (!aqFishDrag) return;
    const d = aqFishDrag;
    d.el.classList.remove('aq-fish-dragging');
    d.el.removeEventListener('pointermove', aqFishPointerMove);
    d.el.removeEventListener('pointerup', aqFishPointerUp);
    d.el.removeEventListener('pointercancel', aqFishPointerUp);
    try { d.el.releasePointerCapture(d.pointerId); } catch (ex) {}
    if (d.moved) {
      d.rt.dragging = false; // その場から遊泳再開
    } else {
      aqFeed(d.id);          // 動いていなければタップ＝餌やり
    }
    aqFishDrag = null;
  }

  // ===== 描画 =====
  let aqFishRT = []; // ランタイム魚 [{id,type,em,size,x,y,vx,face,target,phase,eating,glow,feedX,dragging,el}]
  let aqPeasRT = [];
  let aqRaf = null;

  function renderAquarium() {
    const now = Date.now();
    const s = aqProcessTime(aqLoad(), now);
    aqSave(s);

    const peas = aqPeasLabel();
    const fishCount = s.fishes.length;

    // 確率表
    const fishProb = `
      <div class="aq-prob">
        <div class="aq-prob-title">🐟 魚ガチャ 確率</div>
        <div class="aq-prob-row"><span>★ コモン</span><span>60%</span></div>
        <div class="aq-prob-row"><span>★★ アンコモン</span><span>25%</span></div>
        <div class="aq-prob-row"><span>★★★ レア</span><span>10%</span></div>
        <div class="aq-prob-row"><span>★★★★ 超レア</span><span>4%</span></div>
        <div class="aq-prob-row"><span>★★★★★ 伝説</span><span>1%</span></div>
      </div>`;
    const decoProb = `
      <div class="aq-prob">
        <div class="aq-prob-title">🪸 装飾ガチャ 確率</div>
        <div class="aq-prob-row"><span>★ コモン</span><span>60%</span></div>
        <div class="aq-prob-row"><span>★★ アンコモン</span><span>28%</span></div>
        <div class="aq-prob-row"><span>★★★ レア</span><span>10%</span></div>
        <div class="aq-prob-row"><span>★★★★ 宝箱</span><span>2%</span></div>
      </div>`;

    const html = `
      <button class="back-btn" onclick="navigate('home')">← 章一覧に戻る</button>
      <div class="aq-wrap">
        <div class="aq-header">
          <div class="aq-title">🐠 グリンピース水族館</div>
          <div class="aq-stats">
            <span class="aq-stat">🌱 <strong>${peas}</strong></span>
            <span class="aq-stat">🐟 <strong>${fishCount}</strong>/${AQ_MAX_FISH}</span>
          </div>
        </div>

        <div class="aq-tank" id="aq-tank">
          <div class="aq-tank-floor"></div>
        </div>

        <div class="aq-hint">👆 魚をタップで餌やり ／ 装飾はドラッグで移動</div>

        <div class="aq-gacha-area">
          <button class="aq-gacha-btn aq-gacha-fish" onclick="aqRollGacha('fish')">
            <span class="aq-gacha-em">🎰</span>
            <span class="aq-gacha-name">魚ガチャ</span>
            <span class="aq-gacha-cost">🌱${FISH_COST}</span>
          </button>
          <button class="aq-gacha-btn aq-gacha-deco" onclick="aqRollGacha('deco')">
            <span class="aq-gacha-em">🎰</span>
            <span class="aq-gacha-name">装飾ガチャ</span>
            <span class="aq-gacha-cost">🌱${DECO_COST}</span>
          </button>
        </div>

        <div class="aq-prob-area">${fishProb}${decoProb}</div>

        <div class="aq-note">
          魚は小さく生まれ、餌を食べるたびに成長（餌${GROW_MAX}回で最大）。<br>
          餌をあげなくても魚は元気なまま。じっくりコレクションを増やそう！
        </div>
      </div>`;

    const el = document.getElementById('main-content');
    if (el) el.innerHTML = html;

    aqBuildTank(s, now);
    aqStartAnim();
  }

  // 水槽内の魚・装飾DOMを構築
  function aqBuildTank(s, now) {
    const tank = document.getElementById('aq-tank');
    if (!tank) return;
    const W = tank.clientWidth || 320;
    const H = tank.clientHeight || 220;

    // 装飾（底・自由配置・ドラッグ可）
    for (const d of s.decos) {
      const def = decoDef(d.type);
      const el = document.createElement('div');
      el.className = 'aq-deco';
      el.dataset.decoId = d.id;
      el.textContent = def.em;
      el.style.fontSize = def.size + 'px';
      el.style.left = (d.x * 100) + '%';
      el.style.top  = (d.y * 100) + '%';
      el.addEventListener('pointerdown', aqDecoPointerDown);
      tank.appendChild(el);
    }

    // 魚（ランタイム生成）
    aqFishRT = [];
    aqPeasRT = [];
    s.fishes.forEach((f, i) => {
      const def = fishDef(f.type);
      const size = aqFishSize(f);
      const el = document.createElement('div');
      el.className = 'aq-fish';
      el.textContent = def.em;
      el.style.fontSize = size + 'px';
      el.dataset.fishId = f.id;
      el.addEventListener('pointerdown', aqFishPointerDown);
      tank.appendChild(el);

      const dir = (i % 2 === 0) ? 1 : -1;
      const speed = 0.5 + Math.random() * 0.6;
      aqFishRT.push({
        id: f.id, type: f.type, em: def.em, size,
        x: Math.random() * Math.max(1, W - size),
        y: 28 + Math.random() * Math.max(1, H - size - 60),
        vx: speed * dir,
        baseSpeed: speed,
        face: dir > 0 ? -1 : 1,
        target: dir > 0 ? -1 : 1,
        phase: Math.random() * 6.28,
        eating: 0, glow: 0, feedX: null, dragging: false,
        el,
      });
    });
  }

  // ===== アニメーションループ =====
  function aqStartAnim() {
    aqStopAnim();
    const loop = () => {
      // ビューを離れたら停止
      if (typeof state !== 'undefined' && state.view !== 'aquarium') { aqStopAnim(); return; }
      aqTick();
      aqRaf = requestAnimationFrame(loop);
    };
    aqRaf = requestAnimationFrame(loop);
  }
  function aqStopAnim() {
    if (aqRaf) { cancelAnimationFrame(aqRaf); aqRaf = null; }
  }

  function aqTick() {
    const tank = document.getElementById('aq-tank');
    if (!tank) { aqStopAnim(); return; }
    const W = tank.clientWidth, H = tank.clientHeight;

    for (const f of aqFishRT) {
      if (f.dragging) continue; // ドラッグ中は手で位置を制御
      if (f.eating > 0) {
        f.eating--;
      } else {
        if (f.feedX !== null) {
          const cx = f.x + f.size / 2;
          const dx = f.feedX - cx;
          if (Math.abs(dx) < 6) {
            f.vx = (f.vx < 0 ? -0.02 : 0.02);
          } else {
            const sp = f.baseSpeed * 1.6;
            f.vx = dx > 0 ? sp : -sp;
            f.target = dx > 0 ? -1 : 1;
          }
        }
        f.x += f.vx;
        const maxX = W - f.size;
        if (f.x <= 0) { f.x = 0; f.vx = Math.abs(f.vx); f.target = -1; }
        else if (f.x >= maxX) { f.x = maxX; f.vx = -Math.abs(f.vx); f.target = 1; }
      }
      f.face += (f.target - f.face) * 0.08; // ゆるくターン
      f.phase += 0.03;
      const bob = (f.eating > 0 ? 0 : Math.sin(f.phase) * 6);
      f.el.style.transform = 'translate(' + f.x.toFixed(1) + 'px,' + (f.y + bob).toFixed(1) + 'px) scaleX(' + f.face.toFixed(3) + ')';
      if (f.glow > 0) { f.glow--; f.el.style.filter = 'drop-shadow(0 0 6px #ffe27a)'; }
      else if (!f.dying) f.el.style.filter = '';
    }

    // 餌（グリンピース）落下
    for (let p = aqPeasRT.length - 1; p >= 0; p--) {
      const pea = aqPeasRT[p];
      if (pea.eaten) {
        if (pea.el) pea.el.remove();
        aqPeasRT.splice(p, 1);
        continue;
      }
      pea.y += pea.vy;
      const f = pea.owner;
      const fcx = f.x + f.size / 2, fcy = f.y + f.size / 2;
      const cw = Math.max(f.size * 0.7, 20); // 当たり判定（小さい魚でも届く）
      if (Math.abs(pea.x - fcx) < cw && Math.abs(pea.y - fcy) < cw) {
        pea.eaten = true;
        f.eating = 24;
        f.ateAny = true;
      } else if (pea.y > H - 22) {
        pea.eaten = true; // 底に落ちて消える
      }
      if (!pea.el) {
        pea.el = document.createElement('div');
        pea.el.className = 'aq-pea';
        pea.el.textContent = '🌱';
        tank.appendChild(pea.el);
      }
      if (!pea.eaten) pea.el.style.transform = 'translate(' + (pea.x - 8).toFixed(1) + 'px,' + pea.y.toFixed(1) + 'px)';
    }

    // 餌やり中の魚で、所有する餌が全部消えたら食事終了→成長＆空腹回復
    for (const f of aqFishRT) {
      if (f.feedX !== null && !aqPeasRT.some(q => q.owner === f)) {
        f.feedX = null;
        // 食事中に速度を落としていたので、通常の遊泳速度に戻す（止まったままを防ぐ）
        f.vx = (f.vx < 0 ? -1 : 1) * f.baseSpeed;
        if (f.ateAny) aqOnFishEat(f);
        else f.feeding = false; // 全部こぼれた場合は成長なしで解除
      }
    }
  }

  // 魚が食事を終えた → 餌回数+1・空腹リセット・成長
  function aqOnFishEat(rt) {
    rt.feeding = false;
    const s = aqLoad();
    const f = s.fishes.find(x => x.id === rt.id);
    if (!f) return;
    f.fed = (f.fed || 0) + 1;
    f.lastFed = Date.now();
    aqSave(s);
    // 見た目を更新（成長・ひん死解除）
    rt.dying = false;
    rt.el.classList.remove('aq-fish-dying');
    const newSize = aqFishSize(f);
    if (newSize !== rt.size) {
      rt.size = newSize;
      // font-size の CSS transition でなめらかに大きくする
      // （transform は位置制御に使っているので触らない）
      rt.el.style.fontSize = newSize + 'px';
    }
    // ヘッダーの🌱残高は変わらないが、念のため再描画はしない（演出維持）
  }

  // ===== ホームバナー用テキスト（app.js から参照） =====
  window.aqHomeBannerSub = function () {
    const s = aqProcessTime(aqLoad(), Date.now());
    return `🐟 ${s.fishes.length}/${AQ_MAX_FISH}匹　🌱${aqPeasLabel()}`;
  };

  // グローバル公開
  window.renderAquarium = renderAquarium;
  window.aqRollGacha = aqRollGacha;
  window.aqStopAnim = aqStopAnim;
})();
