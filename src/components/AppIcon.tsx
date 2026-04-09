import React from 'react';

export type IconName =
  | 'live'
  | 'play'
  | 'online'
  | 'catalog'
  | 'claims'
  | 'portal'
  | 'bell'
  | 'pin'
  | 'logout'
  | 'close'
  | 'users'
  | 'clock'
  | 'refresh'
  | 'spark'
  | 'debug'
  | 'alert'
  | 'external'
  | 'percent'
  | 'plus'
  | 'search'
  | 'thumbs-up'
  | 'thumbs-down'
  | 'like'
  | 'dislike'
  | 'share'
  | 'trash'
  | 'check'
  | 'shield'
  | 'google'
  | 'mail'
  | 'store'
  | 'tag'
  | 'info'
  | 'link'
  | 'image'
  | 'trending'
  | 'ending'
  | 'dropped'
  | 'grid'
  | 'deal'
  | 'home'
  | 'coffee'
  | 'fitness'
  | 'pet'
  | 'beauty'
  | 'tech'
  | 'fashion'
  | 'gaming'
  | 'digital'
  | 'food'
  | 'freebies';

interface AppIconProps {
  name: IconName;
  size?: number;
  className?: string;
  strokeWidth?: number;
}

const paths: Record<IconName, React.ReactNode> = {
  live: (
    <>
      <path d="M10 4L6.5 12.5H11L9 20L17.5 10.5H13L15.5 4H10Z" />
    </>
  ),
  play: (
    <>
      <path d="M9 7.5L16.5 12L9 16.5V7.5Z" />
    </>
  ),
  online: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M4 12H20" />
      <path d="M12 4C9.5 6.4 8 9.1 8 12C8 14.9 9.5 17.6 12 20" />
      <path d="M12 4C14.5 6.4 16 9.1 16 12C16 14.9 14.5 17.6 12 20" />
    </>
  ),
  catalog: (
    <>
      <path d="M7 4.5H17C18.1 4.5 19 5.4 19 6.5V20L12 16L5 20V6.5C5 5.4 5.9 4.5 7 4.5Z" />
    </>
  ),
  claims: (
    <>
      <path d="M7.5 6.5H16.5L18.5 9L16.5 11.5L18.5 14L16.5 16.5H7.5L5.5 14L7.5 11.5L5.5 9L7.5 6.5Z" />
      <path d="M10 9.5H14" />
      <path d="M10 13.5H14" />
    </>
  ),
  portal: (
    <>
      <path d="M5 9.5H19V18C19 19.1 18.1 20 17 20H7C5.9 20 5 19.1 5 18V9.5Z" />
      <path d="M9 9.5V7.8C9 6.3 10.3 5 11.8 5H12.2C13.7 5 15 6.3 15 7.8V9.5" />
    </>
  ),
  bell: (
    <>
      <path d="M8 17H16" />
      <path d="M9 17C9 18.7 10.3 20 12 20C13.7 20 15 18.7 15 17" />
      <path d="M7.2 10.2C7.2 7.4 9.4 5 12 5C14.6 5 16.8 7.4 16.8 10.2V13.7L18.5 16.2H5.5L7.2 13.7V10.2Z" />
    </>
  ),
  pin: (
    <>
      <path d="M12 20C12 20 17 14.7 17 10.5C17 7.5 14.8 5 12 5C9.2 5 7 7.5 7 10.5C7 14.7 12 20 12 20Z" />
      <circle cx="12" cy="10.5" r="1.8" />
    </>
  ),
  logout: (
    <>
      <path d="M10 6H7C5.9 6 5 6.9 5 8V16C5 17.1 5.9 18 7 18H10" />
      <path d="M13 8L18 12L13 16" />
      <path d="M18 12H9" />
    </>
  ),
  close: (
    <>
      <path d="M7 7L17 17" />
      <path d="M17 7L7 17" />
    </>
  ),
  users: (
    <>
      <path d="M9 11.5C10.7 11.5 12 10.2 12 8.5C12 6.8 10.7 5.5 9 5.5C7.3 5.5 6 6.8 6 8.5C6 10.2 7.3 11.5 9 11.5Z" />
      <path d="M16 10.5C17.4 10.5 18.5 9.4 18.5 8C18.5 6.6 17.4 5.5 16 5.5" />
      <path d="M4.8 18C5.4 15.9 7 14.8 9 14.8C11 14.8 12.6 15.9 13.2 18" />
      <path d="M14.5 14.9C16 15.2 17.1 16.1 17.6 17.5" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8V12L15 14" />
    </>
  ),
  refresh: (
    <>
      <path d="M18 9V5H14" />
      <path d="M6 15V19H10" />
      <path d="M18 5C16.7 3.8 14.9 3 13 3C8.6 3 5 6.6 5 11" />
      <path d="M6 19C7.3 20.2 9.1 21 11 21C15.4 21 19 17.4 19 13" />
    </>
  ),
  spark: (
    <>
      <path d="M12 4L13.7 8.3L18 10L13.7 11.7L12 16L10.3 11.7L6 10L10.3 8.3L12 4Z" />
    </>
  ),
  debug: (
    <>
      <path d="M9 4H15" />
      <path d="M10 7H14C16.2 7 18 8.8 18 11V13C18 15.2 16.2 17 14 17H10C7.8 17 6 15.2 6 13V11C6 8.8 7.8 7 10 7Z" />
      <path d="M4 10H6" />
      <path d="M18 10H20" />
      <path d="M4 14H6" />
      <path d="M18 14H20" />
      <circle cx="10" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle cx="14" cy="12" r="1" fill="currentColor" stroke="none" />
    </>
  ),
  alert: (
    <>
      <path d="M12 5L19 18H5L12 5Z" />
      <path d="M12 10V13" />
      <circle cx="12" cy="16" r="0.8" fill="currentColor" stroke="none" />
    </>
  ),
  external: (
    <>
      <path d="M13 5H19V11" />
      <path d="M19 5L11 13" />
      <path d="M10 7H8C6.9 7 6 7.9 6 9V16C6 17.1 6.9 18 8 18H15C16.1 18 17 17.1 17 16V14" />
    </>
  ),
  percent: (
    <>
      <path d="M7 17L17 7" />
      <circle cx="8.5" cy="8.5" r="1.7" />
      <circle cx="15.5" cy="15.5" r="1.7" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="5.5" />
      <path d="M15.5 15.5L19 19" />
    </>
  ),
  'thumbs-up': (
    <>
      <path d="M7.5 10.5V18.5" />
      <path d="M7.5 10.5L10.5 6.8C10.9 6.2 11.6 5.8 12.3 5.8H12.9C14 5.8 14.9 6.7 14.9 7.8V10.5H17.3C18.5 10.5 19.3 11.7 18.9 12.8L17.6 17.1C17.4 18 16.6 18.5 15.7 18.5H7.5" />
      <path d="M5.5 10.5H7.5V18.5H6.6C5.7 18.5 5 17.8 5 16.9V12.1C5 11.2 5.7 10.5 6.6 10.5H7.5Z" />
    </>
  ),
  'thumbs-down': (
    <>
      <path d="M16.5 13.5V5.5" />
      <path d="M16.5 13.5L13.5 17.2C13.1 17.8 12.4 18.2 11.7 18.2H11.1C10 18.2 9.1 17.3 9.1 16.2V13.5H6.7C5.5 13.5 4.7 12.3 5.1 11.2L6.4 6.9C6.6 6 7.4 5.5 8.3 5.5H16.5" />
      <path d="M18.5 13.5H16.5V5.5H17.4C18.3 5.5 19 6.2 19 7.1V11.9C19 12.8 18.3 13.5 17.4 13.5H16.5Z" />
    </>
  ),
  plus: (
    <>
      <path d="M12 6V18" />
      <path d="M6 12H18" />
    </>
  ),
  like: (
    <>
      <path d="M9 11.5V18.5" />
      <path d="M9 11.5L11.2 6.8C11.5 6.1 12.1 5.6 12.8 5.6H13.2C14.3 5.6 15.2 6.5 15.2 7.6V10H17.1C18.3 10 19.1 11.2 18.7 12.3L17.2 17.1C16.9 18 16.1 18.5 15.2 18.5H9" />
      <path d="M6 11.5H9V18.5H6.8C6 18.5 5.3 17.8 5.3 17V13C5.3 12.2 6 11.5 6.8 11.5H9Z" />
    </>
  ),
  dislike: (
    <>
      <path d="M15 12.5V5.5" />
      <path d="M15 12.5L12.8 17.2C12.5 17.9 11.9 18.4 11.2 18.4H10.8C9.7 18.4 8.8 17.5 8.8 16.4V14H6.9C5.7 14 4.9 12.8 5.3 11.7L6.8 6.9C7.1 6 7.9 5.5 8.8 5.5H15" />
      <path d="M18 12.5H15V5.5H17.2C18 5.5 18.7 6.2 18.7 7V11C18.7 11.8 18 12.5 17.2 12.5H15Z" />
    </>
  ),
  share: (
    <>
      <circle cx="7" cy="12" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="16.8" cy="7" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="16.8" cy="17" r="1.6" fill="currentColor" stroke="none" />
      <path d="M8.5 11.2L15 7.8" />
      <path d="M8.5 12.8L15 16.2" />
    </>
  ),
  trash: (
    <>
      <path d="M7 8H17" />
      <path d="M9 8V6.8C9 5.8 9.8 5 10.8 5H13.2C14.2 5 15 5.8 15 6.8V8" />
      <path d="M8 8L8.7 18C8.8 18.9 9.5 19.5 10.4 19.5H13.6C14.5 19.5 15.2 18.9 15.3 18L16 8" />
      <path d="M10.5 11V16" />
      <path d="M13.5 11V16" />
    </>
  ),
  check: (
    <>
      <path d="M6.5 12.5L10.2 16L17.5 8.5" />
    </>
  ),
  shield: (
    <>
      <path d="M12 4L18 6.5V11.5C18 15.6 15.5 18.8 12 20C8.5 18.8 6 15.6 6 11.5V6.5L12 4Z" />
      <path d="M9.2 12.3L11.2 14.3L15.1 10.4" />
    </>
  ),
  google: (
    <>
      <path d="M12 5C8.5 5 5.5 7.9 5.5 11.5C5.5 15.1 8.5 18 12 18C15 18 17.6 15.8 18.2 12.8H12.5" />
      <path d="M18.2 12.8C18.3 12.4 18.4 12 18.4 11.5C18.4 11.1 18.3 10.7 18.2 10.3" />
      <path d="M8.1 8.1C9.1 7 10.5 6.3 12 6.3C13.3 6.3 14.4 6.8 15.3 7.6" />
    </>
  ),
  mail: (
    <>
      <path d="M5 8C5 6.9 5.9 6 7 6H17C18.1 6 19 6.9 19 8V16C19 17.1 18.1 18 17 18H7C5.9 18 5 17.1 5 16V8Z" />
      <path d="M6 8L12 12.5L18 8" />
    </>
  ),
  store: (
    <>
      <path d="M5.5 10L6.5 6H17.5L18.5 10" />
      <path d="M6 10.5V17.5C6 18.3 6.7 19 7.5 19H16.5C17.3 19 18 18.3 18 17.5V10.5" />
      <path d="M10 19V14H14V19" />
    </>
  ),
  tag: (
    <>
      <path d="M10 5H17L19 7V14L12 21L5 14V7L7 5H10Z" />
      <circle cx="14.5" cy="9.5" r="1" fill="currentColor" stroke="none" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 10.5V15" />
      <circle cx="12" cy="8" r="0.8" fill="currentColor" stroke="none" />
    </>
  ),
  link: (
    <>
      <path d="M10 14L14 10" />
      <path d="M9 8H8C6.3 8 5 9.3 5 11C5 12.7 6.3 14 8 14H10" />
      <path d="M14 10H16C17.7 10 19 11.3 19 13C19 14.7 17.7 16 16 16H14" />
    </>
  ),
  image: (
    <>
      <rect x="5" y="6" width="14" height="12" rx="2.5" />
      <circle cx="10" cy="10" r="1.2" />
      <path d="M7 15L10.5 11.5L13.5 14.5L15.5 12.5L17 14" />
    </>
  ),
  trending: (
    <>
      <path d="M6 16L10 12L13 14L18 8" />
      <path d="M14 8H18V12" />
    </>
  ),
  ending: (
    <>
      <path d="M9 5H15" />
      <path d="M9 19H15" />
      <path d="M10 5V8L8 11L10 14V19" />
      <path d="M14 5V8L16 11L14 14V19" />
    </>
  ),
  dropped: (
    <>
      <path d="M12 4C12 4 7 10 7 13.5C7 16.5 9.2 19 12 19C14.8 19 17 16.5 17 13.5C17 10 12 4 12 4Z" />
      <path d="M12 9V15" />
    </>
  ),
  grid: (
    <>
      <rect x="4.9" y="4.9" width="6.1" height="6.1" rx="1.95" />
      <rect x="13" y="4.9" width="6.1" height="6.1" rx="1.95" />
      <rect x="4.9" y="13" width="6.1" height="6.1" rx="1.95" />
      <rect x="13" y="13" width="6.1" height="6.1" rx="1.95" />
      <circle cx="12" cy="12" r="0.95" fill="currentColor" stroke="none" />
    </>
  ),
  deal: (
    <>
      <path d="M7 7H14L18 11L14 15H7L5 13V9L7 7Z" />
      <circle cx="9.5" cy="11" r="0.9" fill="currentColor" stroke="none" />
    </>
  ),
  home: (
    <>
      <path d="M5.8 10.9L12 5.8L18.2 10.9" />
      <path d="M7.4 10.6V18.4H16.6V10.6" />
      <path d="M10.6 18.4V14.6C10.6 13.7 11.2 13.1 12 13.1C12.8 13.1 13.4 13.7 13.4 14.6V18.4" />
      <path d="M9.4 9.3H14.6" />
    </>
  ),
  coffee: (
    <>
      <path d="M7 9H15V13C15 15.2 13.2 17 11 17C8.8 17 7 15.2 7 13V9Z" />
      <path d="M15 10H16C17.1 10 18 10.9 18 12C18 13.1 17.1 14 16 14H15" />
      <path d="M8 19H16" />
      <path d="M9 6V8" />
      <path d="M12 5V8" />
    </>
  ),
  fitness: (
    <>
      <path d="M8 10L6.5 11.5L8.5 13.5L10 12" />
      <path d="M16 10L17.5 11.5L15.5 13.5L14 12" />
      <path d="M10 12L14 12" />
      <path d="M9 8.5L11.5 11L9 13.5" />
      <path d="M15 8.5L12.5 11L15 13.5" />
    </>
  ),
  pet: (
    <>
      <circle cx="9" cy="8.5" r="1.4" />
      <circle cx="15" cy="8.5" r="1.4" />
      <circle cx="7.2" cy="12" r="1.3" />
      <circle cx="16.8" cy="12" r="1.3" />
      <path d="M12 11.8C9.7 11.8 8 13.5 8 15.6C8 17.5 9.4 19 11.2 19C11.8 19 12.2 18.7 12.5 18.3C12.8 18.7 13.2 19 13.8 19C15.6 19 17 17.5 17 15.6C17 13.5 15.3 11.8 13 11.8H12Z" />
    </>
  ),
  beauty: (
    <>
      <path d="M9 6.5L14.5 12L10.5 16L5 10.5L9 6.5Z" />
      <path d="M14.5 12L17.5 15" />
      <path d="M8.5 7L17 15.5" />
    </>
  ),
  tech: (
    <>
      <rect x="5.8" y="6.1" width="12.4" height="8.8" rx="2.25" />
      <path d="M10.1 18.5H13.9" />
      <path d="M12 14.9V18.5" />
      <path d="M8.7 8.9H15.3" />
      <path d="M8.7 11.3H13.9" />
      <path d="M18.2 9.3H19.3" />
      <path d="M18.2 11.7H19.3" />
    </>
  ),
  fashion: (
    <>
      <path d="M7 10.3H17V17.9C17 18.9 16.2 19.8 15.2 19.8H8.8C7.8 19.8 7 18.9 7 17.9V10.3Z" />
      <path d="M9.3 10.3V8.8C9.3 7.2 10.5 5.9 12 5.9C13.5 5.9 14.7 7.2 14.7 8.8V10.3" />
      <path d="M10.6 14.3H13.4" />
      <path d="M12 12.9V15.7" />
    </>
  ),
  gaming: (
    <>
      <path d="M8 9.5H16C18 9.5 19.3 11.3 18.9 13.1L18.3 15.4C18 16.9 16.4 17.7 15.2 16.9L13.2 15.8C12.5 15.4 11.5 15.4 10.8 15.8L8.8 16.9C7.6 17.7 6 16.9 5.7 15.4L5.1 13.1C4.7 11.3 6 9.5 8 9.5Z" />
      <path d="M9.1 12.4H11.7" />
      <path d="M10.4 11.1V13.7" />
      <circle cx="14.9" cy="11.8" r="0.85" fill="currentColor" stroke="none" />
      <circle cx="16.5" cy="13.4" r="0.85" fill="currentColor" stroke="none" />
    </>
  ),
  digital: (
    <>
      <path d="M12 4.7L13.8 8.5L17.6 10.3L13.8 12.1L12 15.9L10.2 12.1L6.4 10.3L10.2 8.5L12 4.7Z" />
      <path d="M17.2 13.3L19.4 18.5L16.8 17.8L16 20.4L13.8 15.2L17.2 13.3Z" />
    </>
  ),
  food: (
    <>
      <path d="M7 9.9H17L16.3 18C16.2 18.9 15.5 19.6 14.6 19.6H9.4C8.5 19.6 7.8 18.9 7.7 18L7 9.9Z" />
      <path d="M9.2 9.9V8C9.2 6.5 10.4 5.4 11.8 5.4H12.2C13.6 5.4 14.8 6.5 14.8 8V9.9" />
      <path d="M10 13H14" />
      <path d="M10.2 15.7H13.8" />
      <circle cx="15.8" cy="8.5" r="0.9" fill="currentColor" stroke="none" />
    </>
  ),
  freebies: (
    <>
      <path d="M6 10H18V18C18 19.1 17.1 20 16 20H8C6.9 20 6 19.1 6 18V10Z" />
      <path d="M12 10V20" />
      <path d="M6 13H18" />
      <path d="M9.5 10C8.1 10 7 8.9 7 7.5C7 6.1 8.1 5 9.5 5C11.5 5 12 7 12 8.5V10H9.5Z" />
      <path d="M14.5 10C15.9 10 17 8.9 17 7.5C17 6.1 15.9 5 14.5 5C12.5 5 12 7 12 8.5V10H14.5Z" />
    </>
  ),
};

export const AppIcon: React.FC<AppIconProps> = ({
  name,
  size = 20,
  className = '',
  strokeWidth = 1.9,
}) => {
  const renderedSize = size * 2;

  return (
    <svg
      viewBox="0 0 24 24"
      width={renderedSize}
      height={renderedSize}
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
};
