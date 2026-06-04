/**
 * literatureApp.js — "Literature" project (opened from the Biotastic Lab home).
 * A simple, grouped reference list (protocols, methods/resources, strain data).
 * Add to REFERENCES to extend it. Tap a reference to open the source.
 */
const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

const REFERENCES = [
  {
    group: '🧫 Protocols (used in Experiments & Procedures)',
    items: [
      { title: 'NGM agar plates', by: 'Cold Spring Harbor Protocols (2014) — pdb.rec081299', url: 'https://cshprotocols.cshlp.org/content/2014/3/pdb.rec081299' },
      { title: 'Liquid culture — S Basal / S-medium', by: 'Stiernagle T. (2006) Maintenance of C. elegans — WormBook', url: 'https://www.wormbook.org/chapters/www_strainmaintain/strainmaintain.html' },
      { title: '50× TAE electrophoresis buffer', by: 'Sambrook & Russell, Molecular Cloning (standard recipe)', url: 'https://www.protocols.io/view/recipe-for-50x-tae-buffer-ewov1d47vr24' },
      { title: 'Bleach synchronization (egg prep)', by: 'Porta-de-la-Riva et al. (2012) Basic C. elegans Methods — JoVE', url: 'https://www.jove.com/t/4019' },
    ],
  },
  {
    group: '🧪 Experiments & assays',
    items: [
      { title: 'Lifespan assay on solid media', by: 'Sutphin & Kaeberlein (2009) — JoVE 27:1152', url: 'https://www.jove.com/t/1152' },
      { title: 'The C. elegans lifespan assay toolkit', by: 'Amrit et al. (2014) Methods 68:465', url: 'https://pubmed.ncbi.nlm.nih.gov/24727065/' },
      { title: 'Chemotaxis assay', by: 'Margie, Palmer & Chin-Sang (2013) — JoVE 74:50069', url: 'https://www.jove.com/t/50069' },
      { title: 'Odorant-selective genes & neurons (chemotaxis)', by: 'Bargmann, Hartwieg & Horvitz (1993) Cell 74:515', url: 'https://pubmed.ncbi.nlm.nih.gov/8348618/' },
      { title: 'C. elegans in high-throughput drug discovery', by: "O'Reilly et al. (2014) Adv Drug Deliv Rev 69-70:247", url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC4019719/' },
      { title: 'A simple high-throughput chemical screening method', by: 'Squiban et al. (2018) — JoVE 134:56892', url: 'https://www.jove.com/t/56892' },
      { title: 'C. elegans killing by P. aeruginosa (pathogenesis model)', by: 'Tan, Mahajan-Miklos & Ausubel (1999) PNAS 96:715', url: 'https://www.pnas.org/doi/10.1073/pnas.96.2.715' },
    ],
  },
  {
    group: '📖 C. elegans methods & resources',
    items: [
      { title: 'WormBook', by: 'Open-access reviews of C. elegans biology & methods', url: 'http://www.wormbook.org' },
      { title: 'WormBase', by: 'Genome, gene & strain database', url: 'https://wormbase.org' },
      { title: 'Caenorhabditis Genetics Center (CGC)', by: 'Strain ordering & stock data', url: 'https://cgc.umn.edu' },
    ],
  },
  {
    group: '🧬 Strain lifespan / aging data',
    items: [
      { title: 'Curated strain lifespan dataset', by: 'Imported into Worm Collection — per-strain PMIDs/links shown on each worm', url: '' },
      { title: 'Kenyon C. et al. (1993) — daf-2 doubles lifespan', by: 'Nature 366:461 (PMID 8247153)', url: 'https://pubmed.ncbi.nlm.nih.gov/8247153/' },
    ],
  },
];

function refItem(it) {
  const link = it.url
    ? `<a href="${esc(it.url)}" target="_blank" rel="noopener noreferrer" class="lit-open">open ↗</a>`
    : `<span class="lit-noopen">in app</span>`;
  return `<div class="lit-item">
    <div class="lit-it-main"><div class="lit-title">${esc(it.title)}</div><div class="lit-by">${esc(it.by)}</div></div>
    ${link}
  </div>`;
}

function render() {
  const root = document.getElementById('litBody');
  if (!root) return;
  root.innerHTML = `
    <div class="lit-intro">Key references for the lab's protocols, methods, and strain data. (We can expand this into full citations / PDFs later.)</div>
    ${REFERENCES.map(g => `<div class="lit-group">
      <div class="lit-group-t">${esc(g.group)}</div>
      ${g.items.map(refItem).join('')}
    </div>`).join('')}`;
}

function init() {
  const ll = document.getElementById('labLit');
  if (!ll) return;
  ll.querySelector('.le-home')?.addEventListener('click', () => {
    ll.style.display = 'none';
    const h = document.getElementById('homeScreen'); if (h) h.style.display = 'flex';
  });
  render();
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
