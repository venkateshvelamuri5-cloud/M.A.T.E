"use client";
import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  ShieldCheck,
  ClipboardCheck,
  Waves,
  GraduationCap,
  BookOpen,
  CloudSun,
  Calculator,
  FileText,
  Droplets,
} from 'lucide-react';
import './aurora.css';
import { useAurora, useBridgeClock } from '../components/aurora/useAurora';

const SCENES = ['Watch', 'Compose', 'Uplink', 'Agent', 'Reply'];

const ROADMAP = [
  { icon: BookOpen, title: 'SMS clarification', note: 'In development' },
  { icon: GraduationCap, title: 'SIRE 2.0 learning', note: 'In development' },
  { icon: CloudSun, title: 'Weather reports', note: 'In development' },
  { icon: Calculator, title: 'Payroll calculations', note: 'In development' },
  { icon: FileText, title: 'Voyage orders', note: 'In development' },
  { icon: Droplets, title: 'Cargo calculations', note: 'Oil · product · chemical' },
];

export default function LandingPage() {
  const { canvasRef, stageRef, linkRef, headingRef, handleRef, noWebGL, ready } = useAurora('story');
  const { utcRef, posRef } = useBridgeClock();
  const storyRef = useRef<HTMLElement>(null);
  const stepRefs = useRef<(HTMLElement | null)[]>([]);
  const [scene, setScene] = useState(0);
  const [solidHeader, setSolidHeader] = useState(false);

  // Scroll position drives the story timeline (0 to 4) and the scene rail.
  useEffect(() => {
    const onScroll = () => {
      const story = storyRef.current;
      if (!story) return;
      const r = story.getBoundingClientRect();
      const range = Math.max(r.height - window.innerHeight, 1);
      const p = Math.max(0, Math.min(1, -r.top / range)) * (SCENES.length - 1);
      handleRef.current?.setProgress(p);
      setScene(Math.round(p));
      setSolidHeader(r.bottom < window.innerHeight * 0.6);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => { window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll); };
  }, [handleRef, ready]);

  const spotlight = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = e.currentTarget, r = el.getBoundingClientRect();
    el.style.setProperty('--mx', `${e.clientX - r.left}px`);
    el.style.setProperty('--my', `${e.clientY - r.top}px`);
  };

  return (
    <div className="aurora">
      <header className={`au-top${solidHeader ? ' solid' : ''}`}>
        <div className="au-wrap">
          <Link href="/" className="au-brand" aria-label="M.A.T.E home">
            <img src="/logo.jpeg" alt="" width="34" height="34" />
            <b>M.A.T.E</b>
          </Link>
          <nav className="au-nav" aria-label="Sections">
            <a href="#compose">How it works</a>
            <a href="#modules">Modules</a>
            <a href="#roadmap">Roadmap</a>
          </nav>
          <Link href="/login" className="au-btn au-btn-glass au-btn-sm">Sign in</Link>
        </div>
      </header>

      <section className="au-story" id="top" ref={storyRef}>
        <div className={`au-stage${noWebGL ? ' no-webgl' : ''}`} ref={stageRef}>
          <canvas ref={canvasRef} aria-hidden="true" />
          <div className="au-edge" aria-hidden="true" />
          <div className="au-rail" aria-label="Story scenes">
            {SCENES.map((s, i) => (
              <button key={s} type="button" className={i === scene ? 'on' : ''}
                onClick={() => stepRefs.current[i]?.scrollIntoView({ behavior: 'smooth' })}>
                {s} <i />
              </button>
            ))}
          </div>
          <div className="au-console" aria-hidden="true">
            <div className="au-wrap">
              <div className="au-readout">
                <span>POS <b ref={posRef}>18°54.20′N 072°48.70′E</b></span>
                <span>HDG <b ref={headingRef}>074°</b></span>
                <span>SOG <b>12.4 kn</b></span>
                <span>UTC <b ref={utcRef}>00:00:00</b></span>
                <span className="live">LINK <b ref={linkRef}>VSAT · idle</b></span>
              </div>
            </div>
          </div>
        </div>

        <div className="au-steps">
          <article className="au-step au-hero" ref={(el) => { stepRefs.current[0] = el; }}>
            <div className="au-wrap"><div className="copy">
              <div className="au-eyebrow">Maritime AI · built by senior Masters &amp; Chief Engineers</div>
              <h1>Paperwork for mariners, <em>done in minutes.</em></h1>
              <p className="lede">Risk assessments, audit closures, drill notes and training minutes, drafted by an AI agent trained with serving senior officers and fitted to your vessel. You send one email. It sends back the document.</p>
              <div className="au-cta-row">
                <Link href="/signup" className="au-btn au-btn-gold">Start by sending an email <ArrowRight className="h-4 w-4" /></Link>
                <a href="#compose" className="au-btn au-btn-glass">Watch how it works</a>
              </div>
              <div className="au-chip-row">
                <span className="au-chip"><b>&lt; 1 min</b> average reply</span>
                <span className="au-chip"><b>0</b> apps to install</span>
                <span className="au-chip"><b>1</b> line of input</span>
              </div>
            </div></div>
          </article>

          <article className="au-step" id="compose" ref={(el) => { stepRefs.current[1] = el; }}>
            <div className="au-wrap"><div className="au-panel">
              <div className="au-no">01 · Compose</div>
              <h2>One line, <em>from the bridge.</em></h2>
              <p className="au-body">Write to your M.A.T.E mailbox from the ship&apos;s business computer. Describe the job in a sentence, the way you&apos;d say it to the Master.</p>
              <div className="au-mail">
                <div className="row"><span>To</span><span>mate@logmark-ai.com</span></div>
                <div className="row"><span>Subject</span><span>Risk Assessment</span></div>
                <div className="msg">Hot work in pump room, bilge area, vessel underway.</div>
              </div>
            </div></div>
          </article>

          <article className="au-step right" ref={(el) => { stepRefs.current[2] = el; }}>
            <div className="au-wrap"><div className="au-panel">
              <div className="au-no">02 · Uplink</div>
              <h2>It leaves on the link <em>you already have.</em></h2>
              <p className="au-body">Your email goes out over the ship&apos;s normal VSAT mail. No app store, no whitelisted website, no firewall ticket to the office.</p>
              <div className="au-chip-row">
                <span className="au-chip"><b>Plain text</b> about 2 KB</span>
                <span className="au-chip"><b>Any</b> mail client</span>
                <span className="au-chip"><b>Works</b> on thin bandwidth</span>
              </div>
            </div></div>
          </article>

          <article className="au-step" ref={(el) => { stepRefs.current[3] = el; }}>
            <div className="au-wrap"><div className="au-panel">
              <div className="au-no">03 · Agent</div>
              <h2>The agent drafts it <em>like a senior officer.</em></h2>
              <p className="au-body">M.A.T.E reads your line against the vessel and rank profile you registered, then writes the document the way experienced Masters and Chief Engineers trained it to.</p>
              <div className="au-chip-row">
                <span className="au-chip"><b>Vessel</b> profile</span>
                <span className="au-chip"><b>Rank</b> and role</span>
                <span className="au-chip"><b>Audit</b>-ready structure</span>
              </div>
            </div></div>
          </article>

          <article className="au-step right" ref={(el) => { stepRefs.current[4] = el; }}>
            <div className="au-wrap"><div className="au-panel">
              <div className="au-no">04 · Reply</div>
              <h2>Back in your inbox <em>before the kettle boils.</em></h2>
              <p className="au-body">Plain text you can paste straight into your company&apos;s forms.</p>
              <div className="au-mail">
                <div className="row"><span>From</span><span className="ok">mate@logmark-ai.com</span></div>
                <pre>{`RISK ASSESSMENT · M/V PIONEER · C/O
Hazards: explosive atmosphere, slips, limited escape route
Controls: gas-free cert, fire watch, bilge drained, rescue line
Residual risk: LOW, with Master's approval`}</pre>
              </div>
            </div></div>
          </article>
        </div>
      </section>

      <section className="au-section" id="modules">
        <div className="au-wrap">
          <div className="au-section-head">
            <div><div className="au-eyebrow">Live modules</div><h2>Hours of paperwork, <em>now minutes.</em></h2></div>
            <p className="au-intro">Each module turns one line into a complete, vessel-specific document. Active-duty Masters and Chief Engineers keep tuning it so the output holds up to audit.</p>
          </div>
          <div className="au-bento">
            <div className="au-card w4" onPointerMove={spotlight}>
              <div className="au-ic"><ShieldCheck className="h-5 w-5" /></div>
              <h3>Risk Assessment</h3>
              <p>Hazards, controls and residual ratings, ready for the Master&apos;s signature.</p>
              <div className="au-io"><div><span>IN</span><span>Enclosed space entry, No.3 cargo tank</span></div><div><span>OUT</span><span>Hazards · controls · residual rating</span></div></div>
            </div>
            <div className="au-card w2 au-stat" onPointerMove={spotlight}>
              <div className="au-eyebrow">Average reply</div>
              <div className="au-big">&lt; 1 min</div>
              <p>From send to a finished document in your inbox.</p>
            </div>
            <div className="au-card w2" onPointerMove={spotlight}>
              <div className="au-ic"><ClipboardCheck className="h-5 w-5" /></div>
              <h3>Audit Closure</h3>
              <p>Root cause, corrective and preventive action, and the evidence the auditor will ask for.</p>
              <div className="au-io"><div><span>IN</span><span>PSC: emergency fire pump failed to prime</span></div></div>
            </div>
            <div className="au-card w2" onPointerMove={spotlight}>
              <div className="au-ic"><Waves className="h-5 w-5" /></div>
              <h3>Drill Notes</h3>
              <p>Scenario, objectives, timings, observations and lessons learned.</p>
              <div className="au-io"><div><span>IN</span><span>Abandon ship drill, port lifeboat lowered</span></div></div>
            </div>
            <div className="au-card w2" onPointerMove={spotlight}>
              <div className="au-ic"><GraduationCap className="h-5 w-5" /></div>
              <h3>Training Minutes</h3>
              <p>Structured minutes to brief crew on any subject, signable as is.</p>
              <div className="au-io"><div><span>IN</span><span>ECDIS safety contour for new 3/O</span></div></div>
            </div>
          </div>
        </div>
      </section>

      <section className="au-section" id="roadmap">
        <div className="au-wrap">
          <div className="au-section-head">
            <div><div className="au-eyebrow">Passage plan</div><h2>Next waypoints <em>on the route.</em></h2></div>
            <p className="au-intro">Modules in active development. Registered users get them as they ship.</p>
          </div>
          <div className="au-plan">
            <div className="au-route" aria-hidden="true" />
            <div className="au-wps">
              {ROADMAP.map(({ icon: Icon, title, note }) => (
                <div className="au-wp" key={title}>
                  <div className="mark"><Icon className="h-[18px] w-[18px]" /></div>
                  <h3>{title}</h3>
                  <p>{note}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="au-section au-cta">
        <div className="au-wrap">
          <div className="au-eyebrow">Early access</div>
          <h2>Get your <em>watch back.</em></h2>
          <p>Join the Masters, Chief Engineers and deck officers already turning hours of paperwork into minutes from the ship&apos;s inbox.</p>
          <div className="au-cta-row"><Link href="/signup" className="au-btn au-btn-gold">Request early access <ArrowRight className="h-4 w-4" /></Link></div>
        </div>
      </section>

      <footer className="au-footer">
        <div className="au-wrap">
          <span>© 2026 M.A.T.E. Crewed by sailors, powered by AI.</span>
          <nav aria-label="Footer">
            <a href="#modules">Modules</a>
            <a href="#compose">How it works</a>
            <a href="mailto:mate@logmark-ai.com">mate@logmark-ai.com</a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
