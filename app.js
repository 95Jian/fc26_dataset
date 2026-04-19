const POSITIONS = ['GK','CB','LB','RB','CDM','CM','CAM','LM','RM','LW','RW','ST'];

let appData = null;
let sortKey = 'name', sortAsc = true, filterPos = '';

async function initData() {
  try {
    const resp = await fetch('data.json?' + Date.now());
    if (resp.ok) {
      appData = await resp.json();
      return;
    }
  } catch {}
  // 服务器不可用时初始化空数据
  const d = new Date();
  appData = { version: `${d.getMonth()+1}.${d.getDate()}.0`, lastExportVersion: '', lastExportTs: 0, players: [] };
}

function getPlayer(id) { return appData.players.find(p => p.id === id); }
function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2,6); }
function nowTs() { return Date.now(); }


/* ---- pos filters ---- */
function renderPosFilters() {
  const c = document.getElementById('pos-filters');
  c.innerHTML = [['全部',''],...POSITIONS.map(p=>[p,p])].map(([l,v])=>
    `<button class="pos-btn${filterPos===v?' active':''}" onclick="setFilterPos('${v}')">${l}</button>`
  ).join('');
}
function setFilterPos(p) { filterPos = p; renderPosFilters(); renderTable(); }

/* ---- rating tier by rank ---- */
const WIDE_POSITIONS = new Set(['CM','CDM','CB']);
function buildRankMap() {
  const posRatings = {};
  for (const p of appData.players) {
    if (p.deletedAt) continue;
    for (const x of (p.positions||[])) {
      if (x.rating == null) continue;
      if (!posRatings[x.pos]) posRatings[x.pos] = [];
      posRatings[x.pos].push(x.rating);
    }
  }
  const rankMap = {};
  for (const pos in posRatings) {
    const sorted = [...new Set(posRatings[pos])].sort((a,b) => b - a);
    const tierMap = {};
    const wide = WIDE_POSITIONS.has(pos);
    for (let i = 0; i < sorted.length; i++) {
      const tier = wide ? Math.min(5, Math.floor(i / 2) + 1) : Math.min(5, i + 1);
      tierMap[sorted[i]] = tier;
    }
    rankMap[pos] = tierMap;
  }
  return rankMap;
}

/* ---- render table ---- */
function renderTable() {
  const q = document.getElementById('search-input').value.trim().toLowerCase();
  const tbody = document.getElementById('player-tbody');
  let rows = appData.players.filter(p => !p.deletedAt);
  if (filterPos) rows = rows.filter(p => (p.positions||[]).some(x => x.pos === filterPos));
  if (q) rows = rows.filter(p => p.name.toLowerCase().includes(q));
  if (filterPos) {
    rows.sort((a,b) => {
      const ra = (a.positions||[]).find(x => x.pos === filterPos);
      const rb = (b.positions||[]).find(x => x.pos === filterPos);
      const va = ra && ra.rating != null ? ra.rating : -1;
      const vb = rb && rb.rating != null ? rb.rating : -1;
      return vb - va;
    });
  } else {
    rows.sort((a,b) => {
      let va = a[sortKey]??'', vb = b[sortKey]??'';
      va = String(va).toLowerCase(); vb = String(vb).toLowerCase();
      return sortAsc ? va.localeCompare(vb) : vb.localeCompare(va);
    });
  }
  const th = document.getElementById('th-name');
  if (th) { th.classList.toggle('sorted', sortKey==='name' && !filterPos); th.querySelector('.si').textContent = (!filterPos && sortKey==='name')?(sortAsc?'↑':'↓'):'↕'; }
  if (!rows.length) {
    const msg = filterPos ? `没有 ${filterPos} 位置的球员` : (q ? '没有匹配的球员' : '还没有球员，点击右上角"添加球员"');
    tbody.innerHTML = `<tr class="empty-row"><td colspan="4">${msg}</td></tr>`; return;
  }
  const rankMap = buildRankMap();
  tbody.innerHTML = rows.map(p => {
    const positions = p.positions || [];
    const tagsHtml = positions.map(x => {
      const tm = rankMap[x.pos];
      const tier = (tm && x.rating != null && tm[x.rating]) ? ' tier' + tm[x.rating] : ' tier5';
      const hi = filterPos && x.pos === filterPos ? ' highlighted' : '';
      const cls = tier + hi;
      const rating = x.rating != null ? `<span class="tag-rating">${Number(x.rating).toFixed(1)}</span>` : '';
      return `<span class="pos-tag${cls}">${esc(x.pos)}${rating}</span>`;
    }).join('');
    const addBtn = `<span class="pos-tag-add" ondblclick="event.stopPropagation()" onclick="openEditPos('${p.id}')">＋</span>`;
    const urlHtml = p.url
      ? `<a href="${esc(p.url)}" target="_blank" title="${esc(p.url)}">${esc(p.url)}</a>`
      : `<span style="color:var(--text3);font-size:12px">— 双击添加</span>`;
    return `<tr data-id="${p.id}">
      <td class="col-name editable" ondblclick="startEdit(this,'${p.id}','name')">${esc(p.name)}</td>
      <td class="col-url  editable" ondblclick="startEdit(this,'${p.id}','url')">${urlHtml}</td>
      <td class="col-pos" ondblclick="openEditPos('${p.id}')">
        <div class="pos-tags">${tagsHtml}${addBtn}</div>
      </td>
      <td class="col-del"><button class="del-btn" title="删除" onclick="deletePlayer('${p.id}')">×</button></td>
    </tr>`;
  }).join('');
}

function renderVersion() { document.getElementById('ver-display').textContent = appData.version; }
function render() { renderPosFilters(); renderTable(); renderVersion(); }
function sortBy(key) { if (sortKey===key) sortAsc=!sortAsc; else {sortKey=key;sortAsc=true;} renderTable(); }

/* ---- inline edit (name / url) ---- */
let _activeEditCell = null;
function startEdit(td, playerId, field) {
  if (_activeEditCell && _activeEditCell !== td) commitEdit(_activeEditCell);
  const p = getPlayer(playerId); if (!p) return;
  _activeEditCell = td; td.classList.add('editing');
  const input = document.createElement('input');
  input.className = 'cell-input';
  input.type = field === 'url' ? 'url' : 'text';
  input.value = p[field] || '';
  if (field === 'url') input.style.minWidth = '300px';
  input.dataset.playerId = playerId; input.dataset.field = field;
  td.innerHTML = ''; td.appendChild(input); input.focus(); input.select();
  input.addEventListener('blur', () => commitEdit(td));
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); commitEdit(td); }
    if (e.key === 'Escape') { e.stopPropagation(); _activeEditCell = null; td.classList.remove('editing'); renderTable(); }
  });
}
function commitEdit(td) {
  if (!td.classList.contains('editing')) return;
  const input = td.querySelector('input'); if (!input) return;
  const p = getPlayer(input.dataset.playerId); if (!p) { td.classList.remove('editing'); _activeEditCell = null; renderTable(); return; }
  const val = input.value.trim() || null;
  if (input.dataset.field === 'name' && !val) { toast('名称不能为空','err'); input.focus(); return; }
  p[input.dataset.field] = val; p.updatedAt = nowTs();
  td.classList.remove('editing'); _activeEditCell = null; renderTable(); autoSave();
}
document.addEventListener('mousedown', e => { if (_activeEditCell && !_activeEditCell.contains(e.target)) commitEdit(_activeEditCell); });

/* ---- pos editor modal ---- */
function openEditPos(playerId) {
  const p = getPlayer(playerId); if (!p) return;
  document.getElementById('pp-player-id').value = playerId;
  document.getElementById('modal-pos-title').textContent = `编辑位置 — ${p.name}`;
  const list = document.getElementById('pos-editor-list');
  list.innerHTML = '';
  (p.positions||[]).forEach((x,i) => addPosRow(x.pos, x.rating));
  addPosRow('', '');
  showModal('modal-pos');
}
function addPosRow(pos='', rating='') {
  const list = document.getElementById('pos-editor-list');
  const row = document.createElement('div'); row.className = 'pos-editor-row';
  const sel = document.createElement('select');
  [['','— 位置 —'],...POSITIONS.map(v=>[v,v])].forEach(([v,l])=>{
    const o=document.createElement('option'); o.value=v; o.textContent=l;
    if(v===pos) o.selected=true; sel.appendChild(o);
  });
  sel.addEventListener('change', function() {
    if (this.value !== '') {
      setTimeout(() => inp.focus(), 10);
      const rows = list.querySelectorAll('.pos-editor-row');
      if (rows[rows.length - 1] === row) {
        setTimeout(() => addPosRow('', ''), 50);
      }
    }
  });
  const inp = document.createElement('input'); inp.type='number'; inp.placeholder='评分'; inp.min=1; inp.max=99; inp.step='0.1'; inp.value=rating||'';
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); confirmSavePos(); } });
  sel.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); confirmSavePos(); } });
  const del = document.createElement('button'); del.className='pos-row-del'; del.textContent='×'; del.type='button';
  del.onclick = () => row.remove();
  row.appendChild(sel); row.appendChild(inp); row.appendChild(del);
  list.appendChild(row);
}

function addPosRowInModal(pos='', rating='') {
  const list = document.getElementById('ap-pos-list');
  const row = document.createElement('div'); row.className = 'pos-editor-row';
  const sel = document.createElement('select');
  [['','— 位置 —'],...POSITIONS.map(v=>[v,v])].forEach(([v,l])=>{
    const o=document.createElement('option'); o.value=v; o.textContent=l;
    if(v===pos) o.selected=true; sel.appendChild(o);
  });
  sel.addEventListener('change', function() {
    if (this.value !== '') {
      setTimeout(() => inp.focus(), 10);
      const rows = list.querySelectorAll('.pos-editor-row');
      if (rows[rows.length - 1] === row) {
        setTimeout(() => addPosRowInModal('', ''), 50);
      }
    }
  });
  const inp = document.createElement('input'); inp.type='number'; inp.placeholder='评分'; inp.min=1; inp.max=99; inp.step='0.1'; inp.value=rating||'';
  const del = document.createElement('button'); del.className='pos-row-del'; del.textContent='×'; del.type='button';
  del.onclick = () => row.remove();
  row.appendChild(sel); row.appendChild(inp); row.appendChild(del);
  list.appendChild(row);
  return row;
}
function confirmSavePos() {
  const playerId = document.getElementById('pp-player-id').value;
  const p = getPlayer(playerId); if (!p) return;
  const rows = document.querySelectorAll('#pos-editor-list .pos-editor-row');
  const positions = [];
  for (const row of rows) {
    const pos = row.querySelector('select').value;
    const rating = parseFloat(row.querySelector('input').value) || null;
    if (pos) positions.push({ pos, rating });
  }
  p.positions = positions; p.updatedAt = nowTs();
  closeModal('modal-pos'); render(); toast('位置已保存','ok'); autoSave();
}

/* ---- add player ---- */
function openAddPlayer() {
  document.getElementById('ap-name').value=''; document.getElementById('ap-url').value='';
  const list = document.getElementById('ap-pos-list');
  list.innerHTML = '';
  addPosRowInModal('', '');
  showModal('modal-add'); setTimeout(()=>document.getElementById('ap-name').focus(),50);
}
function confirmAddPlayer() {
  const name = document.getElementById('ap-name').value.trim();
  const url  = document.getElementById('ap-url').value.trim() || null;
  if (!name) { toast('请填写球员名称','err'); return; }

  const rows = document.querySelectorAll('#ap-pos-list .pos-editor-row');
  const positions = [];
  for (const row of rows) {
    const pos = row.querySelector('select').value;
    const ratingInput = row.querySelector('input');
    const rating = ratingInput.value.trim() !== '' ? parseFloat(ratingInput.value) : null;
    if (pos) positions.push({ pos, rating });
  }

  appData.players.push({id:genId(), name, url, positions, updatedAt:nowTs()});
  closeModal('modal-add'); render(); toast(`已添加 ${name}`,'ok'); autoSave();
}

/* ---- delete ---- */
function deletePlayer(id) {
  const p = getPlayer(id); if (!p) return;
  if (!confirm(`删除「${p.name}」？`)) return;
  p.deletedAt = nowTs(); p.updatedAt = nowTs();
  render(); toast(`已删除 ${p.name}`,'warn'); autoSave();
}

/* ---- import ---- */
function openImport() { document.getElementById('import-text').value=''; document.getElementById('import-preview').innerHTML=''; showModal('modal-import'); }

// 解析新格式：FC26:{...}
// 缩写还原：i=id n=name u=url p=positions k=pos r=rating ua=updatedAt da=deletedAt
function parseImport(text) {
  const t = text.trim();
  if (!t.startsWith('FC26:')) throw new Error('格式错误，需以 FC26: 开头');
  const payload = JSON.parse(t.slice(5));
  payload.changes = (payload.c || []).map(o => ({
    id:        o.i,
    name:      o.n,
    url:       o.u  || null,
    positions: (o.p || []).map(x => ({ pos: x.k, rating: x.r ?? null })),
    updatedAt: o.ua || 0,
    ...(o.da ? { deletedAt: o.da } : {}),
  }));
  return payload;
}

function previewImport(d) {
  const changes = d.changes || [];
  const byId = new Map(appData.players.map(p => [p.id, p]));
  let chgN = 0, delN = 0;
  for (const c of changes) {
    if (c.deletedAt) { if (byId.has(c.id)) delN++; }
    else chgN++;
  }
  return `增量导入 · 版本 ${d.v} · 变动 ${chgN} / 删除 ${delN}`;
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('import-text').addEventListener('input', function() {
    const pv = document.getElementById('import-preview');
    try {
      const d = parseImport(this.value);
      const w = d.pv !== appData.version
        ? `<div style="color:var(--warn);margin-top:4px">⚠ 版本不连续：导出基于 ${d.pv}，本地为 ${appData.version}</div>` : '';
      pv.innerHTML = `✅ ${previewImport(d)}${w}`;
    } catch(e) { pv.innerHTML = this.value.trim() ? `<span style="color:var(--danger)">❌ ${e.message}</span>` : ''; }
  });
});

function mergeImport(d) {
  const changes = d.changes || [];
  const byId = new Map(appData.players.map(p => [p.id, p]));
  let addN = 0, updN = 0, delN = 0;
  for (const c of changes) {
    const existing = byId.get(c.id);
    if (c.deletedAt) {
      if (existing) { existing.deletedAt = c.deletedAt; existing.updatedAt = c.updatedAt; delN++; }
    } else if (existing) {
      if (!existing.updatedAt || c.updatedAt >= existing.updatedAt) Object.assign(existing, c);
      updN++;
    } else {
      appData.players.push(c);
      addN++;
    }
  }
  return { addN, updN, delN };
}

function confirmImport() {
  try {
    const d = parseImport(document.getElementById('import-text').value);
    const r = mergeImport(d);
    appData.version = d.v; appData.lastExportVersion = d.v;
    closeModal('modal-import'); render();
    toast(`增量导入成功 · +${r.addN} ~${r.updN} -${r.delN}`, 'ok');
    autoSave();
  } catch(e) { toast('导入失败：' + e.message, 'err'); }
}

/* ---- auto save ---- */
let _saving = false;
let _saveQueue = false;

async function _postSave() {
  const resp = await fetch('/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(appData, null, 2),
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const result = await resp.json();
  if (!result.ok) throw new Error(result.error || '未知错误');
}

async function autoSave() {
  if (_saving) { _saveQueue = true; return; }
  _saving = true;
  try {
    await _postSave();
  } catch (e) {
    toast('保存失败：' + e.message, 'err');
  } finally {
    _saving = false;
    if (_saveQueue) { _saveQueue = false; autoSave(); }
  }
}

function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

/* ---- column resizer ---- */
(function() {
  const cols = [document.getElementById('cg-name'), document.getElementById('cg-url'), document.getElementById('cg-pos'), document.getElementById('cg-del')];
  document.querySelectorAll('.col-resizer').forEach(handle => {
    let startX, leftW0, rightW0, colIdx, resizing = false;
    handle.addEventListener('pointerdown', e => {
      e.preventDefault(); e.stopPropagation();
      colIdx = parseInt(handle.dataset.col);
      if (colIdx + 1 >= cols.length) return;
      startX = e.clientX;
      leftW0 = cols[colIdx].offsetWidth;
      rightW0 = cols[colIdx + 1].offsetWidth;
      resizing = true;
      handle.classList.add('resizing');
      handle.setPointerCapture(e.pointerId);
    });
    handle.addEventListener('pointermove', e => {
      if (!resizing) return;
      const diff = e.clientX - startX;
      const newLeft = Math.max(60, leftW0 + diff);
      const newRight = Math.max(60, rightW0 - diff);
      if (leftW0 + diff < 60 || rightW0 - diff < 60) return;
      cols[colIdx].style.width = newLeft + 'px';
      cols[colIdx + 1].style.width = newRight + 'px';
    });
    const stop = e => {
      if (!resizing) return;
      resizing = false;
      handle.classList.remove('resizing');
    };
    handle.addEventListener('pointerup', stop);
    handle.addEventListener('pointercancel', stop);
    handle.addEventListener('click', e => { e.stopPropagation(); });
  });
})();

function showModal(id) { document.getElementById(id).style.display = 'flex'; }
function closeModal(id, e) { if (e && e.target !== e.currentTarget) return; document.getElementById(id).style.display = 'none'; }
function toast(msg, type) {
  const el = document.getElementById('toast');
  el.textContent = msg; el.className = type || '';
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), 2500);
}

// 启动：先异步加载数据，再渲染
initData().then(() => { render(); });
