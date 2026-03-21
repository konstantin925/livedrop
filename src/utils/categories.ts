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
  | 'freebies';

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
  Freebies: 'freebies',
};

export function getCategoryLabel(category: string): string {
  return category;
}

export function getCategoryIconName(category: string): CategoryIconName {
  return CATEGORY_ICONS[category] ?? 'deal';
}

