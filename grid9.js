/*
 * JiuTianJiuDi — tavola a 9 quadranti per il portale web
 * ------------------------------------------------------
 * Continuità del lavoro precedente (jiugong.js): stesso punto di aggancio,
 * ma la tavola ora è costruita SOLO con ritagli dalla mappa di gioco esistente
 * (grid9/tile.png = quadrante beige con bordo arancio, grid9/disc.png = disco
 * ricavato dalla cella bianca della mappa, grid9/cell.png = cella grezza per
 * l'overlay di conquista). Nessuna grafica nuova.
 *
 * Cosa fa a runtime:
 *   1. dall' Lobby entra da sola nella GameScene esistente;
 *   2. nasconde la board di gioco originale e ricostruisce GameBoard/Cells:
 *      9 quadranti (3x3) con 9 cerchi numerati 1-9 ciascuno (81 cerchi),
 *      una tinta per quadrante come il riferimento cliente;
 *   3. i cerchi sono DRAG AND DROP: trascina un cerchio per occuparlo
 *      (diventa tuo), tocca un tuo cerchio per liberarlo, 5 su 9 conquistano
 *      il quadrante; compagni simulati + presence;
 *   4. window.Grid9API per il futuro layer realtime (Supabase).
 */
(function () {
  "use strict";

  // ── Palette (riferimento cliente, identica al prototipo) ──
  var QUAD_HEX = ["#C0392B", "#E07B28", "#3AA6A0", "#27AE60", "#8AB52A", "#7D9471", "#B64A8F", "#8B5E3C", "#E884A5"];
  var QUAD_NAMES = ["Rosso", "Arancio", "Teal", "Verde", "Lime", "Saggio", "Magenta", "Terra", "Rosa"];
  var PLAYERS = [
    { name: "Tu",    hex: "#1D4ED8", isMe: true  },
    { name: "Ayla",  hex: "#7C3AED", isMe: false },
    { name: "Bruno", hex: "#15803D", isMe: false },
    { name: "Chen",  hex: "#B45309", isMe: false }
  ];
  var CELLS = 81, QUAD_CELLS = 9, WIN_NEED = 5;
  // geometria dentro GameBoard (626x626)
  var TILE = 200, TILE_STEP = 204, TILE_ORIGIN = -204;   // 3 tile da 200 + 2 gap da 4 = 608
  var DISC = 50, DISC_STEP = 54, DISC_ORIGIN = -54;      // 3 dischi da 50 + 2 gap da 4 = 158
  var BOT_LINES = [
    "bello il quadrante lime, voglio provarci!", "quasi quasi mi costruisco il quadrante rosa",
    "hai visto? ho preso 5 cerchi!", "si gioca velocissimo", "prossimo turno il teal è mio",
    "chi vuole fare sfida sul rosso?", "adesso vi riprendo il saggio"
  ];

  // ── Stato (stesso contratto del prototipo: cells[81] → id giocatore o null) ──
  var state = {
    cells: new Array(CELLS).fill(null),
    quadOwner: new Array(9).fill(null),
    counts: [0, 0, 0, 0],
    quads: [0, 0, 0, 0],
    paused: false
  };
  var sprites = { tile: null, cell: null, disc: null };
  var assetsReady = false;
  var discNodes = null, quadOverlayNodes = null, presenceLabel = null, boardParent = null;
  var drag = null; // { idx, node, moved, start }
  var botTimer = null, entered = false, entering = false;

  function hexToCc(hex) {
    var n = parseInt(hex.slice(1), 16);
    return cc.color((n >> 16) & 255, (n >> 8) & 255, n & 255);
  }

  function makeSprite(frame, w, h, x, y, z) {
    var node = new cc.Node("g9");
    var sp = node.addComponent(cc.Sprite);
    sp.spriteFrame = frame;
    sp.sizeMode = cc.Sprite.SizeMode.CUSTOM;
    node.setContentSize(w, h);
    node.setPosition(x, y);
    if (z !== undefined) node.zIndex = z;
    return node;
  }

  // ── Caricamento dei ritagli (SOLO file già esistenti nel repo) ──
  function loadAssets(done) {
    if (assetsReady) { done(); return; }
    var list = ["grid9/tile.png", "grid9/cell.png", "grid9/disc.png"];
    var left = list.length;
    list.forEach(function (url) {
      cc.loader.load(url, function (err, tex) {
        if (!err && tex) {
          var sf = new cc.SpriteFrame(tex);
          if (url.indexOf("tile") > -1) sprites.tile = sf;
          else if (url.indexOf("cell") > -1) sprites.cell = sf;
          else sprites.disc = sf;
        } else {
          console.error("[Grid9] asset mancante:", url, err);
        }
        if (--left === 0) {
          assetsReady = !!(sprites.tile && sprites.cell && sprites.disc);
          done();
        }
      });
    });
  }

  // ── Costruzione della tavola 9 quadranti × 9 cerchi ──
  function buildGrid9() {
    boardParent = cc.find("Canvas/Content/BoardContent/GameBoard/Cells");
    if (!boardParent) { console.error("[Grid9] Cells non trovato"); return false; }

    boardParent.removeAllChildren();
    discNodes = [];
    quadOverlayNodes = [];

    // vassoio di fondo (tile più grande, tinta legno chiaro)
    if (sprites.tile) {
      var tray = makeSprite(sprites.tile, TILE * 3 + 2 * 4 + 30, TILE * 3 + 2 * 4 + 30, 0, 0, -3);
      tray.color = hexToCc("#E8DCC2");
      tray.parent = boardParent;
      var trayBorder = makeSprite(sprites.tile, TILE * 3 + 2 * 4 + 40, TILE * 3 + 2 * 4 + 40, 0, 0, -4);
      trayBorder.color = hexToCc("#B99B6B");
      trayBorder.parent = boardParent;
    }

    // 9 quadranti: tile beige con bordo arancio, esattamente come la mappa
    for (var q = 0; q < 9; q++) {
      var qRow = Math.floor(q / 3), qCol = q % 3;
      var tx = TILE_ORIGIN + qCol * TILE_STEP;
      var ty = TILE_ORIGIN + (2 - qRow) * TILE_STEP;
      if (sprites.tile) {
        var tile = makeSprite(sprites.tile, TILE, TILE, tx, ty, -2);
        tile.name = "quad_" + q;
        tile.parent = boardParent;
      }
      // overlay conquista (cella grezza tintata, invisibile finché non conquista)
      var overlay = makeSprite(sprites.cell, TILE, TILE, tx, ty, -1);
      overlay.color = cc.color(255, 255, 255);
      overlay.opacity = 0;
      overlay.parent = boardParent;
      quadOverlayNodes.push(overlay);

      // 9 cerchi numerati del quadrante
      for (var n = 0; n < QUAD_CELLS; n++) {
        var i = q * QUAD_CELLS + n;
        var innerRow = Math.floor(n / 3), innerCol = n % 3;
        var dx = DISC_ORIGIN + innerCol * DISC_STEP;
        var dy = DISC_ORIGIN + (2 - innerRow) * DISC_STEP;

        var node = makeSprite(sprites.disc, DISC, DISC, tx + dx, ty + dy, 5);
        node.name = "cell_" + i;
        node.color = hexToCc(QUAD_HEX[q]); // stato neutrale = tinta del quadrante

        var labelNode = new cc.Node("num");
        var label = labelNode.addComponent(cc.Label);
        label.string = String(n + 1);
        label.fontSize = 26;
        label.lineHeight = 28;
        label.horizontalAlign = cc.Label.HorizontalAlign.CENTER;
        label.verticalAlign = cc.Label.VerticalAlign.CENTER;
        labelNode.parent = node;

        // DRAG AND DROP
        (function (idx) {
          node.on(cc.Node.EventType.TOUCH_START, function (ev) { onTouchStart(idx, ev); }, node);
          node.on(cc.Node.EventType.TOUCH_MOVE, function (ev) { onTouchMove(idx, ev); }, node);
          node.on(cc.Node.EventType.TOUCH_END, function (ev) { onTouchEnd(idx, ev); }, node);
          node.on(cc.Node.EventType.TOUCH_CANCEL, function (ev) { onTouchEnd(idx, ev); }, node);
        })(i);

        node.parent = boardParent;
        discNodes.push(node);
      }
    }

    // presence sopra la tavola
    presenceLabel = new cc.Node("g9_presence");
    var pl = presenceLabel.addComponent(cc.Label);
    pl.string = "";
    pl.fontSize = 20;
    pl.lineHeight = 24;
    presenceLabel.color = cc.color(58, 47, 34);
    presenceLabel.y = TILE_ORIGIN + (2 * TILE_STEP) + TILE / 2 + 26;
    presenceLabel.parent = boardParent;
    return true;
  }

  // ── Meccanica (claim / release / conquista 5 su 9) ──
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

  // ── Drag and drop dei cerchi numerati ──
  function onTouchStart(idx, ev) {
    if (state.paused || !discNodes) return;
    var pid = state.cells[idx];
    if (pid !== null && !PLAYERS[pid].isMe) {
      toast("Quel cerchio è occupato da " + PLAYERS[pid].name);
      return;
    }
    var node = discNodes[idx];
    var world = ev.getLocation();
    drag = {
      idx: idx,
      node: node,
      moved: false,
      start: world.clone(),
      originalPos: node.getPosition().clone(),
      originalZ: node.zIndex
    };
    node.setScale(1.18);
    node.zIndex = 1000;
  }
  function onTouchMove(idx, ev) {
    if (!drag || drag.idx !== idx) return;
    var world = ev.getLocation();
    if (world.distance(drag.start) > 10) drag.moved = true;
    var local = drag.node.parent.convertToNodeSpace(world);
    // resta dentro il vassoio
    var lim = (TILE * 3 + 2 * 4) / 2 + 8;
    local.x = Math.max(-lim, Math.min(lim, local.x));
    local.y = Math.max(-lim, Math.min(lim, local.y));
    drag.node.setPosition(local);
  }
  function onTouchEnd(idx, ev) {
    if (!drag || drag.idx !== idx) return;
    var node = drag.node, moved = drag.moved;
    var world = ev.getLocation();
    var endLocal = node.parent.convertToNodeSpace(world);
    var homeLocal = drag.originalPos;
    node.setScale(1);
    node.zIndex = drag.originalZ;

    // rilascio in un punto diverso dallo slot = assegnazione del cerchio
    var droppedAway = moved && endLocal.distance(homeLocal) > DISC / 2;
    var pid = state.cells[idx];
    if (droppedAway || pid === null) {
      if (state.cells[idx] === null || PLAYERS[state.cells[idx]].isMe) claim(idx, 0);
    } else if (pid !== null && PLAYERS[pid].isMe) {
      // tocco su un cerchio già tuo (senza trascinare): lo liberi
      release(idx);
    }
    drag = null;
    if (node.parent) node.setPosition(homeLocal); // i cerchi tornano sempre nel loro slot
    refresh();
  }

  // ── Render ──
  function refresh() {
    if (!discNodes) return;
    for (var i = 0; i < CELLS; i++) {
      var pid = state.cells[i], qi = Math.floor(i / QUAD_CELLS);
      discNodes[i].color = pid === null ? hexToCc(QUAD_HEX[qi]) : hexToCc(PLAYERS[pid].hex);
    }
    for (var q = 0; q < 9; q++) {
      var owner = state.quadOwner[q];
      quadOverlayNodes[q].opacity = owner === null ? 0 : 110;
      quadOverlayNodes[q].color = owner === null ? cc.color(255, 255, 255) : hexToCc(PLAYERS[owner].hex);
    }
    var parts = [];
    for (var p2 = 0; p2 < 4; p2++) {
      parts.push((PLAYERS[p2].isMe ? "Tu" : PLAYERS[p2].name) + " " + state.counts[p2] + " (" + state.quads[p2] + "Q)");
    }
    if (presenceLabel) presenceLabel.getComponent(cc.Label).string = parts.join("   ·   ");
  }

  // ── Toast su canvas ──
  function toast(msg) {
    var canvas = cc.find("Canvas");
    if (!canvas) return;
    var n = new cc.Node("g9_toast");
    var l = n.addComponent(cc.Label);
    l.string = msg;
    l.fontSize = 22;
    l.lineHeight = 26;
    n.color = cc.color(43, 33, 23);
    n.setPosition(0, 392);
    n.zIndex = 999;
    n.parent = canvas;
    n.runAction(cc.sequence(cc.delayTime(1.4), cc.fadeOut(0.8), cc.removeSelf()));
  }

  // ── Compagni simulati (sostituiti dal layer realtime Supabase) ──
  function startBots() {
    if (botTimer) clearInterval(botTimer);
    botTimer = setInterval(function () {
      if (state.paused || !discNodes) return;
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

  // ── Nodi del gioco originale da tenere fuori ──
  var JUNK = ["RushGameBoard", "RushModeBackground", "WaitingPanel", "FftueNode", "AnimNodes",
              "DebugLayer", "powerupNodeV2", "SafeLocations", "TileHighlightLocation", "timer",
              "TopGamehud", "ProfileContainer", "PawnContainer", "MyPlayerNode",
              "SwordAnimPlaceholder", "SwordAnimationMetaNode", "PowerupPlayerNode", "Popups"];

  function hideJunk() {
    var bb = cc.find("Canvas/Content/BoardContent");
    if (!bb) return;
    JUNK.forEach(function (name) {
      var n = bb.getChildByName(name) || cc.find("Canvas/Content/" + name) || cc.find("Canvas/" + name);
      if (n) {
        n.active = false;
        // se la logica di gioco li riattiva, restano fuori dallo schermo
        n.setPosition(-3000, -3000);
      }
    });
    var touchCatcher = cc.find("Canvas/touchNode");
    if (touchCatcher && touchCatcher.active) touchCatcher.active = false;
    var gameBoard = cc.find("Canvas/Content/BoardContent/GameBoard");
    if (gameBoard) {
      // case colori e frecce spawnate a runtime
      ["Home", "Base", "Arrows"].forEach(function (name) {
        var n = gameBoard.getChildByName(name);
        if (n && n.active) {
          n.active = false;
          n.setPosition(-3000, -3000);
        }
      });
      var ch = gameBoard.children;
      for (var i = 0; i < ch.length; i++) {
        if (ch[i].name && ch[i].name.indexOf("arrow_") === 0 && ch[i].active) {
          ch[i].active = false;
          ch[i].setPosition(-3000, -3000);
        }
      }
    }
  }

  // ── Entrata nella modalità tavola dentro la GameScene esistente ──
  function enterGrid9() {
    if (entered) return;
    var bb = cc.find("Canvas/Content/BoardContent");
    if (!bb) return;
    hideJunk();
    var gameBoard = cc.find("Canvas/Content/BoardContent/GameBoard");
    if (!gameBoard) return;
    if (!buildGrid9()) return;
    entered = true;
    refresh();
    startBots();
    toast("Trascina un cerchio per occuparlo — 5 su 9 conquistano il quadrante!");
  }

  // ── Lobby: ingresso diretto nella tavola ──
  function hookLobby() {
    if (entering) return true;
    entering = true;
    setTimeout(function () {
      try {
        if (!entered) {
          cc.director.loadScene("GameScene");
          toast("Benvenuto in JiuTianJiuDi");
        }
      } catch (e) {
        console.error("[Grid9]", e);
        entering = false;
      }
    }, 1200);
    return true;
  }

  // ── Punti di aggancio ──
  setInterval(function () {
    try {
      if (!cc.director) return;
      var s = cc.director.getScene();
      if (!s) return;
      if (s.name === "Lobby") hookLobby();
      if (s.name === "GameScene") {
        hideJunk();
        if (!assetsReady) { loadAssets(function () {}); return; }
        if (!discNodes) { loadAssets(enterGrid9); return; }
        if (!entered) loadAssets(enterGrid9);
      }
    } catch (e) {
      console.error("[Grid9]", e);
    }
  }, 400);

  // API pubblica: qui si aggancia il layer realtime reale
  window.Grid9API = {
    state: state,
    claim: claim,
    release: release,
    enterMode: enterGrid9,
    setPaused: function (v) { state.paused = v; }
  };
})();
