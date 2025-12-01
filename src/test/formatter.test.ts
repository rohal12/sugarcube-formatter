import * as fs from "fs";
import * as path from "path";
import { formatSugarCubeDocument } from "../formatter";

const PASSAGES_DIR = path.resolve(__dirname, "../../src/test/passages");

// Test runner
function runTest(
  name: string,
  inputPath: string,
  expectedPath: string
): boolean {
  const input = fs.readFileSync(inputPath, "utf-8");
  const expected = fs.readFileSync(expectedPath, "utf-8");
  const { formattedText: actual } = formatSugarCubeDocument(input);

  console.log(`\n========== ${name} ==========`);
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

// Discover and run all test pairs
function discoverTests(): {
  name: string;
  inputPath: string;
  expectedPath: string;
}[] {
  const files = fs.readdirSync(PASSAGES_DIR);
  const tests: { name: string; inputPath: string; expectedPath: string }[] = [];

  for (const file of files) {
    if (file.endsWith("-input.twee")) {
      const baseName = file.replace("-input.twee", "");
      const expectedFile = `${baseName}-output.twee`;
      const inputPath = path.join(PASSAGES_DIR, file);
      const expectedPath = path.join(PASSAGES_DIR, expectedFile);

      if (fs.existsSync(expectedPath)) {
        tests.push({
          name: baseName,
          inputPath,
          expectedPath,
        });
      } else {
        console.warn(`Warning: No matching output file for ${file}`);
      }
    }
  }

  return tests.sort((a, b) => a.name.localeCompare(b.name));
}

// Run all discovered tests
const tests = discoverTests();

if (tests.length === 0) {
  console.log("No test cases found in", PASSAGES_DIR);
  process.exit(1);
}

const results = tests.map((test) =>
  runTest(test.name, test.inputPath, test.expectedPath)
);

console.log("\n========== SUMMARY ==========");
const passed = results.filter((r) => r).length;
const total = results.length;
console.log(`${passed}/${total} tests passed`);

if (passed !== total) {
  process.exit(1);
}
