export interface Profile {
  id: string;
  email: string;
  display_name: string | null;
  username: string | null;
  bio: string | null;
  favorite_note: string | null;
  avatar_emoji: string | null;
  avatar_url: string | null;
  is_pro: boolean;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  pro_since: string | null;
  pro_expires_at: string | null;
  pro_source: string | null;
  referral_reward_months: number | null;
  created_at: string;
}

export interface CollectionItem {
  id: string;
  user_id: string;
  perfume_name: string;
  perfume_brand: string;
  concentration: string | null;
  season: string | null;
  occasion: string | null;
  top_notes: string[];
  heart_notes: string[];
  base_notes: string[];
  image_url: string | null;
  clean_image_url: string | null;
  rating: number | null;
  personal_notes: string | null;
  is_favorite: boolean;
  purchase_price: number | null;
  date_added: string | null;
  created_at: string;
  status: 'owned' | 'tried';
  fill_level: number;
}

export interface WishlistItem {
  id: string;
  user_id: string;
  perfume_name: string;
  perfume_brand: string;
  image_url: string | null;
  concentration: string | null;
  notes: string[];
  estimated_price: string | null;
  reason: string | null;
  priority: number;
  created_at: string;
}

export interface WearDiaryEntry {
  id: string;
  user_id: string;
  perfume_name: string;
  perfume_brand: string;
  date: string;
  note: string | null;
  image_url: string | null;
  occasion: string | null;
  mood: string | null;
  rating: number | null;
  sprays: number | null;
  created_at: string;
}

export interface TodayWear {
  id: string;
  user_id: string;
  perfume_name: string;
  perfume_brand: string;
  image_url: string | null;
  note: string | null;
  date: string;
  created_at: string;
  profiles?: Profile;
}

export interface PerfumeReview {
  id: string;
  user_id: string;
  perfume_name: string;
  perfume_brand: string;
  rating: number;
  review_text: string | null;
  longevity: number | null;
  sillage: number | null;
  value_for_money: number | null;
  created_at: string;
  updated_at: string;
  profiles?: Profile;
}

export interface Follow {
  id: string;
  follower_id: string;
  following_id: string;
  created_at: string;
}

export interface ActivityFeedItem {
  id: string;
  user_id: string;
  activity_type: string;
  perfume_name: string | null;
  perfume_brand: string | null;
  created_at: string;
  profiles?: Profile;
}

export interface Notification {
  id: string;
  user_id: string;
  sender_id: string | null;
  type: string;
  message: string | null;
  perfume_name: string | null;
  perfume_brand: string | null;
  read: boolean;
  created_at: string;
}

export interface SearchResult {
  name: string;
  brand: string;
  concentration: string | null;
  topNotes: string[];
  heartNotes: string[];
  baseNotes: string[];
  imageUrl: string | null;
  gender: string | null;
  year: string | null;
  price: string | null;
  longevity: string | null;
  sillage: string | null;
  accords: string[];
  rating: string | null;
}

export const SCENT_FAMILIES: ScentFamily[] = [
  { name: 'Citrus', color: '#f0c040', keywords: ['bergamot', 'lemon', 'orange', 'grapefruit', 'lime', 'neroli', 'citrus', 'mandarin', 'yuzu', 'tangerine'] },
  { name: 'Floral', color: '#e87090', keywords: ['rose', 'jasmine', 'lily', 'violet', 'iris', 'tuberose', 'lavender', 'peony', 'magnolia', 'orchid', 'gardenia', 'floral'] },
  { name: 'Woody', color: '#9b7040', keywords: ['sandalwood', 'cedar', 'vetiver', 'patchouli', 'oud', 'wood', 'birch', 'guaiac', 'woody'] },
  { name: 'Oriental', color: '#c08040', keywords: ['vanilla', 'amber', 'tonka', 'incense', 'musk', 'benzoin', 'labdanum', 'copal', 'myrrh'] },
  { name: 'Fresh', color: '#60b8d0', keywords: ['aquatic', 'marine', 'mint', 'green', 'tea', 'cucumber', 'fresh', 'ozone', 'water'] },
  { name: 'Spicy', color: '#d06030', keywords: ['pepper', 'cardamom', 'cinnamon', 'ginger', 'saffron', 'clove', 'nutmeg', 'spicy', 'cumin'] },
  { name: 'Gourmand', color: '#c06080', keywords: ['caramel', 'coffee', 'chocolate', 'honey', 'almond', 'praline', 'cocoa', 'toffee', 'sugar'] },
  { name: 'Leather', color: '#8b5030', keywords: ['leather', 'tobacco', 'smoke', 'suede', 'birch tar', 'smoky'] },
];

export interface TrendingItem {
  name: string;
  brand: string;
  platform: string;
  source: string;
  description: string;
  hotness: number;
  imageUrl: string | null;
}

export interface NewsArticle {
  title: string;
  source: string;
  url: string;
  image: string | null;
  publishedAt: string;
  subtitle: string;
}

export type CollectionStatus = 'owned' | 'tried';

export interface ScentFamily {
  name: string;
  color: string;
  keywords: string[];
}

export type ThemeName = 'classic' | 'noir' | 'rose' | 'sage';

export interface ThemeColors {
  background: string;
  card: string;
  sidebar: string;
  accent: string;
  text: string;
  subtext: string;
  border: string;
  chip: string;
}

export type CurrencyCode = 'EUR' | 'USD' | 'GBP' | 'CHF' | 'JPY' | 'AUD' | 'CAD' | 'SEK';

export const CURRENCY_SYMBOLS: Record<CurrencyCode, string> = {
  EUR: '€',
  USD: '$',
  GBP: '£',
  CHF: 'Fr',
  JPY: '¥',
  AUD: 'A$',
  CAD: 'C$',
  SEK: 'kr',
};
