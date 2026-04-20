export interface FragranceProfile {
  seasons: {
    spring: number;
    summer: number;
    autumn: number;
    winter: number;
  };
  timeOfDay: {
    day: number;
    night: number;
  };
}

interface NoteProfile {
  seasons: { spring: number; summer: number; autumn: number; winter: number };
  time: { day: number; night: number };
}

const NOTE_PROFILES: Record<string, NoteProfile> = {
  bergamot: { seasons: { spring: 0.9, summer: 0.8, autumn: 0.3, winter: 0.2 }, time: { day: 0.9, night: 0.4 } },
  lemon: { seasons: { spring: 0.8, summer: 1.0, autumn: 0.2, winter: 0.1 }, time: { day: 1.0, night: 0.2 } },
  orange: { seasons: { spring: 0.7, summer: 0.8, autumn: 0.4, winter: 0.3 }, time: { day: 0.8, night: 0.3 } },
  grapefruit: { seasons: { spring: 0.8, summer: 1.0, autumn: 0.2, winter: 0.1 }, time: { day: 1.0, night: 0.2 } },
  lime: { seasons: { spring: 0.7, summer: 1.0, autumn: 0.2, winter: 0.1 }, time: { day: 0.9, night: 0.3 } },
  neroli: { seasons: { spring: 1.0, summer: 0.8, autumn: 0.3, winter: 0.2 }, time: { day: 0.8, night: 0.5 } },
  citrus: { seasons: { spring: 0.8, summer: 1.0, autumn: 0.2, winter: 0.1 }, time: { day: 1.0, night: 0.2 } },
  mandarin: { seasons: { spring: 0.8, summer: 0.9, autumn: 0.3, winter: 0.2 }, time: { day: 0.9, night: 0.3 } },
  yuzu: { seasons: { spring: 0.9, summer: 0.8, autumn: 0.3, winter: 0.3 }, time: { day: 0.9, night: 0.3 } },
  tangerine: { seasons: { spring: 0.8, summer: 0.9, autumn: 0.3, winter: 0.2 }, time: { day: 0.9, night: 0.3 } },
  petitgrain: { seasons: { spring: 0.9, summer: 0.7, autumn: 0.3, winter: 0.2 }, time: { day: 0.9, night: 0.3 } },

  rose: { seasons: { spring: 1.0, summer: 0.6, autumn: 0.5, winter: 0.4 }, time: { day: 0.6, night: 0.8 } },
  jasmine: { seasons: { spring: 0.8, summer: 0.9, autumn: 0.4, winter: 0.3 }, time: { day: 0.5, night: 0.9 } },
  lily: { seasons: { spring: 1.0, summer: 0.7, autumn: 0.3, winter: 0.2 }, time: { day: 0.7, night: 0.6 } },
  violet: { seasons: { spring: 0.9, summer: 0.5, autumn: 0.4, winter: 0.3 }, time: { day: 0.7, night: 0.5 } },
  iris: { seasons: { spring: 0.8, summer: 0.4, autumn: 0.6, winter: 0.5 }, time: { day: 0.6, night: 0.7 } },
  tuberose: { seasons: { spring: 0.6, summer: 0.8, autumn: 0.5, winter: 0.4 }, time: { day: 0.3, night: 1.0 } },
  lavender: { seasons: { spring: 0.8, summer: 0.9, autumn: 0.4, winter: 0.3 }, time: { day: 0.8, night: 0.5 } },
  peony: { seasons: { spring: 1.0, summer: 0.7, autumn: 0.2, winter: 0.1 }, time: { day: 0.9, night: 0.4 } },
  magnolia: { seasons: { spring: 0.9, summer: 0.7, autumn: 0.3, winter: 0.2 }, time: { day: 0.8, night: 0.5 } },
  orchid: { seasons: { spring: 0.7, summer: 0.6, autumn: 0.5, winter: 0.4 }, time: { day: 0.5, night: 0.8 } },
  gardenia: { seasons: { spring: 0.8, summer: 0.9, autumn: 0.3, winter: 0.2 }, time: { day: 0.6, night: 0.7 } },
  ylang: { seasons: { spring: 0.7, summer: 0.9, autumn: 0.4, winter: 0.3 }, time: { day: 0.4, night: 0.9 } },
  geranium: { seasons: { spring: 0.8, summer: 0.7, autumn: 0.4, winter: 0.3 }, time: { day: 0.7, night: 0.5 } },
  freesia: { seasons: { spring: 1.0, summer: 0.7, autumn: 0.2, winter: 0.1 }, time: { day: 0.9, night: 0.3 } },
  floral: { seasons: { spring: 0.9, summer: 0.7, autumn: 0.3, winter: 0.2 }, time: { day: 0.7, night: 0.6 } },

  sandalwood: { seasons: { spring: 0.4, summer: 0.3, autumn: 0.8, winter: 0.9 }, time: { day: 0.5, night: 0.8 } },
  cedar: { seasons: { spring: 0.4, summer: 0.3, autumn: 0.9, winter: 0.7 }, time: { day: 0.6, night: 0.7 } },
  cedarwood: { seasons: { spring: 0.4, summer: 0.3, autumn: 0.9, winter: 0.7 }, time: { day: 0.6, night: 0.7 } },
  vetiver: { seasons: { spring: 0.4, summer: 0.5, autumn: 0.8, winter: 0.6 }, time: { day: 0.6, night: 0.7 } },
  patchouli: { seasons: { spring: 0.3, summer: 0.2, autumn: 1.0, winter: 0.8 }, time: { day: 0.4, night: 0.9 } },
  oud: { seasons: { spring: 0.2, summer: 0.1, autumn: 0.7, winter: 1.0 }, time: { day: 0.3, night: 1.0 } },
  agarwood: { seasons: { spring: 0.2, summer: 0.1, autumn: 0.7, winter: 1.0 }, time: { day: 0.3, night: 1.0 } },
  wood: { seasons: { spring: 0.4, summer: 0.3, autumn: 0.8, winter: 0.7 }, time: { day: 0.5, night: 0.7 } },
  woody: { seasons: { spring: 0.4, summer: 0.3, autumn: 0.8, winter: 0.7 }, time: { day: 0.5, night: 0.7 } },
  birch: { seasons: { spring: 0.3, summer: 0.2, autumn: 0.8, winter: 0.7 }, time: { day: 0.5, night: 0.7 } },
  guaiac: { seasons: { spring: 0.3, summer: 0.2, autumn: 0.8, winter: 0.9 }, time: { day: 0.4, night: 0.8 } },
  pine: { seasons: { spring: 0.5, summer: 0.4, autumn: 0.6, winter: 0.8 }, time: { day: 0.7, night: 0.5 } },
  cypress: { seasons: { spring: 0.5, summer: 0.4, autumn: 0.7, winter: 0.6 }, time: { day: 0.7, night: 0.5 } },

  vanilla: { seasons: { spring: 0.3, summer: 0.2, autumn: 0.8, winter: 1.0 }, time: { day: 0.4, night: 0.9 } },
  amber: { seasons: { spring: 0.3, summer: 0.2, autumn: 0.8, winter: 1.0 }, time: { day: 0.4, night: 0.9 } },
  ambergris: { seasons: { spring: 0.3, summer: 0.3, autumn: 0.7, winter: 0.9 }, time: { day: 0.4, night: 0.8 } },
  tonka: { seasons: { spring: 0.3, summer: 0.2, autumn: 0.9, winter: 1.0 }, time: { day: 0.4, night: 0.9 } },
  incense: { seasons: { spring: 0.2, summer: 0.1, autumn: 0.7, winter: 1.0 }, time: { day: 0.3, night: 1.0 } },
  frankincense: { seasons: { spring: 0.3, summer: 0.2, autumn: 0.7, winter: 0.9 }, time: { day: 0.4, night: 0.9 } },
  musk: { seasons: { spring: 0.5, summer: 0.4, autumn: 0.6, winter: 0.7 }, time: { day: 0.5, night: 0.8 } },
  'white musk': { seasons: { spring: 0.6, summer: 0.5, autumn: 0.5, winter: 0.5 }, time: { day: 0.7, night: 0.6 } },
  benzoin: { seasons: { spring: 0.2, summer: 0.1, autumn: 0.8, winter: 1.0 }, time: { day: 0.3, night: 0.9 } },
  labdanum: { seasons: { spring: 0.2, summer: 0.1, autumn: 0.9, winter: 1.0 }, time: { day: 0.3, night: 0.9 } },
  myrrh: { seasons: { spring: 0.2, summer: 0.1, autumn: 0.8, winter: 1.0 }, time: { day: 0.3, night: 1.0 } },
  copal: { seasons: { spring: 0.2, summer: 0.1, autumn: 0.8, winter: 0.9 }, time: { day: 0.3, night: 0.9 } },

  aquatic: { seasons: { spring: 0.6, summer: 1.0, autumn: 0.2, winter: 0.1 }, time: { day: 1.0, night: 0.3 } },
  marine: { seasons: { spring: 0.6, summer: 1.0, autumn: 0.2, winter: 0.1 }, time: { day: 1.0, night: 0.2 } },
  oceanic: { seasons: { spring: 0.6, summer: 1.0, autumn: 0.2, winter: 0.1 }, time: { day: 1.0, night: 0.2 } },
  mint: { seasons: { spring: 0.7, summer: 1.0, autumn: 0.3, winter: 0.2 }, time: { day: 0.9, night: 0.3 } },
  green: { seasons: { spring: 0.9, summer: 0.7, autumn: 0.3, winter: 0.2 }, time: { day: 0.9, night: 0.3 } },
  tea: { seasons: { spring: 0.8, summer: 0.7, autumn: 0.4, winter: 0.3 }, time: { day: 0.8, night: 0.4 } },
  'green tea': { seasons: { spring: 0.9, summer: 0.8, autumn: 0.3, winter: 0.2 }, time: { day: 0.9, night: 0.3 } },
  cucumber: { seasons: { spring: 0.8, summer: 1.0, autumn: 0.1, winter: 0.1 }, time: { day: 1.0, night: 0.2 } },
  fresh: { seasons: { spring: 0.8, summer: 0.9, autumn: 0.3, winter: 0.2 }, time: { day: 0.9, night: 0.3 } },
  ozone: { seasons: { spring: 0.7, summer: 0.9, autumn: 0.3, winter: 0.2 }, time: { day: 0.9, night: 0.3 } },
  water: { seasons: { spring: 0.6, summer: 1.0, autumn: 0.2, winter: 0.1 }, time: { day: 1.0, night: 0.2 } },

  pepper: { seasons: { spring: 0.4, summer: 0.3, autumn: 0.8, winter: 0.9 }, time: { day: 0.5, night: 0.8 } },
  'black pepper': { seasons: { spring: 0.4, summer: 0.3, autumn: 0.8, winter: 0.9 }, time: { day: 0.5, night: 0.8 } },
  'pink pepper': { seasons: { spring: 0.6, summer: 0.5, autumn: 0.7, winter: 0.6 }, time: { day: 0.6, night: 0.7 } },
  cardamom: { seasons: { spring: 0.4, summer: 0.3, autumn: 0.8, winter: 0.9 }, time: { day: 0.5, night: 0.8 } },
  cinnamon: { seasons: { spring: 0.2, summer: 0.1, autumn: 0.9, winter: 1.0 }, time: { day: 0.4, night: 0.9 } },
  ginger: { seasons: { spring: 0.5, summer: 0.4, autumn: 0.7, winter: 0.8 }, time: { day: 0.6, night: 0.7 } },
  saffron: { seasons: { spring: 0.3, summer: 0.2, autumn: 0.9, winter: 1.0 }, time: { day: 0.3, night: 1.0 } },
  clove: { seasons: { spring: 0.2, summer: 0.1, autumn: 0.9, winter: 1.0 }, time: { day: 0.3, night: 0.9 } },
  nutmeg: { seasons: { spring: 0.3, summer: 0.2, autumn: 0.9, winter: 1.0 }, time: { day: 0.4, night: 0.8 } },
  spicy: { seasons: { spring: 0.3, summer: 0.2, autumn: 0.8, winter: 0.9 }, time: { day: 0.4, night: 0.8 } },
  cumin: { seasons: { spring: 0.3, summer: 0.3, autumn: 0.7, winter: 0.8 }, time: { day: 0.4, night: 0.8 } },
  elemi: { seasons: { spring: 0.5, summer: 0.4, autumn: 0.6, winter: 0.7 }, time: { day: 0.5, night: 0.7 } },

  caramel: { seasons: { spring: 0.2, summer: 0.1, autumn: 0.8, winter: 1.0 }, time: { day: 0.4, night: 0.9 } },
  coffee: { seasons: { spring: 0.3, summer: 0.2, autumn: 0.9, winter: 1.0 }, time: { day: 0.5, night: 0.8 } },
  chocolate: { seasons: { spring: 0.2, summer: 0.1, autumn: 0.8, winter: 1.0 }, time: { day: 0.4, night: 0.9 } },
  honey: { seasons: { spring: 0.5, summer: 0.4, autumn: 0.7, winter: 0.8 }, time: { day: 0.5, night: 0.8 } },
  almond: { seasons: { spring: 0.4, summer: 0.3, autumn: 0.7, winter: 0.8 }, time: { day: 0.5, night: 0.8 } },
  praline: { seasons: { spring: 0.2, summer: 0.1, autumn: 0.8, winter: 1.0 }, time: { day: 0.4, night: 0.9 } },
  cocoa: { seasons: { spring: 0.2, summer: 0.1, autumn: 0.8, winter: 1.0 }, time: { day: 0.4, night: 0.9 } },
  toffee: { seasons: { spring: 0.2, summer: 0.1, autumn: 0.8, winter: 1.0 }, time: { day: 0.4, night: 0.9 } },
  sugar: { seasons: { spring: 0.4, summer: 0.3, autumn: 0.6, winter: 0.7 }, time: { day: 0.5, night: 0.7 } },

  leather: { seasons: { spring: 0.2, summer: 0.1, autumn: 0.9, winter: 1.0 }, time: { day: 0.4, night: 0.9 } },
  tobacco: { seasons: { spring: 0.2, summer: 0.1, autumn: 1.0, winter: 0.9 }, time: { day: 0.3, night: 1.0 } },
  smoke: { seasons: { spring: 0.1, summer: 0.1, autumn: 0.8, winter: 1.0 }, time: { day: 0.2, night: 1.0 } },
  smoky: { seasons: { spring: 0.1, summer: 0.1, autumn: 0.8, winter: 1.0 }, time: { day: 0.2, night: 1.0 } },
  suede: { seasons: { spring: 0.3, summer: 0.2, autumn: 0.9, winter: 0.8 }, time: { day: 0.5, night: 0.8 } },

  coconut: { seasons: { spring: 0.5, summer: 1.0, autumn: 0.2, winter: 0.1 }, time: { day: 0.9, night: 0.4 } },
  fig: { seasons: { spring: 0.6, summer: 0.9, autumn: 0.4, winter: 0.2 }, time: { day: 0.8, night: 0.5 } },
  apple: { seasons: { spring: 0.7, summer: 0.6, autumn: 0.7, winter: 0.4 }, time: { day: 0.8, night: 0.4 } },
  pear: { seasons: { spring: 0.8, summer: 0.6, autumn: 0.5, winter: 0.3 }, time: { day: 0.8, night: 0.4 } },
  peach: { seasons: { spring: 0.8, summer: 0.9, autumn: 0.3, winter: 0.2 }, time: { day: 0.8, night: 0.4 } },
  raspberry: { seasons: { spring: 0.7, summer: 0.8, autumn: 0.4, winter: 0.3 }, time: { day: 0.7, night: 0.6 } },
  blackberry: { seasons: { spring: 0.5, summer: 0.7, autumn: 0.6, winter: 0.3 }, time: { day: 0.6, night: 0.6 } },
  plum: { seasons: { spring: 0.4, summer: 0.3, autumn: 0.9, winter: 0.7 }, time: { day: 0.4, night: 0.8 } },
  cherry: { seasons: { spring: 0.6, summer: 0.5, autumn: 0.6, winter: 0.5 }, time: { day: 0.5, night: 0.7 } },
  'black cherry': { seasons: { spring: 0.4, summer: 0.3, autumn: 0.7, winter: 0.8 }, time: { day: 0.4, night: 0.8 } },
  lychee: { seasons: { spring: 0.7, summer: 0.9, autumn: 0.3, winter: 0.2 }, time: { day: 0.8, night: 0.5 } },
  mango: { seasons: { spring: 0.6, summer: 1.0, autumn: 0.2, winter: 0.1 }, time: { day: 0.9, night: 0.3 } },
  pineapple: { seasons: { spring: 0.6, summer: 1.0, autumn: 0.2, winter: 0.1 }, time: { day: 0.9, night: 0.4 } },
  passion: { seasons: { spring: 0.6, summer: 0.9, autumn: 0.3, winter: 0.2 }, time: { day: 0.7, night: 0.6 } },

  'white flowers': { seasons: { spring: 0.8, summer: 0.7, autumn: 0.3, winter: 0.2 }, time: { day: 0.6, night: 0.8 } },
  heliotrope: { seasons: { spring: 0.7, summer: 0.5, autumn: 0.5, winter: 0.4 }, time: { day: 0.6, night: 0.7 } },
  'orange blossom': { seasons: { spring: 0.9, summer: 0.8, autumn: 0.3, winter: 0.2 }, time: { day: 0.7, night: 0.6 } },
  mimosa: { seasons: { spring: 1.0, summer: 0.6, autumn: 0.3, winter: 0.2 }, time: { day: 0.8, night: 0.4 } },
  'lily of the valley': { seasons: { spring: 1.0, summer: 0.6, autumn: 0.2, winter: 0.1 }, time: { day: 0.9, night: 0.3 } },
  carnation: { seasons: { spring: 0.7, summer: 0.5, autumn: 0.5, winter: 0.5 }, time: { day: 0.6, night: 0.6 } },

  moss: { seasons: { spring: 0.5, summer: 0.3, autumn: 0.8, winter: 0.6 }, time: { day: 0.5, night: 0.7 } },
  oakmoss: { seasons: { spring: 0.4, summer: 0.3, autumn: 0.9, winter: 0.6 }, time: { day: 0.5, night: 0.8 } },
  'tree moss': { seasons: { spring: 0.4, summer: 0.3, autumn: 0.8, winter: 0.6 }, time: { day: 0.5, night: 0.7 } },
};

function findNoteProfile(note: string): NoteProfile | null {
  const lower = note.toLowerCase().trim();
  if (NOTE_PROFILES[lower]) return NOTE_PROFILES[lower];

  for (const [key, profile] of Object.entries(NOTE_PROFILES)) {
    if (lower.includes(key) || key.includes(lower)) return profile;
  }
  return null;
}

export function analyzeFragranceProfile(
  topNotes: string[],
  heartNotes: string[],
  baseNotes: string[]
): FragranceProfile {
  const weights = { top: 1.0, heart: 1.5, base: 2.0 };

  const seasons = { spring: 0, summer: 0, autumn: 0, winter: 0 };
  const time = { day: 0, night: 0 };
  let totalWeight = 0;

  const processNotes = (notes: string[], weight: number) => {
    for (const note of notes) {
      const profile = findNoteProfile(note);
      if (profile) {
        seasons.spring += profile.seasons.spring * weight;
        seasons.summer += profile.seasons.summer * weight;
        seasons.autumn += profile.seasons.autumn * weight;
        seasons.winter += profile.seasons.winter * weight;
        time.day += profile.time.day * weight;
        time.night += profile.time.night * weight;
        totalWeight += weight;
      }
    }
  };

  processNotes(topNotes, weights.top);
  processNotes(heartNotes, weights.heart);
  processNotes(baseNotes, weights.base);

  if (totalWeight === 0) {
    return {
      seasons: { spring: 0.5, summer: 0.5, autumn: 0.5, winter: 0.5 },
      timeOfDay: { day: 0.5, night: 0.5 },
    };
  }

  return {
    seasons: {
      spring: seasons.spring / totalWeight,
      summer: seasons.summer / totalWeight,
      autumn: seasons.autumn / totalWeight,
      winter: seasons.winter / totalWeight,
    },
    timeOfDay: {
      day: time.day / totalWeight,
      night: time.night / totalWeight,
    },
  };
}

export function getSeasonSuitability(score: number): 'high' | 'medium' | 'low' {
  if (score >= 0.6) return 'high';
  if (score >= 0.35) return 'medium';
  return 'low';
}

export function getTimeSuitability(score: number): 'high' | 'medium' | 'low' {
  if (score >= 0.55) return 'high';
  if (score >= 0.35) return 'medium';
  return 'low';
}
