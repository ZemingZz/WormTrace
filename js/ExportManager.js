/**
 * ExportManager.js — multi-plate Excel export and training dataset download.
 */

import { RealWorldData }   from './RealWorldData.js?v=149';
import { MLEngine }        from './MLEngine.js?v=149';
import { feedbackToExcelRows } from './Feedback.js?v=149';
import { STRAINS, getStages, getCurrentStage, fmtHours } from './LifeCycle.js?v=149';

export class ExportManager {
  constructor(plateTracker) {
    this.pt = plateTracker;
    this.ml = new MLEngine();
  }

  // ── Multi-plate Excel ─────────────────────────────────────────────────────

  exportMultiplePlates(plateIds) {
    const plates  = plateIds.map(id => this.pt.get(id) ?? this.pt.getBin().find(p => p.id === id)).filter(Boolean);
    const hasReal = plates.some(p => RealWorldData.hasData(p.id));

    const th = t => `<th style="background:#1e3a5f;color:#fff;padding:5px 9px;border:1px solid #ccc;white-space:nowrap">${esc(t)}</th>`;
    const td = (t, bg='') => `<td style="padding:4px 9px;border:1px solid #ddd${bg?';background:'+bg:''}">${esc(String(t??''))}</td>`;
    const h2 = t  => `<tr><td colspan="10" style="background:#0f2744;color:#00d4aa;font-size:13px;font-weight:bold;padding:7px 10px;border:1px solid #ccc">${esc(t)}</td></tr>`;

    let html = excelHeader();

    // ── Cover sheet ──────────────────────────────────────────────────────────
    html += `<p style="font-size:18px;font-weight:bold;color:#0f2744">WormTrace — Batch Plate Export</p>
      <p style="color:#666">Generated: ${new Date().toLocaleString()} · ${plates.length} plate(s)</p><br>
      <table>`;

    html += h2(`Plate Summary (${plates.length} plates)`);
    html += `<tr>${th('Plate')}${th('Strain')}${th('Temp')}${th('Worms')}${th('Inoculated')}${th('Elapsed')}${th('Current Stage')}${th('Food %')}${th('Eggs')}${th('Real Data')}</tr>`;

    for (const p of plates) {
      const strain = STRAINS[p.strainId] ?? STRAINS.N2;
      const hrs    = this.pt.elapsedHoursAny?.(p.id) ?? this.pt.elapsedHours?.(p.id) ?? 0;
      const { stage } = getCurrentStage(hrs || 0, p.strainId, p.tempC);
      const foodPct = this.pt.foodPercent(p.id).toFixed(0);
      const eggs    = this.pt.totalEggs(p.id);
      const hasRD   = RealWorldData.hasData(p.id);
      html += `<tr>
        ${td(p.name)}${td(strain.label.split('—')[0].trim())}
        ${td(p.tempC+'°C')}${td(p.wormCount??1)}
        ${td(p.inoculatedAt ? new Date(p.inoculatedAt).toLocaleString() : 'Not started')}
        ${td(fmtHours(hrs))}${td(stage.icon+' '+stage.name)}
        ${td(foodPct+'%', foodPct<20?'#fff3cd':'')}${td(eggs)}
        ${td(hasRD ? '✓ Yes' : '⚠ No real data', hasRD?'':'#fff3cd')}
      </tr>`;
    }

    if (!hasReal) {
      html += `<tr><td colspan="10" style="background:#fff3cd;color:#856404;padding:8px 10px;border:1px solid #ccc;font-weight:bold">
        ⚠ No real-world observation data uploaded for any plate. Use "Upload Real Data" per plate to enable ML comparison and improve accuracy.
      </td></tr>`;
    }

    html += '</table><br>';

    // ── Per-plate detail sections ─────────────────────────────────────────────
    for (const p of plates) {
      const strain   = STRAINS[p.strainId] ?? STRAINS.N2;
      const stages   = getStages(p.strainId, p.tempC);
      const hrs      = this.pt.elapsedHoursAny?.(p.id) ?? this.pt.elapsedHours?.(p.id) ?? 0;
      const { stage: cur } = getCurrentStage(hrs || 0, p.strainId, p.tempC);
      const realData = RealWorldData.get(p.id) ?? [];
      const hasRD    = realData.length > 0;

      html += `<table><tr><td colspan="6" style="background:#071a30;color:#60a5fa;font-size:15px;font-weight:bold;padding:10px;border:1px solid #ccc">
        📋 ${esc(p.name)} — ${strain.label.split('—')[0].trim()} @ ${p.tempC}°C
      </td></tr>`;

      // Basic info
      html += h2('Plate Settings');
      const info = [
        ['Strain',strain.label],['Temperature',p.tempC+'°C'],
        ['Worm Count',p.wormCount??1],['Initial Food',((p.initialFood??0.5).toFixed(1))+' ml'],
        ['Consumption Rate',p.consumptionRate??'standard'],
        ['Food Remaining',this.pt.foodPercent(p.id).toFixed(1)+'%'],
        ['Inoculated',p.inoculatedAt ? new Date(p.inoculatedAt).toLocaleString() : '—'],
        ['Starting Stage',p.startingStageId??'egg'],
        ['Elapsed (developmental)',fmtHours(hrs)],
        ['Current Stage',cur.icon+' '+cur.name],
        ['Total Eggs',this.pt.totalEggs(p.id)],['Notes',p.notes??''],
      ];
      for (const [k,v] of info) html += `<tr>${th(k)}${td(v)}</tr>`;

      // Expected timeline
      html += h2('Expected Development Timeline');
      html += `<tr>${th('Stage')}${th('Start (h)')}${th('End (h)')}${th('Duration (h)')}${th('Description')}</tr>`;
      for (const s of stages) {
        html += `<tr>${td(s.icon+' '+s.name)}${td(s.start.toFixed(1))}${td(s.end.toFixed(1))}${td(s.duration.toFixed(1))}${td(s.description)}</tr>`;
      }

      // Real-world data + comparison
      if (hasRD) {
        const devs = RealWorldData.computeDeviations(realData, stages);
        html += h2('Real-World Observations vs Simulated (Comparison)');
        html += `<tr>${th('Time (h)')}${th('Real Stage')}${th('Sim Stage')}${th('Match?')}${th('Deviation (h)')}${th('Correction Factor')}${th('Length (μm)')}${th('Eggs')}${th('Food %')}${th('Notes')}</tr>`;
        for (const d of devs) {
          const match = d.matches_sim;
          html += `<tr>
            ${td(d.time_hours.toFixed(1))}
            ${td(d.stage_observed)}
            ${td(d.sim_stage_id)}
            ${td(match?'✓':'✗', match?'':'#f8d7da')}
            ${td(d.deviation_hrs.toFixed(2), Math.abs(d.deviation_hrs)>2?'#fff3cd':'')}
            ${td(d.correction.toFixed(3))}
            ${td(d.worm_length_um??'—')}${td(d.eggs_counted??0)}${td(d.food_pct??'—')}${td(d.notes??'')}
          </tr>`;
        }

        // Correction factors
        const factors = RealWorldData.correctionFactors(realData, stages);
        html += h2('Learned Correction Factors (Real ÷ Predicted)');
        html += `<tr>${th('Stage')}${th('Correction Factor')}${th('Interpretation')}</tr>`;
        for (const [sid, f] of Object.entries(factors)) {
          const interp = f > 1.1 ? 'Worms developing slower than model predicts'
                       : f < 0.9 ? 'Worms developing faster than model predicts'
                       : 'Matches model well';
          html += `<tr>${td(sid)}${td(f.toFixed(3), f>1.1?'#fff3cd':f<0.9?'#d1ecf1':'')}${td(interp)}</tr>`;
        }
      } else {
        html += h2('Real-World Data');
        html += `<tr><td colspan="6" style="background:#fff3cd;color:#856404;padding:8px;border:1px solid #ccc">
          ⚠ No real-world data uploaded for this plate. Upload a CSV via "Upload Real Data" to enable ML comparison.
        </td></tr>`;
      }

      // Observations
      if (p.observations.length) {
        html += h2('Lab Observations');
        html += `<tr>${th('Timestamp')}${th('Hours In')}${th('Stage')}${th('Note')}</tr>`;
        for (const obs of p.observations) {
          const oH = p.inoculatedAt ? (((obs.time-p.inoculatedAt)/3.6e6)+(p.stageStartOffset??0)).toFixed(1) : '—';
          html += `<tr>${td(new Date(obs.time).toLocaleString())}${td(oH)}${td(obs.stageId??'—')}${td(obs.note??'')}</tr>`;
        }
      }

      // Egg counts
      if (p.eggCounts.length) {
        html += h2('Egg Count Log');
        html += `<tr>${th('Timestamp')}${th('Hours In')}${th('Count')}${th('Cumulative')}</tr>`;
        for (const ec of p.eggCounts) {
          const eH = p.inoculatedAt ? (((ec.time-p.inoculatedAt)/3.6e6)+(p.stageStartOffset??0)).toFixed(1) : '—';
          html += `<tr>${td(new Date(ec.time).toLocaleString())}${td(eH)}${td(ec.count)}${td(ec.cumulative)}</tr>`;
        }
      }

      html += '</table><br><br>';
    }

    // ── Feedback sheet ────────────────────────────────────────────────────────
    const fbRows = feedbackToExcelRows();
    if (fbRows) {
      html += `<h2 style="color:#0f2744;font-size:15px;margin:10px 0 6px">User Feedback & Ratings</h2>
        <p style="font-size:11px;color:#666;margin-bottom:8px">Collected in-app feedback for WormTrace improvement.</p>
        ${fbRows}<br>`;
    } else {
      html += `<p style="font-size:11px;color:#888;margin:8px 0">
        No feedback submitted yet. Use the in-app feedback option after exporting to help improve WormTrace.</p>`;
    }

    html += '</body></html>';
    download(html, `WormTrace_${plates.length}plates_${datestamp()}.xls`, 'application/vnd.ms-excel');
  }

  // ── Training dataset JSON ─────────────────────────────────────────────────

  exportTrainingDataset(plateIds) {
    const allPlates = [
      ...this.pt.getAll(),
      ...this.pt.getBin(),
    ];
    const filtered = plateIds === 'all'
      ? allPlates
      : allPlates.filter(p => plateIds.includes(p.id));

    const dataset = this.ml.exportTrainingDataset(filtered);
    download(JSON.stringify(dataset, null, 2), `WormTrace_ML_dataset_${datestamp()}.json`, 'application/json');
    return dataset.rows.length;
  }

  // ── Contribution package ──────────────────────────────────────────────────

  exportContribution(plateIds) {
    const allPlates = [...this.pt.getAll(), ...this.pt.getBin()];
    const filtered  = plateIds === 'all' ? allPlates : allPlates.filter(p => plateIds.includes(p.id));
    const pkg = this.ml.exportContributionPackage(filtered);
    download(JSON.stringify(pkg, null, 2), `WormTrace_contribution_${datestamp()}.json`, 'application/json');
    return pkg.plates.length;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function datestamp() { return new Date().toISOString().split('T')[0]; }
function excelHeader() {
  return `<html xmlns:o="urn:schemas-microsoft-com:office:office"
    xmlns:x="urn:schemas-microsoft-com:office:excel"
    xmlns="http://www.w3.org/TR/REC-html40">
    <head><meta charset="UTF-8">
    <style>table{border-collapse:collapse;font-family:Arial,sans-serif;font-size:11px}
    body{font-family:Arial,sans-serif}</style></head><body>`;
}
function download(content, filename, type) {
  const blob = new Blob([content], { type });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
