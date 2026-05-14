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
  Modal,
  Group,
  Text,
} from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import 'dayjs/locale/es';
import '@mantine/core/styles.css';
import '@mantine/dates/styles.css';
import '@blocknote/core/fonts/inter.css';
import '@blocknote/mantine/style.css';
import { createBrowserPb } from '../lib/pocketbase';

type Status = 'draft' | 'published' | 'archived';
type PostTyp = 'event' | 'news';
const COLLECTION = 'posts';

interface Initial {
  title: string;
  slug: string;
  excerpt: string;
  status: Status;
  published_at: string;
  content: PartialBlock[] | null;
  cover: string[];
  images: string[];
  event_date?: string;
  event_end?: string;
  location?: string;
  address_url?: string;
}

interface BlockLike {
  id?: string;
  type?: string;
  props?: { url?: unknown };
  children?: BlockLike[];
}

interface Props {
  postId: string;
  typ: PostTyp;
  collectionId: string;
  pbUrl: string;
  initial: Initial;
}

interface Errors {
  title?: string;
  slug?: string;
  excerpt?: string;
  publishedAt?: string;
  eventDate?: string;
  eventEnd?: string;
  addressUrl?: string;
}

function isValidHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
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

export default function BlogEditor({ postId, typ: initialTyp, collectionId, pbUrl, initial }: Props) {
  const adminListPath = '/admin/novedades';

  const [typ, setTyp] = useState<PostTyp>(initialTyp);
  const isEvent = typ === 'event';
  const entityLabel = isEvent ? 'evento' : 'noticia';
  const entityArticle = isEvent ? 'el' : 'la';
  const entityArticleCap = isEvent ? 'El' : 'La';

  const [title, setTitle] = useState(initial.title);
  const [slug, setSlug] = useState(initial.slug);
  const [excerpt, setExcerpt] = useState(initial.excerpt);
  const [status, setStatus] = useState<Status>(initial.status);
  const [publishedAt, setPublishedAt] = useState<Date | null>(isoToDate(initial.published_at));
  const [eventDate, setEventDate] = useState<Date | null>(isoToDate(initial.event_date ?? ''));
  const [eventEnd, setEventEnd] = useState<Date | null>(isoToDate(initial.event_end ?? ''));
  const [location, setLocation] = useState(initial.location ?? '');
  const [addressUrl, setAddressUrl] = useState(initial.address_url ?? '');
  const [cover, setCover] = useState<string[]>(initial.cover);
  const [images, setImages] = useState<string[]>(initial.images);
  const [coverBusy, setCoverBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [pendingCount, setPendingCount] = useState(0);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Auto-derive slug from title (decision: slug always follows title).
  useEffect(() => {
    setSlug(slugify(title));
  }, [title]);

  const pb = useMemo(() => createBrowserPb(pbUrl), [pbUrl]);

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
        const updated = await pb.collection(COLLECTION).update(postId, fd);
        setCover(normalizeCover(updated.cover));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error al subir la portada.');
      } finally {
        setCoverBusy(false);
      }
    },
    [cover, pb, postId],
  );

  const removeCover = useCallback(async () => {
    if (cover.length === 0) return;
    setCoverBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      for (const old of cover) fd.append('cover-', old);
      const updated = await pb.collection(COLLECTION).update(postId, fd);
      setCover(normalizeCover(updated.cover));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al quitar la portada.');
    } finally {
      setCoverBusy(false);
    }
  }, [cover, pb, postId]);

  const validate = useCallback((): Errors => {
    const e: Errors = {};
    if (!title.trim()) e.title = 'El título es obligatorio.';
    if (!slug) e.slug = 'No se pudo generar el slug a partir del título.';
    if (excerpt.length > 300) {
      e.excerpt = `Resumen demasiado largo (${excerpt.length}/300 caracteres).`;
    }
    if (status === 'published' && !publishedAt) {
      e.publishedAt = `La fecha de publicación es obligatoria al publicar ${entityArticle} ${entityLabel}.`;
    }
    if (isEvent) {
      if (status === 'published' && !eventDate) {
        e.eventDate = 'La fecha del evento es obligatoria.';
      }
      if (eventDate && eventEnd && eventEnd.getTime() < eventDate.getTime()) {
        e.eventEnd = 'La fecha de fin no puede ser anterior a la de inicio.';
      }
      if (addressUrl.trim() && !isValidHttpUrl(addressUrl.trim())) {
        e.addressUrl = 'Introduce una URL válida (https://…).';
      }
    }
    return e;
  }, [addressUrl, entityArticle, entityLabel, eventDate, eventEnd, excerpt, isEvent, publishedAt, slug, status, title]);

  const save = useCallback(async () => {
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length > 0) {
      setError('Corrige los campos marcados.');
      return;
    }

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
        const updated = await pb.collection(COLLECTION).update(postId, fd);
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
        const updated = await pb.collection(COLLECTION).update(postId, fd);
        latestImages = Array.isArray(updated.images) ? (updated.images as string[]) : [];
      }
      setImages(latestImages);

      // 4. Persist fields. Bei typ-Wechsel werden die jeweils irrelevanten
      // Felder leer geschrieben, damit kein Geisterzustand übrig bleibt.
      const payload: Record<string, unknown> = {
        title: title.trim(),
        slug,
        excerpt,
        status,
        typ,
        content: blocks,
        published_at: publishedAt ? publishedAt.toISOString() : '',
        event_date: isEvent && eventDate ? eventDate.toISOString() : '',
        event_end: isEvent && eventEnd ? eventEnd.toISOString() : '',
        location: isEvent ? location : '',
        address_url: isEvent ? addressUrl : '',
      };
      await pb.collection(COLLECTION).update(postId, payload);

      setSavedAt(new Date());
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al guardar.';
      setError(msg);
    } finally {
      setSaving(false);
    }
  }, [addressUrl, editor, eventDate, eventEnd, excerpt, fileUrl, imageUrlPrefix, images, isEvent, location, pb, postId, publishedAt, slug, status, title, typ, validate]);

  const performDelete = useCallback(async () => {
    setDeleting(true);
    setError(null);
    try {
      await pb.collection(COLLECTION).delete(postId);
      window.location.href = adminListPath;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al eliminar.';
      setError(msg);
      setDeleting(false);
      setConfirmDeleteOpen(false);
    }
  }, [adminListPath, pb, postId]);

  const currentCover = cover[0];

  return (
    <MantineProvider defaultColorScheme="light">
      <div className="space-y-6">
        <div>
          <InputLabel mb={6}>Imagen de portada</InputLabel>
          {currentCover ? (
            <div className="overflow-hidden rounded border border-neutral-300 bg-white">
              <img
                src={fileUrl(currentCover)}
                alt="Portada"
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
                    Reemplazar
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
                    Quitar
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <label className="flex h-32 cursor-pointer flex-col items-center justify-center rounded border-2 border-dashed border-neutral-300 bg-white text-sm text-neutral-500 hover:border-neutral-400 hover:bg-neutral-50">
              <span>{coverBusy ? 'Cargando …' : '+ Subir imagen de portada'}</span>
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
              label="Título"
              value={title}
              onChange={(e) => setTitle(e.currentTarget.value)}
              placeholder={`Título ${isEvent ? 'del evento' : 'de la noticia'}`}
              size="md"
              error={errors.title}
              withAsterisk
            />
          </div>

          <div className="sm:col-span-2">
            <TextInput
              label="URL (slug)"
              value={slug}
              disabled
              placeholder="(se genera a partir del título)"
              description="Se genera automáticamente del título."
              inputWrapperOrder={['label', 'input', 'description', 'error']}
              classNames={{ input: 'font-mono' }}
              error={errors.slug}
            />
          </div>

          <Select
            label="Tipo"
            value={typ}
            onChange={(v) => setTyp((v ?? 'news') as PostTyp)}
            allowDeselect={false}
            data={[
              { value: 'news', label: 'Noticia' },
              { value: 'event', label: 'Evento' },
            ]}
            description="Define los campos disponibles abajo."
            inputWrapperOrder={['label', 'input', 'description', 'error']}
          />

          <Select
            label="Estado"
            value={status}
            onChange={(v) => setStatus((v ?? 'draft') as Status)}
            allowDeselect={false}
            data={[
              { value: 'draft', label: 'Borrador' },
              { value: 'published', label: 'Publicado' },
              { value: 'archived', label: 'Archivado' },
            ]}
          />

          <DatePickerInput
            label="Fecha de publicación"
            value={publishedAt}
            onChange={(v) => setPublishedAt(v ? new Date(v) : null)}
            valueFormat="DD/MM/YYYY"
            locale="es"
            placeholder="Selecciona una fecha"
            clearable
            error={errors.publishedAt}
            withAsterisk={status === 'published'}
          />

          {isEvent && (
            <>
              <DatePickerInput
                label="Fecha del evento"
                value={eventDate}
                onChange={(v) => setEventDate(v ? new Date(v) : null)}
                valueFormat="DD/MM/YYYY"
                locale="es"
                placeholder="Selecciona una fecha"
                clearable
                error={errors.eventDate}
                withAsterisk={status === 'published'}
              />

              <DatePickerInput
                label="Fecha de fin (opcional)"
                value={eventEnd}
                onChange={(v) => setEventEnd(v ? new Date(v) : null)}
                valueFormat="DD/MM/YYYY"
                locale="es"
                placeholder="Sólo para eventos de varios días"
                clearable
                error={errors.eventEnd}
                minDate={eventDate ?? undefined}
              />

              <TextInput
                label="Lugar"
                value={location}
                onChange={(e) => setLocation(e.currentTarget.value)}
                placeholder="p. ej. Casa Colón, Las Palmas de Gran Canaria"
              />

              <TextInput
                label="Enlace al mapa (opcional)"
                value={addressUrl}
                onChange={(e) => setAddressUrl(e.currentTarget.value)}
                placeholder="https://maps.google.com/…"
                type="url"
                error={errors.addressUrl}
              />
            </>
          )}

          <div className="sm:col-span-2">
            <Textarea
              label="Resumen"
              value={excerpt}
              onChange={(e) => setExcerpt(e.currentTarget.value)}
              placeholder="Resumen breve para listados y vista previa (máx. 300 caracteres)"
              autosize
              minRows={2}
              maxLength={300}
              description={`${excerpt.length}/300 caracteres`}
              inputWrapperOrder={['label', 'input', 'description', 'error']}
              error={errors.excerpt}
            />
          </div>
        </div>

        <div>
          <InputLabel mb={6}>Contenido</InputLabel>
          <div className="rounded border border-neutral-300 bg-white">
            <BlockNoteView editor={editor} theme="light" />
          </div>
          <p className="mt-2 text-xs text-neutral-500">
            Consejo: arrastra y suelta o pega imágenes para insertarlas. Escribe «/» para más tipos de bloque.
            Las imágenes se suben al guardar.
          </p>
        </div>

        {error && <InputError>{error}</InputError>}

        <div className="flex items-center justify-between border-t border-neutral-200 pt-4">
          <Button variant="subtle" color="red" onClick={() => setConfirmDeleteOpen(true)}>
            Eliminar {entityLabel}
          </Button>
          <div className="flex items-center gap-3">
            {pendingCount > 0 && (
              <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-900">
                {pendingCount} {pendingCount === 1 ? 'imagen sin guardar' : 'imágenes sin guardar'}
              </span>
            )}
            {savedAt && pendingCount === 0 && (
              <span className="text-xs text-neutral-500">
                Guardado a las {savedAt.toLocaleTimeString('es-ES')}
              </span>
            )}
            <Button onClick={save} loading={saving} color="dark">
              Guardar
            </Button>
          </div>
        </div>

        <Modal
          opened={confirmDeleteOpen}
          onClose={() => !deleting && setConfirmDeleteOpen(false)}
          title={`¿Eliminar ${entityArticle} ${entityLabel}?`}
          centered
          closeOnClickOutside={!deleting}
          closeOnEscape={!deleting}
          withCloseButton={!deleting}
        >
          <Text size="sm" mb="lg">
            {entityArticleCap} {entityLabel} se eliminará de forma definitiva. Las imágenes también se borrarán.
          </Text>
          <Group justify="flex-end">
            <Button
              variant="default"
              onClick={() => setConfirmDeleteOpen(false)}
              disabled={deleting}
            >
              Cancelar
            </Button>
            <Button color="red" onClick={performDelete} loading={deleting}>
              Eliminar
            </Button>
          </Group>
        </Modal>
      </div>
    </MantineProvider>
  );
}
