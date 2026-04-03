import { CATEGORY_OPTIONS, ONLINE_CATEGORY_OPTIONS } from '../constants';

export type CategoryIconName =
  | 'deal'
  | 'coffee'
  | 'fitness'
  | 'pet'
  | 'home'
  | 'beauty'
  | 'tech'
  | 'fashion'
  | 'gaming'
  | 'digital'
  | 'food'
  | 'freebies';

export type BusinessCategoryMode = 'local' | 'online';

const LOCAL_CATEGORY_OPTIONS = CATEGORY_OPTIONS.filter((category) => category !== 'All');
const REMOTE_CATEGORY_OPTIONS = ONLINE_CATEGORY_OPTIONS.filter((category) => category !== 'All');

const LOCAL_SUBCATEGORY_OPTIONS: Record<string, readonly string[]> = {
  'Fast Food': ['Burgers', 'Tacos', 'Sandwiches', 'Sweets'],
  Coffee: ['Hot Coffee', 'Iced Coffee', 'Espresso', 'Bakery'],
  Fitness: ['Gyms', 'Protein', 'Supplements', 'Activewear'],
  Pet: ['Grooming', 'Treats', 'Toys', 'Wellness'],
  Home: ['Cleaning', 'Books', 'Furniture', 'Services'],
};

const ONLINE_SUBCATEGORY_OPTIONS: Record<string, readonly string[]> = {
  Tech: [
    'Phones',
    'Laptops',
    'Tablets',
    'Smartwatches',
    'Headphones',
    'Earbuds',
    'Speakers',
    'Gaming',
    'PC Accessories',
    'Keyboards',
    'Mice',
    'Monitors',
    'TVs',
    'Cameras',
    'Drones',
  ],
  Fashion: [
    "Men's Clothing",
    "Women's Clothing",
    'Shoes',
    'Sneakers',
    'Boots',
    'Sandals',
    'Jackets',
    'Hoodies',
    'T-Shirts',
    'Jeans',
    'Dresses',
    'Activewear',
    'Loungewear',
    'Bags',
    'Wallets',
    'Wigs',
  ],
  Gaming: [
    'Consoles',
    'Games',
    'Controllers',
    'Headsets',
    'Keyboards',
    'Mice',
    'Monitors',
    'Gaming Chairs',
  ],
  Digital: [
    'Software',
    'Subscriptions',
    'Courses',
    'Ebooks',
    'Templates',
    'Design Assets',
    'AI Tools',
  ],
  Home: [
    'Furniture',
    'Home Decor',
    'Kitchen',
    'Bedding',
    'Bath',
    'Storage',
    'Cleaning',
    'Appliances',
    'Smart Home',
    'Lighting',
    'Outdoor',
    'Patio',
  ],
  Food: ['Snacks', 'Meal Kits', 'Groceries', 'Drinks', 'Supplements'],
};

const CATEGORY_ICONS: Record<string, CategoryIconName> = {
  'Fast Food': 'deal',
  Coffee: 'coffee',
  Fitness: 'fitness',
  Pet: 'pet',
  Home: 'home',
  Beauty: 'beauty',
  Tech: 'tech',
  Fashion: 'fashion',
  Gaming: 'gaming',
  Digital: 'digital',
  Food: 'food',
  Uncategorized: 'deal',
};

const CATEGORY_ALIASES: Record<string, string> = {
  restaurant: 'Fast Food',
  restaurants: 'Fast Food',
  food: 'Food',
  dining: 'Fast Food',
  burgers: 'Fast Food',
  burger: 'Fast Food',
  tacos: 'Fast Food',
  taco: 'Fast Food',
  cafe: 'Coffee',
  cafes: 'Coffee',
  espresso: 'Coffee',
  coffee: 'Coffee',
  gym: 'Fitness',
  fitness: 'Fitness',
  workout: 'Fitness',
  pets: 'Pet',
  pet: 'Pet',
  dog: 'Pet',
  dogs: 'Pet',
  cat: 'Pet',
  cats: 'Pet',
  furniture: 'Home',
  household: 'Home',
  kitchen: 'Home',
  bedding: 'Home',
  decor: 'Home',
  electronics: 'Tech',
  tech: 'Tech',
  gadget: 'Tech',
  gadgets: 'Tech',
  computer: 'Tech',
  computers: 'Tech',
  office: 'Tech',
  fashion: 'Fashion',
  apparel: 'Fashion',
  clothing: 'Fashion',
  clothes: 'Fashion',
  shoes: 'Fashion',
  sneakers: 'Fashion',
  wig: 'Fashion',
  wigs: 'Fashion',
  weave: 'Fashion',
  beauty: 'Fashion',
  skincare: 'Fashion',
  makeup: 'Fashion',
  gaming: 'Gaming',
  games: 'Gaming',
  game: 'Gaming',
  xbox: 'Gaming',
  playstation: 'Gaming',
  steam: 'Gaming',
  software: 'Digital',
  digital: 'Digital',
  ebook: 'Digital',
  course: 'Digital',
  courses: 'Digital',
  template: 'Digital',
  templates: 'Digital',
  download: 'Digital',
  freebies: 'Food',
  freebie: 'Food',
};

const ONLINE_CATEGORY_KEYWORDS: Record<string, string[]> = {
  Tech: ['laptop', 'monitor', 'headphone', 'charger', 'desk lamp', 'phone', 'camera', 'router', 'usb', 'bluetooth', 'keyboard', 'mouse'],
  Fashion: ['shirt', 'hoodie', 'shoe', 'dress', 'sneaker', 'bag', 'jacket', 'serum', 'skincare', 'makeup', 'watch', 'wig', 'wigs', 'weave', 'lace front'],
  Gaming: ['gaming', 'xbox', 'playstation', 'steam', 'controller', 'nintendo', 'pc game', 'gaming mouse', 'gpu'],
  Digital: ['template', 'download', 'notion', 'canva', 'prompt', 'software', 'saas', 'digital', 'bundle', 'ebook', 'course'],
  Home: ['table', 'chair', 'lamp', 'kitchen', 'bedding', 'pantry', 'console table', 'nightstand', 'sofa', 'storage'],
  Food: ['snack', 'snacks', 'grocery', 'groceries', 'meal kit', 'meal kits', 'beverage', 'protein', 'supplement', 'drink'],
};

const LOCAL_CATEGORY_KEYWORDS: Record<string, string[]> = {
  'Fast Food': ['burger', 'taco', 'fries', 'sandwich', 'pizza', 'burrito', 'combo', 'meal'],
  Coffee: ['coffee', 'latte', 'espresso', 'cold brew', 'cappuccino', 'mocha', 'bagel', 'pastry'],
  Fitness: ['gym', 'fitness', 'workout', 'protein', 'smoothie', 'yoga', 'training'],
  Pet: ['pet', 'dog', 'cat', 'grooming', 'treat', 'toy', 'vet'],
  Home: ['wash', 'clean', 'book', 'furniture', 'repair', 'service', 'delivery'],
};

const canonicalCategoryMap = new Map<string, string>(
  [...LOCAL_CATEGORY_OPTIONS, ...REMOTE_CATEGORY_OPTIONS, 'Uncategorized'].map((category) => [category.toLowerCase(), category]),
);

const normalizeCategoryToken = (value: unknown) =>
  typeof value === 'string'
    ? value.trim().toLowerCase().replace(/&/g, 'and').replace(/\s+/g, ' ')
    : '';

const findCategoryKeywordMatch = (sourceText: string, mode: BusinessCategoryMode) => {
  const matchers = mode === 'online' ? ONLINE_CATEGORY_KEYWORDS : LOCAL_CATEGORY_KEYWORDS;

  for (const [category, keywords] of Object.entries(matchers)) {
    if (keywords.some((keyword) => sourceText.includes(keyword))) {
      return category;
    }
  }

  return null;
};

export const getCategoryOptionsForMode = (mode: BusinessCategoryMode) =>
  mode === 'online' ? [...REMOTE_CATEGORY_OPTIONS] : [...LOCAL_CATEGORY_OPTIONS];

export const getDefaultCategoryForMode = (mode: BusinessCategoryMode) =>
  mode === 'online' ? 'Tech' : 'Fast Food';

export const getSubcategoryOptionsForCategory = (
  mode: BusinessCategoryMode,
  category: string,
) => {
  const normalizedCategory = normalizeCategoryValue(category, mode);
  const options = mode === 'online'
    ? ONLINE_SUBCATEGORY_OPTIONS[normalizedCategory]
    : LOCAL_SUBCATEGORY_OPTIONS[normalizedCategory];
  return options ? [...options] : [];
};

export const normalizeSubcategoryValue = (
  subcategory: unknown,
  mode: BusinessCategoryMode,
  category: string,
) => {
  const normalizedInput = normalizeCategoryToken(subcategory);
  if (!normalizedInput) return '';

  const options = getSubcategoryOptionsForCategory(mode, category);
  const matched = options.find((option) => normalizeCategoryToken(option) === normalizedInput);
  return matched ?? '';
};

export function normalizeCategoryValue(
  category: unknown,
  mode: BusinessCategoryMode,
  contextValues: Array<unknown> = [],
): string {
  const normalizedCategory = normalizeCategoryToken(category);
  const options = new Set<string>(getCategoryOptionsForMode(mode));

  if (normalizedCategory) {
    const canonicalCategory = canonicalCategoryMap.get(normalizedCategory);
    if (canonicalCategory && options.has(canonicalCategory)) {
      return canonicalCategory;
    }

    const aliasCategory = CATEGORY_ALIASES[normalizedCategory];
    if (aliasCategory && options.has(aliasCategory)) {
      return aliasCategory;
    }
  }

  const normalizedContext = contextValues
    .map((value) => normalizeCategoryToken(value))
    .filter(Boolean)
    .join(' ');

  const keywordCategory = normalizedContext ? findCategoryKeywordMatch(normalizedContext, mode) : null;
  if (keywordCategory && options.has(keywordCategory)) {
    return keywordCategory;
  }

  return getDefaultCategoryForMode(mode);
}

export function getCategoryLabel(category: string): string {
  const normalized = typeof category === 'string' ? category.trim() : '';
  if (!normalized) return 'Uncategorized';

  return canonicalCategoryMap.get(normalized.toLowerCase()) ?? normalized;
}

export function getCategoryIconName(category: string): CategoryIconName {
  return CATEGORY_ICONS[getCategoryLabel(category)] ?? 'deal';
}
