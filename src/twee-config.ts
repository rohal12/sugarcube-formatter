import * as fs from "fs";
import * as path from "path";
import * as yaml from "js-yaml";

/**
 * Structure of a macro definition in twee-config
 */
interface MacroDefinition {
  name?: string;
  container?: boolean;
  children?: string[];
}

/**
 * Structure of the macros section in twee-config
 */
interface MacrosConfig {
  [macroName: string]: MacroDefinition;
}

/**
 * Structure of a story format config (e.g., sugarcube-2)
 */
interface StoryFormatConfig {
  macros?: MacrosConfig;
}

/**
 * Root structure of a twee-config file
 */
interface TweeConfig {
  [storyFormat: string]: StoryFormatConfig;
}

/**
 * Result of parsing twee config files
 */
export interface TweeConfigResult {
  /** Macro names that are children of container macros (mid-block macros) */
  customMidBlockMacros: string[];
}

/**
 * Parse a twee-config file (YAML or JSON) and extract mid-block macros
 * from container children definitions.
 */
function parseTweeConfig(content: string, isYaml: boolean): TweeConfigResult {
  const customMidBlockMacros: string[] = [];

  try {
    const config: TweeConfig = isYaml
      ? (yaml.load(content) as TweeConfig)
      : JSON.parse(content);

    if (!config || typeof config !== "object") {
      return { customMidBlockMacros };
    }

    // Iterate through all story formats (e.g., sugarcube-2)
    for (const formatKey of Object.keys(config)) {
      const formatConfig = config[formatKey];
      if (!formatConfig?.macros) {
        continue;
      }

      // Iterate through all macro definitions
      for (const macroName of Object.keys(formatConfig.macros)) {
        const macroDef = formatConfig.macros[macroName];

        // If this is a container macro with children, add children to mid-block list
        if (macroDef?.container && Array.isArray(macroDef.children)) {
          for (const child of macroDef.children) {
            if (
              typeof child === "string" &&
              !customMidBlockMacros.includes(child)
            ) {
              customMidBlockMacros.push(child);
            }
          }
        }
      }
    }
  } catch (e) {
    // Silently ignore parse errors - just return empty result
    console.error("Error parsing twee-config:", e);
  }

  return { customMidBlockMacros };
}

/**
 * Find and parse twee-config files in a directory.
 * Looks for *.twee-config.yml and *.twee-config.json files.
 */
export function loadTweeConfig(rootDir: string): TweeConfigResult {
  const result: TweeConfigResult = {
    customMidBlockMacros: [],
  };

  try {
    const files = fs.readdirSync(rootDir);

    for (const file of files) {
      const isYaml =
        file.endsWith(".twee-config.yml") || file.endsWith(".twee-config.yaml");
      const isJson = file.endsWith(".twee-config.json");

      if (!isYaml && !isJson) {
        continue;
      }

      const filePath = path.join(rootDir, file);
      const content = fs.readFileSync(filePath, "utf-8");
      const parsed = parseTweeConfig(content, isYaml);

      // Merge results
      for (const macro of parsed.customMidBlockMacros) {
        if (!result.customMidBlockMacros.includes(macro)) {
          result.customMidBlockMacros.push(macro);
        }
      }
    }
  } catch (e) {
    // Silently ignore directory read errors
    console.error("Error reading twee-config files:", e);
  }

  return result;
}

/**
 * Parse twee-config content directly (for testing or when content is already loaded)
 */
export function parseTweeConfigContent(
  content: string,
  format: "yaml" | "json"
): TweeConfigResult {
  return parseTweeConfig(content, format === "yaml");
}
