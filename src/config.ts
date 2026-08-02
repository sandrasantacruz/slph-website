/**
 * Feste Konfiguration der Seite.
 *
 * Diese Werte stehen bewusst im Repo und nicht in Repository-Variablen: sie
 * sind keine Geheimnisse, sondern Deployment-Konstanten. Die Tenant-ID und die
 * CMS-URL ändern sich nicht pro Umgebung, und ein Build, der ohne gesetzte
 * Variablen still eine leere Seite ausliefert, ist die schlechtere Variante.
 * Die CI braucht dadurch keinen `env`-Block.
 *
 * Für lokale Arbeit gegen eine andere Instanz gewinnt eine gleichnamige
 * Umgebungsvariable aus `.env` (siehe `.env.example`):
 *
 *   PULPO_URL=http://localhost:8081
 *   PULPO_RESTAURANT=<lokale Tenant-ID>
 */

/** `.env`/Prozess-Variable, leer wenn nicht gesetzt. */
function env(name: string): string {
  const meta = (import.meta as unknown as { env?: Record<string, string> }).env;
  return (meta?.[name] ?? process.env[name] ?? '').trim();
}

export const pulpo = {
  /** PocketBase des CMS, aus dem der Content-Loader zur Build-Zeit liest. */
  url: env('PULPO_URL') || 'https://pulpo.cloud',
  /**
   * Basis der Bild-URLs im ausgelieferten HTML. Nur nötig, wenn der Build das
   * CMS unter einer anderen Adresse erreicht als der Browser. Leer = `url`.
   */
  publicUrl: env('PULPO_PUBLIC_URL'),
  /** Tenant „Si los peces hablaran". */
  restaurant: env('PULPO_RESTAURANT') || 'voqkaaopd4zx0zu',
  /** Sprache der lokalisierten CMS-Felder. */
  lang: env('PULPO_LANG') || 'es',
} as const;
