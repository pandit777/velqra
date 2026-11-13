import React, { useEffect, useState } from 'react';
import velqraLogo from '../assets/velqra-logo.png';

export default function Header({ cartCount = 0 }) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 24);
    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <header
      className={`site-header sticky top-0 z-50 transition-all duration-300 ${
        isScrolled
          ? 'is-scrolled shadow-xl'
          : 'shadow-md'
      }`}
    >
      <div className="site-header-inner container mx-auto px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          
          {/* ============================================= */}
          {/* LOGO - Click => Home Page */}
          {/* ============================================= */}
          <a
            href="/"
            aria-label="VELQRA - Go to Home"
            title="VELQRA Home"
            className="site-header-brand flex items-center gap-3 flex-shrink-0 group transition-transform duration-200 hover:scale-[1.02] active:scale-95"
          >
            <img src={velqraLogo} alt="" className="header-brand-image" />
            <span className="site-header-brand-name font-serif font-bold tracking-[0.08em]">
              VELQRA<sup className="brand-trademark text-[8px] font-normal text-[#d4af37]" aria-label="trademark">™</sup>
            </span>
          </a>

          {/* ============================================= */}
          {/* SEARCH BAR - Center */}
          {/* ============================================= */}
          <div className="flex-1 min-w-[120px] max-w-md order-3 md:order-2 w-full md:w-auto mt-2 md:mt-0">
            <div className="relative">
              <input 
                type="text" 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="🔍 Search shops, groceries, products..." 
                className="header-search w-full px-5 py-2.5 rounded-full focus:outline-none text-sm transition-all duration-300"
              />
              {searchQuery && (
                <button 
                  onClick={() => setSearchQuery('')}
                  aria-label="Clear search"
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors text-sm"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* ============================================= */}
          {/* RIGHT SIDE - Desktop Nav + Cart + Mobile Toggle */}
          {/* ============================================= */}
          <div className="flex items-center gap-2 flex-shrink-0 order-2 md:order-3">
            
            {/* Desktop Navigation */}
            <div className="hidden md:flex items-center gap-3">
              <a href="#shops" className="text-sm font-medium text-slate-200 hover:text-[#FF5722] transition-colors px-3 py-2 hover:bg-white/10 rounded-lg">
                Shops
              </a>
              <a href="#categories" className="text-sm font-medium text-slate-200 hover:text-[#FF5722] transition-colors px-3 py-2 hover:bg-white/10 rounded-lg">
                Categories
              </a>
            </div>

            {/* Cart Button */}
            <a 
              href="#cart" 
              aria-label={`Cart with ${cartCount} items`}
              className="header-cart-button relative p-2.5 rounded-full transition-all duration-200 group flex items-center justify-center"
            >
              <svg className="w-5 h-5 text-slate-600 group-hover:text-[#0B3C5D] transition-colors duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"/>
              </svg>
              {cartCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-[#FF5722] text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center shadow-md group-hover:scale-110 transition-transform duration-200">
                  {cartCount}
                </span>
              )}
            </a>

            {/* Mobile Menu Toggle */}
            <button 
              onClick={() => setIsOpen(!isOpen)} 
              aria-label={isOpen ? "Close menu" : "Open menu"}
              aria-expanded={isOpen}
              className="md:hidden p-2.5 bg-slate-50 hover:bg-slate-100 rounded-lg transition-all duration-200 border border-slate-200 hover:border-[#0B3C5D]"
            >
              <svg className="w-6 h-6 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={isOpen ? "M6 18L18 6M6 6l12 12" : "M4 6h16M4 12h16M4 18h16"} />
              </svg>
            </button>
          </div>

        </div>

        {/* Mobile Menu Dropdown */}
        {isOpen && (
          <div className="md:hidden mt-3 pt-3 border-t border-slate-100 space-y-2 animate-slideDown">
            <a href="#shops" className="block px-4 py-3 bg-slate-50 hover:bg-slate-100 rounded-lg font-medium text-slate-700 hover:text-[#0B3C5D] transition-colors">
              🏪 Shops
            </a>
            <a href="#categories" className="block px-4 py-3 bg-slate-50 hover:bg-slate-100 rounded-lg font-medium text-slate-700 hover:text-[#0B3C5D] transition-colors">
              📂 Categories
            </a>
            <a href="#cart" className="block px-4 py-3 bg-[#FF5722]/10 hover:bg-[#FF5722]/20 rounded-lg font-medium text-[#FF5722] transition-colors flex items-center justify-between">
              <span>🛒 My Cart</span>
              {cartCount > 0 && (
                <span className="bg-[#FF5722] text-white text-xs font-bold px-3 py-1 rounded-full">
                  {cartCount} items
                </span>
              )}
            </a>
          </div>
        )}
      </div>
    </header>
  );
}
