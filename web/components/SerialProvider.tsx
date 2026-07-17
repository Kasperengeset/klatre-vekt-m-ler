"use client";

import { createContext, useContext } from "react";
import { useHx711Serial } from "@/hooks/useHx711Serial";

type SerialContextValue = ReturnType<typeof useHx711Serial>;

const SerialContext = createContext<SerialContextValue | null>(null);

// Én delt seriell-tilkobling for hele appen, slik at du ikke må koble til
// sensoren på nytt når du navigerer mellom kalibrering ("/") og
// treningsøkter ("/trening").
export function SerialProvider({ children }: { children: React.ReactNode }) {
  const serial = useHx711Serial();
  return (
    <SerialContext.Provider value={serial}>{children}</SerialContext.Provider>
  );
}

export function useSerial(): SerialContextValue {
  const ctx = useContext(SerialContext);
  if (!ctx) {
    throw new Error("useSerial må brukes innenfor <SerialProvider>");
  }
  return ctx;
}
