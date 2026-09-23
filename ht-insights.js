/* ================================================================
   ht-insights.js — Health Tracker Insights.
   4 tabs mirroring Money Tracker's mti-tabbar pattern (reuses
   .mti-tabbar/.mti-tab/.mti-pane/.mti-hm-* from mt-insights.css):
     Overview  — tips + streak glance + goal progress + month-vs-month
     Streaks   — consistency stats + logging heatmap + mood frequency
     Trends    — rolling averages per metric, best/worst months
     Forecast  — weight goal projection + correlations
   ================================================================ */

(function(){
  const $ = id => document.getElementById(id);
  const INSIGHT_TABS = [
    {id:'overview', label:'Overview', icon:'fa-chart-simple'},
    {id:'streaks', label:'Streaks', icon:'fa-fire'},
    {id:'trends', label:'Trends', icon:'fa-arrow-trend-up'},
    {id:'forecast', label:'Forecast', icon:'fa-crystal-ball'},
  ];
  let activeInsightsTab='overview';
  let activeTrendMetric='weight';

  function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  function renderTabBar(){
    const bar=$('mtiTabBar');
    if(!bar) return;
    bar.innerHTML=INSIGHT_TABS.map(t=>
      `<button type="button" class="mti-tab${t.id===activeInsightsTab?' mti-active':''}" data-mti-tab="${t.id}" role="tab" aria-selected="${t.id===activeInsightsTab}"><i class="fas ${t.icon}"></i> ${t.label}</button>`
    ).join('');
    bar.querySelectorAll('[data-mti-tab]').forEach(btn=>{
      btn.onclick=()=>{ activeInsightsTab=btn.dataset.mtiTab; renderInsightsTab(); };
    });
  }
  function applyPaneVisibility(){
    document.querySelectorAll('.mti-pane').forEach(p=>{
      p.classList.toggle('mti-active', p.dataset.mtiPane===activeInsightsTab);
    });
  }
  function cardHTML(titleHTML,bodyHTML){
    return `<div class="ins-card"><div class="ins-card-title">${titleHTML}</div>${bodyHTML}</div>`;
  }

  // ── Shared data gathering ───────────────────────────────────
  function monthStatsFor(y,m){ return calcMonth(y,m); }
  function allEntriesSorted(){
    return getAllDayEntriesCached().slice().sort((a,b)=>(a.y-b.y)||(a.m-b.m)||(a.d-b.d));
  }
  function dateKey(y,m,d){ return y*10000+m*100+d; }
  function todayKey(){ const t=new Date(); return dateKey(t.getFullYear(),t.getMonth(),t.getDate()); }

  // ── STREAKS ──────────────────────────────────────────────────
  function computeLoggingStreak(){
    const entries=allEntriesSorted().filter(e=>dayHasData(e.data));
    if(!entries.length) return {current:0,best:0};
    const keys=new Set(entries.map(e=>dateKey(e.y,e.m,e.d)));
    // current streak: walk back from today
    let cur=0;
    let d=new Date();
    while(true){
      const k=dateKey(d.getFullYear(),d.getMonth(),d.getDate());
      if(keys.has(k)){ cur++; d.setDate(d.getDate()-1); } else break;
    }
    // best streak: scan sorted unique days
    const sortedKeys=Array.from(keys).sort((a,b)=>a-b);
    let best=1,run=1;
    for(let i=1;i<sortedKeys.length;i++){
      const prevDate=keyToDate(sortedKeys[i-1]);
      const nowDate=keyToDate(sortedKeys[i]);
      const diff=Math.round((nowDate-prevDate)/86400000);
      run = diff===1 ? run+1 : 1;
      if(run>best) best=run;
    }
    return {current:cur,best:Math.max(best,cur)};
  }
  function keyToDate(k){ const y=Math.floor(k/10000), m=Math.floor((k%10000)/100), d=k%100; return new Date(y,m,d); }

  function computeWaterStreak(){
    const goal=SAVINGS_GOALS.water||0;
    if(!goal) return {current:0,best:0,hasGoal:false};
    const entries=allEntriesSorted().filter(e=>(e.data.water||0)>=goal);
    if(!entries.length) return {current:0,best:0,hasGoal:true};
    const keys=new Set(entries.map(e=>dateKey(e.y,e.m,e.d)));
    let cur=0, d=new Date();
    while(true){
      const k=dateKey(d.getFullYear(),d.getMonth(),d.getDate());
      if(keys.has(k)){ cur++; d.setDate(d.getDate()-1); } else break;
    }
    const sortedKeys=Array.from(keys).sort((a,b)=>a-b);
    let best=1,run=1;
    for(let i=1;i<sortedKeys.length;i++){
      const diff=Math.round((keyToDate(sortedKeys[i])-keyToDate(sortedKeys[i-1]))/86400000);
      run = diff===1 ? run+1 : 1;
      if(run>best) best=run;
    }
    return {current:cur,best:Math.max(best,cur),hasGoal:true};
  }
  function computeActiveDays(){
    // "active" = steps logged and > 0, within last 30 days
    const cutoff=new Date(); cutoff.setDate(cutoff.getDate()-29);
    const cutoffKey=dateKey(cutoff.getFullYear(),cutoff.getMonth(),cutoff.getDate());
    const nowKey=todayKey();
    const entries=allEntriesSorted().filter(e=>{
      const k=dateKey(e.y,e.m,e.d);
      return k>=cutoffKey && k<=nowKey && (e.data.steps||0)>0;
    });
    return entries.length;
  }
  function computeMedsAdherence(){
    const entries=allEntriesSorted().filter(e=>Array.isArray(e.data.meds_items)&&e.data.meds_items.length>0);
    if(!entries.length) return null;
    let total=0, taken=0;
    entries.forEach(e=>{ e.data.meds_items.forEach(it=>{ total++; if(it.checked) taken++; }); });
    return total?Math.round((taken/total)*100):null;
  }

  function renderStreakGlanceCard(){
    const slot=$('mtiStreakCard');
    if(!slot) return;
    const log=computeLoggingStreak();
    const water=computeWaterStreak();
    const body=`<div class="ins-stat-grid" style="margin:0">
      <div class="ins-stat-card"><div class="ins-stat-label">Logging Streak</div><div class="ins-stat-val">${log.current}🔥</div><div class="ins-stat-sub">Best: ${log.best} days</div></div>
      <div class="ins-stat-card"><div class="ins-stat-label">Water Streak</div><div class="ins-stat-val">${water.hasGoal?water.current+'💧':'–'}</div><div class="ins-stat-sub">${water.hasGoal?'Best: '+water.best+' days':'Set a water goal first'}</div></div>
    </div>`;
    slot.innerHTML=cardHTML('<i class="fas fa-fire"></i> Streak Glance', body);
  }

  function renderTips(){
    const box=$('mtiTips');
    if(!box) return;
    const tips=[];
    const log=computeLoggingStreak();
    if(log.current===0) tips.push({icon:'fa-clipboard-list',text:'No logging streak right now — log today to start one.'});
    else if(log.current>=7) tips.push({icon:'fa-fire',text:`You're on a ${log.current}-day logging streak — keep it up!`});
    const m=calcMonth(curYear,curMonth);
    const latestWeight=last(m.weights);
    if(SAVINGS_GOALS.weight>0 && latestWeight){
      const diff=latestWeight-SAVINGS_GOALS.weight;
      if(Math.abs(diff)<0.3) tips.push({icon:'fa-bullseye',text:'You\'re right at your weight goal — nice work.'});
    }
    const avgSleep=avg(m.sleeps);
    if(SAVINGS_GOALS.sleep>0 && avgSleep!=null && avgSleep<SAVINGS_GOALS.sleep-1) tips.push({icon:'fa-bed',text:`Averaging ${avgSleep.toFixed(1)}h sleep this month — below your ${SAVINGS_GOALS.sleep}h goal.`});
    if(!tips.length) tips.push({icon:'fa-lightbulb',text:'Keep logging daily to unlock more personalized insights.'});
    box.innerHTML=tips.slice(0,2).map(t=>`<div class="mti-tip mti-tip-good"><i class="fas ${t.icon} mti-tip-ico"></i><span class="mti-tip-text">${esc(t.text)}</span></div>`).join('');
  }

  // ── GOAL PROGRESS CARD (Overview) ───────────────────────────
  function renderGoalCard(){
    const box=$('insGoalCard');
    if(!box) return;
    const m=calcMonth(curYear,curMonth);
    const latestWeight=last(m.weights);
    const avgWater=avg(m.waters);
    const avgSteps=avg(m.steps);
    const avgSleep=avg(m.sleeps);
    const rows=[];
    if(SAVINGS_GOALS.weight>0){
      const have=latestWeight;
      rows.push(goalRow('⚖️','Weight', have, SAVINGS_GOALS.weight, 'kg', true));
    }
    if(SAVINGS_GOALS.water>0) rows.push(goalRow('💧','Avg Water', avgWater, SAVINGS_GOALS.water, 'L', false));
    if(SAVINGS_GOALS.steps>0) rows.push(goalRow('👣','Avg Steps', avgSteps, SAVINGS_GOALS.steps, '', false));
    if(SAVINGS_GOALS.sleep>0) rows.push(goalRow('😴','Avg Sleep', avgSleep, SAVINGS_GOALS.sleep, 'hrs', false));
    box.innerHTML = rows.length
      ? cardHTML('<i class="fas fa-bullseye"></i> Goal Progress', rows.join(''))
      : cardHTML('<i class="fas fa-bullseye"></i> Goal Progress', '<div class="ins-empty">No goals set yet — add them in Settings → Goals</div>');
  }
  function goalRow(icon,label,have,target,unit,lowerIsBetter){
    if(have==null) return `<div class="ht-corr-row"><span class="ht-corr-label">${icon} ${label}</span><span style="color:var(--text-soft);font-size:.75rem">No data this month</span></div>`;
    const pct = target>0 ? Math.min(100,Math.round((lowerIsBetter? (1-Math.min(1,Math.abs(have-target)/Math.max(target,1))) : have/target)*100)) : 0;
    return `<div class="ht-corr-row"><span class="ht-corr-label">${icon} ${label}</span><div class="ht-corr-bar-track"><div class="ht-corr-bar-fill" style="width:${Math.max(4,pct)}%"></div></div><span class="ht-corr-val">${have.toFixed(1)}${unit?' '+unit:''}</span></div>`;
  }

  // ── MONTH VS LAST MONTH ─────────────────────────────────────
  function renderMonthComparison(){
    const box=$('insightList');
    if(!box) return;
    const cur=calcMonth(curYear,curMonth);
    const prev=getPrevMonth(curYear,curMonth);
    const prv=calcMonth(prev.y,prev.m);
    const rows=[];
    function cmp(label,icon,curArr,prevArr,unit,lowerBetter){
      const c=avg(curArr), p=avg(prevArr);
      if(c==null&&p==null) return;
      const diff = (c!=null&&p!=null) ? c-p : null;
      let diffHTML='<span style="color:var(--text-soft)">no prior data</span>';
      if(diff!=null){
        const good = lowerBetter ? diff<=0 : diff>=0;
        const arrow = diff>0?'▲':diff<0?'▼':'–';
        diffHTML=`<span style="color:${good?'var(--ht-normal,#059669)':'var(--ht-obese,#dc2626)'};font-weight:700">${arrow} ${Math.abs(diff).toFixed(1)}${unit}</span>`;
      }
      rows.push(`<div class="ht-corr-row"><span class="ht-corr-label">${icon} ${label}</span><span style="flex:1;font-size:.78rem">${c!=null?c.toFixed(1)+unit:'–'} this month</span>${diffHTML}</div>`);
    }
    cmp('Weight','⚖️',cur.weights,prv.weights,'kg',true);
    cmp('Sleep','😴',cur.sleeps,prv.sleeps,'h',false);
    cmp('Water','💧',cur.waters,prv.waters,'L',false);
    cmp('Steps','👣',cur.steps,prv.steps,'',false);
    box.innerHTML = rows.length ? rows.join('') : '<div class="ins-empty">Not enough data yet to compare months</div>';
  }

  // ── STREAKS TAB stats ────────────────────────────────────────
  function renderStreaksTabStats(){
    const log=computeLoggingStreak();
    const water=computeWaterStreak();
    const active=computeActiveDays();
    const meds=computeMedsAdherence();
    setText('insLogStreakVal', log.current+' days');
    setText('insLogStreakSub', 'Best ever: '+log.best+' days');
    setText('insWaterStreakVal', water.hasGoal?water.current+' days':'–');
    setText('insWaterStreakSub', water.hasGoal?'Best: '+water.best+' days':'No water goal set');
    setText('insActiveDaysVal', active+'/30');
    setText('insActiveDaysSub', 'Days with steps logged');
    setText('insMedsVal', meds==null?'–':meds+'%');
    setText('insMedsSub', meds==null?'No meds tracked yet':'Adherence, all-time');
  }
  function setText(id,txt){ const el=$(id); if(el) el.textContent=txt; }

  // ── HEATMAP (logging consistency, reuses .mti-hm-* CSS) ─────
  const WEEK_LABELS=['S','M','T','W','T','F','S'];
  function renderHeatmapCard(){
    const slot=$('mtiHeatmapCard');
    if(!slot) return;
    const days=daysInMonth(curYear,curMonth);
    const first=new Date(curYear,curMonth,1).getDay();
    const todayD = (curYear===new Date().getFullYear()&&curMonth===new Date().getMonth()) ? new Date().getDate() : -1;
    let cells=[];
    for(let i=0;i<first;i++) cells.push('<div class="mti-hm-cell mti-hm-blank" aria-hidden="true"></div>');
    let anyData=false;
    for(let d=1;d<=days;d++){
      const data=getDay(curYear,curMonth,d);
      const has=dayHasData(data);
      if(has) anyData=true;
      const dow=new Date(curYear,curMonth,d).getDay();
      const future = todayD===-1 ? (new Date(curYear,curMonth,d)>new Date()) : d>todayD;
      const lvl = has?4:0;
      const cls='mti-hm-cell mti-hm-l'+lvl+((dow===0||dow===6)?' mti-hm-we':'')+(d===todayD?' mti-hm-today':'')+(future?' mti-hm-future':'');
      const lab=MONTHS[curMonth]+' '+d+': '+(has?'logged':'not logged');
      cells.push(`<button type="button" class="${cls}" onclick="openDayQuickView(${curYear},${curMonth},${d})" aria-label="${esc(lab)}" title="${esc(lab)}"><span class="mti-hm-num">${d}</span></button>`);
    }
    const head=WEEK_LABELS.map((l,ix)=>`<div class="mti-hm-dow${(ix===0||ix===6)?' mti-hm-we':''}">${l}</div>`).join('');
    const body = anyData
      ? `<div class="mti-hm-grid">${head}${cells.join('')}</div><div class="ins-forecast-note">Filled = a day you logged something. Tap any day to view it.</div>`
      : `<div class="ins-empty">No days logged in ${MONTHS[curMonth]} yet.</div>`;
    slot.innerHTML=cardHTML(`<i class="fas fa-calendar-days"></i> Logging Heatmap — ${MONTHS[curMonth].slice(0,3)} ${curYear}`, body);
  }

  function renderMoodFreqCard(){
    const box=$('insMoodFreqCard');
    if(!box) return;
    const counts={};
    let total=0;
    allEntriesSorted().forEach(e=>{ if(e.data.mood){ counts[e.data.mood]=(counts[e.data.mood]||0)+1; total++; } });
    if(!total){ box.innerHTML=cardHTML('<i class="fas fa-face-smile"></i> Mood Frequency (all time)', '<div class="ins-empty">No moods logged yet</div>'); return; }
    const rows=MOODS.filter(mo=>counts[mo.id]).sort((a,b)=>(counts[b.id]||0)-(counts[a.id]||0)).map(mo=>{
      const pct=Math.round((counts[mo.id]/total)*100);
      return `<div class="ht-corr-row"><span class="ht-corr-label">${mo.icon} ${mo.label}</span><div class="ht-corr-bar-track"><div class="ht-corr-bar-fill" style="width:${Math.max(4,pct)}%"></div></div><span class="ht-corr-val">${pct}%</span></div>`;
    }).join('');
    box.innerHTML=cardHTML('<i class="fas fa-face-smile"></i> Mood Frequency (all time)', rows);
  }

  // ── TRENDS TAB ────────────────────────────────────────────────
  const TREND_METRICS=[
    {id:'weight',label:'Weight',icon:'⚖️',unit:'kg'},
    {id:'hr',label:'Heart Rate',icon:'❤️',unit:'bpm'},
    {id:'sugar',label:'Blood Sugar',icon:'🩹',unit:'mg/dL'},
    {id:'sleep',label:'Sleep',icon:'😴',unit:'hrs'},
    {id:'water',label:'Water',icon:'💧',unit:'L'},
    {id:'steps',label:'Steps',icon:'👣',unit:''},
  ];
  let _rollingChart=null;
  function renderMetricPicker(){
    const box=$('mtiMetricPicker');
    if(!box) return;
    box.innerHTML=TREND_METRICS.map(m=>`<button type="button" class="mti-metric-chip${m.id===activeTrendMetric?' active':''}" data-metric="${m.id}">${m.icon} ${m.label}</button>`).join('');
    box.querySelectorAll('[data-metric]').forEach(btn=>{
      btn.onclick=()=>{ activeTrendMetric=btn.dataset.metric; renderMetricPicker(); renderRollingTrend(); };
    });
  }
  function rollingAvg(values,window){
    return values.map((v,i)=>{
      const start=Math.max(0,i-window+1);
      const slice=values.slice(start,i+1).filter(x=>x!=null);
      return slice.length?slice.reduce((s,x)=>s+x,0)/slice.length:null;
    });
  }
  function last90DaysSeries(metricId){
    const entries=allEntriesSorted();
    const points=entries.map(e=>({key:dateKey(e.y,e.m,e.d),y:e.y,m:e.m,d:e.d,v:e.data[metricId]||null}))
      .filter(p=>p.v!=null && p.v>0);
    const cutoff=todayKey()-89*1; // rough; fine since keys aren't purely sequential but close enough for display window
    return points.slice(-90);
  }
  function renderRollingTrend(){
    const canvas=$('rollingTrendChart');
    if(!canvas) return;
    const metric=TREND_METRICS.find(m=>m.id===activeTrendMetric);
    const points=last90DaysSeries(activeTrendMetric);
    const empty=canvas.parentElement.querySelector('.chart-empty');
    if(!points.length || typeof Chart==='undefined'){
      canvas.style.display='none';
      if(!empty){ const d=document.createElement('div'); d.className='chart-empty'; d.textContent = points.length?'Chart library failed to load':'No data logged for this metric yet'; canvas.parentElement.appendChild(d); }
      return;
    }
    canvas.style.display='';
    if(empty) empty.remove();
    const labels=points.map(p=>`${MONTHS[p.m].slice(0,3)} ${p.d}`);
    const raw=points.map(p=>p.v);
    const rolling=rollingAvg(raw,7);
    _rollingChart=destroyChart(_rollingChart);
    _rollingChart=new Chart(canvas,{type:'line',data:{labels,datasets:[
      {label:metric.label+' (raw)',data:raw,borderColor:'rgba(15,118,110,.3)',pointRadius:1,tension:.2},
      {label:'7-day avg',data:rolling,borderColor:'#0f766e',borderWidth:2,pointRadius:0,tension:.3}
    ]},options:{responsive:true,plugins:{legend:{display:true,labels:{boxWidth:10,font:{size:10}}}}}});
  }
  function renderBestWorstMonths(){
    const box=$('insBestWorstCard');
    if(!box) return;
    const monthsWithData=[];
    for(let y=curYear-1;y<=curYear;y++){
      for(let mo=0;mo<12;mo++){
        if(y===curYear && mo>curMonth) continue;
        const mc=calcMonth(y,mo);
        const aw=avg(mc.weights);
        if(aw!=null) monthsWithData.push({y,mo,aw,steps:avg(mc.steps),sleep:avg(mc.sleeps)});
      }
    }
    if(monthsWithData.length<2){ box.innerHTML='<div class="ins-empty">Log at least two months to compare</div>'; return; }
    const bySteps=monthsWithData.filter(m=>m.steps!=null).sort((a,b)=>b.steps-a.steps);
    let html='';
    if(bySteps.length){
      const best=bySteps[0];
      html+=`<div class="ht-corr-row"><span class="ht-corr-label">👣 Most Active</span><span style="flex:1;font-size:.8rem">${MONTHS[best.mo]} ${best.y}</span><span class="ht-corr-val">${Math.round(best.steps)}</span></div>`;
    }
    const bySleep=monthsWithData.filter(m=>m.sleep!=null).sort((a,b)=>b.sleep-a.sleep);
    if(bySleep.length){
      const best=bySleep[0];
      html+=`<div class="ht-corr-row"><span class="ht-corr-label">😴 Best Sleep</span><span style="flex:1;font-size:.8rem">${MONTHS[best.mo]} ${best.y}</span><span class="ht-corr-val">${best.sleep.toFixed(1)}h</span></div>`;
    }
    box.innerHTML=html||'<div class="ins-empty">Not enough data yet</div>';
  }

  // ── FORECAST TAB ──────────────────────────────────────────────
  function renderForecastCard(){
    const box=$('insForecastCard');
    if(!box) return;
    if(!SAVINGS_GOALS.weight){ box.innerHTML='<div class="ins-empty">Set a target weight in Settings → Goals to see a forecast</div>'; return; }
    const points=allEntriesSorted().map(e=>({key:dateKey(e.y,e.m,e.d),v:e.data.weight||null})).filter(p=>p.v);
    if(points.length<3){ box.innerHTML='<div class="ins-empty">Log weight on at least 3 days to forecast a trend</div>'; return; }
    const recent=points.slice(-30);
    const n=recent.length;
    const xs=recent.map((_,i)=>i);
    const ys=recent.map(p=>p.v);
    const xMean=xs.reduce((s,x)=>s+x,0)/n, yMean=ys.reduce((s,y)=>s+y,0)/n;
    let num=0,den=0;
    for(let i=0;i<n;i++){ num+=(xs[i]-xMean)*(ys[i]-yMean); den+=(xs[i]-xMean)**2; }
    const slope = den!==0 ? num/den : 0;
    const current=ys[ys.length-1];
    const target=SAVINGS_GOALS.weight;
    const diff=target-current;
    let html='';
    if(Math.abs(diff)<0.2){
      html=`<div class="ins-forecast-note" style="color:var(--ht-normal,#059669);font-weight:700"><i class="fas fa-circle-check"></i> You're at your goal weight (${current.toFixed(1)} kg)</div>`;
    } else if(Math.sign(slope)!==0 && Math.sign(slope)===Math.sign(diff)){
      const daysToGoal=Math.abs(diff/slope);
      const projDate=new Date(); projDate.setDate(projDate.getDate()+Math.round(daysToGoal));
      html=`<div class="ht-corr-row"><span class="ht-corr-label">Current</span><span class="ht-corr-val">${current.toFixed(1)} kg</span></div>
        <div class="ht-corr-row"><span class="ht-corr-label">Target</span><span class="ht-corr-val">${target} kg</span></div>
        <div class="ht-corr-row"><span class="ht-corr-label">Trend</span><span class="ht-corr-val">${slope>=0?'+':''}${(slope*7).toFixed(2)} kg/wk</span></div>
        <div class="ins-forecast-note">At this pace, projected to reach your goal around <strong>${projDate.toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'})}</strong> (~${Math.round(daysToGoal)} days).</div>`;
    } else {
      html=`<div class="ht-corr-row"><span class="ht-corr-label">Current</span><span class="ht-corr-val">${current.toFixed(1)} kg</span></div>
        <div class="ht-corr-row"><span class="ht-corr-label">Target</span><span class="ht-corr-val">${target} kg</span></div>
        <div class="ins-forecast-note">Your recent trend isn't moving toward your goal yet — no reliable forecast.</div>`;
    }
    box.innerHTML=html;
  }

  function pearson(xs,ys){
    const n=xs.length;
    if(n<3) return null;
    const xMean=xs.reduce((s,x)=>s+x,0)/n, yMean=ys.reduce((s,y)=>s+y,0)/n;
    let num=0,dx=0,dy=0;
    for(let i=0;i<n;i++){ num+=(xs[i]-xMean)*(ys[i]-yMean); dx+=(xs[i]-xMean)**2; dy+=(ys[i]-yMean)**2; }
    const den=Math.sqrt(dx*dy);
    return den===0?null:num/den;
  }
  function moodToScore(mood){
    const idx=MOODS.findIndex(m=>m.id===mood);
    return idx===-1?null:(MOODS.length-idx); // great=5 ... bad=1
  }
  function renderCorrelation(boxId,titleHTML,metricAId,metricAIsMood,metricBId,metricBIsMood,note){
    const box=$(boxId);
    if(!box) return;
    const entries=allEntriesSorted();
    const xs=[],ys=[];
    entries.forEach(e=>{
      const a=metricAIsMood?moodToScore(e.data[metricAId]):(e.data[metricAId]||null);
      const b=metricBIsMood?moodToScore(e.data[metricBId]):(e.data[metricBId]||null);
      if(a!=null&&a>0&&b!=null&&b>0){ xs.push(a); ys.push(b); }
    });
    const r=pearson(xs,ys);
    if(r==null){ box.innerHTML=cardHTML(titleHTML, `<div class="ins-empty">Need more overlapping data (at least 3 days with both logged)</div>`); return; }
    const strength=Math.abs(r)>=0.5?'strong':Math.abs(r)>=0.25?'moderate':'weak';
    const direction=r>0?'positive':'negative';
    const pct=Math.round(Math.abs(r)*100);
    const body=`<div class="ht-corr-row"><span class="ht-corr-label">Correlation</span><div class="ht-corr-bar-track"><div class="ht-corr-bar-fill" style="width:${Math.max(4,pct)}%"></div></div><span class="ht-corr-val">${r.toFixed(2)}</span></div>
      <div class="ins-forecast-note">${xs.length} overlapping days · ${strength} ${direction} relationship. ${note||''}</div>`;
    box.innerHTML=cardHTML(titleHTML, body);
  }
  function renderCorrelations(){
    renderCorrelation('insCorrSleepMoodCard','<i class="fas fa-moon"></i> Sleep vs Mood','sleep',false,'mood',true,'Higher sleep hours vs. a higher mood score.');
    renderCorrelation('insCorrWaterWeightCard','<i class="fas fa-droplet"></i> Water vs Weight','water',false,'weight',false,'');
    renderCorrelation('insCorrStepsSleepCard','<i class="fas fa-person-running"></i> Steps vs Sleep','steps',false,'sleep',false,'');
  }

  // ── MAIN RENDER ────────────────────────────────────────────────
  window.renderInsightsTab = function renderInsightsTab(){
    $('insightsSubtitle') && ($('insightsSubtitle').textContent = MONTHS[curMonth]+' '+curYear);
    renderTabBar();
    applyPaneVisibility();
    if(activeInsightsTab==='overview'){
      renderTips();
      renderStreakGlanceCard();
      renderGoalCard();
      renderMonthComparison();
    } else if(activeInsightsTab==='streaks'){
      renderStreaksTabStats();
      renderHeatmapCard();
      renderMoodFreqCard();
    } else if(activeInsightsTab==='trends'){
      renderMetricPicker();
      renderRollingTrend();
      renderBestWorstMonths();
    } else if(activeInsightsTab==='forecast'){
      renderForecastCard();
      renderCorrelations();
    }
  };
})();
