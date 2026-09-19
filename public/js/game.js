const Game = {
  // Local state
  playerId: null,
  playerName: null,
  roomCode: null,
  room: null,
  myRole: null,
  secretWord: null,
  category: null,
  currentView: 'home',
  hasVoted: false,
  voteCount: 0,
  totalVoters: 0,
  _lastTickTime: null,
  
  // Handler methods
  onConnected() {
    console.log('Socket connected');
  },
  
  onDisconnected() {
    document.getElementById('reconnect-overlay').classList.remove('hidden');
  },
  
  onReconnect() {
    document.getElementById('reconnect-overlay').classList.add('hidden');
    const session = this.loadSession();
    if (session) {
      SocketManager.attemptReconnect(session.roomCode, session.playerId, (response) => {
        if (!response.success) {
          this.clearSession();
          this.showView('home');
          showToast('Mission session expired. Please rejoin.', 'error');
        } else {
          this.room = response.room;
          if (this.room.state === 'lobby') {
            this.showView('lobby');
            this.renderLobby();
          }
          showToast('Signal re-established!', 'success');
        }
      });
    }
  },
  
  onPlayerJoined(data) {
    if (!this.room) return;
    this.room.players.push(data.player);
    this.renderPlayerList();
    SoundFX.play('join');
    showToast(`Operative ${data.player.name} connected`, 'info');
    this.checkStartButton();
  },
  
  onPlayerLeft(data) {
    if (!this.room) return;
    const p = this.room.players.find(p => p.id === data.playerId);
    if (p) {
      this.room.players = this.room.players.filter(p => p.id !== data.playerId);
      this.renderPlayerList();
      showToast(`${p.name} disconnected from mission`, 'warning');
      this.checkStartButton();
    }
  },
  
  onSettingsUpdated(data) {
    if (this.room) this.room.settings = data.settings;
  },
  
  onGameStarted() {
    SoundFX.play('start');
    showToast('MISSION LAUNCHED! DECRYPTING IDENTITIES...', 'success');
  },
  
  onRoleAssigned(data) {
    this.myRole = data.role;
    this.secretWord = data.secretWord;
    this.category = data.category;
    
    SoundFX.play('reveal');
    const card = document.getElementById('role-card');
    const badgeTag = document.getElementById('role-badge-tag');
    const title = document.getElementById('role-title');
    const categoryLabel = document.getElementById('role-category');
    const wordDisplay = document.getElementById('role-word');
    const wordLabel = document.getElementById('word-label');
    const warning = document.getElementById('role-warning');
    
    card.classList.remove('theme-civilian', 'theme-imposter', 'revealed');
    categoryLabel.textContent = this.category;
    
    if (this.myRole === 'civilian') {
      card.classList.add('theme-civilian');
      badgeTag.textContent = 'AGENT STATUS // CIVILIAN';
      badgeTag.className = 'px-3 py-1 rounded-full text-[11px] font-mono font-black uppercase tracking-widest mb-3 border border-sky-400/40 bg-sky-950/80 text-sky-300';
      title.textContent = 'CIVILIAN';
      title.className = 'text-4xl font-black font-display mb-1 uppercase tracking-wider text-center text-sky-400 drop-shadow-[0_0_15px_rgba(56,189,248,0.5)]';
      wordLabel.textContent = 'Target Secret Word';
      wordDisplay.textContent = this.secretWord;
      wordDisplay.className = 'text-3xl font-black font-display text-center bg-sky-950/60 border border-sky-400/30 text-sky-200 px-4 py-3.5 rounded-2xl w-full break-words shadow-inner';
      warning.textContent = '🔍 Give subtle 1-word clues. Root out the Imposter without giving away the word!';
      warning.className = 'text-center mt-4 font-bold text-xs bg-sky-950/70 border border-sky-500/30 text-sky-200 px-3.5 py-2.5 rounded-xl';
    } else {
      card.classList.add('theme-imposter');
      badgeTag.textContent = 'AGENT STATUS // IMPOSTER';
      badgeTag.className = 'px-3 py-1 rounded-full text-[11px] font-mono font-black uppercase tracking-widest mb-3 border border-rose-500/40 bg-rose-950/80 text-rose-300';
      title.textContent = 'IMPOSTER';
      title.className = 'text-4xl font-black font-display mb-1 uppercase tracking-wider text-center text-rose-400 drop-shadow-[0_0_15px_rgba(244,63,94,0.6)]';
      wordLabel.textContent = 'Target Secret Word';
      wordDisplay.textContent = '???';
      wordDisplay.className = 'text-3xl font-black font-display text-center bg-rose-950/60 border border-rose-500/30 text-rose-300 px-4 py-3.5 rounded-2xl w-full break-words shadow-inner tracking-widest';
      warning.textContent = '⚠️ You do not know the Secret Word! Blend in, bluff, or deduce the word to win!';
      warning.className = 'text-center mt-4 font-bold text-xs bg-rose-950/70 border border-rose-500/30 text-rose-200 px-3.5 py-2.5 rounded-xl';
    }
    
    this.showView('role');
  },
  
  onTurnStart(data) {
    if (this.currentView !== 'clue') {
      this.showView('clue');
      document.getElementById('clues-list').innerHTML = '';
      
      const badge = document.getElementById('my-role-badge');
      if (this.myRole === 'civilian') {
        badge.textContent = `CIVILIAN (${this.category})`;
        badge.className = 'inline-block px-2.5 py-0.5 text-[10px] font-mono font-bold rounded-full uppercase tracking-wider mt-0.5 border border-sky-400/40 bg-sky-950/80 text-sky-300';
      } else {
        badge.textContent = `IMPOSTER (${this.category})`;
        badge.className = 'inline-block px-2.5 py-0.5 text-[10px] font-mono font-bold rounded-full uppercase tracking-wider mt-0.5 border border-rose-500/40 bg-rose-950/80 text-rose-300';
      }
    }
    
    document.getElementById('active-player-name').textContent = data.playerName;
    const turnContainer = document.getElementById('turn-container');
    const myInput = document.getElementById('my-turn-input');
    const inputEl = document.getElementById('input-clue');
    
    if (data.playerId === this.playerId) {
      SoundFX.play('reveal');
      document.getElementById('turn-status').textContent = 'YOUR TRANSMISSION TURN';
      document.getElementById('turn-status').className = 'text-[11px] font-mono font-bold uppercase tracking-widest mb-1 text-purple-400 animate-pulse';
      turnContainer.classList.add('active-turn-pulse');
      myInput.classList.remove('hidden');
      inputEl.value = '';
      inputEl.focus();
      document.getElementById('btn-submit-clue').disabled = false;
      document.getElementById('clue-error').textContent = '';
    } else {
      document.getElementById('turn-status').textContent = 'WAITING FOR TRANSMISSION';
      document.getElementById('turn-status').className = 'text-[11px] font-mono font-bold uppercase tracking-widest mb-1 text-slate-400';
      turnContainer.classList.remove('active-turn-pulse');
      myInput.classList.add('hidden');
    }
  },
  
  onClueSubmitted(data) {
    SoundFX.play('click');
    const list = document.getElementById('clues-list');
    const isMe = data.playerId === this.playerId;
    const avatar = generateAvatar(data.playerName, 'sm');
    
    const card = document.createElement('div');
    card.className = `flex items-center gap-3 p-3 rounded-2xl slide-in border transition-all ${
      isMe ? 'bg-purple-950/40 border-purple-500/40 shadow-lg shadow-purple-950/30' : 'glass-panel border-slate-800'
    }`;
    card.innerHTML = `
      ${avatar}
      <div class="flex-1 min-w-0">
        <div class="text-[11px] font-mono font-bold text-slate-400 flex items-center justify-between">
          <span>${data.playerName}</span>
          ${isMe ? '<span class="text-purple-400 text-[9px] uppercase px-1.5 py-0.2 rounded bg-purple-900/50">You</span>' : ''}
        </div>
        <div class="text-lg font-display font-black text-white clue-text-val truncate tracking-wide">${data.clue}</div>
      </div>
    `;
    list.appendChild(card);
    list.scrollTop = list.scrollHeight;
  },
  
  onTimerSync(data) {
    const isVote = this.currentView === 'vote';
    const isGuess = !document.getElementById('counter-guess-section').classList.contains('hidden');
    
    let textEl, ringEl, totalTime;
    
    if (isGuess) {
      textEl = document.getElementById('timer-text-guess');
      ringEl = document.getElementById('timer-ring-guess');
      totalTime = 30;
    } else if (isVote) {
      textEl = document.getElementById('timer-text-vote');
      ringEl = null;
    } else {
      textEl = document.getElementById('timer-text-clue');
      ringEl = document.getElementById('timer-ring-clue');
      totalTime = this.room?.settings?.clueTimeLimit || 45;
    }
    
    if (textEl) {
      if (isVote) textEl.textContent = formatTimer(data.timeLeft);
      else textEl.textContent = Math.ceil(data.timeLeft);
    }

    // Audio SFX on countdown
    if (data.timeLeft !== this._lastTickTime) {
      this._lastTickTime = data.timeLeft;
      if (data.timeLeft <= 5 && data.timeLeft > 0) {
        SoundFX.play('urgentTick');
      } else if (data.timeLeft <= 10 && data.timeLeft > 0) {
        SoundFX.play('tick');
      }
    }
    
    if (ringEl && totalTime) {
      const percentage = data.timeLeft / totalTime;
      const offset = 264 - (percentage * 264);
      ringEl.style.strokeDashoffset = offset;
      
      if (data.timeLeft <= 5) {
        ringEl.setAttribute('stroke', '#f43f5e'); // red
      } else if (data.timeLeft <= 10) {
        ringEl.setAttribute('stroke', '#f59e0b'); // amber
      } else {
        ringEl.setAttribute('stroke', '#10b981'); // green
      }
    }
  },
  
  onDiscussionStart(data) {
    SoundFX.play('eject');
    this.showView('vote');
    this.hasVoted = false;
    this.voteCount = 0;
    
    const alivePlayers = this.room.players.filter(p => p.isAlive && p.id !== this.playerId);
    this.totalVoters = this.room.players.filter(p => p.isAlive).length;
    document.getElementById('vote-progress').textContent = `0/${this.totalVoters} Voted`;
    
    // Render summary
    const summary = document.getElementById('all-clues-summary');
    summary.innerHTML = '';
    if (data.clues && Array.isArray(data.clues)) {
      data.clues.forEach(c => {
        const pName = c.playerName || this.room.players.find(p => p.id === c.playerId)?.name || 'Unknown';
        summary.innerHTML += `
          <div class="bg-slate-900/90 p-2 rounded-xl border border-slate-800 flex items-center justify-between text-xs">
            <span class="text-slate-400 font-mono font-bold truncate">${pName}</span>
            <span class="font-display font-black text-white ml-2">${c.clue}</span>
          </div>
        `;
      });
    }
    
    // Render voting grid (suspect lineup)
    const grid = document.getElementById('voting-grid');
    grid.innerHTML = '';
    
    alivePlayers.forEach(p => {
      const avatar = generateAvatar(p.name, 'md');
      grid.innerHTML += `
        <div class="glass-panel p-3.5 rounded-2xl flex flex-col items-center gap-2.5 text-center transition-all hover:border-purple-500/50 hover:scale-[1.02] player-vote-card border border-slate-800">
          ${avatar}
          <div class="font-display font-black text-sm truncate w-full text-slate-100">${p.name}</div>
          <button class="vote-btn w-full bg-slate-800 hover:bg-rose-600 hover:border-rose-500 border border-slate-700 text-slate-200 hover:text-white font-display font-black py-2 rounded-xl transition text-xs tracking-wider uppercase shadow-md" data-id="${p.id}" data-name="${p.name}">
            Accuse 🎯
          </button>
        </div>
      `;
    });
    
    document.getElementById('vote-confirmation').classList.add('hidden');
    document.getElementById('btn-skip-vote').classList.remove('hidden');
    document.getElementById('voting-grid').classList.remove('pointer-events-none', 'opacity-40');
  },
  
  onVoteReceived(data) {
    this.voteCount++;
    document.getElementById('vote-progress').textContent = `${this.voteCount}/${this.totalVoters} Voted`;
    SoundFX.play('vote');
  },
  
  onVoteResult(data) {
    this.showView('ejection');
    const ejectionView = document.getElementById('view-ejection');
    const content = document.getElementById('ejection-content');
    const counterSec = document.getElementById('counter-guess-section');
    const contBtn = document.getElementById('btn-ejection-continue');
    
    counterSec.classList.add('hidden');
    contBtn.classList.add('hidden');
    this._pendingCounterGuess = null;
    
    content.innerHTML = `
      <div class="py-8">
        <div class="w-16 h-16 rounded-full border-4 border-purple-500/20 border-t-purple-500 animate-spin mx-auto mb-4"></div>
        <div class="text-2xl font-display font-black animate-pulse text-purple-400 tracking-wider uppercase">TALLYING VOTES...</div>
      </div>
    `;
    
    setTimeout(() => {
      ejectionView.classList.add('screen-shake');
      setTimeout(() => ejectionView.classList.remove('screen-shake'), 700);

      if (data.isTie || !data.ejectedId) {
        SoundFX.play('click');
        content.innerHTML = `
          <div class="p-6 glass-panel rounded-3xl border border-slate-700">
            <div class="text-4xl mb-2">⚖️</div>
            <h2 class="text-2xl font-black font-display mb-2 text-slate-200 uppercase">Vote Tied or Skipped</h2>
            <p class="text-sm font-mono text-slate-400">The council could not reach a clear majority. No operative was ejected.</p>
          </div>
        `;
        contBtn.classList.remove('hidden');
      } else {
        const isImp = data.ejectedRole === 'imposter';
        if (isImp) SoundFX.play('win');
        else SoundFX.play('eject');

        content.innerHTML = `
          <div class="p-6 glass-panel rounded-3xl ${isImp ? 'border-rose-500/50 shadow-rose-950/50' : 'border-sky-500/50 shadow-sky-950/50'} shadow-2xl">
            <div class="text-5xl mb-3">${isImp ? '😈' : '👤'}</div>
            <h2 class="text-3xl font-black font-display mb-2 text-white uppercase tracking-wider">${data.ejectedName} Was Ejected!</h2>
            <div class="inline-block px-4 py-1.5 rounded-full font-mono font-black text-sm uppercase tracking-widest mt-2 ${
              isImp ? 'bg-rose-950/90 text-rose-400 border border-rose-500/50' : 'bg-sky-950/90 text-sky-400 border border-sky-500/50'
            }">
              THEY WERE ${isImp ? 'AN IMPOSTER ⚠️' : 'A CIVILIAN 🛡️'}
            </div>
          </div>
        `;
        
        if (this._pendingCounterGuess) {
          const pending = this._pendingCounterGuess;
          this._pendingCounterGuess = null;
          if (pending.type === 'prompt') {
            this._showCounterGuessActive();
          } else {
            this._showCounterGuessWaiting(pending.ejectedName);
          }
        } else if (!isImp) {
          setTimeout(() => contBtn.classList.remove('hidden'), 1500);
        }
      }
    }, 2200);
  },
  
  _showCounterGuessActive() {
    SoundFX.play('eject');
    const counterSec = document.getElementById('counter-guess-section');
    counterSec.classList.remove('hidden');
    document.getElementById('counter-guess-active').classList.remove('hidden');
    document.getElementById('counter-guess-waiting').classList.add('hidden');
    document.getElementById('input-guess').value = '';
    document.getElementById('input-guess').focus();
  },
  
  _showCounterGuessWaiting(ejectedName) {
    const counterSec = document.getElementById('counter-guess-section');
    counterSec.classList.remove('hidden');
    document.getElementById('counter-guess-active').classList.add('hidden');
    document.getElementById('counter-guess-waiting').classList.remove('hidden');
    document.getElementById('counter-guess-waiting-text').textContent = `${ejectedName} is attempting to deduce the secret word...`;
  },
  
  onCounterGuessPrompt(data) {
    if (document.getElementById('ejection-content')?.textContent?.includes('TALLYING')) {
      this._pendingCounterGuess = { type: 'prompt' };
    } else {
      this._showCounterGuessActive();
    }
  },
  
  onCounterGuessWaiting(data) {
    if (document.getElementById('ejection-content')?.textContent?.includes('TALLYING')) {
      this._pendingCounterGuess = { type: 'waiting', ejectedName: data.ejectedName };
    } else {
      this._showCounterGuessWaiting(data.ejectedName);
    }
  },
  
  onCounterGuessResult(data) {
    const counterSec = document.getElementById('counter-guess-section');
    if (data.correct) SoundFX.play('win');
    else SoundFX.play('error');

    counterSec.innerHTML = `
      <div class="text-center py-2">
        <p class="text-xs font-mono text-slate-400 uppercase tracking-widest mb-1">Imposter Counter-Guess</p>
        <h3 class="text-2xl font-black font-display mb-3 ${data.correct ? 'text-emerald-400' : 'text-rose-400'} uppercase">"${data.word}"</h3>
        <div class="text-xl font-black font-display ${data.correct ? 'text-emerald-400' : 'text-rose-400'}">
          ${data.correct ? 'CORRECT! IMPOSTER STEALS THE VICTORY! 🎉' : 'INCORRECT! ❌'}
        </div>
      </div>
    `;
  },
  
  onGameOver(data) {
    SoundFX.play('win');
    launchConfetti();
    this.showView('gameover');
    
    const isCivWin = data.winner === 'civilians';
    const banner = document.getElementById('winner-banner');
    const title = document.getElementById('winner-title');
    const reason = document.getElementById('win-reason');
    
    banner.textContent = isCivWin ? 'CIVILIAN VICTORY' : 'IMPOSTER DOMINATION';
    banner.className = `inline-block px-4 py-1.5 rounded-full font-mono font-black text-xs uppercase tracking-widest mb-3 ${
      isCivWin ? 'bg-sky-950/80 text-sky-400 border border-sky-500/40 shadow-sky-500/20' : 'bg-rose-950/80 text-rose-400 border border-rose-500/40 shadow-rose-500/20'
    }`;
    
    title.textContent = isCivWin ? 'CIVILIANS WIN' : 'IMPOSTERS WIN';
    title.className = `text-4xl font-black font-display tracking-tight uppercase text-transparent bg-clip-text ${
      isCivWin ? 'bg-gradient-to-r from-sky-400 to-cyan-300' : 'bg-gradient-to-r from-rose-500 to-orange-400'
    }`;
    
    reason.textContent = data.reason;
    
    document.getElementById('game-over-word').textContent = data.secretWord || this.secretWord || '???';
    document.getElementById('game-over-category').textContent = data.category ? `Category: ${data.category}` : '';
    
    // Scoreboard with Medals
    const list = document.getElementById('scoreboard-list');
    list.innerHTML = '';
    
    if (data.players && Array.isArray(data.players)) {
      const sorted = [...data.players].sort((a, b) => b.score - a.score);
      sorted.forEach((p, idx) => {
        const isImp = p.role === 'imposter';
        const roleIcon = isImp ? '😈' : '👤';
        let medal = '';
        if (idx === 0) medal = '🥇';
        else if (idx === 1) medal = '🥈';
        else if (idx === 2) medal = '🥉';

        list.innerHTML += `
          <div class="flex items-center justify-between p-3 bg-slate-900/80 rounded-2xl border border-slate-800">
            <div class="flex items-center gap-3 min-w-0">
              <span class="text-base w-5 text-center font-bold">${medal || `#${idx + 1}`}</span>
              ${generateAvatar(p.name, 'sm')}
              <div class="truncate">
                <div class="font-display font-black text-white text-sm flex items-center gap-2 truncate">
                  <span>${p.name}</span>
                  ${!p.isAlive ? '<span class="text-[9px] font-mono bg-slate-800 px-1.5 py-0.5 rounded text-slate-400">Ejected</span>' : ''}
                </div>
                <div class="text-[11px] font-mono ${isImp ? 'text-rose-400' : 'text-sky-400'}">${roleIcon} ${isImp ? 'Imposter' : 'Civilian'}</div>
              </div>
            </div>
            <div class="font-mono font-black text-lg text-white bg-slate-950 border border-slate-800 px-3 py-1 rounded-xl ml-2 flex-shrink-0">
              ${p.score} <span class="text-[10px] text-slate-400">pts</span>
            </div>
          </div>
        `;
      });
    }
    
    document.getElementById('btn-play-again').classList.remove('hidden');
  },
  
  onReturnToLobby(data) {
    this.room = data.room || data;
    this.myRole = null;
    this.secretWord = null;
    this.category = null;
    this.hasVoted = false;
    this.showView('lobby');
    this.renderLobby();
  },
  
  onPlayerDisconnected(data) {
    if (!this.room) return;
    const p = this.room.players.find(p => p.id === data.playerId);
    if (p) {
      p.connected = false;
      this.renderPlayerList();
      showToast(`Operative ${p.name} disconnected`, 'warning');
    }
  },
  
  onPlayerReconnected(data) {
    if (!this.room) return;
    const p = this.room.players.find(p => p.id === data.playerId);
    if (p) {
      p.connected = true;
      this.renderPlayerList();
      showToast(`Operative ${p.name} reconnected`, 'success');
    }
  },
  
  onNewHost(data) {
    if (!this.room) return;
    this.room.hostId = data.playerId;
    this.renderLobby();
    const newHost = this.room.players.find(p => p.id === data.playerId);
    if (newHost) showToast(`Operative ${newHost.name} is now Mission Commander`, 'info');
  },
  
  onError(data) {
    SoundFX.play('error');
    showToast(data.message, 'error');
  },
  
  onStateTransition(data) {
    if (data.roundNumber) {
      const el = document.getElementById('round-indicator');
      if (el) el.textContent = `Round ${data.roundNumber} of ${this.room?.settings?.maxRounds || 3}`;
    }
    if (data.state === 'CLUE_ROUND') {
      document.getElementById('clues-list').innerHTML = '';
    }
  },
  
  // View switcher
  showView(viewName) {
    document.querySelectorAll('[id^="view-"]').forEach(v => {
      v.classList.add('hidden');
    });
    const target = document.getElementById(`view-${viewName}`);
    if (target) {
      target.classList.remove('hidden');
      target.classList.add('slide-in');
    }
    this.currentView = viewName;
  },
  
  renderLobby() {
    document.getElementById('lobby-room-code').textContent = this.roomCode;
    this.renderPlayerList();
    
    const isHost = this.room.hostId === this.playerId;
    const hostControls = document.getElementById('host-controls');
    const startBtn = document.getElementById('btn-start');
    
    if (isHost) {
      hostControls.classList.remove('hidden');
      startBtn.classList.remove('hidden');
      
      if (this.room.settings) {
        document.getElementById('setting-imposters').value = this.room.settings.numImposters || 'auto';
        document.getElementById('setting-clueTime').value = this.room.settings.clueTimeLimit || '45';
        document.getElementById('setting-discussionTime').value = this.room.settings.discussionTimeLimit || '120';
      }
    } else {
      hostControls.classList.add('hidden');
      startBtn.classList.add('hidden');
    }
    
    this.checkStartButton();
  },
  
  renderPlayerList() {
    if (!this.room) return;
    const list = document.getElementById('player-list');
    document.getElementById('player-count').textContent = this.room.players.length;
    list.innerHTML = '';
    
    this.room.players.forEach(p => {
      const isHost = p.id === this.room.hostId;
      const isMe = p.id === this.playerId;
      const avatar = generateAvatar(p.name, 'sm');
      
      list.innerHTML += `
        <div class="bg-slate-900/90 border border-slate-800 p-2.5 rounded-2xl flex items-center gap-2.5 relative transition-all ${
          !p.connected ? 'opacity-40 grayscale' : ''
        } ${isMe ? 'ring-1 ring-purple-500 bg-purple-950/30' : ''}">
          ${isHost ? '<div class="absolute -top-1.5 -right-1.5 bg-amber-400 text-slate-950 text-[10px] px-1 rounded-full font-black shadow" title="Host">👑</div>' : ''}
          ${avatar}
          <div class="flex-1 truncate min-w-0">
            <div class="font-display font-black text-white truncate text-xs">${p.name}</div>
            <div class="text-[9px] font-mono font-bold uppercase tracking-wider ${isMe ? 'text-purple-400' : 'text-slate-400'}">
              ${isMe ? 'You' : p.connected ? 'Ready' : 'Offline'}
            </div>
          </div>
        </div>
      `;
    });
  },
  
  checkStartButton() {
    if (this.room?.hostId !== this.playerId) return;
    const btn = document.getElementById('btn-start');
    const count = this.room.players.length;
    if (count < 3) {
      btn.disabled = true;
      btn.innerHTML = `<span>⏳</span> <span>WAITING (${count}/3 OPERATIVES MIN)</span>`;
    } else {
      btn.disabled = false;
      btn.innerHTML = `<span>⚡</span> <span>INITIALIZE MISSION (${count} READY)</span>`;
    }
  },
  
  saveSession() {
    sessionStorage.setItem('imposter_session', JSON.stringify({
      roomCode: this.roomCode, 
      playerId: this.playerId, 
      playerName: this.playerName
    }));
  },
  
  loadSession() {
    const s = sessionStorage.getItem('imposter_session');
    return s ? JSON.parse(s) : null;
  },
  
  clearSession() {
    sessionStorage.removeItem('imposter_session');
    this.playerId = null;
    this.playerName = null;
    this.roomCode = null;
    this.room = null;
  }
};
