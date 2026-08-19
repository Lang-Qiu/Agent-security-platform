import { BellOutlined, PlusOutlined, SafetyOutlined } from "@ant-design/icons";
import { Avatar, Button, Layout, Menu, Space, Typography } from "antd";
import { Link, Outlet, useLocation } from "react-router-dom";

import { consoleNavigation, type ConsoleNavigationItem } from "../app/navigation";
import { useRouteDocumentTitle } from "../app/useRouteDocumentTitle";

const { Header, Sider, Content } = Layout;
const { Text, Title } = Typography;

function flattenNavigationKeys(items: ConsoleNavigationItem[]): string[] {
  return items.flatMap((item) => {
    if (item.children) {
      return flattenNavigationKeys(item.children);
    }

    return item.path ? [item.path] : [];
  });
}

function navigationTitleByPath(items: ConsoleNavigationItem[]): Map<string, string> {
  const titles = new Map<string, string>();
  for (const item of items) {
    if (item.children) {
      for (const child of item.children) {
        if (child.path) titles.set(child.path, child.label);
      }
    } else if (item.path) {
      titles.set(item.path, item.label);
    }
  }
  return titles;
}

const ROUTE_TITLES = navigationTitleByPath(consoleNavigation);

// The banner carries the reference's English workspace titles; navigation
// labels stay localized. Unmapped routes fall back to the console name.
const BANNER_TITLE_OVERRIDES: Record<string, string> = {
  "/sandbox-security/workbench": "Sandbox Security Workbench",
  "/sandbox-security/audit": "Sandbox Security Audit Events"
};

function getSelectedNavigationKey(pathname: string): string {
  if (pathname.startsWith("/tasks/")) {
    return "/tasks";
  }

  const knownKeys = new Set(flattenNavigationKeys(consoleNavigation));
  return knownKeys.has(pathname) ? pathname : "/overview";
}

function toMenuItems(items: ConsoleNavigationItem[]) {
  return items.map((item) => ({
    key: item.key,
    icon: item.icon,
    label: item.path ? <Link to={item.path}>{item.label}</Link> : item.label,
    children: item.children ? toMenuItems(item.children) : undefined
  }));
}

export function ConsoleLayout() {
  useRouteDocumentTitle("Agent Security Platform Console");

  const location = useLocation();
  const selectedKey = getSelectedNavigationKey(location.pathname);
  const routeTitle =
    BANNER_TITLE_OVERRIDES[selectedKey] ??
    ROUTE_TITLES.get(selectedKey) ??
    "Security Operations Console";

  return (
    <Layout className="console-shell">
      <Sider width={292} className="console-sider">
        <div className="console-brand">
          <div className="console-brand-mark">
            <SafetyOutlined />
          </div>
          <div>
            <Title level={4} className="console-brand-title">
              Agent Security Platform
            </Title>
            <Text className="console-brand-subtitle">Operator Console</Text>
          </div>
        </div>

        <nav aria-label="Console Navigation" className="console-navigation">
          <Menu
            mode="inline"
            selectedKeys={[selectedKey]}
            defaultOpenKeys={["results", "sandbox-security"]}
            items={toMenuItems(consoleNavigation)}
            className="console-menu"
          />
          <div className="console-sider-status">
            <dl>
              <div>
                <dt>MODE</dt>
                <dd data-mono="true">local_and_judge</dd>
              </div>
              <div>
                <dt>REGION</dt>
                <dd data-mono="true">cn-local-1</dd>
              </div>
              <div>
                <dt>VERSION</dt>
                <dd data-mono="true">v1</dd>
              </div>
            </dl>
          </div>
          <p className="console-sider-copyright">
            © 2026 Agent Security Platform
          </p>
        </nav>
      </Sider>

      <Layout className="console-main">
        <Header className="console-header" role="banner">
          <div>
            <Text className="console-header-label">Platform Workspace</Text>
            <Title level={3} className="console-header-title">
              {routeTitle}
            </Title>
          </div>
          {selectedKey === "/sandbox-security/workbench" ? (
            <div className="console-header-workbench">
              <span className="sandbox-simulation-badge">SIMULATION / 仿真</span>
              <p className="sandbox-workbench-notice">
                提交内容以在模拟模式下评估沙箱安全策略。结果仅供分析，不用于实际拦截。
              </p>
            </div>
          ) : null}
          <Space size="middle">
            <Button type="text" icon={<BellOutlined />} aria-label="Notifications" />
            <Button type="primary" icon={<PlusOutlined />}>
              Create Task
            </Button>
            <Avatar className="console-avatar">OPS</Avatar>
          </Space>
        </Header>

        <Content className="console-content">
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}
