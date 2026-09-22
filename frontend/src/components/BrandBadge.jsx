// Brand identity block used in every header/top bar. Shows ONLY the brand
// name and the logo from the admin panel — no "TB" text tile or generic icon
// placeholders anywhere. When no logo is set, just the name is rendered.
export default function BrandBadge({
  branding,
  size = 'sm',
  onDark = false,
  dot = false,
  pad = 'p-0.5',
  textCls = '',
}) {
  const name = (branding && branding.name) || '';
  const logo = branding && branding.logo;
  const tile =
    size === 'lg'
      ? 'w-10 h-10 rounded-xl'
      : size === 'md'
        ? 'w-9 h-9 rounded-xl'
        : 'w-8 h-8 rounded-lg';
  const nameColor = onDark ? 'text-tertiary' : 'text-secondary';

  if (!logo && !name) return null;

  return (
    <div className="flex items-center gap-2 min-w-0">
      {logo ? (
        <div
          className={`relative ${tile} bg-primary flex items-center justify-center overflow-hidden shrink-0`}
        >
          <img
            src={logo}
            alt={`${name || 'brand'} logo`}
            className={`w-full h-full object-contain ${pad}`}
          />
          {dot && (
            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-primary rounded-full ring-2 ring-white" />
          )}
        </div>
      ) : null}
      {name ? (
        <span className={`font-display font-bold truncate min-w-0 ${nameColor} ${textCls}`}>
          {name}
        </span>
      ) : null}
    </div>
  );
}