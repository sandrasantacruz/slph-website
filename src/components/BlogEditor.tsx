import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import type { Block, PartialBlock } from '@blocknote/core';
import { useCreateBlockNote } from '@blocknote/react';
import { BlockNoteView } from '@blocknote/mantine';
import {
  MantineProvider,
  TextInput,
  Textarea,
  Select,
  Button,
  InputLabel,
  InputError,
} from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import 'dayjs/locale/de';
import '@mantine/core/styles.css';
import '@mantine/dates/styles.css';
import '@blocknote/core/fonts/inter.css';
import '@blocknote/mantine/style.css';
import { pb } from '../lib/pocketbase';

type Status = 'draft' | 'published' | 'archived';

interface Initial {
  title: string;
  slug: string;
  excerpt: string;
  status: Status;
  published_at: string;
  content: PartialBlock[] | null;
  cover: string[];
  images: string[];
}

interface BlockLike {
  id?: string;
  type?: string;
  props?: { url?: unknown };
  children?: BlockLike[];
}

interface Props {
  postId: string;
  collectionId: string;
  pbUrl: string;
  initial: Initial;
}

interface Errors {
  title?: string;
  slug?: string;
  publishedAt?: string;
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function normalizeCover(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === 'string' && v.length > 0);
  if (typeof value === 'string' && value.length > 0) return [value];
  return [];
}

function collectBlobBlocks(blocks: BlockLike[]): { id: string; url: string }[] {
  const found: { id: string; url: string }[] = [];
  const walk = (arr: BlockLike[]) => {
    for (const b of arr) {
      const url = typeof b.props?.url === 'string' ? b.props.url : '';
      if (b.id && url.startsWith('blob:')) {
        found.push({ id: b.id, url });
      }
      if (b.children?.length) walk(b.children);
    }
  };
  walk(blocks);
  return found;
}

function collectReferencedFilenames(blocks: BlockLike[], prefix: string): Set<string> {
  const refs = new Set<string>();
  const walk = (arr: BlockLike[]) => {
    for (const b of arr) {
      const url = typeof b.props?.url === 'string' ? b.props.url : '';
      if (url.startsWith(prefix)) {
        const filename = url.slice(prefix.length).split('?')[0];
        if (filename) refs.add(filename);
      }
      if (b.children?.length) walk(b.children);
    }
  };
  walk(blocks);
  return refs;
}

function isoToDate(iso: string): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

const MAX_IMAGE_DIM = 1500;
const WEBP_QUALITY = 0.85;

function isHeic(file: File): boolean {
  const mime = file.type.toLowerCase();
  if (mime === 'image/heic' || mime === 'image/heif') return true;
  const name = file.name.toLowerCase();
  return name.endsWith('.heic') || name.endsWith('.heif');
}

async function decodeHeicToBitmap(file: File): Promise<ImageBitmap> {
  // Lazy-load: only pull heic-to (libheif WASM) into the bundle when actually needed.
  const { heicTo } = await import('heic-to');
  return heicTo({ blob: file, type: 'bitmap', options: { imageOrientation: 'from-image' } });
}

async function processImage(file: File): Promise<File> {
  const bitmap = isHeic(file)
    ? await decodeHeicToBitmap(file)
    : await createImageBitmap(file, { imageOrientation: 'from-image' });
  try {
    const ratio = Math.min(1, MAX_IMAGE_DIM / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * ratio);
    const height = Math.round(bitmap.height * ratio);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas wird nicht unterstützt.');
    ctx.drawImage(bitmap, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/webp', WEBP_QUALITY),
    );
    if (!blob) throw new Error('Bild konnte nicht in WebP umgewandelt werden.');

    const baseName = file.name.replace(/\.[^.]+$/, '') || 'image';
    return new File([blob], `${baseName}.webp`, { type: 'image/webp' });
  } finally {
    bitmap.close();
  }
}

export default function BlogEditor({ postId, collectionId, pbUrl, initial }: Props) {
  const [title, setTitle] = useState(initial.title);
  const [slug, setSlug] = useState(initial.slug);
  const [excerpt, setExcerpt] = useState(initial.excerpt);
  const [status, setStatus] = useState<Status>(initial.status);
  const [publishedAt, setPublishedAt] = useState<Date | null>(isoToDate(initial.published_at));
  const [cover, setCover] = useState<string[]>(initial.cover);
  const [images, setImages] = useState<string[]>(initial.images);
  const [coverBusy, setCoverBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [pendingCount, setPendingCount] = useState(0);

  // Auto-derive slug from title (decision: slug always follows title).
  useEffect(() => {
    setSlug(slugify(title));
  }, [title]);

  // blob-URL → original File. Files only exist in memory until save.
  const pendingUploads = useRef<Map<string, File>>(new Map());

  const initialContent = useMemo<PartialBlock[] | undefined>(() => {
    if (Array.isArray(initial.content) && initial.content.length > 0) {
      return initial.content;
    }
    return undefined;
  }, [initial.content]);

  const fileUrl = useCallback(
    (name: string) => `${pbUrl}/api/files/${collectionId}/${postId}/${name}`,
    [pbUrl, collectionId, postId],
  );

  const imageUrlPrefix = useMemo(
    () => `${pbUrl}/api/files/${collectionId}/${postId}/`,
    [pbUrl, collectionId, postId],
  );

  // Defer: convert to WebP + downscale, stash and return a blob URL.
  // Real upload to PocketBase happens on save.
  const uploadFile = useCallback(async (file: File): Promise<string> => {
    const processed = await processImage(file);
    const blobUrl = URL.createObjectURL(processed);
    pendingUploads.current.set(blobUrl, processed);
    setPendingCount(pendingUploads.current.size);
    return blobUrl;
  }, []);

  const editor = useCreateBlockNote({
    initialContent,
    uploadFile,
  });

  // Revoke any blob URLs still in memory when the component unmounts.
  useEffect(() => {
    const map = pendingUploads.current;
    return () => {
      for (const url of map.keys()) URL.revokeObjectURL(url);
      map.clear();
    };
  }, []);

  const onCoverChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file) return;
      setCoverBusy(true);
      setError(null);
      try {
        const processed = await processImage(file);
        const fd = new FormData();
        for (const old of cover) fd.append('cover-', old);
        fd.append('cover+', processed);
        const updated = await pb.collection('posts').update(postId, fd);
        setCover(normalizeCover(updated.cover));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Cover-Upload fehlgeschlagen.');
      } finally {
        setCoverBusy(false);
      }
    },
    [cover, postId],
  );

  const removeCover = useCallback(async () => {
    if (cover.length === 0) return;
    setCoverBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      for (const old of cover) fd.append('cover-', old);
      const updated = await pb.collection('posts').update(postId, fd);
      setCover(normalizeCover(updated.cover));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Cover entfernen fehlgeschlagen.');
    } finally {
      setCoverBusy(false);
    }
  }, [cover, postId]);

  const validate = useCallback((): Errors => {
    const e: Errors = {};
    if (!title.trim()) e.title = 'Titel ist erforderlich.';
    if (!slug) e.slug = 'Slug konnte nicht aus dem Titel generiert werden.';
    if (status === 'published' && !publishedAt) {
      e.publishedAt = 'Veröffentlichungsdatum ist erforderlich, wenn der Artikel veröffentlicht wird.';
    }
    return e;
  }, [publishedAt, slug, status, title]);

  const save = useCallback(async () => {
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length > 0) return;

    setSaving(true);
    setError(null);
    try {
      // 1. Upload all blob-URLs that are still referenced in the document.
      const docBlobs = collectBlobBlocks(editor.document as unknown as BlockLike[]);
      let latestImages = images;

      for (const { id, url } of docBlobs) {
        const file = pendingUploads.current.get(url);
        if (!file) continue;
        const fd = new FormData();
        fd.append('images+', file);
        const updated = await pb.collection('posts').update(postId, fd);
        latestImages = Array.isArray(updated.images) ? (updated.images as string[]) : [];
        const newName = latestImages[latestImages.length - 1];
        if (!newName) throw new Error('Upload fehlgeschlagen.');
        const permanentUrl = fileUrl(newName);

        URL.revokeObjectURL(url);
        pendingUploads.current.delete(url);

        editor.updateBlock(id, { props: { url: permanentUrl } });
      }

      // 2. Drop entries in the map that no longer appear in the document.
      const stillInDoc = new Set(docBlobs.map((b) => b.url));
      for (const url of Array.from(pendingUploads.current.keys())) {
        if (!stillInDoc.has(url)) {
          URL.revokeObjectURL(url);
          pendingUploads.current.delete(url);
        }
      }
      setPendingCount(pendingUploads.current.size);

      // 3. Reconcile orphans.
      const blocks: Block[] = editor.document;
      const referenced = collectReferencedFilenames(blocks as unknown as BlockLike[], imageUrlPrefix);
      const orphans = latestImages.filter((f) => !referenced.has(f));
      if (orphans.length > 0) {
        const fd = new FormData();
        for (const f of orphans) fd.append('images-', f);
        const updated = await pb.collection('posts').update(postId, fd);
        latestImages = Array.isArray(updated.images) ? (updated.images as string[]) : [];
      }
      setImages(latestImages);

      // 4. Persist fields.
      const payload: Record<string, unknown> = {
        title: title.trim(),
        slug,
        excerpt,
        status,
        content: blocks,
        published_at: publishedAt ? publishedAt.toISOString() : '',
      };
      await pb.collection('posts').update(postId, payload);

      setSavedAt(new Date());
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Speichern fehlgeschlagen.';
      setError(msg);
    } finally {
      setSaving(false);
    }
  }, [editor, excerpt, fileUrl, imageUrlPrefix, images, postId, publishedAt, slug, status, title, validate]);

  const remove = useCallback(async () => {
    if (!confirm('Diesen Artikel wirklich löschen? Alle Bilder werden ebenfalls entfernt.')) return;
    try {
      await pb.collection('posts').delete(postId);
      window.location.href = '/admin/posts';
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Löschen fehlgeschlagen.';
      setError(msg);
    }
  }, [postId]);

  const currentCover = cover[0];

  return (
    <MantineProvider defaultColorScheme="light">
      <div className="space-y-6">
        <div>
          <InputLabel mb={6}>Cover-Bild</InputLabel>
          {currentCover ? (
            <div className="overflow-hidden rounded border border-neutral-300 bg-white">
              <img
                src={fileUrl(currentCover)}
                alt="Cover"
                className="block max-h-72 w-full object-cover"
              />
              <div className="flex items-center justify-between gap-2 border-t border-neutral-200 px-3 py-2 text-sm">
                <span className="truncate text-neutral-500">{currentCover}</span>
                <div className="flex gap-2">
                  <Button
                    component="label"
                    variant="default"
                    size="xs"
                    disabled={coverBusy}
                  >
                    Ersetzen
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      disabled={coverBusy}
                      onChange={onCoverChange}
                    />
                  </Button>
                  <Button
                    variant="default"
                    color="red"
                    size="xs"
                    onClick={removeCover}
                    disabled={coverBusy}
                  >
                    Entfernen
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <label className="flex h-32 cursor-pointer flex-col items-center justify-center rounded border-2 border-dashed border-neutral-300 bg-white text-sm text-neutral-500 hover:border-neutral-400 hover:bg-neutral-50">
              <span>{coverBusy ? 'Lädt …' : '+ Cover-Bild hochladen'}</span>
              <span className="mt-1 text-xs text-neutral-400">PNG, JPG, WebP</span>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                disabled={coverBusy}
                onChange={onCoverChange}
              />
            </label>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <TextInput
              label="Titel"
              value={title}
              onChange={(e) => setTitle(e.currentTarget.value)}
              placeholder="Titel des Artikels"
              size="md"
              error={errors.title}
              withAsterisk
            />
          </div>

          <div className="sm:col-span-2">
            <TextInput
              label="URL-Slug"
              value={slug}
              disabled
              placeholder="(wird aus dem Titel generiert)"
              description="Wird automatisch aus dem Titel abgeleitet."
              inputWrapperOrder={['label', 'input', 'description', 'error']}
              classNames={{ input: 'font-mono' }}
              error={errors.slug}
            />
          </div>

          <Select
            label="Status"
            value={status}
            onChange={(v) => setStatus((v ?? 'draft') as Status)}
            allowDeselect={false}
            data={[
              { value: 'draft', label: 'Entwurf' },
              { value: 'published', label: 'Veröffentlicht' },
              { value: 'archived', label: 'Archiviert' },
            ]}
          />

          <DatePickerInput
            label="Veröffentlichungsdatum"
            value={publishedAt}
            onChange={(v) => setPublishedAt(v ? new Date(v) : null)}
            valueFormat="DD.MM.YYYY"
            locale="de"
            placeholder="Datum wählen"
            clearable
            error={errors.publishedAt}
            withAsterisk={status === 'published'}
          />

          <div className="sm:col-span-2">
            <Textarea
              label="Kurzbeschreibung"
              value={excerpt}
              onChange={(e) => setExcerpt(e.currentTarget.value)}
              placeholder="Kurze Zusammenfassung für Listen und Vorschau (max. 300 Zeichen)"
              autosize
              minRows={2}
              maxLength={300}
            />
          </div>
        </div>

        <div>
          <InputLabel mb={6}>Inhalt</InputLabel>
          <div className="rounded border border-neutral-300 bg-white">
            <BlockNoteView editor={editor} theme="light" />
          </div>
          <p className="mt-2 text-xs text-neutral-500">
            Tipp: Bilder per Drag-and-Drop oder Copy-Paste einfügen. „/“ tippen für weitere Block-Typen.
            Bilder werden erst beim Speichern wirklich hochgeladen.
          </p>
        </div>

        {error && <InputError>{error}</InputError>}

        <div className="flex items-center justify-between border-t border-neutral-200 pt-4">
          <Button variant="subtle" color="red" onClick={remove}>
            Artikel löschen
          </Button>
          <div className="flex items-center gap-3">
            {pendingCount > 0 && (
              <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-900">
                {pendingCount} ungespeicherte{pendingCount === 1 ? 's Bild' : ' Bilder'}
              </span>
            )}
            {savedAt && pendingCount === 0 && (
              <span className="text-xs text-neutral-500">
                Gespeichert um {savedAt.toLocaleTimeString('de-DE')}
              </span>
            )}
            <Button onClick={save} loading={saving} color="dark">
              Speichern
            </Button>
          </div>
        </div>
      </div>
    </MantineProvider>
  );
}
