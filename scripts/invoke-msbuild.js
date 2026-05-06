const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..");
const defaultProjectPath = path.join(repoRoot, "windows", "finsight", "finsight.vcxproj");
const solutionPath = path.join(repoRoot, "windows", "finsight.sln");

function parseArgs(argv) {
  const options = {
    configuration: "Debug",
    platform: "x64",
    targets: ["Restore", "Build"],
    project: defaultProjectPath,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--configuration" && argv[i + 1]) {
      options.configuration = argv[++i];
      continue;
    }
    if (arg === "--platform" && argv[i + 1]) {
      options.platform = argv[++i];
      continue;
    }
    if (arg === "--targets" && argv[i + 1]) {
      options.targets = argv[++i]
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
      continue;
    }
    if (arg === "--project" && argv[i + 1]) {
      const projectArg = argv[++i];
      options.project =
        projectArg === "solution"
          ? solutionPath
          : path.isAbsolute(projectArg)
            ? projectArg
            : path.resolve(repoRoot, projectArg);
    }
  }

  return options;
}

function resolveMsBuild() {
  if (process.env.MSBUILD_EXE && fs.existsSync(process.env.MSBUILD_EXE)) {
    return process.env.MSBUILD_EXE;
  }

  const programFiles = [
    process.env.ProgramFiles,
    process.env["ProgramFiles(x86)"],
    "C:\\Program Files",
    "C:\\Program Files (x86)",
  ].filter(Boolean);

  const editions = ["Community", "Professional", "Enterprise", "BuildTools"];
  const years = ["2022", "2019"];

  for (const baseDir of programFiles) {
    for (const year of years) {
      for (const edition of editions) {
        const candidate = path.join(baseDir, "Microsoft Visual Studio", year, edition, "MSBuild", "Current", "Bin", "MSBuild.exe");
        if (fs.existsSync(candidate)) {
          return candidate;
        }
      }
    }
  }

  throw new Error("MSBuild.exe was not found. Set MSBUILD_EXE or install Visual Studio 2022 with the MSBuild component.");
}

function createSanitizedEnv() {
  const sanitized = {};
  let chosenPathValue = null;

  for (const [key, value] of Object.entries(process.env)) {
    if (key.toLowerCase() === "path") {
      chosenPathValue ??= value;
      continue;
    }

    if (!(key in sanitized)) {
      sanitized[key] = value;
    }
  }

  if (chosenPathValue) {
    sanitized.Path = chosenPathValue;
  }

  return sanitized;
}

const options = parseArgs(process.argv.slice(2));
const msbuildPath = resolveMsBuild();
const targets = options.targets.join(";");

if (!targets) {
  throw new Error("At least one MSBuild target must be provided.");
}

if (!fs.existsSync(options.project)) {
  throw new Error(`MSBuild target not found at "${options.project}".`);
}

console.log(`Using MSBuild at: ${msbuildPath}`);
console.log(`Building target: ${options.project}`);
console.log(`Configuration: ${options.configuration}`);
console.log(`Platform: ${options.platform}`);
console.log(`Targets: ${targets}`);

const buildResult = spawnSync(
  msbuildPath,
  [
    options.project,
    `/t:${targets}`,
    `/p:Configuration=${options.configuration}`,
    `/p:Platform=${options.platform}`,
    "/m",
    "/nologo",
  ],
  {
    cwd: repoRoot,
    env: createSanitizedEnv(),
    stdio: "inherit",
  }
);

if (buildResult.error) {
  throw buildResult.error;
}

process.exit(buildResult.status ?? 1);
