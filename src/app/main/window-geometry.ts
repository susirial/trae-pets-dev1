export interface Rectangle {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

/** Clamp a window's top-left so as much as possible remains inside a work area. */
export function clampWindowPosition(
  position: Point,
  size: Pick<Rectangle, 'width' | 'height'>,
  workArea: Rectangle,
): Point {
  const maxX = Math.max(workArea.x, workArea.x + workArea.width - size.width);
  const maxY = Math.max(workArea.y, workArea.y + workArea.height - size.height);
  return {
    x: Math.min(maxX, Math.max(workArea.x, Math.round(position.x))),
    y: Math.min(maxY, Math.max(workArea.y, Math.round(position.y))),
  };
}

/** Resize around the bottom-center anchor used by the desktop pet. */
export function bottomCenterAnchoredPosition(
  previous: Rectangle,
  nextSize: Pick<Rectangle, 'width' | 'height'>,
  workArea: Rectangle,
): Point {
  return clampWindowPosition({
    x: previous.x + previous.width / 2 - nextSize.width / 2,
    y: previous.y + previous.height - nextSize.height,
  }, nextSize, workArea);
}
