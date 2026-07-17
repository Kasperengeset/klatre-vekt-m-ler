# Klatre-vekt-måler

En DIY fingerstyrkemåler for klatretrening, bygget rundt en ESP32 og en
HX711-basert lastcelle. Måler drage-/trykkraft i sanntid, og lar deg
kalibrere sensoren og gjennomføre forhåndsdefinerte styrkeøkter
(f.eks. repeaters og max hangs) med automatisk logging av resultater.

## Status

Ferdig:
- Firmware leser rå ADC-verdier fra HX711 og strømmer dem over seriell (USB)
- Web-app for kalibrering (tare + kjent vekt → kg) via Web Serial API
- Lokal SQLite-database for kalibreringsprofiler, treningsmaler og økter
- Treningsøkt-wizard med nedtelling, lydsignal og automatisk logging per drag

Planlagt:
- Bluetooth (BLE), slik at sensoren ikke må være USB-tilkoblet

## Maskinvare

- ESP32 dev board
- HX711 24-bit ADC
- YZC-516C S-type lastcelle (100 kg, tension/compression)

**Kobling HX711 → ESP32:**

| HX711 | ESP32   |
| ----- | ------- |
| VCC   | 3V3     |
| GND   | GND     |
| DT    | GPIO4   |
| SCK   | GPIO5   |

## Prosjektstruktur

```
klatre-vekt-måler/
├── firmware/     Arduino-sketch for ESP32 (HX711 → seriell)
├── web/          Next.js/TypeScript-app: kalibrering + treningsøkter
└── data/         SQLite-skjema (schema.sql, seed.sql) + databasefil (ikke i git)
```

## Kom i gang

### Firmware

```bash
arduino-cli lib install "HX711"
arduino-cli compile --fqbn esp32:esp32:esp32 firmware/hx711_raw_read
arduino-cli upload -p /dev/cu.usbserial-XXX --fqbn esp32:esp32:esp32 firmware/hx711_raw_read
```

### Database

```bash
sqlite3 data/klatre-data.sqlite < data/schema.sql
sqlite3 data/klatre-data.sqlite < data/seed.sql   # valgfritt, eksempeldata
```

### Web-app

```bash
cd web
npm install
npm run dev
```

Åpne `http://localhost:3000` i **Chrome eller Edge** (Web Serial API
støttes ikke i Safari/Firefox). Koble til ESP32-en over USB, kjør
kalibrerings-wizarden, og gå til "Treningsøkter" for å starte en økt.

## Teknologi

- **Firmware:** Arduino (C++), [HX711-biblioteket av Bogdan Necula](https://github.com/bogde/HX711)
- **Web:** Next.js 16, TypeScript, Tailwind CSS, Web Serial API
- **Database:** SQLite (`better-sqlite3`), server actions for lesing/skriving
