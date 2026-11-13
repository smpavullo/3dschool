// @ts-check
// I profili dei bordi, come le frese di una fresatrice: smusso, bisello, arrotondamento, cavetto,
// battuta, scanalatura, gola romana e toro. Si disegna sulla testa del pezzo la piccola sagoma del
// legno da togliere e la si spinge lungo tutto lo spigolo, come si farebbe con la pialla. Vale per
// gli spigoli dei pezzi a forma di parallelepipedo.
//
// Le coordinate sono in metri nel mondo; gli assi sono 0 = x, 1 = y, 2 = z.

/** @typedef {[number, number, number]} Vec3 */

export const PROFILES = /** @type {const} */ ([
  { value: "smusso", label: "Smusso (taglio a 45 gradi)" },
  { value: "arrotondato", label: "Arrotondamento" },
  { value: "cavetto", label: "Cavetto (incavo tondo, come fa la pialla a gola)" },
  { value: "bisello", label: "Bisello (taglio inclinato a 30 gradi)" },
  { value: "battuta", label: "Battuta (gradino quadrato lungo lo spigolo)" },
  { value: "scanalatura", label: "Scanalatura (canale parallelo allo spigolo)" },
  { value: "gola", label: "Gola romana (profilo a S)" },
  { value: "toro", label: "Toro (tondo con due listelli)" },
]);

/** @typedef {"smusso" | "arrotondato" | "cavetto" | "bisello" | "battuta" | "scanalatura" | "gola" | "toro"} Profile */

/** Il nome breve di un profilo, per i messaggi. @param {string} value */
export function profileName(value) {
  const found = PROFILES.find((x) => x.value === value);
  return found ? found.label.split(" (")[0].toLowerCase() : value;
}

/** Quanti lati hanno gli archi dei profili tondi. */
const ARC_STEPS = 8;

/**
 * I punti di un arco nel piano della testa, in (x, y) dallo spigolo: centro, raggio, angoli in gradi.
 * @param {number} cx @param {number} cy @param {number} r @param {number} from @param {number} to
 * @returns {[number, number][]}
 */
function arc(cx, cy, r, from, to) {
  /** @type {[number, number][]} */
  const out = [];
  for (let k = 0; k <= ARC_STEPS; k++) {
    const t = ((from + ((to - from) * k) / ARC_STEPS) * Math.PI) / 180;
    out.push([cx + r * Math.cos(t), cy + r * Math.sin(t)]);
  }
  return out;
}

/**
 * La sagoma da togliere, in (x, y) misurati dallo spigolo verso l'interno del pezzo lungo le due
 * facce: (0, 0) è lo spigolo. Tutte stanno nel quadrato di lato `2 * size`.
 * @param {Profile} profile @param {number} size
 * @returns {[number, number][]}
 */
export function profileShape(profile, size) {
  const s = size;
  switch (profile) {
    case "smusso":
      return [[0, 0], [s, 0], [0, s]];
    case "bisello":
      return [[0, 0], [s, 0], [0, s * Math.tan(Math.PI / 6)]];
    case "battuta":
      return [[0, 0], [s, 0], [s, s], [0, s]];
    case "scanalatura":
      // Un canale largo `size` e profondo metà, a distanza `size` dallo spigolo.
      return [[s, 0], [2 * s, 0], [2 * s, s / 2], [s, s / 2]];
    case "cavetto":
      // Un quarto di cerchio centrato sullo spigolo, tolto dal legno: resta un incavo tondo.
      return [[0, 0], ...arc(0, 0, s, 0, 90)];
    case "gola": {
      // Due quarti di cerchio di raggio metà misura: prima il legno è tondo, poi incavato.
      const h = s / 2;
      return [[0, 0], ...arc(s, h, h, 270, 180), ...arc(0, h, h, 0, 90).slice(1)];
    }
    case "toro": {
      // Un tondo di raggio 0,7 volte la misura, staccato dalle due facce da un listello.
      const r = s * 0.7;
      return [[0, 0], [s, 0], ...arc(s, s, r, 270, 180), [0, s]];
    }
    default:
      // Arrotondamento: lo spigolo meno il quarto di cerchio che resta, con il centro a (r, r).
      return [[0, 0], ...arc(s, s, s, 270, 180)];
  }
}

const TOL = 1e-6;

/** @param {Vec3} a @param {Vec3} b */
const sub = (a, b) => /** @type {Vec3} */ ([a[0] - b[0], a[1] - b[1], a[2] - b[2]]);
/** @param {Vec3} a @param {Vec3} b */
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/**
 * Cosa disegnare e dove, per togliere l'angolo di uno spigolo.
 * @param {Profile} profile @param {number} size raggio o lato del profilo
 * @param {{ a: Vec3, b: Vec3 }} edge lo spigolo
 * @param {{ min: Vec3, max: Vec3 }} box i limiti del pezzo
 * @param {{ id: number, normal: Vec3, origin: Vec3 }[]} faces le facce del pezzo
 * @returns {{ face: number, points: Vec3[], length: number } | string}
 */
export function edgePlan(profile, size, edge, box, faces) {
  if (!(size > 0)) return "La misura del profilo deve essere più di zero.";
  const d = sub(edge.b, edge.a);
  const length = Math.hypot(d[0], d[1], d[2]);
  if (length < TOL) return "Lo spigolo è troppo corto.";
  const axis = [0, 1, 2].reduce((best, k) => (Math.abs(d[k]) > Math.abs(d[best]) ? k : best), 0);
  if (Math.abs(d[axis]) < length * 0.9999) return "Questo spigolo è inclinato: lavoro solo su spigoli paralleli agli assi.";
  const [i, j] = [0, 1, 2].filter((k) => k !== axis);
  const P = edge.a;
  // Lo spigolo deve stare in un angolo del parallelepipedo.
  const onMin = (/** @type {number} */ k) => Math.abs(P[k] - box.min[k]) < TOL;
  const onMax = (/** @type {number} */ k) => Math.abs(P[k] - box.max[k]) < TOL;
  if (!(onMin(i) || onMax(i)) || !(onMin(j) || onMax(j))) return "Questo spigolo non è sull'angolo di un pezzo a forma di parallelepipedo.";
  const ui = onMin(i) ? 1 : -1;
  const uj = onMin(j) ? 1 : -1;
  if (size >= (box.max[i] - box.min[i]) / 2 || size >= (box.max[j] - box.min[j]) / 2) return "Il profilo è troppo grande per questo pezzo.";
  // La faccia di testa che passa per la prima estremità dello spigolo.
  const dir = /** @type {Vec3} */ ([0, 0, 0]);
  dir[axis] = 1;
  const end = faces.find((f) => Math.abs(Math.abs(dot(f.normal, dir)) - 1) < 1e-4 && Math.abs(dot(f.normal, sub(P, f.origin))) < 1e-5);
  if (!end) return "Non trovo la faccia di testa di questo spigolo.";
  /** @param {number} x @param {number} y @returns {Vec3} */
  const at = (x, y) => {
    const p = /** @type {Vec3} */ ([P[0], P[1], P[2]]);
    p[i] += ui * x;
    p[j] += uj * y;
    return p;
  };
  const points = profileShape(profile, size).map(([x, y]) => at(x, y));
  return { face: end.id, points, length: length + 0.001 };
}
