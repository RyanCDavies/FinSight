#pragma once

#include "NativeModules.h"
#include "JSValue.h"

namespace winrt::finsight {

REACT_MODULE(AppStorageModule, L"WindowsAppStorage");

struct AppStorageModule {
  REACT_METHOD(readText);
  void readText(std::wstring const &filename, winrt::Microsoft::ReactNative::ReactPromise<winrt::Microsoft::ReactNative::JSValue> &&result) noexcept;

  REACT_METHOD(writeText);
  void writeText(std::wstring const &filename, std::string const &text, winrt::Microsoft::ReactNative::ReactPromise<winrt::Microsoft::ReactNative::JSValue> &&result) noexcept;
};

} // namespace winrt::finsight
