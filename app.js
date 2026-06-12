'use strict';

// ── Supabase ───────────────────────────────────────────────────────────────
const SUPABASE_URL = 'https://ipnscabwcceanzlzhgol.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlwbnNjYWJ3Y2NlYW56bHpoZ29sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEyNTMxODYsImV4cCI6MjA5NjgyOTE4Nn0.d29pF6FxTolJjGG5E8-kFY9TJO6J31J6g80TGPLZcBg';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ── Constants ──────────────────────────────────────────────────────────────
const CAT_ICONS = {
  'Food & Drink':'🍛','Transport':'🚗','Shopping':'🛍',
  'Health':'💊','Entertainment':'🎬','Bills & Recharge':'📱',
  'Groceries':'🛒','Other':'📦'
};

// ── State ──────────────────────────────────────────────────────────────────
let currentMode = 'upi';
let viewDate = new Date(); viewDate.setHours(0,0,0,0);
let histFilter = 'all';
let cache = {}; // local cache: dateKey -> entries[]
let isSaving = false;

// ── Sync status ────────────────────────────────────────────────────────────
function setSyncStatus(state, msg) {
  const bar = document.getElementById('sync-bar');
  const txt = document.getElementById('sync-msg');
  txt.textContent = msg;
  bar.className = 'sync-bar ' + state;
  if (state === 'ok') setTimeout(() => { bar.className = 'sync-bar hidden'; }, 2000);
}

// ── DB helpers ─────────────────────────────────────────────────────────────
async function dbFetchDay(dateStr) {
  const { data, error } = await sb
    .from('expenses')
    .select('*')
    .eq('date', dateStr)
    .order('time', { ascending: true });
  if (error) throw error;
  return data || [];
}

async function dbFetchMonth(month) {
  // month = 'YYYY-MM'
  const [year, mon] = month.split('-');
  const lastDay = new Date(year, mon, 0).getDate();
  const from = month + '-01';
  const to   = month + '-' + String(lastDay).padStart(2, '0');
  const { data, error } = await sb
    .from('expenses')
    .select('*')
    .gte('date', from)
    .lte('date', to)
    .order('date', { ascending: true });
  if (error) throw error;
  return data || [];
}

async function dbFetchAll() {
  const { data, error } = await sb
    .from('expenses')
    .select('*')
    .order('date', { ascending: false })
    .order('time', { ascending: true });
  if (error) throw error;
  return data || [];
}

async function dbInsert(entry) {
  const { data, error } = await sb.from('expenses').insert([entry]).select();
  if (error) throw error;
  return data[0];
}

async function dbDelete(id) {
  const { error } = await sb.from('expenses').delete().eq('id', id);
  if (error) throw error;
}

// ── Format ─────────────────────────────────────────────────────────────────
function fmt(n) {
  if (n >= 100000) return '₹' + (n/100000).toFixed(1) + 'L';
  if (n >= 1000)   return '₹' + (n/1000).toFixed(1) + 'k';
  return '₹' + Math.round(n).toLocaleString('en-IN');
}
function fmtFull(n) { return '₹' + Number(n).toLocaleString('en-IN'); }
function getNow() {
  const n = new Date();
  return n.getHours().toString().padStart(2,'0') + ':' + n.getMinutes().toString().padStart(2,'0');
}
function dateKey(d) { return d.toISOString().split('T')[0]; }
function formatDisplayDate(d) {
  const today = new Date(); today.setHours(0,0,0,0);
  const diff = Math.round((d - today) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === -1) return 'Yesterday';
  return d.toLocaleDateString('en-IN', { weekday:'short', day:'numeric', month:'short' });
}
function formatMonthYear(d) {
  return d.toLocaleDateString('en-IN', { month:'long', year:'numeric' });
}

// ── Greeting ───────────────────────────────────────────────────────────────
function updateGreeting() {
  const h = new Date().getHours();
  const g = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  document.getElementById('greeting').textContent = g;
  document.getElementById('header-date').textContent =
    new Date().toLocaleDateString('en-IN', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
}

// ── Mode toggle ────────────────────────────────────────────────────────────
function setMode(m) {
  currentMode = m;
  document.getElementById('mode-upi').className  = 'mode-btn' + (m==='upi'  ? ' active upi-active'  : '');
  document.getElementById('mode-cash').className = 'mode-btn' + (m==='cash' ? ' active cash-active' : '');
}

// ── Tab switching ──────────────────────────────────────────────────────────
function switchTab(tab) {
  document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(el => el.classList.remove('active'));
  document.getElementById('tab-' + tab).classList.add('active');
  document.querySelector(`[data-tab="${tab}"]`).classList.add('active');
  if (tab === 'today')     renderTodayTab();
  if (tab === 'dashboard') renderDashboard();
  if (tab === 'history')   renderHistory();
}

// ── Add expense ────────────────────────────────────────────────────────────
async function addExpense() {
  if (isSaving) return;
  const amtEl  = document.getElementById('f-amt');
  const descEl = document.getElementById('f-desc');
  const amt    = parseFloat(amtEl.value);
  const desc   = descEl.value.trim();

  amtEl.classList.remove('error');
  descEl.classList.remove('error');
  if (!desc)               { descEl.classList.add('error'); descEl.focus(); return; }
  if (isNaN(amt) || amt<=0){ amtEl.classList.add('error');  amtEl.focus();  return; }

  const time = document.getElementById('f-time').value || getNow();
  const cat  = document.getElementById('f-cat').value;
  const note = document.getElementById('f-note').value.trim();
  const today = new Date(); today.setHours(0,0,0,0);
  const date  = dateKey(today);

  const entry = { date, time, amount: amt, mode: currentMode, description: desc, category: cat, note };

  isSaving = true;
  const btn = document.getElementById('save-btn');
  btn.textContent = 'Saving…';
  btn.disabled = true;
  setSyncStatus('syncing', 'Saving…');

  try {
    const saved = await dbInsert(entry);
    // update cache
    if (!cache[date]) cache[date] = [];
    cache[date].push(saved);
    cache[date].sort((a,b) => a.time.localeCompare(b.time));

    amtEl.value  = '';
    descEl.value = '';
    document.getElementById('f-note').value = '';
    document.getElementById('f-time').value = getNow();

    setSyncStatus('ok', 'Saved ✓');
    showToast('Saved ✓', 'success');
    renderLogTab(false);
  } catch(e) {
    setSyncStatus('error', 'Failed to save — check connection');
    showToast('Save failed', 'error');
  } finally {
    isSaving = false;
    btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> Save expense';
    btn.disabled = false;
  }
}

// ── Delete ─────────────────────────────────────────────────────────────────
async function deleteEntry(id, date) {
  setSyncStatus('syncing', 'Deleting…');
  try {
    await dbDelete(id);
    if (cache[date]) cache[date] = cache[date].filter(e => e.id !== id);
    setSyncStatus('ok', 'Deleted');
    showToast('Deleted');
    renderLogTab(false);
    renderTodayTab(false);
  } catch {
    setSyncStatus('error', 'Delete failed');
    showToast('Delete failed', 'error');
  }
}

// ── Entry HTML ─────────────────────────────────────────────────────────────
function entryHTML(e) {
  return `<div class="entry-item">
    <div class="entry-icon">${CAT_ICONS[e.category]||'📦'}</div>
    <div class="entry-body">
      <div class="entry-desc">${e.description}</div>
      <div class="entry-meta">${e.time.slice(0,5)} · ${e.category}</div>
      ${e.note ? `<div class="entry-note">${e.note}</div>` : ''}
    </div>
    <div class="entry-right">
      <span class="entry-amt ${e.mode}">${fmtFull(e.amount)}</span>
      <span class="mode-tag ${e.mode}">${e.mode.toUpperCase()}</span>
      <button class="del-entry" onclick="deleteEntry(${e.id},'${e.date}')" aria-label="Delete">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
      </button>
    </div>
  </div>`;
}

function emptyState(icon, title, sub) {
  return `<div class="empty-state"><div class="empty-icon">${icon}</div><div class="empty-title">${title}</div><div class="empty-sub">${sub}</div></div>`;
}

// ── LOG TAB ────────────────────────────────────────────────────────────────
async function renderLogTab(fetchFresh = true) {
  const today = new Date(); today.setHours(0,0,0,0);
  const key   = dateKey(today);
  const month = key.slice(0,7);

  if (fetchFresh) {
    setSyncStatus('syncing', 'Loading…');
    try {
      const [todayRows, monthRows] = await Promise.all([
        dbFetchDay(key),
        dbFetchMonth(month)
      ]);
      cache[key] = todayRows;
      cache['_month_' + month] = monthRows;
      setSyncStatus('ok', 'Synced');
    } catch {
      setSyncStatus('error', 'Offline — showing cached data');
    }
  }

  const entries = cache[key] || [];
  const monthEntries = cache['_month_' + month] || [];

  let total=0, upi=0, cash=0, monthTotal=0;
  entries.forEach(e => {
    total += e.amount;
    if (e.mode==='upi') upi+=e.amount; else cash+=e.amount;
  });
  monthEntries.forEach(e => monthTotal += e.amount);

  document.getElementById('qs-today').textContent = fmt(total);
  document.getElementById('qs-upi').textContent   = fmt(upi);
  document.getElementById('qs-cash').textContent  = fmt(cash);
  document.getElementById('qs-month').textContent = fmt(monthTotal);

  const recent = [...entries].sort((a,b)=>b.time.localeCompare(a.time)).slice(0,5);
  const el = document.getElementById('recent-list');
  el.innerHTML = recent.length
    ? recent.map(entryHTML).join('')
    : emptyState('💸','Nothing logged yet','Add your first expense above');
}

// ── TODAY TAB ──────────────────────────────────────────────────────────────
function changeDay(d) {
  viewDate.setDate(viewDate.getDate() + d);
  renderTodayTab();
}

async function renderTodayTab(fetchFresh = true) {
  const key = dateKey(viewDate);
  document.getElementById('today-label').textContent = formatDisplayDate(viewDate);

  if (fetchFresh) {
    setSyncStatus('syncing','Loading…');
    try {
      cache[key] = await dbFetchDay(key);
      setSyncStatus('ok','Synced');
    } catch {
      setSyncStatus('error','Offline');
    }
  }

  const entries = (cache[key] || []).sort((a,b)=>a.time.localeCompare(b.time));
  let total=0, upi=0, cash=0;
  entries.forEach(e=>{ total+=e.amount; if(e.mode==='upi') upi+=e.amount; else cash+=e.amount; });

  document.getElementById('ds-total').textContent = fmtFull(total);
  document.getElementById('ds-upi').textContent   = fmtFull(upi);
  document.getElementById('ds-cash').textContent  = fmtFull(cash);

  const el = document.getElementById('today-entries');
  el.innerHTML = entries.length
    ? entries.map(entryHTML).join('')
    : emptyState('📅','No expenses','Nothing logged for this day');
}

// ── DASHBOARD ──────────────────────────────────────────────────────────────
async function populateMonthSelect() {
  const sel = document.getElementById('dash-month');
  const now = new Date();
  const months = new Set([now.toISOString().slice(0,7)]);
  try {
    const all = await dbFetchAll();
    all.forEach(e => months.add(e.date.slice(0,7)));
  } catch {}
  const sorted = [...months].sort().reverse();
  if (!sel.value || !sorted.includes(sel.value)) {
    sel.innerHTML = sorted.map(m => {
      const d = new Date(m + '-01');
      return `<option value="${m}">${formatMonthYear(d)}</option>`;
    }).join('');
  }
}

async function renderDashboard() {
  await populateMonthSelect();
  const month = document.getElementById('dash-month').value;
  setSyncStatus('syncing','Loading…');
  let rows = [];
  try {
    rows = await dbFetchMonth(month);
    cache['_month_' + month] = rows;
    setSyncStatus('ok','Synced');
  } catch {
    rows = cache['_month_' + month] || [];
    setSyncStatus('error','Offline — cached data');
  }

  let total=0, upi=0, cash=0;
  const dailyMap={}, catMap={};
  rows.forEach(e => {
    total += e.amount; upi += e.mode==='upi'?e.amount:0; cash += e.mode==='cash'?e.amount:0;
    const day = parseInt(e.date.split('-')[2]);
    dailyMap[day] = (dailyMap[day]||0) + e.amount;
    catMap[e.category] = (catMap[e.category]||0) + e.amount;
  });

  const daysWithData = Object.keys(dailyMap).length;
  document.getElementById('d-monthly').textContent  = fmtFull(total);
  document.getElementById('d-upi').textContent      = fmtFull(upi);
  document.getElementById('d-cash').textContent     = fmtFull(cash);
  document.getElementById('d-daily-avg').textContent = daysWithData > 0
    ? `Avg ${fmtFull(Math.round(total/daysWithData))} / day over ${daysWithData} days` : 'No data yet';

  renderBarChart(month, dailyMap);
  renderCatBreakdown(catMap, total);
  renderDonut(upi, cash);
}

function renderBarChart(month, dailyMap) {
  const canvas = document.getElementById('bar-chart');
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio||1;
  const W = canvas.parentElement.clientWidth - 32;
  const H = 160;
  canvas.style.width = W+'px'; canvas.style.height = H+'px';
  canvas.width = W*dpr; canvas.height = H*dpr;
  ctx.scale(dpr,dpr); ctx.clearRect(0,0,W,H);

  const daysInMonth = new Date(month.split('-')[0], month.split('-')[1], 0).getDate();
  const vals = Array.from({length:daysInMonth},(_,i)=>dailyMap[i+1]||0);
  const maxVal = Math.max(...vals,1);
  const barW = Math.max(4,(W-20)/daysInMonth-3);
  const gap  = Math.max(1,(W-20-barW*daysInMonth)/(daysInMonth-1));

  vals.forEach((v,i) => {
    const bh = Math.max(2,((v/maxVal)*(H-30)));
    const x  = 10+i*(barW+gap);
    const y  = H-20-bh;
    ctx.fillStyle = v>0 ? 'rgba(240,192,64,0.75)' : 'rgba(255,255,255,0.06)';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x,y,barW,bh,2); else ctx.rect(x,y,barW,bh);
    ctx.fill();
    if ((i+1)%5===0||i===0||i===daysInMonth-1) {
      ctx.fillStyle='rgba(255,255,255,0.28)';
      ctx.font='10px Inter,sans-serif'; ctx.textAlign='center';
      ctx.fillText(i+1,x+barW/2,H-4);
    }
  });
}

function renderCatBreakdown(catMap, total) {
  const el = document.getElementById('cat-breakdown');
  const sorted = Object.entries(catMap).sort((a,b)=>b[1]-a[1]);
  if (!sorted.length) { el.innerHTML=`<div class="empty-state" style="padding:16px"><div class="empty-sub">No data for this month</div></div>`; return; }
  el.innerHTML = sorted.map(([cat,amt])=>{
    const pct = total>0?Math.round((amt/total)*100):0;
    return `<div class="cat-bar-item">
      <div class="cat-bar-header">
        <span class="cat-bar-name">${CAT_ICONS[cat]||'📦'} ${cat}</span>
        <span class="cat-bar-amt">${fmtFull(amt)} <span style="color:var(--text3);font-weight:400">(${pct}%)</span></span>
      </div>
      <div class="cat-bar-track"><div class="cat-bar-fill" style="width:${pct}%"></div></div>
    </div>`;
  }).join('');
}

function renderDonut(upi,cash) {
  const canvas = document.getElementById('donut-chart');
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio||1;
  canvas.width=160*dpr; canvas.height=160*dpr;
  canvas.style.width='160px'; canvas.style.height='160px';
  ctx.scale(dpr,dpr); ctx.clearRect(0,0,160,160);
  const total = upi+cash;
  if (!total) {
    ctx.strokeStyle='rgba(255,255,255,0.06)'; ctx.lineWidth=20;
    ctx.beginPath(); ctx.arc(80,80,60,0,Math.PI*2); ctx.stroke();
  } else {
    const upiAngle=(upi/total)*Math.PI*2; const start=-Math.PI/2;
    ctx.lineWidth=20; ctx.lineCap='round';
    if(upi>0){ctx.strokeStyle='#6c9fff';ctx.beginPath();ctx.arc(80,80,60,start,start+upiAngle);ctx.stroke();}
    if(cash>0){ctx.strokeStyle='#5ec98a';ctx.beginPath();ctx.arc(80,80,60,start+upiAngle+0.05,start+Math.PI*2-0.05);ctx.stroke();}
  }
  const t=total||1;
  document.getElementById('donut-legend').innerHTML=`
    <div class="legend-item"><div class="legend-dot" style="background:var(--upi)"></div><span class="legend-label">UPI</span><span class="legend-val">${Math.round(upi/t*100)}%</span></div>
    <div class="legend-item"><div class="legend-dot" style="background:var(--cash)"></div><span class="legend-label">Cash</span><span class="legend-val">${Math.round(cash/t*100)}%</span></div>`;
}

// ── HISTORY ────────────────────────────────────────────────────────────────
function setFilter(f, btn) {
  histFilter = f;
  document.querySelectorAll('.filter-btn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  renderHistory();
}

async function renderHistory() {
  setSyncStatus('syncing','Loading…');
  let rows=[];
  try {
    rows = await dbFetchAll();
    setSyncStatus('ok','Synced');
  } catch {
    setSyncStatus('error','Offline');
  }

  const search = (document.getElementById('hist-search').value||'').toLowerCase();
  let filtered = rows;
  if (histFilter==='upi'||histFilter==='cash') filtered=filtered.filter(e=>e.mode===histFilter);
  else if (histFilter!=='all') filtered=filtered.filter(e=>e.category===histFilter);
  if (search) filtered=filtered.filter(e=>
    e.description.toLowerCase().includes(search)||
    e.category.toLowerCase().includes(search)||
    (e.note||'').toLowerCase().includes(search)
  );

  const el = document.getElementById('history-list');
  if (!filtered.length) { el.innerHTML=emptyState('🔍','Nothing found','Try a different filter or search term'); return; }

  // group by date
  const grouped={};
  filtered.forEach(e=>{ if(!grouped[e.date]) grouped[e.date]=[]; grouped[e.date].push(e); });
  const days = Object.keys(grouped).sort().reverse();

  el.innerHTML = days.map(key=>{
    const entries = grouped[key];
    const dayTotal = entries.reduce((s,e)=>s+e.amount,0);
    const d = new Date(key+'T00:00:00');
    const label = formatDisplayDate(d)+' · '+d.toLocaleDateString('en-IN',{day:'numeric',month:'short'});
    return `<div class="hist-day-group">
      <div class="hist-day-header">
        <span class="hist-day-name">${label}</span>
        <span class="hist-day-total">${fmtFull(dayTotal)}</span>
      </div>
      ${entries.map(entryHTML).join('')}
    </div>`;
  }).join('');
}

// ── TOAST ──────────────────────────────────────────────────────────────────
let toastTimer;
function showToast(msg, type='') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast show'+(type?' '+type:'');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=>t.classList.remove('show'), 2200);
}

// ── INIT ───────────────────────────────────────────────────────────────────
async function init() {
  updateGreeting();
  document.getElementById('f-time').value = getNow();
  setMode('upi');

  document.getElementById('f-amt').addEventListener('keydown', e=>{
    if(e.key==='Enter') document.getElementById('f-desc').focus();
  });
  document.getElementById('f-note').addEventListener('keydown', e=>{
    if(e.key==='Enter') addExpense();
  });

  // Test Supabase connection & create table if needed
  setSyncStatus('syncing','Connecting to Supabase…');
  try {
    const { error } = await sb.from('expenses').select('id').limit(1);
    if (error && error.code === '42P01') {
      // Table doesn't exist — show setup message
      setSyncStatus('error', 'Run the SQL setup first — see DEPLOY.md');
      showToast('Setup needed — see guide', 'error');
      return;
    }
    setSyncStatus('ok','Connected ✓');
  } catch {
    setSyncStatus('error','Cannot reach Supabase');
  }

  await renderLogTab(true);

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(()=>{});
  }
}

document.addEventListener('DOMContentLoaded', init);
