import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';

type ImgProps = React.ImgHTMLAttributes<HTMLImageElement>;

interface CardImageProps extends Omit<ImgProps, 'onError'> {
  /** URL de l'image (typiquement getCardImage(name)) */
  src: string;
  /** Si fourni, rend un motion.img avec ce layoutId (transition partagee). */
  layoutId?: string;
  /** Nombre max de tentatives de rechargement sur erreur reseau. */
  maxRetries?: number;
  /** Callback appele si l'image echoue apres toutes les tentatives. */
  onFinalError?: () => void;
}

/**
 * Image de carte Scryfall robuste aux reseaux degrades.
 *
 * Probleme resolu : un echec reseau transitoire laisse une <img> cassee
 * definitivement (le navigateur ne reessaie jamais une URL en erreur). Ici on
 * retente automatiquement le chargement avec un backoff, ce qui recupere la
 * grande majorite des images qui "ne se chargent jamais" sur connexion moyenne.
 */
export default function CardImage({
  src,
  layoutId,
  maxRetries = 3,
  onFinalError,
  loading = 'lazy',
  ...rest
}: CardImageProps) {
  const [attempt, setAttempt] = useState(0);

  // Reset du compteur quand la carte change.
  useEffect(() => {
    setAttempt(0);
  }, [src]);

  // Sur retry on ajoute un parametre pour forcer une nouvelle requete
  // (reassigner la meme src ne redeclenche pas le chargement).
  const resolvedSrc = attempt === 0 ? src : `${src}${src.includes('?') ? '&' : '?'}_r=${attempt}`;

  const handleError = useCallback(() => {
    if (attempt >= maxRetries) {
      onFinalError?.();
      return;
    }
    const next = attempt + 1;
    // Backoff progressif : 400ms, 800ms, 1200ms...
    window.setTimeout(() => setAttempt(next), 400 * next);
  }, [attempt, maxRetries, onFinalError]);

  const commonProps = {
    src: resolvedSrc,
    loading,
    decoding: 'async' as const,
    onError: handleError,
    ...rest,
  };

  if (layoutId) {
    // Cast : les handlers d'evenements DOM (onAnimationStart...) ont une
    // signature differente de celle de motion ; aucun appelant ne les passe.
    return <motion.img layoutId={layoutId} {...(commonProps as Record<string, unknown>)} />;
  }
  return <img {...commonProps} />;
}
