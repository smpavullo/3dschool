// The Laboratorio plugin's shapes: every edge profile and every joint is a closed outline drawn on
// one face of a board and pushed into the wood, so what is checked here is the outline: that it
// lies on the face, inside the board, and has the sizes the panel promises.
import { describe, expect, it } from "vitest";
// @ts-expect-error the plugin's sources are checked JavaScript with no declarations of their own
import { PROFILES, edgePlan, profileName, profileShape } from "../../plugins/laboratorio/lib/edges.js";
// @ts-expect-error as above
import { DOVETAIL_SLOPE, JOINT_DEFAULTS, JOINT_LABELS, KINDS, faceInfo, plan } from "../../plugins/laboratorio/lib/joints.js";

type Vec3 = [number, number, number];
type Plan = { cuts: Vec3[][]; depth: number; note: string };

/** Twice the signed area of an outline in the (x, y) of the profile's own frame. */
function area2(pts: [number, number][]): number {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[(i + 1) % pts.length];
    s += x0 * y1 - x1 * y0;
  }
  return s;
}

/** A board 400 x 90 x 18 mm, lying along x. */
const BOARD = { min: [0, 0, 0] as Vec3, max: [0.4, 0.09, 0.018] as Vec3 };
const FACES = [
  { id: 1, normal: [-1, 0, 0] as Vec3, origin: [0, 0, 0] as Vec3 },
  { id: 2, normal: [1, 0, 0] as Vec3, origin: [0.4, 0, 0] as Vec3 },
  { id: 3, normal: [0, -1, 0] as Vec3, origin: [0, 0, 0] as Vec3 },
  { id: 4, normal: [0, 1, 0] as Vec3, origin: [0, 0.09, 0] as Vec3 },
  { id: 5, normal: [0, 0, -1] as Vec3, origin: [0, 0, 0] as Vec3 },
  { id: 6, normal: [0, 0, 1] as Vec3, origin: [0, 0, 0.018] as Vec3 },
];
const face = (id: number) => faceInfo(7, id, BOARD, FACES.find((f) => f.id === id)!);

describe("edge profiles", () => {
  it("are eight, each with a name and a simple outline inside twice the size", () => {
    expect(PROFILES.map((p: { value: string }) => p.value)).toEqual(["smusso", "arrotondato", "cavetto", "bisello", "battuta", "scanalatura", "gola", "toro"]);
    for (const p of PROFILES) {
      const shape: [number, number][] = profileShape(p.value, 0.004);
      expect(shape.length, p.value).toBeGreaterThanOrEqual(3);
      // Counter-clockwise and not empty: a real region of wood to take away.
      expect(area2(shape), p.value).toBeGreaterThan(1e-9);
      for (const [x, y] of shape) {
        expect(x, p.value).toBeGreaterThanOrEqual(-1e-12);
        expect(y, p.value).toBeGreaterThanOrEqual(-1e-12);
        expect(x, p.value).toBeLessThanOrEqual(0.008 + 1e-12);
        expect(y, p.value).toBeLessThanOrEqual(0.008 + 1e-12);
      }
      // No point twice in a row (a zero-length side would not draw).
      shape.forEach(([x, y], i) => {
        const [nx, ny] = shape[(i + 1) % shape.length];
        expect(Math.hypot(nx - x, ny - y), `${p.value} side ${i}`).toBeGreaterThan(1e-7);
      });
      expect(profileName(p.value)).toMatch(/^[a-z]/);
    }
  });

  it("take away the area each profile is known for", () => {
    const s = 0.004;
    const area = (v: string) => area2(profileShape(v, s)) / 2;
    expect(area("smusso")).toBeCloseTo((s * s) / 2, 12);
    expect(area("battuta")).toBeCloseTo(s * s, 12);
    expect(area("scanalatura")).toBeCloseTo((s * s) / 2, 12);
    expect(area("bisello")).toBeCloseTo((s * s * Math.tan(Math.PI / 6)) / 2, 12);
    // The round ones are polygons of eight sides per quarter turn: within 2% of the true area.
    expect(area("cavetto") / ((Math.PI * s * s) / 4)).toBeGreaterThan(0.98);
    expect(area("arrotondato") / (s * s * (1 - Math.PI / 4))).toBeLessThan(1.04);
    // The S of the ogee takes away exactly half the square, whatever the number of sides.
    expect(area("gola")).toBeCloseTo((s * s) / 2, 12);
    expect(area("toro")).toBeGreaterThan(area("arrotondato"));
  });

  it("the ogee is smooth where its two arcs meet, and the bead keeps a step on both faces", () => {
    const s = 0.004;
    const gola: [number, number][] = profileShape("gola", s);
    const mid = gola.findIndex(([x, y]) => Math.abs(x - s / 2) < 1e-12 && Math.abs(y - s / 2) < 1e-12);
    expect(mid).toBeGreaterThan(0);
    // Either side of the middle the outline runs nearly straight up: the tangent there is vertical.
    const before = gola[mid - 1];
    const after = gola[mid + 1];
    expect(Math.abs(after[0] - before[0])).toBeLessThan(Math.abs(after[1] - before[1]) / 5);
    const toro: [number, number][] = profileShape("toro", s);
    expect(toro[1]).toEqual([s, 0]);
    expect(toro[2][0]).toBeCloseTo(s, 12);
    expect(toro[2][1]).toBeCloseTo(s * 0.3, 12);
    expect(toro[toro.length - 1]).toEqual([0, s]);
  });

  it("are drawn on the end face at the edge's corner and pushed the edge's length", () => {
    const edge = { a: [0, 0.09, 0.018] as Vec3, b: [0.4, 0.09, 0.018] as Vec3 };
    for (const p of PROFILES) {
      const made = edgePlan(p.value, 0.004, edge, BOARD, FACES);
      expect(typeof made, p.value).toBe("object");
      expect(made.face).toBe(1);
      expect(made.length).toBeCloseTo(0.401, 9);
      for (const [x, y, z] of made.points as Vec3[]) {
        expect(x).toBe(0);
        expect(y).toBeGreaterThanOrEqual(0.09 - 0.008 - 1e-12);
        expect(y).toBeLessThanOrEqual(0.09 + 1e-12);
        expect(z).toBeGreaterThanOrEqual(0.018 - 0.008 - 1e-12);
        expect(z).toBeLessThanOrEqual(0.018 + 1e-12);
      }
    }
    expect(edgePlan("scanalatura", 0.009, edge, BOARD, FACES)).toBe("Il profilo è troppo grande per questo pezzo.");
    expect(edgePlan("gola", 0, edge, BOARD, FACES)).toBe("La misura del profilo deve essere più di zero.");
  });
});

describe("joints", () => {
  it("every kind has its measures' labels and starting sizes", () => {
    expect(KINDS.map((k: { value: string }) => k.value)).toEqual(["scasso", "battuta", "mezzolegno", "dita", "foro", "tenone", "mortasa", "maschio", "femmina", "coda", "perni"]);
    for (const k of KINDS) {
      expect(JOINT_LABELS[k.value], k.value).toBeTruthy();
      expect(JOINT_DEFAULTS[k.value].width, k.value).toBeGreaterThan(0);
    }
  });

  it("a tenon leaves the middle third of the end, as wide as asked", () => {
    const end = face(2);
    const made = plan("tenone", end, [0.4, 0.045, 0.009], { width: 0.05, depth: 0.02 }) as Plan;
    expect(made.note).toBe("tenone");
    expect(made.depth).toBe(0.02);
    expect(made.cuts).toHaveLength(4);
    // The four cuts and the tenon tile the end face: their areas add up to the face less the tenon.
    const cut = made.cuts.reduce((sum, c) => sum + Math.abs(area2(c.map(([, y, z]) => [y, z] as [number, number]))) / 2, 0);
    expect(cut).toBeCloseTo(0.09 * 0.018 - 0.05 * 0.006, 12);
    for (const c of made.cuts) for (const p of c) expect(p[0]).toBe(0.4);
    // As wide as the board: only the two cheeks.
    expect((plan("tenone", end, [0.4, 0.045, 0.009], { width: 0.09, depth: 0.02 }) as Plan).cuts).toHaveLength(2);
    expect(plan("tenone", face(6), [0.2, 0.045, 0.018], { width: 0.05, depth: 0.02 })).toMatch(/testa del pezzo/);
    expect(plan("tenone", end, [0.4, 0.045, 0.009], { width: 0.05, depth: 0 })).toMatch(/più di zero/);
  });

  it("a mortise is a pocket a third of the face wide, centred where it was clicked", () => {
    const made = plan("mortasa", face(6), [0.2, 0.02, 0.018], { width: 0.05, depth: 0.01 }) as Plan;
    expect(made.note).toBe("mortasa");
    const xs = made.cuts[0].map((p) => p[0]);
    const ys = made.cuts[0].map((p) => p[1]);
    expect(Math.min(...xs)).toBeCloseTo(0.175, 12);
    expect(Math.max(...xs)).toBeCloseTo(0.225, 12);
    expect(Math.min(...ys)).toBeCloseTo(0.03, 12);
    expect(Math.max(...ys)).toBeCloseTo(0.06, 12);
    expect((plan("mortasa", face(6), [0.2, 0.02, 0.018], { width: 0.05, depth: 0 }) as Plan).note).toBe("mortasa passante");
    // Clicked at the very end: it stays inside the board.
    const atEnd = plan("mortasa", face(6), [0.399, 0.02, 0.018], { width: 0.05, depth: 0.01 }) as Plan;
    expect(Math.max(...atEnd.cuts[0].map((p) => p[0]))).toBeLessThan(0.4);
    expect(plan("mortasa", face(6), [0.2, 0.02, 0.018], { width: 0.5, depth: 0.01 })).toMatch(/più lunga/);
  });

  it("tongue and groove match: the tongue is what the groove takes away", () => {
    const edge = face(4);
    const groove = plan("femmina", edge, [0.2, 0.09, 0.009], { width: 0.006, depth: 0.008 }) as Plan;
    const tongue = plan("maschio", edge, [0.2, 0.09, 0.009], { width: 0.006, depth: 0.008 }) as Plan;
    expect(groove.cuts).toHaveLength(1);
    expect(tongue.cuts).toHaveLength(2);
    const zs = groove.cuts[0].map((p) => p[2]);
    expect(Math.min(...zs)).toBeCloseTo(0.006, 12);
    expect(Math.max(...zs)).toBeCloseTo(0.012, 12);
    expect(Math.max(...tongue.cuts[0].map((p) => p[2]))).toBeCloseTo(0.006, 12);
    expect(Math.min(...tongue.cuts[1].map((p) => p[2]))).toBeCloseTo(0.012, 12);
    expect(plan("maschio", edge, [0.2, 0.09, 0.009], { width: 0.02, depth: 0.008 })).toMatch(/più spessa/);
    expect(plan("femmina", edge, [0.2, 0.09, 0.009], { width: 0.006, depth: 0 })).toMatch(/più di zero/);
  });

  it("dovetail tails and pins are cut to the same pitch and slope, so they fit", () => {
    const tails = plan("coda", face(6), [0.39, 0.045, 0.018], { width: 0.03, depth: 0 }) as Plan;
    expect(tails.note).toBe("coda di rondine (3 code)");
    // Three tails: two half spaces at the sides and two whole ones between.
    expect(tails.cuts).toHaveLength(4);
    const pitch = 0.03;
    const tip = (pitch * 0.3) / 2;
    const base = tip + 0.018 * DOVETAIL_SLOPE;
    const second = tails.cuts[1];
    // At the end of the board the space is narrow, at the base of the tails it is wide.
    expect(second[0]).toEqual([0.4, pitch - tip, 0.018]);
    expect(second[1]).toEqual([0.4, pitch + tip, 0.018]);
    expect(second[2][0]).toBeCloseTo(0.4 - 0.018, 12);
    expect(second[2][1]).toBeCloseTo(pitch + base, 12);
    expect(second[3][1]).toBeCloseTo(pitch - base, 12);
    // The half space at the side stops at the board's edge.
    expect(Math.min(...tails.cuts[0].map((p) => p[1]))).toBe(0);
    expect(Math.max(...tails.cuts[3].map((p) => p[1]))).toBeCloseTo(0.09, 12);

    // The other board, standing on its end: 90 wide, 18 thick; clicked near its outer face (z = 0).
    const pins = plan("perni", face(2), [0.4, 0.045, 0.002], { width: 0.03, depth: 0.018 }) as Plan;
    expect(pins.note).toBe("perni della coda di rondine (3 sedi)");
    expect(pins.cuts).toHaveLength(3);
    expect(pins.depth).toBe(0.018);
    const socket = pins.cuts[1];
    // Wide on the outer face (where the tails' tips arrive), narrow on the inner one.
    expect(socket[0][1]).toBeCloseTo(pitch + tip, 12);
    expect(socket[0][2]).toBe(0);
    expect(socket[1][1]).toBeCloseTo(2 * pitch - tip, 12);
    expect(socket[2][1]).toBeCloseTo(2 * pitch - base, 12);
    expect(socket[2][2]).toBeCloseTo(0.018, 12);
    expect(socket[3][1]).toBeCloseTo(pitch + base, 12);
    // The socket is as wide as the tail between two spaces, at both ends.
    expect(socket[1][1] - socket[0][1]).toBeCloseTo(second[0][1] + pitch - second[1][1], 12);

    expect(plan("coda", face(6), [0.39, 0.045, 0.018], { width: 0.008, depth: 0.03 })).toMatch(/troppo strette/);
    expect(plan("perni", face(6), [0.39, 0.045, 0.018], { width: 0.03, depth: 0.018 })).toMatch(/testa del pezzo/);
  });

  it("the joints that were there still cut what they did", () => {
    expect((plan("scasso", face(6), [0.2, 0.045, 0.018], { width: 0.018, depth: 0.006 }) as Plan).note).toBe("scasso");
    expect((plan("dita", face(6), [0.01, 0.045, 0.018], { width: 0.012, depth: 0.018 }) as Plan).note).toBe("incastro a dita (9 dita)");
    expect((plan("mezzolegno", face(6), [0.01, 0.045, 0.018], { width: 0.05, depth: 0 }) as Plan).depth).toBeCloseTo(0.009, 12);
  });
});
