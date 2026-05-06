#include "pch.h"

#include "AppStorageModule.h"

#include <filesystem>
#include <fstream>
#include <stdexcept>
#include <string>

#include <winrt/Windows.Storage.h>

namespace {

std::filesystem::path ResolveStoragePath(std::wstring const &filename) {
  if (filename.empty() || filename.find(L"..") != std::wstring::npos) {
    throw std::invalid_argument("Invalid storage filename.");
  }

  const std::wstring localPath = winrt::Windows::Storage::ApplicationData::Current().LocalFolder().Path().c_str();
  std::filesystem::path directory{localPath};
  directory /= L"Finsight";
  std::filesystem::create_directories(directory);
  std::filesystem::path relative{filename};
  if (relative.is_absolute()) {
    throw std::invalid_argument("Invalid storage filename.");
  }

  for (auto const &part : relative) {
    const auto component = part.wstring();
    if (component.empty() || component == L"." || component == L"..") {
      throw std::invalid_argument("Invalid storage filename.");
    }
  }

  auto resolved = (directory / relative).lexically_normal();
  const auto root = directory.lexically_normal().wstring();
  const auto candidate = resolved.wstring();
  if (candidate.rfind(root, 0) != 0) {
    throw std::invalid_argument("Invalid storage filename.");
  }

  std::filesystem::create_directories(resolved.parent_path());
  return resolved;
}

std::string ReadUtf8(std::filesystem::path const &path) {
  if (!std::filesystem::exists(path)) {
    return {};
  }

  std::ifstream input(path, std::ios::binary);
  if (!input) {
    throw std::runtime_error("Unable to open the storage file.");
  }

  return std::string((std::istreambuf_iterator<char>(input)), std::istreambuf_iterator<char>());
}

void WriteUtf8(std::filesystem::path const &path, std::string const &text) {
  std::ofstream output(path, std::ios::binary | std::ios::trunc);
  if (!output) {
    throw std::runtime_error("Unable to write the storage file.");
  }

  output.write(text.data(), static_cast<std::streamsize>(text.size()));
  if (!output.good()) {
    throw std::runtime_error("Unable to save the storage file.");
  }
}

} // namespace

namespace winrt::finsight {

void AppStorageModule::readText(
    std::wstring const &filename,
    winrt::Microsoft::ReactNative::ReactPromise<winrt::Microsoft::ReactNative::JSValue> &&result) noexcept {
  try {
    result.Resolve(ReadUtf8(ResolveStoragePath(filename)));
  } catch (std::exception const &ex) {
    result.Reject(ex.what());
  } catch (...) {
    result.Reject("Unable to read the storage file.");
  }
}

void AppStorageModule::writeText(
    std::wstring const &filename,
    std::string const &text,
    winrt::Microsoft::ReactNative::ReactPromise<winrt::Microsoft::ReactNative::JSValue> &&result) noexcept {
  try {
    WriteUtf8(ResolveStoragePath(filename), text);
    result.Resolve(nullptr);
  } catch (std::exception const &ex) {
    result.Reject(ex.what());
  } catch (...) {
    result.Reject("Unable to write the storage file.");
  }
}

} // namespace winrt::finsight
