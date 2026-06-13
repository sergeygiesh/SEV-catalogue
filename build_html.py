import json

G = json.load(open('groups.json', encoding='utf-8'))
payload = json.dumps(G, ensure_ascii=False).replace('</', '<\\/')

html = """<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Approved Models Search — Best JDM</title>
<style>
:root { color-scheme: light; }
* { box-sizing: border-box; }
body { margin:0; background:#ffffff; color:#1a2433; font:14px/1.45 'Segoe UI',Arial,sans-serif; }
header { position:sticky; top:0; z-index:5; background:#fff; border-bottom:1px solid #dde4ec; padding:14px 18px 12px; }
h1 { margin:0 0 2px; font-size:17px; color:#1f4e78; }
.sub { color:#6b7a8d; font-size:12px; margin-bottom:10px; }
.controls { display:grid; grid-template-columns:repeat(auto-fit,minmax(170px,1fr)); gap:10px; }
.ctl label { display:block; font-size:11px; font-weight:600; color:#6b7a8d; text-transform:uppercase; letter-spacing:.4px; margin:0 0 3px 2px; }
select, input[type=search] { width:100%; padding:9px 10px; border:1px solid #c5d0dc; border-radius:8px; font-size:13.5px; background:#fff; }
select:disabled { background:#f0f3f7; color:#9aa7b5; }
.stats { font-size:12px; color:#6b7a8d; margin-top:9px; }
.stats a { color:#1f4e78; cursor:pointer; text-decoration:underline; }
main { padding:16px 18px 30px; max-width:1100px; margin:0 auto; }
.card { background:#fff; border:1px solid #dde4ec; border-radius:10px; margin-bottom:14px; padding:14px 16px; }
.card h2 { margin:0; font-size:16px; }
.card h2 .mk { color:#1f4e78; }
.card h2 .bd { color:#6b7a8d; font-weight:500; font-size:13px; white-space:nowrap; }
table.sev { width:100%; border-collapse:collapse; margin:10px 0 4px; font-size:12.5px; }
table.sev th { text-align:left; color:#6b7a8d; font-weight:600; padding:4px 8px; border-bottom:1px solid #e4eaf1; white-space:nowrap; }
table.sev td { padding:4px 8px; border-bottom:1px solid #f0f3f7; vertical-align:top; }
.none { text-align:center; color:#8294a7; padding:50px 20px; }
.none .big { font-size:15px; margin-bottom:6px; color:#5d6f83; }
footer { max-width:1100px; margin:0 auto; padding:6px 18px 26px; color:#9aa7b5; font-size:11px; line-height:1.5; }
</style></head><body>
<header>
  <h1>Approved Models Search — Specialist &amp; Enthusiast Vehicles</h1>
  <div class="sub">In Force approvals, current (non-expired) entries only · grouped by Make + Model + Build date · data updated __BUILT__</div>
  <div class="controls">
    <div class="ctl"><label for="mk">Make</label><select id="mk"><option value="">All makes</option></select></div>
    <div class="ctl"><label for="md">Model</label><select id="md" disabled><option value="">All models</option></select></div>
    <div class="ctl"><label for="bd">Build date</label><select id="bd" disabled><option value="">All build dates</option></select></div>
    <div class="ctl"><label for="q">Search</label><input type="search" id="q" placeholder="Model code (e.g. GWS224), variant…"></div>
  </div>
  <div class="stats" id="stats"></div>
</header>
<main id="list"></main>
<footer>Reference information only, sourced from the Australian Government ROVER portal (Department of Infrastructure, Transport, Regional Development, Communications and the Arts) as at the update date shown above. Approval status can change at any time; eligibility for import and registration is subject to the relevant Registered Automotive Workshop / SEVs scheme and applicable requirements. This tool does not constitute advice or a guarantee. Please confirm current details before ordering a vehicle.</footer>
<script id="data" type="application/json">__DATA__</script>
<script>
const D = JSON.parse(document.getElementById('data').textContent);
const cards = D.cards;
cards.forEach(c => {
  c._hay = [c.mk, c.md, c.b,
    ...c.sevs.flatMap(s => [s.mc, s.v, s.vd])].join(' | ').toUpperCase();
});
const $ = id => document.getElementById(id);
const esc = s => (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const uniq = a => [...new Set(a)].sort((x, y) => x.localeCompare(y));
function fill(sel, values, placeholder) {
  const cur = sel.value;
  sel.innerHTML = '<option value="">' + placeholder + '</option>';
  for (const v of values) { const o = document.createElement('option'); o.value = o.textContent = v; sel.appendChild(o); }
  if (values.includes(cur)) sel.value = cur;
}
function scope(level) {
  return cards.filter(c =>
    (level > 0 && $('mk').value ? c.mk === $('mk').value : true) &&
    (level > 1 && $('md').value ? c.md === $('md').value : true) &&
    (level > 2 && $('bd').value ? c.b === $('bd').value : true));
}
function refreshFilters() {
  fill($('mk'), uniq(cards.map(c => c.mk)), 'All makes');
  const mk = $('mk').value;
  $('md').disabled = !mk;
  if (!mk) $('md').value = '';
  fill($('md'), uniq(scope(1).map(c => c.md)), 'All models');
  const md = $('md').value;
  $('bd').disabled = !md;
  if (!md) $('bd').value = '';
  fill($('bd'), uniq(scope(2).map(c => c.b)), 'All build dates');
}
function render() {
  refreshFilters();
  const q = $('q').value.trim().toUpperCase();
  const toks = q ? q.split(/\\s+/) : [];
  const anyFilter = $('mk').value || toks.length;
  if (!anyFilter) {
    $('list').innerHTML = '<div class="none"><div class="big">Select a make or enter a search query</div>' +
      cards.length + ' vehicle models</div>';
    $('stats').textContent = '';
    return;
  }
  let shown = 0, html = '';
  for (const c of scope(3)) {
    if (toks.length && !toks.every(t => c._hay.includes(t))) continue;
    shown++;
    const sevRows = c.sevs.map(s => '<tr><td>' + esc(s.mc) + '</td><td>' + esc(s.v) + (s.vd && s.vd !== s.v ? ' <span style="color:#8294a7">· ' + esc(s.vd) + '</span>' : '') + '</td><td style="white-space:nowrap">' + esc(s.ex) + '</td></tr>').join('');
    html += '<div class="card"><h2><span class="mk">' + esc(c.mk) + '</span> ' + esc(c.md) + ' <span class="bd">' + esc(c.b) + '</span></h2>' +
      '<table class="sev"><tr><th>Model code</th><th>Variant</th><th>Expiry</th></tr>' + sevRows + '</table></div>';
  }
  $('list').innerHTML = html || '<div class="none"><div class="big">No results</div>Try different filters or search terms</div>';
  $('stats').innerHTML = 'Models shown: ' + shown + ' of ' + cards.length + ' · <a id="reset">reset filters</a>';
  const rl = document.getElementById('reset');
  if (rl) rl.onclick = () => { ['mk','md','bd'].forEach(i => $(i).value = ''); $('q').value = ''; render(); };
}
$('mk').addEventListener('change', () => { $('md').value = ''; $('bd').value = ''; render(); });
$('md').addEventListener('change', () => { $('bd').value = ''; render(); });
$('bd').addEventListener('change', render);
$('q').addEventListener('input', render);
render();
</script></body></html>"""
html = html.replace('__BUILT__', G['built']).replace('__DATA__', payload)
open('index.html', 'w', encoding='utf-8').write(html)
print('index.html KB:', len(html.encode('utf-8')) // 1024)
