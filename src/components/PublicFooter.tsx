import React from 'react';
import brandBoltLogo from '../assets/logo-bolt.svg';

type PublicFooterProps = {
  onNavigate?: (path: string) => void;
};

const FOOTER_LINKS = [
  { label: 'About', href: '/about' },
  { label: 'Contact', href: '/contact' },
  { label: 'Privacy Policy', href: '/privacy' },
  { label: 'Terms of Service', href: '/terms' },
  { label: 'Affiliate Disclosure', href: '/affiliate-disclosure' },
];

export const PublicFooter: React.FC<PublicFooterProps> = ({ onNavigate }) => {
  const handleNavigate = (href: string) => (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (!onNavigate) return;
    event.preventDefault();
    onNavigate(href);
  };

  return (
    <footer className="border-t border-white/80 bg-white/95 py-6 shadow-[0_-12px_28px_rgba(148,163,184,0.08)] livedrop-shell-x-desktop">
      <div className="livedrop-content-wrap flex w-full flex-col gap-6">
        <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
          <div className="max-w-[360px]">
            <div className="flex items-center gap-2">
              <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-indigo-50 text-indigo-600">
                <img src={brandBoltLogo} alt="LiveDrop logo" className="h-6 w-6 object-contain" />
              </div>
              <div className="flex items-baseline gap-0.5">
                <span className="text-lg font-black tracking-[-0.04em] text-slate-800">LIVE</span>
                <span className="text-lg font-black tracking-[-0.04em] text-indigo-600">DROP</span>
              </div>
            </div>
            <p className="mt-3 text-sm leading-6 text-slate-500">
              LiveDrop curates time-sensitive deals from trusted online brands and local partners so
              you can shop smarter, faster, and with confidence.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
            <div className="space-y-2">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Company</p>
              <a
                href="/about"
                onClick={handleNavigate('/about')}
                className="block font-semibold text-slate-600 hover:text-indigo-600"
              >
                About
              </a>
              <a
                href="/contact"
                onClick={handleNavigate('/contact')}
                className="block font-semibold text-slate-600 hover:text-indigo-600"
              >
                Contact
              </a>
            </div>
            <div className="space-y-2">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Legal</p>
              <a
                href="/privacy"
                onClick={handleNavigate('/privacy')}
                className="block font-semibold text-slate-600 hover:text-indigo-600"
              >
                Privacy Policy
              </a>
              <a
                href="/terms"
                onClick={handleNavigate('/terms')}
                className="block font-semibold text-slate-600 hover:text-indigo-600"
              >
                Terms of Service
              </a>
              <a
                href="/affiliate-disclosure"
                onClick={handleNavigate('/affiliate-disclosure')}
                className="block font-semibold text-slate-600 hover:text-indigo-600"
              >
                Affiliate Disclosure
              </a>
            </div>
            <div className="space-y-2">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Support</p>
              <p className="text-sm font-semibold text-slate-600">support@livedrop.sale</p>
              <p className="text-sm font-semibold text-slate-600">partners@livedrop.sale</p>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2 border-t border-slate-100 pt-4 text-[11px] font-semibold text-slate-400 sm:flex-row sm:items-center sm:justify-between">
          <span>© 2026 LiveDrop. All rights reserved.</span>
          <div className="flex flex-wrap gap-3">
            {FOOTER_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={handleNavigate(link.href)}
                className="uppercase tracking-[0.12em] text-slate-400 hover:text-indigo-500"
              >
                {link.label}
              </a>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
};
