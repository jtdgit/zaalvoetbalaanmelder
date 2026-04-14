// ──────────────────────────────────────────────
//  VoetbalAanmelder — Admin Panel Logic
// ──────────────────────────────────────────────

const Admin = (() => {
  const $ = s => document.querySelector(s);

  let currentAdmin = null;
  let toastTimer = null;

  async function init() {
    await DataStore.seedAlsLeeg();
    initDarkMode();
    await checkAccess();
  }

  // ── Access check ──────────────────────────────
  async function checkAccess() {
    const sessie = DataStore.getSessie();
    if (!sessie || !(await DataStore.isAdmin(sessie.id))) {
      $('#noAccessOverlay').classList.remove('login-overlay--hidden');
      $('#adminMain').style.display = 'none';
      return;
    }
    currentAdmin = sessie;
    $('#noAccessOverlay').classList.add('login-overlay--hidden');
    $('#adminMain').style.display = '';
    bindEvents();
    await render();
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

    // Delegate table actions
    $('#userBody').addEventListener('click', async e => {
      const btn = e.target.closest('.action-btn');
      if (!btn) return;
      const id = btn.dataset.id;
      const action = btn.dataset.action;

      if (action === 'edit') await openEdit(id);
      if (action === 'block') await handleBlock(id);
      if (action === 'unblock') await handleUnblock(id);
      if (action === 'delete') await handleDelete(id);
      if (action === 'make-admin') await handleMakeAdmin(id);
      if (action === 'remove-admin') await handleRemoveAdmin(id);
    });

    // Edit modal
    $('#editClose').addEventListener('click', closeEdit);
    $('#editOverlay').addEventListener('click', e => {
      if (e.target === $('#editOverlay')) closeEdit();
    });
    $('#editForm').addEventListener('submit', handleEditSave);
  }

  // ── Render ────────────────────────────────────
  async function render() {
    const spelers = await DataStore.getSpelers();

    // Summary
    const actief = spelers.filter(s => !s.geblokkeerd).length;
    const geblokkeerd = spelers.filter(s => s.geblokkeerd).length;
    const admins = spelers.filter(s => s.rol === 'admin').length;

    $('#sumTotaal').textContent = spelers.length;
    $('#sumActief').textContent = actief;
    $('#sumGeblokkeerd').textContent = geblokkeerd;
    $('#sumAdmin').textContent = admins;

    // Table
    const tbody = $('#userBody');
    if (spelers.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7"><div class="dash-empty"><span class="dash-empty__icon">👤</span><p>Geen gebruikers.</p></div></td></tr>';
      return;
    }

    tbody.innerHTML = spelers
      .sort((a, b) => {
        if (a.rol === 'admin' && b.rol !== 'admin') return -1;
        if (b.rol === 'admin' && a.rol !== 'admin') return 1;
        return (a.naam || '').localeCompare(b.naam || '');
      })
      .map(s => {
        const isZelf = s.id === currentAdmin.id;
        const isAdmin = s.rol === 'admin';
        const rowClass = isZelf ? 'row--self' : s.geblokkeerd ? 'row--blocked' : '';

        const rolBadge = isAdmin
          ? '<span class="role-badge role-badge--admin">Admin</span>'
          : '<span class="role-badge role-badge--speler">Speler</span>';

        const statusBadge = s.geblokkeerd
          ? '<span class="status-badge status-badge--geblokkeerd">Geblokkeerd</span>'
          : '<span class="status-badge status-badge--actief">Actief</span>';

        const verifyIcon = s.geverifieerd !== false ? '✅' : '❌';

        const datum = s.aangemaakt
          ? new Date(s.aangemaakt).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })
          : '—';

        // Actions
        let actions = '';
        actions += `<button class="action-btn action-btn--edit" data-action="edit" data-id="${esc(s.id)}" title="Bewerken">✏️</button>`;

        if (!isZelf) {
          if (s.geblokkeerd) {
            actions += `<button class="action-btn action-btn--unblock" data-action="unblock" data-id="${esc(s.id)}" title="Deblokkeren">🔓</button>`;
          } else if (!isAdmin) {
            actions += `<button class="action-btn action-btn--block" data-action="block" data-id="${esc(s.id)}" title="Blokkeren">🔒</button>`;
          }

          if (isAdmin) {
            actions += `<button class="action-btn action-btn--demote" data-action="remove-admin" data-id="${esc(s.id)}" title="Admin verwijderen">👤</button>`;
          } else {
            actions += `<button class="action-btn action-btn--admin" data-action="make-admin" data-id="${esc(s.id)}" title="Maak admin">⭐</button>`;
          }

          if (!isAdmin) {
            actions += `<button class="action-btn action-btn--delete" data-action="delete" data-id="${esc(s.id)}" title="Verwijderen">🗑️</button>`;
          }
        }

        return `<tr class="${rowClass}">
          <td><strong>${esc(s.naam)}</strong>${isZelf ? ' <em>(jij)</em>' : ''}</td>
          <td>${esc(s.email)}</td>
          <td class="text-center">${rolBadge}</td>
          <td class="text-center">${statusBadge}</td>
          <td class="text-center"><span class="verify-badge">${verifyIcon}</span></td>
          <td>${datum}</td>
          <td><div class="actions">${actions}</div></td>
        </tr>`;
      }).join('');
  }

  // ── Handlers ──────────────────────────────────
  async function handleBlock(id) {
    const speler = await DataStore.getSpelerById(id);
    if (!speler) return;
    if (!confirm(`${speler.naam} blokkeren? Deze speler kan dan niet meer inloggen.`)) return;
    const result = await DataStore.blokkeerSpeler(id);
    if (!result.ok) { toast(result.error); return; }
    await render();
    toast(`${speler.naam} is geblokkeerd`);
  }

  async function handleUnblock(id) {
    const result = await DataStore.deblokkeerSpeler(id);
    if (!result.ok) { toast(result.error); return; }
    const speler = await DataStore.getSpelerById(id);
    await render();
    toast(`${speler?.naam || 'Speler'} is gedeblokkeerd`);
  }

  async function handleDelete(id) {
    const speler = await DataStore.getSpelerById(id);
    if (!speler) return;
    if (!confirm(`${speler.naam} definitief verwijderen?\nAlle aanmeldingen van deze speler worden ook verwijderd.`)) return;
    const result = await DataStore.verwijderSpeler(id);
    if (!result.ok) { toast(result.error); return; }
    await render();
    toast(`${speler.naam} is verwijderd`);
  }

  async function handleMakeAdmin(id) {
    const speler = await DataStore.getSpelerById(id);
    if (!speler) return;
    if (!confirm(`${speler.naam} admin-rechten geven?`)) return;
    const result = await DataStore.maakAdmin(id);
    if (!result.ok) { toast(result.error); return; }
    await render();
    toast(`${speler.naam} is nu admin`);
  }

  async function handleRemoveAdmin(id) {
    const speler = await DataStore.getSpelerById(id);
    if (!speler) return;
    if (!confirm(`Admin-rechten van ${speler.naam} verwijderen?`)) return;
    const result = await DataStore.verwijderAdmin(id);
    if (!result.ok) { toast(result.error); return; }
    await render();
    toast(`${speler.naam} is geen admin meer`);
  }

  // ── Edit modal ────────────────────────────────
  async function openEdit(id) {
    const speler = await DataStore.getSpelerById(id);
    if (!speler) return;
    $('#editId').value = speler.id;
    $('#editNaam').value = speler.naam;
    $('#editEmail').value = speler.email;
    $('#editError').textContent = '';
    $('#editOverlay').classList.remove('modal-overlay--hidden');
  }

  function closeEdit() {
    $('#editOverlay').classList.add('modal-overlay--hidden');
  }

  async function handleEditSave(e) {
    e.preventDefault();
    const id    = $('#editId').value;
    const naam  = $('#editNaam').value.trim();
    const email = $('#editEmail').value.trim();

    const result = await DataStore.adminUpdateSpeler(id, { naam, email });
    if (!result.ok) {
      $('#editError').textContent = result.error;
      return;
    }

    if (id === currentAdmin.id) {
      DataStore.setSessie(result.speler);
      currentAdmin = DataStore.getSessie();
    }

    closeEdit();
    await render();
    toast(`${result.speler.naam} is bijgewerkt`);
  }

  // ── Helpers ───────────────────────────────────
  function esc(str) {
    const el = document.createElement('span');
    el.textContent = str;
    return el.innerHTML;
  }

  function toast(msg) {
    const toastEl = $('#toast');
    clearTimeout(toastTimer);
    toastEl.textContent = msg;
    toastEl.classList.add('toast--visible');
    toastTimer = setTimeout(() => toastEl.classList.remove('toast--visible'), 2500);
  }

  // ── Boot ──────────────────────────────────────
  document.addEventListener('DOMContentLoaded', init);
})();
