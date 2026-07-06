'use client';
import { usePathname } from 'next/navigation';

// Keying a div on the pathname forces React to swap in a fresh DOM node on
// every navigation, which replays the CSS entry animation — a lightweight,
// dependency-free page-transition without needing a router-level API.
export default function PageTransition({ children }) {
  const pathname = usePathname();
  return (
    <div key={pathname} className="page-transition">
      {children}
    </div>
  );
}
