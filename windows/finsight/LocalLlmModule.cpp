#include "pch.h"

#include "LocalLlmModule.h"

#include <algorithm>
#include <filesystem>
#include <fstream>
#include <memory>
#include <mutex>
#include <optional>
#include <stdexcept>
#include <string>
#include <thread>
#include <vector>

#include <shobjidl.h>
#include <urlmon.h>
#include <winrt/Windows.Storage.h>

#if defined(FINSIGHT_ENABLE_ORT_GENAI) && FINSIGHT_ENABLE_ORT_GENAI
#include <ort_genai.h>
#endif

namespace {

#if defined(FINSIGHT_ENABLE_ORT_GENAI) && FINSIGHT_ENABLE_ORT_GENAI
constexpr bool kOrtGenAiLinked = true;
#else
constexpr bool kOrtGenAiLinked = false;
#endif
constexpr wchar_t kConfigFileName[] = L"windows-local-llm-config.json";

struct LocalLlmRuntimeState {
  std::wstring configuredModelDirectory;
  std::wstring loadedModelDirectory;
  bool generationInFlight{false};
  bool cancelRequested{false};
#if defined(FINSIGHT_ENABLE_ORT_GENAI) && FINSIGHT_ENABLE_ORT_GENAI
  std::unique_ptr<OgaHandle> handle;
  std::unique_ptr<OgaModel> model;
  std::unique_ptr<OgaTokenizer> tokenizer;
#endif
};

struct LocalLlmRuntimeSnapshot {
  std::wstring configuredModelDirectory;
  std::wstring loadedModelDirectory;
  bool generationInFlight{false};
  bool cancelRequested{false};
};

LocalLlmRuntimeState g_runtimeState;
std::mutex g_runtimeMutex;

std::string WideToUtf8(std::wstring const &value) {
  if (value.empty()) {
    return {};
  }

  const int size = WideCharToMultiByte(CP_UTF8, 0, value.c_str(), static_cast<int>(value.size()), nullptr, 0, nullptr, nullptr);
  std::string result(size, '\0');
  WideCharToMultiByte(CP_UTF8, 0, value.c_str(), static_cast<int>(value.size()), result.data(), size, nullptr, nullptr);
  return result;
}

std::wstring Utf8ToWide(std::string const &value) {
  if (value.empty()) {
    return {};
  }

  const int size = MultiByteToWideChar(CP_UTF8, 0, value.c_str(), static_cast<int>(value.size()), nullptr, 0);
  std::wstring result(size, L'\0');
  MultiByteToWideChar(CP_UTF8, 0, value.c_str(), static_cast<int>(value.size()), result.data(), size);
  return result;
}

std::filesystem::path ResolveAppFile(std::wstring const &fileName) {
  const std::wstring localPath = winrt::Windows::Storage::ApplicationData::Current().LocalFolder().Path().c_str();
  std::filesystem::path directory{localPath};
  directory /= L"Finsight";
  std::filesystem::create_directories(directory);
  return directory / fileName;
}

std::filesystem::path ResolveManagedModelsRoot() {
  auto root = ResolveAppFile(L"managed-models");
  std::filesystem::create_directories(root);
  return root;
}

std::wstring NormalizeInstallDirectoryName(std::wstring const &name) {
  std::wstring result;
  result.reserve(name.size());
  for (wchar_t character : name) {
    if ((character >= L'a' && character <= L'z') || (character >= L'A' && character <= L'Z') ||
        (character >= L'0' && character <= L'9') || character == L'-' || character == L'_') {
      result += character;
    } else {
      result += L'_';
    }
  }

  if (result.empty()) {
    return L"default-model";
  }

  return result;
}

std::filesystem::path ResolveManagedModelDirectory(std::wstring const &installDirectoryName) {
  auto root = ResolveManagedModelsRoot();
  auto directory = root / NormalizeInstallDirectoryName(installDirectoryName);
  std::filesystem::create_directories(directory);
  return directory;
}

std::wstring EscapeJson(std::wstring const &value) {
  std::wstring escaped;
  escaped.reserve(value.size() + 8);
  for (wchar_t character : value) {
    switch (character) {
      case L'\\':
        escaped += L"\\\\";
        break;
      case L'"':
        escaped += L"\\\"";
        break;
      case L'\r':
        escaped += L"\\r";
        break;
      case L'\n':
        escaped += L"\\n";
        break;
      case L'\t':
        escaped += L"\\t";
        break;
      default:
        escaped += character;
        break;
    }
  }
  return escaped;
}

std::wstring UnescapeJson(std::wstring const &value) {
  std::wstring result;
  result.reserve(value.size());
  for (size_t index = 0; index < value.size(); ++index) {
    if (value[index] == L'\\' && index + 1 < value.size()) {
      ++index;
      switch (value[index]) {
        case L'\\':
          result += L'\\';
          break;
        case L'"':
          result += L'"';
          break;
        case L'r':
          result += L'\r';
          break;
        case L'n':
          result += L'\n';
          break;
        case L't':
          result += L'\t';
          break;
        default:
          result += value[index];
          break;
      }
      continue;
    }
    result += value[index];
  }
  return result;
}

std::optional<std::wstring> LoadConfiguredDirectoryFromDisk() {
  const auto configPath = ResolveAppFile(kConfigFileName);
  if (!std::filesystem::exists(configPath)) {
    return std::nullopt;
  }

  std::ifstream input(configPath, std::ios::binary);
  if (!input) {
    return std::nullopt;
  }

  const std::string text((std::istreambuf_iterator<char>(input)), std::istreambuf_iterator<char>());
  const std::wstring wideText = Utf8ToWide(text);
  const std::wstring key = L"\"modelDirectory\":\"";
  const size_t start = wideText.find(key);
  if (start == std::wstring::npos) {
    return std::nullopt;
  }

  const size_t valueStart = start + key.size();
  size_t cursor = valueStart;
  bool escaped = false;
  while (cursor < wideText.size()) {
    if (!escaped && wideText[cursor] == L'"') {
      break;
    }
    escaped = !escaped && wideText[cursor] == L'\\';
    if (wideText[cursor] != L'\\' || escaped) {
      escaped = false;
    }
    ++cursor;
  }

  return UnescapeJson(wideText.substr(valueStart, cursor - valueStart));
}

void SaveConfiguredDirectoryToDisk(std::wstring const &directory) {
  const auto configPath = ResolveAppFile(kConfigFileName);
  std::ofstream output(configPath, std::ios::binary | std::ios::trunc);
  if (!output) {
    throw std::runtime_error("Unable to save the local LLM configuration.");
  }

  const std::wstring json = L"{\"modelDirectory\":\"" + EscapeJson(directory) + L"\"}";
  const std::string utf8 = WideToUtf8(json);
  output.write(utf8.data(), static_cast<std::streamsize>(utf8.size()));
  if (!output.good()) {
    throw std::runtime_error("Unable to persist the local LLM configuration.");
  }
}

bool HasRequiredModelFiles(std::filesystem::path const &directory) {
  return std::filesystem::exists(directory / "genai_config.json");
}

std::wstring NormalizeDirectory(std::wstring const &path) {
  if (path.empty()) {
    return {};
  }

  std::filesystem::path normalized = std::filesystem::path(path).lexically_normal();
  return normalized.wstring();
}

void EnsureValidModelDirectory(std::wstring const &path) {
  if (path.empty()) {
    throw std::invalid_argument("A Windows model directory is required.");
  }

  std::filesystem::path directory{path};
  if (!std::filesystem::exists(directory) || !std::filesystem::is_directory(directory)) {
    throw std::invalid_argument("The selected Windows model directory does not exist.");
  }

  if (!HasRequiredModelFiles(directory)) {
    throw std::invalid_argument("The selected folder is missing genai_config.json. Choose an ONNX Runtime GenAI model directory.");
  }
}

std::filesystem::path ResolveRelativeAssetPath(std::filesystem::path const &baseDirectory, std::wstring const &relativePath) {
  if (relativePath.empty()) {
    throw std::invalid_argument("A relative model asset path is required.");
  }

  std::filesystem::path relative{relativePath};
  if (relative.is_absolute()) {
    throw std::invalid_argument("Model asset paths must be relative.");
  }

  for (auto const &part : relative) {
    if (part == L".." || part == L"." || part.empty()) {
      throw std::invalid_argument("Model asset paths must stay within the managed model directory.");
    }
  }

  auto destination = (baseDirectory / relative).lexically_normal();
  const auto baseNormalized = baseDirectory.lexically_normal().wstring();
  const auto destinationNormalized = destination.wstring();
  if (destinationNormalized.rfind(baseNormalized, 0) != 0) {
    throw std::invalid_argument("Model asset paths must stay within the managed model directory.");
  }

  return destination;
}

void DownloadBinaryFile(std::string const &url, std::filesystem::path const &destination) {
  std::filesystem::create_directories(destination.parent_path());
  const std::wstring wideUrl = Utf8ToWide(url);
  const HRESULT hr = URLDownloadToFileW(nullptr, wideUrl.c_str(), destination.c_str(), 0, nullptr);
  if (FAILED(hr)) {
    throw std::runtime_error("Unable to download the Windows local model asset.");
  }
}

std::wstring PickFolderPath() {
  winrt::com_ptr<IFileOpenDialog> dialog;
  winrt::check_hresult(CoCreateInstance(CLSID_FileOpenDialog, nullptr, CLSCTX_INPROC_SERVER, IID_PPV_ARGS(dialog.put())));

  DWORD options = 0;
  winrt::check_hresult(dialog->GetOptions(&options));
  winrt::check_hresult(dialog->SetOptions(options | FOS_PICKFOLDERS | FOS_FORCEFILESYSTEM | FOS_PATHMUSTEXIST));
  winrt::check_hresult(dialog->SetTitle(L"Select ONNX Runtime GenAI Model Folder"));

  const HRESULT showResult = dialog->Show(GetActiveWindow());
  if (showResult == HRESULT_FROM_WIN32(ERROR_CANCELLED)) {
    return {};
  }
  winrt::check_hresult(showResult);

  winrt::com_ptr<IShellItem> item;
  winrt::check_hresult(dialog->GetResult(item.put()));

  PWSTR selectedPath = nullptr;
  winrt::check_hresult(item->GetDisplayName(SIGDN_FILESYSPATH, &selectedPath));
  std::wstring result(selectedPath ? selectedPath : L"");
  CoTaskMemFree(selectedPath);
  return result;
}

winrt::Microsoft::ReactNative::JSValueObject BuildStatus(
    bool available,
    std::string const &reason,
    bool loaded,
    std::wstring const &configuredModelDirectory,
    std::wstring const &loadedModelDirectory) {
  winrt::Microsoft::ReactNative::JSValueObject status;
  status["available"] = available;
  status["loaded"] = loaded;
  status["configured"] = !configuredModelDirectory.empty();
  status["backend"] = "windows-native-onnx";
  status["reason"] = reason;
  status["modelDirectory"] = configuredModelDirectory.empty() ? winrt::Microsoft::ReactNative::JSValue(nullptr) : winrt::Microsoft::ReactNative::JSValue(WideToUtf8(configuredModelDirectory));
  status["loadedModelDirectory"] = loadedModelDirectory.empty() ? winrt::Microsoft::ReactNative::JSValue(nullptr) : winrt::Microsoft::ReactNative::JSValue(WideToUtf8(loadedModelDirectory));
  status["runtimeLinked"] = kOrtGenAiLinked;
  return status;
}

void EnsurePersistedConfigLoaded(LocalLlmRuntimeState &state) {
  if (state.configuredModelDirectory.empty()) {
    if (const auto persisted = LoadConfiguredDirectoryFromDisk()) {
      state.configuredModelDirectory = *persisted;
    }
  }
}

LocalLlmRuntimeSnapshot GetCurrentStateSnapshot() {
  std::scoped_lock lock(g_runtimeMutex);
  EnsurePersistedConfigLoaded(g_runtimeState);
  return LocalLlmRuntimeSnapshot{
      g_runtimeState.configuredModelDirectory,
      g_runtimeState.loadedModelDirectory,
      g_runtimeState.generationInFlight,
      g_runtimeState.cancelRequested,
  };
}

#if defined(FINSIGHT_ENABLE_ORT_GENAI) && FINSIGHT_ENABLE_ORT_GENAI
void EnsureGenAiInitialized(LocalLlmRuntimeState &state) {
  if (!state.handle) {
    state.handle = std::make_unique<OgaHandle>();
  }
}

void ResetLoadedResources(LocalLlmRuntimeState &state) {
  state.tokenizer.reset();
  state.model.reset();
  state.loadedModelDirectory.clear();
  state.generationInFlight = false;
  state.cancelRequested = false;
}
#endif

winrt::Microsoft::ReactNative::JSValueObject BuildCurrentStatus() {
  const auto state = GetCurrentStateSnapshot();
  std::string reason;
  if (state.configuredModelDirectory.empty()) {
    reason = "No Windows local model directory is configured yet.";
  } else if (!std::filesystem::exists(std::filesystem::path(state.configuredModelDirectory))) {
    reason = "The configured Windows local model directory no longer exists.";
  } else if (!HasRequiredModelFiles(std::filesystem::path(state.configuredModelDirectory))) {
    reason = "The configured Windows local model directory is missing genai_config.json.";
  } else if (!kOrtGenAiLinked) {
    reason = "A valid model directory is configured, but ONNX Runtime GenAI is not linked into this native build yet.";
  } else if (!state.loadedModelDirectory.empty()) {
    reason = "Windows local LLM model is loaded and ready for generation.";
  } else {
    reason = "A valid Windows local model directory is configured and ready to load.";
  }

  const bool available = kOrtGenAiLinked && !state.loadedModelDirectory.empty();
  return BuildStatus(available, reason, !state.loadedModelDirectory.empty(), state.configuredModelDirectory, state.loadedModelDirectory);
}

void ConfigureModelDirectoryInternal(std::wstring const &path) {
  const std::wstring normalized = NormalizeDirectory(path);
  EnsureValidModelDirectory(normalized);
  SaveConfiguredDirectoryToDisk(normalized);

  std::scoped_lock lock(g_runtimeMutex);
  g_runtimeState.configuredModelDirectory = normalized;
#if defined(FINSIGHT_ENABLE_ORT_GENAI) && FINSIGHT_ENABLE_ORT_GENAI
  ResetLoadedResources(g_runtimeState);
#else
  g_runtimeState.loadedModelDirectory.clear();
  g_runtimeState.generationInFlight = false;
  g_runtimeState.cancelRequested = false;
#endif
}

} // namespace

namespace winrt::finsight {

void LocalLlmModule::prepareModelDownload(
    std::wstring const &installDirectoryName,
    winrt::Microsoft::ReactNative::ReactPromise<winrt::Microsoft::ReactNative::JSValue> &&result) noexcept {
  auto promise = std::make_shared<winrt::Microsoft::ReactNative::ReactPromise<winrt::Microsoft::ReactNative::JSValue>>(std::move(result));
  std::thread([installDirectoryName, promise]() mutable {
    try {
      auto directory = ResolveManagedModelDirectory(installDirectoryName);
      if (std::filesystem::exists(directory)) {
        std::filesystem::remove_all(directory);
      }
      std::filesystem::create_directories(directory);
      promise->Resolve(WideToUtf8(directory.wstring()));
    } catch (std::exception const &ex) {
      promise->Reject(ex.what());
    } catch (...) {
      promise->Reject("Unable to prepare the Windows managed model directory.");
    }
  }).detach();
}

void LocalLlmModule::downloadModelAsset(
    std::string const &url,
    std::wstring const &installDirectoryName,
    std::wstring const &relativePath,
    winrt::Microsoft::ReactNative::ReactPromise<winrt::Microsoft::ReactNative::JSValue> &&result) noexcept {
  auto promise = std::make_shared<winrt::Microsoft::ReactNative::ReactPromise<winrt::Microsoft::ReactNative::JSValue>>(std::move(result));
  std::thread([url, installDirectoryName, relativePath, promise]() mutable {
    try {
      const auto directory = ResolveManagedModelDirectory(installDirectoryName);
      const auto destination = ResolveRelativeAssetPath(directory, relativePath);
      DownloadBinaryFile(url, destination);

      winrt::Microsoft::ReactNative::JSValueObject response;
      response["directory"] = WideToUtf8(directory.wstring());
      response["file"] = WideToUtf8(destination.wstring());
      promise->Resolve(winrt::Microsoft::ReactNative::JSValue(std::move(response)));
    } catch (std::exception const &ex) {
      promise->Reject(ex.what());
    } catch (...) {
      promise->Reject("Unable to download the Windows local model asset.");
    }
  }).detach();
}

void LocalLlmModule::pickModelDirectory(
    winrt::Microsoft::ReactNative::ReactPromise<winrt::Microsoft::ReactNative::JSValue> &&result) noexcept {
  try {
    const auto path = PickFolderPath();
    if (path.empty()) {
      result.Resolve(nullptr);
      return;
    }

    result.Resolve(WideToUtf8(NormalizeDirectory(path)));
  } catch (winrt::hresult_error const &ex) {
    result.Reject(WideToUtf8(std::wstring(ex.message().c_str())).c_str());
  } catch (std::exception const &ex) {
    result.Reject(ex.what());
  } catch (...) {
    result.Reject("Unable to open the Windows model folder picker.");
  }
}

void LocalLlmModule::configureModelDirectory(
    std::wstring const &path,
    winrt::Microsoft::ReactNative::ReactPromise<winrt::Microsoft::ReactNative::JSValue> &&result) noexcept {
  try {
    ConfigureModelDirectoryInternal(path);
    auto status = BuildCurrentStatus();
    result.Resolve(winrt::Microsoft::ReactNative::JSValue(std::move(status)));
  } catch (std::exception const &ex) {
    result.Reject(ex.what());
  } catch (...) {
    result.Reject("Unable to configure the Windows local model directory.");
  }
}

void LocalLlmModule::getStatus(
    winrt::Microsoft::ReactNative::ReactPromise<winrt::Microsoft::ReactNative::JSValue> &&result) noexcept {
  try {
    auto status = BuildCurrentStatus();
    result.Resolve(winrt::Microsoft::ReactNative::JSValue(std::move(status)));
  } catch (std::exception const &ex) {
    result.Reject(ex.what());
  } catch (...) {
    result.Reject("Unable to read the Windows local LLM status.");
  }
}

void LocalLlmModule::loadModel(
    winrt::Microsoft::ReactNative::JSValueObject const &config,
    winrt::Microsoft::ReactNative::ReactPromise<winrt::Microsoft::ReactNative::JSValue> &&result) noexcept {
  auto promise = std::make_shared<winrt::Microsoft::ReactNative::ReactPromise<winrt::Microsoft::ReactNative::JSValue>>(std::move(result));
  std::wstring providedModelDirectory;
  if (auto providedPath = config.find("modelDirectory");
      providedPath != config.end() && providedPath->second.Type() == winrt::Microsoft::ReactNative::JSValueType::String) {
    providedModelDirectory = Utf8ToWide(providedPath->second.AsString());
  }

  std::thread([providedModelDirectory, promise]() mutable {
    try {
      if (!providedModelDirectory.empty()) {
        ConfigureModelDirectoryInternal(providedModelDirectory);
      }

      std::wstring configuredModelDirectory;
      {
        std::scoped_lock lock(g_runtimeMutex);
        EnsurePersistedConfigLoaded(g_runtimeState);
        configuredModelDirectory = g_runtimeState.configuredModelDirectory;
      }
      EnsureValidModelDirectory(configuredModelDirectory);

      if (!kOrtGenAiLinked) {
        auto status = BuildCurrentStatus();
        promise->Resolve(winrt::Microsoft::ReactNative::JSValue(std::move(status)));
        return;
      }

      {
        std::scoped_lock lock(g_runtimeMutex);
        EnsureGenAiInitialized(g_runtimeState);
        ResetLoadedResources(g_runtimeState);

        const std::string modelPath = WideToUtf8(configuredModelDirectory);
        g_runtimeState.model = OgaModel::Create(modelPath.c_str());
        g_runtimeState.tokenizer = OgaTokenizer::Create(*g_runtimeState.model);
        g_runtimeState.loadedModelDirectory = configuredModelDirectory;
      }

      auto status = BuildCurrentStatus();
      promise->Resolve(winrt::Microsoft::ReactNative::JSValue(std::move(status)));
    } catch (std::exception const &ex) {
      promise->Reject(ex.what());
    } catch (...) {
      promise->Reject("Unable to load the Windows local LLM model.");
    }
  }).detach();
}

void LocalLlmModule::unloadModel(
    winrt::Microsoft::ReactNative::ReactPromise<winrt::Microsoft::ReactNative::JSValue> &&result) noexcept {
  try {
    {
      std::scoped_lock lock(g_runtimeMutex);
#if defined(FINSIGHT_ENABLE_ORT_GENAI) && FINSIGHT_ENABLE_ORT_GENAI
      ResetLoadedResources(g_runtimeState);
#else
      g_runtimeState.loadedModelDirectory.clear();
      g_runtimeState.generationInFlight = false;
      g_runtimeState.cancelRequested = false;
#endif
    }
    auto status = BuildCurrentStatus();
    result.Resolve(winrt::Microsoft::ReactNative::JSValue(std::move(status)));
  } catch (...) {
    result.Reject("Unable to unload the Windows local LLM model.");
  }
}

void LocalLlmModule::cancelGeneration(
    winrt::Microsoft::ReactNative::ReactPromise<winrt::Microsoft::ReactNative::JSValue> &&result) noexcept {
  try {
    std::scoped_lock lock(g_runtimeMutex);
    g_runtimeState.cancelRequested = true;
    result.Resolve(true);
  } catch (...) {
    result.Reject("Unable to cancel Windows local generation.");
  }
}

void LocalLlmModule::generate(
    winrt::Microsoft::ReactNative::JSValueObject const &payload,
    winrt::Microsoft::ReactNative::ReactPromise<winrt::Microsoft::ReactNative::JSValue> &&result) noexcept {
  auto promise = std::make_shared<winrt::Microsoft::ReactNative::ReactPromise<winrt::Microsoft::ReactNative::JSValue>>(std::move(result));
  std::string userPrompt;
  if (const auto iterator = payload.find("userPrompt");
      iterator != payload.end() && iterator->second.Type() == winrt::Microsoft::ReactNative::JSValueType::String) {
    userPrompt = iterator->second.AsString();
  }

  std::string fullPrompt = userPrompt;
  if (const auto iterator = payload.find("fullPrompt");
      iterator != payload.end() && iterator->second.Type() == winrt::Microsoft::ReactNative::JSValueType::String) {
    fullPrompt = iterator->second.AsString();
  }

  std::thread([userPrompt, fullPrompt, promise]() mutable {
    try {
    if (!kOrtGenAiLinked) {
      const auto state = GetCurrentStateSnapshot();
      if (state.loadedModelDirectory.empty()) {
        promise->Reject("No Windows local model is loaded.");
        return;
      }

      winrt::Microsoft::ReactNative::JSValueObject response;
      response["text"] = nullptr;
      response["backend"] = "windows-native-onnx";
      response["reason"] = "A Windows local model directory is configured, but ONNX Runtime GenAI is not linked yet.";
      response["modelDirectory"] = WideToUtf8(state.loadedModelDirectory);
      if (!userPrompt.empty()) {
        response["lastPromptPreview"] = userPrompt.substr(0, 160);
      }
      promise->Resolve(winrt::Microsoft::ReactNative::JSValue(std::move(response)));
      return;
    }

    if (userPrompt.empty()) {
      promise->Reject("Generation requires a userPrompt string.");
      return;
    }

    std::unique_lock lock(g_runtimeMutex);
    if (!g_runtimeState.model || !g_runtimeState.tokenizer || g_runtimeState.loadedModelDirectory.empty()) {
      promise->Reject("No Windows local model is loaded.");
      return;
    }

    if (g_runtimeState.generationInFlight) {
      promise->Reject("Another Windows local generation request is already running.");
      return;
    }

    g_runtimeState.generationInFlight = true;
    g_runtimeState.cancelRequested = false;

    try {
        auto inputSequences = OgaSequences::Create();
        g_runtimeState.tokenizer->Encode(fullPrompt.c_str(), *inputSequences);
        const double inputTokenCount = static_cast<double>(inputSequences->SequenceCount(0));

        auto params = OgaGeneratorParams::Create(*g_runtimeState.model);
        const double maxNewTokens = 72.0;
        params->SetSearchOption("max_length", std::min(4096.0, inputTokenCount + maxNewTokens));
        params->SetSearchOptionBool("do_sample", false);

        auto generator = OgaGenerator::Create(*g_runtimeState.model, *params);
      generator->AppendTokenSequences(*inputSequences);
      auto stream = OgaTokenizerStream::Create(*g_runtimeState.tokenizer);

      std::string outputText;
      size_t emittedTokens = 0;
      while (!generator->IsDone()) {
        if (g_runtimeState.cancelRequested) {
          generator->SetRuntimeOption("terminate_session", "1");
        }

        if (g_runtimeState.cancelRequested || generator->IsSessionTerminated()) {
          break;
        }

        const size_t previousCount = generator->GetSequenceCount(0);
        generator->GenerateNextToken();
        const size_t nextCount = generator->GetSequenceCount(0);
        if (nextCount <= previousCount) {
          continue;
        }

        const int32_t *tokenData = generator->GetSequenceData(0);
        for (size_t index = previousCount; index < nextCount; ++index) {
          const char *chunk = stream->Decode(tokenData[index]);
          if (chunk) {
            outputText += chunk;
          }
          ++emittedTokens;
        }
      }

      winrt::Microsoft::ReactNative::JSValueObject response;
      response["text"] = outputText;
      response["backend"] = "windows-native-onnx";
      response["modelDirectory"] = WideToUtf8(g_runtimeState.loadedModelDirectory);
      response["cancelled"] = g_runtimeState.cancelRequested;
      response["prompt"] = userPrompt;
      response["tokensGenerated"] = static_cast<double>(emittedTokens);

      g_runtimeState.generationInFlight = false;
      g_runtimeState.cancelRequested = false;
      lock.unlock();
      promise->Resolve(winrt::Microsoft::ReactNative::JSValue(std::move(response)));
      return;
    } catch (...) {
      g_runtimeState.generationInFlight = false;
      g_runtimeState.cancelRequested = false;
      throw;
    }
  } catch (std::exception const &ex) {
    promise->Reject(ex.what());
  } catch (...) {
    promise->Reject("Unable to generate text with the Windows local LLM runtime.");
  }
  }).detach();
}

} // namespace winrt::finsight
