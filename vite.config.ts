import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { cpSync, createReadStream, existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const projectRoot = process.cwd();
const articlesDir = path.resolve(projectRoot, 'articles');
const articlesFilesDir = path.resolve(articlesDir, 'files');
const cNameFile = path.resolve(projectRoot, 'public/CNAME');
const basePath = process.env.VITE_BASE_PATH || '/';

function getCanonicalSiteUrl(): string {
  const fromEnv = process.env.VITE_SITE_URL?.trim();
  if (fromEnv) {
    return fromEnv.replace(/\/+$/, '');
  }

  if (existsSync(cNameFile)) {
    const domain = readFileSync(cNameFile, 'utf8').trim().replace(/^https?:\/\//, '');
    if (domain) {
      return `https://${domain}`;
    }
  }

  return 'https://example.com';
}

function getArticles(): string[] {
  if (!existsSync(articlesDir)) {
    return [];
  }

  return readdirSync(articlesDir)
    .filter((entry) => entry.endsWith('.md'))
    .map((entry) => entry.replace(/\.md$/, ''))
    .filter(Boolean)
    .sort();
}

function getArticleFiles(): string[] {
  if (!existsSync(articlesFilesDir)) {
    return [];
  }

  return readdirSync(articlesFilesDir).filter(Boolean).sort();
}

function buildSitemapXml(baseUrl: string, urls: string[]): string {
  const rows = urls
    .map((url) => `  <url><loc>${baseUrl}${url}</loc></url>`)
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${rows}\n</urlset>\n`;
}

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'articles-files',
      configureServer(server) {
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
      writeBundle() {
        if (!existsSync(articlesFilesDir)) {
          // Continue and still emit sitemap when file directory is absent.
        } else {
          const outDir = path.resolve(projectRoot, 'dist');
          const outputFilesDir = path.join(outDir, 'files');
          cpSync(articlesFilesDir, outputFilesDir, { recursive: true });
        }

        const baseUrl = getCanonicalSiteUrl();
        const normalizedBasePath = basePath.endsWith('/') ? basePath.slice(0, -1) : basePath;
        const withBase = (pathname: string) => `${normalizedBasePath}${pathname}`.replace(/\/{2,}/g, '/');

        const articleUrls = getArticles().map((slug) => withBase(`/learn/${slug}`));
        const fileUrls = getArticleFiles().map((filename) => withBase(`/files/${encodeURIComponent(filename)}`));
        const uniqueUrls = Array.from(new Set([withBase('/'), withBase('/learn'), ...articleUrls, ...fileUrls]));
        const sitemapXml = buildSitemapXml(baseUrl, uniqueUrls);
        const sitemapOutputPath = path.resolve(projectRoot, 'dist/sitemap.xml');
        writeFileSync(sitemapOutputPath, sitemapXml, 'utf8');
      }
    }
  ],
  base: basePath
});
