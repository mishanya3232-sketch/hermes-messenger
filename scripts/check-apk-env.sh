#!/usr/bin/env bash
set -euo pipefail

missing=0
for cmd in node npm npx java javac; do
  if command -v "$cmd" >/dev/null 2>&1; then
    printf 'OK %s: ' "$cmd"
    "$cmd" --version 2>&1 | head -n 1
  else
    printf 'MISSING %s\n' "$cmd"
    missing=1
  fi
done

if command -v adb >/dev/null 2>&1; then
  printf 'OK adb: '
  adb version | head -n 1
else
  printf 'MISSING adb\n'
  missing=1
fi

if [ -n "${ANDROID_HOME:-}" ]; then
  printf 'OK ANDROID_HOME: %s\n' "$ANDROID_HOME"
elif [ -n "${ANDROID_SDK_ROOT:-}" ]; then
  printf 'OK ANDROID_SDK_ROOT: %s\n' "$ANDROID_SDK_ROOT"
elif [ -d /usr/lib/android-sdk ]; then
  printf 'OK Android SDK candidate: /usr/lib/android-sdk\n'
else
  printf 'MISSING Android SDK (set ANDROID_HOME or ANDROID_SDK_ROOT)\n'
  missing=1
fi

exit "$missing"
