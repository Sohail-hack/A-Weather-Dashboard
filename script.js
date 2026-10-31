// Keys come from keys.local.js (window.OPENWEATHER_KEY, window.NEWSDATA_KEY). Keep that file out of git.
const apiKey = window.OPENWEATHER_KEY || '';
const newsApiKey = window.NEWSDATA_KEY || '';
const OWM = 'https://api.openweathermap.org/data/2.5';

const store = {
  get(k, d){ try { return localStorage.getItem(k) || d; } catch { return d; } },
  set(k, v){ try { localStorage.setItem(k, v); } catch {} }
};
let units = store.get('dc-units', 'metric');
let lastCity = store.get('dc-city', 'Hyderabad');
let reqId = 0, shownTemp = null;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

const CITIES = ['Hyderabad','Secunderabad','Warangal','Karimnagar','Nizamabad','Khammam','Vijayawada','Visakhapatnam','New Delhi','Mumbai','Bengaluru','Chennai','Kolkata','Pune','Ahmedabad','Lucknow','Jaipur','Surat','Kanpur','Nagpur','Indore','Bhopal','Kochi','Coimbatore','Chandigarh','Patna','Guwahati'];

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safeUrl = u => /^https?:\/\//i.test(u) ? u : '#';

/* ---------- Sky: palette per condition [top, middle, bottom, accent] ---------- */
const SKY = {
  clear:  ['#1a54bd', '#2f78d0', '#5fa3e0', '#1a54bd'],
  night:  ['#0a1230', '#15244d', '#2a3d78', '#9bbcff'],
  dusk:   ['#2f2f6b', '#a24c72', '#d9784f', '#a83a5c'],
  clouds: ['#43566c', '#62778f', '#7589a0', '#3f5f86'],
  rain:   ['#26384b', '#3b556c', '#58778f', '#2f6f9f'],
  storm:  ['#1f1b38', '#38325f', '#5b4b82', '#6a4cb8'],
  snow:   ['#587086', '#6a8399', '#8ea5b8', '#3d7ba8'],
  mist:   ['#566463', '#6b7a78', '#8a9895', '#43706c']
};

function skyFor(d){
  const id = d.weather[0].id, now = d.dt, { sunrise, sunset } = d.sys;
  const night = now < sunrise || now > sunset;
  const nearEdge = Math.min(Math.abs(now - sunrise), Math.abs(now - sunset)) < 2700;
  let g = id < 300 ? 'storm' : id < 600 ? 'rain' : id < 700 ? 'snow' : id < 800 ? 'mist' : id === 800 ? 'clear' : 'clouds';
  if (g === 'clear' || g === 'clouds'){
    if (nearEdge) g = 'dusk'; else if (night) g = 'night';
  }
  return { g, night };
}

function applySky({ g, night }){
  const p = SKY[g], b = document.body;
  const dark = night && g !== 'dusk';
  b.style.setProperty('--a', p[0]);
  b.style.setProperty('--b', p[1]);
  b.style.setProperty('--c', p[2]);
  b.style.setProperty('--accent', dark ? '#9bbcff' : p[3]);
  b.dataset.theme = dark ? 'dark' : 'light';
  b.dataset.dim = (night && !['night','dusk'].includes(g)) ? '1' : '0';
}

/* ---------- Weather icons (hand-drawn SVG, mapped from OpenWeather condition ids) ---------- */
const CLOUD = 'M18 44h26a9 9 0 0 0 1.5-17.9A13 13 0 0 0 20.2 29 8 8 0 0 0 18 44z';
const cloud = (fill = '#fff', t = '') => `<g class="drift"><path fill="${fill}" ${t ? `transform="${t}"` : ''} d="${CLOUD}"/></g>`;
const sun = (cx, cy, r) =>
  `<g class="rays" stroke="#ffd25e" stroke-width="3" stroke-linecap="round" style="transform-origin:${cx}px ${cy}px">` +
  [...Array(8)].map((_, i) => `<path d="M${cx} ${cy - r - 4}v-5" transform="rotate(${i * 45} ${cx} ${cy})"/>`).join('') +
  `</g><circle cx="${cx}" cy="${cy}" r="${r}" fill="#ffd25e"/>`;
const moon = '<path fill="#eef1ff" d="M42 12a20 20 0 1 0 14 34 16 16 0 0 1-14-34z"/><circle cx="50" cy="16" r="1.6" fill="#eef1ff"/><circle cx="56" cy="26" r="1.2" fill="#eef1ff"/>';
const drops = (n, y = 46) => `<g stroke="#8ec8ff" stroke-width="3" stroke-linecap="round">` +
  [24, 33, 42].slice(0, n).map((x, i) => `<path class="drop" style="animation-delay:${i * .35}s" d="M${x} ${y}l-2 6"/>`).join('') + '</g>';

function weatherIcon(id, night, still){
  let body, label;
  if (id === 800){ body = night ? moon : sun(32, 32, 10); label = 'Clear'; }
  else if (id === 801){ body = (night ? `<g transform="translate(-6 -6) scale(.85)">${moon}</g>` : sun(24, 24, 8)) + cloud('#fff', 'translate(6 4)'); label = 'Few clouds'; }
  else if (id < 300){ body = cloud('#c3cbd9', 'translate(0 -6)') + '<path class="bolt" fill="#ffd25e" d="M35 36l-9 13h7l-3 12 11-16h-7z"/>'; label = 'Thunderstorm'; }
  else if (id < 600){ body = cloud('#e6ecf4', 'translate(0 -6)') + drops(3, 44); label = 'Rain'; }
  else if (id < 700){ body = cloud('#eef2f8', 'translate(0 -6)') + '<g fill="#fff">' + [24, 33, 42].map((x, i) => `<circle class="drop" style="animation-delay:${i * .4}s" cx="${x}" cy="${i === 1 ? 54 : 49}" r="2.6"/>`).join('') + '</g>'; label = 'Snow'; }
  else if (id < 800){ body = '<g stroke="#fff" stroke-width="3.5" stroke-linecap="round" opacity=".9"><path d="M14 22h30M20 31h34M12 40h28M22 49h26"/></g>'; label = 'Mist'; }
  else { body = cloud(id === 802 ? '#cfd8e5' : '#aeb9c9', 'translate(-7 -7) scale(.85)') + cloud('#fff'); label = 'Cloudy'; }
  return `<svg class="wx${still ? ' still' : ''}" viewBox="0 0 64 64" role="img" aria-label="${label}">${body}</svg>`;
}

/* ---------- Helpers ---------- */
function countTo(el, to){
  const from = shownTemp ?? to; shownTemp = to;
  if (reduceMotion || from === to){ el.textContent = `${to}°`; return; }
  const t0 = performance.now(), dur = 900;
  const step = t => {
    const p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 3);
    el.textContent = `${Math.round(from + (to - from) * e)}°`;
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function setStatus(msg, isError){
  $('status').textContent = msg || '';
  $('status').setAttribute('role', isError ? 'alert' : 'status');
}

/* ---------- Main flow ---------- */
async function load(city){
  const my = ++reqId;
  lastCity = city; store.set('dc-city', city);
  if (!apiKey){ setStatus('Add your OpenWeather key to keys.local.js to load the forecast.', true); return; }
  document.body.classList.add('loading');
  setStatus('');
  try {
    const q = `q=${encodeURIComponent(city)}&units=${units}&appid=${apiKey}`;
    const [cr, fr] = await Promise.all([fetch(`${OWM}/weather?${q}`), fetch(`${OWM}/forecast?${q}`)]);
    if (cr.status === 404) throw new Error(`Couldn’t find “${city}”. Check the spelling or try a nearby city.`);
    if (cr.status === 401) throw new Error('OpenWeather rejected the API key. Check keys.local.js.');
    if (!cr.ok || !fr.ok) throw new Error('The weather service isn’t responding. Try again in a moment.');
    const [cur, fc] = await Promise.all([cr.json(), fr.json()]);
    if (my !== reqId) return;
    render(cur, fc);
    addRecent(cur.name);
    loadAbout(cur.name, my);
    loadNews(cur.name, my);
  } catch (e){
    if (my === reqId) setStatus(e instanceof TypeError ? 'Can’t reach the weather service. Check your connection.' : e.message, true);
  } finally {
    if (my === reqId) document.body.classList.remove('loading');
  }
}

function render(d, f){
  const local = ts => new Date((ts + d.timezone) * 1000);
  const clock = ts => local(ts).toLocaleTimeString('en-IN', { hour:'numeric', minute:'2-digit', timeZone:'UTC' });
  const key = ts => local(ts).toISOString().slice(0, 10);
  const metric = units === 'metric';

  // group forecast by the city's own calendar day
  const days = {};
  f.list.forEach(it => { const l = local(it.dt); (days[key(it.dt)] ??= []).push({ it, h: l.getUTCHours() }); });
  const today = key(d.dt), todays = days[today] || [];
  const hi = Math.round(Math.max(d.main.temp, ...todays.map(x => x.it.main.temp_max)));
  const lo = Math.round(Math.min(d.main.temp, ...todays.map(x => x.it.main.temp_min)));

  const sky = skyFor(d);
  applySky(sky);

  // hero
  const w = d.weather[0];
  $('location').textContent = [d.name, d.sys.country].filter(Boolean).join(', ');
  countTo($('temp'), Math.round(d.main.temp));
  $('description').textContent = w.description;
  $('feels').textContent = `Feels like ${Math.round(d.main.feels_like)}°. High ${hi}°, low ${lo}°.`;
  $('date').textContent = `${local(d.dt).toLocaleDateString('en-IN', { weekday:'long', day:'numeric', month:'long', timeZone:'UTC' })}, ${clock(d.dt)}`;
  const icon = $('hero-icon');
  icon.innerHTML = weatherIcon(w.id, sky.night, false);
  icon.classList.remove('pop'); void icon.offsetWidth; icon.classList.add('pop');
  document.title = `${Math.round(d.main.temp)}° in ${d.name} – The Daily Climate`;

  // conditions
  const dirs = ['N','NE','E','SE','S','SW','W','NW'];
  const dir = d.wind.deg != null ? ` ${dirs[Math.round(d.wind.deg / 45) % 8]}` : '';
  $('wind').textContent = (metric ? `${Math.round(d.wind.speed * 3.6)} km/h` : `${Math.round(d.wind.speed)} mph`) + dir;
  $('humidity').textContent = `${d.main.humidity}%`;
  $('pressure').textContent = `${d.main.pressure} hPa`;
  const v = d.visibility ?? 10000;
  $('visibility').textContent = metric ? `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)} km` : `${(v / 1609.34).toFixed(1)} mi`;
  $('sunrise').textContent = clock(d.sys.sunrise);
  $('sunset').textContent = clock(d.sys.sunset);

  // five-day ranges on one shared scale
  const rows = Object.keys(days).sort().filter(k => k !== today).slice(0, 5).map(k => {
    const a = days[k], mid = a.reduce((b, x) => Math.abs(x.h - 12) < Math.abs(b.h - 12) ? x : b);
    return {
      name: new Date(`${k}T00:00:00Z`).toLocaleDateString('en-IN', { weekday:'short', timeZone:'UTC' }),
      lo: Math.round(Math.min(...a.map(x => x.it.main.temp_min))),
      hi: Math.round(Math.max(...a.map(x => x.it.main.temp_max))),
      w: mid.it.weather[0]
    };
  });
  const list = $('forecast-list');
  list.classList.remove('in');
  if (rows.length){
    const gmin = Math.min(...rows.map(r => r.lo)), span = Math.max(1, Math.max(...rows.map(r => r.hi)) - gmin);
    list.innerHTML = rows.map((r, i) => {
      const l = (r.lo - gmin) / span * 100, wd = Math.max(8, (r.hi - r.lo) / span * 100);
      return `<li style="--l:${l.toFixed(1)}%;--w:${Math.min(wd, 100 - l).toFixed(1)}%;--i:${i}">
        <span class="dn">${r.name}</span><span class="fi">${weatherIcon(r.w.id, false, true)}</span>
        <span class="lo">${r.lo}°</span><span class="track"><i class="fill"></i></span><span class="hi">${r.hi}°</span></li>`;
    }).join('');
    void list.offsetWidth; list.classList.add('in');
  } else list.innerHTML = '<li class="empty">Forecast isn’t available for this place.</li>';
}

/* ---------- Wikipedia summary ---------- */
async function loadAbout(name, my){
  const sec = $('ai-insights'), box = $('location-description');
  const summary = async t => { const r = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(t)}`); return r.ok ? r.json() : null; };
  try {
    let j = await summary(name);
    if (!j || !j.extract || j.type === 'disambiguation'){
      const s = await (await fetch(`https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(name + ' city')}&limit=1&namespace=0&format=json&origin=*`)).json();
      j = s[1] && s[1][0] ? await summary(s[1][0]) : null;
    }
    if (my !== reqId) return;
    if (!j || !j.extract) { sec.hidden = true; return; }
    let t = j.extract.replace(/\s+/g, ' ').trim();
    if (t.length > 420){ const cut = t.slice(0, 420), i = cut.lastIndexOf('. '); t = i > 150 ? cut.slice(0, i + 1) : cut.trimEnd() + '…'; }
    const img = j.thumbnail && j.thumbnail.source;
    const page = j.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${encodeURIComponent(j.title)}`;
    $('about-title').textContent = `About ${name}`;
    box.innerHTML = `<div class="about-body${img ? '' : ' noimg'}">${img ? `<img src="${esc(img)}" alt="" loading="lazy">` : ''}
      <div>${j.description ? `<p class="what">${esc(j.description)}</p>` : ''}<p>${esc(t)}</p>
      <a href="${esc(safeUrl(page))}" target="_blank" rel="noopener noreferrer">Continue on Wikipedia</a></div></div>`;
    sec.hidden = false;
  } catch { if (my === reqId) sec.hidden = true; }
}

/* ---------- News (NewsData.io) ---------- */
async function loadNews(query, my){
  const sec = $('news-section'), ul = $('news-list');
  if (!newsApiKey || newsApiKey.length < 10){ sec.hidden = true; return; }
  try {
    const r = await fetch(`https://newsdata.io/api/1/news?apikey=${encodeURIComponent(newsApiKey)}&q=${encodeURIComponent(query)}&language=en`);
    if (!r.ok) throw new Error();
    const j = await r.json();
    if (my !== reqId) return;
    const items = (Array.isArray(j.results) ? j.results : []).slice(0, 5);
    ul.innerHTML = items.length ? items.map(it => {
      const src = it.source_name || it.source_id || '';
      const date = it.pubDate ? new Date(it.pubDate.replace(' ', 'T') + 'Z').toLocaleDateString('en-IN', { day:'numeric', month:'short' }) : '';
      return `<li class="${it.image_url ? '' : 'noimg'}">${it.image_url ? `<img src="${esc(it.image_url)}" alt="" loading="lazy" onerror="this.remove()">` : ''}
        <div><a href="${esc(safeUrl(it.link))}" target="_blank" rel="noopener noreferrer">${esc(it.title || 'Untitled')}</a>
        <small>${esc([src, date].filter(Boolean).join(', '))}</small></div></li>`;
    }).join('') : `<li class="empty">No recent headlines for ${esc(query)}.</li>`;
    sec.hidden = false;
  } catch { if (my === reqId){ ul.innerHTML = '<li class="empty">Headlines couldn’t be loaded right now.</li>'; sec.hidden = false; } }
}

/* ---------- Recent searches ---------- */
function renderRecent(){
  let r = []; try { r = JSON.parse(store.get('dc-recent', '[]')); } catch {}
  $('recent').hidden = !r.length;
  $('recent-list').innerHTML = r.map(c => `<button type="button" class="chip">${esc(c)}</button>`).join('');
}
function addRecent(name){
  let r = []; try { r = JSON.parse(store.get('dc-recent', '[]')); } catch {}
  r = [name, ...r.filter(c => c.toLowerCase() !== name.toLowerCase())].slice(0, 6);
  store.set('dc-recent', JSON.stringify(r)); renderRecent();
}
$('recent-list').addEventListener('click', e => { const b = e.target.closest('.chip'); if (b){ input.value = b.textContent; load(b.textContent); } });

/* ---------- Units ---------- */
const seg = $('units');
function setUnits(u){
  units = u; store.set('dc-units', u);
  seg.dataset.unit = u;
  $('btn-c').setAttribute('aria-pressed', u === 'metric');
  $('btn-f').setAttribute('aria-pressed', u === 'imperial');
}
$('btn-c').addEventListener('click', () => { if (units !== 'metric'){ setUnits('metric'); load(lastCity); } });
$('btn-f').addEventListener('click', () => { if (units !== 'imperial'){ setUnits('imperial'); load(lastCity); } });

/* ---------- Search + suggestions ---------- */
const input = $('search-input'), sugg = $('suggestions-container');
let sel = -1;
const closeSugg = () => { sugg.classList.remove('open'); sel = -1; };
function pick(i){
  [...sugg.children].forEach((li, n) => li.setAttribute('aria-selected', n === i));
  sel = i;
}
input.addEventListener('input', () => {
  const v = input.value.trim().toLowerCase();
  const m = v ? CITIES.filter(c => c.toLowerCase().includes(v)).slice(0, 6) : [];
  sugg.innerHTML = m.map(c => `<li role="option">${esc(c)}</li>`).join('');
  sel = -1; sugg.classList.toggle('open', m.length > 0);
});
input.addEventListener('keydown', e => {
  const n = sugg.children.length;
  if (e.key === 'ArrowDown' && n){ e.preventDefault(); pick((sel + 1) % n); }
  else if (e.key === 'ArrowUp' && n){ e.preventDefault(); pick((sel - 1 + n) % n); }
  else if (e.key === 'Escape') closeSugg();
});
sugg.addEventListener('mousedown', e => {
  const li = e.target.closest('li'); if (!li) return;
  e.preventDefault(); input.value = li.textContent; closeSugg(); load(li.textContent);
});
$('search-form').addEventListener('submit', e => {
  e.preventDefault();
  const city = sel >= 0 ? sugg.children[sel].textContent : input.value.trim();
  if (!city) return;
  input.value = city; closeSugg(); load(city);
});
document.addEventListener('click', e => { if (!$('search-form').contains(e.target)) closeSugg(); });

/* ---------- Start ---------- */
setUnits(units);
renderRecent();
load(lastCity);