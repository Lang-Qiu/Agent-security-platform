// 端口探测

import net from "net";

export function tcpProbe(host: string, port: number): Promise<boolean> {
    return new Promise(resolve => {
        const socket = new net.Socket();

        socket.setTimeout(500);

        socket.on("connect", () => {
        socket.destroy();
        resolve(true);
        });

        socket.on("error", () => resolve(false));
        socket.on("timeout", () => resolve(false));

        socket.connect(port, host);
    });
}