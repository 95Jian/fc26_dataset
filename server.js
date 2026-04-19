const http = require('http');
const fs   = require('fs');
const path = require('path');

const PORT      = 8765;
const ROOT      = __dirname;
const DATA_FILE = path.join(ROOT, 'data.json');
const EXPORT_DIR = ROOT;

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

  // POST /shutdown — 安全关闭并导出
  if (req.method === 'POST' && req.url === '/shutdown') {
    res.writeHead(200); res.end(JSON.stringify({ ok: true }));
    console.log('\n[关闭] 收到关闭指令...');
    doExportOnExit();
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

/* ---- 关闭时增量导出 ---- */
function calcNextVersion(appData) {
  const d = new Date();
  const todayPrefix = `${d.getMonth()+1}.${d.getDate()}`;
  const cur = appData.version || '';
  // 今天的日期前缀相同：第三位 +1；否则新的一天从 0 开始
  const seq = cur.startsWith(todayPrefix + '.')
    ? parseInt(cur.split('.')[2] || '0') + 1
    : 0;
  return `${todayPrefix}.${seq}`;
}

function doExportOnExit() {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    const appData = JSON.parse(raw);

    const since = appData.lastExportTs || 0;
    const changed = (appData.players || []).filter(p =>
      (p.updatedAt && p.updatedAt > since) ||
      (p.deletedAt && p.deletedAt > since)
    );

    if (!changed.length) {
      console.log('\n[导出] 无修改，跳过生成 export.txt');
      return;
    }

    const lv  = appData.lastExportVersion || appData.version;
    const nv  = calcNextVersion(appData);
    const now = Date.now();

    // 字段缩写压缩体积：i=id n=name u=url p=positions k=pos r=rating ua=updatedAt da=deletedAt
    const compact = changed.map(p => {
      const o = { i: p.id, n: p.name };
      if (p.url)       o.u  = p.url;
      if (p.positions) o.p  = p.positions.map(x => x.rating != null ? { k: x.pos, r: x.rating } : { k: x.pos });
      if (p.updatedAt) o.ua = p.updatedAt;
      if (p.deletedAt) o.da = p.deletedAt;
      return o;
    });
    const payload = { v: nv, pv: lv, c: compact };
    const text = 'FC26:' + JSON.stringify(payload);

    const exportFile = path.join(EXPORT_DIR, `${nv}_export.txt`);
    fs.writeFileSync(exportFile, text, 'utf8');

    // 更新 lastExportTs 和版本号，避免下次重复导出相同内容
    appData.version           = nv;
    appData.lastExportVersion = nv;
    appData.lastExportTs      = now;
    fs.writeFileSync(DATA_FILE, JSON.stringify(appData, null, 2), 'utf8');

    const chgN    = changed.filter(p => !p.deletedAt).length;
    const deleted = changed.filter(p => p.deletedAt).length;
    console.log(`\n[导出] 已生成 ${nv}_export.txt（变动 ${chgN} / 删除 ${deleted}）`);
    console.log(`[导出] 版本 ${lv} → ${nv}`);
  } catch (e) {
    console.error('\n[导出] 生成失败:', e.message);
  }
}

server.listen(PORT, '127.0.0.1', () => {
  const url = `http://localhost:${PORT}`;
  console.log(`FC26 进化追踪器已启动：${url}`);
  console.log('请勿直接关闭此窗口，在此窗口按任意键可安全关闭并自动导出。\n');

  const { exec } = require('child_process');
  const firefox = `"D:\\Mozilla Firefox\\firefox.exe"`;
  exec(`${firefox} ${url}`, err => {
    if (err) {
      console.log('Firefox 未找到，尝试默认浏览器...');
      exec(`start ${url}`);
    }
  });
});
