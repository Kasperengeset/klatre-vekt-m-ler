"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createWorkoutTemplate } from "@/lib/actions";

interface CreateTemplateFormProps {
  onDone: () => void;
}

const inputStyle = {
  borderColor: "var(--viz-border)",
};

export function CreateTemplateForm({ onDone }: CreateTemplateFormProps) {
  const router = useRouter();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [hangSeconds, setHangSeconds] = useState("7");
  const [restSeconds, setRestSeconds] = useState("3");
  const [repsPerSet, setRepsPerSet] = useState("6");
  const [sets, setSets] = useState("3");
  const [restBetweenSetsSeconds, setRestBetweenSetsSeconds] = useState("120");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const parsed = {
      hangSeconds: Number.parseInt(hangSeconds, 10),
      restSeconds: Number.parseInt(restSeconds, 10),
      repsPerSet: Number.parseInt(repsPerSet, 10),
      sets: Number.parseInt(sets, 10),
      restBetweenSetsSeconds: Number.parseInt(restBetweenSetsSeconds, 10),
    };

    if (!name.trim()) {
      setErrorMessage("Navn er påkrevd.");
      return;
    }
    if (parsed.hangSeconds <= 0) {
      setErrorMessage("Hold må være mer enn 0 sekunder.");
      return;
    }
    if (parsed.repsPerSet <= 0) {
      setErrorMessage("Antall drag per sett må være mer enn 0.");
      return;
    }
    if (parsed.sets <= 0) {
      setErrorMessage("Antall sett må være mer enn 0.");
      return;
    }
    if (
      Number.isNaN(parsed.restSeconds) ||
      Number.isNaN(parsed.restBetweenSetsSeconds) ||
      parsed.restSeconds < 0 ||
      parsed.restBetweenSetsSeconds < 0
    ) {
      setErrorMessage("Pauser kan ikke være negative.");
      return;
    }

    setErrorMessage(null);
    setIsSaving(true);
    try {
      await createWorkoutTemplate({
        name: name.trim(),
        description: description.trim() ? description.trim() : null,
        ...parsed,
      });
      router.refresh();
      onDone();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form
      onSubmit={(e) => void handleSubmit(e)}
      className="flex flex-col gap-4 rounded-md border p-4"
      style={{ borderColor: "var(--viz-border)" }}
    >
      <div className="text-lg font-semibold">Ny treningsmal</div>

      <label className="flex flex-col gap-1 text-sm">
        Navn
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="f.eks. Repeaters 7/3"
          className="rounded-md border px-2 py-1.5"
          style={inputStyle}
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        Beskrivelse (valgfritt)
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="f.eks. 6 drag à 7s hold / 3s pause, 3 sett"
          className="rounded-md border px-2 py-1.5"
          style={inputStyle}
        />
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-sm">
          Hold (sek)
          <input
            type="number"
            min={1}
            value={hangSeconds}
            onChange={(e) => setHangSeconds(e.target.value)}
            className="rounded-md border px-2 py-1.5"
            style={inputStyle}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Pause mellom drag (sek)
          <input
            type="number"
            min={0}
            value={restSeconds}
            onChange={(e) => setRestSeconds(e.target.value)}
            className="rounded-md border px-2 py-1.5"
            style={inputStyle}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Drag per sett
          <input
            type="number"
            min={1}
            value={repsPerSet}
            onChange={(e) => setRepsPerSet(e.target.value)}
            className="rounded-md border px-2 py-1.5"
            style={inputStyle}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Antall sett
          <input
            type="number"
            min={1}
            value={sets}
            onChange={(e) => setSets(e.target.value)}
            className="rounded-md border px-2 py-1.5"
            style={inputStyle}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Pause mellom sett (sek)
          <input
            type="number"
            min={0}
            value={restBetweenSetsSeconds}
            onChange={(e) => setRestBetweenSetsSeconds(e.target.value)}
            className="rounded-md border px-2 py-1.5"
            style={inputStyle}
          />
        </label>
      </div>

      {errorMessage && (
        <div className="text-sm" style={{ color: "var(--viz-critical)" }}>
          {errorMessage}
        </div>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onDone}
          className="rounded-md border px-3 py-1.5 text-sm font-medium"
          style={{ borderColor: "var(--viz-border)" }}
        >
          Avbryt
        </button>
        <button
          type="submit"
          disabled={isSaving}
          className="rounded-md px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          style={{ backgroundColor: "var(--viz-series-1)" }}
        >
          {isSaving ? "Lagrer …" : "Lagre mal"}
        </button>
      </div>
    </form>
  );
}
