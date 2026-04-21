"use client";

import { useState, useCallback } from "react";
import { Button } from "@heroui/react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, X } from "@phosphor-icons/react/dist/ssr";

const SEEN_KEY = "sgpi_onboarding_seen";

// ─── Mini UI mockups ─────────────────────────────────────────────────────────
function MockTable() {
  const rows = [
    { name: "Parc Vera", type: "2BR", yield: "5.3%", roi: "+14.9%", ca: 66 },
    { name: "The Inflora", type: "1BR", yield: "4.8%", roi: "+7.6%", ca: 57 },
    { name: "Palm Isles", type: "Studio", yield: "4.7%", roi: "+4.6%", ca: 52 },
  ];
  return (
    <div className="w-full max-w-sm mx-auto rounded-lg border border-default-200 overflow-hidden shadow-sm text-[10px] bg-white">
      <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-x-3 px-3 py-1.5 bg-default-50 text-default-500 uppercase tracking-wider font-medium border-b border-default-100">
        <span>Project</span><span>Type</span><span>Yield</span><span>Cash ROI</span><span>CA</span>
      </div>
      {rows.map((r) => (
        <div key={r.name} className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-x-3 px-3 py-1.5 border-b border-default-50 items-center">
          <span className="text-primary-700 font-medium truncate">{r.name}</span>
          <span className="text-default-500">{r.type}</span>
          <span className="font-semibold">{r.yield}</span>
          <span className="text-success-700 font-semibold">{r.roi}</span>
          <span className={`inline-flex items-center justify-center w-6 h-4 rounded text-[9px] font-bold text-white ${r.ca >= 55 ? "bg-success-500" : "bg-warning-500"}`}>{r.ca}</span>
        </div>
      ))}
    </div>
  );
}

function MockChart() {
  return (
    <div className="w-full max-w-sm mx-auto rounded-lg border border-default-200 overflow-hidden shadow-sm bg-white p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-semibold">Capital appreciation</span>
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-default-100 text-default-600">1BR</span>
        </div>
        <span className="text-[9px] px-2 py-0.5 rounded-full bg-success-100 text-success-700 font-bold">CA 62</span>
      </div>
      <div className="flex gap-2 mb-2">
        <div className="flex-1 rounded bg-default-50 px-2 py-1">
          <div className="text-[8px] text-default-500 uppercase">Momentum</div>
          <div className="text-[10px] font-semibold text-success-700">+5.2%</div>
        </div>
        <div className="flex-1 rounded bg-default-50 px-2 py-1">
          <div className="text-[8px] text-default-500 uppercase">vs Peers</div>
          <div className="text-[10px] font-semibold text-success-700">Undervalued</div>
        </div>
        <div className="flex-1 rounded bg-default-50 px-2 py-1">
          <div className="text-[8px] text-default-500 uppercase">Lease</div>
          <div className="text-[10px] font-semibold">85 yr</div>
        </div>
      </div>
      {/* Mini sparkline */}
      <svg viewBox="0 0 200 50" className="w-full h-8">
        <polyline
          points="0,45 25,42 50,38 75,35 100,30 125,28 150,25 175,22"
          fill="none"
          stroke="#6366F1"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <polyline
          points="175,22 185,20 200,18"
          fill="none"
          stroke="#6366F1"
          strokeWidth="2"
          strokeDasharray="4 3"
          strokeLinecap="round"
        />
        <path
          d="M175,22 L185,17 200,14 200,22 185,23 175,22Z"
          fill="#6366F1"
          fillOpacity="0.1"
        />
        <polyline
          points="0,40 25,38 50,36 75,34 100,32 125,31 150,30 175,29 200,28"
          fill="none"
          stroke="#9CA3AF"
          strokeWidth="1.5"
          strokeDasharray="3 3"
          strokeLinecap="round"
        />
      </svg>
      <div className="flex justify-between text-[8px] text-default-400 mt-0.5">
        <span>2021</span>
        <span className="text-primary-500">- This project</span>
        <span className="text-default-400">-- 1km peers</span>
        <span>2027</span>
      </div>
    </div>
  );
}

function MockProfile() {
  return (
    <div className="w-full max-w-sm mx-auto rounded-lg border border-default-200 overflow-hidden shadow-sm bg-white p-3 space-y-2">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold">
        <div className="w-3.5 h-3.5 rounded bg-primary-100 flex items-center justify-center text-primary-600 text-[8px]">$</div>
        Your funds
      </div>
      <div className="grid grid-cols-2 gap-2">
        {[["Cash", "$150,000"], ["CPF OA", "$350,000"], ["Age", "42"], ["Loan rate", "2%"]].map(([l, v]) => (
          <div key={l} className="rounded bg-default-50 px-2 py-1">
            <div className="text-[8px] text-default-500">{l}</div>
            <div className="text-[10px] font-semibold text-right">{v}</div>
          </div>
        ))}
      </div>
      <div className="rounded bg-primary-50 px-2 py-1.5">
        <div className="flex justify-between items-baseline">
          <span className="text-[9px] text-default-600">Max property price</span>
          <span className="text-sm font-bold text-primary-700">$1,046,773</span>
        </div>
      </div>
      <div className="space-y-0.5">
        <div className="text-[8px] text-default-500">Cash deployment</div>
        <div className="h-1.5 rounded-full bg-default-200 relative">
          <div className="h-full rounded-full bg-primary-500 w-[30%]" />
        </div>
        <div className="flex justify-between text-[8px] text-default-400">
          <span>Min 5%</span>
          <span>All $150k</span>
        </div>
      </div>
    </div>
  );
}

// ─── Screen definitions ──────────────────────────────────────────────────────
const screens = [
  {
    mock: <MockTable />,
    title: "Every condo, ranked by ROI",
    subtitle: "Thousands of private condos scored by yield, Cash ROI, and rental demand — per unit type, so hidden gems surface.",
  },
  {
    mock: <MockChart />,
    title: "Capital appreciation at a glance",
    subtitle: "5-year PSF trends, peer comparison, fair value estimates, and a composite CA Score for every property.",
  },
  {
    mock: <MockProfile />,
    title: "Personalised to your budget",
    subtitle: "Your cash, CPF, and salary drive the max affordable price. Slide cash deployment to see how it changes.",
  },
];

// ─── Component ───────────────────────────────────────────────────────────────
export default function OnboardingSplash({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0);

  const finish = useCallback(() => {
    try {
      localStorage.setItem(SEEN_KEY, "1");
    } catch {}
    onDone();
  }, [onDone]);

  const next = () => {
    if (step < screens.length - 1) setStep(step + 1);
    else finish();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/90 backdrop-blur-md">
      <button
        type="button"
        onClick={finish}
        className="absolute top-4 right-4 p-2 text-default-400 hover:text-default-700 transition-colors"
        aria-label="Skip"
      >
        <X className="w-5 h-5" weight="bold" />
      </button>

      <div className="max-w-md w-full mx-4 border border-default-200 rounded-2xl bg-white shadow-lg p-6">
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -40 }}
            transition={{ duration: 0.25 }}
            className="flex flex-col items-center text-center space-y-4"
          >
            <div className="space-y-1 px-4">
              <h2 className="text-xl font-bold tracking-tight">{screens[step].title}</h2>
              <p className="text-sm text-default-600 leading-relaxed">{screens[step].subtitle}</p>
            </div>
            {screens[step].mock}
          </motion.div>
        </AnimatePresence>

        <div className="flex items-center justify-between mt-8 px-4">
          <div className="flex gap-2">
            {screens.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setStep(i)}
                className={`w-2.5 h-2.5 rounded-full transition-colors ${
                  i === step ? "bg-primary-600" : "bg-default-200"
                }`}
                aria-label={`Step ${i + 1}`}
              />
            ))}
          </div>

          <div className="flex gap-2">
            {step < screens.length - 1 ? (
              <>
                <Button variant="light" size="sm" onPress={finish}>
                  Skip
                </Button>
                <Button
                  color="primary"
                  size="sm"
                  onPress={next}
                  endContent={<ArrowRight className="w-4 h-4" />}
                >
                  Next
                </Button>
              </>
            ) : (
              <Button
                color="primary"
                size="md"
                onPress={finish}
                endContent={<ArrowRight className="w-4 h-4" />}
                className="font-semibold"
              >
                Get started
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function useOnboardingSeen(): [boolean, () => void] {
  const [seen, setSeen] = useState(() => {
    if (typeof window === "undefined") return true;
    try {
      return localStorage.getItem(SEEN_KEY) === "1";
    } catch {
      return true;
    }
  });
  const markSeen = useCallback(() => setSeen(true), []);
  return [seen, markSeen];
}
