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
  appData = { version: `${d.getMonth()+1}.${d.getDate()}.0`, players: [] };
}

function getPlayer(id) { return appData.players.find(p => p.id === id); }
function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2,6); }
function nowTs() { return Date.now(); }


/* ---- pos filters ---- */
function renderPosFilters() {
  const c = document.getElementById('pos-filters');
  c.innerHTML = [['全部',''],...POSITIONS.map(p=>[p,p]),['Barcelona','Barcelona']].map(([l,v])=>
    `<button class="pos-btn${filterPos===v?' active':''}${v==='Barcelona'?' pos-btn-barcelona':''}" onclick="setFilterPos('${v}')">${l}</button>`
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
    const rankMap = buildRankMap();
    if (filterPos === 'Barcelona') {
      rows.sort((a,b) => {
        const bestTier = (p) => {
          let best = 6;
          for (const x of (p.positions||[])) {
            if (x.pos === 'Barcelona' || x.rating == null) continue;
            const tm = rankMap[x.pos];
            const t = (tm && tm[x.rating]) || 5;
            if (t < best) best = t;
          }
          return best;
        };
        const ta = bestTier(a), tb = bestTier(b);
        if (ta !== tb) return ta - tb;
        const maxRating = (p) => Math.max(...(p.positions||[]).filter(x => x.pos !== 'Barcelona' && x.rating != null).map(x => x.rating), -1);
        return maxRating(b) - maxRating(a);
      });
    } else {
      rows.sort((a,b) => {
        const ra = (a.positions||[]).find(x => x.pos === filterPos);
        const rb = (b.positions||[]).find(x => x.pos === filterPos);
        const va = ra && ra.rating != null ? ra.rating : -1;
        const vb = rb && rb.rating != null ? rb.rating : -1;
        return vb - va;
      });
    }
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
    const isBarcelona = positions.some(x => x.pos === 'Barcelona');
    const filteredPositions = positions.filter(x => x.pos !== 'Barcelona');
    const sortedPositions = [...filteredPositions].sort((a, b) => {
      if (filterPos && filterPos !== 'Barcelona') {
        if (a.pos === filterPos && b.pos !== filterPos) return -1;
        if (b.pos === filterPos && a.pos !== filterPos) return 1;
      }
      const ra = a.rating != null ? a.rating : -1;
      const rb = b.rating != null ? b.rating : -1;
      return rb - ra;
    });
    const tagsHtml = sortedPositions.map(x => {
      let cls;
      if (x.pos === 'Barcelona') {
        cls = ' barcelona';
      } else {
        const tm = rankMap[x.pos];
        const tier = (tm && x.rating != null && tm[x.rating]) ? ' tier' + tm[x.rating] : ' tier5';
        cls = tier;
      }
      const hi = filterPos && x.pos === filterPos ? ' highlighted' : '';
      cls += hi;
      const rating = x.rating != null ? `<span class="tag-rating">${Number(x.rating).toFixed(1)}</span>` : '';
      return `<span class="pos-tag${cls}">${esc(x.pos)}${rating}</span>`;
    }).join('');
    const addBtn = `<span class="pos-tag-add" ondblclick="event.stopPropagation()" onclick="openEditPos('${p.id}')">＋</span>`;
    const urlHtml = p.url
      ? `<a href="${esc(p.url)}" target="_blank" title="${esc(p.url)}">${esc(p.url)}</a>`
      : `<span style="color:var(--text3);font-size:12px">— 双击添加</span>`;
    return `<tr data-id="${p.id}"${isBarcelona ? ' class="row-barcelona"' : ''}>
      <td class="col-name editable" ondblclick="startEdit(this,'${p.id}','name')">${esc(p.name)}</td>
      <td class="col-url  editable" ondblclick="startEdit(this,'${p.id}','url')">${urlHtml}</td>
      <td class="col-pos" ondblclick="openEditPos('${p.id}')">
        <div class="pos-tags">${tagsHtml}${addBtn}</div>
      </td>
      <td class="col-del"><button class="del-btn" title="删除" onclick="deletePlayer('${p.id}')">×</button></td>
    </tr>`;
  }).join('');
}

function render() { renderPosFilters(); renderTable(); }
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

/* ---- pitch position editor ---- */
const PITCH_LAYOUT = {
  CB:  { x: 50, y: 88 },
  LB:  { x: 15, y: 84 },
  RB:  { x: 85, y: 84 },
  CDM: { x: 50, y: 68 },
  LM:  { x: 12, y: 50 },
  CM:  { x: 50, y: 50 },
  RM:  { x: 88, y: 50 },
  CAM: { x: 50, y: 33 },
  LW:  { x: 15, y: 16 },
  RW:  { x: 85, y: 16 },
  ST:  { x: 50, y: 6 },
  Barcelona: { x: 30, y: 105 },
};

function buildPitchEditor(container, positions) {
  container.innerHTML = '';
  container.classList.remove('barcelona-active');
  const FIELD_POSITIONS = ['CB','LB','RB','CDM','CM','CAM','LM','RM','LW','RW','ST','Barcelona'];
  const posMap = {};
  (positions||[]).forEach(x => { posMap[x.pos] = x.rating; });
  for (const pos of FIELD_POSITIONS) {
    const layout = PITCH_LAYOUT[pos];
    const node = document.createElement('div');
    node.className = 'pitch-node' + (pos in posMap ? ' active' : '') + (pos === 'Barcelona' ? ' barcelona-node' : '');
    node.style.left = layout.x + '%';
    node.style.top = layout.y + '%';
    node.dataset.pos = pos;
    const circle = document.createElement('div'); circle.className = 'node-circle';
    const label = document.createElement('div'); label.className = 'node-label'; label.textContent = pos;
    circle.appendChild(label);
    const rating = document.createElement('input'); rating.className = 'node-rating'; rating.type = 'number'; rating.min = 1; rating.max = 99; rating.step = '0.1'; rating.placeholder = '—';
    if (pos in posMap && posMap[pos] != null) rating.value = posMap[pos];
    circle.addEventListener('click', () => {
      node.classList.toggle('active');
      if (pos === 'Barcelona') {
        container.classList.toggle('barcelona-active', node.classList.contains('active'));
      } else if (node.classList.contains('active')) {
        setTimeout(() => rating.focus(), 50);
      }
    });
    rating.addEventListener('click', e => e.stopPropagation());
    node.appendChild(circle);
    node.appendChild(rating);
    container.appendChild(node);
    if (pos === 'Barcelona' && node.classList.contains('active')) {
      container.classList.add('barcelona-active');
    }
  }
}

function getPitchPositions(container) {
  const positions = [];
  container.querySelectorAll('.pitch-node.active').forEach(node => {
    const pos = node.dataset.pos;
    if (pos === 'Barcelona') { positions.push({ pos, rating: null }); return; }
    const val = node.querySelector('.node-rating').value;
    if (val.trim() === '') return;
    const rating = parseFloat(val);
    if (isNaN(rating)) return;
    positions.push({ pos, rating });
  });
  return positions;
}

/* ---- pos editor modal ---- */
function openEditPos(playerId) {
  const p = getPlayer(playerId); if (!p) return;
  document.getElementById('pp-player-id').value = playerId;
  document.getElementById('modal-pos-title').textContent = `编辑位置 — ${p.name}`;
  buildPitchEditor(document.getElementById('pp-pitch'), p.positions);
  showModal('modal-pos');
}

function confirmSavePos() {
  const playerId = document.getElementById('pp-player-id').value;
  const p = getPlayer(playerId); if (!p) return;
  p.positions = getPitchPositions(document.getElementById('pp-pitch'));
  p.updatedAt = nowTs();
  closeModal('modal-pos'); render(); toast('位置已保存','ok'); autoSave();
}

/* ---- add player ---- */
function openAddPlayer() {
  document.getElementById('ap-name').value=''; document.getElementById('ap-url').value='';
  buildPitchEditor(document.getElementById('ap-pitch'), []);
  showModal('modal-add'); setTimeout(()=>document.getElementById('ap-name').focus(),50);
}
function confirmAddPlayer() {
  const name = document.getElementById('ap-name').value.trim();
  const url  = document.getElementById('ap-url').value.trim() || null;
  if (!name) { toast('请填写球员名称','err'); return; }
  const positions = getPitchPositions(document.getElementById('ap-pitch'));
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
