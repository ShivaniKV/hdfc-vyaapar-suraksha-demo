// Vyaapar Suraksha demo page: Policy Guide, Apply form, PDF viewer with highlight, and the hooks into the Perfox chat.
// All policy content and PDF references come from policy-data.json.

window.Perfox = window.Perfox || function () { (window.Perfox.q = window.Perfox.q || []).push(arguments); };
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

const $ = (sel, root = document) => root.querySelector(sel);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const chosen = new Set();          // optional sections ticked, e.g. "ii", "xi"
let DATA;

fetch('policy-data.json').then(r => r.json()).then(d => { DATA = d; renderGuide(); renderForm(); fromHash(); });

// ---------- Views ----------
function show(view) {
  document.querySelectorAll('.view').forEach(v => { v.hidden = v.id !== view; });
  document.querySelectorAll('.tab').forEach(t => t.setAttribute('aria-selected', String(t.dataset.view === view)));
}
document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => show(t.dataset.view)));

// ---------- Policy Guide ----------
function renderGuide() {
  $('#sections').innerHTML = DATA.sections.map(s => `
    <li id="section-${s.id}" class="section">
      <div class="section-head">
        <input type="checkbox" class="pick" id="pick-${s.id}" value="${s.id}" ${s.id === 'i' ? 'checked disabled' : ''}
          aria-label="Choose Section ${s.id.toUpperCase()} ${esc(s.name)}">
        <span class="num">${s.id.toUpperCase()}</span>
        <h3><label for="pick-${s.id}">${esc(s.name)}</label></h3>
        <span class="badge ${s.id === 'i' ? 'mandatory' : ''}">${s.id === 'i' ? 'Mandatory' : 'Optional'}</span>
      </div>
      <p class="plain">${esc(s.plain)}</p>
      <p class="applies"><span>Applies if:</span> ${esc(s.applies)}</p>
      <button type="button" class="ref" data-section="${s.id}">Read in the policy</button>
    </li>`).join('');
}

$('#sections').addEventListener('change', e => { if (e.target.classList.contains('pick')) setChosen(e.target.value, e.target.checked); });

function setChosen(id, on) {
  on ? chosen.add(id) : chosen.delete(id);
  document.querySelectorAll(`[value="${id}"].pick, [data-pick="${id}"]`).forEach(b => { b.checked = on; });
  renderSectionQuestions();
}

// Scroll to a section and highlight it (used by #section-x links, including the bot's "Read more" line).
function highlight(id) {
  const el = document.getElementById(`section-${String(id).toLowerCase()}`);
  if (!el) return;
  show('guide');
  document.querySelectorAll('.section.active').forEach(s => s.classList.remove('active'));
  el.classList.add('active');
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
}
function fromHash() { openLink(location.hash); }
function openLink(hash) {
  const m = hash.match(/^#section-([ivx]+)$/i);
  if (m) highlight(m[1]);
  // The assistant's Source line links to #doc-<document>-<page>: open that page in the viewer.
  const d = hash.match(/^#doc-(prospectus|wordings|optional|proposal)-(\d+)$/);
  if (d && DATA.docs[d[1]]) openRef(`${DATA.docs[d[1]].title}, page ${d[2]}`, 'The page the assistant used for its answer.', [d[1], Number(d[2]), '']);
  if (hash === '#apply') show('apply');
}
window.addEventListener('hashchange', fromHash);

// Links to this page inside the chat open here (Guide card or viewer) instead of a new tab.
document.addEventListener('click', e => {
  const a = e.composedPath().find(el => el.tagName === 'A');
  if (!a || a.origin !== location.origin || !/^#(section|doc)-/.test(a.hash)) return;
  e.preventDefault();
  openLink(a.hash);
}, true);

// ---------- Apply form (follows the Proposal Form, without PAN, KYC, ID or bank details) ----------
const OPT = {
  occupation: ['Self employed', 'Professional', 'Salaried', 'Retired', 'Other'],
  industry: ['Jewellery', 'Import-export', 'Mining', 'Shipping', 'Scrap dealing', 'Real estate', 'Agriculture', 'Stock broking', 'BFSI', 'Manufacturing', 'Retail shop', 'Other'],
  income: ['Up to ₹2.5 lakh', '₹2.5–5 lakh', '₹5–20 lakh', '₹20–30 lakh', '₹30 lakh and above'],
  tenure: ['1 year', '2 years', '3 years', '4 years', '5 years'],
  construction: ['Kutcha', 'Pucca', 'Class-I', 'Complete RCC'],
  distance: ['0–5 km', '5–10 km', '10–15 km', 'Above 15 km'],
  fire: ['Portable extinguishers', 'Smoke detectors', 'Hose reels', 'Hydrant system', 'Sprinkler system', 'Fire alarm', 'Gas flooding system'],
};

const why = topic => `<button type="button" class="why" data-topic="${topic}">What's this?</button>`;
const field = (name, label, input, req) => `<label class="field"><span>${label}${req ? ' <em>*</em>' : ''}</span>${input}</label>`;
const text = (name, label, req, type = 'text') => field(name, label, `<input name="${name}" type="${type}" ${req ? 'required' : ''} inputmode="${type === 'number' ? 'numeric' : 'text'}">`, req);
const select = (name, label, opts, req) => field(name, label, `<select name="${name}" ${req ? 'required' : ''}><option value="">Select…</option>${opts.map(o => `<option>${esc(o)}</option>`).join('')}</select>`, req);
const yesno = (name, label) => select(name, label, ['Yes', 'No']);
const radios = (name, opts) => `<div class="choices">${opts.map(([v, l, t]) => `<label class="choice"><input type="radio" name="${name}" value="${esc(v)}"> ${esc(l)} ${t ? why(t) : ''}</label>`).join('')}</div>`;
const checks = (name, opts) => `<div class="choices">${opts.map(([v, l, t]) => `<label class="choice"><input type="checkbox" name="${name}" value="${esc(v)}"> ${esc(l)} ${t ? why(t) : ''}</label>`).join('')}</div>`;

function renderForm() {
  $('#proposal').innerHTML = `
    <fieldset><legend>1. About you and the policy</legend><div class="grid">
      ${text('name', 'Full name', true)}${text('mobile', 'Mobile', true, 'tel')}
      ${text('address', 'Business address', true)}${text('pin', 'PIN code', true)}
      ${text('email', 'Email', true, 'email')}${select('occupation', 'Occupation', OPT.occupation, true)}
      ${select('industry', 'Industry type', OPT.industry, true)}${select('income', 'Annual income', OPT.income)}
      ${select('tenure', 'Policy tenure', OPT.tenure, true)}${text('start', 'Preferred start date', true, 'date')}
      ${text('favour', 'Policy also in favour of (bank or lender, if any)')}
    </div></fieldset>

    <fieldset><legend>2. Section I – Property Damage (compulsory)</legend>
      <p class="q">Which kind? <em>*</em></p>
      ${radios('kind', [['Named Perils', 'Named Perils – only the listed dangers', 'named-perils'], ['All Risk', 'All Risk – any accident unless excluded', 'all-risk']])}
      <div id="named-extras" hidden>
        <p class="q">Add to Named Perils</p>
        ${checks('perils_extra', [['Storm and flood (STFI)', 'Storm and flood (STFI)', 'stfi'], ['Earthquake', 'Earthquake', 'earthquake']])}
      </div>
      <p class="q">How should the building be valued?</p>
      ${radios('basis_building', [['Reinstatement value', 'Reinstatement value', 'reinstatement'], ['Saleable value', 'Saleable value', 'saleable'], ['Loss limit', 'Loss limit', 'loss-limit']])}
      <p class="q">How should machinery and contents be valued?</p>
      ${radios('basis_contents', [['Reinstatement value', 'Reinstatement value', 'reinstatement'], ['Loss limit', 'Loss limit', 'loss-limit']])}
      <p class="q">Values at your main location (₹) ${why('stock-basis')}</p>
      <div class="grid">
        ${text('v_building', 'Building, plinth and structures', false, 'number')}${text('v_machinery', 'Plant and machinery', false, 'number')}
        ${text('v_furniture', 'Furniture, fixtures and fittings', false, 'number')}${text('v_raw', 'Raw material', false, 'number')}
        ${text('v_process', 'Stock in process', false, 'number')}${text('v_finished', 'Finished stock', false, 'number')}
        ${text('v_other', 'Other contents', false, 'number')}${text('locations', 'Number of locations', true, 'number')}
      </div>
      <p class="hint">Storage questions appear here when you enter raw material, stock in process or finished stock.</p>
      <div id="storage" hidden>
        <p class="q">Storage at this location</p>
        <div class="grid">
          ${yesno('above_floor', 'Stock stored above floor level?')}${yesno('racks', 'Stock stored on racks or pallets?')}
          ${yesno('plinth', 'Plinth raised above ground level?')}${yesno('stock_books', 'Stock and sales books maintained?')}
          ${yesno('public_road', 'Premises beside a public road?')}${select('road_width', 'Width of the approach road', ['0–5 feet', '5–10 feet', 'Above 10 feet'])}
          ${yesno('open_stock', 'Any stock stored in the open?')}${text('open_pct', 'If yes, approx. percentage in the open', false, 'number')}
        </div>
      </div>
      <div class="grid">
        ${field('floater', `Floater cover for stock across locations? ${why('floater')}`, '<select name="floater"><option value="">Select…</option><option>Yes</option><option>No</option></select>')}
        ${field('declaration', `Declaration policy for changing stock? ${why('declaration')}`, '<select name="declaration"><option value="">Select…</option><option>Yes</option><option>No</option></select>')}
        ${text('loss_pct', 'If loss limit, percentage opted', false, 'number')}${text('floater_max', 'If floater, maximum value at any one location (₹)', false, 'number')}
        ${select('decl_mode', 'If declaration, how you will declare', ['Average value at risk each day', 'Highest value at risk in the month'])}${text('decl_amount', 'If declaration, provisional amount (₹)', false, 'number')}
      </div>
    </fieldset>

    <fieldset><legend>3. Your main premises</legend><div class="grid">
      ${select('construction', 'Type of construction', OPT.construction)}${yesno('basement', 'Basement present?')}
      ${yesno('complex', 'In an industrial area or commercial complex?')}${text('floor', 'Floor the business is on')}
      ${select('fire_station', 'Distance from nearest fire station', OPT.distance)}${select('electrical', 'Electrical wiring', ['Concealed', 'Exposed'])}
      ${yesno('cctv', 'CCTV installed?')}${yesno('guard', '24x7 security personnel?')}
      ${text('hours', 'Business hours')}${yesno('amc', 'Maintenance contract for fire equipment?')}
      ${select('water_body', 'Distance from nearest water body', OPT.distance)}
    </div>
    <p class="q">Fire protection installed</p>${checks('fire', OPT.fire.map(f => [f, f]))}
    </fieldset>

    <fieldset><legend>4. Add-ons to Section I (optional)</legend>
      <div id="addons" class="choices"></div>
    </fieldset>

    <fieldset><legend>5. Optional sections</legend>
      <p class="hint">Tick what applies to your business. Each one shows its own questions.</p>
      <div class="choices">${DATA.sections.filter(s => s.id !== 'i').map(s => `
        <label class="choice"><input type="checkbox" data-pick="${s.id}" value="${s.id}"> ${s.id.toUpperCase()} ${esc(s.name)}
          <button type="button" class="why" data-section="${s.id}">What's this?</button></label>`).join('')}</div>
      <div id="section-questions"></div>
    </fieldset>

    <fieldset><legend>6. Nominee and previous insurance</legend><div class="grid">
      ${text('nominee', 'Nominee name')}${text('nominee_relation', 'Relation to you')}
      ${text('nominee_dob', 'Nominee date of birth', false, 'date')}${yesno('prev', 'Any existing or previous insurance?')}
      ${text('prev_insurer', 'If yes, insurer name')}${text('prev_policy', 'Policy number')}
      ${text('prev_from', 'Policy from', false, 'date')}${text('prev_to', 'Policy to', false, 'date')}
      ${text('prev_si', 'Sum insured (₹)', false, 'number')}${text('prev_claims', 'Claims in the preceding years')}
    </div><p class="hint">${why('nominee')}</p></fieldset>

    <fieldset><legend>7. Declaration</legend>
      <label class="choice"><input type="checkbox" name="declare" required> I confirm the information I have given is true. ${why('declaration-proposer')}</label>
    </fieldset>

    <div class="actions">
      <button type="submit" class="primary">Review my proposal</button>
      <span id="form-msg" class="form-msg" role="status"></span>
    </div>`;
  renderAddons();
  renderStorage();
}

// HDFC ERGO asks the storage questions only for storage locations, so they show once any stock value is entered.
// Hidden questions are disabled so they are left out of the summary and the PDF.
function renderStorage() {
  const has = ['v_raw', 'v_process', 'v_finished'].some(k => Number($(`[name="${k}"]`).value) > 0);
  $('#storage').hidden = !has;
  $('#storage').querySelectorAll('input, select').forEach(el => { el.disabled = !has; });
}

function renderAddons() {
  const named = $('[name="kind"]:checked')?.value === 'Named Perils';
  const ticked = new Set([...document.querySelectorAll('[name="addon"]:checked')].map(b => b.value));
  $('#named-extras').hidden = !named;
  $('#addons').innerHTML = DATA.addons
    .filter(a => named || !/Named Perils only/.test(a.name))
    .map(a => {
      const off = a.id === 'business-income' && chosen.has('vii');
      return `<label class="choice"><input type="checkbox" name="addon" value="${esc(a.name)}" ${off ? 'disabled' : ticked.has(a.name) ? 'checked' : ''}>
      ${esc(a.name)} <button type="button" class="why" data-addon="${a.id}">What's this?</button></label>`;
    }).join('');
}

function renderSectionQuestions() {
  const box = $('#section-questions');
  if (!box) return;
  const kept = new FormData($('#proposal'));
  box.innerHTML = DATA.sections.filter(s => chosen.has(s.id)).map(s => `
    <div class="sq"><h4>${s.id.toUpperCase()} ${esc(s.name)}</h4><div class="grid">
      ${s.questions.map(([label, type], i) => {
        const name = `s_${s.id}_${i}`;
        return type.multi ? '' : type === 'yesno' ? yesno(name, esc(label)) : Array.isArray(type) ? select(name, esc(label), type) : text(name, esc(label), false, type);
      }).join('')}
    </div>
    ${s.questions.map(([label, type], i) => type.multi ? `<p class="q">${esc(label)}</p>${checks(`s_${s.id}_${i}`, type.multi.map(o => [o, o]))}` : '').join('')}
    </div>`).join('');
  box.querySelectorAll('input, select').forEach(el => {
    if (el.type === 'checkbox') el.checked = kept.getAll(el.name).includes(el.value);
    else if (kept.has(el.name)) el.value = kept.get(el.name);
  });
  renderAddons();
}

$('#proposal').addEventListener('input', e => { if (/^v_(raw|process|finished)$/.test(e.target.name)) renderStorage(); });
$('#proposal').addEventListener('change', e => {
  if (e.target.name === 'kind') renderAddons();
  if (e.target.dataset.pick) setChosen(e.target.dataset.pick, e.target.checked);
});

// ---------- Review and send to the assistant ----------
const rupees = v => v ? '₹' + Number(v).toLocaleString('en-IN') : '';
let summaryText = '', lastForm, lastGroups;

$('#proposal').addEventListener('submit', e => {
  e.preventDefault();
  const f = new FormData(e.target);
  const missing = [...e.target.querySelectorAll('[required]')].filter(el => el.type === 'checkbox' ? !el.checked : !el.value).map(el => el.closest('label')?.querySelector('span')?.textContent.replace('*', '').trim() || 'Declaration');
  if (!f.get('kind')) missing.push('Section I kind');
  if (missing.length) { $('#form-msg').textContent = 'Please fill: ' + missing.join(', '); return; }
  $('#form-msg').textContent = '';

  const g = k => f.get(k) || '';
  const all = k => f.getAll(k).join(', ');
  const values = [['Building', 'v_building'], ['Plant and machinery', 'v_machinery'], ['Furniture and fittings', 'v_furniture'], ['Raw material', 'v_raw'], ['Stock in process', 'v_process'], ['Finished stock', 'v_finished'], ['Other contents', 'v_other']]
    .filter(([, k]) => g(k)).map(([l, k]) => `${l} ${rupees(g(k))}`);
  const groups = [
    ['About you', [`${g('name')}, ${g('address')} ${g('pin')}`, `${g('mobile')} · ${g('email')}`, `${g('occupation')}, ${g('industry')}`, `Tenure ${g('tenure')}, start ${g('start')}`]],
    ['Section I', [g('kind') + (all('perils_extra') ? ` + ${all('perils_extra')}` : ''), `Building basis: ${g('basis_building') || '—'}; contents basis: ${g('basis_contents') || '—'}`, values.join('; ') || 'No values given', `Locations ${g('locations')}; floater ${g('floater') || '—'}; declaration ${g('declaration') || '—'}`]],
    ['Premises', [`${g('construction') || '—'} construction; CCTV ${g('cctv') || '—'}; guard ${g('guard') || '—'}; fire station ${g('fire_station') || '—'}`, `Fire protection: ${all('fire') || 'none listed'}`, ...($('#storage').hidden ? [] : [`Storage: above floor ${g('above_floor') || '—'}; racks ${g('racks') || '—'}; in the open ${g('open_stock') || '—'}${g('open_pct') ? ` (${g('open_pct')}%)` : ''}; approach road ${g('road_width') || '—'}`])]],
    ['Add-ons', [all('addon') || 'None']],
    ['Optional sections', chosen.size ? DATA.sections.filter(s => chosen.has(s.id)).map(s => `${s.id.toUpperCase()} ${s.name}: ` + s.questions.map(([l, t], i) => { const v = f.getAll(`s_${s.id}_${i}`).filter(Boolean).join(', '); return v ? `${l.replace(' (₹)', '')} ${t === 'number' && l.includes('₹') ? rupees(v) : v}` : ''; }).filter(Boolean).join('; ') || 'no details given') : ['None']],
    ['Nominee', [g('nominee') ? `${g('nominee')} (${g('nominee_relation')})` : 'Not given']],
    ['Previous insurance', [g('prev') === 'Yes' ? [g('prev_insurer'), g('prev_policy'), g('prev_si') && rupees(g('prev_si')), g('prev_claims') && `claims: ${g('prev_claims')}`].filter(Boolean).join(', ') : 'None']],
  ];
  summaryText = 'My proposal details: ' + groups.map(([h, lines]) => `${h}: ${lines.join(' | ')}`).join(' || ');
  lastForm = f; lastGroups = groups;
  $('#review').innerHTML = `<h2>Check your proposal</h2>${groups.map(([h, lines]) => `<h3>${h}</h3><ul>${lines.map(l => `<li>${esc(l)}</li>`).join('')}</ul>`).join('')}
    <p class="hint">PAN, KYC, ID proof and bank details are submitted directly to HDFC ERGO with the proposal form.</p>
    <div class="actions"><button type="button" id="send-proposal" class="primary">Send to the assistant</button><button type="button" id="download-pdf">Download filled proposal form</button><button type="button" id="edit-proposal">Edit</button></div>
    <p class="hint">The download is HDFC ERGO's own proposal form with your answers written in, plus an annexure page. Check it, complete PAN, KYC and bank details, and sign.</p>`;
  $('#review').hidden = false; $('#proposal').hidden = true;
  $('#review').scrollIntoView({ behavior: 'smooth' });
});

$('#review').addEventListener('click', e => {
  if (e.target.id === 'edit-proposal') { $('#review').hidden = true; $('#proposal').hidden = false; }
  if (e.target.id === 'send-proposal') sendToChat(summaryText);
  if (e.target.id === 'download-pdf') {
    e.target.disabled = true; e.target.textContent = 'Preparing the PDF…';
    fillProposalPdf(lastForm, DATA.sections.filter(s => chosen.has(s.id)), lastGroups)
      .catch(() => { $('#form-msg').textContent = 'The PDF could not be prepared. Please try again.'; })
      .finally(() => { e.target.disabled = false; e.target.textContent = 'Download filled proposal form'; });
  }
});

// The widget has no "send message" API, so type into its message box and press its Send button.
// The chat may be closed (the Apply tab closes it), so wait up to 5 seconds for its message box to appear.
async function sendToChat(message) {
  Perfox('open');
  let box, send;
  for (let i = 0; i < 25 && !(box && send); i++) {
    const root = [...document.querySelectorAll('*')].find(e => e.shadowRoot && e.shadowRoot.querySelector('.sa-widget-input'))?.shadowRoot;
    box = root?.querySelector('textarea.sa-widget-input');
    send = root?.querySelector('button[aria-label="Send"]');
    if (!(box && send)) await new Promise(r => setTimeout(r, 200));
  }
  if (!box || !send) { document.querySelectorAll('#form-msg, #customer-msg').forEach(m => { m.textContent = 'Open the chat, then try again.'; }); return; }
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(box, message);
  box.dispatchEvent(new Event('input', { bubbles: true }));
  setTimeout(() => send.click(), 100);
}

// ---------- PDF viewer: opens HDFC ERGO's document at the page and highlights the sentence ----------
const pdfs = {};
const norm = s => s.replace(/ﬁ/g, 'fi').replace(/ﬂ/g, 'fl').replace(/ﬀ/g, 'ff').replace(/[’‘]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-').replace(/\s+/g, '').toLowerCase();

function openRef(title, plain, [docKey, page, phrase]) {
  $('#viewer-title').textContent = title;
  $('#viewer-plain').textContent = plain;
  $('#viewer').hidden = false;
  Perfox('close');
  showPage(docKey, page, phrase);
}

// Previous / Next let the reader step a page when a cited page is one off.
let shown = {};
$('#page-prev').addEventListener('click', () => showPage(shown.docKey, shown.page - 1, ''));
$('#page-next').addEventListener('click', () => showPage(shown.docKey, shown.page + 1, ''));

async function showPage(docKey, page, phrase) {
  const doc = DATA.docs[docKey];
  const current = shown = { docKey, page };
  $('#viewer-where').textContent = `${doc.title}, page ${page}`;
  $('#viewer-official').href = `${doc.official}#page=${page}`;
  $('#viewer-page').innerHTML = '<p class="loading">Opening the document…</p>';

  pdfs[docKey] = pdfs[docKey] || pdfjsLib.getDocument(doc.file).promise;
  const pdf = await pdfs[docKey];
  $('#page-of').textContent = `Page ${page} of ${pdf.numPages}`;
  $('#page-prev').disabled = page <= 1;
  $('#page-next').disabled = page >= pdf.numPages;
  const pg = await pdf.getPage(page);
  if (shown !== current) return;   // the reader has already moved to another page
  const box = $('#viewer-page');
  const scale = Math.min(2, (box.clientWidth - 28) / pg.getViewport({ scale: 1 }).width);
  const vp = pg.getViewport({ scale });
  const canvas = document.createElement('canvas');
  const ratio = window.devicePixelRatio || 1;
  canvas.width = vp.width * ratio; canvas.height = vp.height * ratio;
  canvas.style.width = vp.width + 'px'; canvas.style.height = vp.height + 'px';
  const wrap = document.createElement('div');
  wrap.className = 'page-wrap'; wrap.style.width = vp.width + 'px'; wrap.style.height = vp.height + 'px';
  wrap.appendChild(canvas);
  box.innerHTML = ''; box.appendChild(wrap);
  pg.render({ canvasContext: canvas.getContext('2d'), viewport: vp, transform: ratio !== 1 ? [ratio, 0, 0, ratio, 0, 0] : null });

  box.scrollTop = 0;
  if (!phrase) return;

  // Find the phrase in the page text (ignoring spaces), then mark every text item it touches.
  const { items } = await pg.getTextContent();
  let joined = ''; const owner = [];
  items.forEach((it, i) => { const n = norm(it.str); joined += n; for (let k = 0; k < n.length; k++) owner.push(i); });
  const at = joined.indexOf(norm(phrase));
  if (at < 0) return;
  const hit = new Set(owner.slice(at, at + norm(phrase).length));
  let first;
  hit.forEach(i => {
    const it = items[i];
    const [x1, y1, x2, y2] = vp.convertToViewportRectangle([it.transform[4], it.transform[5], it.transform[4] + it.width, it.transform[5] + (it.height || Math.abs(it.transform[3]))]);
    const mark = document.createElement('div');
    mark.className = 'mark';
    Object.assign(mark.style, { left: Math.min(x1, x2) + 'px', top: Math.min(y1, y2) + 'px', width: Math.abs(x2 - x1) + 'px', height: Math.abs(y2 - y1) + 'px' });
    wrap.appendChild(mark);
    if (!first || mark.offsetTop < first.offsetTop) first = mark;
  });
  first?.scrollIntoView({ block: 'center' });
}

$('#viewer-close').addEventListener('click', () => { $('#viewer').hidden = true; });

document.addEventListener('click', e => {
  const b = e.target.closest('.ref, .why');
  if (!b) return;
  if (b.dataset.topic) { const t = DATA.topics[b.dataset.topic]; openRef(t.title, t.plain, t.ref); }
  if (b.dataset.section) { const s = DATA.sections.find(x => x.id === b.dataset.section); openRef(`Section ${s.id.toUpperCase()} – ${s.name}`, `${s.plain} Applies if: ${s.applies}`, s.ref); }
  if (b.dataset.addon) { const a = DATA.addons.find(x => x.id === b.dataset.addon); openRef(a.name, a.plain, a.ref); }
});

// ---------- Chat hooks ----------
Perfox('on', 'ready', () => Perfox('open'));

Perfox('on', 'message:received', ({ text }) => {
  const ids = [...(text || '').matchAll(/#section-([ivx]+)|Source:[^\n]*?Section\s+([IVX]+)\b/gi)];
  if (ids.length) { const m = ids[ids.length - 1]; highlight(m[1] || m[2]); }
  // When the assistant hands over to the form, bring the Apply tab forward and move the chat aside.
  if (/Apply tab/i.test(text || '')) { show('apply'); Perfox('close'); window.scrollTo({ top: 0, behavior: 'smooth' }); }
});

// The assistant writes its Source line as plain text ("Source: Policy Wordings, Section II, page 26").
// Turn it into a link that opens that page in the viewer. The widget re-renders messages, so re-check on every change.
const SOURCE = /(Source:\s*)((Prospectus|Policy Wordings|Optional Wordings|Proposal Form)\b[^\n]*?\bpages?\s*(\d+)(?:\s*[-–]\s*\d+)?)/;
function linkSources(root) {
  root.querySelectorAll('.sa-msg-assistant .sa-md').forEach(md => {
    if (md.querySelector('a.source-link')) return;
    const walker = document.createTreeWalker(md, NodeFilter.SHOW_TEXT);
    for (let node; (node = walker.nextNode());) {
      const m = node.data.match(SOURCE);
      const key = m && Object.keys(DATA?.docs || {}).find(k => DATA.docs[k].title === m[3]);
      if (!key) continue;
      const a = document.createElement('a');
      a.className = 'source-link';
      a.href = `${location.origin}${location.pathname}#doc-${key}-${m[4]}`;
      a.textContent = m[2];
      const rest = node.splitText(m.index + m[1].length);
      rest.data = rest.data.slice(m[2].length);
      rest.parentNode.insertBefore(a, rest);
      return;
    }
  });
}
const watched = new WeakSet();
setInterval(() => {
  document.querySelectorAll('*').forEach(el => {
    if (!el.shadowRoot || watched.has(el.shadowRoot)) return;
    watched.add(el.shadowRoot);
    new MutationObserver(() => linkSources(el.shadowRoot)).observe(el.shadowRoot, { childList: true, subtree: true, characterData: true });
    linkSources(el.shadowRoot);
  });
}, 1000);

// Carry the customer's Section I choice from the chat into the form.
Perfox('on', 'message:sent', ({ text }) => {
  const kind = /all\s*risk/i.test(text || '') ? 'All Risk' : /named\s*peril/i.test(text || '') ? 'Named Perils' : null;
  const r = kind && document.querySelector(`[name="kind"][value="${kind}"]`);
  if (r) { r.checked = true; renderAddons(); }
});

// ---------- Try as a customer, and HDFC ERGO Claims Desk (data from src/worker.js) ----------
const RESULT = { likely_covered: 'Likely covered', likely_not_covered: 'Likely not covered', needs_review: 'Needs review' };
const when = iso => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
let deskTimer;

async function loadClaims() {
  const r = await fetch('/api/state');
  if (!r.ok) throw new Error('Claims service unavailable');
  return r.json();
}

async function renderCustomers() {
  const { customers } = await loadClaims();
  $('#customer-cards').innerHTML = customers.map((c, i) => `
    <div class="card customer">
      <h3>${esc(c.name)}</h3>
      <p class="muted">${esc(c.business)}, ${esc(c.city)} · ${esc(c.kind)} · <span class="${c.active ? 'ok' : 'bad'}">${c.active ? 'Active' : 'Expired ' + esc(c.end)}</span></p>
      <dl>
        <dt>Policy number</dt><dd>${esc(c.policy)}</dd>
        <dt>Mobile</dt><dd>${esc(c.mobile)}</dd>
        <dt>OTP</dt><dd>${esc(c.otp)}</dd>
      </dl>
      <p class="story">“${esc(c.story)}”</p>
      <button type="button" class="primary" data-story="${i}">Send this to the assistant</button>
    </div>`).join('') + `
    <div class="card customer">
      <h3>Priya Nair</h3>
      <p class="muted">New bakery, Kochi · no policy yet</p>
      <p class="story">“I'm opening a bakery. What insurance do I need?”</p>
      <button type="button" class="primary" data-story="new">Send this to the assistant</button>
    </div>
    <p id="customer-msg" class="form-msg"></p>`;
  $('#customer-cards').onclick = e => {
    const b = e.target.closest('[data-story]');
    if (!b) return;
    sendToChat(b.dataset.story === 'new' ? "I'm opening a bakery. What insurance do I need?" : customers[b.dataset.story].story);
  };
}

async function renderDesk() {
  const { claims, callbacks, statuses } = await loadClaims();
  $('#desk-claims').innerHTML = claims.length ? claims.map(c => `
    <div class="card claim">
      <div class="claim-head">
        <strong>${esc(c.reference)}</strong>
        <span class="pill ${c.result}">${RESULT[c.result] || esc(c.result)}</span>
        <span class="muted">${when(c.registered_at)}</span>
      </div>
      <p><strong>${esc(c.customer)}</strong> · ${esc(c.business)} · ${esc(c.policy)}</p>
      <p>${esc(c.eventLabel)} on ${esc(c.incident_date)}${c.items.length ? ' · ' + esc(c.items.join(', ').replace(/_/g, ' ')) : ''}${c.estimated_loss ? ' · about ₹' + Number(c.estimated_loss).toLocaleString('en-IN') : ''}</p>
      ${c.description ? `<p class="muted">“${esc(c.description)}”</p>` : ''}
      ${c.reasons.length ? `<ul>${c.reasons.map(r => `<li>${esc(r.reason)} <span class="muted">(${esc(r.source)})</span></li>`).join('')}</ul>` : ''}
      ${c.notes.length ? `<ul>${c.notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}
      <label class="status">Status
        <select data-ref="${esc(c.reference)}">${statuses.map(s => `<option ${s === c.status ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select>
      </label>
    </div>`).join('') : '<p class="muted">No claims yet. Register one in the chat as Ramesh, Sunita or Imran.</p>';
  $('#desk-callbacks').innerHTML = callbacks.length ? `<ul class="callbacks">${callbacks.map(b => `
    <li><strong>${esc(b.reference)}</strong> · ${esc(b.customer)} (${esc(b.policy)}) · mobile ${esc(b.mobile)} · ${when(b.at)}<br>${esc(b.reason)}</li>`).join('')}</ul>`
    : '<p class="muted">No call-back requests.</p>';
}

$('#desk-claims').addEventListener('change', async e => {
  const sel = e.target.closest('select[data-ref]');
  if (!sel) return;
  await fetch(`/api/claims/${sel.dataset.ref}/status`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: sel.value }) });
  renderDesk();
});

// Load a tab's data when it opens; the desk refreshes every few seconds while it is open, so new claims appear by themselves.
document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => {
  clearInterval(deskTimer);
  const fail = el => () => { $(el).innerHTML = '<p class="muted">The claims service is not available on this server.</p>'; };
  if (t.dataset.view === 'customers') renderCustomers().catch(fail('#customer-cards'));
  if (t.dataset.view === 'desk') {
    renderDesk().catch(fail('#desk-claims'));
    deskTimer = setInterval(() => { if (!document.activeElement?.matches('select[data-ref]')) renderDesk().catch(() => {}); }, 4000);
  }
}));

// Reset: forget the conversation in this browser, put the made-up policy records back, clear all claims, and start again from a clean page.
document.getElementById('reset').addEventListener('click', async () => {
  await fetch('/api/reset', { method: 'POST' }).catch(() => {});
  Perfox('shutdown');
  Object.keys(localStorage)
    .filter(k => k.startsWith('perfox_widget_conv_'))
    .forEach(k => localStorage.removeItem(k));
  location.replace(location.pathname);
});
