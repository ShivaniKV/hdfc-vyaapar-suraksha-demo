// Claims back end for the Vyaapar Suraksha demo.
// /mcp  : the tools the Perfox agent calls (MCP over HTTP, JSON-RPC 2.0).
// /api/*: the demo page's Claims Desk and Reset.
// All data is made up. One Durable Object holds the claims, call-backs and OTP checks; Reset empties it.

import { DurableObject } from 'cloudflare:workers';

// ---------- Made-up policy records (Reset always returns to these) ----------
const CUSTOMERS = [
  {
    name: 'Ramesh Jain', business: 'Jewellery shop', city: 'Jaipur',
    policy: 'VS-2026-10001', mobile: '9829000001',
    start: '2026-04-01', end: '2027-03-31', kind: 'All Risk', addons: [],
    sections: { I: 4000000, II: 2500000, XI: 200000 },
    jewelleryInsured: true,
    story: 'Someone broke into my shop last night and took jewellery',
  },
  {
    name: 'Sunita Sharma', business: 'Kirana store', city: 'Patna',
    policy: 'VS-2026-10002', mobile: '9835000002',
    start: '2026-06-01', end: '2027-05-31', kind: 'Named Perils', addons: [],
    sections: { I: 800000, II: 200000 },
    jewelleryInsured: false,
    story: 'Heavy rain water entered my shop and all my stock is spoiled',
  },
  {
    name: 'Imran Khan', business: 'Electronics shop', city: 'Pune',
    policy: 'VS-2025-10003', mobile: '9822000003',
    start: '2025-10-01', end: '2026-09-30', kind: 'Named Perils', addons: [],
    sections: { I: 1500000, II: 300000, IV: 200000 },
    jewelleryInsured: false,
    story: 'There was a fire in my godown, what do I do?',
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
  IV: 'Electronic Equipment', XI: 'Money',
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
    fail(`The policy was not active on ${date}. It ran from ${c.start} to ${c.end}.`, 'Policy schedule');
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
  if (section && !c.sections[section]) {
    fail(`This needs Section ${section} (${SECTION_NAMES[section] || ''}), which is not on this policy.`, 'Policy schedule');
  }
  if (event === 'burglary_theft' && items.includes('cash') && !c.sections.XI) {
    fail('Stolen cash needs Section XI (Money), which is not on this policy.', 'Policy schedule');
  }
  // 4. Section exclusions.
  if (event === 'burglary_theft' && items.includes('jewellery_gold') && !c.jewelleryInsured) {
    fail('Under Section II, gold, silver, jewellery and precious stones are excluded unless specifically insured. They are not specifically insured on this policy.', 'Policy Wordings, Section II, page 26');
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
    description: 'Start verifying an existing policyholder. Call this when the customer says they already have a Vyaapar Suraksha policy and wants help with their own policy or claim, once they have given their policy number and registered mobile number. Sends a one-time password (OTP) to their mobile.',
    input_schema: { type: 'object', properties: { policy_number: { type: 'string', description: 'e.g. VS-2026-10001' }, mobile: { type: 'string', description: 'Registered mobile number' } }, required: ['policy_number', 'mobile'] },
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
const findCustomer = policy => CUSTOMERS.find(c => clean(c.policy) === clean(policy));

export class ClaimsStore extends DurableObject {
  async state() {
    return (await this.ctx.storage.get('state')) || { claims: [], callbacks: [], sessions: {}, next: 412 };
  }
  save(s) { return this.ctx.storage.put('state', s); }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/mcp') return this.mcp(request);
    if (url.pathname === '/api/state' && request.method === 'GET') {
      const s = await this.state();
      return json({
        customers: CUSTOMERS.map(c => ({ name: c.name, business: c.business, city: c.city, policy: c.policy, mobile: c.mobile, otp: DEMO_OTP, kind: c.kind, end: c.end, story: c.story, active: today() <= c.end })),
        claims: s.claims, callbacks: s.callbacks, statuses: STATUSES,
      });
    }
    if (url.pathname === '/api/reset' && request.method === 'POST') {
      await this.ctx.storage.deleteAll();
      return json({ ok: true });
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
      console.log('tool', params?.name, JSON.stringify(params?.arguments || {}), '->', JSON.stringify(out).slice(0, 160));
      return reply({ content: [{ type: 'text', text: JSON.stringify(out) }] });
    }
    return json({ jsonrpc: '2.0', id, error: { code: -32601, message: 'Method not found' } });
  }

  async call(name, a, conv) {
    const s = await this.state();
    const session = s.sessions[conv] || (s.sessions[conv] = {});
    const me = session.verified && findCustomer(session.verified);
    const needVerified = { ok: false, error: 'not_verified', say: 'Ask for the policy number and registered mobile number, then call start_verification.' };

    if (name === 'start_verification') {
      const c = findCustomer(a.policy_number);
      const digits = String(a.mobile || '').replace(/\D/g, '');
      // The model sometimes sends the OTP here instead of to verify_otp, glued to the mobile or in an otp field.
      const otp = digits.length === 16 && digits.slice(0, 10) === c?.mobile ? digits.slice(10) : String(a.otp || '').replace(/\D/g, '');
      if (c && session.pending === c.policy && otp) return this.call('verify_otp', { otp }, conv);
      const mobile = otp && digits.length === 16 ? digits.slice(0, 10) : digits.slice(-10);
      if (!c || c.mobile !== mobile) return { ok: false, say: 'No policy matches that policy number and mobile number. Ask the customer to check both, or contact HDFC ERGO on 022 6158 2020 / 022 6234 6234.' };
      session.pending = c.policy; session.tries = 0;
      await this.save(s);
      return { ok: true, say: `An OTP has been sent to the mobile number ending ${c.mobile.slice(-4)}. Ask the customer to type it here.`, next: 'When the customer sends the 6-digit OTP, call verify_otp with it. Do not call start_verification again.' };
    }
    if (name === 'verify_otp') {
      if (!session.pending && me) return { ok: true, first_name: me.name.split(' ')[0], say: 'Already verified. Continue with what the customer asked.' };
      if (!session.pending) return needVerified;
      if (String(a.otp || '').replace(/\D/g, '') !== DEMO_OTP) {
        session.tries = (session.tries || 0) + 1;
        if (session.tries >= 3) delete session.pending;
        await this.save(s);
        return { ok: false, say: session.tries >= 3 ? 'Too many wrong OTPs. Ask the customer to start again with their policy number and mobile.' : 'That OTP is not correct. Ask the customer to check it and try again.' };
      }
      session.verified = session.pending; delete session.pending;
      await this.save(s);
      const c = findCustomer(session.verified);
      return { ok: true, first_name: c.name.split(' ')[0], business: c.business, say: 'Verified. Greet them by first name and continue with what they asked.' };
    }
    if (!me) return needVerified;

    if (name === 'get_my_policy') {
      return {
        ok: true, policy_number: me.policy, name: me.name, business: `${me.business}, ${me.city}`,
        period: `${me.start} to ${me.end}`, status: today() <= me.end ? 'Active' : `Expired on ${me.end}`,
        section_I_kind: me.kind, add_ons: me.addons.length ? me.addons : 'None (no storm and flood, no earthquake add-on)',
        sections: Object.entries(me.sections).map(([k, v]) => `Section ${k} ${SECTION_NAMES[k]}: sum insured ${rupees(v)}${k === 'II' ? (me.jewelleryInsured ? ' (jewellery specifically insured)' : ' (jewellery not specifically insured)') : ''}`),
      };
    }
    if (name === 'check_claim') {
      const r = checkClaim(me, a);
      const label = r.result === 'likely_covered' ? 'likely covered' : r.result === 'likely_not_covered' ? 'likely not covered' : 'needs review by HDFC ERGO';
      // Kept short: every extra word is re-sent to the model on each later step of the turn.
      return {
        ok: true, result: r.result, incident_date: r.incident_date, notes: r.notes, what_to_do_now: DO_NOW, documents: documentsFor(r.event),
        say: `This check is complete; answer the customer now, in their language. Say the loss is ${label}${r.reasons.length ? ' because: ' + r.reasons.map(x => `${x.reason} (${x.source})`).join(' ') : '.'} Then: "HDFC ERGO's surveyor makes the final decision." Then the what to do now steps and documents as short bullets, then ask if they want to register the claim.`,
      };
    }
    if (name === 'register_claim') {
      const r = checkClaim(me, a);
      const reference = `CLM-2026-${String(s.next++).padStart(4, '0')}`;
      const now = new Date().toISOString();
      s.claims.unshift({
        reference, policy: me.policy, customer: me.name, business: me.business, ...r,
        estimated_loss: a.estimated_loss || null, description: String(a.description || '').slice(0, 500),
        status: 'Registered', registered_at: now, history: [{ status: 'Registered', at: now }],
      });
      await this.save(s);
      return { ok: true, claim_reference: reference, result: r.result, next: NEXT_STEP.Registered, say: `Give the customer the claim reference ${reference}. Tell them they can ask "What's my claim status?" here any time.` };
    }
    if (name === 'get_claim_status') {
      const mine = s.claims.filter(c => c.policy === me.policy && (!a.claim_reference || clean(c.reference) === clean(a.claim_reference)));
      if (!mine.length) return { ok: true, claims: [], say: 'No claims are registered on this policy yet.' };
      return { ok: true, claims: mine.map(c => ({ reference: c.reference, event: c.eventLabel, registered: c.registered_at.slice(0, 10), status: c.status, next: NEXT_STEP[c.status] })) };
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
