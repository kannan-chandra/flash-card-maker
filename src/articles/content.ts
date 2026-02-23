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

marked.setOptions({
  gfm: true,
  breaks: true
});

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
        html: marked.parse(markdown) as string
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
