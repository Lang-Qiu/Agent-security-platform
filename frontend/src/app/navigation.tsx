import {
  AppstoreOutlined,
  BarsOutlined,
  RadarChartOutlined,
  SafetyCertificateOutlined,
  ScanOutlined
} from "@ant-design/icons";

import type { ReactNode } from "react";

export interface ConsoleNavigationItem {
  key: string;
  label: string;
  path?: string;
  icon?: ReactNode;
  children?: ConsoleNavigationItem[];
}

export const consoleNavigation: ConsoleNavigationItem[] = [
  {
    key: "/overview",
    label: "Overview",
    path: "/overview",
    icon: <AppstoreOutlined />
  },
  {
    key: "/tasks",
    label: "Tasks",
    path: "/tasks",
    icon: <BarsOutlined />
  },
  {
    key: "results",
    label: "Results",
    icon: <SafetyCertificateOutlined />,
    children: [
      {
        key: "/results/assets",
        label: "Asset Results",
        path: "/results/assets",
        icon: <ScanOutlined />
      },
      {
        key: "/results/static-analysis",
        label: "Static Analysis",
        path: "/results/static-analysis",
        icon: <RadarChartOutlined />
      },
      {
        key: "/results/sandbox",
        label: "Sandbox Alerts",
        path: "/results/sandbox",
        icon: <SafetyCertificateOutlined />
      }
    ]
  }
];
