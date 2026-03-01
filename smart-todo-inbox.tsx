import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Mic, MicOff, Check, Trash2, Send, Inbox, AlertTriangle, Layers, Sparkles, ChevronDown, ChevronRight, ChevronLeft, X, RotateCw, Copy, Zap, FileText, Calendar, Timer, Edit3, CalendarPlus, Bell, CalendarDays, CheckSquare, Clock3, Settings } from "lucide-react";
import _ from "lodash";

const C = {
  bg:'#0d0515',s:'#1a0e2e',s2:'#251540',b:'#3d2560',
  t:'#faf5ff',t2:'#c4b5d0',t3:'#8b7a9e',
  a:'#a855f7',a2:'#c084fc',
  high:'#f43f5e',medium:'#e879a0',low:'#d946ef',
  cats:['#a855f7','#ec4899','#d946ef','#f472b6','#c084fc','#e879a0','#a78bfa','#f9a8d4'],
  gcal:'#c084fc'
};
const PL={high:'Hoch',medium:'Mittel',low:'Niedrig'};
const PRIO_ORDER={high:0,medium:1,low:2};
const TIME_OPTS=[0.25,0.5,1,1.5,2,3,4,6,8];
const REMINDER_OPTS=[{value:0,label:'Zum Zeitpunkt'},{value:5,label:'5 min'},{value:10,label:'10 min'},{value:15,label:'15 min'},{value:30,label:'30 min'},{value:60,label:'1h'},{value:1440,label:'1 Tag'}];
const CAL_TYPES={
  timeblock:{label:'Zeitblock',icon:Clock3,hasTime:true,hasReminder:true},
  allday:{label:'Ganztag',icon:CalendarDays,hasTime:false,hasReminder:true},
  reminder:{label:'Reminder',icon:Bell,hasTime:false,hasReminder:false},
  todo:{label:'To Do',icon:CheckSquare,hasTime:false,hasReminder:false}
};
const DAYS_LABELS=['Mo','Di','Mi','Do','Fr'];
const fmtH=h=>h<1?Math.round(h*60)+'min':h%1===0?h+'h':Math.floor(h)+'h '+Math.round((h%1)*60)+'min';
const pad2=n=>String(n).padStart(2,'0');
const fmtTime=h=>pad2(Math.floor(h))+':'+pad2(Math.round((h%1)*60));
const ds=d=>d.getFullYear()+'-'+pad2(d.getMonth()+1)+'-'+pad2(d.getDate());
const catCol=(cat,all)=>{const i=all.indexOf(cat);return C.cats[i>=0?i%C.cats.length:0];};

function getKW(d){const date=new Date(d),tmp=new Date(date.getTime());tmp.setHours(0,0,0,0);tmp.setDate(tmp.getDate()+3-(tmp.getDay()+6)%7);const w1=new Date(tmp.getFullYear(),0,4);return{week:1+Math.round(((tmp.getTime()-w1.getTime())/86400000-3+(w1.getDay()+6)%7)/7),year:tmp.getFullYear()};}

function getWeekWorkdays(y,w){const j=new Date(y,0,4),d=new Date(j.getTime());d.setDate(d.getDate()-((j.getDay()+6)%7)+(w-1)*7);let t=0;for(let i=0;i<7;i++){const day=new Date(d);day.setDate(d.getDate()+i);if(day.getDay()>=1&&day.getDay()<=5)t++;}return t;}

function getMondayOfWeek(y,w){const j=new Date(y,0,4),d=new Date(j.getTime());d.setDate(d.getDate()-((j.getDay()+6)%7)+(w-1)*7);return d;}

function getFriday(mon){const f=new Date(mon);f.setDate(mon.getDate()+4);return f;}

function sortTasks(arr){return _.sortBy(arr,[t=>t.deadline?new Date(t.deadline).getTime():Infinity,t=>PRIO_ORDER[t.priority]||2]);}

function scheduleTasksForWeek(tasks,monday){
  const monStr=ds(monday),friStr=ds(getFriday(monday));
  const days=[];
  for(let i=0;i<5;i++){const d=new Date(monday);d.setDate(monday.getDate()+i);days.push({date:ds(d),slots:[],usedH:0,reminders:[],isAllday:false});}
  const active=tasks.filter(t=>!t.completed);
  const nowKW=getKW(new Date()),viewKW=getKW(monday),isCur=nowKW.year===viewKW.year&&nowKW.week===viewKW.week;
  const inWeek=t=>{if(t.deadline){const dl=t.deadline.slice(0,10);return dl>=monStr&&dl<=friStr;}return isCur;};
  const wt=active.filter(inWeek);

  sortTasks(wt.filter(t=>t.calendarType==='allday')).forEach(t=>{
    const td=t.deadline?t.deadline.slice(0,10):null;
    const day=td?days.find(d=>d.date===td):days.find(d=>!d.isAllday&&d.usedH===0);
    if(day&&!day.isAllday){day.slots.push({task:t,startH:8,endH:17,type:'allday'});day.usedH=8;day.isAllday=true;}
  });
  sortTasks(wt.filter(t=>t.calendarType==='reminder')).forEach(t=>{
    const td=t.deadline?t.deadline.slice(0,10):null;
    const day=td?days.find(d=>d.date===td):days[0];
    if(day)day.reminders.push({task:t,startH:10});
  });
  sortTasks(wt.filter(t=>t.calendarType==='timeblock')).forEach(t=>{
    const h=t.estimatedHours||1;let tds=[...days];
    if(t.deadline){const di=days.findIndex(d=>d.date===t.deadline.slice(0,10));if(di>=0)tds=[...days.slice(0,di+1).reverse(),...days.slice(di+1)];}
    for(const day of tds){if(!day.isAllday&&day.usedH+h<=8){const s=8+day.usedH;day.slots.push({task:t,startH:s,endH:s+h,type:'timeblock'});day.usedH+=h;break;}}
  });
  return{days,unscheduledTodos:sortTasks(wt.filter(t=>t.calendarType==='todo'))};
}

/* --- Popover --- */
function CalPopover({task,pos,onClose,onUpdate,onDelete,onToggle,allCats}){
  const [data,setData]=useState({...task});
  const ref=useRef(null);
  useEffect(()=>{const h=e=>{if(ref.current&&!ref.current.contains(e.target))onClose();};document.addEventListener('mousedown',h);return()=>document.removeEventListener('mousedown',h);},[onClose]);
  const save=()=>{onUpdate(data);onClose();};
  const cc=catCol(data.category,allCats);
  return(
    <div ref={ref} onClick={e=>e.stopPropagation()} style={{position:'fixed',top:pos.y,left:pos.x,zIndex:1000,width:280,background:C.s,border:'1px solid '+C.b,borderRadius:12,padding:14,boxShadow:'0 8px 32px #000a',maxHeight:'80vh',overflowY:'auto'}}>
      <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:10}}>
        <div style={{width:10,height:10,borderRadius:3,background:cc,flexShrink:0}}/>
        <input value={data.title} onChange={e=>setData({...data,title:e.target.value})} style={{flex:1,background:C.s2,border:'1px solid '+C.b+'44',borderRadius:6,padding:'5px 8px',color:C.t,fontSize:13,fontWeight:600,outline:'none'}}/>
        <button onClick={onClose} style={{background:'none',border:'none',cursor:'pointer',color:C.t3,padding:0}}><X size={14}/></button>
      </div>
      <div style={{display:'flex',gap:3,marginBottom:8}}>
        {['high','medium','low'].map(p=><button key={p} onClick={()=>setData({...data,priority:p})} style={{flex:1,padding:'4px',borderRadius:5,border:'2px solid '+(data.priority===p?C[p]:C.b+'44'),background:data.priority===p?C[p]+'22':'transparent',color:data.priority===p?C[p]:C.t3,cursor:'pointer',fontSize:10,fontWeight:600}}>{PL[p]}</button>)}
      </div>
      <div style={{display:'flex',gap:3,marginBottom:8}}>
        {Object.entries(CAL_TYPES).map(function([k,v]){var I=v.icon;return <button key={k} onClick={function(){var u={calendarType:k};if(k==='allday')u.estimatedHours=8;if(k==='reminder'||k==='todo')u.estimatedHours=0;setData(Object.assign({},data,u));}} style={{flex:1,padding:'4px 2px',borderRadius:5,border:'2px solid '+(data.calendarType===k?C.gcal:C.b+'44'),background:data.calendarType===k?C.gcal+'22':'transparent',color:data.calendarType===k?C.gcal:C.t3,cursor:'pointer',fontSize:9,fontWeight:600,display:'flex',alignItems:'center',justifyContent:'center',gap:2}}><I size={9}/>{v.label}</button>;})}
      </div>
      <div style={{display:'flex',gap:6,marginBottom:8}}>
        <div style={{flex:1}}>
          <label style={{fontSize:10,color:C.t3,fontWeight:600,display:'block',marginBottom:2}}>Deadline</label>
          <input type="date" value={data.deadline?data.deadline.slice(0,10):''} onChange={e=>setData({...data,deadline:e.target.value||null})} style={{width:'100%',background:C.s2,border:'1px solid '+C.b+'44',borderRadius:5,padding:'4px 6px',color:C.t,fontSize:11,boxSizing:'border-box'}}/>
        </div>
        {data.calendarType==='timeblock'&&<div style={{flex:1}}>
          <label style={{fontSize:10,color:C.t3,fontWeight:600,display:'block',marginBottom:2}}>Dauer</label>
          <select value={data.estimatedHours} onChange={e=>setData({...data,estimatedHours:parseFloat(e.target.value)})} style={{width:'100%',background:C.s2,border:'1px solid '+C.b+'44',borderRadius:5,padding:'4px 6px',color:C.t,fontSize:11,boxSizing:'border-box'}}>{TIME_OPTS.map(h=><option key={h} value={h}>{fmtH(h)}</option>)}</select>
        </div>}
      </div>
      <div style={{marginBottom:8}}>
        <label style={{fontSize:10,color:C.t3,fontWeight:600,display:'block',marginBottom:2}}>Kategorie</label>
        <input list="pop-cat" value={data.category} onChange={e=>setData({...data,category:e.target.value})} style={{width:'100%',background:C.s2,border:'1px solid '+C.b+'44',borderRadius:5,padding:'4px 6px',color:C.t,fontSize:11,boxSizing:'border-box'}}/>
        <datalist id="pop-cat">{allCats.map(c=><option key={c} value={c}/>)}</datalist>
      </div>
      {data.subtasks&&data.subtasks.length>0&&<div style={{marginBottom:8}}>{data.subtasks.map(function(s,i){return <div key={i} style={{fontSize:10,color:C.t3,padding:'1px 0 1px 8px',borderLeft:'2px solid '+C.b}}>{s}</div>;})}</div>}
      <div style={{display:'flex',gap:6,justifyContent:'space-between',marginTop:4}}>
        <div style={{display:'flex',gap:4}}>
          <button onClick={function(){onToggle(data.id);onClose();}} style={{background:C.a+'22',border:'none',borderRadius:6,padding:'5px 10px',cursor:'pointer',color:C.a,fontSize:10,fontWeight:600,display:'flex',alignItems:'center',gap:3}}><Check size={10}/> Erledigt</button>
          <button onClick={function(){onDelete(data.id);onClose();}} style={{background:C.high+'22',border:'none',borderRadius:6,padding:'5px 10px',cursor:'pointer',color:C.high,fontSize:10,fontWeight:600,display:'flex',alignItems:'center',gap:3}}><Trash2 size={10}/></button>
        </div>
        <button onClick={save} style={{background:C.a,border:'none',borderRadius:6,padding:'5px 14px',cursor:'pointer',color:'#fff',fontSize:10,fontWeight:600}}>Speichern</button>
      </div>
    </div>
  );
}

/* --- Calendar Cell --- */
function CalCell({day,h,startH,endH,allCats,onClickTask,hourH}){
  const slotsHere=day.slots.filter(function(s){return s.type==='allday'||(s.startH<=h&&s.endH>h);});
  const remHere=day.reminders.filter(function(r){return Math.floor(r.startH)===h;});
  const slotStart=slotsHere.find(function(s){return s.type!=='allday'&&Math.floor(s.startH)===h;});
  const alldaySlot=h===startH?slotsHere.find(function(s){return s.type==='allday';}):null;

  var alldayEl=null;
  if(alldaySlot){
    var cc=catCol(alldaySlot.task.category,allCats);
    alldayEl=<div onClick={function(e){onClickTask(alldaySlot.task,e);}} style={{position:'absolute',top:2,left:2,right:2,height:(endH-startH)*hourH-4,background:cc+'25',border:'1px solid '+cc+'44',borderRadius:6,padding:'4px 6px',cursor:'pointer',zIndex:2,overflow:'hidden'}}>
      <div style={{fontSize:10,color:cc,fontWeight:700}}>{alldaySlot.task.title}</div>
      <div style={{fontSize:8,color:cc+'aa',marginTop:1}}>Ganztag · {alldaySlot.task.category}</div>
    </div>;
  }

  var slotEl=null;
  if(!alldaySlot&&slotStart){
    var scc=catCol(slotStart.task.category,allCats);
    var span=slotStart.endH-slotStart.startH;
    var top=(slotStart.startH-h)*hourH;
    slotEl=<div onClick={function(e){onClickTask(slotStart.task,e);}} style={{position:'absolute',top:top+2,left:2,right:2,height:span*hourH-4,background:scc+'25',border:'1px solid '+scc+'44',borderRadius:6,padding:'4px 6px',cursor:'pointer',zIndex:2,overflow:'hidden'}}>
      <div style={{fontSize:10,color:scc,fontWeight:700,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{slotStart.task.title}</div>
      <div style={{fontSize:8,color:scc+'aa',marginTop:1}}>{fmtTime(slotStart.startH)}–{fmtTime(slotStart.endH)} · {slotStart.task.category}</div>
    </div>;
  }

  var remEls=remHere.map(function(r,ri){
    return <div key={ri} onClick={function(e){onClickTask(r.task,e);}} style={{position:'absolute',top:2,left:2,right:2,height:hourH-4,background:C.a+'20',border:'2px dashed '+C.a+'66',borderRadius:6,padding:'4px 6px',cursor:'pointer',zIndex:3,overflow:'hidden'}}>
      <div style={{display:'flex',alignItems:'center',gap:3}}><Bell size={9} color={C.a}/><span style={{fontSize:10,color:C.a,fontWeight:700}}>{r.task.title}</span></div>
      <div style={{fontSize:8,color:C.a+'aa',marginTop:1}}>10:00 Reminder</div>
    </div>;
  });

  return <div style={{background:C.bg,height:hourH,borderTop:'1px solid '+C.b+'11',borderLeft:'1px solid '+C.b+'11',position:'relative',overflow:'visible'}}>
    {alldayEl}
    {slotEl}
    {remEls}
  </div>;
}

/* --- Calendar View --- */
function CalendarView({tasks,allCats,onUpdate,onDelete,onToggle}){
  const [weekOffset,setWeekOffset]=useState(0);
  const [popover,setPopover]=useState(null);
  const nowKW=getKW(new Date());
  const viewWeek=nowKW.week+weekOffset;
  const monday=useMemo(function(){return getMondayOfWeek(nowKW.year,viewWeek);},[nowKW.year,viewWeek]);
  const friday=useMemo(function(){return getFriday(monday);},[monday]);
  const result=useMemo(function(){return scheduleTasksForWeek(tasks,monday);},[tasks,monday]);
  const sched=result.days;
  const unscheduledTodos=result.unscheduledTodos;
  const HOUR_H=48,START_H=8,END_H=18;
  var hours=[];for(var i=START_H;i<END_H;i++)hours.push(i);

  function openPopover(task,e){
    e.stopPropagation();
    var rect=e.currentTarget.getBoundingClientRect();
    var x=rect.right+8,y=rect.top;
    if(x+290>window.innerWidth)x=rect.left-290;
    if(x<4)x=4;
    if(y+350>window.innerHeight)y=window.innerHeight-360;
    if(y<4)y=4;
    setPopover({task:task,pos:{x:x,y:y}});
  }

  /* Build grid cells as flat array */
  var gridCells=[];
  hours.forEach(function(h){
    gridCells.push(<div key={'t'+h} style={{background:C.bg,padding:'2px 4px 2px 0',height:HOUR_H,display:'flex',alignItems:'flex-start',justifyContent:'flex-end',borderTop:'1px solid '+C.b+'11'}}><span style={{fontSize:9,color:C.t3}}>{pad2(h)}:00</span></div>);
    sched.forEach(function(day,di){
      gridCells.push(<CalCell key={h+'-'+di} day={day} h={h} startH={START_H} endH={END_H} allCats={allCats} onClickTask={openPopover} hourH={HOUR_H}/>);
    });
  });

  /* Header cells */
  var headerCells=[<div key="hc" style={{background:C.s,padding:'8px 4px',borderBottom:'1px solid '+C.b+'22'}}/>];
  sched.forEach(function(day,i){
    var d=new Date(monday);d.setDate(monday.getDate()+i);
    var isT=ds(d)===ds(new Date());
    headerCells.push(<div key={'hd'+i} style={{background:C.s,padding:'8px 4px',textAlign:'center',borderBottom:'1px solid '+C.b+'22',borderLeft:'1px solid '+C.b+'11'}}>
      <div style={{fontSize:10,color:C.t3,fontWeight:600}}>{DAYS_LABELS[i]}</div>
      <div style={{fontSize:13,fontWeight:700,color:isT?C.a:C.t,width:24,height:24,borderRadius:12,background:isT?C.a+'22':'transparent',display:'inline-flex',alignItems:'center',justifyContent:'center'}}>{d.getDate()}</div>
      <div style={{fontSize:9,color:day.usedH>=8?C.high:C.t3,marginTop:1}}>{fmtH(day.usedH)}/8h</div>
    </div>);
  });

  var todoEls=unscheduledTodos.map(function(t){
    var cc=catCol(t.category,allCats);
    return <div key={t.id} onClick={function(e){openPopover(t,e);}} style={{background:C.s,border:'1px solid '+C.b+'22',borderRadius:8,padding:'5px 10px',cursor:'pointer',fontSize:11,color:C.t2,display:'flex',alignItems:'center',gap:4}}>
      <div style={{width:6,height:6,borderRadius:2,background:cc}}/>{t.title}
    </div>;
  });

  return(
    <div>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12}}>
        <button onClick={function(){setWeekOffset(weekOffset-1);}} style={{background:C.s,border:'1px solid '+C.b+'22',borderRadius:8,padding:'6px 10px',cursor:'pointer',color:C.t2}}><ChevronLeft size={14}/></button>
        <div style={{textAlign:'center'}}>
          <span style={{fontSize:14,fontWeight:700,color:C.t}}>KW {viewWeek}</span>
          <div style={{fontSize:10,color:C.t3}}>{monday.toLocaleDateString('de-DE',{day:'numeric',month:'short'})} – {friday.toLocaleDateString('de-DE',{day:'numeric',month:'short',year:'numeric'})}</div>
        </div>
        <div style={{display:'flex',gap:4}}>
          {weekOffset!==0&&<button onClick={function(){setWeekOffset(0);}} style={{background:C.a+'22',border:'1px solid '+C.a+'44',borderRadius:8,padding:'6px 10px',cursor:'pointer',color:C.a,fontSize:10,fontWeight:600}}>Heute</button>}
          <button onClick={function(){setWeekOffset(weekOffset+1);}} style={{background:C.s,border:'1px solid '+C.b+'22',borderRadius:8,padding:'6px 10px',cursor:'pointer',color:C.t2}}><ChevronRight size={14}/></button>
        </div>
      </div>

      <div style={{display:'grid',gridTemplateColumns:'40px repeat(5, 1fr)',gap:0,borderRadius:12,overflow:'hidden',border:'1px solid '+C.b+'22'}}>
        {headerCells}
        {gridCells}
      </div>

      {unscheduledTodos.length>0&&<div style={{marginTop:16}}>
        <div style={{fontSize:11,color:C.t3,fontWeight:600,marginBottom:6,display:'flex',alignItems:'center',gap:4}}><CheckSquare size={12}/> Backlog ({unscheduledTodos.length})</div>
        <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>{todoEls}</div>
      </div>}

      {popover&&<CalPopover task={popover.task} pos={popover.pos} onClose={function(){setPopover(null);}} onUpdate={onUpdate} onDelete={onDelete} onToggle={onToggle} allCats={allCats}/>}
    </div>
  );
}

/* --- MetaEditor --- */
function MetaEditor({data,onChange,onConfirm,onCancel,existingCats}){
  var ct=CAL_TYPES[data.calendarType]||CAL_TYPES.timeblock;
  const [newTag,setNewTag]=useState('');
  function hCT(k){var u={calendarType:k};if(k==='allday')u.estimatedHours=8;if(k==='reminder'||k==='todo')u.estimatedHours=0;if(!CAL_TYPES[k].hasReminder)u.reminderEnabled=false;onChange(Object.assign({},data,u));}
  function addTag(){if(!newTag.trim())return;onChange({...data,tags:[...(data.tags||[]),newTag.trim()]});setNewTag('');}
  function rmTag(i){onChange({...data,tags:(data.tags||[]).filter(function(_,idx){return idx!==i;})});}
  function upSub(i,v){var s=[...(data.subtasks||[])];s[i]=v;onChange({...data,subtasks:s});}
  function rmSub(i){onChange({...data,subtasks:(data.subtasks||[]).filter(function(_,idx){return idx!==i;})});}
  function addSub(){onChange({...data,subtasks:[...(data.subtasks||[]),'']});}

  return(
    <div id="meta-editor" style={{background:C.s,border:'2px solid '+C.a+'44',borderRadius:14,padding:16,marginBottom:12}}>
      <input value={data.title} onChange={function(e){onChange({...data,title:e.target.value});}} style={{width:'100%',background:C.s2,border:'1px solid '+C.b+'44',borderRadius:8,padding:'8px 10px',color:C.t,fontSize:14,fontWeight:600,boxSizing:'border-box',marginBottom:12}}/>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:12}}>
        <div>
          <label style={{fontSize:11,color:C.t3,fontWeight:600,display:'block',marginBottom:4}}>Priorität</label>
          <div style={{display:'flex',gap:4}}>
            {['high','medium','low'].map(function(p){return <button key={p} onClick={function(){onChange({...data,priority:p});}} style={{flex:1,padding:'6px 2px',borderRadius:6,border:'2px solid '+(data.priority===p?C[p]:C.b+'44'),background:data.priority===p?C[p]+'22':'transparent',color:data.priority===p?C[p]:C.t3,cursor:'pointer',fontSize:11,fontWeight:600}}>{PL[p]}</button>;})}
          </div>
        </div>
        <div>
          <label style={{fontSize:11,color:C.t3,fontWeight:600,display:'block',marginBottom:4}}>Deadline</label>
          <input type="date" value={data.deadline?data.deadline.slice(0,10):''} onChange={function(e){onChange({...data,deadline:e.target.value||null});}} style={{width:'100%',background:C.s2,border:'1px solid '+C.b+'44',borderRadius:6,padding:'5px 8px',color:C.t,fontSize:12,boxSizing:'border-box'}}/>
        </div>
      </div>
      <div style={{marginBottom:12}}>
        <label style={{fontSize:11,color:C.t3,fontWeight:600,display:'block',marginBottom:4}}>Kalender-Typ</label>
        <div style={{display:'flex',gap:4}}>
          {Object.entries(CAL_TYPES).map(function([k,v]){var I=v.icon;return <button key={k} onClick={function(){hCT(k);}} style={{flex:1,padding:'6px 4px',borderRadius:6,border:'2px solid '+(data.calendarType===k?C.gcal:C.b+'44'),background:data.calendarType===k?C.gcal+'22':'transparent',color:data.calendarType===k?C.gcal:C.t3,cursor:'pointer',fontSize:10,fontWeight:600,display:'flex',alignItems:'center',justifyContent:'center',gap:3}}><I size={11}/>{v.label}</button>;})}
        </div>
      </div>
      <div style={{display:'flex',gap:10,marginBottom:12}}>
        {data.calendarType==='timeblock'&&<div style={{flex:1}}><label style={{fontSize:11,color:C.t3,fontWeight:600,display:'block',marginBottom:4}}>Zeitaufwand</label><select value={data.estimatedHours} onChange={function(e){onChange({...data,estimatedHours:parseFloat(e.target.value)});}} style={{width:'100%',background:C.s2,border:'1px solid '+C.b+'44',borderRadius:6,padding:'5px 8px',color:C.t,fontSize:12,boxSizing:'border-box'}}>{TIME_OPTS.map(function(h){return <option key={h} value={h}>{fmtH(h)}</option>;})}</select></div>}
        {data.calendarType==='allday'&&<div style={{flex:1}}><label style={{fontSize:11,color:C.t3,fontWeight:600,display:'block',marginBottom:4}}>Zeitaufwand</label><div style={{padding:'5px 8px',background:C.s2,border:'1px solid '+C.b+'44',borderRadius:6,color:C.t2,fontSize:12}}>8h (Ganztag)</div></div>}
        {ct.hasReminder&&<div style={{flex:1}}><label style={{fontSize:11,color:C.t3,fontWeight:600,display:'flex',alignItems:'center',gap:4,marginBottom:4}}><input type="checkbox" checked={!!data.reminderEnabled} onChange={function(e){onChange({...data,reminderEnabled:e.target.checked,reminderMinutes:data.reminderMinutes||10});}} style={{accentColor:C.a}}/>Erinnerung</label>{data.reminderEnabled&&<select value={data.reminderMinutes||10} onChange={function(e){onChange({...data,reminderMinutes:parseInt(e.target.value)});}} style={{width:'100%',background:C.s2,border:'1px solid '+C.b+'44',borderRadius:6,padding:'5px 8px',color:C.t,fontSize:12,boxSizing:'border-box'}}>{REMINDER_OPTS.map(function(r){return <option key={r.value} value={r.value}>{r.label}</option>;})}</select>}</div>}
      </div>
      <div style={{marginBottom:12}}><label style={{fontSize:11,color:C.t3,fontWeight:600,display:'block',marginBottom:4}}>Kategorie</label><input list="cat-list" value={data.category} onChange={function(e){onChange({...data,category:e.target.value});}} style={{width:'100%',background:C.s2,border:'1px solid '+C.b+'44',borderRadius:6,padding:'5px 8px',color:C.t,fontSize:12,boxSizing:'border-box'}}/><datalist id="cat-list">{existingCats.map(function(c){return <option key={c} value={c}/>;})}</datalist></div>
      <div style={{marginBottom:12}}>
        <label style={{fontSize:11,color:C.t3,fontWeight:600,display:'block',marginBottom:4}}>Tags</label>
        <div style={{display:'flex',gap:4,flexWrap:'wrap',marginBottom:6}}>{(data.tags||[]).map(function(tag,i){return <span key={i} style={{fontSize:11,padding:'2px 6px',borderRadius:99,background:C.s2,color:C.t3,display:'flex',alignItems:'center',gap:3}}>#{tag}<button onClick={function(){rmTag(i);}} style={{background:'none',border:'none',cursor:'pointer',color:C.t3,padding:0,fontSize:13}}>×</button></span>;})}</div>
        <div style={{display:'flex',gap:4}}><input value={newTag} onChange={function(e){setNewTag(e.target.value);}} onKeyDown={function(e){if(e.key==='Enter'){e.preventDefault();addTag();}}} placeholder="Tag..." style={{flex:1,background:C.s2,border:'1px solid '+C.b+'44',borderRadius:6,padding:'4px 8px',color:C.t,fontSize:11,outline:'none'}}/><button onClick={addTag} style={{background:C.a+'33',border:'none',borderRadius:6,padding:'4px 8px',cursor:'pointer',color:C.a,fontSize:11}}>+</button></div>
      </div>
      <div style={{marginBottom:12}}>
        <label style={{fontSize:11,color:C.t3,fontWeight:600,display:'flex',alignItems:'center',gap:4,marginBottom:4}}>Notizen / Teilschritte<button onClick={addSub} style={{background:C.a+'33',border:'none',borderRadius:4,padding:'1px 5px',cursor:'pointer',color:C.a,fontSize:11}}>+</button></label>
        {(data.subtasks||[]).map(function(st,i){return <div key={i} style={{display:'flex',gap:4,alignItems:'center',marginBottom:3}}><div style={{width:2,height:20,background:C.b,borderRadius:1,flexShrink:0}}/><input value={st} onChange={function(e){upSub(i,e.target.value);}} style={{flex:1,background:C.s2,border:'1px solid '+C.b+'44',borderRadius:6,padding:'4px 8px',color:C.t,fontSize:12,outline:'none'}}/><button onClick={function(){rmSub(i);}} style={{background:'none',border:'none',cursor:'pointer',color:C.t3,padding:0,fontSize:14}}>×</button></div>;})}
      </div>
      <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}><button onClick={onCancel} style={{padding:'6px 16px',borderRadius:8,border:'1px solid '+C.b+'44',background:'transparent',color:C.t3,cursor:'pointer',fontSize:12}}>Abbrechen</button><button onClick={onConfirm} style={{padding:'6px 16px',borderRadius:8,border:'none',background:C.a,color:'#fff',cursor:'pointer',fontSize:12,fontWeight:600}}>Speichern</button></div>
    </div>
  );
}

/* --- TaskCard --- */
function TaskCard({task,onToggle,onDelete,onEdit,onCalendar,allCats}){
  var cc=catCol(task.category,allCats);var CT=CAL_TYPES[task.calendarType]||CAL_TYPES.timeblock;var CTIcon=CT.icon;var showTime=task.calendarType==='timeblock'||task.calendarType==='allday';
  return <div style={{background:C.s,border:'1px solid '+C.b+'22',borderRadius:12,padding:'10px 12px',marginBottom:5,opacity:task.completed?0.4:1}}>
    <div style={{display:'flex',alignItems:'flex-start',gap:8}}>
      <button onClick={function(){onToggle(task.id);}} style={{width:18,height:18,borderRadius:5,border:'2px solid '+(task.completed?C.a:C.b),background:task.completed?C.a:'transparent',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,marginTop:2}}>{task.completed&&<Check size={10} color="#fff"/>}</button>
      <div style={{flex:1,minWidth:0}}>
        <span style={{color:task.completed?C.t3:C.t,textDecoration:task.completed?'line-through':'none',fontSize:13,fontWeight:500}}>{task.title}</span>
        <div style={{display:'flex',gap:4,marginTop:5,flexWrap:'wrap',alignItems:'center'}}>
          <span style={{fontSize:10,padding:'1px 7px',borderRadius:99,background:cc+'20',color:cc,fontWeight:600}}>{task.category}</span>
          <span style={{fontSize:10,padding:'1px 7px',borderRadius:99,background:C[task.priority]+'20',color:C[task.priority],fontWeight:600}}>{PL[task.priority]}</span>
          <span style={{fontSize:10,padding:'1px 7px',borderRadius:99,background:C.gcal+'15',color:C.gcal,display:'flex',alignItems:'center',gap:3}}><CTIcon size={9}/>{CT.label}</span>
          {showTime&&task.estimatedHours>0&&<span style={{fontSize:10,padding:'1px 7px',borderRadius:99,background:C.s2,color:C.t2,display:'flex',alignItems:'center',gap:3}}><Timer size={9}/>{fmtH(task.estimatedHours)}</span>}
          {task.deadline&&<span style={{fontSize:10,padding:'1px 7px',borderRadius:99,background:C.s2,color:C.t2,display:'flex',alignItems:'center',gap:3}}><Calendar size={9}/>{new Date(task.deadline).toLocaleDateString('de-DE')}</span>}
          {task.synced&&<span style={{fontSize:10,padding:'1px 7px',borderRadius:99,background:C.a+'20',color:C.a}}>✓ Synced</span>}
        </div>
      </div>
      <div style={{display:'flex',gap:2}}>
        {!task.completed&&<button onClick={function(){onCalendar(task);}} style={{background:'none',border:'none',cursor:'pointer',color:task.synced?C.gcal:C.t3,padding:2,opacity:task.synced?0.8:0.5}}><CalendarPlus size={13}/></button>}
        {!task.completed&&<button onClick={function(){onEdit(task);}} style={{background:'none',border:'none',cursor:'pointer',color:C.t3,padding:2,opacity:0.5}}><Edit3 size={13}/></button>}
        <button onClick={function(){onDelete(task.id);}} style={{background:'none',border:'none',cursor:'pointer',color:C.t3,padding:2,opacity:0.5}}><Trash2 size={13}/></button>
      </div>
    </div>
  </div>;
}

function BudgetBar({used,totalBudget}){var pct=totalBudget>0?Math.min((used/totalBudget)*100,100):0;var over=used>totalBudget;var free=totalBudget-used;var color=over?C.high:pct>80?C.medium:C.a;return <div style={{marginBottom:4}}><div style={{display:'flex',justifyContent:'space-between',fontSize:11,color:C.t3,marginBottom:3}}><span>{fmtH(used)} / {fmtH(totalBudget)}</span><span style={{color:over?C.high:free<8?C.medium:C.t2}}>{over?'⚠️ '+fmtH(used-totalBudget)+' überlastet':fmtH(free)+' frei'}</span></div><div style={{height:6,background:C.s2,borderRadius:3,overflow:'hidden'}}><div style={{height:'100%',width:pct+'%',background:color,borderRadius:3,transition:'width 0.3s'}}/></div></div>;}

/* --- Main --- */
export default function SmartTodoInbox(){
  const [tasks,setTasks]=useState([]);
  const [input,setInput]=useState('');
  const [processing,setProcessing]=useState(false);
  const [listening,setListening]=useState(false);
  const [view,setView]=useState('inbox');
  const [loaded,setLoaded]=useState(false);
  const [expClusters,setExpClusters]=useState({});
  const [showExport,setShowExport]=useState(false);
  const [note,setNote]=useState(null);
  const [aiSuggestion,setAiSuggestion]=useState(null);
  const [editId,setEditId]=useState(null);
  const [draftMeta,setDraftMeta]=useState(null);
  const [showSettings,setShowSettings]=useState(false);
  const [calendarName,setCalendarName]=useState('');
  const recRef=useRef(null);

  useEffect(function(){(async function(){try{var r=await window.storage.get('smart-todo-v9');if(r&&r.value)setTasks(JSON.parse(r.value));}catch(e){}try{var r2=await window.storage.get('smart-todo-settings');if(r2&&r2.value){var s=JSON.parse(r2.value);setCalendarName(s.calendarName||'');}}catch(e){}setLoaded(true);})();},[]);
  useEffect(function(){if(!loaded)return;(async function(){try{await window.storage.set('smart-todo-v9',JSON.stringify(tasks));}catch(e){}})();},[tasks,loaded]);
  useEffect(function(){if(!loaded)return;(async function(){try{await window.storage.set('smart-todo-settings',JSON.stringify({calendarName:calendarName}));}catch(e){}})();},[calendarName,loaded]);

  function notify(msg){setNote(msg);setTimeout(function(){setNote(null);},3000);}
  var allCats=[...new Set(tasks.map(function(t){return t.category;}))];

  function buildICS(tl){var fDT=function(d,h,m){return d.replace(/-/g,'')+'T'+pad2(h||9)+pad2(m||0)+'00';};var esc=function(s){return s.replace(/\n/g,'\\n').replace(/,/g,'\\,').replace(/;/g,'\\;');};var ics='BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Smart Inbox//DE\r\nCALSCALE:GREGORIAN\r\nMETHOD:PUBLISH\r\n';tl.forEach(function(t){var d=t.deadline||new Date().toISOString().slice(0,10);var pe=t.priority==='high'?'🔴':t.priority==='medium'?'🟡':'🟢';var desc=esc('Kategorie: '+t.category+'\\nPriorität: '+PL[t.priority]+(t.estimatedHours?'\\nGeschätzt: '+fmtH(t.estimatedHours):'')+(t.subtasks&&t.subtasks.length?'\\n\\nTeilschritte:\\n'+t.subtasks.map(function(s){return '☐ '+s;}).join('\\n'):''));ics+='BEGIN:VEVENT\r\nUID:'+t.id+'@smartinbox\r\n';if(t.calendarType==='allday'){var n=new Date(d);n.setDate(n.getDate()+1);ics+='DTSTART;VALUE=DATE:'+d.replace(/-/g,'')+'\r\nDTEND;VALUE=DATE:'+ds(n).replace(/-/g,'')+'\r\nSUMMARY:'+pe+' '+esc(t.title)+'\r\n';}else if(t.calendarType==='reminder'){ics+='DTSTART:'+fDT(d,10,0)+'\r\nDTEND:'+fDT(d,10,30)+'\r\nSUMMARY:⏰ '+esc(t.title)+'\r\nBEGIN:VALARM\r\nTRIGGER:-PT10M\r\nACTION:DISPLAY\r\nDESCRIPTION:'+esc(t.title)+'\r\nEND:VALARM\r\n';}else if(t.calendarType==='todo'){ics+='DTSTART:'+fDT(d,9,0)+'\r\nDTEND:'+fDT(d,9,30)+'\r\nSUMMARY:☑️ '+esc(t.title)+'\r\n';}else{var mins=Math.round(t.estimatedHours*60);ics+='DTSTART:'+fDT(d,9,0)+'\r\nDTEND:'+fDT(d,9+Math.floor(mins/60),mins%60)+'\r\nSUMMARY:'+pe+' '+esc(t.title)+'\r\n';}if(t.reminderEnabled&&t.reminderMinutes!=null)ics+='BEGIN:VALARM\r\nTRIGGER:-PT'+t.reminderMinutes+'M\r\nACTION:DISPLAY\r\nDESCRIPTION:'+esc(t.title)+'\r\nEND:VALARM\r\n';ics+='DESCRIPTION:'+desc+'\r\nSTATUS:CONFIRMED\r\nEND:VEVENT\r\n';});return ics+'END:VCALENDAR';}

  function downloadICS(tl,fn){var blob=new Blob([buildICS(tl)],{type:'text/calendar;charset=utf-8'});var url=URL.createObjectURL(blob);var a=document.createElement('a');a.href=url;a.download=fn||'tasks.ics';document.body.appendChild(a);a.click();document.body.removeChild(a);URL.revokeObjectURL(url);setTasks(function(p){return p.map(function(t){return tl.find(function(x){return x.id===t.id;})?Object.assign({},t,{synced:true}):t;});});notify('📅 '+tl.length+' Tasks exportiert');}

  async function processAI(txt){setProcessing(true);try{var res=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:1000,messages:[{role:"user",content:'Du bist ein Task-Assistent. Analysiere diese Aufgabe und antworte NUR mit validem JSON.\n\nAufgabe: "'+txt+'"\nBestehende Kategorien: '+JSON.stringify(allCats)+'\n\nJSON: {"title":"Aufgabe","category":"Kategorie","priority":"high|medium|low","calendarType":"timeblock|allday|reminder|todo","subtasks":["Teilschritte"],"deadline":null,"estimatedHours":1,"tags":["tags"]}\n\nRegeln:\n- category: thematische Gruppierung\n- Nutze bestehende Kategorien wenn passend\n- deadline als ISO-Datum wenn erkennbar, sonst null\n- calendarType: timeblock für fokussierte Arbeit, allday für ganztägige Events, reminder für Erinnerungen, todo für Backlog\n- estimatedHours: bei timeblock 0.25-8, bei allday 8, bei reminder/todo 0'}]})});var data=await res.json();var raw=(data.content&&data.content.find(function(b){return b.type==='text';}))||{};raw=raw.text||'';var p=JSON.parse(raw.replace(/```json|```/g,'').trim());var ct=p.calendarType||'timeblock';var h=ct==='allday'?8:(ct==='reminder'||ct==='todo')?0:(p.estimatedHours||1);setDraftMeta({id:Date.now().toString(),original:txt,title:p.title||txt,category:p.category||'Allgemein',priority:p.priority||'medium',calendarType:ct,subtasks:p.subtasks||[],deadline:p.deadline||null,estimatedHours:h,tags:p.tags||[],completed:false,synced:false,reminderEnabled:false,reminderMinutes:10,createdAt:new Date().toISOString()});setEditId('new');}catch(e){setDraftMeta({id:Date.now().toString(),original:txt,title:txt,category:'Unsortiert',priority:'medium',calendarType:'timeblock',subtasks:[],deadline:null,estimatedHours:1,tags:[],completed:false,synced:false,reminderEnabled:false,reminderMinutes:10,createdAt:new Date().toISOString()});setEditId('new');}setProcessing(false);}

  var confirmDraft=useCallback(function(){if(!draftMeta)return;if(editId==='new'){setTasks(function(p){return [draftMeta].concat(p);});notify('✓ '+draftMeta.category);}else{setTasks(function(p){return p.map(function(t){return t.id===editId?Object.assign({},t,draftMeta):t;});});notify('Aktualisiert');}setEditId(null);setDraftMeta(null);},[draftMeta,editId]);
  var cancelDraft=useCallback(function(){setEditId(null);setDraftMeta(null);},[]);
  var startEdit=useCallback(function(task){setDraftMeta(Object.assign({},task));setEditId(task.id);},[]);
  var toggleTask=useCallback(function(id){setTasks(function(p){return p.map(function(t){return t.id===id?Object.assign({},t,{completed:!t.completed}):t;});});},[]);
  var delTask=useCallback(function(id){setTasks(function(p){return p.filter(function(t){return t.id!==id;});});},[]);
  var updateTask=useCallback(function(data){setTasks(function(p){return p.map(function(t){return t.id===data.id?Object.assign({},t,data):t;});});},[]);

  async function getAISuggestions(){var open=tasks.filter(function(t){return !t.completed;});if(!open.length)return;setAiSuggestion({loading:true});try{var lines=open.map(function(t){return '- '+t.title+' ['+t.category+','+t.priority+','+(CAL_TYPES[t.calendarType]?CAL_TYPES[t.calendarType].label:'')+(t.estimatedHours?','+fmtH(t.estimatedHours):'')+',DL:'+(t.deadline||'keins')+']';}).join('\n');var res=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:1000,messages:[{role:"user",content:'Analysiere diese offenen Tasks und gib kurze Empfehlungen auf Deutsch. Max 150 Wörter.\n\nTasks:\n'+lines}]})});var data=await res.json();var txt2=(data.content&&data.content.find(function(b){return b.type==='text';}))||{};setAiSuggestion({loading:false,text:txt2.text||'Keine Vorschläge.'});}catch(e){setAiSuggestion({loading:false,text:'Fehlgeschlagen.'});}}

  function toggleVoice(){if(listening){if(recRef.current)recRef.current.stop();setListening(false);return;}if(!('webkitSpeechRecognition' in window)&&!('SpeechRecognition' in window)){notify('Nicht unterstützt');return;}var SR=window.SpeechRecognition||window.webkitSpeechRecognition;var rec=new SR();rec.lang='de-DE';rec.continuous=false;rec.interimResults=true;rec.onresult=function(e){setInput(Array.from(e.results).map(function(r){return r[0].transcript;}).join(''));};rec.onend=function(){setListening(false);};rec.onerror=function(){setListening(false);notify('Sprachfehler');};recRef.current=rec;rec.start();setListening(true);}
  function submit(){if(!input.trim()||processing)return;processAI(input.trim());setInput('');}

  function slackMsg(){var open=tasks.filter(function(t){return !t.completed;});var g=_.groupBy(open,'priority');var m='📋 *Tasks* ('+new Date().toLocaleDateString('de-DE')+')\n\n';['high','medium','low'].forEach(function(p){if(g[p]&&g[p].length){m+=(p==='high'?'🔴':p==='medium'?'🟡':'🟢')+' *'+PL[p]+'*\n';g[p].forEach(function(t){m+='• '+t.title+(t.estimatedHours?' ('+fmtH(t.estimatedHours)+')':'')+'\n';});m+='\n';}});return m;}
  function mdMsg(){return tasks.filter(function(t){return !t.completed;}).map(function(t){return '- ['+(t.priority==='high'?'!':' ')+'] '+t.title+' _('+t.category+(t.estimatedHours?', '+fmtH(t.estimatedHours):'')+')_';}).join('\n');}
  function clip(txt){navigator.clipboard.writeText(txt);notify('Kopiert!');}

  var active=tasks.filter(function(t){return !t.completed;});
  var done=tasks.filter(function(t){return t.completed;});
  var hiCount=active.filter(function(t){return t.priority==='high';}).length;
  var totalH=_.sumBy(active,'estimatedHours');
  function getTaskKW(t){return t.deadline?getKW(t.deadline):getKW(t.createdAt);}

  function renderEditor(){if(!editId||!draftMeta)return null;return <MetaEditor data={draftMeta} onChange={setDraftMeta} onConfirm={confirmDraft} onCancel={cancelDraft} existingCats={allCats}/>;}
  function renderTaskOrEditor(task){if(editId===task.id)return <div key={task.id}>{renderEditor()}</div>;return <TaskCard key={task.id} task={task} onToggle={toggleTask} onDelete={delTask} onEdit={startEdit} onCalendar={function(t){downloadICS([t],t.title.slice(0,20)+'.ics');}} allCats={allCats}/>;}

  function renderInbox(){return <div>{editId==='new'&&renderEditor()}{active.length===0&&!editId&&<div style={{textAlign:'center',padding:40,color:C.t3}}><Inbox size={36} style={{opacity:0.2,marginBottom:8}}/><p>Keine offenen Tasks</p></div>}{active.map(function(t){return renderTaskOrEditor(t);})}{done.length>0&&<div style={{marginTop:16}}><div style={{fontSize:11,color:C.t3,marginBottom:5,fontWeight:600}}>Erledigt ({done.length})</div>{done.map(function(t){return renderTaskOrEditor(t);})}</div>}</div>;}

  function renderKW(){
    var g=_.groupBy(active,function(t){var kw=getTaskKW(t);return kw.year+'-'+kw.week;});
    var kd=_.sortBy(Object.entries(g),function(pair){var parts=pair[0].split('-').map(Number);return parts[0]*100+parts[1];}).map(function(pair){
      var key=pair[0],ts=pair[1];var parts=key.split('-').map(Number);var yr=parts[0],wk=parts[1];
      var te=_.sumBy(ts,'estimatedHours');var wd=getWeekWorkdays(yr,wk);var nk=getKW(new Date());
      return{key:key,week:wk,tasks:ts,totalEst:te,totalBudget:wd*8,workdays:wd,isCurrent:nk.year===yr&&nk.week===wk};
    });
    if(!kd.length)return <div style={{textAlign:'center',padding:40,color:C.t3}}>Keine Tasks</div>;
    return <div>{editId==='new'&&renderEditor()}{kd.map(function(w){return <div key={w.key} style={{marginBottom:20}}>
      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:8}}>
        <div style={{background:w.isCurrent?C.a:C.s2,padding:'3px 10px',borderRadius:6,fontSize:12,fontWeight:700,color:w.isCurrent?'#fff':C.t2}}>KW {w.week}</div>
        <span style={{fontSize:11,color:C.t3}}>{w.tasks.length} Tasks · {w.workdays} Tage à 8h</span>
        <button onClick={function(){downloadICS(w.tasks.filter(function(t){return !t.synced;}),'KW'+w.week+'.ics');}} style={{marginLeft:'auto',background:C.gcal+'22',border:'1px solid '+C.gcal+'44',borderRadius:6,padding:'3px 10px',cursor:'pointer',fontSize:10,color:C.gcal,fontWeight:600,display:'flex',alignItems:'center',gap:4}}><CalendarPlus size={11}/> .ics</button>
      </div>
      <BudgetBar used={w.totalEst} totalBudget={w.totalBudget}/>
      <div style={{marginTop:8}}>{w.tasks.map(function(t){return renderTaskOrEditor(t);})}</div>
    </div>;})}</div>;
  }

  function renderPrio(){return <div>{editId==='new'&&renderEditor()}{['high','medium','low'].map(function(p){var pt=active.filter(function(t){return t.priority===p;});if(!pt.length)return null;var h=_.sumBy(pt,'estimatedHours');return <div key={p} style={{marginBottom:20}}><div style={{display:'flex',alignItems:'center',gap:6,marginBottom:8}}><div style={{width:10,height:10,borderRadius:'50%',background:C[p]}}/><span style={{color:C.t,fontWeight:600,fontSize:13}}>{PL[p]}</span><span style={{color:C.t3,fontSize:11}}>({pt.length}{h>0?' · '+fmtH(h):''})</span></div>{pt.map(function(t){return renderTaskOrEditor(t);})}</div>;})}</div>;}

  function renderCats(){
    var g=_.groupBy(active,'category');
    return <div>{editId==='new'&&renderEditor()}{Object.entries(g).map(function(pair){
      var cat=pair[0],ts=pair[1];
      return <div key={cat} style={{marginBottom:14}}>
        <button onClick={function(){setExpClusters(function(p){var n=Object.assign({},p);n[cat]=!p[cat];return n;});}} style={{display:'flex',alignItems:'center',gap:8,background:C.s,border:'1px solid '+C.b+'22',borderRadius:10,padding:'9px 12px',cursor:'pointer',width:'100%',marginBottom:4}}>
          {expClusters[cat]===false?<ChevronRight size={13} color={C.t3}/>:<ChevronDown size={13} color={C.t3}/>}
          <Layers size={13} color={C.a}/><span style={{color:C.t,fontWeight:600,fontSize:12}}>{cat}</span>
          <span style={{color:C.t3,fontSize:11,marginLeft:'auto'}}>{ts.length}{_.sumBy(ts,'estimatedHours')>0?' · '+fmtH(_.sumBy(ts,'estimatedHours')):''}</span>
        </button>
        {expClusters[cat]!==false&&ts.map(function(t){return renderTaskOrEditor(t);})}
      </div>;
    })}</div>;
  }

  function renderCalendar(){return <div>{editId&&renderEditor()}<CalendarView tasks={tasks} allCats={allCats} onUpdate={updateTask} onDelete={delTask} onToggle={toggleTask}/></div>;}

  var views=[
    {id:'inbox',label:'Inbox',I:Inbox},
    {id:'cal',label:'Kalender',I:CalendarDays},
    {id:'kw',label:'KW',I:Calendar},
    {id:'prio',label:'Prio',I:AlertTriangle},
    {id:'cats',label:'Kat.',I:Layers}
  ];

  if(!loaded)return <div style={{background:C.bg,minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',color:C.t}}>Laden...</div>;

  return(
    <div style={{background:C.bg,minHeight:'100vh',color:C.t,fontFamily:'system-ui,-apple-system,sans-serif'}}>
      {note&&<div style={{position:'fixed',top:12,left:'50%',transform:'translateX(-50%)',background:C.a,color:'#fff',padding:'8px 20px',borderRadius:10,fontSize:13,zIndex:999,boxShadow:'0 4px 20px #0005'}}>{note}</div>}
      <div style={{maxWidth:700,margin:'0 auto',padding:'16px 14px'}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14}}>
          <div>
            <h1 style={{fontSize:20,fontWeight:700,margin:0,letterSpacing:'-0.5px'}}>Smart Inbox</h1>
            <p style={{color:C.t3,fontSize:11,margin:'2px 0 0'}}>{active.length} offen{totalH>0&&' · '+fmtH(totalH)+' geschätzt'}{hiCount>0&&<span style={{color:C.high}}> · {hiCount} dringend</span>}</p>
          </div>
          <div style={{display:'flex',gap:5}}>
            <button onClick={getAISuggestions} style={{width:34,height:34,borderRadius:9,border:'1px solid '+C.b+'44',background:C.s,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}><Zap size={15} color={C.a2}/></button>
            <button onClick={function(){setShowExport(!showExport);}} style={{width:34,height:34,borderRadius:9,border:'1px solid '+C.b+'44',background:C.s,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}><Send size={14} color={C.t2}/></button>
            <button onClick={function(){setShowSettings(!showSettings);}} style={{width:34,height:34,borderRadius:9,border:'1px solid '+(showSettings?C.a:C.b)+'44',background:C.s,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}><Settings size={14} color={showSettings?C.a:C.t2}/></button>
          </div>
        </div>

        {showSettings&&<div style={{background:C.s,border:'1px solid '+C.b+'22',borderRadius:12,padding:14,marginBottom:14}}>
          <div style={{fontSize:12,fontWeight:600,color:C.t,marginBottom:10,display:'flex',alignItems:'center',gap:5}}><Settings size={13} color={C.t2}/> Einstellungen</div>
          <div><label style={{fontSize:11,color:C.t3,fontWeight:600,display:'block',marginBottom:4}}>Google Kalender Name</label><input value={calendarName} onChange={function(e){setCalendarName(e.target.value);}} placeholder="z.B. eduhu Tasks" style={{width:'100%',background:C.s2,border:'1px solid '+C.b+'44',borderRadius:8,padding:'8px 10px',color:C.t,fontSize:12,boxSizing:'border-box'}}/></div>
        </div>}

        {aiSuggestion&&<div style={{background:C.a+'11',border:'1px solid '+C.a+'33',borderRadius:12,padding:12,marginBottom:14,position:'relative'}}>
          <button onClick={function(){setAiSuggestion(null);}} style={{position:'absolute',top:6,right:6,background:'none',border:'none',cursor:'pointer',color:C.t3}}><X size={13}/></button>
          <div style={{display:'flex',alignItems:'center',gap:5,marginBottom:6}}><Sparkles size={13} color={C.a2}/><span style={{fontSize:11,fontWeight:600,color:C.a2}}>AI-Analyse</span></div>
          {aiSuggestion.loading?<p style={{color:C.t3,fontSize:12,margin:0}}>Analysiere...</p>:<p style={{color:C.t2,fontSize:12,margin:0,lineHeight:1.6,whiteSpace:'pre-wrap'}}>{aiSuggestion.text}</p>}
        </div>}

        {showExport&&<div style={{background:C.s,border:'1px solid '+C.b+'22',borderRadius:12,padding:10,marginBottom:14,display:'flex',gap:6,flexWrap:'wrap'}}>
          <button onClick={function(){clip(slackMsg());}} style={{background:'#4A154B',border:'none',borderRadius:7,padding:'6px 12px',color:'#fff',cursor:'pointer',fontSize:11,display:'flex',alignItems:'center',gap:4}}><Copy size={11}/> Slack</button>
          <button onClick={function(){clip(mdMsg());}} style={{background:C.s2,border:'1px solid '+C.b+'44',borderRadius:7,padding:'6px 12px',color:C.t,cursor:'pointer',fontSize:11,display:'flex',alignItems:'center',gap:4}}><FileText size={11}/> Markdown</button>
          <button onClick={function(){downloadICS(active,'alle-tasks.ics');}} style={{background:C.a,border:'none',borderRadius:7,padding:'6px 12px',color:'#fff',cursor:'pointer',fontSize:11,display:'flex',alignItems:'center',gap:4}}><CalendarPlus size={11}/> Alle .ics</button>
        </div>}

        <div style={{background:C.s,border:'2px solid '+(listening?C.a:processing?C.medium+'88':C.b+'44'),borderRadius:14,padding:'3px 3px 3px 14px',marginBottom:16,display:'flex',alignItems:'center',gap:5}}>
          <input value={input} onChange={function(e){setInput(e.target.value);}} onKeyDown={function(e){if(e.key==='Enter')submit();}} placeholder={listening?"Ich höre zu...":"Was muss erledigt werden?"} disabled={processing} style={{flex:1,background:'none',border:'none',outline:'none',color:C.t,fontSize:14,padding:'10px 0'}}/>
          <button onClick={toggleVoice} style={{width:34,height:34,borderRadius:8,border:'none',background:listening?C.high+'22':'transparent',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}>{listening?<MicOff size={15} color={C.high}/>:<Mic size={15} color={C.t3}/>}</button>
          <button onClick={submit} disabled={!input.trim()||processing} style={{width:34,height:34,borderRadius:8,border:'none',background:input.trim()?C.a:C.s2,cursor:input.trim()?'pointer':'default',display:'flex',alignItems:'center',justifyContent:'center'}}>{processing?<RotateCw size={15} color="#fff" style={{animation:'spin 1s linear infinite'}}/>:<Sparkles size={15} color={input.trim()?'#fff':C.t3}/>}</button>
        </div>

        <div style={{display:'flex',gap:2,marginBottom:14,background:C.s,borderRadius:10,padding:3}}>
          {views.map(function(v){var I=v.I;return <button key={v.id} onClick={function(){setView(v.id);}} style={{flex:1,padding:'7px 4px',borderRadius:7,border:'none',background:view===v.id?C.a:'transparent',color:view===v.id?'#fff':C.t3,cursor:'pointer',fontSize:11,fontWeight:500,display:'flex',alignItems:'center',justifyContent:'center',gap:4}}><I size={12}/>{v.label}</button>;})}
        </div>

        {view==='inbox'&&renderInbox()}
        {view==='cal'&&renderCalendar()}
        {view==='kw'&&renderKW()}
        {view==='prio'&&renderPrio()}
        {view==='cats'&&renderCats()}
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg);}}input::placeholder{color:${C.t3};}select,input[type="date"],input[type="checkbox"]{appearance:auto;}*::-webkit-scrollbar{width:4px;height:4px;}*::-webkit-scrollbar-track{background:transparent;}*::-webkit-scrollbar-thumb{background:${C.b}44;border-radius:4px;}`}</style>
    </div>
  );
}
