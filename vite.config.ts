import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { cpSync, createReadStream, existsSync } from 'node:fs';
import path from 'node:path';

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'articles-files',
      configureServer(server) {
        const articlesFilesDir = path.resolve(process.cwd(), 'articles/files');
        server.middlewares.use((req, res, next) => {
          const requestPath = req.url ? decodeURIComponent(req.url.split('?')[0]) : '';
          const filePrefix = '/files/';
          if (!requestPath.startsWith(filePrefix)) {
            next();
            return;
          }

          const filename = requestPath.slice(filePrefix.length);
          if (!filename || filename.includes('/') || filename.includes('..')) {
            next();
            return;
          }

          const absoluteFilePath = path.join(articlesFilesDir, filename);
          if (!existsSync(absoluteFilePath)) {
            next();
            return;
          }

          createReadStream(absoluteFilePath).pipe(res);
        });
      },
      writeBundle(_, bundle) {
        const articlesFilesDir = path.resolve(process.cwd(), 'articles/files');
        if (!existsSync(articlesFilesDir)) {
          return;
        }

        const outDir = path.resolve(process.cwd(), 'dist');
        const outputFilesDir = path.join(outDir, 'files');
        cpSync(articlesFilesDir, outputFilesDir, { recursive: true });
      }
    }
  ],
  base: process.env.VITE_BASE_PATH || '/'
});
