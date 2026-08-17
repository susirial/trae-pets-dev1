export const PET_DRAG_THRESHOLD_PX = 8;

export function pointerDistance(
  start: { x: number; y: number },
  current: { x: number; y: number },
): number {
  return Math.hypot(current.x - start.x, current.y - start.y);
}

export function isPetDrag(
  start: { x: number; y: number },
  current: { x: number; y: number },
  threshold = PET_DRAG_THRESHOLD_PX,
): boolean {
  return pointerDistance(start, current) >= threshold;
}

export function shouldTriggerPetClick(dragging: boolean, canceled: boolean): boolean {
  return !dragging && !canceled;
}
