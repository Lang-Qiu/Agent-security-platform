import {
  AppstoreOutlined,
  BarsOutlined,
  CompassOutlined,
  RadarChartOutlined,
  SafetyCertificateOutlined,
  ScanOutlined,
  ThunderboltOutlined
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
  },
  {
    key: "sandbox-security",
    label: "沙箱安全",
    icon: <SafetyCertificateOutlined />,
    children: [
      {
        key: "/sandbox-security/workbench",
        label: "评估工作台",
        path: "/sandbox-security/workbench",
        icon: <RadarChartOutlined />
      },
      {
        key: "/sandbox-security/audit",
        label: "审计事件",
        path: "/sandbox-security/audit",
        icon: <ScanOutlined />
      }
    ]
  },
  {
    key: "/review-demo",
    label: "评审模式",
    path: "/review-demo",
    icon: <CompassOutlined />
  },
  // Top-level, not a third child of the sandbox-security group: the
  // GENERAL-005 navigation spec pins that group at exactly two children.
  {
    key: "/sandbox-security-showcase",
    label: "评估演示",
    path: "/sandbox-security-showcase",
    icon: <ThunderboltOutlined />
  }
];
