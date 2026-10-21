/* Live infographics tab — Vice Chairman race */
const Infographics = {
  async render(el) {
    const renderData = async (scrollTop) => {
      const data = await H.api('/api/admin/overview');
      const t = data.totals;
      const cands = data.candidates;
      const valid = t.valid || 0;
      const leader = cands.find(c => c.id === data.leaderId) || cands[0];
      const second = cands[1];
      const areasDecided = data.areas.filter(a => a.reported > 0);
      const pending = t.pending;

      el.innerHTML = `
        <div class="page-head">
          <div><h1>Infographics — Vice Chairman Race</h1><p>Live visualisation of accumulated votes. Updated automatically as branch results come in${t.lastUpdated ? ' · last entry ' + H.timeAgo(t.lastUpdated) : ''}.</p></div>
          <div class="head-actions"><button class="btn" id="infoPrint">Print</button><span class="live-badge" style="background:var(--green-soft);color:var(--green-dark);border-color:#bfe3cd"><i style="background:var(--green)"></i> Live</span></div>
        </div>

        <div class="leader-banner" style="margin-bottom:16px">
          <img src="${leader.photo}" alt="${H.esc(leader.short)}" width="58" height="72" decoding="async">
          <div>
            <div class="lb-label">${valid ? 'Currently leading' : 'Awaiting results'}</div>
            <div class="lb-name">${valid ? H.esc(leader.short) : '—'}</div>
            <div class="lb-sub">${valid ? `${H.pct(leader.share)} of valid votes · Candidate ${leader.id}` : 'No results have been entered yet'}</div>
          </div>
          <div class="lb-nums">
            <b>${H.fmt(valid ? leader.votes : 0)}</b>
            <span>votes accumulated</span>
            <div style="margin-top:8px;font-size:11.5px;color:#c3ccd5">${valid ? 'Margin over 2nd: ' + H.fmt(data.margin) : ''}</div>
          </div>
        </div>

        <div class="big-numbers">
          <div class="card big-stat"><div class="bs-label">Votes cast</div><div class="bs-value" style="color:var(--ink)">${H.fmt(t.cast)}</div><div class="bs-sub">from ${H.fmt(t.reported)} of ${H.fmt(t.branches)} branches</div></div>
          <div class="card big-stat"><div class="bs-label">Valid votes</div><div class="bs-value" style="color:var(--green)">${H.fmt(valid)}</div><div class="bs-sub">${H.pct(100 - t.rejectedShare, 1)} of votes cast</div></div>
          <div class="card big-stat"><div class="bs-label">Rejected ballots</div><div class="bs-value" style="color:var(--gold)">${H.fmt(t.rejected)}</div><div class="bs-sub">${H.pct(t.rejectedShare)} of votes cast</div></div>
          <div class="card big-stat"><div class="bs-label">Branches reported</div><div class="bs-value" style="color:var(--red)">${H.pct(t.reportingRate, 0)}</div><div class="bs-sub">${H.fmt(pending)} still pending</div></div>
        </div>

        <div class="grid two" style="margin-bottom:16px">
          <div class="card">
            <div class="card-head"><div><h2>Share of accumulated valid votes</h2><div class="sub">Each candidate's percentage of all valid votes counted so far</div></div></div>
            <div class="donut-wrap">
              ${Charts.donut(cands.map(c => ({ value: c.votes, color: c.color })), {
                size: 240, thickness: 34,
                center: `<div style="font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--slate-2);font-weight:800">Valid votes</div>
                         <div style="font-size:30px;font-weight:800;letter-spacing:-.6px">${H.fmt(valid)}</div>
                         <div style="font-size:11.5px;color:var(--slate)">100%</div>`
              })}
              <div class="share-list">
                ${cands.map(c => `
                  <div class="share-item">
                    <div class="si-top"><span><span class="dotc" style="background:${c.color}"></span>${H.esc(c.short)}</span><span>${H.pct(c.share)}</span></div>
                    <div class="si-bar"><i style="width:${c.share}%;background:${c.color}"></i></div>
                    <div class="tiny muted" style="margin-top:4px">${H.fmt(c.votes)} votes · ${H.pct(c.shareOfCast)} of votes cast</div>
                  </div>`).join('')}
              </div>
            </div>
          </div>

          <div class="card">
            <div class="card-head"><div><h2>Standings</h2><div class="sub">Current accumulated position</div></div></div>
            <div class="card-pad" style="padding-top:10px">
              <table class="rank-table">
                <thead><tr><th>#</th><th>Candidate</th><th class="num">Votes</th><th class="num">% valid</th></tr></thead>
                <tbody>
                  ${cands.map(c => `<tr>
                    <td><b style="color:${c.rank === 1 ? 'var(--green)' : 'var(--slate-2)'}">${c.rank}</b></td>
                    <td><div style="display:flex;align-items:center;gap:9px"><img src="${c.photo}" style="width:28px;height:34px;border-radius:6px;object-fit:cover" alt=""><div><b style="font-size:12.5px">${H.esc(c.short)}</b><div class="tiny muted">Candidate ${c.id}</div></div></div></td>
                    <td class="num"><b>${H.fmt(c.votes)}</b></td>
                    <td class="num">${H.pct(c.share)}</td>
                  </tr>`).join('')}
                </tbody>
              </table>
              <div class="notice info" style="margin:14px 0 0">
                <div><b>Majority mark:</b> ${H.fmt(data.majorityThreshold)} valid votes (50% + 1 of votes counted so far).
                ${valid ? (leader.votes >= data.majorityThreshold && !data.tied ? `${H.esc(leader.short)} has passed it — but ${H.fmt(pending)} branch${pending === 1 ? '' : 'es'} are still pending.` : `No candidate has reached it yet — ${H.fmt(pending)} branch${pending === 1 ? '' : 'es'} pending.`) : 'Waiting for the first branch result.'}</div>
              </div>
            </div>
          </div>
        </div>

        <div class="grid two">
          <div class="card">
            <div class="card-head"><div><h2>Leading candidate by electoral area</h2><div class="sub">${areasDecided.length} of ${data.areas.length} electoral areas have reported</div></div></div>
            <div class="card-pad">
              <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(158px,1fr));gap:10px">
                ${data.areas.map(a => {
                  if (!a.reported) return `<div style="border:1px dashed var(--line);border-radius:10px;padding:10px;background:#fbfcfb"><div class="tiny" style="font-weight:700">${H.esc(a.area)}</div><div class="tiny muted">No results yet</div></div>`;
                  const w = data.candidates.find(c => c.id === a.winnerId);
                  const rowTotal = a.c1 + a.c2 + a.c3;
                  return `<div style="border:1px solid var(--line);border-radius:10px;padding:10px;border-left:4px solid ${w ? w.color : 'var(--line)'}">
                    <div class="tiny" style="font-weight:700;line-height:1.3">${H.esc(a.area)}</div>
                    <div class="tiny" style="color:${w ? w.color : 'var(--slate)'};font-weight:800;margin-top:4px">${w ? H.esc(w.initials) : '—'}</div>
                    <div class="tiny muted">${H.fmt(a.winnerVotes)} of ${H.fmt(rowTotal)} · ${a.reported}/${a.branches} br.</div>
                  </div>`;
                }).join('')}
              </div>
            </div>
          </div>

          <div class="card">
            <div class="card-head"><div><h2>Vote distribution</h2><div class="sub">Accumulated votes and share of votes cast</div></div></div>
            <div class="card-pad">
              ${cands.map(c => `<div style="margin-bottom:16px">
                <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:5px">
                  <b style="font-size:12.5px">${H.esc(c.short)}</b>
                  <span class="tiny muted mono">${H.fmt(c.votes)} votes · ${H.pct(c.shareOfCast)} of cast</span>
                </div>
                <div style="height:16px;border-radius:99px;background:#eef1f4;overflow:hidden">
                  <i style="display:block;height:100%;width:${c.shareOfCast}%;background:${c.color};border-radius:99px;transition:width .8s"></i>
                </div>
              </div>`).join('')}
              <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:5px">
                <b style="font-size:12.5px">Rejected ballots</b>
                <span class="tiny muted mono">${H.fmt(t.rejected)} · ${H.pct(t.rejectedShare)}</span>
              </div>
              <div style="height:16px;border-radius:99px;background:#eef1f4;overflow:hidden">
                <i style="display:block;height:100%;width:${t.rejectedShare}%;background:var(--gold);border-radius:99px"></i>
              </div>
              <div class="tiny muted" style="margin-top:14px">Total votes cast across reported branches: <b>${H.fmt(t.cast)}</b> · rejected ballots are included in votes cast but excluded from valid votes.</div>
            </div>
          </div>
        </div>`;
      if (scrollTop) window.scrollTo(0, scrollTop);
    };
    await renderData(0);
    return { refresh: () => renderData(window.scrollY) };
  }
};
