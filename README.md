# Juju Tauri Migration 🚀  
**Minimalist deep work tracker – now rebuilt with Rust + Svelte for speed, size, and sanity.**

---

## 📦 What is Juju?

Juju is a lightweight system tray app that helps you track deep work sessions, link them to projects, and reflect on your focus over time. Originally built with Electron + Node.js, we're migrating the app to:

- 🦀 **Rust backend** (Tauri) – fast, safe, native system integration  
- 🧠 **Svelte + TypeScript frontend** – reactive UI, small footprint  
- 📊 **CSV + JSON-based data** – easy to inspect and migrate  
- 🪶 **Tiny binary** – no Chromium bloat, just the essentials  

---

## 🧠 Project Brief

You’re looking at the new Juju stack:

| Layer       | Tech                         | Purpose                                        |
|------------|------------------------------|------------------------------------------------|
| Frontend   | Svelte + TypeScript          | Reactive dashboard UI, session editor         |
| Backend    | Rust (Tauri v2)              | Tray logic, session management, file handling |
| Data       | CSV + JSON                   | Sessions (`data.csv`) and Projects (`projects.json`) |
| Bridge     | Tauri Commands + Invoke API  | Connects UI to backend commands               |

We're maintaining the core features, but making it way leaner, cleaner, and faster.

---

## 📁 Folder Structure

```
juju-tauri/
├── frontend/          # Svelte + TS frontend
│   ├── src/
│   ├── static/
│   ├── vite.config.js
│   └── ...
├── src-tauri/         # Rust backend (Tauri)
│   ├── src/
│   │   ├── main.rs
│   │   ├── tray.rs
│   │   └── session.rs
│   ├── tauri.conf.json
│   ├── Cargo.toml
└── README.md
```

## ✅ Migration Roadmap

### 🔧 Setup

* [ ] Create fresh repo and initialise Git
* [ ] Initialise Svelte + TS in `frontend/`
* [ ] Initialise Tauri in `src-tauri/`
* [ ] Link `tauri.conf.json` to frontend paths
* [ ] Confirm `cargo tauri dev` works

### 🖼 Tray Logic (Rust)

* [ ] Tray icon states (idle / active)
* [ ] Menu: Start / End Session, View Dashboard, Quit
* [ ] Menu handlers and icon switching

### ⏱ Session Tracking

* [ ] Start/End session with timestamps
* [ ] Link to projects, save to CSV
* [ ] Prompt for notes

### 📁 Data Persistence

* [ ] Read/write CSV (`data.csv`)
* [ ] Read/write JSON (`projects.json`)
* [ ] Handle first-run setup + file safety

### 📊 Dashboard (Svelte)

* [ ] Session list + editor
* [ ] Project colour picker + manager
* [ ] Charts (bar/pie), filters, date picker
* [ ] Pagination or lazy loading

### 🧬 Rust ↔ Svelte Communication

* [ ] Use `#[tauri::command]` in Rust
* [ ] `invoke()` calls from frontend
* [ ] Error handling + response shaping

### 🛠 Build & Dev Workflow

* [ ] `npm run dev` for UI only
* [ ] `cargo tauri dev` for full app
* [ ] `cargo tauri build` to generate `.app`
* [ ] Confirm app size + features are intact

---

## 🛠 Dev Tips

* For Rust logs: `println!()` shows up in Tauri console
* For debugging invoke calls: use browser console
* Keep `tauri`, `tauri-build`, and CLI versions in sync to avoid config mismatches
* Rust async file ops? Use `tokio::fs` for non-blocking I/O
* Access system folders with `tauri::api::path::app_data_dir()`

---

## 🧱 Stack Versions

Make sure your environment is using:

* `Tauri v2.x`
* `Rust stable`
* `Node >= 18`
* `npm >= 9`
* `SvelteKit latest`

---

## 🙋 FAQ

> **Q: Why Tauri instead of Electron?**
> A: Smaller binaries, native system integration, faster runtime, less memory usage. It's just better for desktop utilities.

> **Q: Why Svelte over raw HTML/JS?**
> A: Cleaner code, better reactivity, smaller output. You’re not building Gmail, you're building a tray utility with a clean dashboard.

> **Q: Why not just use SQLite from day one?**
> A: CSV + JSON are human-readable, portable, and simpler to debug during dev. We’ll upgrade if it becomes too clunky.

---

## ✨ Credits

Built by [HayJay](https://github.com/hotjamwot) — storyteller, director, productivity systems wizard.

Migration plan + architecture co-written with ChatGPT.

---

## 📌 Next Step

Run this bad boy:

```bash
cd frontend
npm install
npm run dev
```

Then in a second terminal:

```bash
cargo tauri dev
```