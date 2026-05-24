export function SublyLogo({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="36" height="36" rx="9" fill="#4f46e5" />
      <path d="M18 7L29 13.5V26.5H7V13.5L18 7Z" fill="white" fillOpacity="0.95" />
      <rect x="14.5" y="20" width="7" height="8" rx="1.5" fill="#4f46e5" />
      <circle cx="18" cy="17" r="2" fill="#4f46e5" />
    </svg>
  );
}
