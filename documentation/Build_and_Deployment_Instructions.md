# FinSight Build and Deployment Instructions

## Setup

```powershell
git clone <repository-url>
cd finsight-expo
npm install
```

## Run Expo Workflow

```powershell
npm start
```

## Run Windows Workflow

```powershell
npm run dev:windows
```

Or run separately:

```powershell
npm run start:windows
npm run windows
```

## Build Commands

```powershell
npm run msbuild:windows
npm run msbuild:windows:release
npm run msbuild:windows:solution
npm run test:windows:native
```

## Requirements

- Node.js 20.x
- npm
- Windows 10 or 11 for desktop target
- Visual Studio 2022
- MSVC v143 build tools
- Windows SDK

## Deployment Notes

- Solution: [windows/finsight.sln](../windows/finsight.sln)
- Project: [windows/finsight/finsight.vcxproj](../windows/finsight/finsight.vcxproj)
- Build helper: [scripts/invoke-msbuild.js](../scripts/invoke-msbuild.js)
