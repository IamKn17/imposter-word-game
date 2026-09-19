const SocketManager = {
  socket: null,
  
  connect() {
    this.socket = io({ reconnection: true, reconnectionDelay: 1000, reconnectionAttempts: 10 });
    this.setupListeners();
  },
  
  setupListeners() {
    // Game state events
    this.socket.on('playerJoined', (data) => Game.onPlayerJoined(data));
    this.socket.on('playerLeft', (data) => Game.onPlayerLeft(data));
    this.socket.on('settingsUpdated', (data) => Game.onSettingsUpdated(data));
    this.socket.on('gameStarted', (data) => Game.onGameStarted(data));
    this.socket.on('roleAssigned', (data) => Game.onRoleAssigned(data));
    this.socket.on('turnStart', (data) => Game.onTurnStart(data));
    this.socket.on('clueSubmitted', (data) => Game.onClueSubmitted(data));
    this.socket.on('timerSync', (data) => Game.onTimerSync(data));
    this.socket.on('discussionStart', (data) => Game.onDiscussionStart(data));
    this.socket.on('voteReceived', (data) => Game.onVoteReceived(data));
    this.socket.on('voteResult', (data) => Game.onVoteResult(data));
    this.socket.on('counterGuessPrompt', (data) => Game.onCounterGuessPrompt(data));
    this.socket.on('counterGuessWaiting', (data) => Game.onCounterGuessWaiting(data));
    this.socket.on('counterGuessResult', (data) => Game.onCounterGuessResult(data));
    this.socket.on('gameOver', (data) => Game.onGameOver(data));
    this.socket.on('returnToLobby', (data) => Game.onReturnToLobby(data));
    this.socket.on('playerDisconnected', (data) => Game.onPlayerDisconnected(data));
    this.socket.on('playerReconnected', (data) => Game.onPlayerReconnected(data));
    this.socket.on('newHost', (data) => Game.onNewHost(data));
    this.socket.on('error', (data) => Game.onError(data));
    this.socket.on('stateTransition', (data) => Game.onStateTransition(data));
    
    // Connection events
    this.socket.on('connect', () => Game.onConnected());
    this.socket.on('disconnect', () => Game.onDisconnected());
    this.socket.on('reconnect', () => Game.onReconnect());
  },
  
  // Emitter methods
  createRoom(playerName, settings, callback) {
    this.socket.emit('createRoom', { playerName, settings }, callback);
  },
  
  joinRoom(roomCode, playerName, callback) {
    this.socket.emit('joinRoom', { roomCode, playerName }, callback);
  },
  
  updateSettings(settings) {
    this.socket.emit('updateSettings', { settings });
  },
  
  startGame() {
    this.socket.emit('startGame', {});
  },
  
  submitClue(clue, callback) {
    this.socket.emit('submitClue', { clue }, callback);
  },
  
  castVote(targetId, callback) {
    this.socket.emit('castVote', { targetId }, callback);
  },
  
  counterGuess(word, callback) {
    this.socket.emit('counterGuess', { word }, callback);
  },
  
  playAgain() {
    this.socket.emit('playAgain', {});
  },
  
  attemptReconnect(roomCode, playerId, callback) {
    this.socket.emit('reconnect', { roomCode, playerId }, callback);
  }
};
