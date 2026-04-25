'use strict';

// ─── Utilities ────────────────────────────────────────────────────────────────

async function sha256(str) {
  try {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('').slice(0,16);
  } catch { return 'N/A'; }
}

function parseBrowser(ua) {
  const rules = [
    [/Edg\/([\d.]+)/, 'Edge'],
    [/OPR\/([\d.]+)/, 'Opera'],
    [/SamsungBrowser\/([\d.]+)/, 'Samsung Browser'],
    [/UCBrowser\/([\d.]+)/, 'UC Browser'],
    [/YaBrowser\/([\d.]+)/, 'Yandex'],
    [/CriOS\/([\d.]+)/, 'Chrome (iOS)'],
    [/FxiOS\/([\d.]+)/, 'Firefox (iOS)'],
    [/Chrome\/([\d.]+)/, 'Chrome'],
    [/Firefox\/([\d.]+)/, 'Firefox'],
    [/Version\/([\d.]+).*Safari/, 'Safari'],
    [/rv:([\d.]+).*Trident/, 'Internet Explorer'],
  ];
  for (const [re, name] of rules) {
    const m = ua.match(re);
    if (m) return { name, version: m[1].split('.')[0] };
  }
  return { name: 'Unknown', version: '?' };
}

function parseOS(ua) {
  if (/Windows NT 10|Windows NT 11/.test(ua)) return 'Windows 10 / 11';
  if (/Windows NT 6\.3/.test(ua)) return 'Windows 8.1';
  if (/Windows NT 6\.2/.test(ua)) return 'Windows 8';
  if (/Windows NT 6\.1/.test(ua)) return 'Windows 7';
  if (/CrOS/.test(ua)) return 'ChromeOS';
  const android = ua.match(/Android ([\d.]+)/);
  if (android) return `Android ${android[1]}`;
  const ios = ua.match(/iPhone OS ([\d_]+)/);
  if (ios) return `iOS ${ios[1].replace(/_/g,'.')}`;
  const ipad = ua.match(/iPad.*OS ([\d_]+)/);
  if (ipad) return `iPadOS ${ipad[1].replace(/_/g,'.')}`;
  const mac = ua.match(/Mac OS X ([\d_]+)/);
  if (mac) return `macOS ${mac[1].replace(/_/g,'.')}`;
  if (/Linux/.test(ua)) return 'Linux';
  return navigator.platform || 'Unknown';
}

function getEngine(ua) {
  if (/Firefox\//.test(ua) && /Gecko\//.test(ua)) return 'Gecko';
  if (/Trident\//.test(ua)) return 'Trident (IE)';
  if (/WebKit/.test(ua)) return 'Blink / WebKit';
  return 'Unknown';
}

function getPointerType() {
  if (window.matchMedia('(pointer: fine)').matches) return 'Fine — mouse / trackpad';
  if (window.matchMedia('(pointer: coarse)').matches) return 'Coarse — touchscreen / stylus';
  return 'None';
}

function formatDuration(s) {
  if (!isFinite(s) || s === 0) return 'N/A';
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h > 0 ? `~${h}h ${m}m` : `~${m}m`;
}

function getNavType() {
  try {
    const t = performance.getEntriesByType('navigation')[0]?.type;
    if (t) return t.charAt(0).toUpperCase() + t.slice(1);
  } catch {}
  const codes = ['Navigate','Reload','Back/Forward'];
  return codes[performance.navigation?.type] ?? 'N/A';
}

function getMemUsage() {
  try {
    const m = performance.memory;
    if (!m) return 'N/A';
    const used = Math.round(m.usedJSHeapSize / 1048576);
    const limit = Math.round(m.jsHeapSizeLimit / 1048576);
    return `${used} MB used / ${limit} MB limit`;
  } catch { return 'N/A'; }
}

// ─── Data Collectors ──────────────────────────────────────────────────────────

async function fetchIPData() {
  try {
    const r = await fetch('https://ipwho.is/', { cache: 'no-store' });
    const d = await r.json();
    if (d.success !== false) return d;
    throw new Error('API failed');
  } catch {
    try {
      const r = await fetch('https://freeipapi.com/api/json', { cache: 'no-store' });
      const d = await r.json();
      return {
        ip: d.ipAddress, type: d.ipVersion === 4 ? 'IPv4' : 'IPv6',
        country: d.countryName, country_code: d.countryCode,
        city: d.cityName, region: d.regionName,
        latitude: d.latitude, longitude: d.longitude,
        flag: { emoji: d.countryCode ? String.fromCodePoint(...[...d.countryCode].map(c => 0x1F1E0 + c.charCodeAt(0) - 65)) : '' },
        connection: { isp: 'N/A', asn: 'N/A' },
        timezone: { id: d.timeZone },
        is_eu: null
      };
    } catch { return null; }
  }
}

async function getCanvasFP() {
  try {
    const c = document.createElement('canvas');
    c.width = 300; c.height = 70;
    const ctx = c.getContext('2d');
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#f80';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.fillStyle = '#09f';
    ctx.font = 'bold 20px Arial';
    ctx.fillText('mvadel fingerprint \u{1F3AF}', 8, 40);
    ctx.fillStyle = 'rgba(80, 240, 100, 0.9)';
    ctx.font = '13px Courier New';
    ctx.fillText('\u{1F50D} browser canvas test', 8, 60);
    ctx.beginPath();
    ctx.arc(270, 35, 25, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(200,50,255,0.6)';
    ctx.fill();
    return await sha256(c.toDataURL());
  } catch { return 'blocked'; }
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
        if (!e.candidate) { try { pc.close(); } catch {} resolve({ local:[...local], pub:[...pub] }); return; }
        const m = e.candidate.candidate.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/);
        if (m && m[1] !== '0.0.0.0') {
          /^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/.test(m[1]) ? local.add(m[1]) : pub.add(m[1]);
        }
      };
      setTimeout(() => { try { pc.close(); } catch {} resolve({ local:[...local], pub:[...pub] }); }, 4000);
    } catch { resolve({ local:[], pub:[] }); }
  });
}

async function getAudioFP() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return 'not supported';
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const analyser = ctx.createAnalyser();
    const proc = ctx.createScriptProcessor(4096, 1, 1);
    gain.gain.value = 0;
    osc.type = 'triangle';
    osc.frequency.value = 10000;
    osc.connect(analyser);
    analyser.connect(proc);
    proc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(0);
    return new Promise(resolve => {
      proc.onaudioprocess = async ev => {
        const d = ev.inputBuffer.getChannelData(0).slice(0, 500);
        const sum = d.reduce((a, b) => a + Math.abs(b), 0).toFixed(10);
        osc.stop(); ctx.close();
        resolve(await sha256(sum));
      };
      setTimeout(() => { try { ctx.close(); } catch {} resolve('timeout'); }, 3000);
    });
  } catch { return 'blocked'; }
}

function detectFonts() {
  const list = [
    'Arial','Helvetica','Times New Roman','Courier New','Georgia',
    'Verdana','Tahoma','Trebuchet MS','Impact','Comic Sans MS',
    'Palatino','Garamond','Monaco','Consolas','Segoe UI',
    'Ubuntu','Cantarell','Roboto','Open Sans','Fira Sans',
    'Source Code Pro','Lucida Console','Menlo','DejaVu Sans',
  ];
  try {
    const c = document.createElement('canvas'), ctx = c.getContext('2d');
    ctx.font = '72px monospace';
    const base = ctx.measureText('mmmmwwwwMMMM').width;
    return list.filter(f => { ctx.font = `72px '${f}', monospace`; return ctx.measureText('mmmmwwwwMMMM').width !== base; });
  } catch { return []; }
}

async function getBattery() {
  try {
    const b = await navigator.getBattery();
    return { level: Math.round(b.level * 100), charging: b.charging, chargingTime: b.chargingTime, dischargingTime: b.dischargingTime };
  } catch { return null; }
}

function getNetworkInfo() {
  const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  if (!conn) return null;
  return { effectiveType: conn.effectiveType, downlink: conn.downlink, rtt: conn.rtt, saveData: conn.saveData, type: conn.type };
}

function getStorageSupport() {
  const s = {};
  try { localStorage.setItem('_fp_test','1'); localStorage.removeItem('_fp_test'); s.localStorage = true; } catch { s.localStorage = false; }
  try { sessionStorage.setItem('_fp_test','1'); sessionStorage.removeItem('_fp_test'); s.sessionStorage = true; } catch { s.sessionStorage = false; }
  s.cookies    = navigator.cookieEnabled;
  s.indexedDB  = !!window.indexedDB;
  s.sw         = 'serviceWorker' in navigator;
  s.worker     = !!window.Worker;
  s.wasm       = typeof WebAssembly !== 'undefined';
  s.ws         = typeof WebSocket !== 'undefined';
  s.geo        = 'geolocation' in navigator;
  s.notif      = 'Notification' in window;
  s.clipboard  = 'clipboard' in navigator;
  s.bluetooth  = 'bluetooth' in navigator;
  s.usb        = 'usb' in navigator;
  s.nfc        = 'nfc' in navigator;
  return s;
}

// ─── UI Helpers ───────────────────────────────────────────────────────────────

function setProgress(pct, label) {
  document.getElementById('progress-fill').style.width = pct + '%';
  document.getElementById('scan-pct').textContent = Math.round(pct) + '%';
  document.getElementById('scan-label').textContent = label;
}

function createCard(icon, title, fullWidth = false) {
  const card = document.createElement('div');
  card.className = 'card' + (fullWidth ? ' card-full' : '');
  card.innerHTML = `
    <div class="card-header">
      <span class="card-icon">${icon}</span>
      <span class="card-title">${title}</span>
    </div>
    <div class="card-body"></div>`;
  document.getElementById('main-grid').appendChild(card);
  return card.querySelector('.card-body');
}

function row(body, label, html) {
  const d = document.createElement('div');
  d.className = 'row';
  d.innerHTML = `<span class="lbl">${label}</span><span class="val">${html}</span>`;
  body.appendChild(d);
}

function tag(text, cls) { return `<span class="tag tag-${cls}">${text}</span>`; }
function c(text, cls)   { return `<span class="${cls}">${text}</span>`; }

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const startTime = performance.now();
  const ua = navigator.userAgent;
  const browser = parseBrowser(ua);
  const os = parseOS(ua);

  // Session timer
  const sessionStart = Date.now();
  setInterval(() => {
    document.getElementById('timer').textContent = 'Session: ' + Math.floor((Date.now() - sessionStart) / 1000) + 's';
  }, 1000);

  // Visit counter
  let visits = 0;
  try { visits = parseInt(localStorage.getItem('_mv_visits') || 0) + 1; localStorage.setItem('_mv_visits', visits); } catch {}
  if (visits > 0) document.getElementById('visit-count').textContent = visits + (visits === 1 ? ' visit' : ' visits');

  setProgress(5, '⟳ Starting scan…');

  // Fire all async tasks in parallel
  const [ipData, canvasFP, webrtcResult, audioFP, battery] = await Promise.all([
    fetchIPData(),
    getCanvasFP(),
    getWebRTCIPs(),
    getAudioFP(),
    getBattery(),
  ]);

  setProgress(82, '⟳ Analysing…');

  const webgl   = getWebGLInfo();
  const fonts   = detectFonts();
  const network = getNetworkInfo();
  const storage = getStorageSupport();
  const tz      = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const tzOff   = -(new Date().getTimezoneOffset());

  // Overall fingerprint hash
  const fpSources = [ua, canvasFP, audioFP, screen.width, screen.height,
    navigator.language, navigator.hardwareConcurrency, navigator.deviceMemory,
    webgl?.renderer || '', tz].join('|');
  const fingerprintID = await sha256(fpSources);

  setProgress(96, '⟳ Rendering…');

  // Populate summary bar
  document.getElementById('s-ip').textContent      = ipData?.ip || '—';
  document.getElementById('s-loc').textContent     = ipData ? `${ipData.flag?.emoji || ''} ${ipData.city || '?'}, ${ipData.country || '?'}` : 'Unknown';
  document.getElementById('s-browser').textContent = `${browser.name} ${browser.version}`;
  document.getElementById('s-os').textContent      = os;
  document.getElementById('s-fp').textContent      = fingerprintID;
  document.getElementById('summary').style.display = 'grid';

  // ── Card: Network & Location ──────────────────────────────────────────────
  const netB = createCard('🌍', 'Network & Location', true);
  if (ipData) {
    row(netB, 'Public IP',    c(ipData.ip, 'blue') + (ipData.type ? ` <span class="dim">${ipData.type}</span>` : ''));
    row(netB, 'Country',      `${ipData.flag?.emoji || ''} ${ipData.country} (${ipData.country_code})`);
    row(netB, 'Region / City',`${ipData.region || '?'}, ${ipData.city || '?'}`);
    row(netB, 'Coordinates',  `${Number(ipData.latitude).toFixed(4)}, ${Number(ipData.longitude).toFixed(4)} <span class="dim">±50 km (IP-based)</span>`);
    row(netB, 'ISP / Org',    c(ipData.connection?.isp || ipData.connection?.org || 'N/A', 'orange'));
    row(netB, 'ASN',          ipData.connection?.asn ? `AS${ipData.connection.asn}` : 'N/A');
    row(netB, 'Timezone (IP)',ipData.timezone?.id || 'N/A');
    if (ipData.is_eu === true)  row(netB, 'EU Member', tag('Yes — GDPR applies', 'yellow'));
    if (ipData.is_eu === false) row(netB, 'EU Member', tag('No', 'green'));
    if (ipData.postal) row(netB, 'Postal Code', ipData.postal);
  } else {
    row(netB, 'IP Lookup', tag('API unreachable', 'red'));
  }
  // WebRTC leak
  if (webrtcResult.local.length || webrtcResult.pub.length) {
    if (webrtcResult.local.length) row(netB, 'Local IP (WebRTC)', c(webrtcResult.local.join(', '), 'red') + ' ' + tag('LEAK', 'red'));
    if (webrtcResult.pub.length)   row(netB, 'Public via WebRTC', c(webrtcResult.pub.join(', '), 'yellow') + ' ' + tag('VPN bypass risk', 'yellow'));
  } else {
    row(netB, 'WebRTC Leak', tag('No local IP leaked', 'green'));
  }

  // ── Card: Browser ─────────────────────────────────────────────────────────
  const brB = createCard('🔭', 'Browser & Runtime');
  row(brB, 'Browser',       c(`${browser.name} ${browser.version}`, 'blue'));
  row(brB, 'Engine',        getEngine(ua));
  row(brB, 'User Agent',    `<span class="mono-sm">${ua}</span>`);
  row(brB, 'Language',      navigator.language);
  row(brB, 'All Languages', navigator.languages?.join(', ') || 'N/A');
  row(brB, 'Do Not Track',  navigator.doNotTrack === '1' ? tag('Enabled', 'green') : navigator.doNotTrack === '0' ? tag('Disabled', 'red') : tag('Unset', 'yellow'));
  row(brB, 'Cookies',       navigator.cookieEnabled ? tag('Enabled', 'yellow') : tag('Disabled', 'green'));
  row(brB, 'Plugins',       navigator.plugins?.length > 0
    ? [...navigator.plugins].map(p => p.name).join(', ')
    : tag('None detected', 'green'));
  row(brB, 'PDF Viewer',    [...(navigator.plugins || [])].some(p => /pdf/i.test(p.name)) ? tag('Detected', 'yellow') : tag('Not found', 'green'));

  // ── Card: Device & OS ─────────────────────────────────────────────────────
  const devB = createCard('💻', 'Device & System');
  row(devB, 'OS',           c(os, 'orange'));
  row(devB, 'Platform',     navigator.platform || 'N/A');
  row(devB, 'CPU Cores',    navigator.hardwareConcurrency ? c(`${navigator.hardwareConcurrency} logical cores`, 'purple') : 'N/A');
  row(devB, 'Device Memory',navigator.deviceMemory        ? c(`≥ ${navigator.deviceMemory} GB`, 'purple') : 'N/A');
  row(devB, 'Touch Points', navigator.maxTouchPoints > 0 ? `${navigator.maxTouchPoints} ${tag('touch device','yellow')}` : `0 — non-touch`);
  row(devB, 'Pointer',      getPointerType());
  row(devB, 'Online',       navigator.onLine ? tag('Online','green') : tag('Offline','red'));
  if (battery) {
    row(devB, 'Battery Level', `${battery.level}% ${battery.charging ? '⚡ Charging' : '🔋 Discharging'}`);
    if (!battery.charging && battery.dischargingTime !== Infinity && battery.dischargingTime > 0)
      row(devB, 'Time Remaining', formatDuration(battery.dischargingTime));
  } else {
    row(devB, 'Battery API', tag('Not available', 'yellow'));
  }

  // ── Card: Screen & Display ────────────────────────────────────────────────
  const scrB = createCard('🖥️', 'Screen & Display');
  row(scrB, 'Screen Size',      c(`${screen.width} × ${screen.height} px`, 'blue'));
  row(scrB, 'Available Area',   `${screen.availWidth} × ${screen.availHeight} px`);
  row(scrB, 'Viewport',         `${window.innerWidth} × ${window.innerHeight} px`);
  row(scrB, 'Pixel Ratio',      `${window.devicePixelRatio}× ${window.devicePixelRatio > 1 ? tag('HiDPI/Retina','blue') : ''}`);
  row(scrB, 'Color Depth',      `${screen.colorDepth}-bit`);
  row(scrB, 'Orientation',      screen.orientation?.type || 'N/A');
  row(scrB, 'Color Scheme',     window.matchMedia('(prefers-color-scheme: dark)').matches  ? '🌙 Dark mode'  : '☀️ Light mode');
  row(scrB, 'Reduced Motion',   window.matchMedia('(prefers-reduced-motion: reduce)').matches ? tag('Prefers reduced','yellow') : 'Not requested');
  row(scrB, 'HDR',              window.matchMedia('(dynamic-range: high)').matches ? tag('HDR display','green') : 'Standard range');
  row(scrB, 'Forced Colors',    window.matchMedia('(forced-colors: active)').matches ? tag('Active','yellow') : 'None');

  // ── Card: Connection ──────────────────────────────────────────────────────
  const connB = createCard('📡', 'Connection');
  if (network) {
    row(connB, 'Effective Type', c(network.effectiveType?.toUpperCase() || 'N/A', 'green'));
    row(connB, 'Physical Type',  network.type || 'N/A');
    row(connB, 'Downlink',       network.downlink != null ? `~${network.downlink} Mbps` : 'N/A');
    row(connB, 'RTT',            network.rtt != null ? `${network.rtt} ms` : 'N/A');
    row(connB, 'Save Data',      network.saveData ? tag('Enabled','yellow') : tag('Off','green'));
  } else {
    row(connB, 'Network Info API', tag('Not supported','yellow'));
  }
  row(connB, 'Protocol',        location.protocol === 'https:' ? tag('HTTPS ✓','green') : tag('HTTP','red'));
  row(connB, 'Secure Context',  window.isSecureContext ? tag('Yes','green') : tag('No','red'));
  row(connB, 'Cross-Origin Iso',window.crossOriginIsolated ? tag('Isolated','green') : tag('No','yellow'));

  // ── Card: Canvas & WebGL Fingerprints ─────────────────────────────────────
  const fpB = createCard('🎨', 'Canvas, WebGL & Audio');
  row(fpB, 'Canvas FP',   c(canvasFP, 'purple'));
  row(fpB, 'Audio FP',    c(audioFP,  'purple'));
  if (webgl) {
    row(fpB, 'GPU Vendor',   c(webgl.vendor, 'orange'));
    row(fpB, 'GPU Renderer', `<span class="mono-sm">${webgl.renderer}</span>`);
    row(fpB, 'WebGL Version',webgl.version);
    row(fpB, 'GLSL Version', webgl.glsl);
    row(fpB, 'Max Texture',  `${webgl.maxTex} px`);
  } else {
    row(fpB, 'WebGL', tag('Not available','red'));
  }

  // ── Card: Fonts ───────────────────────────────────────────────────────────
  const fntB = createCard('🔤', `Detected System Fonts (${fonts.length} found)`);
  if (fonts.length > 0) {
    row(fntB, 'Fonts', fonts.map(f => `<span style="font-family:'${f}',sans-serif;margin-right:10px">${f}</span>`).join(''));
  } else {
    row(fntB, 'Result', tag('Canvas font detection blocked', 'yellow'));
  }

  // ── Card: Storage & APIs ──────────────────────────────────────────────────
  const stB = createCard('🔌', 'Storage & Browser APIs');
  const yn = (v, yc='green', nc='red') => v ? tag('Available',''+yc) : tag('No',''+nc);
  row(stB, 'localStorage',   yn(storage.localStorage));
  row(stB, 'sessionStorage', yn(storage.sessionStorage));
  row(stB, 'Cookies',        storage.cookies ? tag('Enabled','yellow') : tag('Disabled','green'));
  row(stB, 'IndexedDB',      yn(storage.indexedDB));
  row(stB, 'Service Worker', yn(storage.sw, 'yellow','yellow'));
  row(stB, 'Web Workers',    yn(storage.worker));
  row(stB, 'WebAssembly',    yn(storage.wasm));
  row(stB, 'WebSockets',     yn(storage.ws));
  row(stB, 'Geolocation',    storage.geo  ? tag('Available (unused here)','yellow') : tag('Not available','green'));
  row(stB, 'Notifications',  storage.notif ? tag('Available','yellow') : tag('Not available','green'));
  row(stB, 'Clipboard',      storage.clipboard ? tag('Available','yellow') : tag('No','green'));
  row(stB, 'Web Bluetooth',  storage.bluetooth ? tag('Supported','yellow') : tag('No','green'));
  row(stB, 'WebUSB',         storage.usb  ? tag('Supported','yellow') : tag('No','green'));
  row(stB, 'Web NFC',        storage.nfc  ? tag('Supported','yellow') : tag('No','green'));

  // ── Card: Time & Performance ──────────────────────────────────────────────
  const perfB = createCard('⚡', 'Time & Performance');
  row(perfB, 'Timezone (JS)', c(tz, 'blue'));
  row(perfB, 'UTC Offset',    `UTC${tzOff >= 0 ? '+' : ''}${tzOff / 60}`);
  row(perfB, 'Local Time',    new Date().toLocaleString());
  const loadMs = performance.timing ? performance.timing.loadEventEnd - performance.timing.navigationStart : 0;
  row(perfB, 'Page Load',     loadMs > 0 ? c(`${loadMs} ms`, 'green') : 'N/A');
  row(perfB, 'Scan Duration', c(`${Math.round(performance.now() - startTime)} ms`, 'green'));
  row(perfB, 'Nav Type',      getNavType());
  row(perfB, 'JS Heap',       getMemUsage());
  row(perfB, 'Visits (local)',visits ? c(`${visits}×`, 'blue') : '1');

  // ── Card: Tracking Surface Summary ───────────────────────────────────────
  const tsB = createCard('🛡️', 'Tracking Surface — What sites can collect about you', true);
  const vectors = [
    ['IP Address & ISP',     true,  'Always visible'],
    ['IP-based Location',    true,  '~City level, no permission'],
    ['User Agent / Browser', true,  'Always visible'],
    ['Screen Resolution',    true,  'Always visible'],
    ['Timezone',             true,  'Always visible'],
    ['System Language',      true,  'Always visible'],
    ['CPU Core Count',       navigator.hardwareConcurrency != null, 'hardwareConcurrency API'],
    ['Device Memory',        navigator.deviceMemory != null,        'deviceMemory API'],
    ['Canvas Fingerprint',   canvasFP !== 'blocked',                'Canvas 2D API'],
    ['Audio Fingerprint',    audioFP !== 'blocked' && audioFP !== 'not supported', 'AudioContext API'],
    ['WebGL / GPU Info',     webgl !== null,                        'WebGL API'],
    ['WebRTC Local IP',      webrtcResult.local.length > 0,        webrtcResult.local.length > 0 ? 'Local IP leaked!' : 'RTCPeerConnection'],
    ['System Fonts',         fonts.length > 0,                      'Canvas font detection'],
    ['Battery Level',        battery !== null,                      'Battery API'],
    ['Connection Speed',     network !== null,                      'Network Information API'],
    ['Installed Plugins',    navigator.plugins?.length > 0,        'navigator.plugins'],
    ['Do Not Track Flag',    true,  'Ironically, this itself is tracked'],
  ];
  for (const [name, avail, note] of vectors) {
    const risky = avail;
    row(tsB, name,
      (risky ? tag('Exposed ⚠', 'red') : tag('Protected ✓', 'green')) + ` <span class="dim">${note}</span>`
    );
  }

  // Done
  setProgress(100, '✓ Scan complete');
  setTimeout(() => {
    const bar = document.getElementById('scan-bar');
    bar.style.borderColor = 'rgba(63,185,80,0.5)';
    document.getElementById('scan-label').style.color = 'var(--g)';
    document.getElementById('scan-pct').style.color   = 'var(--g)';
  }, 200);
}

main();
