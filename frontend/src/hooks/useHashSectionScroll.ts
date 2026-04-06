import { useEffect } from "react";
import { useLocation } from "react-router-dom";

const RETRY_DELAY_MS = 90;
const MAX_RETRIES = 12;
const EXTRA_OFFSET = 24;

function getScrollOffset() {
  const nav = document.querySelector(".workspace-nav") as HTMLElement | null;
  return (nav?.offsetHeight || 74) + EXTRA_OFFSET;
}

export function scrollToHashSection(sectionId: string, behavior: ScrollBehavior = "smooth") {
  if (typeof window === "undefined" || typeof document === "undefined" || !sectionId) {
    return false;
  }

  const target = document.getElementById(sectionId);
  if (!target) {
    return false;
  }

  const top = window.scrollY + target.getBoundingClientRect().top - getScrollOffset();
  window.scrollTo({
    top: Math.max(0, top),
    behavior,
  });
  return true;
}

export function useHashSectionScroll() {
  const location = useLocation();

  useEffect(() => {
    const sectionId = decodeURIComponent(location.hash.replace(/^#/, ""));
    if (!sectionId) {
      return;
    }

    let cancelled = false;
    let retries = 0;
    let timer = 0;

    const tryScroll = () => {
      if (cancelled) {
        return;
      }

      if (scrollToHashSection(sectionId)) {
        return;
      }

      if (retries >= MAX_RETRIES) {
        return;
      }

      retries += 1;
      timer = window.setTimeout(tryScroll, RETRY_DELAY_MS);
    };

    tryScroll();

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [location.hash, location.pathname]);
}
