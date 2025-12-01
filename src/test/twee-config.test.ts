import * as path from "path";
import { loadTweeConfig, parseTweeConfigContent } from "../twee-config";

const PROJECT_ROOT = path.resolve(__dirname, "../../");

console.log("=".repeat(50));
console.log("Twee Config Loader - Test Suite");
console.log("=".repeat(50));

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✓ PASS: ${name}`);
    passed++;
  } catch (e) {
    console.log(`✗ FAIL: ${name}`);
    console.log(`  Error: ${e}`);
    failed++;
  }
}

function assertEqual<T>(actual: T, expected: T, message?: string) {
  const actualStr = JSON.stringify(actual);
  const expectedStr = JSON.stringify(expected);
  if (actualStr !== expectedStr) {
    throw new Error(
      `${
        message || "Assertion failed"
      }\n  Expected: ${expectedStr}\n  Actual: ${actualStr}`
    );
  }
}

// Test loading from project root
test("loadTweeConfig finds t3lt.twee-config.yml in project root", () => {
  const result = loadTweeConfig(PROJECT_ROOT);

  // Should find subtag (child of customcontainer) and options (child of menu)
  const expected = ["subtag", "options"];
  assertEqual(
    result.customMidBlockMacros.sort(),
    expected.sort(),
    "Custom mid-block macros"
  );
});

// Test YAML parsing
test("parseTweeConfigContent parses YAML with container children", () => {
  const yaml = `
sugarcube-2:
  macros:
    mycontainer:
      name: mycontainer
      container: true
      children:
        - mychild1
        - mychild2
    mychild1:
      name: mychild1
    mychild2:
      name: mychild2
`;
  const result = parseTweeConfigContent(yaml, "yaml");
  assertEqual(
    result.customMidBlockMacros.sort(),
    ["mychild1", "mychild2"].sort(),
    "Should extract children from container macro"
  );
});

// Test JSON parsing
test("parseTweeConfigContent parses JSON with container children", () => {
  const json = JSON.stringify({
    "sugarcube-2": {
      macros: {
        wrapper: {
          name: "wrapper",
          container: true,
          children: ["inner"],
        },
        inner: {
          name: "inner",
        },
      },
    },
  });
  const result = parseTweeConfigContent(json, "json");
  assertEqual(
    result.customMidBlockMacros,
    ["inner"],
    "Should extract children from JSON container macro"
  );
});

// Test non-container macros don't add children
test("parseTweeConfigContent ignores children on non-container macros", () => {
  const yaml = `
sugarcube-2:
  macros:
    notcontainer:
      name: notcontainer
      children:
        - shouldbeignored
`;
  const result = parseTweeConfigContent(yaml, "yaml");
  assertEqual(
    result.customMidBlockMacros,
    [],
    "Should not extract children from non-container macro"
  );
});

// Test multiple story formats
test("parseTweeConfigContent handles multiple story formats", () => {
  const yaml = `
sugarcube-2:
  macros:
    sc2container:
      name: sc2container
      container: true
      children:
        - sc2child
harlowe-3:
  macros:
    h3container:
      name: h3container
      container: true
      children:
        - h3child
`;
  const result = parseTweeConfigContent(yaml, "yaml");
  assertEqual(
    result.customMidBlockMacros.sort(),
    ["h3child", "sc2child"].sort(),
    "Should extract children from all story formats"
  );
});

// Test empty/invalid config
test("parseTweeConfigContent handles empty config gracefully", () => {
  const result = parseTweeConfigContent("{}", "json");
  assertEqual(
    result.customMidBlockMacros,
    [],
    "Empty config should return empty array"
  );
});

test("parseTweeConfigContent handles invalid YAML gracefully", () => {
  const result = parseTweeConfigContent("not: valid: yaml: [", "yaml");
  assertEqual(
    result.customMidBlockMacros,
    [],
    "Invalid YAML should return empty array"
  );
});

// Summary
console.log("\n" + "=".repeat(50));
console.log("SUMMARY");
console.log("=".repeat(50));
console.log(`${passed}/${passed + failed} tests passed`);

if (failed > 0) {
  process.exit(1);
}
