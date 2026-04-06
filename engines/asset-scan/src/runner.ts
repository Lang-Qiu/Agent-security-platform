// CLI / 本地测试入口

import { runAssetScan } from "./engine.js";

async function main() {
    const target = "127.0.0.1";

    const result = await runAssetScan(target);

    console.log(JSON.stringify(result, null, 2));
}

main();