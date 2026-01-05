const fs = require('fs');
const path = require('path');

const distDir = path.resolve(__dirname, '..', 'dist');
const baseHtmlPath = path.join(distDir, 'index.html');

if (!fs.existsSync(baseHtmlPath)) {
  console.error('Missing dist/index.html. Run the build before prerendering.');
  process.exit(1);
}

const baseHtml = fs.readFileSync(baseHtmlPath, 'utf8');

const routes = [
  {
    path: '/',
    title: 'Real Estate Quest - BC Licensing Exam Preparation',
    description: 'BC Real Estate Quest: Your guide for BC real estate exam prep. Access 1000+ practice questions and flashcards to help you pass the British Columbia real estate licensing course exam on your first try.',
    noindex: false,
  },
  {
    path: '/questions',
    title: 'Questions - Real Estate Quest',
    description: 'Test your knowledge with 1000+ BC real estate licensing exam practice questions.',
    noindex: false,
  },
  {
    path: '/flashcards',
    title: 'Flashcards - Real Estate Quest',
    description: 'Study with interactive flashcards for the BC real estate licensing exam.',
    noindex: false,
  },
  {
    path: '/privacy-policy',
    title: 'Privacy Policy - Real Estate Quest',
    description: 'Privacy policy for Real Estate Quest BC exam prep platform.',
    noindex: false,
  },
  {
    path: '/terms-of-service',
    title: 'Terms of Service - Real Estate Quest',
    description: 'Terms of service for Real Estate Quest BC exam prep platform.',
    noindex: false,
  },
  {
    path: '/pro',
    title: 'Membership - Real Estate Quest',
    description: 'Upgrade to Pro for unlimited access to BC real estate exam questions and flashcards.',
    noindex: true,
  },
  {
    path: '/admin',
    title: 'Admin Dashboard - Real Estate Quest',
    description: 'Administrative dashboard for system management.',
    noindex: true,
  },
];

const canonicalBase = 'https://bcrealestatequest.ca';

const replaceOrInsertMeta = (html, name, content) => {
  const metaTag = `<meta name="${name}" content="${content}" />`;
  const metaRegex = new RegExp(`<meta\\s+name="${name}"[^>]*>`, 'i');
  if (metaRegex.test(html)) {
    return html.replace(metaRegex, metaTag);
  }
  return html.replace('</head>', `  ${metaTag}\n</head>`);
};

const replaceOrInsertCanonical = (html, url) => {
  const canonicalTag = `<link rel="canonical" href="${url}" />`;
  const canonicalRegex = /<link\s+rel="canonical"[^>]*>/i;
  if (canonicalRegex.test(html)) {
    return html.replace(canonicalRegex, canonicalTag);
  }
  return html.replace('</head>', `  ${canonicalTag}\n</head>`);
};

const replaceTitle = (html, title) => (
  html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${title}</title>`)
);

const buildHtmlForRoute = (route) => {
  const canonicalPath = route.path === '/' ? '/' : route.path.replace(/\/+$/, '');
  const canonicalUrl = `${canonicalBase}${canonicalPath}`;
  const robotsContent = route.noindex ? 'noindex, nofollow' : 'index, follow';

  let html = baseHtml;
  html = replaceTitle(html, route.title);
  html = replaceOrInsertMeta(html, 'description', route.description);
  html = replaceOrInsertMeta(html, 'robots', robotsContent);
  html = replaceOrInsertCanonical(html, canonicalUrl);
  return html;
};

routes.forEach((route) => {
  const outputHtml = buildHtmlForRoute(route);
  if (route.path === '/') {
    fs.writeFileSync(baseHtmlPath, outputHtml);
    return;
  }

  const outputDir = path.join(distDir, route.path.replace(/^\//, ''));
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, 'index.html'), outputHtml);
});

console.log(`Prerendered ${routes.length} routes into ${distDir}`);
