# FinSight

FinSight is a cross-platform personal finance application built with Expo and React Native, with a native Windows desktop target powered by `react-native-windows`. The project helps users track transactions, manage budgets, review spending trends, import financial data, and interact with a privacy-focused local AI assistant.

This repository is prepared for final course submission and includes the application source, Windows desktop implementation, and supporting project documentation.

## Features

- User registration and sign-in with local session persistence
- Dashboard with spending, income, and cash-flow summaries
- Transaction management with categorized records
- Budget planning and progress tracking
- CSV transaction import workflow
- Receipt/image OCR scanning workflow for transaction capture
- Profile management
- AI assistant experience for finance-related questions
- Optional Windows local LLM runtime scaffold for private on-device AI

## Tech Stack

- Expo SDK `54`
- React `19.1.0`
- React Native `0.81.5`
- React Native Windows `0.81.x`
- SQLite-backed local storage
- Native Windows modules in C++

## Repository Contents

- [App.js](./App.js): application entry point and navigation shell
- [src](./src): app screens, services, database helpers, platform integrations, and AI runtime code
- [assets](./assets): icons and bundled visual assets
- [windows](./windows): native Windows solution and C++ bridge modules
- [documentation](./documentation): project documentation and supporting deliverables

## Included Documentation

The [documentation](./documentation) folder contains project artifacts used during development and submission, including:

- [Functional_Requirements_Spec.docx](./documentation/Functional_Requirements_Spec.docx)
- [Project_Charter.docx](./documentation/Project_Charter.docx)
- [Deliverables_Checklist.md](./documentation/Deliverables_Checklist.md)
- [Functional_Requirements_Spec.md](./documentation/Functional_Requirements_Spec.md)
- [Technical_Design_Spec.md](./documentation/Technical_Design_Spec.md)
- [Test_Case_Spec.md](./documentation/Test_Case_Spec.md)
- [Build_and_Deployment_Instructions.md](./documentation/Build_and_Deployment_Instructions.md)
- [Release_Notes.md](./documentation/Release_Notes.md)

Supporting development artifacts that are not part of the core deliverable set were moved to [documentation/supporting_artifacts](./documentation/supporting_artifacts).

## Installation

### Requirements

Install the following before running the project:

- Node.js `20 LTS` or newer
- `npm`
- Git

For the Windows desktop target, also install:

- Windows 10 or Windows 11
- Visual Studio 2022
- MSVC v143 C++ build tools
- Windows SDK
- NuGet support in Visual Studio

Recommended Visual Studio workloads:

- `Desktop development with C++`
- `Universal Windows Platform development` if required by your local RNW setup

### Setup

```powershell
git clone <your-repo-url>
cd finsight-expo
npm install
```

This repository uses `package-lock.json`, so `npm` is the expected package manager.

## Running The App

### Expo / mobile workflow

```powershell
npm start
```

Optional platform commands:

```powershell
npm run android
npm run ios
```

Notes:

- `iOS` simulator workflows require macOS.
- Some native-powered features are best tested in a development/custom build rather than Expo Go alone.

### Windows desktop workflow

Recommended command:

```powershell
npm run dev:windows
```

This starts the Windows Metro configuration and launches the native Windows app.

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
npm run msbuild:windows
npm run msbuild:windows:release
npm run msbuild:windows:solution
npm run test:windows:native
```

## Windows Build Notes

- The Windows solution is [windows/finsight.sln](./windows/finsight.sln).
- NuGet sources are configured in [NuGet.config](./NuGet.config).
- Native Windows implementation files live under [windows/finsight](./windows/finsight).

If a Windows build fails, verify:

- Visual Studio 2022 is installed
- C++ build tools are installed
- the Windows SDK is installed
- `npm install` completed successfully
- NuGet restore is allowed from configured feeds

## Local AI Note

FinSight includes a Windows-native local AI scaffold intended for private, on-device assistant functionality. The current implementation supports local model configuration and Windows integration work, but a full ONNX Runtime GenAI setup is still required for complete local model execution.

See [Windows_Local_LLM_Runtime.md](./documentation/Windows_Local_LLM_Runtime.md) for details.

## Submission Notes

- Source code for the app, Windows target, and supporting assets is included in this repository.
- Supporting design and documentation artifacts are included in the `documentation` folder.
- Generated dependencies and local build outputs should not be committed; see [.gitignore](./.gitignore).
