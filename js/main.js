const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* wave engine */
const WAVES = [];
const activeWaves = new Set();
function initWave(cv){
  const cfg = JSON.parse(cv.dataset.waves || '{}');
  const w = {cv, ctx: cv.getContext('2d'), cfg, seed: Math.random()*1000, W:0, H:0};
  const size = ()=>{
    const r = cv.getBoundingClientRect();
    const dpr = Math.min(devicePixelRatio||1, 2);
    w.W = Math.max(r.width, 10); w.H = Math.max(r.height, 10);
    cv.width = w.W*dpr; cv.height = w.H*dpr;
    w.ctx.setTransform(dpr,0,0,dpr,0,0);
    if(RM) drawWave(w, w.seed*1000);
  };
  size(); new ResizeObserver(size).observe(cv);
  WAVES.push(w); waveIO.observe(cv);
}
function drawWave(w, t){
  const {ctx, cfg} = w, W = w.W, H = w.H;
  const n = cfg.n || 10, amp = cfg.amp ?? 14;
  const y0 = (cfg.y0 ?? cfg.y ?? 0.6), y1 = (cfg.y1 ?? cfg.y ?? 0.6);
  const s0 = cfg.s0 ?? 0.35, s1 = cfg.s1 ?? 1;
  const gap = cfg.gap ?? 8;
  const bend = (cfg.bend ?? 0) * H;
  const op = cfg.op ?? 0.5, sw = cfg.thin ? 1 : 1.25;
  const T = t*0.00018*(cfg.spd||1) + w.seed;
  ctx.clearRect(0,0,W,H);
  const g = ctx.createLinearGradient(0,0,W,0);
  const c1 = cfg.c1||'#79C900', c2 = cfg.c2||'#12A46B';
  g.addColorStop(0, c1+'33'); g.addColorStop(.45, c1); g.addColorStop(1, c2);
  ctx.strokeStyle = g; ctx.lineWidth = sw;
  for(let i=0;i<n;i++){
    ctx.globalAlpha = Math.max(.14, op - i*(op*.5/n));
    const off = (i - (n-1)/2);
    ctx.beginPath();
    for(let x=-24; x<=W+24; x+=7){
      const u = Math.min(Math.max(x/W,0),1);
      const spread = (s0 + (s1-s0)*u) * gap;
      const base = (y0 + (y1-y0)*u) * H + bend*4*u*(1-u);
      let y = base + off*spread;
      if(cfg.dyn){
        // hero: ondulación más rica y espacial — armónicos múltiples + deriva vertical
        const env = .7 + .45*(1-u);   // amplitud fuerte en la zona visible (izq/centro)
        y += Math.sin(T*.55 + i*.4) * amp * .45                     // deriva lenta (flota)
           + amp * Math.sin(u*3.0 + T*1.6 + i*.5) * env             // onda larga primaria
           + amp * .42 * Math.sin(u*6.4 - T*1.1 + i*.8) * env       // ripple secundario
           + amp * .2 * Math.sin(u*12 + T*2.3 + i*1.1) * env;       // detalle fino
      } else {
        const wig = (.3 + .7*u);
        y += amp * Math.sin(u*4.6 + T*2.0 + i*.32) * wig
           + amp * .42 * Math.sin(u*9.2 - T*1.35 + i*.5) * wig;
      }
      x<=-23 ? ctx.moveTo(x,y) : ctx.lineTo(x,y);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}
const waveIO = new IntersectionObserver(es=>es.forEach(e=>{
  const w = WAVES.find(v=>v.cv===e.target); if(!w) return;
  e.isIntersecting ? activeWaves.add(w) : activeWaves.delete(w);
}),{threshold:.05});
try{ /* rafloop */
if(!RM){ (function loop(t){ activeWaves.forEach(w=>drawWave(w,t)); requestAnimationFrame(loop); })(0); }
}catch(_erafloop){}
document.querySelectorAll('canvas[data-waves]').forEach(cv=>{try{initWave(cv)}catch(e){}});
try{ /* herowaves */
const wa = document.getElementById('wavesA');
wa.dataset.waves = JSON.stringify({c1:'#79C900',c2:'#12A46B',n:11,amp:20,gap:28,y0:0.95,y1:0.18,bend:-0.12,s0:0.75,s1:1,thin:true,op:0.36,spd:4.6,dyn:true});
initWave(wa);
const wb = document.getElementById('wavesB');
wb.dataset.waves = JSON.stringify({c1:'#12A46B',c2:'#79C900',n:7,amp:17,gap:24,y0:0.7,y1:1.18,bend:0.06,s0:1,s1:0.55,thin:true,op:0.28,spd:4.0,dyn:true});
initWave(wb);
}catch(_eherowaves){}

/* odometer */
function odoRender(el, str){
  el.innerHTML = '';
  [...str].forEach(ch=>{
    if(/\d/.test(ch)){
      const d = document.createElement('span'); d.className='dg';
      const r = document.createElement('span'); r.className='reel';
      for(let i=0;i<10;i++){ const s=document.createElement('i'); s.textContent=i; r.appendChild(s); }
      r.style.transform = `translateY(${-ch*10}%)`;
      d.appendChild(r); el.appendChild(d);
    } else { const s = document.createElement('span'); s.textContent=ch; el.appendChild(s); }
  });
  el.dataset.cur = str;
}
function odoSet(el, str){
  const cur = el.dataset.cur || '';
  const same = cur.length===str.length && [...cur].every((c,i)=>/\d/.test(c)===/\d/.test(str[i]));
  if(!same){ odoRender(el,str); return; }
  const reels = el.querySelectorAll('.reel'); let ri=0;
  [...str].forEach(ch=>{ if(/\d/.test(ch)) reels[ri++].style.transform=`translateY(${-ch*10}%)`; });
  el.dataset.cur = str;
}
const fmtES = n => n.toLocaleString('es-AR');

try{ /* ticker */
const tick = document.getElementById('tick');
let tv = 2847;
odoRender(tick, fmtES(tv));
setInterval(()=>{ tv += Math.floor(Math.random()*3)+1; odoSet(tick, fmtES(tv)); }, 2600);
}catch(_eticker){}

try{ /* marquee */
const mt = document.getElementById('marqT');
mt.innerHTML += mt.innerHTML;
const stats = mt.querySelectorAll('.v.odo');
stats.forEach(v=>odoRender(v, fmtES(+v.dataset.c)));
setInterval(()=>{
  const half = stats.length/2;
  for(let i=0;i<half;i++){
    const nv = (+stats[i].dataset.c) + Math.floor(Math.random()*6)+1;
    stats[i].dataset.c = nv; stats[i+half].dataset.c = nv;
    odoSet(stats[i], fmtES(nv)); odoSet(stats[i+half], fmtES(nv));
  }
}, 2100);
}catch(_emarquee){}

try{ /* counters */
const cntIO = new IntersectionObserver(es=>es.forEach(e=>{
  if(!e.isIntersecting) return; cntIO.unobserve(e.target);
  const el = e.target, target = +el.dataset.target;
  if(RM){ odoRender(el, String(target)); return; }
  odoRender(el, String(0).padStart(String(target).length,'0'));
  const t0 = performance.now(), dur = 1300;
  (function step(now){ const p = Math.min((now-t0)/dur,1), eased = 1-Math.pow(1-p,3);
    odoSet(el, String(Math.round(target*eased)).padStart(String(target).length,'0'));
    if(p<1) requestAnimationFrame(step);
  })(t0);
}),{threshold:.5});
document.querySelectorAll('.cnt').forEach(c=>cntIO.observe(c));
}catch(_ecounters){}

try{ /* card 01: cuenta la ganancia real al entrar en viewport */
const plWin = document.getElementById('plWin');
if(plWin){
  const plIO = new IntersectionObserver(es=>es.forEach(e=>{
    if(!e.isIntersecting) return; plIO.unobserve(e.target);
    if(RM){ plWin.textContent='$ 8.370'; return; }
    const target=8370, t0=performance.now(), dur=1200;
    (function step(now){ const p=Math.min((now-t0)/dur,1), eased=1-Math.pow(1-p,3);
      plWin.textContent='$ '+Math.round(target*eased).toLocaleString('es-AR');
      if(p<1) requestAnimationFrame(step);
    })(t0);
  }),{threshold:.6});
  plIO.observe(plWin);
}
}catch(_eplwin){}

try{ /* card 02: stagger de las filas del ranking */
const rank = document.querySelector('.rank');
if(rank && !RM){
  const rows = rank.querySelectorAll('.rank-row');
  rank.classList.add('armed');
  const rkIO = new IntersectionObserver(es=>es.forEach(e=>{
    if(!e.isIntersecting) return; rkIO.unobserve(e.target);
    rows.forEach((r,i)=>setTimeout(()=>r.classList.add('in'), i*160));
  }),{threshold:.5});
  rkIO.observe(rank);
}
}catch(_erankstg){}

const io = new IntersectionObserver(es=>es.forEach(e=>{
  if(e.isIntersecting){ e.target.classList.add('in'); io.unobserve(e.target); }
}),{threshold:.12});
document.querySelectorAll('.rv,.stg,.sec-head').forEach(el=>io.observe(el));

const nav = document.getElementById('nav');
addEventListener('scroll',()=>nav.classList.toggle('scrolled',scrollY>8),{passive:true});

/* chat loop */
try{ /* chat */
const chatBody=document.getElementById('chatBody');
const m1=document.getElementById('m1'), m2=document.getElementById('m2'),
      m3=document.getElementById('m3'), m4=document.getElementById('m4'),
      typ=document.getElementById('typ'), btn=document.getElementById('approveBtn'),
      marginOdo=document.getElementById('marginOdo');
function chatScroll(){ if(chatBody) chatBody.scrollTo({top:chatBody.scrollHeight,behavior:'smooth'}); }
function scrollMsgIntoView(el){
  // deja el mensaje recién llegado abajo en la ventana (como un chat real), sin empujarlo fuera
  if(!chatBody||!el) return;
  const target = el.offsetTop + el.offsetHeight - chatBody.clientHeight + 16;
  chatBody.scrollTo({top: Math.max(0, target), behavior:'smooth'});
}
function reveal(el){ el.classList.add('show'); scrollMsgIntoView(el); }
function runChat(){
  typ.classList.remove('show'); btn.classList.remove('tapped');
  odoRender(marginOdo,'$ 0');
  if(chatBody) chatBody.scrollTo({top:0,behavior:'auto'});
  // primer mensaje YA visible
  m1.classList.add('show');
  [m2,m3,m4].forEach(m=>m.classList.remove('show'));
  const T=[];
  // m2 (mensaje del usuario): aparece abajo en la ventana y se queda ~2.4s para leerse tranquilo
  T.push(setTimeout(()=>{ m2.classList.add('show'); scrollMsgIntoView(m2); }, 1500));
  // typing recién a los 3.9s -> el mensaje verde tuvo 2.4s solo en pantalla
  T.push(setTimeout(()=>{ typ.classList.add('show'); scrollMsgIntoView(typ); }, 3900));
  // m3 (P&L, alto): scroll a su inicio para ver el encabezado
  T.push(setTimeout(()=>{ typ.classList.remove('show'); m3.classList.add('show');
    if(chatBody) chatBody.scrollTo({top: Math.max(0, m3.offsetTop - 14), behavior:'smooth'});
    const t0=performance.now(), dur=1100, target=8370;
    (function step(now){ const p=Math.min((now-t0)/dur,1), e=1-Math.pow(1-p,3);
      odoSet(marginOdo, '$ '+(Math.round(target*e/10)*10).toLocaleString('es-AR'));
      if(p<1) requestAnimationFrame(step);
    })(t0);
  }, 5300));
  // botón aprobar
  T.push(setTimeout(()=>{ btn.classList.add('tapped'); chatScroll(); }, 7800));
  T.push(setTimeout(()=>{ m4.classList.add('show'); scrollMsgIntoView(m4); }, 8500));
  // pausa para leer la confirmación, luego reinicia
  T.push(setTimeout(runChat, 11200));
}
if(RM){ [m1,m2,m3,m4].forEach(m=>m.classList.add('show')); odoRender(marginOdo,'$ 8.370'); }
else runChat();
}catch(_echat){}


/* loop stepper */
if(!RM){
  const steps=[...document.querySelectorAll('#loop .lstep')];
  const links=[...document.querySelectorAll('#loop .llink')];
  const setFill = idx => links.forEach((l,i)=> l.classList.toggle('filled', i<idx));
  let si=0;
  setInterval(()=>{
    steps[si].classList.remove('on');
    if(si===steps.length-1){ si=0; links.forEach(l=>l.classList.remove('filled')); }
    else si++;
    steps[si].classList.add('on');
    setFill(si);
  }, 1400);
}

/* ===== ask-anything typing loop ===== */
try{ /* asktyping */
const askPhrases = ['¿Cuál fue mi margen real esta semana?','¿Quién bajó precios en mis productos top?','¿Cuánto stock me queda del más vendido?','¿Me conviene igualar a la competencia?'];
const askEl = document.getElementById('askType');
if(askEl){
  if(RM){ askEl.textContent = askPhrases[0]; }
  else {
    let pi=0, ci=0, del=false;
    (function type(){
      const cur = askPhrases[pi];
      askEl.textContent = cur.slice(0,ci);
      if(!del){ if(ci++<cur.length) return setTimeout(type,45+Math.random()*45); del=true; return setTimeout(type,1900); }
      if(ci-->0) return setTimeout(type,22);
      del=false; pi=(pi+1)%askPhrases.length; return setTimeout(type,350);
    })();
  }
}
}catch(_easktyping){}

/* ===== KPI + case-study counters ===== */
try{ /* kpicount */
const kcIO = new IntersectionObserver(es=>es.forEach(e=>{
  if(!e.isIntersecting) return; kcIO.unobserve(e.target);
  const el=e.target, target=+el.dataset.target, suf=el.dataset.suf||'';
  const render=v=>{ el.textContent=v; if(suf && !el.nextElementSibling){ const s=document.createElement('span'); s.className='suf'; s.textContent=suf; el.after(s);} };
  if(!el.dataset.sufdone && suf){ const s=document.createElement('span'); s.className='suf'; s.textContent=suf; el.after(s); el.dataset.sufdone=1; }
  if(RM){ el.textContent=target; return; }
  const t0=performance.now(), dur=1300;
  (function step(now){ const p=Math.min((now-t0)/dur,1), e2=1-Math.pow(1-p,3);
    el.textContent=Math.round(target*e2); if(p<1) requestAnimationFrame(step);
  })(t0);
}),{threshold:.5});
document.querySelectorAll('.kc').forEach(k=>kcIO.observe(k));
}catch(_ekpicount){}

/* KPI underline reveal */
const kb=document.getElementById('kpis');
if(kb){ const kbIO=new IntersectionObserver(es=>es.forEach(e=>{ if(e.isIntersecting){ e.target.querySelectorAll('.kpi').forEach((k,i)=>setTimeout(()=>k.classList.add('in'),i*90)); kbIO.unobserve(e.target); }}),{threshold:.3}); kbIO.observe(kb); }

/* ===== FAQ accordion ===== */
document.querySelectorAll('#faq .fitem').forEach(item=>{
  const q=item.querySelector('.fq'), a=item.querySelector('.fa');
  q.setAttribute('aria-expanded','false');
  q.addEventListener('click',()=>{
    const open=item.classList.contains('open');
    document.querySelectorAll('#faq .fitem.open').forEach(o=>{ o.classList.remove('open'); o.querySelector('.fa').style.maxHeight=null; });
    document.querySelectorAll('#faq .fq').forEach(b=>b.setAttribute('aria-expanded','false'));
    if(!open){ item.classList.add('open'); a.style.maxHeight=a.scrollHeight+'px'; q.setAttribute('aria-expanded','true'); }
  });
});

/* ===== magnetic lime buttons (wow) ===== */
if(!RM && matchMedia('(pointer:fine)').matches){
  document.querySelectorAll('.btn-lime').forEach(b=>{
    b.addEventListener('pointermove',e=>{
      const r=b.getBoundingClientRect();
      const dx=(e.clientX-(r.left+r.width/2))/r.width, dy=(e.clientY-(r.top+r.height/2))/r.height;
      b.style.transform=`translate(${dx*6}px,${dy*6}px)`;
    });
    b.addEventListener('pointerleave',()=>{ b.style.transform=''; });
  });
}

/* ===== hero phone subtle parallax on scroll (wow) ===== */
if(!RM){
  const phone=document.querySelector('.phone');
  if(phone){ addEventListener('scroll',()=>{ const y=Math.min(scrollY,600); phone.style.transform=`translateY(${y*0.03}px)`; },{passive:true}); }
}


/* ===== mobile menu ===== */
try{ /* burgermenu */
const burger=document.getElementById('burger'), mmenu=document.getElementById('mmenu');
if(burger&&mmenu){
  const close=()=>{ mmenu.classList.remove('open'); burger.classList.remove('x'); burger.setAttribute('aria-expanded','false'); document.body.style.overflow=''; };
  burger.addEventListener('click',()=>{
    const willOpen=!mmenu.classList.contains('open');
    mmenu.classList.toggle('open',willOpen); burger.classList.toggle('x',willOpen);
    burger.setAttribute('aria-expanded',String(willOpen));
    document.body.style.overflow=willOpen?'hidden':'';
  });
  mmenu.querySelectorAll('a').forEach(a=>a.addEventListener('click',close));
  addEventListener('resize',()=>{ if(innerWidth>860) close(); });
}
}catch(_eburgermenu){}
