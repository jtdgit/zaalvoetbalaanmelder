// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
//  VoetbalAanmelder â€” Data Layer (localStorage)
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const DataStore = (() => {
  const WEDSTRIJDEN_KEY = 'va_wedstrijden';
  const AANMELDINGEN_KEY = 'va_aanmeldingen';
  const SPELERS_KEY = 'va_spelers';
  const SESSIE_KEY = 'va_sessie';

  // â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  function uuid() {
    return crypto.randomUUID
      ? crypto.randomUUID()
      : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
          const r = (Math.random() * 16) | 0;
          return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
        });
  }

  function load(key) {
    try {
      return JSON.parse(localStorage.getItem(key)) || [];
    } catch {
      return [];
    }
  }

  function save(key, data) {
    localStorage.setItem(key, JSON.stringify(data));
  }

  /** Hash wachtwoord â€” SHA-256 als beschikbaar, anders simpele hash als fallback (file:// protocol). */
  async function hash(tekst) {
    if (crypto.subtle) {
      const enc = new TextEncoder().encode(tekst);
      const buf = await crypto.subtle.digest('SHA-256', enc);
      return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
    }
    // Fallback: simple djb2-style hash for file:// contexts where crypto.subtle is unavailable
    let h = 5381;
    for (let i = 0; i < tekst.length; i++) {
      h = ((h << 5) + h + tekst.charCodeAt(i)) >>> 0;
    }
    return 'fb-' + h.toString(16).padStart(8, '0');
  }

  // â”€â”€ Spelers / Accounts â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  function getSpelers() {
    return load(SPELERS_KEY);
  }

  function getSpelerById(id) {
    return load(SPELERS_KEY).find(s => s.id === id) || null;
  }

  function getSpelerByEmail(email) {
    const e = email.trim().toLowerCase();
    return load(SPELERS_KEY).find(s => s.email === e) || null;
  }

  /** Genereer een 6-cijferige verificatiecode. */
  function genereerCode() {
    return String(Math.floor(100000 + Math.random() * 900000));
  }

  /**
   * Registreer een nieuwe speler.
   * @returns {{ ok: boolean, error?: string, speler?: object, verificatieCode?: string }}
   */
  async function registreerSpeler({ naam, email, wachtwoord }) {
    const spelers = load(SPELERS_KEY);
    const emailLower = email.trim().toLowerCase();
    const naamTrim = naam.trim();

    if (spelers.some(s => s.email === emailLower)) {
      return { ok: false, error: 'Er bestaat al een account met dit e-mailadres.' };
    }

    const code = genereerCode();
    const isEersteSpeler = spelers.length === 0;
    const speler = {
      id: uuid(),
      naam: naamTrim,
      email: emailLower,
      wachtwoordHash: await hash(wachtwoord),
      rol: isEersteSpeler ? 'admin' : 'speler',
      geblokkeerd: false,
      geverifieerd: false,
      verificatieCode: code,
      aangemaakt: new Date().toISOString(),
    };
    spelers.push(speler);
    save(SPELERS_KEY, spelers);
    return { ok: true, speler, verificatieCode: code };
  }

  /** Verifieer e-mailadres met code. */
  function verifieerEmail(spelerId, code) {
    const spelers = load(SPELERS_KEY);
    const idx = spelers.findIndex(s => s.id === spelerId);
    if (idx < 0) return { ok: false, error: 'Speler niet gevonden.' };
    if (spelers[idx].verificatieCode !== code) {
      return { ok: false, error: 'Ongeldige verificatiecode.' };
    }
    spelers[idx].geverifieerd = true;
    delete spelers[idx].verificatieCode;
    save(SPELERS_KEY, spelers);
    return { ok: true };
  }

  /** Genereer een wachtwoord-reset code voor een e-mailadres. */
  function genereerResetCode(email) {
    const spelers = load(SPELERS_KEY);
    const emailLower = email.trim().toLowerCase();
    const idx = spelers.findIndex(s => s.email === emailLower);
    if (idx < 0) return { ok: false, error: 'Geen account gevonden met dit e-mailadres.' };

    const code = genereerCode();
    spelers[idx].resetCode = code;
    spelers[idx].resetVerloopt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    save(SPELERS_KEY, spelers);
    return { ok: true, code, naam: spelers[idx].naam };
  }

  /** Stel een nieuw wachtwoord in met reset-code. */
  async function resetWachtwoord(email, code, nieuwWachtwoord) {
    const spelers = load(SPELERS_KEY);
    const emailLower = email.trim().toLowerCase();
    const idx = spelers.findIndex(s => s.email === emailLower);
    if (idx < 0) return { ok: false, error: 'Geen account gevonden.' };
    if (spelers[idx].resetCode !== code) {
      return { ok: false, error: 'Ongeldige resetcode.' };
    }
    if (new Date(spelers[idx].resetVerloopt) < new Date()) {
      return { ok: false, error: 'Resetcode is verlopen. Vraag een nieuwe aan.' };
    }
    spelers[idx].wachtwoordHash = await hash(nieuwWachtwoord);
    delete spelers[idx].resetCode;
    delete spelers[idx].resetVerloopt;
    spelers[idx].gewijzigd = new Date().toISOString();
    save(SPELERS_KEY, spelers);
    return { ok: true };
  }

  /**
   * Log in met e-mail en wachtwoord.
   * @returns {{ ok: boolean, error?: string, speler?: object }}
   */
  async function loginSpeler(email, wachtwoord) {
    const speler = getSpelerByEmail(email);
    if (!speler) {
      return { ok: false, error: 'Geen account gevonden met dit e-mailadres.' };
    }
    if (speler.geblokkeerd) {
      return { ok: false, error: 'Dit account is geblokkeerd. Neem contact op met de beheerder.' };
    }
    const h = await hash(wachtwoord);
    if (h !== speler.wachtwoordHash) {
      return { ok: false, error: 'Wachtwoord is onjuist.' };
    }
    return { ok: true, speler };
  }

  /** Update profiel (naam en/of email). */
  function updateProfiel(spelerId, updates) {
    const spelers = load(SPELERS_KEY);
    const idx = spelers.findIndex(s => s.id === spelerId);
    if (idx < 0) return { ok: false, error: 'Speler niet gevonden.' };

    if (updates.email) {
      const emailLower = updates.email.trim().toLowerCase();
      if (spelers.some(s => s.email === emailLower && s.id !== spelerId)) {
        return { ok: false, error: 'Dit e-mailadres is al in gebruik.' };
      }
      spelers[idx].email = emailLower;
    }

    if (updates.naam) {
      const oudeNaam = spelers[idx].naam;
      const nieuweNaam = updates.naam.trim();
      spelers[idx].naam = nieuweNaam;

      // Update aanmeldingen met de oude naam
      if (oudeNaam.toLowerCase() !== nieuweNaam.toLowerCase()) {
        const aanm = load(AANMELDINGEN_KEY);
        const oudeNaamLower = oudeNaam.toLowerCase();
        aanm.forEach(a => {
          if (a.spelerNaam.toLowerCase() === oudeNaamLower) {
            a.spelerNaam = nieuweNaam;
          }
        });
        save(AANMELDINGEN_KEY, aanm);
      }
    }

    spelers[idx].gewijzigd = new Date().toISOString();
    save(SPELERS_KEY, spelers);
    return { ok: true, speler: spelers[idx] };
  }

  /** Wijzig wachtwoord. */
  async function wijzigWachtwoord(spelerId, oudWachtwoord, nieuwWachtwoord) {
    const spelers = load(SPELERS_KEY);
    const idx = spelers.findIndex(s => s.id === spelerId);
    if (idx < 0) return { ok: false, error: 'Speler niet gevonden.' };

    const oudeHash = await hash(oudWachtwoord);
    if (oudeHash !== spelers[idx].wachtwoordHash) {
      return { ok: false, error: 'Huidig wachtwoord is onjuist.' };
    }

    spelers[idx].wachtwoordHash = await hash(nieuwWachtwoord);
    spelers[idx].gewijzigd = new Date().toISOString();
    save(SPELERS_KEY, spelers);
    return { ok: true };
  }

  // â”€â”€ Sessie â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  function getSessie() {
    try {
      return JSON.parse(localStorage.getItem(SESSIE_KEY)) || null;
    } catch {
      return null;
    }
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

  // â”€â”€ Wedstrijden â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  function getWedstrijden() {
    return load(WEDSTRIJDEN_KEY).sort(
      (a, b) => new Date(a.datum + 'T' + (a.tijdstip || '00:00')) -
                new Date(b.datum + 'T' + (b.tijdstip || '00:00'))
    );
  }

  function saveWedstrijden(list) {
    save(WEDSTRIJDEN_KEY, list);
  }

  /**
   * @param {{ tegenstander: string, datum: string, tijdstip: string, locatie: string, thuisUit: 'thuis'|'uit' }} w
   */
  function voegWedstrijdToe(w) {
    const list = load(WEDSTRIJDEN_KEY);
    const wedstrijd = {
      id: uuid(),
      tegenstander: w.tegenstander.trim(),
      datum: w.datum,
      tijdstip: w.tijdstip || '',
      locatie: w.locatie.trim(),
      thuisUit: w.thuisUit || 'thuis',
      aangemaakt: new Date().toISOString(),
    };
    list.push(wedstrijd);
    save(WEDSTRIJDEN_KEY, list);
    return wedstrijd;
  }

  function verwijderWedstrijd(id) {
    const list = load(WEDSTRIJDEN_KEY).filter(w => w.id !== id);
    save(WEDSTRIJDEN_KEY, list);
    // Verwijder ook alle aanmeldingen voor deze wedstrijd
    const aanm = load(AANMELDINGEN_KEY).filter(a => a.wedstrijdId !== id);
    save(AANMELDINGEN_KEY, aanm);
  }

  // â”€â”€ Aanmeldingen â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  function getAanmeldingen(wedstrijdId) {
    const all = load(AANMELDINGEN_KEY);
    return wedstrijdId
      ? all.filter(a => a.wedstrijdId === wedstrijdId)
      : all;
  }

  /**
   * Zet of wijzig aanmelding. Bij zelfde naam (case-insensitive) wordt de status overschreven.
   * @param {string} wedstrijdId
   * @param {string} spelerNaam
   * @param {'aanwezig'|'misschien'|'afwezig'} status
   */
  function zetAanmelding(wedstrijdId, spelerNaam, status) {
    const all = load(AANMELDINGEN_KEY);
    const naam = spelerNaam.trim();
    const naamLower = naam.toLowerCase();

    const idx = all.findIndex(
      a => a.wedstrijdId === wedstrijdId && a.spelerNaam.toLowerCase() === naamLower
    );

    if (idx >= 0) {
      all[idx].status = status;
      all[idx].spelerNaam = naam; // bewaar laatst ingevoerde casing
      all[idx].gewijzigd = new Date().toISOString();
    } else {
      all.push({
        wedstrijdId,
        spelerNaam: naam,
        status,
        aangemeld: new Date().toISOString(),
      });
    }
    save(AANMELDINGEN_KEY, all);
  }

  function verwijderAanmelding(wedstrijdId, spelerNaam) {
    const all = load(AANMELDINGEN_KEY);
    const naamLower = spelerNaam.trim().toLowerCase();
    const filtered = all.filter(
      a => !(a.wedstrijdId === wedstrijdId && a.spelerNaam.toLowerCase() === naamLower)
    );
    save(AANMELDINGEN_KEY, filtered);
  }

  // ── Admin functies ────────────────────────────
  function isAdmin(spelerId) {
    const speler = getSpelerById(spelerId);
    return speler?.rol === 'admin';
  }

  function blokkeerSpeler(spelerId) {
    const spelers = load(SPELERS_KEY);
    const idx = spelers.findIndex(s => s.id === spelerId);
    if (idx < 0) return { ok: false, error: 'Speler niet gevonden.' };
    if (spelers[idx].rol === 'admin') return { ok: false, error: 'Een admin kan niet geblokkeerd worden.' };
    spelers[idx].geblokkeerd = true;
    spelers[idx].gewijzigd = new Date().toISOString();
    save(SPELERS_KEY, spelers);
    return { ok: true };
  }

  function deblokkeerSpeler(spelerId) {
    const spelers = load(SPELERS_KEY);
    const idx = spelers.findIndex(s => s.id === spelerId);
    if (idx < 0) return { ok: false, error: 'Speler niet gevonden.' };
    spelers[idx].geblokkeerd = false;
    spelers[idx].gewijzigd = new Date().toISOString();
    save(SPELERS_KEY, spelers);
    return { ok: true };
  }

  function verwijderSpeler(spelerId) {
    const spelers = load(SPELERS_KEY);
    const speler = spelers.find(s => s.id === spelerId);
    if (!speler) return { ok: false, error: 'Speler niet gevonden.' };
    if (speler.rol === 'admin') return { ok: false, error: 'Een admin kan niet verwijderd worden.' };

    // Verwijder de speler
    const nieuw = spelers.filter(s => s.id !== spelerId);
    save(SPELERS_KEY, nieuw);

    // Verwijder alle aanmeldingen van deze speler
    const aanm = load(AANMELDINGEN_KEY);
    const naamLower = speler.naam.toLowerCase();
    save(AANMELDINGEN_KEY, aanm.filter(a => a.spelerNaam.toLowerCase() !== naamLower));

    return { ok: true };
  }

  function adminUpdateSpeler(spelerId, updates) {
    const spelers = load(SPELERS_KEY);
    const idx = spelers.findIndex(s => s.id === spelerId);
    if (idx < 0) return { ok: false, error: 'Speler niet gevonden.' };

    if (updates.naam !== undefined) {
      const oudeNaam = spelers[idx].naam;
      const nieuweNaam = updates.naam.trim();
      if (nieuweNaam && oudeNaam.toLowerCase() !== nieuweNaam.toLowerCase()) {
        const aanm = load(AANMELDINGEN_KEY);
        aanm.forEach(a => {
          if (a.spelerNaam.toLowerCase() === oudeNaam.toLowerCase()) {
            a.spelerNaam = nieuweNaam;
          }
        });
        save(AANMELDINGEN_KEY, aanm);
      }
      spelers[idx].naam = nieuweNaam || spelers[idx].naam;
    }

    if (updates.email !== undefined) {
      const emailLower = updates.email.trim().toLowerCase();
      if (emailLower && spelers.some(s => s.email === emailLower && s.id !== spelerId)) {
        return { ok: false, error: 'Dit e-mailadres is al in gebruik.' };
      }
      spelers[idx].email = emailLower || spelers[idx].email;
    }

    spelers[idx].gewijzigd = new Date().toISOString();
    save(SPELERS_KEY, spelers);
    return { ok: true, speler: spelers[idx] };
  }

  function maakAdmin(spelerId) {
    const spelers = load(SPELERS_KEY);
    const idx = spelers.findIndex(s => s.id === spelerId);
    if (idx < 0) return { ok: false, error: 'Speler niet gevonden.' };
    spelers[idx].rol = 'admin';
    save(SPELERS_KEY, spelers);
    return { ok: true };
  }

  function verwijderAdmin(spelerId) {
    const spelers = load(SPELERS_KEY);
    const idx = spelers.findIndex(s => s.id === spelerId);
    if (idx < 0) return { ok: false, error: 'Speler niet gevonden.' };
    const admins = spelers.filter(s => s.rol === 'admin');
    if (admins.length <= 1) return { ok: false, error: 'Er moet minimaal één admin blijven.' };
    spelers[idx].rol = 'speler';
    save(SPELERS_KEY, spelers);
    return { ok: true };
  }

  // â”€â”€ Seed Data â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  function seedAlsLeeg() {
    if (load(WEDSTRIJDEN_KEY).length > 0) return;

    // Facta wedstrijden â€” seizoen 2025/2026 (bron: asvdzaal.nl)
    const seeds = [
      {
        tegenstander: 'Schildersbedrijf Flevo Kleur',
        datum: '2026-04-14',
        tijdstip: '19:00',
        locatie: "'t Dok: Hal 2",
        thuisUit: 'thuis',
      },
      {
        tegenstander: 'ZAM Sierbestrating & Tuinhout',
        datum: '2026-05-01',
        tijdstip: '20:00',
        locatie: "'t Dok: Hal 2",
        thuisUit: 'thuis',
      },
      {
        tegenstander: 'Suidgeest Caravanstalling',
        datum: '2026-05-08',
        tijdstip: '22:00',
        locatie: "'t Dok: Hal 2",
        thuisUit: 'uit',
      },
      {
        tegenstander: 'Classic V',
        datum: '2026-06-05',
        tijdstip: '19:00',
        locatie: "'t Dok: Hal 1",
        thuisUit: 'uit',
      },
      {
        tegenstander: 'Wilkens & Partners',
        datum: '2026-06-15',
        tijdstip: '20:00',
        locatie: "'t Dok: Hal 2",
        thuisUit: 'uit',
      },
      {
        tegenstander: 'TMO events',
        datum: '2026-06-26',
        tijdstip: '22:00',
        locatie: "'t Dok: Hal 1",
        thuisUit: 'thuis',
      },
      {
        tegenstander: 'Speerstra',
        datum: '2026-07-03',
        tijdstip: '21:00',
        locatie: "'t Dok: Hal 2",
        thuisUit: 'uit',
      },
      {
        tegenstander: 'Schildersbedrijf Flevo Kleur',
        datum: '2026-07-06',
        tijdstip: '20:00',
        locatie: "'t Dok: Hal 2",
        thuisUit: 'uit',
      },
    ];

    seeds.forEach(s => voegWedstrijdToe(s));
  }

  // â”€â”€ Public API â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  return {
    getWedstrijden,
    saveWedstrijden,
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
