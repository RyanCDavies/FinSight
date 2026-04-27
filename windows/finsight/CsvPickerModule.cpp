#include "pch.h"

#include "CsvPickerModule.h"

#include <commdlg.h>
#include <algorithm>
#include <cwctype>
#include <filesystem>
#include <fstream>
#include <iterator>
#include <stdexcept>
#include <string>
#include <vector>
#include <shellapi.h>

namespace {

winrt::finsight::CsvPickerModule *g_dropModule = nullptr;
HWND g_dropWindow = nullptr;
WNDPROC g_previousWindowProc = nullptr;

std::string WideToUtf8(std::wstring const &value) {
  if (value.empty()) {
    return {};
  }

  const int size = WideCharToMultiByte(CP_UTF8, 0, value.c_str(), static_cast<int>(value.size()), nullptr, 0, nullptr, nullptr);
  std::string result(size, '\0');
  WideCharToMultiByte(CP_UTF8, 0, value.c_str(), static_cast<int>(value.size()), result.data(), size, nullptr, nullptr);
  return result;
}

std::string ReadCsvUtf8(std::wstring const &path) {
  std::ifstream input(path, std::ios::binary);
  if (!input) {
    throw std::runtime_error("Unable to open the selected CSV file.");
  }

  std::vector<unsigned char> bytes((std::istreambuf_iterator<char>(input)), std::istreambuf_iterator<char>());
  if (bytes.empty()) {
    return {};
  }

  if (bytes.size() >= 3 && bytes[0] == 0xEF && bytes[1] == 0xBB && bytes[2] == 0xBF) {
    return std::string(bytes.begin() + 3, bytes.end());
  }

  if (bytes.size() >= 2 && bytes[0] == 0xFF && bytes[1] == 0xFE) {
    std::wstring wide;
    wide.reserve((bytes.size() - 2) / 2);
    for (size_t i = 2; i + 1 < bytes.size(); i += 2) {
      wide.push_back(static_cast<wchar_t>(bytes[i] | (bytes[i + 1] << 8)));
    }
    return WideToUtf8(wide);
  }

  if (bytes.size() >= 2 && bytes[0] == 0xFE && bytes[1] == 0xFF) {
    std::wstring wide;
    wide.reserve((bytes.size() - 2) / 2);
    for (size_t i = 2; i + 1 < bytes.size(); i += 2) {
      wide.push_back(static_cast<wchar_t>((bytes[i] << 8) | bytes[i + 1]));
    }
    return WideToUtf8(wide);
  }

  return std::string(bytes.begin(), bytes.end());
}

bool HasCsvExtension(std::wstring const &path) {
  auto extension = std::filesystem::path(path).extension().wstring();
  std::transform(extension.begin(), extension.end(), extension.begin(), towlower);
  return extension == L".csv";
}

winrt::Microsoft::ReactNative::JSValueObject BuildCsvPayload(std::wstring const &path) {
  const std::string text = ReadCsvUtf8(path);
  const std::string name = WideToUtf8(std::filesystem::path(path).filename().wstring());

  return winrt::Microsoft::ReactNative::JSValueObject{
      {"name", name},
      {"text", text},
  };
}

LRESULT CALLBACK CsvDropWindowProc(HWND hwnd, UINT message, WPARAM wParam, LPARAM lParam) {
  if (message == WM_DROPFILES) {
    HDROP drop = reinterpret_cast<HDROP>(wParam);
    wchar_t filePath[4096] = {};
    const UINT fileCount = DragQueryFileW(drop, 0xFFFFFFFF, nullptr, 0);

    for (UINT index = 0; index < fileCount; ++index) {
      if (DragQueryFileW(drop, index, filePath, static_cast<UINT>(std::size(filePath))) == 0) {
        continue;
      }

      try {
        const std::wstring path{filePath};
        if (g_dropModule && g_dropModule->OnCsvDrop && HasCsvExtension(path)) {
          g_dropModule->OnCsvDrop(BuildCsvPayload(path));
          break;
        }
      } catch (...) {
      }
    }

    DragFinish(drop);
    return 0;
  }

  return CallWindowProcW(g_previousWindowProc, hwnd, message, wParam, lParam);
}

} // namespace

namespace winrt::finsight {

void CsvPickerModule::Initialize(winrt::Microsoft::ReactNative::ReactContext const &reactContext) noexcept {
  m_context = reactContext;
}

void CsvPickerModule::pickCsvText(winrt::Microsoft::ReactNative::ReactPromise<winrt::Microsoft::ReactNative::JSValue> &&result) noexcept {
  auto uiDispatcher = m_context.UIDispatcher();
  if (!uiDispatcher) {
    result.Reject("Windows CSV picker is unavailable.");
    return;
  }

  uiDispatcher.Post([result = std::move(result)]() mutable noexcept {
    try {
      wchar_t filePath[4096] = {};
      OPENFILENAMEW dialog{};
      dialog.lStructSize = sizeof(dialog);
      dialog.hwndOwner = GetActiveWindow();
      dialog.lpstrFile = filePath;
      dialog.nMaxFile = static_cast<DWORD>(std::size(filePath));
      dialog.lpstrFilter = L"CSV Files (*.csv)\0*.csv\0All Files (*.*)\0*.*\0";
      dialog.nFilterIndex = 1;
      dialog.Flags = OFN_FILEMUSTEXIST | OFN_PATHMUSTEXIST | OFN_HIDEREADONLY;
      dialog.lpstrDefExt = L"csv";

      if (!GetOpenFileNameW(&dialog)) {
        const DWORD error = CommDlgExtendedError();
        if (error == 0) {
          result.Resolve(nullptr);
        } else {
          result.Reject("Unable to open the Windows file picker.");
        }
        return;
      }

      result.Resolve(BuildCsvPayload(std::wstring{filePath}));
    } catch (std::exception const &ex) {
      result.Reject(ex.what());
    } catch (...) {
      result.Reject("Unable to read the selected CSV file.");
    }
  });
}

void CsvPickerModule::setDropEnabled(bool enabled) noexcept {
  auto uiDispatcher = m_context.UIDispatcher();
  if (!uiDispatcher) {
    return;
  }

  uiDispatcher.Post([enabled, this]() noexcept {
    HWND window = GetActiveWindow();
    if (!window) {
      return;
    }

    if (enabled) {
      if (g_dropWindow == window) {
        g_dropModule = this;
        DragAcceptFiles(window, TRUE);
        return;
      }

      if (g_dropWindow && g_previousWindowProc) {
        SetWindowLongPtrW(g_dropWindow, GWLP_WNDPROC, reinterpret_cast<LONG_PTR>(g_previousWindowProc));
        DragAcceptFiles(g_dropWindow, FALSE);
      }

      g_dropModule = this;
      g_dropWindow = window;
      g_previousWindowProc = reinterpret_cast<WNDPROC>(
          SetWindowLongPtrW(window, GWLP_WNDPROC, reinterpret_cast<LONG_PTR>(CsvDropWindowProc)));
      DragAcceptFiles(window, TRUE);
      return;
    }

    if (g_dropWindow) {
      DragAcceptFiles(g_dropWindow, FALSE);
      if (g_previousWindowProc) {
        SetWindowLongPtrW(g_dropWindow, GWLP_WNDPROC, reinterpret_cast<LONG_PTR>(g_previousWindowProc));
      }
    }

    g_dropModule = nullptr;
    g_dropWindow = nullptr;
    g_previousWindowProc = nullptr;
  });
}

} // namespace winrt::finsight
