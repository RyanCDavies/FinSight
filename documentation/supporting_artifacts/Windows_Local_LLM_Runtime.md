# Windows Local LLM Runtime

This project now includes a Windows-native local LLM scaffold that is intended to host an ONNX Runtime GenAI backend.

## Current pieces

- `src/ai/promptBuilder.js`
  - Builds the shared assistant prompt with local finance context and recent chat history.
- `src/platform/localLLM.windows.js`
  - React Native bridge used by the app to talk to the Windows-native runtime.
- `windows/finsight/LocalLlmModule.*`
  - Native Windows module that manages model-folder selection, persisted model configuration, load/unload state, and generation entry points.
- `windows/finsight/finsight.vcxproj`
  - Build hooks for a local ONNX Runtime GenAI install via the `OrtGenAiRoot` MSBuild property.

## What works now

- Windows can prompt the user to select a local model directory.
- The selected directory is validated for `genai_config.json`.
- The selected directory is persisted in app-local storage.
- Windows can also download declared model asset files into an app-managed local model directory before registering that directory.
- The installed AI package metadata now records Windows provider configuration.
- The assistant runtime now routes prompt payloads through the Windows local LLM bridge before falling back to heuristic answers.
- When ONNX Runtime GenAI is linked, the Windows native module now loads the configured model directory, creates a tokenizer, runs a generator loop, incrementally decodes tokens, and supports cancellation.

## What still needs to be linked for full generation

1. Provide ONNX Runtime GenAI headers and libraries for Windows.
2. Set `OrtGenAiRoot` and `OrtRoot` for the Windows project so the native module can include and link against:
   - `onnxruntime-genai.lib`
   - `onnxruntime.lib`
   - easiest path: copy `windows/OrtGenAi.props.example` to `windows/OrtGenAi.props` and set both paths
   - if you built ORT GenAI from source and both libraries are emitted into the same build output, both properties can point to the same folder
3. Publish a real Windows package manifest entry in `src/ai/manifest.js` or a remote manifest with:
   - `windowsPackage.installDirectoryName`
   - `windowsPackage.files[]`
   - one file entry per model asset with `relativePath`, `url`, and ideally `sizeBytes`
4. Replace the remaining placeholder pieces in `LocalLlmModule.cpp` with production hardening:
   - optional provider/runtime tuning
   - streamed token events back to React Native instead of final-response-only delivery
   - richer generation settings and model-specific defaults
   - better error reporting for model incompatibility and out-of-memory cases

## Expected model shape

The Windows runtime expects an ONNX Runtime GenAI model directory containing at least:

- `genai_config.json`
- model graph files referenced by that config
- tokenizer files referenced by that config

## Download manifest shape

Windows model downloads are driven by a `windowsPackage` block on the model manifest entry, for example:

```json
{
  "installDirectoryName": "phi-3-mini-onnx-cpu-int4",
  "files": [
    {
      "relativePath": "genai_config.json",
      "url": "https://example.com/models/phi3/genai_config.json",
      "sizeBytes": 2048
    }
  ]
}
```

The default manifest in this repo now points to the Microsoft-hosted `microsoft/Phi-3-mini-4k-instruct-onnx` CPU int4 package on Hugging Face.

## Build note

If `OrtGenAiRoot` is not set, the Windows app compiles in scaffold mode with `FINSIGHT_ENABLE_ORT_GENAI=0`.
