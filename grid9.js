/*
 * JiuTianJiuDi — tavola a 9 quadranti per il portale web
 * ------------------------------------------------------
 * Grafica = SOLO ritagli reali dal tabellone Ludo (atlante A57):
 *   grid9/quad.png   = quadrante della casa (HouseColorBox_1), tintato a runtime
 *                      con 9 tinte → 9 quadranti come i 4 originali del ludo;
 *   grid9/box.png    = box bianca interna (box_02) senza i 4 cerchi originali;
 *   grid9/circle.png = cerchio pedina (PawnBaseCircle): GRIGIO = vuoto,
 *                      tintato del colore del quadrante = pedina cerchiata.
 * Le "caselline" centrali originali (banner/score/rank dentro la box) non
 * vengono disegnate; le caselle del percorso vengono rimosse da Cells.
 *
 * Cosa fa a runtime:
 *   1. dall' Lobby entra da sola nella GameScene esistente (UI/widget ludo);
 *   2. svuota Cells e costruisce la tavola: 9 quadranti (3x3) × 9 cerchi
 *      grigi ciascuno (81 slot) + vassoio in basso con le 9 pedine numerate;
 *   3. DRAG AND DROP come il riferimento: trascini la pedina N su un cerchio
 *      grigio del quadrante N (stesso colore) → la pedina si incasta sul
 *      cerchio; numero sbagliato o quadrante pieno → torna nel vassoio;
 *   4. una pedina piazzata si può spostare su un altro cerchio libero dello
 *      stesso quadrante o rimuovere trascinandola di nuovo nel vassoio;
 *   5. quadrante completato (9/9) → toast + pulsazione della piastrella;
 *   6. window.Grid9API per il futuro layer realtime (Supabase).
 */
(function () {
  "use strict";

  // ── Palette (9 quadranti, stessa famiglia dei 4 colori ludo) ──
  var QUAD_HEX = ["#C0392B", "#E07B28", "#3AA6A0", "#27AE60", "#8AB52A", "#7D9471", "#B64A8F", "#8B5E3C", "#E884A5"];
  var QUAD_NAMES = ["Rosso", "Arancio", "Teal", "Verde", "Lime", "Saggio", "Magenta", "Terra", "Rosa"];
  var GRAY = { r: 204, g: 204, b: 204 };   // cerchio vuoto (come i cerchi originali della box)
  var GRAY_HI = { r: 232, g: 232, b: 232 }; // cerchio libero evidenziato durante il drag
  var CELLS = 81, QUAD_CELLS = 9;

  // geometria dentro GameBoard (626x626)
  var TILE = 200, TILE_STEP = 204, TILE_ORIGIN = -204; // 3 tile da 200 + 2 gap da 4 = 608
  var CIRC = 32, CIRC_STEP = 36;                        // cerchi 3x3 dentro la box bianca
  var TRAY_DISC = 46, TRAY_STEP = 52, TRAY_Y = -392;    // vassoio in basso al canvas

  // ── Stato ──
  var state = {
    slots: new Array(CELLS).fill(false),  // slot occupato da pedina?
    quadFilled: new Array(9).fill(0),
    quadsDone: new Array(9).fill(false),
    placed: 0,
    paused: false
  };
  var sprites = { quad: null, box: null, circle: null };
  var assetsReady = false;
  var boardParent = null, tileNodes = null, circleNodes = null, discNodes = null,
      progressLabel = null, trayNodes = null, trayCountLabels = null;
  var drag = null; // { fromTray: bool, num: q, fromSlot: idx|null, ghost: node }
  var entered = false, entering = false;

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

  function makeNumberLabel(parent, str, size) {
    var n = new cc.Node("num");
    var l = n.addComponent(cc.Label);
    l.string = str;
    l.fontSize = size;
    l.lineHeight = size + 2;
    l.horizontalAlign = cc.Label.HorizontalAlign.CENTER;
    l.verticalAlign = cc.Label.VerticalAlign.CENTER;
    try {
      l.enableOutline = true;
      l.outlineColor = cc.color(40, 30, 20);
      l.outlineWidth = 2;
    } catch (e) { /* outline non disponibile */ }
    n.color = cc.color(255, 255, 255);
    n.zIndex = 2;
    n.parent = parent;
    return n;
  }

  // ── Caricamento dei ritagli (SOLO ritagli reali della mappa) ──
  function loadAssets(done) {
    if (assetsReady) { done(); return; }
    var list = ["grid9/quad.png", "grid9/box.png", "grid9/circle.png"];
    var left = list.length;
    list.forEach(function (url) {
      cc.loader.load(url, function (err, tex) {
        if (!err && tex) {
          var sf = new cc.SpriteFrame(tex);
          if (url.indexOf("quad") > -1) sprites.quad = sf;
          else if (url.indexOf("box") > -1) sprites.box = sf;
          else sprites.circle = sf;
        } else {
          console.error("[Grid9] asset mancante:", url, err);
        }
        if (--left === 0) {
          assetsReady = !!(sprites.quad && sprites.box && sprites.circle);
          done();
        }
      });
    });
  }

  // posizione dello slot n (0..8) del quadrante q in coordinate boardParent
  function slotPos(q, n) {
    var qRow = Math.floor(q / 3), qCol = q % 3;
    var tx = TILE_ORIGIN + qCol * TILE_STEP;
    var ty = TILE_ORIGIN + (2 - qRow) * TILE_STEP;
    var innerRow = Math.floor(n / 3), innerCol = n % 3;
    return {
      x: tx + (innerCol - 1) * CIRC_STEP,
      y: ty + (1 - innerRow) * CIRC_STEP
    };
  }

  // ── Costruzione della tavola 9 quadranti × 9 cerchi grigi ──
  function buildGrid9() {
    boardParent = cc.find("Canvas/Content/BoardContent/GameBoard/Cells");
    if (!boardParent) { console.error("[Grid9] Cells non trovato"); return false; }

    boardParent.removeAllChildren();
    tileNodes = []; circleNodes = []; discNodes = [];

    for (var q = 0; q < 9; q++) {
      var qRow = Math.floor(q / 3), qCol = q % 3;
      var tx = TILE_ORIGIN + qCol * TILE_STEP;
      var ty = TILE_ORIGIN + (2 - qRow) * TILE_STEP;

      // quadrante reale del ludo, tintato con la tinta del quadrante
      var tile = makeSprite(sprites.quad, TILE, TILE, tx, ty, -3);
      tile.color = hexToCc(QUAD_HEX[q]);
      tile.name = "quad_" + q;
      tile.parent = boardParent;
      tileNodes.push(tile);

      // box bianca interna (già senza i 4 cerchi originali)
      var box = makeSprite(sprites.box, 140, 138, tx, ty, -2);
      box.name = "box_" + q;
      box.parent = boardParent;

      // 9 cerchi grigi (vuoti = nessuna pedina piazzata) + nodo pedina (nascosto)
      for (var n = 0; n < QUAD_CELLS; n++) {
        var i = q * QUAD_CELLS + n;
        var p = slotPos(q, n);

        var cnode = makeSprite(sprites.circle, CIRC, CIRC, p.x, p.y, -1);
        cnode.color = cc.color(GRAY.r, GRAY.g, GRAY.b);
        cnode.name = "slot_" + i;
        cnode.parent = boardParent;
        circleNodes.push(cnode);

        var dnode = makeSprite(sprites.circle, CIRC, CIRC, p.x, p.y, 6);
        dnode.color = hexToCc(QUAD_HEX[q]);
        dnode.active = false;
        dnode.name = "disc_" + i;
        makeNumberLabel(dnode, String(q + 1), 16);
        (function (idx, num) {
          dnode.on(cc.Node.EventType.TOUCH_START, function (ev) { startDrag(false, num, idx, ev); }, dnode);
          dnode.on(cc.Node.EventType.TOUCH_MOVE, function (ev) { moveDrag(ev); }, dnode);
          dnode.on(cc.Node.EventType.TOUCH_END, function (ev) { endDrag(ev); }, dnode);
          dnode.on(cc.Node.EventType.TOUCH_CANCEL, function (ev) { cancelDrag(ev); }, dnode);
        })(i, q);
        dnode.parent = boardParent;
        discNodes.push(dnode);
      }
    }

    // progresso sopra la tavola
    progressLabel = new cc.Node("g9_progress");
    var pl = progressLabel.addComponent(cc.Label);
    pl.string = "";
    pl.fontSize = 20;
    pl.lineHeight = 24;
    progressLabel.color = cc.color(255, 255, 255);
    progressLabel.setPosition(0, TILE_ORIGIN + (2 * TILE_STEP) + TILE / 2 + 22);
    progressLabel.zIndex = 50;
    progressLabel.parent = boardParent;

    buildTray();
    return true;
  }

  // ── Vassoio con le 9 pedine numerate (in basso, fuori dalla tavola) ──
  function buildTray() {
    var canvas = cc.find("Canvas");
    if (!canvas) return;
    var old = canvas.getChildByName("g9_tray");
    if (old) old.destroy();

    var tray = new cc.Node("g9_tray");
    tray.zIndex = 900;
    tray.parent = canvas;
    trayNodes = []; trayCountLabels = [];

    for (var q = 0; q < 9; q++) {
      var x = -TRAY_STEP * 4 + q * TRAY_STEP;
      var node = makeSprite(sprites.circle, TRAY_DISC, TRAY_DISC, x, TRAY_Y, 0);
      node.color = hexToCc(QUAD_HEX[q]);
      node.name = "tray_" + q;
      makeNumberLabel(node, String(q + 1), 22);
      var cnt = new cc.Node("cnt");
      var cl = cnt.addComponent(cc.Label);
      cl.string = "×9";
      cl.fontSize = 14;
      cl.lineHeight = 16;
      cnt.color = cc.color(255, 255, 255);
      cnt.setPosition(0, -TRAY_DISC / 2 - 10);
      cnt.parent = node;
      trayCountLabels.push(cl);

      (function (num) {
        node.on(cc.Node.EventType.TOUCH_START, function (ev) { startDrag(true, num, null, ev); }, node);
        node.on(cc.Node.EventType.TOUCH_MOVE, function (ev) { moveDrag(ev); }, node);
        node.on(cc.Node.EventType.TOUCH_END, function (ev) { endDrag(ev); }, node);
        node.on(cc.Node.EventType.TOUCH_CANCEL, function (ev) { cancelDrag(ev); }, node);
      })(q);

      node.parent = tray;
      trayNodes.push(node);
    }
  }

  // ── Drag and drop delle pedine numerate ──
  function startDrag(fromTray, num, fromSlot, ev) {
    (window.__G9_TOUCH_LOG = window.__G9_TOUCH_LOG || []).push("start n=" + num + " tray=" + fromTray);
    if (state.paused || !boardParent) return;
    if (!fromTray && state.slots[fromSlot] !== true) return;
    var quadFull = countRemaining(num) <= 0 && fromTray;
    if (quadFull) { toast("Il quadrante " + QUAD_NAMES[num] + " è completo!"); return; }

    var canvas = cc.find("Canvas");
    var ghost = makeSprite(sprites.circle, CIRC, CIRC, 0, 0, 1000);
    ghost.color = hexToCc(QUAD_HEX[num]);
    makeNumberLabel(ghost, String(num + 1), 16);
    ghost.setScale(1.25);
    var p = canvas.convertToNodeSpace(ev.getLocation());
    ghost.setPosition(p);
    ghost.parent = canvas;
    if (fromTray) trayNodes[num].opacity = 120;
    highlight(num, true);
    drag = { fromTray: fromTray, num: num, fromSlot: fromSlot, ghost: ghost };
  }

  function moveDrag(ev) {
    (window.__G9_TOUCH_LOG = window.__G9_TOUCH_LOG || []).push("move");
    if (!drag) return;
    var canvas = cc.find("Canvas");
    var p = canvas.convertToNodeSpace(ev.getLocation());
    drag.ghost.setPosition(p);
  }

  function endDrag(ev) {
    (window.__G9_TOUCH_LOG = window.__G9_TOUCH_LOG || []).push("end");
    finishDrag(ev);
  }

  function finishDrag(ev) {
    if (!drag) return;
    var canvas = cc.find("Canvas");
    var world = ev.getLocation();
    var boardP = boardParent.convertToNodeSpace(world);
    var canvasP = canvas.convertToNodeSpace(world);
    var num = drag.num, fromTray = drag.fromTray, fromSlot = drag.fromSlot;
    drag.ghost.destroy();
    drag = null;
    highlight(num, false);
    if (fromTray) trayNodes[num].opacity = 255;

    // riconsegna nel vassoio = rimozione della pedina
    // (soglia = centro reale del disco del vassoio, in coordinate world)
    var trayY = (trayNodes && trayNodes[num]) ? trayNodes[num].convertToWorldSpaceAR(cc.v2(0, 0)).y : TRAY_Y + 480;
    if (!fromTray && world.y < trayY + TRAY_DISC / 2 + 6) {
      removeDisc(fromSlot);
      refresh();
      return;
    }

    // cerca lo slot libero più vicino (raggio 34)
    var best = -1, bestD = 34 * 34;
    for (var i = 0; i < CELLS; i++) {
      var q = Math.floor(i / QUAD_CELLS);
      if (state.slots[i] || q !== num) continue; // solo quadrante del numero
      var p = slotPos(q, i % QUAD_CELLS);
      var dx = p.x - boardP.x, dy = p.y - boardP.y;
      var d2 = dx * dx + dy * dy;
      if (d2 < bestD) { bestD = d2; best = i; }
    }
    if (best >= 0) {
      if (fromSlot !== null && fromSlot !== best) removeDisc(fromSlot);
      placeDisc(best);
    } else if (fromSlot !== null) {
      snapBack(fromSlot); // pedina già piazzata: torna al suo slot
    } else {
      toast("La pedina " + (num + 1) + " va nel quadrante " + QUAD_NAMES[num]);
    }
    refresh();
  }

  function cancelDrag(ev) {
    (window.__G9_TOUCH_LOG = window.__G9_TOUCH_LOG || []).push("cancel");
    // in alcuni ambienti il mouseup arriva come TOUCH_CANCEL:
    // il drop viene comunque completato con l'ultimo punto toccato
    finishDrag(ev);
  }

  function placeDisc(i) {
    if (state.slots[i]) return;
    state.slots[i] = true;
    var q = Math.floor(i / QUAD_CELLS);
    state.quadFilled[q]++;
    state.placed++;
    if (state.quadFilled[q] === QUAD_CELLS && !state.quadsDone[q]) {
      state.quadsDone[q] = true;
      toast("Quadrante " + QUAD_NAMES[q] + " completato! (" + doneQuads() + "/9)");
      var tile = tileNodes[q];
      if (tile) {
        tile.stopAllActions();
        tile.runAction(cc.sequence(
          cc.scaleTo(0.12, 1.05),
          cc.scaleTo(0.12, 1.0),
          cc.scaleTo(0.12, 1.03),
          cc.scaleTo(0.12, 1.0)
        ));
      }
    }
  }

  function removeDisc(i) {
    if (!state.slots[i]) return;
    state.slots[i] = false;
    var q = Math.floor(i / QUAD_CELLS);
    state.quadFilled[q]--;
    state.placed--;
    if (state.quadsDone[q] && state.quadFilled[q] < QUAD_CELLS) state.quadsDone[q] = false;
    snapBack(i);
  }

  function snapBack(i) {
    var node = discNodes[i];
    if (!node) return;
    var q = Math.floor(i / QUAD_CELLS);
    var p = slotPos(q, i % QUAD_CELLS);
    node.setPosition(p.x, p.y);
    node.setScale(1);
  }

  function countRemaining(q) { return QUAD_CELLS - state.quadFilled[q]; }
  function doneQuads() {
    var c = 0;
    for (var q = 0; q < 9; q++) if (state.quadsDone[q]) c++;
    return c;
  }

  function highlight(q, on) {
    for (var n = 0; n < QUAD_CELLS; n++) {
      var i = q * QUAD_CELLS + n;
      var node = circleNodes[i];
      if (!node) continue;
      if (on && !state.slots[i]) {
        node.color = cc.color(GRAY_HI.r, GRAY_HI.g, GRAY_HI.b);
        node.setScale(1.2);
      } else {
        node.color = cc.color(GRAY.r, GRAY.g, GRAY.b);
        node.setScale(1);
      }
    }
  }

  // ── Render ──
  function refresh() {
    if (!discNodes) return;
    for (var i = 0; i < CELLS; i++) {
      discNodes[i].active = state.slots[i];
    }
    for (var q = 0; q < 9; q++) {
      var rem = countRemaining(q);
      if (trayCountLabels && trayCountLabels[q]) trayCountLabels[q].string = "×" + rem;
      if (trayNodes && trayNodes[q]) trayNodes[q].opacity = rem > 0 ? 255 : 130;
    }
    if (progressLabel) {
      progressLabel.getComponent(cc.Label).string =
        "Quadranti " + doneQuads() + "/9   ·   Pedine " + state.placed + "/81";
    }
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
    n.color = cc.color(255, 255, 255);
    try { l.enableOutline = true; l.outlineColor = cc.color(40, 30, 20); l.outlineWidth = 2; } catch (e) {}
    n.setPosition(0, 428);
    n.zIndex = 999;
    n.parent = canvas;
    n.runAction(cc.sequence(cc.delayTime(1.4), cc.fadeOut(0.8), cc.removeSelf()));
  }

  // ── Nodi del gioco originale da tenere fuori ──
  // NB: RushModeBackground resta visibile: è lo sfondo blu dell'UI ludo
  var JUNK = ["RushGameBoard", "WaitingPanel", "FftueNode", "AnimNodes",
              "DebugLayer", "powerupNodeV2", "SafeLocations", "TileHighlightLocation", "timer",
              "TopGamehud", "ProfileContainer", "PawnContainer", "MyPlayerNode",
              "SwordAnimPlaceholder", "SwordAnimationMetaNode", "PowerupPlayerNode", "Popups",
              "loadingBg", "ConfettiSpine1", "ConfettiSpine2", "ConfettiSpine3", "ConfettiSpine4",
              "winPopups", "chatprefab", "chatprefab2", "chatprefab3", "chatprefab4",
              "clickPanel", "toolTipNode", "New Label"];

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
    window.__G9_READY__ = true;
    refresh();
    toast("Trascina le pedine sui cerchi grigi dello stesso colore!");
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
        // rimuovi nodi spawnati dal gioco originale dentro Cells (cell_*, rowNode, ...)
        if (entered && boardParent) {
          var chB = boardParent.children;
          for (var ib = chB.length - 1; ib >= 0; ib--) {
            var nm = chB[ib].name || "";
            if (!/^quad_/.test(nm) && !/^box_/.test(nm) && !/^slot_/.test(nm) &&
                !/^disc_/.test(nm) && nm !== "g9_progress") chB[ib].destroy();
          }
        }
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
    enterMode: enterGrid9,
    setPaused: function (v) { state.paused = v; },
    reset: function () {
      state.slots.fill(false);
      state.quadFilled.fill(0);
      state.quadsDone.fill(false);
      state.placed = 0;
      refresh();
    }
  };
})();
