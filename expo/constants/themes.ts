import { ThemeColors, ThemeName } from '@/lib/types';

export const THEMES: Record<ThemeName, ThemeColors> = {
  classic: {
    background: '#faf7f2',
    card: '#ffffff',
    sidebar: '#f5f0e8',
    accent: '#c49a6c',
    text: '#1a1410',
    subtext: '#8b7355',
    border: '#e8e0d0',
    chip: '#f0ebe3',
  },
  noir: {
    background: '#0d0b08',
    card: '#1a1510',
    sidebar: '#131108',
    accent: '#c49a6c',
    text: '#f0ebe5',
    subtext: '#8b7a68',
    border: '#2a2318',
    chip: '#231e16',
  },
  rose: {
    background: '#fdf6f6',
    card: '#ffffff',
    sidebar: '#f8eded',
    accent: '#c4706c',
    text: '#1a1010',
    subtext: '#8b6060',
    border: '#e8d0d0',
    chip: '#f5e8e8',
  },
  sage: {
    background: '#f6faf6',
    card: '#ffffff',
    sidebar: '#edf5ed',
    accent: '#6c9c6c',
    text: '#101a10',
    subtext: '#608060',
    border: '#d0e0d0',
    chip: '#e8f0e8',
  },
};

export const AVATAR_EMOJIS = ['🧴', '🌺', '🌸', '🌿', '🔥', '✨', '🖤', '💎', '🌙', '🍊', '🫧', '🌾'];

export const CONCENTRATIONS = [
  'Eau de Parfum',
  'Eau de Toilette',
  'Eau de Cologne',
  'Parfum',
  'Eau Fraiche',
  'Extrait de Parfum',
];

export const SEASONS = ['Spring', 'Summer', 'Autumn', 'Winter', 'All Seasons'];
export const OCCASIONS = ['Everyday', 'Office', 'Date Night', 'Evening', 'Special Occasion', 'Casual', 'Formal'];
