import { useMemo } from 'react';
import { getGuideBySlug, getGuides } from './content';
import './guides.css';

function normalizePathname(pathname: string): string {
  if (!pathname.endsWith('/')) {
    return pathname;
  }
  return pathname.slice(0, -1) || '/';
}

export function GuidesApp() {
  const pathname = normalizePathname(window.location.pathname);
  const guides = getGuides();
  const activeSlug = pathname.startsWith('/guides/') ? pathname.slice('/guides/'.length) : '';
  const activeGuide = activeSlug ? getGuideBySlug(activeSlug) : undefined;
  const isGuideList = pathname === '/guides';

  const pageTitle = useMemo(() => {
    if (activeGuide) {
      return `${activeGuide.title} | Guides`;
    }
    return 'Guides';
  }, [activeGuide]);

  document.title = pageTitle;

  if (isGuideList) {
    return (
      <div className="guides-page">
        <header className="guides-header">
          <h1>Guides</h1>
          <p>Articles are loaded from markdown files in the repo `guides/` directory.</p>
        </header>
        <main className="guides-main">
          {guides.length ? (
            <ul className="guides-list">
              {guides.map((guide) => (
                <li key={guide.slug}>
                  <a href={`/guides/${guide.slug}`}>{guide.title}</a>
                </li>
              ))}
            </ul>
          ) : (
            <p>No guides found.</p>
          )}
        </main>
      </div>
    );
  }

  if (activeGuide) {
    return (
      <div className="guides-page">
        <header className="guides-header">
          <a href="/guides" className="guides-back-link">
            Back to Guides
          </a>
          <h1>{activeGuide.title}</h1>
        </header>
        <main className="guides-main">
          <article className="guide-article" dangerouslySetInnerHTML={{ __html: activeGuide.html }} />
        </main>
      </div>
    );
  }

  return (
    <div className="guides-page">
      <header className="guides-header">
        <h1>Guide Not Found</h1>
      </header>
      <main className="guides-main">
        <p>This guide does not exist.</p>
        <a href="/guides">View all guides</a>
      </main>
    </div>
  );
}
