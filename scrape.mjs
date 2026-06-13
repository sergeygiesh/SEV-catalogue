// ROVER scraper (headless Playwright) -> payload.json
// Reproduces blocks A..E of the original in-page scraper, but returns the full
// payload directly (no chunking / FNV hashing — those existed only to work around
// the Cowork browser-tool text limits).
//
// Output: payload.json = { notes:[...], mre:{...}, sev:{...} }  (consumed by build_groups.py)

import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';

const BASE = 'https://www.rover.infrastructure.gov.au';
const START = BASE + '/PublishedApprovals/MREApprovals/';
const MIN_MRE = 50;   // sanity floor — abort (don't publish) if we get fewer
const MIN_SEV = 50;

const log = (...a) => console.log('[scrape]', ...a);

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  viewport: { width: 1366, height: 900 },
});
const page = await ctx.newPage();

try {
  log('navigate', START);
  await page.goto(START, { waitUntil: 'networkidle', timeout: 90000 });
  await page.waitForTimeout(3000);

  // ===== BLOCK A: apply filters (SEV type + In Force) and capture the grid XHR =====
  const captured = await page.evaluate(async () => {
    const t = document.getElementById('dropdown_3'); // Model report type
    const s = document.getElementById('dropdown_4'); // Approval status
    if (!t || !s) return 'FAILED: filter dropdowns not found';
    t.value = '1'; t.dispatchEvent(new Event('change', { bubbles: true })); // Specialist and Enthusiast Vehicles
    s.value = '0'; s.dispatchEvent(new Event('change', { bubbles: true })); // In Force
    const fb = Array.from(document.querySelectorAll('button')).find(b => b.innerText.trim() === 'Filter');
    if (fb) fb.click();
    await new Promise(r => setTimeout(r, 3000));
    window.__GRIDREQ = null;
    const oOpen = XMLHttpRequest.prototype.open, oSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (m, u) { this.__u = u; return oOpen.apply(this, arguments); };
    XMLHttpRequest.prototype.send = function (b) {
      if (this.__u && /entity-grid-data/i.test(this.__u)) window.__GRIDREQ = { url: this.__u, body: b };
      return oSend.apply(this, arguments);
    };
    const p2 = document.querySelector('.pagination a[data-page="2"]');
    if (p2) p2.click();
    for (let i = 0; i < 30; i++) { await new Promise(r => setTimeout(r, 400)); if (window.__GRIDREQ) break; }
    return window.__GRIDREQ ? 'captured' : 'FAILED to capture grid request';
  });
  log('block A:', captured);
  if (captured !== 'captured') throw new Error('Block A failed: ' + captured);

  // ===== BLOCK B: pull full filtered list via grid API =====
  const listInfo = await page.evaluate(async () => {
    const req = window.__GRIDREQ;
    const token = document.querySelector('input[name="__RequestVerificationToken"]')?.value || '';
    const getAttr = (rec, suffix) => {
      const a = rec.Attributes.find(x => x.Name === suffix || x.Name.endsWith('.' + suffix));
      if (!a) return null;
      const v = a.Value;
      return (v && typeof v === 'object' && v.Value !== undefined) ? String(v.Value) : (v === null ? null : String(v));
    };
    window.__LIST = [];
    let pagingCookie = null;
    for (let p = 1; p <= 30; p++) {
      const body = JSON.parse(req.body);
      body.page = p; body.pageSize = 250; body.pagingCookie = pagingCookie;
      const r = await fetch(req.url, {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest', '__RequestVerificationToken': token },
        body: JSON.stringify(body),
      });
      if (!r.ok) return { error: 'HTTP ' + r.status + ' page ' + p };
      const j = await r.json();
      (j.Records || []).forEach(rec => window.__LIST.push({ id: rec.Id, num: getAttr(rec, 'rvr_approvalnumber') }));
      pagingCookie = j.NextPagePagingCookie;
      if (!j.MoreRecords) break;
    }
    return { total: window.__LIST.length, unique: new Set(window.__LIST.map(x => x.num)).size };
  });
  log('block B:', JSON.stringify(listInfo));
  if (listInfo.error) throw new Error('Block B failed: ' + listInfo.error);

  // ===== BLOCK C: fetch all MRE detail pages, concurrency 8 =====
  await page.evaluate(async () => {
    window.__MRE = {}; window.__ERRS = [];
    window.__parseMRE = function (html) {
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const get = (label) => {
        const td = Array.from(doc.querySelectorAll('td.question-text-inline')).find(t => t.textContent.trim().replace(/\s+/g, ' ') === label);
        return td && td.nextElementSibling ? td.nextElementSibling.textContent.trim().replace(/\s+/g, ' ') : null;
      };
      const section = (name) => {
        const h3s = Array.from(doc.querySelectorAll('h3'));
        const i = h3s.findIndex(h => h.textContent.trim().replace(/\s+/g, ' ') === name);
        if (i === -1) return null;
        const range = doc.createRange();
        range.setStartAfter(h3s[i]);
        if (h3s[i + 1]) range.setEndBefore(h3s[i + 1]); else range.setEndAfter(doc.body.lastChild);
        return range.toString().trim().replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n');
      };
      const sevs = [...new Map(Array.from(doc.querySelectorAll('a[href*="SEVDetails"]')).map(a => {
        const id = (a.getAttribute('href').match(/id=([0-9a-fA-F-]+)/) || [])[1];
        return [a.textContent.trim() + '|' + id, { n: a.textContent.trim(), id }];
      })).values()];
      return {
        make: get('Make'), model: get('Model'), holder: get('Approval holder name'),
        status: get('Approval Status'), build: get('Build date'),
        mrNotes: section('Model Report notes'), clNotes: section('Compliance level notes'), sevs,
      };
    };
    window.__runMRE = async function (items, conc) {
      let idx = 0;
      const worker = async () => {
        while (idx < items.length) {
          const item = items[idx++];
          if (window.__MRE[item.num]) continue;
          try {
            const r = await fetch('/PublishedApprovals/ModelReportDetails/?id=' + item.id, { credentials: 'same-origin' });
            if (!r.ok) { window.__ERRS.push({ num: item.num, e: 'HTTP ' + r.status }); continue; }
            window.__MRE[item.num] = window.__parseMRE(await r.text());
          } catch (e) { window.__ERRS.push({ num: item.num, e: String(e).slice(0, 80) }); }
        }
      };
      await Promise.all(Array.from({ length: conc }, worker));
      return { done: Object.keys(window.__MRE).length, errs: window.__ERRS.length };
    };
    window.__MREDONE = null;
    window.__runMRE(window.__LIST, 8).then(r => { window.__MREDONE = r; });
  });
  // poll C
  for (;;) {
    const st = await page.evaluate(() => ({ done: Object.keys(window.__MRE).length, errs: window.__ERRS.length, fin: !!window.__MREDONE }));
    log('block C:', JSON.stringify(st));
    if (st.fin) break;
    await page.waitForTimeout(5000);
  }
  // retry pass for any errors (the worker skips already-fetched, so this top-up fills gaps)
  await page.evaluate(async () => {
    if (window.__ERRS.length) {
      const retry = window.__LIST.filter(x => !window.__MRE[x.num]);
      window.__ERRS = [];
      await window.__runMRE(retry, 6);
    }
  });

  // ===== BLOCK D: fetch all unique SEV pages, concurrency 8 =====
  await page.evaluate(async () => {
    window.__SEV = {}; window.__SEVERRS = [];
    window.__parseSEV = function (html) {
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const get = (label) => {
        const td = Array.from(doc.querySelectorAll('td.question-text-inline')).find(t => t.textContent.trim().replace(/\s+/g, ' ') === label);
        return td && td.nextElementSibling ? td.nextElementSibling.textContent.trim().replace(/\s+/g, ' ') : null;
      };
      return {
        sevNum: get('SEV #'), modelCode: get('Model code'), variant: get('Variant'),
        variantDetails: get('Variant details'), expiry: get('Expiry'),
        make: get('Make'), model: get('Model'), buildRange: get('Build date range'), criterion: get('Criterion'),
      };
    };
    const items = [...new Map(Object.values(window.__MRE).flatMap(v => (v.sevs || [])).map(s => [s.id, s])).values()];
    window.__SEVTOTAL = items.length;
    let idx = 0;
    const worker = async () => {
      while (idx < items.length) {
        const it = items[idx++];
        if (window.__SEV[it.id]) continue;
        try {
          const r = await fetch('/PublishedApprovals/SEVDetails/?id=' + it.id, { credentials: 'same-origin' });
          if (!r.ok) { window.__SEVERRS.push({ id: it.id, e: 'HTTP ' + r.status }); continue; }
          window.__SEV[it.id] = window.__parseSEV(await r.text());
        } catch (e) { window.__SEVERRS.push({ id: it.id, e: String(e).slice(0, 80) }); }
      }
    };
    window.__SEVDONE = null;
    Promise.all(Array.from({ length: 8 }, worker)).then(() => { window.__SEVDONE = true; });
  });
  // poll D
  for (;;) {
    const st = await page.evaluate(() => ({ done: Object.keys(window.__SEV).length, total: window.__SEVTOTAL, errs: window.__SEVERRS.length, fin: !!window.__SEVDONE }));
    log('block D:', JSON.stringify(st));
    if (st.fin) break;
    await page.waitForTimeout(5000);
  }

  // ===== BLOCK E: build normalized payload (no chunking) =====
  const payloadStr = await page.evaluate(() => {
    const norm = (s) => s == null ? s : s
      .replace(/[  -   　]/g, ' ')
      .replace(/[​-‍⁠﻿]/g, '')
      .replace(/ {2,}/g, ' ');
    const notes = []; const noteIdx = new Map();
    const ref = (s) => { s = norm(s); if (!s) return -1; if (!noteIdx.has(s)) { noteIdx.set(s, notes.length); notes.push(s); } return noteIdx.get(s); };
    const sevByNum = {};
    Object.values(window.__SEV).forEach(v => {
      sevByNum[v.sevNum] = { mc: norm(v.modelCode), v: norm(v.variant), vd: norm(v.variantDetails), ex: norm(v.expiry), mk: norm(v.make), md: norm(v.model), br: norm(v.buildRange), cr: norm(v.criterion) };
    });
    const id2num = {}; Object.entries(window.__SEV).forEach(([id, v]) => id2num[id] = v.sevNum);
    const mre = {};
    Object.entries(window.__MRE).forEach(([num, v]) => {
      mre[num] = { mk: norm(v.make), md: norm(v.model), h: norm(v.holder), b: norm(v.build), mn: ref(v.mrNotes), cn: ref(v.clNotes), sv: (v.sevs || []).map(s => id2num[s.id] || s.n) };
    });
    return JSON.stringify({ notes, mre, sev: sevByNum });
  });

  const payload = JSON.parse(payloadStr);
  const nMre = Object.keys(payload.mre).length;
  const nSev = Object.keys(payload.sev).length;
  log('payload: mre =', nMre, '| sev =', nSev, '| notes =', payload.notes.length);
  if (nMre < MIN_MRE || nSev < MIN_SEV) {
    throw new Error(`Sanity check failed: too few records (mre=${nMre}, sev=${nSev}). Not publishing.`);
  }

  writeFileSync('payload.json', payloadStr, 'utf-8');
  log('wrote payload.json');
} finally {
  await browser.close();
}
