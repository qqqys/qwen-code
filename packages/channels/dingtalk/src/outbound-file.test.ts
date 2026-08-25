import { mkdtempSync, rmSync, truncateSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  MAX_FILES_PER_RESPONSE,
  OutboundFileProjector,
  projectFileText,
  readValidatedFile,
  uploadDingTalkFile,
} from './outbound-file.js';

describe('OutboundFileProjector', () => {
  it('keeps every split of the reserved opening path-free', () => {
    const input = 'before\n[FILE: /workspace/report.txt]\nafter';
    for (let split = 0; split <= '[FILE:'.length; split++) {
      const projector = new OutboundFileProjector();
      const first = input.indexOf('[FILE:');
      const chunks = [
        input.slice(0, first + split),
        input.slice(first + split),
      ];
      const safeChunks = chunks.map((chunk) => projector.append(chunk));
      const safe = safeChunks.join('') + projector.complete();
      expect(safeChunks[0]).not.toContain('/workspace/report.txt');
      expect(safeChunks[1]).not.toContain('/workspace/report.txt');
      expect(projector.result(safe)).toMatchObject({
        text: 'before\n\nafter',
        paths: ['/workspace/report.txt'],
      });
      expect(projector.matches(input)).toBe(true);
    }
  });

  it.each([
    {
      input: '[FILE: /tmp/a.txt]',
      text: '',
      paths: ['/tmp/a.txt'],
      invalidMarkers: 0,
    },
    {
      input: 'prefix [FILE: /tmp/a.txt] suffix\nnext',
      text: 'prefix \nnext',
      paths: [],
      invalidMarkers: 1,
    },
    {
      input: '[FILE:/tmp/a.txt]\nnext',
      text: '\nnext',
      paths: [],
      invalidMarkers: 1,
    },
    {
      input: '[FILE: /tmp/a.txt',
      text: '',
      paths: [],
      invalidMarkers: 1,
    },
  ])('projects $input without repairing it', ({ input, ...expected }) => {
    expect(projectFileText(input)).toMatchObject(expected);
  });

  it('does not rescan text joined by a redaction', () => {
    expect(projectFileText('[FI[FILE: /tmp/inner]\nLE: /tmp/outer]\n')).toEqual(
      {
        text: '[FI\nLE: /tmp/outer]\n',
        paths: [],
        invalidMarkers: 1,
        excessMarkers: 0,
        markerCount: 1,
      },
    );
  });

  it('bounds accepted paths and rejects oversized reserved lines', () => {
    const markers = Array.from(
      { length: MAX_FILES_PER_RESPONSE + 2 },
      (_, index) => `[FILE: /tmp/${index}.txt]`,
    ).join('\n');
    const projected = projectFileText(
      `${markers}\n[FILE: /${'x'.repeat(5000)}]`,
    );
    expect(projected.paths).toHaveLength(MAX_FILES_PER_RESPONSE);
    expect(projected.excessMarkers).toBe(2);
    expect(projected.invalidMarkers).toBe(1);
    expect(projected.text).not.toContain('/tmp/');
  });

  it('detects a final response that differs from streamed bytes', () => {
    const projector = new OutboundFileProjector();
    projector.append('[FILE: /tmp/a.txt]');
    projector.complete();
    expect(projector.matches('[FILE: /tmp/b.txt]')).toBe(false);
  });
});

describe('outbound file validation and upload', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reads a non-empty regular file under the workspace', () => {
    const workspace = process.cwd();
    const file = readValidatedFile(join(workspace, 'package.json'), workspace);
    expect(file).toMatchObject({
      fileName: 'package.json',
      fileType: 'json',
    });
    expect(file.data.length).toBeGreaterThan(0);
  });

  it.each([
    ['relative path', 'report.txt', 'File path must be absolute'],
    ['outside root', process.execPath, 'outside allowed directories'],
  ])('rejects a %s', (_name, path, message) => {
    expect(() => readValidatedFile(path, tmpdir())).toThrow(message);
  });

  it('rejects empty, directory, and oversized files', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dingtalk-file-bounds-'));
    const empty = join(dir, 'empty.txt');
    const large = join(dir, 'large.bin');
    writeFileSync(empty, '');
    writeFileSync(large, 'x');
    truncateSync(large, 20 * 1024 * 1024 + 1);
    try {
      expect(() => readValidatedFile(empty, dir)).toThrow('File is empty');
      expect(() => readValidatedFile(dir, dir)).toThrow('Not a regular file');
      expect(() => readValidatedFile(large, dir)).toThrow('File is too large');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('uploads as file media and returns the media id', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ errcode: 0, media_id: '@file-id' })),
      );
    await expect(
      uploadDingTalkFile(
        { data: Buffer.from('x'), fileName: 'a.txt', fileType: 'txt' },
        'secret',
      ),
    ).resolves.toBe('@file-id');
    expect(String(fetchSpy.mock.calls[0]![0])).toContain('type=file');
  });
});
