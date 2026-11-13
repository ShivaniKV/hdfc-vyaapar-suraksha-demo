// Claims back end for the Vyaapar Suraksha demo.
// /mcp  : the tools the Perfox agent calls (MCP over HTTP, JSON-RPC 2.0).
// /api/*: the demo page's People page, HDFC ERGO Desk and Reset.
// All data is made up. One Durable Object holds the claims, call-backs, OTP checks and proposals (Reset empties these)
// and the added people (kept until removed on the People page).

import { DurableObject } from 'cloudflare:workers';

// ---------- Made-up policy records (Reset always returns to these) ----------
const CUSTOMERS = [
  {
    name: 'Ramesh Jain', business: 'Jewellery shop', city: 'Jaipur',
    policy: 'VS-2026-10001', mobile: '9829000001',
    start: '2026-04-01', end: '2027-03-31', kind: 'All Risk', addons: [],
    sections: { I: 4000000, II: 2500000, XI: 200000 },
    jewelleryInsured: true, theftExtension: true,
    form: [
      ['About you', ['Ramesh Jain, 14 Johari Bazaar, Jaipur 302003', '9829000001 · ramesh.jain@example.com', 'Self-employed, jewellery retail', 'Tenure 1 year, start 1 Apr 2026']],
      ['Section I', ['All Risk', 'Building basis: Reinstatement value; contents basis: Reinstatement value', 'Furniture and fittings ₹5,00,000; Finished stock ₹35,00,000', 'Locations 1; floater No; declaration No']],
      ['Premises', ['RCC construction, ground floor; CCTV Yes; 24x7 guard No; fire station within 2 km', 'Fire protection: Fire extinguishers']],
      ['Section II Burglary and House Breaking', ['Sum insured ₹25,00,000, market value', 'Gold, silver, jewellery or precious stones specifically insured: Yes (₹25,00,000)', 'CCTV or burglar alarm: Yes; iron grills and locks: Yes; stock books: Yes', 'Premises ever left unoccupied: No', 'Add-ons: Theft extension']],
      ['Section XI Money', ['Cash in safe limit ₹1,50,000; cash in till ₹50,000', 'Safe fixed to the floor: Yes; keys removed after hours: Yes']],
      ['Section I add-ons', ['Storm and flood: No; earthquake: No']],
      ['Nominee', ['Sushila Jain (wife)']],
    ],
  },
  {
    name: 'Sunita Sharma', business: 'Kirana store', city: 'Patna',
    policy: 'VS-2026-10002', mobile: '9835000002',
    start: '2026-06-01', end: '2027-05-31', kind: 'Named Perils', addons: [],
    sections: { I: 800000, II: 200000 },
    jewelleryInsured: false, theftExtension: false,
    form: [
      ['About you', ['Sunita Sharma, Shop 3, Boring Road, Patna 800001', '9835000002 · sunita.kirana@example.com', 'Self-employed, grocery retail', 'Tenure 1 year, start 1 Jun 2026']],
      ['Section I', ['Named Perils, no storm and flood or earthquake add-on', 'Contents basis: Reinstatement value', 'Furniture and fittings ₹1,50,000; Finished stock ₹6,50,000', 'Locations 1']],
      ['Premises', ['Brick construction, ground floor; CCTV No; guard No', 'Storage: stock above floor level No; on racks Yes; plinth raised above ground No', 'Fire protection: Fire extinguishers']],
      ['Section II Burglary and House Breaking', ['Sum insured ₹2,00,000, market value', 'Gold, silver, jewellery or precious stones specifically insured: No', 'CCTV or burglar alarm: No; iron grills and locks: Yes', 'Premises ever left unoccupied: No', 'Add-ons: None']],
      ['Section I add-ons', ['Storm and flood: No; earthquake: No']],
      ['Nominee', ['Rakesh Sharma (husband)']],
    ],
  },
  {
    name: 'Imran Khan', business: 'Electronics shop', city: 'Pune',
    policy: 'VS-2025-10003', mobile: '9822000003',
    start: '2025-10-01', end: '2026-09-30', kind: 'Named Perils', addons: [],
    sections: { I: 1500000, II: 300000, IV: 200000 },
    jewelleryInsured: false, theftExtension: false,
    form: [
      ['About you', ['Imran Khan, 22 FC Road, Pune 411004', '9822000003 · imran.electronics@example.com', 'Self-employed, electronics retail', 'Tenure 1 year, start 1 Oct 2025 (not renewed)']],
      ['Section I', ['Named Perils, no add-ons', 'Contents basis: Reinstatement value', 'Furniture and fittings ₹3,00,000; Finished stock ₹12,00,000', 'Locations 2 (shop and godown)']],
      ['Premises', ['RCC construction, first floor; CCTV Yes; guard No', 'Fire protection: Fire extinguishers, smoke detectors']],
      ['Section II Burglary and House Breaking', ['Sum insured ₹3,00,000, market value', 'Gold, silver, jewellery or precious stones specifically insured: No', 'Premises ever left unoccupied: No', 'Add-ons: None']],
      ['Section IV Electronic Equipment', ['Replacement value ₹2,00,000']],
      ['Nominee', ['Ayesha Khan (wife)']],
    ],
  },
];
const DEMO_OTP = '123456';
const STATUSES = ['Registered', 'Surveyor assigned', 'Under review', 'Settled', 'Closed – not payable'];
const NEXT_STEP = {
  'Registered': 'HDFC ERGO will assign a surveyor, who will contact the customer to inspect the loss.',
  'Surveyor assigned': 'The surveyor will call to fix a visit. Keep the damaged items, photos and bills ready.',
  'Under review': 'HDFC ERGO is reviewing the surveyor\'s report and documents, and may ask for more information.',
  'Settled': 'The claim has been settled. HDFC ERGO will share the settlement details.',
  'Closed – not payable': 'HDFC ERGO has decided the loss is not payable under the policy and will write with the reason.',
};
const SECTION_NAMES = {
  I: 'Property Damage', II: 'Burglary and House Breaking', III: 'Breakdown of Electrical and Mechanical Appliance',
  IV: 'Electronic Equipment', V: 'Portable Electronic Equipment', VI: 'Boiler and Pressure Plant', VII: 'Business Interruption',
  VIII: 'Machinery Loss of Profit', IX: 'Plate Glass and Sanitary Fittings', X: 'Neon Sign / Glow Sign / Hoarding', XI: 'Money',
  XII: 'Baggage', XIII: 'Marine Transit', XIV: 'Cyber Risk', XV: 'Public Liability', XVI: 'Event Liability',
  XVII: 'Infidelity / Dishonesty of Employees', XVIII: "Workmen's Compensation", XIX: 'Agri Pump Set', XX: 'Agricultural Equipment', XXI: 'Pedal Cycle',
};

// ---------- Eligibility rules (code decides; the assistant only explains) ----------
const EVENTS = {
  fire: 'Fire', lightning: 'Lightning', explosion: 'Explosion or implosion',
  riot_strike_malicious: 'Riot, strike or malicious damage', impact: 'Impact damage (vehicle, falling object)',
  water_tank_burst: 'Water tank or pipe bursting', landslide: 'Landslide or rockslide',
  storm_flood: 'Storm, flood or heavy rain', earthquake: 'Earthquake',
  burglary_theft: 'Break-in or theft', cash_theft: 'Cash stolen',
  machinery_breakdown: 'Machine breakdown', electronic_damage: 'Damage to computers or electronics', other: 'Something else',
};
const ITEMS = ['building', 'furniture_fittings', 'stock', 'machinery', 'electronics', 'jewellery_gold', 'cash', 'other'];
const SECTION_FOR = {
  fire: 'I', lightning: 'I', explosion: 'I', riot_strike_malicious: 'I', impact: 'I', water_tank_burst: 'I',
  landslide: 'I', storm_flood: 'I', earthquake: 'I', burglary_theft: 'II', cash_theft: 'XI',
  machinery_breakdown: 'III', electronic_damage: 'IV',
};

function today() {
  return new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10); // India time
}
const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400e3);
const rupees = n => '₹' + Number(n).toLocaleString('en-IN');
function addDays(date, n) {
  return new Date(Date.parse(date) + n * 86400e3).toISOString().slice(0, 10);
}

function checkClaim(c, a) {
  const reasons = [], notes = [];
  const event = EVENTS[a.event] ? a.event : 'other';
  const items = (a.items || []).filter(i => ITEMS.includes(i));
  const date = /^\d{4}-\d{2}-\d{2}$/.test(a.incident_date || '') ? a.incident_date : addDays(today(), -(Number(a.days_ago) || 0));
  const fail = (reason, source) => reasons.push({ reason, source });

  // 1. Policy active on the incident date.
  if (date < c.start || date > c.end) {
    fail(`The policy was not active on ${date}. Its period is ${c.start} to ${c.end}.`, 'Policy schedule');
  }
  // 2. Event covered by their kind of Section I.
  if (event === 'storm_flood' && c.kind === 'Named Perils' && !c.addons.includes('storm_flood')) {
    fail('Under Named Perils, storm and flood are covered only if the storm and flood add-on was taken. This policy does not have it.', 'Policy Wordings, Section I, page 4');
  }
  if (event === 'earthquake' && c.kind === 'Named Perils' && !c.addons.includes('earthquake')) {
    fail('Under Named Perils, earthquake is covered only if the earthquake add-on was taken. This policy does not have it.', 'Policy Wordings, Section I, page 4');
  }
  // 3. Section taken.
  const section = SECTION_FOR[event];
  if (section && !(section in c.sections)) {
    fail(`This needs Section ${section} (${SECTION_NAMES[section] || ''}), which is not on this policy.`, 'Policy schedule');
  }
  if (event === 'burglary_theft' && items.includes('cash') && !('XI' in c.sections)) {
    fail('Stolen cash needs Section XI (Money), which is not on this policy.', 'Policy schedule');
  }
  // 4. Section exclusions.
  if (event === 'burglary_theft' && items.includes('jewellery_gold') && !c.jewelleryInsured) {
    fail('Under Section II, gold, silver, jewellery and precious stones are excluded unless specifically insured. They are not specifically insured on this policy.', 'Policy Wordings, Section II, page 26');
  }
  if (event === 'burglary_theft' && a.forced_entry === false && !c.theftExtension) {
    fail('Section II covers theft only after a forcible and violent entry or exit, or a hold-up. Theft without a break-in needs the Theft Extension, which this policy does not have.', 'Policy Wordings, Section II, page 25; Optional Wordings, Theft Extension Clause, page 13');
  }
  // 5. Premises occupied.
  if (Number(a.premises_unoccupied_days) > 30) {
    fail('Loss or damage is excluded if the premises were empty for more than 30 days without HDFC ERGO\'s written approval.', 'Policy Wordings, Section I, page 5');
  }
  // 6. Reported on time.
  const since = daysBetween(date, today());
  if (since > 30) {
    fail(`The loss was noticed ${since} days ago. The claim form must be submitted within 30 days of noticing the loss.`, 'Policy Wordings, page 104');
  }
  // 7. Sum insured (never fails the claim; may reduce the payout).
  const si = section && c.sections[section];
  if (si && Number(a.estimated_loss) > si) {
    notes.push(`The estimated loss (${rupees(a.estimated_loss)}) is more than the sum insured for Section ${section} (${rupees(si)}). The most the policy pays for this section is the sum insured.`);
  }
  if (si && Number(a.property_value) > si * 1.15) {
    notes.push('The property seems to be worth more than 15% above the sum insured, so the customer may bear a share of the loss (under-insurance, Policy Wordings pages 14–15).');
  }

  const result = event === 'other' && !reasons.length ? 'needs_review' : reasons.length ? 'likely_not_covered' : 'likely_covered';
  return { result, event, eventLabel: EVENTS[event], section: section || null, incident_date: date, items, reasons, notes };
}

function documentsFor(event) {
  const docs = [
    'Claim form, within 30 days of noticing the loss (from any HDFC ERGO branch or hdfcergo.com)',
    'Photos of the damage or the scene',
    'A list of the items damaged or lost, with their values',
    'Bills, invoices, stock register or purchase records',
    'Details of any other insurance on the same property',
  ];
  if (['fire', 'explosion', 'lightning'].includes(event)) docs.unshift('Fire brigade report', 'Police report');
  if (['burglary_theft', 'cash_theft', 'riot_strike_malicious', 'impact'].includes(event)) docs.unshift('Police FIR');
  if (event === 'landslide') docs.unshift('Report to the District Administration');
  if (event === 'cash_theft' || event === 'burglary_theft') docs.push('Cash book or bank records for any cash lost');
  return docs;
}

const DO_NOW = [
  'Make sure everyone is safe. Call the fire brigade (101) or police (112) if needed.',
  'Take reasonable steps to stop further damage.',
  'Until the surveyor has inspected: do not sell or throw away damaged items, do not clean up the debris, and do not repair unless it is urgent and HDFC ERGO cannot be reached.',
  'Take photos and keep bills, invoices and stock records.',
];

// ---------- Tools the agent can call ----------
const TOOLS = [
  {
    name: 'start_verification',
    description: 'Start verifying an existing policyholder. Call this when the customer says they already have a Vyaapar Suraksha policy and wants help with their own policy or claim, once they have given their name, policy number and registered mobile number. Checks the name against the policy and sends a one-time password (OTP) to their mobile.',
    input_schema: { type: 'object', properties: { name: { type: 'string', description: 'The name the customer gave' }, policy_number: { type: 'string', description: 'e.g. VS-2026-10001' }, mobile: { type: 'string', description: 'Registered mobile number' } }, required: ['policy_number', 'mobile'] },
  },
  {
    name: 'verify_otp',
    description: 'Check the 6-digit OTP the customer received. Call this when the customer gives the OTP after start_verification.',
    input_schema: { type: 'object', properties: { otp: { type: 'string' } }, required: ['otp'] },
  },
  {
    name: 'get_my_policy',
    description: 'Get the verified customer\'s own policy: period, Section I kind, add-ons, sections taken and sums insured. Call this for any question about their own cover. Works only after verify_otp succeeded.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'check_claim',
    description: 'Check whether a loss is likely covered by the verified customer\'s policy, and get the documents and steps. Call this after the customer has said what happened, roughly when, and what was damaged or lost. Translate their plain words into the event and items yourself.',
    input_schema: {
      type: 'object',
      properties: {
        event: { type: 'string', enum: Object.keys(EVENTS) },
        days_ago: { type: 'integer', description: 'How many days ago it happened: today 0, last night or yesterday 1. Use this or incident_date.' },
        incident_date: { type: 'string', description: 'YYYY-MM-DD, if the customer gave a date' },
        items: { type: 'array', items: { type: 'string', enum: ITEMS }, description: 'What was damaged or lost' },
        estimated_loss: { type: 'number', description: 'Rough loss in rupees, if given' },
        property_value: { type: 'number', description: 'Total value of that property, if given' },
        premises_unoccupied_days: { type: 'integer', description: 'Only if the premises were empty before the loss' },
        forced_entry: { type: 'boolean', description: 'For a theft: true if the thief broke in or it was a hold-up, false if things were taken without a break-in (e.g. from the counter during business hours). Ask the customer if it is not clear.' },
      },
      required: ['event', 'items'],
    },
  },
  {
    name: 'register_claim',
    description: 'Register the claim and get a claim reference. Call this only after check_claim, and only after the customer has confirmed the summary you read back. Register it even when the result is likely not covered: reporting a loss is the customer\'s right.',
    input_schema: {
      type: 'object',
      properties: {
        event: { type: 'string', enum: Object.keys(EVENTS) },
        days_ago: { type: 'integer' },
        incident_date: { type: 'string' },
        items: { type: 'array', items: { type: 'string', enum: ITEMS } },
        estimated_loss: { type: 'number' },
        property_value: { type: 'number' },
        premises_unoccupied_days: { type: 'integer' },
        forced_entry: { type: 'boolean' },
        description: { type: 'string', description: 'What happened, in one or two sentences, in English' },
      },
      required: ['event', 'items', 'description'],
    },
  },
  {
    name: 'get_claim_status',
    description: 'Get the status of the verified customer\'s claims. Call this when they ask about a claim they already registered.',
    input_schema: { type: 'object', properties: { claim_reference: { type: 'string', description: 'Optional, e.g. CLM-2026-0412' } } },
  },
  {
    name: 'request_callback',
    description: 'Ask an HDFC ERGO claims officer to call the customer back. Call this when the customer asks to speak to a person.',
    input_schema: { type: 'object', properties: { reason: { type: 'string', description: 'Why they want a call, in English' } }, required: ['reason'] },
  },
];

const clean = s => String(s || '').replace(/[^0-9a-z]/gi, '').toUpperCase();
// The three made-up customers plus the people added on the People page or issued from a proposal (kept across Reset).
const allCustomers = s => [...CUSTOMERS, ...(s.people?.list || [])];
// Where a policy stands today: not started yet, active, ending within 30 days, or expired.
function statusOf(c) {
  const t = today();
  return c.start > t ? 'upcoming' : c.end < t ? 'expired' : daysBetween(t, c.end) <= 30 ? 'expiring' : 'active';
}
const endFor = (start, years) => addDays(Number(start.slice(0, 4)) + years + start.slice(4), -1);
// On voice calls numbers can arrive as words ("nine eight two nine…", "double zero", "ek do teen") or Devanagari digits.
const WORD_DIGITS = {
  zero: 0, oh: 0, o: 0, one: 1, two: 2, to: 2, too: 2, three: 3, four: 4, for: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  shunya: 0, sunya: 0, ek: 1, do: 2, teen: 3, tin: 3, char: 4, chaar: 4, paanch: 5, panch: 5, chhe: 6, che: 6, chah: 6, saat: 7, sat: 7, aath: 8, ath: 8, nau: 9, no: 9,
  '\u0936\u0942\u0928\u094d\u092f': 0, '\u090f\u0915': 1, '\u0926\u094b': 2, '\u0924\u0940\u0928': 3, '\u091a\u093e\u0930': 4, '\u092a\u093e\u0902\u091a': 5, '\u092a\u093e\u0901\u091a': 5, '\u091b\u0939': 6, '\u091b\u0903': 6, '\u0938\u093e\u0924': 7, '\u0906\u0920': 8, '\u0928\u094c': 9,
};
function digitsOf(v) {
  const text = String(v ?? '').toLowerCase().replace(/[\u0966-\u096f]/g, d => d.charCodeAt(0) - 0x966);
  if (/^[\d\s().+-]*$/.test(text)) return text.replace(/\D/g, '');
  let out = '', repeat = 1;
  for (const w of text.split(/[^0-9a-z\u0900-\u097f]+/).filter(Boolean)) {
    if (w === 'double') { repeat = 2; continue; }
    if (w === 'triple') { repeat = 3; continue; }
    const d = /^\d+$/.test(w) ? w : WORD_DIGITS[w] !== undefined ? String(WORD_DIGITS[w]) : '';
    if (d) out += d.length === 1 ? d.repeat(repeat) : d;
    repeat = 1;
  }
  return out;
}
// The name given must share a word (3+ letters) with the policyholder's name. Names in Hindi script can't be compared, so they pass.
function nameMatches(given, actual) {
  const words = s => String(s || '').toLowerCase().split(/[^a-z]+/).filter(w => w.length >= 3);
  const g = words(given);
  return !g.length || g.some(w => words(actual).includes(w));
}
// Match the policy number exactly, or by its digits alone (speech often loses or garbles the "VS").
const findCustomer = (policy, s) => {
  const d = digitsOf(policy);
  const all = allCustomers(s);
  // Last resort: the last five digits (10001, 10002…) are unique in the demo, and the mobile must still match.
  return all.find(c => clean(c.policy) === clean(policy) || (d.length >= 9 && c.policy.replace(/\D/g, '') === d))
    || (d.length >= 5 ? all.find(c => c.policy.endsWith(d.slice(-5))) : undefined);
};

// A proposal sent from the Apply tab, kept to the fields a policy needs.
function readProposal(p) {
  const mobile = String(p.mobile || '').replace(/\D/g, '').slice(-10);
  if (!String(p.name || '').trim() || mobile.length !== 10) return null;
  const sections = {};
  for (const [k, v] of Object.entries(p.sections || {})) if (/^[IVX]+$/.test(k)) sections[k] = Number(v) > 0 ? Number(v) : null;
  sections.I = Number(p.sections?.I) > 0 ? Number(p.sections.I) : null;
  return {
    name: String(p.name).trim().slice(0, 80), business: String(p.business || 'Business').slice(0, 60), city: String(p.city || '').slice(0, 60),
    mobile, kind: p.kind === 'All Risk' ? 'All Risk' : 'Named Perils',
    addons: (p.addons || []).filter(a => ['storm_flood', 'earthquake'].includes(a)),
    sections, start: /^\d{4}-\d{2}-\d{2}$/.test(p.start || '') ? p.start : null, years: Math.min(5, Math.max(1, parseInt(p.tenure) || 1)),
    jewelleryInsured: !!p.jewelleryInsured, theftExtension: !!p.theftExtension, form: readForm(p.form),
  };
}

// The filled proposal form, as headed groups of lines: [[heading, [line, ...]], ...].
function readForm(f) {
  if (!Array.isArray(f)) return [];
  return f.slice(0, 12).filter(g => Array.isArray(g) && Array.isArray(g[1]))
    .map(([h, lines]) => [String(h).slice(0, 80), lines.slice(0, 20).map(l => String(l).slice(0, 400))]);
}

// A person added on the People page: a proposal's fields plus a required start date (a past one makes an expired policy).
function readPerson(p) {
  const r = readProposal(p);
  if (!r || !r.start) return null;
  return r;
}

// Storage: 'state' holds claims, call-backs, sessions and proposals (Reset clears it);
// 'people' holds added policyholders and the next policy number (Reset keeps it).
export class ClaimsStore extends DurableObject {
  async state() {
    const s = (await this.ctx.storage.get('state')) || { claims: [], callbacks: [], sessions: {}, next: 412 };
    s.proposals ||= [];
    s.people = (await this.ctx.storage.get('people')) || { list: [], next: 10004 };
    return s;
  }
  save(s) {
    const { people, ...rest } = s;
    return this.ctx.storage.put({ state: rest, people });
  }
  // Issue a policy number and keep the person in the people store.
  addPerson(s, p, source) {
    const policy = `VS-${p.start.slice(0, 4)}-${s.people.next++}`;
    const person = {
      name: p.name, business: p.business, city: p.city, policy, mobile: p.mobile,
      start: p.start, end: endFor(p.start, p.years), kind: p.kind, addons: p.addons, sections: p.sections,
      jewelleryInsured: !!p.jewelleryInsured, theftExtension: !!p.theftExtension, form: p.form || [],
      source, proposal: p.reference, added_at: new Date().toISOString(),
    };
    s.people.list.push(person);
    return person;
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/mcp') return this.mcp(request);
    if (url.pathname === '/api/state' && request.method === 'GET') {
      const s = await this.state();
      return json({
        customers: allCustomers(s).map(c => ({
          name: c.name, business: c.business, city: c.city, policy: c.policy, mobile: c.mobile, otp: DEMO_OTP,
          kind: c.kind, addons: c.addons, sections: c.sections, start: c.start, end: c.end,
          jewelleryInsured: !!c.jewelleryInsured, theftExtension: !!c.theftExtension, form: c.form || [],
          source: c.source || 'demo', status: statusOf(c),
        })),
        claims: s.claims, callbacks: s.callbacks, statuses: STATUSES, proposals: s.proposals, today: today(),
      });
    }
    // Reset clears claims, call-backs, sessions and proposals; added people stay until removed on the People page.
    if (url.pathname === '/api/reset' && request.method === 'POST') {
      await this.ctx.storage.delete('state');
      return json({ ok: true });
    }
    if (url.pathname === '/api/people' && request.method === 'POST') {
      const p = readPerson(await request.json().catch(() => ({})));
      if (!p) return json({ error: 'A name, a 10-digit mobile and a start date are needed' }, 400);
      const s = await this.state();
      const person = this.addPerson(s, p, 'added');
      await this.save(s);
      return json(person);
    }
    if (url.pathname === '/api/people/remove-added' && request.method === 'POST') {
      const s = await this.state();
      s.people.list = [];
      await this.save(s);
      return json({ ok: true });
    }
    const pp = url.pathname.match(/^\/api\/people\/([\w-]+)$/);
    if (pp && request.method === 'DELETE') {
      const s = await this.state();
      const before = s.people.list.length;
      s.people.list = s.people.list.filter(c => c.policy !== pp[1]);
      if (s.people.list.length === before) return json({ error: 'Only added people can be removed' }, 404);
      await this.save(s);
      return json({ ok: true });
    }
    if (url.pathname === '/api/proposals' && request.method === 'POST') {
      const p = readProposal(await request.json().catch(() => ({})));
      if (!p) return json({ error: 'A name and a 10-digit mobile are needed' }, 400);
      const s = await this.state();
      const reference = `PRP-2026-${String(101 + s.proposals.length).padStart(4, '0')}`;
      s.proposals.unshift({ reference, ...p, status: 'Proposal received', at: new Date().toISOString() });
      await this.save(s);
      return json(s.proposals[0]);
    }
    const pr = url.pathname.match(/^\/api\/proposals\/([\w-]+)(?:\/(approve|decline))?$/);
    if (pr) {
      const s = await this.state();
      const p = s.proposals.find(x => x.reference === pr[1]);
      if (!p) return json({ error: 'No such proposal' }, 404);
      if (request.method === 'GET') return json(p);
      if (request.method !== 'POST' || !pr[2] || p.status !== 'Proposal received') return json({ error: 'Only a new proposal can be approved or declined' }, 400);
      if (pr[2] === 'decline') p.status = 'Not accepted';
      else {
        // Approving plays HDFC ERGO accepting the proposal and receiving the premium: a policy is issued from it.
        const start = p.start && p.start > today() ? p.start : today();
        p.policy = this.addPerson(s, { ...p, start }, 'proposal').policy;
        p.status = 'Policy issued';
      }
      p.decided_at = new Date().toISOString();
      await this.save(s);
      return json(p);
    }
    const m = url.pathname.match(/^\/api\/claims\/([\w-]+)\/status$/);
    if (m && request.method === 'POST') {
      const { status } = await request.json().catch(() => ({}));
      if (!STATUSES.includes(status)) return json({ error: 'Unknown status' }, 400);
      const s = await this.state();
      const claim = s.claims.find(c => c.reference === m[1]);
      if (!claim) return json({ error: 'No such claim' }, 404);
      claim.status = status;
      claim.history.push({ status, at: new Date().toISOString() });
      await this.save(s);
      return json(claim);
    }
    return json({ error: 'Not found' }, 404);
  }

  async mcp(request) {
    if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
    const msg = await request.json().catch(() => null);
    if (!msg) return json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }, 400);
    const { id, method, params } = msg;
    const reply = result => json({ jsonrpc: '2.0', id, result }, 200, { 'Mcp-Session-Id': request.headers.get('Mcp-Session-Id') || crypto.randomUUID() });

    if (method === 'initialize') {
      return reply({ protocolVersion: params?.protocolVersion || '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'vyaapar-suraksha-claims-demo', version: '1.0.0' } });
    }
    if (id === undefined || method?.startsWith('notifications/')) return new Response(null, { status: 202 });
    if (method === 'ping') return reply({});
    if (method === 'tools/list') return reply({ tools: TOOLS.map(t => ({ ...t, inputSchema: t.input_schema })) });
    if (method === 'tools/call') {
      const conv = request.headers.get('X-Sa-Conversation-Id') || 'no-conversation';
      const out = await this.call(params?.name, params?.arguments || {}, conv);
      console.log('tool', conv.slice(-8), params?.name, JSON.stringify(params?.arguments || {}), '->', JSON.stringify(out).slice(0, 160));
      return reply({ content: [{ type: 'text', text: JSON.stringify(out) }] });
    }
    return json({ jsonrpc: '2.0', id, error: { code: -32601, message: 'Method not found' } });
  }

  async call(name, a, conv) {
    const s = await this.state();
    const session = s.sessions[conv] || (s.sessions[conv] = {});
    const me = session.verified && findCustomer(session.verified, s);
    const needVerified = { ok: false, error: 'not_verified', say: 'Ask for their name, policy number and registered mobile number, then call start_verification.' };

    if (name === 'start_verification') {
      const c = findCustomer(a.policy_number, s);
      // Weaker models call this again after a short "Yes"; a second OTP for the same policy confuses the customer.
      if (me && (!String(a.policy_number || '').trim() || c?.policy === me.policy)) return { ok: true, already_verified: true, say: `${me.name.split(' ')[0]} is already verified in this chat. Do not ask for an OTP. If they just said yes to registering the claim, call register_claim now; otherwise continue with what they asked.` };
      const digits = digitsOf(a.mobile);
      // The model sometimes sends the OTP here instead of to verify_otp, glued to the mobile or in an otp field.
      const otp = digits.length === 16 && digits.slice(0, 10) === c?.mobile ? digits.slice(10) : digitsOf(a.otp);
      if (c && session.pending === c.policy && otp) return this.call('verify_otp', { otp }, conv);
      const mobile = otp && digits.length === 16 ? digits.slice(0, 10) : digits.slice(-10);
      if (!c || c.mobile !== mobile) return { ok: false, say: 'No policy matches that policy number and mobile number. Ask the customer to check both, or contact HDFC ERGO on 022 6158 2020 / 022 6234 6234.' };
      if (!String(a.name || '').trim()) return { ok: false, say: 'Ask for the policyholder\'s name, then call start_verification again with the name, policy number and mobile.' };
      if (!nameMatches(a.name, c.name)) return { ok: false, say: 'The name does not match the name on this policy. Ask the customer to give the policyholder\'s name as on the policy. Do not reveal the name on the policy.' };
      session.pending = c.policy; session.tries = 0;
      await this.save(s);
      return { ok: true, say: `An OTP has been sent to the mobile number ending ${c.mobile.slice(-4)}. Ask the customer to tell you the OTP.`, next: 'When the customer sends the 6-digit OTP, call verify_otp with it. Do not call start_verification again.' };
    }
    if (name === 'verify_otp') {
      if (!session.pending && me) return { ok: true, first_name: me.name.split(' ')[0], say: 'Already verified. Continue with what the customer asked.' };
      if (!session.pending) return needVerified;
      if (digitsOf(a.otp) !== DEMO_OTP) {
        session.tries = (session.tries || 0) + 1;
        if (session.tries >= 3) delete session.pending;
        await this.save(s);
        return { ok: false, say: session.tries >= 3 ? 'Too many wrong OTPs. Ask the customer to start again with their name, policy number and mobile.' : 'That OTP is not correct. Ask the customer to check it and try again.' };
      }
      session.verified = session.pending; delete session.pending;
      await this.save(s);
      const c = findCustomer(session.verified, s);
      return { ok: true, first_name: c.name.split(' ')[0], business: c.business, say: 'Verified. Greet them by first name and continue with what they asked.' };
    }
    if (!me) return needVerified;

    if (name === 'get_my_policy') {
      return {
        ok: true, policy_number: me.policy, name: me.name, business: `${me.business}, ${me.city}`,
        period: `${me.start} to ${me.end}`, status: { upcoming: `Not started yet; cover starts on ${me.start}`, active: 'Active', expiring: `Active, ends soon on ${me.end}`, expired: `Expired on ${me.end}` }[statusOf(me)],
        section_I_kind: me.kind, add_ons: me.addons.length ? me.addons : 'None (no storm and flood, no earthquake add-on)',
        sections: Object.entries(me.sections).map(([k, v]) => `Section ${k} ${SECTION_NAMES[k] || ''}: sum insured ${v ? rupees(v) : 'not stated'}${k === 'II' ? `${me.jewelleryInsured ? ' (jewellery specifically insured' : ' (jewellery not specifically insured'}${me.theftExtension ? ', with Theft Extension)' : ', no Theft Extension)'}` : ''}`),
        proposal_form: (me.form || []).map(([h, lines]) => `${h}: ${lines.join('; ')}`),
      };
    }
    if (name === 'check_claim') {
      const r = checkClaim(me, a);
      // Kept so register_claim can fill in details the model leaves out (it often drops the loss value).
      session.lastCheck = a;
      await this.save(s);
      const label = r.result === 'likely_covered' ? 'likely covered' : r.result === 'likely_not_covered' ? 'likely not covered' : 'needs review by HDFC ERGO';
      const source = r.reasons.length ? r.reasons[0].source : r.section ? `Policy Wordings, Section ${r.section}` : 'Policy Wordings';
      // Kept short: every extra word is re-sent to the model on each later step of the turn.
      return {
        ok: true, result: r.result, incident_date: r.incident_date, notes: r.notes, what_to_do_now: DO_NOW, documents: documentsFor(r.event),
        say: `This check is complete; answer the customer now, in their language. Say the loss is ${label}${r.reasons.length ? ' because: ' + r.reasons.map(x => `${x.reason} (${x.source})`).join(' ') : '.'} Then: "HDFC ERGO's surveyor makes the final decision." Then the what to do now steps and documents, briefly (short bullets in chat; on a voice call, say the two or three most important), then ask if they want to register the claim; if they say yes, call register_claim at once, without re-verifying or asking them to confirm the details. In chat, end with "Source: ${source}" and "The policy wording is final."`,
      };
    }
    if (name === 'register_claim') {
      const given = Object.fromEntries(Object.entries(a).filter(([, v]) => v !== undefined && v !== null && v !== ''));
      a = { ...(session.lastCheck || {}), ...given };
      const r = checkClaim(me, a);
      // The same loss registered twice in one chat (a repeated confirm, or an old Confirm button) keeps its first reference.
      const key = JSON.stringify([me.policy, r.event, r.incident_date, [...r.items].sort()]);
      const dup = session.registered?.key === key && s.claims.find(c => c.reference === session.registered.reference);
      if (dup) return { ok: true, claim_reference: dup.reference, result: dup.result, already_registered: true, say: `This loss is already registered as ${dup.reference}. Give the customer that reference; do not register it again.` };
      const reference = `CLM-2026-${String(s.next++).padStart(4, '0')}`;
      session.registered = { key, reference };
      const now = new Date().toISOString();
      s.claims.unshift({
        reference, policy: me.policy, customer: me.name, business: me.business, ...r,
        estimated_loss: a.estimated_loss || null, description: String(a.description || '').slice(0, 500),
        status: 'Registered', registered_at: now, history: [{ status: 'Registered', at: now }],
      });
      await this.save(s);
      return { ok: true, claim_reference: reference, result: r.result, next: NEXT_STEP.Registered, say: `Give the customer the claim reference ${reference}. Tell them they can ask "What's my claim status?" here any time. No Source line in this reply.` };
    }
    if (name === 'get_claim_status') {
      const mine = s.claims.filter(c => c.policy === me.policy && (!a.claim_reference || clean(c.reference) === clean(a.claim_reference)));
      if (!mine.length) return { ok: true, claims: [], say: 'No claims are registered on this policy yet.' };
      return { ok: true, say: 'Give the status and next step in a sentence or two. No Source line in this reply.', claims: mine.map(c => ({ reference: c.reference, event: c.eventLabel, registered: c.registered_at.slice(0, 10), status: c.status, next: NEXT_STEP[c.status] })) };
    }
    if (name === 'request_callback') {
      const reference = `CB-${String(s.callbacks.length + 101)}`;
      s.callbacks.unshift({ reference, policy: me.policy, customer: me.name, mobile: me.mobile, reason: String(a.reason || '').slice(0, 300), at: new Date().toISOString() });
      await this.save(s);
      return { ok: true, callback_reference: reference, say: `An HDFC ERGO claims officer will call the registered mobile ending ${me.mobile.slice(-4)}. Give the reference ${reference}.` };
    }
    return { ok: false, error: `Unknown tool ${name}` };
  }
}

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (pathname === '/mcp' || pathname.startsWith('/api/')) {
      return env.CLAIMS.get(env.CLAIMS.idFromName('demo')).fetch(request);
    }
    return env.ASSETS.fetch(request);
  },
};
