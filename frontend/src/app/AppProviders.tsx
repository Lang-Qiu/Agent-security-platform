import { App as AntdApp, ConfigProvider, theme } from "antd";

import type { ReactNode } from "react";

import { consoleThemeTokens } from "../styles/console-theme";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ConfigProvider
      theme={{
        algorithm: [theme.darkAlgorithm, theme.compactAlgorithm],
        token: {
          ...consoleThemeTokens,
          fontFamily: "'Aptos', 'Segoe UI Variable Text', 'Segoe UI', sans-serif"
        }
      }}
    >
      <AntdApp>{children}</AntdApp>
    </ConfigProvider>
  );
}
