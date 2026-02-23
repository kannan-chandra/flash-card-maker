import { marked } from 'marked';

export type GuideArticle = {
  slug: string;
  title: string;
  markdown: string;
  html: string;
};

const guideModules = import.meta.glob('../../guides/*.md', {
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

function buildGuides(): GuideArticle[] {
  const guides = Object.entries(guideModules)
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
    .filter((guide): guide is GuideArticle => guide !== null)
    .sort((a, b) => a.title.localeCompare(b.title));

  return guides;
}

const guideArticles = buildGuides();
const guideBySlug = new Map(guideArticles.map((guide) => [guide.slug, guide]));

export function getGuides(): GuideArticle[] {
  return guideArticles;
}

export function getGuideBySlug(slug: string): GuideArticle | undefined {
  return guideBySlug.get(slug);
}
