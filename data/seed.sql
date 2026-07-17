INSERT INTO calibration_profiles (device_label, offset_raw, counts_per_kg)
VALUES ('ESP32 #1', -29005.0, 4123.5);

INSERT INTO workout_templates (name, description, hang_seconds, rest_seconds, reps_per_set, sets, rest_between_sets_seconds)
VALUES ('Repeaters 7/3', '6 drag à 7s hold / 3s pause, 3 sett', 7, 3, 6, 3, 120);

INSERT INTO workout_templates (name, description, hang_seconds, rest_seconds, reps_per_set, sets, rest_between_sets_seconds)
VALUES ('Max Hangs', '5 tunge drag à 10s med lang pause', 10, 180, 1, 5, 180);

INSERT INTO sessions (calibration_profile_id, workout_template_id, notes)
VALUES (1, 1, 'Testøkt');

INSERT INTO pulls (session_id, set_number, rep_number, max_force_kg, avg_force_kg, duration_ms)
VALUES (1, 1, 1, 42.3, 38.1, 4500);

SELECT * FROM pulls;
