import { Navigate, type RouteObject } from "react-router-dom";

import { ConsoleLayout } from "../layouts/ConsoleLayout";
import { AssetResultPage } from "../pages/AssetResultPage";
import { OverviewPage } from "../pages/OverviewPage";
import { SandboxAlertsPage } from "../pages/SandboxAlertsPage";
import { StaticAnalysisPage } from "../pages/StaticAnalysisPage";
import { TaskDetailPage } from "../pages/TaskDetailPage";
import { TaskListPage } from "../pages/TaskListPage";

export const appRoutes: RouteObject[] = [
  {
    path: "/",
    element: <ConsoleLayout />,
    children: [
      {
        index: true,
        element: <Navigate to="/overview" replace />
      },
      {
        path: "overview",
        element: <OverviewPage />
      },
      {
        path: "tasks",
        element: <TaskListPage />
      },
      {
        path: "tasks/:taskId",
        element: <TaskDetailPage />
      },
      {
        path: "results/assets",
        element: <AssetResultPage />
      },
      {
        path: "results/static-analysis",
        element: <StaticAnalysisPage />
      },
      {
        path: "results/sandbox",
        element: <SandboxAlertsPage />
      }
    ]
  }
];
