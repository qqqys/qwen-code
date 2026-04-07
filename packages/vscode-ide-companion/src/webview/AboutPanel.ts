/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode';
import * as os from 'os';

export class AboutPanel {
  private static currentPanel: AboutPanel | undefined;
  private readonly panel: vscode.WebviewPanel;
  private readonly disposables: vscode.Disposable[] = [];

  private constructor(
    panel: vscode.WebviewPanel,
    private readonly context: vscode.ExtensionContext,
  ) {
    this.panel = panel;
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    this.panel.webview.html = this.getHtmlContent();
  }

  static createOrShow(context: vscode.ExtensionContext): void {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    if (AboutPanel.currentPanel) {
      AboutPanel.currentPanel.panel.reveal(column);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'qwenCodeStatus',
      'Qwen Code: Status',
      column ?? vscode.ViewColumn.One,
      { enableScripts: true, retainContextWhenHidden: true },
    );

    AboutPanel.currentPanel = new AboutPanel(panel, context);
  }

  private getHtmlContent(): string {
    const ext = this.context.extension;
    const extVersion: string = ext?.packageJSON?.version ?? 'unknown';
    const vscodeVersion = vscode.version;
    const nodeVersion = process.version;
    const platform = `${os.platform()} ${os.arch()} (${os.release()})`;
    const hostname = os.hostname();
    const totalMem = (os.totalmem() / 1024 / 1024 / 1024).toFixed(1) + ' GB';
    const freeMem = (os.freemem() / 1024 / 1024 / 1024).toFixed(1) + ' GB';
    const workspaceFolders =
      vscode.workspace.workspaceFolders
        ?.map((f) => f.uri.fsPath)
        .join('<br>') ?? '(no workspace)';
    const extensionPath = ext?.extensionUri?.fsPath ?? 'unknown';
    const sandboxEnv = process.env['SANDBOX'] ?? 'no sandbox';

    const rows: Array<[string, string]> = [
      ['Extension Version', extVersion],
      ['VS Code Version', vscodeVersion],
      ['Node.js Version', nodeVersion],
      ['Platform', platform],
      ['Hostname', hostname],
      ['Total Memory', totalMem],
      ['Free Memory', freeMem],
      ['Sandbox', sandboxEnv],
      ['Extension Path', extensionPath],
      ['Workspace Folders', workspaceFolders],
    ];

    const tableRows = rows
      .map(
        ([label, value]) => `
        <tr>
          <td class="label">${label}</td>
          <td class="value">${value}</td>
        </tr>`,
      )
      .join('');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Qwen Code Status</title>
  <style>
    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      margin: 0;
      padding: 24px;
    }
    h1 {
      font-size: 1.4em;
      font-weight: 600;
      margin-bottom: 20px;
      color: var(--vscode-foreground);
      display: flex;
      align-items: center;
      gap: 8px;
    }
    h1::before {
      content: '';
      display: inline-block;
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: #4ec94e;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      max-width: 760px;
    }
    tr {
      border-bottom: 1px solid var(--vscode-editorWidget-border, rgba(128,128,128,0.2));
    }
    tr:last-child {
      border-bottom: none;
    }
    td {
      padding: 9px 12px;
      vertical-align: top;
    }
    td.label {
      width: 200px;
      font-weight: 500;
      color: var(--vscode-descriptionForeground);
      white-space: nowrap;
    }
    td.value {
      color: var(--vscode-foreground);
      word-break: break-all;
    }
    .card {
      border: 1px solid var(--vscode-editorWidget-border, rgba(128,128,128,0.2));
      border-radius: 6px;
      overflow: hidden;
      max-width: 760px;
    }
    .card-header {
      padding: 10px 14px;
      background: var(--vscode-editorGroupHeader-tabsBackground, rgba(128,128,128,0.1));
      font-size: 0.85em;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--vscode-descriptionForeground);
    }
  </style>
</head>
<body>
  <h1>Qwen Code Status</h1>
  <div class="card">
    <div class="card-header">Environment</div>
    <table>
      ${tableRows}
    </table>
  </div>
</body>
</html>`;
  }

  dispose(): void {
    AboutPanel.currentPanel = undefined;
    this.panel.dispose();
    for (const d of this.disposables) {
      d.dispose();
    }
    this.disposables.length = 0;
  }
}
