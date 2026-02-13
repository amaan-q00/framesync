'use client';

import React, { useRef, useEffect, useState, useCallback } from 'react';
import type { DrawingStrokePayload } from '@/types/watch';
import type { Comment } from '@/types/video';

const DEFAULT_STROKE_COLOR = '#FF0000';
const STROKE_WIDTH = 3;

export interface DrawingCanvasProps {
  /** Canvas fills this container; draw only when enabled (live lock or marker mode) */
  iHaveLock: boolean;
  /** When true, user is adding a marker: canvas collects strokes locally, no socket */
  markerModeActive?: boolean;
  /** Strokes collected during marker mode (controlled by parent) */
  markerStrokes?: Array<{ points: Array<{ x: number; y: number }>; color: string; width: number }>;
  /** In-progress marker segments for preview (show strokes when currentTime is in segment range) */
  markerPreviewSegments?: Array<{ startTime: number; endTime: number; strokes: Array<{ points: Array<{ x: number; y: number }>; color: string; width: number }> }>;
  strokeColor?: string;
  remoteStrokes: DrawingStrokePayload[];
  /** Comments with type shape or marker to render when in frame range */
  shapeComments: Comment[];
  currentFrame: number;
  /** Current time in seconds (for visibility; drawings stay at least 1s) */
  currentTime: number;
  /** Video FPS (used to enforce min 1s visibility for legacy comments) */
  fps: number;
  onStroke: (stroke: { points: Array<{ x: number; y: number }>; color: string; width: number }) => void;
  onMarkerStroke?: (stroke: { points: Array<{ x: number; y: number }>; color: string; width: number }) => void;
  onSaveDrawing?: (strokes: Array<{ points: Array<{ x: number; y: number }>; color: string; width: number }>) => void;
  className?: string;
}

export function DrawingCanvas({
  iHaveLock,
  markerModeActive = false,
  markerStrokes = [],
  markerPreviewSegments = [],
  strokeColor = DEFAULT_STROKE_COLOR,
  remoteStrokes,
  shapeComments,
  currentFrame,
  currentTime = 0,
  fps = 24,
  onStroke,
  onMarkerStroke,
  onSaveDrawing,
  className = '',
}: DrawingCanvasProps): React.ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [sessionStrokes, setSessionStrokes] = useState<
    Array<{ points: Array<{ x: number; y: number }>; color: string; width: number }>
  >([]);
  const drawingRef = useRef(false);
  const currentPointsRef = useRef<Array<{ x: number; y: number }>>([]);

  const canDraw = iHaveLock || markerModeActive;

  const getNorm = useCallback((e: React.PointerEvent | PointerEvent) => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return { x: 0, y: 0 };
    const rect = container.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    return { x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)) };
  }, []);

  const drawStrokesToCtx = useCallback(
    (ctx: CanvasRenderingContext2D, strokes: Array<{ points: Array<{ x: number; y: number }>; color: string; width: number }>) => {
      strokes.forEach((s) => {
        if (s.points.length < 2) return;
        ctx.strokeStyle = s.color;
        ctx.lineWidth = s.width;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(s.points[0].x * ctx.canvas.width, s.points[0].y * ctx.canvas.height);
        s.points.slice(1).forEach((p) => {
          ctx.lineTo(p.x * ctx.canvas.width, p.y * ctx.canvas.height);
        });
        ctx.stroke();
      });
    },
    []
  );

  // Resize canvas to match container
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const ro = new ResizeObserver(() => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  type VectorStroke = { points: Array<{ x: number; y: number }>; color: string; width: number };
  const isSegmentData = (d: unknown): d is { segments: unknown[] } =>
    d != null && typeof d === 'object' && 'segments' in d && Array.isArray((d as { segments: unknown }).segments);

  // Normalize segment from API (camelCase or snake_case) to { startTime, endTime, strokes }
  const normalizeSegment = (seg: unknown): { startTime: number; endTime: number; strokes: VectorStroke[] } | null => {
    if (!seg || typeof seg !== 'object') return null;
    const s = seg as Record<string, unknown>;
    const startTime = (s.startTime ?? s.start_time) as number;
    const endTime = (s.endTime ?? s.end_time) as number;
    const strokes = (s.strokes ?? []) as VectorStroke[];
    if (!Number.isFinite(startTime) || !Number.isFinite(endTime) || !Array.isArray(strokes)) return null;
    return { startTime, endTime, strokes };
  };

  const getSegmentsFromDrawingData = (d: unknown): Array<{ startTime: number; endTime: number; strokes: VectorStroke[] }> => {
    if (!isSegmentData(d)) return [];
    return (d.segments as unknown[])
      .map(normalizeSegment)
      .filter((x): x is { startTime: number; endTime: number; strokes: VectorStroke[] } => x != null);
  };

  // Visibility: every drawing stays at least 1 second (or its duration if longer)
  const minDurationSec = 1;
  const visibleShapes = shapeComments.filter((c) => {
    if ((c.type !== 'shape' && c.type !== 'marker') || !c.drawing_data) return false;
    if (isSegmentData(c.drawing_data)) {
      const segments = getSegmentsFromDrawingData(c.drawing_data);
      return segments.some((seg) => {
        const end = Math.max(seg.endTime, seg.startTime + minDurationSec);
        return currentTime >= seg.startTime && currentTime <= end;
      });
    }
    const start = c.timestamp;
    const durationSec = Math.max(((c.duration_frames ?? 0) / fps) || 0, minDurationSec);
    const end = start + durationSec;
    return currentTime >= start && currentTime <= end;
  });

  const strokesFromComment = (c: Comment): VectorStroke[] => {
    const d = c.drawing_data;
    if (!d) return [];
    if (isSegmentData(d)) {
      const segments = getSegmentsFromDrawingData(d);
      return segments
        .filter((seg) => {
          const end = Math.max(seg.endTime, seg.startTime + minDurationSec);
          return currentTime >= seg.startTime && currentTime <= end;
        })
        .flatMap((seg) => seg.strokes);
    }
    return (d as VectorStroke[]);
  };

  const previewStrokes = markerPreviewSegments.filter((seg) => {
    const end = Math.max(seg.endTime, seg.startTime + minDurationSec);
    return currentTime >= seg.startTime && currentTime <= end;
  }).flatMap((seg) => seg.strokes);

  const allStrokesToDraw = [
    ...visibleShapes.flatMap(strokesFromComment),
    ...previewStrokes,
    ...remoteStrokes.map((s) => ({ points: s.points, color: s.color, width: s.width })),
    ...sessionStrokes,
    ...(markerModeActive ? markerStrokes : []),
  ];

  // Redraw when strokes or size change
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawStrokesToCtx(ctx, allStrokesToDraw);
  }, [allStrokesToDraw, drawStrokesToCtx]);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!canDraw) return;
      e.preventDefault();
      drawingRef.current = true;
      const p = getNorm(e);
      currentPointsRef.current = [p];
    },
    [canDraw, getNorm]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!canDraw || !drawingRef.current) return;
      const p = getNorm(e);
      currentPointsRef.current.push(p);
      // Live preview: redraw with current stroke
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          drawStrokesToCtx(ctx, allStrokesToDraw);
          const pts = currentPointsRef.current;
          if (pts.length >= 2) {
            ctx.strokeStyle = strokeColor;
            ctx.lineWidth = STROKE_WIDTH;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.beginPath();
            ctx.moveTo(pts[0].x * canvas.width, pts[0].y * canvas.height);
            pts.slice(1).forEach((p) => ctx.lineTo(p.x * canvas.width, p.y * canvas.height));
            ctx.stroke();
          }
        }
      }
    },
    [canDraw, strokeColor, getNorm, allStrokesToDraw, drawStrokesToCtx]
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!canDraw) return;
      if (drawingRef.current) {
        drawingRef.current = false;
        const pts = [...currentPointsRef.current];
        if (pts.length >= 2) {
          const stroke = { points: pts, color: strokeColor, width: STROKE_WIDTH };
          if (markerModeActive) {
            onMarkerStroke?.(stroke);
          } else {
            onStroke(stroke);
            setSessionStrokes((prev) => [...prev, stroke]);
          }
        }
      }
    },
    [canDraw, markerModeActive, strokeColor, onStroke, onMarkerStroke]
  );

  const handlePointerLeave = useCallback(() => {
    if (drawingRef.current) {
      drawingRef.current = false;
      const pts = [...currentPointsRef.current];
      if (pts.length >= 2) {
        const stroke = { points: pts, color: strokeColor, width: STROKE_WIDTH };
        if (markerModeActive) {
          onMarkerStroke?.(stroke);
        } else {
          onStroke(stroke);
          setSessionStrokes((prev) => [...prev, stroke]);
        }
      }
    }
  }, [markerModeActive, strokeColor, onStroke, onMarkerStroke]);

  const handleSaveDrawing = useCallback(() => {
    if (sessionStrokes.length === 0) return;
    onSaveDrawing?.(sessionStrokes);
    setSessionStrokes([]);
  }, [sessionStrokes, onSaveDrawing]);

  return (
    <div
      ref={containerRef}
      className={`absolute inset-0 touch-none ${className}`}
      style={{ pointerEvents: canDraw ? 'auto' : 'none' }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerLeave}
    >
      <canvas
        ref={canvasRef}
        className="w-full h-full block"
        style={{ width: '100%', height: '100%' }}
      />
      {remoteStrokes.length > 0 && !iHaveLock && !markerModeActive && (
        <div className="absolute top-2 left-2 rounded px-2 py-1 text-xs bg-amber-500/90 text-black font-medium">
          Live drawing
        </div>
      )}
      {markerModeActive && (
        <div className="absolute top-2 left-2 rounded px-2 py-1 text-xs bg-blue-600 text-white font-medium">
          Adding marker — draw on video, then add label and click End marker
        </div>
      )}
      {iHaveLock && !markerModeActive && sessionStrokes.length > 0 && onSaveDrawing && (
        <div className="absolute bottom-2 left-2">
          <button
            type="button"
            onClick={handleSaveDrawing}
            className="rounded px-2 py-1 text-xs bg-blue-600 text-white hover:bg-blue-500"
          >
            Save drawing
          </button>
        </div>
      )}
    </div>
  );
}
