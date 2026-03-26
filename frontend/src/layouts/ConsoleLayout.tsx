import { BellOutlined, PlusOutlined, SafetyOutlined } from "@ant-design/icons";
import { Avatar, Button, Layout, Menu, Space, Tag, Typography } from "antd";
import { Link, Outlet, useLocation } from "react-router-dom";

import { consoleNavigation, type ConsoleNavigationItem } from "../app/navigation";

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
  const location = useLocation();
  const selectedKey = getSelectedNavigationKey(location.pathname);

  return (
    <Layout className="console-shell">
      <Sider width={248} className="console-sider">
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
            defaultOpenKeys={["results"]}
            items={toMenuItems(consoleNavigation)}
            className="console-menu"
          />
        </nav>
      </Sider>

      <Layout className="console-main">
        <Header className="console-header" role="banner">
          <div>
            <Text className="console-header-label">Platform Workspace</Text>
            <Title level={3} className="console-header-title">
              Security Operations Console
            </Title>
          </div>
          <Space size="middle">
            <Tag color="cyan" variant="filled">
              Mock Data Mode
            </Tag>
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
