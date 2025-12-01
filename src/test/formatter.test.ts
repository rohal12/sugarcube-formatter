import * as fs from "fs";
import * as path from "path";
import { formatSugarCubeDocument } from "../formatter";
import { FormatterOptions } from "../config";

const PASSAGES_DIR = path.resolve(__dirname, "../../src/test/passages");

/**
 * Test configuration file structure.
 * Each test subdirectory can have a config.json file that specifies
 * the formatter options to use for all tests in that directory.
 *
 * This design makes it easy to add new settings:
 * 1. Add the new option to FormatterOptions in formatter.ts
 * 2. Create a new test subdirectory with a config.json containing the option
 * 3. Add test cases (input/output pairs) to that directory
 */
interface TestConfig {
  /** Formatter options to apply to all tests in this directory */
  options: FormatterOptions;
  /** Optional description of what this test configuration tests */
  description?: string;
}

interface TestCase {
  name: string;
  inputPath: string;
  expectedPath: string;
  options: FormatterOptions;
  configDir: string;
}

// Test runner
function runTest(test: TestCase): boolean {
  const input = fs.readFileSync(test.inputPath, "utf-8");
  const expected = fs.readFileSync(test.expectedPath, "utf-8");
  const { formattedText: actual } = formatSugarCubeDocument(
    input,
    test.options
  );

  console.log(`\n========== ${test.name} ==========`);
  console.log(`Config: ${test.configDir}`);
  console.log("Options:", JSON.stringify(test.options, null, 2));
  console.log("=== INPUT ===");
  console.log(input);
  console.log("\n=== EXPECTED ===");
  console.log(expected);
  console.log("\n=== ACTUAL ===");
  console.log(actual);
  console.log("\n=== MATCH ===");
  const passed = actual === expected;
  console.log(passed ? "✓ PASS" : "✗ FAIL");

  if (!passed) {
    console.log("\n=== DIFF ===");
    const expectedLines = expected.split("\n");
    const actualLines = actual.split("\n");
    const maxLines = Math.max(expectedLines.length, actualLines.length);
    for (let i = 0; i < maxLines; i++) {
      const exp = expectedLines[i] ?? "<missing>";
      const act = actualLines[i] ?? "<missing>";
      if (exp !== act) {
        console.log(`Line ${i + 1}:`);
        console.log(`  Expected: "${exp}"`);
        console.log(`  Actual:   "${act}"`);
      }
    }
  }

  return passed;
}

/**
 * Load configuration from a directory.
 * If no config.json exists, returns empty options (uses formatter defaults).
 */
function loadConfig(dir: string): TestConfig {
  const configPath = path.join(dir, "config.json");
  if (fs.existsSync(configPath)) {
    try {
      return JSON.parse(fs.readFileSync(configPath, "utf-8"));
    } catch (e) {
      console.error(`Error parsing config at ${configPath}:`, e);
      return { options: {} };
    }
  }
  return { options: {} };
}

/**
 * Discover test cases in a single directory.
 * Tests are pairs of files: *-input.twee and *-output.twee
 */
function discoverTestsInDir(dir: string, config: TestConfig): TestCase[] {
  const tests: TestCase[] = [];
  const dirName = path.basename(dir);

  try {
    const files = fs.readdirSync(dir);

    for (const file of files) {
      if (file.endsWith("-input.twee")) {
        const baseName = file.replace("-input.twee", "");
        const expectedFile = `${baseName}-output.twee`;
        const inputPath = path.join(dir, file);
        const expectedPath = path.join(dir, expectedFile);

        if (fs.existsSync(expectedPath)) {
          tests.push({
            name: `${dirName}/${baseName}`,
            inputPath,
            expectedPath,
            options: config.options,
            configDir: dirName,
          });
        } else {
          console.warn(
            `Warning: No matching output file for ${dirName}/${file}`
          );
        }
      }
    }
  } catch (e) {
    console.error(`Error reading directory ${dir}:`, e);
  }

  return tests;
}

/**
 * Recursively discover all test cases from the passages directory.
 * Each subdirectory can have its own config.json with specific formatter options.
 *
 * Directory structure example:
 * passages/
 *   default/                    # Tests with default options
 *     config.json               # { "options": {} }
 *     indent-block-macro-input.twee
 *     indent-block-macro-output.twee
 *   strip-quotes-enabled/       # Tests with stripSingleWordQuotes: true
 *     config.json               # { "options": { "stripSingleWordQuotes": true } }
 *     quotes-remove-single-word-input.twee
 *     quotes-remove-single-word-output.twee
 *   strip-quotes-disabled/      # Tests with stripSingleWordQuotes: false
 *     config.json               # { "options": { "stripSingleWordQuotes": false } }
 *     quotes-preserve-single-word-input.twee
 *     quotes-preserve-single-word-output.twee
 */
function discoverAllTests(): TestCase[] {
  const allTests: TestCase[] = [];

  if (!fs.existsSync(PASSAGES_DIR)) {
    console.error(`Passages directory not found: ${PASSAGES_DIR}`);
    return allTests;
  }

  const entries = fs.readdirSync(PASSAGES_DIR, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory()) {
      const subDir = path.join(PASSAGES_DIR, entry.name);
      const config = loadConfig(subDir);

      if (config.description) {
        console.log(
          `\nLoading tests from ${entry.name}: ${config.description}`
        );
      }

      const tests = discoverTestsInDir(subDir, config);
      allTests.push(...tests);
    }
  }

  return allTests.sort((a, b) => a.name.localeCompare(b.name));
}

// Main test execution
console.log("=".repeat(50));
console.log("SugarCube Formatter - Test Suite");
console.log("=".repeat(50));

const tests = discoverAllTests();

if (tests.length === 0) {
  console.log("\nNo test cases found in", PASSAGES_DIR);
  console.log(
    "Make sure test subdirectories exist with *-input.twee and *-output.twee pairs."
  );
  process.exit(1);
}

console.log(`\nDiscovered ${tests.length} test(s)`);

const results = tests.map((test) => runTest(test));

console.log("\n" + "=".repeat(50));
console.log("SUMMARY");
console.log("=".repeat(50));
const passed = results.filter((r) => r).length;
const total = results.length;
console.log(`${passed}/${total} tests passed`);

if (passed !== total) {
  const failedTests = tests.filter((_, i) => !results[i]);
  console.log("\nFailed tests:");
  failedTests.forEach((t) => console.log(`  - ${t.name}`));
  process.exit(1);
}
