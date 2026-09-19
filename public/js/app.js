document.addEventListener('DOMContentLoaded', () => {
  // Initialize background starfield particles
  initBackgroundParticles();

  // Connect socket
  SocketManager.connect();
  
  // Setup Audio SFX toggle
  const audioBtn = document.getElementById('btn-audio-toggle');
  const audioIcon = document.getElementById('audio-icon');
  const audioLabel = document.getElementById('audio-label');
  
  function updateAudioUI() {
    if (SoundFX.muted) {
      audioIcon.textContent = '🔇';
      audioLabel.textContent = 'SFX OFF';
      audioBtn.classList.add('opacity-60');
    } else {
      audioIcon.textContent = '🔊';
      audioLabel.textContent = 'SFX ON';
      audioBtn.classList.remove('opacity-60');
    }
  }
  updateAudioUI();

  if (audioBtn) {
    audioBtn.addEventListener('click', () => {
      const isMuted = SoundFX.toggleMute();
      updateAudioUI();
      if (!isMuted) SoundFX.play('click');
    });
  }

  // Check for existing session (reconnect)
  const session = Game.loadSession();
  if (session) {
    SocketManager.attemptReconnect(session.roomCode, session.playerId, (response) => {
      if (response.success) {
        Game.playerId = response.playerId;
        Game.playerName = session.playerName;
        Game.roomCode = session.roomCode;
        Game.room = response.room;
        if (response.room.state === 'lobby') {
          Game.showView('lobby');
          Game.renderLobby();
        }
      } else {
        Game.clearSession();
        Game.showView('home');
      }
    });
  } else {
    Game.showView('home');
  }
  
  // === HOME VIEW: TAB SWITCHING & LIVE AVATAR ===
  const tabCreate = document.getElementById('tab-create');
  const tabJoin = document.getElementById('tab-join');
  const secCreate = document.getElementById('section-create');
  const secJoin = document.getElementById('section-join');
  const playerNameInput = document.getElementById('player-name');
  const avatarPreview = document.getElementById('avatar-preview');

  if (tabCreate && tabJoin) {
    tabCreate.addEventListener('click', () => {
      SoundFX.play('click');
      tabCreate.className = 'py-2.5 px-3 rounded-xl font-display font-bold text-sm transition-all duration-200 bg-purple-600 text-white shadow-lg shadow-purple-900/40';
      tabJoin.className = 'py-2.5 px-3 rounded-xl font-display font-bold text-sm transition-all duration-200 text-slate-400 hover:text-white';
      secCreate.classList.remove('hidden');
      secJoin.classList.add('hidden');
    });

    tabJoin.addEventListener('click', () => {
      SoundFX.play('click');
      tabJoin.className = 'py-2.5 px-3 rounded-xl font-display font-bold text-sm transition-all duration-200 bg-pink-600 text-white shadow-lg shadow-pink-900/40';
      tabCreate.className = 'py-2.5 px-3 rounded-xl font-display font-bold text-sm transition-all duration-200 text-slate-400 hover:text-white';
      secJoin.classList.remove('hidden');
      secCreate.classList.add('hidden');
    });
  }

  if (playerNameInput && avatarPreview) {
    playerNameInput.addEventListener('input', (e) => {
      const val = e.target.value.trim();
      if (val.length > 0) {
        avatarPreview.textContent = val.charAt(0).toUpperCase();
        const col = stringToColor(val);
        avatarPreview.style.background = `linear-gradient(135deg, ${col.from}, ${col.to})`;
        avatarPreview.style.boxShadow = `0 4px 15px ${col.ring}`;
      } else {
        avatarPreview.textContent = '?';
        avatarPreview.style.background = 'linear-gradient(135deg, #9333ea, #db2777)';
        avatarPreview.style.boxShadow = 'none';
      }
    });
  }

  // CREATE ROOM ACTION
  document.getElementById('btn-create').addEventListener('click', () => {
    SoundFX.play('click');
    const name = document.getElementById('player-name').value.trim();
    if (!name) {
      SoundFX.play('error');
      return showToast('Please enter an operative alias', 'warning');
    }
    
    SocketManager.createRoom(name, {}, (res) => {
      if (res.success) {
        SoundFX.play('join');
        Game.playerId = res.playerId;
        Game.playerName = name;
        Game.roomCode = res.roomCode;
        Game.room = res.room;
        Game.saveSession();
        Game.showView('lobby');
        Game.renderLobby();
      } else {
        SoundFX.play('error');
        showToast(res.error || 'Failed to create mission room', 'error');
      }
    });
  });
  
  // JOIN ROOM ACTION
  document.getElementById('btn-join').addEventListener('click', () => {
    SoundFX.play('click');
    const name = document.getElementById('player-name').value.trim();
    const code = document.getElementById('room-code').value.trim().toUpperCase();
    
    if (!name) {
      SoundFX.play('error');
      return showToast('Please enter an operative alias', 'warning');
    }
    if (!code) {
      SoundFX.play('error');
      return showToast('Please enter 6-digit access code', 'warning');
    }
    
    SocketManager.joinRoom(code, name, (res) => {
      if (res.success) {
        SoundFX.play('join');
        Game.playerId = res.playerId;
        Game.playerName = name;
        Game.roomCode = code;
        Game.room = res.room;
        Game.saveSession();
        Game.showView('lobby');
        Game.renderLobby();
      } else {
        SoundFX.play('error');
        showToast(res.error || 'Failed to join mission room', 'error');
      }
    });
  });

  document.getElementById('room-code').addEventListener('input', function() {
    this.value = this.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
  });
  
  // === LOBBY VIEW EVENTS ===
  document.getElementById('btn-start').addEventListener('click', () => {
    SoundFX.play('start');
    SocketManager.startGame();
  });
  
  document.getElementById('btn-leave').addEventListener('click', () => {
    SoundFX.play('click');
    Game.clearSession();
    window.location.reload();
  });
  
  document.getElementById('btn-copy-code').addEventListener('click', () => {
    SoundFX.play('click');
    copyToClipboard(Game.roomCode).then(success => {
      if (success) showToast(`ACCESS CODE ${Game.roomCode} COPIED TO CLIPBOARD!`, 'success');
    });
  });
  
  // Settings change listeners (host only)
  ['imposters', 'clueTime', 'discussionTime'].forEach(setting => {
    const el = document.getElementById(`setting-${setting}`);
    if (el) {
      el.addEventListener('change', (e) => {
        if (Game.room?.hostId === Game.playerId) {
          SoundFX.play('click');
          const value = e.target.value === 'auto' ? 'auto' : parseInt(e.target.value, 10);
          SocketManager.updateSettings({ [setting]: value });
        }
      });
    }
  });
  
  // === CLUE ROUND EVENTS ===
  document.getElementById('btn-submit-clue').addEventListener('click', () => {
    const clue = document.getElementById('input-clue').value;
    const val = validateClue(clue, Game.secretWord);
    
    if (!val.valid) {
      SoundFX.play('error');
      document.getElementById('clue-error').textContent = val.error;
      return;
    }
    
    SoundFX.play('click');
    document.getElementById('btn-submit-clue').disabled = true;
    SocketManager.submitClue(clue.trim(), (res) => {
      if (res.success) {
        document.getElementById('my-turn-input').classList.add('hidden');
      } else {
        SoundFX.play('error');
        document.getElementById('btn-submit-clue').disabled = false;
        document.getElementById('clue-error').textContent = res.error || 'Error submitting clue';
      }
    });
  });
  
  document.getElementById('input-clue').addEventListener('input', (e) => {
    const val = validateClue(e.target.value, Game.secretWord);
    if (!val.valid && e.target.value.trim().length > 0) {
      document.getElementById('clue-error').textContent = val.error;
    } else {
      document.getElementById('clue-error').textContent = '';
    }
  });

  document.getElementById('input-clue').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      document.getElementById('btn-submit-clue').click();
    }
  });
  
  // === VOTING EVENTS ===
  document.getElementById('voting-grid').addEventListener('click', (e) => {
    const btn = e.target.closest('.vote-btn');
    if (btn && !Game.hasVoted) {
      SoundFX.play('vote');
      const targetId = btn.dataset.id;
      const targetName = btn.dataset.name;
      
      Game.hasVoted = true;
      document.getElementById('voting-grid').classList.add('pointer-events-none', 'opacity-40');
      document.getElementById('btn-skip-vote').classList.add('hidden');
      
      const confirmMsg = document.getElementById('vote-confirmation');
      confirmMsg.classList.remove('hidden');
      confirmMsg.textContent = `🎯 Accusation locked for ${targetName}. Awaiting council tally...`;
      
      SocketManager.castVote(targetId, (res) => {
        if (!res.success) {
           SoundFX.play('error');
           showToast('Error casting vote', 'error');
           Game.hasVoted = false;
           document.getElementById('voting-grid').classList.remove('pointer-events-none', 'opacity-40');
        }
      });
    }
  });
  
  document.getElementById('btn-skip-vote').addEventListener('click', () => {
    if (Game.hasVoted) return;
    SoundFX.play('vote');
    Game.hasVoted = true;
    document.getElementById('voting-grid').classList.add('pointer-events-none', 'opacity-40');
    document.getElementById('btn-skip-vote').classList.add('hidden');
    
    const confirmMsg = document.getElementById('vote-confirmation');
    confirmMsg.classList.remove('hidden');
    confirmMsg.textContent = `🕊️ You chose to abstain. Awaiting council tally...`;
    
    SocketManager.castVote(null, (res) => {
      if (!res.success) {
         SoundFX.play('error');
         showToast('Error casting vote', 'error');
         Game.hasVoted = false;
         document.getElementById('voting-grid').classList.remove('pointer-events-none', 'opacity-40');
      }
    });
  });

  document.getElementById('btn-ejection-continue').addEventListener('click', () => {
    SoundFX.play('click');
    document.getElementById('btn-ejection-continue').classList.add('hidden');
  });
  
  // === COUNTER GUESS EVENTS ===
  document.getElementById('btn-submit-guess').addEventListener('click', () => {
    const word = document.getElementById('input-guess').value.trim();
    if (!word) return;
    
    SoundFX.play('click');
    document.getElementById('btn-submit-guess').disabled = true;
    SocketManager.counterGuess(word, (res) => {
      if (!res.success) {
        SoundFX.play('error');
        document.getElementById('btn-submit-guess').disabled = false;
        showToast('Error submitting counter-guess', 'error');
      }
    });
  });

  document.getElementById('input-guess').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      document.getElementById('btn-submit-guess').click();
    }
  });
  
  // === GAME OVER EVENTS ===
  document.getElementById('btn-play-again').addEventListener('click', () => {
    SoundFX.play('click');
    SocketManager.playAgain();
  });
  
  document.getElementById('btn-leave-game').addEventListener('click', () => {
    SoundFX.play('click');
    Game.clearSession();
    window.location.reload();
  });
  
  // === BIOMETRIC HOLD TO REVEAL ROLE ===
  const roleCard = document.getElementById('role-card');
  if (roleCard) {
    roleCard.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      SoundFX.play('reveal');
      roleCard.classList.add('revealed');
    });
    roleCard.addEventListener('pointerup', () => roleCard.classList.remove('revealed'));
    roleCard.addEventListener('pointerleave', () => roleCard.classList.remove('revealed'));
    roleCard.addEventListener('contextmenu', (e) => e.preventDefault());
  }
});
