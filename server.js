const http = require('http');
const fs   = require('fs');
const path = require('path');

const PORT      = 8765;
const ROOT      = __dirname;
const DATA_FILE = path.join(ROOT, 'data.json');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

const server = http.createServer((req, res) => {
  // CORS（本地用，宽松即可）
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  // POST /shutdown — 安全关闭
  if (req.method === 'POST' && req.url === '/shutdown') {
    res.writeHead(200); res.end(JSON.stringify({ ok: true }));
    console.log('\n[关闭] 收到关闭指令...');
    setTimeout(() => process.exit(0), 200);
    return;
  }

  // POST /save — 写入 data.json
  if (req.method === 'POST' && req.url === '/save') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        JSON.parse(body);
        fs.writeFile(DATA_FILE, body, 'utf8', err => {
          if (err) {
            console.error('[save] 写入失败:', err.message);
            res.writeHead(500); res.end(JSON.stringify({ ok: false, error: err.message }));
          } else {
            res.writeHead(200); res.end(JSON.stringify({ ok: true }));
          }
        });
      } catch (e) {
        res.writeHead(400); res.end(JSON.stringify({ ok: false, error: 'invalid json' }));
      }
    });
    return;
  }

  // GET 静态文件
  let urlPath = req.url.split('?')[0];
  if (urlPath === '/') urlPath = '/index.html';
  const filePath = path.join(ROOT, urlPath);

  // 安全检查：不允许路径穿越
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404); res.end('Not found'); return;
    }
    const ext  = path.extname(filePath);
    const mime = MIME[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mime });
    res.end(data);
  });
});

server.listen(PORT, '127.0.0.1', () => {
  const url = `http://localhost:${PORT}`;
  console.log(`FC26 进化追踪器已启动：${url}`);
  console.log('请勿直接关闭此窗口，在此窗口按任意键可安全关闭。\n');

  const { exec } = require('child_process');
  const firefox = `"D:\\Mozilla Firefox\\firefox.exe"`;
  exec(`${firefox} ${url}`, err => {
    if (err) {
      console.log('Firefox 未找到，尝试默认浏览器...');
      exec(`start ${url}`);
    }
  });
});
