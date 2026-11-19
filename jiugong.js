/*
 * JiuTianJiuDi — adattamento del ludo grid alla tavola Jiugong 9x9
 * ----------------------------------------------------------------
 * Intervento MINIMO sul rip: niente modifiche a cocos2d-js-min.js né ad assets/main/index.js.
 * Questo file, caricato dopo main.js, fa tre cose a runtime:
 *   1. nell' Lobby intercetta il bottone "online" → carica la GameScene già esistente;
 *   2. nella GameScene nasconde la board rush e RICOSTRUISCE GameBoard/Cells:
 *      le 72 celle ludo (cell_0..cell_71) diventano 81 celle (cell_0..cell_80)
 *      in griglia 9x9 (9 quadranti x 9 cerchi numerati), riusando lo STESSO
 *      sprite frame "Whitebox_Main" che il gioco usa per le celle ludo;
 *   3. attiva la meccanica sociale (occupa/libera, conquista quadrante con 5 su 9,
 *      giocatori simulati, presence) e espone window.JiugongAPI per il futuro
 *      layer realtime (Supabase) al posto della simulazione.
 */
(function () {
  "use strict";

  // ── Palette (riferimento cliente, identica al prototipo HTML) ──
  var QUAD_HEX = ["#C0392B", "#E07B28", "#3AA6A0", "#27AE60", "#8AB52A", "#7D9471", "#B64A8F", "#8B5E3C", "#E884A5"];
  var QUAD_NAMES = ["Rosso", "Arancio", "Teal", "Verde", "Lime", "Saggio", "Magenta", "Terra", "Rosa"];
  var PLAYERS = [
    { name: "Tu",    hex: "#1D4ED8", isMe: true  },
    { name: "Ayla",  hex: "#7C3AED", isMe: false },
    { name: "Bruno", hex: "#15803D", isMe: false },
    { name: "Chen",  hex: "#B45309", isMe: false }
  ];
  var CELLS = 81, QUAD_CELLS = 9, WIN_NEED = 5;
  var SPACING = 65, CELL_SIZE = 48, ORIGIN = -260; // griglia dentro GameBoard (626x626)
  var BOT_LINES = [
    "bello il quadrante lime, voglio provarci!", "quasi quasi mi costruisco il quadrante rosa",
    "hai visto? ho preso 5 cerchi!", "si gioca velocissimo", "prossimo turno il teal è mio",
    "chi vuole fare sfida sul rosso?", "adesso vi riprendo il saggio"
  ];

  // ── Stato (stesso contratto del prototipo HTML: cells[81] → id giocatore o null) ──
  var state = {
    cells: new Array(CELLS).fill(null),
    quadOwner: new Array(9).fill(null),
    counts: [0, 0, 0, 0],
    quads: [0, 0, 0, 0],
    paused: false
  };
  var cellNodes = null, quadBgNodes = null, presenceLabel = null, whiteFrame = null;
  var botTimer = null;

  function hexToCc(hex) {
    var n = parseInt(hex.slice(1), 16);
    return cc.color((n >> 16) & 255, (n >> 8) & 255, n & 255);
  }

  // ── Costruzione della tavola 9x9 ──
  function buildJiugongGrid() {
    var parent = cc.find("Canvas/Content/BoardContent/GameBoard/Cells");
    if (!parent) { console.error("[Jiugong] Cells non trovato"); return false; }

    // riusa lo sprite frame delle celle ludo prima di rimuoverle
    whiteFrame = null;
    parent.children.some(function (c) {
      var sp = c.getComponent(cc.Sprite);
      if (sp && sp.spriteFrame) { whiteFrame = sp.spriteFrame; return true; }
      return false;
    });
    if (!whiteFrame) console.warn("[Jiugong] frame celle ludo non trovato, uso il primo disponibile dal pool interno");
    parent.removeAllChildren();

    quadBgNodes = [];
    cellNodes = [];

    // sfondi dei quadranti (dietro le celle), tintati quando il quadrante è conquistato
    for (var q = 0; q < 9; q++) {
      var qRow = Math.floor(q / 3), qCol = q % 3;
      var bg = new cc.Node("quadbg_" + q);
      var bgSp = bg.addComponent(cc.Sprite);
      if (whiteFrame) {
        bgSp.spriteFrame = whiteFrame;
        bgSp.sizeMode = cc.Sprite.SizeMode.CUSTOM;
      }
      bg.setContentSize(SPACING * 3 - (SPACING - CELL_SIZE) + 12, SPACING * 3 - (SPACING - CELL_SIZE) + 12);
      bg.x = ORIGIN + (qCol * 3 + 1) * SPACING;
      bg.y = ORIGIN + (8 - (qRow * 3 + 1)) * SPACING;
      bg.color = cc.color(255, 255, 255);
      bg.opacity = 0;
      bg.parent = parent;
      quadBgNodes.push(bg);
    }

    // 81 celle numerate, una tinta per quadrante
    // struttura: cellNode (bianco) → bgNode (tinta quadrante/giocatore) + labelNode (bianco,
    // fuori dal ramo tinto: il colore in Cocos scende in cascata e tingeremmo il numero)
    for (var i = 0; i < CELLS; i++) {
      var qi = Math.floor(i / QUAD_CELLS), n = i % QUAD_CELLS;
      var innerRow = Math.floor(n / 3), innerCol = n % 3;
      var row = Math.floor(qi / 3) * 3 + innerRow;
      var col = (qi % 3) * 3 + innerCol;

      var node = new cc.Node("cell_" + i);
      var sp = node.addComponent(cc.Sprite);
      if (whiteFrame) {
        sp.spriteFrame = whiteFrame;
        sp.sizeMode = cc.Sprite.SizeMode.CUSTOM;
      }
      node.setContentSize(CELL_SIZE, CELL_SIZE);
      node.x = ORIGIN + col * SPACING;
      node.y = ORIGIN + (8 - row) * SPACING;

      var bg = new cc.Node("bg");
      var bgSp = bg.addComponent(cc.Sprite);
      if (whiteFrame) {
        bgSp.spriteFrame = whiteFrame;
        bgSp.sizeMode = cc.Sprite.SizeMode.CUSTOM;
      }
      bg.setContentSize(CELL_SIZE, CELL_SIZE);
      bg.color = hexToCc(QUAD_HEX[qi]);
      bg.parent = node;

      var labelNode = new cc.Node("num");
      var label = labelNode.addComponent(cc.Label);
      label.string = String(n + 1);
      label.fontSize = 26;
      label.lineHeight = 30;
      label.horizontalAlign = cc.Label.HorizontalAlign.CENTER;
      label.verticalAlign = cc.Label.VerticalAlign.CENTER;
      labelNode.parent = node;

      // eslint-disable-next-line no-loop-func
      (function (idx) {
        node.on(cc.Node.EventType.TOUCH_END, function () { onTap(idx); }, node);
      })(i);

      node.parent = parent;
      cellNodes.push({ root: node, bg: bg });
    }

    // presence in alto alla tavola
    presenceLabel = new cc.Node("jiugong_presence");
    var pl = presenceLabel.addComponent(cc.Label);
    pl.string = "";
    pl.fontSize = 20;
    pl.lineHeight = 24;
    presenceLabel.color = cc.color(58, 47, 34);
    presenceLabel.y = ORIGIN + 9 * SPACING + 18;
    presenceLabel.parent = parent;
    return true;
  }

  // ── Meccanica (identica al prototipo) ──
  function claim(i, pid) {
    if (state.cells[i] !== null) return false;
    state.cells[i] = pid;
    state.counts[pid]++;
    recountQuads(Math.floor(i / QUAD_CELLS));
    refresh();
    return true;
  }
  function release(i) {
    var pid = state.cells[i];
    if (pid === null) return;
    state.cells[i] = null;
    state.counts[pid]--;
    recountQuads(Math.floor(i / QUAD_CELLS));
    refresh();
  }
  function recountQuads(q) {
    var tally = [0, 0, 0, 0];
    for (var c = 0; c < QUAD_CELLS; c++) {
      var pid = state.cells[q * QUAD_CELLS + c];
      if (pid !== null) tally[pid]++;
    }
    var prev = state.quadOwner[q], winner = null;
    for (var p = 0; p < 4; p++) if (tally[p] >= WIN_NEED) winner = p;
    if (prev !== winner) {
      if (prev !== null) state.quads[prev]--;
      if (winner !== null) {
        state.quads[winner]++;
        toast(PLAYERS[winner].isMe
          ? "Hai conquistato il quadrante " + QUAD_NAMES[q] + "!"
          : PLAYERS[winner].name + " ha conquistato il quadrante " + QUAD_NAMES[q]);
      }
      state.quadOwner[q] = winner;
    }
  }
  function onTap(i) {
    var cur = state.cells[i];
    if (cur === null) claim(i, 0);
    else if (PLAYERS[cur].isMe) release(i);
    else toast("Quel cerchio è occupato da " + PLAYERS[cur].name);
  }

  // ── Render ──
  function refresh() {
    if (!cellNodes) return;
    for (var i = 0; i < CELLS; i++) {
      var pid = state.cells[i], qi = Math.floor(i / QUAD_CELLS);
      cellNodes[i].bg.color = pid === null ? hexToCc(QUAD_HEX[qi]) : hexToCc(PLAYERS[pid].hex);
    }
    for (var q = 0; q < 9; q++) {
      var owner = state.quadOwner[q];
      quadBgNodes[q].opacity = owner === null ? 0 : 130;
      quadBgNodes[q].color = owner === null ? cc.color(255, 255, 255) : hexToCc(PLAYERS[owner].hex);
    }
    var parts = [];
    for (var p2 = 0; p2 < 4; p2++) {
      parts.push((PLAYERS[p2].isMe ? "Tu" : PLAYERS[p2].name) + " " + state.counts[p2] + " (" + state.quads[p2] + "Q)");
    }
    presenceLabel.getComponent(cc.Label).string = parts.join("   ·   ");
  }

  // ── Toast su canvas ──
  function toast(msg) {
    var canvas = cc.find("Canvas");
    if (!canvas) return;
    var n = new cc.Node("jiugong_toast");
    var l = n.addComponent(cc.Label);
    l.string = msg;
    l.fontSize = 22;
    l.lineHeight = 26;
    n.color = cc.color(43, 33, 23);
    n.setPosition(0, 330);
    n.zIndex = 999;
    n.parent = canvas;
    n.runAction(cc.sequence(cc.delayTime(1.4), cc.fadeOut(0.8), cc.removeSelf()));
  }

  // ── Giocatori simulati (sostituiti dal layer realtime Supabase) ──
  function startBots() {
    if (botTimer) clearInterval(botTimer);
    botTimer = setInterval(function () {
      if (state.paused || !cellNodes) return;
      var pid = 1 + Math.floor(Math.random() * 3);
      var empty = [], own = [];
      for (var i = 0; i < CELLS; i++) {
        if (state.cells[i] === null) empty.push(i); else if (state.cells[i] === pid) own.push(i);
      }
      if (empty.length && (Math.random() < 0.8 || !own.length)) {
        var pick = empty[Math.floor(Math.random() * empty.length)];
        var q = Math.floor(pick / QUAD_CELLS);
        var focus = empty.filter(function (x) { return Math.floor(x / QUAD_CELLS) === q; });
        if (focus.length && Math.random() < 0.35) pick = focus[Math.floor(Math.random() * focus.length)];
        claim(pick, pid);
      } else if (own.length > 2 && Math.random() < 0.5) {
        release(own[Math.floor(Math.random() * own.length)]);
      }
      if (Math.random() < 0.14) toast(PLAYERS[pid].name + ": " + BOT_LINES[Math.floor(Math.random() * BOT_LINES.length)]);
    }, 2200);
  }

  // ── Entrata in modalità Jiugong nella GameScene esistente ──
  function enterJiugongMode() {
    if (state.entered) return;
    var bb = cc.find("Canvas/Content/BoardContent");
    if (!bb) return;
    // fuori: board rush, pannelli e UI di gioco non pertinenti al modulo sociale
    ["RushGameBoard", "RushModeBackground", "WaitingPanel", "FftueNode", "AnimNodes",
     "DebugLayer", "powerupNodeV2", "SafeLocations", "TileHighlightLocation", "timer"].forEach(function (name) {
      var n = bb.getChildByName(name) || cc.find("Canvas/Content/" + name);
      if (n) n.active = false;
    });
    var touchCatcher = cc.find("Canvas/touchNode");
    if (touchCatcher) touchCatcher.active = false;
    // clickPanel = superficie di tap delle pedine ludo: copre tutta la board e
    // intercetta i tocchi sopra le celle Jiugong → disattivata in questa modalità
    var clickPanel = cc.find("Canvas/Content/BoardContent/PawnContainer/clickPanel");
    if (clickPanel) clickPanel.active = false;
    var gameBoard = cc.find("Canvas/Content/BoardContent/GameBoard");
    if (!gameBoard) return;
    // la board ludo vera e propria: case colori, triangoli home, frecce
    ["Home", "Base", "Arrows"].forEach(function (name) {
      var n = gameBoard.getChildByName(name);
      if (n) n.active = false;
    });
    if (!buildJiugongGrid()) return;
    // vassoio in stile legno dietro la griglia (come il riferimento cliente)
    if (whiteFrame) {
      var border = new cc.Node("jiugong_tray_border");
      var bSp = border.addComponent(cc.Sprite);
      bSp.spriteFrame = whiteFrame;
      bSp.sizeMode = cc.Sprite.SizeMode.CUSTOM;
      border.setContentSize(SPACING * 9 - (SPACING - CELL_SIZE) + 40, SPACING * 9 - (SPACING - CELL_SIZE) + 40);
      border.color = hexToCc("#B99B6B");
      border.zIndex = -2;
      border.parent = gameBoard;

      var tray = new cc.Node("jiugong_tray");
      var tSp = tray.addComponent(cc.Sprite);
      tSp.spriteFrame = whiteFrame;
      tSp.sizeMode = cc.Sprite.SizeMode.CUSTOM;
      tray.setContentSize(SPACING * 9 - (SPACING - CELL_SIZE) + 18, SPACING * 9 - (SPACING - CELL_SIZE) + 18);
      tray.color = hexToCc("#EFE6D3");
      tray.zIndex = -1;
      tray.parent = gameBoard;
    }
    state.entered = true;
    refresh();
    startBots();
    toast("Tavola Jiugong pronta — tocca un cerchio per occuparlo!");
  }

  // ── Lobby: il bottone "online" entra nella tavola ──
  function hookLobby() {
    var online = cc.find("Canvas/ButtonsLayer/Buttons/online");
    if (!online || online._jiugongHooked) return false;
    online._jiugongHooked = true;
    var btn = online.getComponent(cc.Button);
    if (btn) btn.interactable = false;
    var enter = function () { cc.director.loadScene("GameScene"); };
    // il nodo 'online' ha size 0x0: il target reale dei tocchi è il figlio visibile
    var targets = [];
    (function collect(n, d) {
      if (d > 3) return;
      if (n.width > 0 && n.height > 0) targets.push(n);
      n.children.forEach(function (c) { collect(c, d + 1); });
    })(online, 0);
    if (!targets.length) targets = [online];
    targets.forEach(function (t) { t.on(cc.Node.EventType.TOUCH_END, enter, t); });
    toast("Tocca GIOCA per entrare nella tavola Jiugong");
    return true;
  }

  // ── Punti di aggancio ──
  setInterval(function () {
    try {
      var s = cc.director && cc.director.getScene();
      if (!s) return;
      if (s.name === "Lobby") hookLobby();
      if (s.name === "GameScene" && cc.find("Canvas/Content/BoardContent/GameBoard/Cells")) enterJiugongMode();
    } catch (e) {
      console.error("[Jiugong]", e);
    }
  }, 400);

  // API pubblica: qui si aggancia il layer realtime reale
  window.JiugongAPI = {
    state: state,
    claim: claim,
    release: release,
    enterMode: enterJiugongMode,
    setPaused: function (v) { state.paused = v; }
  };
})();
