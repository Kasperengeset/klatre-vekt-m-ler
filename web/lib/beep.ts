// Enkel varseltone via Web Audio API, så du slipper å se på skjermen
// mens du henger i sensoren under en økt.
export function playBeep(frequencyHz: number, durationMs: number) {
  if (typeof window === "undefined") return;
  const AudioContextClass =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AudioContextClass) return;

  const ctx = new AudioContextClass();
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.frequency.value = frequencyHz;
  oscillator.connect(gain);
  gain.connect(ctx.destination);
  gain.gain.setValueAtTime(0.2, ctx.currentTime);
  oscillator.start();
  gain.gain.exponentialRampToValueAtTime(
    0.0001,
    ctx.currentTime + durationMs / 1000
  );
  oscillator.stop(ctx.currentTime + durationMs / 1000);
  oscillator.onended = () => void ctx.close();
}
