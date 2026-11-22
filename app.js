(() => {
  "use strict";

  const root = document.documentElement;
  const body = document.body;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const startedAt = Date.now();
  const visitId = Math.random().toString(16).slice(2, 10);

  let progress = 0;
  let maxProgress = 0;
  let stage = 0;
  let mouseX = window.innerWidth / 2;
  let mouseY = window.innerHeight / 2;
  let scared = false;
  let lastActivity = Date.now();

  const STAGE_SECTIONS = ["durable", "patterns", "dashboard", "timer", "basement", "hallway"];

  function rand(min, max) {
    return min + Math.random() * (max - min);
  }

  function pick(list) {
    return list[Math.floor(Math.random() * list.length)];
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function sleep(ms) {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function zalgo(text, amount) {
    let output = "";
    for (const ch of text) {
      output += ch;
      if (ch === " ") {
        continue;
      }
      const count = Math.floor(Math.random() * amount);
      for (let i = 0; i < count; i++) {
        output += String.fromCharCode(0x300 + Math.floor(Math.random() * 0x70));
      }
    }
    return output;
  }

  function nowString() {
    return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  }

  function stamp() {
    const d = new Date();
    return d.toISOString().slice(11, 23);
  }

  function secondsHere() {
    return Math.floor((Date.now() - startedAt) / 1000);
  }

  function platformName() {
    const ua = navigator.userAgent;
    if (/Windows/i.test(ua)) {
      return "Windows";
    }
    if (/Mac/i.test(ua)) {
      return "macOS";
    }
    if (/Android/i.test(ua)) {
      return "Android";
    }
    if (/iPhone|iPad/i.test(ua)) {
      return "iOS";
    }
    return "Linux";
  }

  function timeZone() {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch (error) {
      return "your time zone";
    }
  }

  function replayCount() {
    try {
      return parseInt(localStorage.getItem("dts-replays") || "0", 10);
    } catch (error) {
      return 0;
    }
  }

  /* ---------------- audio ---------------- */

  const audio = {
    ctx: null,
    master: null,
    droneGain: null,
    droneFilter: null,
    enabled: false,
    nextBeat: 0
  };

  function enableAudio() {
    if (audio.ctx) {
      audio.ctx.resume();
      audio.enabled = true;
      return;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) {
      return;
    }
    audio.ctx = new Ctx();
    audio.master = audio.ctx.createGain();
    audio.master.gain.value = 0.9;
    audio.master.connect(audio.ctx.destination);
    audio.droneFilter = audio.ctx.createBiquadFilter();
    audio.droneFilter.type = "lowpass";
    audio.droneFilter.frequency.value = 150;
    audio.droneGain = audio.ctx.createGain();
    audio.droneGain.gain.value = 0;
    audio.droneFilter.connect(audio.droneGain);
    audio.droneGain.connect(audio.master);
    const freqs = [36.7, 37.1, 55.0, 77.8];
    for (const freq of freqs) {
      const osc = audio.ctx.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.value = freq;
      const lfo = audio.ctx.createOscillator();
      lfo.frequency.value = rand(0.05, 0.2);
      const lfoGain = audio.ctx.createGain();
      lfoGain.gain.value = 1.5;
      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);
      osc.connect(audio.droneFilter);
      osc.start();
      lfo.start();
    }
    audio.enabled = true;
  }

  function updateAudio() {
    if (!audio.enabled || !audio.ctx) {
      return;
    }
    const t = audio.ctx.currentTime;
    const level = stage >= 3 ? clamp(progress, 0.3, 1) : 0;
    audio.droneGain.gain.setTargetAtTime(level * 0.22, t, 0.8);
    audio.droneFilter.frequency.setTargetAtTime(120 + level * 700, t, 0.8);
  }

  function thump(time, strength) {
    const osc = audio.ctx.createOscillator();
    const gain = audio.ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(75, time);
    osc.frequency.exponentialRampToValueAtTime(32, time + 0.18);
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(strength, time + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.25);
    osc.connect(gain);
    gain.connect(audio.master);
    osc.start(time);
    osc.stop(time + 0.3);
  }

  function tick(time) {
    const osc = audio.ctx.createOscillator();
    const gain = audio.ctx.createGain();
    osc.type = "square";
    osc.frequency.value = 2200;
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(0.05, time + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.03);
    osc.connect(gain);
    gain.connect(audio.master);
    osc.start(time);
    osc.stop(time + 0.05);
  }

  function heartbeatTick() {
    if (!audio.enabled || !audio.ctx || scared || stage < 3) {
      return;
    }
    const t = audio.ctx.currentTime;
    if (t < audio.nextBeat) {
      return;
    }
    const intensity = clamp((progress - 0.4) / 0.6, 0, 1);
    const strength = 0.35 + intensity * 0.6;
    thump(t + 0.02, strength);
    thump(t + 0.22, strength * 0.7);
    audio.nextBeat = t + 1.25 - intensity * 0.8;
  }

  function scream() {
    if (!audio.enabled || !audio.ctx) {
      return;
    }
    const ctx = audio.ctx;
    const t = ctx.currentTime;
    const length = 2.2;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const noiseSrc = ctx.createBufferSource();
    noiseSrc.buffer = buffer;
    const band = ctx.createBiquadFilter();
    band.type = "bandpass";
    band.Q.value = 2.5;
    band.frequency.setValueAtTime(600, t);
    band.frequency.exponentialRampToValueAtTime(2600, t + 0.25);
    band.frequency.exponentialRampToValueAtTime(900, t + length);
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.0001, t);
    noiseGain.gain.exponentialRampToValueAtTime(1.0, t + 0.03);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, t + length);
    noiseSrc.connect(band);
    band.connect(noiseGain);
    noiseGain.connect(audio.master);
    noiseSrc.start(t);
    const voices = [580, 610, 870, 1190];
    for (const base of voices) {
      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(base * 0.6, t);
      osc.frequency.exponentialRampToValueAtTime(base, t + 0.12);
      osc.frequency.exponentialRampToValueAtTime(base * 0.75, t + length);
      const vib = ctx.createOscillator();
      vib.frequency.value = 9;
      const vibGain = ctx.createGain();
      vibGain.gain.value = base * 0.04;
      vib.connect(vibGain);
      vibGain.connect(osc.frequency);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.18, t + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + length);
      osc.connect(gain);
      gain.connect(audio.master);
      osc.start(t);
      vib.start(t);
      osc.stop(t + length);
      vib.stop(t + length);
    }
    thump(t, 1.0);
  }

  function whisper(text) {
    if (!audio.enabled || !("speechSynthesis" in window)) {
      return;
    }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.pitch = 0.1;
    utterance.rate = 0.55;
    utterance.volume = 0.7;
    window.speechSynthesis.speak(utterance);
  }

  const toast = document.getElementById("toast");
  document.getElementById("enable-sound").addEventListener("click", () => {
    enableAudio();
    toast.classList.remove("show");
  });
  document.getElementById("dismiss-sound").addEventListener("click", () => {
    toast.classList.remove("show");
  });
  window.addEventListener("pointerdown", () => {
    if (!audio.enabled && stage >= 3) {
      enableAudio();
    }
  });

  /* ---------------- hero code ---------------- */

  const codeHead = [
    '[<span class="t">DurableTask</span>]',
    '<span class="k">public class</span> <span class="t">HelloCities</span> : <span class="t">TaskOrchestrator</span>&lt;<span class="k">string</span>, <span class="t">List</span>&lt;<span class="k">string</span>&gt;&gt;',
    "{",
    '    <span class="k">public override async</span> <span class="t">Task</span>&lt;<span class="t">List</span>&lt;<span class="k">string</span>&gt;&gt; <span class="f">RunAsync</span>(',
    '        <span class="t">TaskOrchestrationContext</span> context, <span class="k">string</span> input)',
    "    {",
    '        <span class="k">var</span> outputs = <span class="k">new</span> <span class="t">List</span>&lt;<span class="k">string</span>&gt;();',
    "",
    '        outputs.<span class="f">Add</span>(<span class="k">await</span> context.<span class="f">CallActivityAsync</span>&lt;<span class="k">string</span>&gt;(<span class="s">"SayHello"</span>, <span class="s">"Tokyo"</span>));',
    '        outputs.<span class="f">Add</span>(<span class="k">await</span> context.<span class="f">CallActivityAsync</span>&lt;<span class="k">string</span>&gt;(<span class="s">"SayHello"</span>, <span class="s">"Seattle"</span>));',
    '        outputs.<span class="f">Add</span>(<span class="k">await</span> context.<span class="f">CallActivityAsync</span>&lt;<span class="k">string</span>&gt;(<span class="s">"SayHello"</span>, <span class="s">"London"</span>));'
  ];
  const codeTail = [
    "",
    '        <span class="k">return</span> outputs;',
    "    }",
    "}"
  ];
  const codeCreepy = [
    '        outputs.<span class="f">Add</span>(<span class="k">await</span> context.<span class="f">CallActivityAsync</span>&lt;<span class="k">string</span>&gt;(<span class="s">"SayHello"</span>, <span class="s">"the basement"</span>));',
    '        <span class="c">// it keeps saying hello. nobody answers.</span>',
    '        <span class="k">var</span> you = <span class="k">await</span> context.<span class="f">WaitForExternalEvent</span>&lt;<span class="t">Visitor</span>&gt;(<span class="s">"you"</span>);',
    '        <span class="bad">context.ContinueAsNew(you); // forever</span>'
  ];

  const typed = document.getElementById("typed");
  let typedHead = "";

  function plainOf(html) {
    const tmp = document.createElement("div");
    tmp.innerHTML = html;
    return tmp.textContent;
  }

  async function typeInto(lines, tailHtml, speed) {
    for (const line of lines) {
      const plain = plainOf(line);
      for (let i = 1; i <= plain.length; i++) {
        typed.innerHTML = typedHead + escapeHtml(plain.slice(0, i)) + "\n" + tailHtml;
        await sleep(speed);
      }
      typedHead += line + "\n";
      typed.innerHTML = typedHead + tailHtml;
      await sleep(speed * 4);
    }
  }

  const tailHtml = codeTail.join("\n");
  const heroTyping = typeInto(codeHead, "", reduceMotion ? 1 : 14).then(() => {
    typed.innerHTML = typedHead + tailHtml;
  });
  let creepyCodeTyped = false;

  /* ---------------- text swaps ---------------- */

  const swapEls = Array.from(document.querySelectorAll("[data-at]"));

  function applySwaps() {
    for (const el of swapEls) {
      if (el.dataset.done) {
        continue;
      }
      if (maxProgress >= parseFloat(el.dataset.at)) {
        el.dataset.done = "1";
        el.textContent = el.dataset.alt;
        el.classList.add("weird");
      }
    }
  }

  /* ---------------- live orchestration history ---------------- */

  const hist = document.getElementById("hist");
  const histNote = document.getElementById("hist-note");
  document.getElementById("hist-id").textContent = "visit-" + visitId;
  let histN = 0;

  function addHistory(type, name, mood) {
    histN++;
    const tr = document.createElement("tr");
    if (mood) {
      tr.className = "ev-" + mood;
    }
    tr.innerHTML = "<td>" + histN + "</td><td>" + stamp() + "</td><td>" + escapeHtml(type) + "</td><td>" + escapeHtml(name) + "</td>";
    hist.appendChild(tr);
    while (hist.children.length > 9) {
      hist.firstChild.remove();
    }
  }

  addHistory("ExecutionStarted", "VisitOrchestrator { page: \"/durable-task-scheduler\" }");
  addHistory("OrchestratorStarted", "");

  const seenSections = new Set();
  const sectionIds = ["overview", "products", "durable", "patterns", "determinism", "dashboard", "timer", "entities", "pricing", "basement", "hallway"];

  function sectionTrack() {
    for (const id of sectionIds) {
      if (seenSections.has(id)) {
        continue;
      }
      const el = document.getElementById(id);
      if (el.getBoundingClientRect().top < window.innerHeight * 0.6) {
        seenSections.add(id);
        if (stage >= 3) {
          addHistory("TaskScheduled", "FollowVisitor(\"" + id + "\")", "creepy");
          addHistory("TaskCompleted", "visitor is still here", "creepy");
        } else if (stage >= 2) {
          addHistory("TaskScheduled", "WatchVisitor(\"" + id + "\")");
          addHistory("TaskCompleted", "\"they are reading\"");
        } else {
          addHistory("TaskScheduled", "ReadSection(\"" + id + "\")");
          addHistory("TaskCompleted", "\"ok\"");
        }
      }
    }
  }

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      addHistory("EventRaised", stage >= 3 ? "visitor_looked_away (we didn't)" : "visitor_looked_away", stage >= 3 ? "creepy" : "");
      if (stage >= 3) {
        document.title = "come back.";
      }
    } else {
      addHistory("EventRaised", "visitor_came_back", stage >= 3 ? "creepy" : "");
      document.title = titles[stage];
    }
  });

  document.addEventListener("mouseleave", () => {
    if (stage >= 2) {
      addHistory("EventRaised", "visitor_tried_to_leave", "creepy");
    }
  });

  function idleTick() {
    if (Date.now() - lastActivity > 8000 && !scared) {
      lastActivity = Date.now();
      if (stage >= 3) {
        addHistory("TimerFired", "visitor stopped moving. why did you stop moving?", "dark");
      } else {
        addHistory("TimerCreated", "WaitForVisitor (8s)");
        addHistory("TimerFired", "WaitForVisitor");
      }
    }
  }

  /* ---------------- dashboard ---------------- */

  const instancesBody = document.querySelector("#instances tbody");
  const dashMsg = document.getElementById("dash-msg");
  const hubName = document.getElementById("hub-name");
  const youId = "you-" + visitId;

  const instances = [
    { id: "hello-cities-01", name: "HelloCities", status: "Completed", cls: "", created: "Today 09:12" },
    { id: "order-7731", name: "ProcessOrder", status: "Running", cls: "running", created: "Today 09:40" },
    { id: "approval-55", name: "ApprovalWorkflow", status: "Pending", cls: "pending", created: "Yesterday" },
    { id: "nightly-etl", name: "NightlyEtl", status: "Running", cls: "running", created: "Today 02:00" }
  ];
  let instancesStage = -1;

  function evolveInstances() {
    if (instancesStage === stage) {
      return;
    }
    instancesStage = stage;
    if (stage >= 3) {
      instances[2].status = "Waiting for you";
      instances[2].cls = "evil";
      instances[3].created = "1970-01-01";
      if (!instances.find((x) => x.id === youId)) {
        instances.push({ id: youId, name: "VisitorOrchestration", status: "Running", cls: "evil", created: "Today " + nowString(), isNew: true });
      }
    }
    if (stage >= 4) {
      hubName.textContent = "basement";
      instances[1].status = "Retrying (10,482)";
      instances[1].cls = "evil";
      if (!instances.find((x) => x.id === "eternal-0")) {
        instances.push({ id: "eternal-0", name: "EternalOrchestration", status: "ContinuedAsNew ×∞", cls: "evil", created: "Before you were born", isNew: true });
      }
    }
    renderInstances();
  }

  function renderInstances() {
    let html = "";
    for (const inst of instances) {
      const buttons = inst.status === "Completed" || inst.status === "Terminated"
        ? '<button class="act" data-act="purge" data-id="' + inst.id + '">Purge</button>'
        : '<button class="act" data-act="terminate" data-id="' + inst.id + '">Terminate</button>';
      html += "<tr" + (inst.isNew ? ' class="new-row"' : "") + "><td><code>" + escapeHtml(inst.id) + "</code></td><td>" +
        escapeHtml(inst.name) + '</td><td><span class="st ' + inst.cls + '">' + escapeHtml(inst.status) + "</span></td><td>" +
        escapeHtml(inst.created) + "</td><td>" + buttons + "</td></tr>";
      inst.isNew = false;
    }
    instancesBody.innerHTML = html;
  }

  const refusals = [
    "termination refused. reason: \"not yet.\"",
    "termination refused. reason: \"we are not finished with you.\"",
    "termination refused. reason: \"you can't terminate what was never yours.\"",
    "terminated. restarted. terminated. restarted. it likes this game.",
    "termination refused. it heard you try."
  ];

  instancesBody.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-act]");
    if (!button) {
      return;
    }
    const inst = instances.find((x) => x.id === button.dataset.id);
    if (!inst) {
      return;
    }
    if (button.dataset.act === "purge") {
      if (stage >= 3) {
        dashMsg.textContent = "purge failed: history cannot be purged. it remembers everything you did today.";
        addHistory("EventRaised", "visitor_tried_to_forget", "dark");
      } else {
        dashMsg.textContent = "Purged history for " + inst.id + ".";
        instances.splice(instances.indexOf(inst), 1);
        renderInstances();
      }
      return;
    }
    dashMsg.textContent = "Terminate requested for " + inst.id + "…";
    if (stage < 3) {
      setTimeout(() => {
        inst.status = "Terminated";
        inst.cls = "";
        renderInstances();
        dashMsg.textContent = "Instance " + inst.id + " terminated.";
      }, 900);
      return;
    }
    setTimeout(() => {
      inst.status = "Terminated";
      inst.cls = "";
      renderInstances();
    }, 800);
    setTimeout(() => {
      inst.status = "Running";
      inst.cls = "evil";
      renderInstances();
      dashMsg.textContent = pick(refusals);
      addHistory("EventRaised", "visitor_tried_to_terminate(" + inst.id + ")", "dark");
    }, 2200);
  });

  /* ---------------- determinism ---------------- */

  const detLate = document.getElementById("det-late");

  function determinismTick() {
    if (stage >= 2) {
      detLate.textContent = "> DateTime.Now = " + nowString() + " (" + timeZone() + "). we used it anyway. it's later than you think.";
    }
  }

  /* ---------------- timer ---------------- */

  const countdown = document.getElementById("countdown");
  const countdownLabel = document.getElementById("countdown-label");
  const weekMs = 7 * 24 * 3600 * 1000;

  function fmtRemaining(ms) {
    const total = Math.max(0, Math.floor(ms / 1000));
    const d = Math.floor(total / 86400);
    const h = Math.floor((total % 86400) / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    return d + "d " + String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
  }

  function timerTick() {
    let remaining = weekMs - (Date.now() - startedAt);
    if (stage >= 4) {
      const timerTop = document.getElementById("timer").offsetTop;
      const max = root.scrollHeight - window.innerHeight;
      const from = timerTop / max;
      const f = clamp((maxProgress - from) / (0.985 - from), 0, 1);
      remaining = remaining * Math.pow(1 - f, 2.2);
      countdownLabel.textContent = remaining < 60000 ? "it's here." : "until it comes for you. scrolling makes it faster.";
    }
    countdown.textContent = fmtRemaining(remaining);
    if (audio.enabled && stage >= 4 && !scared) {
      tick(audio.ctx.currentTime);
    }
  }

  /* ---------------- entity ---------------- */

  const entityId = document.getElementById("entity-id");
  const entityVal = document.getElementById("entity-val");
  const entityNote = document.getElementById("entity-note");
  const entityState = document.getElementById("entity-state");
  let scrollSteps = 0;
  let lastStepY = 0;

  function entityUpdate() {
    if (Math.abs(window.scrollY - lastStepY) > 120) {
      lastStepY = window.scrollY;
      scrollSteps++;
    }
    entityVal.textContent = String(scrollSteps);
    if (stage >= 4) {
      entityId.textContent = "@soul@" + youId;
      entityNote.textContent = "Entity operations are serialized. So are you.";
      entityState.textContent = JSON.stringify({
        owner: "durabletask",
        releasable: false,
        platform: platformName(),
        timeZone: timeZone(),
        secondsObserved: secondsHere(),
        scrolls: scrollSteps,
        lastSeen: nowString()
      }, null, 2);
    } else {
      entityState.textContent = JSON.stringify({ count: scrollSteps, lastOperation: "add", serialized: true }, null, 2);
    }
  }

  /* ---------------- eyes ---------------- */

  const eyesLayer = document.getElementById("eyes");
  const eyes = [];

  function makeEyes(count) {
    for (let i = 0; i < count; i++) {
      const x = rand(4, 90);
      const y = rand(10, 88);
      const scale = rand(0.6, 1.6);
      const threshold = i / count;
      for (let side = 0; side < 2; side++) {
        const eye = document.createElement("div");
        eye.className = "eye";
        eye.style.left = "calc(" + x + "vw + " + side * 46 * scale + "px)";
        eye.style.top = y + "vh";
        eye.style.width = 34 * scale + "px";
        eye.style.height = 16 * scale + "px";
        const pupil = document.createElement("div");
        pupil.className = "pupil";
        eye.appendChild(pupil);
        eyesLayer.appendChild(eye);
        eyes.push({ eye: eye, pupil: pupil, threshold: threshold });
      }
    }
  }

  function eyeAmount() {
    if (stage < 3) {
      return -1;
    }
    const dash = document.getElementById("dashboard").offsetTop;
    const max = root.scrollHeight - window.innerHeight;
    return clamp((progress - dash / max) / (1 - dash / max), 0, 1);
  }

  function updateEyes() {
    const amount = eyeAmount();
    for (const item of eyes) {
      const visible = amount >= item.threshold && !scared;
      item.eye.classList.toggle("open", visible);
      if (!visible) {
        continue;
      }
      const rect = item.eye.getBoundingClientRect();
      const angle = Math.atan2(mouseY - (rect.top + rect.height / 2), mouseX - (rect.left + rect.width / 2));
      item.pupil.style.transform = "translate(" + Math.cos(angle) * rect.width * 0.28 + "px, " + Math.sin(angle) * rect.height * 0.22 + "px)";
    }
  }

  function blinkSomeone() {
    const item = pick(eyes);
    if (!item) {
      return;
    }
    item.eye.classList.add("blink");
    setTimeout(() => {
      item.eye.classList.remove("blink");
    }, 160);
  }

  makeEyes(window.innerWidth < 700 ? 7 : 15);

  window.addEventListener("pointermove", (event) => {
    mouseX = event.clientX;
    mouseY = event.clientY;
    lastActivity = Date.now();
  });

  /* ---------------- noise + flicker ---------------- */

  const noise = document.getElementById("noise");
  const nctx = noise.getContext("2d");
  noise.width = 160;
  noise.height = 100;
  const noiseImage = nctx.createImageData(noise.width, noise.height);
  let noiseFrame = 0;

  function drawNoise() {
    const strength = stage >= 3 ? clamp(eyeAmount() + 0.15, 0, 1) : 0;
    noise.style.opacity = String(strength * 0.22);
    if (strength <= 0) {
      return;
    }
    noiseFrame++;
    if (noiseFrame % 2) {
      return;
    }
    const d = noiseImage.data;
    for (let i = 0; i < d.length; i += 4) {
      const v = Math.random() * 255;
      d[i] = v * 0.85;
      d[i + 1] = v * 0.9;
      d[i + 2] = v;
      d[i + 3] = 255;
    }
    nctx.putImageData(noiseImage, 0, 0);
  }

  const flicker = document.getElementById("flicker");

  async function flash(times) {
    for (let i = 0; i < times; i++) {
      flicker.classList.add("on");
      await sleep(rand(60, 160));
      flicker.classList.remove("on");
      await sleep(rand(120, 380));
    }
  }

  function scheduleFlicker() {
    setTimeout(() => {
      if (stage >= 4 && !scared && !reduceMotion) {
        flash(Math.random() < 0.4 ? 2 : 1);
      }
      scheduleFlicker();
    }, rand(2500, 7000));
  }

  scheduleFlicker();

  async function lightsOut() {
    if (!reduceMotion) {
      await flash(3);
    }
    body.classList.add("dark");
    addHistory("EventRaised", "power_failure", "dark");
    addHistory("OrchestratorStarted", "replay #" + (replayCount() + 1), "creepy");
  }

  /* ---------------- basement + replay ---------------- */

  const drips = document.querySelector(".drips");
  const graves = document.getElementById("graves");
  const basementTitle = document.querySelector(".zalgo");
  const youAre = document.getElementById("you-are");
  const replayBanner = document.getElementById("replay-banner");
  const replayN = document.getElementById("replay-n");
  let basementBuilt = false;
  let replayHiccupDone = false;

  const graveNames = ["SendInvoice", "ApproveExpense", "ResizeImage", "OnboardUser", "SyncInventory", "SendWelcomeEmail", "ChargeCard", "BackupDb", "NotifyManager", "ProcessRefund", "RotateKeys", "HelloCities"];
  const graveStates = ["Running since 2019", "Pending forever", "Retry 10,482", "Suspended (by whom?)", "Waiting for an event that will never come", "Orphaned", "Replaying…"];

  function buildBasement() {
    if (basementBuilt) {
      return;
    }
    basementBuilt = true;
    const count = window.innerWidth < 700 ? 14 : 34;
    for (let i = 0; i < count; i++) {
      const drip = document.createElement("span");
      drip.className = "drip";
      drip.style.left = rand(0, 100) + "%";
      drip.style.width = rand(4, 14) + "px";
      drip.style.height = rand(40, 320) + "px";
      drip.style.animationDuration = rand(3, 11) + "s";
      drip.style.animationDelay = rand(0, 4) + "s";
      drips.appendChild(drip);
    }
    for (let i = 0; i < 40; i++) {
      const g = document.createElement("span");
      g.className = "grave";
      g.innerHTML = escapeHtml(pick(graveNames)) + "-" + Math.floor(rand(100, 9999)) + " · <b>" + escapeHtml(pick(graveStates)) + "</b>";
      graves.appendChild(g);
    }
  }

  async function replayHiccup() {
    if (replayHiccupDone || reduceMotion || scared) {
      return;
    }
    replayHiccupDone = true;
    const y = window.scrollY;
    replayBanner.classList.add("show");
    await flash(1);
    window.scrollTo(0, Math.max(0, y - window.innerHeight * 2.2));
    await sleep(650);
    await flash(1);
    window.scrollTo(0, y);
  }

  let replayCounter = 1;

  function basementTick() {
    if (stage < 5) {
      return;
    }
    buildBasement();
    basementTitle.textContent = zalgo(basementTitle.dataset.zalgo, 2 + Math.floor(progress * 5));
    for (const g of graves.children) {
      if (Math.random() < 0.18) {
        g.classList.add("on");
      }
    }
    replayCounter += Math.floor(rand(1, 40));
    replayN.textContent = String(replayCounter);
    youAre.textContent =
      "instance: " + youId + "\n" +
      "runtimeStatus: Running\n" +
      "platform: " + platformName() + "\n" +
      "timeZone: " + timeZone() + "\n" +
      "localTime: " + nowString() + "\n" +
      "secondsObserved: " + secondsHere() + "\n" +
      "replays: " + (replayCount() + 1) + "\n" +
      "next: ContinueAsNew(you)";
  }

  /* ---------------- hallway ---------------- */

  const hallway = document.getElementById("hallway");
  const hallText = document.getElementById("hall-text");
  const hallLines = [
    "",
    "this is where orchestrations wait.",
    "WaitForExternalEvent(\"you\")",
    "it has been waiting a long time.",
    "you raised the event when you scrolled here.",
    "don't look behind you.",
    "it's deterministic.",
    "it will always end the same way.",
    "it always ends with you",
    "turning around"
  ];
  let lastHall = -1;
  let whispered = false;

  function hallwayTick() {
    const rect = hallway.getBoundingClientRect();
    const total = rect.height - window.innerHeight;
    const local = clamp(-rect.top / total, 0, 1);
    hallway.style.setProperty("--hall", String(local));
    const index = Math.min(hallLines.length - 1, Math.floor(local * hallLines.length));
    if (index !== lastHall) {
      lastHall = index;
      hallText.style.opacity = "0";
      setTimeout(() => {
        hallText.textContent = hallLines[index];
        hallText.style.opacity = "1";
      }, 300);
      if (index === 5 && !whispered) {
        whispered = true;
        whisper("don't look behind you");
      }
    }
  }

  /* ---------------- finale ---------------- */

  const scare = document.getElementById("scare");
  const after = document.getElementById("after");
  const afterTerm = document.getElementById("after-term");

  async function finale() {
    if (scared) {
      return;
    }
    scared = true;
    replayBanner.classList.remove("show");
    toast.classList.remove("show");
    body.style.overflow = "hidden";
    flicker.classList.add("on");
    await sleep(900);
    flicker.classList.remove("on");
    scare.classList.add("show");
    scream();
    if (navigator.vibrate) {
      navigator.vibrate([200, 60, 400]);
    }
    await sleep(1500);
    scare.classList.remove("show");
    after.classList.add("show");
    const replays = replayCount() + 1;
    try {
      localStorage.setItem("dts-replays", String(replays));
    } catch (error) {
      // storage is optional
    }
    const created = new Date(startedAt).toISOString();
    const lines = [
      "GET /taskhubs/basement/orchestrations/" + youId,
      "",
      "{",
      "  \"instanceId\": \"" + youId + "\",",
      "  \"name\": \"VisitorOrchestration\",",
      "  \"runtimeStatus\": \"ContinuedAsNew\",",
      "  \"createdAt\": \"" + created + "\",",
      "  \"input\": \"you\",",
      "  \"output\": null,",
      "  \"replays\": " + replays,
      "}",
      "",
      "replaying from event 1…"
    ];
    afterTerm.textContent = "";
    for (const line of lines) {
      for (const ch of line) {
        afterTerm.textContent += ch;
        await sleep(22);
      }
      afterTerm.textContent += "\n";
      await sleep(180);
    }
    await sleep(1600);
    window.scrollTo(0, 0);
    after.classList.remove("show");
    body.style.overflow = "";
    applyResidue();
    addHistory("ContinueAsNew", "input: \"you\"", "dark");
    addHistory("ExecutionStarted", "VisitOrchestrator (replay " + replays + ")", "dark");
    setTimeout(() => {
      scared = false;
    }, 2000);
  }

  function applyResidue() {
    const n = replayCount();
    if (n < 1) {
      return;
    }
    body.classList.add("residue");
    document.getElementById("hero-title").textContent = "Azure Durable Task Scheduler (replay " + (n + 1) + ")";
    document.getElementById("hero-lead").textContent =
      "A fully managed backend for durable execution. Every step is checkpointed. Every visit is checkpointed. You've been here before. You'll be here again.";
    histNote.textContent = "This table is a live demo of event sourcing. Your previous visits are still in it.";
  }

  applyResidue();

  /* ---------------- titles ---------------- */

  const titles = [
    "Durable Task Scheduler | Microsoft Azure",
    "Durable Task Scheduler | Microsoft Azure",
    "Durable Task Scheduler | Microsoft Azure.",
    "Durable Task Scheduler | it's dark in here",
    "Durable Task Scheduler | WaitForExternalEvent(\"you\")",
    "Durable Task Scheduler | still running",
    "ContinueAsNew(you)"
  ];

  console.log("%cDurable Task Scheduler", "color:#0078d4;font-size:20px;font-weight:700");
  console.log("%cThis console session has been checkpointed.", "color:#d13438");

  /* ---------------- stage + loop ---------------- */

  for (const el of document.querySelectorAll(".card, .window, .pill")) {
    el.style.setProperty("--r", rand(-1.6, 1.6).toFixed(2));
  }

  function computeStage() {
    let next = 0;
    for (let i = 0; i < STAGE_SECTIONS.length; i++) {
      const el = document.getElementById(STAGE_SECTIONS[i]);
      if (el.getBoundingClientRect().top < window.innerHeight * 0.5) {
        next = i + 1;
      }
    }
    return Math.max(stage, next);
  }

  function onStageChange(prev) {
    for (let i = 1; i <= STAGE_SECTIONS.length; i++) {
      body.classList.toggle("s" + i, stage >= i);
    }
    if (!document.hidden) {
      document.title = titles[stage];
    }
    if (stage >= 2 && !creepyCodeTyped) {
      creepyCodeTyped = true;
      heroTyping.then(() => {
        return typeInto(codeCreepy, tailHtml, 40);
      });
    }
    if (stage >= 2 && !audio.enabled && prev < 2) {
      toast.classList.add("show");
    }
    if (stage >= 3 && prev < 3) {
      lightsOut();
    }
    if (stage >= 5 && prev < 5) {
      toast.classList.remove("show");
      buildBasement();
      setTimeout(replayHiccup, 2500);
    }
    if (stage >= 6) {
      replayBanner.classList.add("show");
    }
    evolveInstances();
  }

  function computeProgress() {
    const max = root.scrollHeight - window.innerHeight;
    if (max <= 0) {
      return 0;
    }
    return clamp(window.scrollY / max, 0, 1);
  }

  function onScroll() {
    lastActivity = Date.now();
    progress = computeProgress();
    maxProgress = Math.max(maxProgress, progress);
    root.style.setProperty("--p", progress.toFixed(3));
    const next = computeStage();
    if (next !== stage) {
      const prev = stage;
      stage = next;
      onStageChange(prev);
    }
    applySwaps();
    sectionTrack();
    entityUpdate();
    updateAudio();
    hallwayTick();
    if (progress >= 0.992 && !scared) {
      finale();
    }
  }

  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll);

  function frame() {
    drawNoise();
    updateEyes();
    heartbeatTick();
    requestAnimationFrame(frame);
  }

  setInterval(timerTick, 1000);
  setInterval(determinismTick, 1000);
  setInterval(basementTick, 1200);
  setInterval(blinkSomeone, 1800);
  setInterval(idleTick, 1000);

  renderInstances();
  timerTick();
  onScroll();
  requestAnimationFrame(frame);
})();
