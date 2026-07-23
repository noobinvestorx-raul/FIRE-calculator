import React, { useState, useMemo } from "react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer } from "recharts";
import { Lock, Check, Download, Loader2, X } from "lucide-react";

const fmtEUR = (n) =>
  new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);

const fmtEURDec = (n) =>
  new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 2 }).format(n);

// ── Configuración de EmailJS ──────────────────────────────────────────────
// Usa el mismo servicio que ya tienes montado en tu app de incidencias.
// 1. Ve a https://dashboard.emailjs.com/admin y coge tu Service ID y Public Key
// 2. Crea una plantilla nueva (Template) solo para "nuevo lead calculadora FIRE"
//    con variables {{email}} y {{fecha}}, y pon aquí su ID
// 3. En producción, carga el SDK con <script src="https://cdn.jsdelivr.net/npm/@emailjs/browser/dist/email.min.js"></script>
//    o `npm install @emailjs/browser` si lo despliegas como app completa
const EMAILJS_SERVICE_ID = "TU_SERVICE_ID";
const EMAILJS_TEMPLATE_ID = "TU_TEMPLATE_ID";
const EMAILJS_PUBLIC_KEY = "TU_PUBLIC_KEY";

async function sendLeadToEmailJS(email) {
  // Envío best-effort: si EmailJS no está cargado (como aquí, en el prototipo)
  // o falla la llamada, no bloqueamos el flujo de desbloqueo del informe.
  try {
    if (typeof window !== "undefined" && window.emailjs) {
      await window.emailjs.send(
        EMAILJS_SERVICE_ID,
        EMAILJS_TEMPLATE_ID,
        { email, fecha: new Date().toLocaleString("es-ES") },
        EMAILJS_PUBLIC_KEY
      );
      return true;
    }
    console.log("[demo] EmailJS no cargado en este entorno. Lead capturado localmente:", email);
    return false;
  } catch (err) {
    console.error("Error enviando lead a EmailJS:", err);
    return false;
  }
}

// Generador de ruido gaussiano (Box-Muller) para el Monte Carlo
function randn() {
  let u = 1 - Math.random();
  let v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// Simula una trayectoria y devuelve el año en que se alcanza el número FIRE (o null si no se alcanza)
function simulatePath(initial, monthlyContribution, meanReturn, sd, target, maxYears) {
  let capital = initial;
  for (let year = 1; year <= maxYears; year++) {
    const r = meanReturn + sd * randn();
    capital = capital * (1 + r) + monthlyContribution * 12;
    if (capital >= target) return year;
  }
  return null;
}

function runMonteCarlo({ ahorro, aportacion, rReal, volatilidad, numeroFireHoy, maxYears, nPaths }) {
  const years = [];
  for (let i = 0; i < nPaths; i++) {
    years.push(simulatePath(ahorro, aportacion, rReal, volatilidad / 100, numeroFireHoy, maxYears));
  }
  const sorted = [...years].sort((a, b) => (a === null ? Infinity : a) - (b === null ? Infinity : b));
  const pct = (p) => {
    const idx = Math.floor((p / 100) * (sorted.length - 1));
    return sorted[idx];
  };
  const successCount = years.filter((y) => y !== null).length;
  return {
    p10: pct(10),
    p50: pct(50),
    p90: pct(90),
    successRate: (successCount / nPaths) * 100,
  };
}

function Slider({ label, value, onChange, min, max, step, suffix, hint }) {
  return (
    <div className="mb-5">
      <div className="flex items-baseline justify-between mb-1.5">
        <label className="text-[13px] tracking-wide uppercase text-[#8a8370] font-medium">{label}</label>
        <span className="font-mono text-[15px] text-[#2b2620] font-semibold">
          {value}
          {suffix}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full accent-[#b8862f] h-1.5 cursor-pointer"
      />
      {hint && <p className="text-[11px] text-[#a39c8a] mt-1">{hint}</p>}
    </div>
  );
}

export default function FireCalculator() {
  const [edad, setEdad] = useState(32);
  const [ahorro, setAhorro] = useState(15000);
  const [aportacion, setAportacion] = useState(500);
  const [rentabilidad, setRentabilidad] = useState(7);
  const [gastoAnual, setGastoAnual] = useState(18000);
  const [tasaRetirada, setTasaRetirada] = useState(3.5);
  const [inflacion, setInflacion] = useState(2.5);
  const [volatilidad, setVolatilidad] = useState(15);

  const [unlocked, setUnlocked] = useState(false);
  const [showPaywall, setShowPaywall] = useState(false);
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState("");
  const [paying, setPaying] = useState(false);
  const [leadSaved, setLeadSaved] = useState(false);

  const sim = useMemo(() => {
    const rows = [];
    let capital = ahorro;
    let gasto = gastoAnual;
    const rReal = (1 + rentabilidad / 100) / (1 + inflacion / 100) - 1; // rentabilidad real
    let edadFire = null;
    let numeroFireEnFire = null;

    for (let year = 0; year <= 50; year++) {
      const edadActual = edad + year;
      const numeroFire = gasto / (tasaRetirada / 100);
      rows.push({
        year,
        edad: edadActual,
        capital: Math.round(capital),
        numeroFire: Math.round(numeroFire),
      });
      if (edadFire === null && capital >= numeroFire && year > 0) {
        edadFire = edadActual;
        numeroFireEnFire = numeroFire;
      }
      // avanzar un año: aportaciones mensuales + crecimiento real
      capital = capital * (1 + rReal) + aportacion * 12;
      // el gasto crece con la aportación de estilo de vida ~ igual que inflación ya está en términos reales, se mantiene constante en términos reales
    }

    return { rows: rows.slice(0, edadFire ? Math.min(rows.length, edadFire - edad + 8) : 45), edadFire, numeroFireEnFire, rReal };
  }, [edad, ahorro, aportacion, rentabilidad, gastoAnual, tasaRetirada, inflacion]);

  const numeroFireHoy = gastoAnual / (tasaRetirada / 100);
  const anosParaFire = sim.edadFire ? sim.edadFire - edad : null;

  const monteCarlo = useMemo(() => {
    if (!unlocked) return null;
    return runMonteCarlo({
      ahorro,
      aportacion,
      rReal: sim.rReal,
      volatilidad,
      numeroFireHoy,
      maxYears: 50,
      nPaths: 400,
    });
  }, [unlocked, ahorro, aportacion, sim.rReal, volatilidad, numeroFireHoy]);

  const handleUnlock = async () => {
    const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    if (!validEmail) {
      setEmailError("Introduce un email válido para recibir el informe.");
      return;
    }
    setEmailError("");
    setPaying(true);

    // Captura real del lead — esto pasa siempre, se complete o no el pago simulado.
    const sent = await sendLeadToEmailJS(email);
    setLeadSaved(sent);

    // Demo: simula la confirmación de pago de Stripe Checkout.
    // En producción este botón redirige a una sesión real de Stripe Checkout
    // y el desbloqueo se dispara desde el webhook de pago confirmado.
    setTimeout(() => {
      setPaying(false);
      setUnlocked(true);
      setShowPaywall(false);
    }, 1200);
  };

  return (
    <div className="min-h-screen w-full bg-[#12213a] flex items-center justify-center p-4 md:p-8">
      <div className="w-full max-w-5xl bg-[#f4efe2] rounded-sm shadow-2xl overflow-hidden" style={{ boxShadow: "0 30px 80px -20px rgba(0,0,0,0.6)" }}>
        {/* Cabecera estilo libreta de ahorro */}
        <div className="bg-[#0f1b2d] px-6 md:px-10 py-7 relative overflow-hidden">
          <div
            className="absolute inset-0 opacity-[0.06]"
            style={{
              backgroundImage:
                "repeating-linear-gradient(0deg, transparent, transparent 27px, #ffffff 28px)",
            }}
          />
          <div className="relative flex items-center justify-between">
            <div>
              <p className="text-[#c89b3c] text-[11px] tracking-[0.25em] uppercase font-semibold mb-1">
                @noob_Investor · Libreta FIRE
              </p>
              <h1
                className="text-[#f4efe2] text-[28px] md:text-[34px] leading-tight"
                style={{ fontFamily: "Fraunces, Georgia, serif", fontWeight: 600 }}
              >
                ¿Cuándo alcanzas tu independencia financiera?
              </h1>
            </div>
          </div>
        </div>

        <div className="grid md:grid-cols-[minmax(0,280px)_1fr]">
          {/* Panel de inputs */}
          <div className="px-6 md:px-8 py-8 bg-[#ebe4d2] border-r border-[#d8cfb6] no-print">
            <p className="text-[11px] tracking-[0.2em] uppercase text-[#a08a4a] font-semibold mb-5">
              Tus datos
            </p>
            <Slider label="Edad actual" value={edad} onChange={setEdad} min={18} max={65} step={1} suffix=" años" />
            <Slider
              label="Ahorro invertido hoy"
              value={ahorro}
              onChange={setAhorro}
              min={0}
              max={300000}
              step={1000}
              suffix="€"
            />
            <Slider
              label="Aportación mensual"
              value={aportacion}
              onChange={setAportacion}
              min={0}
              max={4000}
              step={50}
              suffix="€"
            />
            <Slider
              label="Rentabilidad esperada"
              value={rentabilidad}
              onChange={setRentabilidad}
              min={2}
              max={12}
              step={0.5}
              suffix="%"
              hint="MSCI World histórico ≈ 7-8% nominal"
            />
            <Slider
              label="Gasto anual en el retiro"
              value={gastoAnual}
              onChange={setGastoAnual}
              min={6000}
              max={80000}
              step={500}
              suffix="€"
            />
            <Slider
              label="Tasa de retirada"
              value={tasaRetirada}
              onChange={setTasaRetirada}
              min={2.5}
              max={5}
              step={0.1}
              suffix="%"
              hint="Regla del 4% clásica, 3.5% más conservadora"
            />
            <Slider
              label="Inflación esperada"
              value={inflacion}
              onChange={setInflacion}
              min={0}
              max={6}
              step={0.5}
              suffix="%"
            />
          </div>

          {/* Panel de resultados */}
          <div className="px-6 md:px-10 py-8">
            <div className="grid grid-cols-2 gap-4 mb-8">
              <div className="border-b-2 border-[#c89b3c] pb-3">
                <p className="text-[11px] tracking-[0.2em] uppercase text-[#8a8370] mb-1">Tu número FIRE</p>
                <p className="font-mono text-[26px] md:text-[30px] text-[#0f1b2d] font-bold leading-none">
                  {fmtEUR(numeroFireHoy)}
                </p>
              </div>
              <div className="border-b-2 border-[#0f1b2d] pb-3">
                <p className="text-[11px] tracking-[0.2em] uppercase text-[#8a8370] mb-1">Lo alcanzas a los</p>
                <p className="font-mono text-[26px] md:text-[30px] text-[#0f1b2d] font-bold leading-none">
                  {anosParaFire !== null ? `${sim.edadFire} años` : "50+ años"}
                </p>
                {anosParaFire !== null && (
                  <p className="text-[12px] text-[#8a8370] mt-1">dentro de {anosParaFire} años</p>
                )}
              </div>
            </div>

            <div className="h-64 md:h-72 mb-6">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={sim.rows} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="capitalFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#0f1b2d" stopOpacity={0.5} />
                      <stop offset="100%" stopColor="#0f1b2d" stopOpacity={0.03} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#d8cfb6" strokeDasharray="2 4" vertical={false} />
                  <XAxis
                    dataKey="edad"
                    tick={{ fill: "#8a8370", fontSize: 11, fontFamily: "monospace" }}
                    axisLine={{ stroke: "#d8cfb6" }}
                    tickLine={false}
                  />
                  <YAxis
                    tickFormatter={(v) => `${Math.round(v / 1000)}k€`}
                    tick={{ fill: "#8a8370", fontSize: 11, fontFamily: "monospace" }}
                    axisLine={false}
                    tickLine={false}
                    width={50}
                  />
                  <Tooltip
                    formatter={(v, name) => [fmtEUR(v), name === "capital" ? "Tu patrimonio" : "Número FIRE"]}
                    labelFormatter={(l) => `Edad ${l}`}
                    contentStyle={{
                      background: "#0f1b2d",
                      border: "none",
                      borderRadius: 2,
                      color: "#f4efe2",
                      fontSize: 12,
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="capital"
                    stroke="#0f1b2d"
                    strokeWidth={2}
                    fill="url(#capitalFill)"
                  />
                  <Area
                    type="monotone"
                    dataKey="numeroFire"
                    stroke="#c89b3c"
                    strokeWidth={1.5}
                    strokeDasharray="4 3"
                    fill="none"
                  />
                  {sim.edadFire && (
                    <ReferenceLine
                      x={sim.edadFire}
                      stroke="#b8862f"
                      strokeWidth={1.5}
                      label={{ value: "FIRE", position: "top", fill: "#b8862f", fontSize: 11, fontWeight: 600 }}
                    />
                  )}
                </AreaChart>
              </ResponsiveContainer>
            </div>

            <div className="flex items-center gap-6 text-[12px] text-[#8a8370] mb-6">
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-1.5 bg-[#0f1b2d] inline-block" /> Tu patrimonio
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-0.5 bg-[#c89b3c] inline-block" style={{ borderTop: "1.5px dashed #c89b3c" }} />
                Número FIRE necesario
              </div>
            </div>

            <div className="bg-[#0f1b2d] rounded-sm px-5 py-4">
              <p className="text-[#c89b3c] text-[11px] uppercase tracking-[0.15em] font-semibold mb-1.5">
                Lectura rápida
              </p>
              <p className="text-[#f4efe2] text-[13px] leading-relaxed">
                Con {fmtEUR(aportacion)}/mes a una rentabilidad real de{" "}
                <span className="font-mono">{(sim.rReal * 100).toFixed(1)}%</span> (descontada la inflación),
                {anosParaFire !== null
                  ? ` llegas a tu número FIRE de ${fmtEURDec(numeroFireHoy)} a los ${sim.edadFire} años.`
                  : ` no alcanzas tu número FIRE en el horizonte de 50 años — sube la aportación o baja el gasto objetivo.`}
              </p>
            </div>

            {/* Sección premium */}
            {!unlocked ? (
              <div className="mt-6 border border-dashed border-[#c89b3c] rounded-sm px-5 py-5 bg-[#f4efe2]">
                <div className="flex items-start gap-3">
                  <Lock size={18} className="text-[#b8862f] mt-0.5 shrink-0" />
                  <div className="flex-1">
                    <p className="text-[13px] font-semibold text-[#0f1b2d] mb-1">
                      Informe premium: ¿cuánto de fiable es este resultado?
                    </p>
                    <ul className="text-[12px] text-[#6b6350] space-y-1 mb-3">
                      <li className="flex items-center gap-1.5">
                        <Check size={13} className="text-[#b8862f]" /> Simulación Monte Carlo (400 escenarios con
                        volatilidad real de mercado)
                      </li>
                      <li className="flex items-center gap-1.5">
                        <Check size={13} className="text-[#b8862f]" /> % de probabilidad real de alcanzar tu FIRE
                      </li>
                      <li className="flex items-center gap-1.5">
                        <Check size={13} className="text-[#b8862f]" /> Informe en PDF descargable con tus cifras
                      </li>
                    </ul>
                    <button
                      onClick={() => setShowPaywall(true)}
                      className="bg-[#0f1b2d] text-[#f4efe2] text-[13px] font-semibold px-4 py-2 rounded-sm hover:bg-[#1a2c47] transition-colors"
                    >
                      Desbloquear informe — 4,99 €
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-6 border border-[#0f1b2d] rounded-sm px-5 py-5">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-[13px] font-semibold text-[#0f1b2d] uppercase tracking-wide">
                    Informe premium desbloqueado
                  </p>
                  <button
                    onClick={() => window.print()}
                    className="flex items-center gap-1.5 bg-[#0f1b2d] text-[#f4efe2] text-[12px] font-semibold px-3 py-1.5 rounded-sm hover:bg-[#1a2c47] transition-colors no-print"
                  >
                    <Download size={13} /> Descargar PDF
                  </button>
                </div>

                <Slider
                  label="Volatilidad anual asumida"
                  value={volatilidad}
                  onChange={setVolatilidad}
                  min={5}
                  max={25}
                  step={1}
                  suffix="%"
                  hint="Renta variable global histórica ≈ 15%"
                />

                {monteCarlo && (
                  <>
                    <div className="grid grid-cols-3 gap-3 mt-4 mb-4">
                      <div className="text-center bg-[#ebe4d2] rounded-sm py-3">
                        <p className="text-[10px] uppercase tracking-wide text-[#8a8370] mb-1">Mejor 10%</p>
                        <p className="font-mono text-[18px] font-bold text-[#0f1b2d]">
                          {monteCarlo.p10 ? `${edad + monteCarlo.p10}` : "50+"}
                        </p>
                        <p className="text-[10px] text-[#a39c8a]">años</p>
                      </div>
                      <div className="text-center bg-[#0f1b2d] rounded-sm py-3">
                        <p className="text-[10px] uppercase tracking-wide text-[#c89b3c] mb-1">Mediana</p>
                        <p className="font-mono text-[18px] font-bold text-[#f4efe2]">
                          {monteCarlo.p50 ? `${edad + monteCarlo.p50}` : "50+"}
                        </p>
                        <p className="text-[10px] text-[#a08a4a]">años</p>
                      </div>
                      <div className="text-center bg-[#ebe4d2] rounded-sm py-3">
                        <p className="text-[10px] uppercase tracking-wide text-[#8a8370] mb-1">Peor 10%</p>
                        <p className="font-mono text-[18px] font-bold text-[#0f1b2d]">
                          {monteCarlo.p90 ? `${edad + monteCarlo.p90}` : "50+"}
                        </p>
                        <p className="text-[10px] text-[#a39c8a]">años</p>
                      </div>
                    </div>
                    <p className="text-[12px] text-[#6b6350] leading-relaxed">
                      Con una volatilidad anual del {volatilidad}%, tienes un{" "}
                      <span className="font-mono font-semibold text-[#0f1b2d]">
                        {monteCarlo.successRate.toFixed(0)}%
                      </span>{" "}
                      de probabilidad de alcanzar tu número FIRE dentro del horizonte de 50 años. El cálculo base
                      (sin volatilidad) es solo un escenario entre muchos posibles — este rango te da una idea más
                      realista de cuándo podrías llegar.
                    </p>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="px-6 md:px-10 py-4 bg-[#ebe4d2] border-t border-[#d8cfb6] flex items-center justify-between">
          <p className="text-[11px] text-[#a08a4a]">Cálculo en términos reales (ajustado a inflación) · No es asesoramiento financiero</p>
          <p className="text-[11px] text-[#a08a4a] font-mono">@noob_Investor</p>
        </div>
      </div>

      {/* Modal de pago (demo) */}
      {showPaywall && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
          <div className="bg-[#f4efe2] rounded-sm max-w-sm w-full p-6 relative">
            <button
              onClick={() => setShowPaywall(false)}
              className="absolute top-3 right-3 text-[#8a8370] hover:text-[#0f1b2d]"
            >
              <X size={18} />
            </button>
            <p className="text-[11px] uppercase tracking-[0.2em] text-[#a08a4a] font-semibold mb-2">
              Informe premium
            </p>
            <h3 className="text-[20px] mb-3" style={{ fontFamily: "Fraunces, Georgia, serif", fontWeight: 600 }}>
              4,99 € — pago único
            </h3>
            <p className="text-[12px] text-[#6b6350] mb-4">
              Te enviamos el informe también por email para que lo tengas siempre a mano.
            </p>
            <input
              type="email"
              placeholder="tu@email.com"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (emailError) setEmailError("");
              }}
              className={`w-full border rounded-sm px-3 py-2 text-[13px] mb-1 bg-white ${
                emailError ? "border-red-400" : "border-[#d8cfb6]"
              }`}
            />
            {emailError && <p className="text-[11px] text-red-500 mb-2">{emailError}</p>}
            <button
              onClick={handleUnlock}
              disabled={paying}
              className="w-full bg-[#0f1b2d] text-[#f4efe2] text-[13px] font-semibold px-4 py-2.5 rounded-sm hover:bg-[#1a2c47] transition-colors flex items-center justify-center gap-2 mt-2"
            >
              {paying ? (
                <>
                  <Loader2 size={14} className="animate-spin" /> Procesando pago…
                </>
              ) : (
                "Pagar con Stripe"
              )}
            </button>
            <p className="text-[10px] text-[#a39c8a] mt-3 text-center">
              Prototipo: aquí se simula el pago. En producción esto abre Stripe Checkout real.
            </p>
          </div>
        </div>
      )}

      <style>{`
        @media print {
          .no-print { display: none !important; }
          body, .min-h-screen { background: white !important; }
          .shadow-2xl { box-shadow: none !important; }
        }
      `}</style>
    </div>
  );
}
