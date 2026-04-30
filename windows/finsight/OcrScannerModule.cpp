#include "pch.h"

#include "OcrScannerModule.h"

#include <algorithm>
#include <commdlg.h>
#include <cwctype>
#include <filesystem>
#include <string>

#include <winrt/Microsoft.UI.Interop.h>
#include <winrt/Microsoft.Windows.Media.Capture.h>
#include <winrt/Windows.Foundation.h>
#include <winrt/Windows.Graphics.Imaging.h>
#include <winrt/Windows.Media.Ocr.h>
#include <winrt/Windows.Storage.h>
#include <winrt/Windows.Storage.Streams.h>

namespace {

std::string WideToUtf8(std::wstring const &value) {
  if (value.empty()) {
    return {};
  }

  const int size = WideCharToMultiByte(CP_UTF8, 0, value.c_str(), static_cast<int>(value.size()), nullptr, 0, nullptr, nullptr);
  std::string result(size, '\0');
  WideCharToMultiByte(CP_UTF8, 0, value.c_str(), static_cast<int>(value.size()), result.data(), size, nullptr, nullptr);
  return result;
}

bool HasSupportedImageExtension(std::wstring const &path) {
  auto extension = std::filesystem::path(path).extension().wstring();
  std::transform(extension.begin(), extension.end(), extension.begin(), towlower);
  return extension == L".png" || extension == L".jpg" || extension == L".jpeg" || extension == L".bmp" ||
         extension == L".tif" || extension == L".tiff" || extension == L".gif" || extension == L".heic";
}

std::wstring ToFileUri(std::wstring const &path) {
  std::wstring normalized = path;
  std::replace(normalized.begin(), normalized.end(), L'\\', L'/');
  return L"file:///" + normalized;
}

winrt::Windows::Storage::StorageFile PickImageFile() {
  wchar_t filePath[4096] = {};
  OPENFILENAMEW dialog{};
  dialog.lStructSize = sizeof(dialog);
  dialog.hwndOwner = GetActiveWindow();
  dialog.lpstrFile = filePath;
  dialog.nMaxFile = static_cast<DWORD>(std::size(filePath));
  dialog.lpstrFilter = L"Image Files (*.png;*.jpg;*.jpeg;*.bmp;*.tif;*.tiff;*.gif;*.heic)\0*.png;*.jpg;*.jpeg;*.bmp;*.tif;*.tiff;*.gif;*.heic\0All Files (*.*)\0*.*\0";
  dialog.nFilterIndex = 1;
  dialog.Flags = OFN_FILEMUSTEXIST | OFN_PATHMUSTEXIST | OFN_HIDEREADONLY;

  if (!GetOpenFileNameW(&dialog)) {
    const DWORD error = CommDlgExtendedError();
    if (error == 0) {
      return nullptr;
    }
    throw std::runtime_error("Unable to open the Windows image picker.");
  }

  std::wstring const path{filePath};
  if (!HasSupportedImageExtension(path)) {
    throw std::runtime_error("Please choose a supported image file.");
  }

  return winrt::Windows::Storage::StorageFile::GetFileFromPathAsync(path).get();
}

winrt::Windows::Foundation::IAsyncOperation<winrt::Windows::Storage::StorageFile> CapturePhotoFromCameraAsync(HWND windowHandle) {
  const auto windowId = winrt::Microsoft::UI::GetWindowIdFromWindow(windowHandle);
  winrt::Microsoft::Windows::Media::Capture::CameraCaptureUI cameraUi(windowId);
  cameraUi.PhotoSettings().AllowCropping(false);
  cameraUi.PhotoSettings().Format(winrt::Microsoft::Windows::Media::Capture::CameraCaptureUIPhotoFormat::Jpeg);
  co_return co_await cameraUi.CaptureFileAsync(winrt::Microsoft::Windows::Media::Capture::CameraCaptureUIMode::Photo);
}

winrt::Windows::Foundation::IAsyncOperation<winrt::hstring> RecognizeTextAsync(
    winrt::Windows::Storage::StorageFile const &file) {
  using winrt::Windows::Graphics::Imaging::BitmapAlphaMode;
  using winrt::Windows::Graphics::Imaging::BitmapDecoder;
  using winrt::Windows::Graphics::Imaging::BitmapPixelFormat;
  using winrt::Windows::Media::Ocr::OcrEngine;
  using winrt::Windows::Storage::FileAccessMode;

  const auto stream = co_await file.OpenAsync(FileAccessMode::Read);
  const auto decoder = co_await BitmapDecoder::CreateAsync(stream);
  const auto bitmap = co_await decoder.GetSoftwareBitmapAsync(BitmapPixelFormat::Bgra8, BitmapAlphaMode::Premultiplied);
  const auto engine = OcrEngine::TryCreateFromUserProfileLanguages();
  if (!engine) {
    throw std::runtime_error("Windows OCR is unavailable on this device.");
  }

  const auto scanResult = co_await engine.RecognizeAsync(bitmap);
  co_return scanResult.Text();
}

} // namespace

namespace winrt::finsight {

void OcrScannerModule::Initialize(winrt::Microsoft::ReactNative::ReactContext const &reactContext) noexcept {
  m_context = reactContext;
}

void OcrScannerModule::scanImage(
    std::wstring const &mode,
    winrt::Microsoft::ReactNative::ReactPromise<winrt::Microsoft::ReactNative::JSValue> &&result) noexcept {
  auto uiDispatcher = m_context.UIDispatcher();
  if (!uiDispatcher) {
    result.Reject("Windows OCR scanning is unavailable.");
    return;
  }

  uiDispatcher.Post([mode, result = std::move(result)]() mutable noexcept {
    auto operation = [mode, result = std::move(result)]() -> winrt::fire_and_forget {
      try {
        const HWND windowHandle = GetActiveWindow();
        winrt::Windows::Storage::StorageFile file = nullptr;

        if (_wcsicmp(mode.c_str(), L"camera") == 0) {
          if (!windowHandle) {
            throw std::runtime_error("Unable to access the active app window for camera capture.");
          }
          file = co_await CapturePhotoFromCameraAsync(windowHandle);
        } else {
          file = PickImageFile();
        }

        if (!file) {
          result.Resolve(nullptr);
          co_return;
        }

        const std::wstring path = file.Path().c_str();
        const std::wstring name = file.Name().c_str();
        const winrt::hstring text = co_await RecognizeTextAsync(file);
        result.Resolve(winrt::Microsoft::ReactNative::JSValueObject{
            {"imageUri", WideToUtf8(ToFileUri(path))},
            {"fileName", WideToUtf8(name)},
            {"mode", WideToUtf8(mode)},
            {"text", WideToUtf8(text.c_str())},
        });
      } catch (std::exception const &ex) {
        result.Reject(ex.what());
      } catch (...) {
        result.Reject("Unable to scan the selected image.");
      }
    };

    operation();
  });
}

} // namespace winrt::finsight
