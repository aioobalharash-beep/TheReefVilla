import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { Calendar as CalendarIcon, Instagram, MessageCircle, MapPin, Check } from 'lucide-react';
import { OptimizedImage } from './OptimizedImage';
import { getPropertyDetails } from '../services/firestoreLite';
import { useTranslation } from 'react-i18next';
import { bl, type BilingualField } from '../utils/bilingual';
import { getClientConfig, whatsappHref } from '../config/clientConfig';

interface DayUseSlotRates {
  sunday_rate?: number;
  monday_rate?: number;
  tuesday_rate?: number;
  wednesday_rate?: number;
  thursday_rate?: number;
  friday_rate?: number;
  saturday_rate?: number;
  disabled_days?: number[];
}

interface PricingSettings {
  sunday_rate?: number;
  monday_rate?: number;
  tuesday_rate?: number;
  wednesday_rate?: number;
  thursday_rate?: number;
  friday_rate?: number;
  saturday_rate?: number;
  day_use_rate?: number;
  weekday_rate?: number;
  event_rate?: number;
  day_use_slots?: DayUseSlotRates[];
  special_dates?: { date: string; day_use_price?: number; night_stay_price?: number; price?: number }[];
  discount?: { enabled: boolean; type: 'percent' | 'flat'; value: number; start_date: string; end_date: string };
}

const SLOT_DAY_KEYS = [
  'sunday_rate', 'monday_rate', 'tuesday_rate', 'wednesday_rate',
  'thursday_rate', 'friday_rate', 'saturday_rate',
] as const;

const getMinPrice = (pricing: PricingSettings | undefined, fallback: number): number => {
  if (!pricing) return fallback;
  const nightRates = [
    pricing.sunday_rate, pricing.monday_rate, pricing.tuesday_rate,
    pricing.wednesday_rate, pricing.thursday_rate, pricing.friday_rate,
    pricing.saturday_rate,
    pricing.weekday_rate, // legacy
  ];
  // Day-use floor: when slots exist, only their bookable (non-removed) weekday
  // rates count — the legacy flat day_use_rate is a fallback that's never
  // charged once slots are configured, so it must not drag the "From" price down.
  const slots = pricing.day_use_slots || [];
  const slotRates = slots.flatMap(slot =>
    SLOT_DAY_KEYS
      .map((key, dow) => ({ rate: slot[key], dow }))
      .filter(({ dow }) => !(slot.disabled_days || []).includes(dow))
      .map(({ rate }) => rate),
  );
  const dayUseRates = slots.length > 0 ? slotRates : [pricing.day_use_rate];
  const specialPrices = (pricing.special_dates || []).flatMap(s => [s.day_use_price, s.night_stay_price, s.price]);
  const allRates = [
    ...nightRates,
    ...dayUseRates,
    pricing.event_rate,
    ...specialPrices,
  ].filter((r): r is number => typeof r === 'number' && r > 0);

  if (allRates.length === 0) return fallback;
  let minRate = Math.min(...allRates);
  if (pricing.discount?.enabled && pricing.discount.value > 0) {
    if (pricing.discount.type === 'percent') {
      minRate = Math.round(minRate * (1 - pricing.discount.value / 100));
    } else {
      minRate = Math.max(0, minRate - pricing.discount.value);
    }
  }
  return minRate;
};

interface FeatureItem {
  en: string;
  ar: string;
}

interface FeatureSection {
  titleEn: string;
  titleAr: string;
  items: FeatureItem[];
}

interface PropertyDetails {
  name: string | BilingualField;
  capacity: number;
  area_sqm: number;
  nightly_rate: number;
  headline: string | BilingualField;
  description: string | BilingualField;
  featureSections: FeatureSection[];
  gallery: { url: string; label: string }[];
  pricing?: PricingSettings;
  footerText?: string | BilingualField;
  whatsappNumber?: string;
  licenseNumber?: string;
}

const DEFAULTS: PropertyDetails = {
  name: 'Reef Villa',
  capacity: 12,
  area_sqm: 850,
  nightly_rate: 120,
  headline: 'Curated Excellence',
  description: 'Nestled in the heart of the Omani landscape, Reef Villa offers an unparalleled blend of modern comfort and heritage-inspired architecture. Every corner of this estate has been curated to provide a seamless flow between indoor relaxation and outdoor majesty.',
  featureSections: [],
  gallery: [
    { url: 'https://picsum.photos/seed/oman-bedroom-1/800/1000', label: 'Master Suite: Serene Sands' },
    { url: 'https://picsum.photos/seed/oman-bedroom-2/800/1000', label: 'Guest Wing: Golden Hour' },
    { url: 'https://picsum.photos/seed/oman-kitchen/800/1000', label: 'Culinary Studio' },
  ],
};

// Last-known property content is cached here so repeat visits paint real
// content instantly instead of waiting on a Firestore round-trip.
const PROPERTY_CACHE_KEY = 'reef_property_details_v1';

interface FooterProps {
  chaletName: string;
  footerText: string;
  whatsappNumber: string;
  licenseNumber: string;
  termsLabel: string;
  aboutLabel: string;
  onTerms: () => void;
  onAbout: () => void;
}

const Footer = React.memo<FooterProps>(({ chaletName, footerText, whatsappNumber, licenseNumber, termsLabel, aboutLabel, onTerms, onAbout }) => {
  const { t } = useTranslation();
  const config = getClientConfig();
  const waHref = whatsappHref(config.social.whatsapp) || whatsappHref(whatsappNumber);
  const year = new Date().getFullYear();
  return (
    <footer className="w-full py-10 sm:py-12 px-6 sm:px-8 bg-white border-t border-primary-navy/5 flex flex-col items-center gap-5 sm:gap-6">
      <div className="text-secondary-gold font-bold font-headline text-xl">{chaletName}</div>
      {footerText ? (
        <p className="text-xs text-center text-primary-navy/60 leading-relaxed max-w-xs whitespace-pre-line">
          {footerText}
        </p>
      ) : (
        <p className="text-xs text-center text-primary-navy/60 leading-relaxed max-w-xs">
          &copy; {year} {chaletName}
        </p>
      )}
      {licenseNumber && (
        <div className="text-[10px] text-primary-navy/30 uppercase font-bold tracking-widest text-center">
          {t('sanctuary.tourismLicense')}: {licenseNumber}
        </div>
      )}
      <div className="flex gap-6 items-center">
        <button onClick={onTerms} className="text-xs text-primary-navy/60 underline font-bold">{termsLabel}</button>
        <button onClick={onAbout} className="text-xs text-primary-navy/60 underline font-bold">{aboutLabel}</button>
      </div>
      <div className="flex gap-6 mt-2 items-center">
        {waHref && (
          <a
            href={waHref}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="WhatsApp"
            className="flex items-center gap-2 text-primary-navy/60 hover:text-secondary-gold transition-colors"
          >
            <MessageCircle size={20} />
            <span className="text-xs font-bold">WhatsApp</span>
          </a>
        )}
        <a
          href={getClientConfig().social.instagram || 'https://www.instagram.com/reef.villa.om/'}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Instagram"
          className="flex items-center gap-2 text-primary-navy/60 hover:text-secondary-gold transition-colors"
        >
          <Instagram size={20} />
          <span className="text-xs font-bold">Instagram</span>
        </a>
        <a
          href={getClientConfig().location.mapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Location"
          className="flex items-center gap-2 text-primary-navy/60 hover:text-secondary-gold transition-colors"
        >
          <MapPin size={20} />
          <span className="text-xs font-bold">
            <span dir="rtl" lang="ar">الموقع</span>
            <span className="mx-1 text-secondary-gold/70" aria-hidden="true">|</span>
            <span dir="ltr" lang="en">Location</span>
          </span>
        </a>
      </div>
      {footerText && (
        <p className="text-[10px] text-center text-primary-navy/40 font-bold">
          &copy; {year} {chaletName}
        </p>
      )}
    </footer>
  );
});
Footer.displayName = 'Footer';

export const Sanctuary: React.FC = () => {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  // First paint always uses DEFAULTS so the prerendered (build-time) HTML and
  // the first client render are identical — no hydration mismatch. The cached
  // content (repeat visits) is adopted in the mount effect below, then live
  // Firestore data overrides it.
  const [data, setData] = useState<PropertyDetails>(DEFAULTS);
  const [loading, setLoading] = useState(false);

  // Adopt last-known cached content instantly on the client (repeat visits).
  useEffect(() => {
    try {
      const raw = typeof localStorage !== 'undefined'
        ? localStorage.getItem(PROPERTY_CACHE_KEY)
        : null;
      if (raw) setData({ ...DEFAULTS, ...(JSON.parse(raw) as PropertyDetails) });
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    let active = true;
    // One-shot lite read — realtime isn't needed for the public landing, and
    // the cache below keeps repeat visits instant.
    getPropertyDetails()
      .then(fresh => {
        if (!active || !fresh) return;
        setData({ ...DEFAULTS, ...(fresh as PropertyDetails) });
        // Refresh the cache so the next visit paints the latest content.
        try { localStorage.setItem(PROPERTY_CACHE_KEY, JSON.stringify(fresh)); } catch { /* quota */ }
      })
      .catch(error => console.error('Property details load error:', error))
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  if (loading) {
    return (
      <div className="space-y-8 pb-12 animate-pulse">
        <div className="px-6 mt-8 space-y-4">
          <div className="h-4 bg-primary-navy/5 rounded w-32" />
          <div className="h-8 bg-primary-navy/5 rounded w-64" />
          <div className="flex gap-0 overflow-hidden">
            {[1, 2, 3].map(i => (
              <div key={i} className="flex-none w-full md:w-1/3">
                <div className="aspect-[4/3] bg-primary-navy/5" />
              </div>
            ))}
          </div>
        </div>
        <div className="px-6 space-y-3">
          <div className="h-6 bg-primary-navy/5 rounded w-48" />
          <div className="h-4 bg-primary-navy/5 rounded w-full" />
          <div className="h-4 bg-primary-navy/5 rounded w-3/4" />
        </div>
        <div className="px-6 grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-full bg-white p-6 border border-primary-navy/5 shadow-sm space-y-4">
              <div className="h-5 bg-primary-navy/5 rounded w-24" />
              <div className="space-y-2.5">
                <div className="h-4 bg-primary-navy/5 rounded w-full" />
                <div className="h-4 bg-primary-navy/5 rounded w-3/4" />
                <div className="h-4 bg-primary-navy/5 rounded w-5/6" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 sm:space-y-12 pb-12">
      {/* Hero Gallery — edge-to-edge editorial strip */}
      <section className="mt-6 sm:mt-8">
        <div className="px-4 sm:px-6 flex justify-between items-end mb-4 sm:mb-6">
          <div>
            <span className="text-secondary-gold font-bold tracking-widest text-[10px] uppercase block mb-1">{t('sanctuary.estatePreview')}</span>
            <h2 className="font-headline text-2xl sm:text-3xl font-bold text-primary-navy">{bl(data.name, lang)}</h2>
          </div>
        </div>

        {/* Single horizontal slider at every breakpoint — never wraps/stacks.
            Mobile: full-bleed 100vw slides. Desktop: 3 flush landscape images
            per view (md:w-1/3), scrolls horizontally for more. Zero gaps. */}
        <div className="flex overflow-x-auto snap-x snap-mandatory no-scrollbar gap-0">
          {data.gallery.map((img, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: i * 0.08 }}
              className="flex-none w-full md:w-1/3 snap-center"
            >
              <OptimizedImage
                src={img.url}
                alt={img.label || ''}
                className="w-full aspect-[4/3] bg-primary-navy/5"
              />
              {img.label && img.label.trim() !== '' && (
                <p className="mt-2 font-bold text-primary-navy/80 text-sm px-4 sm:px-6 md:px-2">{img.label}</p>
              )}
            </motion.div>
          ))}
        </div>
      </section>

      {/* Description */}
      <section className="px-4 sm:px-6">
        <h3 className="font-headline text-xl font-bold mb-3 sm:mb-4">{bl(data.headline, lang)}</h3>
        <p className="text-primary-navy/60 leading-relaxed text-sm">{bl(data.description, lang)}</p>
        <div className="mt-4 text-sm text-primary-navy/60">
          <span className="font-bold text-secondary-gold">{t('sanctuary.from')} {getMinPrice(data.pricing, data.nightly_rate)} {t('common.omr')}</span> {t('common.perNight')}
        </div>
      </section>

      {/* Resort Guide — Categorized Feature Tiles. Column count tracks the
          number of sections so a lone section spans the full width (with its
          items flowing into multiple columns) instead of stranding on the left. */}
      {data.featureSections && data.featureSections.length > 0 && (
        <section className="px-4 sm:px-6">
          <div className={`grid gap-3 sm:gap-4 items-stretch ${
            data.featureSections.length === 1 ? 'grid-cols-1'
              : data.featureSections.length === 2 ? 'grid-cols-1 sm:grid-cols-2'
              : data.featureSections.length === 3 ? 'grid-cols-2 lg:grid-cols-3'
              : 'grid-cols-2 lg:grid-cols-4'
          }`}>
            {data.featureSections.map((section, i) => {
              const title = lang === 'ar' ? (section.titleAr || section.titleEn) : (section.titleEn || section.titleAr);
              const single = data.featureSections.length === 1;
              return (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  dir={lang === 'ar' ? 'rtl' : 'ltr'}
                  className="h-full bg-white p-4 sm:p-6 border border-primary-navy/5 shadow-sm"
                >
                  <h4 className="font-headline text-lg font-bold text-secondary-gold mb-4">
                    {title}
                  </h4>
                  <ul className={single ? 'columns-1 sm:columns-2 lg:columns-3 gap-x-10' : 'space-y-2.5'}>
                    {section.items.map((item, j) => {
                      const label = lang === 'ar' ? (item.ar || item.en) : (item.en || item.ar);
                      return (
                        <li key={j} className={`flex items-start gap-3 ${single ? 'break-inside-avoid mb-2.5' : ''}`}>
                          <Check size={14} strokeWidth={2.5} className="text-secondary-gold shrink-0 mt-[5px]" />
                          <span className="text-base font-medium text-primary-navy/85 leading-relaxed">
                            {label}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </motion.div>
              );
            })}
          </div>
        </section>
      )}

      {/* Footer Info */}
      <Footer
        chaletName={bl(data.name, lang)}
        footerText={data.footerText ? bl(data.footerText, lang) : ''}
        whatsappNumber={data.whatsappNumber || ''}
        licenseNumber={data.licenseNumber || ''}
        termsLabel={t('sanctuary.termsOfStay')}
        aboutLabel={t('sanctuary.aboutUs')}
        onTerms={() => navigate('/terms')}
        onAbout={() => navigate('/about')}
      />

      {/* Floating Book Now */}
      <button
        onClick={() => navigate('/booking')}
        className="fixed bottom-[104px] end-[24px] z-[60] flex items-center gap-2 bg-secondary-gold text-white px-5 sm:px-6 py-3 sm:py-3.5 rounded-none shadow-[0px_10px_25px_rgba(61,48,32,0.30)] hover:scale-105 transition-transform active:scale-95"
      >
        <CalendarIcon size={20} />
        <span className="font-bold text-sm tracking-wide">{t('sanctuary.bookNow')}</span>
      </button>
    </div>
  );
};
