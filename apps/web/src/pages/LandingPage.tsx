import { lazy, Suspense, useState, useRef, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Handshake, Heart, Eye, Users, Cog, Code, Globe, ChevronDown, ChevronUp, ArrowRight, Languages, Github, ExternalLink, HelpCircle } from 'lucide-react';
import { languageNames } from '@so/i18n';
import { useScrollProgress } from '../hooks/useScrollProgress';
import { Logo } from '../components/Logo';
import { trpc } from '../lib/trpc';

const LazyGlobeNetwork = lazy(() =>
  import('@so/graph-3d').then((m) => ({ default: m.GlobeNetwork })),
);

function LanguageSwitcher() {
  const { i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const current = (i18n.language?.slice(0, 2) || 'en') as keyof typeof languageNames;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 backdrop-blur-sm border border-white/10 text-white text-sm transition-colors"
      >
        <Languages size={16} />
        <span>{languageNames[current] || current}</span>
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-48 max-h-72 overflow-y-auto rounded-xl bg-gray-950 backdrop-blur-md border border-gray-800 shadow-2xl z-50 scrollbar-dark">
          {Object.entries(languageNames).map(([code, name]) => (
            <button
              key={code}
              onClick={() => { i18n.changeLanguage(code); localStorage.setItem('language', code); setOpen(false); }}
              className={`w-full text-left px-4 py-2.5 text-sm hover:bg-gray-800 transition-colors ${code === current ? 'text-teal-400 font-medium bg-gray-900' : 'text-gray-300'}`}
            >
              {name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function LandingFaq() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language?.slice(0, 2) || 'en';
  const [showAll, setShowAll] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const { data: topItems = [] } = trpc.faq.top.useQuery({ language: lang, limit: 5 });
  const { data: allItems = [] } = trpc.faq.all.useQuery(
    { language: lang },
    { enabled: showAll },
  );

  const displayItems = showAll && allItems.length > 0 ? allItems : topItems;

  if (topItems.length === 0) return null;

  return (
    <section className="min-h-[50vh] flex flex-col items-center justify-center px-6 py-20">
      <h2 className="text-3xl md:text-5xl font-bold text-white mb-12 text-center flex items-center gap-3 justify-center">
        <HelpCircle className="text-amber-400" size={36} />
        {t('landing.faqTitle')}
      </h2>

      <div className="max-w-3xl w-full space-y-3">
        {displayItems.map((item) => {
          const isExpanded = openId === item.id;
          return (
            <div key={item.id} className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl overflow-hidden">
              <button
                onClick={() => setOpenId(isExpanded ? null : item.id)}
                className="w-full flex items-center justify-between p-5 text-left"
              >
                <span className="text-sm md:text-base font-medium text-white pr-3">
                  {item.question}
                </span>
                {isExpanded ? (
                  <ChevronUp className="w-5 h-5 text-gray-400 shrink-0" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-gray-400 shrink-0" />
                )}
              </button>
              {isExpanded && (
                <div className="px-5 pb-5">
                  <p className="text-sm text-gray-300 whitespace-pre-wrap leading-relaxed">
                    {item.answer}
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {!showAll && topItems.length >= 5 && (
        <button
          onClick={() => setShowAll(true)}
          className="mt-8 px-6 py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-xl transition-colors text-sm font-medium backdrop-blur-sm border border-white/10"
        >
          {t('landing.faqShowAll')}
        </button>
      )}
    </section>
  );
}

export function LandingPage() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const inviteParam = searchParams.get('invite');
  const fromDemo = searchParams.get('from') === 'demo';
  const pendingInvite = inviteParam || localStorage.getItem('pendingInviteToken');
  const [showDemoBanner, setShowDemoBanner] = useState(fromDemo);

  // Persist invite token so Telegram bot link can use it
  useEffect(() => {
    if (inviteParam) localStorage.setItem('pendingInviteToken', inviteParam);
  }, [inviteParam]);

  // Build Telegram bot link with invite param if available
  const tgBotLink = pendingInvite
    ? `https://t.me/socialorganizer_bot?start=invite_${pendingInvite}`
    : 'https://t.me/socialorganizer_bot';

  const scrollProgress = useScrollProgress();
  const [scrollY, setScrollY] = useState(0);

  useEffect(() => {
    const handleScroll = () => setScrollY(window.scrollY);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToContent = () => {
    window.scrollTo({ top: window.innerHeight, behavior: 'smooth' });
  };

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Logo animation: starts at center, moves to top-left corner as user scrolls
  const logoProgress = Math.min(scrollY / 300, 1); // 0 to 1 over first 300px of scroll
  const logoScale = 1 - logoProgress * 0.6; // 1 -> 0.4
  const logoOpacityInHero = 1 - logoProgress; // Fade out in hero
  const logoOpacityFixed = logoProgress; // Fade in fixed

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-950 via-gray-950 to-blue-950">
      {/* Fixed 3D background */}
      <div className="fixed inset-0 opacity-60 pointer-events-none">
        <Suspense fallback={null}>
          <LazyGlobeNetwork scrollProgress={scrollProgress} />
        </Suspense>
      </div>

      {/* Fixed logo in top-left corner (appears on scroll) */}
      <div
        className="fixed top-4 left-4 z-20 transition-opacity duration-300"
        style={{ opacity: logoOpacityFixed }}
      >
        <Logo size={50} className="text-teal-400" />
      </div>

      {/* Language switcher — fixed top-right */}
      <div className="fixed top-4 right-4 z-20">
        <LanguageSwitcher />
      </div>

      {/* Scrolling content overlay */}
      <div className="relative z-10">

        {/* Demo mode banner */}
        {showDemoBanner && (
          <div className="fixed top-0 left-0 right-0 z-30 bg-amber-500/95 backdrop-blur-sm text-gray-900 px-4 py-3 text-center shadow-lg">
            <button
              onClick={() => setShowDemoBanner(false)}
              className="absolute top-2 right-3 text-gray-900/60 hover:text-gray-900 text-xl leading-none"
            >&times;</button>
            <p className="text-sm font-medium max-w-lg mx-auto">
              {t('landing.demoBanner')}
            </p>
          </div>
        )}

        {/* === Section 1: Hero (100vh) === */}
        <section className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
          {/* Logo with scroll animation - fades out and shrinks */}
          <div
            className="mb-4 transition-all duration-200"
            style={{
              opacity: logoOpacityInHero,
              transform: `scale(${logoScale})`,
            }}
          >
            <Logo size={120} className="text-teal-400" />
          </div>
          <h1 className="text-5xl md:text-7xl font-bold text-white mb-4 tracking-tight">
            Social Organizer
          </h1>
          <p className="text-gray-300 text-lg md:text-xl max-w-2xl mb-10 leading-relaxed">
            {t('landing.heroSubtitle')}
          </p>
          <div className="flex flex-col sm:flex-row gap-4">
            <button
              onClick={() => document.getElementById('download')?.scrollIntoView({ behavior: 'smooth' })}
              className="px-8 py-3 bg-teal-500 hover:bg-teal-400 text-white font-semibold rounded-xl transition-colors text-lg"
            >
              {t('landing.heroStart')}
            </button>
            <button
              onClick={scrollToContent}
              className="px-8 py-3 bg-white/10 hover:bg-white/20 text-white font-semibold rounded-xl transition-colors text-lg backdrop-blur-sm border border-white/10"
            >
              {t('landing.heroLearnMore')}
            </button>
          </div>
          <button
            onClick={scrollToContent}
            className="absolute bottom-10 animate-bounce text-white/50 hover:text-white/80 transition-colors"
            aria-label="Scroll down"
          >
            <ChevronDown size={32} />
          </button>
        </section>

        {/* === Section: Pain Point Quotes === */}
        <section className="min-h-[70vh] flex flex-col items-center justify-center px-6 py-16 gap-16">
          {/* Pain 1: Person in need */}
          <div className="max-w-3xl w-full">
            <blockquote className="relative">
              <div className="text-6xl text-teal-500/30 absolute -top-8 -left-4 font-serif">"</div>
              <p className="text-xl md:text-2xl text-gray-300 leading-relaxed text-center italic pl-6 pr-6">
                {t('landing.painQuote')}
              </p>
              <div className="text-6xl text-teal-500/30 absolute -bottom-12 right-0 font-serif">"</div>
            </blockquote>
            <p className="text-gray-500 text-center mt-8 text-sm">
              {t('landing.painSolution')}
            </p>
          </div>

          {/* Pain 2: Person who wants to help */}
          <div className="max-w-3xl w-full">
            <blockquote className="relative">
              <div className="text-6xl text-rose-500/30 absolute -top-8 -left-4 font-serif">"</div>
              <p className="text-xl md:text-2xl text-gray-300 leading-relaxed text-center italic pl-6 pr-6">
                {t('landing.painQuote2')}
              </p>
              <div className="text-6xl text-rose-500/30 absolute -bottom-12 right-0 font-serif">"</div>
            </blockquote>
            <p className="text-gray-500 text-center mt-8 text-sm">
              {t('landing.painSolution2')}
            </p>
          </div>
        </section>

        {/* === Section 2: What is it === */}
        <section className="min-h-[80vh] flex flex-col items-center justify-center px-6 py-20">
          <h2 className="text-3xl md:text-5xl font-bold text-white mb-4 text-center">
            {t('landing.whatTitle')}
          </h2>
          <p className="text-gray-400 text-base md:text-lg max-w-2xl text-center mb-12 leading-relaxed">
            {t('landing.whatDescription')}
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl w-full">
            {/* Card: Handshake */}
            <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6">
              <div className="w-12 h-12 bg-teal-500/20 rounded-xl flex items-center justify-center mb-4">
                <Handshake className="text-teal-400" size={24} />
              </div>
              <h3 className="text-white font-semibold text-lg mb-2">{t('landing.cardHandshakeTitle')}</h3>
              <p className="text-gray-400 text-sm leading-relaxed">{t('landing.cardHandshakeDesc')}</p>
            </div>

            {/* Card: Intention */}
            <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6">
              <div className="w-12 h-12 bg-rose-500/20 rounded-xl flex items-center justify-center mb-4">
                <Heart className="text-rose-400" size={24} />
              </div>
              <h3 className="text-white font-semibold text-lg mb-2">{t('landing.cardIntentionTitle')}</h3>
              <p className="text-gray-400 text-sm leading-relaxed">{t('landing.cardIntentionDesc')}</p>
            </div>

            {/* Card: Transparency */}
            <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6">
              <div className="w-12 h-12 bg-blue-500/20 rounded-xl flex items-center justify-center mb-4">
                <Eye className="text-blue-400" size={24} />
              </div>
              <h3 className="text-white font-semibold text-lg mb-2">{t('landing.cardTransparencyTitle')}</h3>
              <p className="text-gray-400 text-sm leading-relaxed">{t('landing.cardTransparencyDesc')}</p>
            </div>
          </div>
        </section>

        {/* === Section 3: How it works (3 steps) === */}
        <section className="min-h-screen flex flex-col items-center justify-center px-6 py-20">
          <h2 className="text-3xl md:text-5xl font-bold text-white mb-16 text-center">
            {t('landing.howTitle')}
          </h2>

          <div className="max-w-4xl w-full">
            {/* Timeline */}
            <div className="flex flex-col md:flex-row gap-8 md:gap-4">
              {/* Step 1 */}
              <div className="flex-1 flex flex-col items-center text-center">
                <div className="w-14 h-14 bg-teal-500/20 border-2 border-teal-500 rounded-full flex items-center justify-center mb-4">
                  <span className="text-teal-400 font-bold text-xl">1</span>
                </div>
                <h3 className="text-white font-semibold text-lg mb-2">{t('landing.step1Title')}</h3>
                <p className="text-gray-400 text-sm leading-relaxed">{t('landing.step1Desc')}</p>
              </div>

              {/* Connector */}
              <div className="hidden md:flex items-center justify-center pt-7">
                <ArrowRight className="text-white/20" size={24} />
              </div>

              {/* Step 2 */}
              <div className="flex-1 flex flex-col items-center text-center">
                <div className="w-14 h-14 bg-blue-500/20 border-2 border-blue-500 rounded-full flex items-center justify-center mb-4">
                  <span className="text-blue-400 font-bold text-xl">2</span>
                </div>
                <h3 className="text-white font-semibold text-lg mb-2">{t('landing.step2Title')}</h3>
                <p className="text-gray-400 text-sm leading-relaxed">{t('landing.step2Desc')}</p>
              </div>

              {/* Connector */}
              <div className="hidden md:flex items-center justify-center pt-7">
                <ArrowRight className="text-white/20" size={24} />
              </div>

              {/* Step 3 */}
              <div className="flex-1 flex flex-col items-center text-center">
                <div className="w-14 h-14 bg-amber-500/20 border-2 border-amber-500 rounded-full flex items-center justify-center mb-4">
                  <span className="text-amber-400 font-bold text-xl">3</span>
                </div>
                <h3 className="text-white font-semibold text-lg mb-2">{t('landing.step3Title')}</h3>
                <p className="text-gray-400 text-sm leading-relaxed">{t('landing.step3Desc')}</p>
              </div>
            </div>

            <p className="text-gray-500 text-sm text-center mt-10 italic">
              {t('landing.howFootnote')}
            </p>
          </div>
        </section>

        {/* === Section 4: Principles === */}
        <section className="min-h-[80vh] flex flex-col items-center justify-center px-6 py-20">
          <h2 className="text-3xl md:text-5xl font-bold text-white mb-12 text-center">
            {t('landing.principlesTitle')}
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-3xl w-full">
            {/* Equality */}
            <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6">
              <div className="w-10 h-10 bg-violet-500/20 rounded-lg flex items-center justify-center mb-3">
                <Users className="text-violet-400" size={20} />
              </div>
              <h3 className="text-white font-semibold mb-1">{t('landing.principleEqualityTitle')}</h3>
              <p className="text-gray-400 text-sm">{t('landing.principleEqualityDesc')}</p>
            </div>

            {/* Self-organization */}
            <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6">
              <div className="w-10 h-10 bg-orange-500/20 rounded-lg flex items-center justify-center mb-3">
                <Cog className="text-orange-400" size={20} />
              </div>
              <h3 className="text-white font-semibold mb-1">{t('landing.principleSelfOrgTitle')}</h3>
              <p className="text-gray-400 text-sm">{t('landing.principleSelfOrgDesc')}</p>
            </div>

            {/* Openness */}
            <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6">
              <div className="w-10 h-10 bg-green-500/20 rounded-lg flex items-center justify-center mb-3">
                <Code className="text-green-400" size={20} />
              </div>
              <h3 className="text-white font-semibold mb-1">{t('landing.principleOpenTitle')}</h3>
              <p className="text-gray-400 text-sm mb-3">{t('landing.principleOpenDesc')}</p>
              <a
                href="https://github.com/element1965/Social-organizer"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm text-green-400 hover:text-green-300 transition-colors"
              >
                <Github size={16} /> {t('landing.githubLink')} <ExternalLink size={12} />
              </a>
            </div>

            {/* Global */}
            <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6">
              <div className="w-10 h-10 bg-cyan-500/20 rounded-lg flex items-center justify-center mb-3">
                <Globe className="text-cyan-400" size={20} />
              </div>
              <h3 className="text-white font-semibold mb-1">{t('landing.principleGlobalTitle')}</h3>
              <p className="text-gray-400 text-sm">{t('landing.principleGlobalDesc')}</p>
            </div>
          </div>
        </section>

        {/* === Section: FAQ === */}
        <LandingFaq />

        {/* === Section 5: Download Apps === */}
        <section id="download" className="min-h-[50vh] flex flex-col items-center justify-center px-6 py-20">
          <h2 className="text-2xl md:text-3xl font-bold text-white mb-3 text-center">
            {t('landing.downloadTitle')}
          </h2>
          <p className="text-gray-400 text-sm mb-10">{t('landing.downloadSubtitle')}</p>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-3xl w-full">
            {/* App Store */}
            <a
              href="#"
              className="group relative bg-white/5 hover:bg-white/10 backdrop-blur-sm border border-white/10 rounded-xl p-4 flex flex-col items-center justify-center transition-all"
              onClick={(e) => e.preventDefault()}
            >
              <svg className="w-10 h-10 text-white mb-2" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
              </svg>
              <span className="text-white text-xs font-medium">App Store</span>
              <span className="absolute top-2 right-2 text-[10px] px-1.5 py-0.5 bg-amber-500/20 text-amber-400 rounded-full">
                {t('landing.comingSoon')}
              </span>
            </a>

            {/* Google Play */}
            <a
              href="#"
              className="group relative bg-white/5 hover:bg-white/10 backdrop-blur-sm border border-white/10 rounded-xl p-4 flex flex-col items-center justify-center transition-all"
              onClick={(e) => e.preventDefault()}
            >
              <svg className="w-10 h-10 text-white mb-2" viewBox="0 0 24 24" fill="currentColor">
                <path d="M3,20.5V3.5C3,2.91 3.34,2.39 3.84,2.15L13.69,12L3.84,21.85C3.34,21.6 3,21.09 3,20.5M16.81,15.12L6.05,21.34L14.54,12.85L16.81,15.12M20.16,10.81C20.5,11.08 20.75,11.5 20.75,12C20.75,12.5 20.53,12.9 20.18,13.18L17.89,14.5L15.39,12L17.89,9.5L20.16,10.81M6.05,2.66L16.81,8.88L14.54,11.15L6.05,2.66Z"/>
              </svg>
              <span className="text-white text-xs font-medium">Google Play</span>
              <span className="absolute top-2 right-2 text-[10px] px-1.5 py-0.5 bg-amber-500/20 text-amber-400 rounded-full">
                {t('landing.comingSoon')}
              </span>
            </a>

            {/* Telegram — with pulsing arrow */}
            <div className="relative flex flex-col items-center">
              {/* Pulsing arrow */}
              <div className="absolute -top-10 left-1/2 -translate-x-1/2 animate-bounce">
                <svg width="28" height="36" viewBox="0 0 28 36" fill="none">
                  <defs>
                    <linearGradient id="arrow-grad" x1="14" y1="0" x2="14" y2="36" gradientUnits="userSpaceOnUse">
                      <stop stopColor="#ef4444" />
                      <stop offset="1" stopColor="#dc2626" />
                    </linearGradient>
                  </defs>
                  <path d="M14 0 L14 28 M4 20 L14 30 L24 20" stroke="url(#arrow-grad)" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <a
                href={tgBotLink}
                target="_blank"
                rel="noopener noreferrer"
                className="group relative bg-white/5 hover:bg-white/10 backdrop-blur-sm border-2 border-teal-400 rounded-xl p-4 flex flex-col items-center justify-center transition-all shadow-[0_0_20px_rgba(45,212,191,0.3)] hover:shadow-[0_0_30px_rgba(45,212,191,0.5)]"
              >
                <svg className="w-10 h-10 text-teal-400 mb-2" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
                </svg>
                <span className="text-teal-400 text-xs font-medium">Telegram</span>
              </a>
            </div>

            {/* Facebook */}
            <a
              href="#"
              className="group relative bg-white/5 hover:bg-white/10 backdrop-blur-sm border border-white/10 rounded-xl p-4 flex flex-col items-center justify-center transition-all"
              onClick={(e) => e.preventDefault()}
            >
              <svg className="w-10 h-10 text-white mb-2" viewBox="0 0 24 24" fill="currentColor">
                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
              </svg>
              <span className="text-white text-xs font-medium">Facebook</span>
              <span className="absolute top-2 right-2 text-[10px] px-1.5 py-0.5 bg-amber-500/20 text-amber-400 rounded-full">
                {t('landing.comingSoon')}
              </span>
            </a>
          </div>

        </section>

        {/* === Footer === */}
        <footer className="px-6 pt-12 pb-24 text-center border-t border-white/5">
          <p className="text-gray-500 text-sm mb-3">{t('landing.footer')}</p>
          <div className="flex items-center justify-center gap-4 mb-8">
            <a
              href="https://github.com/element1965/Social-organizer"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-gray-400 hover:text-white transition-colors"
            >
              <Github size={16} /> GitHub
            </a>
            <span className="text-gray-700">|</span>
            <Link to="/privacy" className="text-gray-400 hover:text-white transition-colors text-sm">Privacy Policy</Link>
            <span className="text-gray-700">|</span>
            <Link to="/terms" className="text-gray-400 hover:text-white transition-colors text-sm">Terms of Service</Link>
          </div>
          <div className="mt-8">
            <button
              onClick={scrollToTop}
              className="mx-auto w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 border border-white/20 flex items-center justify-center text-white/60 hover:text-white transition-all animate-bounce"
              aria-label="Scroll to top"
            >
              <ChevronUp size={24} />
            </button>
          </div>
        </footer>

      </div>
    </div>
  );
}
