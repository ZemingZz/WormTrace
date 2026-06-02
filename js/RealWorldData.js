/**
 * RealWorldData.js — upload, store, and compare real microscopy observations
 * against simulated developmental timelines.
 *
 * CSV format accepted:
 *   time_hours,stage_observed,worm_length_um,eggs_counted,food_pct,notes
 *   7.5,l1,255,0,98,Hatching visible
 *
 * JSON format accepted:
 *   { "dataPoints": [...same fields as above...] }
 *
 * Stored in localStorage per plate: key = 'wt_rwd_{plateId}'
 */

const RWD_PREFIX = 'wt_rwd_';

/** Full schema for a single recorded data point. */
export const POINT_SCHEMA = {
  time_hours:         { label: 'Time (hours)',        type: 'number',  unit: 'h',   required: true },
  stage_observed:     { label: 'Stage',               type: 'stage',   unit: '',    required: true },
  worm_length_um:     { label: 'Body length',         type: 'number',  unit: 'μm',  required: false },
  worm_width_um:      { label: 'Body width',          type: 'number',  unit: 'μm',  required: false },
  eggs_counted:       { label: 'Eggs counted',        type: 'integer', unit: '',    required: false },
  food_pct:           { label: 'Food estimate',       type: 'percent', unit: '%',   required: false },
  motility:           { label: 'Motility',            type: 'enum',    unit: '',    required: false,
    options: ['','active','reduced','sluggish','omega_turns','backward','static'] },
  population_density: { label: 'Worms per field',    type: 'integer', unit: '/fov',required: false },
  actual_temp_c:      { label: 'Actual temperature', type: 'number',  unit: '°C',  required: false },
  fluorescence:       { label: 'Fluorescence',        type: 'text',    unit: '',    required: false },
  notes:              { label: 'Notes',               type: 'text',    unit: '',    required: false },
};

export class RealWorldData {

  // ── Manual entry ───────────────────────────────────────────────────────────

  /** Add a single recorded data point to a plate. */
  static addPoint(plateId, point) {
    const existing = this.get(plateId) ?? [];
    const newPoint = {
      id:                 `dp_${Date.now()}_${Math.random().toString(36).slice(2,5)}`,
      recorded_at:        Date.now(),
      time_hours:         parseFloat(point.time_hours) || 0,
      stage_observed:     String(point.stage_observed ?? '').toLowerCase(),
      worm_length_um:     parseFloat(point.worm_length_um) || null,
      worm_width_um:      parseFloat(point.worm_width_um)  || null,
      eggs_counted:       parseInt(point.eggs_counted)      || 0,
      food_pct:           parseFloat(point.food_pct)        || null,
      motility:           String(point.motility ?? ''),
      population_density: parseInt(point.population_density) || null,
      actual_temp_c:      parseFloat(point.actual_temp_c)   || null,
      fluorescence:       String(point.fluorescence ?? ''),
      notes:              String(point.notes ?? ''),
    };
    existing.push(newPoint);
    existing.sort((a, b) => a.time_hours - b.time_hours);
    localStorage.setItem(RWD_PREFIX + plateId, JSON.stringify(existing));
    return newPoint;
  }

  /** Delete one data point by id. */
  static deletePoint(plateId, pointId) {
    const existing = this.get(plateId) ?? [];
    const filtered = existing.filter(p => p.id !== pointId);
    localStorage.setItem(RWD_PREFIX + plateId, JSON.stringify(filtered));
    return filtered;
  }

  /** Update a single field on an existing point. */
  static updatePoint(plateId, pointId, fields) {
    const existing = this.get(plateId) ?? [];
    const idx = existing.findIndex(p => p.id === pointId);
    if (idx < 0) return;
    Object.assign(existing[idx], fields);
    existing.sort((a, b) => a.time_hours - b.time_hours);
    localStorage.setItem(RWD_PREFIX + plateId, JSON.stringify(existing));
  }

  /** Parse and store real-world data for a plate from CSV or JSON text. */
  static import(plateId, text, filename = '') {
    const ext = filename.split('.').pop().toLowerCase();
    let points = ext === 'json' ? this._parseJSON(text) : this._parseCSV(text);
    if (!points.length) throw new Error('No valid data rows found.');
    points = points.sort((a, b) => a.time_hours - b.time_hours);
    localStorage.setItem(RWD_PREFIX + plateId, JSON.stringify(points));
    return points;
  }

  static get(plateId) {
    try { return JSON.parse(localStorage.getItem(RWD_PREFIX + plateId) || 'null'); }
    catch { return null; }
  }

  static delete(plateId) { localStorage.removeItem(RWD_PREFIX + plateId); }

  static hasData(plateId) { return !!this.get(plateId)?.length; }

  /**
   * Compare real observations to simulated stages.
   * Returns per-point: expected stage at that time, deviation in hours, correction factor.
   */
  static computeDeviations(realPoints, stages) {
    const stageIds = stages.map(s => s.id);
    return realPoints.map(pt => {
      // Find simulated stage at this real time
      const simStage = stages.find(s => pt.time_hours >= s.start && pt.time_hours < s.end)
                    ?? stages[stages.length - 1];

      // Find expected time range for the observed stage
      const expectedStage = stages.find(s => s.id === pt.stage_observed);

      let correction = 1.0;
      if (expectedStage && pt.time_hours > 0) {
        // Mid-point of expected stage vs actual observed time
        const expectedMid = expectedStage.start + expectedStage.duration / 2;
        if (expectedMid > 0) correction = pt.time_hours / expectedMid;
      }

      return {
        ...pt,
        sim_stage_id:   simStage.id,
        sim_stage_name: simStage.name,
        matches_sim:    simStage.id === pt.stage_observed,
        correction,
        deviation_hrs:  expectedStage
          ? pt.time_hours - (expectedStage.start + expectedStage.duration / 2)
          : 0,
      };
    });
  }

  /**
   * Compute per-stage timing correction factors from all observations.
   * Returns: { stage_id: avg_correction_factor }
   */
  static correctionFactors(realPoints, stages) {
    const groups = {};
    const devs = this.computeDeviations(realPoints, stages);
    for (const d of devs) {
      if (!d.stage_observed) continue;
      if (!groups[d.stage_observed]) groups[d.stage_observed] = [];
      groups[d.stage_observed].push(d.correction);
    }
    const factors = {};
    for (const [stageId, vals] of Object.entries(groups)) {
      factors[stageId] = vals.reduce((a, b) => a + b, 0) / vals.length;
    }
    return factors;
  }

  // ── Parsers ────────────────────────────────────────────────────────────────

  static _parseCSV(text) {
    const lines = text.trim().split(/\r?\n/);
    if (lines.length < 2) return [];

    // Auto-detect header
    const header = lines[0].toLowerCase().split(',').map(h => h.trim().replace(/"/g, ''));
    const col = name => header.indexOf(name);

    const tCol = col('time_hours') >= 0 ? col('time_hours') : 0;
    const sCol = col('stage_observed');
    const lCol = col('worm_length_um');
    const eCol = col('eggs_counted');
    const fCol = col('food_pct');
    const nCol = col('notes');

    const points = [];
    for (let i = 1; i < lines.length; i++) {
      const cells = lines[i].split(',').map(c => c.trim().replace(/"/g, ''));
      if (!cells[tCol]) continue;
      const hrs = parseFloat(cells[tCol]);
      if (isNaN(hrs)) continue;
      points.push({
        time_hours:     hrs,
        stage_observed: sCol >= 0 ? cells[sCol]?.toLowerCase() ?? '' : '',
        worm_length_um: lCol >= 0 ? parseFloat(cells[lCol]) || null : null,
        eggs_counted:   eCol >= 0 ? parseInt(cells[eCol])   || 0   : 0,
        food_pct:       fCol >= 0 ? parseFloat(cells[fCol]) || null : null,
        notes:          nCol >= 0 ? cells[nCol] ?? '' : '',
      });
    }
    return points;
  }

  static _parseJSON(text) {
    const obj = JSON.parse(text);
    const arr = Array.isArray(obj) ? obj : (obj.dataPoints ?? obj.data ?? []);
    return arr.map(p => ({
      time_hours:     parseFloat(p.time_hours ?? p.t ?? 0),
      stage_observed: String(p.stage_observed ?? p.stage ?? '').toLowerCase(),
      worm_length_um: parseFloat(p.worm_length_um ?? p.length ?? null) || null,
      eggs_counted:   parseInt(p.eggs_counted ?? p.eggs ?? 0)   || 0,
      food_pct:       parseFloat(p.food_pct ?? p.food ?? null)  || null,
      notes:          String(p.notes ?? ''),
    })).filter(p => !isNaN(p.time_hours));
  }

  // ── Template CSV download ──────────────────────────────────────────────────

  static downloadTemplate() {
    const csv = [
      'time_hours,stage_observed,worm_length_um,eggs_counted,food_pct,notes',
      '0,egg,50,0,100,Eggs laid on plate',
      '7.5,l1,255,0,98,Hatching observed',
      '22.3,l2,360,0,92,L2 molt visible',
      '31.3,l3,480,0,86,Gonad elongating',
      '38.6,l4,630,0,79,Crescent (vulva) visible',
      '50,young_adult,980,0,71,Adult size reached',
      '61,adult,1000,8,64,Egg laying observed',
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = Object.assign(document.createElement('a'), { href: url, download: 'wormtrace_template.csv' });
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
}
