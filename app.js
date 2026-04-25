'use strict';

const $ = (id) => document.getElementById(id);

async function sha256(str) {
  try {
    const data = new TextEncoder().encode(String(str));
    const hash = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hash))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
      .slice(0, 16);
  } catch {
    return 'N/A';
  }
}

function safeStr(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function prettyJSON(obj) {
  return JSON.stringify(obj, null, 2)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/^(\s*)"([^"]+)":/gm, '$1<span class="jk">"$2"</span>:')
    .replace(/:\s"([^"]*)"/g, ': <span class="jv">"$1"</span>')
    .replace(/:\s(true|false|null)/g, ': <span class="jb">$1</span>')
    .replace(/:\s(-?\d+\.?\d*)/g, ': <span class="jn">$1</span>');
}

function flagEmoji(cc) {
  if (!cc || cc.length !== 2) return '';
  return String.fromCodePoint(
    ...cc.toUpperCase().split('').map((c) => 0x1f1e6 - 65 + c.charCodeAt(0))
  );
}

function setText(id, value) {
  const el = $(id);
  if (el) el.textContent = value;
}

function setHTML(id, value) {
  const el = $(id);
  if (el) el.innerHTML = value;
}

function tag(text, cls) {
  return `<span class="tag tag-${cls}">${safeStr(text)}</span>`;
}

function c(text, cls) {
  return `<span class="${cls}">${safeStr(text)}</span>`;
}

function fmt(n) {
  const num = Number(n);
  return Number.isFinite(num) ? num.toLocaleString() : 'N/A';
}

function humanBigNumber(n) {
  const num = Number(n);
  if (!Number.isFinite(num)) return 'N/A';
  return new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 2 }).format(num);
}

function setProgress(pct, label) {
  const fill = $('progress-fill');
  const pctEl = $('scan-pct');
  const labelEl = $('scan-label');
  if (fill) fill.style.width = `${pct}%`;
  if (pctEl) pctEl.textContent = `${Math.round(pct)}%`;
  if (labelEl) labelEl.textContent = label;
}

function createCard(icon, title, fullWidth = false) {
  const grid = $('main-grid');
  if (!grid) return document.createElement('div');

  const card = document.createElement('div');
  card.className = `card${fullWidth ? ' card-full' : ''}`;
  card.innerHTML = `
    <div class="card-header">
      <span class="card-icon">${icon}</span>
      <span class="card-title">${safeStr(title)}</span>
    </div>
    <div class="card-body"></div>
  `;
  grid.appendChild(card);
  return card.querySelector('.card-body');
}

function row(body, label, html) {
  const d = document.createElement('div');
  d.className = 'row';
  d.innerHTML = `<span class="lbl">${safeStr(label)}</span><span class="val">${html}</span>`;
  body.appendChild(d);
}

function rawBlock(body, obj, label = 'Show raw response') {
  const wrap = document.createElement('div');
  wrap.className = 'raw-wrap';

  const btn = document.createElement('button');
  btn.className = 'toggle-btn';
  btn.textContent = `▶ ${label}`;

  const pre = document.createElement('pre');
  pre.className = 'json-block';
  pre.style.display = 'none';
  pre.innerHTML = prettyJSON(obj);

  btn.addEventListener('click', () => {
    const open = pre.style.display === 'none';
    pre.style.display = open ? 'block' : 'none';
    btn.textContent = `${open ? '▼' : '▶'} ${open ? 'Hide raw response' : label}`;
  });

  wrap.appendChild(btn);
  wrap.appendChild(pre);
  body.appendChild(wrap);
}

function parseBrowserFromUA(ua) {
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
    [/rv:([\d.]+).*Trident/, 'Internet Explorer']
  ];

  for (const [re, name] of rules) {
    const m = ua.match(re);
    if (m) {
      return { name, version: m[1].split('.')[0], fullVersion: m[1] };
    }
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
  if (android) return `Android ${android[1]}`;

  const iphone = ua.match(/iPhone OS ([\d_]+)/);
  if (iphone) return `iOS ${iphone[1].replace(/_/g, '.')}`;

  const ipad = ua.match(/iPad.*OS ([\d_]+)/);
  if (ipad) return `iPadOS ${ipad[1].replace(/_/g, '.')}`;

  const mac = ua.match(/Mac OS X ([\d_]+)/);
  if (mac) return `macOS ${mac[1].replace(/_/g, '.')}`;

  if (/Linux/.test(ua)) return 'Linux';
  return navigator.platform || 'Unknown';
}

function resolveOS(ua, hints) {
  if (!hints || !hints.platform) return parseOSFromUA(ua);

  const { platform, platformVersion = '', model = '', mobile } = hints;
  if (platform === 'Android') {
    const v = platformVersion.split('.')[0] || '?';
    const dev = model && model !== 'K' ? ` — ${model}` : '';
    return `Android ${v}${dev}`;
  }
  if (platform === 'Windows') {
    const major = parseInt(platformVersion.split('.')[0] || '0', 10);
    return major >= 13 ? 'Windows 11' : 'Windows 10';
  }
  if (platform === 'macOS') return `macOS ${platformVersion}`.trim();
  if (platform === 'iOS') return `iOS ${platformVersion}`.trim();
  if (platform === 'Chrome OS' || platform === 'ChromeOS') return 'ChromeOS';
  if (platform === 'Linux') return `Linux${mobile ? ' (mobile)' : ''}`;
  return `${platform} ${platformVersion}`.trim();
}

function resolveBrowser(ua, hints) {
  if (!hints?.fullVersionList?.length) return parseBrowserFromUA(ua);
  const real = hints.fullVersionList.filter((b) => !/Not/i.test(b.brand));
  const best = real.find((b) => b.brand !== 'Chromium') || real[0];
  if (!best) return parseBrowserFromUA(ua);
  return {
    name: best.brand,
    version: best.version.split('.')[0],
    fullVersion: best.version
  };
}

async function fetchJSON(url, timeout = 5000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, {
      cache: 'no-store',
      signal: controller.signal,
      headers: { accept: 'application/json' }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchIPData() {
  const providers = [
    {
      name: 'ipwho.is',
      url: 'https://ipwho.is/',
      map: (d) => {
        if (d.success === false || !d.ip) return null;
        return {
          ip: d.ip,
          type: d.type || 'IPv4',
          country: d.country || 'N/A',
          country_code: d.country_code || '',
          city: d.city || 'N/A',
          region: d.region || 'N/A',
          latitude: d.latitude,
          longitude: d.longitude,
          postal: d.postal || 'N/A',
          is_eu: d.is_eu ?? null,
          flag: { emoji: d.flag?.emoji || flagEmoji(d.country_code) },
          connection: {
            isp: d.connection?.isp || 'N/A',
            asn: d.connection?.asn || 'N/A'
          },
          timezone: { id: d.timezone?.id || 'N/A' },
          _src: 'ipwho.is',
          _raw: d
        };
      }
    },
    {
      name: 'ipapi.co',
      url: 'https://ipapi.co/json/',
      map: (d) => {
        if (d.error || !d.ip) return null;
        return {
          ip: d.ip,
          type: d.version || 'IPv4',
          country: d.country_name || 'N/A',
          country_code: d.country_code || '',
          city: d.city || 'N/A',
          region: d.region || 'N/A',
          latitude: d.latitude,
          longitude: d.longitude,
          postal: d.postal || 'N/A',
          is_eu: d.in_eu ?? null,
          flag: { emoji: flagEmoji(d.country_code) },
          connection: {
            isp: d.org || 'N/A',
            asn: d.asn || 'N/A'
          },
          timezone: { id: d.timezone || 'N/A' },
          _src: 'ipapi.co',
          _raw: d
        };
      }
    },
    {
      name: 'freeipapi',
      url: 'https://free.freeipapi.com/api/json',
      map: (d) => {
        if (!d.ipAddress) return null;
        return {
          ip: d.ipAddress,
          type: d.ipVersion === 6 ? 'IPv6' : 'IPv4',
          country: d.countryName || 'N/A',
          country_code: d.countryCode || '',
          city: d.cityName || 'N/A',
          region: d.regionName || 'N/A',
          latitude: d.latitude,
          longitude: d.longitude,
          postal: 'N/A',
          is_eu: null,
          flag: { emoji: flagEmoji(d.countryCode) },
          connection: {
            isp: 'N/A',
            asn: 'N/A'
          },
          timezone: { id: d.timeZone || 'N/A' },
          _src: 'free.freeipapi.com',
          _raw: d
        };
      }
    }
  ];

  for (const p of providers) {
    try {
      const raw = await fetchJSON(p.url, 5000);
      const normalized = p.map(raw);
      if (normalized) return normalized;
    } catch {}
  }
  return null;
}

async function getUAClientHints() {
  if (!navigator.userAgentData?.getHighEntropyValues) return null;
  try {
    return await navigator.userAgentData.getHighEntropyValues([
      'architecture',
      'bitness',
      'brands',
      'fullVersionList',
      'mobile',
      'model',
      'platform',
      'platformVersion'
    ]);
  } catch {
    return null;
  }
}

async function fetchRequestHeaders() {
  const urls = [
    'https://httpbin.org/headers',
    'https://httpbingo.org/headers'
  ];

  for (const url of urls) {
    try {
      const data = await fetchJSON(url, 5000);
      return { ...data, _src: url };
    } catch {}
  }
  return null;
}

async function getCanvasFP() {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 96;
    const ctx = canvas.getContext('2d');

    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#f8f8ff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const grad = ctx.createLinearGradient(0, 0, 320, 0);
    grad.addColorStop(0, '#ff7a18');
    grad.addColorStop(0.5, '#2ecc71');
    grad.addColorStop(1, '#007cf0');

    ctx.fillStyle = grad;
    ctx.font = 'bold 24px Arial';
    ctx.fillText('mvadel browser fingerprint', 10, 34);

    ctx.fillStyle = 'rgba(60, 60, 60, 0.9)';
    ctx.font = '16px "Courier New"';
    ctx.fillText('canvas • glyphs • curves • gradients', 10, 62);

    ctx.beginPath();
    ctx.arc(280, 42, 24, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(180, 50, 255, 0.45)';
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(20, 80);
    ctx.bezierCurveTo(60, 45, 140, 105, 220, 70);
    ctx.strokeStyle = 'rgba(20, 20, 20, 0.75)';
    ctx.lineWidth = 2;
    ctx.stroke();

    const dataUrl = canvas.toDataURL();
    const hash = await sha256(dataUrl);
    return { hash, dataUrl };
  } catch {
    return { hash: 'blocked', dataUrl: '' };
  }
}

async function getMathFP() {
  try {
    const parts = [
      Math.acos(0.123456789),
      Math.acosh(123.456789),
      Math.asin(0.123456789),
      Math.asinh(123.456789),
      Math.atan(0.123456789),
      Math.atanh(0.12345),
      Math.cbrt(123.456789),
      Math.cos(0.123456789),
      Math.cosh(0.123456789),
      Math.exp(0.123456789),
      Math.expm1(0.123456789),
      Math.hypot(0.123456789, 1.23456789),
      Math.log(123.456789),
      Math.log1p(0.123456789),
      Math.sin(0.123456789),
      Math.sinh(0.123456789),
      Math.sqrt(0.123456789),
      Math.tan(0.123456789),
      Math.tanh(0.123456789)
    ];
    return await sha256(parts.join(','));
  } catch {
    return 'N/A';
  }
}

function getCSSFeatures() {
  const mq = (q) => window.matchMedia(q).matches;
  return {
    colorGamut: mq('(color-gamut: rec2020)') ? 'rec2020' : mq('(color-gamut: p3)') ? 'P3' : 'sRGB',
    pointer: mq('(pointer: fine)') ? 'Fine' : mq('(pointer: coarse)') ? 'Coarse' : 'None',
    anyPointer: mq('(any-pointer: fine)') ? 'Fine' : mq('(any-pointer: coarse)') ? 'Coarse' : 'None',
    hover: mq('(hover: hover)'),
    prefersContrast: mq('(prefers-contrast: more)') ? 'More' : mq('(prefers-contrast: less)') ? 'Less' : 'No pref',
    invertedColors: mq('(inverted-colors: inverted)'),
    displayMode: mq('(display-mode: standalone)') ? 'Standalone (PWA)' : mq('(display-mode: fullscreen)') ? 'Fullscreen' : 'Browser tab'
  };
}

function getWebGLInfo() {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (!gl) return null;

    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const vendor = ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR);
    const renderer = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    const r = String(renderer || '').toLowerCase();

    const isSoftwareRenderer =
      r.includes('swiftshader') ||
      r.includes('llvmpipe') ||
      r.includes('softpipe') ||
      r.includes('microsoft basic render') ||
      r.includes('software renderer') ||
      (r.includes('mesa') && (r.includes('llvmpipe') || r.includes('softpipe') || r.includes('software')));

    return {
      vendor,
      renderer,
      version: gl.getParameter(gl.VERSION),
      glsl: gl.getParameter(gl.SHADING_LANGUAGE_VERSION),
      maxTex: gl.getParameter(gl.MAX_TEXTURE_SIZE),
      maxAA: typeof gl.getParameter(gl.MAX_SAMPLES) !== 'undefined' ? gl.getParameter(gl.MAX_SAMPLES) : 'N/A',
      extensions: gl.getSupportedExtensions()?.length || 0,
      isSoftwareRenderer
    };
  } catch {
    return null;
  }
}

function extractIPsFromCandidate(candidate) {
  const matches = candidate.match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g) || [];
  return matches;
}

function isPrivateIPv4(ip) {
  return /^(10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip);
}

async function getWebRTCIPs() {
  return new Promise((resolve) => {
    const out = { local: [], public: [], candidates: [] };
    try {
      const local = new Set();
      const pub = new Set();
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
      });

      pc.createDataChannel('probe');

      pc.onicecandidate = (e) => {
        if (!e.candidate) {
          try { pc.close(); } catch {}
          resolve({
            local: [...local],
            public: [...pub],
            candidates: out.candidates
          });
          return;
        }

        const cand = e.candidate.candidate || '';
        out.candidates.push(cand);

        for (const ip of extractIPsFromCandidate(cand)) {
          if (ip === '0.0.0.0') continue;
          if (isPrivateIPv4(ip)) local.add(ip);
          else pub.add(ip);
        }
      };

      pc.createOffer()
        .then((offer) => pc.setLocalDescription(offer))
        .catch(() => resolve(out));

      setTimeout(() => {
        try { pc.close(); } catch {}
        resolve({
          local: [...local],
          public: [...pub],
          candidates: out.candidates
        });
      }, 4000);
    } catch {
      resolve(out);
    }
  });
}

async function getAudioFP() {
  try {
    const OfflineCtx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!OfflineCtx) return 'not supported';

    const ctx = new OfflineCtx(1, 44100, 44100);
    const oscillator = ctx.createOscillator();
    const compressor = ctx.createDynamicsCompressor();
    const gain = ctx.createGain();

    oscillator.type = 'triangle';
    oscillator.frequency.value = 10000;

    compressor.threshold.value = -50;
    compressor.knee.value = 40;
    compressor.ratio.value = 12;
    compressor.attack.value = 0;
    compressor.release.value = 0.25;

    gain.gain.value = 0;

    oscillator.connect(compressor);
    compressor.connect(gain);
    gain.connect(ctx.destination);

    oscillator.start(0);

    const buffer = await ctx.startRendering();
    const data = buffer.getChannelData(0).slice(4500, 5000);
    const sum = data.reduce((acc, x) => acc + Math.abs(x), 0).toFixed(12);
    return await sha256(sum);
  } catch {
    return 'blocked';
  }
}

function detectFonts() {
  const fonts = [
    'Arial', 'Helvetica', 'Times New Roman', 'Courier New', 'Georgia', 'Verdana',
    'Tahoma', 'Trebuchet MS', 'Impact', 'Comic Sans MS', 'Palatino', 'Garamond',
    'Monaco', 'Consolas', 'Segoe UI', 'Ubuntu', 'Cantarell', 'Roboto', 'Open Sans',
    'Fira Sans', 'Source Code Pro', 'Lucida Console', 'Menlo', 'DejaVu Sans',
    'Noto Sans', 'Helvetica Neue', 'SF Pro Display'
  ];

  try {
    const baseFonts = ['monospace', 'sans-serif', 'serif'];
    const testText = 'mmmmmmmmmmlliWWW';
    const testSize = '72px';
    const body = document.body || document.documentElement;
    const span = document.createElement('span');

    span.textContent = testText;
    span.style.position = 'absolute';
    span.style.left = '-9999px';
    span.style.fontSize = testSize;
    span.style.visibility = 'hidden';
    body.appendChild(span);

    const defaultDims = {};
    for (const base of baseFonts) {
      span.style.fontFamily = base;
      defaultDims[base] = { w: span.offsetWidth, h: span.offsetHeight };
    }

    const detected = fonts.filter((font) => {
      return baseFonts.some((base) => {
        span.style.fontFamily = `'${font}',${base}`;
        return span.offsetWidth !== defaultDims[base].w || span.offsetHeight !== defaultDims[base].h;
      });
    });

    body.removeChild(span);
    return detected;
  } catch {
    return [];
  }
}

function getSpeechVoices() {
  return new Promise((resolve) => {
    if (!window.speechSynthesis) return resolve([]);
    const direct = speechSynthesis.getVoices();
    if (direct.length) return resolve(direct);

    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve(speechSynthesis.getVoices());
    };

    speechSynthesis.onvoiceschanged = finish;
    setTimeout(finish, 1500);
  });
}

async function getMediaDevices() {
  try {
    if (!navigator.mediaDevices?.enumerateDevices) return null;
    const devs = await navigator.mediaDevices.enumerateDevices();
    const counts = {};
    for (const d of devs) counts[d.kind] = (counts[d.kind] || 0) + 1;
    return { counts, total: devs.length };
  } catch {
    return null;
  }
}

async function getBattery() {
  try {
    if (!navigator.getBattery) return null;
    const b = await navigator.getBattery();
    return {
      level: Math.round(b.level * 100),
      charging: b.charging,
      chargingTime: b.chargingTime,
      dischargingTime: b.dischargingTime
    };
  } catch {
    return null;
  }
}

function getNetworkInfo() {
  const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  if (!conn) return null;
  return {
    effectiveType: conn.effectiveType || 'N/A',
    downlink: conn.downlink,
    rtt: conn.rtt,
    saveData: !!conn.saveData,
    type: conn.type || 'N/A'
  };
}

function getStorageSupport() {
  const s = {};
  try {
    localStorage.setItem('_t', '1');
    localStorage.removeItem('_t');
    s.localStorage = true;
  } catch {
    s.localStorage = false;
  }

  try {
    sessionStorage.setItem('_t', '1');
    sessionStorage.removeItem('_t');
    s.sessionStorage = true;
  } catch {
    s.sessionStorage = false;
  }

  s.cookies = navigator.cookieEnabled;
  s.indexedDB = !!window.indexedDB;
  s.sw = 'serviceWorker' in navigator;
  s.worker = typeof Worker !== 'undefined';
  s.wasm = typeof WebAssembly !== 'undefined';
  s.ws = typeof WebSocket !== 'undefined';
  s.geo = 'geolocation' in navigator;
  s.notif = 'Notification' in window;
  s.clipboard = 'clipboard' in navigator;
  s.bluetooth = 'bluetooth' in navigator;
  s.usb = 'usb' in navigator;
  s.nfc = 'nfc' in navigator;
  s.wakeLock = 'wakeLock' in navigator;
  s.serial = 'serial' in navigator;
  s.xr = 'xr' in navigator;
  s.payment = 'PaymentRequest' in window;
  return s;
}

function checkVPNLeak(ipData) {
  if (!ipData?.timezone?.id) return null;
  const sysTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const ipTz = ipData.timezone.id;
  return {
    leak: sysTz !== ipTz,
    sysTz,
    ipTz,
    msg: sysTz !== ipTz ? `System (${sysTz}) != IP (${ipTz})` : 'System matches IP timezone'
  };
}

async function detectIncognito() {
  return new Promise((resolve) => {
    try {
      const fs = window.RequestFileSystem || window.webkitRequestFileSystem;
      if (fs) {
        const timer = setTimeout(() => resolve({ detected: false, method: 'filesystem-timeout' }), 200);
        fs(
          window.TEMPORARY,
          100,
          () => {
            clearTimeout(timer);
            resolve({ detected: false, method: 'filesystem-ok' });
          },
          () => {
            clearTimeout(timer);
            resolve({ detected: true, method: 'filesystem-blocked' });
          }
        );
        return;
      }
      resolve({ detected: false, method: 'unsupported' });
    } catch {
      resolve({ detected: false, method: 'error' });
    }
  });
}

async function detectAdBlocker() {
  return new Promise((resolve) => {
    try {
      const bait = document.createElement('div');
      bait.className = 'adsbox ad-banner ad-unit sponsored';
      bait.style.cssText = 'position:absolute;left:-9999px;top:-9999px;width:1px;height:1px;';
      document.body.appendChild(bait);
      setTimeout(() => {
        const blocked = bait.offsetParent === null || bait.offsetHeight === 0 || getComputedStyle(bait).display === 'none';
        bait.remove();
        resolve(blocked);
      }, 100);
    } catch {
      resolve(false);
    }
  });
}

async function getMediaCapabilities() {
  if (!navigator.mediaCapabilities?.decodingInfo) return null;
  try {
    const hevcConfig = {
      type: 'file',
      video: {
        contentType: 'video/mp4; codecs="hvc1.1.6.L93.B0"',
        width: 1920,
        height: 1080,
        bitrate: 1000000,
        framerate: 30
      }
    };
    const av1Config = {
      type: 'file',
      video: {
        contentType: 'video/mp4; codecs="av01.0.04M.08"',
        width: 1920,
        height: 1080,
        bitrate: 1000000,
        framerate: 30
      }
    };

    const [hevc, av1] = await Promise.allSettled([
      navigator.mediaCapabilities.decodingInfo(hevcConfig),
      navigator.mediaCapabilities.decodingInfo(av1Config)
    ]);

    return {
      hevc: hevc.status === 'fulfilled' ? !!(hevc.value.supported && hevc.value.smooth) : false,
      av1: av1.status === 'fulfilled' ? !!(av1.value.supported && av1.value.smooth) : false,
      hdr: window.matchMedia('(dynamic-range: high)').matches
    };
  } catch {
    return null;
  }
}

function getGPUBenchmark() {
  try {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 256;
    const gl = c.getContext('webgl') || c.getContext('experimental-webgl');
    if (!gl) return null;
    const start = performance.now();
    for (let i = 0; i < 150; i++) gl.clear(gl.COLOR_BUFFER_BIT);
    return Math.round(performance.now() - start);
  } catch {
    return null;
  }
}

function getGamepads() {
  try {
    return navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean) : [];
  } catch {
    return [];
  }
}

async function getPermissionsStatus() {
  if (!navigator.permissions?.query) return null;

  const perms = [
    'geolocation',
    'notifications',
    'camera',
    'microphone',
    'clipboard-read',
    'clipboard-write'
  ];

  const results = {};
  for (const name of perms) {
    try {
      const status = await navigator.permissions.query({ name });
      results[name] = status.state;
    } catch {
      results[name] = 'unsupported';
    }
  }
  return results;
}

function getBotDetection() {
  const ua = navigator.userAgent;
  const platform = navigator.platform || 'Unknown';
  const uaOS = parseOSFromUA(ua);

  let platformMismatch = false;
  if (/Win/i.test(platform) && !/Windows/i.test(uaOS)) platformMismatch = true;
  if (/Mac/i.test(platform) && !/(macOS|iOS|iPadOS)/i.test(uaOS)) platformMismatch = true;
  if (/Linux/i.test(platform) && !/(Linux|Android|ChromeOS)/i.test(uaOS)) platformMismatch = true;

  const suspicious = [];
  if (navigator.webdriver) suspicious.push('webdriver=true');
  if (!navigator.languages || !navigator.languages.length) suspicious.push('languages empty');
  if ((navigator.plugins?.length || 0) === 0 && !/Mobile|Android|iPhone|iPad/i.test(ua)) suspicious.push('no plugins on desktop');
  if (platformMismatch) suspicious.push('platform mismatch');

  return {
    webdriver: !!navigator.webdriver,
    languages: navigator.languages?.length ? navigator.languages.join(', ') : '',
    plugins: navigator.plugins?.length || 0,
    pdfViewer: navigator.pdfViewerEnabled,
    gpc: navigator.globalPrivacyControl,
    platform,
    platformMismatch,
    suspicious
  };
}

function getInputConsistency() {
  const ua = navigator.userAgent;
  const isMobileUA = /Mobi|Android|iPhone/i.test(ua);
  const hasTouch = (navigator.maxTouchPoints || 0) > 0;
  const hasCoarsePointer = window.matchMedia('(pointer: coarse)').matches;
  const finePointer = window.matchMedia('(pointer: fine)').matches;

  if (isMobileUA && !hasTouch && !hasCoarsePointer && finePointer) {
    return { consistent: false, msg: 'Mobile UA but desktop-style input profile detected' };
  }

  if (!isMobileUA && hasTouch && hasCoarsePointer) {
    return { consistent: true, msg: 'Desktop/tablet hybrid or touch-enabled desktop' };
  }

  return { consistent: true, msg: 'Inputs match device profile' };
}

function getEntropyScore(data) {
  let bits = 0;
  const reasons = [];

  const add = (value, label, amount) => {
    if (value) {
      bits += amount;
      reasons.push(`${label}: +${amount} bits`);
    }
  };

  add(data.ua, 'User Agent', 10);
  add(data.browser, 'Browser family/version', 6);
  add(data.os, 'Operating system', 4);
  add(data.screen, 'Screen resolution', 4.5);
  add(data.timezone, 'Timezone', 3);
  add(data.lang, 'Language', 2);
  add(data.cpu, 'CPU cores', 2);
  add(data.memory, 'Device memory', 1.5);
  add(data.webglRenderer, 'GPU renderer', 8);
  add(data.canvasHash, 'Canvas FP', 5);
  add(data.audioHash, 'Audio FP', 5);
  add(data.mathHash, 'Math FP', 3);
  add(data.fontCount > 0 ? data.fontCount : 0, 'Installed fonts', Math.min(6, Math.log2((data.fontCount || 1) + 1)));
  add(data.webrtcPublicCount, 'WebRTC public candidates', 2);

  const uniqueness = Math.pow(2, bits);
  return {
    bits: Number(bits.toFixed(1)),
    uniqueness,
    display: `1 in ${humanBigNumber(uniqueness)}`,
    reasons
  };
}

async function runSpeedTest(onUpdate) {
  const BYTES = 5 * 1024 * 1024;
  onUpdate({ phase: 'ping' });

  let ping = null;
  try {
    const t = performance.now();
    await fetch(`https://speed.cloudflare.com/__down?bytes=0&t=${Date.now()}`, { cache: 'no-store' });
    ping = Math.round(performance.now() - t);
  } catch {}

  onUpdate({ phase: 'download', progress: 0, mbps: 0, ping });

  try {
    const start = performance.now();
    const res = await fetch(`https://speed.cloudflare.com/__down?bytes=${BYTES}&t=${Date.now()}`, { cache: 'no-store' });
    if (!res.body) throw new Error('Readable stream unavailable');

    const reader = res.body.getReader();
    let received = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      const elapsed = (performance.now() - start) / 1000;
      const mbps = (received * 8) / elapsed / 1e6;
      onUpdate({
        phase: 'download',
        progress: received / BYTES,
        mbps,
        ping
      });
    }

    const elapsed = (performance.now() - start) / 1000;
    const finalMbps = (received * 8) / elapsed / 1e6;
    onUpdate({
      phase: 'done',
      mbps: finalMbps.toFixed(2),
      bytes: received,
      elapsed: elapsed.toFixed(1),
      ping
    });
  } catch (err) {
    onUpdate({
      phase: 'error',
      msg: err?.message || 'CORS or network error'
    });
  }
}

async function main() {
  const T0 = performance.now();
  const ua = navigator.userAgent;
  const grid = $('main-grid');
  if (grid) grid.innerHTML = '';

  const sessionStart = Date.now();
  if ($('timer')) {
    setInterval(() => {
      setText('timer', `Session: ${Math.floor((Date.now() - sessionStart) / 1000)}s`);
    }, 1000);
  }

  let visits = 0;
  try {
    visits = parseInt(localStorage.getItem('_mv_visits') || '0', 10) + 1;
    localStorage.setItem('_mv_visits', String(visits));
  } catch {}
  if ($('visit-count') && visits > 0) {
    setText('visit-count', `${visits} ${visits === 1 ? 'visit' : 'visits'}`);
  }

  setProgress(5, 'Fetching network data…');

  const [
    ipData,
    canvasFP,
    webrtcRaw,
    audioFP,
    battery,
    uaHints,
    reqHeaders,
    voices,
    mediaDev,
    mathFP,
    mediaCaps,
    adBlock,
    incognito,
    perms
  ] = await Promise.all([
    fetchIPData(),
    getCanvasFP(),
    getWebRTCIPs(),
    getAudioFP(),
    getBattery(),
    getUAClientHints(),
    fetchRequestHeaders(),
    getSpeechVoices(),
    getMediaDevices(),
    getMathFP(),
    getMediaCapabilities(),
    detectAdBlocker(),
    detectIncognito(),
    getPermissionsStatus()
  ]);

  setProgress(75, 'Analysing environment…');

  const browser = resolveBrowser(ua, uaHints);
  const os = resolveOS(ua, uaHints);
  const webgl = getWebGLInfo();
  const fonts = detectFonts();
  const network = getNetworkInfo();
  const storage = getStorageSupport();
  const cssF = getCSSFeatures();
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const tzOff = -(new Date().getTimezoneOffset() / 60);
  const vpnLeak = checkVPNLeak(ipData);
  const gpuTime = getGPUBenchmark();
  const gamepads = getGamepads();
  const inputCon = getInputConsistency();
  const botInfo = getBotDetection();

  const mainPublicIP = ipData?.ip || '';
  const webrtcPublicLeaks = (webrtcRaw.public || []).filter((ip) => ip !== mainPublicIP);

  const fpID = await sha256([
    ua,
    canvasFP.hash,
    audioFP,
    mathFP,
    screen.width,
    screen.height,
    navigator.language,
    navigator.hardwareConcurrency,
    navigator.deviceMemory,
    webgl?.renderer || '',
    tz
  ].join('|'));

  const entropy = getEntropyScore({
    ua,
    browser: `${browser.name} ${browser.version}`,
    os,
    screen: `${screen.width}x${screen.height}`,
    timezone: tz,
    lang: navigator.language,
    cpu: navigator.hardwareConcurrency,
    memory: navigator.deviceMemory,
    webglRenderer: webgl?.renderer,
    canvasHash: canvasFP.hash,
    audioHash: audioFP,
    mathHash: mathFP,
    fontCount: fonts.length,
    webrtcPublicCount: webrtcPublicLeaks.length
  });

  setProgress(92, 'Rendering results…');

  setText('s-ip', ipData?.ip || '—');
  setText('s-loc', ipData ? `${ipData.flag?.emoji || ''} ${ipData.city || '?'}, ${ipData.country || '?'}` : 'Unknown');
  setText('s-browser', `${browser.name} ${browser.version}`);
  setText('s-os', os);
  setText('s-fp', fpID);
  if ($('summary')) $('summary').style.display = 'grid';

  const netB = createCard('🌍', 'Network & Location', true);
  if (ipData) {
    row(netB, 'Public IP', `${c(ipData.ip, 'blue')} <span class="dim">${safeStr(ipData.type || '')}</span>`);
    row(netB, 'Country', `${safeStr(ipData.flag?.emoji || '')} ${safeStr(ipData.country)} (${safeStr(ipData.country_code)})`);
    row(netB, 'City / Region', `${safeStr(ipData.city)} / ${safeStr(ipData.region)}`);
    if (Number.isFinite(Number(ipData.latitude)) && Number.isFinite(Number(ipData.longitude))) {
      row(netB, 'Coordinates', `${Number(ipData.latitude).toFixed(4)}, ${Number(ipData.longitude).toFixed(4)} <span class="dim">±50 km</span>`);
    }
    row(netB, 'ISP', c(ipData.connection?.isp || 'N/A', 'orange'));
    row(netB, 'ASN', safeStr(ipData.connection?.asn || 'N/A'));
    row(netB, 'Timezone (IP)', safeStr(ipData.timezone?.id || 'N/A'));
    row(netB, 'Source', safeStr(ipData._src));
    rawBlock(netB, ipData._raw || ipData, 'Show IP raw response');
  } else {
    row(netB, 'IP Lookup', tag('Failed', 'red'));
  }

  if (webrtcRaw.local.length) {
    row(netB, 'WebRTC Local Leaks', `${c(webrtcRaw.local.join(', '), 'red')} ${tag('LEAK', 'red')}`);
  } else {
    row(netB, 'WebRTC Local Leaks', tag('None', 'green'));
  }

  if (webrtcPublicLeaks.length) {
    row(netB, 'WebRTC Public Leaks', `${c(webrtcPublicLeaks.join(', '), 'red')} ${tag('VPN bypass risk', 'red')}`);
  } else {
    row(netB, 'WebRTC Public Leaks', tag('None', 'green'));
  }

  const privB = createCard('🕵', 'Privacy & Anonymity');
  if (vpnLeak) {
    row(privB, 'VPN / Proxy Leak', vpnLeak.leak ? `${tag('Mismatch', 'red')} <span class="dim">${safeStr(vpnLeak.msg)}</span>` : tag('Consistent', 'green'));
  } else {
    row(privB, 'VPN / Proxy Leak', tag('Unknown', 'yellow'));
  }
  row(privB, 'Incognito Mode', incognito.detected ? `${tag('Likely', 'yellow')} <span class="dim">${safeStr(incognito.method)}</span>` : tag('Not detected', 'green'));
  row(privB, 'Ad-Blocker', adBlock ? tag('Active', 'green') : tag('Not detected', 'yellow'));
  row(privB, 'GPC Signal', botInfo.gpc ? tag('Enabled', 'green') : tag('Not set', 'yellow'));
  row(privB, 'Cookies', navigator.cookieEnabled ? tag('Enabled', 'yellow') : tag('Disabled', 'green'));

  const secB = createCard('🔐', 'Security & Bot Detection');
  row(secB, 'Automation', botInfo.webdriver ? tag('Detected', 'red') : tag('None', 'green'));
  row(secB, 'Languages', botInfo.languages ? safeStr(botInfo.languages) : tag('Empty', 'yellow'));
  row(secB, 'Plugins', String(botInfo.plugins));
  row(secB, 'Platform', safeStr(botInfo.platform));
  row(secB, 'Platform Mismatch', botInfo.platformMismatch ? tag('Suspicious', 'yellow') : tag('No', 'green'));
  row(secB, 'Headless Signals', botInfo.suspicious.length ? `${tag('Suspicious', 'yellow')} <span class="dim">${safeStr(botInfo.suspicious.join(' | '))}</span>` : tag('Normal', 'green'));
  row(secB, 'Input Consistency', inputCon.consistent ? `${tag('Consistent', 'green')} <span class="dim">${safeStr(inputCon.msg)}</span>` : `${tag('Spoofing suspected', 'red')} <span class="dim">${safeStr(inputCon.msg)}</span>`);

  if (webgl?.isSoftwareRenderer) {
    row(secB, 'GPU Type', `${tag('Software renderer', 'yellow')} <span class="dim">Possible VM / bot / no HW accel</span>`);
  } else if (webgl) {
    row(secB, 'GPU Type', tag('Hardware accelerated', 'green'));
  }

  const permB = createCard('👁', 'Permissions Audit');
  if (perms) {
    for (const [name, state] of Object.entries(perms)) {
      const cls = state === 'granted' ? 'green' : state === 'denied' ? 'red' : 'yellow';
      row(permB, name, tag(state, cls));
    }
  } else {
    row(permB, 'Permissions API', tag('Unsupported', 'yellow'));
  }

  row(permB, 'Camera Status', '<span id="cam-status">Click button to test</span>');
  row(permB, 'Camera Feed', '<video id="cam-feed" autoplay playsinline muted style="max-width:100%;max-height:120px;background:#000;border-radius:4px;display:none;"></video>');

  const camBtn = document.createElement('button');
  camBtn.className = 'speed-run-btn';
  camBtn.textContent = '▶ Test Camera Access';
  camBtn.style.margin = '10px 14px';
  camBtn.addEventListener('click', async () => {
    const videoEl = $('cam-feed');
    const statusEl = $('cam-status');
    if (statusEl) statusEl.innerHTML = 'Requesting...';
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      if (videoEl) {
        videoEl.srcObject = stream;
        videoEl.style.display = 'block';
      }
      if (statusEl) statusEl.innerHTML = tag('GRANTED', 'green');
    } catch {
      if (statusEl) statusEl.innerHTML = tag('DENIED', 'red');
    }
  });
  permB.appendChild(camBtn);

  const brB = createCard('🔭', 'Browser & Runtime');
  row(brB, 'Browser', c(`${browser.name} ${browser.fullVersion}`, 'blue'));
  row(brB, 'OS', c(os, 'orange'));
  row(brB, 'Engine', /Firefox/.test(ua) && /Gecko/.test(ua) ? 'Gecko' : /Trident/.test(ua) ? 'Trident' : 'Blink / WebKit');
  row(brB, 'User Agent', `<span class="mono-sm">${safeStr(ua)}</span>`);
  row(brB, 'PDF Viewer', botInfo.pdfViewer ? 'Enabled' : 'Disabled');
  if (uaHints) rawBlock(brB, uaHints, 'Show UA Client Hints');

  const devB = createCard('💻', 'Device & System');
  row(devB, 'CPU Cores', navigator.hardwareConcurrency ? `${navigator.hardwareConcurrency}` : 'N/A');
  row(devB, 'Device Memory', navigator.deviceMemory ? `≥ ${navigator.deviceMemory} GB` : 'N/A');
  row(devB, 'Touch Points', String(navigator.maxTouchPoints || 0));
  row(devB, 'Language', safeStr(navigator.language || 'N/A'));
  row(devB, 'Languages', safeStr(navigator.languages?.join(', ') || 'N/A'));
  if (battery) {
    row(devB, 'Battery', `${battery.level}% ${battery.charging ? '(charging)' : ''}`);
  }
  if (network) {
    row(devB, 'Network', `${safeStr(network.effectiveType || 'N/A')} • ${safeStr(network.downlink || 'N/A')} Mbps • ${safeStr(network.rtt || 'N/A')} ms`);
    row(devB, 'Save-Data', network.saveData ? tag('On', 'yellow') : tag('Off', 'green'));
  }
  if (mediaDev) {
    row(devB, 'Media Devices', `Total ${fmt(mediaDev.total)} • ${safeStr(JSON.stringify(mediaDev.counts))}`);
  }

  const hwB = createCard('🎮', 'Hardware & Codecs');
  if (webgl) {
    row(hwB, 'GPU Vendor', safeStr(webgl.vendor || 'N/A'));
    row(hwB, 'GPU Renderer', `<span class="mono-sm">${safeStr(webgl.renderer || 'N/A')}</span>`);
    row(hwB, 'WebGL', safeStr(webgl.version || 'N/A'));
    row(hwB, 'GLSL', safeStr(webgl.glsl || 'N/A'));
    row(hwB, 'Max Texture', fmt(webgl.maxTex));
    row(hwB, 'AA Samples', fmt(webgl.maxAA));
    row(hwB, 'Extensions', fmt(webgl.extensions));
  } else {
    row(hwB, 'WebGL', tag('Unavailable', 'red'));
  }

  if (mediaCaps) {
    row(hwB, 'HEVC / H.265', mediaCaps.hevc ? tag('Supported', 'green') : tag('No', 'red'));
    row(hwB, 'AV1', mediaCaps.av1 ? tag('Supported', 'green') : tag('No', 'red'));
    row(hwB, 'HDR', mediaCaps.hdr ? tag('Yes', 'blue') : tag('No', 'yellow'));
  }

  if (gpuTime !== null) row(hwB, 'GPU Render Time', `${gpuTime} ms`);
  if (gamepads.length) row(hwB, 'Gamepads', safeStr(gamepads.map((p) => p.id).join(', ')));

  const scrB = createCard('🖵', 'Screen & Display');
  row(scrB, 'Screen Size', `${screen.width} × ${screen.height}`);
  row(scrB, 'Viewport', `${window.innerWidth} × ${window.innerHeight}`);
  row(scrB, 'Pixel Ratio', `${window.devicePixelRatio}×`);
  row(scrB, 'Color Scheme', window.matchMedia('(prefers-color-scheme: dark)').matches ? 'Dark' : 'Light');
  row(scrB, 'Color Gamut', safeStr(cssF.colorGamut));
  row(scrB, 'Pointer', `${safeStr(cssF.pointer)} / any: ${safeStr(cssF.anyPointer)}`);
  row(scrB, 'Hover', cssF.hover ? 'Yes' : 'No');
  row(scrB, 'Contrast', safeStr(cssF.prefersContrast));
  row(scrB, 'Display Mode', safeStr(cssF.displayMode));

  const httpB = createCard('📨', 'HTTP Request Inspector', true);
  if (reqHeaders?.headers) {
    const h = reqHeaders.headers;
    const want = [
      'User-Agent', 'user-agent',
      'Accept', 'accept',
      'Accept-Language', 'accept-language',
      'Accept-Encoding', 'accept-encoding',
      'Sec-Ch-Ua', 'sec-ch-ua'
    ];

    const seen = new Set();
    for (const key of want) {
      if (seen.has(key.toLowerCase())) continue;
      if (h[key]) {
        row(httpB, key, `<span class="mono-sm">${safeStr(h[key])}</span>`);
        seen.add(key.toLowerCase());
      }
    }

    row(httpB, 'Source', safeStr(reqHeaders._src || 'N/A'));
    rawBlock(httpB, reqHeaders, 'Show header raw response');
  } else {
    row(httpB, 'Status', tag('Unreachable', 'red'));
  }

  const fpB = createCard('🎨', 'Fingerprints', true);
  row(fpB, 'Fingerprint ID', c(fpID, 'purple'));
  row(fpB, 'Canvas FP', c(canvasFP.hash, 'purple'));
  row(fpB, 'Audio FP', c(audioFP, 'purple'));
  row(fpB, 'Math FP', c(mathFP, 'purple'));
  if (canvasFP.dataUrl) {
    row(
      fpB,
      'Canvas Preview',
      `<img src="${canvasFP.dataUrl}" alt="Canvas fingerprint preview" style="max-width:100%;border-radius:8px;border:1px solid rgba(255,255,255,.12)">`
    );
  }
  if (webgl) {
    row(fpB, 'GPU Renderer', `<span class="mono-sm">${safeStr(webgl.renderer)}</span>`);
  }

  const fntB = createCard('🔤', `Fonts & Voices (${fonts.length})`, true);
  if (fonts.length) {
    row(
      fntB,
      'Detected Fonts',
      fonts
        .slice(0, 18)
        .map((f) => `<span style="font-family:'${safeStr(f)}',sans-serif;margin-right:10px">${safeStr(f)}</span>`)
        .join(', ')
    );
  } else {
    row(fntB, 'Detected Fonts', tag('Blocked / none', 'yellow'));
  }
  row(fntB, 'Speech Voices', String(voices.length || 0));

  const stB = createCard('🔌', 'Storage & APIs');
  const yn = (v, y = 'green', n = 'red') => (v ? tag('Yes', y) : tag('No', n));
  row(stB, 'localStorage', yn(storage.localStorage));
  row(stB, 'sessionStorage', yn(storage.sessionStorage));
  row(stB, 'IndexedDB', yn(storage.indexedDB));
  row(stB, 'Service Worker', yn(storage.sw, 'yellow', 'yellow'));
  row(stB, 'Web Worker', yn(storage.worker));
  row(stB, 'WebAssembly', yn(storage.wasm));
  row(stB, 'WebSocket', yn(storage.ws));
  row(stB, 'Geolocation', yn(storage.geo));
  row(stB, 'Notifications', yn(storage.notif));
  row(stB, 'Clipboard', yn(storage.clipboard));
  row(stB, 'Bluetooth', yn(storage.bluetooth, 'yellow', 'yellow'));
  row(stB, 'USB', yn(storage.usb, 'yellow', 'yellow'));
  row(stB, 'Serial', yn(storage.serial, 'yellow', 'yellow'));
  row(stB, 'NFC', yn(storage.nfc, 'yellow', 'yellow'));
  row(stB, 'XR', yn(storage.xr, 'yellow', 'yellow'));
  row(stB, 'PaymentRequest', yn(storage.payment, 'yellow', 'yellow'));

  const entB = createCard('⚡', 'Entropy & Performance');
  row(entB, 'Timezone (JS)', c(tz, 'blue'));
  row(entB, 'UTC Offset', `UTC${tzOff >= 0 ? '+' : ''}${tzOff}`);
  row(entB, 'Entropy', `${entropy.bits} bits`);
  row(entB, 'Uniqueness', `~ ${safeStr(entropy.display)}`);
  row(entB, 'Scan Duration', c(`${Math.round(performance.now() - T0)} ms`, 'green'));
  row(entB, 'Entropy Factors', `<span class="dim">${safeStr(entropy.reasons.join(' | '))}</span>`);

  const spdB = createCard('🚀', 'Speed Test');
  const spdDisp = document.createElement('div');
  spdDisp.className = 'speed-display';
  spdDisp.innerHTML = `<span id="spd-val" style="font-size:36px;font-weight:700;color:var(--g)">—</span> <span style="font-size:12px;color:var(--mu)">Mbps</span>`;
  spdB.appendChild(spdDisp);

  const spdBar = document.createElement('div');
  spdBar.className = 'speed-bar-wrap';
  spdBar.innerHTML = `<div class="speed-bar-bg"><div id="spd-bar" class="speed-bar-fill"></div></div>`;
  spdB.appendChild(spdBar);

  row(spdB, 'Latency', '<span id="spd-ping">—</span>');

  const spdBtn = document.createElement('button');
  spdBtn.className = 'speed-run-btn';
  spdBtn.textContent = '▶ Run Speed Test';
  spdBtn.addEventListener('click', async () => {
    spdBtn.disabled = true;
    spdBtn.textContent = '⟳ Testing…';
    await runSpeedTest(({ phase, progress = 0, mbps = 0, ping }) => {
      const vEl = $('spd-val');
      const bEl = $('spd-bar');
      const pEl = $('spd-ping');

      if (phase === 'ping') {
        if (pEl) pEl.textContent = '...';
      }
      if (phase === 'download') {
        if (vEl) vEl.textContent = Number(mbps).toFixed(1);
        if (bEl) bEl.style.width = `${Math.min(progress * 100, 100)}%`;
        if (pEl && ping != null) pEl.textContent = `${ping} ms`;
      }
      if (phase === 'done') {
        if (vEl) vEl.textContent = String(mbps);
        if (bEl) bEl.style.width = '100%';
        spdBtn.disabled = false;
        spdBtn.textContent = '↻ Run Again';
      }
      if (phase === 'error') {
        if (vEl) vEl.textContent = 'ERR';
        spdBtn.disabled = false;
        spdBtn.textContent = '↻ Retry';
      }
    });
  });
  spdB.appendChild(spdBtn);

  setProgress(100, '✓ Scan complete');
  setTimeout(() => {
    const scanBar = $('scan-bar');
    const scanLabel = $('scan-label');
    const scanPct = $('scan-pct');
    if (scanBar) scanBar.style.borderColor = 'rgba(63,185,80,.5)';
    if (scanLabel) scanLabel.style.color = 'var(--g)';
    if (scanPct) scanPct.style.color = 'var(--g)';
  }, 200);
}

main().catch((err) => {
  console.error(err);
  setProgress(100, 'Scan failed');
  const grid = $('main-grid');
  if (grid) {
    const body = createCard('❌', 'Fatal Error', true);
    row(body, 'Message', `<span class="mono-sm">${safeStr(err?.message || 'Unknown error')}</span>`);
  }
});
