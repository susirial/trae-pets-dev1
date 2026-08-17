import { useEffect, useState, type ReactNode } from 'react';

interface Props {
  src: string | null;
  alt: string;
  className?: string;
  fallback?: ReactNode;
}

export function PetVisual({ src, alt, className, fallback }: Props) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  if (!src || failed) {
    return <>{fallback ?? <span className="visual-fallback">暂无预览</span>}</>;
  }

  return (
    <img
      key={src}
      className={className}
      src={src}
      alt={alt}
      draggable={false}
      onError={() => setFailed(true)}
    />
  );
}
