(() => {
  const $ = (s) => document.querySelector(s);
  const MIN = 60 * 1000;
  const ico = (n) => `<svg class="ic" aria-hidden="true"><use href="#i-${n}"/></svg>`;

  // ---------- storage (safe) ----------
  const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
  const store = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
  const drop = (k) => { try { localStorage.removeItem(k); } catch {} };

  const DEFAULT_MODEL = { anthropic: 'claude-haiku-5-5', gemini: 'gemini-2.5-flash' };
  let settings = Object.assign({ provider: 'anthropic', key: '', model: DEFAULT_MODEL.anthropic, warn: 5, scale: 1, theme: '' }, load('gs_settings', {}));
  let S = load('gs_state', null); // current session
  let tasks = load('gs_tasks', []); // the user's task list, kept between sessions
  const saveState = () => store('gs_state', S);

  // "3:00 PM", "tomorrow 3:00 PM" or "Fri 24 Oct, 3:00 PM"
  function fmtTime(ms) {
    const d = new Date(ms), t = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    const day = (x) => new Date(x).toDateString();
    if (day(ms) === day(Date.now())) return t;
    if (day(ms) === day(Date.now() + 864e5)) return `tomorrow ${t}`;
    return `${d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })}, ${t}`;
  }
  // "42 min" or "3 h 15 min"
  function fmtDur(min) {
    if (min < 90) return `${min} min`;
    const h = Math.floor(min / 60), m = min % 60;
    return m ? `${h} h ${m} min` : `${h} h`;
  }
  const toLocalInput = (d) => {
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  };
  const minsLeft = (ms) => Math.floor((ms - Date.now()) / MIN);
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

  function applySettings() {
    document.documentElement.style.setProperty('--scale', settings.scale);
    if (settings.theme) document.documentElement.dataset.theme = settings.theme;
    else delete document.documentElement.dataset.theme;
  }
  applySettings();

  // ---------- screens ----------
  function show(id) {
    document.querySelectorAll('.screen').forEach((s) => (s.hidden = s.id !== id));
    const h = document.querySelector(`#${id} [tabindex="-1"]`);
    if (h) h.focus({ preventScroll: false });
  }
  let toastTimer;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (t.hidden = true), 8000);
  }
  const announce = (msg) => ($('#live').textContent = msg);

  // ---------- sound + notifications ----------
  let ctx = null;
  function ensureAudio() {
    try {
      ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state === 'suspended') ctx.resume();
    } catch {}
  }
  function tone(freq, start, dur, type = 'sine', vol = 0.2) {
    if (!ctx) return;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, ctx.currentTime + start);
    g.gain.exponentialRampToValueAtTime(vol, ctx.currentTime + start + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + dur);
    o.connect(g).connect(ctx.destination);
    o.start(ctx.currentTime + start); o.stop(ctx.currentTime + start + dur + 0.05);
  }
  const chime = () => { tone(660, 0, 0.5); tone(880, 0.25, 0.7); };
  let alarmLoop = null;
  function startAlarmSound() {
    stopAlarmSound();
    const beep = () => { tone(880, 0, 0.18, 'square', 0.35); tone(880, 0.25, 0.18, 'square', 0.35); tone(1175, 0.5, 0.3, 'square', 0.35); };
    beep();
    alarmLoop = setInterval(beep, 1200);
    if (navigator.vibrate) navigator.vibrate([400, 200, 400, 200, 400]);
  }
  function stopAlarmSound() { clearInterval(alarmLoop); alarmLoop = null; }
  function notify(title, body) {
    try {
      if ('Notification' in window && Notification.permission === 'granted' && document.hidden) {
        new Notification(title, { body, requireInteraction: true });
      }
    } catch {}
  }

  // ---------- built-in planner (no AI needed) ----------
  const TEMPLATES = [
    { re: /\b(write|essay|report|chapter|draft|thesis|paper|article|proposal|assignment|story|devpost)\b/i, steps: [
      ['Open the document and re-read the last paragraph you wrote', 3],
      ['List 3 bullet points this part needs to say', 5],
      ['Turn bullet 1 into rough sentences. Messy is fine', 10],
      ['Turn bullet 2 into rough sentences', 10],
      ['Add one source or example to back up a point', 8],
      ['Leave a note at the end: what to write next', 2]] },
    { re: /\b(study|revise|revision|exam|test|quiz|read|reading|notes|lecture|learn|memori[sz]e|tutorial)\b/i, steps: [
      ['Get out the notes or slides for just one topic', 3],
      ['Skim the headings and pick the 3 key ideas', 7],
      ['Explain idea 1 in 3 sentences without looking', 8],
      ['Do 3 practice questions on that topic', 12],
      ['Write down the one thing you still don\'t get', 3]] },
    { re: /\b(code|coding|bug|debug|fix|build|implement|feature|app|website|function|deploy|api|script|project)\b/i, steps: [
      ['Open the project and run it once', 5],
      ['Write a one-line comment saying what you\'ll change', 2],
      ['Find the file or function where it goes', 5],
      ['Make the smallest change that moves it forward', 12],
      ['Run it again and note what happened', 5],
      ['Commit with a short message', 2]] },
    { re: /\b(email|reply|message|text|call|contact|follow.?up|apply|application)\b/i, steps: [
      ['Open the message or a blank draft', 2],
      ['Write one sentence saying what you need', 3],
      ['Add the details or dates they need', 5],
      ['Read it once and send it', 3]] },
    { re: /\b(clean|tidy|laundry|organi[sz]e|declutter|dishes|room|pack)\b/i, steps: [
      ['Pick one small area, just one', 2],
      ['Put away things that belong somewhere else', 8],
      ['Throw away obvious rubbish', 5],
      ['Wipe or reset that one area', 5]] }
  ];
  const GENERIC = [
    ['Open whatever you need to start', 3],
    ['Write what "done" looks like in one sentence', 3],
    ['List the first 3 tiny actions', 5],
    ['Do tiny action 1', 10],
    ['Do tiny action 2', 10],
    ['Note where you stopped for next time', 2]
  ];
  function localSteps(task, energy) {
    const tpl = (TEMPLATES.find((t) => t.re.test(task)) || { steps: GENERIC }).steps;
    const f = energy === 'low' ? 0.6 : 1;
    return tpl.map(([text, m]) => ({ text, minutes: Math.max(2, Math.round(m * f)), task }));
  }
  const localPlan = (list, energy) => list.flatMap((t) => localSteps(t, energy));
  function localSplit(step) {
    const half = Math.max(2, Math.round(step.minutes / 2));
    return [
      { text: 'Get set up: open what you need for this step', minutes: 2 },
      { text: `Do only the very first bit: ${step.text.charAt(0).toLowerCase() + step.text.slice(1)}`, minutes: half },
      { text: 'Stop and jot down what the next bit is', minutes: 2 }
    ].map((s) => ({ ...s, task: step.task }));
  }

  // Fill the window: tasks in priority order, steps kept in order within a task.
  // If a task's next step doesn't fit, stop that task and let a later (quicker) task fill the leftover minutes.
  function pack(steps, gap) {
    const fit = [], rest = [], blocked = new Set();
    let used = 0;
    for (const s of steps) {
      if (!blocked.has(s.task) && used + s.minutes <= gap) { fit.push(s); used += s.minutes; }
      else { blocked.add(s.task); rest.push(s); }
    }
    return [...fit, ...rest];
  }

  // ---------- optional AI planner (Anthropic or Gemini) ----------
  const JSON_RULE = '\nRespond only with JSON, no other text: {"steps":[{"text":string,"minutes":number}]}';

  async function callAnthropic(prompt) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': settings.key,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true' // allows calling from a browser page
      },
      body: JSON.stringify({
        model: settings.model,
        max_tokens: 2000,
        messages: [{ role: 'user', content: prompt + JSON_RULE }]
      })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`${res.status}: ${data.error?.message || res.statusText}`);
    if (data.stop_reason === 'max_tokens') throw new Error('reply was cut off');
    return (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
  }

  async function callGemini(prompt) {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(settings.model)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': settings.key },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt + JSON_RULE }] }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0.4 }
      })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`${res.status}: ${data.error?.message || res.statusText}`);
    return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  }

  // Ask the AI and return parsed JSON, or null (with a toast saying why) so callers fall back.
  async function aiJSON(prompt, label) {
    if (!settings.key) return null;
    try {
      const text = settings.provider === 'gemini' ? await callGemini(prompt) : await callAnthropic(prompt);
      const raw = text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1); // tolerate stray text
      return JSON.parse(raw);
    } catch (e) {
      const why = e instanceof SyntaxError ? 'the reply wasn\'t valid JSON'
        : e.message === 'Failed to fetch' ? 'no connection to the API (check internet, or open the page from a web address instead of a file)'
        : e.message;
      console.warn('GapHelp AI error:', e);
      toast(`AI ${label} unavailable (${why}), so I used the built-in one.`);
      return null;
    }
  }

  async function aiSteps(prompt) {
    const j = await aiJSON(prompt + JSON_RULE, 'planner');
    const steps = ((j && j.steps) || [])
      .filter((s) => s && s.text)
      .map((s) => ({ text: String(s.text).slice(0, 140), minutes: clamp(Math.round(+s.minutes || 5), 1, 30), task: s.task }));
    return steps.length ? steps : null;
  }
  const planPrompt = (list, gap, energy) =>
    `A student with ADHD is stuck and can't start. Their tasks, most important first:\n` +
    list.map((t, i) => `${i}. ${t}`).join('\n') +
    `\nThey have ${gap} minutes before they must leave for something else. ` +
    `Energy: ${energy === 'low' ? 'low, so make steps tiny and gentle' : 'okay'}. ` +
    `Write 2 to 5 concrete steps per task that they can start immediately, each 2 to 15 minutes. ` +
    `Order all steps so the ones done first fit within ${gap} minutes: start with the most important task, ` +
    `and use quick steps from other tasks to fill any leftover minutes. Each step starts with a verb and is under 15 words. ` +
    `Give each step a "task" field with the task's number.`;
  const splitPrompt = (step) =>
    `A student with ADHD finds this step too hard to start: "${step.text}" (part of the task "${step.task}", about ${step.minutes} minutes). ` +
    `Break it into 2 or 3 much smaller, concrete steps. The first must take 2 minutes or less. Each starts with a verb and is under 12 words.`;
  const dumpPrompt = (text) =>
    `A student with ADHD did a voice brain dump. It may be messy, rambling, or mix English and Malay:\n"""${text}"""\n` +
    `Turn it into a clear task list. Merge duplicates, drop filler words and feelings, and keep only things they need to do. ` +
    `Each task starts with a verb, is under 10 words, and keeps the user's own language and names. ` +
    `Order by importance and urgency, most important first.\n` +
    `Respond only with JSON, no other text: {"tasks":[string]}`;

  // ---------- brain dump: speech → task list ----------
  const FILLER = /^(?:(?:um+|uh+|erm+|ugh+|okay|ok|so|and|also|then|like|well|oh|hmm+|right|basically|dan|lepas tu|pastu)[,\s]+)+/i;
  const LEAD = /^(?:(?:i|saya|aku)\s+)?(?:really\s+|still\s+|also\s+|kinda\s+)?(?:need|have|got|gotta|must|should|want|ought|perlu|kena|nak|mesti|harus)\s+(?:to\s+)?|^(?:remember|don'?t forget|jangan lupa)\s+(?:to\s+)?/i;
  const VERBS = 'i|need|have|also|then|reply|finish|do|send|call|email|text|study|revise|write|clean|book|pay|buy|submit|read|fix|prepare|check|go|make|update|plan|print|wash|cook|start|practise|practice|review|apply|ask|meet|return|sort|pack|tidy|order|renew|upload|record|kena|perlu|nak';
  function localParse(text) {
    const seen = new Set();
    return text
      .split(new RegExp(`[\\n.;!?]+|,|\\band then\\b|\\bthen\\b|\\balso\\b|\\blepas tu\\b|\\b(?:and|dan)\\b(?=\\s+(?:${VERBS})\\b)`, 'i'))
      .map((p) => {
        let s = (p || '').trim();
        for (let i = 0; i < 3; i++) s = s.replace(FILLER, '').replace(LEAD, '').trim();
        return s.replace(/^[-–•*]+\s*/, '').replace(/\s+/g, ' ');
      })
      .filter((s) => s.split(' ').length >= 2 || s.length >= 6)
      .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
      .filter((s) => { const k = s.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; })
      .slice(0, 12);
  }

  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  let rec = null, listening = false, finalText = '';
  const micStatus = (m) => ($('#micStatus').textContent = m);
  function setMic(on) {
    $('#micBtn').setAttribute('aria-pressed', String(on));
    $('#micBtn').innerHTML = on ? `${ico('stop')}Stop` : `${ico('mic')}Start talking`;
    if (!on) $('#dumpInterim').textContent = '';
  }
  function startMic() {
    if (!SR) return micStatus('Voice input isn\'t supported in this browser. Try Chrome or Edge, or type below.');
    try {
      rec = new SR();
      rec.lang = $('#dumpLang').value;
      rec.continuous = true;
      rec.interimResults = true;
      finalText = $('#dumpText').value.trim();
      rec.onresult = (e) => {
        let interim = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const r = e.results[i];
          if (r.isFinal) {
            finalText = (finalText ? finalText + ' ' : '') + r[0].transcript.trim();
            $('#dumpText').value = finalText;
          } else interim += r[0].transcript;
        }
        $('#dumpInterim').textContent = interim;
      };
      rec.onerror = (e) => {
        const msg = {
          'not-allowed': 'Microphone blocked. Allow it from the icon in the address bar, or type below.',
          'service-not-allowed': 'Voice isn\'t allowed here. Type below instead.',
          'audio-capture': 'No microphone found. Type below instead.',
          'network': 'Voice input needs an internet connection in this browser. Type below instead.'
        }[e.error];
        if (msg) { listening = false; micStatus(msg); }
      };
      rec.onend = () => {
        if (listening) { try { rec.start(); } catch { listening = false; setMic(false); } } // Chrome stops after a pause
        else setMic(false);
      };
      listening = true;
      rec.start();
      setMic(true);
      micStatus('Listening… say it all, in any order. Press Stop when you\'re done.');
    } catch {
      listening = false; setMic(false);
      micStatus('Couldn\'t start the microphone. Type below instead.');
    }
  }
  function stopMic() {
    listening = false;
    try { rec && rec.stop(); } catch {}
    setMic(false);
  }

  $('#dumpBtn').addEventListener('click', () => {
    $('#dumpText').value = '';
    $('#dumpInterim').textContent = '';
    micStatus(SR ? '' : 'Voice input isn\'t supported in this browser, but you can type below.');
    $('#dumpDlg').showModal();
    $('#micBtn').focus();
  });
  $('#micBtn').addEventListener('click', () => (listening ? stopMic() : startMic()));
  $('#dumpText').addEventListener('input', () => (finalText = $('#dumpText').value.trim()));
  $('#dumpCancel').addEventListener('click', () => $('#dumpDlg').close());
  $('#dumpDlg').addEventListener('close', stopMic);
  $('#dumpGo').addEventListener('click', async () => {
    stopMic();
    const text = $('#dumpText').value.trim();
    if (!text) return micStatus('Say or type something first. Even one messy sentence is enough.');
    const b = $('#dumpGo');
    b.disabled = true; b.textContent = 'Sorting it out…';
    const j = await aiJSON(dumpPrompt(text), 'list maker');
    let found = ((j && j.tasks) || []).map((t) => String(t.text || t).trim()).filter(Boolean);
    if (!found.length) found = localParse(text);
    b.disabled = false; b.textContent = 'Make my list';
    if (!found.length) return micStatus('I couldn\'t find any tasks in that. Try saying what you need to do.');

    const have = new Set(tasks.map((t) => t.toLowerCase()));
    const added = found.filter((t) => !have.has(t.toLowerCase())).map((t) => t.slice(0, 120));
    tasks.push(...added);
    store('gs_tasks', tasks);
    $('#dumpDlg').close();
    renderTasks();
    toast(added.length
      ? `Added ${added.length} task${added.length === 1 ? '' : 's'} from your brain dump. Move the most important to the top with ↑.`
      : 'Those tasks are already on your list.');
    announce(`Added ${added.length} tasks.`);
  });

  // ---------- setup: task list ----------
  function renderTasks() {
    const ul = $('#taskList');
    ul.innerHTML = '';
    $('#clearTasksBtn').hidden = tasks.length === 0;
    tasks.forEach((t, i) => {
      const li = document.createElement('li');
      li.innerHTML = '<span class="num"></span><span class="t"></span>';
      li.querySelector('.num').textContent = i + 1;
      li.querySelector('.t').textContent = t;
      if (i > 0) {
        const up = document.createElement('button');
        up.type = 'button'; up.className = 'ghost x'; up.innerHTML = ico('up');
        up.setAttribute('aria-label', `Move up: ${t}`);
        up.addEventListener('click', () => { [tasks[i - 1], tasks[i]] = [tasks[i], tasks[i - 1]]; store('gs_tasks', tasks); renderTasks(); });
        li.append(up);
      }
      const x = document.createElement('button');
      x.type = 'button'; x.className = 'ghost x'; x.innerHTML = ico('x');
      x.setAttribute('aria-label', `Remove task: ${t}`);
      x.addEventListener('click', () => { tasks.splice(i, 1); store('gs_tasks', tasks); renderTasks(); });
      li.append(x);
      ul.append(li);
    });
  }
  function addTask() {
    const v = $('#taskInput').value.trim();
    if (!v) return false;
    tasks.push(v.slice(0, 120));
    store('gs_tasks', tasks);
    $('#taskInput').value = '';
    renderTasks();
    announce(`Added: ${v}. ${tasks.length} tasks.`);
    return true;
  }
  $('#addTaskBtn').addEventListener('click', () => { addTask(); $('#taskInput').focus(); });
  $('#clearTasksBtn').addEventListener('click', () => {
    if (!confirm(`Remove all ${tasks.length} tasks? Saved unfinished steps will be cleared too.`)) return;
    tasks = [];
    store('gs_tasks', tasks);
    drop('gs_later');
    initSetup();
    announce('All tasks cleared.');
    $('#taskInput').focus();
  });
  $('#taskInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); addTask(); }
  });

  // ---------- setup ----------
  function initSetup() {
    renderTasks();
    const later = load('gs_later', null);
    $('#laterBanner').hidden = !(later && later.steps && later.steps.length);
    if (later && later.steps) {
      const names = [...new Set(later.steps.map((s) => s.task || later.task).filter(Boolean))];
      $('#laterCount').textContent = later.steps.length;
      $('#laterTask').textContent = names.length ? `(${names.join(', ')})` : '';
    }
    $('#useLater').checked = false;
    $('#taskWrap').hidden = false;
    if (!$('#eventTime').value) {
      $('#eventTime').value = toLocalInput(new Date(Date.now() + 60 * MIN));
      $('#eventTime').min = toLocalInput(new Date());
    }
    $('#leavePill').hidden = true;
    document.title = 'GapHelp';
  }
  $('#useLater').addEventListener('change', (e) => ($('#taskWrap').hidden = e.target.checked));

  $('#setupForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    ensureAudio(); // unlock sound with this click
    $('#setupError').textContent = '';

    const eventAt = new Date($('#eventTime').value); // datetime-local is read as local time
    if (Number.isNaN(eventAt.getTime())) return ($('#setupError').textContent = 'Add the date and time your next thing starts.');
    if (eventAt.getTime() <= Date.now()) return ($('#setupError').textContent = 'That time has already passed. Pick a later date or time.');

    const buffer = clamp(+$('#buffer').value || 0, 0, 180);
    const leaveAt = eventAt.getTime() - buffer * MIN;
    const useLater = $('#useLater').checked;
    const later = load('gs_later', null);
    if (!useLater) addTask(); // include anything typed but not added yet
    if (!useLater && !tasks.length) return ($('#setupError').textContent = 'Add at least one task you\'re avoiding. A few words is enough.');
    const energy = document.querySelector('input[name="energy"]:checked').value;

    S = {
      eventName: $('#eventName').value.trim() || 'your next thing',
      eventAt: eventAt.getTime(), leaveAt, tasks: [...tasks], energy,
      steps: [], idx: 0, running: false, warned: false, source: ''
    };

    if (useLater) {
      S.steps = later.steps.map((s) => ({ ...s, task: s.task || later.task || 'Saved task', status: 'todo' }));
      S.tasks = [...new Set(S.steps.map((s) => s.task))];
      S.source = 'Your saved steps from last time.';
      drop('gs_later');
    } else {
      await generate();
    }
    saveState();
    renderPlan();
    show('plan');
  });

  async function generate() {
    const btns = [$('#planBtn'), $('#regenBtn')];
    btns.forEach((b) => (b.disabled = true));
    $('#planBtn').textContent = 'Planning…';
    const gap = clamp(minsLeft(S.leaveAt), 1, 90); // plan one focused session, even if the event is days away
    let ai = await aiSteps(planPrompt(S.tasks, gap, S.energy));
    if (ai) ai = ai.map((s) => ({ ...s, task: S.tasks[s.task] ?? S.tasks[0] }));
    const steps = ai || pack(localPlan(S.tasks, S.energy), gap);
    S.steps = steps.map((s) => ({ ...s, status: 'todo' }));
    S.source = ai ? 'Steps suggested by AI. Edit by removing any you don\'t want.' : 'Steps from the built-in planner. Add an API key in Settings for steps tailored to your task.';
    btns.forEach((b) => (b.disabled = false));
    $('#planBtn').textContent = 'Find my safe window';
  }

  // ---------- plan ----------
  function renderPlan() {
    const gap = minsLeft(S.leaveAt);
    $('#planSource').textContent = S.source;
    const list = $('#stepList');
    list.innerHTML = '';

    if (gap < 2) {
      $('#planTitle').textContent = 'No safe gap right now.';
      $('#planSub').textContent = `You need to leave for ${S.eventName} at ${fmtTime(S.leaveAt)}. Start getting ready. Your steps are saved for next time.`;
      store('gs_later', { steps: S.steps.map(({ text, minutes, task }) => ({ text, minutes, task })) });
      $('#startBtn').hidden = true; $('#regenBtn').hidden = true;
      return;
    }
    $('#startBtn').hidden = false; $('#regenBtn').hidden = false;

    // first step must fit
    if (S.steps[0] && S.steps[0].minutes > gap) S.steps[0].minutes = Math.max(1, gap - 1);

    let acc = 0, fit = 0, shownDivider = false;
    S.steps.forEach((s, i) => {
      acc += s.minutes;
      const fits = acc <= gap;
      if (fits) fit++;
      if (!fits && !shownDivider) {
        const d = document.createElement('li');
        d.className = 'divider'; d.style.border = '0';
        d.textContent = 'For another time (won\'t fit before you leave):';
        list.append(d); shownDivider = true;
      }
      const li = document.createElement('li');
      if (!fits) li.classList.add('later');
      li.innerHTML = '<span class="num"></span><span class="t"></span><span class="mins"></span>';
      li.querySelector('.num').textContent = i + 1;
      li.querySelector('.t').textContent = s.text;
      if (S.tasks.length > 1 && s.task) {
        const tag = document.createElement('span');
        tag.className = 'tag';
        tag.textContent = s.task;
        li.querySelector('.t').append(tag);
      }
      li.querySelector('.mins').textContent = `${s.minutes} min`;
      if (S.steps.length > 1) {
        const x = document.createElement('button');
        x.className = 'ghost x'; x.innerHTML = ico('x');
        x.setAttribute('aria-label', `Remove step: ${s.text}`);
        x.addEventListener('click', () => { S.steps.splice(i, 1); saveState(); renderPlan(); });
        li.append(x);
      }
      list.append(li);
    });

    $('#planTitle').textContent = `You have ${fmtDur(gap)} of safe time.`;
    S.fit = Math.max(1, fit);
    $('#planSub').textContent = `Leave at ${fmtTime(S.leaveAt)} for ${S.eventName}. ${fit} step${fit === 1 ? '' : 's'} fit before then. I'll warn you ${settings.warn} min early and sound an alarm when it's time.`;
  }

  $('#backBtn').addEventListener('click', () => { S = null; drop('gs_state'); initSetup(); show('setup'); });
  $('#regenBtn').addEventListener('click', async () => { await generate(); saveState(); renderPlan(); });
  $('#startBtn').addEventListener('click', async () => {
    ensureAudio();
    try { if ('Notification' in window && Notification.permission === 'default') await Notification.requestPermission(); } catch {}
    S.running = true; S.warned = false; S.idx = 0;
    // The disc's full circle = time from now until you leave (between 5 min and 2 h).
    S.faceMs = clamp(S.leaveAt - Date.now(), 5 * MIN, 120 * MIN);
    startStep();
    show('focus');
  });

  // ---------- focus ----------
  function startStep() {
    S.stepStartedAt = Date.now(); S.pausedTotal = 0; S.pausedAt = null; S.stepChimed = false;
    saveState();
    renderFocus();
  }
  function renderFocus() {
    const step = S.steps[S.idx];
    const todo = S.steps.filter((s) => s.status === 'todo').length;
    const doneN = S.steps.filter((s) => s.status === 'done').length;
    $('#stepText').textContent = step.text;
    const goal = Math.max(S.fit || 1, doneN + 1); // count only what fits this window, not every saved step
    $('#stepMeta').textContent = `Step ${doneN + 1} of ${goal} for this window · about ${step.minutes} min`;
    $('#partOf').textContent = `Part of: ${step.task || ''}`;
    $('#progressBar').style.width = `${Math.min(100, (doneN / goal) * 100)}%`;
    $('#pauseBtn').innerHTML = S.pausedAt ? `${ico('play')}Resume` : `${ico('pause')}Pause`;
    $('#stepHint').textContent = 'Just this. Nothing else.';
    $('#stepText').focus();
    announce(`Step ${S.idx + 1}: ${step.text}. About ${step.minutes} minutes.`);
    tick();
    if (!todo) finish('all');
  }
  function nextStep(status) {
    S.steps[S.idx].status = status;
    const n = S.steps.findIndex((s, i) => i > S.idx && s.status === 'todo');
    if (n === -1) return finish('all');
    S.idx = n;
    if (status === 'done') chime();
    startStep();
  }
  $('#doneBtn').addEventListener('click', () => nextStep('done'));
  $('#skipBtn').addEventListener('click', () => nextStep('skipped'));
  $('#endBtn').addEventListener('click', () => finish('early'));
  $('#pauseBtn').addEventListener('click', togglePause);
  $('#readBtn').addEventListener('click', readStep);
  $('#splitBtn').addEventListener('click', async () => {
    const b = $('#splitBtn');
    b.disabled = true; b.textContent = 'Splitting…';
    const step = S.steps[S.idx];
    const sub = (await aiSteps(splitPrompt(step))) || localSplit(step);
    S.steps.splice(S.idx, 1, ...sub.map((s) => ({ ...s, task: step.task, status: 'todo' })));
    b.disabled = false; b.innerHTML = `${ico('split')}Too hard: split smaller`;
    toast('Smaller pieces. Just do the first one.');
    startStep();
  });

  function togglePause() {
    if (S.pausedAt) { S.pausedTotal += Date.now() - S.pausedAt; S.pausedAt = null; }
    else S.pausedAt = Date.now();
    saveState(); renderFocus();
  }
  function readStep() {
    try {
      speechSynthesis.cancel();
      speechSynthesis.speak(new SpeechSynthesisUtterance(`${S.steps[S.idx].text}. You leave at ${fmtTime(S.leaveAt)}.`));
    } catch {}
  }

  document.addEventListener('keydown', (e) => {
    if ($('#focus').hidden || e.target.matches('input, textarea, select') || e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === 'd') $('#doneBtn').click();
    else if (k === 's') $('#splitBtn').click();
    else if (k === 'k') $('#skipBtn').click();
    else if (k === 'p') togglePause();
    else if (k === 'r') readStep();
  });

  // ---------- finish ----------
  function finish(reason) {
    stopAlarmSound();
    $('#alarm').hidden = true;
    const done = S.steps.filter((s) => s.status === 'done');
    const left = S.steps.filter((s) => s.status === 'todo');
    if (left.length) store('gs_later', { steps: left.map(({ text, minutes, task }) => ({ text, minutes, task })) });
    else drop('gs_later');

    const titles = {
      all: 'All steps done.',
      leave: `Off you go to ${S.eventName}!`,
      early: 'Nice work.'
    };
    $('#doneTitle').textContent = titles[reason];
    $('#doneMsg').textContent = done.length
      ? `You finished ${done.length} step${done.length === 1 ? '' : 's'} in time you'd normally lose to waiting.` +
        (left.length ? ` ${left.length} step${left.length === 1 ? ' is' : 's are'} saved for next time.` : '')
      : (left.length ? 'Starting is the hard part. Your steps are saved for next time.' : '');
    const list = $('#doneList');
    list.innerHTML = '';
    done.forEach((s) => {
      const li = document.createElement('li');
      li.innerHTML = `<span class="num">${ico('check')}</span><span class="t"></span>`;
      li.querySelector('.t').textContent = s.text;
      list.append(li);
    });
    S = null; drop('gs_state');
    $('#leavePill').hidden = true;
    document.title = 'GapHelp';
    show('done');
  }
  $('#againBtn').addEventListener('click', () => { initSetup(); show('setup'); });

  // ---------- alarm ----------
  function leaveAlarm() {
    $('#alarmSub').textContent = `Leave now for ${S.eventName} (starts ${fmtTime(S.eventAt)}).`;
    $('#alarm').hidden = false;
    $('#goingBtn').focus();
    startAlarmSound();
    notify('Time to go!', `Leave now for ${S.eventName}.`);
  }
  $('#goingBtn').addEventListener('click', () => finish('leave'));

  // ---------- time disc (Time Timer style) ----------
  // Top (12 o'clock) = when you leave. The coloured pie = time left, and it shrinks back
  // toward the top as time passes. Slices = this step, then the next steps, then spare time.
  const C = 100, R_OUT = 96, R_IN = 60;
  function polar(a, r) {
    const rad = ((a - 90) * Math.PI) / 180;
    return [(C + r * Math.cos(rad)).toFixed(2), (C + r * Math.sin(rad)).toFixed(2)];
  }
  function seg(a0, a1, ro, ri) {
    if (a1 - a0 >= 359.9) a1 = a0 + 359.9;
    const big = a1 - a0 > 180 ? 1 : 0;
    const [x0, y0] = polar(a0, ro), [x1, y1] = polar(a1, ro), [x2, y2] = polar(a1, ri), [x3, y3] = polar(a0, ri);
    return `M${x0} ${y0}A${ro} ${ro} 0 ${big} 1 ${x1} ${y1}L${x2} ${y2}A${ri} ${ri} 0 ${big} 0 ${x3} ${y3}Z`;
  }
  function renderDisc(now, stepRemMs) {
    const face = S.faceMs || clamp(S.leaveAt - now, 5 * MIN, 120 * MIN);
    const leftMs = Math.max(0, S.leaveAt - now);
    const leftDeg = Math.min(1, leftMs / face) * 360;
    const degOf = (ms) => (ms / face) * 360;
    let out = `<circle class="d-track" cx="${C}" cy="${C}" r="${R_OUT}"/>`;

    // Steps placed from "now" (edge of the pie) back toward "leave" (top).
    const order = [S.idx, ...S.steps.map((_, i) => i).filter((i) => i > S.idx && S.steps[i].status === 'todo')];
    let a = leftDeg;
    order.forEach((i, k) => {
      if (a <= 0) return;
      const ms = k === 0 ? Math.max(0, stepRemMs) : S.steps[i].minutes * MIN;
      const a0 = Math.max(0, a - degOf(ms));
      if (a - a0 > 0.3) out += `<path class="d-sep ${k === 0 ? 'd-cur' : k % 2 ? 'd-n1' : 'd-n2'}" d="${seg(a0, a, R_OUT, R_IN)}"/>`;
      a = a0;
    });
    if (a > 0.3) out += `<path class="d-sep d-free" d="${seg(0, a, R_OUT, R_IN)}"/>`;

    for (let t = 0; t < 12; t++) {
      const [x0, y0] = polar(t * 30, R_IN - 4), [x1, y1] = polar(t * 30, R_IN - (t % 3 ? 8 : 12));
      out += `<line class="d-tick" x1="${x0}" y1="${y0}" x2="${x1}" y2="${y1}"/>`;
    }
    out += `<circle class="d-hole" cx="${C}" cy="${C}" r="${R_IN - 14}"/>`;
    out += `<line class="d-leave" x1="${C}" y1="${C - R_IN + 2}" x2="${C}" y2="${C - R_OUT - 6}"/>`;
    out += `<text class="d-leave-label" x="${C}" y="-11" text-anchor="middle">LEAVE ${fmtTime(S.leaveAt).toUpperCase()}</text>`;

    const disc = $('#disc');
    disc.innerHTML = out;
    disc.classList.toggle('warn', leftMs <= settings.warn * MIN);
    disc.classList.toggle('over', stepRemMs < 0);
    const lm = Math.ceil(leftMs / MIN);
    $('#leaveIn').textContent = leftMs > 0 ? `${fmtDur(lm)} until you leave` : 'Time to leave';
  }

  // ---------- clock (Web Worker keeps ticking in background tabs) ----------
  let lastAnnouncedMin = null;
  function tick() {
    if (!S || !S.running) return;
    const now = Date.now();
    const leftMs = S.leaveAt - now;
    const leftMin = Math.max(0, Math.ceil(leftMs / MIN));

    // leave banner + header pill
    const warnZone = leftMs <= settings.warn * MIN;
    $('#leaveBanner').className = 'banner' + (warnZone ? ' warn' : '');
    $('#leaveBanner').textContent = leftMs > 0
      ? `Leave at ${fmtTime(S.leaveAt)} for ${S.eventName} · ${fmtDur(leftMin)} left. You're safe, I'm watching the clock.`
      : `Time to leave for ${S.eventName}.`;
    $('#leavePill').hidden = false;
    $('#leavePill').className = 'pill' + (warnZone ? ' warn' : '');
    $('#leavePill').textContent = `Leave ${fmtTime(S.leaveAt)}`;

    if (!S.warned && leftMs <= settings.warn * MIN && leftMs > 0) {
      S.warned = true; saveState();
      chime();
      toast(`${leftMin} minutes until you leave. Finish your sentence and save your work.`);
      notify('Heads-up', `${leftMin} min until you leave for ${S.eventName}.`);
      announce(`${leftMin} minutes until you leave.`);
    }
    if (leftMs <= 0 && $('#alarm').hidden) leaveAlarm();

    // step timer
    const step = S.steps[S.idx];
    if (step) {
      const elapsed = (S.pausedAt || now) - S.stepStartedAt - (S.pausedTotal || 0);
      const rem = step.minutes * MIN - elapsed;
      const abs = Math.abs(rem);
      const mm = String(Math.floor(abs / MIN)).padStart(2, '0');
      const ss = String(Math.floor((abs % MIN) / 1000)).padStart(2, '0');
      $('#stepTimer').textContent = (rem < 0 ? '+' : '') + `${mm}:${ss}`;
      $('#stepTimer').classList.toggle('over', rem < 0);
      renderDisc(now, rem);
      if (rem <= 0 && !S.stepChimed && !S.pausedAt) {
        S.stepChimed = true; saveState();
        chime();
        $('#stepHint').textContent = 'Time\'s up for this step. Mark it done, split it, or keep going. No pressure.';
      }
      const minMark = Math.floor(rem / MIN);
      if (minMark !== lastAnnouncedMin && rem > 0 && minMark % 5 === 0) {
        lastAnnouncedMin = minMark;
        announce(`${minMark} minutes left on this step.`);
      }
      document.title = `${rem < 0 ? '+' : ''}${mm}:${ss} · Leave ${fmtTime(S.leaveAt)}`;
    }
  }
  try {
    const w = new Worker(URL.createObjectURL(new Blob(['setInterval(() => postMessage(0), 1000)'], { type: 'text/javascript' })));
    w.onmessage = tick;
  } catch {
    setInterval(tick, 1000);
  }
  document.addEventListener('visibilitychange', tick);

  // ---------- settings ----------
  $('#settingsBtn').addEventListener('click', () => {
    $('#warnMins').value = settings.warn;
    $('#textSize').value = settings.scale;
    $('#theme').value = settings.theme;
    $('#provider').value = settings.provider;
    $('#apiKey').value = settings.key;
    $('#model').value = settings.model;
    $('#settings').showModal();
  });
  $('#provider').addEventListener('change', (e) => ($('#model').value = DEFAULT_MODEL[e.target.value]));
  $('#settings').addEventListener('close', () => {
    settings = {
      warn: clamp(+$('#warnMins').value || 5, 1, 30),
      scale: +$('#textSize').value || 1,
      theme: $('#theme').value,
      provider: $('#provider').value,
      key: $('#apiKey').value.trim(),
      model: $('#model').value.trim() || DEFAULT_MODEL[$('#provider').value]
    };
    store('gs_settings', settings);
    applySettings();
    if (S && !$('#plan').hidden) renderPlan();
  });
  $('#testSound').addEventListener('click', () => {
    ensureAudio(); chime();
    setTimeout(() => { startAlarmSound(); setTimeout(stopAlarmSound, 2500); }, 1300);
  });

  // ---------- install as an app (PWA) ----------
  // Service workers need http(s): works on GitHub Pages or a local server, not a double-clicked file.
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  let installPrompt = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    installPrompt = e;
    $('#installBtn').hidden = false;
  });
  $('#installBtn').addEventListener('click', async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    try { await installPrompt.userChoice; } catch {}
    installPrompt = null;
    $('#installBtn').hidden = true;
  });
  window.addEventListener('appinstalled', () => {
    $('#installBtn').hidden = true;
    toast('GapHelp is installed. Open it from your home screen or app list.');
  });

  // ---------- boot: survive a page refresh ----------
  if (S && S.running && S.leaveAt > Date.now() - 30 * MIN) {
    show('focus'); renderFocus();
    toast('Picked up where you left off. Click anywhere to re-enable sound.');
    document.addEventListener('pointerdown', ensureAudio, { once: true });
  } else if (S && !S.running && S.steps && S.steps.length) {
    renderPlan(); show('plan');
  } else {
    S = null; drop('gs_state');
    initSetup(); show('setup');
  }
})();
