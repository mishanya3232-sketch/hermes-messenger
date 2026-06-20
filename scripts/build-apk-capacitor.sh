#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

export ANDROID_HOME="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-/usr/lib/android-sdk}}"
export ANDROID_SDK_ROOT="$ANDROID_HOME"

if [ ! -d node_modules/@capacitor/cli ]; then
  echo "Installing Capacitor dev dependencies..."
  npm install --no-audit --no-fund @capacitor/core @capacitor/cli @capacitor/android
fi

if [ ! -d android ]; then
  echo "Creating Android Capacitor project..."
  npx cap add android
fi

echo "Syncing web assets..."
npx cap sync android

echo "Building debug APK..."
cd android
./gradlew assembleDebug

APK_PATH="app/build/outputs/apk/debug/app-debug.apk"
if [ -f "$APK_PATH" ]; then
  echo "APK ready: $ROOT_DIR/$APK_PATH"
else
  echo "Build finished, but APK was not found at $ROOT_DIR/$APK_PATH" >&2
  exit 1
fi
