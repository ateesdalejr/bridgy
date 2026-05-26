import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { PNG } from "pngjs";

type Color = [number, number, number, number];
type Point = [number, number];

const SCALE = 2;
const FRAME = 32;
const FRAMES = 4;
const OUT_DIR = join(import.meta.dir, "..", "landing", "public", "assets");

const palette = {
  outline: hex("#17211d"),
  gray: hex("#98a2b6"),
  light: hex("#d5dbe6"),
  dark: hex("#667085"),
  wing: hex("#78849a"),
  belly: hex("#fffef9"),
  beak: hex("#f1c76b"),
  foot: hex("#d9796a"),
  eye: hex("#111827"),
  white: hex("#fffef9"),
  transparent: [0, 0, 0, 0] as Color,
};

mkdirSync(OUT_DIR, { recursive: true });

const sheet = new PNG({
  width: FRAME * FRAMES * SCALE,
  height: FRAME * SCALE,
  colorType: 6,
});

clear(sheet);
for (let frame = 0; frame < FRAMES; frame++) drawPidgy(sheet, frame);

writeFileSync(join(OUT_DIR, "pidgy-spritesheet.png"), PNG.sync.write(sheet));
const favicon = PNG.sync.write(cropFrame(sheet, 0));
writeFileSync(join(OUT_DIR, "pidgy-favicon.png"), favicon);
writeFileSync(join(import.meta.dir, "..", "landing", "public", "favicon.png"), favicon);
writeFileSync(join(import.meta.dir, "..", "landing", "public", "favicon.ico"), icoFromPng(favicon, FRAME * SCALE, FRAME * SCALE));

function drawPidgy(png: PNG, frame: number): void {
  const ox = frame * FRAME;
  const hop = frame === 1 ? -1 : 0;

  drawTail(png, ox, hop);

  ellipse(png, ox + 16, 20 + hop, 9, 7, palette.outline);
  ellipse(png, ox + 17, 20 + hop, 7, 5, palette.gray);
  ellipse(png, ox + 18, 22 + hop, 5, 3, palette.belly);

  wing(png, ox, hop, frame);

  ellipse(png, ox + 22, 13 + hop, 6, 6, palette.outline);
  ellipse(png, ox + 22, 13 + hop, 4, 4, palette.light);
  rect(png, ox + 19, 9 + hop, 5, 2, palette.belly);
  drawEye(png, ox + 23, 12 + hop);

  polygon(png, [
    [ox + 26, 13 + hop],
    [ox + 31, 15 + hop],
    [ox + 26, 17 + hop],
  ], palette.outline);
  polygon(png, [
    [ox + 27, 14 + hop],
    [ox + 30, 15 + hop],
    [ox + 27, 16 + hop],
  ], palette.beak);

  rect(png, ox + 15, 27 + hop, 2, 2, palette.outline);
  rect(png, ox + 20, 27 + hop, 2, 2, palette.outline);
  rect(png, ox + 13, 29 + hop, 5, 2, palette.foot);
  rect(png, ox + 19, 29 + hop, 5, 2, palette.foot);
}

function wing(png: PNG, ox: number, hop: number, frame: number): void {
  if (frame === 1) {
    polygon(png, [
      [ox + 15, 18 + hop],
      [ox + 18, 6 + hop],
      [ox + 23, 9 + hop],
      [ox + 21, 19 + hop],
    ], palette.outline);
    polygon(png, [
      [ox + 16, 17 + hop],
      [ox + 19, 8 + hop],
      [ox + 22, 10 + hop],
      [ox + 20, 18 + hop],
    ], palette.wing);
  } else if (frame === 2) {
    polygon(png, [
      [ox + 14, 18 + hop],
      [ox + 8, 11 + hop],
      [ox + 13, 9 + hop],
      [ox + 22, 18 + hop],
    ], palette.outline);
    polygon(png, [
      [ox + 14, 17 + hop],
      [ox + 10, 12 + hop],
      [ox + 13, 11 + hop],
      [ox + 20, 18 + hop],
    ], palette.wing);
  } else if (frame === 3) {
    polygon(png, [
      [ox + 13, 19 + hop],
      [ox + 9, 26 + hop],
      [ox + 16, 27 + hop],
      [ox + 22, 20 + hop],
    ], palette.outline);
    polygon(png, [
      [ox + 14, 20 + hop],
      [ox + 11, 25 + hop],
      [ox + 16, 25 + hop],
      [ox + 20, 20 + hop],
    ], palette.wing);
  } else {
    polygon(png, [
      [ox + 12, 18 + hop],
      [ox + 20, 19 + hop],
      [ox + 18, 25 + hop],
      [ox + 11, 23 + hop],
    ], palette.outline);
    polygon(png, [
      [ox + 13, 19 + hop],
      [ox + 19, 20 + hop],
      [ox + 17, 23 + hop],
      [ox + 12, 22 + hop],
    ], palette.wing);
  }
}

function drawTail(png: PNG, ox: number, hop: number): void {
  polygon(png, [
    [ox + 8, 18 + hop],
    [ox + 2, 15 + hop],
    [ox + 4, 23 + hop],
    [ox + 10, 22 + hop],
  ], palette.outline);
  polygon(png, [
    [ox + 8, 19 + hop],
    [ox + 4, 17 + hop],
    [ox + 5, 21 + hop],
    [ox + 10, 21 + hop],
  ], palette.dark);
}

function drawEye(png: PNG, x: number, y: number): void {
  rect(png, x, y, 2, 2, palette.eye);
  px(png, x, y, palette.white);
}

function rect(png: PNG, x: number, y: number, w: number, h: number, color: Color): void {
  for (let yy = y; yy < y + h; yy++) {
    for (let xx = x; xx < x + w; xx++) px(png, xx, yy, color);
  }
}

function ellipse(png: PNG, cx: number, cy: number, rx: number, ry: number, color: Color): void {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      if (((x - cx) ** 2) / (rx ** 2) + ((y - cy) ** 2) / (ry ** 2) <= 1) px(png, x, y, color);
    }
  }
}

function polygon(png: PNG, points: Point[], color: Color): void {
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  for (let y = Math.min(...ys); y <= Math.max(...ys); y++) {
    for (let x = Math.min(...xs); x <= Math.max(...xs); x++) {
      if (inside([x + 0.5, y + 0.5], points)) px(png, x, y, color);
    }
  }
}

function inside(point: Point, polygonPoints: Point[]): boolean {
  const [px, py] = point;
  let isInside = false;
  for (let i = 0, j = polygonPoints.length - 1; i < polygonPoints.length; j = i++) {
    const [xi, yi] = polygonPoints[i];
    const [xj, yj] = polygonPoints[j];
    const intersects = yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi;
    if (intersects) isInside = !isInside;
  }
  return isInside;
}

function px(png: PNG, x: number, y: number, color: Color): void {
  if (x < 0 || y < 0 || x >= png.width / SCALE || y >= png.height / SCALE) return;
  for (let yy = 0; yy < SCALE; yy++) {
    for (let xx = 0; xx < SCALE; xx++) {
      const realX = x * SCALE + xx;
      const realY = y * SCALE + yy;
      const index = (realY * png.width + realX) * 4;
      png.data[index] = color[0];
      png.data[index + 1] = color[1];
      png.data[index + 2] = color[2];
      png.data[index + 3] = color[3];
    }
  }
}

function clear(png: PNG): void {
  for (let i = 0; i < png.data.length; i += 4) {
    png.data[i] = 0;
    png.data[i + 1] = 0;
    png.data[i + 2] = 0;
    png.data[i + 3] = 0;
  }
}

function cropFrame(sheetPng: PNG, frame: number): PNG {
  const out = new PNG({ width: FRAME * SCALE, height: FRAME * SCALE, colorType: 6 });
  for (let y = 0; y < out.height; y++) {
    for (let x = 0; x < out.width; x++) {
      const sourceX = frame * FRAME * SCALE + x;
      const sourceIndex = (y * sheetPng.width + sourceX) * 4;
      const outIndex = (y * out.width + x) * 4;
      out.data[outIndex] = sheetPng.data[sourceIndex];
      out.data[outIndex + 1] = sheetPng.data[sourceIndex + 1];
      out.data[outIndex + 2] = sheetPng.data[sourceIndex + 2];
      out.data[outIndex + 3] = sheetPng.data[sourceIndex + 3];
    }
  }
  return out;
}

function hex(value: string): Color {
  const normalized = value.replace("#", "");
  return [
    Number.parseInt(normalized.slice(0, 2), 16),
    Number.parseInt(normalized.slice(2, 4), 16),
    Number.parseInt(normalized.slice(4, 6), 16),
    255,
  ];
}

function icoFromPng(pngBytes: Buffer, width: number, height: number): Buffer {
  const headerSize = 6;
  const directorySize = 16;
  const icon = Buffer.alloc(headerSize + directorySize + pngBytes.length);

  icon.writeUInt16LE(0, 0);
  icon.writeUInt16LE(1, 2);
  icon.writeUInt16LE(1, 4);
  icon.writeUInt8(width >= 256 ? 0 : width, 6);
  icon.writeUInt8(height >= 256 ? 0 : height, 7);
  icon.writeUInt8(0, 8);
  icon.writeUInt8(0, 9);
  icon.writeUInt16LE(1, 10);
  icon.writeUInt16LE(32, 12);
  icon.writeUInt32LE(pngBytes.length, 14);
  icon.writeUInt32LE(headerSize + directorySize, 18);
  pngBytes.copy(icon, headerSize + directorySize);

  return icon;
}
