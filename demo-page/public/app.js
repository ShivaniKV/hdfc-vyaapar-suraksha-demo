// Vyaapar Suraksha demo page: only the Perfox chat (with its voice button). Two small hooks:
// 1. The assistant's "Source: Policy Wordings, Section II, page 26" line becomes a link to that page of the PDF.
// 2. Opening the page with ?reset clears the demo (claims, call-backs, application requests and this browser's chat).

window.Perfox = window.Perfox || function () { (window.Perfox.q = window.Perfox.q || []).push(arguments); };

if (new URLSearchParams(location.search).has('reset')) {
  fetch('/api/reset', { method: 'POST' }).catch(() => {}).finally(() => {
    Object.keys(localStorage).filter(k => k.startsWith('perfox_widget_conv_')).forEach(k => localStorage.removeItem(k));
    location.replace(location.pathname);
  });
}

Perfox('on', 'ready', () => Perfox('open'));

const DOCS = {
  'Prospectus': 'docs/prospectus.pdf',
  'Policy Wordings': 'docs/policy-wordings.pdf',
  'Optional Wordings': 'docs/optional-wordings.pdf',
  'Proposal Form': 'docs/proposal-form.pdf',
};
const SOURCE = /(Source:\s*)((Prospectus|Policy Wordings|Optional Wordings|Proposal Form)\b[^\n]*?\bpages?\s*(\d+)(?:\s*[-–]\s*\d+)?)/;

function linkSources(root) {
  root.querySelectorAll('.sa-msg-assistant .sa-md').forEach(md => {
    if (md.querySelector('a.source-link')) return;
    const walker = document.createTreeWalker(md, NodeFilter.SHOW_TEXT);
    for (let node; (node = walker.nextNode());) {
      const m = node.data.match(SOURCE);
      if (!m) continue;
      const a = document.createElement('a');
      a.className = 'source-link';
      a.href = `${location.origin}/${DOCS[m[3]]}#page=${m[4]}`;
      a.target = '_blank';
      a.rel = 'noopener';
      a.textContent = m[2];
      const rest = node.splitText(m.index + m[1].length);
      rest.data = rest.data.slice(m[2].length);
      rest.parentNode.insertBefore(a, rest);
      return;
    }
  });
}

// The widget lives in a shadow root and re-renders messages, so watch it for changes.
const watched = new WeakSet();
setInterval(() => {
  document.querySelectorAll('*').forEach(el => {
    if (!el.shadowRoot || watched.has(el.shadowRoot)) return;
    watched.add(el.shadowRoot);
    new MutationObserver(() => linkSources(el.shadowRoot)).observe(el.shadowRoot, { childList: true, subtree: true, characterData: true });
    linkSources(el.shadowRoot);
  });
}, 1000);
