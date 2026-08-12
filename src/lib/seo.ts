// Site-weite SEO-Konstanten und JSON-LD-Helpers.
//
// Wird konsumiert von src/components/Seo.astro (Meta-Tags) und von einzelnen
// Views, die zusätzliche schema.org-Knoten (Book, Person, Event, ...) liefern.

import { socials } from './social';

export const SITE_URL = 'https://silospeceshablaran.com';
export const SITE_NAME = 'Si los peces hablaran';
export const SITE_LOCALE = 'es_ES';
export const SITE_LANG = 'es';

export const DEFAULT_OG_IMAGE = `${SITE_URL}/assets/og-default.jpg`;
// Maße von public/assets/og-default.jpg. Bei Austausch der Datei mit anpassen.
export const DEFAULT_OG_IMAGE_WIDTH = 1200;
export const DEFAULT_OG_IMAGE_HEIGHT = 630;
export const DEFAULT_OG_IMAGE_ALT =
  'Si los peces hablaran… — programa de concienciación marina';

// Kurze Erklär-Boilerplate, die LLMs gerne als citation übernehmen.
export const SITE_TAGLINE =
  'Programa de concienciación medioambiental que protege los ecosistemas marinos a través de las artes, las ciencias y la educación.';

export const AUTHOR_NAME = 'Sandra Santa Cruz';
export const PUBLISHER_NAME = 'Entintadas Editorial';
export const BOOK_TITLE = 'Si los peces hablaran…';
export const BOOK_LANGUAGE = 'es';
export const BOOK_GENRE = 'Cuento infantil';
export const BOOK_BUY_URL =
  'https://www.entintadas.com/tienda/si-los-peces-hablaran/';

export function absoluteUrl(path: string): string {
  if (!path) return SITE_URL;
  if (/^https?:\/\//i.test(path)) return path;
  const slashed = path.startsWith('/') ? path : `/${path}`;
  return `${SITE_URL}${slashed}`;
}

// schema.org-Knoten als typsicheres unknown-Record, damit Astro sie ohne
// Sprünge in JSON serialisieren kann.
export type JsonLd = Record<string, unknown>;

export function organizationSchema(): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': `${SITE_URL}/#organization`,
    name: SITE_NAME,
    alternateName: 'SLPH',
    url: SITE_URL,
    logo: {
      '@type': 'ImageObject',
      url: absoluteUrl('/assets/logo.png'),
    },
    description: SITE_TAGLINE,
    foundingLocation: {
      '@type': 'Place',
      name: 'Gran Canaria, España',
    },
    founder: {
      '@id': `${SITE_URL}/autor#person`,
    },
    sameAs: socials.map((s) => s.href),
  };
}

export function websiteSchema(): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${SITE_URL}/#website`,
    url: SITE_URL,
    name: SITE_NAME,
    description: SITE_TAGLINE,
    inLanguage: SITE_LANG,
    publisher: { '@id': `${SITE_URL}/#organization` },
    // Sitelinks-Search-Box — Google nutzt diese Definition, um in den
    // Suchergebnissen eine eigene Suchbox unter dem Treffer anzubieten.
    // Damit das tatsächlich erscheint, muss SITE_URL/buscar?q=… eine echte
    // Suchseite liefern; siehe src/pages/buscar.astro.
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${SITE_URL}/buscar?q={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  };
}

// Top-Level-Navigation als schema.org-Hint für Google. Beeinflusst Sitelinks
// nicht direkt (das macht der Algorithmus), kann aber bei der Item-Auswahl
// helfen, weil die bevorzugten Labels eindeutig markiert sind.
export function siteNavigationSchema(): JsonLd {
  const items = [
    { name: 'Inicio', url: '/' },
    { name: 'El cuento', url: '/sobre-el-cuento' },
    { name: 'Programa', url: '/programa' },
    { name: 'Noticias', url: '/noticias' },
    { name: 'Comprar libro', url: '/comprar' },
    { name: 'Colabora', url: '/colabora' },
    { name: 'Contacto', url: '/contacto' },
  ];
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    '@id': `${SITE_URL}/#nav`,
    name: 'Navegación principal',
    itemListElement: items.map((it, idx) => ({
      '@type': 'SiteNavigationElement',
      position: idx + 1,
      name: it.name,
      url: absoluteUrl(it.url),
    })),
  };
}

export function personSandraSchema(): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'Person',
    '@id': `${SITE_URL}/autor#person`,
    name: AUTHOR_NAME,
    url: `${SITE_URL}/autor`,
    jobTitle: 'Bailarina, coreógrafa y autora',
    nationality: { '@type': 'Country', name: 'España' },
    birthPlace: { '@type': 'Place', name: 'Gran Canaria, España' },
    worksFor: {
      '@type': 'Organization',
      name: 'Centro de Danza Sandra Santa Cruz',
    },
    description:
      'Bailarina, profesora y coreógrafa canaria, licenciada en danza. Lleva más de tres décadas al frente del Centro de Danza Sandra Santa Cruz en Gran Canaria y es la autora del cuento Si los peces hablaran…',
    sameAs: socials.map((s) => s.href),
  };
}

export function bookSchema(): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'Book',
    '@id': `${SITE_URL}/#book`,
    name: BOOK_TITLE,
    inLanguage: BOOK_LANGUAGE,
    bookFormat: 'https://schema.org/Hardcover',
    genre: BOOK_GENRE,
    audience: {
      '@type': 'PeopleAudience',
      suggestedMinAge: 6,
      audienceType: 'Niños y familias',
    },
    author: { '@id': `${SITE_URL}/autor#person` },
    publisher: {
      '@type': 'Organization',
      name: PUBLISHER_NAME,
      url: 'https://www.entintadas.com',
    },
    about: [
      'Concienciación medioambiental',
      'Ecosistemas marinos',
      'Protección del océano',
    ],
    image: absoluteUrl('/assets/sandra.webp'),
    offers: {
      '@type': 'Offer',
      url: BOOK_BUY_URL,
      availability: 'https://schema.org/InStock',
      priceCurrency: 'EUR',
      seller: {
        '@type': 'Organization',
        name: PUBLISHER_NAME,
      },
    },
  };
}

export interface BreadcrumbItem {
  name: string;
  url: string;
}

export function breadcrumbSchema(items: BreadcrumbItem[]): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, idx) => ({
      '@type': 'ListItem',
      position: idx + 1,
      name: item.name,
      item: absoluteUrl(item.url),
    })),
  };
}

export interface FaqEntry {
  question: string;
  /**
   * Klartext-Antwort fürs FAQPage-JSON-LD (kein HTML). `\n` trennt Absätze und
   * wird fürs Schema zu `<br>` (das erlaubt Google im Answer-Text).
   */
  answer: string;
  /**
   * Optionale HTML-Variante für die sichtbare Section (z.B. mit Inline-Links).
   * Nur fürs Rendering, nicht fürs JSON-LD. Fällt auf `answer` zurück.
   */
  answerHtml?: string;
}

export function faqSchema(entries: FaqEntry[]): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: entries.map((e) => ({
      '@type': 'Question',
      name: e.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: e.answer.replaceAll('\n', '<br>'),
      },
    })),
  };
}

export interface ArticleSchemaInput {
  title: string;
  description?: string;
  url: string;
  image?: string;
  datePublished?: string;
  dateModified?: string;
}

export function articleSchema(input: ArticleSchemaInput): JsonLd {
  const schema: JsonLd = {
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    headline: input.title,
    url: absoluteUrl(input.url),
    inLanguage: SITE_LANG,
    author: { '@id': `${SITE_URL}/autor#person` },
    publisher: { '@id': `${SITE_URL}/#organization` },
    mainEntityOfPage: absoluteUrl(input.url),
  };
  if (input.description) schema.description = input.description;
  if (input.image) schema.image = input.image;
  if (input.datePublished) schema.datePublished = input.datePublished;
  if (input.dateModified) schema.dateModified = input.dateModified;
  return schema;
}

export interface EventSchemaInput {
  title: string;
  description?: string;
  url: string;
  image?: string;
  startDate?: string;
  endDate?: string;
  location?: string;
  locationUrl?: string;
}

export function eventSchema(input: EventSchemaInput): JsonLd {
  const now = new Date();
  const start = input.startDate ? new Date(input.startDate) : null;
  const end = input.endDate ? new Date(input.endDate) : null;
  const isPast = (end ?? start) && (end ?? start)!.getTime() < now.getTime();

  const schema: JsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: input.title,
    url: absoluteUrl(input.url),
    inLanguage: SITE_LANG,
    organizer: { '@id': `${SITE_URL}/#organization` },
    eventStatus: 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
  };
  if (input.description) schema.description = input.description;
  if (input.image) schema.image = input.image;
  if (input.startDate) schema.startDate = input.startDate;
  if (input.endDate) schema.endDate = input.endDate;
  if (input.location) {
    schema.location = {
      '@type': 'Place',
      name: input.location,
      ...(input.locationUrl ? { url: input.locationUrl } : {}),
    };
  }
  if (isPast) {
    schema.eventStatus = 'https://schema.org/EventScheduled';
  }
  return schema;
}
