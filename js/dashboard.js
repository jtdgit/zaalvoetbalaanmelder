// ──────────────────────────────────────────────
//  VoetbalAanmelder — Dashboard Logic
// ──────────────────────────────────────────────

const Dashboard = (() => {
  const $ = s => document.querySelector(s);

  function init() {
    DataStore.seedAlsLeeg();
    initDarkMode();
    bindEvents();
    render();
  }

  // ── Dark mode ─────────────────────────────────
  function initDarkMode() {
    const saved = localStorage.getItem('va_darkmode');
    if (saved === 'true') {
      document.documentElement.setAttribute('data-theme', 'dark');
      $('#darkIcon').textContent = '☀️';
    }
  }

  function toggleDarkMode() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    if (isDark) {
      document.documentElement.removeAttribute('data-theme');
      $('#darkIcon').textContent = '🌙';
      localStorage.setItem('va_darkmode', 'false');
    } else {
      document.documentElement.setAttribute('data-theme', 'dark');
      $('#darkIcon').textContent = '☀️';
      localStorage.setItem('va_darkmode', 'true');
    }
  }

  // ── Events ────────────────────────────────────
  function bindEvents() {
    $('#darkToggle').addEventListener('click', toggleDarkMode);

    $('#dashTabs').addEventListener('click', e => {
      const btn = e.target.closest('.dash-tabs__btn');
      if (!btn) return;
      const view = btn.dataset.view;

      $('#dashTabs').querySelectorAll('.dash-tabs__btn').forEach(b => {
        b.classList.toggle('dash-tabs__btn--active', b === btn);
      });

      $('#viewWedstrijden').classList.toggle('dash-view--hidden', view !== 'wedstrijden');
      $('#viewSpelers').classList.toggle('dash-view--hidden', view !== 'spelers');
    });
  }

  // ── Render ────────────────────────────────────
  function render() {
    const wedstrijden = DataStore.getWedstrijden();
    const alleAanm = DataStore.getAanmeldingen();

    renderSummary(wedstrijden, alleAanm);
    renderMatchTable(wedstrijden, alleAanm);
    renderPlayerTable(wedstrijden, alleAanm);
  }

  function renderSummary(wedstrijden, aanm) {
    const aanwezig  = aanm.filter(a => a.status === 'aanwezig').length;
    const misschien = aanm.filter(a => a.status === 'misschien').length;
    const afwezig   = aanm.filter(a => a.status === 'afwezig').length;

    $('#sumWedstrijden').textContent = wedstrijden.length;
    $('#sumAanwezig').textContent    = aanwezig;
    $('#sumMisschien').textContent   = misschien;
    $('#sumAfwezig').textContent     = afwezig;
  }

  // ── Match table ───────────────────────────────
  function renderMatchTable(wedstrijden, alleAanm) {
    const tbody = $('#matchBody');

    if (wedstrijden.length === 0) {
      tbody.innerHTML = `<tr><td colspan="9"><div class="dash-empty"><span class="dash-empty__icon">⚽</span><p>Nog geen wedstrijden gepland.</p></div></td></tr>`;
      return;
    }

    tbody.innerHTML = wedstrijden.map(w => {
      const aanm = alleAanm.filter(a => a.wedstrijdId === w.id);
      const a = aanm.filter(x => x.status === 'aanwezig');
      const m = aanm.filter(x => x.status === 'misschien');
      const f = aanm.filter(x => x.status === 'afwezig');

      const playerTags = aanm.map(p =>
        `<span class="player-tag player-tag--${esc(p.status)}">${esc(p.spelerNaam)}</span>`
      ).join('');

      return `<tr>
        <td>${formatDatum(w.datum)}</td>
        <td><strong>${esc(w.tegenstander)}</strong></td>
        <td>${esc(w.tijdstip || '—')}</td>
        <td>${esc(w.locatie || '—')}</td>
        <td class="text-center"><span class="badge-tu badge-tu--${w.thuisUit}">${w.thuisUit === 'thuis' ? 'T' : 'U'}</span></td>
        <td class="text-center"><span class="chip chip--aanwezig">${a.length}</span></td>
        <td class="text-center"><span class="chip chip--misschien">${m.length}</span></td>
        <td class="text-center"><span class="chip chip--afwezig">${f.length}</span></td>
        <td><div class="player-list">${playerTags || '<span style="color:var(--text-muted)">—</span>'}</div></td>
      </tr>`;
    }).join('');
  }

  // ── Player stats table ────────────────────────
  function renderPlayerTable(wedstrijden, alleAanm) {
    const tbody = $('#playerBody');

    // Groep aanmeldingen per speler
    const spelerMap = {};
    alleAanm.forEach(a => {
      const key = a.spelerNaam.toLowerCase();
      if (!spelerMap[key]) {
        spelerMap[key] = { naam: a.spelerNaam, aanwezig: 0, misschien: 0, afwezig: 0, wedstrijden: new Set() };
      }
      spelerMap[key][a.status]++;
      spelerMap[key].wedstrijden.add(a.wedstrijdId);
      // Bewaar laatst gebruikte casing
      spelerMap[key].naam = a.spelerNaam;
    });

    const spelers = Object.values(spelerMap)
      .map(s => ({
        ...s,
        totaal: s.wedstrijden.size,
        opkomst: s.wedstrijden.size > 0
          ? Math.round((s.aanwezig / s.wedstrijden.size) * 100)
          : 0,
      }))
      .sort((a, b) => b.opkomst - a.opkomst || b.aanwezig - a.aanwezig);

    if (spelers.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7"><div class="dash-empty"><span class="dash-empty__icon">🏃</span><p>Nog geen aanmeldingen.</p></div></td></tr>`;
      return;
    }

    tbody.innerHTML = spelers.map(s => {
      const total = s.aanwezig + s.misschien + s.afwezig;
      const pA = total > 0 ? (s.aanwezig / total * 100).toFixed(0) : 0;
      const pM = total > 0 ? (s.misschien / total * 100).toFixed(0) : 0;
      const pF = total > 0 ? (s.afwezig / total * 100).toFixed(0) : 0;

      const pctClass = s.opkomst >= 70 ? 'pct--high' : s.opkomst >= 40 ? 'pct--mid' : 'pct--low';

      return `<tr>
        <td><strong>${esc(s.naam)}</strong></td>
        <td class="text-center">${s.totaal}</td>
        <td class="text-center"><span class="chip chip--aanwezig">${s.aanwezig}</span></td>
        <td class="text-center"><span class="chip chip--misschien">${s.misschien}</span></td>
        <td class="text-center"><span class="chip chip--afwezig">${s.afwezig}</span></td>
        <td class="text-center"><span class="pct ${pctClass}">${s.opkomst}%</span></td>
        <td>
          <div class="bar-wrap">
            <div class="bar-seg bar-seg--aanwezig" style="width:${pA}%"></div>
            <div class="bar-seg bar-seg--misschien" style="width:${pM}%"></div>
            <div class="bar-seg bar-seg--afwezig" style="width:${pF}%"></div>
          </div>
        </td>
      </tr>`;
    }).join('');
  }

  // ── Helpers ───────────────────────────────────
  function formatDatum(iso) {
    const d = new Date(iso + 'T12:00:00');
    const dag   = ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za'][d.getDay()];
    const maand = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun',
                   'jul', 'aug', 'sep', 'okt', 'nov', 'dec'][d.getMonth()];
    return `${dag} ${d.getDate()} ${maand}`;
  }

  function esc(str) {
    const el = document.createElement('span');
    el.textContent = str;
    return el.innerHTML;
  }

  // ── Boot ──────────────────────────────────────
  document.addEventListener('DOMContentLoaded', init);
})();
