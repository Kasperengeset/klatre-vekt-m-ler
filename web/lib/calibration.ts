// All kalibreringslogikk er samlet her: lagring, statistikk og
// omregning fra rå ADC-verdi til kilogram. Ren TypeScript, ingen UI —
// lett å teste og lett å flytte inn i firmware senere om ønskelig.

export interface CalibrationData {
  /** Rå ADC-verdi ved 0 kg (fra tare). */
  offsetRaw: number;
  /** Counts per kg: (raw_ved_kjent_vekt - offsetRaw) / kjent_vekt_kg. */
  countsPerKg: number;
  /** Når kalibreringen ble gjort, til info i UI. */
  calibratedAt: string;
  /** Kjent vekt (kg) brukt under kalibrering, til info i UI. */
  knownWeightKg: number;
}

const STORAGE_KEY = "klatre-vekt-maler:hx711-calibration";

export function loadCalibration(): CalibrationData | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as CalibrationData;
  } catch {
    return null;
  }
}

export function saveCalibration(data: CalibrationData): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function clearCalibration(): void {
  window.localStorage.removeItem(STORAGE_KEY);
}

export function mean(samples: number[]): number {
  if (samples.length === 0) return 0;
  return samples.reduce((sum, value) => sum + value, 0) / samples.length;
}

export function standardDeviation(samples: number[]): number {
  if (samples.length < 2) return 0;
  const avg = mean(samples);
  const variance =
    samples.reduce((sum, value) => sum + (value - avg) ** 2, 0) /
    (samples.length - 1);
  return Math.sqrt(variance);
}

export function rawToKg(raw: number, calibration: CalibrationData): number {
  return (raw - calibration.offsetRaw) / calibration.countsPerKg;
}

export function computeCountsPerKg(
  rawAtKnownWeight: number,
  offsetRaw: number,
  knownWeightKg: number
): number {
  return (rawAtKnownWeight - offsetRaw) / knownWeightKg;
}

// Genererer en ferdig C++-snutt til firmware-steg 3 (kalibrering on-device),
// så brukeren slipper å taste inn tallene manuelt.
export function generateArduinoSnippet(calibration: CalibrationData): string {
  return `// Kalibreringsverdier funnet i kalibrerings-wizarden (${calibration.calibratedAt})
// Kjent vekt brukt: ${calibration.knownWeightKg} kg
const long CALIBRATION_OFFSET_RAW = ${Math.round(calibration.offsetRaw)};
const float CALIBRATION_COUNTS_PER_KG = ${calibration.countsPerKg.toFixed(4)}f;

// Bruk:
// float kg = (raw - CALIBRATION_OFFSET_RAW) / CALIBRATION_COUNTS_PER_KG;`;
}
