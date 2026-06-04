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

// ── OVERLAP: conserved aging mechanisms across yeast, worms & flies. `scope` places
//    each one in the Venn (all3 = centre; wormfly = animal-only lens; yeast = unique). ──
const CONSERVED = [
  {
    key: 'tor', label: 'TOR → S6K', color: '#0891b2', scope: 'all3',
    members: { worm: 'let-363 (TOR) · rsks-1 (S6K)', fly: 'Tor · S6k', yeast: 'TOR1 · Sch9' },
    note: 'The TOR (TORC1) nutrient kinase and its S6K-family effector are conserved from yeast to mammals; lowering TOR (genetically or with rapamycin) extends lifespan in all of them.',
    refs: [
      { title: 'TOR & Sch9 regulate yeast replicative life span', by: 'Kaeberlein et al. (2005) Science 310:1193', url: 'https://www.science.org/doi/10.1126/science.1115535' },
      { title: 'TOR pathway modulation extends fly lifespan', by: 'Kapahi et al. (2004) Curr. Biol. 14:885', url: 'https://pubmed.ncbi.nlm.nih.gov/15186745/' },
      { title: 'mTOR is a key modulator of ageing', by: 'Johnson, Rabinovitch & Kaeberlein (2013) Nature 493:338', url: 'https://www.nature.com/articles/nature11861' },
    ],
  },
  {
    key: 'dr', label: 'Dietary restriction', color: '#ec4899', scope: 'all3',
    members: { worm: 'eat-2 (genetic DR)', fly: 'food / yeast dilution', yeast: 'low glucose (CR)' },
    note: 'Reducing nutrients without malnutrition extends lifespan in yeast, worms, flies and mammals — the most conserved non-genetic longevity intervention, acting largely through TOR, PKA/AMPK and sirtuins.',
    refs: [
      { title: 'Extending healthy life span — from yeast to humans', by: 'Fontana, Partridge & Longo (2010) Science 328:321', url: 'https://www.science.org/doi/10.1126/science.1172539' },
      { title: 'DR & lifespan: lessons from invertebrate models', by: 'Lee & Min (2017) review — PMID 28007498', url: 'https://pubmed.ncbi.nlm.nih.gov/28007498/' },
    ],
  },
  {
    key: 'sir', label: 'Sirtuins (Sir2)', color: '#f59e0b', scope: 'all3',
    members: { worm: 'sir-2.1', fly: 'Sir2', yeast: 'SIR2' },
    note: 'NAD⁺-dependent sirtuin deacetylases were discovered in yeast (rDNA silencing → fewer ERCs) and linked to longevity in worms and flies; the exact magnitude has been debated, but the gene family is deeply conserved.',
    refs: [
      { title: 'SIR2 & yeast life span (rDNA silencing)', by: 'Kaeberlein, McVey & Guarente (1999) Genes Dev. 13:2570', url: 'https://pubmed.ncbi.nlm.nih.gov/10521401/' },
      { title: 'Sir2 mediates dietary-restriction longevity (fly)', by: 'Rogina & Helfand (2004) PNAS 101:15998', url: 'https://www.pnas.org/doi/10.1073/pnas.0404184101' },
    ],
  },
  {
    key: 'ampk', label: 'AMPK / Snf1', color: '#10b981', scope: 'all3',
    members: { worm: 'aak-2 (AMPK)', fly: 'AMPK · LKB1', yeast: 'Snf1' },
    note: 'The AMP-activated kinase energy sensor (Snf1 in yeast) opposes TOR/PKA and is required for, or sufficient to extend, lifespan under dietary restriction across yeast, worms and flies.',
    refs: [
      { title: 'CR extends yeast CLS via the Snf1 (AMPK) pathway', by: 'Deprez et al. (2017) Mol. Cell. Biol. 37:e00562', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC5472825/' },
      { title: 'AMPK & energy-sensing in animal longevity', by: 'Greer et al. (2007) Curr. Biol. 17:1646 (aak-2/AMPK)', url: 'https://pubmed.ncbi.nlm.nih.gov/17900900/' },
    ],
  },
  {
    key: 'autophagy', label: 'Autophagy', color: '#16a34a', scope: 'all3',
    members: { worm: 'bec-1 · lgg-1 · unc-51', fly: 'Atg6 · Atg8a · Atg1', yeast: 'ATG genes' },
    note: 'Autophagy (cellular self-digestion / recycling) is required for the lifespan extension from reduced TOR/IIS and from dietary restriction in yeast, worms and flies alike.',
    refs: [
      { title: 'Autophagy as a promoter of longevity (review)', by: 'Hansen, Rubinsztein & Walker (2018) Nat. Rev. Mol. Cell Biol. 19:579', url: 'https://pubmed.ncbi.nlm.nih.gov/30050098/' },
      { title: 'Autophagy required for DR longevity in C. elegans', by: 'Hansen et al. (2008) PLoS Genet. 4:e24', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC2242811/' },
    ],
  },
  {
    key: 'iis', label: 'Insulin / IGF → FOXO', color: '#7c3aed', scope: 'wormfly',
    members: { worm: 'daf-2 · age-1 · daf-16 (FOXO)', fly: 'InR · chico · dFOXO', yeast: '— (no insulin/IGF; Sch9 / Ras-PKA is the functional analog)' },
    note: 'The insulin/IGF receptor → PI3K/Akt → FOXO axis controls aging in animals (worms, flies, mammals). Yeast lacks insulin/IGF, but its Sch9 and Ras–PKA kinases play the analogous nutrient-sensing role.',
    refs: [
      { title: 'The endocrine regulation of aging by insulin-like signals', by: 'Tatar, Bartke & Antebi (2003) Science 299:1346', url: 'https://www.science.org/doi/10.1126/science.1081447' },
      { title: 'The genetics of ageing (review)', by: 'Kenyon C. (2010) Nature 464:504', url: 'https://www.nature.com/articles/nature08980' },
    ],
  },
  {
    key: 'rdna', label: 'rDNA stability / ERCs', color: '#f97316', scope: 'yeast',
    members: { worm: '—', fly: '—', yeast: 'SIR2 / FOB1 → rDNA, ERCs' },
    note: 'Replicative aging of the yeast mother cell is driven by instability of the rDNA repeats and the accumulation of extrachromosomal rDNA circles (ERCs) — a mechanism best characterised in yeast (Sir2 suppresses it; Fob1 promotes it).',
    refs: [
      { title: 'Fob1 / ERCs drive replicative aging', by: 'Defossez et al. (1999) Mol. Cell 3:447', url: 'https://pubmed.ncbi.nlm.nih.gov/10198633/' },
      { title: 'An age-inducing factor: ERCs cause aging in yeast', by: 'Sinclair & Guarente (1997) Cell 91:1033', url: 'https://pubmed.ncbi.nlm.nih.gov/9428525/' },
    ],
  },
];
const OVERLAP_GENERAL = [
  { title: 'The hallmarks of aging (nutrient sensing: IIS, mTOR, sirtuins, AMPK)', by: 'López-Otín et al. (2013) Cell 153:1194', url: 'https://pubmed.ncbi.nlm.nih.gov/23746838/' },
  { title: 'Lessons on longevity from budding yeast', by: 'Kaeberlein (2010) Nature 464:513', url: 'https://www.nature.com/articles/nature08981' },
  { title: 'Genome-wide conserved longevity genes in yeast & worms', by: 'Smith et al. (2008) Genome Res. 18:564', url: 'https://www.sciencedirect.com/science/article/abs/pii/S0047637406002508' },
  { title: 'Mechanisms of ageing: public or private?', by: 'Partridge & Gems (2002) Nat. Rev. Genet. 3:165', url: 'https://pubmed.ncbi.nlm.nih.gov/11972154/' },
];
let selPw = 'all';   // selected conserved mechanism in the Overlap view

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
// 3-circle Venn (🪱 C. elegans · 🪰 Drosophila · 🧫 S. cerevisiae) with the conserved
// mechanisms placed in the correct region; each label is a clickable filter.
function vennDiagram() {
  const W = 360, H = 300;
  const A = { x: 132, y: 124, r: 86, c: '#34d399' };   // worm (green)
  const B = { x: 228, y: 124, r: 86, c: '#a78bfa' };   // fly (purple)
  const C = { x: 180, y: 200, r: 86, c: '#f59e0b' };   // yeast (amber)
  const circ = o => `<circle cx="${o.x}" cy="${o.y}" r="${o.r}" fill="${o.c}1f" stroke="${o.c}" stroke-width="1.5"/>`;
  let s = `<rect x="0" y="0" width="${W}" height="${H}" fill="#0a0e1a"/>` + circ(A) + circ(B) + circ(C) +
    `<text x="70" y="42" fill="#34d399" font-size="12" font-weight="800">🪱 C. elegans</text>` +
    `<text x="224" y="42" fill="#a78bfa" font-size="12" font-weight="800">🪰 Drosophila</text>` +
    `<text x="180" y="296" fill="#f59e0b" font-size="12" font-weight="800" text-anchor="middle">🧫 S. cerevisiae</text>`;
  const btn = (x, y, w, p) => `<foreignObject x="${x}" y="${y}" width="${w}" height="17"><button xmlns="http://www.w3.org/1999/xhtml" data-pw="${p.key}" title="shared mechanism" style="width:100%;height:17px;cursor:pointer;background:${selPw === p.key ? p.color : p.color + '33'};border:1px solid ${p.color};border-radius:9px;color:${selPw === p.key ? '#04201a' : '#e2e8f0'};font-size:9px;font-weight:700;padding:0;white-space:nowrap;overflow:hidden">${esc(p.label)}</button></foreignObject>`;
  // centre = shared by all three
  const all3 = CONSERVED.filter(p => p.scope === 'all3');
  all3.forEach((p, i) => s += btn(140, 132 + i * 18, 80, p));
  // worm ∩ fly lens (animals only), above the centre
  const wf = CONSERVED.find(p => p.scope === 'wormfly'); if (wf) s += btn(130, 102, 100, wf);
  // yeast-only, lower lobe
  const ye = CONSERVED.find(p => p.scope === 'yeast'); if (ye) s += btn(140, 238, 80, ye);
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" style="display:block;border:1px solid #1e2a3a;border-radius:12px;max-width:430px;margin:0 auto">${s}</svg>`;
}

function renderOverlap(root) {
  const chip = (key, label, color) =>
    `<button data-pwchip="${key}" style="width:auto;min-height:unset;cursor:pointer;border-radius:14px;padding:5px 12px;font-size:11.5px;font-weight:700;
      ${selPw === key ? `background:${color || '#00d4aa'};border:1px solid ${color || '#00d4aa'};color:#04201a` : `background:#111a2b;border:1px solid ${color || '#1e2a3a'};color:#cbd5e1`}">${esc(label)}</button>`;
  const chips = [chip('all', 'All', '#00d4aa'), ...CONSERVED.map(p => chip(p.key, p.label, p.color))].join(' ');
  const visible = selPw === 'all' ? CONSERVED : CONSERVED.filter(p => p.key === selPw);
  const col = (emoji, name, val, c) =>
    `<div style="flex:1;min-width:90px"><div style="font-size:10px;font-weight:800;color:${c}">${emoji} ${name}</div><div style="font-size:11px;color:#cbd5e1;line-height:1.4">${esc(val || '—')}</div></div>`;
  const refsBlocks = visible.map(p => `
    <div class="lit-group">
      <div class="lit-group-t" style="color:${p.color}">${esc(p.label)}${p.scope === 'all3' ? ' — shared by all three' : p.scope === 'wormfly' ? ' — worms & flies (animals)' : ' — yeast'}</div>
      <div style="font-size:11px;color:#94a3b8;line-height:1.5;margin:0 0 8px">${esc(p.note)}</div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:8px">${col('🪱', 'C. elegans', p.members.worm, '#34d399')}${col('🪰', 'Drosophila', p.members.fly, '#a78bfa')}${col('🧫', 'Yeast', p.members.yeast, '#f59e0b')}</div>
      ${p.refs.map(refItem).join('')}
    </div>`).join('');
  root.innerHTML += `
    <div class="lit-intro">Aging research in <i>C. elegans</i>, <i>Drosophila</i> and <i>S. cerevisiae</i> overlaps heavily — the same nutrient-sensing pathways set lifespan in all three. The Venn shows where each mechanism is shared; tap a label or chip to focus it.</div>
    ${vennDiagram()}
    <div style="font-size:10px;color:#64748b;margin:6px 0 12px;text-align:center">Centre = conserved across all three · top lens = animals only (insulin/IGF–FOXO) · lower lobe = yeast-specific.</div>
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px">${chips}</div>
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
