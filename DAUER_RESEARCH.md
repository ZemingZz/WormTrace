# C. elegans Dauer Formation — Research Notes for WormTrace

*Compiled 2026-06-02 via a multi-source deep-research + adversarial-verification pass
(24/25 quantitative claims confirmed by ≥2 independent sources; 1 refuted). These are the
values encoded in [`js/LifeCycle.js`](js/LifeCycle.js) (`STRAINS` + the `DAUER` constant)
and used by the dauer logic in [`js/plateUI.js`](js/plateUI.js).*

## Summary

Dauer is a stress-resistant, **non-feeding, non-aging** alternative third larval stage.
The decision integrates **three environmental cues** — population-density **pheromone
(ascarosides)**, **food (E. coli) scarcity**, and **temperature** — sensed by amphid
neurons and transduced through the **DAF-7/TGF-β** and **DAF-2/insulin-IGF-1** pathways,
converging on **DAF-16/FOXO**. The larva decides in **late L1** (L2d vs. rapid L2) and
**commits irreversibly at the L2d molt**.

## Table 1 — Strain → dauer phenotype

| Strain | Gene / role | Daf class | Dauer behavior | Encoded in app |
|---|---|---|---|---|
| **N2** (Bristol) | wild-type | facultative | No dauer at ≤25 °C with food; small fraction at **27 °C** (sufficient alone, no pheromone needed); stress → dauer | `dafClass:'wild'`, `dauerTempPartial:[27]` |
| **dpy-13** (e184) | collagen | facultative | Normal (N2-like) | `dafClass:'wild'` |
| **eat-2** (ad465) | nAChR / DR | facultative | Normal | `dafClass:'wild'` |
| **daf-2** (e1370) | insulin/IGF-1 receptor | **Daf-c** (ts) | ~100% dauer at **25 °C**; reduced at 20 °C (~15% commonly cited for e1370, allele/assay-dependent — ~1% for some ts alleles); kept at 15 °C. **Strong/null alleles arrest non-conditionally & don't recover.** | `dafClass:'daf-c'`, `dauerTemps:[25]`, `dauerTempPartial:[20]` |
| **daf-7** (e1372) | TGF-β ligand (ASI) | **Daf-c** (ts) | ~100% at 25 °C, dauers form by **~48 h**; reduced at 20/15 °C | `dafClass:'daf-c'`, `dauerTemps:[25]` |
| **daf-1** (m40) | TGF-β type-I receptor | **Daf-c** (ts) | High dauer at 25 °C, reduced at 20/15 °C | `dafClass:'daf-c'`, `dauerTemps:[25]` |
| **daf-16** (mu86) | FOXO TF | **Daf-d** | **Cannot form dauer**; suppresses daf-2 / age-1 Daf-c | `dafClass:'daf-d'`, `dauerTemps:[]` |
| **daf-3** (e1376) | Co-Smad | **Daf-d** | Cannot form dauer; suppresses TGF-β-branch Daf-c (daf-7/daf-1) | `dafClass:'daf-d'` |
| **daf-5** (e1386) | Sno/Ski | **Daf-d** | Cannot form dauer; suppresses TGF-β-branch Daf-c | `dafClass:'daf-d'` |
| **age-1** (hx546) | PI3K | facultative* | Weak hx546 allele ≈ normal. *Strong/null age-1 (= daf-23) is **non-conditional Daf-c**, suppressed by daf-16. | `dafClass:'wild'`, `dauerTempPartial:[27]` |

`daf-2(e1370)` reversal note: an earlier build modelled daf-2 as non-dauer "per lab config."
The verified biology is that daf-2 is a canonical Daf-c mutant, so it now forms dauer in the
sim. If your lab needs it excluded, set its `dafClass` back to `'wild'` (or `'daf-d'`).

## Table 2 — Condition → effect / threshold

| Condition | Effect | Quantitative threshold |
|---|---|---|
| **Crowding pheromone** (ascarosides) | Dose-dependent dauer induction; commits at L2d molt; inhibits recovery | Detectable >200× dilution; ≤~90% max on E. coli lawn; 100% only in liquid + limited food |
| **Food (E. coli) scarcity** | Competitively antagonizes pheromone → promotes dauer when low, recovery when high | (qualitative; exact CFU threshold = open question) |
| **Temperature (normal range)** | Higher temp ↑ dauer fraction (15→25 °C); temp-sensitive **period at the L1 molt** | curve transitions ~21 °C (high pheromone) → 25 °C (low) |
| **High temperature** | **27 °C** drives dauer far above 25 °C; sufficient **without** pheromone | `DAUER.highTempThresholdC = 27` |

## Table 3 — Quantitative dauer metrics (`DAUER` constant)

| Metric | Value | Source |
|---|---|---|
| Decision window | late **L1 → L2d**; commits at L2d molt | Golden & Riddle 1984 |
| Dauer morphogenesis (L2d→dauer molt) | **~11–12 h at 25 °C** (vs 1–2 h normal molts) | WormBook NBK535516 |
| Time-to-dauer at 25 °C | daf-7 **~48 h**, daf-2 **~80 h** | WormBook NBK535516 |
| Survival without food | months, **up to ~4 months** (non-aging) | Klass & Hirsh 1976; Golden & Riddle 1984 |
| Recovery commitment | **50–60 min** after reaching food (23 °C) | Golden & Riddle 1984 |
| Recovery → feeding | within **2–3 h** | Golden & Riddle 1984; WormBook |
| Temp-downshift recovery | 10 h 25→15 °C downpulse → ~50% recovery | Golden & Riddle 1984 |
| Hallmarks | non-feeding (buccal plug), radially constricted, SDS-resistant (1% SDS ~30 min) | WormBook NBK535516 |
| L1-arrest survival (Daf-defective, can't dauer) | ~1–2 weeks (`l1ArrestSurvivalHrs = 288 h`) | WormBook |

N2 timing reference (25 °C, synchronized L1 on food): molts at **11 / 18 / 24 / 32 h**,
egg-laying at **42 h**; pheromone delays ~6 h (molts 11.5 / 24 / 29 / 39 h).

## Caveats / disagreements flagged

- **daf-2 20 °C penetrance is contested:** ~1% for some ts alleles (Pierce et al. 2001) vs
  ~15% commonly cited for e1370 — allele/assay-dependent.
- **27 °C wild-type penetrance:** WormBook "small proportion" vs Ailion & Thomas "very
  strongly induced" — real protocol/strain disagreement, not an error.
- **Strong vs weak alleles:** strong/null daf-2 and age-1/daf-23 arrest non-conditionally
  (temp-independent, non-recovering); weak/ts alleles (e1370) are conditional.
- **REFUTED (not used):** "daf-7(e1372) forms 22.5% dauers at 20 °C" failed verification (1–2 votes).
- **Pheromone = a mixture of ascarosides;** some components are dauer-*inhibitory* at high
  concentration. The app's single food/crowding scalar is a simplification.

## Open questions (would sharpen the model)

1. Dose-response curves (dauer % vs ascr#2/ascr#3 concentration) at fixed food + temp.
2. Quantitative food/bacterial-density threshold where the food signal flips suppress↔permit.
3. Full temperature × pheromone × food response surface for N2 across 15/20/25/27 °C.
4. Dauer survival/mortality curves (fraction alive vs weeks) and their temperature dependence.

## Sources (primary unless noted)

- Golden & Riddle 1984 — PMID 6706004 / WormAtlas PDF (foundational quantitative timing)
- Ailion & Thomas 2000 — *Genetics* 156:1047 (PMID 11063684) (27 °C trigger)
- Gottlieb & Ruvkun 1994 — PMC1205929 (daf-2/daf-23 non-conditional; daf-16 epistasis)
- Pierce et al. 2001 — PMC312654 (ts allele arrest rates; DAF-2 + amphid integration)
- WormBook dauer chapter — NBK535516 (review; strain penetrance, hallmarks, timing)
- WormBook TGF-β signalling chapter (Daf-c vs Daf-d branch genetics)
- Klass & Hirsh 1976 (dauer longevity/non-aging)
