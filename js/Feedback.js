/**
 * Feedback.js — post-export star-rating feedback modal.
 * 5 science-focused metrics, comment box, stored locally.
 */

const STORE_KEY = 'wt_feedback_history';

const METRICS = [
  { id: 'timing',    icon: '⏱', q: 'How accurate are the developmental stage timing predictions?' },
  { id: 'tracking',  icon: '🔬', q: 'How well does the worm tracker perform on your videos?' },
  { id: 'usability', icon: '📱', q: 'How easy is WormTrace to use in the lab?' },
  { id: 'plates',    icon: '🧫', q: 'How useful is the plate development tracking over time?' },
  { id: 'recommend', icon: '🚀', q: 'How likely are you to recommend WormTrace to a colleague?' },
];

let _pendingRatings = {};

export function showFeedback(context = 'export') {
  _pendingRatings = {};

  const overlay = document.createElement('div');
  overlay.id = 'feedbackModal';
  overlay.style.cssText =
    'position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:1500;' +
    'display:flex;align-items:flex-end;justify-content:center;padding:0;' +
    'animation:wlcIn 0.3s cubic-bezier(0.34,1.56,0.64,1)';

  overlay.innerHTML = `
    <div style="background:#111827;border-top:2px solid #1e2a3a;border-radius:18px 18px 0 0;
      width:100%;max-width:480px;padding:22px 20px 32px;max-height:92vh;overflow-y:auto">

      <!-- Header -->
      <div style="text-align:center;margin-bottom:20px">
        <div style="font-size:28px;margin-bottom:8px">🙏</div>
        <h2 style="font-size:17px;font-weight:800;color:#e2e8f0;margin-bottom:6px">
          WormTrace is free — your feedback keeps it improving!
        </h2>
        <p style="font-size:12px;color:#64748b;line-height:1.5">
          Rate each area below. Takes 30 seconds and directly shapes future updates.
        </p>
      </div>

      <!-- Metrics -->
      <div id="fbMetrics" style="display:flex;flex-direction:column;gap:14px;margin-bottom:20px"></div>

      <!-- Comment -->
      <div style="margin-bottom:18px">
        <label style="font-size:12px;color:#94a3b8;display:block;margin-bottom:6px;font-weight:600">
          💬 Any suggestions or issues? (optional)
        </label>
        <textarea id="fbComment" placeholder="What would make WormTrace more useful for your research?"
          style="width:100%;background:#0f172a;border:1px solid #1e2a3a;color:#e2e8f0;
          border-radius:8px;padding:10px;font-size:14px;min-height:80px;resize:vertical;
          font-family:inherit;line-height:1.5"></textarea>
      </div>

      <!-- Buttons -->
      <div style="display:flex;gap:10px">
        <button id="fbSkip" style="flex:1;padding:12px;border-radius:10px;background:#1e2a3a;
          border:1px solid #2d3748;color:#64748b;font-size:13px;font-weight:600;cursor:pointer;min-height:44px">
          Skip
        </button>
        <button id="fbSubmit" style="flex:2;padding:12px;border-radius:10px;background:#00d4aa;
          border:none;color:#000;font-size:14px;font-weight:800;cursor:pointer;min-height:44px">
          Submit Feedback ✓
        </button>
      </div>
    </div>`;

  document.body.appendChild(overlay);
  _injectStarStyles();

  // Render metric rows
  const container = document.getElementById('fbMetrics');
  container.innerHTML = METRICS.map(m => `
    <div style="background:#0f172a;border:1px solid #1e2a3a;border-radius:10px;padding:12px">
      <div style="font-size:12px;color:#94a3b8;margin-bottom:8px;line-height:1.4">
        <span style="margin-right:6px">${m.icon}</span>${m.q}
      </div>
      <div class="fb-stars" data-metric="${m.id}">
        ${[1,2,3,4,5].map(n =>
          `<button class="fb-star" data-val="${n}" data-metric="${m.id}">☆</button>`
        ).join('')}
      </div>
    </div>`).join('');

  // Star click handlers
  overlay.querySelectorAll('.fb-star').forEach(btn => {
    btn.addEventListener('click', () => {
      const metric = btn.dataset.metric;
      const val    = +btn.dataset.val;
      _pendingRatings[metric] = val;

      // Update star display
      overlay.querySelectorAll(`.fb-star[data-metric="${metric}"]`).forEach(s => {
        s.textContent = +s.dataset.val <= val ? '★' : '☆';
        s.classList.toggle('filled', +s.dataset.val <= val);
      });
    });
  });

  // Star hover effects
  overlay.querySelectorAll('.fb-stars').forEach(row => {
    row.addEventListener('mouseleave', () => {
      const metric = row.dataset.metric;
      const rating = _pendingRatings[metric] ?? 0;
      row.querySelectorAll('.fb-star').forEach(s => {
        s.textContent = +s.dataset.val <= rating ? '★' : '☆';
      });
    });
    row.querySelectorAll('.fb-star').forEach(btn => {
      btn.addEventListener('mouseenter', () => {
        const val = +btn.dataset.val;
        row.querySelectorAll('.fb-star').forEach(s => {
          s.textContent = +s.dataset.val <= val ? '★' : '☆';
        });
      });
    });
  });

  const close = () => {
    overlay.style.animation = 'wlcOut 0.25s ease-in forwards';
    setTimeout(() => overlay.remove(), 250);
  };

  document.getElementById('fbSkip').onclick = close;

  document.getElementById('fbSubmit').onclick = () => {
    const comment = document.getElementById('fbComment').value.trim();
    const entry = {
      timestamp: new Date().toISOString(),
      context,
      ratings: { ..._pendingRatings },
      comment,
    };
    _save(entry);
    close();
  };

  // Tap outside to dismiss
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
}

export function getFeedbackHistory() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY) || '[]'); } catch { return []; }
}

export function getLatestFeedback() {
  const hist = getFeedbackHistory();
  return hist.length ? hist[hist.length - 1] : null;
}

/** Format feedback data for inclusion in Excel export. */
export function feedbackToExcelRows() {
  const hist = getFeedbackHistory();
  if (!hist.length) return null;

  const metricLabels = {
    timing:    'Stage timing accuracy',
    tracking:  'Worm tracking quality',
    usability: 'Ease of use',
    plates:    'Plate tracking usefulness',
    recommend: 'Likelihood to recommend',
  };

  const th = t => `<th style="background:#1e3a5f;color:#fff;padding:5px 10px;border:1px solid #ccc">${t}</th>`;
  const td = t => `<td style="padding:4px 10px;border:1px solid #ddd">${t ?? ''}</td>`;

  let rows = `<tr>${th('Date')}${th('Context')}${th('Stage Timing')}${th('Worm Tracking')}
    ${th('Ease of Use')}${th('Plate Tracking')}${th('Recommend')}${th('Comment')}</tr>`;

  for (const e of hist) {
    const r = e.ratings ?? {};
    const stars = n => n ? '★'.repeat(n) + '☆'.repeat(5 - n) : '—';
    rows += `<tr>
      ${td(e.timestamp?.split('T')[0] ?? '')}
      ${td(e.context ?? '')}
      ${td(stars(r.timing))}${td(stars(r.tracking))}
      ${td(stars(r.usability))}${td(stars(r.plates))}${td(stars(r.recommend))}
      ${td(e.comment ?? '')}
    </tr>`;
  }

  return `<table>${rows}</table>`;
}

function _save(entry) {
  const hist = getFeedbackHistory();
  hist.push(entry);
  try { localStorage.setItem(STORE_KEY, JSON.stringify(hist)); } catch {}
}

function _injectStarStyles() {
  if (document.getElementById('fb-styles')) return;
  const s = document.createElement('style');
  s.id = 'fb-styles';
  s.textContent = `
.fb-stars { display:flex; gap:6px; }
.fb-star {
  font-size:24px; background:none; border:none; color:#475569;
  cursor:pointer; padding:0; width:auto; min-height:unset;
  transition:color 0.1s,transform 0.1s; line-height:1;
}
.fb-star:hover, .fb-star.filled { color:#f59e0b; transform:scale(1.15); }
  `;
  document.head.appendChild(s);
}
