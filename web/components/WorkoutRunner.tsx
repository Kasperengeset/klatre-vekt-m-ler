"use client";

import { useEffect, useRef, useState } from "react";
import { useSerial } from "@/components/SerialProvider";
import {
  type CalibrationData,
  loadCalibration,
  rawToKg,
} from "@/lib/calibration";
import { startSession, recordPull, type WorkoutTemplate } from "@/lib/actions";
import { playBeep } from "@/lib/beep";
import { CreateTemplateForm } from "@/components/CreateTemplateForm";

type Phase = "idle" | "get-ready" | "hang" | "rest" | "set-rest" | "done";

const GET_READY_SECONDS = 3;

const PHASE_LABEL: Record<Phase, string> = {
  idle: "",
  "get-ready": "Klargjør",
  hang: "HENG",
  rest: "Pause",
  "set-rest": "Pause mellom sett",
  done: "Ferdig!",
};

const PHASE_COLOR: Record<Phase, string> = {
  idle: "var(--viz-text-secondary)",
  "get-ready": "var(--viz-warning)",
  hang: "var(--viz-series-1)",
  rest: "var(--viz-text-secondary)",
  "set-rest": "var(--viz-warning)",
  done: "var(--viz-good)",
};

interface CompletedPull {
  set: number;
  rep: number;
  maxForceKg: number;
}

interface WorkoutRunnerProps {
  templates: WorkoutTemplate[];
}

export function WorkoutRunner({ templates }: WorkoutRunnerProps) {
  const serial = useSerial();

  const [calibration, setCalibration] = useState<CalibrationData | null>(
    null
  );
  useEffect(() => {
    // Samme mønster som forsiden: localStorage finnes ikke under SSR, så
    // vi laster kalibreringen først etter mount for å unngå hydration-mismatch.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- tilsiktet: synkroniserer med en client-only kilde (localStorage) én gang ved mount
    setCalibration(loadCalibration());
  }, []);

  const [selectedTemplate, setSelectedTemplate] =
    useState<WorkoutTemplate | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [currentSet, setCurrentSet] = useState(1);
  const [currentRep, setCurrentRep] = useState(1);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [completedPulls, setCompletedPulls] = useState<CompletedPull[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);

  const repSamplesRef = useRef<{ tMs: number; kg: number }[]>([]);
  const repStartRef = useRef(0);
  const processedRawCountRef = useRef(0);

  const latestRaw = serial.rawHistory.at(-1);
  const liveKg =
    calibration && latestRaw !== undefined
      ? rawToKg(latestRaw, calibration)
      : null;

  // Samler inn samples mens vi er i "hang"-fasen, til bruk for
  // max/gjennomsnitt-kraft og kraftkurve for det pågående draget.
  useEffect(() => {
    if (phase !== "hang" || !calibration) return;
    const newRaws = serial.rawHistory.slice(processedRawCountRef.current);
    processedRawCountRef.current = serial.rawHistory.length;
    const now = performance.now();
    for (const raw of newRaws) {
      repSamplesRef.current.push({
        tMs: now - repStartRef.current,
        kg: rawToKg(raw, calibration),
      });
    }
  }, [serial.rawHistory, phase, calibration]);

  // Selve nedtellingen — én tikk i sekundet mens en fase pågår.
  useEffect(() => {
    if (phase === "idle" || phase === "done") return;
    const id = setInterval(() => {
      setSecondsLeft((s) => Math.max(0, s - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [phase]);

  // Fase-overganger — trigges når nedtellingen når 0. Dette er en tilstandsmaskin
  // synkronisert mot en ekstern klokke (setInterval over), ikke avledet render-state,
  // så setState her er tilsiktet og ikke en render-kaskade å unngå.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!selectedTemplate) return;
    if (phase === "idle" || phase === "done") return;
    if (secondsLeft !== 0) return;

    if (phase === "get-ready") {
      playBeep(880, 200);
      repStartRef.current = performance.now();
      repSamplesRef.current = [];
      setPhase("hang");
      setSecondsLeft(selectedTemplate.hangSeconds);
      return;
    }

    if (phase === "hang") {
      playBeep(440, 150);
      const samples = repSamplesRef.current;
      const kgValues = samples.map((s) => s.kg);
      const maxForceKg = kgValues.length ? Math.max(...kgValues) : 0;
      const avgForceKg = kgValues.length
        ? kgValues.reduce((a, b) => a + b, 0) / kgValues.length
        : null;
      const durationMs = samples.length
        ? samples[samples.length - 1].tMs
        : null;

      if (sessionId !== null) {
        const setNum = currentSet;
        const repNum = currentRep;
        recordPull({
          sessionId,
          setNumber: setNum,
          repNumber: repNum,
          maxForceKg,
          avgForceKg,
          durationMs,
          samples: samples.length ? samples : null,
        }).catch((err) => {
          setErrorMessage(err instanceof Error ? err.message : String(err));
        });
        setCompletedPulls((prev) => [
          ...prev,
          { set: setNum, rep: repNum, maxForceKg },
        ]);
      }

      const isLastRepInSet = currentRep >= selectedTemplate.repsPerSet;
      const isLastSet = currentSet >= selectedTemplate.sets;

      if (isLastRepInSet && isLastSet) {
        setPhase("done");
        setSecondsLeft(0);
      } else if (isLastRepInSet) {
        setPhase("set-rest");
        setSecondsLeft(selectedTemplate.restBetweenSetsSeconds);
        setCurrentSet((s) => s + 1);
        setCurrentRep(1);
      } else {
        setPhase("rest");
        setSecondsLeft(selectedTemplate.restSeconds);
        setCurrentRep((r) => r + 1);
      }
      return;
    }

    if (phase === "rest" || phase === "set-rest") {
      playBeep(880, 200);
      repStartRef.current = performance.now();
      repSamplesRef.current = [];
      setPhase("hang");
      setSecondsLeft(selectedTemplate.hangSeconds);
    }
  }, [secondsLeft, phase, selectedTemplate, sessionId, currentSet, currentRep]);
  /* eslint-enable react-hooks/set-state-in-effect */

  async function handleStart() {
    if (!selectedTemplate) return;
    if (!calibration) {
      setErrorMessage(
        "Ingen kalibrering funnet. Gjør kalibrering på forsiden først."
      );
      return;
    }
    if (serial.status !== "connected") {
      setErrorMessage("Koble til sensoren først.");
      return;
    }
    setErrorMessage(null);
    try {
      const id = await startSession({ workoutTemplateId: selectedTemplate.id });
      setSessionId(id);
      setCurrentSet(1);
      setCurrentRep(1);
      setCompletedPulls([]);
      processedRawCountRef.current = serial.rawHistory.length;
      setPhase("get-ready");
      setSecondsLeft(GET_READY_SECONDS);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
    }
  }

  function handleReset() {
    setSelectedTemplate(null);
    setPhase("idle");
    setSessionId(null);
    setCompletedPulls([]);
    setErrorMessage(null);
  }

  if (phase === "idle" && !selectedTemplate) {
    if (showCreateForm) {
      return <CreateTemplateForm onDone={() => setShowCreateForm(false)} />;
    }

    return (
      <div className="flex flex-col gap-3">
        {templates.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--viz-text-muted)" }}>
            Ingen treningsmaler funnet i databasen ennå.
          </p>
        ) : (
          templates.map((t) => (
            <button
              key={t.id}
              onClick={() => setSelectedTemplate(t)}
              className="rounded-md border p-4 text-left"
              style={{ borderColor: "var(--viz-border)" }}
            >
              <div className="font-medium">{t.name}</div>
              {t.description && (
                <div
                  className="text-sm"
                  style={{ color: "var(--viz-text-secondary)" }}
                >
                  {t.description}
                </div>
              )}
              <div
                className="mt-1 text-xs"
                style={{ color: "var(--viz-text-muted)" }}
              >
                {t.repsPerSet} drag à {t.hangSeconds}s hold / {t.restSeconds}s
                pause · {t.sets} sett · {t.restBetweenSetsSeconds}s pause
                mellom sett
              </div>
            </button>
          ))
        )}
        <button
          onClick={() => setShowCreateForm(true)}
          className="w-fit rounded-md border px-3 py-1.5 text-sm font-medium"
          style={{ borderColor: "var(--viz-border)" }}
        >
          + Ny mal
        </button>
      </div>
    );
  }

  if (phase === "idle" && selectedTemplate) {
    return (
      <div
        className="flex flex-col gap-4 rounded-md border p-4"
        style={{ borderColor: "var(--viz-border)" }}
      >
        <div>
          <div className="text-lg font-semibold">{selectedTemplate.name}</div>
          {selectedTemplate.description && (
            <div
              className="text-sm"
              style={{ color: "var(--viz-text-secondary)" }}
            >
              {selectedTemplate.description}
            </div>
          )}
        </div>

        {serial.status !== "connected" && (
          <div className="text-sm" style={{ color: "var(--viz-warning)" }}>
            Sensoren er ikke tilkoblet. Koble til på forsiden eller under
            &ldquo;Kalibrering&rdquo;-fanen.
          </div>
        )}
        {!calibration && (
          <div className="text-sm" style={{ color: "var(--viz-warning)" }}>
            Ingen kalibrering funnet — gjør kalibrering på forsiden først.
          </div>
        )}
        {errorMessage && (
          <div className="text-sm" style={{ color: "var(--viz-critical)" }}>
            {errorMessage}
          </div>
        )}

        <div className="flex gap-2">
          <button
            onClick={() => setSelectedTemplate(null)}
            className="rounded-md border px-3 py-1.5 text-sm font-medium"
            style={{ borderColor: "var(--viz-border)" }}
          >
            Tilbake
          </button>
          <button
            onClick={() => void handleStart()}
            className="rounded-md px-3 py-1.5 text-sm font-medium text-white"
            style={{ backgroundColor: "var(--viz-series-1)" }}
          >
            Start økt
          </button>
        </div>
      </div>
    );
  }

  if (phase === "done") {
    return (
      <div
        className="flex flex-col gap-4 rounded-md border p-4"
        style={{ borderColor: "var(--viz-border)" }}
      >
        <div className="text-lg font-semibold" style={{ color: "var(--viz-good)" }}>
          Økt fullført!
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ color: "var(--viz-text-secondary)" }}>
              <th className="text-left font-normal">Sett</th>
              <th className="text-left font-normal">Drag</th>
              <th className="text-right font-normal">Maks kraft</th>
            </tr>
          </thead>
          <tbody style={{ fontVariantNumeric: "tabular-nums" }}>
            {completedPulls.map((p, i) => (
              <tr key={i}>
                <td>{p.set}</td>
                <td>{p.rep}</td>
                <td className="text-right">{p.maxForceKg.toFixed(2)} kg</td>
              </tr>
            ))}
          </tbody>
        </table>
        <button
          onClick={handleReset}
          className="w-fit rounded-md border px-3 py-1.5 text-sm font-medium"
          style={{ borderColor: "var(--viz-border)" }}
        >
          Tilbake til økter
        </button>
      </div>
    );
  }

  // Aktiv fase: get-ready / hang / rest / set-rest
  return (
    <div
      className="flex flex-col items-center gap-4 rounded-md border p-6"
      style={{ borderColor: "var(--viz-border)" }}
    >
      <div
        className="text-sm font-medium"
        style={{ color: "var(--viz-text-secondary)" }}
      >
        {selectedTemplate?.name} · Sett {currentSet} av {selectedTemplate?.sets}{" "}
        · Drag {currentRep} av {selectedTemplate?.repsPerSet}
      </div>

      <div
        className="text-xl font-semibold"
        style={{ color: PHASE_COLOR[phase] }}
      >
        {PHASE_LABEL[phase]}
      </div>

      <div className="font-semibold" style={{ fontSize: 72, lineHeight: 1 }}>
        {secondsLeft}
      </div>

      {phase === "hang" && (
        <div className="text-lg" style={{ fontVariantNumeric: "tabular-nums" }}>
          {liveKg !== null ? `${liveKg.toFixed(2)} kg` : "—"}
        </div>
      )}

      {errorMessage && (
        <div className="text-sm" style={{ color: "var(--viz-critical)" }}>
          {errorMessage}
        </div>
      )}

      <button
        onClick={handleReset}
        className="rounded-md border px-3 py-1.5 text-sm font-medium"
        style={{ borderColor: "var(--viz-border)" }}
      >
        Avbryt økt
      </button>
    </div>
  );
}
