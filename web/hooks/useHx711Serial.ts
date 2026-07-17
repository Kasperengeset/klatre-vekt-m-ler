"use client";

import { useCallback, useRef, useState } from "react";
import { LineBreakTransformer } from "@/lib/lineTransformer";

export type ConnectionStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "error";

export interface LogEntry {
  text: string;
  timestamp: number;
  kind: "info" | "error";
}

// HX711-firmwaren sender ~10 linjer/sekund. 200 samples ≈ 20 sekunder historikk,
// rikelig for både sparkline og stabile snitt ved tare/kalibrering.
const MAX_HISTORY = 200;
const MAX_LOG = 30;
const NUMERIC_LINE = /^-?\d+$/;

// Hook som eier Web Serial-tilkoblingen mot ESP32 + HX711-firmwaren.
// Rene rå-tall parses ut i rawHistory; alt annet (oppstartsbanner,
// feilmeldinger fra firmware) havner i log slik at feilsøking fortsatt
// er mulig fra nettleseren.
export function useHx711Serial() {
  const [status, setStatus] = useState<ConnectionStatus>("disconnected");
  const [rawHistory, setRawHistory] = useState<number[]>([]);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const portRef = useRef<SerialPort | null>(null);
  const readerRef = useRef<ReadableStreamDefaultReader<string> | null>(null);
  const pipeClosedRef = useRef<Promise<void> | null>(null);
  const cancelledRef = useRef(false);

  const isSupported =
    typeof navigator !== "undefined" && "serial" in navigator;

  const pushLog = useCallback(
    (text: string, kind: LogEntry["kind"] = "info") => {
      setLog((prev) => {
        const next = [...prev, { text, timestamp: Date.now(), kind }];
        return next.length > MAX_LOG ? next.slice(-MAX_LOG) : next;
      });
    },
    []
  );

  const disconnect = useCallback(async () => {
    cancelledRef.current = true;
    try {
      await readerRef.current?.cancel();
    } catch {
      // porten kan allerede være lukket, ufarlig
    }
    try {
      await pipeClosedRef.current?.catch(() => undefined);
    } catch {
      // ignorer
    }
    try {
      await portRef.current?.close();
    } catch {
      // ignorer
    }
    readerRef.current = null;
    portRef.current = null;
    setStatus("disconnected");
  }, []);

  const connect = useCallback(async () => {
    if (!isSupported) {
      setErrorMessage(
        "Web Serial API støttes ikke i denne nettleseren. Bruk Chrome eller Edge (over http://localhost eller https)."
      );
      setStatus("error");
      return;
    }

    setErrorMessage(null);
    setStatus("connecting");
    cancelledRef.current = false;

    try {
      const port = await navigator.serial.requestPort();
      await port.open({ baudRate: 115200 });
      portRef.current = port;

      if (!port.readable) {
        throw new Error("Porten mangler en lesbar stream.");
      }

      const textDecoder = new TextDecoderStream();
      // lib.dom typer TextDecoderStream.writable som WritableStream<BufferSource>,
      // mens pipeTo her krever nøyaktig WritableStream<Uint8Array> — trygt å caste,
      // Uint8Array er alltid en gyldig BufferSource.
      pipeClosedRef.current = port.readable
        .pipeTo(textDecoder.writable as WritableStream<Uint8Array>)
        .catch(() => undefined);

      const lineStream = textDecoder.readable.pipeThrough(
        new TransformStream(new LineBreakTransformer())
      );
      const reader = lineStream.getReader();
      readerRef.current = reader;

      setRawHistory([]);
      setLog([]);
      setStatus("connected");
      pushLog("Tilkoblet. Venter på data fra HX711 …");

      void (async () => {
        try {
          while (!cancelledRef.current) {
            const { value, done } = await reader.read();
            if (done) break;
            if (value === undefined) continue;
            const line = value.trim();
            if (line.length === 0) continue;

            if (NUMERIC_LINE.test(line)) {
              const raw = Number.parseInt(line, 10);
              setRawHistory((prev) => {
                const next = [...prev, raw];
                return next.length > MAX_HISTORY
                  ? next.slice(-MAX_HISTORY)
                  : next;
              });
            } else {
              const isError = line.toUpperCase().includes("FEIL");
              pushLog(line, isError ? "error" : "info");
            }
          }
        } catch (err) {
          if (!cancelledRef.current) {
            setErrorMessage(err instanceof Error ? err.message : String(err));
            setStatus("error");
          }
        } finally {
          reader.releaseLock();
        }
      })();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
      setStatus("error");
    }
  }, [isSupported, pushLog]);

  return {
    status,
    rawHistory,
    log,
    errorMessage,
    isSupported,
    connect,
    disconnect,
  };
}
