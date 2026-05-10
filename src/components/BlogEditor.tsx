import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import type { Block, PartialBlock } from '@blocknote/core';
import { useCreateBlockNote } from '@blocknote/react';
import { BlockNoteView } from '@blocknote/mantine';
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

function dateInputValue(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
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

export default function BlogEditor({ postId, collectionId, pbUrl, initial }: Props) {
  const [title, setTitle] = useState(initial.title);
  const [slug, setSlug] = useState(initial.slug);
  const [excerpt, setExcerpt] = useState(initial.excerpt);
  const [status, setStatus] = useState<Status>(initial.status);
  const [publishedAt, setPublishedAt] = useState(dateInputValue(initial.published_at));
  const [cover, setCover] = useState<string[]>(initial.cover);
  const [images, setImages] = useState<string[]>(initial.images);
  const [coverBusy, setCoverBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingCount, setPendingCount] = useState(0);

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

  // Defer: just stash the file and return a blob URL. Real upload happens on save.
  const uploadFile = useCallback(async (file: File): Promise<string> => {
    const blobUrl = URL.createObjectURL(file);
    pendingUploads.current.set(blobUrl, file);
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
        const fd = new FormData();
        for (const old of cover) fd.append('cover-', old);
        fd.append('cover+', file);
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

  const save = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      // 1. Upload all blob-URLs that are still referenced in the document.
      const docBlobs = collectBlobBlocks(editor.document as unknown as BlockLike[]);
      let latestImages = images;

      for (const { id, url } of docBlobs) {
        const file = pendingUploads.current.get(url);
        if (!file) continue; // unknown blob (e.g. user pasted external blob URL)
        const fd = new FormData();
        fd.append('images+', file);
        const updated = await pb.collection('posts').update(postId, fd);
        latestImages = Array.isArray(updated.images) ? (updated.images as string[]) : [];
        const newName = latestImages[latestImages.length - 1];
        if (!newName) throw new Error('Upload fehlgeschlagen.');
        const permanentUrl = fileUrl(newName);

        URL.revokeObjectURL(url);
        pendingUploads.current.delete(url);

        // Update the editor block in place.
        editor.updateBlock(id, { props: { url: permanentUrl } });
      }

      // 2. Drop entries in the map that no longer appear in the document
      //    (image was dropped, then deleted from editor before save).
      const stillInDoc = new Set(docBlobs.map((b) => b.url));
      for (const url of Array.from(pendingUploads.current.keys())) {
        if (!stillInDoc.has(url)) {
          URL.revokeObjectURL(url);
          pendingUploads.current.delete(url);
        }
      }
      setPendingCount(pendingUploads.current.size);

      // 3. Reconcile: any file in `images` that is no longer referenced in the
      //    document (existing image was deleted from the editor) → remove.
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

      // 4. Persist title/slug/excerpt/status/published_at/content.
      const payload: Record<string, unknown> = {
        title,
        slug,
        excerpt,
        status,
        content: blocks,
      };
      payload.published_at = publishedAt ? new Date(`${publishedAt}T00:00:00`).toISOString() : '';
      await pb.collection('posts').update(postId, payload);

      setSavedAt(new Date());
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Speichern fehlgeschlagen.';
      setError(msg);
    } finally {
      setSaving(false);
    }
  }, [editor, excerpt, fileUrl, imageUrlPrefix, images, postId, publishedAt, slug, status, title]);

  const remove = useCallback(async () => {
    if (!confirm('Diesen Artikel wirklich löschen? Alle Bilder werden ebenfalls entfernt.')) return;
    try {
      await pb.collection('posts').delete(postId);
      window.location.href = '/admin/posts';
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Löschen fehlgeschlagen.';
      setError(msg);
    }
  }, [postId]);

  const currentCover = cover[0];

  return (
    <div className="space-y-6">
      <div>
        <span className="mb-1 block text-sm font-medium text-neutral-700">Cover-Bild</span>
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
                <label className="cursor-pointer rounded border border-neutral-300 px-3 py-1 hover:bg-neutral-100">
                  Ersetzen
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={coverBusy}
                    onChange={onCoverChange}
                  />
                </label>
                <button
                  type="button"
                  onClick={removeCover}
                  disabled={coverBusy}
                  className="rounded border border-neutral-300 px-3 py-1 text-red-600 hover:bg-red-50 disabled:opacity-50"
                >
                  Entfernen
                </button>
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
        <label className="block sm:col-span-2">
          <span className="mb-1 block text-sm font-medium text-neutral-700">Titel</span>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Titel des Artikels"
            className="w-full rounded border border-neutral-300 bg-white px-3 py-2 text-lg focus:border-neutral-500 focus:outline-none"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-neutral-700">URL-Slug</span>
          <input
            type="text"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder="mein-artikel"
            pattern="^[a-z0-9-]+$"
            className="w-full rounded border border-neutral-300 bg-white px-3 py-2 font-mono text-sm focus:border-neutral-500 focus:outline-none"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-neutral-700">Status</span>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as Status)}
            className="w-full rounded border border-neutral-300 bg-white px-3 py-2 focus:border-neutral-500 focus:outline-none"
          >
            <option value="draft">Entwurf</option>
            <option value="published">Veröffentlicht</option>
            <option value="archived">Archiviert</option>
          </select>
        </label>

        <label className="block sm:col-span-2">
          <span className="mb-1 block text-sm font-medium text-neutral-700">Kurzbeschreibung</span>
          <textarea
            value={excerpt}
            onChange={(e) => setExcerpt(e.target.value)}
            rows={2}
            maxLength={300}
            placeholder="Kurze Zusammenfassung für Listen und Vorschau (max. 300 Zeichen)"
            className="w-full rounded border border-neutral-300 bg-white px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-neutral-700">Veröffentlichungsdatum</span>
          <input
            type="date"
            value={publishedAt}
            onChange={(e) => setPublishedAt(e.target.value)}
            className="w-full rounded border border-neutral-300 bg-white px-3 py-2 focus:border-neutral-500 focus:outline-none"
          />
        </label>
      </div>

      <div>
        <span className="mb-1 block text-sm font-medium text-neutral-700">Inhalt</span>
        <div className="rounded border border-neutral-300 bg-white">
          <BlockNoteView editor={editor} theme="light" />
        </div>
        <p className="mt-2 text-xs text-neutral-500">
          Tipp: Bilder per Drag-and-Drop oder Copy-Paste einfügen. „/“ tippen für weitere Block-Typen.
          Bilder werden erst beim Speichern wirklich hochgeladen.
        </p>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex items-center justify-between border-t border-neutral-200 pt-4">
        <button
          type="button"
          onClick={remove}
          className="text-sm text-red-600 hover:text-red-800"
        >
          Artikel löschen
        </button>
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
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
          >
            {saving ? 'Speichert …' : 'Speichern'}
          </button>
        </div>
      </div>
    </div>
  );
}
