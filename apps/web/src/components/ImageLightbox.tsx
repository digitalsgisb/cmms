import { ArrowLeft, Minus, Plus, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState, type PointerEvent } from "react";
import { createPortal } from "react-dom";

interface ImageLightboxProps {
  src: string;
  alt: string;
  label?: string;
  onClose: () => void;
}

export function ImageLightbox({ src, alt, label, onClose }: ImageLightboxProps) {
  const [zoom, setZoom] = useState({ scale: 1, x: 0, y: 0 });
  const zoomRef = useRef(zoom);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ distance: number; scale: number; x: number; y: number; centerX: number; centerY: number } | null>(null);
  const pan = useRef<{ startX: number; startY: number; x: number; y: number } | null>(null);

  function updateZoom(next: { scale: number; x: number; y: number }) {
    zoomRef.current = next;
    setZoom(next);
  }

  function changeScale(nextScale: number) {
    const scale = Math.max(1, Math.min(5, nextScale));
    updateZoom(scale === 1 ? { scale: 1, x: 0, y: 0 } : { ...zoomRef.current, scale });
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const points = [...pointers.current.values()];
    if (points.length === 2) {
      const [a, b] = points;
      gesture.current = {
        distance: Math.hypot(a.x - b.x, a.y - b.y), scale: zoomRef.current.scale,
        x: zoomRef.current.x, y: zoomRef.current.y,
        centerX: (a.x + b.x) / 2, centerY: (a.y + b.y) / 2
      };
      pan.current = null;
    } else if (points.length === 1) {
      pan.current = { startX: event.clientX, startY: event.clientY, x: zoomRef.current.x, y: zoomRef.current.y };
    }
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const points = [...pointers.current.values()];
    if (points.length === 2 && gesture.current) {
      const [a, b] = points;
      const scale = Math.max(1, Math.min(5, gesture.current.scale * Math.hypot(a.x - b.x, a.y - b.y) / Math.max(1, gesture.current.distance)));
      updateZoom(scale === 1 ? { scale: 1, x: 0, y: 0 } : {
        scale, x: gesture.current.x + (a.x + b.x) / 2 - gesture.current.centerX,
        y: gesture.current.y + (a.y + b.y) / 2 - gesture.current.centerY
      });
    } else if (points.length === 1 && pan.current && zoomRef.current.scale > 1) {
      updateZoom({ ...zoomRef.current, x: pan.current.x + event.clientX - pan.current.startX, y: pan.current.y + event.clientY - pan.current.startY });
    }
  }

  function onPointerUp(event: PointerEvent<HTMLDivElement>) {
    pointers.current.delete(event.pointerId);
    gesture.current = null;
    const remaining = [...pointers.current.values()][0];
    pan.current = remaining ? { startX: remaining.x, startY: remaining.y, x: zoomRef.current.x, y: zoomRef.current.y } : null;
  }

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const originalOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "Tab") { event.preventDefault(); document.querySelector<HTMLButtonElement>(".image-lightbox-close")?.focus(); }
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = originalOverflow;
      previousFocus?.focus();
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  return createPortal(
    <div className="image-lightbox" role="dialog" aria-modal="true" aria-label={label || alt} onClick={onClose}>
      <button type="button" className="image-lightbox-close" onClick={onClose} aria-label="Close photo viewer" autoFocus>
        <ArrowLeft size={21} />
        <span>Back</span>
      </button>
      <div className="image-lightbox-stage" onClick={(event) => event.stopPropagation()}
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
        onDoubleClick={() => changeScale(zoomRef.current.scale > 1 ? 1 : 2)}>
        <figure style={{ transform: `translate(${zoom.x}px, ${zoom.y}px) scale(${zoom.scale})` }}>
          <img src={src} alt={alt} draggable={false} />
          {label ? <figcaption>{label}</figcaption> : null}
        </figure>
      </div>
      <div className="image-lightbox-zoom" onClick={(event) => event.stopPropagation()} aria-label="Photo zoom controls">
        <button type="button" onClick={() => changeScale(zoomRef.current.scale - 0.5)} aria-label="Zoom out" disabled={zoom.scale === 1}><Minus size={18} /></button>
        <span>{Math.round(zoom.scale * 100)}%</span>
        <button type="button" onClick={() => changeScale(zoomRef.current.scale + 0.5)} aria-label="Zoom in" disabled={zoom.scale === 5}><Plus size={18} /></button>
        <button type="button" onClick={() => changeScale(1)} aria-label="Reset zoom" disabled={zoom.scale === 1}><RotateCcw size={17} /></button>
      </div>
    </div>,
    document.body
  );
}
