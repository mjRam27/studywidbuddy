import type { CSSProperties } from 'react';

type Props = { name: string; size?: number; color?: string; style?: CSSProperties; className?: string };

/** Material Symbols Rounded glyph. */
export function Icon({ name, size, color, style, className }: Props) {
  return (
    <i className={className ? `ms ${className}` : 'ms'} style={{ fontSize: size, color, ...style }} aria-hidden="true">
      {name}
    </i>
  );
}
