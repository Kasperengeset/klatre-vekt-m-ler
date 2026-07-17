import { listWorkoutTemplates } from "@/lib/actions";
import { WorkoutRunner } from "@/components/WorkoutRunner";

// Malene hentes fra en lokal SQLite-fil som kan endres uavhengig av appen
// (f.eks. via sqlite3-kommandolinjen) — siden må derfor alltid hente ferskt
// fra databasen per request, ikke bakes inn som statisk innhold ved build.
export const dynamic = "force-dynamic";

export default async function TreningPage() {
  const templates = await listWorkoutTemplates();

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Treningsøkter</h1>
        <p className="text-sm" style={{ color: "var(--viz-text-secondary)" }}>
          Velg en forhåndsdefinert økt og gjennomfør den med live
          styrkemåling. Resultatene logges automatisk til databasen.
        </p>
      </header>

      <WorkoutRunner templates={templates} />
    </div>
  );
}
