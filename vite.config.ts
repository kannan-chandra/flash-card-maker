import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { cpSync, createReadStream, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { marked } from 'marked';

const projectRoot = process.cwd();
const articlesDir = path.resolve(projectRoot, 'articles');
const articlesFilesDir = path.resolve(articlesDir, 'files');
const cNameFile = path.resolve(projectRoot, 'public/CNAME');
const basePath = process.env.VITE_BASE_PATH || '/';

type ArticlePage = {
  slug: string;
  title: string;
  markdown: string;
  html: string;
};

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

function slugToTitle(slug: string): string {
  return slug
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function extractTitle(markdown: string, slug: string): string {
  const firstHeading = markdown.match(/^#\s+(.+)$/m)?.[1]?.trim();
  return firstHeading || slugToTitle(slug);
}

function getArticlePages(withBase: (pathname: string) => string, articleFiles: Set<string>): ArticlePage[] {
  if (!existsSync(articlesDir)) {
    return [];
  }

  const sources = readdirSync(articlesDir)
    .filter((entry) => entry.endsWith('.md'))
    .sort()
    .map((filename) => {
      const slug = filename.replace(/\.md$/, '');
      const absolutePath = path.join(articlesDir, filename);
      const markdown = readFileSync(absolutePath, 'utf8');
      return { slug, markdown };
    });

  const articleSlugs = new Set(sources.map((article) => article.slug));

  const rewriteHref = (href: string): string => {
    if (!href || href.startsWith('#') || href.includes('://')) {
      return href;
    }
    if (href.startsWith('mailto:') || href.startsWith('tel:')) {
      return href;
    }

    const [pathname, suffix = ''] = href.split(/([?#].*)/, 2);
    if (!pathname) {
      return href;
    }

    if (pathname.startsWith('/')) {
      if (pathname.startsWith('/learn/')) {
        const slug = pathname.slice('/learn/'.length).replace(/\/$/, '').replace(/\.md$/, '');
        return articleSlugs.has(slug) ? `${withBase(`/learn/${slug}`)}${suffix}` : `${withBase(pathname)}${suffix}`;
      }
      return `${withBase(pathname)}${suffix}`;
    }

    const normalizedPath = pathname.replace(/^(\.\/|\.\.\/)+/, '');
    const articleCandidate = normalizedPath.replace(/\.md$/, '');
    if (articleSlugs.has(articleCandidate)) {
      return `${withBase(`/learn/${articleCandidate}`)}${suffix}`;
    }
    if (articleFiles.has(normalizedPath)) {
      return `${withBase(`/files/${encodeURIComponent(normalizedPath)}`)}${suffix}`;
    }
    return href;
  };

  return sources.map(({ slug, markdown }) => {
    const title = extractTitle(markdown, slug);
    const html = marked.parse(markdown, {
      gfm: true,
      breaks: true,
      walkTokens(token) {
        if (token.type === 'link') {
          token.href = rewriteHref(token.href);
        }
      }
    }) as string;

    return {
      slug,
      title,
      markdown,
      html
    };
  });
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

function buildLearnPageHtml(title: string, bodyContent: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${title}</title>
    <style>
      :root { color-scheme: light; }
      body { margin: 0; font-family: Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif; background: #f7f9fb; color: #16202a; }
      .shell { max-width: 860px; margin: 0 auto; padding: 32px 20px 64px; }
      .content { background: #fff; border: 1px solid #d9e2ea; border-radius: 16px; padding: 28px; box-shadow: 0 8px 30px rgba(0,0,0,0.04); }
      h1, h2, h3 { line-height: 1.2; color: #0f172a; }
      h1 { margin-top: 0; font-size: 2rem; }
      h2 { margin-top: 2rem; font-size: 1.5rem; }
      p, li { line-height: 1.7; }
      a { color: #0b5cd6; text-decoration: none; }
      a:hover { text-decoration: underline; }
      ul { padding-left: 20px; }
      code, pre { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
      pre { overflow: auto; background: #f3f7fb; padding: 12px; border-radius: 8px; }
      hr { border: 0; border-top: 1px solid #e2e8f0; margin: 24px 0; }
    </style>
  </head>
  <body>
    <main class="shell">
      <article class="content">
        ${bodyContent}
      </article>
    </main>
  </body>
</html>
`;
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
        const outDir = path.resolve(projectRoot, 'dist');

        if (!existsSync(articlesFilesDir)) {
          // Continue and still emit sitemap when file directory is absent.
        } else {
          const outputFilesDir = path.join(outDir, 'files');
          cpSync(articlesFilesDir, outputFilesDir, { recursive: true });
        }

        const baseUrl = getCanonicalSiteUrl();
        const normalizedBasePath = basePath.endsWith('/') ? basePath.slice(0, -1) : basePath;
        const withBase = (pathname: string) => `${normalizedBasePath}${pathname}`.replace(/\/{2,}/g, '/');
        const articleFiles = new Set(getArticleFiles());
        const articlePages = getArticlePages(withBase, articleFiles);

        const learnDir = path.join(outDir, 'learn');
        mkdirSync(learnDir, { recursive: true });

        const listMarkup = `
          <h1>Learn</h1>
          <p>Browse all articles.</p>
          <ul>
            ${articlePages
              .sort((a, b) => a.title.localeCompare(b.title))
              .map((article) => `<li><a href="${withBase(`/learn/${article.slug}`)}">${article.title}</a></li>`)
              .join('\n')}
          </ul>
        `;
        writeFileSync(path.join(learnDir, 'index.html'), buildLearnPageHtml('Learn', listMarkup), 'utf8');

        articlePages.forEach((article) => {
          const articleDir = path.join(learnDir, article.slug);
          mkdirSync(articleDir, { recursive: true });
          writeFileSync(path.join(articleDir, 'index.html'), buildLearnPageHtml(`${article.title} | Learn`, article.html), 'utf8');
        });

        const articleUrls = articlePages.map((article) => withBase(`/learn/${article.slug}`));
        const fileUrls = Array.from(articleFiles).map((filename) => withBase(`/files/${encodeURIComponent(filename)}`));
        const uniqueUrls = Array.from(new Set([withBase('/'), withBase('/learn'), ...articleUrls, ...fileUrls]));
        const sitemapXml = buildSitemapXml(baseUrl, uniqueUrls);
        const sitemapOutputPath = path.resolve(projectRoot, 'dist/sitemap.xml');
        writeFileSync(sitemapOutputPath, sitemapXml, 'utf8');
      }
    }
  ],
  base: basePath
});
