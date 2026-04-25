'use strict';

// ═══════════════════════════════════════════════════════════
//  UTILITIES
// ═══════════════════════════════════════════════════════════

async function sha256(str) {
  try {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('').slice(0,16);
  } catch { return 'N/A'; }
}

function flagEmoji(cc) {
  if (!cc || cc.length !== 2) return '';
  return String.fromCodePoint(...[...cc.toUpperCase()].map(c => 0x1F1E0 + c.charCodeAt(0) - 65));
}

function safeStr(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function prettyJSON(obj) {
  return JSON.stringify(obj, null, 2)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/^(\s*)"([^"]+)":/mg, '$1<span class="jk">"$2"</span>:')
    .replace(/: "([^"]*)"/g, ': <span class="jv">"$1"</span>')
    .replace(/: (true|false|null)/g, ': <span class="jb">$1</span>')
    .replace(/: (-?\d+\.?\d*)$/mg, ': <span class="jn">$1</span>');
}

function parseBrowserFromUA(ua) {
  const rules = [
    [/Edg\/([\d.]+)/, 'Edge'], [/OPR\/([\d.]+)/, 'Opera'],
    [/SamsungBrowser\/([\d.]+)/, 'Samsung Browser'],
    [/UCBrowser\/([\d.]+)/, 'UC Browser'], [/YaBrowser\/([\d.]+)/, 'Yandex'],
    [/CriOS\/([\d.]+)/, 'Chrome (iOS)'], [/FxiOS\/([\d.]+)/, 'Firefox (iOS)'],
    [/Chrome\/([\d.]+)/, 'Chrome'], [/Firefox\/([\d.]+)/, 'Firefox'],
    [/Version\/([\d.]+).*Safari/, 'Safari'], [/rv:([\d.]+).*Trident/, 'Internet Explorer'],
  ];
  for (const [re, name] of rules) {
    const m = ua.match(re);
    if (m) return { name, version: m[1].split('.')[0], fullVersion: m[1] };
  }
  return { name: 'Unknown', version: '?', fullVersion: '?' };
}

function parseOSFromUA(ua) {
  if (/Windows NT 10|Windows NT 11/.test(ua)) return 'Windows 10 / 11';
  if (/Windows NT 6\.3/.test(ua)) return 'Windows 8.1';
  if (/Windows NT 6\.2/.test(ua)) return 'Windows 8';
  if (/Windows NT 6\.1/.test(ua)) return 'Windows 7';
  if (/CrOS/.test(ua)) return 'ChromeOS';
  const android = ua.match(/Android ([\d.]+)/);
  if (android) return `Android ${android[1]} \u26a0\ufe0f UA-capped`;
  const ios = ua.match(/iPhone OS ([\d_]+)/);
  if (ios) return `iOS ${ios[1].replace(/_/g,'.')}`;
  const ipad = ua.match(/iPad.*OS ([\d_]+)/);
  if (ipad) return `iPadOS ${ipad[1].replace(/_/g,'.')}`;
  const mac = ua.match(/Mac OS X ([\d_]+)/);
  if (mac) return `macOS ${mac[1].replace(/_/g,'.')}`;
  if (/Linux/.test(ua)) return 'Linux';
  return navigator.platform || 'Unknown';
}

// UA Client Hints resolution — fixes Android 10 cap, Windows 10/11 split
function resolveOS(ua, hints) {
  if (!hints || !hints.platform) return parseOSFromUA(ua);
  const { platform, platformVersion = '', model = '', mobile } = hints;
  if (platform === 'Android') {
    const v = platformVersion.split('.')[0] || '?';
    const dev = model && model !== 'K' ? ` \u2014 ${model}` : '';
    return `Android ${v}${dev}`;
  }
  if (platform === 'Windows') {
    // Chrome reports NT build as platformVersion; >=13 = Win11
    return parseInt(platformVersion.split('.')[0]) >= 13 ? 'Windows 11' : 'Windows 10';
  }
  if (platform === 'macOS') return `macOS ${platformVersion}`.trim();
  if (platform === 'iOS')   return `iOS ${platformVersion.split('.')[0]}`.trim();
  if (platform === 'Chrome OS' || platform === 'ChromeOS') return 'ChromeOS';
  if (platform === 'Linux') return `Linux${mobile ? ' (mobile)' : ''}`;
  return `${platform} ${platformVersion}`.trim();
}

function resolveBrowser(ua, hints) {
  if (!hints?.fullVersionList?.length) return parseBrowserFromUA(ua);
  const real = hints.fullVersionList.filter(b => !b.brand.includes('Not'));
  const best = real.find(b => b.brand !== 'Chromium') || real[0];
  if (best) return { name: best.brand, version: best.version.split('.')[0], fullVersion: best.version };
  return parseBrowserFromUA(ua);
}

// ═══════════════════════════════════════════════════════════
//  DATA COLLECTORS
// ═══════════════════════════════════════════════════════════

async function fetchIPData() {
  try {
    const r = await fetch('https://ipwho.is/', { cache: 'no-store' });
    if (r.ok) { const d = await r.json(); if (d.success !== false && d.ip) return { ...d, _src: 'ipwho.is' }; }
  } catch {}
  try {
    const r = await fetch('https://ipapi.co/json/', { cache: 'no-store' });
    if (r.ok) {
      const d = await r.json();
      if (!d.error && d.ip) return {
        ip: d.ip, type: d.version || 'IPv4', country: d.country_name,
        country_code: d.country_code, city: d.city, region: d.region,
        latitude: d.latitude, longitude: d.longitude, postal: d.postal,
        is_eu: d.in_eu ?? null,
        flag: { emoji: flagEmoji(d.country_code) },
        connection: { isp: d.org || 'N/A', asn: d.asn || 'N/A' },
        timezone: { id: d.timezone }, _src: 'ipapi.co', _raw: d,
      };
    }
  } catch {}
  try {
    const r = await fetch('https://free.freeipapi.com/api/json', { cache: 'no-store' });
    if (r.ok) {
      const d = await r.json();
      if (d.ipAddress) return {
        ip: d.ipAddress, type: d.ipVersion === 4 ? 'IPv4' : 'IPv6',
        country: d.countryName, country_code: d.countryCode,
        city: d.cityName, region: d.regionName,
        latitude: d.latitude, longitude: d.longitude, postal: null, is_eu: null,
        flag: { emoji: flagEmoji(d.countryCode) },
        connection: { isp: 'N/A', asn: 'N/A' },
        timezone: { id: d.timeZone }, _src: 'free.freeipapi.com', _raw: d,
      };
    }
  } catch {}
  return null;
}

async function getUAClientHints() {
  if (!navigator.userAgentData) return null;
  try {
    return await navigator.userAgentData.getHighEntropyValues([
      'architecture','bitness','brands','fullVersionList','mobile','model','platform','platformVersion',
    ]);
  } catch { return null; }
}

async function fetchRequestHeaders() {
  for (const url of ['https://httpbin.org/headers', 'https://httpbingo.org/headers']) {
    try {
      const r = await fetch(url, { cache: 'no-store' });
      if (r.ok) { const d = await r.json(); return { ...d, _src: url }; }
    } catch {}
  }
  return null;
}

async function getCanvasFP() {
  try {
    const c = document.createElement('canvas'); c.width = 300; c.height = 70;
    const ctx = c.getContext('2d');
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#f80'; ctx.fillRect(0, 0, 300, 70);
    ctx.fillStyle = '#09f'; ctx.font = 'bold 20px Arial';
    ctx.fillText('mvadel \uD83C\uDFAF fingerprint', 8, 40);
    ctx.fillStyle = 'rgba(80,240,100,.9)'; ctx.font = '13px Courier New';
    ctx.fillText('\uD83D\uDD0D canvas test 2026', 8, 60);
    ctx.beginPath(); ctx.arc(270, 35, 25, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(200,50,255,.6)'; ctx.fill();
    return await sha256(c.toDataURL());
  } catch { return 'blocked'; }
}

async function getMathFP() {
  try {
    return await sha256([
      Math.acos(0.123456789), Math.acosh(123.456789), Math.asin(0.123456789),
      Math.asinh(123.456789), Math.atan(0.123456789), Math.atanh(0.12345),
      Math.cbrt(123.456789), Math.cos(0.123456789), Math.cosh(0.123456789),
      Math.exp(0.123456789), Math.expm1(0.123456789),
      Math.hypot(0.123456789, 1.23456789), Math.log(123.456789),
      Math.log1p(0.123456789), Math.sin(0.123456789), Math.sinh(0.123456789),
      Math.sqrt(0.123456789), Math.tan(0.123456789), Math.tanh(0.123456789),
    ].join(','));
  } catch { return 'N/A'; }
}

function getCSSFeatures() {
  const mq = q => window.matchMedia(q).matches;
  return {
    colorGamut: mq('(color-gamut: rec2020)') ? 'rec2020' : mq('(color-gamut: p3)') ? 'P3' : 'sRGB',
    pointer: mq('(pointer: fine)') ? 'Fine' : mq('(pointer: coarse)') ? 'Coarse' : 'None',
    anyPointer: mq('(any-pointer: fine)') ? 'Fine' : mq('(any-pointer: coarse)') ? 'Coarse' : 'None',
    hover: mq('(hover: hover)'),
    prefersContrast: mq('(prefers-contrast: more)') ? 'More' : mq('(prefers-contrast: less)') ? 'Less' : 'No pref',
    invertedColors: mq('(inverted-colors: inverted)'),
    displayMode: window.matchMedia('(display-mode: standalone)').matches ? 'Standalone (PWA)' :
                 window.matchMedia('(display-mode: fullscreen)').matches ? 'Fullscreen' : 'Browser tab',
  };
}

function getWebGLInfo() {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') || c.getContext('webgl') || c.getContext('experimental-webgl');
    if (!gl) return null;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return {
      vendor:   ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL)   : gl.getParameter(gl.VENDOR),
      renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
      version:  gl.getParameter(gl.VERSION),
      glsl:     gl.getParameter(gl.SHADING_LANGUAGE_VERSION),
      maxTex:   gl.getParameter(gl.MAX_TEXTURE_SIZE),
      maxAA:    gl.getParameter(gl.MAX_SAMPLES) ?? 'N/A',
      extensions: gl.getSupportedExtensions()?.length || 0,
    };
  } catch { return null; }
}

async function getWebRTCIPs() {
  return new Promise(resolve => {
    try {
      const local = new Set(), pub = new Set();
      const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
      pc.createDataChannel('x');
      pc.createOffer().then(o => pc.setLocalDescription(o)).catch(() => resolve({ local:[], pub:[] }));
      pc.onicecandidate = e => {
        if (!e.candidate) { try{pc.close()}catch{} resolve({ local:[...local], pub:[...pub] }); return; }
        const m = e.candidate.candidate.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/);
        if (m && m[1] !== '0.0.0.0')
          /^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|169\.254\.)/.test(m[1]) ? local.add(m[1]) : pub.add(m[1]);
      };
      setTimeout(() => { try{pc.close()}catch{} resolve({ local:[...local], pub:[...pub] }); }, 4000);
    } catch { resolve({ local:[], pub:[] }); }
  });
}

async function getAudioFP() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return 'not supported';
    const ctx = new AudioCtx();
    const osc=ctx.createOscillator(), gain=ctx.createGain(),
          analyser=ctx.createAnalyser(), proc=ctx.createScriptProcessor(4096,1,1);
    gain.gain.value=0; osc.type='triangle'; osc.frequency.value=10000;
    osc.connect(analyser); analyser.connect(proc); proc.connect(gain); gain.connect(ctx.destination);
    osc.start(0);
    return new Promise(resolve => {
      proc.onaudioprocess = async ev => {
        const d = ev.inputBuffer.getChannelData(0).slice(0,500);
        const s = d.reduce((a,b)=>a+Math.abs(b),0).toFixed(10);
        osc.stop(); ctx.close(); resolve(await sha256(s));
      };
      setTimeout(()=>{ try{ctx.close()}catch{} resolve('timeout'); }, 3000);
    });
  } catch { return 'blocked'; }
}

function detectFonts() {
  const list = [
    'Arial','Helvetica','Times New Roman','Courier New','Georgia','Verdana',
    'Tahoma','Trebuchet MS','Impact','Comic Sans MS','Palatino','Garamond',
    'Monaco','Consolas','Segoe UI','Ubuntu','Cantarell','Roboto','Open Sans',
    'Fira Sans','Source Code Pro','Lucida Console','Menlo','DejaVu Sans',
    'Noto Sans','SF Pro','Helvetica Neue',
  ];
  try {
    const c=document.createElement('canvas'), ctx=c.getContext('2d');
    ctx.font='72px monospace';
    const base=ctx.measureText('mmmmwwwwMMMM').width;
    return list.filter(f=>{ctx.font=`72px '${f}',monospace`;return ctx.measureText('mmmmwwwwMMMM').width!==base;});
  } catch { return []; }
}

function getSpeechVoices() {
  return new Promise(resolve => {
    if (!window.speechSynthesis) return resolve([]);
    const v = speechSynthesis.getVoices();
    if (v.length) return resolve(v);
    let done=false;
    speechSynthesis.onvoiceschanged = () => { if(!done){done=true;resolve(speechSynthesis.getVoices());} };
    setTimeout(()=>{ if(!done){done=true;resolve(speechSynthesis.getVoices());} }, 1500);
  });
}

async function getMediaDevices() {
  try {
    const devs = await navigator.mediaDevices.enumerateDevices();
    const c = {};
    devs.forEach(d => { c[d.kind]=(c[d.kind]||0)+1; });
    return { counts: c, total: devs.length };
  } catch { return null; }
}

async function getBattery() {
  try {
    const b = await navigator.getBattery();
    return { level:Math.round(b.level*100), charging:b.charging, chargingTime:b.chargingTime, dischargingTime:b.dischargingTime };
  } catch { return null; }
}

function getNetworkInfo() {
  const conn = navigator.connection||navigator.mozConnection||navigator.webkitConnection;
  if (!conn) return null;
  return { effectiveType:conn.effectiveType, downlink:conn.downlink, rtt:conn.rtt, saveData:conn.saveData, type:conn.type };
}

function getStorageSupport() {
  const s={};
  try{localStorage.setItem('_t','1');localStorage.removeItem('_t');s.localStorage=true;}catch{s.localStorage=false;}
  try{sessionStorage.setItem('_t','1');sessionStorage.removeItem('_t');s.sessionStorage=true;}catch{s.sessionStorage=false;}
  s.cookies=navigator.cookieEnabled; s.indexedDB=!!window.indexedDB;
  s.sw='serviceWorker' in navigator; s.worker=!!window.Worker;
  s.wasm=typeof WebAssembly!=='undefined'; s.ws=typeof WebSocket!=='undefined';
  s.geo='geolocation' in navigator; s.notif='Notification' in window;
  s.clipboard='clipboard' in navigator; s.bluetooth='bluetooth' in navigator;
  s.usb='usb' in navigator; s.nfc='nfc' in navigator;
  s.wakeLock='wakeLock' in navigator; s.serial='serial' in navigator;
  s.xr='xr' in navigator; s.payment='PaymentRequest' in window;
  return s;
}

// ═══════════════════════════════════════════════════════════
//  SPEED TEST (Cloudflare)
// ═══════════════════════════════════════════════════════════

async function runSpeedTest(onUpdate) {
  const BYTES = 5 * 1024 * 1024;
  onUpdate({ phase:'ping' });
  let ping = null;
  try {
    const t=performance.now();
    await fetch(`https://speed.cloudflare.com/__down?bytes=0&t=${Date.now()}`,{cache:'no-store'});
    ping=Math.round(performance.now()-t);
  } catch {}

  onUpdate({ phase:'download', progress:0, mbps:0, ping });
  try {
    const start=performance.now();
    const r=await fetch(`https://speed.cloudflare.com/__down?bytes=${BYTES}&t=${Date.now()}`,{cache:'no-store'});
    const reader=r.body.getReader();
    let received=0;
    while(true) {
      const{done,value}=await reader.read();
      if(done) break;
      received+=value.length;
      const elapsed=(performance.now()-start)/1000;
      onUpdate({ phase:'download', progress:received/BYTES, mbps:(received*8)/elapsed/1e6, ping });
    }
    const elapsed=(performance.now()-start)/1000;
    onUpdate({ phase:'done', mbps:((received*8)/elapsed/1e6).toFixed(2), bytes:received, elapsed:elapsed.toFixed(1), ping });
  } catch(err) {
    onUpdate({ phase:'error', msg: err.message||'CORS or network error' });
  }
}

// ═══════════════════════════════════════════════════════════
//  UI HELPERS
// ═══════════════════════════════════════════════════════════

function setProgress(pct, label) {
  document.getElementById('progress-fill').style.width=pct+'%';
  document.getElementById('scan-pct').textContent=Math.round(pct)+'%';
  document.getElementById('scan-label').textContent=label;
}

function createCard(icon, title, fullWidth=false) {
  const card=document.createElement('div');
  card.className='card'+(fullWidth?' card-full':'');
  card.innerHTML=`<div class="card-header"><span class="card-icon">${icon}</span><span class="card-title">${safeStr(title)}</span></div><div class="card-body"></div>`;
  document.getElementById('main-grid').appendChild(card);
  return card.querySelector('.card-body');
}

function row(body, label, html) {
  const d=document.createElement('div'); d.className='row';
  d.innerHTML=`<span class="lbl">${label}</span><span class="val">${html}</span>`;
  body.appendChild(d);
}

function rawBlock(body, obj) {
  const wrap=document.createElement('div'); wrap.className='raw-wrap';
  const btn=document.createElement('button'); btn.className='toggle-btn';
  btn.textContent='\u25b6 Show raw response';
  const pre=document.createElement('pre'); pre.className='json-block'; pre.style.display='none';
  pre.innerHTML=prettyJSON(obj);
  btn.onclick=()=>{
    const open=pre.style.display==='none';
    pre.style.display=open?'block':'none';
    btn.textContent=(open?'\u25bc':'\u25b6')+' '+(open?'Hide':'Show')+' raw response';
  };
  wrap.appendChild(btn); wrap.appendChild(pre); body.appendChild(wrap);
}

function tag(text,cls){ return `<span class="tag tag-${cls}">${text}</span>`; }
function c(text,cls)  { return `<span class="${cls}">${text}</span>`; }
function fmt(n)       { return Number(n).toLocaleString(); }

// ═══════════════════════════════════════════════════════════
//  MAIN
// ═══════════════════════════════════════════════════════════

async function main() {
  const T0 = performance.now();
  const ua = navigator.userAgent;

  const sessionStart = Date.now();
  setInterval(()=>{ document.getElementById('timer').textContent='Session: '+Math.floor((Date.now()-sessionStart)/1000)+'s'; }, 1000);

  let visits=0;
  try{ visits=parseInt(localStorage.getItem('_mv_visits')||0)+1; localStorage.setItem('_mv_visits',visits); }catch{}
  if(visits>0) document.getElementById('visit-count').textContent=visits+(visits===1?' visit':' visits');

  setProgress(5,'⟳ Fetching network data…');

  const [ipData,canvasFP,webrtcResult,audioFP,battery,uaHints,reqHeaders,voices,mediaDev,mathFP] =
    await Promise.all([
      fetchIPData(), getCanvasFP(), getWebRTCIPs(), getAudioFP(),
      getBattery(), getUAClientHints(), fetchRequestHeaders(),
      getSpeechVoices(), getMediaDevices(), getMathFP(),
    ]);

  setProgress(82,'⟳ Analysing…');

  const browser = resolveBrowser(ua, uaHints);
  const os      = resolveOS(ua, uaHints);
  const webgl   = getWebGLInfo();
  const fonts   = detectFonts();
  const network = getNetworkInfo();
  const storage = getStorageSupport();
  const cssF    = getCSSFeatures();
  const tz      = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const tzOff   = -(new Date().getTimezoneOffset());

  const fpID = await sha256([ua,canvasFP,audioFP,mathFP,screen.width,screen.height,
    navigator.language,navigator.hardwareConcurrency,navigator.deviceMemory,
    webgl?.renderer||'',tz].join('|'));

  setProgress(96,'⟳ Rendering…');

  document.getElementById('s-ip').textContent      = ipData?.ip||'—';
  document.getElementById('s-loc').textContent     = ipData ? `${ipData.flag?.emoji||''} ${ipData.city||'?'}, ${ipData.country||'?'}` : 'Unknown';
  document.getElementById('s-browser').textContent = `${browser.name} ${browser.version}`;
  document.getElementById('s-os').textContent      = os;
  document.getElementById('s-fp').textContent      = fpID;
  document.getElementById('summary').style.display = 'grid';

  // ── 1. Network & Location ──────────────────────────────────────────────
  const netB = createCard('🌍','Network & Location',true);
  if (ipData) {
    row(netB,'Public IP',    c(ipData.ip,'blue')+(ipData.type?` <span class="dim">${ipData.type}</span>`:''));
    row(netB,'Country',      `${ipData.flag?.emoji||''} ${safeStr(ipData.country)} (${ipData.country_code})`);
    row(netB,'Region / City',`${safeStr(ipData.region||'?')}, ${safeStr(ipData.city||'?')}`);
    row(netB,'Coordinates',  `${Number(ipData.latitude).toFixed(4)}, ${Number(ipData.longitude).toFixed(4)} <span class="dim">\u00b150 km — IP-based</span>`);
    row(netB,'ISP / Org',    c(safeStr(ipData.connection?.isp||ipData.connection?.org||'N/A'),'orange'));
    row(netB,'ASN',          ipData.connection?.asn ? `AS${ipData.connection.asn}` : 'N/A');
    row(netB,'Timezone (IP)',ipData.timezone?.id||'N/A');
    if (ipData.is_eu===true)  row(netB,'EU Member',tag('Yes \u2014 GDPR applies','yellow'));
    if (ipData.is_eu===false) row(netB,'EU Member',tag('No','green'));
    if (ipData.postal) row(netB,'Postal Code',ipData.postal);
    row(netB,'Data Source',  `<span class="dim">${ipData._src||'?'}</span>`);
    if (ipData._raw) rawBlock(netB, ipData._raw);
  } else {
    row(netB,'IP Lookup',tag('All 3 APIs failed','red'));
  }
  if (webrtcResult.local.length||webrtcResult.pub.length) {
    if (webrtcResult.local.length) row(netB,'Local IP (WebRTC)',c(webrtcResult.local.join(', '),'red')+' '+tag('LEAK','red'));
    if (webrtcResult.pub.length)   row(netB,'Public via WebRTC',c(webrtcResult.pub.join(', '),'yellow')+' '+tag('VPN bypass risk','yellow'));
  } else {
    row(netB,'WebRTC Leak',tag('No local IP leaked','green'));
  }

  // ── 2. UA Client Hints ────────────────────────────────────────────────
  const uaB = createCard('🔬','User-Agent Client Hints');
  if (uaHints) {
    row(uaB,'Platform',         c(uaHints.platform||'N/A','orange'));
    row(uaB,'Platform Version', c(uaHints.platformVersion||'N/A','blue')+(uaHints.platform==='Android'?' '+tag('Real version — not UA-capped','green'):''));
    if (uaHints.model && uaHints.model!=='K') row(uaB,'Device Model',c(uaHints.model,'blue'));
    row(uaB,'Architecture',     uaHints.architecture||'N/A');
    row(uaB,'Bitness',          uaHints.bitness ? uaHints.bitness+'-bit' : 'N/A');
    row(uaB,'Mobile',           uaHints.mobile ? tag('Yes','yellow') : tag('No','green'));
    const brands = uaHints.fullVersionList?.filter(b=>!b.brand.includes('Not')).map(b=>`${safeStr(b.brand)} ${b.version}`).join('<br>') || 'N/A';
    row(uaB,'Full Browser List',`<span class="mono-sm">${brands}</span>`);
  } else {
    row(uaB,'Status', tag('API not available — Firefox / Safari / older Chrome','yellow'));
    row(uaB,'Note','UA Client Hints only works in Chrome/Edge 90+ on desktop & Android');
  }

  // ── 3. Browser & Runtime ──────────────────────────────────────────────
  const brB = createCard('🔭','Browser & Runtime');
  row(brB,'Browser',      c(`${browser.name} ${browser.version}`,'blue'));
  row(brB,'Full Version', browser.fullVersion||'N/A');
  row(brB,'Engine',       /Firefox/.test(ua)&&/Gecko/.test(ua)?'Gecko':/Trident/.test(ua)?'Trident':'Blink / WebKit');
  row(brB,'User Agent',   `<span class="mono-sm">${safeStr(ua)}</span>`);
  row(brB,'Language',     navigator.language);
  row(brB,'All Languages',navigator.languages?.join(', ')||'N/A');
  row(brB,'Do Not Track', navigator.doNotTrack==='1'?tag('Enabled','green'):navigator.doNotTrack==='0'?tag('Disabled','red'):tag('Unset','yellow'));
  row(brB,'Cookies',      navigator.cookieEnabled?tag('Enabled','yellow'):tag('Disabled','green'));
  row(brB,'Plugins',      navigator.plugins?.length>0?[...navigator.plugins].map(p=>safeStr(p.name)).join(', '):tag('None detected','green'));
  row(brB,'JS Engine',    typeof globalThis!=='undefined'?'ES2020+':'ES5');

  // ── 4. Device & System ────────────────────────────────────────────────
  const devB = createCard('💻','Device & System');
  row(devB,'OS',          c(os,'orange'));
  row(devB,'Platform',    safeStr(navigator.platform||'N/A'));
  row(devB,'CPU Cores',   navigator.hardwareConcurrency?c(`${navigator.hardwareConcurrency} logical cores`,'purple'):'N/A');
  row(devB,'Device Memory',navigator.deviceMemory?c(`\u2265 ${navigator.deviceMemory} GB`,'purple'):'N/A');
  row(devB,'Touch Points',navigator.maxTouchPoints>0?`${navigator.maxTouchPoints} ${tag('touch device','yellow')}`:`0 \u2014 non-touch`);
  row(devB,'Pointer',     cssF.pointer);
  row(devB,'Any Pointer', cssF.anyPointer);
  row(devB,'Hover',       cssF.hover?tag('Supports hover','green'):tag('No hover (touch)','yellow'));
  row(devB,'Online',      navigator.onLine?tag('Online','green'):tag('Offline','red'));
  if (battery) {
    row(devB,'Battery',   `${battery.level}% ${battery.charging?'\u26a1 Charging':'\uD83D\uDD0B Discharging'}`);
    if (!battery.charging&&battery.dischargingTime!==Infinity&&battery.dischargingTime>0) {
      const h=Math.floor(battery.dischargingTime/3600),m=Math.floor((battery.dischargingTime%3600)/60);
      row(devB,'Time Left',`~${h>0?h+'h ':''}${m}m`);
    }
  } else { row(devB,'Battery API',tag('Not available','yellow')); }

  // ── 5. Screen & Display ───────────────────────────────────────────────
  const scrB = createCard('\uD83D\uDDB5\uFE0F','Screen & Display');
  row(scrB,'Screen Size',   c(`${screen.width} \u00d7 ${screen.height} px`,'blue'));
  row(scrB,'Available Area',`${screen.availWidth} \u00d7 ${screen.availHeight} px`);
  row(scrB,'Viewport',      `${window.innerWidth} \u00d7 ${window.innerHeight} px`);
  row(scrB,'Outer Window',  `${window.outerWidth} \u00d7 ${window.outerHeight} px`);
  row(scrB,'Pixel Ratio',   `${window.devicePixelRatio}\u00d7 ${window.devicePixelRatio>1?tag('HiDPI / Retina','blue'):''}`);
  row(scrB,'Color Depth',   `${screen.colorDepth}-bit`);
  row(scrB,'Color Gamut',   c(cssF.colorGamut,'green'));
  row(scrB,'Orientation',   screen.orientation?.type||'N/A');
  row(scrB,'Color Scheme',  window.matchMedia('(prefers-color-scheme: dark)').matches?'\uD83C\uDF19 Dark mode':'\u2600\uFE0F Light mode');
  row(scrB,'Pref. Contrast',cssF.prefersContrast);
  row(scrB,'Inverted Colors',cssF.invertedColors?tag('Yes','yellow'):'No');
  row(scrB,'Reduced Motion',window.matchMedia('(prefers-reduced-motion: reduce)').matches?tag('Preferred','yellow'):'Not requested');
  row(scrB,'HDR',           window.matchMedia('(dynamic-range: high)').matches?tag('HDR display','green'):'Standard range');
  row(scrB,'Display Mode',  cssF.displayMode);

  // ── 6. Speed Test ─────────────────────────────────────────────────────
  const spdB = createCard('\uD83D\uDE80','Speed Test');
  const spdDisp = document.createElement('div'); spdDisp.className='speed-display';
  spdDisp.innerHTML=`<span id="spd-val" style="font-size:36px;font-weight:700;color:var(--g)">—</span> <span style="font-size:12px;color:var(--mu)">Mbps</span>`;
  spdB.appendChild(spdDisp);
  const spdBar = document.createElement('div'); spdBar.className='speed-bar-wrap';
  spdBar.innerHTML=`<div class="speed-bar-bg"><div id="spd-bar" class="speed-bar-fill"></div></div>`;
  spdB.appendChild(spdBar);
  row(spdB,'Latency',  '<span id="spd-ping">—</span>');
  row(spdB,'Downloaded','<span id="spd-bytes">—</span>');
  row(spdB,'Test Time', '<span id="spd-time">—</span>');
  row(spdB,'Provider',  '<span class="dim">Cloudflare (speed.cloudflare.com)</span>');
  const spdBtn = document.createElement('button');
  spdBtn.className='speed-run-btn'; spdBtn.id='spd-btn'; spdBtn.textContent='\u25b6 Run Speed Test';
  spdBtn.onclick = async () => {
    spdBtn.disabled=true; spdBtn.textContent='\u27f3 Testing\u2026';
    await runSpeedTest(({phase,progress=0,mbps=0,ping,bytes,elapsed,msg})=>{
      const vEl=document.getElementById('spd-val');
      const bEl=document.getElementById('spd-bar');
      if(phase==='ping')     { document.getElementById('spd-ping').textContent='measuring\u2026'; }
      if(phase==='download') { if(vEl)vEl.textContent=Number(mbps).toFixed(1); if(bEl)bEl.style.width=Math.min(progress*100,100)+'%'; if(ping)document.getElementById('spd-ping').textContent=ping+' ms'; }
      if(phase==='done')     { if(vEl)vEl.textContent=mbps; if(bEl)bEl.style.width='100%'; if(bytes)document.getElementById('spd-bytes').textContent=(bytes/1048576).toFixed(1)+' MB'; if(elapsed)document.getElementById('spd-time').textContent=elapsed+'s'; spdBtn.disabled=false; spdBtn.textContent='\u21ba Run Again'; }
      if(phase==='error')    { if(vEl)vEl.textContent='ERR'; row(spdB,'Error',`<span class="red">${safeStr(msg||'Failed')}</span>`); spdBtn.disabled=false; spdBtn.textContent='\u21ba Retry'; }
    });
  };
  spdB.appendChild(spdBtn);

  // ── 7. Connection ─────────────────────────────────────────────────────
  const connB = createCard('\uD83D\uDCE1','Connection');
  if (network) {
    row(connB,'Effective Type', c((network.effectiveType||'N/A').toUpperCase(),'green'));
    row(connB,'Physical Type',  network.type||'N/A');
    row(connB,'Downlink (est.)',network.downlink!=null?`~${network.downlink} Mbps <span class="dim">(browser estimate)</span>`:'N/A');
    row(connB,'RTT (est.)',     network.rtt!=null?`${network.rtt} ms`:'N/A');
    row(connB,'Save Data',      network.saveData?tag('Enabled','yellow'):tag('Off','green'));
  } else {
    row(connB,'Network Info API',tag('Not supported (Firefox/Safari)','yellow'));
  }
  row(connB,'Protocol',        location.protocol==='https:'?tag('HTTPS \u2713','green'):tag('HTTP','red'));
  row(connB,'Secure Context',  window.isSecureContext?tag('Yes','green'):tag('No','red'));
  row(connB,'Cross-Origin Iso',window.crossOriginIsolated?tag('Isolated','green'):tag('No','yellow'));
  row(connB,'Referrer Policy', (document.referrerPolicy||'N/A'));

  // ── 8. HTTP Request Inspector ─────────────────────────────────────────
  const httpB = createCard('\uD83D\uDCE8','HTTP Request Inspector — What every server sees about you',true);
  if (reqHeaders?.headers) {
    const h = reqHeaders.headers;
    const keys = ['User-Agent','Accept','Accept-Language','Accept-Encoding',
                  'Sec-Ch-Ua','Sec-Ch-Ua-Mobile','Sec-Ch-Ua-Platform',
                  'Sec-Fetch-Dest','Sec-Fetch-Mode','Sec-Fetch-Site',
                  'X-Forwarded-For','X-Real-Ip'];
    for (const k of keys) {
      if (h[k]) row(httpB, k, `<span class="mono-sm ${k.startsWith('Sec-Ch')?'blue':''}">${safeStr(h[k])}</span>`);
    }
    const others = Object.keys(h).filter(k=>!keys.includes(k));
    for (const k of others) row(httpB, k, `<span class="mono-sm dim">${safeStr(h[k])}</span>`);
    row(httpB,'Source',`<span class="dim">${reqHeaders._src||'httpbin.org'}</span>`);
    rawBlock(httpB, reqHeaders.headers);
  } else {
    row(httpB,'Status',tag('httpbin.org unreachable','red'));
    row(httpB,'Tip','Open DevTools \u2192 Network \u2192 reload to see raw headers locally');
  }

  // ── 9. Canvas, WebGL & Audio ──────────────────────────────────────────
  const fpB = createCard('\uD83C\uDFA8','Canvas, WebGL & Audio Fingerprints');
  row(fpB,'Canvas FP',   c(canvasFP,'purple'));
  row(fpB,'Audio FP',    c(audioFP,'purple'));
  row(fpB,'Math FP',     c(mathFP,'purple'));
  if (webgl) {
    row(fpB,'GPU Vendor',   c(safeStr(webgl.vendor),'orange'));
    row(fpB,'GPU Renderer', `<span class="mono-sm">${safeStr(webgl.renderer)}</span>`);
    row(fpB,'WebGL Version',safeStr(webgl.version));
    row(fpB,'GLSL Version', safeStr(webgl.glsl));
    row(fpB,'Max Texture',  `${fmt(webgl.maxTex)} px`);
    row(fpB,'Max MSAA',     String(webgl.maxAA));
    row(fpB,'Extensions',   `${webgl.extensions} supported`);
  } else {
    row(fpB,'WebGL',tag('Not available','red'));
  }

  // ── 10. Speech & Media ────────────────────────────────────────────────
  const sndB = createCard('\uD83C\uDFA4','Speech & Media Devices');
  if (voices.length) {
    const langs = [...new Set(voices.map(v=>v.lang.split('-')[0]))].join(', ');
    row(sndB,'TTS Voices',     `${voices.length} installed`);
    row(sndB,'Voice Languages',safeStr(langs));
    const shown = voices.slice(0,8).map(v=>`<span class="dim">${safeStr(v.name)} (${v.lang})</span>`).join('<br>');
    row(sndB,'Sample Voices',  shown+(voices.length>8?`<br><span class="dim">…and ${voices.length-8} more</span>`:''));
    row(sndB,'Local Voices',   voices.filter(v=>v.localService).length+' local, '+(voices.length-voices.filter(v=>v.localService).length)+' remote');
  } else {
    row(sndB,'TTS Voices', tag('speechSynthesis not available','yellow'));
  }
  if (mediaDev) {
    row(sndB,'Cameras',     `${mediaDev.counts.videoinput||0} detected <span class="dim">(no permission needed to count)</span>`);
    row(sndB,'Microphones', `${mediaDev.counts.audioinput||0} detected`);
    row(sndB,'Speakers',    `${mediaDev.counts.audiooutput||0} detected`);
    row(sndB,'Total Devices',`${mediaDev.total} media device(s)`);
  } else {
    row(sndB,'Media Devices',tag('mediaDevices API unavailable','yellow'));
  }

  // ── 11. Fonts ─────────────────────────────────────────────────────────
  const fntB = createCard('\uD83D\uDD24',`Detected System Fonts (${fonts.length} found via canvas measurement)`,true);
  if (fonts.length>0) {
    row(fntB,'Fonts',fonts.map(f=>`<span style="font-family:'${f}',sans-serif;margin-right:10px">${safeStr(f)}</span>`).join(''));
  } else {
    row(fntB,'Result',tag('Canvas font detection blocked','yellow'));
  }

  // ── 12. Storage & APIs ────────────────────────────────────────────────
  const stB = createCard('\uD83D\uDD0C','Storage & Browser APIs');
  const yn=(v,y='green',n='red')=>v?tag('Available',y):tag('No',n);
  row(stB,'localStorage',   yn(storage.localStorage));
  row(stB,'sessionStorage', yn(storage.sessionStorage));
  row(stB,'Cookies',        storage.cookies?tag('Enabled','yellow'):tag('Disabled','green'));
  row(stB,'IndexedDB',      yn(storage.indexedDB));
  row(stB,'Service Worker', yn(storage.sw,'yellow','yellow'));
  row(stB,'Web Workers',    yn(storage.worker));
  row(stB,'WebAssembly',    yn(storage.wasm));
  row(stB,'WebSockets',     yn(storage.ws));
  row(stB,'Geolocation',    storage.geo?tag('Available (not used)','yellow'):tag('Not available','green'));
  row(stB,'Notifications',  storage.notif?tag('Available','yellow'):tag('Not available','green'));
  row(stB,'Clipboard',      storage.clipboard?tag('Available','yellow'):tag('No','green'));
  row(stB,'Web Bluetooth',  storage.bluetooth?tag('Supported','yellow'):tag('No','green'));
  row(stB,'WebUSB',         storage.usb?tag('Supported','yellow'):tag('No','green'));
  row(stB,'Web NFC',        storage.nfc?tag('Supported','yellow'):tag('No','green'));
  row(stB,'Screen Wake Lock',storage.wakeLock?tag('Supported','yellow'):tag('No','green'));
  row(stB,'Web Serial',     storage.serial?tag('Supported','yellow'):tag('No','green'));
  row(stB,'WebXR / AR/VR',  storage.xr?tag('Supported','yellow'):tag('No','green'));
  row(stB,'Payment Request',storage.payment?tag('Available','yellow'):tag('No','green'));

  // ── 13. Time & Performance ────────────────────────────────────────────
  const perfB = createCard('\u26a1','Time & Performance');
  row(perfB,'Timezone (JS)',   c(tz,'blue'));
  row(perfB,'UTC Offset',      `UTC${tzOff>=0?'+':''}${tzOff/60}`);
  row(perfB,'Local Time',      safeStr(new Date().toLocaleString()));
  row(perfB,'Locale',          Intl.DateTimeFormat().resolvedOptions().locale||'N/A');
  const loadMs=performance.timing?performance.timing.loadEventEnd-performance.timing.navigationStart:0;
  row(perfB,'Page Load',       loadMs>0?c(loadMs+' ms','green'):'N/A');
  row(perfB,'Scan Duration',   c(Math.round(performance.now()-T0)+' ms','green'));
  row(perfB,'Nav Type',        (()=>{try{const t=performance.getEntriesByType('navigation')[0]?.type;if(t)return t.charAt(0).toUpperCase()+t.slice(1);}catch{}const c=['Navigate','Reload','Back/Forward'];return c[performance.navigation?.type]??'N/A';})());
  row(perfB,'JS Heap',         (()=>{try{const m=performance.memory;if(!m)return 'N/A';return `${Math.round(m.usedJSHeapSize/1048576)} MB / ${Math.round(m.jsHeapSizeLimit/1048576)} MB`;}catch{return 'N/A';}})());
  row(perfB,'Visits (local)',  visits?c(`${visits}\u00d7`,'blue'):'1');

  // ── 14. Tracking Surface ──────────────────────────────────────────────
  const tsB = createCard('\uD83D\uDEE1\uFE0F','Tracking Surface \u2014 What every site can collect without asking',true);
  const vectors = [
    ['IP Address & ISP',       true,                                            'Always visible to every server'],
    ['IP-based Location',      true,                                            '\u223350 km accuracy, no permission'],
    ['User Agent / Browser',   true,                                            'HTTP header on every request'],
    ['Screen Resolution',      true,                                            'screen.width / screen.height'],
    ['Device Pixel Ratio',     true,                                            'window.devicePixelRatio'],
    ['Timezone',               true,                                            'Intl.DateTimeFormat + Date'],
    ['System Language',        true,                                            'navigator.language'],
    ['HTTP Headers',           true,                                            'Accept, Accept-Language, Sec-CH-UA…'],
    ['CPU Core Count',         navigator.hardwareConcurrency!=null,             'navigator.hardwareConcurrency'],
    ['Device Memory',          navigator.deviceMemory!=null,                   'navigator.deviceMemory'],
    ['Canvas Fingerprint',     canvasFP!=='blocked',                           'Canvas 2D pixel rendering diff'],
    ['Audio Fingerprint',      audioFP!=='blocked'&&audioFP!=='not supported', 'AudioContext processing diff'],
    ['Math Fingerprint',       mathFP!=='N/A',                                 'Platform float precision diff'],
    ['WebGL / GPU Model',      webgl!==null,                                   'WEBGL_debug_renderer_info ext'],
    ['WebRTC Local IP Leak',   webrtcResult.local.length>0,                    webrtcResult.local.length>0?'\u26a0\ufe0f Your local IP was leaked!':'RTCPeerConnection STUN'],
    ['System Fonts (25 tested)',fonts.length>0,                                'Canvas measureText diff'],
    ['TTS Voice List',         voices.length>0,                                'speechSynthesis.getVoices()'],
    ['Media Device Count',     mediaDev!==null,                                'enumerateDevices() — no stream'],
    ['Battery Level',          battery!==null,                                 'navigator.getBattery()'],
    ['Connection Speed',       network!==null,                                 'navigator.connection API'],
    ['Installed Plugins',      navigator.plugins?.length>0,                   'navigator.plugins (Chrome hides)'],
    ['Do Not Track',           true,                                            'navigator.doNotTrack — ironic'],
    ['Color Gamut',            true,                                            'CSS (color-gamut) media query'],
  ];
  for (const [name,exposed,note] of vectors) {
    row(tsB, name,
      (exposed?tag('Exposed \u26a0','red'):tag('Protected \u2713','green')) +
      ` <span class="dim">${safeStr(note)}</span>`
    );
  }

  setProgress(100,'\u2713 Scan complete');
  setTimeout(()=>{
    document.getElementById('scan-bar').style.borderColor='rgba(63,185,80,.5)';
    document.getElementById('scan-label').style.color='var(--g)';
    document.getElementById('scan-pct').style.color='var(--g)';
  }, 200);
}

main();
