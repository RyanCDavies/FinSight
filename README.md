# FinSight — Expo + React Native Setup

## Prerequisites
- Node.js (already installed)
- npm (already installed)
- Expo Go app on your phone (iOS App Store / Google Play)

---

## Setup (PowerShell)

```powershell
# 1. Install Expo CLI globally
npm install -g expo-cli eas-cli

# 2. Move into the project folder
cd finsight-expo

# 3. Install all dependencies
npm install

# 4. Start the dev server
npx expo start
```

A QR code will appear in the terminal.
Open **Expo Go** on your phone and scan it — the app loads instantly over your WiFi.

---

## Where is the SQLite database?

The real `finsight.db` file lives on your device at:

**Android:**
```
/data/data/com.finsight.app/databases/finsight.db
```
Pull it to your PC with ADB:
```powershell
adb pull /data/data/com.finsight.app/databases/finsight.db .\finsight.db
```
Then open `finsight.db` in **DB Browser for SQLite**.

**iOS (Simulator):**
The `.db` file is in the app's sandboxed Documents directory.
Access via Xcode → Devices & Simulators → Download Container.

---

## Adding your Anthropic API Key

The AI Assistant screen will prompt you on first launch.
Enter your key from https://console.anthropic.com

The key is stored in the device's **secure keychain** (iOS Keychain / Android Keystore)
via `expo-secure-store` — it never leaves the device.

---

## Project Structure

```
finsight-expo/
├── App.js                    # Root navigator
├── app.json                  # Expo config
├── package.json
├── src/
│   ├── theme.js              # Design system (colors, spacing, fonts)
│   ├── db/
│   │   └── database.js       # Layer 4: SQLite DAO + schema
│   ├── engines/
│   │   └── index.js          # Layer 3: AI/ML engines
│   ├── services/
│   │   └── index.js          # Layer 2: Business logic services
│   ├── components/
│   │   └── index.js          # Shared UI components
│   └── screens/
│       └── index.js          # Layer 1: All screens
```

---

## Building for Production

```powershell
# Android APK (for sideloading)
eas build --platform android --profile preview

# iOS TestFlight (requires Apple Developer account)
eas build --platform ios
```
