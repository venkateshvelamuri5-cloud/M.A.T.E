import React from 'react';
import Link from 'next/link';
import { Anchor, Clock, Shield, FileText, ArrowRight, Check } from 'lucide-react';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#fafafb] text-slate-800 flex flex-col font-sans selection:bg-slate-800 selection:text-white">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-slate-200/80 py-4 px-6 md:px-12 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <Anchor className="w-6 h-6 text-slate-700" />
          <span className="text-lg font-bold tracking-tight text-slate-900">
            M.A.T.E
          </span>
        </div>
        <nav className="hidden md:flex gap-8 text-sm font-medium text-slate-500">
          <a href="#about" className="hover:text-slate-900 transition">About</a>
          <a href="#features" className="hover:text-slate-900 transition">Features</a>
          <a href="#pricing" className="hover:text-slate-900 transition">Plans</a>
        </nav>
        <div>
          <Link href="/dashboard" className="px-5 py-2.5 rounded-lg bg-slate-900 hover:bg-slate-850 text-white text-xs font-semibold transition shadow-sm">
            Enter Workspace
          </Link>
        </div>
      </header>

      {/* Hero Section */}
      <section className="max-w-4xl mx-auto text-center px-6 py-20 md:py-32 flex-1 flex flex-col justify-center items-center">
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 border border-slate-200 text-slate-600 text-[11px] font-medium mb-6">
          Dedicated Maritime Document Router
        </span>
        <h1 className="text-4xl md:text-6xl font-bold tracking-tight text-slate-900 mb-6 leading-tight">
          Automated Sea Service & Voyage Log Verification
        </h1>
        <p className="text-base md:text-lg text-slate-500 max-w-2xl mb-10 leading-relaxed">
          M.A.T.E processes incoming sea service files, computes voyage metrics, validates crew endorsement certificates, 
          and generates structured PDF verification reports formatted on your official letters of sea service.
        </p>
        <div className="flex flex-col sm:flex-row gap-3">
          <Link href="/dashboard" className="px-6 py-3 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold flex items-center gap-2 transition">
            Access User Space (25MB Free Storage)
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>

      {/* Product Details Section */}
      <section id="about" className="py-20 bg-white border-t border-slate-200">
        <div className="max-w-5xl mx-auto px-6 grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
          <div>
            <h2 className="text-2xl md:text-3xl font-bold text-slate-900 mb-4">
              Designed Specifically for Merchant Navy Workflows
            </h2>
            <p className="text-slate-600 text-sm leading-relaxed mb-6">
              Maritime officers, captains, and crewing agents spend hundreds of hours manually reviewing discharge books, sea logs, 
              and COC endorsements. M.A.T.E intercepts incoming emails, extracts log coordinates, strips sensitive PII, and returns 
              fully mapped certificates to your inbox in seconds.
            </p>
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-slate-700 text-xs font-medium">
                <Check className="w-4 h-4 text-slate-600" />
                Validates vessel gross tonnage and engine power parameters.
              </div>
              <div className="flex items-center gap-2 text-slate-700 text-xs font-medium">
                <Check className="w-4 h-4 text-slate-600" />
                Cross-references watchkeeping certificate schedules.
              </div>
            </div>
          </div>
          <div className="bg-slate-50 border border-slate-200 p-8 rounded-xl space-y-6">
            <h3 className="font-bold text-slate-900 text-lg">How It Saves You Time</h3>
            <div className="space-y-4">
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-lg bg-slate-200 flex items-center justify-center font-bold text-slate-700 text-sm">1</div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  <strong>Submit Sea Service Log:</strong> Forward your sea log documents to your designated M.A.T.E email inbox.
                </p>
              </div>
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-lg bg-slate-200 flex items-center justify-center font-bold text-slate-700 text-sm">2</div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  <strong>Automated Checks:</strong> The system automatically extracts data, scrubs confidential details, and validates voyage criteria.
                </p>
              </div>
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-lg bg-slate-200 flex items-center justify-center font-bold text-slate-700 text-sm">3</div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  <strong>Instant Reply:</strong> You receive an official certificate validation sheet sent directly back to your email inbox.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing / Tiers Section */}
      <section id="pricing" className="py-20 bg-slate-50 border-t border-slate-200">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <h2 className="text-2xl md:text-3xl font-bold text-slate-900 mb-3">Simple Pilot Plans</h2>
          <p className="text-slate-500 text-xs mb-12">Upgrade volumes anytime securely via Stripe payments.</p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-2xl mx-auto text-left">
            {/* Free */}
            <div className="bg-white border border-slate-200 p-8 rounded-xl flex flex-col justify-between">
              <div>
                <h3 className="font-bold text-slate-900 text-lg mb-1">Officer Pilot</h3>
                <p className="text-xs text-slate-400 mb-6">Free community version.</p>
                <div className="text-3xl font-extrabold text-slate-900 mb-6">$0<span className="text-sm text-slate-400 font-normal">/mo</span></div>
                <ul className="space-y-3.5 mb-8 text-xs text-slate-600">
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-slate-500" />
                    10 processed logs / month
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-slate-500" />
                    25MB dedicated file space
                  </li>
                </ul>
              </div>
              <Link href="/dashboard" className="block text-center w-full py-2.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-800 transition">
                Access Free Space
              </Link>
            </div>

            {/* Pro */}
            <div className="bg-white border-2 border-slate-900 p-8 rounded-xl flex flex-col justify-between shadow-sm">
              <div>
                <h3 className="font-bold text-slate-900 text-lg mb-1">Chief Command</h3>
                <p className="text-xs text-indigo-500 mb-6">Most selected tier.</p>
                <div className="text-3xl font-extrabold text-slate-900 mb-6">$29<span className="text-sm text-slate-400 font-normal">/mo</span></div>
                <ul className="space-y-3.5 mb-8 text-xs text-slate-600">
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-slate-800" />
                    5,000 processed logs / month
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-slate-800" />
                    5GB dedicated file space
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-slate-800" />
                    Custom letters of sea service formats
                  </li>
                </ul>
              </div>
              <button className="w-full py-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition">
                Subscribe with Stripe
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white py-8 text-center text-xs text-slate-400">
        &copy; {new Date().getFullYear()} M.A.T.E. Merchant Navy Validation.
      </footer>
    </div>
  );
}
