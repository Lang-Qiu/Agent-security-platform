import { render } from "@testing-library/react";
import { createMemoryRouter, RouterProvider, type RouteObject } from "react-router-dom";

import { act } from "react";
import { AppProviders } from "../app/AppProviders";
import { appRoutes } from "../app/routes";

export async function renderAppAtRoute(pathname: string): Promise<{
  router: ReturnType<typeof createMemoryRouter>;
} & ReturnType<typeof render>> {
  const router = createMemoryRouter(appRoutes as RouteObject[], {
    initialEntries: [pathname]
  });

  let renderedApp!: ReturnType<typeof render>;

  await act(async () => {
    renderedApp = render(
      <AppProviders>
        <RouterProvider router={router} />
      </AppProviders>
    );

    await Promise.resolve();
  });

  return {
    router,
    ...renderedApp
  };
}
