import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  build: {
    lib: {
      entry: resolve(import.meta.dirname, 'src/index.ts'),
      name: 'md2preview',
      formats: ['es'],
      fileName: () => 'md2preview.js',
    },
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
    target: 'es2020',
    rollupOptions: {
      external: [
        '@leadertechie/md2compose',
        '@leadertechie/md2html',
        '@leadertechie/md2interact',
      ],
    },
  },
});
