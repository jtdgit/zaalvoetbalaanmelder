// ──────────────────────────────────────────────
//  VoetbalAanmelder — Application Logic
// ──────────────────────────────────────────────

const App = (() => {
  // ── DOM refs ──────────────────────────────────
  const $ = s => document.querySelector(s);
  const loginOverlay  = $('#loginOverlay');
  const loginForm     = $('#loginForm');
  const registerForm  = $('#registerForm');
  const authTabs      = $('#authTabs');
  const profileOverlay= $('#profileOverlay');
  const profileForm   = $('#profileForm');
  const passwordForm  = $('#passwordForm');
  const profileBtn    = $('#profileBtn');
  const profileClose  = $('#profileClose');
  const emailSimOverlay = $('#emailSimOverlay');
  const verifyOverlay = $('#verifyOverlay');
  const verifyForm    = $('#verifyForm');
  const forgotOverlay = $('#forgotOverlay');
  const forgotForm    = $('#forgotForm');
  const resetForm     = $('#resetForm');
  const playerBadge   = $('#playerBadge');
  const playerAvatar  = $('#playerAvatar');
  const playerNameEl  = $('#playerName');
  const logoutBtn     = $('#logoutBtn');
  const addPanel      = $('#addPanel');
  const addToggle     = $('#addToggle');
  const addForm       = $('#addForm');
  const matchesEl     = $('#matchesContainer');
  const toastEl       = $('#toast');
  const statWedstr    = $('#statWedstrijden');
  const statSpelers   = $('#statSpelers');

  let currentPlayer = null; // { id, naam, email }
  let pendingVerify = null; // { id, naam, email } — wacht op e-mailverificatie
  let forgotEmail = null;   // e-mail waarvoor reset is aangevraagd
  let toastTimer = null;

  // ── Init ──────────────────────────────────────
  function init() {
    DataStore.seedAlsLeeg();
    initDarkMode();
    initLogin();
    bindEvents();
    render();
  }

  // ── Login / Logout / Register ─────────────────
  function initLogin() {
    const sessie = DataStore.getSessie();
    if (sessie) {
      // Verifieer dat account nog bestaat
      const speler = DataStore.getSpelerById(sessie.id);
      if (speler) {
        currentPlayer = { id: speler.id, naam: speler.naam, email: speler.email };
        showLoggedIn();
        return;
      }
      DataStore.verwijderSessie();
    }
    showLoginScreen();
  }

  function showLoggedIn() {
    loginOverlay.classList.add('login-overlay--hidden');
    playerAvatar.textContent = currentPlayer.naam.charAt(0).toUpperCase();
    playerNameEl.textContent = currentPlayer.naam;
    playerBadge.style.display = '';
  }

  function showLoginScreen() {
    loginOverlay.classList.remove('login-overlay--hidden');
    playerBadge.style.display = 'none';
    switchAuthTab('login');
  }

  function switchAuthTab(tab) {
    authTabs.querySelectorAll('.auth-tabs__btn').forEach(btn => {
      btn.classList.toggle('auth-tabs__btn--active', btn.dataset.tab === tab);
    });
    loginForm.classList.toggle('login-card__form--hidden', tab !== 'login');
    registerForm.classList.toggle('login-card__form--hidden', tab !== 'register');
    // Reset errors
    $('#loginError').textContent = '';
    $('#registerError').textContent = '';
  }

  async function handleLogin(e) {
    e.preventDefault();
    const email = $('#loginEmail').value.trim();
    const ww    = $('#loginWachtwoord').value;
    const result = await DataStore.loginSpeler(email, ww);
    if (!result.ok) {
      $('#loginError').textContent = result.error;
      return;
    }
    currentPlayer = { id: result.speler.id, naam: result.speler.naam, email: result.speler.email };
    DataStore.setSessie(result.speler);
    showLoggedIn();
    render();
    toast(`Welkom terug, ${currentPlayer.naam}!`);
    loginForm.reset();
  }

  async function handleRegister(e) {
    e.preventDefault();
    const naam = $('#regNaam').value.trim();
    const email = $('#regEmail').value.trim();
    const ww   = $('#regWachtwoord').value;
    const ww2  = $('#regWachtwoord2').value;

    if (ww !== ww2) {
      $('#registerError').textContent = 'Wachtwoorden komen niet overeen.';
      return;
    }

    const result = await DataStore.registreerSpeler({ naam, email, wachtwoord: ww });
    if (!result.ok) {
      $('#registerError').textContent = result.error;
      return;
    }

    pendingVerify = { id: result.speler.id, naam: result.speler.naam, email: result.speler.email };
    registerForm.reset();

    // Toon gesimuleerde bevestigingsmail
    showEmailSim(
      email,
      'Bevestig je registratie',
      `<p>Hoi <strong>${esc(naam)}</strong>,</p>
       <p>Welkom bij Voetbal Aanmelder! Gebruik deze code om je e-mailadres te bevestigen:</p>
       <p class="email-code">${result.verificatieCode}</p>
       <p>De code is 15 minuten geldig.</p>
       <p>Veel plezier op het veld! ⚽</p>`
    );
  }

  // ── Email simulatie ───────────────────────────
  function showEmailSim(to, subject, bodyHtml) {
    $('#emailSimTo').textContent = to;
    $('#emailSimSubject').textContent = subject;
    $('#emailSimBody').innerHTML = bodyHtml;
    emailSimOverlay.classList.remove('modal-overlay--hidden');
  }

  function closeEmailSim() {
    emailSimOverlay.classList.add('modal-overlay--hidden');
    // Als er een verificatie pending is, toon het verificatieformulier
    if (pendingVerify) {
      verifyOverlay.classList.remove('modal-overlay--hidden');
    }
  }

  function handleVerify(e) {
    e.preventDefault();
    if (!pendingVerify) return;
    const code = $('#verifyCode').value.trim();
    const result = DataStore.verifieerEmail(pendingVerify.id, code);
    if (!result.ok) {
      $('#verifyError').textContent = result.error;
      return;
    }
    currentPlayer = { ...pendingVerify };
    DataStore.setSessie(currentPlayer);
    pendingVerify = null;
    verifyOverlay.classList.add('modal-overlay--hidden');
    verifyForm.reset();
    showLoggedIn();
    render();
    toast(`Welkom, ${currentPlayer.naam}! E-mail geverifieerd.`);
  }

  // ── Wachtwoord vergeten ───────────────────────
  function openForgot() {
    forgotEmail = null;
    $('#forgotStep1').style.display = '';
    $('#forgotStep2').style.display = 'none';
    $('#forgotError').textContent = '';
    $('#resetError').textContent = '';
    forgotForm.reset();
    if (resetForm) resetForm.reset();
    forgotOverlay.classList.remove('modal-overlay--hidden');
  }

  function closeForgot() {
    forgotOverlay.classList.add('modal-overlay--hidden');
  }

  function handleForgotSubmit(e) {
    e.preventDefault();
    const email = $('#forgotEmail').value.trim();
    const result = DataStore.genereerResetCode(email);
    if (!result.ok) {
      $('#forgotError').textContent = result.error;
      return;
    }
    forgotEmail = email;

    // Toon gesimuleerde reset-mail
    showEmailSim(
      email,
      'Wachtwoord resetten',
      `<p>Hoi <strong>${esc(result.naam)}</strong>,</p>
       <p>Je hebt een wachtwoord-reset aangevraagd. Gebruik deze code:</p>
       <p class="email-code">${result.code}</p>
       <p>De code is 15 minuten geldig. Heb je dit niet aangevraagd? Negeer dan deze e-mail.</p>`
    );

    // Na sluiten van email-sim, toon stap 2
    $('#forgotStep1').style.display = 'none';
    $('#forgotStep2').style.display = '';
  }

  async function handleResetSubmit(e) {
    e.preventDefault();
    const code = $('#resetCode').value.trim();
    const ww   = $('#resetNieuwWw').value;
    const ww2  = $('#resetNieuwWw2').value;

    if (ww !== ww2) {
      $('#resetError').textContent = 'Wachtwoorden komen niet overeen.';
      return;
    }

    const result = await DataStore.resetWachtwoord(forgotEmail, code, ww);
    if (!result.ok) {
      $('#resetError').textContent = result.error;
      return;
    }

    forgotEmail = null;
    closeForgot();
    toast('Wachtwoord is gewijzigd. Je kunt nu inloggen.');
    switchAuthTab('login');
  }

  function logout() {
    currentPlayer = null;
    DataStore.verwijderSessie();
    showLoginScreen();
  }

  // ── Profile ───────────────────────────────────
  function openProfile() {
    if (!currentPlayer) return;
    $('#profNaam').value = currentPlayer.naam;
    $('#profEmail').value = currentPlayer.email;
    $('#profileError').textContent = '';
    $('#passwordError').textContent = '';
    passwordForm.reset();
    profileOverlay.classList.remove('modal-overlay--hidden');
  }

  function closeProfile() {
    profileOverlay.classList.add('modal-overlay--hidden');
  }

  function handleProfileSave(e) {
    e.preventDefault();
    const naam  = $('#profNaam').value.trim();
    const email = $('#profEmail').value.trim();

    const result = DataStore.updateProfiel(currentPlayer.id, { naam, email });
    if (!result.ok) {
      $('#profileError').textContent = result.error;
      return;
    }

    currentPlayer.naam  = result.speler.naam;
    currentPlayer.email = result.speler.email;
    DataStore.setSessie(result.speler);
    showLoggedIn();
    render();
    toast('Profiel bijgewerkt');
    closeProfile();
  }

  async function handlePasswordChange(e) {
    e.preventDefault();
    const oud  = $('#profOudWw').value;
    const nieuw = $('#profNieuwWw').value;

    const result = await DataStore.wijzigWachtwoord(currentPlayer.id, oud, nieuw);
    if (!result.ok) {
      $('#passwordError').textContent = result.error;
      return;
    }
    toast('Wachtwoord gewijzigd');
    passwordForm.reset();
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

    // Auth tabs
    authTabs.addEventListener('click', e => {
      const btn = e.target.closest('.auth-tabs__btn');
      if (btn) switchAuthTab(btn.dataset.tab);
    });

    loginForm.addEventListener('submit', handleLogin);
    registerForm.addEventListener('submit', handleRegister);
    logoutBtn.addEventListener('click', logout);

    // Email simulatie
    $('#emailSimClose').addEventListener('click', closeEmailSim);
    emailSimOverlay.addEventListener('click', e => {
      if (e.target === emailSimOverlay) closeEmailSim();
    });

    // Verificatie
    verifyForm.addEventListener('submit', handleVerify);

    // Wachtwoord vergeten
    $('#forgotPasswordBtn').addEventListener('click', openForgot);
    $('#forgotClose').addEventListener('click', closeForgot);
    forgotOverlay.addEventListener('click', e => {
      if (e.target === forgotOverlay) closeForgot();
    });
    forgotForm.addEventListener('submit', handleForgotSubmit);
    resetForm.addEventListener('submit', handleResetSubmit);

    // Profile
    profileBtn.addEventListener('click', openProfile);
    profileClose.addEventListener('click', closeProfile);
    profileOverlay.addEventListener('click', e => {
      if (e.target === profileOverlay) closeProfile();
    });
    profileForm.addEventListener('submit', handleProfileSave);
    passwordForm.addEventListener('submit', handlePasswordChange);

    addToggle.addEventListener('click', () => {
      addPanel.classList.toggle('add-panel--open');
    });

    addForm.addEventListener('submit', e => {
      e.preventDefault();
      handleAddMatch();
    });

    // Delegate clicks inside match cards
    matchesEl.addEventListener('click', e => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;

      const action = btn.dataset.action;
      const card   = btn.closest('.match-card');
      const id     = card?.dataset.id;

      if (action === 'delete') handleDelete(id);
      if (action === 'signup') handleQuickSignup(btn, id);
      if (action === 'remove-player') handleRemovePlayer(btn, id);
    });
  }

  // ── Handlers ──────────────────────────────────
  function handleAddMatch() {
    const tegenstander = $('#fTegenstander').value.trim();
    const datum        = $('#fDatum').value;
    const tijdstip     = $('#fTijdstip').value;
    const locatie      = $('#fLocatie').value.trim();
    const thuisUit     = $('#fThuisUit').value;

    if (!tegenstander || !datum) return;

    DataStore.voegWedstrijdToe({ tegenstander, datum, tijdstip, locatie, thuisUit });
    addForm.reset();
    $('#fTijdstip').value = '14:30';
    addPanel.classList.remove('add-panel--open');
    render();
    toast(`Wedstrijd tegen ${tegenstander} toegevoegd`);
  }

  function handleDelete(id) {
    const wedstrijden = DataStore.getWedstrijden();
    const w = wedstrijden.find(m => m.id === id);
    if (!w) return;
    if (!confirm(`Wedstrijd tegen ${w.tegenstander} verwijderen?\nAlle aanmeldingen gaan verloren.`)) return;

    DataStore.verwijderWedstrijd(id);
    render();
    toast('Wedstrijd verwijderd');
  }

  function handleQuickSignup(btn, id) {
    if (!currentPlayer) return;
    const status = btn.dataset.status;

    // Toggle: als je dezelfde status nogmaals klikt, verwijder de aanmelding
    const bestaande = DataStore.getAanmeldingen(id)
      .find(a => a.spelerNaam.toLowerCase() === currentPlayer.naam.toLowerCase());

    if (bestaande && bestaande.status === status) {
      DataStore.verwijderAanmelding(id, currentPlayer.naam);
      render();
      toast('Aanmelding verwijderd');
      return;
    }

    DataStore.zetAanmelding(id, currentPlayer.naam, status);
    render();

    const labels = { aanwezig: 'aanwezig ✓', misschien: 'misschien ⏳', afwezig: 'afwezig ✗' };
    toast(`${currentPlayer.naam} → ${labels[status]}`);
  }

  function handleRemovePlayer(btn, matchId) {
    const naam = btn.dataset.player;
    if (!naam) return;
    DataStore.verwijderAanmelding(matchId, naam);
    render();
  }

  // ── Rendering ─────────────────────────────────
  function render() {
    const wedstrijden = DataStore.getWedstrijden();
    const alleAanmeldingen = DataStore.getAanmeldingen();

    // Header stats
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
          <span class="match-card__badge match-card__badge--${w.thuisUit}">
            ${w.thuisUit === 'thuis' ? '🏠 Thuis' : '🚌 Uit'}
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
