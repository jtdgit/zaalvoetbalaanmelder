// ──────────────────────────────────────────────
//  VoetbalAanmelder — Application Logic (Magic Links)
// ──────────────────────────────────────────────

const App = (() => {
  // ── DOM refs ──────────────────────────────────
  const $ = s => document.querySelector(s);
  const loginOverlay   = $('#loginOverlay');
  const magicLinkForm  = $('#magicLinkForm');
  const magicSent      = $('#magicSent');
  const nameOverlay    = $('#nameOverlay');
  const nameForm       = $('#nameForm');
  const profileOverlay = $('#profileOverlay');
  const profileForm    = $('#profileForm');
  const profileBtn     = $('#profileBtn');
  const profileClose   = $('#profileClose');
  const playerBadge    = $('#playerBadge');
  const playerAvatar   = $('#playerAvatar');
  const playerNameEl   = $('#playerName');
  const logoutBtn      = $('#logoutBtn');
  const addPanel       = $('#addPanel');
  const addToggle      = $('#addToggle');
  const addForm        = $('#addForm');
  const matchesEl      = $('#matchesContainer');
  const toastEl        = $('#toast');
  const statWedstr     = $('#statWedstrijden');
  const statSpelers    = $('#statSpelers');

  let currentPlayer = null;
  let pendingAuthUser = null;
  let toastTimer = null;

  // ── Init ──────────────────────────────────────
  async function init() {
    await DataStore.seedAlsLeeg();
    initDarkMode();
    bindEvents();
    await initLogin();
    await render();
  }

  // ── Auth flow ─────────────────────────────────
  async function initLogin() {
    const session = await DataStore.getAuthSessie();
    if (session) {
      await handleAuthSession(session);
    } else {
      showLoginScreen();
    }
  }

  async function handleAuthSession(session) {
    const authUser = session.user;
    const speler = await DataStore.getSpelerByAuthId(authUser.id);

    if (speler) {
      if (speler.geblokkeerd) {
        toast('Dit account is geblokkeerd. Neem contact op met de beheerder.');
        await DataStore.uitloggen();
        showLoginScreen();
        return;
      }
      currentPlayer = { id: speler.id, naam: speler.naam, email: speler.email, rol: speler.rol };
      DataStore.setSessie(speler);
      showLoggedIn();
    } else {
      // Nieuwe gebruiker — naam invullen
      pendingAuthUser = authUser;
      showNameModal();
    }
  }

  function showLoggedIn() {
    loginOverlay.classList.add('login-overlay--hidden');
    nameOverlay.classList.add('modal-overlay--hidden');
    playerAvatar.textContent = currentPlayer.naam.charAt(0).toUpperCase();
    playerNameEl.textContent = currentPlayer.naam;
    playerBadge.style.display = '';
    const adminLink = $('#adminLink');
    if (adminLink) {
      adminLink.style.display = currentPlayer.rol === 'admin' ? '' : 'none';
    }
  }

  function showLoginScreen() {
    loginOverlay.classList.remove('login-overlay--hidden');
    playerBadge.style.display = 'none';
    // Reset to email form
    magicLinkForm.classList.remove('login-card__form--hidden');
    magicSent.classList.add('login-card__form--hidden');
  }

  function showNameModal() {
    loginOverlay.classList.add('login-overlay--hidden');
    nameOverlay.classList.remove('modal-overlay--hidden');
  }

  async function handleMagicLink(e) {
    e.preventDefault();
    const email = $('#magicEmail').value.trim();
    $('#magicError').textContent = '';

    const result = await DataStore.sendMagicLink(email);
    if (!result.ok) {
      $('#magicError').textContent = result.error;
      return;
    }

    // Toon bevestiging
    $('#magicSentEmail').textContent = email;
    magicLinkForm.classList.add('login-card__form--hidden');
    magicSent.classList.remove('login-card__form--hidden');
  }

  function handleMagicRetry() {
    magicLinkForm.classList.remove('login-card__form--hidden');
    magicSent.classList.add('login-card__form--hidden');
    $('#magicEmail').value = '';
    $('#magicEmail').focus();
  }

  async function handleNameSubmit(e) {
    e.preventDefault();
    if (!pendingAuthUser) return;

    const naam = $('#newName').value.trim();
    if (!naam) return;

    const result = await DataStore.registreerSpelerVoorAuth(pendingAuthUser, naam);
    if (!result.ok) {
      $('#nameError').textContent = result.error;
      return;
    }

    currentPlayer = { id: result.speler.id, naam: result.speler.naam, email: result.speler.email, rol: result.speler.rol };
    DataStore.setSessie(result.speler);
    pendingAuthUser = null;
    showLoggedIn();
    await render();

    const rolMsg = result.speler.rol === 'admin' ? ' Je bent admin van het team!' : '';
    toast(`Welkom, ${result.speler.naam}!${rolMsg}`);
  }

  async function logout() {
    currentPlayer = null;
    await DataStore.uitloggen();
    showLoginScreen();
  }

  // ── Profile ───────────────────────────────────
  function openProfile() {
    if (!currentPlayer) return;
    $('#profNaam').value = currentPlayer.naam;
    $('#profEmail').value = currentPlayer.email;
    $('#profileError').textContent = '';
    profileOverlay.classList.remove('modal-overlay--hidden');
  }

  function closeProfile() {
    profileOverlay.classList.add('modal-overlay--hidden');
  }

  async function handleProfileSave(e) {
    e.preventDefault();
    const naam = $('#profNaam').value.trim();

    const result = await DataStore.updateProfiel(currentPlayer.id, { naam });
    if (!result.ok) {
      $('#profileError').textContent = result.error;
      return;
    }

    currentPlayer.naam = result.speler.naam;
    DataStore.setSessie(result.speler);
    showLoggedIn();
    await render();
    toast('Profiel bijgewerkt');
    closeProfile();
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

  function bindEvents() {
    $('#darkToggle').addEventListener('click', toggleDarkMode);

    // Magic link auth
    magicLinkForm.addEventListener('submit', handleMagicLink);
    $('#magicRetry').addEventListener('click', handleMagicRetry);

    // Naam form
    nameForm.addEventListener('submit', handleNameSubmit);

    // Logout
    logoutBtn.addEventListener('click', logout);

    // Profile
    profileBtn.addEventListener('click', openProfile);
    profileClose.addEventListener('click', closeProfile);
    profileOverlay.addEventListener('click', e => {
      if (e.target === profileOverlay) closeProfile();
    });
    profileForm.addEventListener('submit', handleProfileSave);

    // Add match
    addToggle.addEventListener('click', () => {
      addPanel.classList.toggle('add-panel--open');
    });

    addForm.addEventListener('submit', async e => {
      e.preventDefault();
      await handleAddMatch();
    });

    // Delegate clicks inside match cards
    matchesEl.addEventListener('click', async e => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;

      const action = btn.dataset.action;
      const card   = btn.closest('.match-card');
      const id     = card?.dataset.id;

      if (action === 'delete') await handleDelete(id);
      if (action === 'signup') await handleQuickSignup(btn, id);
      if (action === 'remove-player') await handleRemovePlayer(btn, id);
    });
  }

  // ── Handlers ──────────────────────────────────
  async function handleAddMatch() {
    const tegenstander = $('#fTegenstander').value.trim();
    const datum        = $('#fDatum').value;
    const tijdstip     = $('#fTijdstip').value;
    const locatie      = $('#fLocatie').value.trim();
    const thuisUit     = $('#fThuisUit').value;

    if (!tegenstander || !datum) return;

    await DataStore.voegWedstrijdToe({ tegenstander, datum, tijdstip, locatie, thuisUit });
    addForm.reset();
    $('#fTijdstip').value = '14:30';
    addPanel.classList.remove('add-panel--open');
    await render();
    toast(`Wedstrijd tegen ${tegenstander} toegevoegd`);
  }

  async function handleDelete(id) {
    const wedstrijden = await DataStore.getWedstrijden();
    const w = wedstrijden.find(m => m.id === id);
    if (!w) return;
    if (!confirm(`Wedstrijd tegen ${w.tegenstander} verwijderen?\nAlle aanmeldingen gaan verloren.`)) return;

    await DataStore.verwijderWedstrijd(id);
    await render();
    toast('Wedstrijd verwijderd');
  }

  async function handleQuickSignup(btn, id) {
    if (!currentPlayer) return;
    const status = btn.dataset.status;

    const aanmeldingen = await DataStore.getAanmeldingen(id);
    const bestaande = aanmeldingen.find(a => a.spelerNaam.toLowerCase() === currentPlayer.naam.toLowerCase());

    if (bestaande && bestaande.status === status) {
      await DataStore.verwijderAanmelding(id, currentPlayer.naam);
      await render();
      toast('Aanmelding verwijderd');
      return;
    }

    await DataStore.zetAanmelding(id, currentPlayer.naam, status);
    await render();

    const labels = { aanwezig: 'aanwezig ✓', misschien: 'misschien ⏳', afwezig: 'afwezig ✗' };
    toast(`${currentPlayer.naam} → ${labels[status]}`);
  }

  async function handleRemovePlayer(btn, matchId) {
    const naam = btn.dataset.player;
    if (!naam) return;
    await DataStore.verwijderAanmelding(matchId, naam);
    await render();
  }

  // ── Rendering ─────────────────────────────────
  async function render() {
    const wedstrijden = await DataStore.getWedstrijden();
    const alleAanmeldingen = await DataStore.getAanmeldingen();

    statWedstr.textContent  = wedstrijden.length;
    statSpelers.textContent = alleAanmeldingen.length;

    if (wedstrijden.length === 0) {
      matchesEl.innerHTML = `
        <div class="matches__empty">
          <span class="matches__empty-icon">⚽</span>
          <p>Nog geen wedstrijden gepland.</p>
          <p>Voeg er een toe via de knop hierboven!</p>
        </div>`;
      return;
    }

    matchesEl.innerHTML = wedstrijden.map((w, i) => {
      const aanm = alleAanmeldingen.filter(a => a.wedstrijdId === w.id);
      return renderCard(w, aanm, i);
    }).join('');
  }

  function renderCard(w, aanmeldingen, index) {
    const datum    = formatDatum(w.datum);
    const isPast   = new Date(w.datum + 'T23:59:59') < new Date();
    const thuisUit = w.thuis_uit || w.thuisUit || 'thuis';
    const aanwezig  = aanmeldingen.filter(a => a.status === 'aanwezig');
    const misschien = aanmeldingen.filter(a => a.status === 'misschien');
    const afwezig   = aanmeldingen.filter(a => a.status === 'afwezig');

    return `
    <article class="match-card" data-id="${esc(w.id)}" style="animation-delay:${index * 60}ms">
      <div class="match-card__header">
        <div class="match-card__info">
          <h2 class="match-card__opponent">${esc(w.tegenstander)}</h2>
          <div class="match-card__meta">
            <span>📅 ${datum}</span>
            ${w.tijdstip ? `<span>⏰ ${esc(w.tijdstip)}</span>` : ''}
            ${w.locatie  ? `<span>📍 ${esc(w.locatie)}</span>` : ''}
          </div>
        </div>
        <div class="match-card__actions">
          <span class="match-card__badge match-card__badge--${thuisUit}">
            ${thuisUit === 'thuis' ? '🏠 Thuis' : '🚌 Uit'}
          </span>
          <button class="btn btn--danger" data-action="delete" title="Verwijder wedstrijd">✕</button>
        </div>
      </div>
      <div class="match-card__body">
        ${isPast ? '' : renderSignup(w.id, aanmeldingen)}
        <div class="roster">
          ${renderGroup('aanwezig',  'Aanwezig',  aanwezig,  w.id)}
          ${renderGroup('misschien', 'Misschien', misschien, w.id)}
          ${renderGroup('afwezig',   'Afwezig',   afwezig,   w.id)}
        </div>
      </div>
    </article>`;
  }

  function renderSignup(wedstrijdId, aanmeldingen) {
    if (!currentPlayer) return '';
    const mine = aanmeldingen.find(
      a => a.spelerNaam.toLowerCase() === currentPlayer.naam.toLowerCase()
    );
    const myStatus = mine?.status || null;

    function btnClass(status) {
      let cls = `signup__btn signup__btn--${status}`;
      if (myStatus === status) cls += ' signup__btn--active';
      return cls;
    }

    return `
      <div class="signup signup--quick">
        <span class="signup__label">Jouw status:</span>
        <button class="${btnClass('aanwezig')}" data-action="signup" data-status="aanwezig">✓ Aanwezig</button>
        <button class="${btnClass('misschien')}" data-action="signup" data-status="misschien">? Misschien</button>
        <button class="${btnClass('afwezig')}" data-action="signup" data-status="afwezig">✗ Afwezig</button>
      </div>`;
  }

  function renderGroup(key, label, players, matchId) {
    const list = players.length
      ? players.map(p => {
          const isMe = currentPlayer && p.spelerNaam.toLowerCase() === currentPlayer.naam.toLowerCase();
          return `
          <li class="roster__player${isMe ? ' roster__player--me' : ''}">
            <span>${esc(p.spelerNaam)}</span>
            <button class="roster__remove" data-action="remove-player" data-player="${esc(p.spelerNaam)}" title="Verwijder">✕</button>
          </li>`;
        }).join('')
      : `<li class="roster__empty">Nog niemand</li>`;

    return `
      <div class="roster__group roster__group--${key}">
        <div class="roster__title">
          <span>${label}</span>
          <span class="roster__count">${players.length}</span>
        </div>
        <ul class="roster__list">${list}</ul>
      </div>`;
  }

  // ── Helpers ───────────────────────────────────
  function formatDatum(iso) {
    const d = new Date(iso + 'T12:00:00');
    const dag   = ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za'][d.getDay()];
    const maand = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun',
                   'jul', 'aug', 'sep', 'okt', 'nov', 'dec'][d.getMonth()];
    return `${dag} ${d.getDate()} ${maand} ${d.getFullYear()}`;
  }

  function esc(str) {
    const el = document.createElement('span');
    el.textContent = str;
    return el.innerHTML;
  }

  function toast(msg) {
    clearTimeout(toastTimer);
    toastEl.textContent = msg;
    toastEl.classList.add('toast--visible');
    toastTimer = setTimeout(() => toastEl.classList.remove('toast--visible'), 2500);
  }

  // ── Boot ──────────────────────────────────────
  document.addEventListener('DOMContentLoaded', init);
})();
