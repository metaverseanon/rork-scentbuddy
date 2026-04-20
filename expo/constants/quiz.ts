export const ONBOARDING_QUIZ_KEY = 'scentbuddy_onboarding_quiz';

export interface QuizOption {
  emoji: string;
  label: string;
  sub?: string;
}

export interface QuizStep {
  title: string;
  subtitle: string;
  options: QuizOption[];
}

export interface QuizResults {
  scentFamilies: string[];
  favoriteNotes: string[];
  occasions: string[];
  priorities: string[];
  completedAt: string;
}

export const QUIZ_STEPS: QuizStep[] = [
  {
    title: 'Which scent families\nappeal to you?',
    subtitle: "Pick all that you're drawn to",
    options: [
      { emoji: '🍋', label: 'Fresh & Citrus', sub: 'Clean, bright, zesty' },
      { emoji: '🌹', label: 'Floral', sub: 'Romantic, feminine, blooming' },
      { emoji: '🌲', label: 'Woody & Earthy', sub: 'Deep, grounded, natural' },
      { emoji: '🕌', label: 'Warm & Oriental', sub: 'Rich, exotic, sensual' },
      { emoji: '🌶️', label: 'Spicy', sub: 'Bold, warming, intense' },
      { emoji: '🍫', label: 'Gourmand', sub: 'Sweet, edible, indulgent' },
      { emoji: '🪵', label: 'Oud & Leather', sub: 'Smoky, animalic, luxurious' },
      { emoji: '🌊', label: 'Aquatic & Green', sub: 'Cool, fresh, outdoorsy' },
    ],
  },
  {
    title: 'What notes do\nyou love?',
    subtitle: 'Pick your favorites',
    options: [
      { emoji: '🍦', label: 'Vanilla' },
      { emoji: '🌹', label: 'Rose' },
      { emoji: '🍊', label: 'Bergamot' },
      { emoji: '🪵', label: 'Sandalwood' },
      { emoji: '🌿', label: 'Vetiver' },
      { emoji: '🍯', label: 'Amber' },
      { emoji: '🌸', label: 'Jasmine' },
      { emoji: '🔥', label: 'Oud' },
    ],
  },
  {
    title: 'When do you usually\nwear fragrance?',
    subtitle: 'Select your main occasions',
    options: [
      { emoji: '💼', label: 'Office' },
      { emoji: '🌙', label: 'Date Night' },
      { emoji: '☀️', label: 'Everyday' },
      { emoji: '🎉', label: 'Special Events' },
      { emoji: '🏖️', label: 'Summer Days' },
      { emoji: '❄️', label: 'Winter Nights' },
    ],
  },
  {
    title: 'What matters most\nto you?',
    subtitle: 'Choose your priorities',
    options: [
      { emoji: '⏳', label: 'Long lasting' },
      { emoji: '💨', label: 'Strong projection' },
      { emoji: '🤫', label: 'Subtle & intimate' },
      { emoji: '💎', label: 'Unique & niche' },
      { emoji: '💰', label: 'Great value' },
      { emoji: '🎯', label: 'Versatile' },
    ],
  },
];
