// HTTP 探测，用于向目标主机发送 HTTP 请求并收集响应信息，供指纹识别引擎使用

import fetch from "node-fetch";

export async function httpProbe(
    host: string,
    port: number,
    path: string
) {
    try {
        const url = `http://${host}:${port}${path}`;
        const res = await fetch(url, { method: "GET" });

        const body = await res.text();

        return {
        port,
        path,
        status: res.status,
        headers: Object.fromEntries(res.headers.entries()),
        body,
        };
    } catch (e) {
        return null;
    }
}