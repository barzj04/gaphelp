# GapHelp

Turn the dead time before your next thing into one small, safe step.

**For:** students with ADHD or executive dysfunction who freeze before a scheduled event ("waiting mode") and can't start big, vague tasks.

## How it works
0. **Brain dump (optional):** press 🎙, say everything on your mind (English or Bahasa Melayu), and GapHelp turns it into a task list. You can also type or paste a messy paragraph.
1. Enter your next event, its start time, and how long you need to get ready.
2. Add the tasks you're avoiding, most important first (e.g. "finish FYP chapter 3", "reply to lecturer"), and pick your energy level. The list is kept for next time.
3. GapHelp works out your safe window and breaks your tasks into small steps. It fills the window starting with your top task, then uses quick steps from other tasks to fill leftover minutes. Steps that don't fit are marked for another time.
4. Focus mode shows one step at a time on a **time disc**: the coloured pie is the time left before you leave, split into this step, the next steps and spare time. It shrinks back toward the top (leave time) as time passes, so you can *see* time instead of reading numbers. Buttons: **Done**, **Too hard: split smaller**, **Skip**, **Pause**, **Read aloud**.
5. You get a chime and a heads-up a few minutes before leaving, then a full-screen alarm when it's time. You can stop watching the clock.
6. Unfinished steps are saved and offered next time.

## Run it
No build step. Keep all the files together and open `index.html` in Chrome, Edge or Firefox.

Installing it as an app and using it offline need a web address (not a double-clicked file):
- **GitHub Pages:** push the folder → Settings → Pages → deploy from the main branch.
- **Locally:** run `python -m http.server` in the folder and open http://localhost:8000.

Then use **📲 Install** in the header (Chrome/Edge/Android), or Share → **Add to Home Screen** on iPhone.

| File | What's in it |
|---|---|
| `index.html` | Page structure: the 4 screens, alarm overlay, settings dialog |
| `styles.css` | Colours, fonts, light/dark themes, layout |
| `app.js` | All logic: storage, sounds, brain dump, planner, AI calls, time disc, timers, alarm |
| `sw.js` | Service worker: offline support and install |
| `manifest.webmanifest` | App name, colours and icons for installing |
| `icons/` | App icons |
| `fonts/` | Self-hosted Bricolage Grotesque (headings) and Atkinson Hyperlegible (body), both SIL Open Font License |
To host it: push to GitHub → Settings → Pages → deploy from the main branch.

## Optional AI steps
Settings → choose **Anthropic (Claude)** or **Google Gemini** and paste your API key. Default models: `claude-haiku-5-5` and `gemini-2.5-flash` (editable). The key stays in your browser's localStorage and is never in the code, so don't commit it. Without a key, a built-in planner uses step templates for writing, studying, coding, messages and tidying, plus a generic one.

## Accessibility
- Voice input for people who find typing hard; visual time disc for time blindness
- Atkinson Hyperlegible font (designed for low-vision readers), adjustable text size, light/dark themes
- One step on screen at a time; low-energy mode makes steps smaller
- Full keyboard control: D done, S split, K skip, P pause, R read aloud
- Screen-reader announcements for new steps and time warnings
- Respects reduced-motion settings
- Alarm uses sound, a flashing screen, a system notification and vibration where supported

## Limitations
- The event time is typed in; there's no calendar sync yet.
- The tab must stay open. Browser notifications need permission.
- Sound needs one click on the page first (browser autoplay rule).
- Built-in planner steps are generic; AI steps need a key and internet.
- If a model name changes, update it in Settings.
- Voice input uses the browser's speech recognition: best in Chrome/Edge, needs internet, and isn't available in Firefox (typing still works).
- The API is called straight from the browser, which is fine for a personal key but not for a public app with a shared key. That would need a small backend.

## AI assistance
Fill in before submitting.
