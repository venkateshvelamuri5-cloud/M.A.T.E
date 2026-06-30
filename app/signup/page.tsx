"use client";
import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '../../src/supabase-client';
import { Anchor, ArrowLeft, Mail, Lock, UserPlus, Shield, User, HelpCircle } from 'lucide-react';

export default function SignupPage() {
  const router = useRouter();
  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [fullNameInput, setFullNameInput] = useState('');
  const [rankInput, setRankInput] = useState('');
  const [companyInput, setCompanyInput] = useState('');
  const [vesselEmailInput, setVesselEmailInput] = useState('');
  
  // New vessel details states
  const [vesselNameInput, setVesselNameInput] = useState('');
  const [vesselTypeInput, setVesselTypeInput] = useState('');
  const [operatorNameInput, setOperatorNameInput] = useState('');
  const [grtInput, setGrtInput] = useState('');
  
  // Pump room & systems states
  const [hasPumpRoom, setHasPumpRoom] = useState(true);
  const [pumpSystemType, setPumpSystemType] = useState('N/A');

  // Bow thruster & cargo
  const [hasBowThruster, setHasBowThruster] = useState(false);
  const [carriesChemicalCargo, setCarriesChemicalCargo] = useState(false);

  // EGCS (Scrubber)
  const [hasEgcs, setHasEgcs] = useState(false);
  const [egcsType, setEgcsType] = useState('N/A');

  // Operating regions
  const [operatesUsWaters, setOperatesUsWaters] = useState(false);
  const [operatesAusNzWaters, setOperatesAusNzWaters] = useState(false);
  const [operatesEuWaters, setOperatesEuWaters] = useState(false);
  const [operatesChineseWaters, setOperatesChineseWaters] = useState(false);

  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const checkUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        router.push('/dashboard');
      }
    };
    checkUser();
  }, []);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMsg(null);
    setIsLoading(true);

    try {
      const { data, error } = await supabase.auth.signUp({
        email: emailInput,
        password: passwordInput,
        options: {
          data: {
            full_name: fullNameInput,
            rank: rankInput,
            company_name: companyInput,
            vessel_email: vesselEmailInput,
            vessel_name: vesselNameInput,
            vessel_type: vesselTypeInput,
            operator_name: operatorNameInput,
            grt: grtInput,
            has_pump_room: hasPumpRoom,
            pump_system_type: hasPumpRoom ? 'N/A' : pumpSystemType,
            has_bow_thruster: hasBowThruster,
            carries_chemical_cargo: carriesChemicalCargo,
            has_egcs: hasEgcs,
            egcs_type: hasEgcs ? egcsType : 'N/A',
            operates_us_waters: operatesUsWaters,
            operates_aus_nz_waters: operatesAusNzWaters,
            operates_eu_waters: operatesEuWaters,
            operates_chinese_waters: operatesChineseWaters
          }
        }
      });
      if (error) throw error;
      if (data.user) {
        setStatusMsg("Account successfully registered! Sending welcome email...");

        // Fire welcome email — non-blocking, don't await so signup isn't delayed
        fetch('/api/welcome', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: emailInput,
            fullName: fullNameInput
          })
        }).catch(err => console.warn('Welcome email failed (non-critical):', err));

        setTimeout(() => {
          router.push('/dashboard');
        }, 1500);
      }
    } catch (err) {
      console.error("Auth error occurred:", err);
      const errMsg = err && typeof err === 'object'
        ? (err as any).message || (err as any).error_description || JSON.stringify(err)
        : String(err);
      setStatusMsg(`Registration failed: ${errMsg}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col justify-center items-center font-sans p-6 py-12 relative selection:bg-gold selection:text-deep">
      {/* Back button */}
      <Link href="/" className="absolute top-6 left-6 text-muted-foreground hover:text-foreground transition text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 bg-card/60 px-4 py-2 rounded-full border border-border/80 shadow-sm z-30">
        <ArrowLeft className="w-4 h-4" /> Home
      </Link>

      <div className="w-full max-w-2xl bg-card border border-border p-8 rounded-2xl shadow-md relative">
        <div className="flex flex-col items-center mb-6">
          <Link href="/" className="flex items-center gap-2 mb-4">
            <img src="/logo.jpeg" alt="M.A.T.E logo" width="48" height="48" className="rounded-xl border border-border/80 shadow-sm" />
          </Link>
          <h2 className="font-display text-2xl font-semibold text-deep">Register Mariner Space</h2>
          <p className="text-muted-foreground text-xs mt-1 text-center">
            Set up your vessel particulars and operational profile for tailored AI safety guidelines.
          </p>
        </div>

        {statusMsg && (
          <div className={`p-3.5 rounded-xl text-xs mb-4 border ${
            statusMsg.includes('failed') || statusMsg.includes('error')
              ? 'bg-red-50/50 border-red-200 text-red-700'
              : 'bg-green-50/50 border-green-200 text-green-700'
          }`}>
            {statusMsg}
          </div>
        )}

        <form onSubmit={handleSignup} className="space-y-6">
          {/* Section 1: Officer Credentials */}
          <div className="space-y-4">
            <h3 className="text-xs font-black text-deep uppercase tracking-wider border-b border-border/60 pb-1.5">// 1. Officer Credentials</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Full Name</label>
                <div className="relative">
                  <User className="absolute left-3.5 top-3 w-4 h-4 text-muted-foreground" />
                  <input 
                    type="text" 
                    required
                    value={fullNameInput}
                    onChange={e => setFullNameInput(e.target.value)}
                    placeholder="Capt. John Doe"
                    className="w-full pl-10 pr-4 py-2.5 border border-border focus:border-gold bg-[#FAF9F6] rounded-xl text-xs outline-none text-foreground transition font-medium"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Mariner Rank</label>
                <div className="relative">
                  <Shield className="absolute left-3.5 top-3 w-4 h-4 text-muted-foreground" />
                  <input 
                    type="text" 
                    required
                    value={rankInput}
                    onChange={e => setRankInput(e.target.value)}
                    placeholder="Chief Mate"
                    className="w-full pl-10 pr-4 py-2.5 border border-border focus:border-gold bg-[#FAF9F6] rounded-xl text-xs outline-none text-foreground transition font-medium"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Company Name</label>
                <input 
                  type="text" 
                  required
                  value={companyInput}
                  onChange={e => setCompanyInput(e.target.value)}
                  placeholder="Merchant Shipping Ltd"
                  className="w-full px-3.5 py-2.5 border border-border focus:border-gold bg-[#FAF9F6] rounded-xl text-xs outline-none text-foreground transition font-medium"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Vessel Email (from ship)</label>
                <input 
                  type="email" 
                  required
                  value={vesselEmailInput}
                  onChange={e => setVesselEmailInput(e.target.value)}
                  placeholder="pioneer@vessel-net.com"
                  className="w-full px-3.5 py-2.5 border border-border focus:border-gold bg-[#FAF9F6] rounded-xl text-xs outline-none text-foreground transition font-medium"
                />
              </div>
            </div>
          </div>

          {/* Section 2: Vessel Particulars */}
          <div className="space-y-4">
            <h3 className="text-xs font-black text-deep uppercase tracking-wider border-b border-border/60 pb-1.5">// 2. Vessel Particulars</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Vessel Name</label>
                <input 
                  type="text" 
                  required
                  value={vesselNameInput}
                  onChange={e => setVesselNameInput(e.target.value)}
                  placeholder="e.g. Pioneer Mariner"
                  className="w-full px-3.5 py-2.5 border border-border focus:border-gold bg-[#FAF9F6] rounded-xl text-xs outline-none text-foreground transition font-medium"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Type of Vessel</label>
                <input 
                  type="text" 
                  required
                  value={vesselTypeInput}
                  onChange={e => setVesselTypeInput(e.target.value)}
                  placeholder="e.g. Oil Tanker, Bulk Carrier"
                  className="w-full px-3.5 py-2.5 border border-border focus:border-gold bg-[#FAF9F6] rounded-xl text-xs outline-none text-foreground transition font-medium"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Operator Name (SMS Manuals Creator)</label>
                <input 
                  type="text" 
                  required
                  value={operatorNameInput}
                  onChange={e => setOperatorNameInput(e.target.value)}
                  placeholder="e.g. V-Ships, Anglo-Eastern"
                  className="w-full px-3.5 py-2.5 border border-border focus:border-gold bg-[#FAF9F6] rounded-xl text-xs outline-none text-foreground transition font-medium"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Gross Tonnage (GRT)</label>
                <input 
                  type="text" 
                  required
                  value={grtInput}
                  onChange={e => setGrtInput(e.target.value)}
                  placeholder="e.g. 45,000"
                  className="w-full px-3.5 py-2.5 border border-border focus:border-gold bg-[#FAF9F6] rounded-xl text-xs outline-none text-foreground transition font-medium"
                />
              </div>
            </div>
          </div>

          {/* Section 3: Vessel Machinery & Cargo */}
          <div className="space-y-4">
            <h3 className="text-xs font-black text-deep uppercase tracking-wider border-b border-border/60 pb-1.5">// 3. Vessel Machinery &amp; Cargo</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex flex-col justify-center bg-[#FAF9F6] p-3 border border-border rounded-xl">
                <label className="flex items-center gap-2.5 cursor-pointer font-semibold text-zinc-700 text-xs select-none">
                  <input 
                    type="checkbox"
                    checked={hasPumpRoom}
                    onChange={e => {
                      setHasPumpRoom(e.target.checked);
                      if (e.target.checked) setPumpSystemType('N/A');
                      else setPumpSystemType('FRAMO');
                    }}
                    className="w-4 h-4 text-[#575ECF] rounded border-border cursor-pointer focus:ring-0"
                  />
                  Vessel has a Pump Room?
                </label>
              </div>

              {!hasPumpRoom && (
                <div>
                  <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Deepwell Pump System Type</label>
                  <select 
                    value={pumpSystemType}
                    onChange={e => setPumpSystemType(e.target.value)}
                    className="w-full px-3 py-2.5 border border-border focus:border-gold bg-[#FAF9F6] rounded-xl text-xs outline-none text-foreground font-semibold"
                  >
                    <option value="FRAMO">FRAMO System</option>
                    <option value="MARFLEX">MARFLEX System</option>
                  </select>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex items-center bg-[#FAF9F6] p-3 border border-border rounded-xl">
                <label className="flex items-center gap-2.5 cursor-pointer font-semibold text-zinc-700 text-xs select-none">
                  <input 
                    type="checkbox"
                    checked={hasBowThruster}
                    onChange={e => setHasBowThruster(e.target.checked)}
                    className="w-4 h-4 text-[#575ECF] rounded border-border cursor-pointer focus:ring-0"
                  />
                  Fitted with a Bow Thruster?
                </label>
              </div>

              <div className="flex items-center bg-[#FAF9F6] p-3 border border-border rounded-xl">
                <label className="flex items-center gap-2.5 cursor-pointer font-semibold text-zinc-700 text-xs select-none">
                  <input 
                    type="checkbox"
                    checked={carriesChemicalCargo}
                    onChange={e => setCarriesChemicalCargo(e.target.checked)}
                    className="w-4 h-4 text-[#575ECF] rounded border-border cursor-pointer focus:ring-0"
                  />
                  Carries Chemical Cargo?
                </label>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex items-center bg-[#FAF9F6] p-3 border border-border rounded-xl">
                <label className="flex items-center gap-2.5 cursor-pointer font-semibold text-zinc-700 text-xs select-none">
                  <input 
                    type="checkbox"
                    checked={hasEgcs}
                    onChange={e => {
                      setHasEgcs(e.target.checked);
                      if (e.target.checked) setEgcsType('Open Loop');
                      else setEgcsType('N/A');
                    }}
                    className="w-4 h-4 text-[#575ECF] rounded border-border cursor-pointer focus:ring-0"
                  />
                  Fitted with EGCS (Scrubber)?
                </label>
              </div>

              {hasEgcs && (
                <div>
                  <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">EGCS Scrubber Configuration</label>
                  <select 
                    value={egcsType}
                    onChange={e => setEgcsType(e.target.value)}
                    className="w-full px-3 py-2.5 border border-border focus:border-gold bg-[#FAF9F6] rounded-xl text-xs outline-none text-foreground font-semibold"
                  >
                    <option value="Open Loop">Open Loop System</option>
                    <option value="Closed Loop">Closed Loop System</option>
                    <option value="Hybrid">Hybrid System</option>
                  </select>
                </div>
              )}
            </div>
          </div>

          {/* Section 4: Operational Regions */}
          <div className="space-y-4">
            <h3 className="text-xs font-black text-deep uppercase tracking-wider border-b border-border/60 pb-1.5">// 4. Operational Regions (Active Trading)</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <label className="flex items-center gap-2 p-2.5 bg-[#FAF9F6] border border-border rounded-xl cursor-pointer text-[10px] font-bold text-zinc-700 select-none">
                <input 
                  type="checkbox" 
                  checked={operatesUsWaters}
                  onChange={e => setOperatesUsWaters(e.target.checked)}
                  className="w-3.5 h-3.5 text-[#575ECF] rounded border-border cursor-pointer focus:ring-0"
                />
                US Waters
              </label>
              <label className="flex items-center gap-2 p-2.5 bg-[#FAF9F6] border border-border rounded-xl cursor-pointer text-[10px] font-bold text-zinc-700 select-none">
                <input 
                  type="checkbox" 
                  checked={operatesAusNzWaters}
                  onChange={e => setOperatesAusNzWaters(e.target.checked)}
                  className="w-3.5 h-3.5 text-[#575ECF] rounded border-border cursor-pointer focus:ring-0"
                />
                AUS / NZ Waters
              </label>
              <label className="flex items-center gap-2 p-2.5 bg-[#FAF9F6] border border-border rounded-xl cursor-pointer text-[10px] font-bold text-zinc-700 select-none">
                <input 
                  type="checkbox" 
                  checked={operatesEuWaters}
                  onChange={e => setOperatesEuWaters(e.target.checked)}
                  className="w-3.5 h-3.5 text-[#575ECF] rounded border-border cursor-pointer focus:ring-0"
                />
                EU Waters
              </label>
              <label className="flex items-center gap-2 p-2.5 bg-[#FAF9F6] border border-border rounded-xl cursor-pointer text-[10px] font-bold text-zinc-700 select-none">
                <input 
                  type="checkbox" 
                  checked={operatesChineseWaters}
                  onChange={e => setOperatesChineseWaters(e.target.checked)}
                  className="w-3.5 h-3.5 text-[#575ECF] rounded border-border cursor-pointer focus:ring-0"
                />
                Chinese Waters
              </label>
            </div>
          </div>

          {/* Section 5: Account Info */}
          <div className="space-y-4">
            <h3 className="text-xs font-black text-deep uppercase tracking-wider border-b border-border/60 pb-1.5">// 5. Account Credentials</h3>
            <div>
              <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Login Email (regular email)</label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-3 w-4 h-4 text-muted-foreground" />
                <input 
                  type="email" 
                  required
                  value={emailInput}
                  onChange={e => setEmailInput(e.target.value)}
                  placeholder="john.doe@gmail.com"
                  className="w-full pl-10 pr-4 py-2.5 border border-border focus:border-gold bg-[#FAF9F6] rounded-xl text-xs outline-none text-foreground transition font-medium"
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Password</label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-3 w-4 h-4 text-muted-foreground" />
                <input 
                  type="password" 
                  required
                  value={passwordInput}
                  onChange={e => setPasswordInput(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-4 py-2.5 border border-border focus:border-gold bg-[#FAF9F6] rounded-xl text-xs outline-none text-foreground transition font-medium"
                />
              </div>
            </div>
          </div>

          <button 
            type="submit" 
            disabled={isLoading}
            className="w-full py-3 rounded-xl bg-primary hover:bg-primary/95 text-primary-foreground font-semibold text-xs uppercase tracking-wider transition shadow-md shadow-primary/20 flex items-center justify-center gap-2 hover:scale-[1.01] transform duration-150"
          >
            {isLoading ? "Registering..." : <>Register Mariner Space <UserPlus className="w-4 h-4" /></>}
          </button>
        </form>

        <div className="mt-6 pt-6 border-t border-border/60 text-center">
          <p className="text-xs text-muted-foreground">
            Already registered?{" "}
            <Link href="/login" className="text-gold font-bold hover:underline transition">
              Sign In
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
