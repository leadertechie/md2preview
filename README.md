# @leadertechie/md2preview

A renderer MFE. It projects a Markdown content bit through its layout shell and
mounts the resulting page's micro-frontends inside an isolated shadow-DOM
container — without touching the host page's fetch proxy, context bus, or CSS.

```ts
import '@leadertechie/md2preview';

const preview = document.createElement('md2-preview');
preview.value = '# Hello';                 // unsaved view markdown
preview.viewPath = '__sys_/login.md';      // R2 key being edited
preview.bases = { ASSET_BASE, HEADER_BASE, FOOTER_BASE, LOGIN_BASE, REGISTER_BASE };
preview.loadSource = (path) => fetch(`/api/admin/content?file=${encodeURIComponent(path)}`).then(r => r.ok ? r.text() : null);
preview.context = { theme: 'dark' };        // optional override
preview.addEventListener('click', () => preview.render());
document.body.append(preview);
```

## API

- `value: string` — the Markdown source of the view.
- `viewPath: string` — the R2 key of the view (`view-path` attribute).
- `bases: Record<string, string>` — `base_urls` map for `{{ASSET_BASE}}` etc.
- `context: Record<string, unknown>` — merged over the page's `data-mfe-context`.
- `loadSource?: (path) => Promise<string | null>` — resolves the layout/parent.
- `render(): Promise<void>` — compose + render + mount the contained MFEs.

The component relies on `@leadertechie/md2interact`'s scoped `mountMFEs`.
