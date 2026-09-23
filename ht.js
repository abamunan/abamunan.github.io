/* ================================================================
   ht.js — Health Tracker core.
   Mirrors Money Tracker's architecture (mt.js): metrics-as-data
   (like categories), day/month/year views, Firestore sync under
   the SAME account, localStorage cache, autosave, backup/export.
   ================================================================ */

(function () {
  var MT_SPLASH_ANIMS = ['loading1.json', 'loading2.json', 'loading3.json'];
  var pick = MT_SPLASH_ANIMS[Math.floor(Math.random() * MT_SPLASH_ANIMS.length)];
  var lottie = document.getElementById('mtSplashLottie');
  if (lottie) lottie.setAttribute('src', pick);
})();

if (localStorage.getItem('theme') === 'dark') {
  document.documentElement.setAttribute('data-theme', 'dark');
}

function toggleFullscreen(){
  const btn = document.getElementById('fullscreenBtn');
  if (!document.fullscreenElement) {
    const req = document.documentElement.requestFullscreen
      || document.documentElement.webkitRequestFullscreen
      || document.documentElement.msRequestFullscreen;
    if (req) {
      req.call(document.documentElement).then(()=>{
        if(btn){ const ic=btn.querySelector('i'); if(ic) ic.className='fas fa-expand'; }
      }).catch(()=>{ showToast('Fullscreen not supported on this browser'); });
    } else { showToast('Fullscreen not supported on this browser'); }
  } else {
    const exit = document.exitFullscreen || document.webkitExitFullscreen || document.msExitFullscreen;
    if (exit) exit.call(document);
  }
}
document.addEventListener('fullscreenchange', ()=>{
  const btn = document.getElementById('fullscreenBtn');
  if (btn) btn.title = document.fullscreenElement ? 'Exit fullscreen' : 'Fullscreen';
});

// ── SPLASH SCREEN ───────────────────────────────────────────────
const HT_SPLASH_TOTAL_STEPS = 3; // loadMonthFromFirestore, loadSettingsRemote, loadProfileRemote
let htSplashStepCount = 0;
function wrapCreditLetters(){
  const el = document.getElementById('mtSplashCredit');
  if (!el || el.dataset.wrapped) return;
  const text = el.textContent;
  el.innerHTML = '';
  [...text].forEach((ch, i)=>{
    const span = document.createElement('span');
    span.className = 'mt-credit-letter';
    span.textContent = ch === ' ' ? '\u00A0' : ch;
    span.style.animationDelay = (i * 35) + 'ms';
    el.appendChild(span);
  });
  el.dataset.wrapped = '1';
}
wrapCreditLetters();
function splashStep(){
  htSplashStepCount++;
  const pct = Math.min(100, Math.round((htSplashStepCount / HT_SPLASH_TOTAL_STEPS) * 100));
  const bar = document.getElementById('mtSplashBar');
  if (bar) bar.style.transform = 'scaleX(' + (pct / 100) + ')';
}
function splashFinish(){
  const bar = document.getElementById('mtSplashBar');
  const credit = document.getElementById('mtSplashCredit');
  const splash = document.getElementById('mtSplash');
  if (bar) bar.style.transform = 'scaleX(1)';
  if (credit) credit.classList.add('mt-splash-credit-show');
  const letterCount = credit ? credit.querySelectorAll('.mt-credit-letter').length : 0;
  const waveDuration = letterCount ? (letterCount - 1) * 35 + 500 : 550;
  const holdTime = waveDuration + 150;
  setTimeout(()=>{
    if (splash) {
      splash.classList.add('mt-splash-hide');
      document.documentElement.classList.remove('mt-splash-lock');
      setTimeout(()=> splash.remove(), 550);
    }
  }, holdTime);
}

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAYS_IN_MONTH = [31,28,31,30,31,30,31,31,30,31,30,31];

// ── METRIC DEFINITIONS ────────────────────────────────────────
// Each metric has a `type` that drives how it's rendered/collected:
//  number      — single numeric input with a unit
//  bp          — paired systolic/diastolic (special: sys/dia stored as f.id+'_sys'/'_dia')
//  scale       — 1-5 pill picker (sleep quality)
//  mood        — emoji mood picker (single, day-level — always pinned)
//  checklist   — list of user-defined items with checked state (medications)
//  text        — free text note only (handled via the metrics' own note)
// Metrics live inside GROUPS purely for Day-view layout; grouping is fixed
// (not user-editable) but pin/hide-per-day works exactly like Money Tracker.
const DEFAULT_METRICS = [
  {id:'weight', label:'Weight', icon:'⚖️', type:'number', unit:'kg', group:'body', pinned:true, step:0.1},
  {id:'bp', label:'Blood Pressure', icon:'🩸', type:'bp', unit:'mmHg', group:'vitals', pinned:true},
  {id:'hr', label:'Heart Rate', icon:'❤️', type:'number', unit:'bpm', group:'vitals', pinned:true, step:1},
  {id:'sugar', label:'Blood Sugar', icon:'🩹', type:'number', unit:'mg/dL', group:'vitals', pinned:false, step:1},
  {id:'sleep', label:'Sleep', icon:'😴', type:'number', unit:'hrs', group:'lifestyle', pinned:true, step:0.5},
  {id:'sleepq', label:'Sleep Quality', icon:'🌙', type:'scale', unit:'', group:'lifestyle', pinned:false},
  {id:'water', label:'Water', icon:'💧', type:'number', unit:'L', group:'lifestyle', pinned:true, step:0.1},
  {id:'steps', label:'Steps', icon:'👣', type:'number', unit:'steps', group:'activity', pinned:true, step:100},
  {id:'calin', label:'Calories In', icon:'🍽️', type:'number', unit:'kcal', group:'activity', pinned:false, step:10},
  {id:'calout', label:'Calories Out', icon:'🔥', type:'number', unit:'kcal', group:'activity', pinned:false, step:10},
  {id:'mood', label:'Mood', icon:'🙂', type:'mood', unit:'', group:'mind', pinned:true},
  {id:'meds', label:'Medications', icon:'💊', type:'checklist', unit:'', group:'mind', pinned:false},
];
const GROUP_META = [
  {id:'body', label:'Body', icon:'fa-weight-scale'},
  {id:'vitals', label:'Vitals', icon:'fa-heart-pulse'},
  {id:'lifestyle', label:'Lifestyle', icon:'fa-bed'},
  {id:'activity', label:'Activity', icon:'fa-person-running'},
  {id:'mind', label:'Mood &amp; Meds', icon:'fa-brain'},
];
const MOODS = [
  {id:'great', icon:'😄', label:'Great'},
  {id:'good', icon:'🙂', label:'Good'},
  {id:'okay', icon:'😐', label:'Okay'},
  {id:'low', icon:'😕', label:'Low'},
  {id:'bad', icon:'😣', label:'Bad'},
];
const DEFAULT_PINNED_IDS = DEFAULT_METRICS.filter(m=>m.pinned).map(m=>m.id);

let METRICS = [];
let SAVINGS_GOALS = { weight:0, water:0, steps:0, sleep:0 }; // flexible map: metricId -> target value (any METRICS id can have a goal)
let PROFILE = { height:0, age:0, sex:'male', activity:1.375 };
let extraShownIds = new Set();

function migratePinnedMetrics(){
  METRICS.forEach(m=>{ if(typeof m.pinned!=='boolean') m.pinned=DEFAULT_PINNED_IDS.includes(m.id); });
}
function metricForcedShown(m,data){
  if(m.pinned) return false;
  if(m.type==='bp'){
    return (parseFloat(data[m.id+'_sys'])||0)>0 || (parseFloat(data[m.id+'_dia'])||0)>0;
  }
  if(m.type==='checklist'){
    const items=data[m.id+'_items'];
    return Array.isArray(items) && items.length>0;
  }
  if(m.type==='mood'){ return !!data[m.id]; }
  if(m.type==='scale'){ return (parseFloat(data[m.id])||0)>0; }
  const hasVal=(parseFloat(data[m.id])||0)>0;
  const hasNote=!!(data['note_'+m.id]&&String(data['note_'+m.id]).trim());
  return hasVal||hasNote;
}
function computeExtraShownForData(data){
  const s=new Set();
  METRICS.forEach(m=>{
    if(m.pinned) return;
    const manuallyShown=!!data['shown_'+m.id];
    if(metricForcedShown(m,data)||manuallyShown) s.add(m.id);
  });
  return s;
}
function visibleMetricList(){
  return METRICS.filter(m=>m.pinned||extraShownIds.has(m.id));
}

function escHtml(s){
  return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── METRIC + GOAL + PROFILE PERSISTENCE (local) ──────────────
function loadMetricsLocal(){
  try{
    const raw=localStorage.getItem('ht_metrics_v1');
    const parsed=raw?JSON.parse(raw):null;
    METRICS=(Array.isArray(parsed)&&parsed.length)?parsed:DEFAULT_METRICS.map(m=>({...m}));
  }catch{
    METRICS=DEFAULT_METRICS.map(m=>({...m}));
  }
  migratePinnedMetrics();
}
function saveMetricsLocal(){ localStorage.setItem('ht_metrics_v1', JSON.stringify(METRICS)); }
function loadGoalsLocal(){
  try{
    const raw=localStorage.getItem('ht_goals_v1');
    const parsed=raw?JSON.parse(raw):null;
    SAVINGS_GOALS=parsed&&typeof parsed==='object'?parsed:{};
  }catch{ SAVINGS_GOALS={}; }
}
function saveGoalsLocalOnly(){ localStorage.setItem('ht_goals_v1', JSON.stringify(SAVINGS_GOALS)); }
function loadProfileLocal(){
  try{
    const raw=localStorage.getItem('ht_profile_v1');
    const parsed=raw?JSON.parse(raw):null;
    PROFILE=parsed&&typeof parsed==='object'?Object.assign({height:0,age:0,sex:'male',activity:1.375},parsed):{height:0,age:0,sex:'male',activity:1.375};
  }catch{ PROFILE={height:0,age:0,sex:'male',activity:1.375}; }
}
function saveProfileLocalOnly(){ localStorage.setItem('ht_profile_v1', JSON.stringify(PROFILE)); }

// ── FIRESTORE: SETTINGS (metrics + goals + profile, one combined doc) ──
async function saveSettingsRemote(){
  saveMetricsLocal(); saveGoalsLocalOnly(); saveProfileLocalOnly();
  if(!window._mtAuth||!window._mtDb) return;
  const uid=window._mtAuth.currentUser?.uid;
  if(!uid) return;
  try{
    const {doc,setDoc}=await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
    await setDoc(doc(window._mtDb,"users",uid,"healthtracker_meta","settings"),{metrics:METRICS,goals:SAVINGS_GOALS,profile:PROFILE});
  }catch(e){console.error("HT settings save failed:",e);}
}
async function loadSettingsRemote(){
  if(!window._mtAuth||!window._mtDb) return false;
  const uid=window._mtAuth.currentUser?.uid;
  if(!uid) return false;
  try{
    const {doc,getDoc}=await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
    const snap=await getDoc(doc(window._mtDb,"users",uid,"healthtracker_meta","settings"));
    if(snap.exists()){
      const data=snap.data();
      if(Array.isArray(data.metrics)&&data.metrics.length) METRICS=data.metrics;
      if(data.goals&&typeof data.goals==='object') SAVINGS_GOALS=data.goals;
      if(data.profile&&typeof data.profile==='object') PROFILE=Object.assign({height:0,age:0,sex:'male',activity:1.375},data.profile);
      migratePinnedMetrics();
      saveMetricsLocal(); saveGoalsLocalOnly(); saveProfileLocalOnly();
      return true;
    }
  }catch(e){console.error("HT settings load failed:",e);}
  return false;
}

let currentDay=1, navOffset=0;
let activeSummaryTab='monthly';
let curYear=new Date().getFullYear(), curMonth=new Date().getMonth();

function isLeap(y){return (y%4===0&&y%100!==0)||y%400===0;}
function daysInMonth(y,m){return m===1&&isLeap(y)?29:DAYS_IN_MONTH[m];}
function storageKey(y,m,d){return `ht_${y}_${m+1}_${d}`;}

// ── LOCAL (sync) ──────────────────────────────────────────────
function getDay(y,m,d){try{return JSON.parse(localStorage.getItem(storageKey(y,m,d)))||{};}catch{return {};}}
function setDayLocal(y,m,d,data){localStorage.setItem(storageKey(y,m,d),JSON.stringify(data)); invalidateDayEntriesCache();}

let _dayEntriesCache=null;
function invalidateDayEntriesCache(){ _dayEntriesCache=null; }
function allDayEntries(){
  const out=[];
  const re=/^ht_(\d+)_(\d+)_(\d+)$/;
  for(let i=0;i<localStorage.length;i++){
    const key=localStorage.key(i);
    const m=key&&key.match(re);
    if(!m) continue;
    const y=parseInt(m[1]), mo=parseInt(m[2])-1, d=parseInt(m[3]);
    try{
      const data=JSON.parse(localStorage.getItem(key))||{};
      out.push({key,y,m:mo,d,data});
    }catch{}
  }
  return out;
}
function getAllDayEntriesCached(){
  if(!_dayEntriesCache) _dayEntriesCache=allDayEntries();
  return _dayEntriesCache;
}

// ── DAY LOCK (same 2-day auto-lock rule as Money Tracker) ────
const DAY_AUTO_LOCK_AFTER_DAYS=2;
function computeAutoLocked(y,m,d){
  const dayDate=new Date(y,m,d); dayDate.setHours(0,0,0,0);
  const today=new Date(); today.setHours(0,0,0,0);
  const diffDays=Math.round((today-dayDate)/86400000);
  return diffDays>=DAY_AUTO_LOCK_AFTER_DAYS;
}
function isDayLocked(y,m,d,data){
  data=data||getDay(y,m,d);
  return typeof data.locked==='boolean' ? data.locked : computeAutoLocked(y,m,d);
}

// ── FIRESTORE SAVE/LOAD ───────────────────────────────────────
async function setDay(y,m,d,data){
  setDayLocal(y,m,d,data);
  if(!window._mtAuth||!window._mtDb) return;
  const uid=window._mtAuth.currentUser?.uid;
  if(!uid) return;
  try {
    const {doc,setDoc}=await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
    await setDoc(doc(window._mtDb,"users",uid,"healthtracker",`${y}_${m+1}_${d}`),data);
  } catch(e){console.error("HT Firestore save failed:",e);}
}
async function loadDayFromFirestore(y,m,d){
  if(!window._mtAuth||!window._mtDb) return;
  const uid=window._mtAuth.currentUser?.uid;
  if(!uid) return;
  try {
    const {doc,getDoc}=await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
    const snap=await getDoc(doc(window._mtDb,"users",uid,"healthtracker",`${y}_${m+1}_${d}`));
    if(snap.exists()) setDayLocal(y,m,d,snap.data());
  } catch(e){console.error("HT Firestore load failed:",e);}
}
async function loadMonthFromFirestore(){
  // Loads the user's FULL collection (same rationale as Money Tracker — so
  // Yearly/Insights are correct without visiting every month manually).
  if(!window._mtAuth||!window._mtDb) return;
  const uid=window._mtAuth.currentUser?.uid;
  if(!uid) return;
  try {
    const {collection,getDocs}=await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
    const col=collection(window._mtDb,"users",uid,"healthtracker");
    const snap=await getDocs(col);
    snap.forEach(d=>{
      const parts=d.id.split('_');
      const yy=parseInt(parts[0]), mm=parseInt(parts[1])-1, dd=parseInt(parts[2]);
      if(!isNaN(yy)&&!isNaN(mm)&&!isNaN(dd)) setDayLocal(yy,mm,dd,d.data());
    });
  } catch(e){console.error("HT Firestore data load failed:",e);}
}

// ─── INIT SELECTORS ──────────────────────────────────────────
function initSelectors(){
  const ySel=document.getElementById('yearSel');
  const mSel=document.getElementById('monthSel');
  ySel.innerHTML='';
  const now=new Date();
  const startY=Math.min(now.getFullYear(),curYear)-3;
  const endY=Math.max(now.getFullYear(),curYear)+5;
  for(let y=startY;y<=endY;y++){
    ySel.innerHTML+=`<option value="${y}" ${y===curYear?'selected':''}>${y}</option>`;
  }
  mSel.innerHTML='';
  MONTHS.forEach((m,i)=>{
    mSel.innerHTML+=`<option value="${i}" ${i===curMonth?'selected':''}>${m}</option>`;
  });
}

async function onMonthChange(){
  curYear=parseInt(document.getElementById('yearSel').value);
  curMonth=parseInt(document.getElementById('monthSel').value);
  const days=daysInMonth(curYear,curMonth);
  currentDay=Math.min(currentDay,days);
  navOffset=0;
  showToast('Loading…');
  await selectDay(currentDay);
  if(document.getElementById('summarySection').classList.contains('active') && activeSummaryTab==='monthly') renderSummary();
  if(document.getElementById('summarySection').classList.contains('active') && activeSummaryTab==='yearly') renderYearly();
  if(document.getElementById('insightsSection').classList.contains('active')) renderInsightsTab();
}

// ─── METRIC ROW RENDERING ────────────────────────────────────
function metricNoteBtnHTML(m){
  if(m.type==='mood') return '';
  return `<button class="ht-metric-note-btn" type="button" onclick="toggleNote('${m.id}')" id="nbtn_${m.id}" title="Add note"><i class="fas fa-note-sticky"></i></button>`;
}
function metricNoteRowHTML(m){
  if(m.type==='mood') return '';
  return `<div class="ht-note-row" id="noterow_${m.id}"><input type="text" placeholder="Note (optional)" id="note_${m.id}" maxlength="200"></div>`;
}
function metricInputHTML(m){
  if(m.type==='number'){
    return `<input class="ht-metric-input" type="text" inputmode="decimal" autocomplete="off" placeholder="0" id="f_${m.id}"><span class="ht-metric-unit">${m.unit||''}</span>`;
  }
  if(m.type==='bp'){
    return `<div class="ht-bp-row"><input class="ht-metric-input" type="text" inputmode="decimal" placeholder="Sys" id="f_${m.id}_sys"><span class="ht-bp-sep">/</span><input class="ht-metric-input" type="text" inputmode="decimal" placeholder="Dia" id="f_${m.id}_dia"><span class="ht-metric-unit">${m.unit||''}</span></div>`;
  }
  if(m.type==='scale'){
    return `<div class="ht-scale" id="f_${m.id}">${[1,2,3,4,5].map(n=>`<button type="button" class="ht-scale-btn" data-val="${n}" onclick="setScaleVal('${m.id}',${n})">${n}</button>`).join('')}</div>`;
  }
  return '';
}
function metricRowHTML(m){
  if(m.type==='mood') return moodRowHTML();
  if(m.type==='checklist') return checklistRowHTML(m);
  return `<div class="ht-metric-row"><span class="ht-metric-icon">${m.icon}</span><span class="ht-metric-label">${escHtml(m.label)}</span>${metricInputHTML(m)}${metricNoteBtnHTML(m)}</div>${metricNoteRowHTML(m)}`;
}
function moodRowHTML(){
  return `<div class="ht-mood-row" id="f_mood">${MOODS.map(mo=>`<button type="button" class="ht-mood-btn" data-mood="${mo.id}" onclick="setMoodVal('${mo.id}')">${mo.icon}<span>${mo.label}</span></button>`).join('')}</div>`;
}
function checklistRowHTML(m){
  return `<div class="ht-metric-row" style="align-items:flex-start"><span class="ht-metric-icon">${m.icon}</span><span class="ht-metric-label" style="padding-top:4px">${escHtml(m.label)}</span></div>
    <div id="checklist_${m.id}"></div>
    <div class="ht-quickadd-row"><input type="text" id="newMedName_${m.id}" placeholder="Add medication / supplement" maxlength="40" onkeydown="if(event.key==='Enter'){event.preventDefault();addChecklistItem('${m.id}')}"><button class="cat-add-btn" onclick="addChecklistItem('${m.id}')" title="Add"><i class="fas fa-plus"></i></button></div>`;
}

let _renderedFieldSig=null;
function fieldVisibilitySignature(){
  return visibleMetricList().map(m=>m.id).join(',');
}
function renderFieldRows(){
  const container=document.getElementById('htGroupsContainer');
  if(!container) return;
  const visible=visibleMetricList();
  let html='';
  GROUP_META.forEach(g=>{
    const groupMetrics=visible.filter(m=>m.group===g.id);
    if(!groupMetrics.length) return;
    html+=`<div class="ht-group"><div class="ht-group-head"><i class="fas ${g.icon}"></i> ${g.label}</div>`;
    groupMetrics.forEach(m=>{ html+=metricRowHTML(m); });
    html+='</div>';
  });
  container.innerHTML=html || '<div class="chart-empty">No metrics shown — tap "Add / Remove metrics" below</div>';
  attachFieldListeners();
  _renderedFieldSig=fieldVisibilitySignature();
}

function attachFieldListeners(){
  METRICS.forEach(m=>{
    if(m.type==='number'){
      const el=document.getElementById('f_'+m.id);
      if(el){
        el.addEventListener('input',()=>{
          el.value=el.value.replace(/[^0-9.]/g,'');
          scheduleAutoSave();
        });
        el.addEventListener('keydown',(e)=>{ if(e.key==='Enter'){ e.preventDefault(); el.blur(); } });
      }
    } else if(m.type==='bp'){
      ['_sys','_dia'].forEach(suf=>{
        const el=document.getElementById('f_'+m.id+suf);
        if(el){
          el.addEventListener('input',()=>{ el.value=el.value.replace(/[^0-9]/g,''); scheduleAutoSave(); });
          el.addEventListener('keydown',(e)=>{ if(e.key==='Enter'){ e.preventDefault(); el.blur(); } });
        }
      });
    }
    const noteEl=document.getElementById('note_'+m.id);
    if(noteEl) noteEl.addEventListener('input',()=>{
      updateNoteIndicator(m.id, noteEl.value.trim().length>0);
      scheduleAutoSave();
    });
  });
}

function setScaleVal(id,val){
  const wrap=document.getElementById('f_'+id);
  if(!wrap) return;
  const cur=wrap.dataset.val===String(val);
  wrap.dataset.val=cur?'':String(val);
  wrap.querySelectorAll('.ht-scale-btn').forEach(b=>b.classList.toggle('active', !cur && b.dataset.val===String(val)));
  scheduleAutoSave();
}
function setMoodVal(id){
  const wrap=document.getElementById('f_mood');
  if(!wrap) return;
  const cur=wrap.dataset.val===id;
  wrap.dataset.val=cur?'':id;
  wrap.querySelectorAll('.ht-mood-btn').forEach(b=>b.classList.toggle('active', !cur && b.dataset.mood===id));
  scheduleAutoSave();
}
function addChecklistItem(metricId){
  const input=document.getElementById('newMedName_'+metricId);
  const name=(input.value||'').trim();
  if(!name) return;
  const wrap=document.getElementById('checklist_'+metricId);
  const id='m'+Date.now().toString(36)+Math.random().toString(36).slice(2,5);
  const items=_readChecklistItems(metricId);
  items.push({id,name,checked:false});
  _writeChecklistItems(metricId,items);
  input.value='';
  renderChecklist(metricId);
  scheduleAutoSave();
}
function toggleChecklistItem(metricId,itemId){
  const items=_readChecklistItems(metricId);
  const it=items.find(i=>i.id===itemId);
  if(it) it.checked=!it.checked;
  _writeChecklistItems(metricId,items);
  renderChecklist(metricId);
  scheduleAutoSave();
}
function deleteChecklistItem(metricId,itemId){
  let items=_readChecklistItems(metricId);
  items=items.filter(i=>i.id!==itemId);
  _writeChecklistItems(metricId,items);
  renderChecklist(metricId);
  scheduleAutoSave();
}
function _readChecklistItems(metricId){
  const wrap=document.getElementById('checklist_'+metricId);
  try{ return wrap&&wrap.dataset.items ? JSON.parse(wrap.dataset.items) : []; }catch{ return []; }
}
function _writeChecklistItems(metricId,items){
  const wrap=document.getElementById('checklist_'+metricId);
  if(wrap) wrap.dataset.items=JSON.stringify(items);
}
function renderChecklist(metricId,items){
  const wrap=document.getElementById('checklist_'+metricId);
  if(!wrap) return;
  const list=items||_readChecklistItems(metricId);
  wrap.dataset.items=JSON.stringify(list);
  wrap.innerHTML=list.map(it=>`<div class="ht-med-row"><div class="ht-med-check${it.checked?' checked':''}" onclick="toggleChecklistItem('${metricId}','${it.id}')"><i class="fas fa-check"></i></div><span class="ht-med-label">${escHtml(it.name)}</span><button class="ht-med-del" onclick="deleteChecklistItem('${metricId}','${it.id}')"><i class="fas fa-xmark"></i></button></div>`).join('') || '<div class="chart-empty" style="padding:8px 0">No items added yet</div>';
}

function toggleNote(id){
  const row=document.getElementById('noterow_'+id);
  const btn=document.getElementById('nbtn_'+id);
  if(!row) return;
  const isOpen=row.classList.toggle('open');
  if(isOpen) document.getElementById('note_'+id)?.focus();
}
function updateNoteIndicator(id,hasNote){
  document.getElementById('nbtn_'+id)?.classList.toggle('has-note', hasNote);
}

// ─── APPLY / COLLECT DAY DATA ─────────────────────────────────
function applyDayValuesToDOM(data){
  METRICS.forEach(m=>{
    if(m.type==='number'){
      const el=document.getElementById('f_'+m.id);
      if(el) el.value=data[m.id]||'';
    } else if(m.type==='bp'){
      const sEl=document.getElementById('f_'+m.id+'_sys');
      const dEl=document.getElementById('f_'+m.id+'_dia');
      if(sEl) sEl.value=data[m.id+'_sys']||'';
      if(dEl) dEl.value=data[m.id+'_dia']||'';
    } else if(m.type==='scale'){
      const wrap=document.getElementById('f_'+m.id);
      if(wrap){
        const val=data[m.id]?String(data[m.id]):'';
        wrap.dataset.val=val;
        wrap.querySelectorAll('.ht-scale-btn').forEach(b=>b.classList.toggle('active', b.dataset.val===val));
      }
    } else if(m.type==='mood'){
      const wrap=document.getElementById('f_mood');
      if(wrap){
        const val=data.mood||'';
        wrap.dataset.val=val;
        wrap.querySelectorAll('.ht-mood-btn').forEach(b=>b.classList.toggle('active', b.dataset.mood===val));
      }
    } else if(m.type==='checklist'){
      renderChecklist(m.id, Array.isArray(data[m.id+'_items'])?data[m.id+'_items']:[]);
    }
    const noteEl=document.getElementById('note_'+m.id);
    const noteVal=data['note_'+m.id]||'';
    if(noteEl) noteEl.value=noteVal;
    const row=document.getElementById('noterow_'+m.id);
    if(row) row.classList.toggle('open', !!noteVal);
    updateNoteIndicator(m.id, !!noteVal);
  });
  updateScoreCard(data);
}

function loadDay(d){
  const data=getDay(curYear,curMonth,d);
  extraShownIds=computeExtraShownForData(data);
  if(fieldVisibilitySignature()!==_renderedFieldSig) renderFieldRows();
  applyDayValuesToDOM(data);
}

function collectDayData(){
  const data={};
  const existing=getDay(curYear,curMonth,currentDay);
  METRICS.forEach(m=>{
    if(m.type==='number'){
      const el=document.getElementById('f_'+m.id);
      const val=el?(parseFloat(el.value)||0):0;
      data[m.id]=val;
    } else if(m.type==='bp'){
      const sEl=document.getElementById('f_'+m.id+'_sys');
      const dEl=document.getElementById('f_'+m.id+'_dia');
      data[m.id+'_sys']=sEl?(parseFloat(sEl.value)||0):0;
      data[m.id+'_dia']=dEl?(parseFloat(dEl.value)||0):0;
    } else if(m.type==='scale'){
      const wrap=document.getElementById('f_'+m.id);
      data[m.id]=wrap&&wrap.dataset.val?parseInt(wrap.dataset.val):0;
    } else if(m.type==='mood'){
      const wrap=document.getElementById('f_mood');
      data.mood=wrap?(wrap.dataset.val||''):'';
    } else if(m.type==='checklist'){
      data[m.id+'_items']=_readChecklistItems(m.id);
    }
    const noteEl=document.getElementById('note_'+m.id);
    const noteVal=noteEl?noteEl.value.trim():'';
    if(noteVal) data['note_'+m.id]=noteVal;
  });
  METRICS.forEach(m=>{
    if(m.pinned) return;
    if(!metricForcedShown(m,data) && extraShownIds.has(m.id)) data['shown_'+m.id]=true;
  });
  const existingLock=getDay(curYear,curMonth,currentDay).locked;
  if(typeof existingLock==='boolean') data.locked=existingLock;
  updateScoreCard(data);
  return data;
}

// ─── DAILY LOG SCORE (0-100, simple composite of how much was logged) ──
function updateScoreCard(data){
  const numEl=document.getElementById('htScoreNum');
  const subEl=document.getElementById('htScoreSub');
  const fg=document.getElementById('htScoreFg');
  if(!numEl) return;
  const pinnedMetrics=METRICS.filter(m=>m.pinned);
  if(!pinnedMetrics.length){ numEl.textContent='–'; if(subEl) subEl.textContent='Pin some metrics to track a score'; return; }
  let filled=0;
  pinnedMetrics.forEach(m=>{
    if(m.type==='number'){ if((data[m.id]||0)>0) filled++; }
    else if(m.type==='bp'){ if((data[m.id+'_sys']||0)>0 && (data[m.id+'_dia']||0)>0) filled++; }
    else if(m.type==='scale'){ if((data[m.id]||0)>0) filled++; }
    else if(m.type==='mood'){ if(data.mood) filled++; }
    else if(m.type==='checklist'){ const items=data[m.id+'_items']; if(Array.isArray(items)&&items.length&&items.every(i=>i.checked)) filled++; }
  });
  const pct=Math.round((filled/pinnedMetrics.length)*100);
  numEl.textContent=pct+'%';
  if(subEl) subEl.textContent = pct===100?'Fully logged — nice work!' : pct===0?'Start logging to see your score':`${filled} of ${pinnedMetrics.length} metrics logged`;
  if(fg){
    const circumference=264;
    fg.style.strokeDashoffset = String(circumference - (pct/100)*circumference);
  }
}

let autoSaveTimer=null;
function scheduleAutoSave(){
  if(isDayLocked(curYear,curMonth,currentDay)) return;
  const data=collectDayData();
  setDayLocal(curYear,curMonth,currentDay,data);
  clearTimeout(autoSaveTimer);
  autoSaveTimer=setTimeout(async()=>{
    await setDay(curYear,curMonth,currentDay,collectDayData());
    renderDayBtns();
  },1200);
}

async function saveDay(){
  if(isDayLocked(curYear,curMonth,currentDay)){ showToast('Day is locked','error'); return; }
  clearTimeout(autoSaveTimer);
  const data=collectDayData();
  showToast('Saving…');
  await setDay(curYear,curMonth,currentDay,data);
  renderDayBtns();
  showToast('Saved');
}

async function toggleDayLock(){
  const wasLocked=isDayLocked(curYear,curMonth,currentDay);
  clearTimeout(autoSaveTimer);
  const data=wasLocked?getDay(curYear,curMonth,currentDay):collectDayData();
  data.locked=!wasLocked;
  await setDay(curYear,curMonth,currentDay,data);
  applyDayLockUI();
  renderDayBtns();
  showToast(data.locked?'Day locked':'Day unlocked');
}
function applyDayLockUI(){
  const locked=isDayLocked(curYear,curMonth,currentDay);
  const bar=document.getElementById('dayLockBar');
  const area=document.getElementById('dayEntryArea');
  const icon=document.getElementById('dayLockIcon');
  const text=document.getElementById('dayLockText');
  const saveBtn=document.getElementById('saveDayBtn');
  if(!bar||!area) return;
  bar.classList.toggle('locked',locked);
  area.classList.toggle('locked',locked);
  icon.className=locked?'fas fa-lock':'fas fa-lock-open';
  text.textContent=locked?'Locked — tap to unlock':'Unlocked — tap to lock';
  if(saveBtn) saveBtn.disabled=locked;
}

async function selectDay(day){
  currentDay=day;
  document.getElementById('dayTitle').textContent='Day '+day;
  const d=new Date(curYear,curMonth,day);
  document.getElementById('daySubtitle').textContent=d.toLocaleDateString('en-US',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
  loadDay(day);
  applyDayLockUI();
  renderDayBtns();
  const y=curYear, m=curMonth;
  await loadDayFromFirestore(y,m,day);
  const active=document.activeElement;
  const isEditing=active&&(active.classList.contains('ht-metric-input')||active.id&&active.id.indexOf('note_')===0);
  if(curYear===y&&curMonth===m&&currentDay===day&&!isEditing){
    loadDay(day);
    applyDayLockUI();
  }
}

function dayHasData(saved){
  return METRICS.some(m=>{
    if(m.type==='number') return (saved[m.id]||0)>0;
    if(m.type==='bp') return (saved[m.id+'_sys']||0)>0;
    if(m.type==='scale') return (saved[m.id]||0)>0;
    if(m.type==='mood') return !!saved.mood;
    if(m.type==='checklist'){ const items=saved[m.id+'_items']; return Array.isArray(items)&&items.length>0; }
    return false;
  });
}
function renderDayBtns(){
  const container=document.getElementById('dayBtns');
  container.innerHTML='';
  const total=daysInMonth(curYear,curMonth);
  const visible=window.innerWidth>=900?total:window.innerWidth>=600?14:7;
  const start=Math.max(1,Math.min(navOffset+1,total-visible+1));
  for(let d=start;d<=Math.min(start+visible-1,total);d++){
    const btn=document.createElement('button');
    const saved=getDay(curYear,curMonth,d);
    const hasData=dayHasData(saved);
    btn.className='day-btn'+(d===currentDay?' active':(hasData?' has-data':''));
    btn.textContent=d;
    btn.onclick=(()=>{const dd=d;return()=>openDayQuickView(curYear,curMonth,dd);})();
    container.appendChild(btn);
  }
}
function shiftNav(delta){
  const total=daysInMonth(curYear,curMonth);
  const visible=window.innerWidth>=900?total:window.innerWidth>=600?14:7;
  navOffset=Math.max(0,Math.min(navOffset+delta,total-visible));
  renderDayBtns();
}

// ─── ADD/REMOVE METRICS FOR TODAY (popup) ────────────────────
function openAddFieldModal(){
  const data=collectDayData();
  setDayLocal(curYear,curMonth,currentDay,data);
  const list=document.getElementById('addFieldList');
  if(list) list.innerHTML=METRICS.map(m=>dayMetricRowHTML(m,data)).join('');
  document.getElementById('addFieldModal').classList.add('open');
}
function closeAddFieldModal(){ document.getElementById('addFieldModal').classList.remove('open'); }
function reopenAddFieldModal(){
  if(document.getElementById('addFieldModal').classList.contains('open')) openAddFieldModal();
}
function dayMetricRowHTML(m,data){
  const pinned=!!m.pinned;
  const forced=metricForcedShown(m,data);
  const manuallyShown=!!data['shown_'+m.id];
  const pinBtn=`<button class="cat-pin-btn${pinned?' pinned':''}" onclick="toggleMetricPinFromDay('${m.id}')" title="${pinned?'Unpin — stop showing every day':'Pin — show every day'}"><i class="fas fa-star"></i></button>`;
  const line1=`<span class="field-icon">${m.icon}</span><span class="cat-label-static">${escHtml(m.label)}</span>${pinBtn}`;
  if(pinned) return `<div class="cat-row">${line1}<span class="day-shown-badge">Always shown</span></div>`;
  if(forced) return `<div class="cat-row">${line1}<span class="day-shown-badge">Shown (has data)</span></div>`;
  if(manuallyShown) return `<div class="cat-row">${line1}<button class="day-remove-btn" onclick="removeMetricForToday('${m.id}')"><i class="fas fa-minus"></i> Remove</button></div>`;
  return `<div class="cat-row"><div class="cat-row-line1">${line1}</div><button class="day-add-btn" style="margin-top:6px" onclick="addMetricForToday('${m.id}')"><i class="fas fa-plus"></i> Add for today</button></div>`;
}
function toggleMetricPinFromDay(id){
  const m=METRICS.find(x=>x.id===id);
  if(!m) return;
  m.pinned=!m.pinned;
  saveSettingsRemote();
  refreshAfterMetricChange();
  renderSettingsLists();
  reopenAddFieldModal();
}
function addMetricForToday(id){
  const data=collectDayData();
  data['shown_'+id]=true;
  setDay(curYear,curMonth,currentDay,data);
  extraShownIds.add(id);
  renderFieldRows();
  applyDayValuesToDOM(data);
  reopenAddFieldModal();
}
function removeMetricForToday(id){
  const data=collectDayData();
  const m=METRICS.find(x=>x.id===id);
  if(m&&metricForcedShown(m,data)){ showToast('Clear its value first to remove it',true); return; }
  delete data['shown_'+id];
  setDay(curYear,curMonth,currentDay,data);
  extraShownIds.delete(id);
  renderFieldRows();
  applyDayValuesToDOM(data);
  reopenAddFieldModal();
}
function refreshAfterMetricChange(){
  const data=collectDayData();
  setDayLocal(curYear,curMonth,currentDay,data);
  extraShownIds=computeExtraShownForData(data);
  renderFieldRows();
  applyDayValuesToDOM(data);
  if(document.getElementById('summarySection').classList.contains('active') && activeSummaryTab==='monthly') renderSummary();
  if(document.getElementById('summarySection').classList.contains('active') && activeSummaryTab==='yearly') renderYearly();
  if(document.getElementById('insightsSection').classList.contains('active')) renderInsightsTab();
}

// ─── SWITCH VIEW ──────────────────────────────────────────────
let _lastRenderedView=null;
function switchView(view){
  document.getElementById('daySection').className=(view==='day'?'':'hidden');
  document.getElementById('summarySection').className='summary-section'+(view==='summary'?' active':'');
  document.getElementById('insightsSection').className='insights-section'+(view==='insights'?' active':'');
  document.getElementById('guideSection').className='guide-section'+(view==='guide'?' active':'');
  ['day','summary','insights','guide'].forEach(v=>{
    document.getElementById('bnav-'+v).className='bnav-btn'+(v===view?' active':'');
  });
  if(view!==_lastRenderedView){
    if(view==='summary') renderSummaryTab();
    if(view==='insights') renderInsightsTab();
    if(view==='guide') renderGuideTab();
    _lastRenderedView=view;
  }
  closeNavDrawer();
}
function switchSummaryTab(tab){
  activeSummaryTab=tab;
  document.querySelectorAll('#summarySubTabBar .mti-tab').forEach(b=>{
    const active=b.dataset.summaryTab===tab;
    b.classList.toggle('mti-active',active);
    b.setAttribute('aria-selected',String(active));
  });
  document.querySelectorAll('[data-summary-pane]').forEach(p=>{
    p.classList.toggle('mti-active', p.dataset.summaryPane===tab);
  });
  if(tab==='monthly') renderSummary();
  if(tab==='yearly') renderYearly();
}
function renderSummaryTab(){
  renderSummary();
  renderYearly();
}

// ─── GUIDE TAB (read-only reference; personalizes off logged weight + Profile) ──
function ht_guideLatestWeight(){
  let best=null;
  allDayEntries().forEach(e=>{
    if(e.data && e.data.weight>0){
      if(!best || e.y>best.y || (e.y===best.y&&e.m>best.m) || (e.y===best.y&&e.m===best.m&&e.d>best.d)){
        best={y:e.y,m:e.m,d:e.d,v:e.data.weight};
      }
    }
  });
  return best;
}
function renderGuideTab(){
  const grid=document.getElementById('guideMacroGrid');
  const noteEl=document.getElementById('guideWeightNote');
  if(!grid||!noteEl) return;

  const wEntry=ht_guideLatestWeight();
  const usingExample=!wEntry;
  const w=wEntry?wEntry.v:70;

  const pLow=Math.round(w*1.6), pHigh=Math.round(w*2.2);
  const fLow=Math.round(w*0.5), fHigh=Math.round(w*1.5);
  const cLow=Math.round(w*3), cHigh=Math.round(w*5);
  const gainLow=(w*0.0025).toFixed(2), gainHigh=(w*0.005).toFixed(2);

  const hasProfile=PROFILE.height>0 && PROFILE.age>0;
  let kcalCard, tdeeLine;
  if(hasProfile){
    const bmr=PROFILE.sex==='female'
      ? (10*w+6.25*PROFILE.height-5*PROFILE.age-161)
      : (10*w+6.25*PROFILE.height-5*PROFILE.age+5);
    const tdee=bmr*(PROFILE.activity||1.375);
    const surLow=Math.round(tdee*1.10), surHigh=Math.round(tdee*1.20);
    kcalCard=`<div class="ins-stat-card"><div class="ins-stat-label">Calorie Target</div><div class="ins-stat-val">${surLow.toLocaleString()}–${surHigh.toLocaleString()}</div><div class="ins-stat-sub">kcal/day</div></div>`;
    tdeeLine=`Estimated TDEE ~${Math.round(tdee).toLocaleString()} kcal/day (Mifflin-St Jeor, from your Profile).`;
  } else {
    kcalCard=`<div class="ins-stat-card"><div class="ins-stat-label">Calorie Target</div><div class="ins-stat-val">TDEE ×1.10–1.20</div><div class="ins-stat-sub">add Profile for kcal</div></div>`;
    tdeeLine=`Add your height, age &amp; activity level under Settings → Profile to see a personalized calorie target.`;
  }

  grid.innerHTML=`
    <div class="ins-stat-card"><div class="ins-stat-label">Protein</div><div class="ins-stat-val">${pLow}–${pHigh}g</div><div class="ins-stat-sub">1.6–2.2 g/kg</div></div>
    <div class="ins-stat-card"><div class="ins-stat-label">Fat</div><div class="ins-stat-val">${fLow}–${fHigh}g</div><div class="ins-stat-sub">0.5–1.5 g/kg</div></div>
    <div class="ins-stat-card"><div class="ins-stat-label">Carbs</div><div class="ins-stat-val">${cLow}–${cHigh}g+</div><div class="ins-stat-sub">≥3–5 g/kg</div></div>
    ${kcalCard}
    <div class="ins-stat-card"><div class="ins-stat-label">Weekly Gain</div><div class="ins-stat-val">${gainLow}–${gainHigh}kg</div><div class="ins-stat-sub">0.25–0.50%/wk</div></div>
  `;

  const weightLine=usingExample
    ? `Using an example bodyweight of 70 kg — log your weight in Day view to personalize these numbers.`
    : `Based on your last logged weight: ${w} kg (${MONTHS[wEntry.m].slice(0,3)} ${wEntry.d}, ${wEntry.y}).`;
  noteEl.innerHTML=`${weightLine}<br>${tdeeLine}`;
}

function toggleNavDrawer(){
  const d=document.getElementById('bottomNav'), b=document.getElementById('navDrawerBackdrop');
  if(!d||!b) return;
  d.classList.toggle('open');
  b.classList.toggle('open');
}
function closeNavDrawer(){
  const d=document.getElementById('bottomNav'), b=document.getElementById('navDrawerBackdrop');
  if(!d||!b) return;
  d.classList.remove('open');
  b.classList.remove('open');
}
function layoutNavForWidth(){
  const drawer=document.getElementById('bottomNav');
  const monthBar=document.querySelector('.month-bar');
  const anchor=document.getElementById('monthBarAnchor');
  if(!drawer||!monthBar||!anchor) return;
  if(window.innerWidth>=900){
    if(monthBar.parentElement!==drawer){
      drawer.insertBefore(monthBar, drawer.firstElementChild);
      monthBar.classList.add('in-drawer');
    }
  } else if(monthBar.parentElement!==anchor.parentElement || monthBar.previousElementSibling!==anchor){
    anchor.parentElement.insertBefore(monthBar, anchor.nextSibling);
    monthBar.classList.remove('in-drawer');
  }
}
window.addEventListener('resize', ()=>{ layoutNavForWidth(); renderDayBtns(); });

// ─── SETTINGS MODAL ───────────────────────────────────────────
function openSettings(tab){
  renderSettingsLists();
  document.getElementById('settingsModal').classList.add('open');
  showSettingsTab(tab||'metrics');
}
function closeSettings(){ document.getElementById('settingsModal').classList.remove('open'); }
function showSettingsTab(tab){
  document.querySelectorAll('.modal-tab').forEach(b=>b.classList.toggle('active', b.dataset.tab===tab));
  document.querySelectorAll('.settings-pane').forEach(p=>p.classList.toggle('active', p.id==='pane-'+tab));
}
function goalableMetrics(){
  return METRICS.filter(m=>m.type==='number'||m.type==='scale');
}
function metricLabelFor(id){
  const m=METRICS.find(x=>x.id===id);
  return m ? `${m.icon} ${m.label}${m.unit?' ('+m.unit+')':''}` : id;
}
function addGoal(){
  const sel=document.getElementById('newGoalMetric');
  const valEl=document.getElementById('newGoalValue');
  const id=sel.value;
  const val=Math.max(0,parseFloat(valEl.value)||0);
  if(!id){ showToast('Pick a metric first','error'); return; }
  if(!val){ showToast('Enter a target value','error'); return; }
  SAVINGS_GOALS[id]=val;
  saveSettingsRemote();
  valEl.value='';
  renderGoalList();
  showToast('Goal saved');
  if(document.getElementById('summarySection').classList.contains('active') && activeSummaryTab==='monthly') renderSummary();
}
function removeGoal(id){
  delete SAVINGS_GOALS[id];
  saveSettingsRemote();
  renderGoalList();
  showToast('Goal removed');
  if(document.getElementById('summarySection').classList.contains('active') && activeSummaryTab==='monthly') renderSummary();
}
function renderGoalMetricOptions(){
  const sel=document.getElementById('newGoalMetric');
  if(!sel) return;
  const opts=goalableMetrics().filter(m=>!(m.id in SAVINGS_GOALS));
  sel.innerHTML = opts.length
    ? opts.map(m=>`<option value="${m.id}">${escHtml(m.icon+' '+m.label)}</option>`).join('')
    : `<option value="">All metrics have goals</option>`;
}
function renderGoalList(){
  const box=document.getElementById('goalList');
  if(!box) return;
  const entries=Object.entries(SAVINGS_GOALS).filter(([id,val])=>val>0 && METRICS.some(m=>m.id===id));
  box.innerHTML = entries.length
    ? entries.map(([id,val])=>`<div class="cat-row"><span class="field-icon">${escHtml((METRICS.find(m=>m.id===id)||{}).icon||'🎯')}</span><span class="cat-label-static" style="flex:1">${escHtml((METRICS.find(m=>m.id===id)||{}).label||id)}</span><span style="font-weight:700;color:var(--ht-accent);margin-right:6px">${val}${(METRICS.find(m=>m.id===id)||{}).unit?' '+(METRICS.find(m=>m.id===id)||{}).unit:''}</span><button class="cat-del-btn" onclick="removeGoal('${id}')" title="Remove goal"><i class="fas fa-trash"></i></button></div>`).join('')
    : `<div class="ins-empty">No goals set yet — pick a metric below</div>`;
  renderGoalMetricOptions();
}
function saveProfile(){
  PROFILE={
    height: Math.max(0,parseFloat(document.getElementById('profHeightInput').value)||0),
    age: Math.max(0,parseFloat(document.getElementById('profAgeInput').value)||0),
    sex: document.getElementById('profSexInput').value,
    activity: parseFloat(document.getElementById('profActivityInput').value)||1.375,
  };
  saveSettingsRemote();
  showToast('Profile saved');
}
function metRowHTML(m){
  const pinned=!!m.pinned;
  const pinTitle=pinned?'Shown in Day view every day — tap to unpin':'Hidden by default — tap to always show in Day view';
  return `<div class="cat-row"><button class="cat-pin-btn${pinned?' pinned':''}" onclick="toggleMetricPin('${m.id}')" title="${pinTitle}"><i class="fas fa-star"></i></button><input class="cat-icon-input" value="${escHtml(m.icon)}" onchange="updateMetricField('${m.id}','icon',this.value)"><input class="cat-label-input" value="${escHtml(m.label)}" onchange="updateMetricField('${m.id}','label',this.value)"><button class="cat-del-btn" onclick="deleteMetric('${m.id}')" title="Delete"><i class="fas fa-trash"></i></button></div>`;
}
function toggleMetricPin(id){
  const m=METRICS.find(x=>x.id===id);
  if(!m) return;
  m.pinned=!m.pinned;
  saveSettingsRemote();
  refreshAfterMetricChange();
  renderSettingsLists();
  showToast(m.pinned?'Pinned — shown every day':'Unpinned — hidden unless used');
}
function updateMetricField(id,key,value){
  const m=METRICS.find(x=>x.id===id);
  if(!m) return;
  if(key==='label'){ const v=String(value).trim(); if(!v) return; m.label=v; }
  else if(key==='icon'){ m.icon=String(value).trim()||m.icon; }
  saveSettingsRemote();
  refreshAfterMetricChange();
}
function addMetric(){
  const iconEl=document.getElementById('newMetIcon');
  const labelEl=document.getElementById('newMetLabel');
  const icon=iconEl.value.trim()||'🔖';
  const label=labelEl.value.trim();
  if(!label){ showToast('Enter a metric name','error'); return; }
  const id='c'+Date.now().toString(36)+Math.random().toString(36).slice(2,6);
  METRICS.push({id,label,icon,type:'number',unit:'',group:'lifestyle',pinned:false,step:1});
  saveSettingsRemote();
  iconEl.value=''; labelEl.value='';
  refreshAfterMetricChange();
  renderSettingsLists();
  showToast('Metric added');
}
function deleteMetric(id){
  if(METRICS.length<=1){ showToast('At least one metric is required','error'); return; }
  if(!confirm('Delete this metric? Numbers already saved under it stay in storage but will no longer show.')) return;
  METRICS=METRICS.filter(m=>m.id!==id);
  saveSettingsRemote();
  refreshAfterMetricChange();
  renderSettingsLists();
  showToast('Metric deleted');
}
let _renderedSettingsListsSig=null;
function settingsListsSignature(){
  return JSON.stringify(METRICS.map(m=>[m.id,m.icon,m.label,m.pinned?1:0]));
}
function renderSettingsLists(){
  const ml=document.getElementById('metricList');
  const sig=settingsListsSignature();
  if(sig!==_renderedSettingsListsSig){
    if(ml) ml.innerHTML=METRICS.map(metRowHTML).join('');
    _renderedSettingsListsSig=sig;
  }
  renderGoalList();
  const ph=document.getElementById('profHeightInput'); if(ph) ph.value=PROFILE.height||'';
  const pa=document.getElementById('profAgeInput'); if(pa) pa.value=PROFILE.age||'';
  const ps=document.getElementById('profSexInput'); if(ps) ps.value=PROFILE.sex||'male';
  const pac=document.getElementById('profActivityInput'); if(pac) pac.value=PROFILE.activity||1.375;
}

// ─── TOAST ─────────────────────────────────────────────────────
function showToast(msg,err=false){
  const t=document.getElementById('toast');
  t.textContent=msg;
  t.className='toast show'+(err?' error':'');
  setTimeout(()=>t.className='toast',2200);
}
function yieldToUI(){ return new Promise(r=>setTimeout(r,0)); }
function downloadBlob(content,mime,filename){
  const blob=new Blob([content],{type:mime});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url; a.download=filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}

// ─── BACKUP / RESTORE / CSV ────────────────────────────────────
function exportAllDataJSON(){
  showToast('Preparing backup…');
  setTimeout(()=>{
    try{
      const days={};
      allDayEntries().forEach(({key,data})=>{ days[key]=data; });
      const payload={ version:1, exportedAt:new Date().toISOString(), metrics:METRICS, goals:SAVINGS_GOALS, profile:PROFILE, days };
      downloadBlob(JSON.stringify(payload,null,2), 'application/json', `health-tracker-backup-${new Date().toISOString().slice(0,10)}.json`);
      showToast('Backup downloaded');
    }catch(err){ console.error('Backup export failed:',err); showToast('Backup export failed — check console','error'); }
  },10);
}
async function batchSetDays(entries){
  const BATCH=15;
  for(let i=0;i<entries.length;i+=BATCH){
    const chunk=entries.slice(i,i+BATCH);
    await Promise.all(chunk.map(e=>setDay(e.y,e.m,e.d,e.data)));
  }
}
async function importAllDataJSON(fileInput){
  const file=fileInput.files?.[0];
  if(!file) return;
  let payload;
  try{ payload=JSON.parse(await file.text()); }
  catch{ showToast('Invalid backup file','error'); fileInput.value=''; return; }
  if(!payload||typeof payload!=='object'){ showToast('Invalid backup file','error'); fileInput.value=''; return; }
  if(!confirm('This replaces ALL current data (metrics, goals, profile, and every day logged) with this backup file. Continue?')){ fileInput.value=''; return; }
  showToast('Restoring backup…');
  await yieldToUI();
  try{
    if(Array.isArray(payload.metrics)&&payload.metrics.length){ METRICS=payload.metrics; migratePinnedMetrics(); }
    if(payload.goals&&typeof payload.goals==='object') SAVINGS_GOALS=payload.goals;
    if(payload.profile&&typeof payload.profile==='object') PROFILE=Object.assign({height:0,age:0,sex:'male',activity:1.375},payload.profile);
    await saveSettingsRemote();

    allDayEntries().forEach(({key})=>localStorage.removeItem(key));
    invalidateDayEntriesCache();
    if(payload.days&&typeof payload.days==='object'){
      const dayKeyRe=/^ht_(\d+)_(\d+)_(\d+)$/;
      const toWrite=Object.entries(payload.days).map(([key,data])=>{
        const m2=key.match(dayKeyRe);
        if(!m2) return null;
        return {y:parseInt(m2[1]), m:parseInt(m2[2])-1, d:parseInt(m2[3]), data};
      }).filter(Boolean);
      await batchSetDays(toWrite);
    }

    renderFieldRows();
    renderSettingsLists();
    extraShownIds=new Set();
    loadDay(currentDay);
    if(document.getElementById('summarySection').classList.contains('active') && activeSummaryTab==='monthly') renderSummary();
    if(document.getElementById('summarySection').classList.contains('active') && activeSummaryTab==='yearly') renderYearly();
    if(document.getElementById('insightsSection').classList.contains('active')) renderInsightsTab();
    showToast('Backup restored');
    closeSettings();
  }catch(err){ console.error('Restore failed:',err); showToast('Restore failed — check console','error'); }
  fileInput.value='';
}
function csvEscape(v){
  const s=String(v==null?'':v);
  return /[",\r\n]/.test(s) ? '"'+s.replace(/"/g,'""')+'"' : s;
}
function exportAllDataCSV(){
  showToast('Preparing CSV…');
  setTimeout(()=>{
    try{
      const header=['Date'];
      METRICS.forEach(m=>{
        if(m.type==='bp') header.push(m.label+' (Sys)', m.label+' (Dia)');
        else if(m.type==='checklist') header.push(m.label);
        else header.push(m.label+(m.unit?` (${m.unit})`:''));
      });
      header.push('Mood/Notes');
      const rows=[header];
      allDayEntries().sort((a,b)=> (a.y-b.y)||(a.m-b.m)||(a.d-b.d)).forEach(({y,m,d,data})=>{
        const dateStr=`${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        const row=[dateStr];
        let notes=[];
        METRICS.forEach(met=>{
          if(met.type==='bp') row.push(data[met.id+'_sys']||'', data[met.id+'_dia']||'');
          else if(met.type==='checklist'){
            const items=data[met.id+'_items'];
            row.push(Array.isArray(items)?items.map(i=>`${i.name}${i.checked?' ✓':''}`).join('; '):'');
          }
          else if(met.type==='mood') row.push(data.mood||'');
          else row.push(data[met.id]||'');
          if(data['note_'+met.id]) notes.push(`${met.label}: ${data['note_'+met.id]}`);
        });
        row.push(notes.join(' | '));
        rows.push(row);
      });
      const csv=rows.map(r=>r.map(csvEscape).join(',')).join('\r\n');
      downloadBlob(csv, 'text/csv;charset=utf-8', `health-tracker-export-${new Date().toISOString().slice(0,10)}.csv`);
      showToast('CSV exported');
    }catch(err){ console.error('CSV export failed:',err); showToast('CSV export failed — check console','error'); }
  },10);
}

// ─── REMOVE ALL DATA ────────────────────────────────────────────
function openRemoveDataModal(){ rdShowStage(1); document.getElementById('removeDataModal').classList.add('open'); }
function closeRemoveDataModal(){ document.getElementById('removeDataModal').classList.remove('open'); rdShowStage(1); }
function rdShowStage(n){
  [1,2,3].forEach(i=>{
    const el=document.getElementById('rdStage'+i);
    if(el) el.style.display = (i===n) ? 'block' : 'none';
  });
}
async function confirmRemoveAllData(){
  const btn=document.getElementById('rdFinalBtn');
  if(btn){ btn.disabled=true; btn.textContent='Deleting…'; }
  try{
    allDayEntries().forEach(({key})=>localStorage.removeItem(key));
    invalidateDayEntriesCache();
    if(window._mtAuth && window._mtDb){
      const uid=window._mtAuth.currentUser?.uid;
      if(uid){
        try{
          const {doc,deleteDoc,collection,getDocs}=await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
          const col=collection(window._mtDb,"users",uid,"healthtracker");
          const snap=await getDocs(col);
          const ids=snap.docs.map(d=>d.id);
          const BATCH=15;
          for(let i=0;i<ids.length;i+=BATCH){
            await Promise.all(ids.slice(i,i+BATCH).map(id=>deleteDoc(doc(window._mtDb,"users",uid,"healthtracker",id))));
          }
          await deleteDoc(doc(window._mtDb,"users",uid,"healthtracker_meta","settings"));
        }catch(e){ console.error('HT Firestore wipe failed:',e); }
      }
    }
    METRICS=DEFAULT_METRICS.map(m=>({...m}));
    SAVINGS_GOALS={};
    PROFILE={height:0,age:0,sex:'male',activity:1.375};
    saveMetricsLocal(); saveGoalsLocalOnly(); saveProfileLocalOnly();
    extraShownIds=new Set();
    renderFieldRows();
    renderSettingsLists();
    loadDay(currentDay);
    if(document.getElementById('summarySection').classList.contains('active') && activeSummaryTab==='monthly') renderSummary();
    if(document.getElementById('summarySection').classList.contains('active') && activeSummaryTab==='yearly') renderYearly();
    if(document.getElementById('insightsSection').classList.contains('active')) renderInsightsTab();
    showToast('All data removed');
    closeRemoveDataModal();
  }catch(err){ console.error('Remove all failed:',err); showToast('Failed to remove data — check console','error'); }
  if(btn){ btn.disabled=false; btn.textContent='Yes, Delete Everything'; }
}

// ─── INIT ────────────────────────────────────────────────────
async function initApp(){
  loadMetricsLocal();
  loadGoalsLocal();
  loadProfileLocal();
  renderFieldRows();
  layoutNavForWidth();

  try {
    const {initializeApp}=await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js");
    const {getAuth,onAuthStateChanged}=await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js");
    const {getFirestore}=await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");

    const app=initializeApp({
      apiKey:"AIzaSyDl0Cqhjj-X9SjwMrrTWi_lW4ADsI8Gnq0",
      authDomain:"login-system-309fc.firebaseapp.com",
      projectId:"login-system-309fc",
      storageBucket:"login-system-309fc.firebasestorage.app",
      messagingSenderId:"509365590175",
      appId:"1:509365590175:web:2a1de8ab7688a96853aaaa"
    });
    window._mtAuth=getAuth(app);
    window._mtDb=getFirestore(app);

    onAuthStateChanged(window._mtAuth, async (user)=>{
      if(!user){
        window.location.href="login.html";
        return;
      }
      showToast('Loading data…');
      await loadMonthFromFirestore();
      splashStep();
      await loadSettingsRemote();
      splashStep();
      renderFieldRows();
      renderSettingsLists();
      initSelectors();
      const today=new Date();
      const startDay=curYear===today.getFullYear()&&curMonth===today.getMonth()?today.getDate():1;
      navOffset=Math.max(0,startDay-4);
      await selectDay(Math.min(startDay,daysInMonth(curYear,curMonth)));
      splashStep();
      splashFinish();
    });
  } catch(e){
    console.error("HT Firebase init failed:",e);
    initSelectors();
    const today=new Date();
    const startDay=curYear===today.getFullYear()&&curMonth===today.getMonth()?today.getDate():1;
    navOffset=Math.max(0,startDay-4);
    await selectDay(Math.min(startDay,daysInMonth(curYear,curMonth)));
    splashFinish();
  }
}

// ─── DAY QUICK VIEW (tap a day button) ──────────────────────────
function metricSummaryLine(m,data){
  if(m.type==='number'){
    const v=data[m.id];
    if(!v) return null;
    return {icon:m.icon,label:m.label,val:`${v}${m.unit?' '+m.unit:''}`,note:data['note_'+m.id]||''};
  }
  if(m.type==='bp'){
    const s=data[m.id+'_sys'], d=data[m.id+'_dia'];
    if(!s&&!d) return null;
    return {icon:m.icon,label:m.label,val:`${s||'–'}/${d||'–'} mmHg`,note:data['note_'+m.id]||''};
  }
  if(m.type==='scale'){
    const v=data[m.id];
    if(!v) return null;
    return {icon:m.icon,label:m.label,val:`${v}/5`,note:data['note_'+m.id]||''};
  }
  if(m.type==='mood'){
    if(!data.mood) return null;
    const mo=MOODS.find(x=>x.id===data.mood);
    return {icon:mo?mo.icon:'🙂',label:'Mood',val:mo?mo.label:data.mood,note:data['note_'+m.id]||''};
  }
  if(m.type==='checklist'){
    const items=data[m.id+'_items'];
    if(!Array.isArray(items)||!items.length) return null;
    const done=items.filter(i=>i.checked).length;
    return {icon:m.icon,label:m.label,val:`${done}/${items.length} taken`,note:items.map(i=>i.name+(i.checked?' ✓':' ✗')).join(', ')};
  }
  return null;
}
function openDayQuickView(y,m,d){
  const isActiveDay=(y===curYear&&m===curMonth&&d===currentDay);
  const data=isActiveDay?collectDayData():getDay(y,m,d);
  const lines=METRICS.map(met=>metricSummaryLine(met,data)).filter(Boolean);
  const dateStr=new Date(y,m,d).toLocaleDateString('en-US',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
  document.getElementById('dayQuickViewTitle').innerHTML=`<i class="fas fa-calendar-day"></i> Day ${d}`;
  document.getElementById('dayQuickViewSub').textContent=dateStr+(isActiveDay?' — currently open for editing':'');
  const rows=lines.map(l=>`<div class="cd-row"><div class="cd-date"><span class="cd-date-num" style="font-size:1.05rem">${l.icon}</span></div><div class="cd-amt"><div style="font-size:0.7rem;color:var(--text-soft);margin-bottom:3px">${escHtml(l.label)}</div><span class="cd-amt-val">${escHtml(l.val)}</span></div><div class="cd-note">${l.note?escHtml(l.note):'<span class="cd-dash">—</span>'}</div></div>`).join('');
  document.getElementById('dayQuickViewBody').innerHTML=`
    <div class="cd-panel">
      <div class="cd-panel-head"><span>Logged Metrics</span><span class="cd-panel-count">${lines.length}</span></div>
      <div class="cd-list">${rows||`<div class="cd-empty"><i class="fas fa-clipboard"></i> No metrics logged for this day</div>`}</div>
    </div>
    <button class="btn-primary" style="margin-top:14px" onclick="closeDayQuickView();switchView('day');selectDay(${d})"><i class="fas fa-pen"></i> Edit this day</button>
  `;
  document.getElementById('dayQuickViewModal').classList.add('open');
}
function closeDayQuickView(){ document.getElementById('dayQuickViewModal').classList.remove('open'); }

// ─── SEARCH ──────────────────────────────────────────────────────
let searchDebounceTimer=null, searchFullResults=[], searchShowingAll=false;
const SEARCH_PAGE_SIZE=30;
function openSearch(){
  document.getElementById('searchModal').classList.add('open');
  const input=document.getElementById('searchInput');
  input.value='';
  clearTimeout(searchDebounceTimer);
  searchFullResults=[]; searchShowingAll=false;
  document.getElementById('searchResults').innerHTML='<div class="search-hint">Type to search your logged days…</div>';
  setTimeout(()=>input.focus(),50);
}
function closeSearch(){ document.getElementById('searchModal').classList.remove('open'); }
function searchAllDays(query){
  const q=query.trim().toLowerCase();
  if(!q) return [];
  const results=[];
  getAllDayEntriesCached().forEach(({y,m:mo,d,data})=>{
    METRICS.forEach(met=>{
      const note=data['note_'+met.id]||'';
      const line=metricSummaryLine(met,data);
      if(!line) return;
      const haystack=(met.label+' '+note).toLowerCase();
      if(haystack.includes(q)) results.push({y,mo,d,metric:met,line,note});
    });
  });
  results.sort((a,b)=>(b.y-a.y)||(b.mo-a.mo)||(b.d-a.d));
  return results.slice(0,150);
}
function searchResultRowHTML(r){
  const dateStr=new Date(r.y,r.mo,r.d).toLocaleDateString('en-US',{day:'numeric',month:'short',year:'numeric'});
  return `<div class="search-result-row" onclick="jumpToSearchResult(${r.y},${r.mo},${r.d})">
      <span class="sr-icon">${r.metric.icon}</span>
      <div class="sr-main">
        <div class="sr-label-line"><span>${escHtml(r.metric.label)}</span><span class="sr-amt">${escHtml(r.line.val)}</span></div>
        ${r.note?`<div class="sr-note"><i class="fas fa-note-sticky"></i> ${escHtml(r.note)}</div>`:''}
        <div class="sr-date">${dateStr}</div>
      </div>
    </div>`;
}
function renderSearchResults(){
  const box=document.getElementById('searchResults');
  if(!searchFullResults.length){ box.innerHTML='<div class="search-hint">No matches found</div>'; return; }
  const list=searchShowingAll?searchFullResults:searchFullResults.slice(0,SEARCH_PAGE_SIZE);
  let html=list.map(searchResultRowHTML).join('');
  if(!searchShowingAll&&searchFullResults.length>SEARCH_PAGE_SIZE){
    html+=`<button class="btn-outline" style="margin-top:2px" onclick="showAllSearchResults()">Show all ${searchFullResults.length} results</button>`;
  }
  box.innerHTML=html;
}
function showAllSearchResults(){ searchShowingAll=true; renderSearchResults(); }
function performSearch(){
  const q=document.getElementById('searchInput').value;
  const box=document.getElementById('searchResults');
  clearTimeout(searchDebounceTimer);
  if(!q.trim()){
    searchFullResults=[]; searchShowingAll=false;
    box.innerHTML='<div class="search-hint">Type to search your logged days…</div>';
    return;
  }
  searchDebounceTimer=setTimeout(()=>{
    searchFullResults=searchAllDays(q);
    searchShowingAll=false;
    renderSearchResults();
  },200);
}
async function jumpToSearchResult(y,mo,d){
  closeSearch();
  curYear=y; curMonth=mo;
  initSelectors();
  switchView('day');
  navOffset=Math.max(0,d-4);
  await selectDay(d);
}

// ─── PDF EXPORT (Day) ────────────────────────────────────────────
function pdfStyle(){
  return `<style>
    body{font-family:Arial,sans-serif;font-size:12px;color:#1a1a2e;padding:20px;}
    h1{font-size:18px;color:#0f766e;margin-bottom:2px;}
    .sub{color:#888;font-size:10px;margin-bottom:16px;}
    table{width:100%;border-collapse:collapse;margin-bottom:16px;font-size:11px;}
    th{background:#0f766e;color:#fff;padding:6px 9px;text-align:left;}
    td{padding:5px 9px;border-bottom:1px solid #eef;}
    tr:nth-child(even) td{background:#f6f8fb;}
    .num{text-align:right;}
    .sh{background:#2E86AB;color:#fff;padding:6px 10px;font-weight:700;font-size:11px;border-radius:4px;margin:12px 0 6px;}
    .chart-nodata{color:#999;font-size:11px;text-align:center;padding:10px;border:1px dashed #dde;border-radius:6px;margin-bottom:12px;}
    .pdf-chart-wrap{border:1px solid #dde;border-radius:8px;padding:10px;margin-bottom:16px;text-align:center;background:#fff;}
    .pdf-chart-wrap img{width:100%;max-width:650px;}
    @media print{ table, tr, .pdf-chart-wrap{ page-break-inside: avoid; break-inside: avoid; } h1,.sub,.sh{ page-break-after: avoid; } }
  </style>`;
}
function canvasImg(id,label){
  const el=document.getElementById(id);
  const heading=label?`<div class="sh">${escHtml(label)}</div>`:'';
  if(!el||el.style.display==='none'){
    return `${heading}<div class="chart-nodata">No data available for this chart yet</div>`;
  }
  try{
    const dataUrl=el.toDataURL('image/png',1.0);
    return `${heading}<div class="pdf-chart-wrap"><img src="${dataUrl}" alt="${escHtml(label||'chart')}"/></div>`;
  }catch(e){ return `${heading}<div class="chart-nodata">Chart unavailable</div>`; }
}
function printHTML(body,w){
  w=w||window.open('','_blank');
  if(!w) return null;
  w.document.write(`<html><head><meta charset="UTF-8"></head><body>${body}</body></html>`);
  w.document.close();
  w.onload=()=>w.print();
  return w;
}
function exportDayPDF(){
  const printWin=window.open('','_blank');
  showToast('Generating PDF…');
  setTimeout(()=>{
    try{
      if(!printWin) throw new Error('popup-blocked');
      const data=getDay(curYear,curMonth,currentDay);
      const lines=METRICS.map(met=>metricSummaryLine(met,data)).filter(Boolean);
      let rows=lines.map(l=>`<tr><td>${l.icon} ${escHtml(l.label)}</td><td class="num">${escHtml(l.val)}</td><td>${escHtml(l.note)}</td></tr>`).join('');
      if(!rows) rows='<tr><td colspan="3" style="text-align:center;color:#999">No metrics logged</td></tr>';
      printHTML(pdfStyle()+`<h1>Health Tracker — Day ${currentDay}</h1><div class="sub">${new Date(curYear,curMonth,currentDay).toLocaleDateString('en-US',{weekday:'long',day:'numeric',month:'long',year:'numeric'})}</div><table><tr><th>Metric</th><th class="num">Value</th><th>Note</th></tr>${rows}</table>`, printWin);
      showToast('PDF ready');
    }catch(err){
      console.error('Day PDF export failed:',err);
      showToast(err&&err.message==='popup-blocked'?'Popup blocked — allow popups to export PDF':'PDF export failed — check console','error');
    }
  },10);
}

// ─── MONTH CALC (aggregates for Summary view) ───────────────────
function getPrevMonth(y,m){ return m===0?{y:y-1,m:11}:{y,m:m-1}; }
function calcMonth(y,m){
  const days=daysInMonth(y,m);
  const weights=[], sys=[], dia=[], hrs=[], sugars=[], sleeps=[], waters=[], steps=[], calIn=[], calOut=[];
  const moodCounts={};
  let loggedDays=0;
  const dailyRows=[];
  for(let d=1;d<=days;d++){
    const data=getDay(y,m,d);
    const has=dayHasData(data);
    if(has) loggedDays++;
    if(data.weight>0) weights.push({d,v:data.weight});
    if(data.bp_sys>0||data.bp_dia>0) { sys.push({d,v:data.bp_sys||null}); dia.push({d,v:data.bp_dia||null}); }
    if(data.hr>0) hrs.push({d,v:data.hr});
    if(data.sugar>0) sugars.push({d,v:data.sugar});
    if(data.sleep>0) sleeps.push({d,v:data.sleep});
    if(data.water>0) waters.push({d,v:data.water});
    if(data.steps>0) steps.push({d,v:data.steps});
    if(data.calin>0) calIn.push({d,v:data.calin});
    if(data.calout>0) calOut.push({d,v:data.calout});
    if(data.mood) moodCounts[data.mood]=(moodCounts[data.mood]||0)+1;
    dailyRows.push({d,data,has});
  }
  return {days,loggedDays,weights,sys,dia,hrs,sugars,sleeps,waters,steps,calIn,calOut,moodCounts,dailyRows};
}
function avg(arr){ return arr.length?arr.reduce((s,x)=>s+(typeof x==='object'?x.v:x),0)/arr.length : null; }
function last(arr){ return arr.length?arr[arr.length-1].v:null; }
function first(arr){ return arr.length?arr[0].v:null; }

function bmiOf(weightKg){
  if(!weightKg||!PROFILE.height) return null;
  const hM=PROFILE.height/100;
  return weightKg/(hM*hM);
}
function bmiCategory(bmi){
  if(bmi==null) return null;
  if(bmi<18.5) return {label:'Underweight',cls:'under'};
  if(bmi<25) return {label:'Normal',cls:'normal'};
  if(bmi<30) return {label:'Overweight',cls:'over'};
  return {label:'Obese',cls:'obese'};
}
function bpCategory(sys,dia){
  if(sys==null||dia==null) return null;
  if(sys<120&&dia<80) return {label:'Normal',cls:'normal'};
  if(sys<130&&dia<80) return {label:'Elevated',cls:'over'};
  if(sys<140||dia<90) return {label:'Stage 1',cls:'over'};
  return {label:'Stage 2',cls:'obese'};
}

// ─── SUMMARY (MONTHLY) VIEW ───────────────────────────────────────
let _weightChart=null,_bpChart=null,_sleepWaterChart=null,_activityChart=null;
function destroyChart(ref){ if(ref) ref.destroy(); return null; }
function chartLibReady(){ return typeof Chart!=='undefined'; }
function chartOrEmpty(canvasId,hasData){
  const el=document.getElementById(canvasId);
  const show = hasData && chartLibReady();
  if(el) el.style.display=show?'':'none';
  let empty=el&&el.parentElement.querySelector('.chart-empty');
  if(!show){
    if(!empty){
      empty=document.createElement('div'); empty.className='chart-empty';
      empty.textContent = hasData && !chartLibReady() ? 'Chart library failed to load' : 'No data logged yet this month';
      el.parentElement.appendChild(empty);
    }
  } else if(empty){ empty.remove(); }
}
function renderSummary(){
  document.getElementById('summarySubtitle').textContent=`${MONTHS[curMonth]} ${curYear}`;
  const m=calcMonth(curYear,curMonth);

  const latestWeight=last(m.weights);
  const bmi=bmiOf(latestWeight);
  const bmiCat=bmiCategory(bmi);
  const latestSys=m.sys.length?m.sys[m.sys.length-1].v:null;
  const latestDia=m.dia.length?m.dia[m.dia.length-1].v:null;
  const bpCat=bpCategory(latestSys,latestDia);
  const avgSleep=avg(m.sleeps), avgWater=avg(m.waters), avgSteps=avg(m.steps);

  const statGrid=document.getElementById('summaryStatGrid');
  statGrid.innerHTML=`
    <div class="sum-card"><div class="sc-label">Latest Weight</div><div class="sc-val">${latestWeight?latestWeight+' kg':'–'}</div>${bmiCat?`<span class="ht-badge ${bmiCat.cls}" style="margin-top:6px">BMI ${bmi.toFixed(1)} · ${bmiCat.label}</span>`:''}</div>
    <div class="sum-card"><div class="sc-label">Latest BP</div><div class="sc-val">${latestSys?latestSys+'/'+latestDia:'–'}</div>${bpCat?`<span class="ht-badge ${bpCat.cls}" style="margin-top:6px">${bpCat.label}</span>`:''}</div>
    <div class="sum-card full"><div class="sc-label">Days Logged</div><div class="sc-val">${m.loggedDays} / ${m.days}</div></div>
    <div class="sum-card"><div class="sc-label">Avg Sleep</div><div class="sc-val">${avgSleep?avgSleep.toFixed(1)+' hrs':'–'}</div></div>
    <div class="sum-card"><div class="sc-label">Avg Water</div><div class="sc-val">${avgWater?avgWater.toFixed(1)+' L':'–'}</div></div>
    <div class="sum-card"><div class="sc-label">Avg Steps</div><div class="sc-val">${avgSteps?Math.round(avgSteps).toLocaleString('en-IN'):'–'}</div></div>
  `;

  // Goal card
  const goalBox=document.getElementById('goalCardContainer');
  if(SAVINGS_GOALS.weight>0 && latestWeight){
    const diff=latestWeight-SAVINGS_GOALS.weight;
    const startW=first(m.weights)||latestWeight;
    const totalToGo=Math.abs(startW-SAVINGS_GOALS.weight);
    const done=Math.abs(startW-latestWeight);
    const pct=totalToGo>0?Math.min(100,Math.round((done/totalToGo)*100)):(diff===0?100:0);
    goalBox.innerHTML=`<div class="goal-card"><div class="goal-head"><span>Weight Goal</span><span class="goal-pct">${pct}%</span></div><div class="goal-bar-track"><div class="goal-bar-fill" style="width:${pct}%"></div></div><div class="goal-amounts"><span>${latestWeight} kg now</span><span>Target ${SAVINGS_GOALS.weight} kg</span></div></div>`;
  } else { goalBox.innerHTML=''; }

  // Charts
  const weightData=m.weights.map(w=>({x:w.d,y:w.v}));
  chartOrEmpty('weightTrendChart', weightData.length>0);
  if(weightData.length && chartLibReady()){
    _weightChart=destroyChart(_weightChart);
    _weightChart=new Chart(document.getElementById('weightTrendChart'),{type:'line',data:{labels:weightData.map(p=>p.x),datasets:[{label:'Weight (kg)',data:weightData.map(p=>p.y),borderColor:'#0f766e',backgroundColor:'rgba(15,118,110,.15)',tension:.3,fill:true,pointRadius:3}]},options:{responsive:true,plugins:{legend:{display:false}},scales:{y:{beginAtZero:false}}}});
  }

  const hasBpOrHr=m.sys.length>0||m.hrs.length>0;
  chartOrEmpty('bpTrendChart', hasBpOrHr);
  if(hasBpOrHr && chartLibReady()){
    _bpChart=destroyChart(_bpChart);
    const labels=Array.from({length:m.days},(_, i)=>i+1);
    const sysMap={}, diaMap={}, hrMap={};
    m.sys.forEach(p=>sysMap[p.d]=p.v); m.dia.forEach(p=>diaMap[p.d]=p.v); m.hrs.forEach(p=>hrMap[p.d]=p.v);
    _bpChart=new Chart(document.getElementById('bpTrendChart'),{type:'line',data:{labels,datasets:[
      {label:'Systolic',data:labels.map(d=>sysMap[d]??null),borderColor:'#dc2626',tension:.3,pointRadius:2,spanGaps:true},
      {label:'Diastolic',data:labels.map(d=>diaMap[d]??null),borderColor:'#2563eb',tension:.3,pointRadius:2,spanGaps:true},
      {label:'Heart Rate',data:labels.map(d=>hrMap[d]??null),borderColor:'#a855f7',tension:.3,pointRadius:2,spanGaps:true,borderDash:[4,3]}
    ]},options:{responsive:true,plugins:{legend:{display:true,labels:{boxWidth:10,font:{size:10}}}}}});
  }

  const hasSleepWater=m.sleeps.length>0||m.waters.length>0;
  chartOrEmpty('sleepWaterChart', hasSleepWater);
  if(hasSleepWater && chartLibReady()){
    _sleepWaterChart=destroyChart(_sleepWaterChart);
    const labels=Array.from({length:m.days},(_, i)=>i+1);
    const sleepMap={}, waterMap={};
    m.sleeps.forEach(p=>sleepMap[p.d]=p.v); m.waters.forEach(p=>waterMap[p.d]=p.v);
    _sleepWaterChart=new Chart(document.getElementById('sleepWaterChart'),{type:'bar',data:{labels,datasets:[
      {label:'Sleep (hrs)',data:labels.map(d=>sleepMap[d]??null),backgroundColor:'#818cf8'},
      {label:'Water (L)',data:labels.map(d=>waterMap[d]??null),backgroundColor:'#38bdf8'}
    ]},options:{responsive:true,plugins:{legend:{display:true,labels:{boxWidth:10,font:{size:10}}}}}});
  }

  const hasActivity=m.steps.length>0||m.calIn.length>0||m.calOut.length>0;
  chartOrEmpty('activityChart', hasActivity);
  if(hasActivity && chartLibReady()){
    _activityChart=destroyChart(_activityChart);
    const labels=Array.from({length:m.days},(_, i)=>i+1);
    const stepMap={}, inMap={}, outMap={};
    m.steps.forEach(p=>stepMap[p.d]=p.v); m.calIn.forEach(p=>inMap[p.d]=p.v); m.calOut.forEach(p=>outMap[p.d]=p.v);
    _activityChart=new Chart(document.getElementById('activityChart'),{type:'bar',data:{labels,datasets:[
      {label:'Steps',data:labels.map(d=>stepMap[d]??null),backgroundColor:'#22c55e',yAxisID:'y'},
      {label:'Cal In',data:labels.map(d=>inMap[d]??null),backgroundColor:'#f97316',yAxisID:'y1'},
      {label:'Cal Out',data:labels.map(d=>outMap[d]??null),backgroundColor:'#ef4444',yAxisID:'y1'}
    ]},options:{responsive:true,plugins:{legend:{display:true,labels:{boxWidth:10,font:{size:10}}}},scales:{y:{position:'left',title:{display:true,text:'Steps',font:{size:9}}},y1:{position:'right',grid:{drawOnChartArea:false},title:{display:true,text:'kcal',font:{size:9}}}}}});
  }

  // Mood summary
  const moodBox=document.getElementById('moodSummary');
  const moodEntries=Object.entries(m.moodCounts);
  moodBox.innerHTML=moodEntries.length
    ? `<div class="ht-mood-summary">${MOODS.filter(mo=>m.moodCounts[mo.id]).map(mo=>`<div class="ht-mood-chip">${mo.icon} ${mo.label} <span class="cnt">${m.moodCounts[mo.id]}</span></div>`).join('')}</div>`
    : '<div class="chart-empty">No moods logged yet this month</div>';

  // Day by day list
  const dailyBox=document.getElementById('dailyList');
  const loggedRows=m.dailyRows.filter(r=>r.has);
  dailyBox.innerHTML=loggedRows.length ? loggedRows.map(r=>{
    const tags=[];
    if(r.data.weight) tags.push(`${r.data.weight}kg`);
    if(r.data.bp_sys) tags.push(`${r.data.bp_sys}/${r.data.bp_dia}`);
    if(r.data.sleep) tags.push(`${r.data.sleep}h sleep`);
    if(r.data.steps) tags.push(`${r.data.steps} steps`);
    const moodIcon=r.data.mood?(MOODS.find(x=>x.id===r.data.mood)||{}).icon:'';
    return `<div class="ht-day-row" onclick="openDayQuickView(${curYear},${curMonth},${r.d})"><span class="dr-day">D${r.d}</span><div class="dr-tags">${tags.map(t=>`<span>${escHtml(t)}</span>`).join('')}</div><span class="dr-mood">${moodIcon||''}</span></div>`;
  }).join('') : '<div class="chart-empty">No days logged yet this month</div>';
}

// ─── YEARLY VIEW ──────────────────────────────────────────────────
let _yearlyWeightChart=null, _yearlyConsistencyChart=null;
function renderYearly(){
  document.getElementById('yearlyTitle').textContent=curYear+' Health Summary';
  document.getElementById('yearlySubtitle').textContent='Full year overview';
  const monthStats=[];
  let totalLoggedDays=0, totalDays=0;
  const allWeights=[];
  for(let mo=0;mo<12;mo++){
    const mc=calcMonth(curYear,mo);
    totalLoggedDays+=mc.loggedDays; totalDays+=mc.days;
    mc.weights.forEach(w=>allWeights.push({label:MONTHS[mo].slice(0,3)+' '+w.d,v:w.v,mo}));
    monthStats.push({mo,...mc});
  }
  const avgWeight=avg(allWeights);
  const firstW=allWeights.length?allWeights[0].v:null;
  const lastW=allWeights.length?allWeights[allWeights.length-1].v:null;
  const change=(firstW!=null&&lastW!=null)?(lastW-firstW):null;

  document.getElementById('yearlyStatGrid').innerHTML=`
    <div class="yr-card"><div class="yc-label">Days Logged</div><div class="yc-val">${totalLoggedDays} / ${totalDays}</div></div>
    <div class="yr-card"><div class="yc-label">Avg Weight</div><div class="yc-val">${avgWeight?avgWeight.toFixed(1)+' kg':'–'}</div></div>
    <div class="yr-card full"><div class="yc-label">Weight Change (Year)</div><div class="yc-val" style="color:${change==null?'inherit':change<0?'var(--ht-normal,#059669)':change>0?'var(--ht-over,#b45309)':'inherit'}">${change==null?'–':(change>0?'+':'')+change.toFixed(1)+' kg'}</div></div>
  `;

  chartOrEmpty('yearlyWeightChart', allWeights.length>0);
  if(allWeights.length && chartLibReady()){
    _yearlyWeightChart=destroyChart(_yearlyWeightChart);
    _yearlyWeightChart=new Chart(document.getElementById('yearlyWeightChart'),{type:'line',data:{labels:allWeights.map(w=>w.label),datasets:[{label:'Weight (kg)',data:allWeights.map(w=>w.v),borderColor:'#0f766e',backgroundColor:'rgba(15,118,110,.12)',tension:.3,fill:true,pointRadius:2}]},options:{responsive:true,plugins:{legend:{display:false}}}});
  }

  chartOrEmpty('yearlyConsistencyChart', totalLoggedDays>0);
  if(totalLoggedDays>0 && chartLibReady()){
    _yearlyConsistencyChart=destroyChart(_yearlyConsistencyChart);
    _yearlyConsistencyChart=new Chart(document.getElementById('yearlyConsistencyChart'),{type:'bar',data:{labels:MONTHS.map(m=>m.slice(0,3)),datasets:[{label:'Days Logged',data:monthStats.map(s=>s.loggedDays),backgroundColor:'#0f766e'}]},options:{responsive:true,plugins:{legend:{display:false}},scales:{y:{beginAtZero:true,max:31}}}});
  }

  const breakdownBox=document.getElementById('monthlyBreakdown');
  const rowsHtml=monthStats.filter(s=>s.loggedDays>0).map(s=>{
    const aw=avg(s.weights);
    return `<div class="month-row" onclick="curMonth=${s.mo};document.getElementById('monthSel').value=${s.mo};onMonthChange();switchView('summary')"><span class="mr-name">${MONTHS[s.mo]}</span><span class="mr-net">${s.loggedDays}/${s.days} days${aw?' · '+aw.toFixed(1)+'kg avg':''}</span></div>`;
  }).join('');
  breakdownBox.innerHTML=rowsHtml || '<div class="chart-empty">No data logged yet this year</div>';
}

initApp();
setTimeout(()=>{
  const splash = document.getElementById('mtSplash');
  if (splash && !splash.classList.contains('mt-splash-hide')) splashFinish();
}, 15000);
