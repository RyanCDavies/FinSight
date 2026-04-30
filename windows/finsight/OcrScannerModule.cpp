#include "pch.h"

#include "OcrScannerModule.h"

#include <algorithm>
#include <memory>
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

using ReactPromiseType = winrt::Microsoft::ReactNative::ReactPromise<winrt::Microsoft::ReactNative::JSValue>;

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

std::wstring PickImageFilePath() {
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
      return {};
    }
    throw std::runtime_error("Unable to open the Windows image picker.");
  }

  std::wstring const path{filePath};
  if (!HasSupportedImageExtension(path)) {
    throw std::runtime_error("Please choose a supported image file.");
  }

  return path;
}

void RejectPromise(std::shared_ptr<ReactPromiseType> const &promise, char const *message) {
  promise->Reject(message);
}

void StartOcrRecognition(
    std::wstring const &path,
    std::wstring const &mode,
    std::shared_ptr<ReactPromiseType> const &promise) {
  using winrt::Windows::Graphics::Imaging::BitmapAlphaMode;
  using winrt::Windows::Graphics::Imaging::BitmapDecoder;
  using winrt::Windows::Graphics::Imaging::BitmapPixelFormat;
  using winrt::Windows::Media::Ocr::OcrEngine;
  using winrt::Windows::Storage::FileAccessMode;

  const auto name = std::filesystem::path(path).filename().wstring();
  auto fileOp = winrt::Windows::Storage::StorageFile::GetFileFromPathAsync(path);
  fileOp.Completed([mode, promise, path, name](auto const &fileInfo, winrt::Windows::Foundation::AsyncStatus fileStatus) {
    try {
      if (fileStatus != winrt::Windows::Foundation::AsyncStatus::Completed) {
        RejectPromise(promise, "Unable to access the selected image.");
        return;
      }

      const auto file = fileInfo.GetResults();
      auto openOp = file.OpenAsync(FileAccessMode::Read);
      openOp.Completed([mode, promise, path, name](auto const &streamInfo, winrt::Windows::Foundation::AsyncStatus status) {
        try {
          if (status != winrt::Windows::Foundation::AsyncStatus::Completed) {
            RejectPromise(promise, "Unable to open the scanned image.");
            return;
          }

          const auto stream = streamInfo.GetResults();
          auto decoderOp = BitmapDecoder::CreateAsync(stream);
          decoderOp.Completed([mode, promise, path, name](auto const &decoderInfo, winrt::Windows::Foundation::AsyncStatus decoderStatus) {
            try {
              if (decoderStatus != winrt::Windows::Foundation::AsyncStatus::Completed) {
                RejectPromise(promise, "Unable to decode the scanned image.");
                return;
              }

              const auto decoder = decoderInfo.GetResults();
              auto bitmapOp = decoder.GetSoftwareBitmapAsync(BitmapPixelFormat::Bgra8, BitmapAlphaMode::Premultiplied);
              bitmapOp.Completed([mode, promise, path, name](auto const &bitmapInfo, winrt::Windows::Foundation::AsyncStatus bitmapStatus) {
                try {
                  if (bitmapStatus != winrt::Windows::Foundation::AsyncStatus::Completed) {
                    RejectPromise(promise, "Unable to prepare the scanned image for OCR.");
                    return;
                  }

                  const auto bitmap = bitmapInfo.GetResults();
                  const auto engine = OcrEngine::TryCreateFromUserProfileLanguages();
                  if (!engine) {
                    RejectPromise(promise, "Windows OCR is unavailable on this device.");
                    return;
                  }

                  auto recognizeOp = engine.RecognizeAsync(bitmap);
                  recognizeOp.Completed([mode, promise, path, name](auto const &recognizeInfo, winrt::Windows::Foundation::AsyncStatus recognizeStatus) {
                    try {
                      if (recognizeStatus != winrt::Windows::Foundation::AsyncStatus::Completed) {
                        RejectPromise(promise, "Unable to recognize text in the scanned image.");
                        return;
                      }

                      const auto scanResult = recognizeInfo.GetResults();
                      promise->Resolve(winrt::Microsoft::ReactNative::JSValueObject{
                          {"imageUri", WideToUtf8(ToFileUri(path))},
                          {"fileName", WideToUtf8(name)},
                          {"mode", WideToUtf8(mode)},
                          {"text", WideToUtf8(std::wstring(scanResult.Text().c_str()))},
                      });
                    } catch (std::exception const &ex) {
                      promise->Reject(ex.what());
                    } catch (...) {
                      RejectPromise(promise, "Unable to recognize text in the scanned image.");
                    }
                  });
                } catch (std::exception const &ex) {
                  promise->Reject(ex.what());
                } catch (...) {
                  RejectPromise(promise, "Unable to prepare the scanned image for OCR.");
                }
              });
            } catch (std::exception const &ex) {
              promise->Reject(ex.what());
            } catch (...) {
              RejectPromise(promise, "Unable to decode the scanned image.");
            }
          });
        } catch (std::exception const &ex) {
          promise->Reject(ex.what());
        } catch (...) {
          RejectPromise(promise, "Unable to open the scanned image.");
        }
      });
    } catch (std::exception const &ex) {
      promise->Reject(ex.what());
    } catch (...) {
      RejectPromise(promise, "Unable to access the selected image.");
    }
  });
}

} // namespace

namespace winrt::finsight {

void OcrScannerModule::Initialize(winrt::Microsoft::ReactNative::ReactContext const &reactContext) noexcept {
  m_context = reactContext;
}

void OcrScannerModule::scanImage(
    std::wstring const &mode,
    winrt::Microsoft::ReactNative::ReactPromise<winrt::Microsoft::ReactNative::JSValue> &&result) noexcept {
  auto promise = std::make_shared<ReactPromiseType>(std::move(result));
  auto uiDispatcher = m_context.UIDispatcher();
  if (!uiDispatcher) {
    promise->Reject("Windows OCR scanning is unavailable.");
    return;
  }

    uiDispatcher.Post([mode, promise]() noexcept {
      try {
        if (_wcsicmp(mode.c_str(), L"camera") == 0) {
          RejectPromise(
              promise,
              "Direct camera capture is currently unavailable on Windows in this build. Please take the photo with the Windows Camera app, then choose the saved image to scan.");
          return;
        }

      const auto path = PickImageFilePath();
      if (path.empty()) {
        promise->Resolve(nullptr);
        return;
      }

      StartOcrRecognition(path, mode, promise);
    } catch (std::exception const &ex) {
      promise->Reject(ex.what());
    } catch (...) {
      RejectPromise(promise, "Unable to scan the selected image.");
    }
  });
}

} // namespace winrt::finsight
