/**
 * Les deux briques partagées par les trois onglets. Elles vivent à part pour
 * qu'aucune vue n'ait à importer une autre vue juste pour un en-tête.
 */

/** En-tête de carte : pastille d'icône, titre serif, actions à droite. */
export function CardTitle({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode
  title: string
  children?: React.ReactNode
}) {
  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border-2 border-ink bg-brand-soft">
        {icon}
      </span>
      <h2 className="h-card">{title}</h2>
      {children && <div className="ml-auto flex items-center gap-2">{children}</div>}
    </div>
  )
}

/** Erreur de requête. Aplat orangé bordé d'encre, comme le reste. */
export function ErrorBox({ error }: { error: unknown }) {
  const message = error instanceof Error ? error.message : String(error)
  return (
    <div className="rounded-card border-2 border-ink bg-loss-soft px-4 py-3 text-sm font-bold text-ink shadow-brut">
      {message}
    </div>
  )
}
