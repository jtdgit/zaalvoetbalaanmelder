-- =============================================
-- VoetbalAanmelder — Supabase Database Setup
-- Voer dit uit in de SQL Editor van je Supabase project:
-- https://supabase.com/dashboard/project/dwiarctxxpwknlryijdn/sql
-- =============================================

-- 1. Spelers tabel
CREATE TABLE IF NOT EXISTS spelers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  naam TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  wachtwoord_hash TEXT NOT NULL,
  rol TEXT NOT NULL DEFAULT 'speler' CHECK (rol IN ('admin', 'speler')),
  geblokkeerd BOOLEAN NOT NULL DEFAULT false,
  geverifieerd BOOLEAN NOT NULL DEFAULT false,
  verificatie_code TEXT,
  reset_code TEXT,
  reset_verloopt TIMESTAMPTZ,
  aangemaakt TIMESTAMPTZ NOT NULL DEFAULT now(),
  gewijzigd TIMESTAMPTZ
);

-- 2. Wedstrijden tabel
CREATE TABLE IF NOT EXISTS wedstrijden (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tegenstander TEXT NOT NULL,
  datum DATE NOT NULL,
  tijdstip TEXT DEFAULT '',
  locatie TEXT DEFAULT '',
  thuis_uit TEXT NOT NULL DEFAULT 'thuis' CHECK (thuis_uit IN ('thuis', 'uit')),
  aangemaakt TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Aanmeldingen tabel
CREATE TABLE IF NOT EXISTS aanmeldingen (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wedstrijd_id UUID NOT NULL REFERENCES wedstrijden(id) ON DELETE CASCADE,
  speler_naam TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('aanwezig', 'misschien', 'afwezig')),
  aangemeld TIMESTAMPTZ NOT NULL DEFAULT now(),
  gewijzigd TIMESTAMPTZ,
  UNIQUE(wedstrijd_id, speler_naam)
);

-- 4. RLS inschakelen
ALTER TABLE spelers ENABLE ROW LEVEL SECURITY;
ALTER TABLE wedstrijden ENABLE ROW LEVEL SECURITY;
ALTER TABLE aanmeldingen ENABLE ROW LEVEL SECURITY;

-- 5. RLS policies — open voor anon (team-app, geen gevoelige data buiten wachtwoord-hashes)
CREATE POLICY "Iedereen kan spelers lezen" ON spelers FOR SELECT TO anon USING (true);
CREATE POLICY "Iedereen kan spelers aanmaken" ON spelers FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Iedereen kan spelers updaten" ON spelers FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Iedereen kan spelers verwijderen" ON spelers FOR DELETE TO anon USING (true);

CREATE POLICY "Iedereen kan wedstrijden lezen" ON wedstrijden FOR SELECT TO anon USING (true);
CREATE POLICY "Iedereen kan wedstrijden aanmaken" ON wedstrijden FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Iedereen kan wedstrijden updaten" ON wedstrijden FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Iedereen kan wedstrijden verwijderen" ON wedstrijden FOR DELETE TO anon USING (true);

CREATE POLICY "Iedereen kan aanmeldingen lezen" ON aanmeldingen FOR SELECT TO anon USING (true);
CREATE POLICY "Iedereen kan aanmeldingen aanmaken" ON aanmeldingen FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Iedereen kan aanmeldingen updaten" ON aanmeldingen FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Iedereen kan aanmeldingen verwijderen" ON aanmeldingen FOR DELETE TO anon USING (true);

-- 6. Seed data — Facta wedstrijden seizoen 2025/2026 (bron: asvdzaal.nl)
INSERT INTO wedstrijden (tegenstander, datum, tijdstip, locatie, thuis_uit) VALUES
  ('Schildersbedrijf Flevo Kleur', '2026-04-14', '19:00', '''t Dok: Hal 2', 'thuis'),
  ('ZAM Sierbestrating & Tuinhout', '2026-05-01', '20:00', '''t Dok: Hal 2', 'thuis'),
  ('Suidgeest Caravanstalling',     '2026-05-08', '22:00', '''t Dok: Hal 2', 'uit'),
  ('Classic V',                      '2026-06-05', '19:00', '''t Dok: Hal 1', 'uit'),
  ('Wilkens & Partners',             '2026-06-15', '20:00', '''t Dok: Hal 2', 'uit'),
  ('TMO events',                     '2026-06-26', '22:00', '''t Dok: Hal 1', 'thuis'),
  ('Speerstra',                      '2026-07-03', '21:00', '''t Dok: Hal 2', 'uit'),
  ('Schildersbedrijf Flevo Kleur',  '2026-07-06', '20:00', '''t Dok: Hal 2', 'uit')
ON CONFLICT DO NOTHING;
