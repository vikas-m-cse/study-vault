import { useEffect, useMemo, useState } from "react";
import { CalendarDays, Clock3, Plus, Trash2, Check, Pencil, X, Coffee, BookOpen, GraduationCap, Utensils, Dumbbell, Sparkles, ChevronLeft, ChevronRight, Target, Sun, RotateCcw, ArrowRight, CircleCheck, ExternalLink, Link2 } from "lucide-react";
import type { Resource } from "./types/resource";
import type { Subject } from "./Subjects";

type Category = "class" | "study" | "break" | "meal" | "personal";
type Repeat = "everyday" | "weekdays" | "weekend";
type TimeBlock = { id: string; title: string; start: string; end: string; category: Category; days: Repeat; subjectId?: number; resourceId?: string };
type DailyTimetableProps = { resources?: Resource[]; subjects?: Subject[]; onOpenResource?: (resourceId: string) => void };
type CompletionMap = Record<string, string[]>;
const PLAN_KEY = "studyvault-daily-timetable-v1";
const COMPLETION_KEY = "studyvault-timetable-completions-v1";
const starterPlan: TimeBlock[] = [
  { id:"starter-morning", title:"Morning routine & breakfast", start:"06:30", end:"07:30", category:"personal", days:"weekdays" },
  { id:"starter-college", title:"College / classes", start:"08:00", end:"16:00", category:"class", days:"weekdays" },
  { id:"starter-reset", title:"Travel, snack & reset", start:"16:00", end:"16:45", category:"break", days:"weekdays" },
  { id:"starter-focus", title:"Deep work · priority subject", start:"16:45", end:"18:00", category:"study", days:"weekdays" },
  { id:"starter-dinner", title:"Dinner", start:"19:30", end:"20:00", category:"meal", days:"everyday" },
  { id:"starter-recall", title:"Active recall & revision", start:"20:00", end:"21:00", category:"study", days:"everyday" },
  { id:"starter-winddown", title:"Wind down · prepare for tomorrow", start:"21:00", end:"21:30", category:"personal", days:"everyday" },
];
const categoryLabels: Record<Category,string> = { class:"Classes", study:"Focused study", break:"Break", meal:"Meal", personal:"Personal" };
const categoryIcons = { class:GraduationCap, study:BookOpen, break:Coffee, meal:Utensils, personal:Dumbbell };
const toMinutes=(v:string)=>{const [h,m]=v.split(":").map(Number);return h*60+m;};
const dateKey=(d:Date)=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
const formatTime=(v:string)=>{const [h,m]=v.split(":").map(Number);const d=new Date();d.setHours(h,m,0,0);return d.toLocaleTimeString([],{hour:"numeric",minute:"2-digit"});};
const duration=(b:TimeBlock)=>Math.max(0,toMinutes(b.end)-toMinutes(b.start));
const applies=(b:TimeBlock,d:Date)=>b.days==="everyday"||(b.days==="weekdays"&&d.getDay()>=1&&d.getDay()<=5)||(b.days==="weekend"&&(d.getDay()===0||d.getDay()===6));
const repeatsOnSameDay=(a:Repeat,b:Repeat)=>a==="everyday"||b==="everyday"||a===b;
function loadPlan():TimeBlock[]{try{const v=localStorage.getItem(PLAN_KEY);if(v){const p:unknown=JSON.parse(v);if(Array.isArray(p))return p as TimeBlock[];}}catch { /* Keep the in-memory defaults when browser storage is unavailable. */ }return starterPlan;}
function loadDone():CompletionMap{try{const v=localStorage.getItem(COMPLETION_KEY);if(v)return JSON.parse(v) as CompletionMap;}catch { /* Keep the in-memory defaults when browser storage is unavailable. */ }return {};}

export default function DailyTimetable({ resources = [], subjects = [], onOpenResource = () => {} }: DailyTimetableProps){
 const [blocks,setBlocks]=useState<TimeBlock[]>(loadPlan);
 const [doneByDate,setDoneByDate]=useState<CompletionMap>(loadDone);
 const [selectedDate,setSelectedDate]=useState(()=>dateKey(new Date()));
 const [clock,setClock]=useState(()=>new Date());
 const [formOpen,setFormOpen]=useState(false);
 const [editingId,setEditingId]=useState<string|null>(null);
 const [error,setError]=useState("");
 const [draft,setDraft]=useState<Omit<TimeBlock,"id">>({title:"",start:"17:00",end:"18:00",category:"study",days:"weekdays",subjectId:undefined,resourceId:undefined});
 useEffect(()=>{try{localStorage.setItem(PLAN_KEY,JSON.stringify(blocks));}catch { /* Keep the in-memory defaults when browser storage is unavailable. */ }},[blocks]);
 useEffect(()=>{try{localStorage.setItem(COMPLETION_KEY,JSON.stringify(doneByDate));}catch { /* Keep the in-memory defaults when browser storage is unavailable. */ }},[doneByDate]);
 useEffect(()=>{const timer=window.setInterval(()=>setClock(new Date()),30_000);return()=>window.clearInterval(timer);},[]);
 useEffect(()=>{if(!formOpen)return;const handleKeyDown=(event:KeyboardEvent)=>{if(event.key==="Escape")setFormOpen(false);};window.addEventListener("keydown",handleKeyDown);return()=>window.removeEventListener("keydown",handleKeyDown);},[formOpen]);
 const activeDate=useMemo(()=>{const [y,m,d]=selectedDate.split("-").map(Number);return new Date(y,m-1,d);},[selectedDate]);
 const todayKey=dateKey(clock),isToday=selectedDate===todayKey,now=clock.getHours()*60+clock.getMinutes();
 const week=useMemo(()=>{const monday=new Date(activeDate);monday.setDate(monday.getDate()-((monday.getDay()+6)%7));return Array.from({length:7},(_,i)=>{const d=new Date(monday);d.setDate(monday.getDate()+i);return d;});},[activeDate]);
 const visible=useMemo(()=>blocks.filter(b=>applies(b,activeDate)).slice().sort((a,b)=>toMinutes(a.start)-toMinutes(b.start)),[blocks,activeDate]);
 const done=doneByDate[selectedDate]??[];
 const completed=visible.filter(b=>done.includes(b.id)).length;
 const planned=visible.reduce((s,b)=>s+duration(b),0);
 const study=visible.filter(b=>b.category==="study").reduce((s,b)=>s+duration(b),0);
 const percent=visible.length?Math.round(completed/visible.length*100):0;
 const current= isToday ? visible.find(b=>!done.includes(b.id)&&toMinutes(b.start)<=now&&toMinutes(b.end)>now):undefined;
 const next= isToday ? visible.find(b=>!done.includes(b.id)&&toMinutes(b.end)>now):undefined;
 const setDate=(d:Date)=>setSelectedDate(dateKey(d));
 const shiftWeek=(n:number)=>{const d=new Date(activeDate);d.setDate(d.getDate()+n*7);setDate(d);};
 const openNew=()=>{setEditingId(null);setDraft({title:"",start:"17:00",end:"18:00",category:"study",days:"weekdays",subjectId:undefined,resourceId:undefined});setError("");setFormOpen(true);};
 const openEdit=(b:TimeBlock)=>{setEditingId(b.id);setDraft({title:b.title,start:b.start,end:b.end,category:b.category,days:b.days,subjectId:b.subjectId,resourceId:b.resourceId});setError("");setFormOpen(true);};
 const save=()=>{
  if(!draft.title.trim()){setError("Give this block a clear name.");return;}
  if(toMinutes(draft.end)<=toMinutes(draft.start)){setError("End time must be after start time.");return;}
  const collision=blocks.some(b=>b.id!==editingId&&repeatsOnSameDay(b.days,draft.days)&&toMinutes(draft.start)<toMinutes(b.end)&&toMinutes(draft.end)>toMinutes(b.start));
  if(collision){setError("This time overlaps another block with the same repeat pattern.");return;}
  if(editingId)setBlocks(prev=>prev.map(b=>b.id===editingId?{...draft,id:editingId,title:draft.title.trim()}:b));
  else setBlocks(prev=>[...prev,{...draft,id:`block-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,title:draft.title.trim()}]);
  setFormOpen(false);
 };
 const toggle=(id:string)=>setDoneByDate(prev=>{const ids=prev[selectedDate]??[];return {...prev,[selectedDate]:ids.includes(id)?ids.filter(x=>x!==id):[...ids,id]};});
 const remove=(id:string)=>{setBlocks(prev=>prev.filter(b=>b.id!==id));setDoneByDate(prev=>Object.fromEntries(Object.entries(prev).map(([day,ids])=>[day,ids.filter(x=>x!==id)])));};
 const restore=()=>{setBlocks(starterPlan);};
 const dayTitle=activeDate.toLocaleDateString([],{weekday:"long",month:"long",day:"numeric"});
 const upcomingLabel=current?"IN PROGRESS":next?"UP NEXT":"YOUR DAY, YOUR PACE";
 const availableResources=resources.filter(r=>draft.subjectId==null||r.subjectId===draft.subjectId);
 return <main className="tt2-page">
  <header className="tt2-header">
   <div><div className="tt2-kicker"><span className="tt2-kicker-mark"/>STUDYVAULT / DAILY PLANNER</div><h1>Make room for <em>what matters.</em></h1><p>A thoughtful plan for focused work, real breaks, and a day that feels possible.</p></div>
   <button className="tt2-primary" onClick={openNew}><Plus size={17}/> Add a block</button>
  </header>
  <nav className="tt2-week" aria-label="Choose a day">
   <button className="tt2-week-arrow" onClick={()=>shiftWeek(-1)} aria-label="Previous week"><ChevronLeft size={18}/></button>
   <div className="tt2-week-days">{week.map(d=>{const key=dateKey(d),selected=key===selectedDate,today=key===todayKey,count=blocks.filter(b=>applies(b,d)).length;return <button key={key} className={`tt2-day ${selected?"selected":""} ${today?"today":""}`} onClick={()=>setDate(d)} aria-pressed={selected}><span>{d.toLocaleDateString([],{weekday:"short"})}</span><strong>{d.getDate()}</strong><small>{count?count+" blocks":"Open"}</small><i/></button>;})}</div>
   <button className="tt2-week-arrow" onClick={()=>shiftWeek(1)} aria-label="Next week"><ChevronRight size={18}/></button>
  </nav>
  <section className="tt2-overview">
   <div className="tt2-overview-main"><div className="tt2-date-line"><span>{isToday?"TODAY'S INTENTION":activeDate.toLocaleDateString([],{weekday:"long"}).toUpperCase()}</span>{!isToday&&<button onClick={()=>setSelectedDate(todayKey)}>Return to today</button>}</div><h2>{dayTitle}</h2><p>{visible.length?completed===visible.length?"You showed up for every block. Let that count.":`${completed} of ${visible.length} blocks complete. Progress over perfection.`:"A little structure can change the shape of your day."}</p><div className="tt2-progress"><span style={{width:`${percent}%`}}/></div><div className="tt2-progress-foot"><strong>{percent}% <small>complete</small></strong><span>{Math.floor(planned/60)}h {planned%60}m planned</span></div></div>
   <div className="tt2-overview-stats"><div className="tt2-big-stat"><span className="tt2-stat-icon sage"><BookOpen size={17}/></span><div><small>FOCUSED STUDY</small><strong>{Math.floor(study/60)}h <i>{study%60}m</i></strong></div></div><div className="tt2-stat-divider"/><div className="tt2-big-stat"><span className="tt2-stat-icon gold"><Target size={17}/></span><div><small>TIME BLOCKS</small><strong>{visible.length}<i> planned</i></strong></div></div></div>
  </section>
  {isToday&&<section className="tt2-focus-card"><div className="tt2-focus-icon"><Sparkles size={18}/></div><div className="tt2-focus-copy"><span>{upcomingLabel}</span><strong>{current?.title??next?.title??"Nothing else scheduled"}</strong><p>{current? `Until ${formatTime(current.end)} · ${categoryLabels[current.category]}`:next?`${formatTime(next.start)} – ${formatTime(next.end)} · ${categoryLabels[next.category]}`:"Take a breath or add something meaningful."}</p></div>{next&&<div className="tt2-focus-time"><Clock3 size={14}/>{current?"ENDS IN": "STARTS"}<strong>{current?Math.max(0,toMinutes(current.end)-now)+" min":formatTime(next.start)}</strong></div>}</section>}
  <section className="tt2-plan-section"><div className="tt2-section-heading"><div><span className="tt2-overline">THE RHYTHM OF YOUR DAY</span><h2>Your timeline</h2><p>Give each block your attention, then mark it done.</p></div><div className="tt2-heading-actions"><span>{visible.length} {visible.length===1?"block":"blocks"}</span><button onClick={restore} title="Restore the starter routine"><RotateCcw size={14}/> Reset plan</button></div></div>
   {visible.length?<div className="tt2-timeline">{visible.map((b)=>{const Icon=categoryIcons[b.category],isDone=done.includes(b.id),isCurrent=isToday&&now>=toMinutes(b.start)&&now<toMinutes(b.end)&&!isDone,linkedResource=b.resourceId?resources.find(r=>r.id===b.resourceId):undefined,linkedSubject=subjects.find(subject=>subject.id===b.subjectId);return <article className={`tt2-event ${isDone?"done":""} ${isCurrent?"current":""}`} key={b.id}><div className="tt2-event-time"><strong>{formatTime(b.start)}</strong><span>{formatTime(b.end)}</span></div><div className="tt2-rail"><i/><b/></div><div className="tt2-event-card"><span className={`tt2-event-icon ${b.category}`}><Icon size={18}/></span><div className="tt2-event-copy"><div className="tt2-event-title">{b.title}{isCurrent&&<span className="tt2-live">NOW</span>}</div><div className="tt2-event-meta"><span>{categoryLabels[b.category]}</span><i/> <span>{Math.floor(duration(b)/60)?Math.floor(duration(b)/60)+"h ":""}{duration(b)%60?duration(b)%60+"m":""}</span><i/><span>{b.days==="everyday"?"Every day":b.days==="weekdays"?"Weekdays":"Weekends"}</span>{linkedSubject&&<><i/><span>{linkedSubject.name}</span></>}</div>{linkedResource?<button type="button" className="tt2-resource-link" onClick={()=>onOpenResource(linkedResource.id)} title={`Open ${linkedResource.title}`}><ExternalLink size={14}/><span>Open work</span><strong>{linkedResource.title}</strong></button>:b.resourceId?<span className="tt2-resource-missing">Linked resource unavailable · edit to choose another</span>:null}</div><div className="tt2-event-actions"><button className={`tt2-check ${isDone?"checked":""}`} onClick={()=>toggle(b.id)} aria-label={isDone?"Mark incomplete":"Mark complete"} title={isDone?"Mark incomplete":"Mark complete"}>{isDone?<Check size={16}/>:<CircleCheck size={17}/>}</button><button onClick={()=>openEdit(b)} aria-label={`Edit ${b.title}`} title="Edit"><Pencil size={15}/></button><button className="danger" onClick={()=>remove(b.id)} aria-label={`Delete ${b.title}`} title="Delete"><Trash2 size={15}/></button></div></div></article>;})}</div>:<div className="tt2-empty"><span><CalendarDays size={24}/></span><h3>A blank page is an opportunity.</h3><p>Start with one meaningful block. You can build the rest of the day around it.</p><button className="tt2-primary" onClick={openNew}><Plus size={16}/> Create your first block</button><button className="tt2-text-button" onClick={restore}>Restore starter routine</button></div>}
  </section>
  <footer className="tt2-footer"><span><Sun size={15}/> A plan should support your life, not compete with it.</span><span>Saved on this device</span></footer>
  {formOpen&&<div className="tt2-backdrop" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)setFormOpen(false);}}><section className="tt2-modal" role="dialog" aria-modal="true" aria-labelledby="tt2-form-title"><header className="tt2-modal-head"><div><span className="tt2-overline">{editingId?"MAKE A SMALL ADJUSTMENT":"MAKE SPACE FOR WHAT MATTERS"}</span><h2 id="tt2-form-title">{editingId?"Edit time block":"Create a time block"}</h2><p>Choose a time that leaves room to breathe.</p></div><button className="tt2-close" onClick={()=>setFormOpen(false)} aria-label="Close"><X size={18}/></button></header><label className="tt2-field">Activity name<input autoFocus maxLength={90} value={draft.title} onChange={e=>setDraft(v=>({...v,title:e.target.value}))} placeholder="e.g. Java problem-solving"/></label><div className="tt2-field-row"><label className="tt2-field">Starts<input type="time" value={draft.start} onChange={e=>setDraft(v=>({...v,start:e.target.value}))}/></label><label className="tt2-field">Ends<input type="time" value={draft.end} onChange={e=>setDraft(v=>({...v,end:e.target.value}))}/></label></div><div className="tt2-field-row"><label className="tt2-field">Kind<select value={draft.category} onChange={e=>setDraft(v=>({...v,category:e.target.value as Category}))}>{Object.entries(categoryLabels).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label><label className="tt2-field">Repeats<select value={draft.days} onChange={e=>setDraft(v=>({...v,days:e.target.value as Repeat}))}><option value="everyday">Every day</option><option value="weekdays">Weekdays</option><option value="weekend">Weekends</option></select></label></div><div className="tt2-field-row"><label className="tt2-field">Subject (optional)<select value={draft.subjectId??""} onChange={e=>{const subjectId=e.target.value?Number(e.target.value):undefined;setDraft(v=>({...v,subjectId,resourceId:v.resourceId&&resources.find(r=>r.id===v.resourceId)?.subjectId!==subjectId?undefined:v.resourceId}));}}><option value="">No subject linked</option>{subjects.map(subject=><option key={subject.id} value={subject.id}>{subject.name}</option>)}</select></label><label className="tt2-field">Study resource (optional)<select value={draft.resourceId??""} onChange={e=>{const resource=resources.find(r=>r.id===e.target.value);setDraft(v=>({...v,resourceId:resource?.id||undefined,subjectId:resource?.subjectId??v.subjectId}));}}><option value="">No resource linked</option>{availableResources.map(resource=><option key={resource.id} value={resource.id}>{resource.title} · {resource.type}</option>)}</select></label></div><p className="tt2-resource-hint"><Link2 size={14}/> Link a saved PDF, note, document or website. The block will show an <strong>Open work</strong> shortcut at the scheduled time.</p>{error&&<p className="tt2-error" role="alert">{error}</p>}<div className="tt2-modal-foot"><button className="tt2-secondary" onClick={()=>setFormOpen(false)}>Cancel</button><button className="tt2-primary" onClick={save}>{editingId?"Save changes":"Add to my day"}<ArrowRight size={15}/></button></div></section></div>}
 </main>;
}
