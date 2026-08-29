import darkMark from '../assets/starlims-devtools-mark-black.svg';
import lightMark from '../assets/starlims-devtools-mark-white.svg';

interface AppBrandIconProps {
  className?: string;
}

export function AppBrandIcon({ className = 'h-9 w-9' }: AppBrandIconProps) {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center bg-transparent p-0.5 ${className}`}
      title="STARLIMS DevTools"
    >
      <img
        src={darkMark}
        alt=""
        aria-hidden="true"
        className="h-full w-full object-contain dark:hidden"
      />
      <img
        src={lightMark}
        alt=""
        aria-hidden="true"
        className="hidden h-full w-full object-contain dark:block"
      />
    </span>
  );
}
