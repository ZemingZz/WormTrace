# C. elegans OP50 Food Consumption — Research Notes for WormTrace

*Compiled 2026-06-02 via a multi-source deep-research + adversarial-verification pass
(20/25 quantitative claims confirmed by ≥2 sources; **5 refuted**). Encoded in
[`js/LifeCycle.js`](js/LifeCycle.js) (`STAGE_FOOD_FACTOR` + the `FOOD` constant) and the
food slider in [`index.html`](index.html).*

> **Honesty note:** this topic had real evidence gaps. There is **no verified absolute
> consumption rate for worms on a solid lawn** (the validated clearance assays are in
> *liquid* culture), and several tidy conversion numbers were **refuted** (see below).
> So the app keeps its existing relative/tuned consumption model and adds only the
> verified reference values — it does **not** invent a solid-plate mL/hr figure.

## Table 1 — Plate size → typical OP50 seeding volume

| Plate | Typical seeding | Notes |
|---|---|---|
| 35 mm | ~25 µL | One published protocol (PMC7307455) |
| 60 mm (6 cm) | ~50 µL drop · up to ~200 µL spread | Range overall 10–300 µL; **lab-variable** |
| 100 mm (10 cm) | ~100 µL | WormBook maintenance (NBK19649) |

App slider (mL of seeded OP50 suspension): **0.05 mL ≈ 50 µL drop lawn**,
**0.20 mL ≈ fully spread lawn** (slider default). OP50 lawns are intentionally **thin**
(OP50 is a uracil auxotroph; growth on NGM is limited), which caps food mass.

## Table 2 — Stage → pumping rate → relative intake (`STAGE_FOOD_FACTOR`)

| Stage | Pumping rate | Relative intake (adult = 1.0) |
|---|---|---|
| Egg | none (sealed) | **0** |
| L1 | nearly adult rate | 0.12 |
| L2 | nearly adult rate | 0.25 |
| L3 | nearly adult rate | 0.45 |
| L4 | ~adult | 0.70 |
| Young adult | ~adult (plateau) | 0.90 |
| **Adult** | **200–300/min (~250 typ, ~300 max, 5 Hz)** | **1.0** |
| Dauer | none (buccal plug) | **0** |

**Key verified finding (eLife 2022, Bonnard et al., >1000 animals):** pumping **rate**
rises only *slightly* across larval stages — it is **not** the main driver of the intake
ramp. The steep stage ramp reflects **gulp volume** (pharynx/body size grows from L1 ~250 µm
to adult ~1 mm), not pumping speed. Per-worm intake does **not** scale linearly with body
length. Eggs and dauers do not feed (confirmed by 3 sources).

## Verified conversions

- **OD600 → cells:** OD600 1.0 ≈ **8×10⁸ live cells/mL** (8×10⁵/µL); strain-dependent 2×10⁷–1×10⁹.
- OP50 feeding stocks are typically **OD600 1.0–1.5**.

## ⚠ REFUTED — do NOT use these

- ❌ "60 mm plates seeded with exactly 100 µL / 10 cm with 1 mL as a single spot" (1–2).
- ❌ "6 mg/mL OP50 = 1.5×10⁸ CFU/mL (~4×10⁷ CFU/mg)" dry-mass↔CFU conversion (0–3).
- ❌ "Intake peaks at L4→young-adult and correlates with body length, R²=0.753" (1–2).
- ❌ "OD600 1.0 = 0.30–0.40 g/L dry cell weight (0.36 g/L textbook)" (0–3).
- ❌ "10 µL / 100 µL / 250 µL fixed seeding by plate size" (0–3).

→ No reliable dry-mass or CFU-per-mg conversion exists for OP50; seeding volumes are
lab-variable, not fixed constants.

## Open questions (would sharpen the model)

1. A verified **per-worm consumption rate on a solid OP50 lawn** (current assays are liquid).
2. A per-stage **pumping-rate table** (the 200–300/min figure is adult-only).
3. Quantitative **temperature × pumping** dependence (15/20/25 °C).

## Sources (primary unless noted)

- WormBook *Maintenance of C. elegans* — NBK19649 (seeding volumes, OP50 auxotrophy)
- Stroustrup-style feeding protocol — PMC7307455 (OD↔cells, concentrated lawn prep)
- Bonnard et al. 2022 — *eLife* 77252 (pumping near-constant across stages)
- WormBook *Pharyngeal system / feeding* — NBK116080, NBK126648 (adult pumping 200–300/min)
- JoVE 2024 (PMID 38465935) + Gomez-Amaro 2015 (liquid clearance assay)
- Genes & Dev 22:2149; Genetics 216:837; WormBook dauer NBK535516 (dauer non-feeding)
- Golden & Riddle 1984 (PMID 6706004) (food competitively antagonizes dauer pheromone)
