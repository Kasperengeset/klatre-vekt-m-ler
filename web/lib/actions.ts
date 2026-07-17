"use server";

import { getDb } from "./db";

export interface WorkoutTemplate {
  id: number;
  name: string;
  description: string | null;
  hangSeconds: number;
  restSeconds: number;
  repsPerSet: number;
  sets: number;
  restBetweenSetsSeconds: number;
}

interface WorkoutTemplateRow {
  id: number;
  name: string;
  description: string | null;
  hang_seconds: number;
  rest_seconds: number;
  reps_per_set: number;
  sets: number;
  rest_between_sets_seconds: number;
}

export async function listWorkoutTemplates(): Promise<WorkoutTemplate[]> {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT id, name, description, hang_seconds, rest_seconds, reps_per_set, sets, rest_between_sets_seconds
       FROM workout_templates
       ORDER BY name`
    )
    .all() as WorkoutTemplateRow[];

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    hangSeconds: r.hang_seconds,
    restSeconds: r.rest_seconds,
    repsPerSet: r.reps_per_set,
    sets: r.sets,
    restBetweenSetsSeconds: r.rest_between_sets_seconds,
  }));
}

export interface CreateWorkoutTemplateInput {
  name: string;
  description: string | null;
  hangSeconds: number;
  restSeconds: number;
  repsPerSet: number;
  sets: number;
  restBetweenSetsSeconds: number;
}

export async function createWorkoutTemplate(
  input: CreateWorkoutTemplateInput
): Promise<number> {
  const db = getDb();
  const result = db
    .prepare(
      `INSERT INTO workout_templates
        (name, description, hang_seconds, rest_seconds, reps_per_set, sets, rest_between_sets_seconds)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      input.name,
      input.description,
      input.hangSeconds,
      input.restSeconds,
      input.repsPerSet,
      input.sets,
      input.restBetweenSetsSeconds
    );
  return Number(result.lastInsertRowid);
}

export interface SaveCalibrationProfileInput {
  deviceLabel: string;
  offsetRaw: number;
  countsPerKg: number;
}

// Kalles fra kalibrerings-wizarden (i tillegg til localStorage) slik at
// treningsøkter alltid kan kobles til hvilken kalibrering som var aktiv.
export async function saveCalibrationProfile(
  input: SaveCalibrationProfileInput
): Promise<number> {
  const db = getDb();
  const result = db
    .prepare(
      `INSERT INTO calibration_profiles (device_label, offset_raw, counts_per_kg) VALUES (?, ?, ?)`
    )
    .run(input.deviceLabel, input.offsetRaw, input.countsPerKg);
  return Number(result.lastInsertRowid);
}

export interface StartSessionInput {
  workoutTemplateId: number | null;
  notes?: string;
}

export async function startSession(input: StartSessionInput): Promise<number> {
  const db = getDb();
  const latestCalibration = db
    .prepare(
      `SELECT id FROM calibration_profiles ORDER BY created_at DESC LIMIT 1`
    )
    .get() as { id: number } | undefined;

  if (!latestCalibration) {
    throw new Error(
      "Ingen kalibreringsprofil funnet. Gjennomfør kalibrering på forsiden først."
    );
  }

  const result = db
    .prepare(
      `INSERT INTO sessions (calibration_profile_id, workout_template_id, notes) VALUES (?, ?, ?)`
    )
    .run(latestCalibration.id, input.workoutTemplateId, input.notes ?? null);

  return Number(result.lastInsertRowid);
}

export interface RecordPullInput {
  sessionId: number;
  setNumber: number | null;
  repNumber: number | null;
  maxForceKg: number;
  avgForceKg: number | null;
  durationMs: number | null;
  samples: { tMs: number; kg: number }[] | null;
}

export async function recordPull(input: RecordPullInput): Promise<void> {
  const db = getDb();
  db.prepare(
    `INSERT INTO pulls (session_id, set_number, rep_number, max_force_kg, avg_force_kg, duration_ms, samples)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    input.sessionId,
    input.setNumber,
    input.repNumber,
    input.maxForceKg,
    input.avgForceKg,
    input.durationMs,
    input.samples ? JSON.stringify(input.samples) : null
  );
}
