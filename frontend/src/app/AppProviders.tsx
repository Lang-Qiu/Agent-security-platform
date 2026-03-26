import { App as AntdApp, ConfigProvider } from "antd";

import type { ReactNode } from "react";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ConfigProvider
      theme={{
        token: {
          colorPrimary: "#146c72",
          colorInfo: "#146c72",
          colorBgBase: "#f3f7f6",
          colorTextBase: "#102a2d",
          colorBorder: "#d7e3e2",
          borderRadius: 16,
          fontFamily: "'Aptos', 'Segoe UI Variable Text', 'Segoe UI', sans-serif"
        }
      }}
    >
      <AntdApp>{children}</AntdApp>
    </ConfigProvider>
  );
}
