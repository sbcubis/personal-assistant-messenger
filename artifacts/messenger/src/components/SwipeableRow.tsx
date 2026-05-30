import { useRef, useState, useCallback, type ReactNode } from "react";

interface Action {
  label: string;
  icon: ReactNode;
  color: string;       // bg color class
  textColor?: string;
  onTrigger: () => void;
}

interface SwipeableRowProps {
  children: ReactNode;
  leftActions?: Action[];   // revealed on swipe right
  rightActions?: Action[];  // revealed on swipe left
  onLongPress?: () => void;
  onClick?: () => void;
}

const ACTION_WIDTH = 72;
const LONG_PRESS_MS = 480;
const SWIPE_THRESHOLD = 40;

export function SwipeableRow({
  children,
  leftActions = [],
  rightActions = [],
  onLongPress,
  onClick,
}: SwipeableRowProps) {
  const [offset, setOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isRevealed, setIsRevealed] = useState<"left" | "right" | null>(null);

  const startX = useRef(0);
  const startY = useRef(0);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didLongPress = useRef(false);
  const didDrag = useRef(false);
  const rowRef = useRef<HTMLDivElement>(null);

  const maxRight = rightActions.length * ACTION_WIDTH;
  const maxLeft = leftActions.length * ACTION_WIDTH;

  const snapTo = useCallback((target: number) => {
    setOffset(target);
    if (target === 0) setIsRevealed(null);
    else if (target < 0) setIsRevealed("right");
    else setIsRevealed("left");
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    startX.current = e.clientX;
    startY.current = e.clientY;
    didLongPress.current = false;
    didDrag.current = false;

    longPressTimer.current = setTimeout(() => {
      didLongPress.current = true;
      onLongPress?.();
    }, LONG_PRESS_MS);
  }, [onLongPress]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    const dx = e.clientX - startX.current;
    const dy = e.clientY - startY.current;

    if (!didDrag.current && Math.abs(dy) > Math.abs(dx)) return; // vertical scroll

    if (Math.abs(dx) > 6) {
      didDrag.current = true;
      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current);
        longPressTimer.current = null;
      }
    }

    if (!didDrag.current) return;
    setIsDragging(true);

    let newOffset = offset + dx - (isDragging ? 0 : 0);
    // Clamp with rubber-band effect
    if (newOffset < -maxRight) newOffset = -maxRight - (newOffset + maxRight) * 0.3;
    if (newOffset > maxLeft) newOffset = maxLeft + (newOffset - maxLeft) * 0.3;
    setOffset(dx + (isRevealed === "right" ? -maxRight : isRevealed === "left" ? maxLeft : 0));
  }, [offset, isDragging, isRevealed, maxRight, maxLeft]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }

    setIsDragging(false);

    if (!didDrag.current) {
      if (!didLongPress.current) onClick?.();
      return;
    }

    const dx = e.clientX - startX.current;
    const base = isRevealed === "right" ? -maxRight : isRevealed === "left" ? maxLeft : 0;
    const delta = dx;

    // Swipe right from closed/right-revealed → reveal left actions OR close
    if (rightActions.length > 0 && base - delta > SWIPE_THRESHOLD) {
      snapTo(-maxRight);
    } else if (leftActions.length > 0 && delta - base > SWIPE_THRESHOLD) {
      snapTo(maxLeft);
    } else {
      snapTo(0);
    }
  }, [isRevealed, maxRight, maxLeft, leftActions, rightActions, onClick, snapTo]);

  const close = useCallback(() => snapTo(0), [snapTo]);

  return (
    <div className="relative overflow-hidden select-none" style={{ touchAction: "pan-y" }}>
      {/* Right action buttons (swipe left to reveal) */}
      {rightActions.length > 0 && (
        <div className="absolute inset-y-0 right-0 flex">
          {rightActions.map((action, i) => (
            <button
              key={i}
              className={`flex flex-col items-center justify-center gap-1 w-[72px] text-white text-[11px] font-medium ${action.color}`}
              onClick={(e) => { e.stopPropagation(); close(); action.onTrigger(); }}
            >
              {action.icon}
              <span>{action.label}</span>
            </button>
          ))}
        </div>
      )}

      {/* Left action buttons (swipe right to reveal) */}
      {leftActions.length > 0 && (
        <div className="absolute inset-y-0 left-0 flex">
          {leftActions.map((action, i) => (
            <button
              key={i}
              className={`flex flex-col items-center justify-center gap-1 w-[72px] text-white text-[11px] font-medium ${action.color}`}
              onClick={(e) => { e.stopPropagation(); close(); action.onTrigger(); }}
            >
              {action.icon}
              <span>{action.label}</span>
            </button>
          ))}
        </div>
      )}

      {/* Draggable row */}
      <div
        ref={rowRef}
        style={{
          transform: `translateX(${offset}px)`,
          transition: isDragging ? "none" : "transform 0.25s cubic-bezier(0.25, 0.46, 0.45, 0.94)",
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        {children}
      </div>
    </div>
  );
}
