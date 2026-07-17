"use client";

import { useEffect, useMemo, useState } from "react";
import type { ConnectionStatus } from "@/hooks/useHx711Serial";
import { useSerial } from "@/components/SerialProvider";
import { RawSparkline } from "@/components/RawSparkline";
import {
  type CalibrationData,
  loadCalibration,
  saveCalibration,
  clearCalibration,
  mean,
  standardDeviation,
  rawToKg,
  computeCountsPerKg,
  generateArduinoSnippet,
} from "@/lib/calibration";
import { saveCalibrationProfile } from "@/lib/actions";

// Antall siste samples vi snitter over når bruker trykker "tare" eller
// "registrer vekt" — ved ~10 Hz tilsvarer 20 samples ca. 2 sekunder,
// nok til å dempe støy uten at det føles tregt.
const CAPTURE_SAMPLES = 20;
// Terskel for når vi anser sensoren som "i ro" (standardavvik i rå counts).
const STABILITY_THRESHOLD = 80;

function captureStable(
  history: number[]
): { value: number; stdDev: number } | null {
  if (history.length < CAPTURE_SAMPLES) return null;
  const recent = history.slice(-CAPTURE_SAMPLES);
  return { value: mean(recent), stdDev: standardDeviation(recent) };
}

const STATUS_LABEL: Record<ConnectionStatus, string> = {
  disconnected: "Ikke tilkoblet",
  connecting: "Kobler til …",
  connected: "Tilkoblet",
  error: "Feil",
};

const STATUS_COLOR: Record<ConnectionStatus, string> = {
  disconnected: "var(--viz-text-muted)",
  connecting: "var(--viz-warning)",
  connected: "var(--viz-good)",
  error: "var(--viz-critical)",
};

export default function Home() {
  const serial = useSerial();

  const [calibration, setCalibration] = useState<CalibrationData | null>(
    null
  );
  const [offsetRaw, setOffsetRaw] = useState<number | null>(null);
  const [knownWeightInput, setKnownWeightInput] = useState("");
  const [wizardMessage, setWizardMessage] = useState<string | null>(null);
  const [copyFeedback, setCopyFeedback] = useState(false);

  // Kalibrering leses fra localStorage først etter mount, for å unngå
  // hydration-mismatch (localStorage finnes ikke på serveren under SSR).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- tilsiktet: synkroniserer med en client-only kilde (localStorage) én gang ved mount
    setCalibration(loadCalibration());
  }, []);

  const latestRaw = serial.rawHistory.at(-1);
  const recentWindow = serial.rawHistory.slice(-CAPTURE_SAMPLES);
  const recentStdDev =
    recentWindow.length >= CAPTURE_SAMPLES
      ? standardDeviation(recentWindow)
      : null;
  const isStable =
    recentStdDev !== null && recentStdDev < STABILITY_THRESHOLD;

  const liveKg = useMemo(() => {
    if (!calibration || latestRaw === undefined) return null;
    return rawToKg(latestRaw, calibration);
  }, [calibration, latestRaw]);

  const kgHistory = useMemo(() => {
    if (!calibration) return [];
    return serial.rawHistory.map((raw) => rawToKg(raw, calibration));
  }, [serial.rawHistory, calibration]);

  const wizardStep: 1 | 2 | 3 = calibration
    ? 3
    : offsetRaw !== null
      ? 2
      : 1;

  function handleTare() {
    const capture = captureStable(serial.rawHistory);
    if (!capture) {
      setWizardMessage(
        "Ikke nok data ennå — vent noen sekunder til strømmen har stabilisert seg."
      );
      return;
    }
    setOffsetRaw(capture.value);
    setWizardMessage(
      `Nullpunkt satt til ${capture.value.toFixed(0)} (støy σ=${capture.stdDev.toFixed(1)} counts).`
    );
  }

  async function handleCalibrate() {
    const knownWeightKg = Number.parseFloat(knownWeightInput.replace(",", "."));
    if (offsetRaw === null) {
      setWizardMessage("Gjør tare (steg 1) først.");
      return;
    }
    if (!Number.isFinite(knownWeightKg) || knownWeightKg <= 0) {
      setWizardMessage("Skriv inn en gyldig kjent vekt i kg (f.eks. 5).");
      return;
    }
    const capture = captureStable(serial.rawHistory);
    if (!capture) {
      setWizardMessage(
        "Ikke nok data ennå — vent noen sekunder til strømmen har stabilisert seg."
      );
      return;
    }

    const countsPerKg = computeCountsPerKg(
      capture.value,
      offsetRaw,
      knownWeightKg
    );
    const data: CalibrationData = {
      offsetRaw,
      countsPerKg,
      knownWeightKg,
      calibratedAt: new Date().toLocaleString("no-NO"),
    };
    saveCalibration(data);
    setCalibration(data);

    try {
      await saveCalibrationProfile({
        deviceLabel: "ESP32 #1",
        offsetRaw,
        countsPerKg,
      });
      setWizardMessage(
        `Kalibrert og lagret i databasen! ${countsPerKg.toFixed(1)} counts/kg (støy σ=${capture.stdDev.toFixed(1)} counts).`
      );
    } catch (err) {
      // Kalibreringen er uansett lagret lokalt (localStorage) og brukbar —
      // databaselagring er kun nødvendig for å starte treningsøkter.
      setWizardMessage(
        `Kalibrert lokalt, men kunne ikke lagres i databasen: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  function handleResetCalibration() {
    clearCalibration();
    setCalibration(null);
    setOffsetRaw(null);
    setKnownWeightInput("");
    setWizardMessage("Kalibrering nullstilt. Start med tare (steg 1).");
  }

  async function handleCopySnippet() {
    if (!calibration) return;
    await navigator.clipboard.writeText(generateArduinoSnippet(calibration));
    setCopyFeedback(true);
    setTimeout(() => setCopyFeedback(false), 2000);
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Fingerstyrkemåler — kalibrering</h1>
        <p className="text-sm" style={{ color: "var(--viz-text-secondary)" }}>
          Kobler til ESP32 direkte over USB (Web Serial API) og regner om
          rå ADC-verdier til kilogram. Ingen endring i firmware nødvendig.
        </p>
      </header>

      {!serial.isSupported && (
        <div
          className="rounded-md border p-3 text-sm"
          style={{
            borderColor: "var(--viz-critical)",
            color: "var(--viz-critical)",
          }}
        >
          Web Serial API støttes ikke i denne nettleseren. Åpne siden i
          Chrome eller Edge.
        </div>
      )}

      <section
        className="flex items-center justify-between gap-4 rounded-md border p-4"
        style={{ borderColor: "var(--viz-border)" }}
      >
        <div className="flex items-center gap-2">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: STATUS_COLOR[serial.status] }}
            aria-hidden
          />
          <span className="text-sm font-medium">
            {STATUS_LABEL[serial.status]}
          </span>
        </div>
        {serial.status === "connected" ? (
          <button
            onClick={() => void serial.disconnect()}
            className="rounded-md border px-3 py-1.5 text-sm font-medium"
            style={{ borderColor: "var(--viz-border)" }}
          >
            Koble fra
          </button>
        ) : (
          <button
            onClick={() => void serial.connect()}
            disabled={!serial.isSupported || serial.status === "connecting"}
            className="rounded-md px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
            style={{ backgroundColor: "var(--viz-series-1)" }}
          >
            Koble til sensor
          </button>
        )}
      </section>

      {serial.errorMessage && (
        <div
          className="rounded-md border p-3 text-sm"
          style={{
            borderColor: "var(--viz-critical)",
            color: "var(--viz-critical)",
          }}
        >
          {serial.errorMessage}
        </div>
      )}

      <section
        className="rounded-md border p-4"
        style={{ borderColor: "var(--viz-border)" }}
      >
        <div
          className="mb-2 text-xs"
          style={{ color: "var(--viz-text-muted)" }}
        >
          {calibration ? "Live vekt" : "Live rå-verdi (ukalibrert)"}
        </div>
        <div className="font-semibold" style={{ fontSize: 48, lineHeight: 1 }}>
          {calibration
            ? liveKg !== null
              ? `${liveKg.toFixed(2)} kg`
              : "—"
            : latestRaw !== undefined
              ? latestRaw.toFixed(0)
              : "—"}
        </div>
        <div className="mt-4">
          <RawSparkline
            values={calibration ? kgHistory : serial.rawHistory}
            formatValue={(v) =>
              calibration ? `${v.toFixed(2)} kg` : v.toFixed(0)
            }
            referenceValue={calibration ? 0 : undefined}
          />
        </div>
        {recentStdDev !== null && (
          <div
            className="mt-2 text-xs"
            style={{
              color: isStable ? "var(--viz-good)" : "var(--viz-warning)",
            }}
          >
            {isStable
              ? "Stabil avlesning"
              : `Ustabil (σ=${recentStdDev.toFixed(0)} counts) — hold sensoren i ro`}
          </div>
        )}
      </section>

      <section
        className="rounded-md border p-4"
        style={{ borderColor: "var(--viz-border)" }}
      >
        <h2 className="mb-3 text-lg font-semibold">Kalibrering</h2>

        {wizardStep === 3 && calibration ? (
          <div className="flex flex-col gap-3">
            <div
              className="rounded-md p-3 text-sm"
              style={{
                backgroundColor:
                  "color-mix(in srgb, var(--viz-good) 12%, transparent)",
                color: "var(--viz-good)",
              }}
            >
              Kalibrert {calibration.calibratedAt} med{" "}
              {calibration.knownWeightKg} kg referansevekt.
            </div>
            <dl className="grid grid-cols-2 gap-y-1 text-sm">
              <dt style={{ color: "var(--viz-text-secondary)" }}>
                Nullpunkt (offset)
              </dt>
              <dd
                className="text-right"
                style={{ fontVariantNumeric: "tabular-nums" }}
              >
                {calibration.offsetRaw.toFixed(0)}
              </dd>
              <dt style={{ color: "var(--viz-text-secondary)" }}>
                Skalering
              </dt>
              <dd
                className="text-right"
                style={{ fontVariantNumeric: "tabular-nums" }}
              >
                {calibration.countsPerKg.toFixed(2)} counts/kg
              </dd>
            </dl>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={handleResetCalibration}
                className="rounded-md border px-3 py-1.5 text-sm font-medium"
                style={{ borderColor: "var(--viz-border)" }}
              >
                Kalibrer på nytt
              </button>
              <button
                onClick={() => void handleCopySnippet()}
                className="rounded-md border px-3 py-1.5 text-sm font-medium"
                style={{ borderColor: "var(--viz-border)" }}
              >
                {copyFeedback ? "Kopiert!" : "Kopiér Arduino-kode"}
              </button>
            </div>
            <p className="text-xs" style={{ color: "var(--viz-text-muted)" }}>
              Koden over er ferdig til å limes inn i firmware-steg 3, når
              kalibreringen skal flyttes on-device (f.eks. for BLE-utsending
              i kg i stedet for rå counts).
            </p>
          </div>
        ) : (
          <ol className="flex flex-col gap-4">
            <li className="flex flex-col gap-2">
              <div className="text-sm font-medium">
                Steg 1 — Nullpunkt (tare)
              </div>
              <p
                className="text-xs"
                style={{ color: "var(--viz-text-secondary)" }}
              >
                La sensoren henge/stå helt i ro og uten last, trykk deretter
                knappen.
              </p>
              <button
                onClick={handleTare}
                disabled={serial.status !== "connected"}
                className="w-fit rounded-md px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                style={{ backgroundColor: "var(--viz-series-1)" }}
              >
                Sett nullpunkt
              </button>
              {offsetRaw !== null && (
                <div className="text-xs" style={{ color: "var(--viz-good)" }}>
                  Nullpunkt satt: {offsetRaw.toFixed(0)}
                </div>
              )}
            </li>

            <li className="flex flex-col gap-2">
              <div className="text-sm font-medium">Steg 2 — Kjent vekt</div>
              <p
                className="text-xs"
                style={{ color: "var(--viz-text-secondary)" }}
              >
                Heng på eller påfør en kjent vekt (f.eks. en kalibreringslodd
                eller noe du har veid), skriv inn vekten i kg, og trykk
                knappen mens vekten er stabilt påført.
              </p>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  inputMode="decimal"
                  value={knownWeightInput}
                  onChange={(e) => setKnownWeightInput(e.target.value)}
                  placeholder="f.eks. 5"
                  disabled={offsetRaw === null}
                  className="w-24 rounded-md border px-2 py-1.5 text-sm disabled:opacity-50"
                  style={{ borderColor: "var(--viz-border)" }}
                />
                <span
                  className="text-sm"
                  style={{ color: "var(--viz-text-secondary)" }}
                >
                  kg
                </span>
                <button
                  onClick={() => void handleCalibrate()}
                  disabled={
                    offsetRaw === null || serial.status !== "connected"
                  }
                  className="rounded-md px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                  style={{ backgroundColor: "var(--viz-series-1)" }}
                >
                  Registrer kalibreringsvekt
                </button>
              </div>
            </li>
          </ol>
        )}

        {wizardMessage && (
          <div
            className="mt-3 text-xs"
            style={{ color: "var(--viz-text-secondary)" }}
          >
            {wizardMessage}
          </div>
        )}
      </section>

      <section
        className="rounded-md border p-4"
        style={{ borderColor: "var(--viz-border)" }}
      >
        <h2 className="mb-2 text-sm font-semibold">Debug-logg fra firmware</h2>
        <div
          className="flex max-h-40 flex-col gap-0.5 overflow-y-auto rounded-md p-2 font-mono text-xs"
          style={{ backgroundColor: "var(--viz-surface)" }}
        >
          {serial.log.length === 0 ? (
            <span style={{ color: "var(--viz-text-muted)" }}>
              Ingen meldinger ennå.
            </span>
          ) : (
            serial.log.map((entry) => (
              <span
                key={entry.timestamp + entry.text}
                style={{
                  color:
                    entry.kind === "error"
                      ? "var(--viz-critical)"
                      : "var(--viz-text-secondary)",
                }}
              >
                {entry.text}
              </span>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
