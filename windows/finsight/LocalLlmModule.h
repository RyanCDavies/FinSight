#pragma once

#include "NativeModules.h"
#include "JSValue.h"

namespace winrt::finsight {

REACT_MODULE(LocalLlmModule, L"WindowsLocalLLM");

struct LocalLlmModule {
  REACT_METHOD(prepareModelDownload);
  void prepareModelDownload(
      std::wstring const &installDirectoryName,
      winrt::Microsoft::ReactNative::ReactPromise<winrt::Microsoft::ReactNative::JSValue> &&result) noexcept;

  REACT_METHOD(downloadModelAsset);
  void downloadModelAsset(
      std::string const &url,
      std::wstring const &installDirectoryName,
      std::wstring const &relativePath,
      winrt::Microsoft::ReactNative::ReactPromise<winrt::Microsoft::ReactNative::JSValue> &&result) noexcept;

  REACT_METHOD(pickModelDirectory);
  void pickModelDirectory(winrt::Microsoft::ReactNative::ReactPromise<winrt::Microsoft::ReactNative::JSValue> &&result) noexcept;

  REACT_METHOD(configureModelDirectory);
  void configureModelDirectory(
      std::wstring const &path,
      winrt::Microsoft::ReactNative::ReactPromise<winrt::Microsoft::ReactNative::JSValue> &&result) noexcept;

  REACT_METHOD(getStatus);
  void getStatus(winrt::Microsoft::ReactNative::ReactPromise<winrt::Microsoft::ReactNative::JSValue> &&result) noexcept;

  REACT_METHOD(loadModel);
  void loadModel(
      winrt::Microsoft::ReactNative::JSValueObject const &config,
      winrt::Microsoft::ReactNative::ReactPromise<winrt::Microsoft::ReactNative::JSValue> &&result) noexcept;

  REACT_METHOD(unloadModel);
  void unloadModel(winrt::Microsoft::ReactNative::ReactPromise<winrt::Microsoft::ReactNative::JSValue> &&result) noexcept;

  REACT_METHOD(cancelGeneration);
  void cancelGeneration(winrt::Microsoft::ReactNative::ReactPromise<winrt::Microsoft::ReactNative::JSValue> &&result) noexcept;

  REACT_METHOD(generate);
  void generate(
      winrt::Microsoft::ReactNative::JSValueObject const &payload,
      winrt::Microsoft::ReactNative::ReactPromise<winrt::Microsoft::ReactNative::JSValue> &&result) noexcept;
};

} // namespace winrt::finsight
