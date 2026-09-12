      // Random splash animation each time the page opens — add more filenames
      // to this array as you download more Lottie JSONs (all in repo root).
      (function(){
        var MT_SPLASH_ANIMS = ['loading1.json','loading2.json','loading3.json'];
        var pick = MT_SPLASH_ANIMS[Math.floor(Math.random()*MT_SPLASH_ANIMS.length)];
        document.getElementById('mtSplashLottie').setAttribute('src', pick);
      })();

// Theme sync — must run before render
if (localStorage.getItem('theme') === 'dark') {
  document.documentElement.setAttribute('data-theme', 'dark');
}

// ── Fullscreen toggle (⛶ button) ────────────────────────────────
// For when the page is opened as a normal browser tab (not installed
// via "Add to Home Screen"). This can only hide the browser's own
// nav/toolbar chrome on tap — a page can never auto-hide the address
// bar itself, that's a browser security rule, not something fixable
// in code. Installing via "Add to Home Screen" is what gives the true
// no-address-bar app launch every time (handled by manifest-moneytracker.json).
function toggleFullscreen(){
  const btn = document.getElementById('fullscreenBtn');
  if (!document.fullscreenElement) {
    const req = document.documentElement.requestFullscreen
      || document.documentElement.webkitRequestFullscreen
      || document.documentElement.msRequestFullscreen;
    if (req) {
      req.call(document.documentElement).then(()=>{
        if(btn){ const ic=btn.querySelector('i'); if(ic) ic.className='fas fa-expand'; }
      }).catch(()=>{
        showToast('Fullscreen not supported on this browser');
      });
    } else {
      showToast('Fullscreen not supported on this browser');
    }
  } else {
    const exit = document.exitFullscreen
      || document.webkitExitFullscreen
      || document.msExitFullscreen;
    if (exit) exit.call(document);
  }
}
// ── Modal overlays & bottom nav: plain CSS position:fixed, on purpose ──────
// A previous version of this file tried to "help" position:fixed with JS
// that read window.visualViewport and set explicit inline top/left/width/
// height/bottom pixel values. That backfired: on a real phone, a screen
// recording showed the popup's dark backdrop covering only a short strip
// around the modal box (real content clearly visible, undimmed, above and
// below it) and the bottom tab bar missing from the screen entirely. Both
// symptoms match stale JS-computed pixel values getting frozen at the exact
// moment Chrome's address bar was animating open/closed — the JS "fix" was
// the bug. Plain `position:fixed` is recalculated by the browser on every
// frame with no caching involved, so it can't go stale like that. Removed.

document.addEventListener('fullscreenchange', ()=>{
  const btn = document.getElementById('fullscreenBtn');
  if (btn) btn.title = document.fullscreenElement ? 'Exit fullscreen' : 'Fullscreen';
});

// ── Splash screen control ───────────────────────────────────────
// splashStep() is called once after each real Firebase load step
// completes, so the bar reflects actual progress, not a guess.
// splashFinish() is called once everything is truly ready.
const MT_SPLASH_TOTAL_STEPS = 4; // loadMonthFromFirestore, loadSettingsRemote, loadLedgerRemote, loadDebtsRemote
let mtSplashStepCount = 0;
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
  mtSplashStepCount++;
  const pct = Math.min(100, Math.round((mtSplashStepCount / MT_SPLASH_TOTAL_STEPS) * 100));
  const bar = document.getElementById('mtSplashBar');
  if (bar) bar.style.transform = 'scaleX(' + (pct / 100) + ')';
}
function splashFinish(){
  const bar = document.getElementById('mtSplashBar');
  const credit = document.getElementById('mtSplashCredit');
  const splash = document.getElementById('mtSplash');
  if (bar) bar.style.transform = 'scaleX(1)';
  if (credit) credit.classList.add('mt-splash-credit-show');
  // Hold long enough for the letter-wave to fully ripple through
  // (last letter delay + its animation length), then a brief beat, then fade.
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

// Built-in defaults — used the first time the app runs, or if a user resets.
// Categories are no longer hardcoded in the DOM: they're data now, so users
// can add/rename/remove them from Settings without touching any code.
const DEFAULT_EXPENSE_FIELDS = [
  {id:'nasta',label:'Nasta',icon:'🍳',budget:0,pinned:true},
  {id:'lunch',label:'Lunch',icon:'🍛',budget:0,pinned:true},
  {id:'dinner',label:'Dinner',icon:'🍽️',budget:0,pinned:true},
  {id:'extrafood',label:'Extra Food',icon:'🥡',budget:0,pinned:false},
  {id:'transport',label:'Transportation',icon:'🚌',budget:0,pinned:true},
  {id:'extra',label:'Extra',icon:'➕',budget:0,pinned:false},
  {id:'unifee',label:'University Fee',icon:'🎓',budget:0,pinned:false},
  {id:'rent',label:'Home Rent',icon:'🏠',budget:0,pinned:false},
  {id:'mobile',label:'Mobile',icon:'📱',budget:0,pinned:false},
  {id:'stationary',label:'Stationary',icon:'📝',budget:0,pinned:false},

  {id:'bankdp',label:'Bank DP',icon:'🏦',budget:0,pinned:false},
  {id:'shopping',label:'Shopping',icon:'🛍️',budget:0,pinned:false},
  {id:'beauty',label:'Beauty',icon:'💄',budget:0,pinned:false},
  {id:'gadget',label:'Gadget',icon:'📟',budget:0,pinned:false},
  {id:'gift',label:'Gift',icon:'🎁',budget:0,pinned:false},
  {id:'social',label:'Social',icon:'👥',budget:0,pinned:false},
  {id:'tour',label:'Tour',icon:'🧳',budget:0,pinned:false},
  {id:'necessary',label:'Necessary',icon:'🧾',budget:0,pinned:true},
  {id:'medicine',label:'Medicine',icon:'💊',budget:0,pinned:false},
];
const DEFAULT_INCOME_FIELDS = [
  {id:'family',label:'Family Income',icon:'👨‍👩‍👧',pinned:true},
  {id:'self',label:'Self Income',icon:'💼',pinned:true},
];
// Used to migrate categories saved before the pin/default-display feature existed —
// any category missing a `pinned` flag gets one assigned based on this starter set.
const DEFAULT_PINNED_EXPENSE_IDS=['nasta','lunch','dinner','transport','necessary'];
function migratePinnedFields(){
  EXPENSE_FIELDS.forEach(f=>{ if(typeof f.pinned!=='boolean') f.pinned=DEFAULT_PINNED_EXPENSE_IDS.includes(f.id); });
  INCOME_FIELDS.forEach(f=>{ if(typeof f.pinned!=='boolean') f.pinned=true; });
}
const DEFAULT_ACCOUNTS = [
  {id:'cash',label:'Cash',icon:'💵',opening:0},
  {id:'bkash',label:'bKash',icon:'📱',opening:0},
  {id:'card',label:'Card',icon:'💳',opening:0},
];

// Live, editable category lists (loaded from localStorage/Firestore in initApp)
let EXPENSE_FIELDS = [];
let INCOME_FIELDS = [];
let ALL_FIELDS = [];
let SAVINGS_GOAL = 0;
let ACCOUNTS = [];
let LEDGER = []; // manual account events: {id, ts, type:'add'|'transfer', accountId?, fromId?, toId?, amount, note?}
let DEBTS = []; // {id, type:'borrowed'|'lent', person, amount, date, note?, settled, settledDate?}
// Non-pinned category ids currently displayed in the Day view for whichever day is
// loaded right now — recomputed whenever the day changes, extended when the user
// manually adds one from the "+ Add category" picker.
let extraShownIds = new Set();
function computeExtraShownForData(data){
  const s=new Set();
  ALL_FIELDS.forEach(f=>{
    if(f.pinned) return;
    const hasAmount=(parseFloat(data[f.id])||0)>0;
    const hasNote=!!(data['note_'+f.id]&&String(data['note_'+f.id]).trim());
    const manuallyShown=!!data['shown_'+f.id];
    if(hasAmount||hasNote||manuallyShown) s.add(f.id);
  });
  return s;
}
function visibleFieldList(fields){
  return fields.filter(f=>f.pinned||extraShownIds.has(f.id));
}
// True if a non-pinned field has real data (amount/note) — in that case it
// must stay in the Day view and can't be manually removed from display.
function fieldForcedShown(f,data){
  if(f.pinned) return false;
  const hasAmount=(parseFloat(data[f.id])||0)>0;
  const hasNote=!!(data['note_'+f.id]&&String(data['note_'+f.id]).trim());
  return hasAmount||hasNote;
}

// One-time migration: older saves stored a static "balance" number per account.
// We now treat that number as the account's lifetime "opening" balance, and
// everything after that point (income/expense/transfers) is computed dynamically.
function migrateAccounts(){
  ACCOUNTS.forEach(a=>{
    if(typeof a.opening!=='number'){
      a.opening = typeof a.balance==='number' ? a.balance : 0;
    }
  });
}

// Which account an expense debits by default (no per-entry picker for expenses).
function defaultExpenseAccountId(){
  if(ACCOUNTS.some(a=>a.id==='cash')) return 'cash';
  return ACCOUNTS[0]?.id ?? null;
}
function defaultIncomeAccountId(){ return defaultExpenseAccountId(); }

// ── ACCOUNT BALANCES (dynamic, lifetime running total) ────────
// balance = opening + all income credited to it + manual "Add" + transfers in
//                    − expense debited from it (default: Cash, overridable per entry) − transfers out
// Recomputed from every saved day + the manual ledger — nothing is stored as
// a raw balance number anymore (except each account's one-time "opening" value).
function computeAccountBalances(){
  const balances={};
  ACCOUNTS.forEach(a=>{ balances[a.id]=a.opening||0; });
  const defAcct=defaultExpenseAccountId();
  getAllDayEntriesCached().forEach(({data})=>{
    EXPENSE_FIELDS.forEach(f=>{
      const amt=data[f.id];
      if(amt>0){
        const acctId=data['acct_'+f.id]||defAcct;
        if(acctId!=null) balances[acctId]=(balances[acctId]||0)-amt;
      }
    });
    INCOME_FIELDS.forEach(f=>{
      const amt=data[f.id];
      if(amt>0){
        const acctId=data['acct_'+f.id]||defAcct;
        if(acctId!=null) balances[acctId]=(balances[acctId]||0)+amt;
      }
    });
  });
  LEDGER.forEach(ev=>{
    if(ev.type==='add'){
      balances[ev.accountId]=(balances[ev.accountId]||0)+ev.amount;
    } else if(ev.type==='transfer'){
      balances[ev.fromId]=(balances[ev.fromId]||0)-ev.amount;
      balances[ev.toId]=(balances[ev.toId]||0)+ev.amount;
    }
  });
  // Unsettled debts still affect real cash on hand: money lent is out of the
  // account until received back; money borrowed is sitting in the account
  // until repaid. Once settled, it's already reconciled — no more adjustment.
  DEBTS.forEach(d=>{
    if(d.settled||!d.accountId) return;
    if(d.type==='lent') balances[d.accountId]=(balances[d.accountId]||0)-d.amount;
    else if(d.type==='borrowed') balances[d.accountId]=(balances[d.accountId]||0)+d.amount;
  });
  return balances;
}

function rebuildAllFields(){ ALL_FIELDS = [...EXPENSE_FIELDS, ...INCOME_FIELDS]; }

function escHtml(s){
  return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── CATEGORY + GOAL PERSISTENCE (local) ──────────────────────
function loadCategoriesLocal(){
  try{
    const raw=localStorage.getItem('mt_categories_v1');
    const parsed=raw?JSON.parse(raw):null;
    EXPENSE_FIELDS=(parsed&&Array.isArray(parsed.expense)&&parsed.expense.length)?parsed.expense:DEFAULT_EXPENSE_FIELDS.map(f=>({...f}));
    INCOME_FIELDS=(parsed&&Array.isArray(parsed.income)&&parsed.income.length)?parsed.income:DEFAULT_INCOME_FIELDS.map(f=>({...f}));
  }catch{
    EXPENSE_FIELDS=DEFAULT_EXPENSE_FIELDS.map(f=>({...f}));
    INCOME_FIELDS=DEFAULT_INCOME_FIELDS.map(f=>({...f}));
  }
  migratePinnedFields();
  rebuildAllFields();
}
function saveCategoriesLocal(){
  localStorage.setItem('mt_categories_v1', JSON.stringify({expense:EXPENSE_FIELDS, income:INCOME_FIELDS}));
}
function loadGoalLocal(){ SAVINGS_GOAL=parseFloat(localStorage.getItem('mt_savings_goal_v1'))||0; }
function saveGoalLocalOnly(){ localStorage.setItem('mt_savings_goal_v1', String(SAVINGS_GOAL)); }
function loadAccountsLocal(){
  try{
    const raw=localStorage.getItem('mt_accounts_v1');
    const parsed=raw?JSON.parse(raw):null;
    ACCOUNTS=(Array.isArray(parsed)&&parsed.length)?parsed:DEFAULT_ACCOUNTS.map(a=>({...a}));
  }catch{
    ACCOUNTS=DEFAULT_ACCOUNTS.map(a=>({...a}));
  }
  migrateAccounts();
}
function saveAccountsLocal(){
  localStorage.setItem('mt_accounts_v1', JSON.stringify(ACCOUNTS));
}
function loadLedgerLocal(){
  try{
    const raw=localStorage.getItem('mt_ledger_v1');
    const parsed=raw?JSON.parse(raw):null;
    LEDGER=Array.isArray(parsed)?parsed:[];
  }catch{ LEDGER=[]; }
}
function saveLedgerLocal(){
  localStorage.setItem('mt_ledger_v1', JSON.stringify(LEDGER));
}
async function saveLedgerRemote(){
  saveLedgerLocal();
  if(!window._mtAuth||!window._mtDb) return;
  const uid=window._mtAuth.currentUser?.uid;
  if(!uid) return;
  try{
    const {doc,setDoc}=await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
    await setDoc(doc(window._mtDb,"users",uid,"moneytracker_meta","ledger"),{events:LEDGER});
  }catch(e){console.error("Ledger save failed:",e);}
}
async function loadLedgerRemote(){
  if(!window._mtAuth||!window._mtDb) return false;
  const uid=window._mtAuth.currentUser?.uid;
  if(!uid) return false;
  try{
    const {doc,getDoc}=await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
    const snap=await getDoc(doc(window._mtDb,"users",uid,"moneytracker_meta","ledger"));
    if(snap.exists()){
      const data=snap.data();
      if(Array.isArray(data.events)) LEDGER=data.events;
      saveLedgerLocal();
      return true;
    }
  }catch(e){console.error("Ledger load failed:",e);}
  return false;
}

// ── DEBTS / LOANS (money borrowed from or lent to people) ────
function loadDebtsLocal(){
  try{
    const raw=localStorage.getItem('mt_debts_v1');
    const parsed=raw?JSON.parse(raw):null;
    DEBTS=Array.isArray(parsed)?parsed:[];
  }catch{ DEBTS=[]; }
}
function saveDebtsLocal(){
  localStorage.setItem('mt_debts_v1', JSON.stringify(DEBTS));
}
async function saveDebtsRemote(){
  saveDebtsLocal();
  if(!window._mtAuth||!window._mtDb) return;
  const uid=window._mtAuth.currentUser?.uid;
  if(!uid) return;
  try{
    const {doc,setDoc}=await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
    await setDoc(doc(window._mtDb,"users",uid,"moneytracker_meta","debts"),{items:DEBTS});
  }catch(e){console.error("Debts save failed:",e);}
}
async function loadDebtsRemote(){
  if(!window._mtAuth||!window._mtDb) return false;
  const uid=window._mtAuth.currentUser?.uid;
  if(!uid) return false;
  try{
    const {doc,getDoc}=await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
    const snap=await getDoc(doc(window._mtDb,"users",uid,"moneytracker_meta","debts"));
    if(snap.exists()){
      const data=snap.data();
      if(Array.isArray(data.items)) DEBTS=data.items;
      saveDebtsLocal();
      return true;
    }
  }catch(e){console.error("Debts load failed:",e);}
  return false;
}

// ── CATEGORY + GOAL PERSISTENCE (Firestore, one combined doc) ─
async function saveSettingsRemote(){
  saveCategoriesLocal();
  saveGoalLocalOnly();
  saveAccountsLocal();
  if(!window._mtAuth||!window._mtDb) return;
  const uid=window._mtAuth.currentUser?.uid;
  if(!uid) return;
  try{
    const {doc,setDoc}=await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
    await setDoc(doc(window._mtDb,"users",uid,"moneytracker_meta","settings"),{expense:EXPENSE_FIELDS,income:INCOME_FIELDS,goal:SAVINGS_GOAL,accounts:ACCOUNTS});
  }catch(e){console.error("Settings save failed:",e);}
}
async function loadSettingsRemote(){
  if(!window._mtAuth||!window._mtDb) return false;
  const uid=window._mtAuth.currentUser?.uid;
  if(!uid) return false;
  try{
    const {doc,getDoc}=await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
    const snap=await getDoc(doc(window._mtDb,"users",uid,"moneytracker_meta","settings"));
    if(snap.exists()){
      const data=snap.data();
      if(Array.isArray(data.expense)&&data.expense.length) EXPENSE_FIELDS=data.expense;
      if(Array.isArray(data.income)&&data.income.length) INCOME_FIELDS=data.income;
      SAVINGS_GOAL=typeof data.goal==='number'?data.goal:SAVINGS_GOAL;
      if(Array.isArray(data.accounts)&&data.accounts.length) ACCOUNTS=data.accounts;
      migrateAccounts();
      migratePinnedFields();
      rebuildAllFields();
      saveCategoriesLocal();
      saveGoalLocalOnly();
      saveAccountsLocal();
      return true;
    }
  }catch(e){console.error("Settings load failed:",e);}
  return false;
}

let currentDay=1, navOffset=0;
let curYear=new Date().getFullYear(), curMonth=new Date().getMonth();

function isLeap(y){return (y%4===0&&y%100!==0)||y%400===0;}
function daysInMonth(y,m){return m===1&&isLeap(y)?29:DAYS_IN_MONTH[m];}

function storageKey(y,m,d){return `mt_${y}_${m+1}_${d}`;}

// ── LOCAL (sync, used for summary/yearly calc) ───────────────
function getDay(y,m,d){try{return JSON.parse(localStorage.getItem(storageKey(y,m,d)))||{};}catch{return {};}}
function setDayLocal(y,m,d,data){localStorage.setItem(storageKey(y,m,d),JSON.stringify(data)); invalidateDayEntriesCache();}

// ── CACHED FULL-DATA SCAN (perf) ──────────────────────────────
// Summary / Search / Ledger / Insights each need every saved day. Re-scanning
// and JSON.parsing all of localStorage on every one of those screens gets
// slower as months of data pile up. The underlying data only actually changes
// when a day is written (setDayLocal, above), so we scan once and reuse the
// result until a write invalidates it. Output is identical to a fresh scan —
// this only removes repeated, redundant work.
let _dayEntriesCache=null;
function invalidateDayEntriesCache(){ _dayEntriesCache=null; }
function getAllDayEntriesCached(){
  if(!_dayEntriesCache) _dayEntriesCache=allDayEntries();
  return _dayEntriesCache;
}

// ── DAY LOCK ───────────────────────────────────────────────
// A day auto-locks once it's DAY_AUTO_LOCK_AFTER_DAYS old, purely by date —
// no flag needs to be stored for that. A manual tap on the lock bar stores an
// explicit override (`data.locked`, true/false) that wins over the date rule
// either way, so a day can be unlocked early for editing or locked early to
// protect it. No password — it's just a tap.
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

// ── FIRESTORE SAVE ───────────────────────────────────────────
async function setDay(y,m,d,data){
  setDayLocal(y,m,d,data);
  if(!window._mtAuth||!window._mtDb) return;
  const uid=window._mtAuth.currentUser?.uid;
  if(!uid) return;
  try {
    const {doc,setDoc}=await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
    await setDoc(doc(window._mtDb,"users",uid,"moneytracker",`${y}_${m+1}_${d}`),data);
  } catch(e){console.error("Firestore save failed:",e);}
}

// ── FIRESTORE LOAD ONE DAY ───────────────────────────────────
async function loadDayFromFirestore(y,m,d){
  if(!window._mtAuth||!window._mtDb) return;
  const uid=window._mtAuth.currentUser?.uid;
  if(!uid) return;
  try {
    const {doc,getDoc}=await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
    const snap=await getDoc(doc(window._mtDb,"users",uid,"moneytracker",`${y}_${m+1}_${d}`));
    if(snap.exists()) setDayLocal(y,m,d,snap.data());
  } catch(e){console.error("Firestore load failed:",e);}
}

// ── FIRESTORE LOAD ALL DATA ───────────────────────────────────
// NOTE: this already fetches the user's FULL collection (Firestore can't
// filter by "startsWith" server-side), so we now cache every doc we get
// back — not just the current y/m. Previously only the current month was
// cached, so Yearly Summary showed 0 for any month never opened directly.
async function loadMonthFromFirestore(y,m){
  if(!window._mtAuth||!window._mtDb) return;
  const uid=window._mtAuth.currentUser?.uid;
  if(!uid) return;
  try {
    const {collection,getDocs}=await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
    const col=collection(window._mtDb,"users",uid,"moneytracker");
    const snap=await getDocs(col);
    snap.forEach(d=>{
      const parts=d.id.split('_');
      const yy=parseInt(parts[0]), mm=parseInt(parts[1])-1, dd=parseInt(parts[2]);
      if(!isNaN(yy)&&!isNaN(mm)&&!isNaN(dd)) setDayLocal(yy,mm,dd,d.data());
    });
  } catch(e){console.error("Firestore data load failed:",e);}
}

// ─── INIT SELECTORS ──────────────────────────────────────────────────────────
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
  await loadMonthFromFirestore(curYear,curMonth);
  await selectDay(currentDay);
  if(document.getElementById('summarySection').classList.contains('active')) renderSummary();
  if(document.getElementById('yearlySection').classList.contains('active')) renderYearly();
  if(document.getElementById('insightsSection').classList.contains('active')) renderInsightsTab();
}

// ─── DYNAMIC FIELD ROWS (built from EXPENSE_FIELDS / INCOME_FIELDS) ──────────
function fieldRowHTML(f,isIncome){
  const acctSelect=`<div class="acct-select-wrap" title="${isIncome?'Deposit to':'Pay from'}"><span class="acct-select-icon" id="accticon_${f.id}"></span><select class="field-acct-select" id="acct_${f.id}" onchange="updateAcctIcon('${f.id}')">${ACCOUNTS.map(a=>`<option value="${a.id}">${a.icon} ${escHtml(a.label)}</option>`).join('')}</select></div>`;
  return `<div class="field-row"><span class="field-icon">${f.icon}</span><span class="field-label">${escHtml(f.label)}</span><input class="field-input${isIncome?' income-inp':''}" type="text" inputmode="decimal" autocomplete="off" placeholder="0" id="f_${f.id}">${acctSelect}<button class="note-btn" type="button" onclick="toggleNote('${f.id}')" id="nbtn_${f.id}" title="Add note">📝</button></div><div class="note-row" id="noterow_${f.id}"><input class="note-input" type="text" placeholder="Note (optional)" id="note_${f.id}" maxlength="200"></div>`;
}

// Tracks which fields were actually rendered last, so loadDay() can skip a
// full DOM rebuild when switching to a day that would show the exact same
// set of rows — only the values differ, and applyDayValuesToDOM() already
// handles that safely on its own. Any call to renderFieldRows() (category
// edits, import, init, etc.) keeps this signature in sync automatically, so
// those flows are completely unaffected.
let _renderedFieldSig=null;
function fieldVisibilitySignature(){
  return visibleFieldList(EXPENSE_FIELDS).map(f=>f.id).join(',')+'|'+visibleFieldList(INCOME_FIELDS).map(f=>f.id).join(',');
}
function renderFieldRows(){
  const expC=document.getElementById('expenseFieldsContainer');
  const incC=document.getElementById('incomeFieldsContainer');
  if(expC) expC.innerHTML=visibleFieldList(EXPENSE_FIELDS).map(f=>fieldRowHTML(f,false)).join('');
  if(incC) incC.innerHTML=visibleFieldList(INCOME_FIELDS).map(f=>fieldRowHTML(f,true)).join('');
  attachFieldListeners();
  ALL_FIELDS.forEach(f=>updateAcctIcon(f.id));
  _renderedFieldSig=fieldVisibilitySignature();
}

// Keeps the small icon-only chip (the visible part of the account picker) in
// sync with whatever the underlying <select> is currently set to — the
// select itself stays invisible/overlaid so tapping it still opens the
// native picker (which shows full icon+name options), but the row only
// ever displays the icon, not "Cash"/"bKash"/"Card" text.
function updateAcctIcon(id){
  const sel=document.getElementById('acct_'+id);
  const iconSpan=document.getElementById('accticon_'+id);
  if(!sel||!iconSpan) return;
  const a=ACCOUNTS.find(x=>x.id===sel.value);
  iconSpan.textContent=a?a.icon:'💰';
}

function attachFieldListeners(){
  ALL_FIELDS.forEach(f=>{
    const el=document.getElementById('f_'+f.id);
    if(el){
      el.addEventListener('input',()=>{
        el.value=el.value.replace(/[^0-9+\-*/.() ]/g,'');
        if(el.value!==''&&!/[+\-*/]/.test(el.value.replace(/^-/,''))&&parseFloat(el.value)<0) el.value=0;
        updateTotals();
        scheduleAutoSave();
      });
      el.addEventListener('blur',()=>{ resolveAmountExpr(el); checkBudgetAlert(f.id); });
      el.addEventListener('keydown',(e)=>{ if(e.key==='Enter'){ e.preventDefault(); el.blur(); } });
    }
    const noteEl=document.getElementById('note_'+f.id);
    if(noteEl) noteEl.addEventListener('input',()=>{
      updateNoteIndicator(f.id, noteEl.value.trim().length>0);
      scheduleAutoSave();
    });
    const acctEl=document.getElementById('acct_'+f.id);
    if(acctEl) acctEl.addEventListener('change',()=>scheduleAutoSave());
  });
}

// ─── QUICK CALCULATOR INPUT (type "100+50" in an amount field) ──────────────
function evalAmountExpr(str){
  const cleaned=String(str==null?'':str).replace(/,/g,'').trim();
  if(!cleaned) return null;
  if(!/^[0-9+\-*/().\s]+$/.test(cleaned)) return null;
  if(!/[+\-*/]/.test(cleaned.replace(/^-/,''))) return null; // needs an operator to be worth evaluating
  try{
    const result=Function('"use strict";return ('+cleaned+')')();
    if(typeof result!=='number'||!isFinite(result)) return null;
    return Math.max(0,Math.round(result*100)/100);
  }catch{ return null; }
}
function resolveAmountExpr(el){
  const result=evalAmountExpr(el.value);
  if(result!==null){
    el.value=result;
    updateTotals();
    scheduleAutoSave();
  }
}

// ─── CATEGORY MANAGEMENT (add / edit / delete) ───────────────────────────────
function refreshAfterCategoryChange(){
  // Persist whatever's currently in the inputs before we tear down and rebuild the DOM
  const data=collectDayData();
  setDayLocal(curYear,curMonth,currentDay,data);
  extraShownIds=computeExtraShownForData(data);
  renderFieldRows();
  applyDayValuesToDOM(data);
  if(document.getElementById('summarySection').classList.contains('active')) renderSummary();
  if(document.getElementById('yearlySection').classList.contains('active')) renderYearly();
  if(document.getElementById('insightsSection').classList.contains('active')) renderInsightsTab();
}

function updateCategoryField(id,key,value){
  const f=EXPENSE_FIELDS.find(x=>x.id===id)||INCOME_FIELDS.find(x=>x.id===id);
  if(!f) return;
  if(key==='label'){
    const v=String(value).trim();
    if(!v) return; // ignore empty label, keep old one
    f.label=v;
  } else if(key==='icon'){
    f.icon=String(value).trim()||f.icon;
  } else if(key==='budget'){
    f.budget=Math.max(0,parseFloat(value)||0);
  }
  saveSettingsRemote();
  refreshAfterCategoryChange();
}

function addCategory(type){
  const iconEl=document.getElementById(type==='expense'?'newExpIcon':'newIncIcon');
  const labelEl=document.getElementById(type==='expense'?'newExpLabel':'newIncLabel');
  const icon=iconEl.value.trim()||'🔖';
  const label=labelEl.value.trim();
  if(!label){ showToast('Enter a category name','error'); return; }
  const id='c'+Date.now().toString(36)+Math.random().toString(36).slice(2,6);
  const newField=type==='expense'?{id,label,icon,budget:0,pinned:false}:{id,label,icon,pinned:false};
  if(type==='expense') EXPENSE_FIELDS.push(newField); else INCOME_FIELDS.push(newField);
  rebuildAllFields();
  saveSettingsRemote();
  iconEl.value=''; labelEl.value='';
  refreshAfterCategoryChange();
  renderSettingsLists();
  showToast('Category added');
}

function deleteCategory(id){
  const isExp=EXPENSE_FIELDS.some(f=>f.id===id);
  if(isExp && EXPENSE_FIELDS.length<=1){ showToast('At least one expense category is required','error'); return; }
  if(!isExp && INCOME_FIELDS.length<=1){ showToast('At least one income source is required','error'); return; }
  if(!confirm('Delete this category? Numbers already saved under it stay in storage but will no longer count in totals.')) return;
  if(isExp) EXPENSE_FIELDS=EXPENSE_FIELDS.filter(f=>f.id!==id);
  else INCOME_FIELDS=INCOME_FIELDS.filter(f=>f.id!==id);
  rebuildAllFields();
  saveSettingsRemote();
  refreshAfterCategoryChange();
  renderSettingsLists();
  showToast('Category deleted');
}

// ─── ACCOUNTS (Cash / bKash / Card / Bank — manually tracked balances) ───────
function updateAccountField(id,key,value){
  const a=ACCOUNTS.find(x=>x.id===id);
  if(!a) return;
  if(key==='label'){
    const v=String(value).trim();
    if(!v) return; // ignore empty label, keep old one
    a.label=v;
  } else if(key==='icon'){
    a.icon=String(value).trim()||a.icon;
  } else if(key==='opening'){
    a.opening=parseFloat(value)||0;
  }
  saveSettingsRemote();
  renderSettingsLists();
  renderAccountListSummary();
  showToast('Account updated');
}
function addAccount(){
  const iconEl=document.getElementById('newAcctIcon');
  const labelEl=document.getElementById('newAcctLabel');
  const icon=iconEl.value.trim()||'💰';
  const label=labelEl.value.trim();
  if(!label){ showToast('Enter an account name','error'); return; }
  const id='a'+Date.now().toString(36)+Math.random().toString(36).slice(2,6);
  ACCOUNTS.push({id,label,icon,opening:0});
  saveSettingsRemote();
  iconEl.value=''; labelEl.value='';
  renderSettingsLists();
  renderAccountListSummary();
  showToast('Account added');
}
function deleteAccount(id){
  if(ACCOUNTS.length<=1){ showToast('At least one account is required','error'); return; }
  const linkedDebts=DEBTS.filter(d=>d.accountId===id && !d.settled);
  const msg=linkedDebts.length
    ? `This account has ${linkedDebts.length} unsettled debt${linkedDebts.length>1?'s':''} linked to it — deleting it will stop ${linkedDebts.length>1?'them':'it'} from affecting your balance (the debt entries themselves stay, just unlinked). Delete anyway?`
    : 'Delete this account? Its tracked balance will be removed.';
  if(!confirm(msg)) return;
  ACCOUNTS=ACCOUNTS.filter(a=>a.id!==id);
  DEBTS.forEach(d=>{ if(d.accountId===id) d.accountId=null; });
  saveDebtsRemote();
  saveSettingsRemote();
  renderSettingsLists();
  renderAccountListSummary();
  renderAccountListSummary('accountListSummaryYear');
  showToast('Account deleted');
}

// ─── SETTINGS MODAL ───────────────────────────────────────────────────────────
function catRowHTML(f){
  const pinned=!!f.pinned;
  const pinTitle=pinned?'Shown in Day view every day — tap to unpin':'Hidden by default — tap to always show in Day view';
  return `<div class="cat-row"><button class="cat-pin-btn${pinned?' pinned':''}" onclick="toggleCategoryPin('${f.id}')" title="${pinTitle}"><i class="fas fa-star"></i></button><input class="cat-icon-input" value="${escHtml(f.icon)}" onchange="updateCategoryField('${f.id}','icon',this.value)"><input class="cat-label-input" value="${escHtml(f.label)}" onchange="updateCategoryField('${f.id}','label',this.value)"><button class="cat-del-btn" onclick="deleteCategory('${f.id}')" title="Delete"><i class="fas fa-trash"></i></button></div>`;
}
function toggleCategoryPin(id){
  const f=EXPENSE_FIELDS.find(x=>x.id===id)||INCOME_FIELDS.find(x=>x.id===id);
  if(!f) return;
  f.pinned=!f.pinned;
  saveSettingsRemote();
  refreshAfterCategoryChange();
  renderSettingsLists();
  showToast(f.pinned?'Pinned — shown every day':'Unpinned — hidden unless used');
}
function budgetRowHTML(f){
  const val=f.budget||'';
  return `<div class="cat-row"><span class="field-icon">${f.icon}</span><span class="field-label">${escHtml(f.label)}</span><input class="field-input" type="number" min="0" placeholder="0" value="${val}" onchange="updateCategoryField('${f.id}','budget',this.value)"></div>`;
}
function accountRowHTML(a){
  return `<div class="cat-row"><input class="cat-icon-input" value="${escHtml(a.icon)}" onchange="updateAccountField('${a.id}','icon',this.value)"><input class="cat-label-input" value="${escHtml(a.label)}" onchange="updateAccountField('${a.id}','label',this.value)"><input class="field-input" type="number" style="width:92px" placeholder="Opening" value="${a.opening||0}" onchange="updateAccountField('${a.id}','opening',this.value)"><button class="cat-del-btn" onclick="deleteAccount('${a.id}')" title="Delete"><i class="fas fa-trash"></i></button></div>`;
}
// Cheap signature over exactly what catRowHTML/budgetRowHTML/accountRowHTML
// read, so a redundant re-open of Settings (nothing edited since last time)
// can skip rebuilding 3 lists of inputs+listeners. Any mutation to these
// arrays (updateCategoryField, addCategory, deleteCategory, addAccount,
// deleteAccount, restore, etc.) changes the signature, so it never goes stale.
let _renderedSettingsListsSig=null;
function settingsListsSignature(){
  return JSON.stringify([
    EXPENSE_FIELDS.map(f=>[f.id,f.icon,f.label,f.pinned?1:0,f.budget||0]),
    INCOME_FIELDS.map(f=>[f.id,f.icon,f.label,f.pinned?1:0]),
    ACCOUNTS.map(a=>[a.id,a.icon,a.label,a.opening||0])
  ]);
}
function renderSettingsLists(){
  const ce=document.getElementById('catListExpense'), ci=document.getElementById('catListIncome'), bl=document.getElementById('budgetList'), gi=document.getElementById('goalInput'), al=document.getElementById('accountList');
  const sig=settingsListsSignature();
  if(sig!==_renderedSettingsListsSig){
    if(ce) ce.innerHTML=EXPENSE_FIELDS.map(catRowHTML).join('');
    if(ci) ci.innerHTML=INCOME_FIELDS.map(catRowHTML).join('');
    if(bl) bl.innerHTML=EXPENSE_FIELDS.map(budgetRowHTML).join('')||'<div style="color:var(--muted);text-align:center;padding:14px;font-size:0.82rem">No expense categories yet</div>';
    if(al) al.innerHTML=ACCOUNTS.map(accountRowHTML).join('')||'<div style="color:var(--muted);text-align:center;padding:14px;font-size:0.82rem">No accounts yet</div>';
    _renderedSettingsListsSig=sig;
  }
  if(gi) gi.value=SAVINGS_GOAL||'';
}
function openSettings(tab){
  renderSettingsLists();
  document.getElementById('settingsModal').classList.add('open');
  showSettingsTab(tab||'categories');
}
function closeSettings(){ document.getElementById('settingsModal').classList.remove('open'); }
function showSettingsTab(tab){
  document.querySelectorAll('.modal-tab').forEach(b=>b.classList.toggle('active', b.dataset.tab===tab));
  document.querySelectorAll('.settings-pane').forEach(p=>p.classList.toggle('active', p.id==='pane-'+tab));
}
function saveGoal(){
  SAVINGS_GOAL=Math.max(0,parseFloat(document.getElementById('goalInput').value)||0);
  saveSettingsRemote();
  showToast('Goal saved');
  if(document.getElementById('summarySection').classList.contains('active')) renderSummary();
}

// ─── DAY LOGIC ───────────────────────────────────────────────────────────────
// Fills the already-rendered field rows with a day's saved values. Split out from
// loadDay() so other flows (adding a category for today, pin/settings changes) can
// re-populate the DOM after a re-render without re-fetching or resetting visibility.
function applyDayValuesToDOM(data){
  ALL_FIELDS.forEach(f=>{
    const el=document.getElementById('f_'+f.id);
    if(el) el.value=data[f.id]||'';
    const noteEl=document.getElementById('note_'+f.id);
    const noteVal=data['note_'+f.id]||'';
    if(noteEl) noteEl.value=noteVal;
    const row=document.getElementById('noterow_'+f.id);
    const frow=document.getElementById('nbtn_'+f.id)?.closest('.field-row');
    const showRow=!!noteVal;
    if(row) row.classList.toggle('open', showRow);
    if(frow) frow.classList.toggle('note-open', showRow);
    updateNoteIndicator(f.id, !!noteVal);
    const acctEl=document.getElementById('acct_'+f.id);
    if(acctEl) acctEl.value=data['acct_'+f.id]||defaultIncomeAccountId()||'';
    updateAcctIcon(f.id);
  });
  updateTotals();
}

function loadDay(d){
  const data=getDay(curYear,curMonth,d);
  extraShownIds=computeExtraShownForData(data);
  if(fieldVisibilitySignature()!==_renderedFieldSig) renderFieldRows();
  applyDayValuesToDOM(data);
}

// ─── DAY-VIEW CATEGORY DISPLAY POPUP ──────────────────────────────────────────
// A display control only — never creates, renames, or deletes categories (that
// stays in Settings). Lists every category of the given type with two independent
// controls:
//   ⭐/☆  pin toggle   — permanent: pinned categories show in Day view every day
//   +/−   for today     — temporary: shows/hides this one category just for today
// A category with a real amount/note today can't be removed from display —
// it must stay visible until that data is cleared.
function openAddFieldModal(type){
  window._addFieldModalType=type;
  const data=collectDayData(); // live snapshot, incl. anything being typed right now
  setDayLocal(curYear,curMonth,currentDay,data);
  const fields=type==='expense'?EXPENSE_FIELDS:INCOME_FIELDS;
  document.getElementById('addFieldModalTitle').innerHTML=type==='expense'?'<i class="fas fa-list"></i> Manage Expense Categories':'<i class="fas fa-list"></i> Manage Income Sources';
  const list=document.getElementById('addFieldList');
  if(list) list.innerHTML=fields.map(f=>dayCatRowHTML(f,data)).join('');
  document.getElementById('addFieldModal').classList.add('open');
}
function closeAddFieldModal(){ document.getElementById('addFieldModal').classList.remove('open'); }
function reopenAddFieldModal(){
  if(document.getElementById('addFieldModal').classList.contains('open')) openAddFieldModal(window._addFieldModalType);
}
function dayCatRowHTML(f,data){
  const pinned=!!f.pinned;
  const forced=fieldForcedShown(f,data);
  const manuallyShown=!!data['shown_'+f.id];
  const pinBtn=`<button class="cat-pin-btn${pinned?' pinned':''}" onclick="toggleCategoryPinFromDay('${f.id}')" title="${pinned?'Unpin — stop showing every day':'Pin — show every day'}"><i class="fas fa-star"></i></button>`;
  const line1=`<span class="field-icon">${f.icon}</span><span class="cat-label-static">${escHtml(f.label)}</span>${pinBtn}`;
  if(pinned) return `<div class="cat-row">${line1}<span class="day-shown-badge">Always shown</span></div>`;
  if(forced) return `<div class="cat-row">${line1}<span class="day-shown-badge">Shown (has data)</span></div>`;
  if(manuallyShown) return `<div class="cat-row">${line1}<button class="day-remove-btn" onclick="removeFieldForToday('${f.id}')"><i class="fas fa-minus"></i> Remove</button></div>`;
  // Not shown yet — let them type the amount right here and add it in one step
  return `<div class="cat-row cat-row-stack">
    <div class="cat-row-line1">${line1}</div>
    <div class="day-quickadd-row">
      <input type="number" class="debt-input" id="quickAmt_${f.id}" placeholder="Amount" min="0" inputmode="decimal" onkeydown="if(event.key==='Enter'){event.preventDefault();addFieldForToday('${f.id}')}">
      <button class="day-add-btn" onclick="addFieldForToday('${f.id}')"><i class="fas fa-plus"></i> Add</button>
    </div>
  </div>`;
}
function toggleCategoryPinFromDay(id){
  const f=EXPENSE_FIELDS.find(x=>x.id===id)||INCOME_FIELDS.find(x=>x.id===id);
  if(!f) return;
  f.pinned=!f.pinned;
  saveSettingsRemote();
  refreshAfterCategoryChange();
  renderSettingsLists();
  reopenAddFieldModal();
}
function addFieldForToday(id){
  const data=collectDayData();
  data['shown_'+id]=true;
  const amtEl=document.getElementById('quickAmt_'+id);
  const amt=amtEl?parseFloat(amtEl.value):NaN;
  if(!isNaN(amt)&&amt>0) data[id]=amt;
  setDay(curYear,curMonth,currentDay,data);
  extraShownIds.add(id);
  renderFieldRows();
  applyDayValuesToDOM(data);
  reopenAddFieldModal();
  if(isNaN(amt)||amt<=0) document.getElementById('f_'+id)?.focus();
}
function removeFieldForToday(id){
  const data=collectDayData();
  const f=EXPENSE_FIELDS.find(x=>x.id===id)||INCOME_FIELDS.find(x=>x.id===id);
  if(f&&fieldForcedShown(f,data)){ showToast('Clear its amount/note first to remove it',true); return; }
  delete data['shown_'+id];
  setDay(curYear,curMonth,currentDay,data);
  extraShownIds.delete(id);
  renderFieldRows();
  applyDayValuesToDOM(data);
  reopenAddFieldModal();
}

// ── NOTES (per item, Day section only) ───────────────────────
function toggleNote(id){
  const row=document.getElementById('noterow_'+id);
  const btn=document.getElementById('nbtn_'+id);
  const frow=btn?.closest('.field-row');
  if(!row) return;
  const isOpen=row.classList.toggle('open');
  if(frow) frow.classList.toggle('note-open', isOpen);
  if(isOpen) document.getElementById('note_'+id)?.focus();
}

function updateNoteIndicator(id,hasNote){
  document.getElementById('nbtn_'+id)?.classList.toggle('has-note', hasNote);
}

function getVal(id){return parseFloat(document.getElementById(id)?.value)||0;}

function fmt(n,sign=false){
  const abs=Math.abs(n).toLocaleString('en-IN');
  if(sign) return (n>=0?'+':'-')+' ৳ '+abs;
  return '৳ '+abs;
}

function updateTotals(){
  const exp=EXPENSE_FIELDS.reduce((s,f)=>s+getVal('f_'+f.id),0);
  const inc=INCOME_FIELDS.reduce((s,f)=>s+getVal('f_'+f.id),0);
  const net=inc-exp;
  document.getElementById('totalExp').textContent=fmt(exp);
  document.getElementById('totalInc').textContent=fmt(inc);
  document.getElementById('netAmount').textContent=fmt(net);
  document.getElementById('netCard').className='net-card '+(net>=0?'positive':'negative');
}

function collectDayData(){
  const data={};
  const active=document.activeElement;
  ALL_FIELDS.forEach(f=>{
    const el=document.getElementById('f_'+f.id);
    let resolved=null;
    if(el){
      resolved=evalAmountExpr(el.value); // in case a "100+50"-style entry wasn't blurred yet
      // Only snap the visible text for fields the user ISN'T currently typing in.
      // Overwriting the active field mid-keystroke corrupts multi-digit entry
      // (e.g. typing "150+200" would collapse to "150+2"→152 the instant the
      // expression first becomes valid, then "00" gets appended to 152 → 15200).
      if(resolved!==null&&el!==active) el.value=resolved;
    }
    data[f.id]=resolved!==null?resolved:(parseFloat(el?.value)||0);
    const noteEl=document.getElementById('note_'+f.id);
    const noteVal=noteEl?noteEl.value.trim():'';
    if(noteVal) data['note_'+f.id]=noteVal;
    const acctEl=document.getElementById('acct_'+f.id);
    if(acctEl) data['acct_'+f.id]=acctEl.value;
  });
  // Keep a category visible for today even while its amount is 0, if it was
  // manually added via the Day-view picker and hasn't been removed since.
  ALL_FIELDS.forEach(f=>{
    if(f.pinned) return;
    if(!fieldForcedShown(f,data) && extraShownIds.has(f.id)) data['shown_'+f.id]=true;
  });
  // Carry over the lock override (if any) — collectDayData() only rebuilds
  // fields it knows about, so without this a normal Save/autosave would drop
  // a manual unlock/lock and let the 2-day auto-rule silently take back over.
  const existingLock=getDay(curYear,curMonth,currentDay).locked;
  if(typeof existingLock==='boolean') data.locked=existingLock;
  updateTotals();
  return data;
}

let autoSaveTimer=null;
function scheduleAutoSave(){
  if(isDayLocked(curYear,curMonth,currentDay)) return;
  setDayLocal(curYear,curMonth,currentDay,collectDayData());
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

// Tap-to-toggle, no password. Locking captures whatever's currently in the
// form first (like an implicit save) so nothing typed gets lost; unlocking
// just flips the stored flag since the fields were disabled either way.
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
  // Paint immediately from what's already local — no waiting on the network.
  loadDay(day);
  applyDayLockUI();
  renderDayBtns();
  // Then reconcile with Firestore in the background (e.g. an edit made on
  // another device). Same data flow/guarantee as before, just not blocking.
  const y=curYear, m=curMonth;
  await loadDayFromFirestore(y,m,day);
  const active=document.activeElement;
  const isEditing=active&&(active.classList.contains('field-input')||active.classList.contains('note-input'));
  if(curYear===y&&curMonth===m&&currentDay===day&&!isEditing){
    loadDay(day);
    applyDayLockUI();
  }
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
    const hasData=ALL_FIELDS.some(f=>(saved[f.id]||0)>0);
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

// ─── SWITCH VIEW ─────────────────────────────────────────────────────────────
// Tracks the view last rendered by switchView() itself, so re-tapping the
// tab you're already on doesn't redo the chart/list rebuild for nothing.
// Any other flow that mutates data (onMonthChange, category edits, import,
// etc.) already calls renderSummary()/renderYearly()/renderInsightsTab()
// directly via its own `.classList.contains('active')` check elsewhere in
// the file — those are unaffected and still always refresh.
let _lastRenderedView=null;
function switchView(view){
  document.getElementById('daySection').className=(view==='day'?'':'hidden');
  document.getElementById('summarySection').className='summary-section'+(view==='summary'?' active':'');
  document.getElementById('yearlySection').className='yearly-section'+(view==='yearly'?' active':'');
  document.getElementById('insightsSection').className='insights-section'+(view==='insights'?' active':'');
  ['day','summary','yearly','insights'].forEach(v=>{
    document.getElementById('bnav-'+v).className='bnav-btn'+(v===view?' active':'');
  });
  if(view!==_lastRenderedView){
    if(view==='summary') renderSummary();
    if(view==='yearly') renderYearly();
    if(view==='insights') renderInsightsTab();
    _lastRenderedView=view;
  }
  closeNavDrawer();
}

// ─── Desktop nav drawer (Daily/Monthly/Yearly/Insights slide-out menu) ──────
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
  } else {
    if(monthBar.previousElementSibling!==anchor){
      anchor.parentElement.insertBefore(monthBar, anchor.nextSibling);
      monthBar.classList.remove('in-drawer');
    }
    closeNavDrawer();
  }
}
window.addEventListener('resize', layoutNavForWidth);
layoutNavForWidth();

// ─── SEARCH (notes + transactions across every saved day) ───────────────────
let searchDebounceTimer=null;
const SEARCH_PAGE_SIZE=30; // initial rows shown before "Show more" — same idea as AH_PAGE_SIZE for account history
let searchFullResults=[]; // full (capped-at-150) result set for the current query
let searchShowingAll=false;
function openSearch(){
  document.getElementById('searchModal').classList.add('open');
  const input=document.getElementById('searchInput');
  input.value='';
  clearTimeout(searchDebounceTimer);
  searchFullResults=[]; searchShowingAll=false;
  document.getElementById('searchResults').innerHTML='<div class="search-hint">Type to search your notes and transactions…</div>';
  setTimeout(()=>input.focus(),50);
}
function closeSearch(){ document.getElementById('searchModal').classList.remove('open'); }

function searchAllTransactions(query){
  const q=query.trim().toLowerCase();
  if(!q) return [];
  const results=[];
  getAllDayEntriesCached().forEach(({y,m:mo,d,data})=>{
    ALL_FIELDS.forEach(f=>{
      const amt=data[f.id]||0;
      const note=data['note_'+f.id]||'';
      if(amt<=0&&!note) return;
      const haystack=(f.label+' '+note).toLowerCase();
      if(haystack.includes(q)){
        results.push({y,mo,d,field:f,amount:amt,note,isIncome:INCOME_FIELDS.some(x=>x.id===f.id)});
      }
    });
  });
  results.sort((a,b)=>(b.y-a.y)||(b.mo-a.mo)||(b.d-a.d));
  return results.slice(0,150);
}

function searchResultRowHTML(r){
  const dateStr=new Date(r.y,r.mo,r.d).toLocaleDateString('en-US',{day:'numeric',month:'short',year:'numeric'});
  const amtClass=r.isIncome?'inc':'exp';
  return `<div class="search-result-row" onclick="jumpToSearchResult(${r.y},${r.mo},${r.d})">
      <span class="sr-icon">${r.field.icon}</span>
      <div class="sr-main">
        <div class="sr-label-line"><span>${escHtml(r.field.label)}</span><span class="sr-amt ${amtClass}">${fmt(r.amount)}</span></div>
        ${r.note?`<div class="sr-note"><i class="fas fa-note-sticky"></i> ${escHtml(r.note)}</div>`:''}
        <div class="sr-date">${dateStr}</div>
      </div>
    </div>`;
}
// Renders only the first page of results (plus a "Show more" button) instead of
// dumping up to 150 rows into the DOM at once — same pattern as renderAcctHistoryList().
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

// Debounced (~200ms) so search doesn't re-run on every keystroke — but an
// emptied query clears synchronously with no delay, since that's just
// restoring the static hint text, not a search.
function performSearch(){
  const q=document.getElementById('searchInput').value;
  const box=document.getElementById('searchResults');
  clearTimeout(searchDebounceTimer);
  if(!q.trim()){
    searchFullResults=[]; searchShowingAll=false;
    box.innerHTML='<div class="search-hint">Type to search your notes and transactions…</div>';
    return;
  }
  searchDebounceTimer=setTimeout(()=>{
    searchFullResults=searchAllTransactions(q);
    searchShowingAll=false;
    renderSearchResults();
  },200);
}

async function jumpToSearchResult(y,mo,d){
  closeSearch();
  curYear=y; curMonth=mo;
  initSelectors();
  switchView('day');
  showToast('Loading…');
  await loadMonthFromFirestore(curYear,curMonth);
  navOffset=Math.max(0,d-4);
  await selectDay(d);
}

// ─── CALC MONTH ───────────────────────────────────────────────────────────────
function calcMonth(y,m){
  let totalExp=0,totalInc=0;
  const catTotals={};
  ALL_FIELDS.forEach(f=>catTotals[f.id]=0);
  const daily=[];
  const days=daysInMonth(y,m);
  for(let d=1;d<=days;d++){
    const data=getDay(y,m,d);
    const exp=EXPENSE_FIELDS.reduce((s,f)=>s+(data[f.id]||0),0);
    const inc=INCOME_FIELDS.reduce((s,f)=>s+(data[f.id]||0),0);
    totalExp+=exp; totalInc+=inc;
    ALL_FIELDS.forEach(f=>catTotals[f.id]+=(data[f.id]||0));
    if(exp>0||inc>0) daily.push({day:d,exp,inc,net:inc-exp,data});
  }
  return{totalExp,totalInc,net:totalInc-totalExp,catTotals,daily};
}

// Same as calcMonth, but only sums days 1..upToDay (inclusive). Used to compare
// a month-in-progress fairly against the same stretch of a prior month, instead
// of comparing e.g. "Aug 1–14" against all of July.
function calcMonthUpTo(y,m,upToDay){
  let totalExp=0,totalInc=0;
  const catTotals={};
  ALL_FIELDS.forEach(f=>catTotals[f.id]=0);
  const days=Math.min(upToDay,daysInMonth(y,m));
  for(let d=1;d<=days;d++){
    const data=getDay(y,m,d);
    const exp=EXPENSE_FIELDS.reduce((s,f)=>s+(data[f.id]||0),0);
    const inc=INCOME_FIELDS.reduce((s,f)=>s+(data[f.id]||0),0);
    totalExp+=exp; totalInc+=inc;
    ALL_FIELDS.forEach(f=>catTotals[f.id]+=(data[f.id]||0));
  }
  return{totalExp,totalInc,net:totalInc-totalExp,catTotals};
}

// ─── CHARTS (bar + pie, theme-aware) ───────────────────────────────────────────
const chartInstances={};
const CAT_PALETTE=['#1B3A5C','#7A2E2E','#4A6C8C','#A85C5C','#2F4A66','#8C4646','#5C7A96','#B37A7A','#264257','#6B3535','#7691AB','#96625E','#3D5A78','#9C5252','#3B5F4F','#6F4E37','#8A9BA8','#845C5C','#41576E'];

function chartColors(){
  const cs=getComputedStyle(document.documentElement);
  return {
    text:(cs.getPropertyValue('--text-main')||'#1a1a2e').trim()||'#1a1a2e',
    grid:(cs.getPropertyValue('--card-border')||'rgba(0,0,0,0.1)').trim()||'rgba(0,0,0,0.1)',
    exp:(cs.getPropertyValue('--danger')||'#dc2626').trim()||'#dc2626',
    inc:(cs.getPropertyValue('--accent2')||'#16a34a').trim()||'#16a34a',
    cardBg:(cs.getPropertyValue('--card-bg')||'#fff').trim()||'#fff'
  };
}

function destroyChart(id){
  if(chartInstances[id]){ chartInstances[id].destroy(); delete chartInstances[id]; }
}

// Shows/hides a message inside a chart-card so "no data" and "library
// failed to load" are visibly different from a silent blank box.
function setChartEmpty(id,show,msg){
  const canvas=document.getElementById(id);
  if(!canvas) return;
  let empty=document.getElementById(id+'_empty');
  if(!empty){
    empty=document.createElement('div');
    empty.id=id+'_empty';
    empty.className='chart-empty';
    canvas.parentElement.appendChild(empty);
  }
  if(msg) empty.innerHTML=msg;
  empty.style.display=show?'flex':'none';
  canvas.style.display=show?'none':'block';
}

function renderBarChart(id,labels,expData){
  const ctx=document.getElementById(id);
  destroyChart(id);
  if(!ctx) return;
  if(typeof Chart==='undefined'){ setChartEmpty(id,true,'<i class="fas fa-triangle-exclamation"></i> Chart library failed to load — check your internet connection'); return; }
  if(!labels.length||!expData.some(v=>v>0)){ setChartEmpty(id,true,'No expense data yet for this period'); return; }
  setChartEmpty(id,false);
  const c=chartColors();
  chartInstances[id]=new Chart(ctx,{
    type:'bar',
    data:{labels,datasets:[
      {label:'Expense',data:expData,backgroundColor:c.exp,borderRadius:4,maxBarThickness:22}
    ]},
    options:{
      responsive:true,maintainAspectRatio:false,
      plugins:{legend:{display:false}},
      scales:{
        x:{ticks:{color:c.text,font:{size:10}},grid:{display:false}},
        y:{beginAtZero:true,ticks:{color:c.text,font:{size:10}},grid:{color:c.grid}}
      }
    }
  });
}

function renderAreaChart(id,labels,expData){
  const ctx=document.getElementById(id);
  destroyChart(id);
  if(!ctx) return;
  if(typeof Chart==='undefined'){ setChartEmpty(id,true,'<i class="fas fa-triangle-exclamation"></i> Chart library failed to load — check your internet connection'); return; }
  if(!labels.length||!expData.some(v=>v>0)){ setChartEmpty(id,true,'No expense data yet for this period'); return; }
  setChartEmpty(id,false);
  const c=chartColors();
  chartInstances[id]=new Chart(ctx,{
    type:'line',
    data:{labels,datasets:[{
      label:'Expense',
      data:expData,
      borderColor:c.exp,
      backgroundColor:c.exp+'33',
      fill:true,
      tension:0.35,
      pointRadius:3,
      pointBackgroundColor:c.exp,
      pointBorderColor:c.cardBg,
      pointBorderWidth:1.5,
      borderWidth:2
    }]},
    options:{
      responsive:true,maintainAspectRatio:false,
      plugins:{legend:{display:false}},
      scales:{
        x:{ticks:{color:c.text,font:{size:10}},grid:{display:false}},
        y:{beginAtZero:true,ticks:{color:c.text,font:{size:10}},grid:{color:c.grid}}
      }
    }
  });
}

function renderPieChart(id,catTotals){
  const ctx=document.getElementById(id);
  destroyChart(id);
  if(!ctx) return;
  if(typeof Chart==='undefined'){ setChartEmpty(id,true,'<i class="fas fa-triangle-exclamation"></i> Chart library failed to load — check your internet connection'); return; }
  const entries=EXPENSE_FIELDS.map((f,i)=>({label:f.label,val:catTotals[f.id]||0,color:CAT_PALETTE[i%CAT_PALETTE.length]})).filter(e=>e.val>0);
  if(!entries.length){ setChartEmpty(id,true,'No expense data yet for this period'); return; }
  setChartEmpty(id,false);
  const c=chartColors();
  chartInstances[id]=new Chart(ctx,{
    type:'pie',
    data:{labels:entries.map(e=>e.label),datasets:[{data:entries.map(e=>e.val),backgroundColor:entries.map(e=>e.color),borderWidth:2,borderColor:c.cardBg}]},
    options:{
      responsive:true,maintainAspectRatio:false,
      plugins:{legend:{position:'bottom',labels:{color:c.text,font:{family:'Poppins',size:10},boxWidth:10,padding:8}}}
    }
  });
}

// ─── RENDER SUMMARY ───────────────────────────────────────────────────────────
function renderSummary(){
  const{totalExp,totalInc,net,catTotals,daily}=calcMonth(curYear,curMonth);
  document.getElementById('sumTotalExp').textContent=fmt(totalExp);
  document.getElementById('sumTotalInc').textContent=fmt(totalInc);
  const netEl=document.getElementById('sumNet');
  netEl.textContent=fmt(net);
  netEl.style.color=net>=0?'var(--accent2)':'var(--danger)';
  document.getElementById('summarySubtitle').textContent=`${MONTHS[curMonth]} ${curYear} — ${daily.length} days recorded`;

  renderBarChart('dailyBarChart', daily.map(d=>'D'+d.day), daily.map(d=>d.exp));
  renderAreaChart('dailyAreaChart', daily.map(d=>'D'+d.day), daily.map(d=>d.exp));
  renderPieChart('categoryPieChart', catTotals);

  const bl=document.getElementById('breakdownList');
  bl.innerHTML='';
  ALL_FIELDS.forEach(f=>{
    if(!catTotals[f.id]) return;
    const isInc=INCOME_FIELDS.some(x=>x.id===f.id);
    const row=document.createElement('div');
    row.className='breakdown-row';
    row.innerHTML=`<span class="br-left"><span>${f.icon}</span><span>${escHtml(f.label)}</span></span><span class="br-val ${isInc?'inc':'exp'}">${fmt(catTotals[f.id])}</span>`;
    row.style.cursor='pointer';
    row.title='View all entries';
    row.onclick=()=>openCategoryDetail(f.id);
    bl.appendChild(row);
  });
  if(!bl.innerHTML) bl.innerHTML='<div style="color:var(--muted);text-align:center;padding:14px;font-size:0.82rem">No data yet</div>';

  const dl=document.getElementById('dailyList');
  dl.innerHTML='';
  daily.forEach(({day,exp,inc,net:n})=>{
    const row=document.createElement('div');
    row.className='daily-row';
    row.innerHTML=`<span class="dr-day">Day ${day}</span><span class="dr-exp">${fmt(exp)}</span><span class="dr-inc">${fmt(inc)}</span><span class="dr-net ${n>=0?'pos':'neg'}">${fmt(n,true)}</span>`;
    row.onclick=()=>openDayQuickView(curYear,curMonth,day);
    dl.appendChild(row);
  });
  if(!dl.innerHTML) dl.innerHTML='<div style="color:var(--muted);text-align:center;padding:14px;font-size:0.82rem">No data yet</div>';

  renderSavingsGoalCard(catTotals);
  renderAccountListSummary();
  renderDebtsSummary('debtsSummary');
  renderBudgets(catTotals);
  renderBudgetAlertBanner(catTotals);
}

// ─── CATEGORY DETAIL (view-only, opens in a new tab) ───────────────────────────
// Triggered by clicking a category row in the Summary breakdown list. Walks every
// day of the currently viewed month, pulls out that one category's amount + note
// wherever it was entered, and lays it out as a simple read-only table.
function openCategoryDetail(fieldId){
  const f=ALL_FIELDS.find(x=>x.id===fieldId);
  if(!f) return;
  const isInc=INCOME_FIELDS.some(x=>x.id===fieldId);
  const totalDays=daysInMonth(curYear,curMonth);
  const entries=[];
  for(let d=1;d<=totalDays;d++){
    const data=getDay(curYear,curMonth,d);
    const v=data[f.id]||0;
    if(!v) continue;
    entries.push({day:d,amount:v,note:data['note_'+f.id]||''});
  }
  const total=entries.reduce((s,e)=>s+e.amount,0);
  const count=entries.length;
  const avg=count?total/count:0;
  const maxAmt=count?Math.max(...entries.map(e=>e.amount)):0;
  const accentVar=isInc?'var(--accent2)':'var(--danger)';
  const accentGlowVar=isInc?'var(--accent2-glow)':'rgba(220,38,38,0.14)';

  const rows=entries.map(e=>{
    const dt=new Date(curYear,curMonth,e.day);
    const weekday=dt.toLocaleDateString('en-US',{weekday:'short'});
    const barPct=maxAmt?Math.max(6,Math.round((e.amount/maxAmt)*100)):0;
    return `<div class="cd-row">
      <div class="cd-date"><span class="cd-date-num">${e.day}</span><span class="cd-date-dow">${weekday}</span></div>
      <div class="cd-amt">
        <div class="cd-amt-track"><div class="cd-amt-fill" style="width:${barPct}%"></div></div>
        <span class="cd-amt-val">${fmt(e.amount)}</span>
      </div>
      <div class="cd-note">${e.note?escHtml(e.note):'<span class="cd-dash">—</span>'}</div>
    </div>`;
  }).join('');
  const listBody=rows||`<div class="cd-empty"><i class="fas fa-clipboard"></i> No entries logged for ${escHtml(f.label)} in ${MONTHS[curMonth]}</div>`;

  document.getElementById('categoryDetailTitle').textContent=`${f.icon} ${f.label}`;
  document.getElementById('categoryDetailSub').textContent=`${MONTHS[curMonth]} ${curYear} activity`;
  document.getElementById('categoryDetailBody').innerHTML=`
    <div class="cd-stats">
      <div class="cd-stat cd-stat-hero" style="background:linear-gradient(135deg, ${accentGlowVar}, transparent);border-color:${accentGlowVar}">
        <div class="cd-stat-label">Total ${isInc?'Received':'Spent'}</div>
        <div class="cd-stat-val" style="color:${accentVar}">${fmt(total)}</div>
      </div>
      <div class="cd-stat"><div class="cd-stat-label">Entries</div><div class="cd-stat-val">${count}</div></div>
      <div class="cd-stat"><div class="cd-stat-label">Avg / Entry</div><div class="cd-stat-val">${fmt(Math.round(avg))}</div></div>
    </div>
    <div class="cd-panel">
      <div class="cd-panel-head"><span>Daily breakdown</span><span class="cd-panel-count">${count} ${count===1?'entry':'entries'}</span></div>
      <div class="cd-list" style="--cd-accent:${accentVar}">${listBody}</div>
    </div>
  `;
  document.getElementById('categoryDetailModal').classList.add('open');
}
function closeCategoryDetail(){ document.getElementById('categoryDetailModal').classList.remove('open'); }

// ─── CATEGORY DETAIL — YEAR VIEW (view-only) ───────────────────────────────────
// Same popup as openCategoryDetail above, but for a click coming from the
// Yearly "Category Breakdown" list: walks all 12 months of curYear instead of
// the days of one month, since a day-by-day list for a whole year would be
// too long to be useful at a glance.
function openCategoryDetailYear(fieldId){
  const f=ALL_FIELDS.find(x=>x.id===fieldId);
  if(!f) return;
  const isInc=INCOME_FIELDS.some(x=>x.id===fieldId);
  const entries=[];
  for(let m=0;m<12;m++){
    const{catTotals}=calcMonth(curYear,m);
    const v=catTotals[fieldId]||0;
    if(!v) continue;
    entries.push({m,amount:v});
  }
  const total=entries.reduce((s,e)=>s+e.amount,0);
  const count=entries.length;
  const avg=count?total/count:0;
  const maxAmt=count?Math.max(...entries.map(e=>e.amount)):0;
  const accentVar=isInc?'var(--accent2)':'var(--danger)';
  const accentGlowVar=isInc?'var(--accent2-glow)':'rgba(220,38,38,0.14)';

  const rows=entries.map(e=>{
    const barPct=maxAmt?Math.max(6,Math.round((e.amount/maxAmt)*100)):0;
    return `<div class="cd-row">
      <div class="cd-date"><span class="cd-date-num" style="font-size:0.82rem">${MONTHS[e.m].slice(0,3)}</span></div>
      <div class="cd-amt">
        <div class="cd-amt-track"><div class="cd-amt-fill" style="width:${barPct}%"></div></div>
        <span class="cd-amt-val">${fmt(e.amount)}</span>
      </div>
      <div class="cd-note"><span class="cd-dash">—</span></div>
    </div>`;
  }).join('');
  const listBody=rows||`<div class="cd-empty"><i class="fas fa-clipboard"></i> No entries logged for ${escHtml(f.label)} in ${curYear}</div>`;

  document.getElementById('categoryDetailTitle').textContent=`${f.icon} ${f.label}`;
  document.getElementById('categoryDetailSub').textContent=`${curYear} activity`;
  document.getElementById('categoryDetailBody').innerHTML=`
    <div class="cd-stats">
      <div class="cd-stat cd-stat-hero" style="background:linear-gradient(135deg, ${accentGlowVar}, transparent);border-color:${accentGlowVar}">
        <div class="cd-stat-label">Total ${isInc?'Received':'Spent'}</div>
        <div class="cd-stat-val" style="color:${accentVar}">${fmt(total)}</div>
      </div>
      <div class="cd-stat"><div class="cd-stat-label">Months</div><div class="cd-stat-val">${count}</div></div>
      <div class="cd-stat"><div class="cd-stat-label">Avg / Month</div><div class="cd-stat-val">${fmt(Math.round(avg))}</div></div>
    </div>
    <div class="cd-panel">
      <div class="cd-panel-head"><span>Monthly breakdown</span><span class="cd-panel-count">${count} ${count===1?'month':'months'}</span></div>
      <div class="cd-list" style="--cd-accent:${accentVar}">${listBody}</div>
    </div>
  `;
  document.getElementById('categoryDetailModal').classList.add('open');
}

// ─── DAY QUICK-VIEW (view-only, tap a day in the month strip) ─────────────────
// Tapping a day button used to switch straight into editing that day. Now it
// just previews it — same read-only pattern as the category detail popup
// above — so browsing other days doesn't disturb whatever you're currently
// typing. "Edit this day" is the one explicit action that actually switches.
function openDayQuickView(y,m,d){
  const isActiveDay=(y===curYear&&m===curMonth&&d===currentDay);
  const data=isActiveDay?collectDayData():getDay(y,m,d);
  const exp=EXPENSE_FIELDS.reduce((s,f)=>s+(data[f.id]||0),0);
  const inc=INCOME_FIELDS.reduce((s,f)=>s+(data[f.id]||0),0);
  const net=inc-exp;
  const entries=[];
  ALL_FIELDS.forEach(f=>{
    const amt=data[f.id]||0;
    const note=data['note_'+f.id]||'';
    if(amt<=0&&!note) return;
    entries.push({f,amt,note,isInc:INCOME_FIELDS.some(x=>x.id===f.id)});
  });
  const maxAmt=entries.length?Math.max(...entries.map(e=>e.amt)):0;
  const rows=entries.map(e=>{
    const barPct=maxAmt?Math.max(6,Math.round((e.amt/maxAmt)*100)):0;
    const accent=e.isInc?'var(--accent2)':'var(--danger)';
    return `<div class="cd-row" style="--cd-accent:${accent}">
      <div class="cd-date"><span class="cd-date-num" style="font-size:1.05rem">${e.f.icon}</span></div>
      <div class="cd-amt">
        <div style="font-size:0.7rem;color:var(--text-soft);margin-bottom:3px">${escHtml(e.f.label)}</div>
        <div class="cd-amt-track"><div class="cd-amt-fill" style="width:${barPct}%"></div></div>
        <span class="cd-amt-val">${fmt(e.amt)}</span>
      </div>
      <div class="cd-note">${e.note?escHtml(e.note):'<span class="cd-dash">—</span>'}</div>
    </div>`;
  }).join('');
  const netGlow=net>=0?'var(--accent2-glow)':'rgba(220,38,38,0.14)';
  const dateStr=new Date(y,m,d).toLocaleDateString('en-US',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
  document.getElementById('dayQuickViewTitle').innerHTML=`<i class="fas fa-calendar-day"></i> Day ${d}`;
  document.getElementById('dayQuickViewSub').textContent=dateStr+(isActiveDay?' — currently open for editing':'');
  document.getElementById('dayQuickViewBody').innerHTML=`
    <div class="cd-stats">
      <div class="cd-stat cd-stat-hero" style="background:linear-gradient(135deg, ${netGlow}, transparent);border-color:${netGlow}">
        <div class="cd-stat-label">Net</div>
        <div class="cd-stat-val" style="color:${net>=0?'var(--accent2)':'var(--danger)'}">${fmt(net,true)}</div>
      </div>
      <div class="cd-stat"><div class="cd-stat-label">Expense</div><div class="cd-stat-val" style="color:var(--danger)">${fmt(exp)}</div></div>
      <div class="cd-stat"><div class="cd-stat-label">Income</div><div class="cd-stat-val" style="color:var(--accent2)">${fmt(inc)}</div></div>
    </div>
    <div class="cd-panel">
      <div class="cd-panel-head"><span>Entries</span><span class="cd-panel-count">${entries.length}</span></div>
      <div class="cd-list">${rows||`<div class="cd-empty"><i class="fas fa-clipboard"></i> No entries logged for this day</div>`}</div>
    </div>
    <button class="btn-primary" style="margin-top:14px" onclick="closeDayQuickView();switchView('day');selectDay(${d})"><i class="fas fa-pen"></i> Edit this day</button>
  `;
  document.getElementById('dayQuickViewModal').classList.add('open');
}
function closeDayQuickView(){ document.getElementById('dayQuickViewModal').classList.remove('open'); }

// ─── MONTH QUICK-VIEW (view-only, tap a month row in Yearly Summary) ─────────
// Same idea, one level up: previews a month's category breakdown without
// leaving the Yearly screen. "Open full Summary" is the explicit action that
// actually navigates — the row itself used to do that directly.
function openMonthQuickView(m){
  const{totalExp,totalInc,net,catTotals,daily}=calcMonth(curYear,m);
  const rows=ALL_FIELDS.map(f=>{
    if(!catTotals[f.id]) return '';
    const isInc=INCOME_FIELDS.some(x=>x.id===f.id);
    return `<div class="breakdown-row"><span class="br-left"><span>${f.icon}</span><span>${escHtml(f.label)}</span></span><span class="br-val ${isInc?'inc':'exp'}">${fmt(catTotals[f.id])}</span></div>`;
  }).join('');
  const netGlow=net>=0?'var(--accent2-glow)':'rgba(220,38,38,0.14)';
  document.getElementById('monthQuickViewTitle').innerHTML=`<i class="fas fa-calendar"></i> ${MONTHS[m]}`;
  document.getElementById('monthQuickViewSub').textContent=`${curYear} — ${daily.length} days recorded`;
  document.getElementById('monthQuickViewBody').innerHTML=`
    <div class="cd-stats">
      <div class="cd-stat cd-stat-hero" style="background:linear-gradient(135deg, ${netGlow}, transparent);border-color:${netGlow}">
        <div class="cd-stat-label">Net</div>
        <div class="cd-stat-val" style="color:${net>=0?'var(--accent2)':'var(--danger)'}">${fmt(net,true)}</div>
      </div>
      <div class="cd-stat"><div class="cd-stat-label">Expense</div><div class="cd-stat-val" style="color:var(--danger)">${fmt(totalExp)}</div></div>
      <div class="cd-stat"><div class="cd-stat-label">Income</div><div class="cd-stat-val" style="color:var(--accent2)">${fmt(totalInc)}</div></div>
    </div>
    ${rows||'<div style="color:var(--muted);text-align:center;padding:14px;font-size:0.82rem">No data yet</div>'}
    <button class="btn-primary" style="margin-top:14px" onclick="closeMonthQuickView();openSummaryFromQuickView(${m})"><i class="fas fa-chart-column"></i> Open full Summary</button>
  `;
  document.getElementById('monthQuickViewModal').classList.add('open');
}
function closeMonthQuickView(){ document.getElementById('monthQuickViewModal').classList.remove('open'); }
function openSummaryFromQuickView(m){
  curMonth=m;
  document.getElementById('monthSel').value=m;
  switchView('summary');
}

// ─── SAVINGS GOAL ─────────────────────────────────────────────────────────────
// Shared by the Goal card and the Budget pace indicators: how many days of the
// given month have "elapsed" for prorating a budget so far.
//   - viewing the real current month → up through today's date
//   - a fully past month → the whole month counts as elapsed
//   - a future month → nothing has elapsed yet
function getElapsedDaysInMonth(y,m){
  const totalDaysInMonth=daysInMonth(y,m);
  const today=new Date();
  if(y===today.getFullYear()&&m===today.getMonth()) return today.getDate();
  if(new Date(y,m,1)<new Date(today.getFullYear(),today.getMonth(),1)) return totalDaysInMonth;
  return 0;
}
// Target = manually entered in Settings → Goal (SAVINGS_GOAL), unchanged.
// "Saved" (projected) is computed pace-based instead of full-month-vs-actual:
//   1. For each budgeted category, find the expected spend-so-far (budget prorated
//      to the number of days elapsed in the month) vs the actual spend-so-far.
//   2. Sum the (expected − actual) difference across all budgeted categories.
//   3. Average that difference per elapsed day.
//   4. Project that daily average out across the actual number of days in the
//      month — this projected value is what's shown/compared against the target.
function renderSavingsGoalCard(catTotals){
  const container=document.getElementById('goalCardContainer');
  if(!container) return;
  if(!SAVINGS_GOAL||SAVINGS_GOAL<=0){
    container.innerHTML=`<div class="goal-card empty" onclick="openSettings('goal')"><i class="fas fa-bullseye"></i> No savings goal set yet — tap to create one</div>`;
    return;
  }
  const totalDaysInMonth=daysInMonth(curYear,curMonth);
  const elapsedDays=getElapsedDaysInMonth(curYear,curMonth);
  const budgeted=EXPENSE_FIELDS.filter(f=>f.budget>0);
  let saved=0;
  if(elapsedDays>0){
    const diffSoFar=budgeted.reduce((s,f)=>{
      const expectedSoFar=(f.budget/totalDaysInMonth)*elapsedDays;
      const actualSoFar=catTotals[f.id]||0;
      return s+(expectedSoFar-actualSoFar);
    },0);
    const perDayDiff=diffSoFar/elapsedDays;
    saved=perDayDiff*totalDaysInMonth;
  }
  const pct=Math.max(0,Math.min(100,(saved/SAVINGS_GOAL)*100));
  container.innerHTML=`<div class="goal-card">
    <div class="goal-head"><span><i class="fas fa-bullseye"></i> Savings Goal — ${MONTHS[curMonth]}</span><span class="goal-edit" onclick="openSettings('goal')" title="Edit goal"><i class="fas fa-pen"></i></span></div>
    <div class="goal-amounts"><span class="goal-saved${saved<0?' neg':''}">${fmt(saved)}</span><span class="goal-of">of ${fmt(SAVINGS_GOAL)} target</span></div>
    <div class="goal-bar-track"><div class="goal-bar-fill" style="transform:scaleX(${pct/100})"></div></div>
    <div class="goal-pct">${pct.toFixed(0)}% reached</div>
  </div>`;
}

// ─── ACCOUNTS ─────────────────────────────────────────────────────────────────
// Dynamic, lifetime-running balances (Cash / bKash / Card / Bank, etc).
// Computed from: opening balance + income credited to the account + manual
// "Add" entries + transfers in − expenses (default: Cash) − transfers out.
function renderAccountListSummary(containerId){
  containerId = containerId || 'accountListSummary';
  const container=document.getElementById(containerId);
  if(!container) return;
  if(!ACCOUNTS.length){
    container.innerHTML='<div style="color:var(--muted);text-align:center;padding:14px;font-size:0.82rem">No accounts yet — add one in <i class="fas fa-gear"></i> Settings → Accounts</div>';
    return;
  }
  const balances=computeAccountBalances();
  // Only the Monthly copy gets interactive Add/Transfer controls — a second
  // interactive copy in the Yearly view would collide on the same panel IDs.
  // Both copies open the tap-through, all-time transaction history though —
  // that's a single shared modal, so there's no ID-collision risk there.
  const hasControls=containerId==='accountListSummary';
  const rows=ACCOUNTS.map(a=>{
    const bal=balances[a.id]||0;
    const actions=hasControls?`<button class="acct-mini-btn" onclick="event.stopPropagation();toggleAcctPanel('${a.id}','add')" title="Add balance"><i class="fas fa-plus"></i></button><button class="acct-mini-btn" onclick="event.stopPropagation();toggleAcctPanel('${a.id}','transfer')" title="Transfer"><i class="fas fa-right-left"></i></button>`:'';
    const panel=hasControls?`<div class="acct-panel" id="acctpanel_${a.id}"></div>`:'';
    const rowAttrs=` class="account-row ah-clickable" onclick="openAcctHistory('${a.id}')"`;
    return `<div${rowAttrs}>
      <span class="acct-left"><span class="acct-icon">${a.icon}</span><span class="acct-label">${escHtml(a.label)}</span></span>
      <span class="acct-right">
        <span class="acct-balance-val${bal<0?' neg':''}">${fmt(bal)}</span>
        ${actions}
      </span>
    </div>${panel}`;
  }).join('');
  const total=ACCOUNTS.reduce((s,a)=>s+(balances[a.id]||0),0);
  const totalAttrs=` class="account-row account-total ah-clickable" onclick="openAcctHistory(null)"`;
  container.innerHTML=rows+`<div${totalAttrs}><span class="acct-left"><span class="acct-label">Total Balance</span></span><span class="acct-total-val${total<0?' neg':''}">${fmt(total)}</span></div>`;
}

// ── Add-balance / Transfer inline panels ──────────────────────
function toggleAcctPanel(id,mode){
  const panel=document.getElementById('acctpanel_'+id);
  if(!panel) return;
  const wasOpenSameMode=panel.classList.contains('open')&&panel.dataset.mode===mode;
  document.querySelectorAll('.acct-panel.open').forEach(p=>{ p.classList.remove('open'); p.innerHTML=''; });
  if(wasOpenSameMode) return;
  panel.dataset.mode=mode;
  if(mode==='add'){
    panel.innerHTML=`<input class="acct-panel-input" type="number" min="0" inputmode="decimal" placeholder="Amount" id="addamt_${id}"><button class="acct-panel-btn" onclick="confirmAddBalance('${id}')">Add</button><button class="acct-panel-btn cancel" onclick="closeAcctPanel('${id}')"><i class="fas fa-xmark"></i></button>`;
  } else {
    const opts=ACCOUNTS.filter(a=>a.id!==id).map(a=>`<option value="${a.id}">${a.icon} ${escHtml(a.label)}</option>`).join('');
    panel.innerHTML=`<select class="acct-panel-select" id="transto_${id}">${opts}</select><input class="acct-panel-input" type="number" min="0" inputmode="decimal" placeholder="Amount" id="transamt_${id}"><button class="acct-panel-btn" onclick="confirmTransfer('${id}')">Send</button><button class="acct-panel-btn cancel" onclick="closeAcctPanel('${id}')"><i class="fas fa-xmark"></i></button>`;
  }
  panel.classList.add('open');
  document.getElementById(mode==='add'?'addamt_'+id:'transamt_'+id)?.focus();
}
function closeAcctPanel(id){
  const panel=document.getElementById('acctpanel_'+id);
  if(panel){ panel.classList.remove('open'); panel.innerHTML=''; }
}
function ledgerId(){ return 'lg'+Date.now().toString(36)+Math.random().toString(36).slice(2,6); }
function confirmAddBalance(id){
  const amt=Math.max(0,parseFloat(document.getElementById('addamt_'+id)?.value)||0);
  if(amt<=0){ showToast('Enter a valid amount','error'); return; }
  LEDGER.push({id:ledgerId(),ts:new Date().toISOString(),type:'add',accountId:id,amount:amt});
  saveLedgerRemote();
  closeAcctPanel(id);
  renderAccountListSummary();
  showToast('Balance added');
}
function confirmTransfer(id){
  const toId=document.getElementById('transto_'+id)?.value;
  const amt=Math.max(0,parseFloat(document.getElementById('transamt_'+id)?.value)||0);
  if(!toId){ showToast('Pick a destination account','error'); return; }
  if(amt<=0){ showToast('Enter a valid amount','error'); return; }
  LEDGER.push({id:ledgerId(),ts:new Date().toISOString(),type:'transfer',fromId:id,toId,amount:amt});
  saveLedgerRemote();
  closeAcctPanel(id);
  renderAccountListSummary();
  showToast('Transferred');
}

// ─── ACCOUNT TRANSACTION HISTORY (tap Cash/bKash/Card/Total in Monthly Summary) ─
// Rebuilds every dated event that ever touched an account — day-entry income/
// expense, manual Add/Transfer ledger events, and unsettled debts — in
// chronological order, then walks forward from the account's opening balance
// so every line carries the running balance right after it. This mirrors
// computeAccountBalances() exactly, so the last line always matches the
// balance shown on the account row. accountId=null means "all accounts
// combined" (Total Balance row) — internal transfers are left out there since
// they net to zero across the whole picture.
function buildAccountLedger(accountId){
  const combined=accountId==null;
  const entries=[];
  const defAcct=defaultExpenseAccountId();
  getAllDayEntriesCached().forEach(({y,m:mo,d,data})=>{
    const dt=new Date(y,mo,d,12,0,0); // no per-entry clock time is stored — noon keeps sort/DST stable
    EXPENSE_FIELDS.forEach(f=>{
      const amt=data[f.id];
      if(amt>0){
        const acctId=data['acct_'+f.id]||defAcct;
        if(combined||acctId===accountId){
          entries.push({dt,hasTime:false,sign:-1,amount:amt,icon:f.icon,label:f.label,note:data['note_'+f.id]||''});
        }
      }
    });
    INCOME_FIELDS.forEach(f=>{
      const amt=data[f.id];
      if(amt>0){
        const acctId=data['acct_'+f.id]||defAcct;
        if(combined||acctId===accountId){
          entries.push({dt,hasTime:false,sign:1,amount:amt,icon:f.icon,label:f.label,note:data['note_'+f.id]||''});
        }
      }
    });
  });
  LEDGER.forEach(ev=>{
    const dt=ev.ts?new Date(ev.ts):new Date();
    if(ev.type==='add'){
      if(combined||ev.accountId===accountId){
        const acct=ACCOUNTS.find(a=>a.id===ev.accountId);
        entries.push({dt,hasTime:true,sign:1,amount:ev.amount,icon:'<i class="fas fa-plus"></i>',label:combined?`Balance added — ${acct?acct.label:'account'}`:'Balance added',note:''});
      }
    } else if(ev.type==='transfer' && !combined){
      if(ev.fromId===accountId){
        const to=ACCOUNTS.find(a=>a.id===ev.toId);
        entries.push({dt,hasTime:true,sign:-1,amount:ev.amount,icon:'<i class="fas fa-right-left"></i>',label:`Transfer to ${to?to.label:'account'}`,note:''});
      }
      if(ev.toId===accountId){
        const from=ACCOUNTS.find(a=>a.id===ev.fromId);
        entries.push({dt,hasTime:true,sign:1,amount:ev.amount,icon:'<i class="fas fa-right-left"></i>',label:`Transfer from ${from?from.label:'account'}`,note:''});
      }
    }
    // combined view: transfers between two of the user's own accounts are
    // purely internal and net to zero, so they're left out of the merged feed
  });
  DEBTS.forEach(dbt=>{
    if(dbt.settled||!dbt.accountId) return;
    if(!(combined||dbt.accountId===accountId)) return;
    const dt=dbt.date?new Date(dbt.date+'T12:00:00'):new Date();
    if(dbt.type==='lent'){
      entries.push({dt,hasTime:false,sign:-1,amount:dbt.amount,icon:'<i class="fas fa-arrow-up-from-bracket"></i>',label:`Lent to ${dbt.person}`,note:dbt.note||''});
    } else {
      entries.push({dt,hasTime:false,sign:1,amount:dbt.amount,icon:'<i class="fas fa-arrow-down-to-bracket"></i>',label:`Borrowed from ${dbt.person}`,note:dbt.note||''});
    }
  });
  entries.sort((a,b)=>a.dt-b.dt);
  let running=combined?ACCOUNTS.reduce((s,a)=>s+(a.opening||0),0):(ACCOUNTS.find(a=>a.id===accountId)?.opening||0);
  entries.forEach(e=>{ running+=e.sign*e.amount; e.balanceAfter=running; });
  return entries; // ascending, oldest first
}

let ahFullList=[]; // currently-open account's transactions, newest first
let ahShowingAll=false;
const AH_PAGE_SIZE=50;

function openAcctHistory(accountId){
  const combined=accountId==null;
  const acct=combined?null:ACCOUNTS.find(a=>a.id===accountId);
  if(!combined&&!acct) return;
  const balances=computeAccountBalances();
  const currentBal=combined?ACCOUNTS.reduce((s,a)=>s+(balances[a.id]||0),0):(balances[accountId]||0);
  ahFullList=buildAccountLedger(accountId).reverse();
  ahShowingAll=false;
  document.getElementById('acctHistoryTitle').innerHTML=combined?'<i class="fas fa-wallet"></i> Total Balance':`${escHtml(acct.icon)} ${escHtml(acct.label)}`;
  const balEl=document.getElementById('ahCurrentBalance');
  balEl.textContent=fmt(currentBal);
  balEl.className='ah-stat-val'+(currentBal<0?' neg':'');
  document.getElementById('acctHistoryModal').classList.add('open');
  renderAcctHistoryList();
}
function renderAcctHistoryList(){
  const list=ahShowingAll?ahFullList:ahFullList.slice(0,AH_PAGE_SIZE);
  const rows=list.map(e=>{
    const dateStr=e.dt.toLocaleDateString('en-US',{day:'numeric',month:'short',year:'numeric'});
    const timeStr=e.hasTime?e.dt.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'}):'';
    const cls=e.sign>0?'inc':'exp';
    return `<div class="ah-row">
      <div class="ah-row-top">
        <span class="ah-desc"><span>${e.icon}</span><span class="ah-desc-label">${escHtml(e.label)}</span></span>
        <span class="ah-amt ${cls}">${fmt(e.sign*e.amount,true)}</span>
      </div>
      <div class="ah-row-bottom">
        <span class="ah-date">${dateStr}${timeStr?', '+timeStr:''}</span>
        <span class="ah-bal">Bal ${fmt(e.balanceAfter)}</span>
      </div>
      ${e.note?`<div class="ah-note"><i class="fas fa-note-sticky"></i> ${escHtml(e.note)}</div>`:''}
    </div>`;
  }).join('');
  document.getElementById('ahList').innerHTML=rows||'<div class="cd-empty"><i class="fas fa-clipboard"></i> No transactions yet</div>';
  document.getElementById('ahCount').textContent=ahFullList.length?(ahShowingAll?`${ahFullList.length} total`:`Latest ${Math.min(AH_PAGE_SIZE,ahFullList.length)} of ${ahFullList.length}`):'';
  const btn=document.getElementById('ahLoadAllBtn');
  if(!ahShowingAll&&ahFullList.length>AH_PAGE_SIZE){
    btn.style.display='block';
    btn.textContent=`Show all ${ahFullList.length} transactions`;
  } else {
    btn.style.display='none';
  }
}
function showAllAcctHistory(){ ahShowingAll=true; renderAcctHistoryList(); }
function closeAcctHistory(){ document.getElementById('acctHistoryModal').classList.remove('open'); }

// ─── DEBTS / LOANS ──────────────────────────────────────────────────────────────
// Tracks money borrowed from people (you owe them) and lent to people (they owe
// you). Purely a personal ledger — doesn't touch Account balances.
function computeDebtTotals(){
  let owe=0, receive=0;
  DEBTS.forEach(d=>{
    if(d.settled) return;
    if(d.type==='borrowed') owe+=d.amount; else receive+=d.amount;
  });
  return {owe, receive};
}
function renderDebtsSummary(containerId){
  const container=document.getElementById(containerId);
  if(!container) return;
  if(!DEBTS.length){
    container.innerHTML=`<div class="debt-summary-card" onclick="openDebtsModal()"><i class="fas fa-handshake"></i> No debts or loans yet — tap to add one</div>`;
    return;
  }
  const {owe,receive}=computeDebtTotals();
  container.innerHTML=`<div class="debt-summary-card" onclick="openDebtsModal()">
    <div class="debt-summary-row"><span class="debt-summary-label owe">You Owe</span><span class="debt-summary-val owe">${fmt(owe)}</span></div>
    <div class="debt-summary-row"><span class="debt-summary-label receive">You'll Receive</span><span class="debt-summary-val receive">${fmt(receive)}</span></div>
  </div>`;
}
function debtAcctOptionsHTML(){
  return ACCOUNTS.map(a=>`<option value="${a.id}">${a.icon} ${escHtml(a.label)}</option>`).join('');
}
function openDebtsModal(){
  const today=new Date().toISOString().slice(0,10);
  const dB=document.getElementById('newDebtDateB'); if(dB&&!dB.value) dB.value=today;
  const dL=document.getElementById('newDebtDateL'); if(dL&&!dL.value) dL.value=today;
  const acctOpts=debtAcctOptionsHTML();
  const aB=document.getElementById('newDebtAcctB'); if(aB) aB.innerHTML=acctOpts;
  const aL=document.getElementById('newDebtAcctL'); if(aL) aL.innerHTML=acctOpts;
  renderDebtLists();
  document.getElementById('debtsModal').classList.add('open');
}
function closeDebtsModal(){ document.getElementById('debtsModal').classList.remove('open'); }
function showDebtsTab(tab){
  document.querySelectorAll('#debtsModal .debt-tab').forEach(b=>b.classList.toggle('active', b.dataset.debttab===tab));
  document.querySelectorAll('#debtsModal .debt-pane').forEach(p=>p.classList.toggle('active', p.id==='debtpane-'+tab));
}
function debtSortFn(a,b){
  if(a.settled!==b.settled) return a.settled?1:-1; // unsettled first
  return (b.date||'').localeCompare(a.date||''); // then newest first
}
function debtRowHTML(d){
  const dateStr=d.date?new Date(d.date+'T00:00:00').toLocaleDateString('en-US',{day:'numeric',month:'short',year:'numeric'}):'';
  const checkLabel=d.type==='borrowed'?'Repaid':'Received';
  const acct=ACCOUNTS.find(a=>a.id===d.accountId);
  const acctTag=acct?`<span class="debt-acct">${acct.icon} ${escHtml(acct.label)}</span>`:'';
  return `<div class="debt-row${d.settled?' settled':''}">
    <div class="debt-row-main"><span class="debt-person">${escHtml(d.person)}</span><span class="debt-amount">${fmt(d.amount)}</span></div>
    <div class="debt-row-sub"><span class="debt-date">${dateStr}</span>${acctTag}${d.note?`<span class="debt-note"><i class="fas fa-note-sticky"></i> ${escHtml(d.note)}</span>`:''}</div>
    <div class="debt-row-actions">
      <label class="debt-check"><input type="checkbox" ${d.settled?'checked':''} onchange="toggleDebtSettled('${d.id}')">${checkLabel}</label>
      <button class="cat-del-btn" onclick="deleteDebt('${d.id}')" title="Delete"><i class="fas fa-trash"></i></button>
    </div>
  </div>`;
}
function renderDebtLists(){
  const {owe,receive}=computeDebtTotals();
  const oweEl=document.getElementById('debtSumOwe'); if(oweEl) oweEl.textContent=fmt(owe);
  const recEl=document.getElementById('debtSumReceive'); if(recEl) recEl.textContent=fmt(receive);
  const bList=DEBTS.filter(d=>d.type==='borrowed').sort(debtSortFn);
  const lList=DEBTS.filter(d=>d.type==='lent').sort(debtSortFn);
  const bC=document.getElementById('debtListBorrowed');
  const lC=document.getElementById('debtListLent');
  const emptyMsg=t=>`<div style="color:var(--muted);text-align:center;padding:14px;font-size:0.82rem">No ${t} entries yet</div>`;
  if(bC) bC.innerHTML=bList.length?bList.map(debtRowHTML).join(''):emptyMsg('borrowed');
  if(lC) lC.innerHTML=lList.length?lList.map(debtRowHTML).join(''):emptyMsg('lent');
}
function debtId(){ return 'dt'+Date.now().toString(36)+Math.random().toString(36).slice(2,6); }
function refreshDebtDisplays(){
  renderDebtLists();
  renderDebtsSummary('debtsSummary');
  renderDebtsSummary('debtsSummaryYear');
  renderAccountListSummary();
  renderAccountListSummary('accountListSummaryYear');
}
function addDebt(type){
  const suf=type==='borrowed'?'B':'L';
  const personEl=document.getElementById('newDebtPerson'+suf);
  const acctEl=document.getElementById('newDebtAcct'+suf);
  const amountEl=document.getElementById('newDebtAmount'+suf);
  const dateEl=document.getElementById('newDebtDate'+suf);
  const person=personEl?.value.trim();
  const accountId=acctEl?.value||null;
  const amount=Math.max(0,parseFloat(amountEl?.value)||0);
  const date=dateEl?.value||new Date().toISOString().slice(0,10);
  if(!person){ showToast('Enter a name','error'); return; }
  if(!accountId){ showToast('Pick an account','error'); return; }
  if(amount<=0){ showToast('Enter a valid amount','error'); return; }
  DEBTS.push({id:debtId(),type,person,amount,date,accountId,settled:false});
  saveDebtsRemote();
  if(personEl) personEl.value='';
  if(amountEl) amountEl.value='';
  refreshDebtDisplays();
  showToast(type==='borrowed'?'Added — you owe this':'Added — they owe you');
}
function toggleDebtSettled(id){
  const d=DEBTS.find(x=>x.id===id);
  if(!d) return;
  d.settled=!d.settled;
  d.settledDate=d.settled?new Date().toISOString().slice(0,10):null;
  saveDebtsRemote();
  refreshDebtDisplays();
}
function deleteDebt(id){
  if(!confirm('Delete this entry?')) return;
  DEBTS=DEBTS.filter(x=>x.id!==id);
  saveDebtsRemote();
  refreshDebtDisplays();
  showToast('Deleted');
}

// ─── BUDGETS ──────────────────────────────────────────────────────────────────
function renderBudgetAlertBanner(catTotals){
  const container=document.getElementById('budgetAlertBanner');
  if(!container) return;
  const overList=EXPENSE_FIELDS.filter(f=>f.budget>0 && (catTotals[f.id]||0)>f.budget);
  if(!overList.length){ container.innerHTML=''; return; }
  const rows=overList.map(f=>`<div class="budget-alert-row"><span>${f.icon} ${escHtml(f.label)}</span><span class="budget-alert-amt">${fmt(catTotals[f.id]||0)} / ${fmt(f.budget)}</span></div>`).join('');
  container.innerHTML=`<div class="budget-alert-banner"><div class="budget-alert-head"><i class="fas fa-triangle-exclamation"></i> Over Budget This Month</div>${rows}</div>`;
}
// Fires once per category per session when a Day-view entry pushes it over its
// monthly budget — resets so it can fire again if the total dips back under.
let budgetAlertedIds=new Set();
function checkBudgetAlert(fieldId){
  const f=EXPENSE_FIELDS.find(x=>x.id===fieldId);
  if(!f||!(f.budget>0)) return;
  const {catTotals}=calcMonth(curYear,curMonth);
  const used=catTotals[fieldId]||0;
  if(used>f.budget){
    if(!budgetAlertedIds.has(fieldId)){
      budgetAlertedIds.add(fieldId);
      showToast(`Over budget: ${f.icon} ${f.label} — ${fmt(used)} / ${fmt(f.budget)}`, true);
    }
  } else {
    budgetAlertedIds.delete(fieldId);
  }
}
function renderBudgets(catTotals){
  const container=document.getElementById('budgetListSummary');
  if(!container) return;
  const withBudget=EXPENSE_FIELDS.filter(f=>f.budget>0);
  if(!withBudget.length){
    container.innerHTML='<div style="color:var(--muted);text-align:center;padding:14px;font-size:0.82rem">No budgets set yet — add one in <i class="fas fa-gear"></i> Settings → Budgets</div>';
    return;
  }
  const totalDaysInMonth=daysInMonth(curYear,curMonth);
  const elapsedDays=getElapsedDaysInMonth(curYear,curMonth);
  container.innerHTML=withBudget.map(f=>{
    const used=catTotals[f.id]||0;
    const pct=Math.min(100,(used/f.budget)*100);
    const over=used>f.budget;
    const cls=over?'over':pct>=80?'warn':'ok';
    // Pace mark: compares actual spend-so-far against what the budget allows
    // up through today (budget ÷ days-in-month × elapsed days) — red if
    // spending has already crossed that expected-so-far line, green if not.
    const expectedSoFar=elapsedDays>0?(f.budget/totalDaysInMonth)*elapsedDays:0;
    const onPace=elapsedDays<=0||used<=expectedSoFar;
    const paceCls=onPace?'pace-green':'pace-red';
    const paceTitle=elapsedDays>0?`${fmt(used)} spent vs ${fmt(expectedSoFar)} expected by day ${elapsedDays}`:'';
    return `<div class="budget-row" style="cursor:pointer" title="View entries" onclick="openCategoryDetail('${f.id}')">
      <div class="budget-row-top"><span><span class="pace-dot ${paceCls}" title="${paceTitle}"></span>${f.icon} ${escHtml(f.label)}</span><span class="${over?'over-text':''}">${fmt(used)} / ${fmt(f.budget)}</span></div>
      <div class="budget-bar-track"><div class="budget-bar-fill ${cls}" style="transform:scaleX(${pct/100})"></div></div>
    </div>`;
  }).join('');
}

// ─── INSIGHTS (month-over-month) ─────────────────────────────────────────────
function getPrevMonth(y,m){ return m===0?{y:y-1,m:11}:{y,m:m-1}; }

function renderComparisonChart(id,labels,curVals,prevVals,curLabel,prevLabel){
  const ctx=document.getElementById(id);
  destroyChart(id);
  if(!ctx) return;
  if(typeof Chart==='undefined'){ setChartEmpty(id,true,'<i class="fas fa-triangle-exclamation"></i> Chart library failed to load — check your internet connection'); return; }
  if(!labels.length){ setChartEmpty(id,true,'Not enough data yet to compare months'); return; }
  setChartEmpty(id,false);
  const c=chartColors();
  chartInstances[id]=new Chart(ctx,{
    type:'bar',
    data:{labels,datasets:[
      {label:prevLabel,data:prevVals,backgroundColor:c.grid,borderRadius:4,maxBarThickness:16},
      {label:curLabel,data:curVals,backgroundColor:c.exp,borderRadius:4,maxBarThickness:16}
    ]},
    options:{
      responsive:true,maintainAspectRatio:false,
      plugins:{legend:{display:true,labels:{color:c.text,font:{size:10}}}},
      scales:{
        x:{ticks:{color:c.text,font:{size:9}},grid:{display:false}},
        y:{beginAtZero:true,ticks:{color:c.text,font:{size:10}},grid:{color:c.grid}}
      }
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// INSIGHTS TAB — fully read-only, derived entirely from existing stored data.
// Orchestrator below calls calcMonth/calcMonthUpTo/getDay per section; nothing
// here writes to localStorage/Firestore.
// ─────────────────────────────────────────────────────────────────────────────

function renderInsightsTab(){
  const{totalExp,totalInc,catTotals}=calcMonth(curYear,curMonth);
  const monthDays=daysInMonth(curYear,curMonth);
  document.getElementById('insightsSubtitle').textContent=`${MONTHS[curMonth]} ${curYear}`;

  renderComparisonSection(catTotals,totalExp);          // Section B — this month vs last month (migrated)
  renderNoSpendAndStreak(monthDays);                     // Section A.3 + A.4
  renderHighestSpendDay();                               // Section A.5
  renderWeekdayWeekend();                                // Section A.6
  renderParetoCard(catTotals,totalExp);                  // Section A.1
  renderFixedVarCard();                                  // Section A.2
  renderFreqCard();                                      // Section A.7
  renderNewDroppedCard(catTotals);                       // Section A.8
  renderAvgTxnTrendCard();                                // Section A.9
  renderIncomeConcentrationCard(catTotals,totalInc);      // Section A.10
  renderRollingTrend();                                   // Section B — 6-12mo rolling trend
  renderYoyCard();                                        // Section B — YoY
  renderBestWorstCard();                                  // Section B — best/worst month
  renderForecastAndPace(catTotals,monthDays);             // Section B — forecast + mid-month pace
}

// Walks localStorage keys to find the earliest month with any recorded data.
// Used to gate YoY (needs >=12 months of history) and to bound rolling-trend/
// best-worst scans so they don't walk into years that never had any data.
function findEarliestDataMonth(){
  let earliest=null;
  getAllDayEntriesCached().forEach(({y,m:mo,data})=>{
    const hasAmount=ALL_FIELDS.some(f=>(data[f.id]||0)>0);
    if(!hasAmount) return;
    if(!earliest||y<earliest.y||(y===earliest.y&&mo<earliest.m)) earliest={y,m:mo};
  });
  return earliest;
}

// ── SECTION A.3 + A.4 — No-spend days & longest streak ─────────────────────
function renderNoSpendAndStreak(monthDays){
  const today=new Date();
  const isCurrentMonth=(curYear===today.getFullYear()&&curMonth===today.getMonth());
  const lastDay=isCurrentMonth?today.getDate():monthDays;

  const noSpendDays=[];
  let longestStreak=0,curStreak=0,streakEndDay=null;
  for(let d=1;d<=lastDay;d++){
    const data=getDay(curYear,curMonth,d);
    const exp=EXPENSE_FIELDS.reduce((s,f)=>s+(data[f.id]||0),0);
    const hasEntry=ALL_FIELDS.some(f=>(data[f.id]||0)>0);
    if(exp===0) noSpendDays.push(d);
    if(hasEntry){
      curStreak++;
      if(curStreak>longestStreak){ longestStreak=curStreak; streakEndDay=d; }
    } else {
      curStreak=0;
    }
  }

  document.getElementById('insNoSpendVal').textContent=noSpendDays.length;
  document.getElementById('insNoSpendSub').textContent=noSpendDays.length
    ? 'Days '+noSpendDays.slice(0,8).join(', ')+(noSpendDays.length>8?'…':'')
    : lastDay>0?'Every day had spending':'';

  document.getElementById('insStreakVal').textContent=longestStreak+' day'+(longestStreak===1?'':'s');
  document.getElementById('insStreakSub').textContent=longestStreak&&streakEndDay
    ? `Ending on day ${streakEndDay}`
    : 'No logged entries yet';
}

// ── SECTION A.5 — Highest single spending day ───────────────────────────────
function renderHighestSpendDay(){
  const{daily}=calcMonth(curYear,curMonth);
  if(!daily.length){
    document.getElementById('insHighDayVal').textContent='–';
    document.getElementById('insHighDaySub').textContent='No data yet';
    return;
  }
  const top=daily.reduce((a,b)=>b.exp>a.exp?b:a);
  const drivers=EXPENSE_FIELDS.map(f=>({f,val:top.data[f.id]||0})).filter(e=>e.val>0).sort((a,b)=>b.val-a.val).slice(0,2);
  document.getElementById('insHighDayVal').textContent=fmt(top.exp);
  document.getElementById('insHighDaySub').textContent=top.exp>0
    ? `Day ${top.day} — ${drivers.map(e=>e.f.label).join(', ')||'—'}`
    : 'No expenses logged';
}

// ── SECTION A.6 — Weekday vs weekend average spend ──────────────────────────
function renderWeekdayWeekend(){
  const{daily}=calcMonth(curYear,curMonth);
  let wdSum=0,wdCount=0,weSum=0,weCount=0;
  daily.forEach(({day,exp})=>{
    const dow=new Date(curYear,curMonth,day).getDay(); // 0=Sun..6=Sat
    if(dow===0||dow===6){ weSum+=exp; weCount++; } else { wdSum+=exp; wdCount++; }
  });
  const wdAvg=wdCount?wdSum/wdCount:0;
  const weAvg=weCount?weSum/weCount:0;
  if(!wdCount&&!weCount){
    document.getElementById('insWkndVal').textContent='–';
    document.getElementById('insWkndSub').textContent='No data yet';
    return;
  }
  const higher=weAvg>wdAvg?'Weekend':'Weekday';
  document.getElementById('insWkndVal').textContent=higher+' higher';
  document.getElementById('insWkndSub').textContent=`Weekday ${fmt(wdAvg)}/day · Weekend ${fmt(weAvg)}/day`;
}

// ── SECTION A.1 — Category concentration (Pareto) ───────────────────────────
function renderParetoCard(catTotals,totalExp){
  const card=document.getElementById('insParetoCard');
  const entries=EXPENSE_FIELDS.map(f=>({f,val:catTotals[f.id]||0})).filter(e=>e.val>0).sort((a,b)=>b.val-a.val);
  if(!entries.length||totalExp<=0){ card.innerHTML=insCardEmpty('Category Concentration','No expenses logged yet this month'); return; }
  let running=0,n80=0;
  for(const e of entries){ running+=e.val; n80++; if(running/totalExp>=0.8) break; }
  const top5=entries.slice(0,5);
  const rows=top5.map(e=>{
    const pct=((e.val/totalExp)*100).toFixed(0);
    return `<div class="ins-card-row"><span class="icr-left"><span>${e.f.icon}</span><span>${escHtml(e.f.label)}</span></span><span class="icr-right">${pct}%</span></div>`;
  }).join('');
  card.innerHTML=`<div class="ins-card-title">Category Concentration (Pareto)</div>
    <div class="ins-forecast-note" style="margin-bottom:8px">Top ${n80} of ${entries.length} categor${n80===1?'y makes':'ies make'} up 80% of this month's spending</div>
    ${rows}`;
}

// ── SECTION A.2 — Fixed vs variable categories ──────────────────────────────
function renderFixedVarCard(){
  const card=document.getElementById('insFixedVarCard');
  const months=collectRecentMonths(6);
  if(months.length<3){ card.innerHTML=insCardEmpty('Fixed vs Variable Categories','Needs at least 3 months of history'); return; }
  const results=EXPENSE_FIELDS.map(f=>{
    const vals=months.map(mo=>mo.catTotals[f.id]||0);
    const active=vals.filter(v=>v>0);
    if(active.length<Math.ceil(months.length*0.5)) return null; // too sparse to classify
    const mean=active.reduce((a,b)=>a+b,0)/active.length;
    if(mean<=0) return null;
    const variance=active.reduce((s,v)=>s+Math.pow(v-mean,2),0)/active.length;
    const cv=Math.sqrt(variance)/mean; // coefficient of variation
    return {f,mean,cv,fixed:cv<0.15};
  }).filter(Boolean);
  if(!results.length){ card.innerHTML=insCardEmpty('Fixed vs Variable Categories','Not enough recurring categories yet'); return; }
  const fixed=results.filter(r=>r.fixed).sort((a,b)=>b.mean-a.mean).slice(0,4);
  const variable=results.filter(r=>!r.fixed).sort((a,b)=>b.mean-a.mean).slice(0,4);
  const row=r=>`<div class="ins-card-row"><span class="icr-left"><span>${r.f.icon}</span><span>${escHtml(r.f.label)}</span></span><span class="icr-right">${fmt(r.mean)}/mo</span></div>`;
  card.innerHTML=`<div class="ins-card-title">Fixed vs Variable Categories</div>
    <div class="ins-forecast-note">Fixed — steady month to month</div>
    ${fixed.length?fixed.map(row).join(''):'<div class="ins-empty">None detected</div>'}
    <div class="ins-forecast-note" style="margin-top:8px">Variable — swings month to month</div>
    ${variable.length?variable.map(row).join(''):'<div class="ins-empty">None detected</div>'}`;
}

// ── SECTION A.7 — Frequent-small vs rare-large categories ───────────────────
function renderFreqCard(){
  const card=document.getElementById('insFreqCard');
  const monthDays=daysInMonth(curYear,curMonth);
  const freq={},sum={},cnt={};
  EXPENSE_FIELDS.forEach(f=>{freq[f.id]=0;sum[f.id]=0;cnt[f.id]=0;});
  for(let d=1;d<=monthDays;d++){
    const data=getDay(curYear,curMonth,d);
    EXPENSE_FIELDS.forEach(f=>{
      const amt=data[f.id]||0;
      if(amt>0){ freq[f.id]++; sum[f.id]+=amt; cnt[f.id]++; }
    });
  }
  const entries=EXPENSE_FIELDS.map(f=>({f,logCount:freq[f.id],avg:cnt[f.id]?sum[f.id]/cnt[f.id]:0})).filter(e=>e.logCount>0);
  if(entries.length<2){ card.innerHTML=insCardEmpty('Logging Frequency vs Amount','Not enough logged categories yet'); return; }
  const frequentSmall=[...entries].sort((a,b)=>b.logCount-a.logCount).slice(0,3);
  const rareLarge=[...entries].sort((a,b)=>b.avg-a.avg).slice(0,3);
  const row=e=>`<div class="ins-card-row"><span class="icr-left"><span>${e.f.icon}</span><span>${escHtml(e.f.label)}</span></span><span class="icr-right">${e.logCount}× · avg ${fmt(e.avg)}</span></div>`;
  card.innerHTML=`<div class="ins-card-title">Logging Frequency vs Amount</div>
    <div class="ins-forecast-note">Logged most often</div>
    ${frequentSmall.map(row).join('')}
    <div class="ins-forecast-note" style="margin-top:8px">Largest average amount</div>
    ${rareLarge.map(row).join('')}`;
}

// ── SECTION A.8 — New or dropped categories vs previous month ───────────────
function renderNewDroppedCard(catTotals){
  const card=document.getElementById('insNewDroppedCard');
  const{y:py,m:pm}=getPrevMonth(curYear,curMonth);
  const prev=calcMonth(py,pm);
  const isNew=[],isDropped=[];
  ALL_FIELDS.forEach(f=>{
    const cur=catTotals[f.id]||0, prevVal=prev.catTotals[f.id]||0;
    if(cur>0&&prevVal===0) isNew.push(f);
    if(cur===0&&prevVal>0) isDropped.push(f);
  });
  if(!isNew.length&&!isDropped.length){ card.innerHTML=insCardEmpty('New / Dropped Categories','No changes from last month'); return; }
  const row=f=>`<div class="ins-card-row"><span class="icr-left"><span>${f.icon}</span><span>${escHtml(f.label)}</span></span></div>`;
  card.innerHTML=`<div class="ins-card-title">New / Dropped Categories</div>
    ${isNew.length?`<div class="ins-forecast-note">New this month</div>${isNew.map(row).join('')}`:''}
    ${isDropped.length?`<div class="ins-forecast-note" style="margin-top:8px">Dropped since last month</div>${isDropped.map(row).join('')}`:''}`;
}

// ── SECTION A.9 — Average transaction size trend per category ───────────────
function renderAvgTxnTrendCard(){
  const card=document.getElementById('insAvgTxnCard');
  const months=collectRecentMonths(4);
  if(months.length<2){ card.innerHTML=insCardEmpty('Average Transaction Size Trend','Needs at least 2 months of history'); return; }
  const results=EXPENSE_FIELDS.map(f=>{
    const series=months.map(mo=>{
      const days=mo.daily.filter(d=>(d.data[f.id]||0)>0);
      const total=days.reduce((s,d)=>s+d.data[f.id],0);
      return days.length?total/days.length:null;
    });
    const valid=series.filter(v=>v!==null);
    if(valid.length<2) return null;
    const first=valid[0],last=valid[valid.length-1];
    const pct=first>0?((last-first)/first)*100:0;
    if(Math.abs(pct)<5) return null;
    return {f,pct,last};
  }).filter(Boolean).sort((a,b)=>Math.abs(b.pct)-Math.abs(a.pct)).slice(0,5);
  if(!results.length){ card.innerHTML=insCardEmpty('Average Transaction Size Trend','No clear per-transaction trend yet'); return; }
  const rows=results.map(r=>{
    const up=r.pct>0;
    return `<div class="ins-card-row"><span class="icr-left"><span>${r.f.icon}</span><span>${escHtml(r.f.label)}</span></span><span class="icr-right ${up?'insight-bad':'insight-good'}">${up?'▲':'▼'} ${Math.abs(r.pct).toFixed(0)}%</span></div>`;
  }).join('');
  card.innerHTML=`<div class="ins-card-title">Average Transaction Size Trend</div>
    <div class="ins-forecast-note">Change in typical amount per entry, oldest vs most recent month tracked</div>
    ${rows}`;
}

// ── SECTION A.10 — Income concentration ──────────────────────────────────────
function renderIncomeConcentrationCard(catTotals,totalInc){
  const card=document.getElementById('insIncomeConcCard');
  const entries=INCOME_FIELDS.map(f=>({f,val:catTotals[f.id]||0})).filter(e=>e.val>0).sort((a,b)=>b.val-a.val);
  if(!entries.length||totalInc<=0){ card.innerHTML=insCardEmpty('Income Concentration','No income logged yet this month'); return; }
  const top=entries[0];
  const share=((top.val/totalInc)*100).toFixed(0);
  card.innerHTML=`<div class="ins-card-title">Income Concentration</div>
    <div class="ins-card-row"><span class="icr-left"><span><i class="fas fa-briefcase"></i></span><span>Active income sources</span></span><span class="icr-right">${entries.length}</span></div>
    <div class="ins-card-row"><span class="icr-left"><span>${top.f.icon}</span><span>Top source: ${escHtml(top.f.label)}</span></span><span class="icr-right">${share}%</span></div>`;
}

// ── Shared helper: collect last N months (including current) with calcMonth ──
// Walks backwards via getPrevMonth so it correctly crosses year boundaries.
// Only includes months at/after the earliest month with any recorded data.
function collectRecentMonths(n){
  const earliest=findEarliestDataMonth();
  const months=[];
  let y=curYear,m=curMonth;
  for(let i=0;i<n;i++){
    if(earliest&&(y<earliest.y||(y===earliest.y&&m<earliest.m))) break;
    months.unshift({y,m,...calcMonth(y,m)});
    const prev=getPrevMonth(y,m);
    y=prev.y; m=prev.m;
  }
  return months;
}

function insCardEmpty(title,msg){
  return `<div class="ins-card-title">${title}</div><div class="ins-empty">${msg}</div>`;
}

// ── SECTION B — This month vs last month (migrated from Month tab) ──────────
function renderComparisonSection(catTotals,totalExp){
  const{y:py,m:pm}=getPrevMonth(curYear,curMonth);
  // Compare like-for-like: only count the previous month up through the same
  // day-of-month we've reached in the current month (e.g. Aug 1–14 vs Jul 1–14),
  // not the previous month's full total.
  const elapsedDays=getElapsedDaysInMonth(curYear,curMonth)||daysInMonth(curYear,curMonth);
  const prev=calcMonthUpTo(py,pm,elapsedDays);

  // Top spending category card
  const topCard=document.getElementById('topCategoryCard');
  const topEntries=EXPENSE_FIELDS.map(f=>({f,val:catTotals[f.id]||0})).filter(e=>e.val>0).sort((a,b)=>b.val-a.val);
  if(topEntries.length){
    const top=topEntries[0];
    const share=totalExp>0?((top.val/totalExp)*100).toFixed(0):0;
    topCard.innerHTML=`<div class="top-cat-card">
      <div class="top-cat-label"><i class="fas fa-fire"></i> Top Spending Category</div>
      <div class="top-cat-main"><span class="top-cat-icon">${top.f.icon}</span><span class="top-cat-name">${escHtml(top.f.label)}</span><span class="top-cat-amt">${fmt(top.val)}</span></div>
      <div class="top-cat-share">${share}% of this month's expense</div>
    </div>`;
  } else {
    topCard.innerHTML='';
  }

  // Month-over-month % change per category, top 3 by magnitude
  const changes=[];
  ALL_FIELDS.forEach(f=>{
    const isInc=INCOME_FIELDS.some(x=>x.id===f.id);
    const cur=catTotals[f.id]||0;
    const prevVal=prev.catTotals[f.id]||0;
    if(cur===0&&prevVal===0) return;
    if(prevVal===0) return; // "new this month" — skip a % claim, nothing to compare against
    const pct=((cur-prevVal)/prevVal)*100;
    if(Math.abs(pct)<1) return;
    changes.push({f,isInc,pct});
  });
  changes.sort((a,b)=>Math.abs(b.pct)-Math.abs(a.pct));
  const il=document.getElementById('insightList');
  if(!changes.length){
    il.innerHTML='<div style="color:var(--muted);text-align:center;padding:10px;font-size:0.8rem">Not enough history yet to compare with last month</div>';
  } else {
    il.innerHTML=changes.slice(0,3).map(c=>{
      const up=c.pct>0;
      const goodDirection=c.isInc?up:!up; // expense down = good, income up = good
      const arrow=up?'▲':'▼';
      return `<div class="insight-row"><span class="insight-icon">${c.f.icon}</span><span class="insight-text">${escHtml(c.f.label)} <span class="${goodDirection?'insight-good':'insight-bad'}">${arrow} ${Math.abs(c.pct).toFixed(0)}%</span> vs last month</span></div>`;
    }).join('');
  }

  // Comparison chart — top categories by combined current+previous expense
  const combined=EXPENSE_FIELDS.map(f=>({f,cur:catTotals[f.id]||0,prevVal:prev.catTotals[f.id]||0})).filter(e=>e.cur>0||e.prevVal>0);
  combined.sort((a,b)=>(b.cur+b.prevVal)-(a.cur+a.prevVal));
  const top6=combined.slice(0,6);
  renderComparisonChart('comparisonChart', top6.map(e=>e.f.label), top6.map(e=>e.cur), top6.map(e=>e.prevVal), MONTHS[curMonth].slice(0,3), MONTHS[pm].slice(0,3));
}

// ── SECTION B — Multi-month rolling trend, classified per category ──────────
function renderRollingTrend(){
  const months=collectRecentMonths(12);
  const listEl=document.getElementById('insTrendList');
  if(months.length<3){
    listEl.innerHTML=`<div class="ins-card">${insCardEmpty('Rolling Trend','Needs at least 3 months of history')}</div>`;
    destroyChart('rollingTrendChart');
    setChartEmpty('rollingTrendChart',true,'Not enough history yet');
    return;
  }
  // Classify every expense category by slope + coefficient of variation across the window
  const classified=EXPENSE_FIELDS.map(f=>{
    const series=months.map(mo=>mo.catTotals[f.id]||0);
    const total=series.reduce((a,b)=>a+b,0);
    if(total<=0) return null;
    const mean=total/series.length;
    const variance=series.reduce((s,v)=>s+Math.pow(v-mean,2),0)/series.length;
    const cv=mean>0?Math.sqrt(variance)/mean:0;
    // Simple linear slope via least squares over month index
    const n=series.length;
    const xs=series.map((_,i)=>i);
    const xMean=xs.reduce((a,b)=>a+b,0)/n;
    const yMean=mean;
    let num=0,den=0;
    xs.forEach((x,i)=>{ num+=(x-xMean)*(series[i]-yMean); den+=(x-xMean)*(x-xMean); });
    const slope=den?num/den:0;
    const slopePct=mean>0?(slope/mean)*100:0; // slope as % of mean per month
    let cls;
    if(cv>0.4) cls='volatile';
    else if(slopePct>8) cls='rising';
    else if(slopePct<-8) cls='falling';
    else cls='stable';
    return {f,series,mean,cls};
  }).filter(Boolean).sort((a,b)=>b.mean-a.mean);

  if(!classified.length){
    listEl.innerHTML=`<div class="ins-card">${insCardEmpty('Rolling Trend','No categories with enough spend to classify')}</div>`;
    destroyChart('rollingTrendChart');
    setChartEmpty('rollingTrendChart',true,'No data yet');
    return;
  }

  listEl.innerHTML=classified.map(c=>
    `<div class="ins-card-row"><span class="icr-left"><span>${c.f.icon}</span><span>${escHtml(c.f.label)}</span></span><span class="icr-right"><span class="trend-badge ${c.cls}">${c.cls}</span></span></div>`
  ).join('');

  // Chart the top 4 categories by mean spend across the window
  const top4=classified.slice(0,4);
  const ctx=document.getElementById('rollingTrendChart');
  destroyChart('rollingTrendChart');
  if(!ctx){ /* no-op */ }
  else if(typeof Chart==='undefined'){ setChartEmpty('rollingTrendChart',true,'<i class="fas fa-triangle-exclamation"></i> Chart library failed to load — check your internet connection'); }
  else {
    setChartEmpty('rollingTrendChart',false);
    const c=chartColors();
    const labels=months.map(mo=>MONTHS[mo.m].slice(0,3)+(mo.y!==curYear?" '"+String(mo.y).slice(2):''));
    chartInstances['rollingTrendChart']=new Chart(ctx,{
      type:'line',
      data:{labels,datasets:top4.map((c2,i)=>({
        label:c2.f.label,
        data:c2.series,
        borderColor:CAT_PALETTE[i%CAT_PALETTE.length],
        backgroundColor:'transparent',
        tension:0.3,
        borderWidth:2,
        pointRadius:2
      }))},
      options:{
        responsive:true,maintainAspectRatio:false,
        plugins:{legend:{display:true,labels:{color:c.text,font:{size:9}}}},
        scales:{
          x:{ticks:{color:c.text,font:{size:9}},grid:{display:false}},
          y:{beginAtZero:true,ticks:{color:c.text,font:{size:9}},grid:{color:c.grid}}
        }
      }
    });
  }
}

// ── SECTION B — Same-month-last-year (YoY) ───────────────────────────────────
function renderYoyCard(){
  const titleEl=document.getElementById('insYoyTitle');
  const card=document.getElementById('insYoyCard');
  const earliest=findEarliestDataMonth();
  // Gate: only show once >=12 months of history exist, measured from the
  // earliest recorded month up to the currently viewed month.
  if(!earliest){ titleEl.style.display='none'; card.innerHTML=''; return; }
  const monthsOfHistory=(curYear-earliest.y)*12+(curMonth-earliest.m)+1;
  if(monthsOfHistory<12){ titleEl.style.display='none'; card.innerHTML=''; return; }

  titleEl.style.display='';
  const thisY=calcMonth(curYear,curMonth);
  const lastY=calcMonth(curYear-1,curMonth);
  if(lastY.totalExp<=0&&lastY.totalInc<=0){
    card.innerHTML=`<div class="ins-card">${insCardEmpty(MONTHS[curMonth]+' — Year over Year',"No data for "+MONTHS[curMonth]+' '+(curYear-1))}</div>`;
    return;
  }
  const expPct=lastY.totalExp>0?((thisY.totalExp-lastY.totalExp)/lastY.totalExp)*100:null;
  const incPct=lastY.totalInc>0?((thisY.totalInc-lastY.totalInc)/lastY.totalInc)*100:null;
  const row=(label,cur,prevVal,pct,goodIsUp)=>{
    if(pct===null) return `<div class="ins-card-row"><span class="icr-left"><span>${label}</span></span><span class="icr-right">${fmt(cur)} (new)</span></div>`;
    const up=pct>0;
    const good=goodIsUp?up:!up;
    return `<div class="ins-card-row"><span class="icr-left"><span>${label}</span></span><span class="icr-right ${good?'insight-good':'insight-bad'}">${fmt(cur)} <span style="font-weight:700">${up?'▲':'▼'}${Math.abs(pct).toFixed(0)}%</span></span></div>`;
  };
  card.innerHTML=`<div class="ins-card">
    <div class="ins-card-title">${MONTHS[curMonth]} ${curYear} vs ${MONTHS[curMonth]} ${curYear-1}</div>
    ${row('Expense',thisY.totalExp,lastY.totalExp,expPct,false)}
    ${row('Income',thisY.totalInc,lastY.totalInc,incPct,true)}
  </div>`;
}

// ── SECTION B — Best / worst month on record ──────────────────────────────────
function renderBestWorstCard(){
  const card=document.getElementById('insBestWorstCard');
  const earliest=findEarliestDataMonth();
  if(!earliest){ card.innerHTML=insCardEmpty('Best &amp; Worst Months','No data yet'); return; }
  const monthsList=[];
  let y=earliest.y,m=earliest.m;
  while(y<curYear||(y===curYear&&m<=curMonth)){
    const r=calcMonth(y,m);
    if(r.totalExp>0||r.totalInc>0) monthsList.push({y,m,...r});
    m++; if(m>11){ m=0; y++; }
  }
  if(monthsList.length<2){ card.innerHTML=insCardEmpty('Best &amp; Worst Months','Needs at least 2 recorded months'); return; }

  const label=mo=>`${MONTHS[mo.m].slice(0,3)} ${mo.y}`;
  const highestExp=monthsList.reduce((a,b)=>b.totalExp>a.totalExp?b:a);
  const lowestExp=monthsList.reduce((a,b)=>b.totalExp<a.totalExp?b:a);
  const highestInc=monthsList.reduce((a,b)=>b.totalInc>a.totalInc?b:a);
  const bestNet=monthsList.reduce((a,b)=>b.net>a.net?b:a);
  const worstNet=monthsList.reduce((a,b)=>b.net<a.net?b:a);

  const row=(tag,tagCls,text,val)=>`<div class="ins-best-worst-row"><span><span class="ibw-tag ${tagCls}">${tag}</span>${text}</span><span style="font-weight:700">${val}</span></div>`;
  card.innerHTML=
    row('Highest expense','worst',label(highestExp),fmt(highestExp.totalExp))+
    row('Lowest expense','best',label(lowestExp),fmt(lowestExp.totalExp))+
    row('Highest income','best',label(highestInc),fmt(highestInc.totalInc))+
    row('Best net','best',label(bestNet),fmt(bestNet.net,true))+
    row('Worst net','worst',label(worstNet),fmt(worstNet.net,true));
}

// ── SECTION B — Next-month forecast (per category) + mid-month pace ─────────
function renderForecastAndPace(catTotals,monthDays){
  const forecastCard=document.getElementById('insForecastCard');
  const months=collectRecentMonths(6);
  const expenseMonths=months.filter(mo=>mo.totalExp>0||mo.totalInc>0);
  if(expenseMonths.length<2){
    forecastCard.innerHTML=insCardEmpty('Next Month Forecast','Needs at least 2 months of history to project');
  } else {
    // Weighted recent-month average (most recent months weighted higher), blended
    // with trend direction, per category. Range comes from historical stddev.
    const weights=months.map((_,i)=>i+1); // oldest=1 .. newest=n
    const weightSum=weights.reduce((a,b)=>a+b,0);
    const perCat=EXPENSE_FIELDS.map(f=>{
      const series=months.map(mo=>mo.catTotals[f.id]||0);
      const total=series.reduce((a,b)=>a+b,0);
      if(total<=0) return null;
      const weighted=series.reduce((s,v,i)=>s+v*weights[i],0)/weightSum;
      const mean=total/series.length;
      const variance=series.reduce((s,v)=>s+Math.pow(v-mean,2),0)/series.length;
      const stdev=Math.sqrt(variance);
      // trend nudge: compare weighted avg to plain mean to lean toward recent direction
      const trendNudge=weighted-mean;
      const center=Math.max(0,weighted+trendNudge*0.5);
      const low=Math.max(0,center-stdev);
      const high=center+stdev;
      return {f,low,high,center};
    }).filter(Boolean);

    const totalLow=Math.round(perCat.reduce((s,c)=>s+c.low,0));
    const totalHigh=Math.round(perCat.reduce((s,c)=>s+c.high,0));
    const drivers=[...perCat].sort((a,b)=>b.center-a.center).slice(0,3).map(c=>c.f.label).join(', ');

    forecastCard.innerHTML=`<div class="ins-card-title">Estimated Next Month Expense</div>
      <div class="ins-forecast-range">${fmt(totalLow)} – ${fmt(totalHigh)}</div>
      <div class="ins-forecast-note">Based on a weighted average of the last ${expenseMonths.length} months, blended with recent trend direction. Mainly driven by: ${drivers||'—'}.</div>`;
  }

  // Mid-month current-pace projection — only meaningful while the viewed month
  // is genuinely in progress (getElapsedDaysInMonth returns 0 for past/future months).
  const elapsed=getElapsedDaysInMonth(curYear,curMonth);
  const paceCard=document.getElementById('insPaceCard');
  const today=new Date();
  const isCurrentMonth=(curYear===today.getFullYear()&&curMonth===today.getMonth());
  if(isCurrentMonth&&elapsed>0&&elapsed<monthDays){
    const{totalExp}=calcMonthUpTo(curYear,curMonth,elapsed);
    const dailyPace=totalExp/elapsed;
    const projected=Math.round(dailyPace*monthDays);
    paceCard.style.display='';
    paceCard.innerHTML=`<div class="ins-card-title">Mid-Month Pace Projection</div>
      <div class="ins-pace-compare">
        <div><div class="icp-label">Spent so far (day ${elapsed})</div><div class="icp-val">${fmt(totalExp)}</div></div>
        <div><div class="icp-label">Projected month-end</div><div class="icp-val">${fmt(projected)}</div></div>
      </div>
      <div class="ins-forecast-note">At the current daily pace of ${fmt(Math.round(dailyPace))}/day, projected across all ${monthDays} days.</div>`;
  } else {
    paceCard.style.display='none';
    paceCard.innerHTML='';
  }
}

// ─── RENDER YEARLY ────────────────────────────────────────────────────────────
function renderYearly(){
  document.getElementById('yearlyTitle').textContent=`Yearly Summary — ${curYear}`;
  let yrExp=0,yrInc=0;
  const yrCat={};
  ALL_FIELDS.forEach(f=>yrCat[f.id]=0);
  const monthData=[];

  for(let m=0;m<12;m++){
    const{totalExp,totalInc,net,catTotals,daily}=calcMonth(curYear,m);
    yrExp+=totalExp; yrInc+=totalInc;
    ALL_FIELDS.forEach(f=>yrCat[f.id]+=catTotals[f.id]);
    if(totalExp>0||totalInc>0) monthData.push({m,totalExp,totalInc,net,daily:daily.length});
  }
  const yrNet=yrInc-yrExp;

  document.getElementById('yrTotalExp').textContent=fmt(yrExp);
  document.getElementById('yrTotalInc').textContent=fmt(yrInc);
  const yrNetEl=document.getElementById('yrNet');
  yrNetEl.textContent=fmt(yrNet);
  yrNetEl.style.color=yrNet>=0?'var(--accent2)':'var(--danger)';
  document.getElementById('yearlySubtitle').textContent=`${monthData.length} months recorded`;

  renderAccountListSummary('accountListSummaryYear');
  renderDebtsSummary('debtsSummaryYear');

  renderBarChart('yearlyBarChart', monthData.map(md=>MONTHS[md.m].slice(0,3)), monthData.map(md=>md.totalExp));
  renderPieChart('yearlyPieChart', yrCat);

  // Monthly breakdown
  const mb=document.getElementById('monthlyBreakdown');
  mb.innerHTML='';
  monthData.forEach(({m,totalExp,totalInc,net:n,daily})=>{
    const row=document.createElement('div');
    row.className='month-row';
    row.innerHTML=`<span class="mr-name">${MONTHS[m]}</span><span class="mr-exp">${fmt(totalExp)}</span><span class="mr-inc">${fmt(totalInc)}</span><span class="mr-net ${n>=0?'pos':'neg'}">${fmt(n,true)}</span>`;
    row.onclick=()=>openMonthQuickView(m);
    mb.appendChild(row);
  });
  if(!mb.innerHTML) mb.innerHTML='<div style="color:var(--muted);text-align:center;padding:14px;font-size:0.82rem">No data yet</div>';

  // Category yearly
  const cb=document.getElementById('yearlyCatBreakdown');
  cb.innerHTML='';
  ALL_FIELDS.forEach(f=>{
    if(!yrCat[f.id]) return;
    const isInc=INCOME_FIELDS.some(x=>x.id===f.id);
    const row=document.createElement('div');
    row.className='breakdown-row';
    row.innerHTML=`<span class="br-left"><span>${f.icon}</span><span>${escHtml(f.label)}</span></span><span class="br-val ${isInc?'inc':'exp'}">${fmt(yrCat[f.id])}</span>`;
    row.style.cursor='pointer';
    row.title='View monthly breakdown';
    row.onclick=()=>openCategoryDetailYear(f.id);
    cb.appendChild(row);
  });
  if(!cb.innerHTML) cb.innerHTML='<div style="color:var(--muted);text-align:center;padding:14px;font-size:0.82rem">No data yet</div>';
}

// ─── TOAST ────────────────────────────────────────────────────────────────────
function showToast(msg,err=false){
  const t=document.getElementById('toast');
  t.textContent=msg;
  t.className='toast show'+(err?' error':'');
  setTimeout(()=>t.className='toast',2200);
}
// Lets the browser paint (e.g. a just-shown toast) before a heavy synchronous
// block runs — a microtask (plain Promise) isn't enough for that, it needs an
// actual macrotask boundary.
function yieldToUI(){ return new Promise(r=>setTimeout(r,0)); }

// ─── EXPORT: TODAY PDF ────────────────────────────────────────────────────────
function exportDayPDF(){
  const printWin=window.open('','_blank'); // opened synchronously so popup blockers don't kill it
  showToast('Generating PDF…');
  setTimeout(()=>{
    try{
      if(!printWin) throw new Error('popup-blocked');
      const data=getDay(curYear,curMonth,currentDay);
      const exp=EXPENSE_FIELDS.reduce((s,f)=>s+(data[f.id]||0),0);
      const inc=INCOME_FIELDS.reduce((s,f)=>s+(data[f.id]||0),0);
      const net=inc-exp;
      const esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
      let rows='';
      EXPENSE_FIELDS.forEach(f=>{
        const v=data[f.id]||0;
        const note=data['note_'+f.id]||'';
        if(v) rows+=`<tr><td>${f.icon} ${escHtml(f.label)}</td><td>Expense</td><td class="num exp">${v.toLocaleString('en-IN')}</td><td>${esc(note)}</td></tr>`;
      });
      rows+=`<tr class="subtotal"><td colspan="2">Total Expense</td><td class="num exp">${exp.toLocaleString('en-IN')}</td><td></td></tr>`;
      INCOME_FIELDS.forEach(f=>{
        const v=data[f.id]||0;
        const note=data['note_'+f.id]||'';
        if(v) rows+=`<tr><td>${f.icon} ${escHtml(f.label)}</td><td>Income</td><td class="num inc">${v.toLocaleString('en-IN')}</td><td>${esc(note)}</td></tr>`;
      });
      rows+=`<tr class="subtotal"><td colspan="2">Total Income</td><td class="num inc">${inc.toLocaleString('en-IN')}</td><td></td></tr>`;
      rows+=`<tr class="grand"><td colspan="2">Net Balance</td><td class="num ${net>=0?'inc':'exp'}">${net.toLocaleString('en-IN')}</td><td></td></tr>`;
      printHTML(pdfStyle()+`<h1>Money Tracker — Day ${currentDay}</h1><div class="sub">${new Date(curYear,curMonth,currentDay).toLocaleDateString('en-US',{weekday:'long',day:'numeric',month:'long',year:'numeric'})}</div><table><tr><th>Category</th><th>Type</th><th class="num">Amount (৳)</th><th>Note</th></tr>${rows}</table>`, printWin);
      showToast('PDF ready');
    }catch(err){
      console.error('Day PDF export failed:',err);
      showToast(err&&err.message==='popup-blocked'?'Popup blocked — allow popups to export PDF':'PDF export failed — check console','error');
    }
  },10);
}

// ─── EXPORT: MONTH PDF ────────────────────────────────────────────────────────
function exportMonthPDF(){
  const printWin=window.open('','_blank'); // opened synchronously so popup blockers don't kill it
  showToast('Generating PDF…');
  setTimeout(()=>{
    try{
      if(!printWin) throw new Error('popup-blocked');
      const{totalExp,totalInc,net,catTotals,daily}=calcMonth(curYear,curMonth);
      let catRows='',dayRows='';
      EXPENSE_FIELDS.forEach(f=>{if(catTotals[f.id]) catRows+=`<tr><td>${f.icon} ${escHtml(f.label)}</td><td>Expense</td><td class="num exp">${catTotals[f.id].toLocaleString('en-IN')}</td></tr>`;});
      INCOME_FIELDS.forEach(f=>{if(catTotals[f.id]) catRows+=`<tr><td>${f.icon} ${escHtml(f.label)}</td><td>Income</td><td class="num inc">${catTotals[f.id].toLocaleString('en-IN')}</td></tr>`;});
      daily.forEach(({day,exp,inc,net:n})=>{
        dayRows+=`<tr><td>Day ${day}</td><td class="num exp">${exp.toLocaleString('en-IN')}</td><td class="num inc">${inc.toLocaleString('en-IN')}</td><td class="num ${n>=0?'inc':'exp'}">${n.toLocaleString('en-IN')}</td></tr>`;
      });

      // Detailed day section: every recorded day (1..30/31), one by one — only
      // fields with a non-zero amount are listed, zero fields are skipped.
      let dayDetailHtml='';
      daily.forEach(({day,net:n,data})=>{
        const dateStr=new Date(curYear,curMonth,day).toLocaleDateString('en-US',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
        let dRows='';
        EXPENSE_FIELDS.forEach(f=>{
          const v=data[f.id]||0;
          if(!v) return;
          const note=data['note_'+f.id]||'';
          dRows+=`<tr><td>${f.icon} ${escHtml(f.label)}</td><td>Expense</td><td class="num exp">${v.toLocaleString('en-IN')}</td><td>${escHtml(note)}</td></tr>`;
        });
        INCOME_FIELDS.forEach(f=>{
          const v=data[f.id]||0;
          if(!v) return;
          const note=data['note_'+f.id]||'';
          dRows+=`<tr><td>${f.icon} ${escHtml(f.label)}</td><td>Income</td><td class="num inc">${v.toLocaleString('en-IN')}</td><td>${escHtml(note)}</td></tr>`;
        });
        dRows+=`<tr class="grand"><td colspan="2">Net Balance</td><td class="num ${n>=0?'inc':'exp'}">${n.toLocaleString('en-IN')}</td><td></td></tr>`;
        dayDetailHtml+=`<div class="day-block"><div class="day-block-head">Day ${day} · ${dateStr}</div><table><tr><th>Category</th><th>Type</th><th class="num">Amount (৳)</th><th>Note</th></tr>${dRows}</table></div>`;
      });
      if(!dayDetailHtml) dayDetailHtml='<div class="chart-nodata">No day-by-day data recorded yet</div>';

      // Insights (top category + month-over-month changes, same logic as the on-screen Insights card)
      const{y:py,m:pm}=getPrevMonth(curYear,curMonth);
      // Same like-for-like comparison as the on-screen card: cap the previous month
      // at the same day-of-month reached this month, rather than its full total.
      const elapsedDaysForCompare=getElapsedDaysInMonth(curYear,curMonth)||daysInMonth(curYear,curMonth);
      const prevData=calcMonthUpTo(py,pm,elapsedDaysForCompare);
      let insightsHtml='';
      const topEntries=EXPENSE_FIELDS.map(f=>({f,val:catTotals[f.id]||0})).filter(e=>e.val>0).sort((a,b)=>b.val-a.val);
      if(topEntries.length){
        const top=topEntries[0];
        const share=totalExp>0?((top.val/totalExp)*100).toFixed(0):0;
        insightsHtml+=`<div class="insight-box"><strong>Top Spending Category:</strong> ${top.f.icon} ${escHtml(top.f.label)} — ${top.val.toLocaleString('en-IN')} (${share}% of this month's expense)</div>`;
      }
      const changes=[];
      ALL_FIELDS.forEach(f=>{
        const isInc=INCOME_FIELDS.some(x=>x.id===f.id);
        const cur=catTotals[f.id]||0;
        const prevVal=prevData.catTotals[f.id]||0;
        if(cur===0&&prevVal===0) return;
        if(prevVal===0) return;
        const pct=((cur-prevVal)/prevVal)*100;
        if(Math.abs(pct)<1) return;
        changes.push({f,isInc,pct});
      });
      changes.sort((a,b)=>Math.abs(b.pct)-Math.abs(a.pct));
      if(changes.length){
        insightsHtml+='<ul class="insight-list">'+changes.slice(0,3).map(c=>{
          const up=c.pct>0;
          const goodDirection=c.isInc?up:!up;
          const arrow=up?'▲':'▼';
          return `<li>${c.f.icon} ${escHtml(c.f.label)} <span class="${goodDirection?'inc':'exp'}">${arrow} ${Math.abs(c.pct).toFixed(0)}%</span> vs last month (${MONTHS[pm]})</li>`;
        }).join('')+'</ul>';
      } else {
        insightsHtml+='<div class="chart-nodata">Not enough history yet to compare with last month</div>';
      }
      if(!insightsHtml) insightsHtml='<div class="chart-nodata">No insights available yet</div>';

      // Charts — captured as images from the currently rendered canvases
      const chartsHtml=
        canvasImg('comparisonChart','Category Comparison — This Month vs Last Month')+
        canvasImg('dailyBarChart','Daily Trend')+
        canvasImg('dailyAreaChart','Expense Curve')+
        canvasImg('categoryPieChart','Category Breakdown');

      printHTML(pdfStyle()+`
        <h1>Money Tracker — ${MONTHS[curMonth]} ${curYear}</h1>
        <div class="sub">Monthly Report | Generated: ${new Date().toLocaleDateString('en-US',{day:'numeric',month:'long',year:'numeric'})}</div>
        <div class="overview">
          <div class="ov"><div class="ol">Total Expense</div><div class="ov-val exp">${totalExp.toLocaleString('en-IN')}</div></div>
          <div class="ov"><div class="ol">Total Income</div><div class="ov-val inc">${totalInc.toLocaleString('en-IN')}</div></div>
          <div class="ov"><div class="ol">Net Balance</div><div class="ov-val ${net>=0?'inc':'exp'}">${net.toLocaleString('en-IN')}</div></div>
        </div>
        <div class="sh">Insights</div>
        ${insightsHtml}
        ${chartsHtml}
        <div class="sh">Category Breakdown</div>
        <table><tr><th>Category</th><th>Type</th><th class="num">Amount (৳)</th></tr>${catRows}</table>
        <div class="sh">Day by Day (Summary)</div>
        <table><tr><th>Day</th><th class="num">Expense</th><th class="num">Income</th><th class="num">Net</th></tr>${dayRows}</table>
        <div class="sh">Day by Day (Detailed — non-zero fields only)</div>
        ${dayDetailHtml}`, printWin);
      showToast('PDF ready');
    }catch(err){
      console.error('Month PDF export failed:',err);
      showToast(err&&err.message==='popup-blocked'?'Popup blocked — allow popups to export PDF':'PDF export failed — check console','error');
    }
  },10);
}

// ─── EXPORT: YEAR PDF ─────────────────────────────────────────────────────────
function exportYearPDF(){
  const printWin=window.open('','_blank'); // opened synchronously so popup blockers don't kill it
  showToast('Generating PDF…');
  setTimeout(()=>{
    try{
      if(!printWin) throw new Error('popup-blocked');
      let yrExp=0,yrInc=0;
      const yrCat={};
      ALL_FIELDS.forEach(f=>yrCat[f.id]=0);
      let mRows='',catRows='';
      for(let m=0;m<12;m++){
        const{totalExp,totalInc,net,catTotals}=calcMonth(curYear,m);
        if(totalExp>0||totalInc>0){
          yrExp+=totalExp; yrInc+=totalInc;
          ALL_FIELDS.forEach(f=>yrCat[f.id]+=catTotals[f.id]);
          mRows+=`<tr><td>${MONTHS[m]}</td><td class="num exp">${totalExp.toLocaleString('en-IN')}</td><td class="num inc">${totalInc.toLocaleString('en-IN')}</td><td class="num ${net>=0?'inc':'exp'}">${net.toLocaleString('en-IN')}</td></tr>`;
        }
      }
      const yrNet=yrInc-yrExp;
      EXPENSE_FIELDS.forEach(f=>{if(yrCat[f.id]) catRows+=`<tr><td>${f.icon} ${escHtml(f.label)}</td><td>Expense</td><td class="num exp">${yrCat[f.id].toLocaleString('en-IN')}</td></tr>`;});
      INCOME_FIELDS.forEach(f=>{if(yrCat[f.id]) catRows+=`<tr><td>${f.icon} ${escHtml(f.label)}</td><td>Income</td><td class="num inc">${yrCat[f.id].toLocaleString('en-IN')}</td></tr>`;});
      const chartsHtml=canvasImg('yearlyBarChart','Monthly Trend')+canvasImg('yearlyPieChart','Category Breakdown (Full Year)');
      printHTML(pdfStyle()+`
        <h1>Money Tracker — ${curYear} Annual Report</h1>
        <div class="sub">Generated: ${new Date().toLocaleDateString('en-US',{day:'numeric',month:'long',year:'numeric'})}</div>
        <div class="overview">
          <div class="ov"><div class="ol">Total Expense</div><div class="ov-val exp">${yrExp.toLocaleString('en-IN')}</div></div>
          <div class="ov"><div class="ol">Total Income</div><div class="ov-val inc">${yrInc.toLocaleString('en-IN')}</div></div>
          <div class="ov"><div class="ol">Net Balance</div><div class="ov-val ${yrNet>=0?'inc':'exp'}">${yrNet.toLocaleString('en-IN')}</div></div>
        </div>
        ${chartsHtml}
        <div class="sh">Monthly Breakdown</div>
        <table><tr><th>Month</th><th class="num">Expense</th><th class="num">Income</th><th class="num">Net</th></tr>${mRows}</table>
        <div class="sh">Category Breakdown (Full Year)</div>
        <table><tr><th>Category</th><th>Type</th><th class="num">Amount (৳)</th></tr>${catRows}</table>`, printWin);
      showToast('PDF ready');
    }catch(err){
      console.error('Year PDF export failed:',err);
      showToast(err&&err.message==='popup-blocked'?'Popup blocked — allow popups to export PDF':'PDF export failed — check console','error');
    }
  },10);
}

// ─── EXCEL STYLING HELPERS (ExcelJS) ──────────────────────────────────────────
const XL_NAVY='FF1E3A5F', XL_ACCENT='FF2E86AB', XL_BAND='FFF2F6FB', XL_WHITE='FFFFFFFF',
      XL_EXP='FFC0392B', XL_INC='FF1A7A4A', XL_BORDER='FFD8DEE9', XL_MUTED='FF888888', XL_TEXT='FF1A1A2E';

function xlFill(argb){ return {type:'pattern',pattern:'solid',fgColor:{argb}}; }
function xlBorderAll(){
  const b={style:'thin',color:{argb:XL_BORDER}};
  return {top:b,left:b,bottom:b,right:b};
}
// Full-width colored banner row (title / section header), merged across columns 1..lastCol
function xlBanner(ws,row,lastCol,text,{bg=XL_ACCENT,size=11,height=20}={}){
  for(let c=1;c<=lastCol;c++){
    const cell=ws.getCell(row,c);
    cell.fill=xlFill(bg);
    cell.font={bold:true,size,color:{argb:XL_WHITE}};
  }
  ws.getCell(row,1).value=text;
  ws.getCell(row,1).alignment={vertical:'middle',horizontal:'left',indent:1};
  ws.mergeCells(row,1,row,lastCol);
  ws.getRow(row).height=height;
  return row+1;
}
function xlSubtitle(ws,row,lastCol,text){
  ws.getCell(row,1).value=text;
  ws.getCell(row,1).font={italic:true,size:9,color:{argb:XL_MUTED}};
  ws.mergeCells(row,1,row,lastCol);
  return row+1;
}
// A row of label:value pairs (2 columns each), e.g. Total Expense | 5,000 | Total Income | 8,000
function xlLabelValueRow(ws,row,lastCol,pairs){
  let col=1;
  pairs.forEach(p=>{
    const lc=ws.getCell(row,col);
    lc.value=p.label; lc.font={bold:true,color:{argb:XL_TEXT}}; lc.alignment={horizontal:'left',indent:1}; lc.border=xlBorderAll();
    const vc=ws.getCell(row,col+1);
    vc.value=p.value; vc.numFmt='#,##0'; vc.alignment={horizontal:'right'};
    vc.font={bold:true,size:p.big?12:11,color:{argb:p.color||XL_TEXT}}; vc.border=xlBorderAll();
    col+=2;
  });
  for(;col<=lastCol;col++) ws.getCell(row,col).border=xlBorderAll();
  return row+1;
}
// Table header row (navy fill, white bold text, right-aligned except first column)
function xlTableHeader(ws,row,headers){
  headers.forEach((h,i)=>{
    const cell=ws.getCell(row,i+1);
    cell.value=h;
    cell.font={bold:true,size:10,color:{argb:XL_WHITE}};
    cell.fill=xlFill(XL_NAVY);
    cell.border=xlBorderAll();
    cell.alignment={vertical:'middle',horizontal:i===0?'left':'right',indent:i===0?1:0};
  });
  ws.getRow(row).height=18;
  return row+1;
}
// A normal data row — column 0 is a text label (bold), the rest are numbers (currency format),
// optionally tinted red/green via colorMap = {colIndex:'exp'|'inc'}, with optional zebra banding.
function xlDataRow(ws,row,values,{band=false,colorMap={}}={}){
  values.forEach((v,i)=>{
    const cell=ws.getCell(row,i+1);
    cell.value=v;
    cell.border=xlBorderAll();
    if(band) cell.fill=xlFill(XL_BAND);
    if(typeof v==='number'){
      cell.numFmt='#,##0';
      cell.alignment={horizontal:'right'};
      if(colorMap[i]) cell.font={color:{argb:colorMap[i]==='exp'?XL_EXP:XL_INC}};
    } else {
      cell.alignment={horizontal:i===0?'left':'right',indent:i===0?1:0};
      if(i===0) cell.font={bold:true,color:{argb:XL_TEXT}};
    }
  });
  return row+1;
}
function xlColWidths(ws,widths){ widths.forEach((w,i)=>ws.getColumn(i+1).width=w); }
async function downloadWorkbook(wb,filename){
  const buf=await wb.xlsx.writeBuffer();
  const blob=new Blob([buf],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;a.download=filename;a.click();
  URL.revokeObjectURL(url);
}

// ─── EXPORT: MONTH EXCEL ──────────────────────────────────────────────────────
async function exportMonthExcel(){
  if(typeof ExcelJS==='undefined'){ showToast('Excel engine still loading — try again in a sec','error'); return; }
  showToast('Generating Excel…');
  await yieldToUI();
  try{
    const{totalExp,totalInc,net,catTotals,daily}=calcMonth(curYear,curMonth);
    const detailCols=1+EXPENSE_FIELDS.length+1+INCOME_FIELDS.length+1+1; // Day + exp fields + TotalExp + inc fields + TotalInc + Net
    const lastCol=Math.max(4,detailCols);
    const wb=new ExcelJS.Workbook();
    wb.creator='Money Tracker'; wb.created=new Date();
    const ws=wb.addWorksheet('Monthly Report',{views:[{state:'frozen',ySplit:2}]});

    let r=1;
    r=xlBanner(ws,r,lastCol,`Money Tracker — ${MONTHS[curMonth]} ${curYear}`,{bg:XL_NAVY,size:14,height:26});
    r=xlSubtitle(ws,r,lastCol,`Generated: ${new Date().toLocaleDateString('en-US',{day:'numeric',month:'long',year:'numeric'})}`);
    r++;

    r=xlBanner(ws,r,lastCol,'OVERVIEW');
    r=xlLabelValueRow(ws,r,lastCol,[{label:'Total Expense',value:totalExp,color:XL_EXP},{label:'Total Income',value:totalInc,color:XL_INC}]);
    r=xlLabelValueRow(ws,r,lastCol,[{label:'Net Balance',value:net,color:net>=0?XL_INC:XL_EXP,big:true}]);
    r++;

    r=xlBanner(ws,r,lastCol,'CATEGORY BREAKDOWN');
    r=xlTableHeader(ws,r,['Category','Type','Amount (BDT)']);
    let band=false;
    EXPENSE_FIELDS.forEach(f=>{ if(catTotals[f.id]){ r=xlDataRow(ws,r,[f.label,'Expense',catTotals[f.id]],{band,colorMap:{2:'exp'}}); band=!band; } });
    INCOME_FIELDS.forEach(f=>{ if(catTotals[f.id]){ r=xlDataRow(ws,r,[f.label,'Income',catTotals[f.id]],{band,colorMap:{2:'inc'}}); band=!band; } });
    r++;

    r=xlBanner(ws,r,lastCol,'DAY BY DAY');
    r=xlTableHeader(ws,r,['Day','Total Expense','Total Income','Net Balance']);
    band=false;
    daily.forEach(({day,exp,inc,net:n})=>{
      r=xlDataRow(ws,r,[`Day ${day}`,exp,inc,n],{band,colorMap:{1:'exp',2:'inc',3:n>=0?'inc':'exp'}});
      band=!band;
    });
    r++;

    r=xlBanner(ws,r,lastCol,'DETAILED BREAKDOWN — every category, every day');
    r=xlTableHeader(ws,r,['Day',...EXPENSE_FIELDS.map(f=>f.label),'Total Exp',...INCOME_FIELDS.map(f=>f.label),'Total Inc','Net']);
    band=false;
    daily.forEach(({day,data,exp,inc,net:n})=>{
      const row=[`Day ${day}`,...EXPENSE_FIELDS.map(f=>data[f.id]||0),exp,...INCOME_FIELDS.map(f=>data[f.id]||0),inc,n];
      r=xlDataRow(ws,r,row,{band});
      band=!band;
    });

    xlColWidths(ws,[14,...EXPENSE_FIELDS.map(()=>12),13,...INCOME_FIELDS.map(()=>12),13,13]);

    await downloadWorkbook(wb,`MoneyTracker_${MONTHS[curMonth]}_${curYear}.xlsx`);
    showToast('Excel exported');
  }catch(err){
    console.error('Month Excel export failed:',err);
    showToast('Excel export failed — check console','error');
  }
}

// ─── EXPORT: YEAR EXCEL ───────────────────────────────────────────────────────
async function exportYearExcel(){
  if(typeof ExcelJS==='undefined'){ showToast('Excel engine still loading — try again in a sec','error'); return; }
  showToast('Generating Excel…');
  await yieldToUI();
  try{
    let yrExp=0,yrInc=0;
    const yrCat={};
    ALL_FIELDS.forEach(f=>yrCat[f.id]=0);
    const monthRows=[];
    for(let m=0;m<12;m++){
      const{totalExp,totalInc,net,catTotals}=calcMonth(curYear,m);
      if(totalExp>0||totalInc>0){
        yrExp+=totalExp; yrInc+=totalInc;
        ALL_FIELDS.forEach(f=>yrCat[f.id]+=catTotals[f.id]);
        monthRows.push([MONTHS[m],totalExp,totalInc,net]);
      }
    }
    const lastCol=4;
    const wb=new ExcelJS.Workbook();
    wb.creator='Money Tracker'; wb.created=new Date();
    const ws=wb.addWorksheet('Annual Report',{views:[{state:'frozen',ySplit:2}]});

    let r=1;
    r=xlBanner(ws,r,lastCol,`Money Tracker — ${curYear} Annual Report`,{bg:XL_NAVY,size:14,height:26});
    r=xlSubtitle(ws,r,lastCol,`Generated: ${new Date().toLocaleDateString('en-US',{day:'numeric',month:'long',year:'numeric'})}`);
    r++;

    r=xlBanner(ws,r,lastCol,'YEARLY OVERVIEW');
    r=xlLabelValueRow(ws,r,lastCol,[{label:'Total Expense',value:yrExp,color:XL_EXP},{label:'Total Income',value:yrInc,color:XL_INC}]);
    r=xlLabelValueRow(ws,r,lastCol,[{label:'Net Balance',value:yrInc-yrExp,color:(yrInc-yrExp)>=0?XL_INC:XL_EXP,big:true}]);
    r++;

    r=xlBanner(ws,r,lastCol,'MONTHLY BREAKDOWN');
    r=xlTableHeader(ws,r,['Month','Total Expense','Total Income','Net Balance']);
    let band=false;
    monthRows.forEach(row=>{
      r=xlDataRow(ws,r,row,{band,colorMap:{1:'exp',2:'inc',3:row[3]>=0?'inc':'exp'}});
      band=!band;
    });
    r++;

    r=xlBanner(ws,r,lastCol,'CATEGORY BREAKDOWN (FULL YEAR)');
    r=xlTableHeader(ws,r,['Category','Type','Amount (BDT)']);
    band=false;
    EXPENSE_FIELDS.forEach(f=>{ if(yrCat[f.id]){ r=xlDataRow(ws,r,[f.label,'Expense',yrCat[f.id]],{band,colorMap:{2:'exp'}}); band=!band; } });
    INCOME_FIELDS.forEach(f=>{ if(yrCat[f.id]){ r=xlDataRow(ws,r,[f.label,'Income',yrCat[f.id]],{band,colorMap:{2:'inc'}}); band=!band; } });

    xlColWidths(ws,[20,16,16,16]);

    await downloadWorkbook(wb,`MoneyTracker_${curYear}_Annual.xlsx`);
    showToast('Excel exported');
  }catch(err){
    console.error('Year Excel export failed:',err);
    showToast('Excel export failed — check console','error');
  }
}

function pdfStyle(){
  return `<style>
    body{font-family:Arial,sans-serif;font-size:12px;color:#1a1a2e;padding:20px;}
    h1{font-size:18px;color:#1E3A5F;margin-bottom:2px;}
    .sub{color:#888;font-size:10px;margin-bottom:16px;}
    .overview{display:flex;gap:10px;margin-bottom:16px;}
    .ov{flex:1;border:1px solid #dde;border-radius:7px;padding:9px 12px;text-align:center;}
    .ol{font-size:9px;color:#888;text-transform:uppercase;letter-spacing:.5px;margin-bottom:2px;}
    .ov-val{font-size:15px;font-weight:700;}
    .exp{color:#c0392b;}.inc{color:#1a7a4a;}
    table{width:100%;border-collapse:collapse;margin-bottom:16px;font-size:11px;}
    th{background:#1E3A5F;color:#fff;padding:6px 9px;text-align:left;}
    td{padding:5px 9px;border-bottom:1px solid #eef;}
    tr:nth-child(even) td{background:#f6f8fb;}
    .num{text-align:right;}
    .subtotal td{font-weight:700;background:#fff3cd;}
    .grand td{font-weight:700;font-size:13px;background:#dbe9fb;}
    .sh{background:#2E86AB;color:#fff;padding:6px 10px;font-weight:700;font-size:11px;border-radius:4px;margin:12px 0 6px;}
    .insight-box{border:1px solid #dde;border-left:4px solid #2E86AB;border-radius:6px;padding:8px 12px;margin-bottom:8px;font-size:11.5px;background:#f6f8fb;}
    .insight-list{list-style:none;margin:0 0 8px;padding:0;}
    .insight-list li{border:1px solid #dde;border-radius:6px;padding:7px 12px;margin-bottom:6px;font-size:11.5px;background:#fff;}
    .chart-nodata{color:#999;font-size:11px;text-align:center;padding:10px;border:1px dashed #dde;border-radius:6px;margin-bottom:12px;}
    .pdf-chart-wrap{border:1px solid #dde;border-radius:8px;padding:10px;margin-bottom:16px;text-align:center;background:#fff;}
    .pdf-chart-wrap img{width:100%;max-width:650px;}

    .day-block{margin-bottom:14px;}
    .day-block-head{background:#eef4fb;color:#1E3A5F;font-weight:700;padding:6px 10px;font-size:11px;border:1px solid #dde;border-bottom:none;border-radius:4px 4px 0 0;}
    .day-block table{margin-bottom:0;border:1px solid #dde;border-top:none;table-layout:fixed;}
    /* Fixed, identical column widths on every day's table so they all line up vertically, one under another */
    .day-block th:nth-child(1), .day-block td:nth-child(1){width:32%;}
    .day-block th:nth-child(2), .day-block td:nth-child(2){width:16%;}
    .day-block th:nth-child(3), .day-block td:nth-child(3){width:20%;}
    .day-block th:nth-child(4), .day-block td:nth-child(4){width:32%;}
    .day-block td, .day-block th{overflow-wrap:break-word;word-break:break-word;}

    /* ── Keep every "section" whole on one printed page ── */
    .overview, .ov, .insight-box, .insight-list li,
    .pdf-chart-wrap, .day-block, .chart-nodata, tr, table{
      page-break-inside: avoid;
      break-inside: avoid;
    }
    /* A heading should never sit alone at the bottom of a page with its content pushed to the next */
    h1, .sub, .sh{
      page-break-after: avoid;
      break-after: avoid;
    }
    .sh{ page-break-before: auto; }
    @media print{
      .overview, .ov, .insight-box, .insight-list li,
      .pdf-chart-wrap, .day-block, .chart-nodata, tr, table{
        page-break-inside: avoid;
        break-inside: avoid;
      }
      h1, .sub, .sh{
        page-break-after: avoid;
        break-after: avoid;
      }
    }
  </style>`;
}

// Grabs whatever is currently drawn on a Chart.js canvas and turns it into an
// <img> for the print window (charts live in the live DOM/canvas, not in the
// PDF's own document, so they have to be captured as images first). Falls
// back to a "no data" note if the chart is hidden/empty or capture fails.
function canvasImg(id,label){
  const el=document.getElementById(id);
  const heading=label?`<div class="sh">${escHtml(label)}</div>`:'';
  if(!el||el.style.display==='none'){
    return `${heading}<div class="chart-nodata">No data available for this chart yet</div>`;
  }
  try{
    const dataUrl=el.toDataURL('image/png',1.0);
    return `${heading}<div class="pdf-chart-wrap"><img src="${dataUrl}" alt="${escHtml(label||'chart')}"/></div>`;
  }catch(e){
    return `${heading}<div class="chart-nodata">Chart unavailable</div>`;
  }
}

function printHTML(body,w){
  w=w||window.open('','_blank');
  if(!w) return null;
  w.document.write(`<html><head><meta charset="UTF-8"></head><body>${body}</body></html>`);
  w.document.close();
  w.onload=()=>w.print();
  return w;
}

// Note: per-field input/note listeners are attached inside attachFieldListeners(),
// called every time renderFieldRows() (re)builds the category rows.

// ─── FULL BACKUP / RESTORE (JSON) + CSV EXPORT ────────────────────────────────
function downloadBlob(content,mime,filename){
  const blob=new Blob([content],{type:mime});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url; a.download=filename; a.click();
  URL.revokeObjectURL(url);
}
function allDayEntries(){
  // Returns [{key,y,m(0-idx),d,data}] for every saved day, parsed and sorted chronologically.
  const dayKeyRe=/^mt_(\d+)_(\d+)_(\d+)$/;
  const out=[];
  for(let i=0;i<localStorage.length;i++){
    const key=localStorage.key(i);
    const m2=key&&key.match(dayKeyRe);
    if(!m2) continue;
    let data; try{ data=JSON.parse(localStorage.getItem(key)); }catch{ continue; }
    if(!data) continue;
    out.push({key, y:parseInt(m2[1]), m:parseInt(m2[2])-1, d:parseInt(m2[3]), data});
  }
  out.sort((a,b)=>a.y-b.y||a.m-b.m||a.d-b.d);
  return out;
}
function exportAllDataJSON(){
  showToast('Preparing backup…');
  setTimeout(()=>{
    try{
      const days={};
      allDayEntries().forEach(({key,data})=>{ days[key]=data; });
      const payload={
        version:1, exportedAt:new Date().toISOString(),
        categories:{expense:EXPENSE_FIELDS, income:INCOME_FIELDS},
        goal:SAVINGS_GOAL, accounts:ACCOUNTS, ledger:LEDGER, debts:DEBTS, days
      };
      downloadBlob(JSON.stringify(payload,null,2), 'application/json', `money-tracker-backup-${new Date().toISOString().slice(0,10)}.json`);
      showToast('Backup downloaded');
    }catch(err){
      console.error('Backup export failed:',err);
      showToast('Backup export failed — check console','error');
    }
  },10);
}
async function batchSetDays(entries){
  // entries: [{y,m,d,data}] — writes in small parallel batches so a large
  // history doesn't fire hundreds of Firestore calls all at once.
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
  if(!confirm('This replaces ALL current data (categories, accounts, debts, and every day recorded) with this backup file. Continue?')){ fileInput.value=''; return; }
  showToast('Restoring backup…');
  await yieldToUI();
  try{
    if(payload.categories){
      if(Array.isArray(payload.categories.expense)&&payload.categories.expense.length) EXPENSE_FIELDS=payload.categories.expense;
      if(Array.isArray(payload.categories.income)&&payload.categories.income.length) INCOME_FIELDS=payload.categories.income;
      migratePinnedFields();
      rebuildAllFields();
    }
    if(typeof payload.goal==='number') SAVINGS_GOAL=payload.goal;
    if(Array.isArray(payload.accounts)&&payload.accounts.length) ACCOUNTS=payload.accounts;
    if(Array.isArray(payload.ledger)) LEDGER=payload.ledger;
    if(Array.isArray(payload.debts)) DEBTS=payload.debts;
    await saveSettingsRemote();
    await saveLedgerRemote();
    await saveDebtsRemote();

    // Wipe existing local day entries, then write back whatever the backup has
    allDayEntries().forEach(({key})=>localStorage.removeItem(key));
    invalidateDayEntriesCache();
    if(payload.days&&typeof payload.days==='object'){
      const dayKeyRe=/^mt_(\d+)_(\d+)_(\d+)$/;
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
    if(document.getElementById('summarySection').classList.contains('active')) renderSummary();
    if(document.getElementById('yearlySection').classList.contains('active')) renderYearly();
    if(document.getElementById('insightsSection').classList.contains('active')) renderInsightsTab();
    showToast('Backup restored');
    closeSettings();
  }catch(err){
    console.error('Restore failed:',err);
    showToast('Restore failed — check console','error');
  }
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
      const rows=[['Date','Category','Type','Amount','Note','Account']];
      allDayEntries().forEach(({y,m,d,data})=>{
        const dateStr=`${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        ALL_FIELDS.forEach(f=>{
          const amt=data[f.id];
          if(!amt) return;
          const isInc=INCOME_FIELDS.some(x=>x.id===f.id);
          const note=data['note_'+f.id]||'';
          const acct=ACCOUNTS.find(a=>a.id===data['acct_'+f.id]);
          rows.push([dateStr, f.label, isInc?'Income':'Expense', amt, note, acct?acct.label:'']);
        });
      });
      const csv=rows.map(r=>r.map(csvEscape).join(',')).join('\r\n');
      downloadBlob(csv, 'text/csv;charset=utf-8', `money-tracker-export-${new Date().toISOString().slice(0,10)}.csv`);
      showToast('CSV exported');
    }catch(err){
      console.error('CSV export failed:',err);
      showToast('CSV export failed — check console','error');
    }
  },10);
}

// ─── REMOVE ALL DATA (staged confirmation popup) ──────────────────────────────
function openRemoveDataModal(){
  rdShowStage(1);
  document.getElementById('removeDataModal').classList.add('open');
}
function closeRemoveDataModal(){
  document.getElementById('removeDataModal').classList.remove('open');
  rdShowStage(1); // reset back to the first stage for next time
}
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
    // 1) Wipe every recorded day, locally...
    allDayEntries().forEach(({key})=>localStorage.removeItem(key));
    invalidateDayEntriesCache();

    // ...and in Firestore, plus the settings/ledger/debts meta docs.
    if(window._mtAuth && window._mtDb){
      const uid=window._mtAuth.currentUser?.uid;
      if(uid){
        try{
          const {doc,deleteDoc,collection,getDocs}=await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
          const col=collection(window._mtDb,"users",uid,"moneytracker");
          const snap=await getDocs(col);
          const ids=snap.docs.map(d=>d.id);
          const BATCH=15;
          for(let i=0;i<ids.length;i+=BATCH){
            await Promise.all(ids.slice(i,i+BATCH).map(id=>deleteDoc(doc(window._mtDb,"users",uid,"moneytracker",id))));
          }
          await Promise.all([
            deleteDoc(doc(window._mtDb,"users",uid,"moneytracker_meta","settings")),
            deleteDoc(doc(window._mtDb,"users",uid,"moneytracker_meta","ledger")),
            deleteDoc(doc(window._mtDb,"users",uid,"moneytracker_meta","debts"))
          ]);
        }catch(e){ console.error('Firestore wipe failed:',e); }
      }
    }

    // 2) Reset categories, accounts, goal, ledger and debts back to defaults
    EXPENSE_FIELDS=DEFAULT_EXPENSE_FIELDS.map(f=>({...f}));
    INCOME_FIELDS=DEFAULT_INCOME_FIELDS.map(f=>({...f}));
    ACCOUNTS=DEFAULT_ACCOUNTS.map(a=>({...a}));
    SAVINGS_GOAL=0;
    LEDGER=[];
    DEBTS=[];
    rebuildAllFields();
    saveCategoriesLocal();
    saveGoalLocalOnly();
    saveAccountsLocal();
    saveLedgerLocal();
    saveDebtsLocal();

    // 3) Refresh whatever's currently on screen
    extraShownIds=new Set();
    renderFieldRows();
    renderSettingsLists();
    loadDay(currentDay);
    if(document.getElementById('summarySection').classList.contains('active')) renderSummary();
    if(document.getElementById('yearlySection').classList.contains('active')) renderYearly();
    if(document.getElementById('insightsSection').classList.contains('active')) renderInsightsTab();

    closeRemoveDataModal();
    closeSettings();
    showToast('All data deleted');
  }catch(err){
    console.error('Remove all data failed:',err);
    showToast('Something went wrong — check console','error');
  }finally{
    if(btn){ btn.disabled=false; btn.textContent='Yes, Delete Everything'; }
  }
}

// ── FIREBASE INIT + AUTH CHECK ──────────────────────────────
async function initApp(){
  // Render immediately with whatever's cached locally (defaults on first run)
  // so the UI isn't blank while Firebase spins up.
  loadCategoriesLocal();
  loadGoalLocal();
  loadAccountsLocal();
  loadLedgerLocal();
  loadDebtsLocal();
  renderFieldRows();

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
      // Load current month + categories/budgets/goal from Firestore, then init UI
      showToast('Loading data…');
      await loadMonthFromFirestore(curYear,curMonth);
      splashStep();
      await loadSettingsRemote();
      splashStep();
      await loadLedgerRemote();
      splashStep();
      await loadDebtsRemote();
      splashStep();
      renderFieldRows();
      initSelectors();
      const today=new Date();
      const startDay=curYear===today.getFullYear()&&curMonth===today.getMonth()?today.getDate():1;
      navOffset=Math.max(0,startDay-4);
      await selectDay(Math.min(startDay,daysInMonth(curYear,curMonth)));
      splashFinish();
    });
  } catch(e){
    console.error("Firebase init failed:",e);
    // Fallback: run without Firebase
    initSelectors();
    const today=new Date();
    const startDay=curYear===today.getFullYear()&&curMonth===today.getMonth()?today.getDate():1;
    navOffset=Math.max(0,startDay-4);
    await selectDay(Math.min(startDay,daysInMonth(curYear,curMonth)));
    splashFinish();
  }
}

initApp();
// Failsafe: never let the splash trap the user if something unexpected fails mid-load
setTimeout(()=>{
  const splash = document.getElementById('mtSplash');
  if (splash && !splash.classList.contains('mt-splash-hide')) splashFinish();
}, 15000);
