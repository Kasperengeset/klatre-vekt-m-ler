PRAGMA foreign_keys = ON;

CREATE TABLE calibration_profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_label TEXT NOT NULL,
  offset_raw REAL NOT NULL,
  counts_per_kg REAL NOT NULL CHECK (counts_per_kg <> 0),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- En forhåndsdefinert treningsøkt-mal: faste intervaller (repeaters-stil).
-- F.eks. "6 drag à 7s hold / 3s pause, 3 sett, 2 min pause mellom sett".
CREATE TABLE workout_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  hang_seconds INTEGER NOT NULL CHECK (hang_seconds > 0),
  rest_seconds INTEGER NOT NULL CHECK (rest_seconds >= 0),
  reps_per_set INTEGER NOT NULL CHECK (reps_per_set > 0),
  sets INTEGER NOT NULL CHECK (sets > 0),
  rest_between_sets_seconds INTEGER NOT NULL CHECK (rest_between_sets_seconds >= 0),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  calibration_profile_id INTEGER NOT NULL REFERENCES calibration_profiles(id),
  -- NULL når økten er fri trening (ikke kjørt fra en mal).
  workout_template_id INTEGER REFERENCES workout_templates(id),
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  notes TEXT
);

CREATE TABLE pulls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL REFERENCES sessions(id),
  -- NULL for frie/manuelle drag som ikke hører til en mal-basert økt.
  set_number INTEGER,
  rep_number INTEGER,
  performed_at TEXT NOT NULL DEFAULT (datetime('now')),
  max_force_kg REAL NOT NULL,
  avg_force_kg REAL,
  duration_ms INTEGER,
  samples TEXT
);
