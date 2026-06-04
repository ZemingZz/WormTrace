/**
 * literatureApp.js — "Literature" project (opened from the Biotastic Lab home).
 * Grouped reference lists, SEPARATED BY ORGANISM via a top toggle:
 *   🪱 C. elegans   ·   🪰 Drosophila
 * Each organism has its own protocol / assay / pathway / resource / strain groups.
 * Tap a reference to open the source. Add to LIT[organism] to extend it.
 */
const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

const LIT = {
  celegans: [
    {
      group: '🧫 Protocols (Experiments & Procedures)',
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
      group: '📖 Methods & resources',
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
  ],

  drosophila: [
    {
      group: '🍶 Protocols (Experiments & Procedures)',
      items: [
        { title: 'Cornmeal–Molasses food', by: 'Bloomington Drosophila Stock Center (BDSC) recipe', url: 'https://bdsc.indiana.edu/information/recipes/molassesfood.html' },
        { title: 'Cornmeal–Dextrose food', by: 'Bloomington Drosophila Stock Center (BDSC) recipe', url: 'https://bdsc.indiana.edu/information/recipes/dextrosefood.html' },
        { title: 'Fly handling, CO₂ anesthesia & crosses', by: 'BDSC — care & use of Drosophila', url: 'https://bdsc.indiana.edu/information/care.html' },
      ],
    },
    {
      group: '🧪 Experiments & assays',
      items: [
        { title: 'Measurement of lifespan in Drosophila', by: 'Linford et al. (2013) — JoVE 71:50068', url: 'https://www.jove.com/t/50068' },
        { title: 'Locomotor (climbing) assays in Drosophila', by: 'Nichols, Becnel & Pandey (2012) — JoVE 61:3795', url: 'https://www.jove.com/t/3795' },
        { title: 'Rapid Iterative Negative Geotaxis (RING)', by: 'Gargano et al. (2005) Exp. Gerontol. 40:386', url: 'https://pubmed.ncbi.nlm.nih.gov/15919590/' },
      ],
    },
    {
      group: '🔗 Aging pathways (IIS / TOR)',
      items: [
        { title: 'Insulin/IGF & TOR signalling network in ageing (review)', by: 'Partridge, Alic, Bjedov & Piper (2011) Exp. Gerontol. 46:376', url: 'https://www.sciencedirect.com/science/article/pii/S0531556510002925' },
        { title: 'chico (insulin-receptor substrate) extends lifespan', by: 'Clancy et al. (2001) Science 292:104', url: 'https://www.science.org/doi/10.1126/science.1057991' },
        { title: 'A mutant insulin receptor (InR) extends lifespan', by: 'Tatar et al. (2001) Science 292:107', url: 'https://www.science.org/doi/10.1126/science.1057987' },
        { title: 'dFOXO over-expression (adult fat body) extends lifespan', by: 'Giannakou et al. (2004) Science 305:361', url: 'https://www.science.org/doi/10.1126/science.1098219' },
        { title: 'dFOXO controls lifespan & regulates insulin signalling', by: 'Hwang et al. (2004) Nature 429:562 (PMID 15175753)', url: 'https://pubmed.ncbi.nlm.nih.gov/15175753/' },
        { title: 'TOR / S6K modulation extends lifespan', by: 'Kapahi et al. (2004) Curr. Biol. 14:885', url: 'https://pubmed.ncbi.nlm.nih.gov/15186745/' },
        { title: 'methuselah — extended life-span & stress resistance', by: 'Lin, Seroude & Benzer (1998) Science 282:943', url: 'https://www.science.org/doi/10.1126/science.282.5390.943' },
        { title: 'Indy cotransporter mutations extend life-span', by: 'Rogina et al. (2000) Science 290:2137', url: 'https://www.science.org/doi/10.1126/science.290.5499.2137' },
        { title: 'Sir2 mediates dietary-restriction longevity', by: 'Rogina & Helfand (2004) PNAS 101:15998', url: 'https://www.pnas.org/doi/10.1073/pnas.0404184101' },
      ],
    },
    {
      group: '📖 Methods & resources',
      items: [
        { title: 'FlyBase', by: 'Drosophila genome, gene & stock database', url: 'https://flybase.org' },
        { title: 'Bloomington Drosophila Stock Center (BDSC)', by: 'Stock ordering, food recipes & care', url: 'https://bdsc.indiana.edu' },
      ],
    },
    {
      group: '🧬 Strain lifespan / aging data',
      items: [
        { title: 'Wild-type strain aging (Canton-S vs w1118)', by: 'Iliadi & Boulianne et al. (2017) — age-dependent performance', url: 'https://www.sciencedirect.com/science/article/abs/pii/S109564331730003X' },
        { title: 'Old wild-type strains as faster/slower aging models', by: 'Bhandari et al. — PMC11122303', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC11122303/' },
        { title: 'Per-stock sources', by: 'Shown on each stock in the Drosophila → Stock Collection', url: '' },
      ],
    },
  ],

  yeast: [
    {
      group: '🧫 Protocols (Experiments & Procedures)',
      items: [
        { title: 'YPD rich medium', by: 'Cold Spring Harbor Protocols', url: 'http://cshprotocols.cshlp.org/content/2010/9/pdb.rec12315' },
        { title: 'Synthetic complete (SC/SD) medium', by: 'Cold Spring Harbor Protocols', url: 'http://cshprotocols.cshlp.org/content/2016/12/pdb.rec090589' },
        { title: 'LiAc/SS-DNA/PEG transformation', by: 'Gietz & Schiestl (2007) — Nat. Protoc. 2:31', url: 'https://www.nature.com/articles/nprot.2007.13' },
        { title: 'Tetrad dissection & sporulation', by: 'Cold Spring Harbor Protocols', url: 'http://cshprotocols.cshlp.org/content/2017/11/pdb.prot088824' },
      ],
    },
    {
      group: '🧪 Experiments & assays',
      items: [
        { title: 'Growth & the cell cycle (OD600, doubling time)', by: 'Sherman (2002) Getting started with yeast — Methods Enzymol. 350:3', url: 'https://pubmed.ncbi.nlm.nih.gov/12073320/' },
        { title: 'Spot / drop serial-dilution assay', by: 'Cold Spring Harbor Protocols', url: 'http://cshprotocols.cshlp.org/content/2016/11/pdb.prot088989' },
        { title: 'Replicative lifespan by microdissection', by: 'Steffen, Kennedy & Kaeberlein (2009) — JoVE 28:1209', url: 'https://www.jove.com/t/1209' },
        { title: 'Chronological lifespan (CLS)', by: 'Fabrizio & Longo (2007) — Methods Mol. Biol. 371:89', url: 'https://pubmed.ncbi.nlm.nih.gov/17634576/' },
      ],
    },
    {
      group: '🔗 Aging pathways (TOR / PKA / sirtuins)',
      items: [
        { title: 'Lessons on longevity from budding yeast (review)', by: 'Kaeberlein (2010) Nature 464:513', url: 'https://www.nature.com/articles/nature08981' },
        { title: 'Replicative & chronological aging in yeast (review)', by: 'Longo et al. (2012) Cell Metab. 16:18', url: 'https://pubmed.ncbi.nlm.nih.gov/22768836/' },
        { title: 'TOR & Sch9 regulate replicative life span', by: 'Kaeberlein et al. (2005) Science 310:1193', url: 'https://www.science.org/doi/10.1126/science.1115535' },
        { title: 'SIR2 & life span (rDNA silencing)', by: 'Kaeberlein, McVey & Guarente (1999) Genes Dev. 13:2570', url: 'https://pubmed.ncbi.nlm.nih.gov/10521401/' },
        { title: 'Fob1 / ERCs drive replicative aging', by: 'Defossez et al. (1999) Mol. Cell 3:447', url: 'https://pubmed.ncbi.nlm.nih.gov/10198633/' },
        { title: 'Ras/Sch9 & chronological survival', by: 'Fabrizio et al. (2001) Science 292:288', url: 'https://www.science.org/doi/10.1126/science.1059497' },
      ],
    },
    {
      group: '📖 Methods & resources',
      items: [
        { title: 'Saccharomyces Genome Database (SGD)', by: 'Genome, gene & phenotype database', url: 'https://www.yeastgenome.org' },
        { title: 'Designer deletion strains (BY series)', by: 'Brachmann et al. (1998) — Yeast 14:115', url: 'https://pubmed.ncbi.nlm.nih.gov/9483801/' },
        { title: 'The yeast genome (6000 genes)', by: 'Goffeau et al. (1996) — Science 274:546', url: 'https://www.science.org/doi/10.1126/science.274.5287.546' },
      ],
    },
    {
      group: '🧬 Strain lifespan / aging data',
      items: [
        { title: 'Per-strain sources', by: 'Shown on each strain in the Yeast → Stock Collection', url: '' },
      ],
    },
  ],
};

const ORGS = [
  { key: 'celegans',   label: '🪱 C. elegans' },
  { key: 'drosophila', label: '🪰 Drosophila' },
  { key: 'yeast',      label: '🧫 Yeast' },
  { key: 'overlap',    label: '🔗 Overlap' },
];
let curOrg = 'celegans';

// ── OVERLAP: conserved aging pathways shared by worms & flies (orthologs + refs). ──
const CONSERVED = [
  {
    key: 'iis', label: 'Insulin / IGF → FOXO', color: '#7c3aed',
    note: 'Reduced insulin/IGF signalling activates a FOXO transcription factor (DAF-16 in worms, dFOXO in flies) to extend lifespan and boost stress resistance — the founding conserved aging pathway.',
    pairs: [['daf-2', 'InR'], ['age-1', 'Pi3K92E'], ['akt-1/2', 'Akt1'], ['daf-16', 'dFOXO']],
    refs: [
      { title: 'The endocrine regulation of aging by insulin-like signals', by: 'Tatar, Bartke & Antebi (2003) Science 299:1346', url: 'https://www.science.org/doi/10.1126/science.1081447' },
      { title: 'The genetics of ageing (review across species)', by: 'Kenyon C. (2010) Nature 464:504', url: 'https://www.nature.com/articles/nature08980' },
    ],
  },
  {
    key: 'tor', label: 'TOR → S6K / 4E-BP', color: '#0891b2',
    note: 'Lowering TOR (and its effector S6K) extends lifespan in both organisms, partly through reduced translation and increased autophagy.',
    pairs: [['let-363', 'Tor'], ['rsks-1', 'S6k'], ['daf-15', 'raptor']],
    refs: [
      { title: 'mTOR is a key modulator of ageing and age-related disease', by: 'Johnson, Rabinovitch & Kaeberlein (2013) Nature 493:338', url: 'https://www.nature.com/articles/nature11861' },
      { title: 'Regulation of lifespan by modulating the TOR pathway (fly)', by: 'Kapahi et al. (2004) Curr. Biol. 14:885', url: 'https://pubmed.ncbi.nlm.nih.gov/15186745/' },
    ],
  },
  {
    key: 'dr', label: 'Dietary restriction', color: '#ec4899',
    note: 'Dietary restriction extends lifespan across yeast, worms, flies and mammals through conserved nutrient-sensing (overlapping with IIS & TOR).',
    pairs: [['eat-2', 'food dilution'], ['aak-2', 'AMPK']],
    refs: [
      { title: 'Extending healthy life span — from yeast to humans', by: 'Fontana, Partridge & Longo (2010) Science 328:321', url: 'https://www.science.org/doi/10.1126/science.1172539' },
      { title: 'Aging & survival: genetics of lifespan extension by DR', by: 'Mair & Dillin (2008) Annu. Rev. Biochem. 77:727', url: 'https://pubmed.ncbi.nlm.nih.gov/18373439/' },
    ],
  },
  {
    key: 'sir', label: 'Sirtuins', color: '#f59e0b',
    note: 'Sirtuin (Sir2) activity has been linked to dietary-restriction longevity in both worms and flies (the magnitude has been debated).',
    pairs: [['sir-2.1', 'Sir2']],
    refs: [
      { title: 'Sir2 mediates dietary-restriction longevity (fly)', by: 'Rogina & Helfand (2004) PNAS 101:15998', url: 'https://www.pnas.org/doi/10.1073/pnas.0404184101' },
    ],
  },
  {
    key: 'autophagy', label: 'Autophagy', color: '#16a34a',
    note: 'Autophagy is required for lifespan extension by reduced IIS/TOR and by dietary restriction in both organisms.',
    pairs: [['bec-1', 'Atg6'], ['lgg-1', 'Atg8a'], ['unc-51', 'Atg1']],
    refs: [
      { title: 'Autophagy as a promoter of longevity', by: 'Hansen, Rubinsztein & Walker (2018) Nat. Rev. Mol. Cell Biol. 19:579', url: 'https://pubmed.ncbi.nlm.nih.gov/30050098/' },
    ],
  },
];
const OVERLAP_GENERAL = [
  { title: 'Mechanisms of ageing: public or private?', by: 'Partridge & Gems (2002) Nat. Rev. Genet. 3:165', url: 'https://pubmed.ncbi.nlm.nih.gov/11972154/' },
  { title: 'The plasticity of aging: insights from long-lived mutants', by: 'Kenyon C. (2005) Cell 120:449', url: 'https://pubmed.ncbi.nlm.nih.gov/15734678/' },
];
let selPw = 'all';   // selected conserved pathway in the Overlap graph

function refItem(it) {
  const link = it.url
    ? `<a href="${esc(it.url)}" target="_blank" rel="noopener noreferrer" class="lit-open">open ↗</a>`
    : `<span class="lit-noopen">in app</span>`;
  return `<div class="lit-item">
    <div class="lit-it-main"><div class="lit-title">${esc(it.title)}</div><div class="lit-by">${esc(it.by)}</div></div>
    ${link}
  </div>`;
}

// Bipartite "ortholog bridge" graph: worm gene ↔ fly gene, coloured by pathway, clickable.
function overlapGraph(scope) {
  const list = scope === 'all' ? CONSERVED : CONSERVED.filter(p => p.key === scope);
  const pairs = [];
  list.forEach(p => p.pairs.forEach(([w, f]) => pairs.push({ w, f, color: p.color, key: p.key })));
  const W = 520, rowH = 34, top = 30, H = top + pairs.length * rowH + 8;
  const lx = 12, lw = 188, rx = 320, rw = 188;
  let s = `<rect x="0" y="0" width="${W}" height="${H}" fill="#0a0e1a"/>` +
    `<text x="${lx + lw / 2}" y="19" fill="#94a3b8" font-size="11" font-weight="700" text-anchor="middle">🪱 C. elegans</text>` +
    `<text x="${rx + rw / 2}" y="19" fill="#94a3b8" font-size="11" font-weight="700" text-anchor="middle">🪰 Drosophila</text>`;
  pairs.forEach((pr, i) => {
    const y = top + i * rowH, cy = y + 13;
    s += `<line x1="${lx + lw}" y1="${cy}" x2="${rx}" y2="${cy}" stroke="${pr.color}" stroke-width="2"/>` +
      `<circle cx="${(lx + lw + rx) / 2}" cy="${cy}" r="2.5" fill="${pr.color}"/>` +
      `<foreignObject x="${lx}" y="${y}" width="${lw}" height="26"><button xmlns="http://www.w3.org/1999/xhtml" data-pw="${pr.key}" title="${esc(pr.key)} pathway" style="width:100%;height:26px;cursor:pointer;background:${pr.color}22;border:1px solid ${pr.color};border-radius:7px;color:#e2e8f0;font-size:11.5px;font-weight:700">${esc(pr.w)}</button></foreignObject>` +
      `<foreignObject x="${rx}" y="${y}" width="${rw}" height="26"><button xmlns="http://www.w3.org/1999/xhtml" data-pw="${pr.key}" title="${esc(pr.key)} pathway" style="width:100%;height:26px;cursor:pointer;background:${pr.color}22;border:1px solid ${pr.color};border-radius:7px;color:#e2e8f0;font-size:11.5px;font-weight:700">${esc(pr.f)}</button></foreignObject>`;
  });
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" style="display:block;border:1px solid #1e2a3a;border-radius:12px;background:#0a0e1a">${s}</svg>`;
}

function renderOverlap(root) {
  const chip = (key, label, color) =>
    `<button data-pwchip="${key}" style="width:auto;min-height:unset;cursor:pointer;border-radius:14px;padding:5px 12px;font-size:11.5px;font-weight:700;
      ${selPw === key ? `background:${color || '#00d4aa'};border:1px solid ${color || '#00d4aa'};color:#04201a` : `background:#111a2b;border:1px solid ${color || '#1e2a3a'};color:#cbd5e1`}">${esc(label)}</button>`;
  const chips = [chip('all', 'All pathways', '#00d4aa'), ...CONSERVED.map(p => chip(p.key, p.label, p.color))].join(' ');
  const visible = selPw === 'all' ? CONSERVED : CONSERVED.filter(p => p.key === selPw);
  const refsBlocks = visible.map(p => `
    <div class="lit-group">
      <div class="lit-group-t" style="color:${p.color}">${esc(p.label)} — worms ↔ flies</div>
      <div style="font-size:11px;color:#94a3b8;line-height:1.5;margin:0 0 6px">${esc(p.note)}</div>
      ${p.refs.map(refItem).join('')}
    </div>`).join('');
  root.innerHTML += `
    <div class="lit-intro">Aging research in <i>C. elegans</i> and <i>Drosophila</i> overlaps heavily: the same nutrient-sensing pathways control lifespan in both. Tap a gene or a chip to focus a conserved pathway.</div>
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px">${chips}</div>
    ${overlapGraph(selPw)}
    <div style="font-size:10px;color:#64748b;margin:6px 0 12px">Lines link orthologous genes (same pathway role in each species). Reduced insulin/IGF & TOR signalling and dietary restriction all converge on FOXO, autophagy and stress resistance to extend life.</div>
    <div class="lit-group"><div class="lit-group-t">🔍 Comparative / cross-species reviews</div>${OVERLAP_GENERAL.map(refItem).join('')}</div>
    ${refsBlocks}`;
  root.querySelectorAll('[data-pw], [data-pwchip]').forEach(b =>
    b.onclick = () => { selPw = b.dataset.pw || b.dataset.pwchip; render(); });
}

function render() {
  const root = document.getElementById('litBody');
  if (!root) return;
  const tabs = ORGS.map(o =>
    `<button data-litorg="${o.key}" style="width:auto;min-height:unset;cursor:pointer;border-radius:9px;padding:8px 16px;font-size:13px;font-weight:700;
      ${o.key === curOrg ? 'background:#00d4aa;border:1px solid #00d4aa;color:#04201a' : 'background:#111a2b;border:1px solid #1e2a3a;color:#94a3b8'}">${esc(o.label)}</button>`).join('');
  root.innerHTML = `<div style="display:flex;gap:8px;margin-bottom:10px;flex-wrap:wrap">${tabs}</div>`;
  if (curOrg === 'overlap') {
    renderOverlap(root);
  } else {
    const groups = (LIT[curOrg] || []).map(g => `<div class="lit-group">
        <div class="lit-group-t">${esc(g.group)}</div>
        ${g.items.map(refItem).join('')}
      </div>`).join('');
    root.innerHTML += `
      <div class="lit-intro">Key references for the lab's protocols, methods, pathways and strain data — separated by organism. Tap “open ↗” to view the source.</div>
      ${groups}`;
  }
  root.querySelectorAll('[data-litorg]').forEach(b => b.onclick = () => { curOrg = b.dataset.litorg; render(); });
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
