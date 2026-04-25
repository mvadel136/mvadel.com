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

function resolveOS(ua, hints) {
  if (!hints || !hints.platform) return parseOSFromUA(ua);
  const { platform, platformVersion = '', model = '', mobile } = hints;
  if (platform === 'Android') {
    const v = platformVersion.split('.')[0] || '?';
    const dev = model && model !== 'K' ? ` \u2014 ${model}` : '';
    return `Android ${v}${dev}`;
  }
  if (platform === 'Windows') {
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
//  NEW FEATURES
// ═══════════════════════════════════════════════════════════

function checkVPNLeak(ipData) {
  if (!ipData || !ipData.timezone?.id) return null;
  const sysTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const ipTz = ipData.timezone.id;
  if (sysTz !== ipTz) return { leak: true, sysTz, ipTz, msg: `System (${sysTz}) != IP (${ipTz})` };
  return { leak: false, sysTz, ipTz, msg: `System matches IP location` };
}

async function detectIncognito() {
  return new Promise(resolve => {
    const fs = window.RequestFileSystem || window.webkitRequestFileSystem;
    if (fs) {
      const timeout = setTimeout(() => resolve(false), 100);
      fs(window.TEMPORARY, 100, () => { clearTimeout(timeout); resolve(false); }, () => { clearTimeout(timeout); resolve(true); });
    } else { resolve(false); }
  });
}

async function detectAdBlocker() {
  return new Promise(resolve => {
    const bait = document.createElement('div');
    bait.className = 'adsbox ad-banner ad-placeholder';
    bait.style.cssText = 'width: 1px; height: 1px; position: absolute; left: -999px; top: -999px;';
    document.body.appendChild(bait);
    setTimeout(() => {
      const blocked = bait.offsetParent === null || bait.offsetHeight === 0;
      bait.remove();
      resolve(blocked);
    }, 100);
  });
}

async function getMediaCapabilities() {
  if (!navigator.mediaCapabilities) return null;
  try {
    const hevcConfig = { type: 'file', video: { contentType: 'video/hevc; level-id=180', width: 1920, height: 1080, bitrate: 1000000, framerate: 30 } };
    const av1Config = { type: 'file', video: { contentType: 'video/av01.0.04M.08', width: 1920, height: 1080, bitrate: 1000000, framerate: 30 } };
    const [hevc, av1] = await Promise.all([ navigator.mediaCapabilities.decodingInfo(hevcConfig), navigator.mediaCapabilities.decodingInfo(av1Config) ]);
    return { hevc: hevc.supported && hevc.smooth, av1: av1.supported && av1.smooth, hdr: window.matchMedia('(dynamic-range: high)').matches };
  } catch { return null; }
}

function getGPUBenchmark() {
  try {
    const c = document.createElement('canvas'); c.width = 200; c.height = 200;
    const gl = c.getContext('webgl') || c.getContext('experimental-webgl');
    if (!gl) return null;
    const start = performance.now();
    for (let i = 0; i < 100; i++) gl.clear(gl.COLOR_BUFFER_BIT);
    return Math.round(performance.now() - start);
  } catch { return null; }
}

function getGamepads() {
  return (navigator.getGamepads ? [...navigator.getGamepads()] : []).filter(p => p);
}

// ═══════════════════════════════════════════════════════════
//  SPEED TEST
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

  const [ipData, canvasFP, webrtcResult, audioFP, battery, uaHints, reqHeaders, voices, mediaDev, mathFP, mediaCaps, adBlock, isIncognito] =
    await Promise.all([
      fetchIPData(), getCanvasFP(), getWebRTCIPs(), getAudioFP(),
      getBattery(), getUAClientHints(), fetchRequestHeaders(),
      getSpeechVoices(), getMediaDevices(), getMathFP(),
      getMediaCapabilities(), detectAdBlocker(), detectIncognito()
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
  const vpnLeak = checkVPNLeak(ipData);
  const gpuTime = getGPUBenchmark();
  const gamepads = getGamepads();

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

  // ── 2. Privacy & Anonymity (New) ───────────────────────────────────────
  const privB = createCard('\uD83D\uDD75','Privacy & Anonymity');
  if (vpnLeak) {
    row(privB,'VPN / Proxy Leak', vpnLeak.leak ? tag('MISMATCH','red') : tag('Consistent','green'));
    row(privB,'Timezone Detail', `<span class="dim">${vpnLeak.msg}</span>`);
  }
  row(privB,'Incognito Mode', isIncognito ? tag('Detected','yellow') : tag('Not Detected','green'));
  row(privB,'Ad-Blocker', adBlock ? tag('Active','green') : tag('Not Detected','yellow'));

  // ── 3. UA Client Hints ────────────────────────────────────────────────
  const uaB = createCard('🔬','User-Agent Client Hints');
  if (uaHints) {
    row(uaB,'Platform',         c(uaHints.platform||'N/A','orange'));
    row(uaB,'Platform Version', c(uaHints.platformVersion||'N/A','blue')+(uaHints.platform==='Android'?' '+tag('Real version','green'):''));
    if (uaHints.model && uaHints.model!=='K') row(uaB,'Device Model',c(uaHints.model,'blue'));
    row(uaB,'Architecture',     uaHints.architecture||'N/A');
    row(uaB,'Bitness',          uaHints.bitness ? uaHints.bitness+'-bit' : 'N/A');
    row(uaB,'Mobile',           uaHints.mobile ? tag('Yes','yellow') : tag('No','green'));
    const brands = uaHints.fullVersionList?.filter(b=>!b.brand.includes('Not')).map(b=>`${safeStr(b.brand)} ${b.version}`).join('<br>') || 'N/A';
    row(uaB,'Full Browser List',`<span class="mono-sm">${brands}</span>`);
  } else {
    row(uaB,'Status', tag('API not available','yellow'));
  }

  // ── 4. Browser & Runtime ──────────────────────────────────────────────
  const brB = createCard('🔭','Browser & Runtime');
  row(brB,'Browser',      c(`${browser.name} ${browser.version}`,'blue'));
  row(brB,'Full Version', browser.fullVersion||'N/A');
  row(brB,'Engine',       /Firefox/.test(ua)&&/Gecko/.test(ua)?'Gecko':/Trident/.test(ua)?'Trident':'Blink / WebKit');
  row(brB,'User Agent',   `<span class="mono-sm">${safeStr(ua)}</span>`);
  row(brB,'Language',     navigator.language);
  row(brB,'All Languages',navigator.languages?.join(', ')||'N/A');
  row(brB,'Cookies',      navigator.cookieEnabled?tag('Enabled','yellow'):tag('Disabled','green'));
  row(brB,'Plugins',      navigator.plugins?.length>0?[...navigator.plugins].map(p=>safeStr(p.name)).join(', '):tag('None','green'));

  // ── 5. Device & System ────────────────────────────────────────────────
  const devB = createCard('💻','Device & System');
  row(devB,'OS',          c(os,'orange'));
  row(devB,'Platform',    safeStr(navigator.platform||'N/A'));
  row(devB,'CPU Cores',   navigator.hardwareConcurrency?c(`${navigator.hardwareConcurrency} logical cores`,'purple'):'N/A');
  row(devB,'Device Memory',navigator.deviceMemory?c(`\u2265 ${navigator.deviceMemory} GB`,'purple'):'N/A');
  row(devB,'Touch Points',navigator.maxTouchPoints>0?`${navigator.maxTouchPoints} ${tag('touch','yellow')}`:`0`);
  row(devB,'Online',      navigator.onLine?tag('Online','green'):tag('Offline','red'));
  if (battery) {
    row(devB,'Battery',   `${battery.level}% ${battery.charging?'\u26a1 Charging':'\uD83D\uDD0B Discharging'}`);
  } else { row(devB,'Battery API',tag('N/A','yellow')); }

  // ── 6. Hardware & Codecs (New) ─────────────────────────────────────────
  const hwB = createCard('\uD83C\uDFAE','Hardware & Codecs');
  if (mediaCaps) {
    row(hwB,'HEVC / H.265', mediaCaps.hevc ? tag('Supported Smooth','green') : tag('No','red'));
    row(hwB,'AV1', mediaCaps.av1 ? tag('Supported Smooth','green') : tag('No','red'));
    row(hwB,'HDR', mediaCaps.hdr ? tag('High Dynamic Range','blue') : 'Standard');
  }
  if (gpuTime !== null) row(hwB,'GPU Render Time', `${gpuTime}ms <span class="dim">(benchmark)</span>`);
  if (gamepads.length > 0) row(hwB,'Gamepads', gamepads.map(p => safeStr(p.id)).join(', '));
  
  // ── 7. Interactive Permissions (New) ───────────────────────────────────
  const permB = createCard('\uD83D\uDC41','Interactive Permissions');
  row(permB, 'Camera Status', '<span id="cam-status">Click button to test</span>');
  row(permB, 'Camera Feed', '<video id="cam-feed" autoplay playsinline muted style="max-width:100%; max-height:120px; background:#000; border-radius:4px; display:none;"></video>');
  const camBtn = document.createElement('button');
  camBtn.className = 'speed-run-btn';
  camBtn.textContent = '▶ Test Camera Access';
  camBtn.style.margin = '10px 14px';
  camBtn.onclick = async () => {
    const videoEl = document.getElementById('cam-feed');
    const statusEl = document.getElementById('cam-status');
    statusEl.innerHTML = 'Requesting...';
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      videoEl.srcObject = stream;
      videoEl.style.display = 'block';
      statusEl.innerHTML = tag('GRANTED','green') + ' <span class="dim">Stream active</span>';
    } catch (err) {
      statusEl.innerHTML = tag('DENIED','red') + ` <span class="dim">${safeStr(err.message)}</span>`;
    }
  };
  permB.appendChild(camBtn);

  // ── 8. Screen & Display ───────────────────────────────────────────────
  const scrB = createCard('\uD83D\uDDB5\uFE0F','Screen & Display');
  row(scrB,'Screen Size',   c(`${screen.width} \u00d7 ${screen.height} px`,'blue'));
  row(scrB,'Viewport',      `${window.innerWidth} \u00d7 ${window.innerHeight} px`);
  row(scrB,'Pixel Ratio',   `${window.devicePixelRatio}\u00d7 ${window.devicePixelRatio>1?tag('HiDPI','blue'):''}`);
  row(scrB,'Color Depth',   `${screen.colorDepth}-bit`);
  row(scrB,'Color Gamut',   c(cssF.colorGamut,'green'));
  row(scrB,'Color Scheme',  window.matchMedia('(prefers-color-scheme: dark)').matches?'\uD83C\uDF19 Dark':'\u2600\uFE0F Light');

  // ── 9. Speed Test ─────────────────────────────────────────────────────
  const spdB = createCard('\uD83D\uDE80','Speed Test');
  const spdDisp = document.createElement('div'); spdDisp.className='speed-display';
  spdDisp.innerHTML=`<span id="spd-val" style="font-size:36px;font-weight:700;color:var(--g)">—</span> <span style="font-size:12px;color:var(--mu)">Mbps</span>`;
  spdB.appendChild(spdDisp);
  const spdBar = document.createElement('div'); spdBar.className='speed-bar-wrap';
  spdBar.innerHTML=`<div class="speed-bar-bg"><div id="spd-bar" class="speed-bar-fill"></div></div>`;
  spdB.appendChild(spdBar);
  row(spdB,'Latency',  '<span id="spd-ping">—</span>');
  row(spdB,'Downloaded','<span id="spd-bytes">—</span>');
  const spdBtn = document.createElement('button');
  spdBtn.className='speed-run-btn'; spdBtn.textContent='\u25b6 Run Speed Test';
  spdBtn.onclick = async () => {
    spdBtn.disabled=true; spdBtn.textContent='\u27f3 Testing\u2026';
    await runSpeedTest(({phase,progress=0,mbps=0,ping,bytes,elapsed,msg})=>{
      const vEl=document.getElementById('spd-val');
      const bEl=document.getElementById('spd-bar');
      if(phase==='ping')     { document.getElementById('spd-ping').textContent='measuring\u2026'; }
      if(phase==='download') { if(vEl)vEl.textContent=Number(mbps).toFixed(1); if(bEl)bEl.style.width=Math.min(progress*100,100)+'%'; if(ping)document.getElementById('spd-ping').textContent=ping+' ms'; }
      if(phase==='done')     { if(vEl)vEl.textContent=mbps; if(bEl)bEl.style.width='100%'; if(bytes)document.getElementById('spd-bytes').textContent=(bytes/1048576).toFixed(1)+' MB'; spdBtn.disabled=false; spdBtn.textContent='\u21ba Run Again'; }
      if(phase==='error')    { if(vEl)vEl.textContent='ERR'; row(spdB,'Error',`<span class="red">${safeStr(msg||'Failed')}</span>`); spdBtn.disabled=false; spdBtn.textContent='\u21ba Retry'; }
    });
  };
  spdB.appendChild(spdBtn);

  // ── 10. Connection ─────────────────────────────────────────────────────
  const connB = createCard('\uD83D\uDCE1','Connection');
  if (network) {
    row(connB,'Effective Type', c((network.effectiveType||'N/A').toUpperCase(),'green'));
    row(connB,'Downlink (est.)',network.downlink!=null?`~${network.downlink} Mbps`:'N/A');
    row(connB,'RTT (est.)',     network.rtt!=null?`${network.rtt} ms`:'N/A');
    row(connB,'Save Data',      network.saveData?tag('On','yellow'):tag('Off','green'));
  } else {
    row(connB,'Network Info API',tag('N/A','yellow'));
  }
  row(connB,'Protocol',        location.protocol==='https:'?tag('HTTPS','green'):tag('HTTP','red'));
  row(connB,'Secure Context',  window.isSecureContext?tag('Yes','green'):tag('No','red'));

  // ── 11. HTTP Request Inspector ─────────────────────────────────────────
  const httpB = createCard('\uD83D\uDCE8','HTTP Request Inspector',true);
  if (reqHeaders?.headers) {
    const h = reqHeaders.headers;
    const keys = ['User-Agent','Accept','Accept-Language','Accept-Encoding','Sec-Ch-Ua','Sec-Ch-Ua-Mobile','Sec-Ch-Ua-Platform'];
    for (const k of keys) {
      if (h[k]) row(httpB, k, `<span class="mono-sm">${safeStr(h[k])}</span>`);
    }
    row(httpB,'Source',`<span class="dim">${reqHeaders._src||'httpbin'}</span>`);
    rawBlock(httpB, reqHeaders.headers);
  } else {
    row(httpB,'Status',tag('Unreachable','red'));
  }

  // ── 12. Canvas, WebGL & Audio ──────────────────────────────────────────
  const fpB = createCard('\uD83C\uDFA8','Fingerprints');
  row(fpB,'Canvas FP',   c(canvasFP,'purple'));
  row(fpB,'Audio FP',    c(audioFP,'purple'));
  row(fpB,'Math FP',     c(mathFP,'purple'));
  if (webgl) {
    row(fpB,'GPU Renderer', `<span class="mono-sm">${safeStr(webgl.renderer)}</span>`);
    row(fpB,'WebGL Version',safeStr(webgl.version));
    row(fpB,'Max Texture',  `${fmt(webgl.maxTex)} px`);
  } else {
    row(fpB,'WebGL',tag('N/A','red'));
  }

  // ── 13. Speech & Media ────────────────────────────────────────────────
  const sndB = createCard('\uD83C\uDFA4','Speech & Media');
  if (voices.length) {
    row(sndB,'TTS Voices', `${voices.length} installed`);
  } else {
    row(sndB,'TTS Voices', tag('N/A','yellow'));
  }
  if (mediaDev) {
    row(sndB,'Cameras',     `${mediaDev.counts.videoinput||0}`);
    row(sndB,'Microphones', `${mediaDev.counts.audioinput||0}`);
    row(sndB,'Speakers',    `${mediaDev.counts.audiooutput||0}`);
  }

  // ── 14. Fonts ─────────────────────────────────────────────────────────
  const fntB = createCard('\uD83D\uDD24',`Fonts (${fonts.length})`,true);
  if (fonts.length>0) {
    row(fntB,'Detected',fonts.map(f=>`<span style="font-family:'${f}',sans-serif;margin-right:10px">${safeStr(f)}</span>`).join(''));
  } else {
    row(fntB,'Result',tag('Blocked','yellow'));
  }

  // ── 15. Storage & APIs ────────────────────────────────────────────────
  const stB = createCard('\uD83D\uDD0C','Storage & APIs');
  const yn=(v,y='green',n='red')=>v?tag('Yes',y):tag('No',n);
  row(stB,'localStorage',   yn(storage.localStorage));
  row(stB,'sessionStorage', yn(storage.sessionStorage));
  row(stB,'IndexedDB',      yn(storage.indexedDB));
  row(stB,'Service Worker', yn(storage.sw,'yellow','yellow'));
  row(stB,'WebAssembly',    yn(storage.wasm));
  row(stB,'WebSockets',     yn(storage.ws));
  row(stB,'Geolocation',    storage.geo?tag('Available','yellow'):tag('No','green'));
  row(stB,'Notifications',  storage.notif?tag('Available','yellow'):tag('No','green'));
  row(stB,'Web Bluetooth',  storage.bluetooth?tag('Supported','yellow'):tag('No','green'));
  row(stB,'WebUSB',         storage.usb?tag('Supported','yellow'):tag('No','green'));

  // ── 16. Time & Performance ────────────────────────────────────────────
  const perfB = createCard('\u26a1','Time & Performance');
  row(perfB,'Timezone (JS)',   c(tz,'blue'));
  row(perfB,'UTC Offset',      `UTC${tzOff>=0?'+':''}${tzOff/60}`);
  row(perfB,'Local Time',      safeStr(new Date().toLocaleString()));
  row(perfB,'Scan Duration',   c(Math.round(performance.now()-T0)+' ms','green'));
  const loadMs=performance.timing?performance.timing.loadEventEnd-performance.timing.navigationStart:0;
  row(perfB,'Page Load',       loadMs>0?c(loadMs+' ms','green'):'N/A');
  row(perfB,'Visits (local)',  visits?c(`${visits}\u00d7`,'blue'):'1');

  // ── 17. Tracking Surface ──────────────────────────────────────────────
  const tsB = createCard('\uD83D\uDEE1\uFE0F','Tracking Surface',true);
  const vectors = [
    ['IP Address',       true, 'Visible to servers'],
    ['User Agent',       true, 'HTTP header'],
    ['Screen Resolution',true, 'screen.width'],
    ['Timezone',         true, 'Intl API'],
    ['Canvas FP',        canvasFP!=='blocked', '2D Render'],
    ['WebGL / GPU',      webgl!==null, 'Hardware info'],
    ['WebRTC Leak',      webrtcResult.local.length>0, 'Local IP'],
    ['System Fonts',     fonts.length>0, 'Canvas text'],
    ['Battery Level',    battery!==null, 'Hardware state'],
  ];
  for (const [name,exposed,note] of vectors) {
    row(tsB, name, (exposed?tag('Exposed','red'):tag('Safe','green')) + ` <span class="dim">${note}</span>`);
  }

  setProgress(100,'\u2713 Scan complete');
  setTimeout(()=>{
    document.getElementById('scan-bar').style.borderColor='rgba(63,185,80,.5)';
    document.getElementById('scan-label').style.color='var(--g)';
    document.getElementById('scan-pct').style.color='var(--g)';
  }, 200);
}

main();
