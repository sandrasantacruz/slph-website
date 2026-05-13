type Style = Record<string, boolean | string>;

interface InlineText {
  type: 'text';
  text: string;
  styles?: Style;
}

interface InlineLink {
  type: 'link';
  href: string;
  content: InlineText[];
}

type Inline = InlineText | InlineLink;

interface Block {
  id?: string;
  type: string;
  props?: Record<string, unknown>;
  content?: Inline[] | Block[] | string;
  children?: Block[];
}

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
}

function escapeAttr(s: string): string {
  return escapeHtml(s);
}

function renderInlineText(inline: InlineText): string {
  let html = escapeHtml(inline.text ?? '');
  const s = inline.styles ?? {};
  if (s.code) html = `<code>${html}</code>`;
  if (s.bold) html = `<strong>${html}</strong>`;
  if (s.italic) html = `<em>${html}</em>`;
  if (s.underline) html = `<u>${html}</u>`;
  if (s.strike) html = `<s>${html}</s>`;
  return html;
}

function renderInlines(content: Inline[] | undefined): string {
  if (!content) return '';
  return content
    .map((item) => {
      if (item.type === 'link') {
        const inner = (item.content ?? []).map(renderInlineText).join('');
        const href = escapeAttr(item.href ?? '#');
        const external = /^https?:\/\//i.test(item.href ?? '');
        const rel = external ? ' rel="noopener noreferrer" target="_blank"' : '';
        return `<a href="${href}"${rel}>${inner}</a>`;
      }
      return renderInlineText(item as InlineText);
    })
    .join('');
}

function classes(...arr: (string | false | undefined)[]): string {
  const xs = arr.filter(Boolean);
  return xs.length ? ` class="${xs.join(' ')}"` : '';
}

function youtubeId(url: string): string | null {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '');
    if (host === 'youtu.be') return u.pathname.slice(1).split('/')[0] || null;
    if (host === 'youtube.com' || host === 'youtube-nocookie.com' || host === 'm.youtube.com') {
      const m = u.pathname.match(/^\/(?:embed|v|shorts)\/([^/?#]+)/);
      if (m) return m[1];
      return u.searchParams.get('v');
    }
    return null;
  } catch {
    return null;
  }
}

function alignClass(props: Record<string, unknown> | undefined): string {
  const a = props?.textAlignment;
  if (a === 'center') return 'text-center';
  if (a === 'right') return 'text-right';
  if (a === 'justify') return 'text-justify';
  return '';
}

function renderBlock(b: Block): string {
  const props = b.props ?? {};
  const inline = Array.isArray(b.content) ? renderInlines(b.content as Inline[]) : '';
  const align = alignClass(props);

  switch (b.type) {
    case 'paragraph':
      if (!inline.trim()) return `<p${classes(align)}>&nbsp;</p>`;
      return `<p${classes(align)}>${inline}</p>`;

    case 'heading': {
      const level = Math.max(1, Math.min(3, Number(props.level ?? 2)));
      return `<h${level}${classes(align)}>${inline}</h${level}>`;
    }

    case 'bulletListItem':
    case 'numberedListItem':
    case 'checkListItem': {
      const childHtml = renderChildren(b.children);
      return `<li${classes(align)}>${inline}${childHtml}</li>`;
    }

    case 'image': {
      const url = String(props.url ?? '');
      if (!url) return '';
      const caption = String(props.caption ?? '');
      const width = props.previewWidth;
      const widthAttr =
        typeof width === 'number' && Number.isFinite(width) ? ` style="max-width:${width}px"` : '';
      const figAlign = align;
      const figure = caption
        ? `<figure${classes(figAlign)}><img src="${escapeAttr(url)}" alt="${escapeAttr(caption)}" loading="lazy"${widthAttr} /><figcaption>${escapeHtml(caption)}</figcaption></figure>`
        : `<figure${classes(figAlign)}><img src="${escapeAttr(url)}" alt=""  loading="lazy"${widthAttr} /></figure>`;
      return figure;
    }

    case 'video': {
      const url = String(props.url ?? '');
      if (!url) return '';
      const yt = youtubeId(url);
      if (yt) {
        const embed = `https://www.youtube-nocookie.com/embed/${yt}`;
        return `<figure${classes('video-embed', align)}><iframe src="${escapeAttr(embed)}" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen referrerpolicy="strict-origin-when-cross-origin" title="YouTube video"></iframe></figure>`;
      }
      return `<figure${classes(align)}><video src="${escapeAttr(url)}" controls preload="metadata"></video></figure>`;
    }

    case 'audio': {
      const url = String(props.url ?? '');
      if (!url) return '';
      return `<figure${classes(align)}><audio src="${escapeAttr(url)}" controls></audio></figure>`;
    }

    case 'file': {
      const url = String(props.url ?? '');
      const name = String(props.name ?? url);
      if (!url) return '';
      return `<p${classes(align)}><a href="${escapeAttr(url)}" download>${escapeHtml(name)}</a></p>`;
    }

    case 'codeBlock': {
      const raw = typeof b.content === 'string' ? b.content : Array.isArray(b.content) ? (b.content as Inline[]).map((c) => (c.type === 'text' ? c.text : '')).join('') : '';
      const lang = String(props.language ?? '');
      const langClass = lang ? ` class="language-${escapeAttr(lang)}"` : '';
      return `<pre><code${langClass}>${escapeHtml(raw)}</code></pre>`;
    }

    default:
      // Fallback: render inline content if any.
      return inline ? `<p${classes(align)}>${inline}</p>` : '';
  }
}

function renderChildren(children: Block[] | undefined): string {
  if (!children || children.length === 0) return '';
  return renderBlocks(children);
}

export function renderBlocks(blocks: Block[] | null | undefined): string {
  if (!Array.isArray(blocks) || blocks.length === 0) return '';

  let html = '';
  let listMode: 'ul' | 'ol' | null = null;

  const flush = () => {
    if (listMode === 'ul') html += '</ul>';
    else if (listMode === 'ol') html += '</ol>';
    listMode = null;
  };

  for (const b of blocks) {
    const desired: 'ul' | 'ol' | null =
      b.type === 'bulletListItem' || b.type === 'checkListItem'
        ? 'ul'
        : b.type === 'numberedListItem'
          ? 'ol'
          : null;

    if (desired !== listMode) {
      flush();
      if (desired === 'ul') html += '<ul>';
      else if (desired === 'ol') html += '<ol>';
      listMode = desired;
    }

    html += renderBlock(b);
  }

  flush();
  return html;
}
