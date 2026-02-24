import { marked } from 'marked';

export type Article = {
  slug: string;
  title: string;
  markdown: string;
  html: string;
};

const articleModules = import.meta.glob('../../articles/*.md', {
  eager: true,
  query: '?raw',
  import: 'default'
}) as Record<string, string>;

const ARTICLE_FILES_ROUTE_PREFIX = `${import.meta.env.BASE_URL}files/`;

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

function rewriteArticleFileHref(href: string): string {
  if (!href || href.startsWith('#') || href.includes('://')) {
    return href;
  }
  if (href.startsWith('/') || href.startsWith('./') || href.startsWith('../')) {
    return href;
  }
  if (href.startsWith('mailto:') || href.startsWith('tel:')) {
    return href;
  }
  if (href.includes('/')) {
    return href;
  }

  const [filename, suffix = ''] = href.split(/([?#].*)/, 2);
  const encodedFilename = encodeURIComponent(filename);
  return `${ARTICLE_FILES_ROUTE_PREFIX}${encodedFilename}${suffix}`;
}

function renderArticleMarkdown(markdown: string): string {
  return marked.parse(markdown, {
    gfm: true,
    breaks: true,
    walkTokens(token) {
      if (token.type === 'link') {
        token.href = rewriteArticleFileHref(token.href);
      }
    }
  }) as string;
}

function buildArticles(): Article[] {
  const articles = Object.entries(articleModules)
    .map(([path, markdown]) => {
      const slug = path.split('/').pop()?.replace(/\.md$/, '') ?? '';
      if (!slug) {
        return null;
      }
      const title = extractTitle(markdown, slug);
      return {
        slug,
        title,
        markdown,
        html: renderArticleMarkdown(markdown)
      };
    })
    .filter((article): article is Article => article !== null)
    .sort((a, b) => a.title.localeCompare(b.title));

  return articles;
}

const articles = buildArticles();
const articlesBySlug = new Map(articles.map((article) => [article.slug, article]));

export function getArticles(): Article[] {
  return articles;
}

export function getArticleBySlug(slug: string): Article | undefined {
  return articlesBySlug.get(slug);
}
