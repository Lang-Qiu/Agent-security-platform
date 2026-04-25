import { test } from "node:test";
import { strict as assert } from "node:assert";
import { createTaskCenterModule } from "../../backend/src/modules/task-center/task-center.module.ts";
import type { Task } from "../../shared/types/task.ts";

test("Asset Scan Engine Integration Flow", async (t) => {
    // 1. 初始化后端任务中心模块
    const taskCenter = createTaskCenterModule();
    const requestId = `req_${Date.now()}`;

    // 2. 模拟前端通过 Controller 发起创建扫描任务的请求
    const response = await taskCenter.controller.createTask({
        task_type: "asset_scan",
        title: "Localhost Agent Scan",
        target: {
        target_type: "url",
        target_value: "http://localhost:11434"
        }
    }, requestId);

    // 因为没有 HTTP 框架的上下文，我们将 response 断言为 any 来提取内部的 payload
    // 大多数标准设计下，真实数据放在 response.body 或者 response 直接就是 payload
    const responsePayload = (response as any).body || response; 

    // 3. 断言任务创建成功
    assert.equal(responsePayload.success, true);
    
    // 提取真实的 Task 数据
    const task = responsePayload.data as Task;
    assert.equal(task.task_type, "asset_scan");
    assert.equal(task.status, "pending"); // 初始状态为 pending

    // 4. 验证引擎调度与结果回填
    const resultObj = taskCenter.service.getTaskResult(task.task_id);
    assert.ok(resultObj, "Result should be saved in repository");
    assert.equal(resultObj.task_type, "asset_scan");
    assert.equal(resultObj.engine_type, "asset_scan");

    // 5. 深入断言桥接脚本返回的 details 数据
    const details = resultObj.details as any;
    
    assert.ok(details.target, "Target should be mapped in details");
    assert.equal(details.target.target_value, "http://localhost:11434");
    
    assert.ok(Array.isArray(details.open_ports), "Open ports array should exist");
    assert.ok(Array.isArray(details.http_endpoints), "HTTP endpoints array should exist");
    assert.ok(Array.isArray(details.findings), "Findings array should exist");
    
    console.log("✅ Pipeline executed successfully via child_process bridge!");
    console.log(`🔍 Discovered Ports:`, details.open_ports);

    // 打印通信需要的 BaseResult
    console.log("\n=======================================================");
    console.log("✅ 资产扫描 Pipeline 通过桥接脚本 (Bridge) 执行成功！");
    console.log("=======================================================\n");
    
    console.log("📦 [BaseResult] 前后端标准契约数据 (Frontend & Backend Exchange Format):");
    
    // 使用 JSON.stringify 格式化输出对象，2个空格缩进，使其具备高可读性
    console.log(JSON.stringify(resultObj, null, 2));
    
    console.log("\n=======================================================\n");
});