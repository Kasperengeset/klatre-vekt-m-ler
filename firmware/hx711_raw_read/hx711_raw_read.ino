/*
 * ============================================================================
 *  HX711 RÅ-LESING — Steg 1 av fingerstyrkemåler
 * ============================================================================
 *  Formål: Bekrefte at HX711 + YZC-516C load cell fungerer mekanisk og
 *          elektrisk, ved å lese rå ADC-verdier og skrive dem til Serial.
 *
 *  IKKE inkludert ennå (kommer i senere steg, se merkede seksjoner nederst):
 *   - BLE (Bluetooth Low Energy)
 *   - Kalibrering (tare / skalering til kg)
 *
 *  Bibliotek: HX711 av Bogdan Necula (bogde) — se installasjonskommando
 *  i README/chat-svar.
 * ============================================================================
 */

#include <HX711.h>

// ----------------------------------------------------------------------------
// KONFIGURASJON — samle alle "magiske tall" her, lett å justere senere
// ----------------------------------------------------------------------------

// Pinner mot HX711 (iht. kobling: DT -> GPIO4, SCK -> GPIO5)
const uint8_t HX711_DOUT_PIN = 4;
const uint8_t HX711_SCK_PIN  = 5;

// Forsterkning / kanal. gain=128 tilsvarer kanal A med høyest forsterkning,
// som er standard for lastceller som denne (E+/E- = eksitasjon, A+/A- = signal).
const uint8_t HX711_GAIN = 128;

// Ønsket utskriftsrate. HX711 leverer normalt 10 samples/sekund når RATE-pinnen
// på modulen er lav/ikke koblet (vanligste konfigurasjon på billige breakout-kort).
// Vi lar derfor selve avlesningen (scale.read()) styre takten naturlig,
// og bruker denne konstanten bare til å style hvor mange rålesinger vi
// glatter over (se RUNNING_AVG_SAMPLES) — IKKE til å blokkere/vente ekstra.
const uint16_t SAMPLE_RATE_HZ = 10;

// Hvor mange rålesinger vi glatter (running average) for å redusere støy,
// uten å ofre oppdateringsraten. Med 4 samples ved 10 Hz "flytter" snittet
// seg over ca. 400 ms, som demper støy godt uten å gjøre avlesningen treg.
const uint8_t RUNNING_AVG_SAMPLES = 4;

// Hvor lenge vi venter på at HX711 skal melde "ready" før vi gir opp
// (både ved oppstart og i løpende drift). Dette er debug-signalet vårt
// siden vi ikke har multimeter.
const unsigned long HX711_READY_TIMEOUT_MS = 2000;

// Innebygd LED brukes til enkel status:
//  - Kort blink  = vellykket lesing
//  - Fast lys    = HX711 svarer ikke (feil)
// Mange generiske ESP32 dev-boards definerer ikke LED_BUILTIN i core'en.
// GPIO2 er vanligst for innebygd LED på slike kort — juster om ditt kort
// har LED på en annen pinne.
#ifndef LED_BUILTIN
#define LED_BUILTIN 2
#endif
const uint8_t STATUS_LED_PIN = LED_BUILTIN;

const uint32_t SERIAL_BAUD = 115200;

// ----------------------------------------------------------------------------
// GLOBALE OBJEKTER / TILSTAND
// ----------------------------------------------------------------------------

HX711 scale;

// Ringbuffer for glidende snitt av rå ADC-verdier
long rawSampleBuffer[RUNNING_AVG_SAMPLES];
uint8_t rawSampleIndex = 0;
bool rawBufferFilled = false;

// ----------------------------------------------------------------------------
// FORWARD DECLARATIONS
// ----------------------------------------------------------------------------

void printStartupBanner();
bool waitForHx711Ready(unsigned long timeoutMs);
long readSmoothedRaw();
void signalSuccess();
void signalError();

// ----------------------------------------------------------------------------
// SETUP
// ----------------------------------------------------------------------------

void setup() {
  pinMode(STATUS_LED_PIN, OUTPUT);
  digitalWrite(STATUS_LED_PIN, LOW);

  Serial.begin(SERIAL_BAUD);
  // Vent litt på seriell-monitor uten å blokkere for evig (viktig på ESP32
  // som ofte ikke trenger dette, men det er ufarlig å ha med).
  unsigned long serialWaitStart = millis();
  while (!Serial && (millis() - serialWaitStart) < 2000) {
    delay(10);
  }

  printStartupBanner();

  // Initialiser HX711 med valgte pinner og gain/kanal.
  scale.begin(HX711_DOUT_PIN, HX711_SCK_PIN, HX711_GAIN);

  Serial.println(F("Venter på at HX711 skal bli klar..."));
  if (waitForHx711Ready(HX711_READY_TIMEOUT_MS)) {
    Serial.println(F("HX711 ready"));
    Serial.println(F("Starter kontinuerlig rå-lesing (10 Hz, glidende snitt)."));
    Serial.println(F("Kolonner: raw_avg"));
  } else {
    // Sensoren svarer ikke — dette er hoved-debug-signalet vårt.
    Serial.println(F("FEIL: HX711 svarer ikke (is_ready() timeout)."));
    Serial.println(F("Sjekk følgende:"));
    Serial.println(F("  - VCC koblet til 3V3 (ikke 5V, ikke GND)"));
    Serial.println(F("  - GND koblet til felles GND med ESP32"));
    Serial.println(F("  - DT koblet til GPIO4"));
    Serial.println(F("  - SCK koblet til GPIO5"));
    Serial.println(F("  - At HX711-modulen faktisk får strøm (LED på modulen, hvis den har en)"));
    // Solid LED = feiltilstand, lar oss se problemet uten seriell-monitor åpen.
    digitalWrite(STATUS_LED_PIN, HIGH);
  }
}

// ----------------------------------------------------------------------------
// LOOP
// ----------------------------------------------------------------------------

void loop() {
  // Hver iterasjon tilsvarer i praksis én ny rålesing fra HX711 (~10 Hz når
  // modulen kjører på standard 10 SPS). scale.read() venter internt til en
  // ny konvertering er klar.
  if (!waitForHx711Ready(HX711_READY_TIMEOUT_MS)) {
    Serial.println(F("FEIL: HX711 timeout under lesing (mistet kontakt / strøm?)"));
    signalError();
    return;
  }

  long smoothedRaw = readSmoothedRaw();

  Serial.println(smoothedRaw);
  signalSuccess();

  // ==========================================================================
  //  HER KOMMER BLE-SENDING SENERE (steg 2)
  //  F.eks.: sendRawOverBle(smoothedRaw);
  // ==========================================================================

  // ==========================================================================
  //  HER KOMMER KALIBRERING SENERE (steg 3)
  //  F.eks.: float grams = (smoothedRaw - taredOffset) / calibrationFactor;
  // ==========================================================================
}

// ----------------------------------------------------------------------------
// HJELPEFUNKSJONER
// ----------------------------------------------------------------------------

void printStartupBanner() {
  Serial.println();
  Serial.println(F("============================================"));
  Serial.println(F(" Fingerstyrkemåler — steg 1: HX711 rå-lesing"));
  Serial.println(F("============================================"));
}

// Venter til HX711 er klar, med timeout slik at vi aldri fryser fast for evig.
// Returnerer true hvis klar innen tidsfristen, false ved timeout.
bool waitForHx711Ready(unsigned long timeoutMs) {
  return scale.wait_ready_timeout(timeoutMs, 10);
}

// Leser én ny rå ADC-verdi, legger den inn i ringbufferet, og returnerer
// det glidende snittet av de siste RUNNING_AVG_SAMPLES verdiene.
long readSmoothedRaw() {
  long newSample = scale.read();

  rawSampleBuffer[rawSampleIndex] = newSample;
  rawSampleIndex = (rawSampleIndex + 1) % RUNNING_AVG_SAMPLES;
  if (rawSampleIndex == 0) {
    rawBufferFilled = true;
  }

  uint8_t count = rawBufferFilled ? RUNNING_AVG_SAMPLES : rawSampleIndex;
  if (count == 0) {
    // Aller første kall, bufferet er tomt — returner rålesingen direkte.
    return newSample;
  }

  long sum = 0;
  for (uint8_t i = 0; i < count; i++) {
    sum += rawSampleBuffer[i];
  }
  return sum / count;
}

void signalSuccess() {
  // Kort blink som viser at vi har fått en gyldig lesing.
  digitalWrite(STATUS_LED_PIN, HIGH);
  delay(5);
  digitalWrite(STATUS_LED_PIN, LOW);
}

void signalError() {
  // Fast lys signaliserer feiltilstand (i motsetning til kort blink ved OK).
  digitalWrite(STATUS_LED_PIN, HIGH);
}
