// Writes the customer's answers onto HDFC ERGO's blank Proposal Form (docs/proposal-form.pdf) and adds an annexure page.
// Positions are PDF points from the bottom-left of each page, measured from the form's own text.
// Each optional section's questions carry their own position on the form (policy-data.json), so every chosen section lands on its own page.
// PAN, KYC, ID, income proof, bank details and the signature are left blank for the proposer.

async function fillProposalPdf(form, sections, groups) {
  const { PDFDocument, StandardFonts, rgb } = PDFLib;
  const pdf = await PDFDocument.load(await (await fetch('docs/proposal-form.pdf')).arrayBuffer());
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const dings = await pdf.embedFont(StandardFonts.ZapfDingbats);
  const ink = rgb(0, 0.2, 0.65);
  const pages = pdf.getPages();
  const g = k => (form.get(k) || '').toString().trim();
  const all = k => form.getAll(k);
  const money = v => v ? Number(v).toLocaleString('en-IN') : '';
  // Helvetica can't draw ₹ or curly quotes, so keep text to plain characters.
  const plain = s => String(s).replace(/₹/g, 'Rs. ').replace(/[–—]/g, '-').replace(/[’‘]/g, "'").replace(/[^\x20-\x7E]/g, '');

  // Bold ink so the answers stand out from the printed form; long answers shrink to stay on the page.
  const text = (p, x, y, s, size = 9, maxWidth = 570 - x) => {
    if (!s) return;
    const t = plain(s);
    const w = bold.widthOfTextAtSize(t, size);
    pages[p].drawText(t, { x, y, size: w > maxWidth ? Math.max(5.5, size * maxWidth / w) : size, font: bold, color: ink });
  };
  const centred = (p, cx, y, s, width, size = 9) => {
    const t = plain(s);
    const fit = Math.min(size, size * width / bold.widthOfTextAtSize(t, size));
    pages[p].drawText(t, { x: cx - bold.widthOfTextAtSize(t, fit) / 2, y, size: fit, font: bold, color: ink });
  };
  const tick = (p, x, y) => pages[p].drawText('✔', { x: x + 1, y: y + 1, size: 9.5, font: dings, color: ink });
  const ring = (p, x0, x1, y) => pages[p].drawRectangle({ x: x0 - 2, y: y - 3, width: x1 - x0 + 4, height: 12, borderColor: ink, borderWidth: 1.2 });
  const strike = (p, x0, x1, y) => pages[p].drawLine({ start: { x: x0 - 1, y: y + 5 }, end: { x: x1 + 1, y: y + 5 }, thickness: 1.4, color: ink });
  const blank = (p, x, y, w, h) => pages[p].drawRectangle({ x, y, width: w, height: h, color: rgb(1, 1, 1) });
  const wrap = (s, max, size = 9, f = font) => {
    const out = []; let line = '';
    plain(s).split(' ').forEach(w => {
      const next = line ? line + ' ' + w : w;
      if (f.widthOfTextAtSize(next, size) > max && line) { out.push(line); line = w; } else line = next;
    });
    if (line) out.push(line);
    return out;
  };
  const date = s => s ? s.split('-').reverse().join('/') : '';
  const yn = (p, yesX, noX, y, v) => { if (v === 'Yes') tick(p, yesX, y); if (v === 'No') tick(p, noX, y); };

  // ---- Page 1: personal details and Section I cover ----
  pages[0].drawText('Pre-filled online from the Vyaapar Suraksha assistant. Please check, complete the blank items and sign.', { x: 24, y: 735, size: 7.5, font: bold, color: ink });
  text(0, 290, 610, g('name').toUpperCase());
  wrap(`${g('address')} ${g('pin')}`.toUpperCase(), 270, 9, bold).slice(0, 2).forEach((l, i) => text(0, 290, 593 - i * 13, l));
  tick(0, 284, 564);                                   // present address is the permanent address
  text(0, 290, 490, g('mobile'));
  text(0, 290, 460, g('email'));
  const occupation = { 'Salaried': [284, 326, 427], 'Professional': [329, 391, 427], 'Self employed': [394, 466, 427], 'Retired': [284, 321, 414], 'Other': [324, 352, 414] }[g('occupation')];
  if (occupation) ring(0, ...occupation);
  const industry = { 'Jewellery': [284, 333, 397], 'Import-export': [336, 404, 397], 'Mining': [407, 440, 397], 'Shipping': [448, 490, 397], 'Scrap dealing': [498, 524, 397], 'Real estate': [322, 373, 384], 'Agriculture': [382, 434, 384], 'Stock broking': [442, 508, 384], 'BFSI': [517, 540, 384], 'Manufacturing': [284, 353, 370] }[g('industry')];
  if (industry) ring(0, ...industry);
  else if (g('industry')) { ring(0, 361, 400, 370); text(0, 445, 373, g('industry'), 8); }
  if (g('industry') === 'Scrap dealing') ring(0, 284, 319, 384);   // "scrap dealing" wraps onto the next line
  const income = { 'Up to ₹2.5 lakh': [284, 336], '₹2.5–5 lakh': [338, 396], '₹5–20 lakh': [398, 454], '₹20–30 lakh': [456, 512], '₹30 lakh and above': [514, 560] }[g('income')];
  if (income) ring(0, income[0], income[1], 354);
  text(0, 290, 274, g('favour'));
  const years = parseInt(g('tenure')) || 0;
  const tenureBox = { 1: 315, 2: 380, 3: 438, 4: 497, 5: 556 }[years];
  if (tenureBox) tick(0, tenureBox, 231);
  if (g('start')) {
    const end = new Date(g('start')); end.setFullYear(end.getFullYear() + years); end.setDate(end.getDate() - 1);
    text(0, 384, 216, date(g('start')), 8);
    if (years) text(0, 512, 216, end.toLocaleDateString('en-GB'), 8);
  }
  if (g('kind') === 'Named Perils') tick(0, 124, 113);
  if (g('kind') === 'All Risk') tick(0, 388, 113);
  if (all('perils_extra').includes('Earthquake')) tick(0, 340, 61);
  if (all('perils_extra').includes('Storm and flood (STFI)')) tick(0, 464, 48);

  // ---- Page 2: sum insured basis, values, floater, declaration, premises ----
  const buildingBox = { 'Reinstatement value': 107, 'Saleable value': 277, 'Loss limit': 407 }[g('basis_building')];
  if (buildingBox) tick(1, buildingBox, 768);
  if (g('basis_building') === 'Loss limit') text(1, 258, 757, g('loss_pct') && g('loss_pct') + '%', 8);
  const contentsBox = { 'Reinstatement value': 154, 'Loss limit': 317 }[g('basis_contents')];
  if (contentsBox) tick(1, contentsBox, 742);
  if (g('basis_contents') === 'Loss limit') text(1, 112, 730, g('loss_pct') && g('loss_pct') + '%', 8);
  // The first row of the values table: cover the printed "<In INR>" hint and write the amount in its place.
  const cols = [['v_building', 118], ['v_machinery', 192], ['v_furniture', 254], ['v_raw', 310], ['v_process', 360], ['v_finished', 410]];
  cols.forEach(([k, cx]) => { if (g(k)) { blank(1, cx - 23, 626, 47, 15); centred(1, cx, 630, money(g(k)), 42); } });
  if (g('v_other')) { text(1, 485, 642, g('basis_contents').replace('Reinstatement value', 'Reinst. value'), 6.5, 40); text(1, 484, 629, 'Other', 7.5); text(1, 475, 617, money(g('v_other')), 7.5, 50); }
  const total = [...cols.map(c => c[0]), 'v_other'].reduce((s, k) => s + (Number(g(k)) || 0), 0);
  if (total) centred(1, 548, 641, money(total), 38);
  text(1, 32, 629, 'Main', 8.5);
  if (g('floater') === 'Yes') strike(1, 227, 242, 503); else if (g('floater') === 'No') strike(1, 209, 224, 503);
  if (g('floater') === 'Yes') text(1, 440, 404, money(g('floater_max')), 8);
  if (g('declaration') === 'Yes') strike(1, 248, 263, 376); else if (g('declaration') === 'No') strike(1, 230, 245, 376);
  if (g('declaration') === 'Yes') {
    if (g('decl_mode').startsWith('Average')) tick(1, 318, 346);
    if (g('decl_mode').startsWith('Highest')) tick(1, 229, 333);
    text(1, 215, 314, money(g('decl_amount')), 8);
  }
  text(1, 213, 240, g('industry'), 8);
  text(1, 213, 223, g('construction'), 8);
  text(1, 213, 181, { Yes: 'Present', No: 'Absent' }[g('basement')] || '', 8);
  text(1, 213, 151, g('complex'), 8);
  text(1, 213, 95, g('floor'), 8);
  text(1, 213, 72, g('above_floor'), 8);

  // ---- Page 3: fire protection and security, location 1 column ----
  const fireRows = { 'Portable extinguishers': 778, 'Smoke detectors': 751, 'Hose reels': 725, 'Hydrant system': 660, 'Sprinkler system': 634, 'Fire alarm': 569, 'Gas flooding system': 543 };
  Object.entries(fireRows).forEach(([f, y]) => tick(2, all('fire').includes(f) ? 187 : 222, y));
  text(2, 182, 480, g('fire_station'), 8);
  text(2, 182, 400, g('water_body'), 8);
  text(2, 182, 330, g('electrical'), 8);
  text(2, 182, 300, g('guard'), 8);
  text(2, 182, 267, g('cctv'), 8);
  text(2, 182, 251, g('hours'), 8);
  text(2, 182, 212, g('amc'), 8);

  // ---- Page 4: storage, Location#1 column ----
  [['above_floor', 741], ['racks', 725], ['plinth', 708], ['stock_books', 691], ['public_road', 675], ['road_width', 645], ['open_stock', 602]].forEach(([k, y]) => text(3, 344, y + 2, g(k), 8));
  if (g('open_stock') === 'Yes') text(3, 344, 576, g('open_pct') && g('open_pct') + '%', 8);

  // ---- Pages 4-5: add-ons, "Yes" in the column for the chosen kind ----
  const addonRows = { 'Terrorism and sabotage': [3, 425], 'Loss minimisation': [3, 408], 'Extra expenses': [3, 385], 'Involuntary betterment': [3, 342], 'Rent for alternative premises': [3, 293], 'Contract works': [3, 256], 'Escalation': [3, 227], 'Brand and label': [3, 197], 'Omission to insure additions': [4, 663], 'Temporary removal to exhibition': [4, 558], 'Loss of business income (benefit)': [4, 394], 'Claim preparation cost': [4, 352], 'Temporary repair': [4, 335], 'Accidental damage (Named Perils only)': [4, 272], 'Leakage and overflowing (Named Perils only)': [4, 255] };
  const yesCol = g('kind') === 'All Risk' ? 440 : 166;
  all('addon').forEach(a => addonRows[a] && text(addonRows[a][0], yesCol, addonRows[a][1], 'Yes', 8));

  // ---- Page 6: sections required ----
  const sectionRows = { i: 747, ii: 731, iii: 714, iv: 697, v: 681, vi: 664, vii: 647, viii: 631, ix: 614, x: 597, xi: 581, xii: 564, xiii: 547, xiv: 530, xv: 514, xvi: 497, xvii: 480, xviii: 464, xix: 447, xx: 430, xxi: 414 };
  ['i', ...sections.map(s => s.id)].forEach(id => tick(5, 505, sectionRows[id]));

  // ---- Pages 6-14: each chosen section's answers at the place its question is printed ----
  const wcRows = { 'Clerical staff': 440, 'Commercial': 423, 'Travelers': 410, 'Other': 393 };   // Section XVIII employee rows
  sections.forEach(s => s.questions.forEach(([label, type, where], i) => {
    const vals = all(`s_${s.id}_${i}`).filter(Boolean);
    if (!where || !vals.length) return;
    const [kind, page, ...at] = where;
    const v = type === 'date' ? date(vals[0]) : type === 'number' && label.includes('₹') ? money(vals[0]) : vals[0];
    if (kind === 'text') text(page - 1, at[0], at[1], (at[3] || '') + v, 8, at[2]);
    if (kind === 'yn') yn(page - 1, at[0], at[1], at[2], v);
    if (kind === 'pick') vals.forEach(o => { const p = at[0][o]; if (p) p.length === 3 ? tick(p[0] - 1, p[1], p[2]) : tick(page - 1, ...p); });
    if (kind === 'row' && wcRows[g('s_xviii_0')]) text(page - 1, at[0], wcRows[g('s_xviii_0')], v, 7.5, 60);
  }));
  // Burglary sum insured goes beside whichever basis was chosen.
  if (sections.some(s => s.id === 'ii')) {
    const si = money(g('s_ii_0'));
    if (g('s_ii_1') === 'Market value') text(5, 209, 330, si, 8);
    if (g('s_ii_1') === 'Reinstatement value') text(5, 511, 330, si, 8);
  }

  // ---- Page 14: nominee ----
  text(13, 30, 160, g('nominee'), 8);
  text(13, 125, 160, g('nominee_relation'), 8);
  text(13, 193, 160, date(g('nominee_dob')), 8);
  if (g('nominee')) text(13, 322, 160, '100', 8);

  // ---- Page 15: existing or previous insurance ----
  if (g('prev') === 'Yes') {
    text(14, 30, 716, g('prev_policy'), 7.5, 125);
    text(14, 162, 716, g('prev_insurer'), 7.5, 64);
    if (g('prev_from')) { blank(14, 233, 712, 60, 11); text(14, 237, 716, date(g('prev_from')), 7.5); }
    if (g('prev_to')) { blank(14, 300, 712, 60, 11); text(14, 304, 716, date(g('prev_to')), 7.5); }
    text(14, 368, 716, money(g('prev_si')), 7.5, 66);
    text(14, 441, 716, g('prev_claims'), 7.5, 125);
  }

  // ---- Annexure: everything captured online, including each chosen section's answers ----
  const page = pdf.addPage([595.28, 841.89]);
  let y = 800;
  const line = (s, f = font, size = 9.5) => wrap(s, 520, size, f).forEach(l => { if (y < 50) return; page.drawText(l, { x: 36, y, size, font: f, color: rgb(0.1, 0.1, 0.15) }); y -= size + 5; });
  line('ANNEXURE - Details captured online', bold, 13); y -= 4;
  line('Business Secure Vyaapar Suraksha proposal, prepared with the online assistant. To be completed by the proposer: PAN, KYC, identity and address proof, income proof, bank details and signature.', font, 9); y -= 8;
  groups.forEach(([h, lines]) => { line(h, bold, 11); lines.forEach(l => line('- ' + l)); y -= 6; });
  line(`Generated on ${new Date().toLocaleDateString('en-GB')}`, font, 8);

  const bytes = await pdf.save();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
  a.download = `Vyaapar-Suraksha-proposal-${(g('name') || 'customer').replace(/\W+/g, '-')}.pdf`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}
