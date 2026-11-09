require('dotenv').config();
const express=require('express'),fs=require('fs'),path=require('path'),crypto=require('crypto');
const bcrypt=require('bcryptjs'),jwt=require('jsonwebtoken'),nodemailer=require('nodemailer'),rateLimit=require('express-rate-limit');
const app=express();app.set('trust proxy',1);app.use(express.json({limit:'8mb'}));
const PORT=process.env.PORT||3000,SECRET=process.env.JWT_SECRET||'dev-secret-change-me';
const MODEL=process.env.ANTHROPIC_MODEL||'claude-sonnet-5-5';
const DB=path.join(process.env.DATA_DIR||__dirname,'data.json');
let db={users:{}};try{db=JSON.parse(fs.readFileSync(DB,'utf8'))}catch(e){}
const persist=()=>{try{fs.writeFileSync(DB,JSON.stringify(db))}catch(e){console.error('persist failed',e.message)}};
const mailer=process.env.SMTP_HOST?nodemailer.createTransport({host:process.env.SMTP_HOST,port:+(process.env.SMTP_PORT||465),secure:+(process.env.SMTP_PORT||465)===465,auth:{user:process.env.SMTP_USER,pass:process.env.SMTP_PASS}}):null;
async function sendCode(email,code){
  if(!mailer){console.log(`[DEV] verification code for ${email}: ${code}`);return}
  await mailer.sendMail({from:process.env.MAIL_FROM||process.env.SMTP_USER,to:email,subject:`Your Kofi verification code: ${code}`,
  text:`Akwaaba! Your Kofi code is ${code}. It expires in 10 minutes.`,
  html:`<div style="font-family:Arial;max-width:420px;margin:auto;padding:24px;border-radius:14px;background:#0b0b12;color:#fff"><h2 style="color:#e11d2e">🇬🇭 Kofi</h2><p>Akwaaba! Use this code to verify your email:</p><p style="font-size:34px;letter-spacing:8px;font-weight:bold;color:#60a5fa">${code}</p><p style="color:#999">Expires in 10 minutes. If this wasn't you, ignore this email.</p></div>`});
}
const lim=rateLimit({windowMs:15*60*1000,max:40,standardHeaders:true,legacyHeaders:false});
const norm=e=>String(e||'').trim().toLowerCase(),okMail=e=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
const token=e=>jwt.sign({e},SECRET,{expiresIn:'30d'});
const wrap=f=>(req,res)=>f(req,res).catch(e=>{console.error(e);res.status(500).json({error:e.message||'Server error'})});
function auth(req,res,next){try{const t=(req.headers.authorization||'').replace('Bearer ','');req.email=jwt.verify(t,SECRET).e;if(!db.users[req.email])throw 0;next()}catch(e){res.status(401).json({error:'Please log in again'})}}
async function issue(u){u.code=String(crypto.randomInt(100000,1000000));u.codeExp=Date.now()+10*60*1000;u.tries=0;u.lastSent=Date.now();persist();await sendCode(u.email,u.code)}
const devCode=u=>process.env.DEV_SHOW_CODE==='true'?{devCode:u.code}:{};
app.post('/api/signup',lim,wrap(async(req,res)=>{
  const email=norm(req.body.email),pw=String(req.body.password||'');
  if(!okMail(email))return res.status(400).json({error:'Enter a valid email'});
  if(pw.length<6)return res.status(400).json({error:'Password needs 6+ characters'});
  const ex=db.users[email];if(ex&&ex.verified)return res.status(409).json({error:'Account exists — log in'});
  const u=db.users[email]={email,hash:await bcrypt.hash(pw,10),verified:false,data:null};db.users[email]=u;
  try{await issue(u)}catch(e){console.error('mail error',e.message);return res.status(502).json({error:'Could not send the email. Check SMTP settings.'})}
  res.json({ok:true,...devCode(u)})}));
app.post('/api/resend',lim,wrap(async(req,res)=>{const u=db.users[norm(req.body.email)];
  if(!u||u.verified)return res.status(400).json({error:'Nothing to resend'});
  if(Date.now()-u.lastSent<30000)return res.status(429).json({error:'Wait 30 seconds before resending'});
  await issue(u);res.json({ok:true,...devCode(u)})}));
app.post('/api/verify',lim,wrap(async(req,res)=>{const u=db.users[norm(req.body.email)];
  if(!u)return res.status(400).json({error:'Unknown email'});
  if(u.tries>=5)return res.status(429).json({error:'Too many tries — resend a new code'});
  if(Date.now()>u.codeExp)return res.status(400).json({error:'Code expired — resend'});
  if(String(req.body.code).trim()!==u.code){u.tries++;persist();return res.status(400).json({error:'Wrong code'})}
  u.verified=true;u.code=null;persist();res.json({token:token(u.email)})}));
app.post('/api/login',lim,wrap(async(req,res)=>{const u=db.users[norm(req.body.email)];
  if(!u||!(await bcrypt.compare(String(req.body.password||''),u.hash)))return res.status(401).json({error:'Wrong email or password'});
  if(!u.verified)return res.status(403).json({error:'Email not verified — sign up again to get a new code'});
  res.json({token:token(u.email)})}));
app.get('/api/data',auth,(req,res)=>res.json({data:db.users[req.email].data}));
app.put('/api/data',auth,(req,res)=>{db.users[req.email].data=req.body.data;persist();res.json({ok:true})});
async function claude(messages,system,max=700,tools){
  if(!process.env.ANTHROPIC_API_KEY)throw new Error('AI key not configured on the server');
  const r=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'content-type':'application/json','x-api-key':process.env.ANTHROPIC_API_KEY,'anthropic-version':'2023-06-01'},body:JSON.stringify({model:MODEL,max_tokens:max,system,messages,...(tools?{tools}:{})})});
  const j=await r.json();if(!r.ok)throw new Error((j.error&&j.error.message)||'AI error');
  return j.content.filter(b=>b.type==='text').map(b=>b.text).join('\n').trim()}
const KOFI="You are Kofi, a friendly AI campus planner for Ghanaian university students. Your name is Kofi; say so if asked. Help balance classes, partying, personal study and checking flyers. Be brief, warm and practical, with light Ghanaian flavour. Never double-book the student.";
app.post('/api/chat',auth,rateLimit({windowMs:60000,max:20}),wrap(async(req,res)=>{
  const reply=await claude([{role:'user',content:`Student data: ${String(req.body.context||'').slice(0,3000)}\n\nStudent says: ${String(req.body.message||'').slice(0,1500)}`}],KOFI,600);res.json({reply})}));
app.post('/api/verify-flyer',auth,rateLimit({windowMs:60000,max:8}),wrap(async(req,res)=>{
  const c=[];const im=req.body.image;
  if(im&&/^image\/(jpeg|png|webp|gif)$/.test(im.mediaType))c.push({type:'image',source:{type:'base64',media_type:im.mediaType,data:im.data}});
  c.push({type:'text',text:`Check whether this flyer/poster/announcement is legitimate. Extra text from student: "${String(req.body.text||'').slice(0,2000)}". Use web search to look for the organiser, the event or the claim on official pages. Reply with: 1) Verdict: LIKELY LEGIT / SUSPICIOUS / UNVERIFIED. 2) Red flags (urgent MoMo payments to personal numbers, no organiser, fake logos, too-good prizes). 3) Sources you actually found (name + URL) or say none found. Never invent a source. Max 150 words.`});
  const reply=await claude([{role:'user',content:c}],KOFI+' You are also a flyer fraud-checker.',900,[{type:'web_search_20250305',name:'web_search',max_uses:4}]);res.json({reply})}));
app.get('/api/news',auth,wrap(async(req,res)=>{
  const q=String(req.query.q||'').slice(0,100);if(!q)return res.json({items:[]});
  const r=await fetch(`https://news.google.com/rss/search?q=${encodeURIComponent(q+' when:'+(req.query.when||'1y'))}&hl=en-GH&gl=GH&ceid=GH:en`);
  const xml=await r.text();
  const items=[...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0,30).map(m=>{
    const g=t=>((m[1].match(new RegExp('<'+t+'[^>]*>([\\s\\S]*?)</'+t+'>'))||[])[1]||'').replace(/<!\[CDATA\[|\]\]>/g,'').trim();
    const su=(m[1].match(/<source[^>]*url="([^"]+)"/)||[])[1]||'';
    return{title:g('title').replace(/&amp;/g,'&').replace(/&#39;/g,"'").replace(/&quot;/g,'"'),link:g('link'),date:g('pubDate'),source:g('source'),official:/\.edu\.gh|\.gov\.gh/i.test(su)}});
  res.json({items})}));
app.use(express.static(path.join(__dirname,'public')));
app.listen(PORT,()=>console.log(`Kofi running on http://localhost:${PORT}`+(mailer?'':'  (no SMTP: codes print here)')));
