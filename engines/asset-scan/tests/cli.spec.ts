import { test } from 'node:test';
import assert from 'node:assert';
import { execSync } from 'node:child_process';

test('CLI: should identify ollama from mock response', () => {
  // 准备一个模拟的 Ollama 响应（假设本地 11434 端口正由 mock-server 模拟）
  // 执行 CLI 脚本命令
  const cmd = 'node --experimental-strip-types src/cli.ts --target http://127.0.0.1 --port-hint 11434';
  
  try {
    const output = execSync(cmd, { encoding: 'utf8' });
    const result = JSON.parse(output);

    // 断言结果
    assert.strictEqual(result.target_id, 'ollama');
    assert.ok(result.confidence >= 0.80);
    assert.strictEqual(result.product_name, 'Ollama');
  } catch (err) {
    // 如果 cli.ts 还没写，这里必然抛错，符合 RED 状态
    assert.fail('CLI execution failed or produced invalid JSON');
  }
});