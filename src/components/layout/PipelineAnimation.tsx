// Animated SVG hero — visualizes the 5-node pipeline running.
// Pure CSS/SVG — no JS animation framework. Looks lively on the landing page.

const NODES = [
  { id: 'topic',      label: '热点',   sub: 'Radar',     color: '#67e8f9', delay: '0s'   },
  { id: 'script',     label: '脚本',   sub: 'Script',    color: '#a5f3fc', delay: '0.4s' },
  { id: 'storyboard', label: '分镜',   sub: 'Storyboard',color: '#c4b5fd', delay: '0.8s' },
  { id: 'video',      label: '视频',   sub: 'Render',    color: '#fbcfe8', delay: '1.2s' },
  { id: 'export',     label: '剪映包', sub: 'Export',    color: '#6ee7b7', delay: '1.6s' },
];

export function PipelineAnimation() {
  return (
    <div className="relative">
      {/* Background grid + glow */}
      <div className="absolute -inset-8 rounded-[2.5rem] bg-gradient-to-br from-cyan-500/15 via-fuchsia-500/10 to-emerald-500/10 blur-2xl" />

      <div className="relative rounded-3xl border border-white/10 bg-slate-950/65 p-6 shadow-2xl shadow-cyan-950/40 backdrop-blur-xl">
        <div className="mb-5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-emerald-400/15 text-emerald-200 ring-1 ring-emerald-300/30">
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor">
                <circle cx="12" cy="12" r="5" className="animate-pulse-soft" />
              </svg>
            </span>
            <p className="text-xs uppercase tracking-[0.35em] text-cyan-200">Live Pipeline</p>
          </div>
          <span className="rounded-full bg-emerald-400/10 px-3 py-1 text-[11px] font-semibold text-emerald-200 ring-1 ring-emerald-300/25">
            {NODES.length} nodes · auto
          </span>
        </div>

        {/* SVG flow */}
        <svg viewBox="0 0 540 180" className="h-44 w-full" role="img" aria-label="5 节点工作流动画">
          <defs>
            <linearGradient id="flowGradient" x1="0" x2="1" y1="0" y2="0">
              <stop offset="0%" stopColor="#67e8f9" stopOpacity="0" />
              <stop offset="40%" stopColor="#67e8f9" stopOpacity="0.9" />
              <stop offset="60%" stopColor="#c4b5fd" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#6ee7b7" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* Connecting line — moving gradient pulse */}
          <line
            x1="40" y1="90" x2="500" y2="90"
            stroke="rgba(148,163,184,0.2)" strokeWidth="2" strokeDasharray="4 6"
          />
          <line
            x1="40" y1="90" x2="500" y2="90"
            stroke="url(#flowGradient)" strokeWidth="2.5" strokeDasharray="240 240"
            className="animate-pipeline-flow"
            style={{ strokeDasharray: '60 480' }}
          />

          {NODES.map((node, i) => {
            const x = 40 + i * 115;
            return (
              <g key={node.id} style={{ animationDelay: node.delay }} className="animate-node-glow">
                <circle cx={x} cy="90" r="22" fill="rgba(15,23,42,0.95)" stroke={node.color} strokeWidth="1.5" />
                <circle cx={x} cy="90" r="6" fill={node.color}>
                  <animate
                    attributeName="opacity"
                    values="0.3;1;0.3"
                    dur="2.4s"
                    begin={node.delay}
                    repeatCount="indefinite"
                  />
                </circle>
                <text x={x} y="50" textAnchor="middle" className="fill-white text-[11px] font-semibold">
                  {node.label}
                </text>
                <text x={x} y="138" textAnchor="middle" className="fill-slate-400 text-[10px] uppercase tracking-widest">
                  {node.sub}
                </text>
              </g>
            );
          })}
        </svg>

        {/* Bottom KPIs */}
        <div className="mt-4 grid grid-cols-3 gap-2 border-t border-white/10 pt-4 text-center text-[11px]">
          <div>
            <p className="text-slate-400">输入</p>
            <p className="mt-0.5 font-mono font-semibold text-cyan-200">1 个主题</p>
          </div>
          <div>
            <p className="text-slate-400">耗时</p>
            <p className="mt-0.5 font-mono font-semibold text-violet-200">~ 3-5 min</p>
          </div>
          <div>
            <p className="text-slate-400">输出</p>
            <p className="mt-0.5 font-mono font-semibold text-emerald-200">.zip + draft</p>
          </div>
        </div>
      </div>
    </div>
  );
}
