# FinSight

FinSight is an Expo-based React Native app with a native Windows desktop target powered by `react-native-windows`.

This README documents the current development environment required to install dependencies and run the project as it exists in this repository.

## Stack

- Expo SDK `54`
- React `19.1.0`
- React Native `0.81.5`
- React Native Windows `0.81.x`
- Native Windows modules implemented in C++

## Development Targets

This repo currently supports two development flows:

- Mobile development through Expo (`android`, `ios`, `start`)
- Windows desktop development through React Native Windows (`start:windows`, `windows`, `dev:windows`)

Because the app includes native modules and a native Windows host, this is not a plain Expo Go-only project anymore.

## Required Software

### All developers

Install these first:

- Node.js `20 LTS` or newer
- `npm` (ships with Node.js)
- Git

Recommended check:

```powershell
node -v
npm -v
git --version
```

### Windows desktop developers

If you plan to run or build the Windows app, install:

- Windows 10 or Windows 11
- Visual Studio 2022
- MSVC v143 C++ build tools
- Windows 10/11 SDK
- NuGet support in Visual Studio

In Visual Studio Installer, the safest baseline is:

- `Desktop development with C++`
- `Universal Windows Platform development` if prompted by your local RNW toolchain

This project's Windows solution targets:

- Visual Studio 2022 (`MinimumVisualStudioVersion` `17.0`)
- Platform toolset `v143`
- Windows SDK `10.0.22621.x` in the generated build metadata

## Clone And Install

```powershell
git clone <your-repo-url>
cd finsight-expo
npm install
```

Notes:

- Use `npm install` from the project root. Do not install `expo-cli` globally for this repo.
- `node_modules` must exist before any Windows native build can succeed.
- The repo already includes `package-lock.json`, so `npm` is the expected package manager.

## Run The App

### Mobile / Expo

Start the Expo development server:

```powershell
npm start
```

Platform shortcuts:

```powershell
npm run android
npm run ios
```

Important:

- `iOS` requires macOS for the native simulator workflow.
- This project uses native capabilities, so if a feature depends on platform-native code it may not behave the same in Expo Go as it would in a full native build.

### Windows desktop

For the normal Windows development flow, use:

```powershell
npm run dev:windows
```

That script:

- starts the Metro server with the Windows config on port `8081`
- launches the native Windows app with `react-native run-windows --no-packager`

If you want to run each step separately:

```powershell
npm run start:windows
npm run windows
```

## Available Scripts

```powershell
npm start
npm run android
npm run ios
npm run start:windows
npm run windows
npm run dev:windows
npm run test:windows
```

What they do:

- `npm start`: starts Expo Metro
- `npm run android`: opens the Expo Android target
- `npm run ios`: opens the Expo iOS target
- `npm run start:windows`: starts Metro using `metro.config.windows.js`
- `npm run windows`: builds and launches the Windows app without starting Metro
- `npm run dev:windows`: starts Metro and launches the Windows app together
- `npm run test:windows`: runs Jest with the Windows-specific config

## Windows-Specific Notes

- The Windows app lives under [windows](/C:/Users/krank/Documents/CPP%20Classes/4800/finsight-expo/windows).
- The native Visual Studio solution is [windows/finsight.sln](/C:/Users/krank/Documents/CPP%20Classes/4800/finsight-expo/windows/finsight.sln).
- NuGet sources are configured in [NuGet.config](/C:/Users/krank/Documents/CPP%20Classes/4800/finsight-expo/NuGet.config).
- The Windows target uses custom native modules in [windows/finsight](/C:/Users/krank/Documents/CPP%20Classes/4800/finsight-expo/windows/finsight).

If the Windows build fails early, check these first:

- Visual Studio 2022 is installed
- the C++ workload is installed
- the Windows SDK is installed
- `npm install` completed successfully
- NuGet package restore is allowed from the configured feeds

## Project Layout

- [App.js](/C:/Users/krank/Documents/CPP%20Classes/4800/finsight-expo/App.js)
- [app.json](/C:/Users/krank/Documents/CPP%20Classes/4800/finsight-expo/app.json)
- [package.json](/C:/Users/krank/Documents/CPP%20Classes/4800/finsight-expo/package.json)
- [src](/C:/Users/krank/Documents/CPP%20Classes/4800/finsight-expo/src)
- [windows](/C:/Users/krank/Documents/CPP%20Classes/4800/finsight-expo/windows)
- [documentation](/C:/Users/krank/Documents/CPP%20Classes/4800/finsight-expo/documentation)

## Troubleshooting

### Dependency install issues

```powershell
Remove-Item -Recurse -Force node_modules
Remove-Item package-lock.json
npm install
```

Only do this if your local install is broken and you are comfortable regenerating the lockfile.

### Windows app does not launch

Try:

```powershell
npm run start:windows
npm run windows
```

This makes it easier to see whether the failure is in Metro startup or the native Windows build.

### Metro port conflicts

The Windows workflow expects Metro on port `8081`. If another process is using that port, stop the conflicting process and rerun `npm run dev:windows`.
