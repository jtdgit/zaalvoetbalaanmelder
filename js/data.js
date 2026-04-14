// ──────────────────────────────────────────────
//  VoetbalAanmelder — Data Layer (Supabase + Magic Links)
// ──────────────────────────────────────────────

const DataStore = (() => {
  const SUPABASE_URL = 'https://dwiarctxxpwknlryijdn.supabase.co';
  const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR3aWFyY3R4eHB3a25scnlpamRuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYwMzMzOTYsImV4cCI6MjA5MTYwOTM5Nn0.1OVlyp9spaZm4mLi3A2NZ4GQohaWeEN_eKltZON2KfA';
  const SESSIE_KEY = 'va_sessie';

  const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

  // ── Sessie (localStorage cache voor snelle UI) ─
  function getSessie() {
    try { return JSON.parse(localStorage.getItem(SESSIE_KEY)) || null; }
    catch { return null; }
  }

  function setSessie(speler) {
    localStorage.setItem(SESSIE_KEY, JSON.stringify({
      id: speler.id,
      naam: speler.naam,
      email: speler.email,
      rol: speler.rol || 'speler',
    }));
  }

  function verwijderSessie() {
    localStorage.removeItem(SESSIE_KEY);
  }

  // ── Auth (Supabase Magic Links) ───────────────
  async function sendMagicLink(email) {
    const { error } = await sb.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: {
        emailRedirectTo: window.location.href.split('#')[0].split('?')[0],
      },
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }

  async function getAuthSessie() {
    const { data: { session } } = await sb.auth.getSession();
    return session;
  }

  async function getSpelerByAuthId(authId) {
    const { data } = await sb.from('spelers').select('*').eq('auth_id', authId).maybeSingle();
    return data || null;
  }

  async function registreerSpelerVoorAuth(authUser, naam) {
    const bestaand = await getSpelerByAuthId(authUser.id);
    if (bestaand) return { ok: true, speler: bestaand };

    const { count } = await sb.from('spelers').select('*', { count: 'exact', head: true });
    const isEerste = (count || 0) === 0;

    const { data, error } = await sb.from('spelers').insert({
      naam: naam.trim(),
      email: authUser.email.toLowerCase(),
      auth_id: authUser.id,
      rol: isEerste ? 'admin' : 'speler',
      geblokkeerd: false,
      geverifieerd: true,
    }).select().single();
    if (error) return { ok: false, error: error.message };
    return { ok: true, speler: data };
  }

  async function uitloggen() {
    verwijderSessie();
    await sb.auth.signOut();
  }

  // ── Spelers ───────────────────────────────────
  async function getSpelers() {
    const { data } = await sb.from('spelers').select('*').order('aangemaakt');
    return data || [];
  }

  async function getSpelerById(id) {
    const { data } = await sb.from('spelers').select('*').eq('id', id).maybeSingle();
    return data || null;
  }

  async function getSpelerByEmail(email) {
    const e = email.trim().toLowerCase();
    const { data } = await sb.from('spelers').select('*').eq('email', e).maybeSingle();
    return data || null;
  }

  async function updateProfiel(spelerId, updates) {
    const speler = await getSpelerById(spelerId);
    if (!speler) return { ok: false, error: 'Speler niet gevonden.' };

    const patch = { gewijzigd: new Date().toISOString() };

    if (updates.naam) {
      const oudeNaam = speler.naam;
      const nieuweNaam = updates.naam.trim();
      patch.naam = nieuweNaam;

      if (oudeNaam.toLowerCase() !== nieuweNaam.toLowerCase()) {
        await sb.from('aanmeldingen')
          .update({ speler_naam: nieuweNaam })
          .ilike('speler_naam', oudeNaam);
      }
    }

    const { data, error } = await sb.from('spelers').update(patch).eq('id', spelerId).select().single();
    if (error) return { ok: false, error: error.message };
    return { ok: true, speler: data };
  }

  // ── Admin ─────────────────────────────────────
  async function isAdmin(spelerId) {
    const speler = await getSpelerById(spelerId);
    return speler?.rol === 'admin';
  }

  async function blokkeerSpeler(spelerId) {
    const speler = await getSpelerById(spelerId);
    if (!speler) return { ok: false, error: 'Speler niet gevonden.' };
    if (speler.rol === 'admin') return { ok: false, error: 'Een admin kan niet geblokkeerd worden.' };
    const { error } = await sb.from('spelers').update({ geblokkeerd: true, gewijzigd: new Date().toISOString() }).eq('id', spelerId);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }

  async function deblokkeerSpeler(spelerId) {
    const { error } = await sb.from('spelers').update({ geblokkeerd: false, gewijzigd: new Date().toISOString() }).eq('id', spelerId);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }

  async function verwijderSpeler(spelerId) {
    const speler = await getSpelerById(spelerId);
    if (!speler) return { ok: false, error: 'Speler niet gevonden.' };
    if (speler.rol === 'admin') return { ok: false, error: 'Een admin kan niet verwijderd worden.' };

    await sb.from('aanmeldingen').delete().ilike('speler_naam', speler.naam);
    const { error } = await sb.from('spelers').delete().eq('id', spelerId);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }

  async function adminUpdateSpeler(spelerId, updates) {
    const speler = await getSpelerById(spelerId);
    if (!speler) return { ok: false, error: 'Speler niet gevonden.' };

    const patch = { gewijzigd: new Date().toISOString() };

    if (updates.naam !== undefined) {
      const nieuweNaam = updates.naam.trim();
      if (nieuweNaam && speler.naam.toLowerCase() !== nieuweNaam.toLowerCase()) {
        await sb.from('aanmeldingen')
          .update({ speler_naam: nieuweNaam })
          .ilike('speler_naam', speler.naam);
      }
      patch.naam = nieuweNaam || speler.naam;
    }

    const { data, error } = await sb.from('spelers').update(patch).eq('id', spelerId).select().single();
    if (error) return { ok: false, error: error.message };
    return { ok: true, speler: data };
  }

  async function maakAdmin(spelerId) {
    const { error } = await sb.from('spelers').update({ rol: 'admin' }).eq('id', spelerId);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }

  async function verwijderAdmin(spelerId) {
    const spelers = await getSpelers();
    const admins = spelers.filter(s => s.rol === 'admin');
    if (admins.length <= 1) return { ok: false, error: 'Er moet minimaal één admin blijven.' };
    const { error } = await sb.from('spelers').update({ rol: 'speler' }).eq('id', spelerId);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }

  // ── Wedstrijden ───────────────────────────────
  async function getWedstrijden() {
    const { data } = await sb.from('wedstrijden').select('*').order('datum').order('tijdstip');
    return data || [];
  }

  async function voegWedstrijdToe(w) {
    const { data, error } = await sb.from('wedstrijden').insert({
      tegenstander: w.tegenstander.trim(),
      datum: w.datum,
      tijdstip: w.tijdstip || '',
      locatie: (w.locatie || '').trim(),
      thuis_uit: w.thuisUit || 'thuis',
    }).select().single();
    if (error) return null;
    return data;
  }

  async function verwijderWedstrijd(id) {
    await sb.from('wedstrijden').delete().eq('id', id);
  }

  // ── Aanmeldingen ──────────────────────────────
  async function getAanmeldingen(wedstrijdId) {
    let query = sb.from('aanmeldingen').select('*');
    if (wedstrijdId) query = query.eq('wedstrijd_id', wedstrijdId);
    const { data } = await query.order('aangemeld');
    return (data || []).map(a => ({
      id: a.id,
      wedstrijdId: a.wedstrijd_id,
      spelerNaam: a.speler_naam,
      status: a.status,
      aangemeld: a.aangemeld,
      gewijzigd: a.gewijzigd,
    }));
  }

  async function zetAanmelding(wedstrijdId, spelerNaam, status) {
    const naam = spelerNaam.trim();
    const { error } = await sb.from('aanmeldingen').upsert({
      wedstrijd_id: wedstrijdId,
      speler_naam: naam,
      status,
      gewijzigd: new Date().toISOString(),
    }, { onConflict: 'wedstrijd_id,speler_naam' });
    if (error) console.error('zetAanmelding error:', error);
  }

  async function verwijderAanmelding(wedstrijdId, spelerNaam) {
    await sb.from('aanmeldingen').delete()
      .eq('wedstrijd_id', wedstrijdId)
      .ilike('speler_naam', spelerNaam.trim());
  }

  // ── Seed ──────────────────────────────────────
  async function seedAlsLeeg() {
    // Wedstrijden worden aangemaakt via de SQL setup.
  }

  // ── Public API ────────────────────────────────
  return {
    // Auth
    sendMagicLink,
    getAuthSessie,
    getSpelerByAuthId,
    registreerSpelerVoorAuth,
    uitloggen,
    // Sessie cache
    getSessie,
    setSessie,
    verwijderSessie,
    // Spelers
    getSpelers,
    getSpelerById,
    getSpelerByEmail,
    updateProfiel,
    // Admin
    isAdmin,
    blokkeerSpeler,
    deblokkeerSpeler,
    verwijderSpeler,
    adminUpdateSpeler,
    maakAdmin,
    verwijderAdmin,
    // Wedstrijden
    getWedstrijden,
    voegWedstrijdToe,
    verwijderWedstrijd,
    // Aanmeldingen
    getAanmeldingen,
    zetAanmelding,
    verwijderAanmelding,
    seedAlsLeeg,
  };
})();
