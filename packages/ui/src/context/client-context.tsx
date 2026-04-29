import type { PraxisClient } from "@praxis/core/types";
import { createContext, useContext } from "react";

const ClientContext = createContext<PraxisClient | null>(null);

export interface PraxisClientProviderProps {
  client: PraxisClient;
  children: React.ReactNode;
}

export function PraxisClientProvider({ client, children }: PraxisClientProviderProps) {
  return <ClientContext.Provider value={client}>{children}</ClientContext.Provider>;
}

export function usePraxisClient(): PraxisClient {
  const client = useContext(ClientContext);
  if (!client) {
    throw new Error("usePraxisClient must be used within a PraxisClientProvider");
  }
  return client;
}
