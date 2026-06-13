# Hermes Android APK

The Android wrapper lives in `packages/android`. It is a native WebView shell
for the hosted Hermes Web UI at `http://103.236.93.69:8648`.

## Build

```bash
npm run android:build
```

The debug APK is written to:

```text
packages/android/app/build/outputs/apk/debug/app-debug.apk
```

## Native Features

- WebView with DOM storage, file upload, downloads, microphone/camera access,
  and mixed HTTP/HTTPS content enabled for the current server.
- Runtime permission requests for microphone, camera, notifications, and media
  read permissions.
- A draggable floating tool button with:
  - refresh page
  - request permissions
  - download content
  - check APK update
  - open current page in browser
  - return to the default Hermes URL
- JavaScript bridge available as `window.HermesAndroid`:
  - `showTools()`
  - `requestPermissions()`
  - `checkUpdate()`
  - `downloadContent()`

## Remote Update Manifest

The APK checks:

```text
GET /api/mobile/manifest
```

The server reads this file from `HERMES_WEB_UI_HOME/mobile/manifest.json`:

```json
{
  "versionCode": 2,
  "versionName": "0.2.0",
  "apkUrl": "http://103.236.93.69:8648/api/mobile/files/hermes-0.2.0.apk",
  "notes": "更新说明"
}
```

When `versionCode` is greater than the installed APK version, the native shell
shows an update dialog and downloads the APK.

## Downloadable Content Manifest

The floating tool menu reads:

```text
GET /api/mobile/content
```

The server reads this file from `HERMES_WEB_UI_HOME/mobile/content.json`:

```json
{
  "items": [
    {
      "title": "示例文件",
      "url": "http://103.236.93.69:8648/api/mobile/files/example.zip"
    }
  ]
}
```

Files can be placed under `HERMES_WEB_UI_HOME/mobile/files/` and served through:

```text
GET /api/mobile/files/:name
```
