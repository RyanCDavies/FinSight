#pragma once

#include "NativeModules.h"
#include "JSValue.h"

namespace winrt::finsight {

REACT_MODULE(CsvPickerModule, L"WindowsCsvPicker");

struct CsvPickerModule {
  REACT_INIT(Initialize);
  void Initialize(winrt::Microsoft::ReactNative::ReactContext const &reactContext) noexcept;

  REACT_METHOD(pickCsvText);
  void pickCsvText(winrt::Microsoft::ReactNative::ReactPromise<winrt::Microsoft::ReactNative::JSValue> &&result) noexcept;

  REACT_METHOD(setDropEnabled);
  void setDropEnabled(bool enabled) noexcept;

  REACT_EVENT(OnCsvDrop, L"WindowsCsvPickerDrop");
  std::function<void(winrt::Microsoft::ReactNative::JSValue const &)> OnCsvDrop;

 private:
  winrt::Microsoft::ReactNative::ReactContext m_context;
};

} // namespace winrt::finsight
