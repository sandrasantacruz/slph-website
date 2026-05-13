// Shared helpers for WordPress → PocketBase import scripts.
//
// Covers HTML → BlockNote conversion, image download + sharp re-encoding,
// and a few small text/URL utilities.

import * as cheerio from 'cheerio';
import sharp from 'sharp';

// ──────────────────────────────────────────────────────────────────────────────
// HTML → BlockNote
// ──────────────────────────────────────────────────────────────────────────────

let _blockIdCounter = 0;
function newBlockId() {
  _blockIdCounter += 1;
  return `imp-${Date.now().toString(36)}-${_blockIdCounter}`;
}

function makeBlock(type, props = {}, content = undefined, children = []) {
  const b = { id: newBlockId(), type, props, children };
  if (content !== undefined) b.content = content;
  return b;
}

function parseInline($, node, stylesIn = {}) {
  const out = [];
  $(node)
    .contents()
    .each((_, el) => {
      if (el.type === 'text') {
        const text = el.data.replace(/\s+/g, ' ');
        if (text) out.push({ type: 'text', text, styles: { ...stylesIn } });
        return;
      }
      if (el.type !== 'tag') return;
      const tag = el.tagName?.toLowerCase();

      const styleMap = {
        strong: 'bold',
        b: 'bold',
        em: 'italic',
        i: 'italic',
        u: 'underline',
        s: 'strike',
        del: 'strike',
        strike: 'strike',
        code: 'code',
      };
      if (styleMap[tag]) {
        out.push(...parseInline($, el, { ...stylesIn, [styleMap[tag]]: true }));
        return;
      }

      if (tag === 'a') {
        const href = $(el).attr('href') ?? '';
        const inner = parseInline($, el, stylesIn).filter((x) => x.type === 'text');
        if (inner.length === 0) return;
        out.push({ type: 'link', href, content: inner });
        return;
      }

      if (tag === 'br') {
        out.push({ type: 'text', text: ' ', styles: { ...stylesIn } });
        return;
      }

      // Unknown inline tag → descend.
      out.push(...parseInline($, el, stylesIn));
    });

  // Merge consecutive identical-style text runs.
  const merged = [];
  for (const it of out) {
    const last = merged[merged.length - 1];
    if (
      last &&
      it.type === 'text' &&
      last.type === 'text' &&
      JSON.stringify(last.styles) === JSON.stringify(it.styles)
    ) {
      last.text += it.text;
    } else {
      merged.push(it);
    }
  }
  return merged;
}

function isYouTubeUrl(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    return (
      host === 'youtube.com' ||
      host === 'youtu.be' ||
      host === 'youtube-nocookie.com' ||
      host === 'm.youtube.com'
    );
  } catch {
    return false;
  }
}

function isEmptyParagraph(b) {
  if (b.type !== 'paragraph') return false;
  if (!Array.isArray(b.content)) return true;
  return !b.content.some((c) => (c.type === 'text' ? c.text.trim() : true));
}

function bestImgSrc($, imgEl) {
  // WP-Pages with the Divi-Builder or lazy-loading plugins put a base64
  // placeholder in `src` and the real URL in `data-src` / `data-lazy-src`.
  const $el = $(imgEl);
  const src = $el.attr('src') ?? '';
  const dataSrc =
    $el.attr('data-src') ||
    $el.attr('data-lazy-src') ||
    $el.attr('data-original') ||
    '';
  if (src && !src.startsWith('data:')) return src;
  if (dataSrc) return dataSrc;
  return src;
}

function makeImageBlock($, imgEl, caption = '') {
  const url = bestImgSrc($, imgEl);
  const alt = $(imgEl).attr('alt') ?? '';
  return makeBlock(
    'image',
    { url, caption: caption || alt || '', previewWidth: 600 },
    [],
  );
}

export function htmlToBlocks(html) {
  const $ = cheerio.load(html, null, false);

  // Drop <noscript> blocks — usually duplicate images for lazy-loaded ones.
  $('noscript').remove();

  const blocks = [];
  const push = (b) => b && blocks.push(b);

  const handle = (el) => {
    if (el.type === 'text') {
      const t = el.data.trim();
      if (t) push(makeBlock('paragraph', {}, [{ type: 'text', text: t, styles: {} }]));
      return;
    }
    if (el.type !== 'tag') return;

    const tag = el.tagName?.toLowerCase();
    const $el = $(el);

    switch (tag) {
      case 'p': {
        $el.find('img').each((_, img) => {
          push(makeImageBlock($, img));
          $(img).remove();
        });
        const inline = parseInline($, el);
        const hasText = inline.some((x) => (x.type === 'text' ? x.text.trim() : true));
        if (hasText) push(makeBlock('paragraph', {}, inline));
        return;
      }
      case 'h1':
      case 'h2':
      case 'h3':
      case 'h4':
      case 'h5':
      case 'h6': {
        const lvl = Math.min(3, Math.max(1, Number(tag.slice(1))));
        push(makeBlock('heading', { level: lvl }, parseInline($, el)));
        return;
      }
      case 'ul':
      case 'ol': {
        const itemType = tag === 'ol' ? 'numberedListItem' : 'bulletListItem';
        $el.children('li').each((_, li) => {
          push(makeBlock(itemType, {}, parseInline($, li)));
        });
        return;
      }
      case 'img':
        push(makeImageBlock($, el));
        return;
      case 'figure': {
        const img = $el.find('img').first()[0];
        if (img) {
          const caption = $el.find('figcaption').first().text().trim();
          push(makeImageBlock($, img, caption));
        } else {
          // Pure embed (iframe) figure — descend.
          $el.contents().each((_, child) => handle(child));
        }
        return;
      }
      case 'blockquote': {
        $el.children().each((_, child) => {
          if (child.tagName?.toLowerCase() === 'p') {
            const inline = parseInline($, child).map((it) =>
              it.type === 'text'
                ? { ...it, styles: { ...it.styles, italic: true } }
                : it,
            );
            push(makeBlock('paragraph', {}, inline));
          }
        });
        return;
      }
      case 'pre': {
        const codeEl = $el.find('code').first();
        const text = (codeEl.length ? codeEl.text() : $el.text()) ?? '';
        push(makeBlock('codeBlock', {}, [{ type: 'text', text, styles: {} }]));
        return;
      }
      case 'iframe': {
        const src = $el.attr('src') || $el.attr('data-src') || '';
        if (!src) return;
        if (isYouTubeUrl(src)) {
          push(makeBlock('video', { url: src }, []));
          return;
        }
        push(
          makeBlock('paragraph', {}, [
            { type: 'link', href: src, content: [{ type: 'text', text: src, styles: {} }] },
          ]),
        );
        return;
      }
      case 'hr':
      case 'br':
        return;
      case 'div':
      case 'section':
      case 'article':
      case 'header':
      case 'footer':
      case 'main':
      case 'aside': {
        $el.contents().each((_, child) => handle(child));
        return;
      }
      default: {
        const inline = parseInline($, el);
        if (inline.length) push(makeBlock('paragraph', {}, inline));
      }
    }
  };

  $.root()
    .contents()
    .each((_, el) => handle(el));

  while (blocks.length && isEmptyParagraph(blocks[0])) blocks.shift();
  while (blocks.length && isEmptyParagraph(blocks[blocks.length - 1])) blocks.pop();
  return blocks;
}

export function collectImageSrcs(blocks, into) {
  for (const b of blocks) {
    if (b.type === 'image' && typeof b.props?.url === 'string') {
      into.add(b.props.url);
    }
    if (Array.isArray(b.children)) collectImageSrcs(b.children, into);
  }
}

export function rewriteImageUrls(blocks, srcMap) {
  for (const b of blocks) {
    if (b.type === 'image' && typeof b.props?.url === 'string') {
      const mapped = srcMap.get(b.props.url);
      if (mapped) b.props.url = mapped;
    }
    if (Array.isArray(b.children)) rewriteImageUrls(b.children, srcMap);
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Image download + WebP conversion
// ──────────────────────────────────────────────────────────────────────────────

const MAX_DOWNLOAD_BYTES = 30 * 1024 * 1024;
const MAX_IMAGE_DIM = 1500;
const WEBP_QUALITY = 85;

export function normalizeUrl(raw) {
  try {
    return new URL(raw.normalize('NFC')).href;
  } catch {
    return raw;
  }
}

export async function downloadImage(url, { onWarn } = {}) {
  try {
    const safe = normalizeUrl(url);
    const res = await fetch(safe, { headers: { 'user-agent': 'slph-import/1.0' } });
    if (!res.ok) {
      onWarn?.(`image fetch ${res.status}: ${url}`);
      return null;
    }
    const raw = Buffer.from(await res.arrayBuffer());
    if (raw.byteLength > MAX_DOWNLOAD_BYTES) {
      onWarn?.(`image too large (${(raw.byteLength / 1024 / 1024).toFixed(1)} MB): ${url}`);
      return null;
    }
    const processed = await sharp(raw)
      .rotate()
      .resize({
        width: MAX_IMAGE_DIM,
        height: MAX_IMAGE_DIM,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: WEBP_QUALITY })
      .toBuffer();

    const rawName = decodeURIComponent(new URL(safe).pathname.split('/').pop() || 'image');
    const base = rawName.replace(/\.[^.]+$/, '') || 'image';
    return { buf: processed, mime: 'image/webp', filename: `${base}.webp` };
  } catch (err) {
    onWarn?.(`image error: ${url} — ${err.message}`);
    return null;
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Small text utilities
// ──────────────────────────────────────────────────────────────────────────────

export function stripHtml(html) {
  if (!html) return '';
  const $ = cheerio.load(html);
  return $.text().replace(/\s+/g, ' ').trim();
}

export function slugify(input) {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
