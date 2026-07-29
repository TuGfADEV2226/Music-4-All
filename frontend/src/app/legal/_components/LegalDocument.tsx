import type { ReactNode } from 'react'

/**
 * Presentational shell for a legal document (Server Component).
 *
 * Renders the document title, the "last updated" line, and the prose body with a
 * consistent set of typographic utilities.
 */
export function LegalDocument({
  title,
  updated,
  children,
}: {
  title: string
  updated: string
  children: ReactNode
}) {
  return (
    <article className="mx-auto w-full max-w-3xl">
      <header className="mb-8 border-b border-subtle pb-6">
        <h1 className="font-sans text-3xl font-bold text-primary">{title}</h1>
        <p className="mt-2 font-mono text-2xs uppercase tracking-wider text-secondary">
          Last updated: {updated}
        </p>
      </header>

      {/* Prose: los <section>/<h2>/<p>/<ul> se estilan con las utilidades de abajo. */}
      <div className="space-y-8 font-sans text-sm leading-relaxed text-secondary [&_a]:text-teal-400 [&_a]:underline [&_h2]:mb-2 [&_h2]:font-sans [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-primary [&_li]:ml-1 [&_p]:mb-3 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-6">
        {children}
      </div>
    </article>
  )
}
