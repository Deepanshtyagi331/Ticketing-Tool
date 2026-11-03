/**
 * Assertion library and test suite runner for standalone API tests.
 */

export interface TestResult {
  name: string;
  passed: boolean;
  durationMs: number;
  error?: string;
}

class TestSuiteRunner {
  private suiteName: string = '';
  private results: TestResult[] = [];
  private currentTestStartTime: number = 0;

  public setSuiteName(name: string): void {
    this.suiteName = name;
    console.log(`\n===============================================================`);
    console.log(`🧪 SUITE: ${name}`);
    console.log(`===============================================================`);
  }

  public async runTest(testName: string, testFn: () => Promise<void>): Promise<void> {
    this.currentTestStartTime = Date.now();
    try {
      await testFn();
      const durationMs = Date.now() - this.currentTestStartTime;
      this.results.push({ name: testName, passed: true, durationMs });
      console.log(`  ✅ PASS: ${testName} (${durationMs}ms)`);
    } catch (err: unknown) {
      const durationMs = Date.now() - this.currentTestStartTime;
      const errorMsg = err instanceof Error ? err.message : String(err);
      this.results.push({ name: testName, passed: false, durationMs, error: errorMsg });
      console.log(`  ❌ FAIL: ${testName} (${durationMs}ms)`);
      console.log(`     Error: ${errorMsg}`);
    }
  }

  public summarize(): void {
    const total = this.results.length;
    const passed = this.results.filter((r) => r.passed).length;
    const failed = this.results.filter((r) => !r.passed).length;

    console.log(`\n---------------------------------------------------------------`);
    console.log(`📊 Suite Results: ${passed}/${total} passed (${failed} failed)`);
    console.log(`---------------------------------------------------------------`);

    if (failed > 0) {
      console.error(`💥 [FAILED] One or more tests in "${this.suiteName}" failed!`);
      process.exit(1);
    } else {
      console.log(`🎉 [SUCCESS] All tests in "${this.suiteName}" passed!\n`);
    }
  }
}

export const runner = new TestSuiteRunner();

export function describe(name: string, fn: () => Promise<void>): void {
  runner.setSuiteName(name);
  fn().then(() => {
    runner.summarize();
  }).catch((err) => {
    console.error(`Fatal error in suite "${name}":`, err);
    process.exit(1);
  });
}

export async function test(name: string, fn: () => Promise<void>): Promise<void> {
  await runner.runTest(name, fn);
}

export function assert(condition: boolean, message: string = 'Assertion condition not met'): void {
  if (!condition) {
    throw new Error(`Assertion Failed: ${message}`);
  }
}

export function assertEqual<T>(actual: T, expected: T, message?: string): void {
  if (actual !== expected) {
    throw new Error(
      `Assertion Failed: ${message ? message + ' - ' : ''}Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`
    );
  }
}

export function assertStatus(actual: number, expected: number | number[], message?: string): void {
  const allowed = Array.isArray(expected) ? expected : [expected];
  if (!allowed.includes(actual)) {
    throw new Error(
      `HTTP Status Mismatch: ${message ? message + ' - ' : ''}Expected HTTP [${allowed.join(', ')}], received HTTP ${actual}`
    );
  }
}
