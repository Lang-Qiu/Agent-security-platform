import { createBrowserRouter, RouterProvider } from "react-router-dom";

import { AppProviders } from "./AppProviders";
import { appRoutes } from "./routes";

const router = createBrowserRouter(appRoutes);

export function App() {
  return (
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>
  );
}
