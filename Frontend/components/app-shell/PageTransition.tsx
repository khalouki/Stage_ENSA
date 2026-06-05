"use client";
import { useState, useEffect, useCallback, Suspense } from "react";
import { usePathname, useSearchParams } from "next/navigation";

// Global trigger — call this before any navigation
let triggerLoading: (() => void) | null = null;

export function usePageTransition() {
  return useCallback(() => { triggerLoading?.(); }, []);
}

// Inner component that uses useSearchParams — must live inside <Suspense>
function PageTransitionInner() {
  const [loading, setLoading] = useState(false);
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    triggerLoading = () => setLoading(true);
    return () => { triggerLoading = null; };
  }, []);

  // Stop the overlay as soon as the route (path or query) has changed
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(false);
  }, [pathname, searchParams]);

  if (!loading) return null;

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9999,
      background: "rgba(0,0,0,0.55)",
      backdropFilter: "blur(6px)",
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <div style={{
        width: 48, height: 48, borderRadius: "50%",
        border: "4px solid rgba(255,255,255,0.15)",
        borderTop: "4px solid #ffffff",
        animation: "spin 0.75s linear infinite",
      }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// Public export — wraps the inner component in Suspense so that
// useSearchParams() never causes an "invalid hook call" during SSR/hydration.
export default function PageTransition() {
  return (
    <Suspense fallback={null}>
      <PageTransitionInner />
    </Suspense>
  );
}
