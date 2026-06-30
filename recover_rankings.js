// ============================================================
// recover_rankings.js
// ------------------------------------------------------------
// 過去の Git 履歴から questions.json の studentBestName/Time と
// cardMatchStudentBestName/Time を遡って収集し、各単元の
// studentBestList と cardMatchStudentBestList にマージ（上位3名）
// して保存するワンショットスクリプト。
//
// 使い方:
//   node.exe recover_rankings.js          # dry-run（差分表示のみ・書き込みなし）
//   node.exe recover_rankings.js --apply  # questions.json に書き込む（バックアップ自動作成）
// ============================================================

const { execSync } = require('child_process');
const fs   = require('fs');
const path = require('path');

const APPLY = process.argv.includes('--apply');
const REPO  = __dirname;
const FILE  = path.join(REPO, 'questions.json');

// ---------- ranking helpers ----------
// 名前の表記ゆれ（全角空白・連続空白）を正規化してから重複判定する。
// 過去データには「2組　H君」と「2組　 H君」のような微差があり、これらを同一視するため。
function normName(s) {
  return String(s).replace(/[　\s]+/g, ' ').trim();
}
function rkMerge(list, entry) {
  const arr = Array.isArray(list) ? list.slice() : [];
  if (!entry || !entry.name || entry.time == null) return arr;
  const name = normName(entry.name);
  const time = Math.round(parseFloat(entry.time) * 10) / 10;
  if (!name || isNaN(time)) return arr;
  const filtered = arr.filter(e => e && e.name && normName(e.name) !== name);
  filtered.push({ name, time });
  filtered.sort((a, b) => a.time - b.time);
  return filtered.slice(0, 3);
}

// ---------- git 操作 ----------
function getCommitHashes() {
  // 古い順（--reverse）でコミットハッシュを取得
  const out = execSync('git log --reverse --pretty=format:%H -- questions.json',
    { cwd: REPO, encoding: 'utf8' });
  return out.trim().split('\n').filter(Boolean);
}

function getCommitJson(hash) {
  try {
    const txt = execSync(`git show ${hash}:questions.json`,
      { cwd: REPO, encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 });
    return JSON.parse(txt);
  } catch (e) {
    return null;
  }
}

// ---------- NEWS タイトルからの抽出 ----------
// 形式: 「<名前> が第<章>章「<節タイトル>」を <タイム>秒 で更新！」
const SEC_NEWS_RE = /^(.+?)\s*が\s*第(\d+)章「(.+?)」を\s*([\d.]+)\s*秒\s*で更新！?\s*$/;
// 形式: 「<名前> がカードマッチを <タイム>秒 で更新！」
const CM_NEWS_RE  = /^(.+?)\s*が\s*カードマッチを\s*([\d.]+)\s*秒\s*で更新！?\s*$/;

// ---------- 1. 全コミットを走査して記録を収集 ----------
const hashes = getCommitHashes();
console.log(`[Step1] questions.json を更新したコミット: ${hashes.length}件`);

const cmEntries  = [];                 // [{name, time}]
const secEntries = new Map();          // key=`${chId}::${secTitle}` -> [{name, time}, ...]

function pushSec(chId, secTitle, name, time) {
  const key = `${chId}::${secTitle}`;
  if (!secEntries.has(key)) secEntries.set(key, []);
  secEntries.get(key).push({ name, time });
}

let scanned = 0;
for (const h of hashes) {
  const data = getCommitJson(h);
  if (!data) continue;
  scanned++;

  // --- カードマッチ：直接フィールド ---
  if (data.cardMatchStudentBestName && data.cardMatchStudentBestTime != null) {
    cmEntries.push({ name: String(data.cardMatchStudentBestName), time: parseFloat(data.cardMatchStudentBestTime) });
  }
  // --- カードマッチ：新形式リスト（あれば）---
  if (Array.isArray(data.cardMatchStudentBestList)) {
    for (const e of data.cardMatchStudentBestList) {
      if (e && e.name && e.time != null) cmEntries.push({ name: e.name, time: e.time });
    }
  }

  // --- 章・節：直接フィールド & 新形式リスト ---
  for (const ch of (data.chapters || [])) {
    for (const sec of (ch.sections || [])) {
      if (sec.studentBestName && sec.studentBestTime != null) {
        pushSec(ch.id, sec.title, String(sec.studentBestName), parseFloat(sec.studentBestTime));
      }
      if (Array.isArray(sec.studentBestList)) {
        for (const e of sec.studentBestList) {
          if (e && e.name && e.time != null) pushSec(ch.id, sec.title, e.name, e.time);
        }
      }
    }
  }

  // --- NEWS タイトルからも抽出（10件しか残らないが、コミット時点で残っていたものは拾える）---
  for (const n of (data.news || [])) {
    const t = n && typeof n.title === 'string' ? n.title : '';
    if (!t) continue;
    let m;
    if ((m = t.match(SEC_NEWS_RE))) {
      pushSec(parseInt(m[2]), m[3], m[1].trim(), parseFloat(m[4]));
    } else if ((m = t.match(CM_NEWS_RE))) {
      cmEntries.push({ name: m[1].trim(), time: parseFloat(m[2]) });
    }
  }
}
console.log(`[Step2] スキャン成功: ${scanned}件 / 収集: カードマッチ ${cmEntries.length}エントリ / 単元 ${secEntries.size}種`);

// ---------- 3. 現在の questions.json に過去エントリをマージ ----------
const current = JSON.parse(fs.readFileSync(FILE, 'utf8'));

// カードマッチ
const beforeCm = JSON.parse(JSON.stringify(current.cardMatchStudentBestList || []));
let cmList = Array.isArray(current.cardMatchStudentBestList) ? current.cardMatchStudentBestList.slice() : [];
for (const e of cmEntries) cmList = rkMerge(cmList, e);
current.cardMatchStudentBestList = cmList;
if (cmList.length) {
  current.cardMatchStudentBestName = cmList[0].name;
  current.cardMatchStudentBestTime = cmList[0].time;
} else {
  current.cardMatchStudentBestName = null;
  current.cardMatchStudentBestTime = null;
}

// 章・節（章id + 節title で照合）
const sectionDiffs = [];
for (const ch of (current.chapters || [])) {
  for (const sec of (ch.sections || [])) {
    const key  = `${ch.id}::${sec.title}`;
    const past = secEntries.get(key) || [];
    const before = Array.isArray(sec.studentBestList) ? JSON.parse(JSON.stringify(sec.studentBestList)) : [];
    let list = before.slice();
    for (const e of past) list = rkMerge(list, e);
    sec.studentBestList = list;
    if (list.length) {
      sec.studentBestName = list[0].name;
      sec.studentBestTime = list[0].time;
    } else {
      sec.studentBestName = null;
      sec.studentBestTime = null;
    }
    if (JSON.stringify(before) !== JSON.stringify(list)) {
      sectionDiffs.push({ ch: ch.id, title: sec.title, before, after: list });
    }
  }
}

// 現在の questions.json に存在しない節のキー（章リネームなど）を警告
const currentKeys = new Set();
for (const ch of (current.chapters || [])) {
  for (const sec of (ch.sections || [])) currentKeys.add(`${ch.id}::${sec.title}`);
}
const orphanKeys = Array.from(secEntries.keys()).filter(k => !currentKeys.has(k));

// ---------- 4. 結果表示 ----------
function fmtList(list) {
  if (!list.length) return '(空)';
  return list.map((e, i) => `${i+1}位 ${e.name} ${e.time.toFixed(1)}秒`).join(' / ');
}

console.log('\n========== カードマッチ ==========');
console.log('  Before:', fmtList(beforeCm));
console.log('  After :', fmtList(current.cardMatchStudentBestList));

console.log('\n========== 単元（変更があるものだけ） ==========');
if (!sectionDiffs.length) {
  console.log('  (変更なし)');
} else {
  for (const d of sectionDiffs) {
    console.log(`\n第${d.ch}章「${d.title}」`);
    console.log('  Before:', fmtList(d.before));
    console.log('  After :', fmtList(d.after));
  }
}

if (orphanKeys.length) {
  console.log('\n[警告] 現在の questions.json に対応する節が見つからない過去記録:');
  for (const k of orphanKeys) console.log('  -', k);
  console.log('  → 章/節がリネーム or 削除された可能性。これらは反映されません。');
}

// ---------- 5. 書き込み or dry-run ----------
if (APPLY) {
  const bk = FILE + '.bak.' + Date.now();
  fs.copyFileSync(FILE, bk);
  fs.writeFileSync(FILE, JSON.stringify(current, null, 2), 'utf8');
  console.log(`\n✓ 書き込み完了: ${FILE}`);
  console.log(`✓ バックアップ : ${bk}`);
} else {
  console.log('\n[Dry-run] 反映するには --apply を付けて再実行してください:');
  console.log('  node.exe recover_rankings.js --apply');
}
