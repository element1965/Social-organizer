import { lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Handshake, Heart, Eye, Users, Cog, Code, Globe, ChevronDown, ArrowRight } from 'lucide-react';
import { useScrollProgress } from '../hooks/useScrollProgress';

const LazyGlobeNetwork = lazy(() =>
  import('@so/graph-3d').then((m) => ({ default: m.GlobeNetwork })),
);

export function LandingPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const scrollProgress = useScrollProgress();

  const scrollToContent = () => {
    window.scrollTo({ top: window.innerHeight, behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-950 via-gray-950 to-blue-950">
      {/* Fixed 3D background */}
      <div className="fixed inset-0 opacity-60 pointer-events-none">
        <Suspense fallback={null}>
          <LazyGlobeNetwork scrollProgress={scrollProgress} />
        </Suspense>
      </div>

      {/* Scrolling content overlay */}
      <div className="relative z-10">

        {/* === Section 1: Hero (100vh) === */}
        <section className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
          <h1 className="text-5xl md:text-7xl font-bold text-white mb-4 tracking-tight">
            Social Organizer
          </h1>
          <p className="text-gray-300 text-lg md:text-xl max-w-2xl mb-10 leading-relaxed">
            {t('landing.heroSubtitle')}
          </p>
          <div className="flex flex-col sm:flex-row gap-4">
            <button
              onClick={() => navigate('/login')}
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

            {/* Card: Obligation */}
            <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6">
              <div className="w-12 h-12 bg-rose-500/20 rounded-xl flex items-center justify-center mb-4">
                <Heart className="text-rose-400" size={24} />
              </div>
              <h3 className="text-white font-semibold text-lg mb-2">{t('landing.cardObligationTitle')}</h3>
              <p className="text-gray-400 text-sm leading-relaxed">{t('landing.cardObligationDesc')}</p>
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
              <p className="text-gray-400 text-sm">{t('landing.principleOpenDesc')}</p>
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

        {/* === Section 5: CTA + Footer === */}
        <section className="min-h-[50vh] flex flex-col items-center justify-center px-6 py-20">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-6 text-center max-w-xl">
            {t('landing.ctaTitle')}
          </h2>
          <button
            onClick={() => navigate('/login')}
            className="px-10 py-4 bg-teal-500 hover:bg-teal-400 text-white font-semibold rounded-xl transition-colors text-lg mb-16"
          >
            {t('landing.ctaButton')}
          </button>

          <footer className="text-gray-500 text-sm text-center border-t border-white/5 pt-8 w-full max-w-xl">
            {t('landing.footer')}
          </footer>
        </section>

      </div>
    </div>
  );
}
