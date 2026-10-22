# GapHelp

Use the gap before your next thing.

**Try it:** https://github.com/barzj04/gaphelp (works on phone and laptop, no sign up)

## Why we made this
I have hours between classes almost every day, and most of the time I end up doing nothing. I scroll, I procrastinate, and then it's time to go. This is called **waiting mode**, and it's really common for people with ADHD. When you have something later, the time before it doesn't feel usable.

GapHelp is for students who get stuck like this, especially with ADHD or executive dysfunction.

## How it works
1. **Brain dump (optional):** tap the mic and just say everything on your mind (English or Bahasa Melayu). GapHelp turns it into a task list. You can also type or paste a messy paragraph.
2. **Add your next thing:** what it is, when it starts, and how long you need to get ready.
3. **Add your tasks:** most important first, like "finish FYP chapter 3" or "reply to lecturer". Pick your energy level. Your list is saved for next time.
4. **Get your plan:** GapHelp works out how much free time you actually have and breaks your tasks into small steps that fit. It starts with your top task, then fills leftover minutes with quick steps from other tasks. Steps that don't fit are saved for later.
5. **Focus mode:** you see one step at a time on a time disc. The coloured part is the time you have left before you leave, and it shrinks as time goes by, so you can *see* time instead of reading numbers. Buttons: Done, Too hard: split smaller, Skip, Pause, Read aloud.
6. **Leave alarm:** you get a heads up a few minutes before, then a full screen alarm when it's time to go. So you don't have to keep checking the clock.
7. Anything you didn't finish is saved for next time.

## How to run it
No setup needed. Keep all the files together and open `index.html` in Chrome, Edge or Firefox.

If you want to install it as an app or use it offline, it needs a web address (not just double clicking the file):
- **GitHub Pages:** push the folder, then go to Settings → Pages → deploy from the main branch.
- **On your laptop:** run `python -m http.server` in the folder and open http://localhost:8000.

Then tap **Install** at the top (Chrome, Edge, Android), or on iPhone go to Share → **Add to Home Screen**.

## Files
| File | What's in it |
|---|---|
| `index.html` | The page: 4 screens, the alarm and the settings popup |
| `styles.css` | Colours, fonts, light and dark mode, layout |
| `app.js` | All the logic: saving, sounds, brain dump, planner, AI, time disc, timers, alarm |
| `sw.js` | Makes it work offline and installable |
| `manifest.webmanifest` | App name, colours and icons for installing |
| `icons/` | App icons |
| `fonts/` | Bricolage Grotesque (headings) and Atkinson Hyperlegible (body text), both free under the SIL Open Font License |

## AI (optional)
Go to Settings, pick **Anthropic (Claude)** or **Google Gemini**, and paste your API key. Default models are `claude-haiku-5-5` and `gemini-2.5-flash`, and you can change them.

Your key is only saved in your own browser, never in the code. Please don't commit it to GitHub.

No key? That's fine. The built-in planner still works. It has step templates for writing, studying, coding, messages and tidying, plus a general one.

## Made for everyone
- Voice input if typing is hard
- Time disc for time blindness
- Atkinson Hyperlegible font (made for people with low vision), bigger text option, dark mode
- Only one step on screen at a time, and low energy mode makes steps smaller
- Keyboard shortcuts: D done, S split, K skip, P pause, R read aloud
- Screen reader support for new steps and time warnings
- Follows your reduced motion setting
- The alarm uses sound, a flashing screen, a notification and vibration (if your device has it)

## What doesn't work yet
- You have to type in your event time. No calendar sync yet.
- The tab has to stay open for the alarm. Notifications need your permission.
- Sound only works after you click something on the page (browsers block it before that).
- Built-in steps are general. AI steps need a key and internet.
- If a model name changes, update it in Settings.
- Voice input works best in Chrome and Edge, needs internet, and doesn't work in Firefox (typing still does).
- The AI is called straight from your browser. That's fine for your own key, but a public app with a shared key would need a small backend.

## Team
- **Arleen:** idea and coding
- **Lester:** UI/UX design, demo video and the rest

## AI assistance
We used Claude (Anthropic) to help plan the project and to generate and optimize the code. We came up with the idea, made the design decisions, tested it and edited it. The app can also use the Claude or Gemini API (optional) to make step plans.
