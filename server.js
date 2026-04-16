// ============================================================
// server.js  ─ 数学プリントHP ローカルサーバー
// 起動方法:
//   C:\Users\（高津中）先生012\Desktop\node-v24.14.1-win-x64\node.exe server.js
// ============================================================

const http  = require('http');
const fs    = require('fs');
const path  = require('path');
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
