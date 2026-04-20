export interface DailyChallenge {
  id: string;
  title: string;
  description: string;
  emoji: string;
  color: string;
  hint: string;
}

const CHALLENGES: DailyChallenge[] = [
  { id: 'cozy-sunday', title: 'Cozy Sunday', description: 'Pick a fragrance that wraps you like a warm blanket', emoji: '🛋️', color: '#8B5E3C', hint: 'Think warm, comforting, soft' },
  { id: 'date-night', title: 'Date Night', description: 'Your most seductive, irresistible scent', emoji: '🌹', color: '#C62828', hint: 'Bold, romantic, unforgettable' },
  { id: 'fresh-start', title: 'Fresh Start Monday', description: 'A clean, energizing scent to kick off the week', emoji: '🍃', color: '#2E7D32', hint: 'Fresh, citrus, invigorating' },
  { id: 'office-power', title: 'Office Power Move', description: 'Your signature professional fragrance', emoji: '💼', color: '#37474F', hint: 'Clean, sophisticated, memorable' },
  { id: 'summer-breeze', title: 'Summer Breeze', description: 'Light and airy — like sunshine in a bottle', emoji: '☀️', color: '#F9A825', hint: 'Light, bright, citrusy' },
  { id: 'mystery-night', title: 'Mystery Night', description: 'Dark, moody, and full of intrigue', emoji: '🌙', color: '#4A148C', hint: 'Deep, dark, mysterious' },
  { id: 'throwback', title: 'Throwback Thursday', description: 'A scent that takes you back to a special memory', emoji: '📼', color: '#E65100', hint: 'Nostalgia in a bottle' },
  { id: 'rain-walk', title: 'Walk in the Rain', description: 'Petrichor vibes — fresh, earthy, grounding', emoji: '🌧️', color: '#546E7A', hint: 'Earthy, aquatic, green' },
  { id: 'sweet-tooth', title: 'Sweet Tooth', description: 'Your most delicious gourmand fragrance', emoji: '🍰', color: '#AD1457', hint: 'Sweet, edible, dessert-like' },
  { id: 'forest-bath', title: 'Forest Bathing', description: 'Woody, green, and grounding like a walk in nature', emoji: '🌲', color: '#1B5E20', hint: 'Woody, green, mossy' },
  { id: 'royal-treatment', title: 'Royal Treatment', description: 'Your most luxurious, opulent fragrance', emoji: '👑', color: '#BF360C', hint: 'Rich, luxurious, regal' },
  { id: 'beach-day', title: 'Beach Day', description: 'Salt, sun, and coconut — vacation in a bottle', emoji: '🏖️', color: '#00838F', hint: 'Marine, coconut, sunny' },
  { id: 'bookstore', title: 'Bookstore Vibes', description: 'Intellectual, warm, and slightly dusty in the best way', emoji: '📚', color: '#5D4037', hint: 'Warm, papery, woody' },
  { id: 'party-starter', title: 'Party Starter', description: 'The scent that turns heads when you walk in', emoji: '🎉', color: '#6A1B9A', hint: 'Bold, attention-grabbing' },
  { id: 'morning-coffee', title: 'Morning Coffee', description: 'Rich, warm, and the perfect wake-up call', emoji: '☕', color: '#4E342E', hint: 'Coffee, warm spices, creamy' },
  { id: 'garden-party', title: 'Garden Party', description: 'Floral, elegant, and perfectly blooming', emoji: '🌸', color: '#EC407A', hint: 'Floral, green, feminine' },
  { id: 'winter-fire', title: 'By the Fireplace', description: 'Smoky, warm, and irresistibly cozy', emoji: '🔥', color: '#D84315', hint: 'Smoky, warm, spicy' },
  { id: 'clean-slate', title: 'Clean Slate', description: 'Fresh laundry, white musk, and pure simplicity', emoji: '🤍', color: '#78909C', hint: 'Clean, musky, soapy' },
  { id: 'midnight-escape', title: 'Midnight Escape', description: 'Your go-to for late night adventures', emoji: '✨', color: '#1A237E', hint: 'Dark, intense, magnetic' },
  { id: 'sunday-brunch', title: 'Sunday Brunch', description: 'Sweet, warm, and utterly delightful', emoji: '🥐', color: '#FF8F00', hint: 'Warm, sweet, inviting' },
  { id: 'power-move', title: 'Confidence Boost', description: 'The scent that makes you feel unstoppable', emoji: '💪', color: '#283593', hint: 'Bold, powerful, assertive' },
  { id: 'first-date', title: 'First Impression', description: 'If someone smelled you only once, what would you wear?', emoji: '🤝', color: '#00695C', hint: 'Memorable, unique, inviting' },
  { id: 'rainy-library', title: 'Rainy Library', description: 'Incense, old books, and the sound of rain', emoji: '📖', color: '#3E2723', hint: 'Incense, amber, paper' },
  { id: 'tropical-escape', title: 'Tropical Escape', description: 'Fruity, exotic, and vacation-ready', emoji: '🌴', color: '#00897B', hint: 'Fruity, tropical, exotic' },
  { id: 'signature-scent', title: 'My Signature', description: 'Your absolute #1 — the scent that IS you', emoji: '🏆', color: '#F57F17', hint: 'Your identity in a bottle' },
  { id: 'winter-wonderland', title: 'Winter Wonderland', description: 'Cold weather calls for cozy, warm fragrances', emoji: '❄️', color: '#0277BD', hint: 'Spicy, warm, enveloping' },
  { id: 'spring-awakening', title: 'Spring Awakening', description: 'Light florals and fresh greens — new beginnings', emoji: '🌱', color: '#558B2F', hint: 'Green, floral, airy' },
  { id: 'blind-buy', title: 'Blind Buy Love', description: 'A fragrance you bought without smelling first — and loved', emoji: '🎁', color: '#7B1FA2', hint: 'A pleasant surprise' },
  { id: 'guilty-pleasure', title: 'Guilty Pleasure', description: 'The one you secretly love wearing', emoji: '🤫', color: '#C2185B', hint: 'Your secret favorite' },
  { id: 'autumn-vibes', title: 'Autumn Vibes', description: 'Falling leaves, spiced cider, and warm sweaters', emoji: '🍂', color: '#E65100', hint: 'Spicy, warm, earthy' },
  { id: 'ocean-breeze', title: 'Ocean Breeze', description: 'Salty air, sea spray, and endless blue horizons', emoji: '🌊', color: '#0288D1', hint: 'Aquatic, fresh, salty' },
];

export function getTodayChallenge(): DailyChallenge {
  const today = new Date();
  const dayOfYear = Math.floor(
    (today.getTime() - new Date(today.getFullYear(), 0, 0).getTime()) / (1000 * 60 * 60 * 24)
  );
  const index = dayOfYear % CHALLENGES.length;
  return CHALLENGES[index];
}

export function getChallengeForDate(date: Date): DailyChallenge {
  const dayOfYear = Math.floor(
    (date.getTime() - new Date(date.getFullYear(), 0, 0).getTime()) / (1000 * 60 * 60 * 24)
  );
  const index = dayOfYear % CHALLENGES.length;
  return CHALLENGES[index];
}
