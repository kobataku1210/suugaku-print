// ============================================================
// server.js  ─ 数学プリントHP ローカルサーバー
// 起動方法:
//   C:\Users\（高津中）先生012\Desktop\node-v24.14.1-win-x64\node.exe server.js
// ============================================================

const http   = require('http');
const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');

const PORT     = 3000;
const BASE_DIR = __dirname;
const DATA_FILE = path.join(BASE_DIR, 'questions.json');

// MIMEタイプ
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css' : 'text/css; charset=utf-8',
  '.js'  : 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.pdf' : 'application/pdf',
  '.png' : 'image/png',
  '.jpg' : 'image/jpeg',
};

// リクエストボディを読み取る
function readBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => resolve(body));
  });
}

const server = http.createServer(async (req, res) => {
  const url = req.url.split('?')[0];

  // ===== API: 問題データ取得 =====
  if (req.method === 'GET' && url === '/api/questions') {
    try {
      const data = fs.readFileSync(DATA_FILE, 'utf8');
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(data);
    } catch {
      res.writeHead(404);
      res.end('questions.json not found');
    }
    return;
  }

  // ===== API: 問題データ保存 =====
  if (req.method === 'POST' && url === '/api/questions') {
    const body = await readBody(req);
    try {
      const payload = JSON.parse(body);
      // パスワード確認
      if (payload.password !== payload.adminPassword) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'パスワードが違います' }));
        return;
      }
      fs.writeFileSync(DATA_FILE, JSON.stringify(payload.data, null, 2), 'utf8');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: e.message }));
    }
    return;
  }

  // ===== API: Excelから questions.json に変換 =====
  if (req.method === 'POST' && url === '/api/import-excel') {
    const body = await readBody(req);
    try {
      const payload = JSON.parse(body);
      if (payload.password !== 'sensei2024') {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'パスワードが違います' }));
        return;
      }
      const scriptPath = path.join(BASE_DIR, '..', 'excel_to_json.py');
      execFile('python3', [scriptPath], {
        cwd: path.join(BASE_DIR, '..'),
        env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
      }, (err, stdout, stderr) => {
        if (err) {
          res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ ok: false, error: stderr || err.message }));
          return;
        }
        try {
          const result = JSON.parse(stdout);
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify(result));
        } catch {
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ ok: true, message: stdout.trim() }));
        }
      });
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, error: e.message }));
    }
    return;
  }

  // ===== API: GitHub に push =====
  if (req.method === 'POST' && url === '/api/git-push') {
    const body = await readBody(req);
    try {
      const payload = JSON.parse(body);
      if (payload.password !== 'sensei2024') {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'パスワードが違います' }));
        return;
      }
      // git add → commit → push を順番に実行
      const run = (cmd, args) => new Promise((resolve, reject) => {
        execFile(cmd, args, { cwd: BASE_DIR }, (err, stdout, stderr) => {
          if (err) reject(stderr || err.message);
          else resolve(stdout);
        });
      });
      await run('git', ['add', 'index.html', 'app.js', 'style.css', 'data.js', 'questions.json', 'admin.html']);
      await run('git', ['commit', '--allow-empty', '-m', '問題を更新']);
      await run('git', ['push', 'origin', 'main']);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: String(e) }));
    }
    return;
  }

  // ===== 静的ファイル配信 =====
  let filePath = path.join(BASE_DIR, url === '/' ? 'index.html' : url);
  // ディレクトリの場合は index.html
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.html');
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found: ' + url);
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
});

// ============================================================
// WebSocket 最小実装（外部モジュール不要）
// ============================================================

function wsHandshake(socket, req) {
  const key    = req.headers['sec-websocket-key'];
  const accept = crypto.createHash('sha1')
    .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
    .digest('base64');
  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
    'Upgrade: websocket\r\n' +
    'Connection: Upgrade\r\n' +
    'Sec-WebSocket-Accept: ' + accept + '\r\n\r\n'
  );
}

function wsSend(socket, obj) {
  if (!socket || socket.destroyed) return;
  try {
    const payload = Buffer.from(JSON.stringify(obj), 'utf8');
    const len     = payload.length;
    let   header;
    if (len < 126) {
      header    = Buffer.alloc(2);
      header[0] = 0x81; header[1] = len;
    } else {
      header    = Buffer.alloc(4);
      header[0] = 0x81; header[1] = 126;
      header.writeUInt16BE(len, 2);
    }
    socket.write(Buffer.concat([header, payload]));
  } catch (e) {}
}

function wsParseFrames(buffer) {
  const messages = [];
  let   offset   = 0;
  while (offset + 2 <= buffer.length) {
    const b0     = buffer[offset];
    const b1     = buffer[offset + 1];
    const opcode = b0 & 0x0f;
    const masked = !!(b1 & 0x80);
    let   plen   = b1 & 0x7f;
    let   hlen   = 2;
    if (plen === 126) {
      if (offset + 4 > buffer.length) break;
      plen = buffer.readUInt16BE(offset + 2); hlen = 4;
    } else if (plen === 127) {
      if (offset + 10 > buffer.length) break;
      plen = buffer.readUInt32BE(offset + 6); hlen = 10;
    }
    const maskOff = offset + hlen;
    const dataOff = masked ? maskOff + 4 : maskOff;
    if (dataOff + plen > buffer.length) break;
    if (opcode === 8) { messages.push({ opcode: 8 }); offset = dataOff + plen; break; }
    if (opcode === 1 || opcode === 0) {
      const data = Buffer.from(buffer.slice(dataOff, dataOff + plen));
      if (masked) {
        const mask = buffer.slice(maskOff, maskOff + 4);
        for (let i = 0; i < data.length; i++) data[i] ^= mask[i % 4];
      }
      messages.push({ opcode: 1, data: data.toString('utf8') });
    }
    offset = dataOff + plen;
  }
  return { messages, remaining: buffer.slice(offset) };
}

// ============================================================
// 対戦部屋管理
// ============================================================

const battleRooms = {};       // code -> room
const socketRoom  = new Map(); // socket -> { code, pi }

function btNorm(str) {
  if (!str) return '';
  return String(str).trim()
    .replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
    .replace(/[ａ-ｚ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
    .replace(/[Ａ-Ｚ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
    .replace(/－/g, '-').replace(/＋/g, '+').replace(/　/g, ' ');
}

function btGetAns(q) {
  return (q.b && String(q.b).trim()) ? q.b : q.a;
}

function btMakeCode() {
  for (let i = 0; i < 200; i++) {
    const c = String(1000 + Math.floor(Math.random() * 9000));
    if (!battleRooms[c]) return c;
  }
  return String(Date.now()).slice(-4);
}

function btPickQuestions(chIdx, secIdx, count) {
  try {
    const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    const sec  = data.chapters[chIdx].sections[secIdx];
    const all  = [];
    ['basic', 'standard', 'advanced'].forEach(lv => {
      if (sec[lv]) sec[lv].forEach(q => all.push({ q: q.q, a: q.a, b: q.b || '' }));
    });
    for (let i = all.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [all[i], all[j]] = [all[j], all[i]];
    }
    return all.slice(0, Math.min(count, all.length));
  } catch (e) { return []; }
}

function btNextQuestion(room) {
  clearTimeout(room.timer);
  // 問題が不足したら補充
  if (room.qIdx >= room.questions.length) {
    const more = btPickQuestions(room.chIdx, room.secIdx, 10);
    if (more.length) room.questions = room.questions.concat(more);
    else return;
  }
  const q = room.questions[room.qIdx];
  room.locked  = [false, false];
  room.currentCorrect = btNorm(btGetAns(q));

  const base = {
    type: 'question',
    question: { q: q.q, a: q.a, b: q.b },
    qNum: room.qIdx + 1,
    timeLimit: 30
  };
  room.sockets.forEach((s, i) => {
    if (s && !s.destroyed)
      wsSend(s, { ...base, myScore: room.score[i], opScore: room.score[1 - i] });
  });

  room.timer = setTimeout(() => {
    // タイムアウト
    const correct = btGetAns(q);
    room.sockets.forEach((s, i) => {
      if (s && !s.destroyed)
        wsSend(s, { type: 'timeout', correct, myScore: room.score[i], opScore: room.score[1 - i] });
    });
    room.qIdx++;
    setTimeout(() => btNextQuestion(room), 3500);
  }, 30000);
}

function btHandleMsg(socket, raw) {
  let d; try { d = JSON.parse(raw); } catch { return; }
  const info = socketRoom.get(socket);

  // ---- 部屋作成 ----
  if (d.type === 'create') {
    const qs = btPickQuestions(d.chapter || 0, d.section || 0, 15);
    if (!qs.length) { wsSend(socket, { type: 'error', message: '問題が見つかりません' }); return; }
    const code = btMakeCode();
    battleRooms[code] = {
      code, sockets: [socket, null],
      names: [d.name || 'プレイヤー1', ''],
      chIdx: d.chapter || 0, secIdx: d.section || 0,
      questions: qs, qIdx: 0, score: [0, 0],
      locked: [false, false], currentCorrect: '',
      timer: null, state: 'waiting'
    };
    socketRoom.set(socket, { code, pi: 0 });
    wsSend(socket, { type: 'created', code });
    return;
  }

  // ---- 部屋参加 ----
  if (d.type === 'join') {
    const room = battleRooms[d.code];
    if (!room)             { wsSend(socket, { type: 'error', message: 'ルームが見つかりません' }); return; }
    if (room.sockets[1])   { wsSend(socket, { type: 'error', message: 'このルームは満員です' }); return; }
    if (room.state !== 'waiting') { wsSend(socket, { type: 'error', message: 'ゲームはすでに開始しています' }); return; }
    room.sockets[1] = socket;
    room.names[1]   = d.name || 'プレイヤー2';
    socketRoom.set(socket, { code: d.code, pi: 1 });
    wsSend(room.sockets[0], { type: 'opponent_joined', opName: room.names[1] });
    wsSend(socket,           { type: 'joined',         opName: room.names[0] });
    room.state = 'starting';
    setTimeout(() => {
      if (!battleRooms[room.code]) return;
      room.state = 'playing';
      btNextQuestion(room);
    }, 3500);
    return;
  }

  // ---- 回答 ----
  if (d.type === 'answer') {
    if (!info) return;
    const room = battleRooms[info.code];
    if (!room || room.state !== 'playing') return;
    const pi = info.pi;
    if (room.locked[pi]) return;

    const q       = room.questions[room.qIdx];
    const entered = btNorm(d.answer);

    if (entered === room.currentCorrect) {
      // ✅ 正解
      clearTimeout(room.timer);
      room.score[pi]++;
      const correct = btGetAns(q);
      room.sockets.forEach((s, i) => {
        if (s && !s.destroyed)
          wsSend(s, {
            type: 'round_end',
            result: i === pi ? 'win' : 'lose',
            correct,
            myScore: room.score[i], opScore: room.score[1 - i]
          });
      });
      room.qIdx++;

      if (room.score[pi] >= 3) {
        // 🏆 ゲーム終了
        room.state = 'finished';
        setTimeout(() => {
          room.sockets.forEach((s, i) => {
            if (s && !s.destroyed)
              wsSend(s, {
                type: 'gameover',
                result: i === pi ? 'win' : 'lose',
                myScore: room.score[i], opScore: room.score[1 - i]
              });
          });
          setTimeout(() => delete battleRooms[info.code], 30000);
        }, 2500);
      } else {
        setTimeout(() => btNextQuestion(room), 2500);
      }
    } else {
      // ✗ 不正解 → ロック
      room.locked[pi] = true;
      wsSend(socket, { type: 'wrong' });

      if (room.locked[0] && room.locked[1]) {
        // 両方不正解
        clearTimeout(room.timer);
        const correct = btGetAns(q);
        room.sockets.forEach((s, i) => {
          if (s && !s.destroyed)
            wsSend(s, { type: 'both_wrong', correct, myScore: room.score[i], opScore: room.score[1 - i] });
        });
        room.qIdx++;
        setTimeout(() => btNextQuestion(room), 3500);
      }
    }
    return;
  }
}

function btDisconnect(socket) {
  const info = socketRoom.get(socket);
  if (!info) return;
  socketRoom.delete(socket);
  const room = battleRooms[info.code];
  if (!room) return;
  clearTimeout(room.timer);
  const other = room.sockets[1 - info.pi];
  if (other && !other.destroyed) wsSend(other, { type: 'disconnect' });
  delete battleRooms[info.code];
}

// WebSocket アップグレード処理
server.on('upgrade', (req, socket) => {
  if (req.url !== '/battle-ws') { socket.destroy(); return; }
  wsHandshake(socket, req);
  let buf = Buffer.alloc(0);
  socket.on('data', chunk => {
    buf = Buffer.concat([buf, chunk]);
    const { messages, remaining } = wsParseFrames(buf);
    buf = remaining;
    for (const frame of messages) {
      if (frame.opcode === 8) { btDisconnect(socket); socket.destroy(); return; }
      if (frame.data) btHandleMsg(socket, frame.data);
    }
  });
  socket.on('close', () => btDisconnect(socket));
  socket.on('error', () => btDisconnect(socket));
});

server.listen(PORT, '0.0.0.0', () => {
  // 自分のIPアドレスを表示
  const { networkInterfaces } = require('os');
  const nets = networkInterfaces();
  let localIP = 'localhost';
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        localIP = net.address;
      }
    }
  }
  console.log('========================================');
  console.log('  数学プリントHP サーバー起動中');
  console.log('========================================');
  console.log('  先生用管理画面:');
  console.log('  http://localhost:' + PORT + '/admin.html');
  console.log('');
  console.log('  生徒用アクセスURL:');
  console.log('  http://' + localIP + ':' + PORT);
  console.log('========================================');
  console.log('  終了するには Ctrl+C を押してください');
  console.log('========================================');
});
