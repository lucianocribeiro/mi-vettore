import type { ReactNode, SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function SI({ size = 16, children, className, ...rest }: IconProps & { children: ReactNode }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={{ flexShrink: 0 }}
      {...rest}
    >
      {children}
    </svg>
  );
}

export const Calendar = (p: IconProps) => (
  <SI {...p}>
    <rect width="18" height="18" x="3" y="4" rx="2" />
    <line x1="16" x2="16" y1="2" y2="6" />
    <line x1="8" x2="8" y1="2" y2="6" />
    <line x1="3" x2="21" y1="10" y2="10" />
  </SI>
);

export const MessageSquare = (p: IconProps) => (
  <SI {...p}>
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </SI>
);

export const AlertCircle = (p: IconProps) => (
  <SI {...p}>
    <circle cx="12" cy="12" r="10" />
    <line x1="12" x2="12" y1="8" y2="12" />
    <line x1="12" x2="12.01" y1="16" y2="16" />
  </SI>
);

export const CreditCard = (p: IconProps) => (
  <SI {...p}>
    <rect width="20" height="14" x="2" y="5" rx="2" />
    <line x1="2" x2="22" y1="10" y2="10" />
  </SI>
);

export const Wrench = (p: IconProps) => (
  <SI {...p}>
    <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
  </SI>
);

export const Settings = (p: IconProps) => (
  <SI {...p}>
    <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
    <circle cx="12" cy="12" r="3" />
  </SI>
);

export const Search = (p: IconProps) => (
  <SI {...p}>
    <circle cx="11" cy="11" r="8" />
    <path d="m21 21-4.3-4.3" />
  </SI>
);

export const Truck = (p: IconProps) => (
  <SI {...p}>
    <path d="M5 17H3a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v3" />
    <rect width="9" height="11" x="11" y="11" rx="1" />
    <circle cx="7" cy="20" r="2" />
    <circle cx="17" cy="20" r="2" />
  </SI>
);

export const Menu = (p: IconProps) => (
  <SI {...p}>
    <line x1="4" x2="20" y1="12" y2="12" />
    <line x1="4" x2="20" y1="6" y2="6" />
    <line x1="4" x2="20" y1="18" y2="18" />
  </SI>
);

export const X = (p: IconProps) => (
  <SI {...p}>
    <path d="M18 6 6 18" />
    <path d="m6 6 12 12" />
  </SI>
);

export const Pencil = (p: IconProps) => (
  <SI {...p}>
    <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
    <path d="m15 5 4 4" />
  </SI>
);

export const Plus = (p: IconProps) => (
  <SI {...p}>
    <path d="M5 12h14" />
    <path d="M12 5v14" />
  </SI>
);

export const Eye = (p: IconProps) => (
  <SI {...p}>
    <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
    <circle cx="12" cy="12" r="3" />
  </SI>
);

export const Check = (p: IconProps) => (
  <SI {...p}>
    <path d="M20 6 9 17l-5-5" />
  </SI>
);

export const Bell = (p: IconProps) => (
  <SI {...p}>
    <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
    <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
  </SI>
);

export const AlertTriangle = (p: IconProps) => (
  <SI {...p}>
    <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
    <path d="M12 9v4" />
    <path d="M12 17h.01" />
  </SI>
);

export const ChevronLeft = (p: IconProps) => (
  <SI {...p}>
    <path d="m15 18-6-6 6-6" />
  </SI>
);

export const ChevronRight = (p: IconProps) => (
  <SI {...p}>
    <path d="m9 18 6-6-6-6" />
  </SI>
);

export const ChevronDown = (p: IconProps) => (
  <SI {...p}>
    <path d="m6 9 6 6 6-6" />
  </SI>
);

export const Lock = (p: IconProps) => (
  <SI {...p}>
    <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </SI>
);

export const Paperclip = (p: IconProps) => (
  <SI {...p}>
    <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
  </SI>
);

export const Upload = (p: IconProps) => (
  <SI {...p}>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="17 8 12 3 7 8" />
    <line x1="12" x2="12" y1="3" y2="15" />
  </SI>
);

export const FileText = (p: IconProps) => (
  <SI {...p}>
    <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
    <path d="M14 2v4a2 2 0 0 0 2 2h4" />
    <path d="M10 9H8" />
    <path d="M16 13H8" />
    <path d="M16 17H8" />
  </SI>
);

export const Clock = (p: IconProps) => (
  <SI {...p}>
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </SI>
);

export const Download = (p: IconProps) => (
  <SI {...p}>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" x2="12" y1="15" y2="3" />
  </SI>
);

export const Sun = (p: IconProps) => (
  <SI {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2" />
    <path d="M12 20v2" />
    <path d="m4.93 4.93 1.41 1.41" />
    <path d="m17.66 17.66 1.41 1.41" />
    <path d="M2 12h2" />
    <path d="M20 12h2" />
    <path d="m6.34 17.66-1.41 1.41" />
    <path d="m19.07 4.93-1.41 1.41" />
  </SI>
);

export const Moon = (p: IconProps) => (
  <SI {...p}>
    <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
  </SI>
);

export const Folder = (p: IconProps) => (
  <SI {...p}>
    <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.64 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
  </SI>
);
