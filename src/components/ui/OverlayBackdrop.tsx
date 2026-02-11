interface OverlayBackdropProps {
  ariaLabel: string;
  className?: string;
  onClick: () => void;
}

export function OverlayBackdrop(props: OverlayBackdropProps) {
  const { ariaLabel, className = 'menu-backdrop', onClick } = props;
  return <button type="button" className={className} onClick={onClick} aria-label={ariaLabel} />;
}
