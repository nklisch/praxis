import type { PraxisClient } from "@praxis/core/types";
import { RouterProvider } from "@tanstack/react-router";
import { AuthProvider } from "./context/auth-context.js";
import { PraxisClientProvider } from "./context/client-context.js";
import { TabsProvider } from "./context/tabs-context.js";
import { router } from "./router.js";

export interface PraxisAppProps {
  client: PraxisClient;
}

export function PraxisApp({ client }: PraxisAppProps) {
  return (
    <PraxisClientProvider client={client}>
      <AuthProvider>
        <TabsProvider>
          <RouterProvider router={router} />
        </TabsProvider>
      </AuthProvider>
    </PraxisClientProvider>
  );
}
