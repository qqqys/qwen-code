# Generated UI PR validation screenshots

Source commit: `34eea33014ba7ff50aec5910b7de556b83fca4db`, based on upstream `848111433baffa0fc20af1095f77ec4d014f2c76`. Captured on macOS arm64 / Node.js 22.17.0 / actual Chromium Web Shell.

The CLI/daemon/MCP run from a fresh npm package independently extracted into a directory containing spaces and Chinese characters. Package SHA256: `a4656f2e8b39a22bb6319dd1875179a3f2ca0743307514273f83275973f13d00`.

All four images use deterministic loopback model fixtures and isolated user/workspace directories; no real-model quality claim. The enabled screenshot shows an actual browser input changing the per-worker rate from 25 to 40 and capacity from 100 to 160 requests/s. Disabled-history and live-policy images show the saved readable summary without an iframe or Worker. The exported HTML screenshot shows the complete safe summary; its existing renderer URLs were fulfilled with byte-identical packaged assets and original integrity checks. This is not live CDN publication verification.

The disabled screenshot is the saved history reopened under a reconstructed disabled owner, not a screenshot of a previous product revision. No native Tauri window, Windows/Linux execution, remote CI or production claim is implied.

This branch contains review evidence only and is separate from the feature PR diff.
