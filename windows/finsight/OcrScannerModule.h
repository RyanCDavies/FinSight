#pragma once

#include "NativeModules.h"
#include "JSValue.h"

namespace winrt::finsight {

REACT_MODULE(OcrScannerModule, L"WindowsOcrScanner");

struct OcrScannerModule {
  REACT_INIT(Initialize);
  void Initialize(winrt::Microsoft::ReactNative::ReactContext const &reactContext) noexcept;

  REACT_METHOD(scanImage);
  void scanImage(
      std::wstring const &mode,
      winrt::Microsoft::ReactNative::ReactPromise<winrt::Microsoft::ReactNative::JSValue> &&result) noexcept;

 private:
  winrt::Microsoft::ReactNative::ReactContext m_context;
};

} // namespace winrt::finsight
