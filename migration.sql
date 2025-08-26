-- Migration Script für Vacay Hub
-- Führe dieses Script in Railway PostgreSQL Query Tab aus

-- 1. Füge exclude_weekends Spalte zur companies Tabelle hinzu
ALTER TABLE companies 
ADD COLUMN IF NOT EXISTS exclude_weekends BOOLEAN DEFAULT true;

-- 2. Setze den Standardwert für alle bestehenden Firmen
UPDATE companies 
SET exclude_weekends = true 
WHERE exclude_weekends IS NULL;

-- 3. Optional: Überprüfe die Änderungen
SELECT id, name, exclude_weekends FROM companies;

-- 4. Optional: Korrigiere bestehende vacation_requests days_count
-- ACHTUNG: Nur ausführen wenn du die Tage neu berechnen willst!
-- Dies wird alle bestehenden Anträge neu berechnen basierend auf exclude_weekends = true

/*
UPDATE vacation_requests vr
SET days_count = (
    SELECT COUNT(*)
    FROM generate_series(vr.start_date::date, vr.end_date::date, '1 day'::interval) d
    WHERE EXTRACT(DOW FROM d) NOT IN (0, 6) -- 0 = Sonntag, 6 = Samstag
)
WHERE vr.status = 'pending';
*/

-- Ende der Migration
