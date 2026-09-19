const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*', // allow all origins for dev
    methods: ['GET', 'POST']
  }
});

app.use(express.static(path.join(__dirname, 'public')));

// Load words
let wordBank = {};
const defaultWordBank = {
  "Animals": ["elephant", "giraffe", "penguin", "kangaroo", "dolphin"],
  "Food": ["pizza", "sushi", "hamburger", "pancake", "taco"],
  "Locations": ["hospital", "beach", "school", "library", "airport"]
};
try {
  const wordsPath = path.join(__dirname, 'data', 'words.json');
  if (fs.existsSync(wordsPath)) {
    const raw = JSON.parse(fs.readFileSync(wordsPath, 'utf8'));
    // Support both { categories: [{name, words}] } and flat { Category: [words] } formats
    if (raw.categories && Array.isArray(raw.categories)) {
      raw.categories.forEach(cat => { wordBank[cat.name] = cat.words; });
    } else {
      wordBank = raw;
    }
    console.log(`Loaded words.json: ${Object.keys(wordBank).length} categories.`);
  } else {
    console.warn('data/words.json not found. Using default word bank.');
    wordBank = defaultWordBank;
  }
} catch (err) {
  console.error('Error loading words.json, using default word bank.', err);
  wordBank = defaultWordBank;
}

// In-memory stores
const rooms = new Map(); // roomCode -> Room
const playerSockets = new Map(); // socketId -> { roomCode, playerId }

const GAME_STATES = {
  LOBBY: 'LOBBY',
  ROLE_ASSIGNMENT: 'ROLE_ASSIGNMENT',
  CLUE_ROUND: 'CLUE_ROUND',
  DISCUSSION_VOTING: 'DISCUSSION_VOTING',
  EJECTION_RESOLUTION: 'EJECTION_RESOLUTION',
  MATCH_CHECK: 'MATCH_CHECK',
  GAME_OVER: 'GAME_OVER'
};

function generateRoomCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code;
  do {
    code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
  } while (rooms.has(code));
  return code;
}

function startTimer(room, duration, onTick, onExpire) {
  clearRoomTimer(room);
  let timeLeft = duration;
  onTick(timeLeft);
  room.timerInterval = setInterval(() => {
    timeLeft--;
    onTick(timeLeft);
    if (timeLeft <= 0) {
      clearInterval(room.timerInterval);
      room.timerInterval = null;
      onExpire();
    }
  }, 1000);
}

function clearRoomTimer(room) {
  if (room.timerInterval) {
    clearInterval(room.timerInterval);
    room.timerInterval = null;
  }
  if (room.timerTimeout) {
    clearTimeout(room.timerTimeout);
    room.timerTimeout = null;
  }
}

function sanitizePlayer(player) {
  return {
    id: player.id,
    name: player.name,
    isAlive: player.isAlive,
    connected: player.connected,
    score: player.score
  };
}

function sanitizeRoom(room) {
  return {
    roomCode: room.roomCode,
    hostId: room.hostId,
    state: room.state,
    settings: room.settings,
    roundNumber: room.roundNumber,
    currentTurnIndex: room.currentTurnIndex,
    players: Array.from(room.players.values()).map(sanitizePlayer),
    turnOrder: room.turnOrder,
    clues: Array.from(room.clues.entries()).map(([id, clue]) => ({ id, clue })),
    roundClues: room.roundClues,
    joinOrder: room.joinOrder
  };
}

function sanitizeRoomForPlayer(room, playerId) {
  const sRoom = sanitizeRoom(room);
  const player = room.players.get(playerId);
  if (player) {
    sRoom.myRole = player.role;
    if (player.role === 'civilian') {
      sRoom.secretWord = room.secretWord;
    }
    sRoom.category = room.category;
  }
  return sRoom;
}

function advanceTurn(room) {
  room.currentTurnIndex++;
  
  while (room.currentTurnIndex < room.turnOrder.length) {
    const pId = room.turnOrder[room.currentTurnIndex];
    const p = room.players.get(pId);
    if (p && p.isAlive && p.connected) {
      break; // Found next valid player
    }
    room.currentTurnIndex++;
  }

  if (room.currentTurnIndex >= room.turnOrder.length) {
    // Round over, move to discussion
    room.state = GAME_STATES.DISCUSSION_VOTING;
    io.to(room.roomCode).emit('stateTransition', { state: room.state });
    startDiscussionTimer(room);
  } else {
    // Next turn
    const currentPlayerId = room.turnOrder[room.currentTurnIndex];
    const currentPlayer = room.players.get(currentPlayerId);
    io.to(room.roomCode).emit('turnStart', { 
      playerId: currentPlayerId, 
      playerName: currentPlayer.name,
      timeLimit: room.settings.clueTimeLimit 
    });
    startTurnTimer(room);
  }
}

function startTurnTimer(room) {
  startTimer(room, room.settings.clueTimeLimit, 
    (timeLeft) => {
      io.to(room.roomCode).emit('timerSync', { timeLeft });
    },
    () => {
      // Auto-skip
      const playerId = room.turnOrder[room.currentTurnIndex];
      const player = room.players.get(playerId);
      const skipClue = '⏭️';
      
      let existingClues = room.clues.get(playerId) || [];
      existingClues.push(skipClue);
      room.clues.set(playerId, existingClues);
      room.roundClues.push({ playerId, clue: skipClue });
      
      io.to(room.roomCode).emit('clueSubmitted', { playerId, playerName: player.name, clue: skipClue });
      advanceTurn(room);
    }
  );
}

function startDiscussionTimer(room) {
  // Build clue pairs from roundClues for display: [[playerId, clue, playerName], ...]
  const allClues = [];
  for (const rc of room.roundClues) {
    const p = room.players.get(rc.playerId);
    allClues.push({ playerId: rc.playerId, clue: rc.clue, playerName: p ? p.name : 'Unknown' });
  }
  // Also include clues from prior rounds
  for (const [pid, clueArr] of room.clues.entries()) {
    // roundClues already covered current round, just ensure all accumulated clues are available
  }
  
  io.to(room.roomCode).emit('discussionStart', { 
    timeLimit: room.settings.discussionTimeLimit,
    clues: allClues
  });
  
  startTimer(room, room.settings.discussionTimeLimit,
    (timeLeft) => {
      io.to(room.roomCode).emit('timerSync', { timeLeft });
    },
    () => {
      // End discussion, resolve votes
      resolveVotes(room);
    }
  );
}

function resolveVotes(room) {
  clearRoomTimer(room);
  const tally = new Map();
  
  for (const [voterId, targetId] of room.votes.entries()) {
    const voter = room.players.get(voterId);
    if (!voter || !voter.isAlive) continue; // safety check
    
    if (targetId) { // ignore skips/nulls
      tally.set(targetId, (tally.get(targetId) || 0) + 1);
    }
  }
  
  let maxVotes = 0;
  let maxPlayers = [];
  
  for (const [targetId, count] of tally.entries()) {
    if (count > maxVotes) {
      maxVotes = count;
      maxPlayers = [targetId];
    } else if (count === maxVotes) {
      maxPlayers.push(targetId);
    }
  }

  const tallyObj = Object.fromEntries(tally);
  
  if (maxPlayers.length === 1 && maxVotes > 0) {
    const ejectedId = maxPlayers[0];
    const ejectedPlayer = room.players.get(ejectedId);
    ejectedPlayer.isAlive = false;
    
    // Scoring for civilians who voted for imposter
    if (ejectedPlayer.role === 'imposter') {
      for (const [voterId, targetId] of room.votes.entries()) {
        const voter = room.players.get(voterId);
        if (targetId === ejectedId && voter && voter.role === 'civilian') {
          voter.score += 2;
        }
      }
    }
    
    io.to(room.roomCode).emit('voteResult', { 
      isTie: false, 
      votes: tallyObj, 
      ejectedId, 
      ejectedName: ejectedPlayer.name,
      ejectedRole: ejectedPlayer.role 
    });
    
    room.votes.clear();
    
    if (ejectedPlayer.role === 'imposter') {
      startCounterGuessPhase(room, ejectedId);
    } else {
      checkWinConditions(room);
    }
  } else {
    // Tie or no votes
    io.to(room.roomCode).emit('voteResult', { 
      isTie: true, 
      votes: tallyObj, 
      ejectedId: null 
    });
    room.votes.clear();
    checkWinConditions(room);
  }
}

function startCounterGuessPhase(room, ejectedPlayerId) {
  room.state = GAME_STATES.EJECTION_RESOLUTION;
  io.to(room.roomCode).emit('stateTransition', { state: room.state });
  
  const ejectedPlayer = room.players.get(ejectedPlayerId);
  io.to(room.roomCode).emit('counterGuessWaiting', { ejectedId: ejectedPlayerId, ejectedName: ejectedPlayer.name });
  
  if (ejectedPlayer.socketId && ejectedPlayer.connected) {
    io.to(ejectedPlayer.socketId).emit('counterGuessPrompt', { timeLimit: room.settings.counterGuessTimeLimit });
  }

  startTimer(room, room.settings.counterGuessTimeLimit,
    (timeLeft) => {
      io.to(room.roomCode).emit('timerSync', { timeLeft });
    },
    () => {
      // Counter guess timed out -> treat as wrong
      io.to(room.roomCode).emit('counterGuessResult', { success: false, word: null, ejectedName: ejectedPlayer.name });
      checkWinConditions(room);
    }
  );
}

function getGameOverPlayers(room) {
  return Array.from(room.players.values()).map(p => ({
    id: p.id, name: p.name, role: p.role, isAlive: p.isAlive, score: p.score
  }));
}

function emitGameOver(room, winner, reason) {
  clearRoomTimer(room);
  room.state = GAME_STATES.GAME_OVER;
  io.to(room.roomCode).emit('gameOver', { 
    winner, reason, 
    secretWord: room.secretWord, 
    category: room.category,
    players: getGameOverPlayers(room)
  });
}

function checkWinConditions(room) {
  let aliveImposters = 0;
  let aliveCivilians = 0;
  
  for (const p of room.players.values()) {
    if (p.isAlive) {
      if (p.role === 'imposter') aliveImposters++;
      else if (p.role === 'civilian') aliveCivilians++;
    }
  }
  
  if (aliveImposters === 0) {
    // Civilians win
    for (const p of room.players.values()) {
      if (p.role === 'civilian') p.score += 10;
    }
    emitGameOver(room, 'civilians', 'All imposters eliminated');
  } else if (aliveImposters >= aliveCivilians) {
    // Imposters win
    for (const p of room.players.values()) {
      if (p.role === 'imposter') p.score += 10;
    }
    emitGameOver(room, 'imposters', 'Imposters outnumber civilians');
  } else {
    // Next Round
    if (room.roundNumber < room.settings.maxRounds) {
      room.roundNumber++;
      room.state = GAME_STATES.CLUE_ROUND;
      room.roundClues = [];
      
      // Shuffle turn order among alive players
      let alivePlayers = Array.from(room.players.values()).filter(p => p.isAlive).map(p => p.id);
      for (let i = alivePlayers.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [alivePlayers[i], alivePlayers[j]] = [alivePlayers[j], alivePlayers[i]];
      }
      room.turnOrder = alivePlayers;
      room.currentTurnIndex = -1; // advanceTurn will increment to 0
      
      io.to(room.roomCode).emit('stateTransition', { state: room.state, roundNumber: room.roundNumber });
      advanceTurn(room);
    } else {
      // Imposters win (time ran out)
      for (const p of room.players.values()) {
        if (p.role === 'imposter') p.score += 10;
      }
      emitGameOver(room, 'imposters', 'Max rounds reached without eliminating imposters');
    }
  }
}

io.on('connection', (socket) => {
  console.log('Socket connected:', socket.id);

  socket.on('createRoom', ({ playerName, settings }, callback) => {
    if (typeof callback !== 'function') return;
    const roomCode = generateRoomCode();
    const playerId = uuidv4();
    
    const player = {
      id: playerId,
      name: String(playerName).trim(),
      socketId: socket.id,
      role: null,
      isAlive: true,
      score: 0,
      connected: true
    };
    
    const defaultSettings = {
      maxPlayers: 12,
      numImposters: 'auto',
      clueTimeLimit: 45,
      discussionTimeLimit: 120,
      maxRounds: 3,
      counterGuessTimeLimit: 30
    };
    
    const room = {
      roomCode,
      hostId: playerId,
      state: GAME_STATES.LOBBY,
      settings: { ...defaultSettings, ...(settings || {}) },
      players: new Map([[playerId, player]]),
      secretWord: null,
      category: null,
      turnOrder: [],
      currentTurnIndex: 0,
      roundNumber: 0,
      votes: new Map(),
      clues: new Map(),
      roundClues: [],
      timerInterval: null,
      timerTimeout: null,
      disconnectTimers: new Map(),
      joinOrder: [playerId]
    };
    
    rooms.set(roomCode, room);
    socket.join(roomCode);
    playerSockets.set(socket.id, { roomCode, playerId });
    
    console.log(`Room created: ${roomCode} by ${playerName}`);
    callback({ success: true, roomCode, playerId, room: sanitizeRoom(room) });
  });

  socket.on('joinRoom', ({ roomCode, playerName }, callback) => {
    if (typeof callback !== 'function') return;
    
    const room = rooms.get(roomCode);
    if (!room) {
      return callback({ success: false, error: 'Room not found' });
    }
    if (room.state !== GAME_STATES.LOBBY) {
      return callback({ success: false, error: 'Game already in progress' });
    }
    if (room.players.size >= room.settings.maxPlayers) {
      return callback({ success: false, error: 'Room is full' });
    }
    
    const pName = String(playerName).trim();
    for (const p of room.players.values()) {
      if (p.name.toLowerCase() === pName.toLowerCase()) {
        return callback({ success: false, error: 'Name already taken' });
      }
    }
    
    const playerId = uuidv4();
    const player = {
      id: playerId,
      name: pName,
      socketId: socket.id,
      role: null,
      isAlive: true,
      score: 0,
      connected: true
    };
    
    room.players.set(playerId, player);
    room.joinOrder.push(playerId);
    socket.join(roomCode);
    playerSockets.set(socket.id, { roomCode, playerId });
    
    console.log(`Player joined: ${pName} in room ${roomCode}`);
    io.to(roomCode).emit('playerJoined', { player: sanitizePlayer(player) });
    callback({ success: true, playerId, room: sanitizeRoom(room) });
  });

  socket.on('updateSettings', ({ settings }) => {
    const mapping = playerSockets.get(socket.id);
    if (!mapping) return;
    const room = rooms.get(mapping.roomCode);
    if (!room || room.hostId !== mapping.playerId) return;
    
    // Map frontend keys to internal keys
    const keyMap = { imposters: 'numImposters', clueTime: 'clueTimeLimit', discussionTime: 'discussionTimeLimit' };
    const mapped = {};
    for (const [k, v] of Object.entries(settings)) {
      mapped[keyMap[k] || k] = v;
    }
    room.settings = { ...room.settings, ...mapped };
    io.to(room.roomCode).emit('settingsUpdated', { settings: room.settings });
  });

  socket.on('startGame', () => {
    const mapping = playerSockets.get(socket.id);
    if (!mapping) return;
    const room = rooms.get(mapping.roomCode);
    if (!room || room.hostId !== mapping.playerId) return;
    if (room.state !== GAME_STATES.LOBBY) return;
    if (room.players.size < 3) return;
    
    room.state = GAME_STATES.ROLE_ASSIGNMENT;
    
    const categories = Object.keys(wordBank);
    const category = categories[Math.floor(Math.random() * categories.length)];
    const words = wordBank[category];
    const secretWord = words[Math.floor(Math.random() * words.length)];
    
    room.category = category;
    room.secretWord = secretWord;
    room.roundNumber = 1;
    room.clues.clear();
    room.votes.clear();
    room.roundClues = [];
    
    let numImposters = 1;
    if (room.settings.numImposters === 'auto') {
      numImposters = room.players.size >= 7 ? 2 : 1;
    } else {
      numImposters = parseInt(room.settings.numImposters) || 1;
    }
    
    const playerArray = Array.from(room.players.values());
    for (let i = playerArray.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [playerArray[i], playerArray[j]] = [playerArray[j], playerArray[i]];
    }
    
    for (let i = 0; i < playerArray.length; i++) {
      const p = playerArray[i];
      p.role = i < numImposters ? 'imposter' : 'civilian';
      p.isAlive = true;
    }
    
    room.turnOrder = playerArray.map(p => p.id);
    // shuffle turn order again for playing
    for (let i = room.turnOrder.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [room.turnOrder[i], room.turnOrder[j]] = [room.turnOrder[j], room.turnOrder[i]];
    }
    
    io.to(room.roomCode).emit('gameStarted');
    
    for (const p of room.players.values()) {
      if (p.socketId) {
        const payload = p.role === 'imposter' ? 
          { role: 'imposter', secretWord: null, category } : 
          { role: 'civilian', secretWord, category };
        io.to(p.socketId).emit('roleAssigned', payload);
      }
    }
    
    console.log(`Game started in room ${room.roomCode}`);
    
    // Wait 8 seconds for role reveal
    setTimeout(() => {
      room.state = GAME_STATES.CLUE_ROUND;
      room.currentTurnIndex = -1;
      io.to(room.roomCode).emit('stateTransition', { state: room.state, roundNumber: room.roundNumber });
      advanceTurn(room);
    }, 8000);
  });

  socket.on('submitClue', ({ clue }, callback) => {
    if (typeof callback !== 'function') return;
    const mapping = playerSockets.get(socket.id);
    if (!mapping) return callback({ success: false, error: 'Not in room' });
    const room = rooms.get(mapping.roomCode);
    if (!room || room.state !== GAME_STATES.CLUE_ROUND) return callback({ success: false, error: 'Not clue round' });
    
    const currentPlayerId = room.turnOrder[room.currentTurnIndex];
    if (mapping.playerId !== currentPlayerId) return callback({ success: false, error: 'Not your turn' });
    
    const player = room.players.get(mapping.playerId);
    if (!player || !player.isAlive) return callback({ success: false, error: 'Dead players cannot play' });
    
    const cleanClue = String(clue).trim().toLowerCase();
    if (!cleanClue) return callback({ success: false, error: 'Clue cannot be empty' });
    if (!/^[a-zA-Z]+$/.test(cleanClue)) return callback({ success: false, error: 'Clue must be a single word (letters only)' });
    
    const cleanSecret = room.secretWord.toLowerCase();
    
    // Check if player is Imposter and guessed the secret word!
    if (player.role === 'imposter') {
      if (cleanClue === cleanSecret || cleanClue === cleanSecret + 's' || cleanSecret === cleanClue + 's') {
        clearRoomTimer(room);
        player.score += 5; // bonus points for guessing word
        for (const p of room.players.values()) {
          if (p.role === 'imposter') p.score += 10;
        }
        
        let existingClues = room.clues.get(mapping.playerId) || [];
        existingClues.push(cleanClue);
        room.clues.set(mapping.playerId, existingClues);
        room.roundClues.push({ playerId: mapping.playerId, clue: cleanClue });
        
        io.to(room.roomCode).emit('clueSubmitted', { 
          playerId: mapping.playerId, 
          playerName: player.name, 
          clue: cleanClue 
        });
        
        callback({ success: true });
        
        // Imposter wins immediately!
        emitGameOver(room, 'imposters', `${player.name} (Imposter) guessed the Secret Word: "${room.secretWord}"!`);
        return;
      }
    } else {
      // Civilians cannot use the secret word or its direct plural/singular as clue
      if (cleanClue === cleanSecret) return callback({ success: false, error: 'Civilians cannot use the secret word as a clue' });
      if (cleanClue === cleanSecret + 's' || cleanSecret === cleanClue + 's') {
        return callback({ success: false, error: 'Cannot use plural/singular of secret word' });
      }
    }
    
    // Check for duplicate clues across all players (ignoring skip emojis)
    for (const [pid, clueArr] of room.clues.entries()) {
      for (const existingClue of clueArr) {
        if (existingClue && existingClue !== '⏭️' && typeof existingClue === 'string' && existingClue.toLowerCase() === cleanClue) {
          return callback({ success: false, error: 'This word was already used by another player' });
        }
      }
    }
    
    let existingClues = room.clues.get(mapping.playerId) || [];
    existingClues.push(cleanClue);
    room.clues.set(mapping.playerId, existingClues);
    room.roundClues.push({ playerId: mapping.playerId, clue: cleanClue });
    
    clearRoomTimer(room);
    
    io.to(room.roomCode).emit('clueSubmitted', { 
      playerId: mapping.playerId, 
      playerName: player.name, 
      clue: cleanClue 
    });
    
    callback({ success: true });
    advanceTurn(room);
  });

  socket.on('castVote', ({ targetId }, callback) => {
    if (typeof callback !== 'function') return;
    const mapping = playerSockets.get(socket.id);
    if (!mapping) return callback({ success: false, error: 'Not in room' });
    const room = rooms.get(mapping.roomCode);
    if (!room || room.state !== GAME_STATES.DISCUSSION_VOTING) return callback({ success: false, error: 'Not voting phase' });
    
    const voter = room.players.get(mapping.playerId);
    if (!voter || !voter.isAlive) return callback({ success: false, error: 'Dead players cannot vote' });
    
    if (room.votes.has(mapping.playerId)) return callback({ success: false, error: 'Already voted' });
    
    if (targetId) {
      const target = room.players.get(targetId);
      if (!target || !target.isAlive) return callback({ success: false, error: 'Invalid target' });
      if (targetId === mapping.playerId) return callback({ success: false, error: 'Cannot vote for yourself' });
    }
    
    room.votes.set(mapping.playerId, targetId || null);
    
    io.to(room.roomCode).emit('voteReceived', { playerId: mapping.playerId });
    callback({ success: true });
    
    // Check if all alive players have voted
    let aliveCount = 0;
    for (const p of room.players.values()) {
      if (p.isAlive) aliveCount++;
    }
    
    if (room.votes.size >= aliveCount) {
      resolveVotes(room);
    }
  });

  socket.on('counterGuess', ({ word }, callback) => {
    if (typeof callback !== 'function') return;
    const mapping = playerSockets.get(socket.id);
    if (!mapping) return callback({ success: false, error: 'Not in room' });
    const room = rooms.get(mapping.roomCode);
    if (!room || room.state !== GAME_STATES.EJECTION_RESOLUTION) return callback({ success: false, error: 'Not counter guess phase' });
    
    const player = room.players.get(mapping.playerId);
    
    // Only ejected imposter can counter guess
    if (!player || player.isAlive || player.role !== 'imposter') {
       return callback({ success: false, error: 'Not authorized' });
    }
    
    clearRoomTimer(room);
    const guessWord = String(word).trim().toLowerCase();
    const actualWord = room.secretWord.toLowerCase();
    
    if (guessWord === actualWord) {
      // Imposters win via counter guess
      player.score += 5; // bonus
      for (const p of room.players.values()) {
        if (p.role === 'imposter') p.score += 10;
      }
      io.to(room.roomCode).emit('counterGuessResult', { success: true, word: guessWord, ejectedName: player.name });
      emitGameOver(room, 'imposters', 'Imposter correctly guessed the secret word');
    } else {
      io.to(room.roomCode).emit('counterGuessResult', { success: false, word: guessWord, ejectedName: player.name });
      checkWinConditions(room);
    }
    callback({ success: true });
  });

  socket.on('playAgain', () => {
    const mapping = playerSockets.get(socket.id);
    if (!mapping) return;
    const room = rooms.get(mapping.roomCode);
    if (!room || room.state !== GAME_STATES.GAME_OVER) return;
    
    // Only host can trigger play again? Prompt allows anyone if GAME_OVER state.
    // We'll allow it.
    room.state = GAME_STATES.LOBBY;
    room.secretWord = null;
    room.category = null;
    room.turnOrder = [];
    room.currentTurnIndex = 0;
    room.roundNumber = 0;
    room.votes.clear();
    room.clues.clear();
    room.roundClues = [];
    
    for (const p of room.players.values()) {
      p.role = null;
      p.isAlive = true;
    }
    
    io.to(room.roomCode).emit('returnToLobby', sanitizeRoom(room));
  });

  socket.on('reconnect', ({ roomCode, playerId }) => {
    const room = rooms.get(roomCode);
    if (room) {
      const player = room.players.get(playerId);
      if (player) {
        // Handle disconnect timer cancellation
        const dt = room.disconnectTimers.get(playerId);
        if (dt) {
          clearTimeout(dt);
          room.disconnectTimers.delete(playerId);
        }
        
        player.socketId = socket.id;
        player.connected = true;
        socket.join(roomCode);
        playerSockets.set(socket.id, { roomCode, playerId });
        
        socket.emit('reconnected', sanitizeRoomForPlayer(room, playerId));
        io.to(roomCode).emit('playerReconnected', { playerId });
        console.log(`Player reconnected: ${player.name} in room ${roomCode}`);
      }
    }
  });

  socket.on('disconnect', () => {
    console.log('Socket disconnected:', socket.id);
    const mapping = playerSockets.get(socket.id);
    if (!mapping) return;
    
    playerSockets.delete(socket.id);
    const room = rooms.get(mapping.roomCode);
    if (!room) return;
    
    const player = room.players.get(mapping.playerId);
    if (!player) return;
    
    player.socketId = null;
    player.connected = false;
    
    if (room.state === GAME_STATES.LOBBY) {
      room.players.delete(mapping.playerId);
      room.joinOrder = room.joinOrder.filter(id => id !== mapping.playerId);
      if (room.hostId === mapping.playerId && room.joinOrder.length > 0) {
        room.hostId = room.joinOrder[0];
      }
      io.to(room.roomCode).emit('playerLeft', { playerId: mapping.playerId, newHostId: room.hostId });
      if (room.players.size === 0) {
        rooms.delete(room.roomCode);
      }
    } else {
      io.to(room.roomCode).emit('playerDisconnected', { playerId: mapping.playerId });
      
      const timer = setTimeout(() => {
        if (!player.connected) {
          player.isAlive = false;
          
          if (room.hostId === mapping.playerId) {
            const nextHostId = room.joinOrder.find(id => {
              const p = room.players.get(id);
              return p && p.isAlive && p.connected;
            });
            if (nextHostId) room.hostId = nextHostId;
          }
          
          if (room.state === GAME_STATES.CLUE_ROUND) {
            const currentPlayerId = room.turnOrder[room.currentTurnIndex];
            if (currentPlayerId === mapping.playerId) {
               clearRoomTimer(room);
               const skipClue = '⏭️';
               let existingClues = room.clues.get(mapping.playerId) || [];
               existingClues.push(skipClue);
               room.clues.set(mapping.playerId, existingClues);
               room.roundClues.push({ playerId: mapping.playerId, clue: skipClue });
               io.to(room.roomCode).emit('clueSubmitted', { playerId: mapping.playerId, playerName: player.name, clue: skipClue });
               advanceTurn(room);
            } else {
              checkWinConditions(room);
            }
          } else if (room.state === GAME_STATES.DISCUSSION_VOTING) {
            // Auto skip vote
            room.votes.set(mapping.playerId, null);
            let aliveCount = 0;
            for (const p of room.players.values()) {
              if (p.isAlive) aliveCount++;
            }
            if (room.votes.size >= aliveCount) {
              resolveVotes(room);
            } else {
              checkWinConditions(room);
            }
          } else {
             checkWinConditions(room);
          }
        }
      }, 15000);
      
      room.disconnectTimers.set(mapping.playerId, timer);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
