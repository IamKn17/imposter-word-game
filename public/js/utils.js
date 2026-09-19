// ============================================================
// AUDIO SYNTHESIS & SFX ENGINE (Zero External Dependencies)
// ============================================================
const SoundFX = {
  ctx: null,
  muted: localStorage.getItem('imposter_muted') === 'true',

  init() {
    if (!this.ctx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) {
        this.ctx = new AudioContext();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  },

  toggleMute() {
    this.muted = !this.muted;
    localStorage.setItem('imposter_muted', this.muted);
    return this.muted;
  },

  play(type) {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.connect(gain);
      gain.connect(this.ctx.destination);

      switch (type) {
        case 'click':
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(440, now);
          osc.frequency.exponentialRampToValueAtTime(880, now + 0.05);
          gain.gain.setValueAtTime(0.12, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
          osc.start(now);
          osc.stop(now + 0.05);
          break;

        case 'join':
          osc.type = 'sine';
          osc.frequency.setValueAtTime(320, now);
          osc.frequency.exponentialRampToValueAtTime(640, now + 0.15);
          gain.gain.setValueAtTime(0.15, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
          osc.start(now);
          osc.stop(now + 0.2);
          break;

        case 'start':
          // Dramatic bass drop + sweep
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(120, now);
          osc.frequency.exponentialRampToValueAtTime(40, now + 0.8);
          gain.gain.setValueAtTime(0.25, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
          osc.start(now);
          osc.stop(now + 0.8);
          break;

        case 'tick':
          osc.type = 'sine';
          osc.frequency.setValueAtTime(600, now);
          gain.gain.setValueAtTime(0.08, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
          osc.start(now);
          osc.stop(now + 0.04);
          break;

        case 'urgentTick':
          osc.type = 'square';
          osc.frequency.setValueAtTime(880, now);
          gain.gain.setValueAtTime(0.15, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
          osc.start(now);
          osc.stop(now + 0.06);
          break;

        case 'reveal':
          // High-tech whoosh
          osc.type = 'sine';
          osc.frequency.setValueAtTime(200, now);
          osc.frequency.exponentialRampToValueAtTime(800, now + 0.3);
          gain.gain.setValueAtTime(0.2, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
          osc.start(now);
          osc.stop(now + 0.35);
          break;

        case 'vote':
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(520, now);
          osc.frequency.setValueAtTime(660, now + 0.08);
          gain.gain.setValueAtTime(0.18, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
          osc.start(now);
          osc.stop(now + 0.2);
          break;

        case 'eject':
          // Alarm klaxon tone
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(300, now);
          osc.frequency.linearRampToValueAtTime(150, now + 0.4);
          gain.gain.setValueAtTime(0.25, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
          osc.start(now);
          osc.stop(now + 0.5);
          break;

        case 'win':
          // Victory arpeggio chord
          [440, 554.37, 659.25, 880].forEach((freq, i) => {
            const chordOsc = this.ctx.createOscillator();
            const chordGain = this.ctx.createGain();
            chordOsc.connect(chordGain);
            chordGain.connect(this.ctx.destination);
            chordOsc.type = 'sine';
            chordOsc.frequency.setValueAtTime(freq, now + i * 0.1);
            chordGain.gain.setValueAtTime(0.15, now + i * 0.1);
            chordGain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.1 + 0.6);
            chordOsc.start(now + i * 0.1);
            chordOsc.stop(now + i * 0.1 + 0.6);
          });
          break;

        case 'error':
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(160, now);
          osc.frequency.setValueAtTime(110, now + 0.1);
          gain.gain.setValueAtTime(0.2, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
          osc.start(now);
          osc.stop(now + 0.25);
          break;
      }
    } catch (e) {
      // Audio autoplay policy fallback
    }
  }
};

// ============================================================
// CANVAS CONFETTI ENGINE (Victory Celebration)
// ============================================================
function launchConfetti() {
  let canvas = document.getElementById('confetti-canvas');
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.id = 'confetti-canvas';
    canvas.className = 'fixed inset-0 pointer-events-none z-50';
    document.body.appendChild(canvas);
  }
  
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  const ctx = canvas.getContext('2d');
  
  const particles = [];
  const colors = ['#ec4899', '#8b5cf6', '#3b82f6', '#10b981', '#f59e0b', '#06b6d4', '#f43f5e'];
  
  for (let i = 0; i < 120; i++) {
    particles.push({
      x: canvas.width * 0.5 + (Math.random() - 0.5) * 200,
      y: canvas.height * 0.4 + (Math.random() - 0.5) * 100,
      vx: (Math.random() - 0.5) * 18,
      vy: (Math.random() - 0.8) * 16,
      size: Math.random() * 8 + 4,
      color: colors[Math.floor(Math.random() * colors.length)],
      rotation: Math.random() * 360,
      vRot: (Math.random() - 0.5) * 10,
      alpha: 1
    });
  }

  let frames = 0;
  function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    let alive = false;

    particles.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.35; // gravity
      p.vx *= 0.98; // drag
      p.rotation += p.vRot;
      if (frames > 40) p.alpha -= 0.015;

      if (p.alpha > 0) {
        alive = true;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rotation * Math.PI) / 180);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = Math.max(0, p.alpha);
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
        ctx.restore();
      }
    });

    frames++;
    if (alive) {
      requestAnimationFrame(render);
    } else {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }
  render();
}

// ============================================================
// AMBIENT BACKGROUND PARTICLES (Starfield Mesh)
// ============================================================
function initBackgroundParticles() {
  const canvas = document.getElementById('bg-canvas');
  if (!canvas) return;
  
  const ctx = canvas.getContext('2d');
  let width = (canvas.width = window.innerWidth);
  let height = (canvas.height = window.innerHeight);

  window.addEventListener('resize', () => {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
  });

  const stars = [];
  for (let i = 0; i < 60; i++) {
    stars.push({
      x: Math.random() * width,
      y: Math.random() * height,
      radius: Math.random() * 1.5 + 0.5,
      alpha: Math.random() * 0.6 + 0.2,
      speed: Math.random() * 0.25 + 0.05,
      hue: Math.random() > 0.5 ? 260 : 190 // purple & cyan
    });
  }

  function draw() {
    ctx.clearRect(0, 0, width, height);
    stars.forEach(s => {
      s.y -= s.speed;
      if (s.y < 0) {
        s.y = height;
        s.x = Math.random() * width;
      }
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
      ctx.fillStyle = `hsla(${s.hue}, 80%, 70%, ${s.alpha})`;
      ctx.shadowBlur = s.radius * 3;
      ctx.shadowColor = `hsla(${s.hue}, 90%, 60%, 0.8)`;
      ctx.fill();
    });
    requestAnimationFrame(draw);
  }
  draw();
}

// ============================================================
// GENERAL GAME UTILITIES
// ============================================================

// Format seconds to M:SS display
function formatTimer(seconds) {
  if (seconds < 0) seconds = 0;
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// Validate a clue word client-side
function validateClue(clue, secretWord) {
  if (!clue || clue.trim().length === 0) {
    return { valid: false, error: 'Clue cannot be empty' };
  }
  
  const trimmed = clue.trim();
  
  if (trimmed.includes(' ')) {
    return { valid: false, error: 'Clue must be a single word' };
  }
  
  if (!/^[a-zA-Z]+$/.test(trimmed)) {
    return { valid: false, error: 'Only letters allowed' };
  }
  
  // Only reject for civilians who know secretWord
  if (secretWord && trimmed.toLowerCase() === secretWord.toLowerCase()) {
    return { valid: false, error: 'Civilians cannot use the secret word!' };
  }
  
  if (secretWord) {
    const sw = secretWord.toLowerCase();
    const cl = trimmed.toLowerCase();
    if (cl === sw + 's' || cl === sw + 'es' || sw === cl + 's' || sw === cl + 'es') {
      return { valid: false, error: 'Too similar to secret word' };
    }
  }
  
  // Check for duplicate clues already on screen
  const cluesList = document.getElementById('clues-list');
  if (cluesList) {
    const existingClues = cluesList.querySelectorAll('.clue-text-val');
    for (const el of existingClues) {
      const text = el.textContent.trim().toLowerCase();
      if (text !== '⏭️' && text === trimmed.toLowerCase()) {
        return { valid: false, error: 'This word was already used!' };
      }
    }
  }
  
  return { valid: true, error: null };
}

// Deterministic vibrant cyber avatar gradient
function stringToColor(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const gradients = [
    { from: '#ec4899', to: '#8b5cf6', ring: 'rgba(236, 72, 153, 0.4)' }, // pink-purple
    { from: '#06b6d4', to: '#3b82f6', ring: 'rgba(6, 182, 212, 0.4)' }, // cyan-blue
    { from: '#10b981', to: '#059669', ring: 'rgba(16, 185, 129, 0.4)' }, // emerald
    { from: '#f59e0b', to: '#ef4444', ring: 'rgba(245, 158, 11, 0.4)' }, // amber-red
    { from: '#8b5cf6', to: '#6366f1', ring: 'rgba(139, 92, 246, 0.4)' }, // violet-indigo
    { from: '#14b8a6', to: '#06b6d4', ring: 'rgba(20, 184, 166, 0.4)' }, // teal-cyan
    { from: '#f43f5e', to: '#d946ef', ring: 'rgba(244, 63, 94, 0.4)' },  // rose-fuchsia
    { from: '#eab308', to: '#f97316', ring: 'rgba(234, 179, 8, 0.4)' }   // yellow-orange
  ];
  const index = ((hash % gradients.length) + gradients.length) % gradients.length;
  return gradients[index];
}

// Generate high-tech Initial Avatar HTML
function generateAvatar(name, size = 'md') {
  const initial = name ? name.charAt(0).toUpperCase() : '?';
  const palette = stringToColor(name || 'Unknown');
  
  let sizeClass = 'w-11 h-11 text-lg';
  let badgeSize = 'w-3 h-3';
  if (size === 'sm') { sizeClass = 'w-8 h-8 text-xs'; badgeSize = 'w-2 h-2'; }
  if (size === 'lg') { sizeClass = 'w-16 h-16 text-2xl font-black'; badgeSize = 'w-4 h-4'; }
  if (size === 'xl') { sizeClass = 'w-20 h-20 text-3xl font-black'; badgeSize = 'w-5 h-5'; }
  
  return `
    <div class="relative flex-shrink-0 group">
      <div class="${sizeClass} rounded-2xl flex items-center justify-center font-black text-white shadow-lg transition-transform group-hover:scale-105" 
           style="background: linear-gradient(135deg, ${palette.from}, ${palette.to}); box-shadow: 0 4px 15px ${palette.ring}; border: 2px solid rgba(255,255,255,0.15)">
        <span>${initial}</span>
      </div>
      <div class="absolute -bottom-0.5 -right-0.5 ${badgeSize} rounded-full bg-emerald-400 ring-2 ring-slate-950 shadow-sm"></div>
    </div>
  `;
}

// Copy text to clipboard with animated visual feedback
async function copyToClipboard(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    } else {
      const textArea = document.createElement("textarea");
      textArea.value = text;
      textArea.style.position = "fixed";
      textArea.style.left = "-999999px";
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      document.execCommand('copy');
      textArea.remove();
      return true;
    }
  } catch (error) {
    console.error('Failed to copy', error);
    return false;
  }
}

// Show a high-tech floating toast
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  
  const toast = document.createElement('div');
  
  let bgClass = 'bg-slate-900/90 border-slate-700 text-slate-100 shadow-cyan-500/10';
  let icon = '<span class="text-cyan-400 text-lg font-bold">ℹ️</span>';
  
  if (type === 'success') {
    bgClass = 'bg-slate-900/90 border-emerald-500/50 text-emerald-100 shadow-emerald-500/20';
    icon = '<span class="text-emerald-400 text-lg">⚡</span>';
  } else if (type === 'error') {
    bgClass = 'bg-slate-900/90 border-rose-500/50 text-rose-100 shadow-rose-500/20';
    icon = '<span class="text-rose-400 text-lg">⚠️</span>';
  } else if (type === 'warning') {
    bgClass = 'bg-slate-900/90 border-amber-500/50 text-amber-100 shadow-amber-500/20';
    icon = '<span class="text-amber-400 text-lg">🔍</span>';
  }

  toast.className = `toast-enter flex items-center p-3.5 px-4 border rounded-2xl shadow-xl backdrop-blur-xl pointer-events-auto transition-all ${bgClass}`;
  toast.innerHTML = `
    <div class="flex-shrink-0 mr-3">${icon}</div>
    <div class="font-bold text-xs tracking-wide flex-1">${message}</div>
    <button class="ml-2 flex-shrink-0 text-slate-400 hover:text-white transition" onclick="this.parentElement.remove()">
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
    </button>
  `;
  
  container.appendChild(toast);
  
  setTimeout(() => {
    if (toast.parentElement) {
      toast.classList.remove('toast-enter');
      toast.classList.add('toast-exit');
      setTimeout(() => toast.remove(), 300);
    }
  }, 3200);
}
