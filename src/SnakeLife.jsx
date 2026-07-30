import { useState, useEffect, useRef, useCallback } from "react";

// ═══════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════
const SPEED    = 162;
const HEAD_R   = 13;
const BODY_W   = 20;
const APPLE_R  = 14;
const BRIAR_R  = 20;
const MAX_AV   = 2.0;   // rad/s — limits peak turn to ~115°/s for smooth curves
const INIT_LEN = 60;
const GROW_PX  = 11;   // halved — snake grows slower per apple
const GOLD_PTS = 50;   // golden apple point value
const T_GAPL   = 1;    // max golden apples on screen at once
const INV_T    = 2.2;
const A_PTS    = 10;
const T_APL    = 4;
const T_BRI    = 3;
const ROCK_DURATION = 12; // seconds a fallen rock stays on the map

const MOCK = [
  { date:"28 Jun 2026", score:4200, dur:"07:45", apples:18 },
  { date:"27 Jun 2026", score:2840, dur:"04:23", apples:12 },
  { date:"25 Jun 2026", score:3100, dur:"05:55", apples:14 },
  { date:"24 Jun 2026", score:1950, dur:"03:11", apples:8  },
  { date:"22 Jun 2026", score:890,  dur:"01:34", apples:4  },
];

const UPGRADES_DATA = [
  { id:"regen",         icon:"❤️",   name:"Regeneration",  desc:"Regenerate 1 HP every 20 seconds automatically." },
  { id:"toughScales",   icon:"🛡️",   name:"Tough Scales",  desc:"Grants 2 additional maximum hit points." },
  { id:"flyingSnake",   icon:"🦅",   name:"Flying Snake",  desc:"25% chance to dodge damage from all hazards." },
  { id:"threeHeads",    icon:"🐍",   name:"Agility",       desc:"Automatically collects apples near the snake's head." },
  { id:"waterSnake",    icon:"💧",   name:"Adaptability",  desc:"Decreases penalties from quicksand, falling rocks and lava." },
  { id:"peakEvolution", icon:"✨",   name:"Peak Evolution",desc:"Doubles the score earned from every apple." },
];

// ═══════════════════════════════════════════════════════════════════
// PURE UTILITIES
// ═══════════════════════════════════════════════════════════════════
const clamp = (v, lo, hi) => v < lo ? lo : v > hi ? hi : v;
const dist2 = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
const dist  = (a, b) => Math.sqrt(dist2(a, b));
const norm  = a => { while (a > Math.PI) a -= 2*Math.PI; while (a < -Math.PI) a += 2*Math.PI; return a; };

function mulberry(seed) {
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// ═══════════════════════════════════════════════════════════════════
// MEADOW BACKGROUND GENERATOR
// ═══════════════════════════════════════════════════════════════════
function genMeadow(w, h) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d");
  const rng = mulberry(0xCAFEBABE);

  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0,    "#3E8222");
  bg.addColorStop(0.55, "#4A9028");
  bg.addColorStop(1,    "#2E6015");
  ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);

  for (let i = 0; i < 55; i++) {
    const x = rng()*w, y = rng()*h, r = 28 + rng()*95;
    const gp = ctx.createRadialGradient(x, y, 0, x, y, r);
    gp.addColorStop(0, rng() > .5 ? "rgba(85,165,36,.22)" : "rgba(18,65,4,.18)");
    gp.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = gp; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI*2); ctx.fill();
  }

  ctx.lineCap = "round";
  const nt = Math.floor(w * h / 2600);
  for (let i = 0; i < nt; i++) {
    const x = rng()*w, y = rng()*h;
    const nb = 3 + Math.floor(rng()*4), ht = 7 + rng()*13;
    for (let b = 0; b < nb; b++) {
      const lean = (rng()-.5)*.9, bh = ht*(.7+rng()*.65);
      ctx.beginPath(); ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x+Math.sin(lean)*bh*.5, y-bh*.5, x+Math.sin(lean)*bh, y-bh);
      ctx.strokeStyle = rng() > .5 ? "rgba(91,174,46,.80)" : "rgba(74,144,32,.80)";
      ctx.lineWidth = .9 + rng()*.5; ctx.stroke();
    }
  }

  const palettes = ["#FFE066","#FF8FAB","#AADDFF","#FFF","#FFB347"];
  const nf = Math.floor(w * h / 5800);
  for (let i = 0; i < nf; i++) {
    const x = rng()*w, y = rng()*h;
    const col = palettes[Math.floor(rng()*5)];
    const r = 1.8 + rng()*2.4, np = 5 + Math.floor(rng()*3);
    ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x+(rng()-.5)*3, y+5+rng()*7);
    ctx.strokeStyle = "rgba(58,128,16,.80)"; ctx.lineWidth = 1; ctx.stroke();
    for (let p = 0; p < np; p++) {
      const a = (p/np)*Math.PI*2;
      ctx.beginPath(); ctx.arc(x+Math.cos(a)*r*1.7, y+Math.sin(a)*r*1.7, r*.75, 0, Math.PI*2);
      ctx.fillStyle = col; ctx.globalAlpha = .58; ctx.fill(); ctx.globalAlpha = 1;
    }
    ctx.beginPath(); ctx.arc(x, y, r*.65, 0, Math.PI*2);
    ctx.fillStyle = "#FFD700"; ctx.globalAlpha = .80; ctx.fill(); ctx.globalAlpha = 1;
  }

  const vig = ctx.createRadialGradient(w/2, h/2, Math.min(w,h)*.3, w/2, h/2, Math.max(w,h)*.82);
  vig.addColorStop(0, "rgba(0,0,0,0)"); vig.addColorStop(1, "rgba(0,0,0,.42)");
  ctx.fillStyle = vig; ctx.fillRect(0, 0, w, h);
  return c;
}

// ═══════════════════════════════════════════════════════════════════
// CANVAS RENDERERS
// ═══════════════════════════════════════════════════════════════════
function pathThrough(ctx, pts) {
  if (pts.length < 2) return;
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length - 1; i++) {
    if (dist2(pts[i], pts[i-1]) > 3600) { ctx.moveTo(pts[i].x, pts[i].y); continue; }
    const mx = (pts[i].x + pts[i+1].x) / 2;
    const my = (pts[i].y + pts[i+1].y) / 2;
    ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
  }
  const last = pts.length - 1;
  if (dist2(pts[last], pts[last-1]) <= 3600) ctx.lineTo(pts[last].x, pts[last].y);
}

function drawSnake(ctx, g) {
  const { trail, angle, inv, flash } = g;
  if (trail.length < 2) return;
  if (inv > 0 && Math.floor(flash / .1) % 2 === 0) return;

  const step = 3;
  const pts = [];
  for (let i = 0; i < trail.length; i += step) pts.push(trail[i]);
  if (pts[pts.length-1] !== trail[trail.length-1]) pts.push(trail[trail.length-1]);

  const stroke = (w, col) => {
    ctx.beginPath(); pathThrough(ctx, pts);
    ctx.lineWidth = w; ctx.strokeStyle = col;
    ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.stroke();
  };
  stroke(BODY_W + 16, "rgba(46,204,113,.13)");
  stroke(BODY_W + 3,  "#186A38");
  stroke(BODY_W,      "#2ECC71");
  stroke(BODY_W * .28,"rgba(200,255,220,.40)");

  const h = trail[trail.length - 1];
  const hg = ctx.createRadialGradient(h.x, h.y, 0, h.x, h.y, HEAD_R+11);
  hg.addColorStop(0, "rgba(82,232,138,.36)"); hg.addColorStop(1, "rgba(82,232,138,0)");
  ctx.beginPath(); ctx.arc(h.x, h.y, HEAD_R+11, 0, Math.PI*2); ctx.fillStyle = hg; ctx.fill();

  const hf = ctx.createRadialGradient(h.x-HEAD_R*.3, h.y-HEAD_R*.3, 0, h.x, h.y, HEAD_R);
  hf.addColorStop(0, "#90FFC4"); hf.addColorStop(.4, "#52E88A"); hf.addColorStop(1, "#186A38");
  ctx.beginPath(); ctx.arc(h.x, h.y, HEAD_R, 0, Math.PI*2); ctx.fillStyle = hf; ctx.fill();

  const er = HEAD_R*.28, eo = HEAD_R*.56, pa = angle + Math.PI/2;
  [1, -1].forEach(s => {
    const ex = h.x + Math.cos(angle)*eo*.58 + Math.cos(pa)*eo*.58*s;
    const ey = h.y + Math.sin(angle)*eo*.58 + Math.sin(pa)*eo*.58*s;
    ctx.beginPath(); ctx.arc(ex, ey, er, 0, Math.PI*2); ctx.fillStyle = "#fff"; ctx.fill();
    const px = ex + Math.cos(angle)*er*.28, py = ey + Math.sin(angle)*er*.28;
    ctx.beginPath(); ctx.arc(px, py, er*.52, 0, Math.PI*2); ctx.fillStyle = "#0D0D0D"; ctx.fill();
    ctx.beginPath(); ctx.arc(px-er*.16, py-er*.16, er*.18, 0, Math.PI*2);
    ctx.fillStyle = "rgba(255,255,255,.85)"; ctx.fill();
  });

  const tl = HEAD_R*1.3, fa = Math.PI/6;
  const tx = h.x + Math.cos(angle)*(HEAD_R+tl), ty = h.y + Math.sin(angle)*(HEAD_R+tl);
  ctx.strokeStyle = "#E85050"; ctx.lineWidth = 1.5; ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(h.x+Math.cos(angle)*HEAD_R, h.y+Math.sin(angle)*HEAD_R); ctx.lineTo(tx, ty); ctx.stroke();
  [[fa], [-fa]].forEach(([a]) => {
    ctx.beginPath(); ctx.moveTo(tx, ty);
    ctx.lineTo(tx+Math.cos(angle+a)*HEAD_R*.5, ty+Math.sin(angle+a)*HEAD_R*.5); ctx.stroke();
  });
}

function drawApples(ctx, apples, t, golden = false, map = "grassland") {
  apples.forEach(a => {
    const wy = Math.sin(a.wob + t*2.1) * 2.8;
    ctx.save(); ctx.translate(a.x, a.y + wy); ctx.scale(a.sc, a.sc);
    // Golden apple: aura glow — subtle on desert (nearly invisible), warm on grassland
    if (golden) {
      const isDesert = map === "desert";
      const aura = ctx.createRadialGradient(0, 0, APPLE_R*.4, 0, 0, APPLE_R*2.0);
      if (isDesert) {
        aura.addColorStop(0, "rgba(255,240,160,.07)");
        aura.addColorStop(1, "rgba(255,240,160,0)");
      } else {
        aura.addColorStop(0, "rgba(255,160,10,.22)"); // warm amber-orange, less opaque than before
        aura.addColorStop(1, "rgba(255,160,10,0)");
      }
      ctx.beginPath(); ctx.arc(0, 0, APPLE_R*2.0, 0, Math.PI*2); ctx.fillStyle = aura; ctx.fill();
    }
    ctx.beginPath(); ctx.ellipse(0, APPLE_R+2, APPLE_R*.75, APPLE_R*.2, 0, 0, Math.PI*2);
    ctx.fillStyle = "rgba(0,0,0,.28)"; ctx.fill();
    const gr = ctx.createRadialGradient(-APPLE_R*.32, -APPLE_R*.38, 0, 0, 0, APPLE_R);
    if (golden) {
      if (map === "desert") {
        // Cream-white to light gold — stands out against sandy yellow background
        gr.addColorStop(0,  "#FFFBEC");  // near-white cream
        gr.addColorStop(.35,"#FFE890");  // pale warm yellow
        gr.addColorStop(.75,"#FFCC40");  // golden yellow
        gr.addColorStop(1,  "#B89020");  // amber base
      } else {
        // Warm orange-gold — contrasts with green grassland background
        gr.addColorStop(0,  "#FFE050");  // bright warm yellow
        gr.addColorStop(.35,"#FFB010");  // orange-gold
        gr.addColorStop(.75,"#D87800");  // amber-orange
        gr.addColorStop(1,  "#7A4400");  // dark amber
      }
    } else {
      gr.addColorStop(0, "#FF7070"); gr.addColorStop(.35, "#E84040");
      gr.addColorStop(.75, "#C01818"); gr.addColorStop(1, "#8B0000");
    }
    ctx.beginPath(); ctx.arc(0, 0, APPLE_R, 0, Math.PI*2); ctx.fillStyle = gr; ctx.fill();
    const sp = ctx.createRadialGradient(-APPLE_R*.38,-APPLE_R*.42,0,-APPLE_R*.3,-APPLE_R*.36,APPLE_R*.5);
    sp.addColorStop(0, golden
      ? (map === "desert" ? "rgba(255,255,248,.90)" : "rgba(255,255,160,.72)")
      : "rgba(255,180,180,.72)");
    sp.addColorStop(1, "rgba(255,255,255,0)");
    ctx.beginPath(); ctx.arc(0, 0, APPLE_R, 0, Math.PI*2); ctx.fillStyle = sp; ctx.fill();
    // Desert golden apple: dark amber rim for edge contrast against sandy background
    if (golden && map === "desert") {
      ctx.beginPath(); ctx.arc(0, 0, APPLE_R, 0, Math.PI*2);
      ctx.strokeStyle = "rgba(90,55,10,.58)"; ctx.lineWidth = 2; ctx.stroke();
    }
    ctx.beginPath(); ctx.moveTo(1,-APPLE_R); ctx.bezierCurveTo(3,-APPLE_R-6,7,-APPLE_R-10,5,-APPLE_R-14);
    ctx.strokeStyle = "#5C3A1A"; ctx.lineWidth = 2.2; ctx.lineCap = "round"; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(3,-APPLE_R-7); ctx.bezierCurveTo(10,-APPLE_R-16,16,-APPLE_R-9,11,-APPLE_R-4);
    ctx.bezierCurveTo(6,-APPLE_R-1,3,-APPLE_R-4,3,-APPLE_R-7);
    ctx.fillStyle = "#2ECC71"; ctx.fill();
    ctx.restore();
  });
}

function drawQuicksand(ctx, qs, t) {
  if (!qs || !qs.pts) return;
  const pts = qs.pts; const n = pts.length;
  ctx.save(); ctx.translate(qs.x, qs.y);

  // Build smooth blob path — start at mid(last,first) to avoid degenerate tail artefact
  const blobPath = () => {
    ctx.beginPath();
    const s0x = (pts[n-1].x + pts[0].x)/2, s0y = (pts[n-1].y + pts[0].y)/2;
    ctx.moveTo(s0x, s0y);
    for (let i = 0; i < n; i++) {
      const curr = pts[i], next = pts[(i+1)%n];
      const mx = (curr.x+next.x)/2, my = (curr.y+next.y)/2;
      ctx.quadraticCurveTo(curr.x, curr.y, mx, my);
    }
    ctx.closePath();
  };

  // Fill: dark sand radial gradient
  blobPath();
  const gr = ctx.createRadialGradient(0, 0, 0, 0, 0, qs.r * 1.35);
  gr.addColorStop(0,   'rgba(70, 44, 10, 0.62)');
  gr.addColorStop(0.65,'rgba(65, 40,  8, 0.50)');
  gr.addColorStop(1,   'rgba(60, 36,  5, 0)');
  ctx.fillStyle = gr; ctx.fill();

  // Swirling sand dots inside
  const rng2 = mulberry(qs.seed);
  ctx.globalAlpha = 0.28 + Math.sin(t*0.7)*0.07;
  for (let i = 0; i < 20; i++) {
    const baseAngle = rng2()*Math.PI*2;
    const rad = rng2()*qs.r*0.8;
    const x = Math.cos(baseAngle + t*0.25)*rad;
    const y = Math.sin(baseAngle + t*0.25)*rad*0.65;
    const dr = 2.5 + rng2()*5.5;
    ctx.beginPath(); ctx.arc(x, y, dr, 0, Math.PI*2);
    ctx.fillStyle = 'rgba(45,26,4,.7)'; ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Solid dark-yellow edge (no dash)
  blobPath();
  ctx.strokeStyle = 'rgba(185,130,15,.80)';
  ctx.lineWidth = 2.5; ctx.stroke();

  ctx.restore();
}

function drawLavaPool(ctx, lp, t) {
  if (!lp || !lp.pts) return;
  const pts = lp.pts; const n = pts.length;
  ctx.save(); ctx.translate(lp.x, lp.y);
  const blobPath = () => {
    ctx.beginPath();
    const s0x=(pts[n-1].x+pts[0].x)/2, s0y=(pts[n-1].y+pts[0].y)/2;
    ctx.moveTo(s0x, s0y);
    for (let i=0; i<n; i++) {
      const curr=pts[i], next=pts[(i+1)%n];
      const mx=(curr.x+next.x)/2, my=(curr.y+next.y)/2;
      ctx.quadraticCurveTo(curr.x, curr.y, mx, my);
    }
    ctx.closePath();
  };
  // Outer orange glow
  blobPath();
  const glowGr=ctx.createRadialGradient(0,0,lp.r*.6,0,0,lp.r*1.7);
  glowGr.addColorStop(0,'rgba(255,100,0,.18)'); glowGr.addColorStop(1,'rgba(255,50,0,0)');
  ctx.fillStyle=glowGr; ctx.fill();
  // Lava fill
  blobPath();
  const gr=ctx.createRadialGradient(0,0,0,0,0,lp.r*1.2);
  gr.addColorStop(0,  'rgba(230,90,10,.85)');
  gr.addColorStop(0.5,'rgba(190,55,5,.72)');
  gr.addColorStop(1,  'rgba(150,28,0,0)');
  ctx.fillStyle=gr; ctx.fill();
  // Bubbles — quicksand-style orbit, clipped to blob shape
  ctx.save(); blobPath(); ctx.clip();
  const rng2=mulberry(lp.seed);
  ctx.globalAlpha = 0.62 + Math.sin(t*0.7)*0.10;
  for (let i=0; i<20; i++) {
    const baseAngle = rng2()*Math.PI*2;
    const rad = rng2()*lp.r*0.8;
    const x = Math.cos(baseAngle + t*0.25)*rad;
    const y = Math.sin(baseAngle + t*0.25)*rad*0.65;
    const dr = 2.5 + rng2()*6;
    ctx.beginPath(); ctx.arc(x, y, dr, 0, Math.PI*2);
    ctx.fillStyle = rng2()>.5?'rgba(255,245,80,.90)':'rgba(255,200,45,.78)'; ctx.fill();
  }
  ctx.globalAlpha=1; ctx.restore();
  // Bright orange solid edge
  blobPath();
  ctx.strokeStyle='rgba(255,130,20,.92)'; ctx.lineWidth=2.5; ctx.stroke();
  ctx.restore();
}

function drawFallingRocks(ctx, rocks, t) {
  rocks.forEach(rock => {
    const isShadow = rock.timer < 3;
    ctx.save(); ctx.translate(rock.x, rock.y);
    if (isShadow) {
      const prog = rock.timer / 3;
      const scale = 0.3 + prog * 0.7;
      ctx.beginPath();
      ctx.ellipse(0, 4, rock.r*scale*1.3, rock.r*scale*0.55, 0, 0, Math.PI*2);
      ctx.fillStyle=`rgba(0,0,0,${0.12+prog*0.35})`; ctx.fill();
      ctx.beginPath();
      ctx.ellipse(0, 0, rock.r*(1.3+Math.sin(t*5)*0.12), rock.r*(0.7+Math.sin(t*5)*0.06), 0, 0, Math.PI*2);
      ctx.strokeStyle=`rgba(255,90,0,${prog*0.50})`; ctx.lineWidth=1.8; ctx.stroke();
    } else {
      const rockAge = rock.timer - 3;
      const fi = 1.0; // no fade — full brightness until despawn
      const glow=ctx.createRadialGradient(0,0,rock.r*.5,0,0,rock.r*2.4);
      glow.addColorStop(0,`rgba(255,120,0,${0.52*fi})`); glow.addColorStop(1,'rgba(255,40,0,0)');
      ctx.beginPath(); ctx.arc(0, 0, rock.r*2.4, 0, Math.PI*2); ctx.fillStyle=glow; ctx.fill();
      ctx.beginPath(); ctx.ellipse(0,rock.r*.55,rock.r*1.1,rock.r*.38,0,0,Math.PI*2);
      ctx.fillStyle='rgba(0,0,0,.38)'; ctx.fill();
      const rg=ctx.createRadialGradient(-rock.r*.32,-rock.r*.32,0,0,0,rock.r);
      rg.addColorStop(0,'#3A3030'); rg.addColorStop(.5,'#181010'); rg.addColorStop(1,'#090606');
      ctx.beginPath(); ctx.arc(0,0,rock.r,0,Math.PI*2); ctx.fillStyle=rg; ctx.fill();
      const rngS=mulberry(rock.id+1);
      ctx.globalAlpha=fi*0.85;
      for (let i=0; i<9; i++) {
        const ba=rngS()*Math.PI*2, bd=rock.r*(0.45+rngS()*0.65);
        const fa=ba+t*(0.7+rngS()*0.6);
        const fx=Math.cos(fa)*bd, fy=Math.sin(fa)*bd+Math.sin(t*2.8+i)*rock.r*0.22;
        const fr=1.8+rngS()*3.8;
        ctx.beginPath(); ctx.arc(fx, fy, fr, 0, Math.PI*2);
        ctx.fillStyle=rngS()>.5?'rgba(255,170,10,.95)':'rgba(255,60,0,.85)'; ctx.fill();
      }
      ctx.globalAlpha=1;
    }
    ctx.restore();
  });
}

function drawBriars(ctx, briars, t, map) {
  briars.forEach(b => {
    ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.rot + t*b.rs);
    if (b.sc !== undefined && b.sc < 1) ctx.scale(b.sc, b.sc);
    const R = b.r, iR = R*.52, sp = b.sp;
    const dg = ctx.createRadialGradient(0,0,iR*.5,0,0,R+13);
    dg.addColorStop(0, "rgba(200,60,20,.14)"); dg.addColorStop(1, "rgba(200,60,20,0)");
    ctx.beginPath(); ctx.arc(0,0,R+13,0,Math.PI*2); ctx.fillStyle = dg; ctx.fill();
    ctx.beginPath();
    for (let i = 0; i < sp*2; i++) {
      const a = (i/(sp*2))*Math.PI*2, r2 = i%2===0 ? R : iR;
      i===0 ? ctx.moveTo(Math.cos(a)*r2, Math.sin(a)*r2) : ctx.lineTo(Math.cos(a)*r2, Math.sin(a)*r2);
    }
    ctx.closePath();
    const bg = ctx.createRadialGradient(0,-R*.2,0,0,0,R);
    bg.addColorStop(0,"#3A5A1A"); bg.addColorStop(.55,"#2A4010"); bg.addColorStop(1,"#1A2808");
    ctx.fillStyle = bg; ctx.fill();
    // Desert + volcanic: bright orange stroke; grassland: green stroke
    ctx.strokeStyle = (map === "desert" || map === "volcanic") ? "rgba(255,140,20,.58)" : "rgba(160,220,70,.28)";
    ctx.lineWidth = 1.2; ctx.stroke();
    for (let i = 0; i < 3; i++) {
      const a=(i/3)*Math.PI*2, br=iR*.42;
      ctx.beginPath(); ctx.arc(Math.cos(a)*br, Math.sin(a)*br, 2.5, 0, Math.PI*2);
      ctx.fillStyle = "#6A0000"; ctx.fill();
    }
    ctx.restore();
  });
}

function drawParticles(ctx, parts) {
  parts.forEach(p => {
    ctx.save(); ctx.globalAlpha = p.alpha; ctx.translate(p.x, p.y); ctx.scale(p.sc, p.sc);
    ctx.font = `bold 15px "Orbitron",monospace`;
    ctx.fillStyle = p.col; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.shadowColor = "rgba(0,0,0,.9)"; ctx.shadowBlur = 5;
    ctx.fillText(p.txt, 0, 0); ctx.restore();
  });
}

function drawJoy(ctx, g) {
  const alpha = g.joyActive ? 1 : (g.joyFadeAlpha || 0);
  if (alpha <= 0.01) return;
  const R = 50, tr = 20;
  const rawDx = g.joyX - g.joyCx, rawDy = g.joyY - g.joyCy;
  const jdist = Math.sqrt(rawDx*rawDx + rawDy*rawDy);
  const dx = jdist > 0 ? Math.min(jdist, R) * rawDx / jdist : 0;
  const dy = jdist > 0 ? Math.min(jdist, R) * rawDy / jdist : 0;
  ctx.save();
  ctx.globalAlpha = alpha;
  // Base ring
  ctx.beginPath(); ctx.arc(g.joyCx, g.joyCy, R, 0, Math.PI*2);
  ctx.fillStyle = "rgba(46,204,113,.07)"; ctx.fill();
  ctx.strokeStyle = "rgba(46,204,113,.40)"; ctx.lineWidth = 2; ctx.stroke();
  // 10px deadzone ring
  ctx.beginPath(); ctx.arc(g.joyCx, g.joyCy, 10, 0, Math.PI*2);
  ctx.strokeStyle = "rgba(46,204,113,.22)"; ctx.lineWidth = 1; ctx.stroke();
  // Crosshair guides
  ctx.globalAlpha = alpha * .25; ctx.strokeStyle = "#2ECC71"; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(g.joyCx-R, g.joyCy); ctx.lineTo(g.joyCx+R, g.joyCy); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(g.joyCx, g.joyCy-R); ctx.lineTo(g.joyCx, g.joyCy+R); ctx.stroke();
  ctx.globalAlpha = alpha;
  // Thumb knob clamped to max radius
  const tx = g.joyCx+dx, ty = g.joyCy+dy;
  const tg = ctx.createRadialGradient(tx-tr*.3, ty-tr*.3, 0, tx, ty, tr);
  tg.addColorStop(0,"rgba(100,255,160,.92)"); tg.addColorStop(1,"rgba(20,140,60,.72)");
  ctx.beginPath(); ctx.arc(tx, ty, tr, 0, Math.PI*2);
  ctx.fillStyle = tg; ctx.fill();
  ctx.strokeStyle = "rgba(82,232,138,.65)"; ctx.lineWidth = 2; ctx.stroke();
  ctx.restore();
}

function drawTouchReticle(ctx, g) {
  if (!g.touchActive) return;
  ctx.save();
  ctx.globalAlpha = .42;
  ctx.strokeStyle = "#2ECC71"; ctx.lineWidth = 1.5; ctx.lineCap = "round";
  ctx.beginPath(); ctx.arc(g.touchX, g.touchY, 9, 0, Math.PI*2); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(g.touchX-16, g.touchY); ctx.lineTo(g.touchX+16, g.touchY);
  ctx.moveTo(g.touchX, g.touchY-16); ctx.lineTo(g.touchX, g.touchY+16);
  ctx.stroke();
  ctx.restore();
}

// ─── Flying Snake dodge visual: DODGE! text + white star burst ───────────────
function emitDodgeStars(g, x, y) {
  g.parts.push({id:g.nid++, x, y:y-18, txt:"DODGE!", col:"#52E88A", alpha:1, vy:-55, sc:1.0, life:1.0});
  for (let si = 0; si < 6; si++) {
    const a = (si/6)*Math.PI*2, d = 18+Math.random()*9;
    g.parts.push({id:g.nid++, x:x+Math.cos(a)*d, y:y+Math.sin(a)*d, txt:"★", col:"#FFFFFF", alpha:1, vy:-26+Math.sin(a)*16, sc:0.78, life:0.78});
  }
}

// ═══════════════════════════════════════════════════════════════════
// SPAWN HELPERS
// ═══════════════════════════════════════════════════════════════════
function spawnApple(g, W, H) {
  const head = g.trail[g.trail.length-1]; let x, y, t = 0;
  do {
    x = 42 + Math.random()*(W-84);
    y = 42 + Math.random()*(H-84);
    t++;
  } while (t < 25 && (
    dist2({x,y}, head) < 70*70 ||
    g.briars.some(b => dist2({x,y}, b) < 95*95) ||
    g.apples.some(a => dist2({x,y}, a) < 55*55) ||
    g.goldenApples.some(a => dist2({x,y}, a) < 55*55) ||
    // Volcanic: avoid spawning inside or too close to the lava pool
    (g.map === "volcanic" && g.lavaPool && dist2({x,y},{x:g.lavaPool.x,y:g.lavaPool.y}) < (g.lavaPool.r*1.8)**2)
  ));
  // Bad-luck protection: force golden after 15 consecutive red apples
  const forceGolden = g.redAppleStreak >= 15;
  const goldenRate = g.map === "volcanic" ? 0.20 : 0.10; // volcanic: 2× golden rate
  if (forceGolden || Math.random() < goldenRate) {
    g.goldenApples.push({ id:g.nid++, x, y, wob:Math.random()*Math.PI*2, sc:.1 });
    g.redAppleStreak = 0;
  } else {
    g.apples.push({ id:g.nid++, x, y, wob:Math.random()*Math.PI*2, sc:.1 });
    g.redAppleStreak++;
  }
}
function spawnBriar(g, W, H) {
  const head = g.trail[g.trail.length-1]; let x, y, t = 0;
  do {
    x = 55 + Math.random()*(W-110);
    y = 55 + Math.random()*(H-110);
    t++;
  } while (t < 25 && (
    dist2({x,y}, head) < 90*90 ||
    g.apples.some(a => dist2({x,y}, a) < 95*95) ||
    g.briars.some(b => dist2({x,y}, b) < 70*70) ||
    // Volcanic: avoid spawning inside or close to lava pool
    (g.map === "volcanic" && g.lavaPool && dist2({x,y},{x:g.lavaPool.x,y:g.lavaPool.y}) < (g.lavaPool.r*2.0)**2)
  ));
  g.briars.push({ id:g.nid++, x, y, rot:Math.random()*Math.PI*2, rs:(Math.random()-.5)*.4, sp:7+Math.floor(Math.random()*4), r:BRIAR_R+Math.random()*6, sc:0.1 });
}

function spawnQuicksand(g, W, H) {
  // Base radius → area = PI*r^2 ≈ W*H/8
  const r = Math.sqrt(W * H / (8 * Math.PI));
  const margin = r * 1.1;
  const head = g.trail[g.trail.length-1];
  let cx, cy, attempts = 0;
  do {
    cx = margin + Math.random()*(W - 2*margin);
    cy = margin + Math.random()*(H - 2*margin);
    attempts++;
  } while (attempts < 20 && dist2({x:cx,y:cy}, head) < (r*2.2)**2); // keep pool edge away from snake

  const n = 20; // more points = smoother base polygon
  // Generate raw radii with reduced variance (±18%) to avoid extreme spikes
  let radii = Array.from({length: n}, () => 0.82 + Math.random()*0.36);
  // Smooth radii 3 passes — averages each with its neighbours, eliminating sharp peaks
  for (let pass = 0; pass < 3; pass++) {
    radii = radii.map((rv, i) => (rv + radii[(i-1+n)%n] + radii[(i+1)%n]) / 3);
  }
  const pts = Array.from({length: n}, (_, i) => {
    const a = (i/n)*Math.PI*2;
    const rad = r * radii[i];
    return { x: Math.cos(a)*rad, y: Math.sin(a)*rad };
  });
  g.quicksand = { x:cx, y:cy, r, pts, seed: Math.random()*0x7FFFFFFF|0 };
}

function isInQuicksand(px, py, qs) {
  if (!qs || !qs.pts) return false;
  const lx = px - qs.x, ly = py - qs.y;
  if (lx*lx + ly*ly > qs.r*qs.r*1.96) return false; // quick bounding circle reject
  const pts = qs.pts; const n = pts.length;
  let inside = false;
  for (let i = 0, j = n-1; i < n; j = i++) {
    const xi = pts[i].x, yi = pts[i].y, xj = pts[j].x, yj = pts[j].y;
    if ((yi > ly) !== (yj > ly) && lx < (xj-xi)*(ly-yi)/(yj-yi)+xi) inside = !inside;
  }
  return inside;
}

function spawnLavaPool(g, W, H) {
  const r = Math.sqrt(W * H / (12 * Math.PI)); // 1/12 of map area — smaller than quicksand
  const margin = r * 1.1;
  const head = g.trail[g.trail.length-1];
  let cx, cy, attempts = 0;
  do {
    cx = margin + Math.random()*(W-2*margin);
    cy = margin + Math.random()*(H-2*margin);
    attempts++;
  } while (attempts < 20 && dist2({x:cx,y:cy}, head) < (r*2.2)**2); // keep pool edge away from snake

  const n = 20;
  let radii = Array.from({length:n}, () => 0.82+Math.random()*0.36);
  for (let pass=0; pass<3; pass++) radii = radii.map((rv,i) => (rv+radii[(i-1+n)%n]+radii[(i+1)%n])/3);
  const pts = Array.from({length:n}, (_,i) => {
    const a=(i/n)*Math.PI*2, rad=r*radii[i];
    return {x:Math.cos(a)*rad, y:Math.sin(a)*rad};
  });
  g.lavaPool = {x:cx, y:cy, r, pts, seed:Math.random()*0x7FFFFFFF|0};
}

function isInLavaPool(px, py, lp) {
  if (!lp||!lp.pts) return false;
  const lx=px-lp.x, ly=py-lp.y;
  if (lx*lx+ly*ly > lp.r*lp.r*1.96) return false;
  const pts=lp.pts; const n=pts.length; let inside=false;
  for (let i=0,j=n-1; i<n; j=i++) {
    const xi=pts[i].x,yi=pts[i].y,xj=pts[j].x,yj=pts[j].y;
    if ((yi>ly)!==(yj>ly)&&lx<(xj-xi)*(ly-yi)/(yj-yi)+xi) inside=!inside;
  }
  return inside;
}

function spawnFallingRocks(g, W, H) {
  const count = 1 + Math.floor(Math.random()*3); // 1–3 rocks
  const head = g.trail[g.trail.length-1];
  for (let i = 0; i < count; i++) {
    let x, y, t = 0;
    do {
      x = 60+Math.random()*(W-120);
      y = 60+Math.random()*(H-120);
      t++;
    } while (t < 20 && (
      dist2({x,y}, head) < 90*90 ||
      g.rocks.some(r => dist2({x,y}, r) < 60*60) ||
      // Don't land on top of or very close to existing briars
      g.briars.some(b => dist2({x,y}, b) < (b.r + 40)**2)
      // Note: rocks CAN land inside lava pools (no lava exclusion)
    ));
    g.rocks.push({id:g.nid++, x, y, timer:0, r:BRIAR_R}); // same radius as briars
  }
}
// ═══════════════════════════════════════════════════════════════════
// STANDALONE SUB-COMPONENTS
// ═══════════════════════════════════════════════════════════════════
function Heart({ filled }) {
  return (
    <svg width="26" height="24" viewBox="0 0 26 24" fill="none">
      <path d="M13 21S2 14 2 8a5 5 0 0 1 10-1h2a5 5 0 0 1 10 1c0 6-11 13-11 13Z"
        fill={filled ? "#E8524A" : "#1E3050"}
        stroke={filled ? "#FF7070" : "#243040"}
        strokeWidth="1.4"
        style={filled ? { filter:"drop-shadow(0 0 5px rgba(232,82,74,.65))" } : {}} />
      {filled && <path d="M8 9a2 2 0 0 1 2-2" stroke="rgba(255,200,200,.55)" strokeWidth="1.1" strokeLinecap="round"/>}
    </svg>
  );
}

/** Heart that fills from bottom to top as regen progress goes 0→1 */
function HeartFilling({ progress, index }) {
  const gid = `hf${index}`;
  const p = Math.max(0, Math.min(1, progress)).toFixed(3);
  return (
    <svg width="26" height="24" viewBox="0 0 26 24" fill="none">
      <defs>
        <linearGradient id={gid} x1="0" y1="1" x2="0" y2="0" gradientUnits="objectBoundingBox">
          <stop offset={p} stopColor="#E8524A"/>
          <stop offset={p} stopColor="#1E3050"/>
        </linearGradient>
      </defs>
      <path d="M13 21S2 14 2 8a5 5 0 0 1 10-1h2a5 5 0 0 1 10 1c0 6-11 13-11 13Z"
        fill={`url(#${gid})`}
        stroke="#AA3030"
        strokeWidth="1.4"
        style={{ filter:"drop-shadow(0 0 4px rgba(232,82,74,.4))" }}
      />
    </svg>
  );
}

function MapCard({ name, active, locked, grad }) {
  return (
    <div style={{ background:active?"rgba(46,204,113,.07)":"rgba(255,255,255,.025)", border:`1.5px solid ${active?"#2ECC71":"#253A52"}`, borderRadius:11, padding:"10px", boxShadow:active?"0 0 14px rgba(46,204,113,.18)":"none", position:"relative", overflow:"hidden", cursor:locked?"not-allowed":"pointer" }}>
      <div style={{ height:52, borderRadius:7, marginBottom:8, background:locked?"#0D1520":grad, opacity:locked?.5:1, display:"flex", alignItems:"center", justifyContent:"center" }}>
        {active && <svg width="38" height="26" viewBox="0 0 38 26"><rect width="38" height="26" fill="rgba(0,0,0,.12)" rx="3"/><path d="M4 13 Q9 5 19 13 Q29 21 34 13" stroke="#2ECC71" strokeWidth="2.5" fill="none" strokeLinecap="round"/><circle cx="34" cy="13" r="3" fill="#2ECC71"/><circle cx="11" cy="10" r="3.5" fill="#E84040"/></svg>}
        {locked && <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#4A6880" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>}
      </div>
      <div style={{ fontFamily:"Nunito,sans-serif", fontSize:13, fontWeight:700, color:active?"#2ECC71":locked?"#5A7890":"#8BAFC8" }}>{name}</div>
      {active  && <div style={{ fontSize:12, color:"#52E88A", fontFamily:"Nunito", marginTop:3, fontWeight:700 }}>● ACTIVE</div>}
      {locked  && <div style={{ position:"absolute", top:7, right:7, fontSize:11, background:"#0D1828", color:"#7A9AB8", padding:"2px 6px", borderRadius:4, fontFamily:"Nunito", fontWeight:700 }}>LOCKED</div>}
    </div>
  );
}

function UpCard({ icon, name, desc }) {
  return (
    <div style={{ background:"rgba(255,255,255,.025)", border:"1.5px solid #253A52", borderRadius:11, padding:"12px 10px", position:"relative", textAlign:"center" }}>
      <div style={{ fontSize:24, marginBottom:6 }}>{icon}</div>
      <div style={{ fontFamily:"Nunito", fontSize:13, fontWeight:700, color:"#8BAFC8" }}>{name}</div>
      <div style={{ fontSize:12, color:"#7A9AB8", marginTop:3, fontFamily:"Nunito" }}>{desc}</div>
      <div style={{ position:"absolute", top:6, right:6, fontSize:11, background:"rgba(244,196,48,.10)", color:"#F4C430", padding:"2px 6px", borderRadius:4, fontFamily:"Nunito", fontWeight:700, border:"1px solid rgba(244,196,48,.30)" }}>SOON</div>
    </div>
  );
}

function SidebarContent({ tab, setTab, records }) {
  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100%", overflow:"hidden" }}>
      <div style={{ display:"flex", gap:3, marginBottom:12, background:"rgba(255,255,255,.04)", borderRadius:9, padding:"3px", flexShrink:0 }}>
        {["upgrades","records"].map(t => (
          <button key={t} onClick={() => setTab(t)} style={{ flex:1, padding:"8px 4px", borderRadius:7, border:"none", cursor:"pointer", background:tab===t?"rgba(46,204,113,.18)":"transparent", color:tab===t?"#2ECC71":"#7A9AB8", fontFamily:"Nunito,sans-serif", fontWeight:700, fontSize:13, letterSpacing:".05em", textTransform:"uppercase", transition:"all .15s", borderBottom:tab===t?"2px solid #2ECC71":"2px solid transparent" }}>
            {t}
          </button>
        ))}
      </div>
      <div style={{ flex:1, overflowY:"auto", overflowX:"hidden", paddingRight:2 }}>
        {tab === "upgrades" && (
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:7 }}>
            <UpCard icon="⚡" name="Speed Boost"   desc="Faster velocity"/>
            <UpCard icon="🛡️" name="Phase Shield"  desc="+2 hit points"/>
            <UpCard icon="✨" name="Score ×2"      desc="Double rewards"/>
            <UpCard icon="🌀" name="Multi-Trail"   desc="Leave a damage path"/>
            <UpCard icon="🧲" name="Apple Magnet"  desc="Auto-collect nearby"/>
            <UpCard icon="👁️" name="Radar Sense"   desc="Spot hazards early"/>
          </div>
        )}
        {tab === "records" && (
          <table style={{ width:"100%", borderCollapse:"separate", borderSpacing:"0 4px" }}>
            <thead>
              <tr>{["Date","Score","Time","🍎"].map(h => (
                <th key={h} style={{ fontFamily:"Nunito", fontSize:12, color:"#7A9AB8", padding:"4px 5px", textAlign:"left", textTransform:"uppercase", letterSpacing:".06em", fontWeight:700 }}>{h}</th>
              ))}</tr>
            </thead>
            <tbody>
              {records.slice(0, 5).map((r, i) => (
                <tr key={i} style={{ background:i===0?"rgba(46,204,113,.07)":"rgba(255,255,255,.03)" }}>
                  <td style={{ fontFamily:"Nunito", fontSize:13, color:"#8BAFC8", padding:"6px 5px", borderRadius:"5px 0 0 5px" }}>{r.date}</td>
                  <td style={{ fontFamily:'"Orbitron",monospace', fontSize:13, color:i===0?"#F4C430":"#D4E4F0", padding:"6px 4px", fontWeight:700 }}>{r.score.toLocaleString()}</td>
                  <td style={{ fontFamily:"Nunito", fontSize:13, color:"#8BAFC8", padding:"6px 4px" }}>{r.dur}</td>
                  <td style={{ fontFamily:"Nunito", fontSize:13, color:"#8BAFC8", padding:"6px 5px", borderRadius:"0 5px 5px 0" }}>{r.apples}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ─── Pause accordion panel ──────────────────────────────────────────────────
function AccordionPanel({ title, open, onToggle, badge, children }) {
  return (
    <div style={{ width:"100%", border:`1px solid ${open?"#2ECC71":"#253A52"}`, borderRadius:12, overflow:"hidden", background:"rgba(255,255,255,.03)", transition:"border-color .25s" }}>
      <button onClick={onToggle} style={{ width:"100%", display:"flex", alignItems:"center", padding:"14px 16px", background:open?"rgba(46,204,113,.08)":"rgba(255,255,255,.04)", border:"none", cursor:"pointer", transition:"background .25s" }}>
        {/* Left spacer — pushes title to true center */}
        <div style={{ flex:1 }}/>
        {/* Center: title + optional badge */}
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <span style={{ fontFamily:"Nunito,sans-serif", fontWeight:700, fontSize:14, letterSpacing:".07em", textTransform:"uppercase", color:open?"#2ECC71":"#C8D8E8", transition:"color .25s" }}>{title}</span>
          {badge}
        </div>
        {/* Right: spacer + animated chevron */}
        <div style={{ flex:1, display:"flex", justifyContent:"flex-end", alignItems:"center" }}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ transform:open?"rotate(180deg)":"rotate(0deg)", transition:"transform .3s cubic-bezier(.4,0,.2,1)", flexShrink:0 }}>
            <path d="M3 5L8 11L13 5" stroke={open?"#2ECC71":"#7A9AB8"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
      </button>
      {/* Animated body — always rendered, height animated via max-height */}
      <div style={{ maxHeight:open?"900px":"0px", opacity:open?1:0, overflow:"hidden", transition:"max-height .38s cubic-bezier(.4,0,.2,1), opacity .22s ease" }}>
        <div style={{ padding:"14px 16px", borderTop:"1px solid #1E3050" }}>
          {children}
        </div>
      </div>
    </div>
  );
}

// ─── Pause-screen upgrade card ───────────────────────────────────────────────
function PauseUpgradeCard({ id, icon, name, desc, locked, pending, unlocked, canAfford, onUnlock, onRemove }) {
  const isActive = locked || pending;
  const borderCol = locked ? "#2ECC71" : pending ? "#D4A820" : canAfford ? "#3A5A78" : "#1E3050";
  const bgCol     = locked ? "rgba(46,204,113,.12)" : pending ? "rgba(212,168,32,.08)" : "rgba(255,255,255,.04)";
  const handleClick = locked ? undefined
    : pending       ? () => onRemove(id)
    : canAfford     ? () => onUnlock(id)
    : undefined;
  return (
    <div onClick={handleClick} style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 12px", background:bgCol, borderRadius:10, border:`1px solid ${borderCol}`, cursor:(pending||(!isActive&&canAfford))?"pointer":"default", opacity:(!isActive&&!canAfford)?0.48:1, transition:"border-color .15s, background .15s, opacity .15s" }}>
      <div style={{ fontSize:21, flexShrink:0, width:36, height:36, display:"flex", alignItems:"center", justifyContent:"center", background:isActive?"rgba(46,204,113,.15)":"rgba(46,204,113,.08)", borderRadius:8, border:`1px solid ${isActive?"rgba(46,204,113,.4)":"rgba(46,204,113,.18)"}` }}>{icon}</div>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontFamily:"Nunito,sans-serif", fontSize:13, fontWeight:700, color:locked?"#2ECC71":pending?"#D4C060":"#D4E4F0", marginBottom:2 }}>{name}</div>
        <div style={{ fontFamily:"Nunito,sans-serif", fontSize:11, color:"#7A9AB8", lineHeight:1.35 }}>{desc}</div>
      </div>
      {/* Fixed-width indicator — prevents any layout shift when state changes */}
      <div style={{ width:30, flexShrink:0, display:"flex", justifyContent:"center", alignItems:"center" }}>
        {locked   && <span style={{ color:"#2ECC71", fontSize:16, fontWeight:700 }}>✓</span>}
        {pending  && <span style={{ color:"#D4A820", fontSize:16, fontWeight:700 }}>✓</span>}
        {!isActive && canAfford  && <span style={{ fontFamily:'"Orbitron",monospace', fontSize:10, color:"#F4C430", whiteSpace:"nowrap" }}>🌟1</span>}
        {!isActive && !canAfford && <span style={{ fontSize:13 }}>🔒</span>}
      </div>
    </div>
  );
}

// ─── Desert background ───────────────────────────────────────────────────────
function genDesert(w, h) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  const rng = mulberry(0xDE537499);

  // Base warm sandy gradient — golden yellow, inspired by real desert sand
  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0,   '#F0CC6A');
  bg.addColorStop(0.30,'#E8BA50');
  bg.addColorStop(0.65,'#D8A83C');
  bg.addColorStop(1,   '#C49430');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);

  // Large tonal patches (warm light/shadow sand drifts — no grey tones)
  const np = Math.floor(w * h / 4800);
  for (let i = 0; i < np; i++) {
    const x = rng()*w, y = rng()*h, r = 28 + rng()*80;
    const gp = ctx.createRadialGradient(x, y, 0, x, y, r);
    const light = rng() > 0.45;
    gp.addColorStop(0, light ? 'rgba(255,240,160,.22)' : 'rgba(160,100,10,.16)');
    gp.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gp; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI*2); ctx.fill();
  }

  // Sand flakes — warm spectrum only, no grey or dark brown
  const nf = Math.floor(w * h / 800);
  for (let i = 0; i < nf; i++) {
    const x = rng()*w, y = rng()*h;
    const r = 1.2 + rng() * 14;
    const alpha = 0.06 + rng() * 0.14;
    const light = rng() > 0.5;
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * (0.55 + rng()*0.7), rng()*Math.PI, 0, Math.PI*2);
    ctx.fillStyle = light
      ? `rgba(255,240,160,${alpha})`
      : `rgba(170,110,10,${alpha})`;
    ctx.fill();
  }

  // Vignette — warm dark amber, not cool brown
  const vig = ctx.createRadialGradient(w/2, h/2, Math.min(w,h)*.18, w/2, h/2, Math.max(w,h)*.82);
  vig.addColorStop(0, 'rgba(0,0,0,0)'); vig.addColorStop(1, 'rgba(60,30,0,.48)');
  ctx.fillStyle = vig; ctx.fillRect(0, 0, w, h);
  return c;
}

// ─── Volcanic background ─────────────────────────────────────────────────────
function genVolcanic(w, h) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  const rng = mulberry(0xBF41C910);

  // Light warm-grey base — ashen rock surface
  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0,   '#D4D0CA');
  bg.addColorStop(0.45,'#C2BEB8');
  bg.addColorStop(1,   '#AEAAA4');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);

  // Wavy lava-flow ridges — dark grey bands on the lighter surface
  const nLines = Math.floor(h / 10);
  for (let i = 0; i < nLines; i++) {
    const baseY = rng()*h, amp = 5+rng()*20, freq = 0.005+rng()*0.018, phase = rng()*Math.PI*2;
    ctx.beginPath();
    for (let x = 0; x <= w; x += 3) {
      const y = baseY + Math.sin(x*freq+phase)*amp + Math.sin(x*freq*2.1+phase*1.6)*amp*0.28;
      x===0 ? ctx.moveTo(x,y) : ctx.lineTo(x,y);
    }
    const gv = 36 + Math.floor(rng()*28); // dark grey: 36–64
    ctx.strokeStyle = `rgba(${gv},${gv},${gv+2},${0.055+rng()*0.08})`; ctx.lineWidth = 0.8+rng()*2.5; ctx.stroke();
  }

  // Rock texture patches — darker circles for depth
  const np = Math.floor(w*h/3200);
  for (let i = 0; i < np; i++) {
    const x=rng()*w, y=rng()*h, r=12+rng()*52;
    const gp=ctx.createRadialGradient(x,y,0,x,y,r);
    gp.addColorStop(0, rng()>.5 ? 'rgba(30,28,24,.26)' : 'rgba(80,76,70,.16)');
    gp.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle=gp; ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill();
  }

  // Subtle warm lava crack glows — visible on the lighter surface
  const nCracks = Math.floor(w*h/14000);
  for (let i = 0; i < nCracks; i++) {
    const x1=rng()*w, y1=rng()*h, x2=x1+(rng()-.5)*65, y2=y1+(rng()-.5)*65;
    ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2);
    ctx.strokeStyle=`rgba(200,70,5,${0.09+rng()*0.12})`; ctx.lineWidth=0.8+rng()*1.5; ctx.stroke();
  }

  // Small darker ash specs
  const nAsh = Math.floor(w*h/1800);
  for (let i = 0; i < nAsh; i++) {
    const x=rng()*w, y=rng()*h, r=0.5+rng()*2;
    ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2);
    ctx.fillStyle=`rgba(55,52,48,${0.06+rng()*0.13})`; ctx.fill();
  }

  // Lighter vignette (dark base would fight the bright lava pool)
  const vig2=ctx.createRadialGradient(w/2,h/2,Math.min(w,h)*.14,w/2,h/2,Math.max(w,h)*.82);
  vig2.addColorStop(0,'rgba(0,0,0,0)'); vig2.addColorStop(1,'rgba(0,0,0,.32)');
  ctx.fillStyle=vig2; ctx.fillRect(0,0,w,h);
  return c;
}

function DangerBurst() {
  const rays = Array.from({ length:8 }, (_, i) => {
    const a = (i / 8) * Math.PI * 2;
    return { x1:12+Math.cos(a)*6.5, y1:12+Math.sin(a)*6.5, x2:12+Math.cos(a)*11, y2:12+Math.sin(a)*11 };
  });
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" style={{ display:"inline-block", verticalAlign:"middle", flexShrink:0 }}>
      {rays.map((r, i) => <line key={i} x1={r.x1} y1={r.y1} x2={r.x2} y2={r.y2} stroke="#F4C430" strokeWidth="2.5" strokeLinecap="round"/>)}
      <circle cx="12" cy="12" r="5.5" fill="#E8524A"/>
      <rect x="11" y="7.5" width="2" height="5.5" rx="1" fill="white"/>
      <circle cx="12" cy="16.2" r="1.2" fill="white"/>
    </svg>
  );
}

// ─── Map preview canvas renderers ───────────────────────────────────────────
function drawMapPreview(ctx, type, w, h) {
  if (type === "grassland") {
    const bg = ctx.createLinearGradient(0,0,0,h);
    bg.addColorStop(0,"#3E8222"); bg.addColorStop(1,"#2E6015");
    ctx.fillStyle = bg; ctx.fillRect(0,0,w,h);
    const rng = mulberry(0xABCDEF);
    ctx.lineCap = "round";
    for (let i = 0; i < 35; i++) {
      const x=rng()*w, y=rng()*h, ht=5+rng()*10, lean=(rng()-.5)*.9;
      ctx.beginPath(); ctx.moveTo(x,y);
      ctx.quadraticCurveTo(x+Math.sin(lean)*ht*.5,y-ht*.5,x+Math.sin(lean)*ht,y-ht);
      ctx.strokeStyle=rng()>.5?"#5BAE2E":"#4A9020"; ctx.lineWidth=.9+rng()*.4; ctx.stroke();
    }
    const palettes=["#FFE066","#FF8FAB","#FFF","#FFB347"];
    for (let i = 0; i < 8; i++) {
      const x=rng()*w,y=rng()*h,r=1.5+rng()*2,np=5+Math.floor(rng()*3),col=palettes[Math.floor(rng()*4)];
      for (let p=0;p<np;p++){const a=(p/np)*Math.PI*2;ctx.beginPath();ctx.arc(x+Math.cos(a)*r*1.6,y+Math.sin(a)*r*1.6,r*.7,0,Math.PI*2);ctx.fillStyle=col;ctx.globalAlpha=.7;ctx.fill();ctx.globalAlpha=1;}
      ctx.beginPath();ctx.arc(x,y,r*.6,0,Math.PI*2);ctx.fillStyle="#FFD700";ctx.fill();
    }
  } else if (type === "desert") {
    const bg = ctx.createLinearGradient(0,0,0,h);
    bg.addColorStop(0,"#C8A050"); bg.addColorStop(.6,"#A07830"); bg.addColorStop(1,"#7A5C1E");
    ctx.fillStyle = bg; ctx.fillRect(0,0,w,h);
    const rng = mulberry(0x11223344);
    for (let i = 0; i < 18; i++) {
      const y=rng()*h;
      ctx.beginPath(); ctx.moveTo(0,y);
      ctx.bezierCurveTo(w*.3,y-3+rng()*6,w*.7,y-3+rng()*6,w,y);
      ctx.strokeStyle=`rgba(255,220,140,${rng()*.3+.05})`; ctx.lineWidth=1+rng(); ctx.stroke();
    }
    for (let i = 0; i < 40; i++) {
      ctx.beginPath(); ctx.arc(rng()*w,rng()*h,rng()*2,0,Math.PI*2);
      ctx.fillStyle=`rgba(255,240,180,${rng()*.4+.1})`; ctx.fill();
    }
    const haze = ctx.createLinearGradient(0,0,0,h*.4);
    haze.addColorStop(0,"rgba(210,160,60,.3)"); haze.addColorStop(1,"rgba(210,160,60,0)");
    ctx.fillStyle=haze; ctx.fillRect(0,0,w,h*.4);
  } else if (type === "volcanic") {
    const bg = ctx.createLinearGradient(0,0,0,h);
    bg.addColorStop(0,"#3A2A1A"); bg.addColorStop(.55,"#221510"); bg.addColorStop(1,"#120A05");
    ctx.fillStyle=bg; ctx.fillRect(0,0,w,h);
    const rng = mulberry(0xDEAD1234);
    for (let i=0;i<20;i++){
      const x=rng()*w,y=rng()*h,r=8+rng()*18;
      const gp=ctx.createRadialGradient(x,y,0,x,y,r);
      gp.addColorStop(0,rng()>.5?"rgba(80,50,20,.45)":"rgba(50,30,10,.3)");
      gp.addColorStop(1,"rgba(0,0,0,0)");
      ctx.fillStyle=gp;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();
    }
    for (let i=0;i<7;i++){
      const x1=rng()*w,y1=rng()*h,x2=x1+(rng()-.5)*50,y2=y1+(rng()-.5)*50;
      ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);
      ctx.strokeStyle=`rgba(255,${60+Math.floor(rng()*60)},0,${.25+rng()*.35})`;
      ctx.lineWidth=1+rng()*2.5;ctx.stroke();
    }
    const glow=ctx.createLinearGradient(0,h*.65,0,h);
    glow.addColorStop(0,"rgba(255,60,0,0)");glow.addColorStop(1,"rgba(255,80,0,.3)");
    ctx.fillStyle=glow;ctx.fillRect(0,h*.65,w,h*.35);
  }
  // Vignette on all
  const vig=ctx.createRadialGradient(w/2,h/2,Math.min(w,h)*.15,w/2,h/2,Math.max(w,h)*.75);
  vig.addColorStop(0,"rgba(0,0,0,0)");vig.addColorStop(1,"rgba(0,0,0,.45)");
  ctx.fillStyle=vig;ctx.fillRect(0,0,w,h);
}

// ─── Map selection card ──────────────────────────────────────────────────────
function MapSelectCard({ name, difficulty, selected, comingSoon, bullets, onSelect, previewType, borderColor, mobile }) {
  const cvRef  = useRef(null);
  const cvSize = mobile ? 90  : 130;   // CSS display width
  const cvBuf  = cvSize * 2;           // 2× pixel buffer for Retina crispness

  useEffect(() => {
    const c = cvRef.current; if (!c) return;
    // Use the real background generators for an authentic close-up preview
    let bg;
    if      (previewType === "grassland") bg = genMeadow(c.width, c.height);
    else if (previewType === "desert")    bg = genDesert(c.width, c.height);
    else                                  bg = genVolcanic(c.width, c.height);
    c.getContext("2d").drawImage(bg, 0, 0, c.width, c.height);
  }, [previewType]);

  const col = borderColor || "#3A5A78";
  return (
    <div
      onClick={onSelect}
      style={{
        display:"flex", borderRadius:14, overflow:"hidden",
        border: selected ? "3px solid rgba(255,255,255,.90)" : `3px solid ${col}`,
        // Selected: white outer glow + colour halo; unselected: subtle colour shadow
        boxShadow: selected
          ? `0 0 0 3px rgba(255,255,255,.18), 0 0 22px rgba(255,255,255,.38), 0 0 8px ${col}55`
          : `0 0 8px ${col}33`,
        background:"rgba(255,255,255,.045)",
        cursor: onSelect ? "pointer" : "default",
        // Mobile: fixed minHeight so all three cards are the same height as the tallest
        minHeight: mobile ? 155 : 120,
        transition:"border-color .18s, box-shadow .18s",
      }}>
      {/* Canvas fills full card height via alignSelf stretch; width is fixed */}
      <canvas
        ref={cvRef}
        width={cvBuf} height={cvBuf}
        style={{ flexShrink:0, display:"block", width:cvSize, alignSelf:"stretch" }}
      />
      <div style={{ flex:1, padding: mobile ? "10px 12px" : "14px 18px", display:"flex", flexDirection:"column", justifyContent:"center" }}>
        <div style={{ display:"flex", alignItems:"flex-start", marginBottom: mobile ? 6 : 9, gap:6, flexWrap:"wrap" }}>
          <span style={{ fontFamily:'"Orbitron",monospace', fontSize: mobile ? 11 : 15, fontWeight:700, color:col, letterSpacing:".05em", textTransform:"uppercase", flex:1, lineHeight:1.3 }}>
            {name} — {difficulty}
          </span>
          {comingSoon && (
            <span style={{ fontSize:10, background:"rgba(244,196,48,.10)", color:"#F4C430", padding:"2px 6px", borderRadius:4, fontFamily:"Nunito", fontWeight:700, border:"1px solid rgba(244,196,48,.30)", flexShrink:0, whiteSpace:"nowrap", marginTop:2 }}>
              SOON
            </span>
          )}
        </div>
        <div style={{ display:"flex", flexDirection:"column", gap: mobile ? 4 : 5 }}>
          {bullets.map((b, i) => (
            <div key={i} style={{ fontFamily:"Nunito", fontSize: mobile ? 12 : 14, color:"#8BAFC8", display:"flex", alignItems:"flex-start", gap:6, lineHeight:1.35 }}>
              <span style={{ color:col, flexShrink:0, marginTop:2, fontSize:9 }}>●</span>
              <span>{b}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════
export default function SnakeLife() {
  const [phase,    setPhase]    = useState("menu");
  const [score,    setScore]    = useState(0);
  const [health,   setHealth]   = useState(3);
  const [hiScore,  setHiScore]  = useState(0);
  const [tab,      setTab]      = useState("records");
  const [records,  setRecords]  = useState(MOCK);
  const [sesInfo,  setSesInfo]  = useState({ score:0, apples:0, dur:"00:00", upgrades:0, goldenApples:0 });
  const [mobile,   setMobile]   = useState(false);
  const [selectedMap, setSelectedMap] = useState("grassland");
  const [touchMode, setTouchMode] = useState("track"); // "track" | "joystick"
  const [pauseAccordion, setPauseAccordion] = useState("score"); // "score" | "upgrades" | "records" | null
  const [unlockedUpgrades, setUnlockedUpgrades] = useState(new Set()); // mirrors g.upgrades for HUD re-renders
  const [lockedUpgrades, setLockedUpgrades]   = useState(new Set()); // upgrades confirmed by Resume (not removable)
  const [regenProgress,  setRegenProgress]    = useState(0);          // 0→1 fill progress for the healing heart

  const canvasRef    = useRef(null);
  const containerRef = useRef(null);
  const bgRef        = useRef(null);
  const gRef         = useRef(null);
  const rafRef       = useRef(null);
  const loopRef      = useRef(null);

  // Load Google Fonts
  useEffect(() => {
    const l = document.createElement("link");
    l.rel  = "stylesheet";
    l.href = "https://fonts.googleapis.com/css2?family=Orbitron:wght@700;900&family=Nunito:wght@600;700;800&display=swap";
    document.head.appendChild(l);
  }, []);

  // Mobile detection
  useEffect(() => {
    const chk = () => setMobile(window.innerWidth < 768 || "ontouchstart" in window);
    chk(); window.addEventListener("resize", chk);
    return () => window.removeEventListener("resize", chk);
  }, []);

  function makeG(cx, cy) {
    return {
      trail: Array.from({ length: 10 }, (_, i) => ({ x: cx - i*2, y: cy })),
      angle:0, angVel:0, speed:SPEED, bodyLen:INIT_LEN, lastPt:{x:cx,y:cy},
      apples:[], briars:[], goldenApples:[], parts:[],
      score:0, health:3, inv:0, flash:0, dead:false,
      mouseX:cx, mouseY:cy, mOn:false,
      keys: new Set(),
      joyActive:false, joyCx:0, joyCy:0, joyX:0, joyY:0, joyFadeAlpha:0,
      touchActive:false, touchX:cx, touchY:cy,
      lastT:0, frame:0, startT:0, ate:0, goldenAte:0, nid:1, briarReloc:10+Math.random()*5, redAppleStreak:0, briarRelocCount:0,
      map:"grassland", quicksand:null, lavaPool:null, rocks:[], rockTimer:5, lavaReloc:35+Math.random()*15,
      scoreCapped:false, capTimer:0,
      upgrades: new Set(), lockedUpgrades: new Set(), regenTimer:20, maxHealth:3,
    };
  }

  const startGame = useCallback(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;

    // If ResizeObserver hasn't fired yet, initialise canvas with DPR-correct dimensions
    if (!canvas.width || canvas.width < 10) {
      const cw = containerRef.current?.clientWidth  || 600;
      const ch = containerRef.current?.clientHeight || 400;
      canvas.width  = Math.floor(cw * dpr);
      canvas.height = Math.floor(ch * dpr);
      canvas.style.width  = `${cw}px`;
      canvas.style.height = `${ch}px`;
    }

    // Game world in CSS pixels — divide physical buffer by DPR.
    // Without this, on DPR=3 iPhones the snake starts at physical-pixel coords
    // (3× off-screen) and spawns land outside the visible CSS-pixel game world.
    const W = canvas.width  / dpr;
    const H = canvas.height / dpr;

    const g = makeG(W / 2, H / 2);
    g.map = selectedMap; // "grassland" | "desert"
    g.startT = performance.now(); g.lastT = performance.now();
    gRef.current = g;
    setUnlockedUpgrades(new Set()); // clear upgrade state for new session
    setLockedUpgrades(new Set());
    setRegenProgress(0);
    // Background and initial objects based on selected map
    if (selectedMap === "desert") {
      bgRef.current = genDesert(canvas.width, canvas.height);
      spawnQuicksand(g, W, H);
      for (let i = 0; i < T_APL; i++) spawnApple(g, W, H);
      for (let i = 0; i < T_BRI; i++) spawnBriar(g, W, H);
    } else if (selectedMap === "volcanic") {
      bgRef.current = genVolcanic(canvas.width, canvas.height);
      spawnLavaPool(g, W, H);
      for (let i = 0; i < T_APL; i++) spawnApple(g, W, H);
      for (let i = 0; i < T_BRI; i++) spawnBriar(g, W, H);
      spawnFallingRocks(g, W, H); // initial rock wave
    } else {
      bgRef.current = genMeadow(canvas.width, canvas.height);
      for (let i = 0; i < T_APL; i++) spawnApple(g, W, H);
      for (let i = 0; i < T_BRI; i++) spawnBriar(g, W, H);
    }
    setScore(0); setHealth(3); setPhase("playing");
    // Safety: ensure nothing spawned too close to the snake's starting position
    const safeR2 = 150*150;
    const sc = {x: W/2, y: H/2};
    g.briars      = g.briars.filter(b => dist2(b, sc) > safeR2);
    g.apples      = g.apples.filter(a => dist2(a, sc) > safeR2);
    g.goldenApples = g.goldenApples.filter(a => dist2(a, sc) > safeR2);
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(ts => loopRef.current && loopRef.current(ts));
  }, [selectedMap]);

  const pauseGame = useCallback(() => {
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    setPauseAccordion("score"); // always open score card first when pausing
    setPhase("paused");
  }, []);

  const resumeGame = useCallback(() => {
    if (!gRef.current) return;
    // Confirm pending upgrades — lock them so they can't be removed next pause
    const locked = new Set(gRef.current.upgrades);
    gRef.current.lockedUpgrades = locked;
    setLockedUpgrades(locked);
    gRef.current.lastT = performance.now();
    setPhase("playing");
    rafRef.current = requestAnimationFrame(ts => loopRef.current && loopRef.current(ts));
  }, []);

  const quitGame = useCallback(() => {
    // Called from Pause — snapshot the session and show Game Concluded
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    const g = gRef.current;
    if (g) {
      const el = (performance.now() - g.startT) / 1000;
      const dur = `${String(Math.floor(el/60)).padStart(2,"0")}:${String(Math.floor(el%60)).padStart(2,"0")}`;
      const rec = { date:new Date().toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"}), score:g.score, dur, apples:g.ate, goldenApples:g.goldenAte };
      setHiScore(p => Math.max(p, g.score));
      setRecords(p => [rec, ...p].sort((a,b) => b.score-a.score).slice(0,20));
      setScore(g.score);
      setSesInfo({ score:g.score, apples:g.ate, dur, upgrades:g.upgrades.size, goldenApples:g.goldenAte });
    }
    setPhase("concluded");
  }, []);

  const goToMenu = useCallback(() => {
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    setPhase("menu");
  }, []);

  // Spend 1 golden-apple point to unlock an upgrade
  const unlockUpgrade = useCallback((id) => {
    const g = gRef.current; if (!g) return;
    const available = g.goldenAte - g.upgrades.size;
    if (available <= 0 || g.upgrades.has(id)) return;
    g.upgrades.add(id);
    // Immediate effects on unlock
    if (id === "toughScales") { g.maxHealth += 2; g.health = Math.min(g.health + 2, g.maxHealth); }
    if (id === "regen")       g.regenTimer = 20;
    setUnlockedUpgrades(new Set(g.upgrades)); // trigger HUD/card re-render
  }, []);

  // Remove a PENDING upgrade (not yet locked by Resume)
  const removeUpgrade = useCallback((id) => {
    const g = gRef.current; if (!g) return;
    if (g.lockedUpgrades.has(id) || !g.upgrades.has(id)) return; // locked or not owned
    g.upgrades.delete(id);
    // Reverse immediate effects
    if (id === "toughScales") {
      g.maxHealth -= 2;
      if (g.health > g.maxHealth) g.health = g.maxHealth; // cap health to new max
    }
    setUnlockedUpgrades(new Set(g.upgrades));
  }, []);

  // ── Game loop (refreshed every render so closures stay fresh) ──────────
  useEffect(() => {
    loopRef.current = (ts) => {
      const g = gRef.current; const canvas = canvasRef.current;
      if (!g || !canvas || g.dead) return;
      const dt = Math.min((ts - g.lastT) / 1000, .05); g.lastT = ts; g.frame++;
      const dpr = window.devicePixelRatio || 1;
      const W = canvas.width  / dpr;   // game world in CSS pixels
      const H = canvas.height / dpr;
      // Screen-proportional growth: smaller screens grow the snake more slowly.
      // Formula: clamp(round(min(W,H) / 85), 4, GROW_PX)
      //   Desktop  ~700px min → ~8px  (≈25% less than baseline 11)
      //   Mobile   ~390px min → ~5px  (≈50% less than baseline 11)
      const growPx = clamp(Math.round(Math.min(W, H) / 85), 4, GROW_PX);
      const ctx = canvas.getContext("2d");

      // Input
      const head = g.trail[g.trail.length-1];

      // Desert quicksand: check if snake head is inside the quicksand blob
      const inQS = g.map === "desert" && isInQuicksand(head.x, head.y, g.quicksand);

      let ta = null;
      if (touchMode === "track" && g.touchActive) {
        // Option A: direct finger tracking (like a second cursor)
        const dx = g.touchX - head.x, dy = g.touchY - head.y;
        if (dx*dx+dy*dy > 4225) ta = Math.atan2(dy, dx); // 65px dead zone
      } else if (touchMode === "joystick" && (g.joyActive || g.joyFadeAlpha > 0)) {
        // Option B: floating joystick — 10px deadzone per spec
        if (g.joyActive) {
          const jdx = g.joyX-g.joyCx, jdy = g.joyY-g.joyCy;
          if (jdx*jdx+jdy*jdy > 100) ta = Math.atan2(jdy, jdx);
        }
      } else if (g.mOn) {
        const dx = g.mouseX-head.x, dy = g.mouseY-head.y;
        if (dx*dx+dy*dy > 4225) ta = Math.atan2(dy, dx);
      }
      const kL = g.keys.has("ArrowLeft")  || g.keys.has("a") || g.keys.has("A");
      const kR = g.keys.has("ArrowRight") || g.keys.has("d") || g.keys.has("D");
      const kU = g.keys.has("ArrowUp")    || g.keys.has("w") || g.keys.has("W");
      const kD = g.keys.has("ArrowDown")  || g.keys.has("s") || g.keys.has("S");

      if (kL || kR || kU || kD) {
        // Left/right: ramp angVel at 7 rad/s², capped at ±MAX_AV
        if (kL) g.angVel = Math.max(g.angVel - 7*dt, -MAX_AV);
        if (kR) g.angVel = Math.min(g.angVel + 7*dt,  MAX_AV);
        // Up/down: spring toward ±90° heading when no L/R held
        if (kU && !kL && !kR) { const d = norm(-Math.PI/2 - g.angle); g.angVel += d*4*dt; }
        if (kD && !kL && !kR) { const d = norm( Math.PI/2 - g.angle); g.angVel += d*4*dt; }
        // Damp W/S spring so it can't over-accumulate angular velocity
        if (!kL && !kR) g.angVel *= Math.pow(0.10, dt);
        g.angVel = clamp(g.angVel, -MAX_AV, MAX_AV);
      } else if (ta !== null) {
        // Mouse/joystick: PD controller — converge angVel toward the required turn rate
        const d = norm(ta - g.angle);
        const targetAV = clamp(d * 2.4, -MAX_AV, MAX_AV);
        g.angVel += (targetAV - g.angVel) * Math.min(dt * 8, 1);
        g.angVel  = clamp(g.angVel, -MAX_AV, MAX_AV);
      } else {
        // No input — bleed angular velocity so the snake holds its heading
        g.angVel *= Math.pow(0.04, dt);
      }
      // *** Fix: multiply by dt so angVel is rad/s not rad/frame.
      //     Without this, MAX_AV applies ~170° per frame — the root cause of Z-waves.
      g.angle += g.angVel * dt;
      // Quicksand: suppresses turning. Adaptability reduces penalty by 50% (half-turn allowed).
      if (inQS) g.angVel *= g.upgrades.has("waterSnake") ? 0.5 : 0;

      // Move with wall bounce — reflect heading when the head touches a boundary
      const effectiveSpeed = inQS ? g.speed * 0.5 : g.speed;
      let nx = head.x + Math.cos(g.angle) * effectiveSpeed * dt;
      let ny = head.y + Math.sin(g.angle) * effectiveSpeed * dt;
      if      (nx < HEAD_R)     { nx = HEAD_R;     g.angle = Math.PI - g.angle; g.angVel = 0; }
      else if (nx > W - HEAD_R) { nx = W - HEAD_R; g.angle = Math.PI - g.angle; g.angVel = 0; }
      if      (ny < HEAD_R)     { ny = HEAD_R;     g.angle = -g.angle;           g.angVel = 0; }
      else if (ny > H - HEAD_R) { ny = H - HEAD_R; g.angle = -g.angle;           g.angVel = 0; }
      // Hard clamp — ensures no floating-point drift escapes the game world on any device
      nx = clamp(nx, HEAD_R, W - HEAD_R);
      ny = clamp(ny, HEAD_R, H - HEAD_R);
      // Push to trail every frame for maximum density — prevents bezier kinks at turns
      g.trail.push({x:nx, y:ny});
      g.lastPt = {x:nx, y:ny};
      const maxPts = Math.ceil(g.bodyLen / 2) + 30;
      if (g.trail.length > maxPts) g.trail.splice(0, g.trail.length - maxPts);

      // Invincibility timer
      if (g.inv > 0) { g.inv -= dt; g.flash += dt; if (g.inv <= 0) { g.inv = 0; g.flash = 0; } }

      // Collisions
      const nh = g.trail[g.trail.length-1];
      g.apples = g.apples.filter(a => {
        a.sc = Math.min(1, a.sc + dt*3.5);
        if (dist(nh, a) < HEAD_R + APPLE_R + 3) {
          const pts = A_PTS * (g.upgrades.has("peakEvolution") ? 2 : 1);
          g.score += pts; g.ate++; g.bodyLen += growPx;
          g.parts.push({ id:g.nid++, x:a.x, y:a.y-10, txt:"+"+pts, col:"#F4C430", alpha:1, vy:-58, sc:1.3, life:1.1 });
          return false;
        }
        return true;
      });

      // Golden apple collisions
      g.goldenApples = g.goldenApples.filter(a => {
        a.sc = Math.min(1, a.sc + dt*3.5);
        if (dist(nh, a) < HEAD_R + APPLE_R + 3) {
          const pts = GOLD_PTS * (g.upgrades.has("peakEvolution") ? 2 : 1);
          g.score += pts; g.ate++; g.goldenAte++; g.bodyLen += growPx;
          g.parts.push({ id:g.nid++, x:a.x, y:a.y-12, txt:"+"+pts, col:"#FFD700", alpha:1, vy:-66, sc:1.6, life:1.4 });
          return false;
        }
        return true;
      });

      g.briars.forEach(b => {
        if (g.inv <= 0 && dist(nh, b) < HEAD_R + b.r - 5) {
          // Flying Snake upgrade: 25% dodge with white star burst
          if (g.upgrades.has("flyingSnake") && Math.random() < 0.25) {
            g.inv = 0.5; g.flash = 0;
            emitDodgeStars(g, nh.x, nh.y);
            return;
          }
          g.health--; g.inv = INV_T; g.flash = 0;
          g.bodyLen = Math.max(60, g.bodyLen - 40);
          g.parts.push({ id:g.nid++, x:nh.x, y:nh.y-14, txt:"—HP", col:"#E85050", alpha:1, vy:-62, sc:1.1, life:1.0 });
        }
      });

      // Spawning: map-specific intervals; apple/golden split and bad-luck protection unchanged
      const appleInterval = g.map === "desert" ? 74 : g.map === "volcanic" ? 110 : 55;
      const briarInterval = g.map === "desert" ? 45 : 60;
      if ((g.apples.length + g.goldenApples.length) < T_APL && g.frame % appleInterval === 0) spawnApple(g, W, H);
      if (g.briars.length < T_BRI && g.frame % briarInterval === 0) spawnBriar(g, W, H);
      g.briars.forEach(b => { if (b.sc < 1) b.sc = Math.min(1, b.sc + dt * 2.5); });

      // ── Volcanic map hazards ──────────────────────────────────────────
      if (g.map === "volcanic") {
        // Lava pool: damage on contact (Adaptability halves damage; Flying Snake 25% full dodge)
        if (g.lavaPool && g.inv <= 0 && isInLavaPool(nh.x, nh.y, g.lavaPool)) {
          if (g.upgrades.has("flyingSnake") && Math.random() < 0.25) {
            g.inv = INV_T; g.flash = 0; // full INV_T so snake can cross the whole pool
            emitDodgeStars(g, nh.x, nh.y);
          } else {
            const lavaDmg = g.upgrades.has("waterSnake") ? 1 : 2; // Adaptability: 1HP instead of 2
            g.health -= lavaDmg; g.inv = INV_T; g.flash = 0;
            g.bodyLen = Math.max(60, g.bodyLen - 60);
            g.parts.push({id:g.nid++, x:nh.x, y:nh.y-16, txt:lavaDmg===1?"—HP":"—2HP", col:"#FF3030", alpha:1, vy:-66, sc:1.2, life:1.2});
          }
        }
        // Falling rocks: update timers, collide in rock phase, spawn batch every 5 s
        g.rocks = g.rocks.filter(rock => { rock.timer += dt; return rock.timer < 3 + ROCK_DURATION; });
        g.rocks.forEach(rock => {
          if (rock.timer >= 3 && g.inv <= 0 && dist(nh, rock) < HEAD_R + rock.r - 5) {
            if (g.upgrades.has("flyingSnake") && Math.random() < 0.25) {
              g.inv = 0.5; g.flash = 0;
              emitDodgeStars(g, nh.x, nh.y);
              return;
            }
            // Adaptability: rocks deal 0.5 HP (half-heart); otherwise 1 HP
            const rockDmg = g.upgrades.has("waterSnake") ? 0.5 : 1;
            g.health -= rockDmg; g.inv = INV_T; g.flash = 0;
            g.bodyLen = Math.max(60, g.bodyLen - 40);
            g.parts.push({id:g.nid++, x:nh.x, y:nh.y-14, txt:rockDmg===0.5?"—½HP":"—HP", col:"#E85050", alpha:1, vy:-62, sc:1.1, life:1.0});
          }
        });
        g.rockTimer -= dt;
        // Mobile (narrow canvas): 25% slower spawn rate so the screen isn't overwhelmed
        if (g.rockTimer <= 0) { spawnFallingRocks(g, W, H); g.rockTimer = Math.min(W,H) < 450 ? 6.67 : 5; }
        // Lava pool relocation — grace period if it respawns on the snake
        g.lavaReloc -= dt;
        if (g.lavaReloc <= 0) {
          spawnLavaPool(g, W, H);
          g.lavaReloc = 35 + Math.random()*15;
          // Despawn any briars or apples now inside the new lava pool
          g.briars = g.briars.filter(b => {
            if (isInLavaPool(b.x, b.y, g.lavaPool)) {
              g.parts.push({id:g.nid++, x:b.x, y:b.y-6, txt:"✦", col:"#FF7030", alpha:1, vy:-28, sc:0.75, life:0.55});
              return false;
            }
            return true;
          });
          g.apples = g.apples.filter(a => {
            if (isInLavaPool(a.x, a.y, g.lavaPool)) {
              g.parts.push({id:g.nid++, x:a.x, y:a.y-6, txt:"✦", col:"#FF7030", alpha:1, vy:-26, sc:0.7, life:0.50});
              return false;
            }
            return true;
          });
          g.goldenApples = g.goldenApples.filter(a => {
            if (isInLavaPool(a.x, a.y, g.lavaPool)) {
              g.parts.push({id:g.nid++, x:a.x, y:a.y-6, txt:"✦", col:"#FFB020", alpha:1, vy:-26, sc:0.7, life:0.50});
              return false;
            }
            return true;
          });
          // If new pool covers the snake, grant invincibility to escape safely
          if (g.lavaPool && isInLavaPool(nh.x, nh.y, g.lavaPool)) {
            g.inv = Math.max(g.inv, INV_T);
            g.parts.push({id:g.nid++, x:nh.x, y:nh.y-22, txt:"SAFE!", col:"#F4C430", alpha:1, vy:-42, sc:0.85, life:1.4});
          }
        }
      }

      // Three Heads upgrade: auto-collect apples within 85px
      if (g.upgrades.has("threeHeads")) {
        const MAGNET_R = 85;
        g.apples = g.apples.filter(a => {
          if (dist(nh, a) < MAGNET_R) {
            const pts = A_PTS * (g.upgrades.has("peakEvolution") ? 2 : 1);
            g.score += pts; g.ate++; g.bodyLen += growPx;
            g.parts.push({ id:g.nid++, x:a.x, y:a.y-10, txt:"+"+pts, col:"#F4C430", alpha:1, vy:-50, sc:1.1, life:0.9 });
            return false;
          }
          return true;
        });
        g.goldenApples = g.goldenApples.filter(a => {
          if (dist(nh, a) < MAGNET_R) {
            const pts = GOLD_PTS * (g.upgrades.has("peakEvolution") ? 2 : 1);
            g.score += pts; g.ate++; g.goldenAte++; g.bodyLen += growPx;
            g.parts.push({ id:g.nid++, x:a.x, y:a.y-12, txt:"+"+pts, col:"#FFD700", alpha:1, vy:-54, sc:1.3, life:1.0 });
            return false;
          }
          return true;
        });
      }

      // Regeneration upgrade: heal 1 HP every 20 s (timer is non-interruptible by damage)
      if (g.upgrades.has("regen")) {
        g.regenTimer -= dt;
        if (g.regenTimer <= 0) {
          g.regenTimer = 20;
          if (g.health < g.maxHealth) {
            g.health++;
            g.parts.push({ id:g.nid++, x:nh.x, y:nh.y-22, txt:"+HP", col:"#52E88A", alpha:1, vy:-48, sc:1.0, life:1.2 });
          }
        }
      }
      // Periodically relocate one briar (8–15 s interval)
      g.briarReloc -= dt;
      if (g.briarReloc <= 0 && g.briars.length > 0) {
        g.briarReloc = 8 + Math.random() * 7;
        g.briarRelocCount++;
        // Desert: every 10th briar relocation respawns quicksand in a new position
        if (g.map === "desert" && g.briarRelocCount % 10 === 0) {
          spawnQuicksand(g, W, H);
        }
        const rHead = g.trail[g.trail.length-1];
        const rIdx  = Math.floor(Math.random() * g.briars.length);
        const rOld  = g.briars[rIdx];
        let rx, ry, rt = 0;
        do {
          rx = 55 + Math.random()*(W-110);
          ry = 55 + Math.random()*(H-110);
          rt++;
        } while (rt < 25 && (
          dist2({x:rx,y:ry}, rHead) < 90*90 ||
          g.apples.some(a  => dist2({x:rx,y:ry}, a)  < 95*95) ||
          g.briars.some((b2,i) => i !== rIdx && dist2({x:rx,y:ry}, b2) < 70*70)
        ));
        g.briars[rIdx] = { ...rOld, x:rx, y:ry, sc:0.1 };
      }

      // Particles
      g.parts = g.parts.filter(p => {
        p.life -= dt; p.y += p.vy*dt; p.vy *= Math.pow(.3, dt);
        p.alpha = clamp(p.life/.55, 0, 1); p.sc = .8 + .5*(1-p.alpha);
        return p.life > 0;
      });

      // UI sync
      if (g.frame % 4 === 0) {
        setScore(g.score); setHealth(g.health);
        // Sync regen fill progress for the animated heart in the HUD
        if (g.upgrades.has("regen") && g.health < g.maxHealth) {
          setRegenProgress(1 - g.regenTimer / 20);
        } else {
          setRegenProgress(0);
        }
      }

      // ── Score cap: 99999 maximum — 3 s countdown then Game Concluded ────
      if (g.score >= 99999) {
        g.score = 99999;
        if (!g.scoreCapped) {
          g.scoreCapped = true; g.capTimer = 3;
          g.parts.push({ id:g.nid++, x:nh.x, y:nh.y-30, txt:"MAX!", col:"#FFD700", alpha:1, vy:-52, sc:1.5, life:2.2 });
        }
      }
      if (g.scoreCapped) {
        g.capTimer -= dt;
        if (g.capTimer <= 0) {
          g.dead = true;
          const el = (performance.now() - g.startT) / 1000;
          const dur = `${String(Math.floor(el/60)).padStart(2,"0")}:${String(Math.floor(el%60)).padStart(2,"0")}`;
          const rec = { date:new Date().toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"}), score:99999, dur, apples:g.ate, goldenApples:g.goldenAte };
          setHiScore(p => Math.max(p, 99999));
          setSesInfo({ score:99999, apples:g.ate, dur, upgrades:g.upgrades.size, goldenApples:g.goldenAte });
          setRecords(p => [rec, ...p].sort((a,b) => b.score-a.score).slice(0,20));
          setScore(99999); setPhase("concluded");
          return;
        }
      }

      // Death
      if (g.health <= 0) {
        g.dead = true;
        const el = (performance.now() - g.startT) / 1000;
        const dur = `${String(Math.floor(el/60)).padStart(2,"0")}:${String(Math.floor(el%60)).padStart(2,"0")}`;
        const rec = { date: new Date().toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"}), score:g.score, dur, apples:g.ate, goldenApples:g.goldenAte };
        setHiScore(p => Math.max(p, g.score));
        setSesInfo({ score:g.score, apples:g.ate, dur, upgrades:g.upgrades.size, goldenApples:g.goldenAte });
        setRecords(p => [rec, ...p].sort((a,b) => b.score-a.score).slice(0,20));
        setScore(g.score); setHealth(0); setPhase("gameover");
        return;
      }

      // Joystick fade-out tick
      if (touchMode === "joystick" && !g.joyActive && g.joyFadeAlpha > 0) {
        g.joyFadeAlpha = Math.max(0, g.joyFadeAlpha - dt * 3.5); // ~0.25 s fade
      }

      // ── RENDER (DPR-scaled) ──────────────────────────────────────────────
      // 1. Reset transform and clear the physical buffer
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      // 2. Blit background at physical resolution (no scale needed — it was generated at DPR size)
      if (bgRef.current) ctx.drawImage(bgRef.current, 0, 0, canvas.width, canvas.height);
      // 3. Apply DPR scale so all game drawing uses CSS pixel coordinates
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // Map-specific ground overlays rendered beneath all game objects
      if (g.map === "desert"   && g.quicksand) drawQuicksand(ctx, g.quicksand, ts/1000);
      if (g.map === "volcanic") {
        if (g.lavaPool) drawLavaPool(ctx, g.lavaPool, ts/1000);
        drawFallingRocks(ctx, g.rocks, ts/1000);
      }
      drawBriars(ctx, g.briars, ts/1000, g.map);
      drawApples(ctx, g.goldenApples, ts/1000, true,  g.map);
      drawApples(ctx, g.apples,       ts/1000, false, g.map);
      drawSnake(ctx, g);
      drawParticles(ctx, g.parts);
      if (touchMode === "joystick") drawJoy(ctx, g);
      else                          drawTouchReticle(ctx, g);
      // 4. Reset transform for next frame
      ctx.setTransform(1, 0, 0, 1, 0, 0);

      rafRef.current = requestAnimationFrame(ts2 => loopRef.current && loopRef.current(ts2));
    };
  });

  // Canvas resize observer — DPR-aware
  useEffect(() => {
    const c = containerRef.current; if (!c) return;
    const obs = new ResizeObserver(([e]) => {
      const { width: cssW, height: cssH } = e.contentRect;
      if (cssW < 10 || cssH < 10) return;
      const dpr = window.devicePixelRatio || 1;
      const canvas = canvasRef.current;
      if (canvas) {
        // Physical buffer = CSS size × DPR for crisp Retina rendering
        canvas.width  = Math.floor(cssW * dpr);
        canvas.height = Math.floor(cssH * dpr);
        // Keep CSS layout size unchanged so the element doesn't grow
        canvas.style.width  = `${Math.floor(cssW)}px`;
        canvas.style.height = `${Math.floor(cssH)}px`;
        // Generate background at physical resolution for maximum sharpness
        bgRef.current = genMeadow(Math.floor(cssW * dpr), Math.floor(cssH * dpr));
      }
    });
    obs.observe(c); return () => obs.disconnect();
  }, []);

  // Keyboard
  useEffect(() => {
    const MAPS = ["grassland", "desert", "volcanic"];
    const dn = e => {
      if (["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"," "].includes(e.key)) e.preventDefault();

      // Map select keyboard navigation
      if (phase === "mapselect") {
        const idx = MAPS.indexOf(selectedMap);
        const prev = ["ArrowUp","ArrowLeft","w","W","a","A"].includes(e.key);
        const next = ["ArrowDown","ArrowRight","s","S","d","D"].includes(e.key);
        if (prev) setSelectedMap(MAPS[(idx + MAPS.length - 1) % MAPS.length]);
        if (next) setSelectedMap(MAPS[(idx + 1) % MAPS.length]);
        return;
      }

      gRef.current?.keys.add(e.key);
      if (e.key === "Escape" || e.key === "p" || e.key === "P") {
        if (phase === "playing") pauseGame();
        else if (phase === "paused") resumeGame();
      }
    };
    const up = e => gRef.current?.keys.delete(e.key);
    window.addEventListener("keydown", dn); window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", dn); window.removeEventListener("keyup", up); };
  }, [phase, pauseGame, resumeGame, selectedMap]);

  useEffect(() => () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); }, []);

  // Mouse — coordinates in CSS pixels (game world = CSS pixel space)
  const onMM = useCallback(e => {
    const c = canvasRef.current; if (!c) return;
    const r = c.getBoundingClientRect();
    if (gRef.current) {
      gRef.current.mouseX = e.clientX - r.left;
      gRef.current.mouseY = e.clientY - r.top;
      gRef.current.mOn = true;
    }
  }, []);
  const onML = useCallback(() => { if (gRef.current) gRef.current.mOn = false; }, []);

  // Touch — mode-aware; coordinates are always CSS pixels (game world space)
  const onTS = useCallback(e => {
    e.preventDefault();
    const c = canvasRef.current; if (!c || !gRef.current) return;
    const r = c.getBoundingClientRect(), t = e.touches[0];
    const x = t.clientX - r.left, y = t.clientY - r.top;
    const g = gRef.current;
    if (touchMode === "track") {
      g.touchActive = true; g.touchX = x; g.touchY = y;
    } else {
      g.joyActive = true; g.joyFadeAlpha = 1;
      g.joyCx = x; g.joyCy = y; g.joyX = x; g.joyY = y;
    }
  }, [touchMode]);

  const onTM = useCallback(e => {
    e.preventDefault();
    const c = canvasRef.current; if (!c || !gRef.current) return;
    const r = c.getBoundingClientRect(), t = e.touches[0];
    const x = t.clientX - r.left, y = t.clientY - r.top;
    const g = gRef.current;
    if (touchMode === "track") {
      g.touchX = x; g.touchY = y;
    } else {
      g.joyX = x; g.joyY = y;
    }
  }, [touchMode]);

  const onTE = useCallback(e => {
    e.preventDefault();
    const g = gRef.current; if (!g) return;
    if (touchMode === "track") {
      g.touchActive = false;
    } else {
      g.joyActive = false;
      g.joyFadeAlpha = 0.85; // trigger smooth fade-out
    }
  }, [touchMode]);

  // ── Shared button styles ─────────────────────────────────────────────────
  const btnPri = { background:"linear-gradient(135deg,#2ECC71,#27AE60)", border:"none", borderRadius:12, padding:"14px 0", fontFamily:'"Orbitron",monospace', fontWeight:700, fontSize:15, color:"#fff", letterSpacing:".09em", cursor:"pointer", boxShadow:"0 0 24px rgba(46,204,113,.38)", width:"240px", textAlign:"center" };
  const btnSec = { background:"rgba(255,255,255,.04)", border:"1.5px solid #4A6880", borderRadius:12, padding:"14px 0", fontFamily:"Nunito", fontWeight:700, fontSize:15, color:"#B0C4D8", cursor:"pointer", width:"240px", textAlign:"center" };

  // ── RENDER ───────────────────────────────────────────────────────────────
  return (
    <div className="sl-root" style={{ width:"100%", background:"#0A1628", display:"flex", flexDirection:"column", overflow:"hidden", position:"relative", color:"#E8EFF8", fontFamily:"Nunito,sans-serif" }}>
      <style>{`
        @keyframes slBadgePulse {
          0%,100%{box-shadow:0 0 0 0 rgba(244,196,48,0);transform:scale(1);}
          50%{box-shadow:0 0 9px 3px rgba(244,196,48,.46);transform:scale(1.09);}
        }
        .sl-pulse{animation:slBadgePulse 2s ease-in-out infinite;}
        .sl-btn-pri,.sl-btn-sec{transition:transform .11s ease,filter .11s ease,box-shadow .18s ease;}
        .sl-btn-pri:active{transform:scale(.955);filter:brightness(.88);}
        .sl-btn-sec:active{transform:scale(.955);filter:brightness(.80);}
        /* Dynamic viewport height — shrinks when mobile browser bar appears */
        .sl-root{height:100vh;height:100dvh;}
        /* Safe-area bottom padding for overlays — prevents browser bar overlap */
        .sl-safe{padding-bottom:max(env(safe-area-inset-bottom,0px) + 80px, 80px);}
      `}</style>

      {/* ═══ TOP HUD ═══ */}
      <header style={{
        background:"linear-gradient(180deg,#0E1E38,rgba(10,22,40,.96))",
        borderBottom:"1px solid #1A2E50",
        flexShrink:0, zIndex:10,
        position:"relative",    // needed for absolute heart overlay on desktop
        ...(mobile
          ? { display:"flex", flexDirection:"column", padding:"8px 14px 14px", gap:0 }
          : { height:62, display:"flex", alignItems:"center", padding:"0 18px", gap:14 })
      }}>

        {mobile ? (
          /* ── MOBILE: two-row layout (unchanged) ── */
          <>
            {/* Row 1: logo · score · pause */}
            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
              <div style={{ fontFamily:'"Orbitron",monospace', fontWeight:900, fontSize:16, letterSpacing:".12em", color:"#2ECC71", textShadow:"0 0 18px rgba(46,204,113,.65)", whiteSpace:"nowrap" }}>
                SNAKE<span style={{ color:"#52E88A" }}>LIFE</span>
              </div>
              <div style={{ flex:1 }}/>
              <div style={{ background:"rgba(255,255,255,.05)", border:"1px solid #253A52", borderRadius:9, padding:"5px 0", display:"flex", flexDirection:"column", alignItems:"center", width:104, flexShrink:0, boxSizing:"border-box" }}>
                <span style={{ fontSize:11, color:"#7A9AB8", fontWeight:700, letterSpacing:".08em", textTransform:"uppercase" }}>SCORE</span>
                <span style={{ fontFamily:'"Orbitron",monospace', fontSize:16, fontWeight:700, color:"#F4C430", letterSpacing:".04em", lineHeight:1.2 }}>{String(score).padStart(5,"0")}</span>
              </div>
              {phase === "playing" && (() => {
                const hasUnspent = (gRef.current?.goldenAte ?? 0) > unlockedUpgrades.size && unlockedUpgrades.size < UPGRADES_DATA.length;
                return (
                  <button onClick={pauseGame} style={{
                    background: hasUnspent?"rgba(244,196,48,.18)":"rgba(255,255,255,.07)", border:`1px solid ${hasUnspent?"rgba(244,196,48,.70)":"#253A52"}`,
                    borderRadius:9, padding:"8px 12px", color:hasUnspent?"#F4C430":"#B0C4D8",
                    cursor:"pointer", fontFamily:"Nunito", fontWeight:700, fontSize:14,
                    display:"flex", alignItems:"center", gap:6, whiteSpace:"nowrap",
                    boxShadow:hasUnspent?"0 0 14px rgba(244,196,48,.42)":"none", transition:"all .3s",
                  }}>
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><rect x="1" y="1" width="4" height="12" rx="1"/><rect x="9" y="1" width="4" height="12" rx="1"/></svg>
                    PAUSE
                  </button>
                );
              })()}
            </div>
            {/* Divider — full-width rule separating logo/score/pause from hearts */}
            <div style={{ height:1, background:"#253A52", margin:"8px -14px" }}/>
            {/* Row 2: hearts centered */}
            <div style={{ display:"flex", justifyContent:"center", alignItems:"center", gap:3, paddingTop:6, paddingBottom:2 }}>
              {(() => {
                const maxHp=3+(unlockedUpgrades.has("toughScales")?2:0), fracPart=health%1, floorHp=Math.floor(health), hasFrac=fracPart>0;
                const regenOn=unlockedUpgrades.has("regen")&&health<maxHp&&regenProgress>0, regenIdx=hasFrac?Math.ceil(health):floorHp;
                return Array.from({length:maxHp},(_,i)=>{
                  if(hasFrac&&i===floorHp&&!regenOn) return <HeartFilling key={i} progress={fracPart} index={`f${i}`}/>;
                  if(regenOn&&i===regenIdx) return <HeartFilling key={i} progress={regenProgress} index={i}/>;
                  return <Heart key={i} filled={i<floorHp}/>;
                });
              })()}
            </div>
          </>
        ) : (
          /* ── DESKTOP: logo left · hearts centred · score+pause right ── */
          <>
            {/* Logo — far left */}
            <div style={{ fontFamily:'"Orbitron",monospace', fontWeight:900, fontSize:18, letterSpacing:".12em", color:"#2ECC71", textShadow:"0 0 18px rgba(46,204,113,.65)", whiteSpace:"nowrap" }}>
              SNAKE<span style={{ color:"#52E88A" }}>LIFE</span>
            </div>

            {/* Spacer pushes score+pause to the right */}
            <div style={{ flex:1 }}/>

            {/* Score */}
            <div style={{ background:"rgba(255,255,255,.05)", border:"1px solid #253A52", borderRadius:9, padding:"6px 0", display:"flex", flexDirection:"column", alignItems:"center", width:116, flexShrink:0, boxSizing:"border-box" }}>
              <span style={{ fontSize:12, color:"#7A9AB8", fontWeight:700, letterSpacing:".08em", textTransform:"uppercase" }}>SCORE</span>
              <span style={{ fontFamily:'"Orbitron",monospace', fontSize:16, fontWeight:700, color:"#F4C430", letterSpacing:".04em", lineHeight:1.2 }}>{String(score).padStart(5,"0")}</span>
            </div>

            {/* Pause button */}
            {phase === "playing" && (() => {
              const hasUnspent = (gRef.current?.goldenAte ?? 0) > unlockedUpgrades.size && unlockedUpgrades.size < UPGRADES_DATA.length;
              return (
                <button onClick={pauseGame} style={{
                  background: hasUnspent?"rgba(244,196,48,.18)":"rgba(255,255,255,.07)", border:`1px solid ${hasUnspent?"rgba(244,196,48,.70)":"#253A52"}`,
                  borderRadius:9, padding:"8px 14px", color:hasUnspent?"#F4C430":"#B0C4D8",
                  cursor:"pointer", fontFamily:"Nunito", fontWeight:700, fontSize:14,
                  display:"flex", alignItems:"center", gap:6, whiteSpace:"nowrap",
                  boxShadow:hasUnspent?"0 0 14px rgba(244,196,48,.42), inset 0 0 8px rgba(244,196,48,.08)":"none", transition:"all .3s",
                }}>
                  <svg width="13" height="13" viewBox="0 0 14 14" fill="currentColor"><rect x="1" y="1" width="4" height="12" rx="1"/><rect x="9" y="1" width="4" height="12" rx="1"/></svg>
                  PAUSE
                </button>
              );
            })()}

            {/* Hearts — absolutely centred over the header so position is independent of logo/score widths */}
            <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center", pointerEvents:"none", gap:4 }}>
              {(() => {
                const maxHp=3+(unlockedUpgrades.has("toughScales")?2:0), fracPart=health%1, floorHp=Math.floor(health), hasFrac=fracPart>0;
                const regenOn=unlockedUpgrades.has("regen")&&health<maxHp&&regenProgress>0, regenIdx=hasFrac?Math.ceil(health):floorHp;
                return Array.from({length:maxHp},(_,i)=>{
                  if(hasFrac&&i===floorHp&&!regenOn) return <HeartFilling key={i} progress={fracPart} index={`f${i}`}/>;
                  if(regenOn&&i===regenIdx) return <HeartFilling key={i} progress={regenProgress} index={i}/>;
                  return <Heart key={i} filled={i<floorHp}/>;
                });
              })()}
            </div>
          </>
        )}

      </header>

      {/* ═══ MAIN BODY ═══ */}
      <div style={{ flex:1, display:"flex", overflow:"hidden", minHeight:0 }}>

        {/* Canvas container — full width; sidebar moved to Pause screen accordions */}
        <div ref={containerRef} style={{ flex:1, position:"relative", overflow:"hidden", background:"#0A1628" }}>
          <canvas
            ref={canvasRef}
            style={{ display:"block", position:"absolute", top:0, left:0, width:"100%", height:"100%", touchAction:"none" }}
            onMouseMove={onMM} onMouseLeave={onML}
            onTouchStart={onTS} onTouchMove={onTM} onTouchEnd={onTE}
          />
        </div>
      </div>

      {/* ═══ MENU OVERLAY ═══ */}
      {phase === "menu" && (
        <div style={{ position:"absolute", inset:0, zIndex:50, background:"rgba(6,12,26,.92)", backdropFilter:"blur(8px)", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:22, overflowY:"auto", padding:"24px 20px", paddingBottom: mobile ? "max(env(safe-area-inset-bottom, 0px) + 80px, 80px)" : "24px" }}>
          <div style={{ textAlign:"center", lineHeight:1 }}>
            <div style={{ fontFamily:'"Orbitron",monospace', fontWeight:900, fontSize:mobile?42:64, letterSpacing:".10em", color:"#2ECC71", textShadow:"0 0 40px rgba(46,204,113,.7)" }}>SNAKE</div>
            <div style={{ fontFamily:'"Orbitron",monospace', fontWeight:900, fontSize:mobile?42:64, letterSpacing:".16em", color:"#52E88A", textShadow:"0 0 40px rgba(82,232,138,.8)" }}>LIFE</div>
          </div>
          <div style={{ fontFamily:"Nunito", fontSize:14, color:"#7A9AB8", letterSpacing:".05em", textAlign:"center", maxWidth:360, textTransform:"uppercase", lineHeight:1.5 }}>
            SURVIVE, EAT AND EVOLVE AS AN ORDINARY SNAKE IN EXTREME ENVIRONMENTS!
          </div>
          <button onClick={() => setPhase("mapselect")} className="sl-btn-pri" style={btnPri}>START GAME</button>
          <div style={{ background:"rgba(255,255,255,.04)", border:"1px solid #253A52", borderRadius:12, padding:"18px 24px", maxWidth:440, width:"100%" }}>
            <div style={{ fontFamily:'"Orbitron",monospace', fontSize:13, fontWeight:700, color:"#E8EFF8", letterSpacing:".08em", textTransform:"uppercase", textAlign:"center", marginBottom:12 }}>Game Guide</div>
            <div style={{ height:2, background:"linear-gradient(90deg,transparent,#3A5A78,transparent)", marginBottom:14, borderRadius:1 }}/>
            <div style={{ display:"flex", flexDirection:"column" }}>
              {(mobile ? [
                { id:"touch",    label:<>👆&nbsp;Touchscreen</>, desc:"Tap the screen and steer the snake with a virtual joystick." },
                { id:"apples",   label:<>🍎&nbsp;Apples</>,      desc:"Gather red and golden apples to gain points and evolve." },
                { id:"danger",   label:<><DangerBurst/>&nbsp;Dangers</>,  desc:"Avoid dangerous objects such as briars to stay alive!" },
                { id:"upgrades", label:<>🌟&nbsp;Upgrades</>,    desc:"After collecting a Golden Apple, press PAUSE to access Snake Upgrades where you can improve your snake!" },
              ] : [
                { id:"mouse",    label:<>🖱️&nbsp;Mouse</>,       desc:"Steer the snake's direction with a mouse cursor." },
                { id:"wasd",     label:<>⌨️&nbsp;WASD</>,        desc:"You can also use WASD or arrow keys to turn." },
                { id:"apples",   label:<>🍎&nbsp;Apples</>,      desc:"Gather red and golden apples to gain points and evolve." },
                { id:"danger",   label:<><DangerBurst/>&nbsp;Dangers</>,  desc:"Avoid dangerous objects such as briars to stay alive!" },
                { id:"upgrades", label:<>🌟&nbsp;Upgrades</>,    desc:"After collecting a Golden Apple, press PAUSE to access Snake Upgrades where you can improve your snake!" },
              ]).map(({ id, label, desc }, i, arr) => (
                <div key={id}>
                  <div style={{ display:"flex", alignItems:"flex-start", gap:16, padding:"11px 0" }}>
                    <div style={{ fontFamily:"Nunito", fontSize:14, fontWeight:700, color:"#2ECC71", minWidth:114, flexShrink:0, display:"flex", alignItems:"center", gap:4 }}>{label}</div>
                    <div style={{ fontFamily:"Nunito", fontSize:13, color:"#8BAFC8", lineHeight:1.55 }}>{desc}</div>
                  </div>
                  {i < arr.length - 1 && <div style={{ height:1, background:"rgba(255,255,255,.07)", borderRadius:1 }}/>}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ═══ MAP SELECT OVERLAY ═══ */}
      {phase === "mapselect" && (
        <div style={{ position:"absolute", inset:0, zIndex:50, background:"rgba(6,12,26,.95)", backdropFilter:"blur(10px)", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:22, padding:`${mobile?"20px":"28px"} 20px`, paddingBottom: mobile ? "max(env(safe-area-inset-bottom, 0px) + 80px, 80px)" : "28px", overflowY:"auto" }}>
          <div style={{ fontFamily:'"Orbitron",monospace', fontWeight:900, fontSize:mobile?30:44, letterSpacing:".12em", color:"#E8EFF8", textShadow:"0 0 30px rgba(232,239,248,.15)" }}>
            SELECT MAP
          </div>
          <div style={{ display:"flex", flexDirection:"column", gap:14, width:"100%", maxWidth:620 }}>
            <MapSelectCard
              name="Grassland Meadows"
              difficulty="Easy"
              selected={selectedMap === "grassland"}
              borderColor="#2ECC71"
              previewType="grassland"
              mobile={mobile}
              onSelect={() => setSelectedMap("grassland")}
              bullets={[
                "Classic grassland for a relaxing gameplay.",
                "Lots of apples will spawn.",
                "Avoid dangerous briars to preserve health.",
              ]}
            />
            <MapSelectCard
              name="Desert Dunes"
              difficulty="Medium"
              selected={selectedMap === "desert"}
              borderColor="#F4C430"
              previewType="desert"
              mobile={mobile}
              onSelect={() => setSelectedMap("desert")}
              bullets={[
                "Dry and desolate desert environment.",
                "Snake moves slower, especially on quicksand!",
                "Apples are more rare, dangers are more common.",
              ]}
            />
            <MapSelectCard
              name="Volcanic Isle"
              difficulty="Hard"
              selected={selectedMap === "volcanic"}
              borderColor="#E45F32"
              previewType="volcanic"
              mobile={mobile}
              onSelect={() => setSelectedMap("volcanic")}
              bullets={[
                "Fight for survival in a dangerous terrain!",
                "Dodge falling rocks and avoid lava pools!",
                "Apples are rare, but golden ones are more common.",
              ]}
            />
          </div>
          <div style={{ display:"flex", flexDirection:"column", gap:10, alignItems:"center" }}>
            <button
              className="sl-btn-pri"
              onClick={startGame}
              style={btnPri}>
              PLAY NOW!
            </button>
            <button onClick={() => setPhase("menu")} className="sl-btn-sec" style={btnSec}>BACK</button>
          </div>
        </div>
      )}

      {/* ═══ PAUSE OVERLAY ═══ */}
      {phase === "paused" && (
        <div style={{ position:"absolute", inset:0, zIndex:50, background:"rgba(6,12,26,.84)", backdropFilter:"blur(7px)", overflowY:"auto" }}>
          <div style={{ minHeight:"100%", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:12, padding:"32px 20px", paddingBottom: mobile ? "max(env(safe-area-inset-bottom, 0px) + 88px, 88px)" : "40px" }}>

            <div style={{ fontFamily:'"Orbitron",monospace', fontWeight:900, fontSize:mobile?32:48, letterSpacing:".14em", color:"#E8EFF8", marginBottom:2 }}>PAUSED</div>

            {/* 1 — Current Score accordion (open by default) */}
            <div style={{ width:"100%", maxWidth:520 }}>
              <AccordionPanel
                title="Current Score"
                open={pauseAccordion === "score"}
                onToggle={() => setPauseAccordion(p => p === "score" ? null : "score")}
              >
                <div style={{ textAlign:"center", padding:"6px 0" }}>
                  <div style={{ fontFamily:'"Orbitron",monospace', fontWeight:900, fontSize:mobile?32:48, color:"#F4C430", letterSpacing:".05em" }}>
                    {score.toLocaleString()}
                  </div>
                  <div style={{ height:1, background:"#253A52", margin:"12px 0 10px" }}/>
                  <div style={{ display:"flex", gap:16, justifyContent:"center" }}>
                    <div style={{ textAlign:"center" }}>
                      <div style={{ fontFamily:"Nunito", fontSize:12, color:"#7A9AB8", fontWeight:700, textTransform:"uppercase", letterSpacing:".06em" }}>Apples</div>
                      <div style={{ fontFamily:'"Orbitron",monospace', fontSize:17, color:"#E8EFF8", fontWeight:700, marginTop:2 }}>{gRef.current?.ate ?? 0}</div>
                    </div>
                    <div style={{ width:1, background:"#253A52" }}/>
                    <div style={{ textAlign:"center" }}>
                      <div style={{ fontFamily:"Nunito", fontSize:12, color:"#7A9AB8", fontWeight:700, textTransform:"uppercase", letterSpacing:".06em" }}>🌟 Golden</div>
                      <div style={{ fontFamily:'"Orbitron",monospace', fontSize:17, color:"#F4C430", fontWeight:700, marginTop:2 }}>{gRef.current?.goldenAte ?? 0}</div>
                    </div>
                    <div style={{ width:1, background:"#253A52" }}/>
                    <div style={{ textAlign:"center" }}>
                      <div style={{ fontFamily:"Nunito", fontSize:12, color:"#7A9AB8", fontWeight:700, textTransform:"uppercase", letterSpacing:".06em" }}>All-Time Best</div>
                      <div style={{ fontFamily:'"Orbitron",monospace', fontSize:17, color:"#8BAFC8", fontWeight:700, marginTop:2 }}>{hiScore.toLocaleString()}</div>
                    </div>
                  </div>
                </div>
              </AccordionPanel>
            </div>

            {/* 2 — Snake Upgrades accordion with golden apple counter badge */}
            <div style={{ width:"100%", maxWidth:520 }}>
              <AccordionPanel
                title="Snake Upgrades"
                open={pauseAccordion === "upgrades"}
                onToggle={() => setPauseAccordion(p => p === "upgrades" ? null : "upgrades")}
                badge={(() => {
                  const allDone = unlockedUpgrades.size >= UPGRADES_DATA.length;
                  if (allDone) {
                    return (
                      <span style={{ display:"inline-flex", alignItems:"center", background:"rgba(46,204,113,.15)", border:"1px solid rgba(46,204,113,.45)", color:"#2ECC71", padding:"2px 10px", borderRadius:6, fontSize:12, fontFamily:'"Orbitron",monospace', fontWeight:700, lineHeight:1, letterSpacing:".06em" }}>
                        DONE
                      </span>
                    );
                  }
                  const avail = Math.max(0, (gRef.current?.goldenAte ?? 0) - unlockedUpgrades.size);
                  return (
                    <span
                      className={avail > 0 ? "sl-pulse" : undefined}
                      style={{ display:"inline-flex", alignItems:"center", gap:5, background:"rgba(255,210,0,.12)", border:"1px solid rgba(255,210,0,.32)", color:"#F4C430", padding:"2px 9px", borderRadius:6, fontSize:13, fontFamily:'"Orbitron",monospace', fontWeight:700, lineHeight:1 }}>
                      🌟&nbsp;{avail}
                    </span>
                  );
                })()}
              >
                <div style={{ display:"grid", gridTemplateColumns: mobile ? "1fr" : "1fr 1fr", gap:10 }}>
                  {UPGRADES_DATA.map(u => {
                    const goldenEarned = gRef.current?.goldenAte ?? 0;
                    const available    = goldenEarned - unlockedUpgrades.size;
                    const isLocked     = lockedUpgrades.has(u.id);
                    const isPending    = unlockedUpgrades.has(u.id) && !isLocked;
                    return (
                      <PauseUpgradeCard
                        key={u.id}
                        id={u.id}
                        icon={u.icon}
                        name={u.name}
                        desc={u.desc}
                        locked={isLocked}
                        pending={isPending}
                        unlocked={unlockedUpgrades.has(u.id)}
                        canAfford={available > 0 && !unlockedUpgrades.has(u.id)}
                        onUnlock={unlockUpgrade}
                        onRemove={removeUpgrade}
                      />
                    );
                  })}
                </div>
              </AccordionPanel>
            </div>

            {/* 3 — Records accordion with golden apple column */}
            <div style={{ width:"100%", maxWidth:520 }}>
              <AccordionPanel
                title="Records"
                open={pauseAccordion === "records"}
                onToggle={() => setPauseAccordion(p => p === "records" ? null : "records")}
              >
                <table style={{ width:"100%", borderCollapse:"separate", borderSpacing:"0 5px" }}>
                  <thead>
                    <tr>{["Date","Score","Time","🌟","🍎"].map(h => (
                      <th key={h} style={{ fontFamily:"Nunito", fontSize:12, color:"#7A9AB8", padding:"4px 6px", textAlign:"left", textTransform:"uppercase", letterSpacing:".06em", fontWeight:700 }}>{h}</th>
                    ))}</tr>
                  </thead>
                  <tbody>
                    {records.slice(0, 5).map((r, i) => (
                      <tr key={i} style={{ background:i===0?"rgba(46,204,113,.07)":"rgba(255,255,255,.03)" }}>
                        <td style={{ fontFamily:"Nunito", fontSize:12, color:"#8BAFC8", padding:"6px 6px", borderRadius:"6px 0 0 6px" }}>{r.date}</td>
                        <td style={{ fontFamily:'"Orbitron",monospace', fontSize:13, color:i===0?"#F4C430":"#D4E4F0", padding:"6px 6px", fontWeight:700 }}>{r.score.toLocaleString()}</td>
                        <td style={{ fontFamily:"Nunito", fontSize:12, color:"#8BAFC8", padding:"6px 6px" }}>{r.dur}</td>
                        <td style={{ fontFamily:'"Orbitron",monospace', fontSize:13, color:"#F4C430", padding:"6px 6px", fontWeight:700 }}>{r.goldenApples ?? 0}</td>
                        <td style={{ fontFamily:'"Orbitron",monospace', fontSize:13, color:"#E8EFF8", padding:"6px 6px", borderRadius:"0 6px 6px 0", fontWeight:700 }}>{r.apples}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </AccordionPanel>
            </div>

            {/* Action buttons */}
            <div style={{ display:"flex", flexDirection:"column", gap:10, alignItems:"center", paddingTop:6 }}>
              <button onClick={resumeGame} className="sl-btn-pri" style={btnPri}>RESUME</button>
              <button onClick={quitGame}   className="sl-btn-sec" style={btnSec}>QUIT TO MENU</button>
            </div>

          </div>
        </div>
      )}

      {/* ═══ GAME OVER OVERLAY ═══ */}
      {phase === "gameover" && (
        <div style={{ position:"absolute", inset:0, zIndex:50, background:"rgba(6,12,26,.92)", backdropFilter:"blur(8px)", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:20, overflowY:"auto", padding:"20px", paddingBottom: mobile ? "max(env(safe-area-inset-bottom, 0px) + 80px, 80px)" : "20px" }}>
          <div style={{ fontFamily:'"Orbitron",monospace', fontWeight:900, fontSize:mobile?32:48, letterSpacing:".10em", color:"#E8524A", textShadow:"0 0 30px rgba(232,82,74,.5)" }}>
            GAME OVER
          </div>
          <div style={{ background:"rgba(255,255,255,.05)", border:"1px solid #253A52", borderRadius:14, padding:"20px 38px", textAlign:"center" }}>
            <div style={{ fontFamily:"Nunito", fontSize:13, color:"#7A9AB8", letterSpacing:".08em", marginBottom:6, fontWeight:700, textTransform:"uppercase" }}>Final Score</div>
            <div style={{ fontFamily:'"Orbitron",monospace', fontWeight:900, fontSize:mobile?38:54, color:"#F4C430", letterSpacing:".05em" }}>
              {sesInfo.score.toLocaleString()}
            </div>
            {sesInfo.score > 0 && sesInfo.score >= hiScore && (
              <div style={{ fontFamily:"Nunito", fontSize:14, color:"#2ECC71", fontWeight:700, marginTop:4, letterSpacing:".06em" }}>
                🏆 NEW HIGH SCORE!
              </div>
            )}
            <div style={{ height:1, background:"#253A52", margin:"14px 0 12px" }}/>
            <div style={{ display:"flex", gap:16, justifyContent:"center" }}>
              <div style={{ textAlign:"center" }}>
                <div style={{ fontFamily:"Nunito", fontSize:13, color:"#7A9AB8", fontWeight:700, textTransform:"uppercase", letterSpacing:".06em" }}>Apples</div>
                <div style={{ fontFamily:'"Orbitron",monospace', fontSize:18, color:"#E8EFF8", fontWeight:700, marginTop:2 }}>{sesInfo.apples}</div>
              </div>
              <div style={{ width:1, background:"#253A52" }}/>
              <div style={{ textAlign:"center" }}>
                <div style={{ fontFamily:"Nunito", fontSize:13, color:"#7A9AB8", fontWeight:700, textTransform:"uppercase", letterSpacing:".06em" }}>Upgrades</div>
                <div style={{ fontFamily:'"Orbitron",monospace', fontSize:18, color:"#E8EFF8", fontWeight:700, marginTop:2 }}>{sesInfo.upgrades}</div>
              </div>
              <div style={{ width:1, background:"#253A52" }}/>
              <div style={{ textAlign:"center" }}>
                <div style={{ fontFamily:"Nunito", fontSize:13, color:"#7A9AB8", fontWeight:700, textTransform:"uppercase", letterSpacing:".06em" }}>All-Time Best</div>
                <div style={{ fontFamily:'"Orbitron",monospace', fontSize:18, color:"#8BAFC8", fontWeight:700, marginTop:2 }}>{hiScore.toLocaleString()}</div>
              </div>
            </div>
          </div>
          <div style={{ display:"flex", flexDirection:"column", gap:10, alignItems:"center" }}>
            <button onClick={startGame} className="sl-btn-pri" style={btnPri}>PLAY AGAIN</button>
            <button onClick={goToMenu}  className="sl-btn-sec" style={btnSec}>MAIN MENU</button>
          </div>
        </div>
      )}

      {/* ═══ GAME CONCLUDED OVERLAY ═══ */}
      {phase === "concluded" && (
        <div style={{ position:"absolute", inset:0, zIndex:50, background:"rgba(6,12,26,.92)", backdropFilter:"blur(8px)", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:20, overflowY:"auto", padding:"20px", paddingBottom: mobile ? "max(env(safe-area-inset-bottom, 0px) + 80px, 80px)" : "20px" }}>
          <div style={{ fontFamily:'"Orbitron",monospace', fontWeight:900, fontSize:mobile?26:40, letterSpacing:".10em", color:"#8BAFC8", textShadow:"0 0 24px rgba(139,175,200,.35)", textAlign:"center" }}>
            GAME CONCLUDED
          </div>
          <div style={{ background:"rgba(255,255,255,.05)", border:"1px solid #253A52", borderRadius:14, padding:"20px 36px", textAlign:"center" }}>
            <div style={{ fontFamily:"Nunito", fontSize:13, color:"#7A9AB8", letterSpacing:".08em", marginBottom:6, fontWeight:700, textTransform:"uppercase" }}>Session Score</div>
            <div style={{ fontFamily:'"Orbitron",monospace', fontWeight:900, fontSize:mobile?36:52, color:"#F4C430", letterSpacing:".05em" }}>
              {sesInfo.score.toLocaleString()}
            </div>
            <div style={{ height:1, background:"#253A52", margin:"14px 0 12px" }}/>
            <div style={{ display:"flex", gap:16, justifyContent:"center" }}>
              <div style={{ textAlign:"center" }}>
                <div style={{ fontFamily:"Nunito", fontSize:13, color:"#7A9AB8", fontWeight:700, textTransform:"uppercase", letterSpacing:".06em" }}>Duration</div>
                <div style={{ fontFamily:'"Orbitron",monospace', fontSize:18, color:"#E8EFF8", fontWeight:700, marginTop:2 }}>{sesInfo.dur}</div>
              </div>
              <div style={{ width:1, background:"#253A52" }}/>
              <div style={{ textAlign:"center" }}>
                <div style={{ fontFamily:"Nunito", fontSize:13, color:"#7A9AB8", fontWeight:700, textTransform:"uppercase", letterSpacing:".06em" }}>Apples</div>
                <div style={{ fontFamily:'"Orbitron",monospace', fontSize:18, color:"#E8EFF8", fontWeight:700, marginTop:2 }}>{sesInfo.apples}</div>
              </div>
              <div style={{ width:1, background:"#253A52" }}/>
              <div style={{ textAlign:"center" }}>
                <div style={{ fontFamily:"Nunito", fontSize:13, color:"#7A9AB8", fontWeight:700, textTransform:"uppercase", letterSpacing:".06em" }}>Upgrades</div>
                <div style={{ fontFamily:'"Orbitron",monospace', fontSize:18, color:"#E8EFF8", fontWeight:700, marginTop:2 }}>{sesInfo.upgrades}</div>
              </div>
            </div>
          </div>
          <div style={{ display:"flex", flexDirection:"column", gap:10, alignItems:"center" }}>
            <button onClick={startGame} className="sl-btn-pri" style={btnPri}>PLAY AGAIN</button>
            <button onClick={goToMenu}  className="sl-btn-sec" style={btnSec}>MAIN MENU</button>
          </div>
        </div>
      )}
    </div>
  );
}
