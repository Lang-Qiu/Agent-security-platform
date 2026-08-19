import { Navigate, type RouteObject } from "react-router-dom";

import { ConsoleLayout } from "../layouts/ConsoleLayout";
import { AssetResultPage } from "../pages/AssetResultPage";
import { OverviewPage } from "../pages/OverviewPage";
import { ReviewDemoPage } from "../pages/ReviewDemoPage";
import { SandboxAlertsPage } from "../pages/SandboxAlertsPage";
import { SandboxSecurityAuditPage } from "../pages/SandboxSecurityAuditPage";
import { SandboxSecurityShowcasePage } from "../pages/SandboxSecurityShowcasePage";
import { SandboxSecurityWorkbenchPage } from "../pages/SandboxSecurityWorkbenchPage";
import { StaticAnalysisPage } from "../pages/StaticAnalysisPage";
import { TaskDetailPage } from "../pages/TaskDetailPage";
import { TaskListPage } from "../pages/TaskListPage";

export const appRoutes: RouteObject[] = [
  {
    path: "/",
    lazy: async () => {
      const { LandingPage } = await import("../pages/LandingPage");

      return { Component: LandingPage };
    }
  },
  {
    path: "/console",
    element: <Navigate to="/overview" replace />
  },
  {
    element: <ConsoleLayout />,
    children: [
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
      },
      {
        path: "sandbox-security/workbench",
        element: <SandboxSecurityWorkbenchPage />
      },
      {
        path: "sandbox-security/audit",
        element: <SandboxSecurityAuditPage />
      },
      {
        path: "review-demo",
        element: <ReviewDemoPage />
      },
      {
        // Demonstration surface. Registered as its own route rather than as a
        // third child of the sandbox-security group: the GENERAL-005 navigation
        // spec pins that group at exactly two children, and the workbench route
        // must keep its no-mock-fallback guarantee.
        path: "sandbox-security-showcase",
        element: <SandboxSecurityShowcasePage />
      }
    ]
  }
];
