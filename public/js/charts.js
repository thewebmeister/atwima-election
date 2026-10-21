/* Lightweight SVG charts (no external libraries) */
const Charts = (() => {
  const esc = H.esc;

  function donut(segments, opts = {}) {
    const size = opts.size || 230;
    const thickness = opts.thickness || 30;
    const r = (size - thickness) / 2;
    const c = 2 * Math.PI * r;
    const total = segments.reduce((s, x) => s + (Number(x.value) || 0), 0);
    const cx = size / 2;
    let offset = 0;
    let arcs = '';
    if (total <= 0) {
      arcs = `<circle cx="${cx}" cy="${cx}" r="${r}" fill="none" stroke="#e9edf2" stroke-width="${thickness}"></circle>`;
    } else {
      segments.forEach(s => {
        const v = Number(s.value) || 0;
        if (v <= 0) return;
        const len = (v / total) * c;
        arcs += `<circle cx="${cx}" cy="${cx}" r="${r}" fill="none" stroke="${s.color}" stroke-width="${thickness}"
          stroke-dasharray="${len} ${c - len}" stroke-dashoffset="${-offset}"
          transform="rotate(-90 ${cx} ${cx})"></circle>`;
        offset += len;
      });
    }
    const center = opts.center
      ? `<div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;pointer-events:none">${opts.center}</div>`
      : '';
    return `<div class="donut-box" style="--donut-size:${size}px">
      <svg viewBox="0 0 ${size} ${size}" role="img" aria-label="Vote share chart" preserveAspectRatio="xMidYMid meet">${arcs}</svg>${center}
    </div>`;
  }

  function candidateCards(cands, totalValid) {
    return cands.map(c => {
      const share = totalValid ? (c.votes / totalValid) * 100 : 0;
      return `<div class="card cand-card">
        <div class="cand-top">
          <img class="cand-photo" src="${c.photo}" alt="${esc(c.short)}" width="34" height="42" loading="lazy" decoding="async">
          <div style="min-width:0">
            <div class="cand-name">${esc(c.short)}</div>
            <div class="cand-no">CANDIDATE NO. ${c.id}</div>
            <div class="cand-votes"><b>${H.fmt(c.votes)}</b><span>votes</span></div>
          </div>
        </div>
        <div class="cand-bar"><i style="width:${share}%;background:${c.color}"></i></div>
        <div class="cand-foot">
          <span>${H.pct(share)} of valid votes</span>
          ${c.rank === 1 && c.votes > 0 ? '<span class="chip-lead">Leading</span>' : `<span class="chip-rank">#${c.rank}</span>`}
        </div>
      </div>`;
    }).join('');
  }

  function areaRow(a) {
    const totalVotes = a.c1 + a.c2 + a.c3;
    const seg = (v, color) => totalVotes ? `<i style="width:${(v / totalVotes) * 100}%;background:${color}"></i>` : '';
    const reportPct = a.branches ? (a.reported / a.branches) * 100 : 0;
    return `<div class="area-row">
      <div class="ar-top">
        <b>${esc(a.area)}</b>
        <span class="tiny muted mono">${a.reported}/${a.branches} reported</span>
      </div>
      <div class="bar-mini"><i style="width:${reportPct}%"></i></div>
      ${totalVotes ? `<div class="ar-split">${seg(a.c1, '#036439')}${seg(a.c2, '#d20f2d')}${seg(a.c3, '#202020')}</div>` : ''}
    </div>`;
  }

  return { donut, candidateCards, areaRow };
})();
