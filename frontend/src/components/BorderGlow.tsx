import { CSSProperties, ElementType, HTMLAttributes, ReactNode, createElement, useEffect, useRef } from "react";

type BorderGlowProps = HTMLAttributes<HTMLElement> & {
  as?: ElementType;
  children: ReactNode;
  glowColor?: string;
  colors?: [string, string, string] | string[];
};

const DEFAULT_COLORS = ["#d7e8ff", "#b9d3f3", "#7eb5ff"];
const DEFAULT_GLOW = "hsl(210 82% 76%)";

export function BorderGlow({
  as = "div",
  children,
  className,
  glowColor = DEFAULT_GLOW,
  colors = DEFAULT_COLORS,
  style,
  ...rest
}: BorderGlowProps) {
  const elementRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (elementRef.current === null) {
      return;
    }
    const current = elementRef.current;

    let frame = 0;
    const threshold = 220;

    function updateGlow(clientX: number, clientY: number) {
      const rect = current.getBoundingClientRect();
      const dx = clientX - (rect.left + rect.width / 2);
      const dy = clientY - (rect.top + rect.height / 2);
      const angle = `${Math.atan2(dy, dx)}rad`;

      const nearestX = Math.max(rect.left, Math.min(clientX, rect.right));
      const nearestY = Math.max(rect.top, Math.min(clientY, rect.bottom));
      const edgeDistance = Math.hypot(clientX - nearestX, clientY - nearestY);
      const normalizedDistance = Math.max(0, 1 - edgeDistance / threshold);

      const localX = ((clientX - rect.left) / rect.width) * 100;
      const localY = ((clientY - rect.top) / rect.height) * 100;

      current.style.setProperty("--cursor-angle", angle);
      current.style.setProperty("--edge-proximity", normalizedDistance.toFixed(4));
      current.style.setProperty("--pointer-x", `${Math.max(-12, Math.min(112, localX)).toFixed(2)}%`);
      current.style.setProperty("--pointer-y", `${Math.max(-12, Math.min(112, localY)).toFixed(2)}%`);
    }

    function resetGlow() {
      current.style.setProperty("--edge-proximity", "0");
      current.style.setProperty("--pointer-x", "50%");
      current.style.setProperty("--pointer-y", "50%");
    }

    function handlePointerMove(event: PointerEvent) {
      cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => updateGlow(event.clientX, event.clientY));
    }

    function handlePointerLeave() {
      cancelAnimationFrame(frame);
      resetGlow();
    }

    resetGlow();
    window.addEventListener("pointermove", handlePointerMove, { passive: true });
    window.addEventListener("pointerleave", handlePointerLeave);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerleave", handlePointerLeave);
    };
  }, []);

  const mergedStyle = {
    ...style,
    "--glow-color": glowColor,
    "--glow-accent-1": colors[0] || DEFAULT_COLORS[0],
    "--glow-accent-2": colors[1] || DEFAULT_COLORS[1],
    "--glow-accent-3": colors[2] || DEFAULT_COLORS[2],
  } as CSSProperties;

  return createElement(
    as,
    {
      ...rest,
      ref: elementRef,
      className: ["border-glow", className].filter(Boolean).join(" "),
      style: mergedStyle,
    },
    <span aria-hidden="true" className="edge-light" />,
    children,
  );
}
