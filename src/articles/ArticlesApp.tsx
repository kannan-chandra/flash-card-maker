import { useMemo } from 'react';
import { getArticleBySlug, getArticles } from './content';
import './articles.css';

function normalizePathname(pathname: string): string {
  if (!pathname.endsWith('/')) {
    return pathname;
  }
  return pathname.slice(0, -1) || '/';
}

export function ArticlesApp() {
  const pathname = normalizePathname(window.location.pathname);
  const articles = getArticles();
  const activeSlug = pathname.startsWith('/learn/') ? pathname.slice('/learn/'.length) : '';
  const activeArticle = activeSlug ? getArticleBySlug(activeSlug) : undefined;
  const isLearnList = pathname === '/learn';

  const pageTitle = useMemo(() => {
    if (activeArticle) {
      return `${activeArticle.title} | Learn`;
    }
    return 'Learn';
  }, [activeArticle]);

  document.title = pageTitle;

  if (isLearnList) {
    return (
      <div className="articles-page">
        <div className="articles-shell">
          <header className="articles-header">
            <h1>Learn</h1>
            <p>Articles are loaded from markdown files in the repo `articles/` directory.</p>
          </header>
          <main className="articles-main">
            {articles.length ? (
              <ul className="articles-list">
                {articles.map((article) => (
                  <li key={article.slug}>
                    <a href={`/learn/${article.slug}`}>{article.title}</a>
                  </li>
                ))}
              </ul>
            ) : (
              <p>No articles found.</p>
            )}
          </main>
        </div>
      </div>
    );
  }

  if (activeArticle) {
    return (
      <div className="articles-page">
        <div className="articles-shell">
          <header className="articles-header">
            <a href="/learn" className="articles-back-link">
              Back to Learn
            </a>
          </header>
          <main className="articles-main">
            <article className="article-content" dangerouslySetInnerHTML={{ __html: activeArticle.html }} />
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="articles-page">
      <div className="articles-shell">
        <header className="articles-header">
          <h1>Article Not Found</h1>
        </header>
        <main className="articles-main">
          <p>This article does not exist.</p>
          <a href="/learn">View all articles</a>
        </main>
      </div>
    </div>
  );
}
