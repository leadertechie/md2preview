import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@leadertechie/md2compose', () => ({
  Composer: class {
    constructor(public readonly options: unknown) {}
    async compose(path: string): Promise<string> {
      return `composed(${path})`;
    }
  },
}));

vi.mock('@leadertechie/md2html', () => ({
  MarkdownPipeline: class {
    renderMarkdown(): string {
      return [
        '<!DOCTYPE html><html><head>',
        '<link rel="stylesheet" href="/core.css">',
        '</head><body>',
        '<div data-interaction="mfe:header" data-mfe-src="/header.js"></div>',
        '<script type="application/json" data-mfe-context>{"appName":"Toldby"}</script>',
        '<script type="module">init()</script>',
        '<script type="importmap">{}</script>',
        '</body></html>',
      ].join('');
    }
  },
}));

vi.mock('@leadertechie/md2interact', () => ({
  mountMFEs: vi.fn(),
}));

import { mountMFEs } from '@leadertechie/md2interact';
import { Md2Preview } from '../index';

const mockedMountMFEs = vi.mocked(mountMFEs);

describe('Md2Preview', () => {
  beforeEach(() => {
    mockedMountMFEs.mockReset();
    mockedMountMFEs.mockResolvedValue(() => {});
    document.body.innerHTML = '';
  });

  it('renders the composed body, drops bootstrap scripts, and mounts scoped MFEs', async () => {
    const el = new Md2Preview();
    el.value = '# hi';
    el.viewPath = '__sys_/login.md';
    el.bases = { ASSET_BASE: 'http://localhost:8788' };
    el.context = { theme: 'dark' };
    document.body.appendChild(el);

    await el.render();

    const container = el.shadowRoot!.querySelector('div') as HTMLElement;

    expect(container.querySelector('script[type="module"]')).toBeNull();
    expect(container.querySelector('script[type="importmap"]')).toBeNull();
    expect(container.querySelector('[data-interaction="mfe:header"]')).not.toBeNull();

    const link = container.querySelector('link[rel="stylesheet"]');
    expect(link?.getAttribute('href')).toBe('http://localhost:8788/core.css');

    expect(mockedMountMFEs).toHaveBeenCalledTimes(1);
    expect(mockedMountMFEs).toHaveBeenCalledWith({
      root: container,
      context: { appName: 'Toldby', theme: 'dark' },
    });
  });

  it('cleans up the mounted MFEs on disconnect', async () => {
    const cleanup = vi.fn();
    mockedMountMFEs.mockResolvedValue(cleanup);

    const el = new Md2Preview();
    el.value = '# hi';
    el.viewPath = '__sys_/login.md';
    document.body.appendChild(el);
    await el.render();

    el.remove();
    expect(cleanup).toHaveBeenCalledTimes(1);
  });
});
