// ──────────────────────────────────────────────
//  VoetbalAanmelder — Data Layer (Supabase)
// ──────────────────────────────────────────────

const DataStore = (() => {
  const SUPABASE_URL = 'https://dwiarctxxpwknlryijdn.supabase.co';
  const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR3aWFyY3R4eHB3a25scnlpamRuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYwMzMzOTYsImV4cCI6MjA5MTYwOTM5Nn0.1OVlyp9spaZm4mLi3A2NZ4GQohaWeEN_eKltZON2KfA';
  const SESSIE_KEY = 'va_sessie';

  const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

  // ── Helpers ───────────────────────────────────
  async function hash(tekst) {
    if (crypto.subtle) {
      const enc = new TextEncoder().encode(tekst);
      const buf = await crypto.subtle.digest('SHA-256', enc);
      return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
    }
    let h = 5381;
    for (let i = 0; i < tekst.length; i++) {
      h = ((h << 5) + h + tekst.charCodeAt(i)) >>> 0;
    }
    return 'fb-' + h.toString(16).padStart(8, '0');
  }

  function genereerCode() {
    return String(Math.floor(100000 + Math.random() * 900000));
  }

  // ── Sessie (blijft localStorage — per browser) ─
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

  async function registreerSpeler({ naam, email, wachtwoord }) {
    const emailLower = email.trim().toLowerCase();
    const naamTrim = naam.trim();

    const bestaand = await getSpelerByEmail(emailLower);
    if (bestaand) return { ok: false, error: 'Er bestaat al een account met dit e-mailadres.' };

    // Eerste speler wordt admin
    const { count } = await sb.from('spelers').select('*', { count: 'exact', head: true });
    const isEerste = (count || 0) === 0;

    const code = genereerCode();
    const speler = {
      naam: naamTrim,
      email: emailLower,
      wachtwoord_hash: await hash(wachtwoord),
      rol: isEerste ? 'admin' : 'speler',
      geblokkeerd: false,
      geverifieerd: false,
      verificatie_code: code,
    };

    const { data, error } = await sb.from('spelers').insert(speler).select().single();
    if (error) return { ok: false, error: error.message };
    return { ok: true, speler: data, verificatieCode: code };
  }

  async function verifieerEmail(spelerId, code) {
    const speler = await getSpelerById(spelerId);
    if (!speler) return { ok: false, error: 'Speler niet gevonden.' };
    if (speler.verificatie_code !== code) return { ok: false, error: 'Ongeldige verificatiecode.' };

    const { error } = await sb.from('spelers')
      .update({ geverifieerd: true, verificatie_code: null })
      .eq('id', spelerId);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }

  async function genereerResetCode(email) {
    const emailLower = email.trim().toLowerCase();
    const speler = await getSpelerByEmail(emailLower);
    if (!speler) return { ok: false, error: 'Geen account gevonden met dit e-mailadres.' };

    const code = genereerCode();
    const { error } = await sb.from('spelers').update({
      reset_code: code,
      reset_verloopt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    }).eq('id', speler.id);
    if (error) return { ok: false, error: error.message };
    return { ok: true, code, naam: speler.naam };
  }

  async function resetWachtwoord(email, code, nieuwWachtwoord) {
    const emailLower = email.trim().toLowerCase();
    const speler = await getSpelerByEmail(emailLower);
    if (!speler) return { ok: false, error: 'Geen account gevonden.' };
    if (speler.reset_code !== code) return { ok: false, error: 'Ongeldige resetcode.' };
    if (new Date(speler.reset_verloopt) < new Date()) {
      return { ok: false, error: 'Resetcode is verlopen. Vraag een nieuwe aan.' };
    }

    const { error } = await sb.from('spelers').update({
      wachtwoord_hash: await hash(nieuwWachtwoord),
      reset_code: null,
      reset_verloopt: null,
      gewijzigd: new Date().toISOString(),
    }).eq('id', speler.id);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }

  async function loginSpeler(email, wachtwoord) {
    const speler = await getSpelerByEmail(email);
    if (!speler) return { ok: false, error: 'Geen account gevonden met dit e-mailadres.' };
    if (speler.geblokkeerd) return { ok: false, error: 'Dit account is geblokkeerd. Neem contact op met de beheerder.' };
    const h = await hash(wachtwoord);
    if (h !== speler.wachtwoord_hash) return { ok: false, error: 'Wachtwoord is onjuist.' };
    return { ok: true, speler };
  }

  async function updateProfiel(spelerId, updates) {
    const speler = await getSpelerById(spelerId);
    if (!speler) return { ok: false, error: 'Speler niet gevonden.' };

    const patch = { gewijzigd: new Date().toISOString() };

    if (updates.email) {
      const emailLower = updates.email.trim().toLowerCase();
      const bestaand = await getSpelerByEmail(emailLower);
      if (bestaand && bestaand.id !== spelerId) {
        return { ok: false, error: 'Dit e-mailadres is al in gebruik.' };
      }
      patch.email = emailLower;
    }

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

  async function wijzigWachtwoord(spelerId, oudWachtwoord, nieuwWachtwoord) {
    const speler = await getSpelerById(spelerId);
    if (!speler) return { ok: false, error: 'Speler niet gevonden.' };
    const oudeHash = await hash(oudWachtwoord);
    if (oudeHash !== speler.wachtwoord_hash) return { ok: false, error: 'Huidig wachtwoord is onjuist.' };

    const { error } = await sb.from('spelers').update({
      wachtwoord_hash: await hash(nieuwWachtwoord),
      gewijzigd: new Date().toISOString(),
    }).eq('id', spelerId);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
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

    // Verwijder aanmeldingen
    await sb.from('aanmeldingen').delete().ilike('speler_naam', speler.naam);
    // Verwijder speler
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

    if (updates.email !== undefined) {
      const emailLower = updates.email.trim().toLowerCase();
      if (emailLower) {
        const bestaand = await getSpelerByEmail(emailLower);
        if (bestaand && bestaand.id !== spelerId) {
          return { ok: false, error: 'Dit e-mailadres is al in gebruik.' };
        }
        patch.email = emailLower;
      }
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
    // Aanmeldingen worden automatisch verwijderd door ON DELETE CASCADE
    await sb.from('wedstrijden').delete().eq('id', id);
  }

  // ── Aanmeldingen ──────────────────────────────
  async function getAanmeldingen(wedstrijdId) {
    let query = sb.from('aanmeldingen').select('*');
    if (wedstrijdId) query = query.eq('wedstrijd_id', wedstrijdId);
    const { data } = await query.order('aangemeld');
    // Map DB column names to camelCase for compatibility
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
    // Upsert: gebruik de UNIQUE constraint op (wedstrijd_id, speler_naam)
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

  // ── Seed (no-op: seed data is in SQL migration) ──
  async function seedAlsLeeg() {
    // Wedstrijden worden aangemaakt via de SQL setup.
    // Deze functie bestaat voor backward compatibility.
  }

  // ── Public API ────────────────────────────────
  return {
    getWedstrijden,
    voegWedstrijdToe,
    verwijderWedstrijd,
    getAanmeldingen,
    zetAanmelding,
    verwijderAanmelding,
    seedAlsLeeg,
    // Spelers
    getSpelers,
    getSpelerById,
    getSpelerByEmail,
    registreerSpeler,
    verifieerEmail,
    genereerResetCode,
    resetWachtwoord,
    loginSpeler,
    updateProfiel,
    wijzigWachtwoord,
    // Sessie
    getSessie,
    setSessie,
    verwijderSessie,
    // Admin
    isAdmin,
    blokkeerSpeler,
    deblokkeerSpeler,
    verwijderSpeler,
    adminUpdateSpeler,
    maakAdmin,
    verwijderAdmin,
  };
})();
